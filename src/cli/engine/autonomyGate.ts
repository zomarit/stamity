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
 * strictest of three legs (decision D18): every guard copy on disk, the
 * `autonomy` committed at `HEAD`, and the manifest on disk before the write.
 * Every leg that cannot be read reads as the strictest setting it can state:
 * mode `ask` with every act named.
 *
 * Wave 13, below the wave-14 loops that import it, so it takes nothing from
 * the CLI kit: it throws an `EngineError` (the funnel renders its `why` and
 * `next`), the loops name the command to run in `next`, and its one git read
 * is built here the way `./gitStatus.ts` and `../../merge/safeWrite.ts` build
 * theirs.
 */

/** What a write loop calls for a planned guard copy whose marker changes: resolves to let it land, throws to refuse. */
export type GuardGate = (next: ResolvedAutonomy) => Promise<void>;

/** Every place in a repository a person-only guard copy lands: Claude Code's copy, then each client's generated one. */
export const GUARD_COPY_PATHS: readonly string[] = [
  `${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`,
  ...TOOLS.map((tool) => `${HOOKS_GENERATED_DIR}/${tool}/${PERSON_ONLY_GUARD_FILE}`),
];

/** Mode `ask` with nothing named: what a marker-less copy of this release, or no copy beside a committed manifest, reads as. */
const ASK: ResolvedAutonomy = resolveAutonomy({ autonomy: { mode: "ask" } });

/** Mode `ask` with every act named: what a leg reads as when it is there but cannot be read. */
const UNREADABLE: ResolvedAutonomy = resolveAutonomy({ autonomy: { mode: "ask", deployingActs: [...DEPLOYING_ACTS] } });

/** Past this many bytes a guard copy is not one the engine wrote (its budget is under 200 KiB); it reads {@link UNREADABLE}. */
const GUARD_COPY_MAX_BYTES = 1024 * 1024;

/** Past this many bytes a manifest (ledger included) reads {@link UNREADABLE}. */
const MANIFEST_MAX_BYTES = 64 * 1024 * 1024;

/** Wall time for the one `git show`; a git that does not answer in time reads as one that could not run. */
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
 * carrying neither is a 1.16.0-or-older copy and reads as the upgrade default
 * (decision D6).
 */
export function guardCopySetting(text: string): ResolvedAutonomy {
  const marked = parseAutonomyMarker(text);
  const baked = bakedSetting(text);
  if (marked !== null) return baked === null ? marked : strictestAutonomy(marked, baked);
  if (baked !== null) return strictestAutonomy(ASK, baked);
  return text.includes(BANNER_SENTENCE) ? ASK : resolveAutonomy({});
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

/** The caller's environment minus every `GIT_*` variable, as `./gitStatus.ts` runs its reads. */
function gitReadEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^GIT_/i.test(key)) env[key] = value;
  }
  env["GIT_OPTIONAL_LOCKS"] = "0";
  return env;
}

/** What `HEAD` holds at the manifest's path: its text, `absent` (git answered: no such file, commit or repository), or `unknown` (git did not run or answer). */
type HeadManifest = { kind: "present"; text: string } | { kind: "absent" } | { kind: "unknown" };

/**
 * `git show HEAD:./.stamity/manifest.json` from the setup root, through the
 * hardened construction the CLI's other git reads use: git by absolute path,
 * no `GIT_*` variable, a bare-shaped folder refused, no file-system monitor and
 * no text conversion.
 */
function readHeadManifest(rootDir: string): Promise<HeadManifest> {
  if (gitDiscoveryMeetsBareShape(rootDir)) return Promise.resolve({ kind: "unknown" });
  const env = gitReadEnv();
  const args = [
    "-c",
    "safe.bareRepository=explicit",
    "-c",
    "core.fsmonitor=false",
    "show",
    "--no-textconv",
    `HEAD:./${STATE_DIR}/${MANIFEST_FILE}`,
  ];
  const git = gitProgramFor(rootDir, env);
  if (git === null) return Promise.resolve({ kind: "unknown" });
  return new Promise((resolvePromise) => {
    execFile(
      git,
      args,
      { cwd: rootDir, env, encoding: "utf8", timeout: GIT_SHOW_TIMEOUT_MS, maxBuffer: MANIFEST_MAX_BYTES, windowsHide: true },
      (error, stdout) => {
        if (error === null) resolvePromise({ kind: "present", text: stdout });
        // A numeric exit code is git answering: no repository, no commit, or no such path at `HEAD`.
        else resolvePromise(typeof error.code === "number" ? { kind: "absent" } : { kind: "unknown" });
      },
    );
  });
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

/**
 * The setting a write is checked against (decision D18): the strictest of
 * every guard copy on disk ({@link GUARD_COPY_PATHS}, read by
 * {@link guardCopySetting}), the `autonomy` committed at `HEAD`, and the
 * manifest on disk before the write. With no guard copy on disk while `HEAD`
 * holds a manifest, the copies' leg reads `ask`, so deleting them loosens
 * nothing. A `HEAD` git could not be asked about inside a checkout reads as the
 * strictest setting. With no leg at all — a first `init` — it is the default.
 */
export async function readBaseline(rootDir: string): Promise<ResolvedAutonomy> {
  const legs: ResolvedAutonomy[] = [];
  const copies = await Promise.all(GUARD_COPY_PATHS.map((path) => readRegularFile(join(rootDir, path), GUARD_COPY_MAX_BYTES)));
  let copiesFound = 0;
  for (const text of copies) {
    if (text === null) continue;
    copiesFound += 1;
    legs.push(text === undefined ? UNREADABLE : guardCopySetting(text));
  }
  const head = await readHeadManifest(rootDir);
  if (head.kind === "present") {
    legs.push(manifestSetting(head.text));
    if (copiesFound === 0) legs.push(ASK);
  } else if (head.kind === "unknown" && insideCheckout(rootDir)) {
    legs.push(UNREADABLE);
  }
  const disk = await readRegularFile(join(rootDir, STATE_DIR, MANIFEST_FILE), MANIFEST_MAX_BYTES);
  if (disk !== null) legs.push(disk === undefined ? UNREADABLE : manifestSetting(disk));
  const [first, ...rest] = legs;
  return first === undefined ? resolveAutonomy({}) : strictestAutonomy(first, ...rest);
}

/** One line per way `next` is looser than `baseline`, for the refusal's message. Names are JSON-quoted: they may come from an unchecked file. */
function looserParts(next: ResolvedAutonomy, baseline: ResolvedAutonomy): string[] {
  const parts: string[] = [];
  if (next.mode === "autonomous" && baseline.mode === "ask") parts.push("mode `autonomous` over `ask`");
  for (const act of next.runs) if (!baseline.runs.includes(act)) parts.push(`\`${act}\` would run unasked`);
  for (const act of baseline.deploying) if (!next.deploying.includes(act)) parts.push(`\`${act}\` would no longer be named as deploying`);
  // Compared as `loosens` compares them: case folded, a `refs/heads/` prefix dropped.
  const key = (name: string): string => name.toLowerCase().replace(/^refs\/heads\//, "");
  const kept = new Set(next.deployingBranches.map(key));
  for (const name of baseline.deployingBranches) {
    if (!kept.has(key(name))) parts.push(`the deploying branch ${JSON.stringify(name)} would no longer be named`);
  }
  return parts;
}

/**
 * Refuses a write that would bake `next` when it is looser than
 * {@link readBaseline}'s answer (`loosens`, `../../config/autonomy.ts`), unless
 * `opts.loosen`: an `EngineError` coded `AUTONOMY_LOOSENED` (exit 1). `remedy`
 * is the command line its `next` names (the caller's own, with `--loosen`).
 */
export async function assertNotLoosened(
  rootDir: string,
  next: ResolvedAutonomy,
  opts: { loosen: boolean; remedy?: string },
): Promise<void> {
  if (opts.loosen) return;
  const baseline = await readBaseline(rootDir);
  if (!loosens(next, baseline)) return;
  const parts = looserParts(next, baseline);
  throw new EngineError(
    `This write would bake a looser autonomy setting into the guard than the one in force${parts.length === 0 ? "" : `: ${parts.join("; ")}`}. Nothing was written.`,
    {
      code: "AUTONOMY_LOOSENED",
      why: "the guard on disk, the setting committed at HEAD or the manifest this write replaces is stricter, and loosening it is the person's act",
      next: `the person runs \`${opts.remedy ?? "sync --loosen"}\``,
    },
  );
}

/** The gate a write loop runs when its caller passed none: {@link assertNotLoosened} with no `--loosen`. */
export function strictGuardGate(rootDir: string, remedy: string): GuardGate {
  return (next) => assertNotLoosened(rootDir, next, { loosen: false, remedy });
}

/** True when `text` is bytes the ledger recorded for `path`: the engine's own last write, not an edit since. */
function isRecorded(path: string, text: string, recorded: readonly { readonly path: string; readonly contentHash?: string }[]): boolean {
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
  const settings = new Map<string, ResolvedAutonomy>();
  for (const output of outputs) {
    if (output.path.split("/").at(-1) !== PERSON_ONLY_GUARD_FILE) continue;
    // oxlint-disable-next-line no-await-in-loop -- a handful of guard copies, read in plan order
    const onDisk = await readRegularFile(join(rootDir, ...output.path.split("/")), GUARD_COPY_MAX_BYTES);
    const planned = settingLines(output.content);
    if (typeof onDisk === "string" && settingLines(onDisk) === planned && planned !== "" && isRecorded(output.path, onDisk, recorded)) {
      continue;
    }
    const next = parseAutonomyMarker(output.content) ?? resolveAutonomy({});
    settings.set(JSON.stringify(next), next);
  }
  for (const next of settings.values()) {
    // oxlint-disable-next-line no-await-in-loop -- one refusal is the answer; the second is not asked
    await gate(next);
  }
}
