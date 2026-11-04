import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
import {
  BUILT_IN_RULES,
  classifyChange,
  hasCodeExtension,
  lineRulesCover,
  type BaseState,
  type ClassifyResult,
  type Hunk,
  type Lockfile,
  type PathSource,
} from "../../change/classify.ts";
import {
  extractReadPaths,
  isTestSource,
  selectTests,
  type TestSelection,
  type TestSelectionInput,
  type TestSource,
} from "../../change/testInputs.ts";
import { linesPastCap, SCAN_LINE_MAX_CHARS, scanAddedLines, type ScanFile, type ScanHit } from "../../change/scan.ts";
import { strictestAutonomy } from "../../config/autonomy.ts";
import { CLAUDE_HOOKS_DIR } from "../../hooks/model.ts";
import { PERSON_ONLY_GUARD_FILE } from "../../hooks/scripts.ts";
import { PREFLIGHT_CANARY_FILE } from "../../mcp/env.ts";
import { readGitSurface, SURFACE_RECORD_FILE, SURFACE_RECORD_LABEL, surfaceRecord, type GitSurface } from "../../runs/gitSurface.ts";
import { screenOutbound } from "../../runs/morning.ts";
import { REQUIRED_FLOORS, runPreflight, type PreflightDeps, type PushUrlFacts, type RestRead } from "../../runs/preflight.ts";
import { resolveRepo } from "../../runs/pullRequest.ts";
import { RECORD_FILE, REPORT_READ_MAX_BYTES, runRelPath, USAGE_REVIEW_PATTERN } from "../../runs/layout.ts";
import { findCardRun, readCurrentBranch } from "../../runs/resumeCard.ts";
import { detectSession, type SessionKind } from "../../session/detect.ts";
import { findPackageRoot } from "../../shared/paths.ts";
import { bareShapeRefusal, gitDiscoveryMeetsBareShape } from "../../merge/safeWrite.ts";
import { fileSystemProbe, gitProgramFor, isNodeModulesBin, programNotFound, resolveProgramOnPath, searchPathOf } from "../../shared/programPath.ts";
import { TOOLS } from "../../types/core.ts";
import type { SetupManifest } from "../../types/manifest.ts";
import { HOOKS_GENERATED_DIR, REVIEW_GATE_STATE_FILE } from "../../types/markers.ts";
import { guardCopySetting, readGuardLegs, readRegularFile } from "../engine/autonomyGate.ts";
import {
  applyNameFloor,
  applyReadFloors,
  awayFrom,
  baseEntry,
  describeGitFailure,
  DIFF_PINS,
  failClosed,
  findProjectRoot,
  GATE_GIT_MAX_BUFFER,
  GATE_GIT_TIMEOUT_MS,
  gitSaidNo,
  GitReadError,
  HEAD_BYTES,
  holdsNul,
  insideOf,
  namePaths,
  NPM_LOCKFILE,
  parseNameStatus,
  parseNumstat,
  parsePatch,
  PatchError,
  placeChange,
  raiseTo,
  readBaseClassFile,
  readCwdPrefix,
  resolveBase,
  rulesFrom,
  runGit,
  SHEBANG_BYTES,
  SNIFF_BYTES,
  withReasons,
  type PlacedChange,
  type ProjectRoot,
  type Section,
} from "../engine/changeRange.ts";
import { ghApi } from "../engine/ghRunner.ts";
import { gitCheckRunner, revisionLines, type GitInputRunner } from "../engine/gitStatus.ts";
import { gitWrite, gitWriteEnv } from "../engine/gitWrite.ts";
import { readSetting } from "../engine/landSetting.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import type { GitRunner } from "../../workspace/git.ts";

/**
 * `stamity gate classify` — the change class a flow's gates follow
 * (REQ-FLOW-061), and the CLI's fourth hidden plumbing verb. Hidden for the
 * reason `learn`, `handoff` and `ledger` are: its caller is the orchestrating
 * session running `/st-quick` or `/st-work`, not a person.
 *
 * **It decides nothing about a class.** The classes, their order, the rules,
 * the code-path floor and the checks each class names live in
 * `../../change/classify.ts`; this file owns where the changed paths come from
 * and how the verdict reads on a terminal and in the JSON document. The git reads
 * and floors it shares with `run land` live in `../engine/changeRange.ts`.
 *
 * **Where the paths come from.** `--paths` classifies the listed paths by path
 * rules alone, each read both ways (a backslash as a separator and as a
 * filename character). Without it the change is read from git: the tracked
 * changes (staged and unstaged) against the base, renames as renames, plus the
 * untracked files of the whole work tree; git's names are read literally, as
 * git gave them (review/20), except on win32, where a backslash in a name is a
 * separator at checkout (with `core.protectNTFS` off), so there they are read
 * both ways and the stronger class kept, as `--paths` are (review/43); the
 * project's prefix and the outside rules read them both ways too. `--base
 * <ref>` names the base, resolved once to a commit id every later call uses;
 * with no `--base` the reads run against `HEAD`, the reason says no base was
 * given, and unpushed commits raise the class ({@link floorUnclassified}).
 *
 * **Fail-closed.** Every git call runs through {@link gitCheckRunner}, the
 * hardened construction the CLI's other git reads use. A directory outside a
 * work tree, no git binary, a timeout, an oversized output or any other git
 * failure gives `product` with the failure named. A `--base` that does not
 * resolve, an unborn `HEAD` among them, gives no class: exit 1 and a `reason`
 * naming the ref as a failed read, so a flow reads "no class" (review/182),
 * never `product` over zero paths. Never a narrower class: the
 * class narrows the gates a flow runs, so an unread change takes the full set.
 *
 * **The project, not the repository.** The project is the nearest ancestor of
 * the directory the verb runs in, up to the git top-level, whose `.stamity/`
 * folder is in the base commit's tree (`HEAD`'s with no base), or the
 * top-level when none is; every git read runs from it ({@link findProjectRoot}).
 * A `.stamity/` the change itself adds is no root, so a change cannot move the
 * boundary it is read through (review/13). Each changed path is classified by
 * its project-relative form ({@link toProjectPath}), so the rules read the
 * project's own layout. A path outside the project is left out, counted in the
 * reason, and raises the class to at least `product`; one the built-in security
 * floor or the trigger roster's security row matches raises it to
 * `security-sensitive` (review/21). A name that is not valid UTF-8 raises it to
 * at least `product` too, since nothing can open it by the name read back, and
 * so, for any source, does a name the report has to strip (review/36).
 *
 * **The class file comes from the base.** With a resolved `--base`, the
 * project's {@link CLASS_FILE} is read as the base commit's blob, under the
 * project's prefix, and merged with the built-in rules; the head copy and the
 * work tree's are never read, so a change cannot lower its own checks through
 * the file, and a change to the file is `security-sensitive` by a built-in rule
 * (review/49). A base with no file gives the built-ins alone. A base copy the
 * validator refuses gives at least `product`, its first error named (plan/25),
 * and applies only its raising entries (`product`, `public-contract`,
 * `security-sensitive`) that parse on their own, never a lowering one
 * (review/48).
 * With no base, no class file is read (D5). `--paths` with `--base` reads the
 * base copy the same way, from the same project root.
 *
 * **The changed lines** (REQ-FLOW-065, plan/59, plan/62) come from more reads
 * through the same runner: the work tree's patch and the index's against the
 * base, their lines united (review/89), with every flag that config could turn
 * pinned (`-U3`, `-W`, `--text`, no external diff, colour or textconv, fixed
 * prefixes), each file section named by its place in the `-z` name list rather
 * than by its header, plus every untracked file read whole as added lines: the
 * files the line rules read first and under a total of their own (review/125,
 * review/146), the rest up to a total cap (review/94). A numstat read first
 * leaves binaries out of the text read (review/87). A NUL byte in a file's first
 * 8,000 bytes alone decides binary; a code file it marks, tracked or an
 * untracked regular one, is `unscanned`, as is an untracked regular code file
 * over 1 MiB, so the class is `security-sensitive` (review/125, review/138). A failed line read keeps the path classes and makes the class
 * `security-sensitive`, so the lens reads what no line rule could (review/87).
 *
 * **The lockfile copies** (REQ-FLOW-065, p5g) feed the classifier's audit-first
 * rule: each changed `package-lock.json`'s base copy (`git show`, under the
 * project's prefix, only with a resolved `--base`) and its work-tree copy. A
 * floor this file adds later that raises the class to `security-sensitive` (an
 * outside path, a failed line read) puts the security lens back.
 *
 * **The tests a change selects** (REQ-FLOW-062) come from the base copy's
 * test-input map and the tracked test sources of the work tree, through
 * `../../change/testInputs.ts`. No map, a base copy that is refused, a change
 * that could not be read, a test source that is not one readable file, or a
 * selected test the work tree lacks runs every test, the cause named.
 *
 * **`gate scan`** (REQ-FLOW-066) runs `../../change/scan.ts` over the added
 * lines of the same read, from the same project root, and names each hit by
 * path, line and rule, never the value. With no `--base` it reads the
 * uncommitted change against `HEAD` and says so (`base: null`, `scope:
 * "uncommitted"`); with one, everything since it (`scope: "since-base"`,
 * plan/56), and then the added lines of every commit since it too, merges left
 * out, so a value committed and removed again still stops the run; such a hit
 * names its commit (review/112). It reads the whole change: a file outside the
 * project is scanned and named from the project root, `../` first, and
 * `outside` counts those files (review/96, review/104); a file that opens with
 * a UTF-16 byte-order mark is decoded and scanned (review/98). The classifier
 * reads neither. A hit exits 1; so does a change it could not read, with
 * `ok: false` and the reason in place of the hits, so a failed read never
 * exits 0. A code file the read cannot show is listed in `unscanned`, never
 * read as clean (plan/62, review/94), and every other file left unread is
 * named in `skipped` (review/98); the exit stays 0 for either and the flows
 * read the lists. An added line past the scan's hard cap is not read, so the
 * run exits 1 with a `reason` naming it beside its hits, never clean
 * (review/135).
 *
 * **`gate scan --text <file> --label <label>`** (REQ-FLOW-103) screens one
 * outbound text, a pull request's body, a morning list, a reply or a comment,
 * through `../../runs/morning.ts::screenOutbound`: exit 1 on a hit or a line
 * past the cap, each named by label, line and rule, never the value; a file
 * that cannot be read, or one past `MAX_USER_CONTENT_LENGTH`, exits 1 too.
 *
 * **`gate preflight --unattended`** (REQ-FLOW-101) gathers every fact
 * `../../runs/preflight.ts` decides on from the engine's own reads, never from
 * the caller: the canary, the manifest's pin and floor copies, the review
 * state, the REST reads through `gh` on the host `origin` resolved to, and
 * the push identity as raw facts ({@link readPushIdentity}). No URL, helper or
 * header value reaches the output. Exit 0 with no refusal, 1 on any refusal
 * or unknown. It is the one subcommand that writes (REQ-FLOW-131, review/97):
 * on a pass it records the git surface the run verbs' git sees
 * (`../../runs/gitSurface.ts`, read through {@link readRunGitSurface}) at
 * `<git-dir>/stamity/preflight-git.json`, atomically, so `run checkpoint` and
 * `run end` can refuse a configuration or environment it did not vet; a refusal
 * writes it marked `refused` in place of an earlier pass's, which only
 * `run end --refused` takes (review/33), and a record it cannot write refuses as
 * `git-record`, naming the error code alone (review/36). The JSON's `gitRecord`
 * is true only for a passing record. `--dry-run` writes and removes nothing.
 *
 * **Why the subcommand is positional**, as in `ledger.ts`: the funnel
 * (`../kit/program.ts`) owns the exit codes and the one JSON document through
 * the action it registers on THIS command, and a commander sub-command would run
 * outside it. An unknown subcommand, an unknown option or a `--base` that starts
 * with `-` is refused by the parser, so each exits 2 before git runs.
 */

const CLASSIFY = "classify";
const SCAN = "scan";
const PREFLIGHT = "preflight";

export { toProjectPath } from "../engine/changeRange.ts";

/**
 * A ref git would read as an option is refused before git runs, exit 2. This is
 * the guard: the resolve passes no `--end-of-options`, which `rev-parse` takes
 * only from git 2.43, so a base resolves on an older git too (review/15).
 */
function parseBaseRef(value: string): string {
  if (value.startsWith("-")) throw new InvalidArgumentError("a base ref never starts with '-'.");
  return value;
}

/** An untracked file larger than this is not read (plan/19). */
const UNTRACKED_MAX_BYTES = 1024 * 1024;
/**
 * The untracked reads stop at this many bytes in all; each file past it is
 * unscanned, never read (review/94). The files the line rules read are read
 * first and never count against it (review/125): they have a total of their own,
 * {@link UNTRACKED_COVERED_TOTAL_BYTES}, past which each is unscanned too and
 * makes the class `security-sensitive` (review/146).
 */
const UNTRACKED_TOTAL_BYTES = 16 * 1024 * 1024;
const UNTRACKED_COVERED_TOTAL_BYTES = 16 * 1024 * 1024;

/**
 * Up to `limit` bytes of a regular file, or `undefined` for anything else (a
 * symlink, a FIFO, a device, a folder, a missing file) or a file over `whole`
 * bytes when given. `lstat` first; the open never follows a link and never
 * waits on a FIFO swapped in since, and `fstat` checks the open file again.
 */
function readRegular(file: string, limit: number, whole?: number): Buffer | undefined {
  try {
    if (!lstatSync(file).isFile()) return undefined;
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || (whole !== undefined && stat.size > whole)) return undefined;
      const buffer = Buffer.alloc(Math.min(stat.size, limit));
      const read = readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.subarray(0, read);
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/** Whether a path names a regular file, by `lstat`: never a symlink, a FIFO or a device. */
function isRegularFile(file: string): boolean {
  try {
    return lstatSync(file).isFile();
  } catch {
    return false;
  }
}

/** Whether a file is regular and holds no NUL in its first {@link SNIFF_BYTES}: text by the one rule that decides (plan/62). */
function readsAsText(file: string): boolean {
  const start = readRegular(file, SNIFF_BYTES);
  return start !== undefined && !start.includes(0);
}

/**
 * A file's text by its UTF-16 byte-order mark, little- or big-endian, or
 * `undefined` for a file with none (review/98): its ASCII bytes carry NULs, so
 * the sniff alone would call it binary.
 */
function decodeUtf16(body: Buffer): string | undefined {
  if (body[0] === 0xff && body[1] === 0xfe) return body.subarray(2).toString("utf16le");
  if (body[0] !== 0xfe || body[1] !== 0xff) return undefined;
  const swapped = Buffer.from(body.subarray(2, body.length - (body.length % 2)));
  return swapped.swap16().toString("utf16le");
}

/** A regular file's text when it opens with a UTF-16 byte-order mark and fits the untracked bound; two bytes are read first. */
function readUtf16(file: string): string | undefined {
  const mark = readRegular(file, 2);
  if (mark === undefined || decodeUtf16(mark) === undefined) return undefined;
  const body = readRegular(file, UNTRACKED_MAX_BYTES, UNTRACKED_MAX_BYTES);
  return body === undefined ? undefined : decodeUtf16(body);
}

/** A whole file's text as one hunk of added lines from line 1. */
function wholeFile(path: string, text: string): Hunk {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return { path, added: lines.map((line, at) => ({ line: at + 1, text: line })), removed: [], context: [] };
}

/**
 * What only the scan reads, under the paths it names (review/96, review/98):
 * the lines of files outside the project, named from the project root (`../`
 * first), the lines of UTF-16 files decoded, every file left unread by path,
 * and the files outside the project counted. The classifier never reads these.
 */
interface ScanLines {
  hunks: Hunk[];
  skipped: string[];
  unscanned: string[];
  outside: number;
}

/** The changed lines in project-relative hunks, and what the read could not show. */
interface ChangeLines {
  hunks: Hunk[];
  /** Files whose lines were not read: binary and not code, untracked over 1 MiB, or not a regular file. */
  skipped: number;
  /**
   * Files the read could not show (plan/62): tracked code files the sniff marks
   * binary, untracked files past a total read cap (review/94, review/146), and
   * untracked regular code files left unread for their size or a NUL (review/138).
   */
  unscanned: string[];
  /** The unscanned files a covered shebang or, unread, the executable mode, not an extension, makes code (review/138, review/146, review/200). */
  unscannedCode: string[];
  scan: ScanLines;
}

/** Which copy the patch reads against the base: the work tree's, or the index's (review/89). */
type Side = "work tree" | "index";

/** One side's read: its hunks, the section names it listed, and what it could not show. */
interface SideRead {
  hunks: Hunk[];
  /** Top-level-relative names of the files outside the project. */
  outside: Set<string>;
  skipped: Set<string>;
  unscanned: string[];
  /** The unscanned files a covered shebang or the executable mode, not an extension, makes code (review/200). */
  unscannedCode: string[];
  /** The scan's view, by the paths it names: lines outside the project and decoded, and what stayed unread. */
  scan: { hunks: Hunk[]; skipped: Set<string>; unscanned: Set<string> };
}

/**
 * One side's patch against `commit`, as hunks under project-relative names.
 *
 * A `--numstat` read comes first (review/87): each file it shows as binary
 * whose work-tree copy the NUL sniff also finds binary, or cannot read (a
 * deletion), is left out of the text read by an exclude pathspec, so its bytes
 * never reach the one bounded read; a code file left out is `unscanned`, any
 * other `skipped`. A file with no code extension is code when its head opens
 * with a shebang the line rules cover, or, with no head to read, when git
 * records it executable on either side (review/200). Git's verdict only
 * nominates: an attribute or a `binary` driver that hides a text file's lines
 * from numstat never hides them here.
 *
 * The text read pins `-U3`, `-W` (the whole enclosing function as context, so
 * a guard removed far from its call still shows the call, review/88) and
 * `--inter-hunk-context=0` whatever `diff.context` says; `--text` keeps an
 * attribute from hiding a code file's lines; `--submodule=short` keeps a
 * submodule one section. Section names come from the name list in the same
 * order (plan/62): `workSections` for the work tree when nothing is left out,
 * else a name list read with the same pathspec.
 */
function readSide(
  runner: GitRunner,
  root: ProjectRoot,
  commit: string,
  side: Side,
  workSections: readonly Section[],
  inside: (name: string) => string | null,
  away: (name: string) => string,
): SideRead {
  const staged = side === "index" ? ["--staged"] : [];
  const label = side === "index" ? "diff --staged" : "diff";
  const numstat = parseNumstat(
    runGit(runner, root.dir, `${label} --numstat`, ["diff", ...staged, "--numstat", "-M", "-z", ...DIFF_PINS, commit, "--"]),
  );
  const binaries = numstat.filter((row) => row.binary && !readsAsText(join(root.topLevel, row.to)));
  const pathspec = [...new Set(binaries.flatMap((row) => [row.from, row.to]))].map((name) => `:(top,literal,exclude)${name}`);
  const sections =
    side === "work tree" && pathspec.length === 0
      ? workSections
      : parseNameStatus(
          runGit(runner, root.dir, `${label} --name-status`, ["diff", ...staged, "--name-status", "-M", "-z", ...DIFF_PINS, commit, "--", ...pathspec]),
        ).sections;
  const patch = runGit(runner, root.dir, `${label} --text`, [
    "-c",
    "core.quotePath=false",
    "diff",
    ...staged,
    "-U3",
    "-W",
    "-M",
    "--text",
    "--no-relative",
    "--no-ext-diff",
    "--no-color",
    "--no-textconv",
    // Fixed prefixes, so `diff.noprefix` or `diff.mnemonicPrefix` cannot move an unquoted header off its entry.
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--inter-hunk-context=0",
    // `diff.submodule=log` would print a submodule as a log, not one section: the walk would lose its place.
    "--submodule=short",
    "--ignore-submodules=none",
    commit,
    "--",
    ...pathspec,
  ]);
  const read: SideRead = {
    hunks: [],
    outside: new Set(),
    skipped: new Set(),
    unscanned: [],
    unscannedCode: [],
    scan: { hunks: [], skipped: new Set(), unscanned: new Set() },
  };
  // review/200: whether git records the file executable (mode 100755) on either side of this side's diff.
  const executable = (name: string): boolean => {
    const raw = runGit(runner, root.dir, `${label} --raw`, ["diff", ...staged, "--raw", "-z", ...DIFF_PINS, commit, "--", `:(top,literal)${name}`]);
    return raw.split("\0").some((field) => field.startsWith(":") && field.slice(1).split(" ", 2).includes("100755"));
  };
  // A file with no code extension: code by a covered shebang in its head, or, with no head to read, by its mode.
  const script = (name: string, shown: string): boolean => {
    const start = readRegular(join(root.topLevel, name), SHEBANG_BYTES);
    if (start === undefined) return executable(name);
    const first = start.toString("utf8").split("\n", 1)[0] ?? "";
    return first.startsWith("#!") && lineRulesCover(shown, "git", first);
  };
  const notRead = (name: string, path: string | null): void => {
    const shown = path ?? away(name);
    const extension = hasCodeExtension(shown);
    const code = extension || script(name, shown);
    if (path !== null) {
      if (code) read.unscanned.push(path);
      else read.skipped.add(path);
      if (code && !extension) read.unscannedCode.push(path);
    }
    // The scan decodes a UTF-16 work-tree file whole (review/98), standing in for the index's copy too; a
    // staged copy the work tree has changed again is not decoded, and stays named only when the tree's was not.
    const text = side === "work tree" ? readUtf16(join(root.topLevel, name)) : undefined;
    if (text !== undefined) read.scan.hunks.push(wholeFile(shown, text));
    else if (code) read.scan.unscanned.add(shown);
    else read.scan.skipped.add(shown);
  };
  for (const row of binaries) {
    if (inside(row.to) === null) read.outside.add(row.to);
    notRead(row.to, inside(row.to));
  }
  parsePatch(patch, sections).forEach((section, index) => {
    const name = sections[index]?.to ?? "";
    const path = inside(name);
    if (path === null) read.outside.add(name);
    // The head side: the work-tree file (standing in for the index's copy too), or a deletion's removed lines.
    const file = section.deleted ? undefined : readRegular(join(root.topLevel, name), HEAD_BYTES);
    const lines = section.hunks.flatMap((hunk) => (section.deleted ? hunk.removed : hunk.added.map((line) => line.text)));
    const sniffed = side === "work tree" ? file : undefined;
    if (section.unshown || (sniffed === undefined ? holdsNul(lines) : sniffed.subarray(0, SNIFF_BYTES).includes(0))) {
      notRead(name, path);
      return;
    }
    // A file outside the project is the scan's alone (review/96), named from the project root.
    if (path === null) {
      for (const hunk of section.hunks) read.scan.hunks.push({ path: away(name), ...hunk });
      return;
    }
    const head = file !== undefined ? file.toString("utf8") : section.deleted ? lines.join("\n").slice(0, HEAD_BYTES) : undefined;
    for (const hunk of section.hunks) read.hunks.push({ path, ...hunk, ...(head === undefined ? {} : { head }) });
  });
  return read;
}

/**
 * The change's lines against `commit` (plan/59): the work tree's patch and the
 * index's, united (review/89), so a staged line the work tree has since
 * reverted is read as `git commit` would record it, plus every untracked file
 * read whole as added lines: first those the line rules read, by extension or
 * by shebang, up to {@link UNTRACKED_COVERED_TOTAL_BYTES} of their own
 * (review/125, review/146), then the rest up to {@link UNTRACKED_TOTAL_BYTES}
 * in all (review/94). A regular code file left unread, past a total, over
 * 1 MiB or by a NUL, is unscanned; a symlink or a FIFO is skipped (review/138). An index line the work tree
 * also adds to that file is read once, from the work tree; an index hunk left
 * with nothing new is dropped.
 */
function readLines(
  runner: GitRunner,
  root: ProjectRoot,
  commit: string,
  sections: readonly Section[],
  untracked: readonly string[],
  windows: boolean,
): ChangeLines {
  const inside = insideOf(root.prefix, windows);
  const away = awayFrom(root.prefix);
  const work = readSide(runner, root, commit, "work tree", sections, inside, away);
  const index = readSide(runner, root, commit, "index", sections, inside, away);

  const seen = (pick: (hunk: Hunk) => readonly string[]): Map<string, Set<string>> => {
    const byPath = new Map<string, Set<string>>();
    for (const hunk of work.hunks) for (const text of pick(hunk)) byPath.set(hunk.path, (byPath.get(hunk.path) ?? new Set()).add(text));
    return byPath;
  };
  const workAdded = seen((hunk) => hunk.added.map((line) => line.text));
  const workRemoved = seen((hunk) => hunk.removed);
  const indexOnly = index.hunks.flatMap((hunk): Hunk[] => {
    const added = hunk.added.filter((line) => workAdded.get(hunk.path)?.has(line.text) !== true);
    const removedAnew = hunk.removed.some((text) => workRemoved.get(hunk.path)?.has(text) !== true);
    return added.length === 0 && !removedAnew ? [] : [{ ...hunk, added }];
  });

  const hunks = [...work.hunks, ...indexOnly];
  const skipped = new Set([...work.skipped, ...index.skipped]);
  const unscanned = [...work.unscanned, ...index.unscanned];
  // The scan's view: the index's outside lines as the index's inside ones, read once beside the work tree's.
  const outsideAdded = new Set(work.scan.hunks.flatMap((hunk) => hunk.added.map((line) => `${hunk.path}\0${line.text}`)));
  const scanHunks = [
    ...work.scan.hunks,
    ...index.scan.hunks.flatMap((hunk): Hunk[] => {
      const added = hunk.added.filter((line) => !outsideAdded.has(`${hunk.path}\0${line.text}`));
      return added.length === 0 ? [] : [{ ...hunk, added }];
    }),
  ];
  const scanSkipped = new Set([...work.scan.skipped, ...index.scan.skipped]);
  const scanUnscanned = new Set([...work.scan.unscanned, ...index.scan.unscanned]);
  const outside = new Set([...work.outside, ...index.outside]);
  const unscannedCode: string[] = [...work.unscannedCode, ...index.unscannedCode];
  const notShown = (path: string | null, shown: string, code: boolean): void => {
    if (path !== null) unscanned.push(path);
    if (path !== null && code && !hasCodeExtension(path)) unscannedCode.push(path);
    scanUnscanned.add(shown);
  };
  // review/125, review/146: the files the line rules read come first, under a total of their own, so no other budget leaves them unread.
  const source: PathSource = windows ? "listed" : "git";
  const firstLine = (name: string): string | undefined => {
    const start = readRegular(join(root.topLevel, name), SHEBANG_BYTES)?.toString("utf8");
    return start?.startsWith("#!") === true ? start.split("\n", 1)[0] : undefined;
  };
  const covered = new Set(
    untracked.filter((name) => {
      const path = inside(name);
      return path !== null && (lineRulesCover(path, source, undefined) || lineRulesCover(path, source, firstLine(name)));
    }),
  );
  // Two totals: the covered files' own (review/146), and the rest's (review/94).
  const spent = { covered: 0, rest: 0 };
  for (const name of [...covered, ...untracked.filter((entry) => !covered.has(entry))]) {
    const path = inside(name);
    const shown = path ?? away(name);
    const pool = covered.has(name) ? "covered" : "rest";
    const total = pool === "covered" ? UNTRACKED_COVERED_TOTAL_BYTES : UNTRACKED_TOTAL_BYTES;
    // A code file by extension or by a covered shebang: what no line rule reads is unscanned, never skipped.
    const code = hasCodeExtension(shown) || pool === "covered";
    if (path === null) outside.add(name);
    if (spent[pool] >= total) {
      notShown(path, shown, code);
      continue;
    }
    const file = join(root.topLevel, name);
    const body = readRegular(file, UNTRACKED_MAX_BYTES, UNTRACKED_MAX_BYTES);
    const decoded = body === undefined ? undefined : decodeUtf16(body);
    if (body === undefined || (decoded === undefined && body.subarray(0, SNIFF_BYTES).includes(0))) {
      // review/138: a regular code file left unread for its size or a NUL is unscanned; a symlink or a FIFO stays skipped.
      if (code && isRegularFile(file)) {
        notShown(path, shown, code);
        continue;
      }
      if (path !== null) skipped.add(path);
      scanSkipped.add(shown);
      continue;
    }
    if (spent[pool] + body.length > total) {
      spent[pool] = total;
      notShown(path, shown, code);
      continue;
    }
    spent[pool] += body.length;
    // A UTF-16 file is the scan's alone (review/98): the classifier counts a code one unscanned (review/138), any other skipped.
    if (decoded !== undefined) {
      if (path !== null && code) {
        unscanned.push(path);
        if (!hasCodeExtension(path)) unscannedCode.push(path);
      } else if (path !== null) skipped.add(path);
      scanHunks.push(wholeFile(shown, decoded));
      continue;
    }
    const text = body.toString("utf8");
    if (path === null) scanHunks.push(wholeFile(shown, text));
    else hunks.push({ ...wholeFile(path, text), head: text.slice(0, HEAD_BYTES) });
  }
  const read = new Set(scanHunks.map((hunk) => hunk.path));
  return {
    hunks,
    skipped: skipped.size,
    unscanned: [...new Set(unscanned)],
    unscannedCode: [...new Set(unscannedCode)],
    scan: {
      hunks: scanHunks,
      skipped: [...scanSkipped].filter((path) => !read.has(path)),
      unscanned: [...new Set([...unscanned, ...scanUnscanned])].filter((path) => !read.has(path)),
      outside: outside.size,
    },
  };
}

/** What the git read hands the classifier, in project-relative paths. */
interface ChangeRead extends PlacedChange {
  /** The changed lines, or why they could not be read. */
  lines: ChangeLines | { failed: string };
}

/**
 * The change against `commit`: tracked changes (staged and unstaged, renames
 * as `R` rows) plus untracked files, both NUL-separated so `core.quotePath`
 * cannot escape a name, and both top-level-relative (`--no-relative`, so a
 * `diff.relative` setting cannot narrow the read) before {@link toProjectPath}.
 * The untracked list runs from the top-level, so an untracked file outside the
 * project meets the outside rules as a tracked one does (review/34). On win32
 * (`windows`) a name outside the project by its literal reading that lands
 * inside it with `\` as a separator is read there too, and stays counted
 * outside: the stronger reading wins either way (review/43).
 */
function readChange(runner: GitRunner, root: ProjectRoot, commit: string, windows: boolean): ChangeRead {
  const { dir: cwd, prefix } = root;
  const diff = parseNameStatus(
    runGit(runner, cwd, "diff --name-status", [
      "diff",
      "--name-status",
      "-M",
      "-z",
      "--no-relative",
      "--no-ext-diff",
      "--no-color",
      "--no-textconv",
      // A committed `.gitmodules` or a local setting must not hide a submodule bump (review/14).
      "--ignore-submodules=none",
      commit,
      "--",
    ]),
  );
  const untracked = runGit(runner, root.topLevel, "ls-files --others", [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--full-name",
    "-z",
  ])
    .split("\0")
    .filter((path) => path !== "");

  const placed = placeChange([...diff.paths, ...untracked], diff.renames, prefix, windows);
  // The lines serve the line rules: their failure keeps the paths read above and says at least product.
  let lines: ChangeRead["lines"];
  try {
    lines = readLines(runner, root, commit, diff.sections, untracked, windows);
  } catch (err) {
    if (err instanceof GitReadError) lines = { failed: describeGitFailure(err) };
    else if (err instanceof PatchError) lines = { failed: err.message };
    else throw err;
  }
  return { ...placed, lines };
}

/**
 * The text of `treeish`'s blob at the top-level-relative `name` when it opens
 * as a UTF-16 byte-order mark reads (review/98: `HEAD`'s for the pushed
 * scope, build/94, and each commit's for the history, build/98), from the
 * object store, never the work tree, so what is read is what a push sends. The read runner decodes UTF-8: either mark (`FF FE`,
 * `FE FF`) reads as two U+FFFD, and no ASCII byte is ever taken into a
 * replacement, so with the NULs dropped the file's ASCII, where every rule's
 * value lives, keeps its order and its lines. A blob opening with another pair
 * UTF-8 cannot start a character with is read the same way: more read, never
 * less. `undefined` for no blob there, no such opening, or a blob past the
 * untracked bound.
 */
function blobUtf16(runner: GitRunner, root: ProjectRoot, treeish: string, name: string): string | undefined {
  const entry = baseEntry(runner, root.dir, treeish, name);
  if (entry?.type !== "blob") return undefined;
  const size = Number(runGit(runner, root.dir, "cat-file -s", ["cat-file", "-s", entry.id]).trim());
  if (!(size <= UNTRACKED_MAX_BYTES)) return undefined;
  const text = runGit(runner, root.dir, "cat-file blob", ["cat-file", "blob", entry.id]);
  return text.startsWith("\uFFFD\uFFFD") ? text.slice(2).replaceAll("\0", "") : undefined;
}

/**
 * What the test selection reads beside the final class and paths, and the
 * project directory its selected files must exist in; or why every test runs.
 */
type TestPlan = { select: Omit<TestSelectionInput, "paths" | "class">; dir: string | null } | { every: string };

/** No map was read, so the selection runs every test (S4). */
const NO_MAP: TestPlan = { select: {}, dir: null };

/** A test source larger than this is not read as one, and every test runs. */
const TEST_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

/** At most this many characters of a refused glob literal are quoted in a reason; the length is given beside. */
const LITERAL_QUOTED = 60;

/**
 * The project's tracked test sources (code files under a test glob, from `git
 * ls-files` run at the project root, so project-relative) with the paths each
 * names, read from the work tree; the tracked files and the changed paths are
 * the names a read may match. A source deleted in the work tree reads nothing.
 * One that is not a regular file, is too large, or holds a glob literal over
 * the cost bound (review/62) makes every test run, named.
 */
function readTestSources(
  runner: GitRunner,
  root: ProjectRoot,
  testGlobs: readonly string[],
  changed: readonly string[],
): TestSource[] | { every: string } {
  const tracked = runGit(runner, root.dir, "ls-files --cached", ["ls-files", "--cached", "-z"])
    .split("\0")
    .filter((path) => path !== "");
  const known = new Set([...tracked, ...changed]);
  const sources: TestSource[] = [];
  for (const test of tracked.filter((path) => isTestSource(path, testGlobs))) {
    const file = join(root.dir, test);
    if (!existsSync(file)) continue;
    let text: string | undefined;
    try {
      const stat = lstatSync(file);
      if (stat.isFile() && stat.size <= TEST_SOURCE_MAX_BYTES) text = readFileSync(file, "utf8");
    } catch {
      text = undefined;
    }
    if (text === undefined) return { every: `the test source ${test} is not one readable file, so every test runs` };
    const reads = extractReadPaths(text, known);
    if (!Array.isArray(reads)) {
      const quoted = JSON.stringify(reads.refused.slice(0, LITERAL_QUOTED));
      const length = reads.refused.length > LITERAL_QUOTED ? ` (${reads.refused.length} characters)` : "";
      return { every: `the test source ${test} holds the glob literal ${quoted}${length}, which ${reads.error}, so every test runs` };
    }
    sources.push({ test, reads });
  }
  return sources;
}

/** The selection for the final class and paths: every test when a selected file is not in the work tree. */
function selectFor(plan: TestPlan, result: ClassifyResult): TestSelection {
  if ("every" in plan) return { full: true, files: [], reason: plan.every };
  const selection = selectTests({ ...plan.select, paths: result.byPath.map((entry) => entry.path), class: result.class });
  const { dir } = plan;
  const missing = dir === null ? [] : selection.files.filter((file) => !existsSync(join(dir, file)));
  if (missing.length === 0) return selection;
  return { full: true, files: [], reason: `the selected ${namePaths(missing)} is not in the work tree, so every test runs` };
}

/**
 * Each changed `package-lock.json`'s copies, for the audit-first rule
 * (REQ-FLOW-065, plan/61, plan/63): the base commit's through the runner, as
 * `git show <commit>:<prefix><path>` from the project root, and the work tree's
 * from the project root, a regular file within the runner's output bound. No
 * base, or a base read that fails (an absent file, a copy past the bound), is
 * `base: null`, the failure named (build/78), and a head copy that cannot be
 * read leaves the file out. The index copy, which `git commit` records, is read
 * as `git show :<prefix><path>` and compared with the work tree's byte for byte
 * (review/155): `same`, `differs`, or `unread` when the read fails. Any of these
 * but `same` with a base copy keeps the security lens, never a narrower verdict.
 */
function readLockfiles(runner: GitRunner, root: ProjectRoot, commit: string | null, paths: readonly string[]): Lockfile[] {
  const lockfiles: Lockfile[] = [];
  for (const path of paths) {
    if (path.slice(path.lastIndexOf("/") + 1) !== NPM_LOCKFILE) continue;
    const head = readRegular(join(root.dir, path), GATE_GIT_MAX_BUFFER, GATE_GIT_MAX_BUFFER);
    if (head === undefined) continue;
    let base: string | null = null;
    let baseFailure: string | undefined;
    let staged: Lockfile["staged"] = "unread";
    if (commit !== null) {
      try {
        base = runGit(runner, root.dir, "show", ["show", "--no-textconv", `${commit}:${root.prefix}${path}`]);
      } catch (err) {
        if (!(err instanceof GitReadError)) throw err;
        baseFailure = describeGitFailure(err);
      }
      try {
        const index = runGit(runner, root.dir, "show", ["show", "--no-textconv", `:${root.prefix}${path}`]);
        // The runner decodes UTF-8, so a byte it could not decode never reads as equal.
        staged = !index.includes("\uFFFD") && Buffer.from(index, "utf8").equals(head) ? "same" : "differs";
      } catch (err) {
        if (!(err instanceof GitReadError)) throw err;
      }
    }
    lockfiles.push({ path, base, head: head.toString("utf8"), staged, ...(baseFailure === undefined ? {} : { baseFailure }) });
  }
  return lockfiles;
}

/**
 * The classification and the resolved base for one run. `--paths` alone reads
 * no git at all; anything else goes through the hardened runner.
 */
function classify(
  cwd: string,
  listed: readonly string[] | undefined,
  ref: string | undefined,
): { result: ClassifyResult; base: string | null; tests: TestPlan } | { failed: string } {
  if (listed !== undefined && ref === undefined) {
    return { result: classifyChange({ paths: listed, base: "absent" }), base: null, tests: NO_MAP };
  }

  const runner = gitCheckRunner({ timeoutMs: GATE_GIT_TIMEOUT_MS, maxBuffer: GATE_GIT_MAX_BUFFER });
  try {
    // Read first: outside a work tree this is the call that fails, and says so.
    const cwdPrefix = readCwdPrefix(runner, cwd);
    const commit = ref === undefined ? null : resolveBase(runner, cwd, ref);
    // review/182: a base that does not resolve (an unborn HEAD among them) leaves no class file and nothing to
    // diff against, so it gives no class, never `product` over zero paths a flow would read as one.
    if (ref !== undefined && commit === null) {
      return { failed: `the base ${ref} could not be read: it does not resolve to a commit here, so no class is given` };
    }
    const baseState: BaseState = commit === null ? "absent" : "given";
    const reasons: string[] = [];
    const treeish = commit ?? "HEAD";
    const root = findProjectRoot(runner, cwd, cwdPrefix, treeish);
    // With no base no class file is read (D5); with one, only the base commit's copy is.
    const classFile = commit === null ? undefined : readBaseClassFile(runner, root, commit);
    const { rules, reason: fileReason } = classFile === undefined ? { rules: BUILT_IN_RULES } : rulesFrom(classFile);
    if (fileReason !== undefined) reasons.push(fileReason);

    let result: ClassifyResult;
    if (listed !== undefined) {
      result = classifyChange({ paths: listed, base: baseState }, rules);
    } else {
      // On win32 git's names are read both ways (review/43); elsewhere literally (review/20).
      const windows = process.platform === "win32";
      const source: PathSource = windows ? "listed" : "git";
      const change = readChange(runner, root, treeish, windows);
      const lines =
        "failed" in change.lines
          ? {}
          : { hunks: change.lines.hunks, unscanned: change.lines.unscanned, unscannedCode: change.lines.unscannedCode };
      const lockfiles = readLockfiles(runner, root, commit, change.paths);
      result = floorUnclassified(runner, root.dir, commit, applyReadFloors(
        classifyChange({ paths: change.paths, renames: change.renames, base: baseState, source, ...lines, lockfiles }, rules),
        change,
        source,
      ));
    }
    if (classFile?.state === "invalid") result = raiseTo(result, "product");

    // The map is the base copy's alone, and only a valid copy gives one (S4); an empty map is no map.
    let tests: TestPlan = NO_MAP;
    if (classFile?.state === "valid" && classFile.testInputs.length > 0) {
      const { testGlobs, testInputs: map } = classFile;
      // The read serves the selection alone: its failure runs every test and keeps the class and lenses (review/63).
      let sources: ReturnType<typeof readTestSources>;
      try {
        sources = readTestSources(runner, root, testGlobs, result.byPath.map((entry) => entry.path));
      } catch (err) {
        if (!(err instanceof GitReadError)) throw err;
        sources = { every: `${describeGitFailure(err)}, so every test runs` };
      }
      tests = Array.isArray(sources) ? { select: { map, testSources: sources }, dir: root.dir } : sources;
    }
    return { result: withReasons(result, reasons), base: commit, tests };
  } catch (err) {
    if (!(err instanceof GitReadError)) throw err;
    const reason = `the change could not be read (${describeGitFailure(err)}), so the class is product`; // review/194
    return { result: failClosed(reason), base: null, tests: { every: "the change could not be read, so every test runs" } };
  }
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function runClassify(ctx: CliContext, opts: Record<string, unknown>): CommandResult {
  const listed = opts["paths"] as string[] | undefined;
  const ref = opts["base"] as string | undefined;
  const classified = classify(ctx.app.runtime.cwd, listed, ref);
  if ("failed" in classified) {
    // The ref is the caller's bytes: sanitised for the terminal and the JSON alike, as scan's failure is.
    const reason = sanitizeLabel(classified.failed);
    ctx.io.err(`classify failed: ${reason}\n`);
    return { exitCode: 1, json: { subcommand: CLASSIFY, base: null, reason } };
  }
  const { base } = classified;
  const result = applyNameFloor(classified.result);
  const tests = selectFor(classified.tests, result);

  // Paths, rules and refs are the caller's or the repository's bytes: sanitised
  // where they meet the terminal and, the same way, in the JSON an agent reads
  // (review/10). `base` is a validated object id or null, so it carries none.
  const lines = [
    `class: ${result.class}`,
    `checks: ${list(result.checks)}`,
    `lenses: ${list(result.lenses)}`,
    sanitizeLabel(`tests: ${tests.full ? "all" : list(tests.files)} (${tests.reason})`),
    `reason: ${sanitizeLabel(result.reason)}`,
    ...result.byPath.map((entry) => sanitizeLabel(`  ${entry.path}  ${entry.class}  (${entry.rule})`)),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);

  return {
    exitCode: 0,
    json: {
      subcommand: CLASSIFY,
      base,
      paths: result.byPath.map((entry) => sanitizeLabel(entry.path)),
      class: result.class,
      checks: result.checks,
      lenses: result.lenses,
      reason: sanitizeLabel(result.reason),
      byPath: result.byPath.map((entry) => ({
        path: sanitizeLabel(entry.path),
        class: entry.class,
        rule: sanitizeLabel(entry.rule),
      })),
      tests: { full: tests.full, files: tests.files.map((file) => sanitizeLabel(file)), reason: sanitizeLabel(tests.reason) },
    },
  };
}

/**
 * What the scan read: no base and only the uncommitted change, or everything
 * since a base (plan/56); or, for a push (build/94), the commits since a base
 * alone, the work tree and the index left out.
 */
type ScanScope = "uncommitted" | "since-base" | "pushed";

/** The scan of one run: its hits and what the read could not show, or why the change could not be read. */
type ScanOutcome =
  | {
      base: string | null;
      scope: ScanScope;
      hits: ScanHit[];
      scanned: number;
      skipped: string[];
      outside: number;
      unscanned: string[];
      /** Why the scan is incomplete: the added lines past its hard cap, named (review/135). */
      incomplete?: string;
    }
  | { base: string | null; scope: ScanScope; failed: string };

/** A commit is named in a hit by this many characters of its id. */
const SHORT_COMMIT = 12;

/** What the history since a base adds to the scan: each commit's added lines, and the files no read could show. */
interface HistoryLines {
  files: ScanFile[];
  skipped: string[];
  unscanned: string[];
  /** Top-level-relative names outside the project the read met. */
  outside: Set<string>;
}

/**
 * The added lines of one `diff-tree` read (`revs`: a commit against its
 * parent, or two commits), into `into`, each file under `commit` when one is
 * given. Two reads through the same runner and bounds, with the line read's
 * pins (`--text`, no external diff, colour or textconv, fixed prefixes), its
 * sections named by the `-z` name list. A file whose added lines hold a NUL is
 * named, never read, unless it is UTF-16 at the last of `revs`, which is read
 * whole from that commit's blob (review/98, build/98).
 */
function readTreeDiff(
  runner: GitRunner,
  root: ProjectRoot,
  revs: readonly string[],
  commit: string | undefined,
  windows: boolean,
  into: HistoryLines,
): void {
  const inside = insideOf(root.prefix, windows);
  const away = awayFrom(root.prefix);
  const pins = ["-r", "--root", "--no-commit-id", "-M", ...DIFF_PINS];
  const { sections } = parseNameStatus(
    runGit(runner, root.dir, "diff-tree --name-status", ["diff-tree", ...pins, "--name-status", "-z", ...revs, "--"]),
  );
  const patch = runGit(runner, root.dir, "diff-tree --text", [
    "-c",
    "core.quotePath=false",
    "diff-tree",
    ...pins,
    "-p",
    "-U0",
    "--text",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--inter-hunk-context=0",
    "--submodule=short",
    ...revs,
    "--",
  ]);
  parsePatch(patch, sections).forEach((section, index) => {
    const name = sections[index]?.to ?? "";
    const path = inside(name);
    if (path === null) into.outside.add(name);
    const shown = path ?? away(name);
    const added = section.hunks.flatMap((hunk) => hunk.added);
    if (section.unshown || holdsNul(added.map((line) => line.text))) {
      // A UTF-16 file is scanned whole from the commit the read ends at, as the work-tree read scans one (review/98, build/98).
      const text = section.deleted ? undefined : blobUtf16(runner, root, revs.at(-1) ?? "HEAD", name);
      if (text !== undefined) into.files.push({ ...wholeFile(shown, text), ...(commit === undefined ? {} : { commit }) });
      else (hasCodeExtension(shown) ? into.unscanned : into.skipped).push(shown);
    } else if (added.length > 0) into.files.push({ path: shown, ...(commit === undefined ? {} : { commit }), added });
  });
}

/**
 * The added lines of every commit since `base`, merges left out, oldest first
 * (review/112): a value committed and removed again before the scan stays in
 * the history a push sends. Each commit is one {@link readTreeDiff}. With
 * `remoteTips` (the pushed scope), every commit none of those commits reaches is
 * read too (`HEAD` and a `^<tip>` per tip on stdin, pr/49; `--ignore-missing` for
 * a tip this clone lacks; review/160, build/108, pr/46): a push to `origin` sends those below `base` as
 * well. The tips are origin's own branches and tags as the remote answers
 * (`run`'s `git ls-remote origin`), never a remote-tracking ref, which a run can
 * write and an empty or unfetched remote lacks; an empty list reads all of
 * `HEAD`'s history. This read makes no network call.
 */
function readHistory(runner: GitInputRunner, root: ProjectRoot, base: string, windows: boolean, remoteTips?: readonly string[]): HistoryLines {
  const revList = (range: readonly string[], input?: string): string[] =>
    runGit(runner, root.dir, "rev-list", ["rev-list", "--reverse", "--no-merges", ...range, "--"], input)
      .split("\n")
      .filter((line) => line !== "");
  const since = revList([`${base}..HEAD`]);
  const unpushed = remoteTips === undefined ? [] : revList(["--ignore-missing", "--stdin"], revisionLines(remoteTips));
  const commits = [...new Set([...unpushed, ...since])];
  const history: HistoryLines = { files: [], skipped: [], unscanned: [], outside: new Set() };
  for (const commit of commits) readTreeDiff(runner, root, [commit], commit.slice(0, SHORT_COMMIT), windows, history);
  return history;
}

/**
 * The pushed scope's current side (build/94): `HEAD`'s committed tree against
 * `base`, one {@link readTreeDiff}, in place of the work tree and the index.
 * The net read keeps a merge's own resolution in the scan, which the history
 * (merges left out) does not read, and decodes a UTF-16 file at `HEAD` whole.
 * Exported for `run`'s inferred prerequisites, read from what the push carries
 * (review/161); a failed read throws.
 */
export function readPushed(runner: GitRunner, root: ProjectRoot, base: string, windows: boolean): HistoryLines {
  const net: HistoryLines = { files: [], skipped: [], unscanned: [], outside: new Set() };
  readTreeDiff(runner, root, [base, "HEAD"], undefined, windows, net);
  return net;
}

/**
 * The added lines of the change, read as `classify` reads them ({@link
 * readChange}, from {@link findProjectRoot}), with the lines only the scan
 * reads (outside the project, UTF-16), through the secret scan. With a base,
 * the added lines of every commit since it are read too ({@link readHistory}),
 * less those the change still adds to the same file, each hit naming its
 * commit. Every git failure, a failed line or history read and a base that
 * does not resolve are a `failed` outcome, never a clean one.
 *
 * `{ scope: "pushed" }` (build/94, `run checkpoint`'s scan) reads what a push
 * of `HEAD` sends and nothing else: `HEAD`'s tree against the base ({@link
 * readPushed}) stands in for the change, so an uncommitted or untracked file
 * the push leaves behind is not read, and the history read covers every commit
 * `origin` lacks, those below the base included (review/160, build/108): every
 * commit none of `remoteTips` reaches, the commits origin's branches and tags
 * name as the caller read them from the remote (pr/46). No tips, or none
 * given, reads all of `HEAD`'s history. It needs a base; without one it fails.
 */
export function scanChange(cwd: string, ref: string | undefined, options: { scope?: "pushed"; remoteTips?: readonly string[] } = {}): ScanOutcome {
  const pushed = options.scope === "pushed";
  const scope: ScanScope = pushed ? "pushed" : ref === undefined ? "uncommitted" : "since-base";
  if (pushed && ref === undefined) return { base: null, scope, failed: "the pushed scope reads the commits since a base, and none was given" };
  const runner = gitCheckRunner({ timeoutMs: GATE_GIT_TIMEOUT_MS, maxBuffer: GATE_GIT_MAX_BUFFER });
  try {
    const cwdPrefix = readCwdPrefix(runner, cwd);
    const commit = ref === undefined ? null : resolveBase(runner, cwd, ref);
    if (ref !== undefined && commit === null) {
      return { base: null, scope, failed: `the base ${ref} does not resolve to a commit here` };
    }
    const treeish = commit ?? "HEAD";
    const root = findProjectRoot(runner, cwd, cwdPrefix, treeish);
    const windows = process.platform === "win32";
    // The change's side: the work tree and the index, or under the pushed scope HEAD's tree alone (build/94).
    let current: ScanFile[];
    let side: { skipped: string[]; outside: number; unscanned: string[] };
    if (pushed && commit !== null) {
      let net: HistoryLines;
      try {
        net = readPushed(runner, root, commit, windows);
      } catch (err) {
        if (!(err instanceof GitReadError) && !(err instanceof PatchError)) throw err;
        const why = err instanceof GitReadError ? describeGitFailure(err) : err.message;
        return { base: commit, scope, failed: `the committed change could not be read (${why})` };
      }
      current = net.files;
      side = { skipped: net.skipped, outside: net.outside.size, unscanned: net.unscanned };
    } else {
      const { lines } = readChange(runner, root, treeish, windows);
      if ("failed" in lines) return { base: commit, scope, failed: `the changed lines could not be read (${lines.failed})` };
      current = [...lines.hunks, ...lines.scan.hunks];
      side = lines.scan;
    }
    let history: HistoryLines = { files: [], skipped: [], unscanned: [], outside: new Set() };
    try {
      if (commit !== null) history = readHistory(runner, root, commit, windows, pushed ? (options.remoteTips ?? []) : undefined);
    } catch (err) {
      if (!(err instanceof GitReadError) && !(err instanceof PatchError)) throw err;
      const why = err instanceof GitReadError ? describeGitFailure(err) : err.message;
      return { base: commit, scope, failed: `the commits since the base could not be read (${why})` };
    }
    // A line the change still adds to that file is reported once, from the change.
    const added = new Set(current.flatMap((file) => file.added.map((line) => `${file.path}\0${line.text}`)));
    const past = history.files.flatMap((file): ScanFile[] => {
      const left = file.added.filter((line) => !added.has(`${file.path}\0${line.text}`));
      return left.length === 0 ? [] : [{ ...file, added: left }];
    });
    const files = [...current, ...past];
    // review/135: a line past the hard cap is not read, so the scan is incomplete, never clean.
    const unread = linesPastCap(files).map((at) => `${at.path}:${at.line}${at.commit === undefined ? "" : ` (commit ${at.commit})`}`);
    const one = unread.length === 1;
    return {
      ...(unread.length === 0
        ? {}
        : {
            incomplete: `${unread.length} added line${one ? "" : "s"} longer than ${SCAN_LINE_MAX_CHARS} characters ${one ? "was" : "were"} not scanned: ${unread.join(", ")}`,
          }),
      base: commit,
      scope,
      hits: scanAddedLines(files),
      scanned: new Set(files.map((file) => file.path)).size,
      skipped: [...new Set([...side.skipped, ...history.skipped])],
      outside: side.outside,
      unscanned: [...new Set([...side.unscanned, ...history.unscanned])],
    };
  } catch (err) {
    if (!(err instanceof GitReadError)) throw err;
    return { base: null, scope, failed: describeGitFailure(err) };
  }
}

function runScan(ctx: CliContext, opts: Record<string, unknown>): CommandResult {
  const outcome = scanChange(ctx.app.runtime.cwd, opts["base"] as string | undefined);
  const { base, scope } = outcome;
  const scopeLine = scope === "uncommitted" ? "scope: uncommitted (no base given: committed work is not scanned)" : `scope: since-base ${base ?? ""}`;
  if ("failed" in outcome) {
    // Paths and refs are the caller's or the repository's bytes: sanitised for the terminal and the JSON alike.
    const reason = sanitizeLabel(outcome.failed);
    ctx.io.err(`${scopeLine}\nscan failed: ${reason}\n`);
    return { exitCode: 1, json: { subcommand: SCAN, base, scope, reason } };
  }
  const hits = outcome.hits.map((hit) => ({ ...hit, path: sanitizeLabel(hit.path) }));
  const skipped = outcome.skipped.map((path) => sanitizeLabel(path));
  const unscanned = outcome.unscanned.map((path) => sanitizeLabel(path));
  const incomplete = outcome.incomplete === undefined ? undefined : sanitizeLabel(outcome.incomplete);
  if (incomplete !== undefined) ctx.io.err(`scan incomplete: ${incomplete}\n`);
  ctx.io.out(
    `${[
      scopeLine,
      `hits: ${hits.length === 0 ? "none" : String(hits.length)}`,
      ...hits.map((hit) => `  ${hit.path}:${hit.line}${hit.commit === undefined ? "" : ` (commit ${hit.commit})`}  ${hit.rule}`),
      `scanned: ${outcome.scanned}; outside the project: ${outcome.outside}`,
      `skipped: ${list(skipped)}`,
      `unscanned: ${list(unscanned)}`,
    ].join("\n")}\n`,
  );
  return {
    exitCode: hits.length === 0 && incomplete === undefined ? 0 : 1,
    json: {
      subcommand: SCAN,
      base,
      scope,
      hits,
      scanned: outcome.scanned,
      skipped,
      outside: outcome.outside,
      unscanned,
      ...(incomplete === undefined ? {} : { reason: incomplete }),
    },
  };
}

/** What `scan --text` screens: the outbound texts an unattended run posts (REQ-FLOW-103). */
const TEXT_LABELS = ["pr-body", "morning", "reply", "comment"] as const;

/**
 * `scan --text <file> --label <label>`: the file read whole, as a regular file
 * within {@link MAX_USER_CONTENT_LENGTH}-many characters, through the outbound
 * screen. A file that cannot be read exits 1 naming it, never clean.
 */
function runTextScan(ctx: CliContext, file: string, label: string): CommandResult {
  const shown = sanitizeLabel(file);
  const cap = ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH;
  const path = resolve(ctx.app.runtime.cwd, file);
  // Up to four UTF-8 bytes a character, plus one to tell a full file from a longer one.
  const body = readRegular(path, cap * 4 + 1);
  let reason: string | undefined;
  if (body === undefined) {
    reason = existsSync(path) ? `${shown} is not a regular file the scan can read` : `${shown} does not exist`;
  } else if (body.length > cap * 4 || body.toString("utf8").length > cap) {
    reason = `${shown} is longer than ${cap} characters, so it was not scanned`;
  }
  if (body === undefined || reason !== undefined) {
    ctx.io.err(`scan failed: ${reason ?? shown}\n`);
    return { exitCode: 1, json: { subcommand: SCAN, label, reason } };
  }
  const screened = screenOutbound(body.toString("utf8"), label);
  const hits = screened.hits.map(({ line, rule }) => ({ label, line, rule }));
  ctx.io.out(
    `${[`text: ${label}`, `hits: ${hits.length === 0 ? "none" : String(hits.length)}`, ...hits.map((hit) => `  ${label}:${hit.line}  ${hit.rule}`)].join("\n")}\n`,
  );
  return { exitCode: screened.ok ? 0 : 1, json: { subcommand: SCAN, label, hits } };
}

/** `owner/repo#n`, as `--item` takes it, in GitHub's name alphabets; anything else exits 2. */
function parseItemRef(value: string): { owner: string; repo: string; number: number } {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/([A-Za-z0-9._-]{1,100})#([1-9][0-9]{0,8})$/.exec(value);
  if (match === null) throw new InvalidArgumentError("an item is owner/repo#<number>.");
  return { owner: match[1] ?? "", repo: match[2] ?? "", number: Number(match[3]) };
}

/** One `credential.helper` or `http.extraHeader` entry, in git's config order; `scope` is its key's URL, `null` generic. */
interface PushConfigEntry {
  kind: "helper" | "header";
  scope: string | null;
  /** `null` for a key with no value, which git refuses. */
  value: string | null;
}

/**
 * The variables through which the push's environment hands git configuration:
 * `-c` pairs, the `GIT_CONFIG_COUNT` key and value pairs, the global and
 * system file paths, and `GIT_CONFIG_NOSYSTEM`.
 */
const CONFIG_VARIABLES = /^GIT_CONFIG_(?:PARAMETERS|COUNT|KEY_[0-9]+|VALUE_[0-9]+|GLOBAL|SYSTEM|NOSYSTEM)$/i;

/**
 * The config read runs the same hardened git as {@link gitCheckRunner}, with
 * every `GIT_*` variable dropped and `GIT_OPTIONAL_LOCKS=0`. The difference is
 * that it puts back the {@link CONFIG_VARIABLES} the push's environment `env`
 * sets, so git reads the configuration the push would apply, whatever
 * variables supply it.
 */
function pushConfigRunner(env: Readonly<Record<string, string | undefined>>): GitRunner {
  return (args, cwd) => {
    if (gitDiscoveryMeetsBareShape(cwd)) {
      throw Object.assign(new Error(bareShapeRefusal(cwd)), { status: 128, keptFromGit: true });
    }
    const childEnv: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!/^GIT_/i.test(key)) childEnv[key] = value;
    }
    for (const [key, value] of Object.entries(env)) {
      if (CONFIG_VARIABLES.test(key) && value !== undefined) childEnv[key] = value;
    }
    childEnv["GIT_OPTIONAL_LOCKS"] = "0";
    const pinned = ["-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", ...args];
    const git = gitProgramFor(cwd, childEnv);
    if (git === null) throw programNotFound("git", "spawnSync", pinned);
    return execFileSync(git, pinned, { cwd, env: childEnv, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000, windowsHide: true });
  };
}

/** Every helper and extra-header entry git's config holds, or `null` when the read fails. */
function readPushConfig(runner: GitRunner, cwd: string): PushConfigEntry[] | null {
  let output: string;
  try {
    output = runner(["config", "-z", "--get-regexp", "^(credential|http)\\."], cwd);
  } catch (err) {
    // `--get-regexp` exits 1 when no key matches.
    return gitSaidNo(err, 1) ? [] : null;
  }
  const entries: PushConfigEntry[] = [];
  for (const record of output.split("\0")) {
    const newline = record.indexOf("\n");
    // git prints the section and the variable name lowercased, the subsection as written.
    const key = newline === -1 ? record : record.slice(0, newline);
    const value = newline === -1 ? null : record.slice(newline + 1);
    const lower = key.toLowerCase();
    const kind = lower.startsWith("credential.") && lower.endsWith(".helper") ? "helper" : lower.startsWith("http.") && lower.endsWith(".extraheader") ? "header" : null;
    if (kind === null) continue;
    const [section, variable] = kind === "helper" ? ["credential.", ".helper"] : ["http.", ".extraheader"];
    const scope = lower === `${section.slice(0, -1)}${variable}` ? null : key.slice(section.length, key.length - variable.length);
    entries.push({ kind, scope, value });
  }
  return entries;
}

/** A URL as git's URL matching reads it, or `null` for a shape whose normalisation this read does not model. */
interface UrlParts {
  scheme: string;
  user: string | null;
  host: string;
  port: string;
  path: string;
}

const URL_SHAPE = /^([a-z][a-z0-9+.-]*):\/\/(?:([^@/?#]*)@)?([^@/?#:]+)(?::([0-9]{0,5}))?(\/[^?#]*)?$/i;
const DEFAULT_PORTS: Readonly<Record<string, string>> = { http: "80", https: "443" };

function urlParts(url: string): UrlParts | null {
  const match = URL_SHAPE.exec(url.trim());
  // Percent-escapes, `*` host wildcards, backslashes and `//` are normalised by git in ways not modelled here.
  if (match === null || /[%*\\\s]/.test(url.trim()) || (match[5] ?? "").includes("//")) return null;
  const segments = (match[5] ?? "").split("/").filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const scheme = (match[1] ?? "").toLowerCase();
  const port = match[4] === undefined || match[4] === "" ? (DEFAULT_PORTS[scheme] ?? "") : String(Number(match[4]));
  const user = match[2] === undefined ? null : (match[2].split(":", 1)[0] ?? "");
  return { scheme, user, host: (match[3] ?? "").toLowerCase(), port, path: segments.join("/") };
}

/**
 * Whether a key scoped to `scope` applies to `target`, as git's URL matching
 * decides it: scheme, host and port equal, the scope's user (when it names
 * one) the target's, and the scope's path a prefix of the target's at a `/`.
 * `null` when either cannot be placed.
 */
function scopeApplies(scope: string, target: UrlParts | null): boolean | null {
  const pattern = urlParts(scope);
  if (pattern === null || target === null) return null;
  return (
    pattern.scheme === target.scheme &&
    (pattern.user === null || pattern.user === target.user) &&
    pattern.host === target.host &&
    pattern.port === target.port &&
    (pattern.path === "" || target.path === pattern.path || target.path.startsWith(`${pattern.path}/`))
  );
}

/** An extra header that sends a credential of its own. */
const AUTHORIZATION_HEADER = /^\s*authorization\s*:/i;

/**
 * How specific an `http.*` key that applies is, as git's URL matching ranks
 * it: a URL-scoped key over the generic one, then the longer path, then a
 * named user. Every placed scope that applies names the target's own host, so
 * the host match is the same length for each.
 */
function headerSpecificity(scope: string | null): readonly [number, number, number] {
  const pattern = scope === null ? null : urlParts(scope);
  return pattern === null ? [0, 0, 0] : [1, pattern.path.length, pattern.user === null ? 0 : 1];
}

/** Whether `a` ranks at least as specific as `b`: git applies such an entry and skips a less specific one. */
function atLeastAsSpecific(a: readonly number[], b: readonly number[]): boolean {
  const at = a.findIndex((value, index) => value !== b[index]);
  return at === -1 || (a[at] ?? 0) > (b[at] ?? 0);
}

/**
 * The facts git applies to one push URL: the helper list built in config
 * order, an empty value resetting it, `null` once an entry that may apply
 * cannot be placed (until a reset that surely applies); and whether any
 * Authorization header may apply, over-read on purpose: an entry whose reach
 * cannot be placed counts, and so does one git's specificity rule would drop.
 * An empty header value resets the header list, as git does, only when it
 * surely applies and ranks at least as specific as every header entry before
 * it; git skips a less specific one, so it then resets nothing here either.
 */
function pushUrlFacts(url: string, config: readonly PushConfigEntry[] | null): PushUrlFacts {
  // A config read that failed proves nothing about the URL: no header was read, so
  // none is reported, and the decision refuses on `configUnreadable` (build/73).
  if (config === null) return { url, helpers: null, authorizationHeader: false, configUnreadable: true };
  const target = urlParts(url);
  let helpers: string[] | null = [];
  let authorizationHeader = false;
  // The most specific header entry git may have applied so far; `null` once one cannot be placed.
  let headerBest: readonly number[] | null = [-1, -1, -1];
  for (const entry of config) {
    const applies = entry.scope === null ? true : scopeApplies(entry.scope, target);
    if (applies === false) continue;
    if (entry.kind === "header") {
      const rank = applies === true ? headerSpecificity(entry.scope) : null;
      if (entry.value === "" && rank !== null && headerBest !== null && atLeastAsSpecific(rank, headerBest)) {
        authorizationHeader = false;
      } else if (entry.value !== null && AUTHORIZATION_HEADER.test(entry.value)) {
        authorizationHeader = true;
      }
      headerBest = rank === null || headerBest === null ? null : atLeastAsSpecific(rank, headerBest) ? rank : headerBest;
    } else if (entry.value === "") {
      helpers = applies ? [] : null;
    } else {
      helpers = entry.value === null || applies === null || helpers === null ? null : [...helpers, entry.value];
    }
  }
  return { url, helpers, authorizationHeader, configUnreadable: false };
}

/**
 * How `git push origin` pushes from `cwd`, as raw facts for
 * `../../runs/preflight.ts` to decide on, read through the hardened read
 * runner: origin's fetch URL, and every push URL with its helper list and
 * Authorization-header fact. Git's configuration, origin's URLs with it, is
 * read through git in the push's environment ({@link pushConfigRunner}), so
 * config that `env` supplies through a `GIT_CONFIG_*` variable (a `pushurl`,
 * an `insteadOf` or `pushInsteadOf` rewrite) is read like any other config.
 */
export function readPushIdentity(cwd: string, env: Readonly<Record<string, string | undefined>>): PreflightDeps["pushIdentity"] {
  const config = readPushConfig(pushConfigRunner(env), cwd);
  // A configuration git cannot read fails the URL reads in that environment too. Without it the URLs
  // are read only so each one is refused by that reason (build/73), never as a missing origin: every
  // fact then carries `configUnreadable`, which no push URL passes.
  const runner = config === null ? gitCheckRunner() : pushConfigRunner(env);
  const lines = (args: readonly string[]): string[] | null => {
    try {
      return runner(args, cwd).split(/\r?\n/).filter((line) => line !== "");
    } catch {
      // No origin (exit 2) or a failed read: nothing is proven, which the decision refuses.
      return null;
    }
  };
  const fetchUrl = lines(["remote", "get-url", "origin"])?.[0] ?? null;
  const pushed = lines(["remote", "get-url", "--push", "--all", "origin"]) ?? [];
  return { fetchUrl, pushUrls: pushed.map((url) => pushUrlFacts(url, config)) };
}

/**
 * The `gh` the REST runner would start, by the runner's own search
 * (`../engine/ghRunner.ts`): its path and the file it resolves to, or `null`
 * where no accepted `PATH` entry holds one.
 */
function ghFound(cwd: string, env: NodeJS.ProcessEnv): PreflightDeps["gh"] {
  const platform = process.platform;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  const path = searchPathOf(env, platform)
    ?.split(delimiter)
    .filter((entry) => !isNodeModulesBin(entry, windows))
    .join(delimiter);
  const found = resolveProgramOnPath("gh", { platform, path, cwd, probe: fileSystemProbe });
  if (found === null) return null;
  let realPath: string | null;
  try {
    realPath = realpathSync(found);
  } catch {
    realPath = null;
  }
  return { path: found, realPath };
}

/** A small JSON file at `path`, read without following a link, or `undefined`. */
function readJson(path: string): unknown {
  const body = readRegular(path, 64 * 1024);
  if (body === undefined) return undefined;
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The `engines.node` range of the package.json at `path`: `undefined` when the file declares none,
 * `null` when the file, its `engines` or its `engines.node` cannot be read (the pre-flight refuses
 * `null`, review/142, where `undefined` passes).
 */
export function enginesOf(path: string): string | null | undefined {
  const parsed = readJson(path);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const engines = (parsed as { engines?: unknown }).engines;
  if (engines === undefined) return undefined;
  if (typeof engines !== "object" || engines === null || Array.isArray(engines)) return null;
  const node = (engines as { node?: unknown }).node;
  if (node === undefined) return undefined;
  return typeof node === "string" ? node : null;
}

/** The CLI's own `engines.node`, as npm enforces it (see {@link enginesOf}); `null` when its package root cannot be found. */
function enginesRange(): string | null | undefined {
  try {
    return enginesOf(join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "package.json"));
  } catch {
    return null;
  }
}

/** The emitted floor copies for the manifest's clients, each with whether its file is there. */
function floorCopies(root: string, manifest: SetupManifest | null): PreflightDeps["floors"] {
  if (manifest === null) return [];
  const floors: ReadonlySet<string> = new Set(REQUIRED_FLOORS);
  const clients: ReadonlySet<string> = new Set(manifest.tools);
  return manifest.ledger
    .filter((row) => row.artifactType === "rule" && floors.has(row.artifactId) && clients.has(row.adapter))
    .map((row) => {
      // A ledger path is repo-relative; one that leaves the root is never opened.
      const inside = !isAbsolute(row.path) && !row.path.split(/[\\/]/).includes("..");
      return { id: row.artifactId, path: row.path, exists: inside && isRegularFile(join(root, row.path)) };
    });
}

/**
 * The `usage: review r<N>` lines ({@link USAGE_REVIEW_PATTERN}) of the in-progress run on the branch `.git/HEAD`
 * names, the run the review gate rebuilds a missing counter from (REQ-FLOW-106); `0` with no such run, or no branch.
 * review/58: the record is read whole or not at all, as the review gate reads it, so one over
 * {@link REPORT_READ_MAX_BYTES}, or one there and unreadable, gives `null`, never a count of `0`.
 */
export function usageReviewLines(root: string, now: Date): number | null {
  const currentBranch = readCurrentBranch(root);
  if (currentBranch === null) return 0;
  const run = findCardRun(root, now, { currentBranch });
  if (run === null || run.closed) return 0;
  const path = join(root, runRelPath(run.runId, RECORD_FILE));
  const record = readRegular(path, REPORT_READ_MAX_BYTES, REPORT_READ_MAX_BYTES);
  if (record === undefined) return isRegularFile(path) ? null : 0;
  return record.toString("utf8").split(/\r?\n/).filter((line) => USAGE_REVIEW_PATTERN.test(line)).length;
}

/**
 * The client each session the detector names runs (`../../session/detect.ts`): a cloud marker means "cloud", never
 * "unattended" (REQ-FLOW-089). CI and a local session name none, and fall back to Claude Code's local `CLAUDECODE`.
 */
const SESSION_CLIENT: Readonly<Record<SessionKind, string | null>> = {
  "claude-cloud": "claude",
  "copilot-cloud": "copilot",
  "cursor-agent": "cursor",
  ci: null,
  local: null,
};

/** Whether Claude Code's local marker `CLAUDECODE` is set: not a session marker, so not the detector's. */
function setIn(env: Readonly<Record<string, string | undefined>>, name: string): boolean {
  const value = env[name]?.trim().toLowerCase() ?? "";
  return value !== "" && value !== "false" && value !== "0";
}

/**
 * The git surface (REQ-FLOW-131) the run verbs' git sees in `cwd`: the configuration through the write runner in its
 * unattended mode, the environment that runner starts git in, and the git program it resolves, so the pre-flight's
 * record and the run verbs' checks read one git.
 */
export function readRunGitSurface(cwd: string): Promise<GitSurface | { unreadable: string }> {
  const env = gitWriteEnv(process.env, { unattended: true });
  return readGitSurface((args) => gitWrite(cwd, args, { unattended: true }), env, gitProgramFor(cwd, env));
}

/** Where the surface's record lives for the work tree at `cwd`: under its own git directory; else why not. */
export async function gitSurfaceRecordPath(cwd: string): Promise<{ path: string; gitDir: string } | { unreadable: string }> {
  try {
    const read = await gitWrite(cwd, ["rev-parse", "--git-dir"], { unattended: true });
    const dir = read.stdout.replace(/\r?\n$/, "");
    if (read.code !== 0 || dir === "") return { unreadable: `git rev-parse --git-dir answered ${read.code}` };
    const gitDir = resolve(cwd, dir);
    return { path: join(gitDir, ...SURFACE_RECORD_FILE.split("/")), gitDir };
  } catch (cause) {
    return { unreadable: `git rev-parse --git-dir could not run (${cause instanceof Error ? cause.message : "no answer"})` };
  }
}

const GIT_RECORD_FIX = "run the pre-flight inside the run's work tree, with its git directory writable";

/**
 * review/36: the error code of a failed file call (`EACCES`, `ENOTDIR`, …), read through a wrapping error's `cause`,
 * never its message, which names the machine's path; `fallback` where none is found.
 */
function errorCode(cause: unknown, fallback: string): string {
  for (let at: unknown = cause, depth = 0; at !== null && typeof at === "object" && depth < 4; at = (at as { cause?: unknown }).cause, depth += 1) {
    const code = (at as { code?: unknown }).code;
    if (typeof code === "string" && /^E[A-Z0-9]+$/.test(code)) return code;
  }
  return fallback;
}

/**
 * review/97, review/33: the surface's record, written atomically, marked `refused` where the pre-flight refused, so
 * the refusal's own ending (`run end --refused`) still compares against it while no push verb takes it. A refusal
 * first removes any record an earlier pass left, so a refusal whose record cannot be written leaves no passing one
 * behind. The reason a record could not be written or removed, by error code alone (review/36), else `null`.
 */
async function recordGitSurface(ctx: CliContext, root: string, passed: boolean, now: Date): Promise<string | null> {
  const place = await gitSurfaceRecordPath(root);
  if ("unreadable" in place) return passed ? `the git directory could not be read (${place.unreadable})` : null;
  if (!passed) {
    try {
      rmSync(place.path, { force: true });
    } catch (cause) {
      return `an earlier record at ${SURFACE_RECORD_LABEL} could not be removed (${errorCode(cause, "remove failed")})`;
    }
  }
  const surface = await readRunGitSurface(root);
  if ("unreadable" in surface) return `configuration unreadable (${surface.unreadable})`;
  const record = surfaceRecord(surface, randomBytes(16).toString("hex"), now.toISOString(), !passed);
  try {
    await ctx.engine.merge.atomicWrite.atomicWriteFile(place.path, `${JSON.stringify(record)}\n`, { boundaryDir: place.gitDir, mode: 0o600 });
    return null;
  } catch (cause) {
    return `${SURFACE_RECORD_LABEL} could not be written (${errorCode(cause, "write failed")})`;
  }
}

/** Every client's guard copy, as the loosen gate lists them (`../engine/autonomyGate.ts`). */
const GUARD_COPIES: readonly string[] = [`${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`, ...TOOLS.map((tool) => `${HOOKS_GENERATED_DIR}/${tool}/${PERSON_ONLY_GUARD_FILE}`)];
/** Past this a guard copy is not one the engine wrote; it reads off. */
const GUARD_COPY_READ_MAX_BYTES = 1024 * 1024;

/**
 * Whether `autonomy.adminRuleProof` is on in every leg (REQ-FLOW-151): the default branch's manifest, `HEAD`'s, the work
 * tree's and each guard copy on disk. `readSetting` skips a leg that is not there, since `run land` only tightens on what
 * it finds; this pass stands on the legs, so a missing or unread one reads off, or a run could turn the key on with a
 * commit of its own on a default branch that holds no manifest. `run land`'s read is reused, so the two cannot drift.
 */
async function adminRuleProofInForce(root: string, repoPath: string, rest: RestRead): Promise<boolean> {
  const runner = gitCheckRunner({ timeoutMs: GATE_GIT_TIMEOUT_MS, maxBuffer: GATE_GIT_MAX_BUFFER });
  const gitLine = (args: readonly string[]): string | null => {
    try {
      return runner(args, root).replace(/\r?\n$/, "");
    } catch {
      return null;
    }
  };
  try {
    const about = await rest(repoPath);
    const branch = typeof about.json === "object" && about.json !== null ? (about.json as { default_branch?: unknown }).default_branch : undefined;
    if (about.status !== 200 || typeof branch !== "string" || branch === "") return false;
    const texts = await Promise.all(GUARD_COPIES.map((path) => readRegularFile(join(root, ...path.split("/")), GUARD_COPY_READ_MAX_BYTES)));
    const copies = texts.filter((text) => typeof text === "string");
    if (copies.length === 0 || texts.includes(undefined)) return false;
    let onDefaultBranch = false;
    let atHead = false;
    const setting = await readSetting(
      root,
      gitLine(["rev-parse", "--show-prefix"]) ?? "",
      repoPath,
      branch,
      (args) => {
        const text = gitLine(args);
        atHead = text !== null;
        return Promise.resolve(text);
      },
      async (path) => {
        const reply = await rest(path);
        onDefaultBranch = reply.status === 200;
        return reply;
      },
      readGuardLegs,
    );
    const strictest = strictestAutonomy(setting, ...copies.map((text) => guardCopySetting(text)));
    return onDefaultBranch && atHead && strictest.adminRuleProof === true;
  } catch {
    // A refused or failed read proves nothing: the administrator's refusal stands.
    return false;
  }
}

async function runPreflightVerb(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const root = ctx.app.runtime.cwd;
  const env = ctx.app.runtime.env;
  const now = ctx.app.runtime.clock.now();
  let manifest: SetupManifest | null = null;
  let manifestUnreadable = false;
  try {
    manifest = await ctx.engine.manifest.manifest.readManifest(root);
  } catch {
    // An unreadable manifest pins nothing and lists no floor, which the decision refuses, naming the manifest (review/203).
    manifestUnreadable = true;
  }
  const pushIdentity = readPushIdentity(root, env);
  const origin = pushIdentity.fetchUrl === null ? null : resolveRepo({ ...env }, pushIdentity.fetchUrl);
  const ghEnv: NodeJS.ProcessEnv = { ...env };
  const gh = ghFound(root, ghEnv);
  const rest: RestRead | null =
    origin === null || gh === null
      ? null
      : async (path) => {
          const reply = await ghApi({ method: "GET", path, hostname: origin.host }, { cwd: root, env: ghEnv });
          return { status: reply.status, json: reply.json };
        };
  const canary = readJson(join(root, PREFLIGHT_CANARY_FILE));
  const at = typeof canary === "object" && canary !== null ? (canary as { at?: unknown }).at : undefined;
  const item = opts["item"] as PreflightDeps["item"];
  const floors = floorCopies(root, manifest);
  const usage = usageReviewLines(root, now);
  // The work tree's key is one leg of several, so off there settles it and on there alone proves nothing.
  const adminRuleProof =
    manifest?.autonomy?.adminRuleProof === true && rest !== null && origin !== null && (await adminRuleProofInForce(root, `repos/${origin.owner}/${origin.repo}`, rest));
  const verdict = await runPreflight({
    env,
    nodeVersion: process.versions.node,
    engines: enginesRange(),
    pinnedVersion: manifest?.generatedBy,
    manifestUnreadable,
    runningVersion: ctx.app.version,
    scanRuns: () => Promise.resolve(!("failed" in scanChange(root, undefined))),
    rest,
    gh,
    repo: origin === null ? null : { owner: origin.owner, repo: origin.repo },
    ghRepoEnv: env["GH_REPO"] ?? null,
    canary: canary === undefined ? null : { at: typeof at === "string" ? at : "" },
    now,
    ...(item === undefined ? {} : { item }),
    adminRuleProof,
    floors,
    pushIdentity,
    reviewState: { counter: existsSync(join(root, REVIEW_GATE_STATE_FILE)), usageReviewLines: usage ?? 0, recordUnread: usage === null },
  });
  // review/97: the run verbs compare against this record, so a pass the record cannot follow is no pass; a refusal
  // records too, marked refused, for its own ending alone (review/33).
  const unrecorded = ctx.dryRun ? null : await recordGitSurface(ctx, root, verdict.ok, now);
  const ok = verdict.ok && unrecorded === null;
  const session = detectSession(env);
  const client = SESSION_CLIENT[session.kind] ?? (setIn(env, "CLAUDECODE") ? "claude" : null);
  const cloud = session.kind !== "local";
  const checks = verdict.checks.map((check) => ({ ...check, evidence: sanitizeLabel(check.evidence) }));
  const refusals: { id: string; reason: string; fix: string }[] = verdict.refusals.map((refusal) => ({ ...refusal, reason: sanitizeLabel(refusal.reason) }));
  if (unrecorded !== null) refusals.push({ id: "git-record", reason: sanitizeLabel(unrecorded), fix: GIT_RECORD_FIX });
  const recorded =
    ctx.dryRun ? "not written (--dry-run)"
    : unrecorded !== null ? "not written"
    : verdict.ok ? `written (${SURFACE_RECORD_LABEL})`
    : `written, marked refused (${SURFACE_RECORD_LABEL})`;
  const shownFloors = floors.map(({ id, path, exists }) => ({ id, path: sanitizeLabel(path), exists }));
  // `names` lists environment variable names, the one field here the caller's environment spells.
  const warnings = verdict.warnings.map((warning) =>
    warning.names === undefined ? warning : Object.assign(warning, { names: warning.names.map((name) => sanitizeLabel(name)) }),
  );
  ctx.io.out(
    `${[
      "mode: unattended",
      `pre-flight: ${ok ? "passed" : "refused"}`,
      ...checks.map((check) => `  ${check.id}  ${check.state}  ${check.evidence}`),
      `git record: ${recorded}`,
      ...refusals.map((refusal) => `refused: ${refusal.id}: ${refusal.reason} (fix: ${refusal.fix})`),
      ...warnings.map((warning) => `warning: ${warning.id}${warning.names === undefined ? "" : `: ${warning.names.join(", ")}`}${warning.reason === undefined ? "" : `: ${warning.reason}`}`),
    ].join("\n")}\n`,
  );
  return {
    exitCode: ok ? 0 : 1,
    json: { subcommand: PREFLIGHT, mode: "unattended", client, cloud, checks, refusals, warnings, floors: shownFloors, gitRecord: ok && !ctx.dryRun },
  };
}

/** The options each subcommand takes; any other one given is a usage error, exit 2, before anything is read. */
const SUBCOMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  [CLASSIFY]: ["base", "paths"],
  [SCAN]: ["base", "text", "label"],
  [PREFLIGHT]: ["unattended", "item"],
};

const OPTION_FLAGS: Readonly<Record<string, string>> = {
  base: "--base",
  paths: "--paths",
  unattended: "--unattended",
  item: "--item",
  text: "--text",
  label: "--label",
};

export const gateCommand: CommandModule = {
  name: "gate",
  summary: "classify a change, scan its added lines or an outbound text for secrets, or check an unattended start (plumbing)",
  hidden: true,
  // review/97: `preflight` writes the git surface's record on a pass, so the verb takes `--dry-run`.
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which gate action to run").choices([CLASSIFY, SCAN, PREFLIGHT]))
      .addOption(
        new Option("--base <ref>", "the base the change is read against (default: HEAD, reported as no base)").argParser(
          parseBaseRef,
        ),
      )
      .option("--paths <path...>", "classify these paths by path rules instead of reading the change from git")
      .option("--text <file>", "scan this outbound text file instead of the change (with --label)")
      .addOption(new Option("--label <label>", "what the --text file is").choices([...TEXT_LABELS]))
      .option("--unattended", "preflight: check that an unattended run may start here, the one mode it checks")
      .addOption(
        new Option("--item <owner/repo#n>", "preflight: the board item or issue the run takes as input").argParser(parseItemRef),
      )
      // Usage errors, so exit 2 before the action and before git runs.
      .hook("preAction", (command) => {
        const subcommand = String(command.processedArgs[0]);
        const given = command.opts();
        if (subcommand === SCAN && given["paths"] !== undefined) {
          command.error("error: --paths applies to classify only; scan reads the change from git", { exitCode: 2 });
        }
        const allowed = SUBCOMMAND_OPTIONS[subcommand] ?? [];
        const stray = Object.keys(OPTION_FLAGS).find((key) => given[key] !== undefined && !allowed.includes(key));
        if (stray !== undefined) command.error(`error: ${OPTION_FLAGS[stray] ?? stray} does not apply to ${subcommand}`, { exitCode: 2 });
        if ((given["text"] === undefined) !== (given["label"] === undefined)) {
          command.error("error: --text and --label go together", { exitCode: 2 });
        }
        if (given["text"] !== undefined && given["base"] !== undefined) {
          command.error("error: --text scans one file, so --base does not apply", { exitCode: 2 });
        }
        // review/97: classify and scan write nothing, so a dry run of either says nothing; only preflight takes it.
        if (given["dryRun"] === true && subcommand !== PREFLIGHT) {
          command.error(`error: --dry-run applies to preflight only; ${subcommand} writes nothing`, { exitCode: 2 });
        }
        if (subcommand === PREFLIGHT && given["unattended"] !== true) {
          command.error("error: preflight checks an unattended start only; pass --unattended", { exitCode: 2 });
        }
      });
  },

  run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    if (args[0] === PREFLIGHT) return runPreflightVerb(ctx, opts);
    if (args[0] === SCAN && typeof opts["text"] === "string") {
      return Promise.resolve(runTextScan(ctx, opts["text"], String(opts["label"])));
    }
    return Promise.resolve(args[0] === SCAN ? runScan(ctx, opts) : runClassify(ctx, opts));
  },
};

/** The pointer a reason gives for committed work no base classified (review/191). */
const POINT_TO_BASE = "pass --base <the commit the work started from> to classify it";

/** A ref's name as a person reads it: `refs/remotes/` or `refs/heads/` dropped. */
function shortRef(ref: string): string {
  return ref.replace(/^refs\/(?:remotes|heads)\//, "");
}

/**
 * review/191 (signed off as option (b)): with no `--base` the read sees only
 * the uncommitted change against `HEAD`, so work already committed would be
 * classified by no run. The reference is the branch's upstream, or, with none
 * configured (a detached `HEAD` among them), every remote-tracking ref
 * (review/197); a repository with no remote-tracking ref keeps the plain
 * reading (`undefined`). A dangling remote `HEAD` symref is one of those refs,
 * never "no reference" (review/196).
 * When `HEAD` holds commits the reference lacks, the clause names them and
 * points to `--base`, and the class is raised to at least `product`. A
 * configured upstream that does not resolve, and any failed read here, raise it
 * too: this read only ever raises, never lowers.
 */
function unclassifiedCommits(runner: GitRunner, cwd: string): string | undefined {
  let reference = "its upstream";
  try {
    let branch: string | null = null;
    try {
      branch = runner(["symbolic-ref", "-q", "HEAD"], cwd).trim();
    } catch (err) {
      // `-q` exits 1, printing nothing, for a detached HEAD: it has no upstream.
      if (!gitSaidNo(err, 1)) throw new GitReadError("symbolic-ref", err, cwd);
    }
    let upstream = "";
    if (branch !== null && branch !== "") {
      const rows = runGit(runner, cwd, "for-each-ref", ["for-each-ref", "--format=%(refname)%00%(upstream)", branch]);
      for (const row of rows.split(/\r?\n/)) {
        const [name, merge] = row.split("\0");
        if (name === branch && merge !== undefined) upstream = merge;
      }
    }
    let range: string[];
    if (upstream !== "") {
      reference = shortRef(upstream);
      const commit = resolveBase(runner, cwd, upstream);
      if (commit === null) {
        return `its upstream ${reference} does not resolve, so the committed work HEAD holds could not be read and the class is at least product; ${POINT_TO_BASE}`;
      }
      range = [`${commit}..HEAD`];
    } else {
      reference = "every remote-tracking ref";
      if (!hasRemoteTrackingRef(runner, cwd)) return undefined;
      // `--remotes` skips a dangling symref and reads every live remote-tracking branch.
      range = ["HEAD", "--not", "--remotes"];
    }
    const count = Number.parseInt(runGit(runner, cwd, "rev-list", ["rev-list", "--count", ...range, "--"]).trim(), 10);
    if (!Number.isInteger(count)) throw new GitReadError("rev-list", new Error("no count"), cwd);
    if (count === 0) return undefined;
    const commits = `${count} commit${count === 1 ? "" : "s"}`;
    return `HEAD holds ${commits} ${reference} lacks, committed work no base classified, so the class is at least product; ${POINT_TO_BASE}`;
  } catch (err) {
    if (!(err instanceof GitReadError)) throw err;
    return `the commits HEAD holds beyond ${reference} could not be read (${describeGitFailure(err)}), so the class is at least product; ${POINT_TO_BASE}`;
  }
}

/**
 * Whether the repository holds any remote-tracking ref (review/197). `for-each-ref` leaves out a symref whose target
 * is gone, so with none listed each remote's `HEAD` symref is asked for too: a dangling one still counts (review/196).
 * A failed read throws {@link GitReadError}, which the caller raises on.
 */
function hasRemoteTrackingRef(runner: GitRunner, cwd: string): boolean {
  const refs = runGit(runner, cwd, "for-each-ref", ["for-each-ref", "--count=1", "--format=%(refname)", "refs/remotes"]);
  if (refs.trim() !== "") return true;
  const remotes = runGit(runner, cwd, "remote", ["remote"]).split(/\r?\n/).filter((name) => name !== "");
  return remotes.some((name) => {
    try {
      runner(["symbolic-ref", "-q", `refs/remotes/${name}/HEAD`], cwd);
      return true;
    } catch (err) {
      // `-q` exits 1, printing nothing, when the name is no symref.
      if (gitSaidNo(err, 1)) return false;
      throw new GitReadError("symbolic-ref", err, cwd);
    }
  });
}

/**
 * `result` raised to at least `product`, the clause of {@link unclassifiedCommits} added, when no base was given and
 * that read finds committed work no run classified; a resolved base, or no such work, leaves it as it is (review/191).
 */
function floorUnclassified(runner: GitRunner, cwd: string, commit: string | null, result: ClassifyResult): ClassifyResult {
  const unread = commit === null ? unclassifiedCommits(runner, cwd) : undefined;
  return unread === undefined ? result : withReasons(raiseTo(result, "product"), [unread]);
}
