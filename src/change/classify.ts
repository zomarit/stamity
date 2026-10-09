/**
 * The change classifier (REQ-FLOW-061): one class for a change, decided from its
 * changed paths, and the checks and lenses that class needs.
 *
 * Seven classes, strongest first: security-sensitive, public-contract, product,
 * config, tests, docs, records. Each path takes the strongest class any rule
 * gives it, a path no rule places is `product`, and the change takes its
 * strongest path's class. Every unclear input — an empty path list, a base that
 * did not resolve, a rename whose two sides classify differently — makes the
 * class at least `product` and never lowers a stronger one, because the class
 * narrows the gates a flow runs and the safe direction is always the full set.
 *
 * **The code-path floor.** No rule, built-in or a caller's, places a code file
 * (by {@link CODE_EXTENSIONS}), an extensionless file (a Makefile, a shebang
 * script) or a config-format file (by {@link CONFIG_EXTENSIONS}, and the
 * `.env` family) in `records` or `docs`: those two classes skip lint,
 * typecheck and the full suite, so a script or a workflow under `docs/` or a
 * run folder would otherwise ship unchecked (review/47). The extensionless doc
 * names ({@link DOC_NAMES}) are exempt. A rule places a code or extensionless
 * file in `tests` only when a built-in test glob covers it too, so a wide
 * `tests` glob cannot take product code off the full gates (review/47). Such a
 * file is `tests` when a built-in test glob covers it, else keeps its next
 * placement, else is `product`.
 *
 * **The built-in rules are generic.** They name only the engine's own state
 * paths, `docs/**`, top-level Markdown and the agent instruction files. The
 * instruction-file and security rules match without case, as the trigger table
 * does, because a case-insensitive checkout opens `claude.md` as `CLAUDE.md`;
 * the weaker rules stay case-sensitive, so a case variant never lowers a path.
 *
 * **A repository's own lists** live in its {@link CLASS_FILE}, which
 * {@link parseClassFile} validates and {@link mergeRules} joins to the
 * built-ins. The caller reads it from the base commit, never from the head, so
 * a change cannot lower its own checks through that file's data. That bounds
 * the data only: the code that applies the rules (this module and the verb that
 * calls it) is placed `security-sensitive` by this repository's own class file,
 * so a change to it gets the security lens (review/8).
 *
 * **The trigger roster's security row** (REQ-FLOW-065). A path the
 * `stamity-security` row of the specialist trigger table matches is
 * `security-sensitive`, whatever rules the caller passes: the row is read here,
 * not merged into `rules`, so no class file can drop or weaken it. A change's
 * lenses are every trigger row its paths match, plus the security lens when the
 * class is `security-sensitive` by any rule. The table is an input that defaults
 * to the shipped one, so a trimmed or empty roster is reachable (review/23).
 * The same row, after the built-in security floor, decides
 * {@link outsideSecurityRule}, which the git read calls for a path outside the
 * project, so this module stays the roster's one `src/` reader.
 *
 * **Where a path came from decides how it is read** (review/20). A name git
 * gave is read literally: git never separates on `\`, so a backslash there is a
 * filename character and the reported path is git's own name. A listed path
 * (`--paths`) may be either spelling, so it is read both ways and the stronger
 * class kept; see {@link readPath} for the over-gating that costs.
 *
 * Pure: no filesystem, no git, and one internal import, the trigger roster
 * (`../roster/triggers.ts`, wave 1). The verb in `../cli/commands/gate.ts`
 * gathers the paths and prints the result.
 */
import { posix } from "node:path";
import {
  findSpecialistTrigger,
  SPECIALIST_TRIGGER_TABLE,
  specialistsForPath,
  type SpecialistTrigger,
} from "../roster/triggers.ts";

/** The seven change classes. */
export type ChangeClass =
  | "records"
  | "docs"
  | "tests"
  | "config"
  | "product"
  | "public-contract"
  | "security-sensitive";

/** Every class, strongest first. The change takes the first one any of its paths reaches. */
export const CLASS_ORDER: readonly ChangeClass[] = [
  "security-sensitive",
  "public-contract",
  "product",
  "config",
  "tests",
  "docs",
  "records",
];

/** One check a class asks a flow to run. */
export type Check =
  | "scan"
  | "tests-selected"
  | "lint"
  | "typecheck"
  | "gates-all"
  | "review-once"
  | "review"
  | "dependency-audit";

/**
 * Each class's checks (the plan's D1). From `config` up every class runs the
 * full gates; below it the narrower sets still keep the secret scan and the
 * selected tests, because the records and docs suites read those files.
 */
export const CLASS_CHECKS: Readonly<Record<ChangeClass, readonly Check[]>> = {
  records: ["scan", "tests-selected"],
  docs: ["scan", "tests-selected", "review-once"],
  tests: ["scan", "tests-selected", "lint", "typecheck", "review"],
  config: ["scan", "gates-all", "review"],
  product: ["scan", "gates-all", "review"],
  "public-contract": ["scan", "gates-all", "review"],
  "security-sensitive": ["scan", "gates-all", "review"],
};

/** The lens a `security-sensitive` change always gets; also the trigger roster's id for the security row. */
const SECURITY_LENS = "stamity-security";

/** The first pattern of the security row that matches `path`, by the roster's own matching; none without a row. */
function securityRowPattern(path: string, row: SpecialistTrigger | undefined): string | undefined {
  if (row === undefined) return undefined;
  return row.triggerPaths.find((pattern) => specialistsForPath(path, [{ ...row, triggerPaths: [pattern] }]).length > 0);
}

/**
 * The one list of code extensions every rule over code reads: the floor here,
 * and the later line rules and test-input reads. Compared lower-cased, so an
 * upper-case `.SH` is still a script.
 */
export const CODE_EXTENSIONS: readonly string[] = [
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".cs", ".php",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".psm1", ".bat", ".cmd",
  ".c", ".cc", ".cpp", ".h", ".hpp", ".scala", ".dart", ".lua", ".pl",
  ".vue", ".svelte", ".astro",
];

/** Globs that mark a test file. A repository's class file extends them with its `tests` globs. */
export const BUILT_IN_TEST_GLOBS: readonly string[] = [
  "**/*.test.*",
  "**/*.spec.*",
  "test/**",
  "tests/**",
  "**/__tests__/**",
];

/** One placement rule: every path a glob of `paths` matches takes `class` at least. */
export interface ClassRule {
  class: ChangeClass;
  paths: readonly string[];
  rationale: string;
  /** Match `paths` without case. Only for a rule that raises a path: folding a weaker rule's case could lower one. */
  foldCase?: boolean;
  /** Set by {@link mergeRules} on a class file's rule, so a reason can name its glob when it lowers nothing. */
  origin?: "class-file";
}

/** Where a repository keeps its own class lists and test-input map, relative to the project root. */
export const CLASS_FILE = ".stamity/change-classes.json";

/** The generic rules every repository gets, before its own class file. */
export const BUILT_IN_RULES: readonly ClassRule[] = [
  {
    class: "records",
    paths: [".stamity/runs/**", ".stamity/inbox.md", ".stamity/handoffs/**"],
    rationale: "work-run records, the inbox and handoffs: read back as data, never as authority",
  },
  {
    class: "docs",
    paths: ["docs/**", "*.md"],
    rationale: "documentation, plans and specs included",
  },
  {
    // Not docs or records, though they are Markdown: clients load them as
    // instructions at any depth, so one review pass is too little (D10).
    class: "product",
    paths: ["**/AGENTS.md", "**/AGENTS.override.md", "**/CLAUDE.md", "**/CLAUDE.local.md"],
    rationale: "the agent instruction files, at any depth",
    foldCase: true,
  },
  {
    // review/49: the file decides every later change's checks, so a change to it gets the security lens.
    class: "security-sensitive",
    paths: [CLASS_FILE],
    rationale: "the class file itself: a change to it changes what every later change runs",
    foldCase: true,
  },
  {
    class: "security-sensitive",
    paths: [".stamity/manifest.json", ".stamity/overrides/**"],
    rationale: "the engine's own state, read back as gate configuration",
    foldCase: true,
  },
];

/** Classes no code, extensionless or config file may take. */
const NOT_FOR_CODE: ReadonlySet<ChangeClass> = new Set(["records", "docs"]);

/**
 * Config formats the code-path floor holds out of `records` and `docs`
 * (review/47), compared lower-cased; `.env` and `.env.<anything>` are matched by
 * name in {@link isConfigPath}. Not {@link CODE_EXTENSIONS}: a config file may
 * still be `tests` by a rule.
 */
const CONFIG_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json", ".jsonc", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".xml", ".properties", ".env",
]);

/** The extensionless names that are documentation, compared lower-cased; any other extensionless file is held as code. */
const DOC_NAMES: ReadonlySet<string> = new Set(["license", "notice", "authors", "changelog", "copying", "readme"]);

/**
 * POSIX separators, with `.` and `..` segments and doubled separators resolved:
 * the Windows reading of a path, which every glob is matched against. A path
 * that climbs out of the repository keeps its leading `../` and matches no rule.
 */
function normalizePath(path: string): string {
  return resolveDots(path.replaceAll("\\", "/"));
}

/** `.` and `..` segments and doubled separators resolved; `.` reads as empty. */
function resolveDots(path: string): string {
  if (path === "") return "";
  const normalized = posix.normalize(path);
  return normalized === "." ? "" : normalized;
}

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const globCache = new Map<string, RegExp>();

/** `**` spans segments (`**` followed by `/` spans none too), `*` stays in one, the rest is literal. */
function globRegExp(glob: string, foldCase = false): RegExp {
  const key = `${foldCase ? "i" : "-"}${glob}`;
  const cached = globCache.get(key);
  if (cached !== undefined) return cached;
  const source = normalizePath(glob);
  let pattern = "";
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("**/", index)) {
      pattern += "(?:[^/]*/)*";
      index += 3;
    } else if (source.startsWith("**", index)) {
      pattern += ".*";
      index += 2;
    } else if (source[index] === "*") {
      pattern += "[^/]*";
      index += 1;
    } else {
      pattern += (source[index] ?? "").replace(REGEXP_SPECIAL, "\\$&");
      index += 1;
    }
  }
  const compiled = new RegExp(`^${pattern}$`, foldCase ? "i" : "");
  globCache.set(key, compiled);
  return compiled;
}

/**
 * Whether `path` matches `glob`, both read as POSIX paths. `literal` reads a
 * name git gave: no separator rewrite, so a backslash stays a filename
 * character (review/20). `foldCase` matches without case.
 */
export function matchGlob(path: string, glob: string, options: { literal?: boolean; foldCase?: boolean } = {}): boolean {
  const read = options.literal === true ? path : normalizePath(path);
  return globRegExp(glob, options.foldCase === true).test(read);
}

/** Whether an already-read `path` matches `glob`: no second separator rewrite, so a literal backslash stays one. */
function matchRead(path: string, glob: string, foldCase = false): boolean {
  return globRegExp(glob, foldCase).test(path);
}

/**
 * The security rule a path outside the project meets, named for the reason, or
 * `undefined` (review/21). First the built-in `security-sensitive` floor (never
 * a project's class file, which belongs to the project), matched against git's
 * name literally (review/20); then each pattern of the trigger roster's security
 * row, each matched by the roster's own matcher over a one-pattern row. The
 * check lives here so the roster keeps one `src/` reader; the git read in
 * `../cli/commands/gate.ts` calls it for each outside path. A `listed` source
 * (git's names on win32, where a backslash separates at checkout: review/43)
 * meets the floor by either reading, as {@link readPath} reads such a path.
 */
export function outsideSecurityRule(
  path: string,
  source: PathSource = "git",
  triggers: readonly SpecialistTrigger[] = SPECIALIST_TRIGGER_TABLE,
): string | undefined {
  for (const rule of BUILT_IN_RULES) {
    if (rule.class !== "security-sensitive") continue;
    const foldCase = rule.foldCase === true;
    const glob = rule.paths.find(
      (candidate) =>
        matchGlob(path, candidate, { literal: true, foldCase }) || (source === "listed" && matchGlob(path, candidate, { foldCase })),
    );
    if (glob !== undefined) return `built-in ${glob}`;
  }
  const pattern = securityRowPattern(path, findSpecialistTrigger(SECURITY_LENS, triggers));
  return pattern === undefined ? undefined : `security row ${pattern}`;
}

/** A code file by extension, or an extensionless file that is not a doc name: either may be run. */
function isCodePath(path: string): boolean {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const extension = posix.extname(basename).toLowerCase();
  if (extension === "") return !DOC_NAMES.has(basename.toLowerCase());
  return CODE_EXTENSIONS.includes(extension);
}

/** A config-format file by extension, or a `.env` / `.env.<anything>` file: it configures what runs (review/47). */
function isConfigPath(path: string): boolean {
  const basename = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  return CONFIG_EXTENSIONS.has(posix.extname(basename));
}

function rank(cls: ChangeClass): number {
  return CLASS_ORDER.indexOf(cls);
}

function strongest(classes: readonly ChangeClass[]): ChangeClass | undefined {
  let best: ChangeClass | undefined;
  for (const cls of classes) if (best === undefined || rank(cls) < rank(best)) best = cls;
  return best;
}

/** What `rule` reads for a path no rule places. */
const UNPLACED = "unplaced";

interface PathClass {
  path: string;
  class: ChangeClass;
  rule: string;
}

function classifyPath(
  path: string,
  rules: readonly ClassRule[],
  securityRow: SpecialistTrigger | undefined,
): PathClass & { floored: boolean; unlowered: string[] } {
  const code = isCodePath(path);
  const held = code || isConfigPath(path);
  const builtInTest = code && BUILT_IN_TEST_GLOBS.some((glob) => matchRead(path, glob));
  let best: { class: ChangeClass; rule: string } | undefined;
  let floored = false;
  const fromFile: { class: ChangeClass; glob: string; refused: boolean }[] = [];
  for (const rule of rules) {
    const glob = rule.paths.find((candidate) => matchRead(path, candidate, rule.foldCase === true));
    if (glob === undefined) continue;
    // The floor (review/47): no records or docs for code, config or extensionless files; tests for code only under a built-in test glob.
    const refused = (held && NOT_FOR_CODE.has(rule.class)) || (code && rule.class === "tests" && !builtInTest);
    if (rule.origin === "class-file") fromFile.push({ class: rule.class, glob, refused });
    if (refused) {
      floored = true;
      continue;
    }
    if (best === undefined || rank(rule.class) < rank(best.class)) best = { class: rule.class, rule: glob };
  }
  const securityPattern = securityRowPattern(path, securityRow);
  if (securityPattern !== undefined && (best === undefined || rank("security-sensitive") < rank(best.class))) {
    best = { class: "security-sensitive", rule: `the trigger roster's security row (${securityPattern})` };
  }
  if (floored) {
    const testGlob = BUILT_IN_TEST_GLOBS.find((glob) => matchRead(path, glob));
    if (testGlob !== undefined && (best === undefined || rank("tests") < rank(best.class))) {
      best = { class: "tests", rule: `floor: a code file under ${testGlob} is tests` };
    }
  }
  if (best === undefined) {
    best = floored
      ? { class: "product", rule: "floor: a code, config or extensionless file is never records or docs, nor tests outside a built-in test glob" }
      : { class: "product", rule: UNPLACED };
  }
  const placed = best.class;
  // A class-file glob weaker than where the path ended lowered nothing; the reason names it (S3). A glob the
  // code-path floor refused, where the floor then decided, is the floor's clause alone: no stronger rule placed it.
  const floorDecided = best.rule.startsWith("floor:");
  const unlowered = fromFile
    .filter((match) => rank(match.class) > rank(placed) && !(match.refused && floorDecided))
    .map((match) => `${match.glob} (${match.class}) for ${path}, kept ${placed}`);
  return { path, class: placed, rule: best.rule, floored, unlowered };
}

/** Where the paths came from: names git gave, or paths a caller listed. */
export type PathSource = "git" | "listed";

/**
 * One raw path. A git name is classified as git gave it, nothing rewritten.
 * A listed path is read both ways: with backslashes as separators (Windows)
 * and as filename characters (POSIX). The stronger reading is kept, the
 * Windows one on a tie, so no spelling lowers a path: a POSIX file named
 * `a\..\docs\x.md` under `.stamity/overrides/` stays there, and
 * `docs\..\.stamity\manifest.json` still meets the manifest rule.
 *
 * The cost, accepted (review/20, option b): the literal reading of a
 * Windows-separated listed path is one top-level segment, which matches only
 * `*.md` or nothing, so whenever its separator reading is weaker the path
 * over-gates. `docs\img.png` reads `product` (unplaced) rather than `docs`,
 * and `.stamity\runs\x\ledger.jsonl` `product` rather than `records`, and
 * the report names the raw string. The class only rises, so no gate or lens is
 * lost; a caller with git names passes `source: "git"` and pays none of it.
 * `undefined` when every reading is empty.
 */
function readPath(
  raw: string,
  rules: readonly ClassRule[],
  securityRow: SpecialistTrigger | undefined,
  source: PathSource,
): ReturnType<typeof classifyPath> | undefined {
  const read = (path: string) => (path === "" ? undefined : classifyPath(path, rules, securityRow));
  if (source === "git") return read(raw);
  const windows = normalizePath(raw);
  const literal = resolveDots(raw);
  const first = read(windows);
  if (literal === windows) return first;
  const second = read(literal);
  if (first === undefined) return second;
  if (second === undefined) return first;
  return rank(second.class) < rank(first.class) ? second : first;
}

/** What the caller knows about the base: given and resolved, never given, or given and unresolvable. */
export type BaseState = "given" | "absent" | "unresolved";

export interface ClassifyInput {
  paths: readonly string[];
  renames?: readonly { from: string; to: string }[];
  base: BaseState;
  /** Where `paths` and `renames` came from; `listed` (both readings) when not said. */
  source?: PathSource;
}

export interface ClassifyResult {
  class: ChangeClass;
  byPath: PathClass[];
  checks: Check[];
  lenses: string[];
  reason: string;
}

/** At most this many paths are named in one reason clause; the rest are counted. */
const PATHS_NAMED = 5;

function namePaths(paths: readonly string[]): string {
  const named = paths.slice(0, PATHS_NAMED).join(", ");
  return paths.length > PATHS_NAMED ? `${named} and ${paths.length - PATHS_NAMED} more` : named;
}

/**
 * Classify one change. `rules` defaults to {@link BUILT_IN_RULES}; a caller that
 * read a class file passes the merged set. `triggers` defaults to the shipped
 * {@link SPECIALIST_TRIGGER_TABLE}; an empty one raises nothing and names only
 * the class's own lens. Every path in `paths` and both sides of every rename
 * are classified, once each, in that order.
 */
export function classifyChange(
  input: ClassifyInput,
  rules: readonly ClassRule[] = BUILT_IN_RULES,
  triggers: readonly SpecialistTrigger[] = SPECIALIST_TRIGGER_TABLE,
): ClassifyResult {
  const securityRow = findSpecialistTrigger(SECURITY_LENS, triggers);
  const source = input.source ?? "listed";
  const readRaw = (raw: string) => readPath(raw, rules, securityRow, source);
  const byPath: PathClass[] = [];
  const floored: string[] = [];
  const unlowered: string[] = [];
  const index = new Map<string, ChangeClass>();
  // The kept reading names the path, so two raw spellings dedupe only when they read as one file.
  const add = (raw: string): void => {
    const placed = readRaw(raw);
    if (placed === undefined || index.has(placed.path)) return;
    const { path } = placed;
    index.set(path, placed.class);
    if (placed.floored) floored.push(path);
    unlowered.push(...placed.unlowered);
    byPath.push({ path, class: placed.class, rule: placed.rule });
  };
  for (const path of input.paths) add(path);
  for (const rename of input.renames ?? []) {
    add(rename.from);
    add(rename.to);
  }

  const reasons: string[] = [];
  const atLeastProduct: ChangeClass[] = [];
  if (input.base === "absent") {
    reasons.push("no base was given, so no class file was read and each path takes its built-in class");
  }
  if (input.base === "unresolved") {
    reasons.push("the base could not be resolved, so the class is at least product");
    atLeastProduct.push("product");
  }
  if (byPath.length === 0) {
    reasons.push("no changed path was named, so the class is at least product");
    atLeastProduct.push("product");
  }
  for (const rename of input.renames ?? []) {
    const from = readRaw(rename.from)?.path ?? "";
    const to = readRaw(rename.to)?.path ?? "";
    const fromClass = index.get(from);
    const toClass = index.get(to);
    if (fromClass === undefined || toClass === undefined || fromClass === toClass) continue;
    reasons.push(`the rename ${from} -> ${to} crosses ${fromClass} and ${toClass}, so the class is at least product`);
    atLeastProduct.push("product");
  }
  const unplaced = byPath.filter((entry) => entry.rule === UNPLACED).map((entry) => entry.path);
  if (unplaced.length > 0) reasons.push(`no rule places ${namePaths(unplaced)}, so it is product`);
  if (floored.length > 0) {
    reasons.push(
      `kept out of records and docs as code, config or an extensionless file, and code out of tests outside a built-in test glob: ${namePaths(floored)}`,
    );
  }
  if (unlowered.length > 0) {
    reasons.push(`the class file's weaker globs do not lower a path a stronger rule places: ${namePaths(unlowered)}`);
  }

  const pathClass = strongest(byPath.map((entry) => entry.class));
  const cls = strongest([...(pathClass === undefined ? [] : [pathClass]), ...atLeastProduct]) ?? "product";
  const top = byPath.find((entry) => entry.class === pathClass);
  if (top !== undefined) {
    reasons.push(`the strongest path is ${top.path}, ${top.class} by ${top.rule}`);
  }

  // The security lens first when the class asks for it, then every row the paths match, each once.
  const lenses = new Set<string>(cls === "security-sensitive" ? [SECURITY_LENS] : []);
  for (const entry of byPath) for (const lens of specialistsForPath(entry.path, triggers)) lenses.add(lens);

  return {
    class: cls,
    byPath,
    checks: [...CLASS_CHECKS[cls]],
    lenses: [...lenses],
    reason: reasons.join("; "),
  };
}

// ── The class file ───────────────────────────────────────────────────────────

/**
 * The classes whose rules raise a path, so they fold case (review/12) and are
 * the entries a refused file still applies (review/48); every other class
 * matches with case and lowers.
 */
const FOLDS_CASE: ReadonlySet<ChangeClass> = new Set(["product", "public-contract", "security-sensitive"]);

/** A glob's matching cost is bounded (review/50): at most this many characters, and this many `**`. */
const GLOB_MAX_LENGTH = 200;
const GLOB_MAX_DOUBLE_STARS = 4;

/** Path shapes a match-all glob meets every one of (review/47): a name, a dotted name, a dotfile, at depth one and two. */
const MATCH_ALL_PROBES: readonly string[] = ["a", "a.b", "a/b", "a/b.c", ".a", "a/.b"];

/** The classes a glob matching every path may join: only one that raises a path (the sign-off on plan/8). */
const MATCH_ALL_FLOOR: ChangeClass = "product";

/** The class file's two keys, both optional. */
const CLASS_FILE_KEYS: readonly string[] = ["classes", "testInputs"];
const TEST_INPUT_KEYS: readonly string[] = ["glob", "tests"];

/** One test-input entry: a glob over changed paths and the tests it selects, or every test. */
export interface TestInput {
  glob: string;
  tests: string[] | "all";
}

/**
 * A class file read and validated, or the reasons it was refused, the first one
 * first, with `raising`: the file's product, public-contract and
 * security-sensitive entries that parse on their own, which a refused file
 * still applies (review/48). Empty when the text is no JSON object or
 * `classes` is no object.
 */
export type ClassFileParse =
  | { ok: true; rules: ClassRule[]; testGlobs: string[]; testInputs: TestInput[] }
  | { ok: false; errors: string[]; raising: ClassRule[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A glob that matches every path, so it may not join a class that lowers one:
 * one meeting every shape of {@link MATCH_ALL_PROBES} (review/47), or one made
 * only of `*` segments with at least one `**` (or longer run) among them, which
 * after the dots resolve matches every path below some depth (plan/8).
 */
function matchesEveryPath(glob: string): boolean {
  if (MATCH_ALL_PROBES.every((probe) => matchGlob(probe, glob))) return true;
  const segments = normalizePath(glob).split("/");
  return segments.every((segment) => /^\*+$/.test(segment)) && segments.some((segment) => segment.length >= 2);
}

/** Why a glob costs too much to match, or `undefined` (review/50). */
function globCostError(glob: string): string | undefined {
  if (glob.length > GLOB_MAX_LENGTH) return `is longer than ${GLOB_MAX_LENGTH} characters`;
  if ((glob.match(/\*\*/g) ?? []).length > GLOB_MAX_DOUBLE_STARS) return `holds more than four **`;
  return undefined;
}

/** Whether a code point is a C0 control or DEL, by number, so no escape sits in this source. */
function isControl(char: string): boolean {
  const point = char.codePointAt(0) ?? 0;
  return point < 0x20 || point === 0x7f;
}

/**
 * Why a test entry is not a plain repository-relative file path, or
 * `undefined` when it is (plan/23). An entry reaches a test runner as an
 * argument, so a leading `-` would be an option and a glob would select more
 * than it names.
 */
function testEntryError(entry: string): string | undefined {
  if (entry === "") return "is empty";
  if (entry.startsWith("-")) return "starts with '-'";
  if (/\s/.test(entry) || [...entry].some(isControl)) return "holds whitespace or a control character";
  if (/[*?[\]{}]/.test(entry)) return "holds a glob character";
  if (entry.startsWith("/") || entry.includes("\\") || /^[A-Za-z]:/.test(entry)) {
    return "is not a repository-relative POSIX path";
  }
  if (entry.split("/").includes("..")) return "has a '..' segment";
  return undefined;
}

function isChangeClass(value: string): value is ChangeClass {
  return (CLASS_ORDER as readonly string[]).includes(value);
}

function readClasses(value: unknown, errors: string[]): Map<ChangeClass, string[]> {
  const classes = new Map<ChangeClass, string[]>();
  if (value === undefined) return classes;
  if (!isRecord(value)) {
    errors.push("classes is not an object of class names to glob lists");
    return classes;
  }
  for (const [key, globs] of Object.entries(value)) {
    if (!isChangeClass(key)) {
      errors.push(`classes: ${JSON.stringify(key)} is not a change class (one of ${CLASS_ORDER.join(", ")})`);
      continue;
    }
    if (!Array.isArray(globs)) {
      errors.push(`classes.${key} is not a list of globs`);
      continue;
    }
    const kept: string[] = [];
    globs.forEach((glob: unknown, at) => {
      const where = `classes.${key}[${at}]`;
      const cost = typeof glob === "string" ? globCostError(glob) : undefined;
      if (typeof glob !== "string") errors.push(`${where} is not a string`);
      else if (glob === "") errors.push(`${where} is empty`);
      else if (cost !== undefined) errors.push(`${where} ${cost}`);
      else if (rank(key) > rank(MATCH_ALL_FLOOR) && matchesEveryPath(glob)) {
        errors.push(
          `${where}: the glob ${JSON.stringify(glob)} matches every path, and only ${MATCH_ALL_FLOOR} or a stronger class may take every path`,
        );
      } else kept.push(glob);
    });
    classes.set(key, kept);
  }
  return classes;
}

function readTestInputs(value: unknown, errors: string[]): TestInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push("testInputs is not a list of { glob, tests } entries");
    return [];
  }
  const inputs: TestInput[] = [];
  value.forEach((entry: unknown, at) => {
    const where = `testInputs[${at}]`;
    if (!isRecord(entry)) {
      errors.push(`${where} is not an object`);
      return;
    }
    const before = errors.length;
    for (const key of Object.keys(entry)) {
      if (!TEST_INPUT_KEYS.includes(key)) errors.push(`${JSON.stringify(key)} is not a key of ${where} (${TEST_INPUT_KEYS.join(", ")})`);
    }
    const { glob, tests } = entry;
    if (typeof glob !== "string" || glob === "") errors.push(`${where}.glob is not a non-empty string`);
    else {
      const cost = globCostError(glob);
      if (cost !== undefined) errors.push(`${where}.glob ${cost}`);
    }
    if (tests !== "all" && !Array.isArray(tests)) errors.push(`${where}.tests is neither "all" nor a list of test files`);
    if (Array.isArray(tests)) {
      tests.forEach((test: unknown, index) => {
        const problem = typeof test === "string" ? testEntryError(test) : "is not a string";
        if (problem !== undefined) errors.push(`${where}.tests[${index}] ${JSON.stringify(test)} ${problem}`);
      });
    }
    if (errors.length === before) inputs.push({ glob: glob as string, tests: tests === "all" ? "all" : [...(tests as string[])] });
  });
  return inputs;
}

/**
 * The class file's text, validated (REQ-FLOW-061, REQ-FLOW-062). Shape:
 * `{ "classes": { "<class>": ["<glob>", …] }, "testInputs": [{ "glob": "<glob>",
 * "tests": ["<test file>", …] | "all" }] }`, both keys optional. Refused: text
 * that is not a JSON object, an unknown key, an unknown class, a glob that is
 * not a non-empty string, a glob that matches every path under a class weaker
 * than `product` (the sign-off on plan/8), and a test entry that is not a plain
 * repository-relative file path (plan/23), and a glob longer than 200
 * characters or holding more than four `**` (review/50). Every error is listed,
 * the first one first; a refused file yields no rules, only its raising entries
 * (review/48).
 *
 * One rule per class, strongest first. A `product`, `public-contract` or
 * `security-sensitive` rule folds case and no other does (review/12), so a
 * repository's own security globs read a case variant as the built-ins do and a
 * case variant never lowers a path. `testGlobs` are the `tests` globs, which
 * extend {@link BUILT_IN_TEST_GLOBS}.
 */
export function parseClassFile(text: string): ClassFileParse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${err instanceof Error ? err.message : String(err)}`], raising: [] };
  }
  if (!isRecord(value)) return { ok: false, errors: ["the file is not a JSON object"], raising: [] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!CLASS_FILE_KEYS.includes(key)) {
      errors.push(`${JSON.stringify(key)} is not a key of the class file (${CLASS_FILE_KEYS.join(", ")})`);
    }
  }
  const classes = readClasses(value["classes"], errors);
  const testInputs = readTestInputs(value["testInputs"], errors);

  const rules: ClassRule[] = [];
  for (const cls of CLASS_ORDER) {
    const paths = classes.get(cls) ?? [];
    if (paths.length === 0) continue;
    rules.push({
      class: cls,
      paths,
      rationale: `the class file's ${cls} globs`,
      ...(FOLDS_CASE.has(cls) ? { foldCase: true } : {}),
    });
  }
  if (errors.length > 0) return { ok: false, errors, raising: rules.filter((rule) => FOLDS_CASE.has(rule.class)) };
  return { ok: true, rules, testGlobs: [...(classes.get("tests") ?? [])], testInputs };
}

/**
 * The built-in rules with a class file's rules after them, each marked as the
 * file's. An extension glob joins its class; since every path takes the
 * strongest class any rule gives it, a path a built-in rule (or the trigger
 * roster's security row) places can only end in an equal or stronger class, and
 * the reason names an extension glob that lowered nothing (S3's floor). The
 * code-path floor, the instruction-file rule and the extensionless floor bind
 * these rules as they bind the built-ins. The case rule is held here too, so a
 * hand-built extension cannot fold a weaker class's case.
 */
export function mergeRules(builtIn: readonly ClassRule[], extension: readonly ClassRule[]): ClassRule[] {
  return [
    ...builtIn,
    ...extension.map(
      (rule): ClassRule => ({
        class: rule.class,
        paths: rule.paths,
        rationale: rule.rationale,
        origin: "class-file",
        ...(FOLDS_CASE.has(rule.class) ? { foldCase: true } : {}),
      }),
    ),
  ];
}
