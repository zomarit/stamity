import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  loosens,
  parseAutonomyMarker,
  resolveAutonomy,
  strictestAutonomy,
  type ResolvedAutonomy,
} from "../../config/autonomy.ts";
import { CLAUDE_HOOKS_DIR } from "../../hooks/model.ts";
import { PERSON_ONLY_GUARD_FILE } from "../../hooks/scripts.ts";
import { gitDiscoveryMeetsBareShape } from "../../merge/safeWrite.ts";
import { gitProgramFor } from "../../shared/programPath.ts";
import { TOOLS } from "../../types/core.ts";
import { EngineError } from "../../types/errors.ts";
import { DEPLOYING_ACTS, MANIFEST_FILE } from "../../types/manifest.ts";
import { HOOKS_GENERATED_DIR, STATE_DIR } from "../../types/markers.ts";

/**
 * The loosen gate (REQ-FLOW-138, the CLI half; the guard's half reads
 * `--loosen` as a person-only word, `../../hooks/personOnly.ts`).
 *
 * The autonomy setting is baked into every person-only guard copy as a marker
 * line (`// stamity-autonomy <json>`, `../../hooks/scripts.ts`). An agent can
 * edit the manifest; it must not be able to re-bake a looser guard by running
 * the command that writes one. So the two write loops — `applySync`
 * (`../commands/sync/engine.ts`) and `applyInit` (`../commands/init/apply.ts`)
 * — hand every planned guard copy whose marker differs from the one on disk to
 * a {@link GuardGate} before they write anything. A command run with
 * `--loosen` passes a gate that lets a loosening through; a caller that passes
 * none gets {@link strictGuardGate}, so leaving the gate out never loosens.
 *
 * The baseline a write is compared against ({@link readBaseline}) is the
 * strictest of three legs (decision D18): the guard copies (the ones this
 * write plans first, then every client's known guard path, which can only
 * tighten), the `autonomy` committed at `HEAD` (with HEAD's guard copies when
 * no planned copy is on disk), and the manifest on disk before the write.
 * Every leg that cannot be read reads as the strictest setting it can state:
 * mode `ask` with every act named.
 *
 * Wave 13, below the wave-14 loops that import it, so it takes nothing from
 * the CLI kit: it throws an `EngineError` (the funnel renders its `why` and
 * `next`), the loops name the command to run in `next`, and its one git read
 * is built here the way `./gitStatus.ts` and `../../merge/safeWrite.ts` build
 * theirs.
 */

/** One ledger row as the gate reads it: a path and the hash of the bytes the engine last wrote there. */
type RecordedRow = { readonly path: string; readonly contentHash?: string };

/**
 * The guard copies one gate call is about: `planned`, every guard path the
 * write plans (the selected clients' copies, the baseline's primary leg), and
 * `baking`, the planned paths that would bake the setting asked about.
 */
export interface GuardCopies {
  readonly planned: readonly string[];
  readonly baking: readonly string[];
}

/** Every client's known guard path: Claude Code's copy, then each client's generated one (`../../emit/hooksInfra.ts`). */
const KNOWN_GUARD_PATHS: readonly string[] = [
  `${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`,
  ...TOOLS.map((tool) => `${HOOKS_GENERATED_DIR}/${tool}/${PERSON_ONLY_GUARD_FILE}`),
];

/** What a write loop calls for a planned guard copy whose marker changes: resolves to let it land, throws to refuse. */
export type GuardGate = (next: ResolvedAutonomy, copies: GuardCopies) => Promise<void>;

/** Mode `ask` with nothing named: what a marker-less copy of this release, or no copy on disk or at HEAD beside a committed manifest, reads as. */
const ASK: ResolvedAutonomy = resolveAutonomy({ autonomy: { mode: "ask" } });

/** Mode `ask` with every act named: what a leg reads as when it is there but cannot be read. */
const UNREADABLE: ResolvedAutonomy = resolveAutonomy({ autonomy: { mode: "ask", deployingActs: [...DEPLOYING_ACTS] } });

/** Past this many bytes a guard copy is not one the engine wrote (its budget is under 200 KiB); it reads {@link UNREADABLE}. */
const GUARD_COPY_MAX_BYTES = 1024 * 1024;

/** Past this many bytes a manifest (ledger included) reads {@link UNREADABLE}. */
const MANIFEST_MAX_BYTES = 64 * 1024 * 1024;

/** Wall time for each git read; a git that does not answer in time reads as one that could not run. */
const GIT_SHOW_TIMEOUT_MS = 10_000;

/** What starts a marker line; the setting's JSON follows (`../../config/autonomy.ts`). */
const MARKER_PREFIX = "// stamity-autonomy ";

/**
 * Text only a guard copy of this release or later carries (decision D6, as
 * amended at build): its banner sentence naming the marker, and the line that
 * holds the baked setting as code. A 1.16.0 copy has neither.
 */
const BANNER_SENTENCE = "The autonomy setting this copy was written for";
const BAKED_CONSTANT = /^const AUTONOMY = (.*);\s*$/m;

/** What a 1.16.0 guard copy carries: its header's title line and the verdict it inlines. Text with neither shape is no guard the gate knows. */
const GUARD_TITLE_LINE = /^\/\/ stamity — person-only shell guard\.\r?$/m;
const GUARD_VERDICT_LINE = /^const personOnlyVerdict = /m;

/** A regular file's text, `null` when nothing is there, `undefined` when something is there that cannot be read as one. */
async function readRegularFile(path: string, maxBytes: number): Promise<string | null | undefined> {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : undefined;
  }
  if (!stats.isFile() || stats.size > maxBytes) return undefined;
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The setting a copy's baked constant holds (the value the guard enforces), or
 * `null` when it has none. It is read through the marker parser: the engine
 * writes both from one JSON rendering, so a constant that would not parse as
 * a marker was edited, and reads {@link UNREADABLE}.
 */
function bakedSetting(text: string): ResolvedAutonomy | null {
  const baked = BAKED_CONSTANT.exec(text)?.[1];
  return baked === undefined ? null : (parseAutonomyMarker(`${MARKER_PREFIX}${baked.trim()}`) ?? UNREADABLE);
}

/**
 * The setting one guard copy's text stands for: the strictest of its marker
 * line(s) and its baked constant, so neither edited alone loosens it. With no
 * marker: a copy carrying this release's guard text reads `ask` (its marker
 * was removed), together with the baked constant when there is one; a copy
 * carrying neither but a 1.16.0 guard's title and verdict is a 1.16.0 copy and
 * reads as the upgrade default (decision D6); any other text at a guard path
 * is no guard the gate can read, and reads {@link UNREADABLE}.
 */
export function guardCopySetting(text: string): ResolvedAutonomy {
  return recognisedSetting(text) ?? UNREADABLE;
}

/** {@link guardCopySetting}'s reading of text the gate recognises as a guard, or `null` for any other text. */
function recognisedSetting(text: string): ResolvedAutonomy | null {
  const marked = parseAutonomyMarker(text);
  const baked = bakedSetting(text);
  if (marked !== null) return baked === null ? marked : strictestAutonomy(marked, baked);
  if (baked !== null) return strictestAutonomy(ASK, baked);
  if (text.includes(BANNER_SENTENCE)) return ASK;
  return GUARD_TITLE_LINE.test(text) && GUARD_VERDICT_LINE.test(text) ? resolveAutonomy({}) : null;
}

/** The `autonomy` a manifest's JSON text resolves to; text that is not a JSON object reads {@link UNREADABLE}. */
function manifestSetting(text: string): ResolvedAutonomy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return UNREADABLE;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return UNREADABLE;
  return resolveAutonomy({ autonomy: (parsed as { autonomy?: unknown }).autonomy });
}

/**
 * Whether a manifest's text records a person-only guard copy among the files
 * it owns (its `ledger` rows, by path): `true` or `false`, or `null` when the
 * text, its `ledger` or a row's `path` cannot be read. A row counts by the
 * guard's file name, so every client's known guard path is one.
 */
function recordsGuardCopy(text: string): boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const ledger = (parsed as { ledger?: unknown }).ledger;
  if (!Array.isArray(ledger)) return null;
  let found = false;
  for (const row of ledger as unknown[]) {
    const path = typeof row === "object" && row !== null ? (row as { path?: unknown }).path : undefined;
    if (typeof path !== "string") return null;
    if (path.split("/").at(-1) === PERSON_ONLY_GUARD_FILE) found = true;
  }
  return found;
}

/** The caller's environment minus every `GIT_*` variable, as `./gitStatus.ts` runs its reads. */
function gitReadEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^GIT_/i.test(key)) env[key] = value;
  }
  env["GIT_OPTIONAL_LOCKS"] = "0";
  // A replace ref is a local ref write that needs no commit: git must read the objects `HEAD` holds (build/14).
  env["GIT_NO_REPLACE_OBJECTS"] = "1";
  return env;
}

/** One git read's answer: its stdout, or the exit code (`null` when git did not run, timed out or was killed). */
type GitAnswer = { ok: true; stdout: string } | { ok: false; code: number | null };

/**
 * One git read from the setup root, through the hardened construction the
 * CLI's other git reads use: git by absolute path, no `GIT_*` variable, a
 * bare-shaped folder refused, no file-system monitor, no replace refs.
 */
function runGit(rootDir: string, args: readonly string[]): Promise<GitAnswer> {
  if (gitDiscoveryMeetsBareShape(rootDir)) return Promise.resolve({ ok: false, code: null });
  const env = gitReadEnv();
  const git = gitProgramFor(rootDir, env);
  if (git === null) return Promise.resolve({ ok: false, code: null });
  return new Promise((resolvePromise) => {
    execFile(
      git,
      // `core.useReplaceRefs=false` leads: on git 2.19–2.42 a repository's own config beats GIT_NO_REPLACE_OBJECTS (review/116).
      ["-c", "core.useReplaceRefs=false", "-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", ...args],
      { cwd: rootDir, env, encoding: "utf8", timeout: GIT_SHOW_TIMEOUT_MS, maxBuffer: MANIFEST_MAX_BYTES, windowsHide: true },
      (error, stdout) => {
        if (error === null) resolvePromise({ ok: true, stdout });
        else resolvePromise({ ok: false, code: typeof error.code === "number" ? error.code : null });
      },
    );
  });
}

/**
 * What `HEAD` holds at `paths` (relative to the setup root): `null` when git
 * gave no answer it means (it did not run, refused the repository, or failed
 * in any way but the one below), else each path `HEAD` tracks, mapped to its
 * text (`undefined` when it is not a regular file or its bytes could not be
 * read). An empty map is git's own answer that none is there: `HEAD` names no
 * commit (`rev-parse --verify -q` exits 1, an unborn branch), or `ls-tree`
 * lists none of them.
 */
async function readHead(rootDir: string, paths: readonly string[]): Promise<Map<string, string | undefined> | null> {
  const found = new Map<string, string | undefined>();
  const head = await runGit(rootDir, ["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  if (!head.ok) return head.code === 1 ? found : null;
  const listed = await runGit(rootDir, ["ls-tree", "-z", "HEAD", "--", ...paths]);
  if (!listed.ok) return null;
  for (const entry of listed.stdout.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, type, oid] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    if (!paths.includes(path)) continue;
    if (type !== "blob" || (mode !== "100644" && mode !== "100755") || oid === undefined) {
      found.set(path, undefined);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- the manifest and a handful of guard copies
    const blob = await runGit(rootDir, ["cat-file", "blob", oid]);
    found.set(path, blob.ok ? blob.stdout : undefined);
  }
  return found;
}

/** True when `rootDir` or a folder above it holds a `.git` entry: a checkout whose `HEAD` git could not be asked about. */
function insideCheckout(rootDir: string): boolean {
  let dir = rootDir;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** One leg of the baseline: the setting it reads as, and what it is, in the words a refusal names it by. */
interface BaselineLeg {
  readonly source: string;
  readonly setting: ResolvedAutonomy;
}

/** The manifest's path from the setup root, as git and the file system both take it. */
const MANIFEST_REL = `${STATE_DIR}/${MANIFEST_FILE}`;

/**
 * Every leg {@link readBaseline} takes the strictest of, each named. A
 * planned copy is read whatever it holds. A copy at another known guard path
 * is a leg only when its text is a guard the gate recognises, so it can only
 * tighten; it stands in for the planned copies (switching the no-copy `ask`
 * fallback off) only when `HEAD` holds it — never on the word of the ledger in
 * the manifest on disk, which an agent can edit — so a planted file never does
 * without a commit.
 */
async function baselineLegs(rootDir: string, planned: readonly string[]): Promise<BaselineLeg[]> {
  const legs: BaselineLeg[] = [];
  const others = KNOWN_GUARD_PATHS.filter((path) => !planned.includes(path));
  const read = (path: string): Promise<string | null | undefined> => readRegularFile(join(rootDir, ...path.split("/")), GUARD_COPY_MAX_BYTES);
  const [onDisk, othersOnDisk] = await Promise.all([Promise.all(planned.map(read)), Promise.all(others.map(read))]);
  let plannedFound = 0;
  let standIns = 0;
  onDisk.forEach((text, index) => {
    if (text === null) return;
    plannedFound += 1;
    legs.push({ source: `the guard copy \`${planned[index] ?? ""}\` on disk`, setting: text === undefined ? UNREADABLE : guardCopySetting(text) });
  });
  /** A copy at an unplanned path: a leg when recognised; a stand-in when also at `HEAD`. */
  const other = (path: string, text: string | null | undefined, atHead: boolean): void => {
    if (typeof text !== "string") return;
    const setting = recognisedSetting(text);
    if (setting === null) return;
    legs.push({ source: `the guard copy \`${path}\` ${atHead ? "committed at `HEAD`" : "on disk"}`, setting });
    if (atHead) standIns += 1;
  };
  othersOnDisk.forEach((text, index) => other(others[index] ?? "", text, false));
  const head = await readHead(rootDir, plannedFound === 0 ? [MANIFEST_REL, ...planned, ...others] : [MANIFEST_REL]);
  if (head === null) {
    if (insideCheckout(rootDir)) legs.push({ source: "`HEAD`, which git did not answer for", setting: UNREADABLE });
  } else {
    if (head.has(MANIFEST_REL)) {
      const text = head.get(MANIFEST_REL);
      legs.push({ source: "the setting committed at `HEAD`", setting: text === undefined ? UNREADABLE : manifestSetting(text) });
    }
    let headCopies = 0;
    for (const path of plannedFound === 0 ? planned : []) {
      if (!head.has(path)) continue;
      headCopies += 1;
      const text = head.get(path);
      legs.push({ source: `the guard copy \`${path}\` committed at \`HEAD\``, setting: text === undefined ? UNREADABLE : guardCopySetting(text) });
    }
    for (const path of plannedFound === 0 ? others : []) other(path, head.get(path), true);
    const committed = head.get(MANIFEST_REL);
    if (plannedFound === 0 && headCopies === 0 && standIns === 0 && head.has(MANIFEST_REL)) {
      // A setup from before the guard (decision D6): the manifest at `HEAD` owns no guard copy, so none is missing.
      const recorded = committed === undefined ? null : recordsGuardCopy(committed);
      if (recorded === null) {
        legs.push({ source: "the files the setup committed at `HEAD` owns, which could not be read", setting: UNREADABLE });
      } else if (recorded) {
        // What the gate found, not more (review/92): a copy at another client's path may be on disk, uncommitted.
        legs.push({
          source: "no guard copy found at `HEAD` or on disk where this write puts one, though the setup committed at `HEAD` records one (read as `ask`)",
          setting: ASK,
        });
      }
    }
  }
  const disk = await readRegularFile(join(rootDir, STATE_DIR, MANIFEST_FILE), MANIFEST_MAX_BYTES);
  if (disk !== null) legs.push({ source: "the manifest on disk", setting: disk === undefined ? UNREADABLE : manifestSetting(disk) });
  return legs;
}

/** The strictest of `legs`, or the default when there is none. */
function strictestOf(legs: readonly BaselineLeg[]): ResolvedAutonomy {
  const [first, ...rest] = legs.map((leg) => leg.setting);
  return first === undefined ? resolveAutonomy({}) : strictestAutonomy(first, ...rest);
}

/**
 * The setting a write is checked against (decision D18): the strictest of
 * the guard copies on disk at `copyPaths` (the guard paths the write plans for
 * the selected clients, the primary leg), the recognised guard copies at every
 * other client's known guard path (they can only tighten), the `autonomy`
 * committed at `HEAD`, and the manifest on disk before the write. With no
 * planned copy on disk, the copies committed at `HEAD` are legs too; with no
 * planned copy on disk or at `HEAD`, and no recognised copy at `HEAD` at any
 * other known guard path, while `HEAD` holds a manifest that records a guard
 * copy among the files it owns, the copies' leg reads `ask`, so deleting them
 * loosens nothing. A manifest at `HEAD` that records none is a setup from
 * before the guard, which gives no such leg (decision D6); one whose owned
 * files cannot be read gives the strictest setting. Inside a checkout, only
 * git's own answer that a path is not at `HEAD` reads as "not there"; a git
 * that refuses or fails reads as the strictest setting. With no leg at all — a
 * first `init` — it is the default.
 */
export async function readBaseline(rootDir: string, copyPaths: readonly string[]): Promise<ResolvedAutonomy> {
  return strictestOf(await baselineLegs(rootDir, copyPaths));
}

/**
 * One line per way `next` is looser than `baseline`: for the refusal's
 * message ("would"), or for the notice a `--loosen` write prints (`done`).
 * Names are JSON-quoted: they may come from an unchecked file.
 */
function looserParts(next: ResolvedAutonomy, baseline: ResolvedAutonomy, done = false): string[] {
  const parts: string[] = [];
  if (next.mode === "autonomous" && baseline.mode === "ask") parts.push(done ? "mode `ask` → `autonomous`" : "mode `autonomous` over `ask`");
  const runs = done ? "now runs unasked" : "would run unasked";
  const dropped = done ? "is no longer named" : "would no longer be named";
  for (const act of next.runs) if (!baseline.runs.includes(act)) parts.push(`\`${act}\` ${runs}`);
  for (const act of baseline.deploying) if (!next.deploying.includes(act)) parts.push(`\`${act}\` ${dropped} as deploying`);
  // Compared as `loosens` compares them: case folded, a `refs/heads/` prefix dropped.
  const key = (name: string): string => name.toLowerCase().replace(/^refs\/heads\//, "");
  const kept = new Set(next.deployingBranches.map(key));
  for (const name of baseline.deployingBranches) {
    if (!kept.has(key(name))) parts.push(`the deploying branch ${JSON.stringify(name)} ${dropped}`);
  }
  return parts;
}

/**
 * Refuses a write that would bake `next` into the guard copies `opts.copies`
 * names when it is looser than {@link readBaseline}'s answer over the planned
 * copies (`loosens`, `../../config/autonomy.ts`), unless `opts.loosen`: an
 * `EngineError` coded `AUTONOMY_LOOSENED` (exit 1), whose `why` names each leg
 * that is stricter. `remedy` is the command line its `next` names (the
 * caller's own, with `--loosen`). Under `opts.loosen` the loosening goes
 * through and `opts.notice` is handed one line per guard copy it loosens,
 * naming what loosens, so the person sees what their `--loosen` let through.
 */
export async function assertNotLoosened(
  rootDir: string,
  next: ResolvedAutonomy,
  opts: { loosen: boolean; copies: GuardCopies; remedy?: string; notice?: (line: string) => void },
): Promise<void> {
  const legs = await baselineLegs(rootDir, opts.copies.planned);
  const baseline = strictestOf(legs);
  if (!loosens(next, baseline)) return;
  if (opts.loosen) {
    const parts = looserParts(next, baseline, true).join("; ");
    for (const path of opts.copies.baking) opts.notice?.(`loosened \`${path}\` with --loosen: ${parts === "" ? "the autonomy setting" : parts}`);
    return;
  }
  const parts = looserParts(next, baseline);
  const deciding = legs.filter((leg) => loosens(next, leg.setting)).map((leg) => leg.source);
  throw new EngineError(
    `This write would bake a looser autonomy setting into the guard than the one in force${parts.length === 0 ? "" : `: ${parts.join("; ")}`}. Nothing was written.`,
    {
      code: "AUTONOMY_LOOSENED",
      why: `${deciding.length === 0 ? "the baseline" : deciding.join("; ")} ${deciding.length > 1 ? "are" : "is"} stricter, and loosening it is the person's act`,
      next: `the person runs \`${opts.remedy ?? "sync --loosen"}\``,
    },
  );
}

/** The gate a write loop runs when its caller passed none: {@link assertNotLoosened} with no `--loosen`. */
export function strictGuardGate(rootDir: string, remedy: string): GuardGate {
  return (next, copies) => assertNotLoosened(rootDir, next, { loosen: false, copies, remedy });
}

/** True when `text` is bytes the ledger recorded for `path`: the engine's own last write, not an edit since. */
function isRecorded(path: string, text: string, recorded: readonly RecordedRow[]): boolean {
  const hash = createHash("sha256").update(text).digest("hex");
  return recorded.some((row) => row.path === path && row.contentHash === hash);
}

/** The marker lines and the baked-constant line of one guard copy's text, joined: what "its marker differs" compares. */
function settingLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith(MARKER_PREFIX) || line.startsWith("const AUTONOMY = "))
    .join("\n");
}

/**
 * Runs `gate` once for each distinct setting a planned guard copy would bake
 * where its marker, or the baked constant beside it, differs from the copy on
 * disk (absent, unreadable or not a regular file counts as differing), so a
 * copy whose marker alone was rewritten to the planned value is still gated
 * when the constant it enforces changes. A planned copy with no marker is read
 * as the default, the loosest setting, so it is gated too. A copy on disk
 * whose bytes are not ones `recorded` (the ledger before this write) holds for
 * its path counts as differing too: re-writing a hand-edited copy is gated,
 * so a sync never turns an edited guard into one the ledger vouches for.
 * Called by the write loops before they write anything; a planned output is a
 * guard copy by its file name, wherever the plan puts it.
 */
export async function gateGuardCopies(
  rootDir: string,
  outputs: readonly { readonly path: string; readonly content: string }[],
  recorded: readonly { readonly path: string; readonly contentHash?: string }[],
  gate: GuardGate,
): Promise<void> {
  const settings = new Map<string, { next: ResolvedAutonomy; baking: string[] }>();
  const plannedPaths = outputs.filter((output) => output.path.split("/").at(-1) === PERSON_ONLY_GUARD_FILE).map((output) => output.path);
  for (const output of outputs) {
    if (output.path.split("/").at(-1) !== PERSON_ONLY_GUARD_FILE) continue;
    // oxlint-disable-next-line no-await-in-loop -- a handful of guard copies, read in plan order
    const onDisk = await readRegularFile(join(rootDir, ...output.path.split("/")), GUARD_COPY_MAX_BYTES);
    const planned = settingLines(output.content);
    if (typeof onDisk === "string" && settingLines(onDisk) === planned && planned !== "" && isRecorded(output.path, onDisk, recorded)) {
      continue;
    }
    const next = parseAutonomyMarker(output.content) ?? resolveAutonomy({});
    const key = JSON.stringify(next);
    const seen = settings.get(key);
    if (seen === undefined) settings.set(key, { next, baking: [output.path] });
    else seen.baking.push(output.path);
  }
  for (const { next, baking } of settings.values()) {
    // oxlint-disable-next-line no-await-in-loop -- one refusal is the answer; the second is not asked
    await gate(next, { planned: plannedPaths, baking });
  }
}
