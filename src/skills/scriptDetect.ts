/**
 * Whether a fetched skill carries scripts (REQ-FLOW-180): a skill from a trusted source is copied in only as text
 * unless the source's entry allows scripts, so this reads each file for four signals and names every one it finds.
 *
 * The four signals are a union, and each reads failing closed: a folder named `scripts` in any case, with the trailing
 * dots and spaces Windows drops; git mode `100755`, and any mode that is not a plain file's; a first line starting
 * `#!`, behind a byte-order mark or leading blanks; and a code extension in any case. One signal is enough to refuse.
 *
 * Pure: no filesystem, no git, no internal import. The fetch reads the rows from the pinned tree.
 */

/** One file of a fetched skill: its path inside the skill, its git mode as `git ls-tree` prints it, its first bytes. */
export interface ScriptScanFile {
  readonly path: string;
  readonly mode: string;
  readonly head: string;
}

/** The extensions of files a shell, an interpreter or a loader runs, lower-case, each with its dot. */
export const CODE_EXTENSIONS: readonly string[] = [
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".psm1",
  ".bat",
  ".cmd",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".rb",
  ".pl",
  ".php",
  ".lua",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".jar",
  ".wasm",
];

/** A plain file's git mode; the executable one is named on its own, every other mode fails closed. */
const PLAIN_MODE = "100644";
const EXECUTABLE_MODE = "100755";

/** A path segment as Windows opens it: trailing dots and spaces dropped, case folded. */
function windowsName(segment: string): string {
  return segment.replace(/[. ]+$/, "").toLowerCase();
}

/** The reasons one file carries, in a fixed order: folder, mode, first line, extension. */
function fileReasons(file: ScriptScanFile): string[] {
  const reasons: string[] = [];
  const segments = file.path.split(/[\\/]/);
  const name = windowsName(segments.at(-1) ?? "");
  if (segments.slice(0, -1).some((segment) => windowsName(segment) === "scripts")) reasons.push("under a scripts/ folder");
  if (file.mode === EXECUTABLE_MODE) reasons.push(`executable (git mode ${EXECUTABLE_MODE})`);
  else if (file.mode !== PLAIN_MODE) reasons.push(`not a plain file (git mode ${/^\d+$/.test(file.mode) ? file.mode : JSON.stringify(file.mode)})`);
  const firstLine = file.head.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (/^[ \t]*#!/.test(firstLine)) reasons.push("first line starts with #!");
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot);
  if (CODE_EXTENSIONS.includes(extension)) reasons.push(`code file (${extension})`);
  return reasons.map((reason) => `${file.path}: ${reason}`);
}

/**
 * Every script signal in `files`, as `<path>: <reason>` lines, file by file in input order; empty when the skill is
 * text only. The caller refuses on any line unless the source allows scripts.
 */
export function carriesScripts(files: readonly ScriptScanFile[]): string[] {
  return files.flatMap(fileReasons);
}
