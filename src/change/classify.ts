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
 * (by {@link CODE_EXTENSIONS}) or an extensionless file (a Makefile, a shebang
 * script) in `records` or `docs`: those two classes skip lint, typecheck and
 * the full suite, so a script under `docs/` or a run folder would otherwise
 * ship unchecked. The extensionless doc names ({@link DOC_NAMES}) are exempt.
 * Such a file is `tests` when a test glob covers it, else keeps its next
 * placement, else is `product`.
 *
 * **The built-in rules are generic.** They name only the engine's own state
 * paths, `docs/**`, top-level Markdown and the agent instruction files. The
 * instruction-file and security rules match without case, as the trigger table
 * does, because a case-insensitive checkout opens `claude.md` as `CLAUDE.md`;
 * the weaker rules stay case-sensitive, so a case variant never lowers a path.
 * A repository's own lists live in its
 * `.stamity/change-classes.json`, read from the base commit by the caller, never
 * from the head, so a change cannot lower its own checks.
 *
 * **The trigger roster's security row** (REQ-FLOW-065). A path the
 * `stamity-security` row of the specialist trigger table matches is
 * `security-sensitive`, whatever rules the caller passes: the row is read here,
 * not merged into `rules`, so no class file can drop or weaken it. A change's
 * lenses are every trigger row its paths match, plus the security lens when the
 * class is `security-sensitive` by any rule.
 *
 * Pure: no filesystem, no git, and one internal import, the trigger roster
 * (`../roster/triggers.ts`, wave 1). The verb in `../cli/commands/gate.ts`
 * gathers the paths and prints the result.
 */
import { posix } from "node:path";
import { findSpecialistTrigger, specialistsForPath } from "../roster/triggers.ts";

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

/** The roster's security row, read once. `undefined` only if a roster ships without it. */
const SECURITY_ROW = findSpecialistTrigger(SECURITY_LENS);

/** The first pattern of the security row that matches `path`, by the roster's own matching. */
function securityRowPattern(path: string): string | undefined {
  const row = SECURITY_ROW;
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
}

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
    class: "config",
    paths: [".stamity/change-classes.json"],
    rationale: "the class file itself: a change to it changes what every later change runs",
  },
  {
    class: "security-sensitive",
    paths: [".stamity/manifest.json", ".stamity/overrides/**"],
    rationale: "the engine's own state, read back as gate configuration",
    foldCase: true,
  },
];

/** Classes no code file may take. */
const NOT_FOR_CODE: ReadonlySet<ChangeClass> = new Set(["records", "docs"]);

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

/** Whether `path` matches `glob`, both read as POSIX paths. */
export function matchGlob(path: string, glob: string): boolean {
  return globRegExp(glob).test(normalizePath(path));
}

/** Whether an already-read `path` matches `glob`: no second separator rewrite, so a literal backslash stays one. */
function matchRead(path: string, glob: string, foldCase = false): boolean {
  return globRegExp(glob, foldCase).test(path);
}

/** A code file by extension, or an extensionless file that is not a doc name: either may be run. */
function isCodePath(path: string): boolean {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const extension = posix.extname(basename).toLowerCase();
  if (extension === "") return !DOC_NAMES.has(basename.toLowerCase());
  return CODE_EXTENSIONS.includes(extension);
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

function classifyPath(path: string, rules: readonly ClassRule[]): PathClass & { floored: boolean } {
  const code = isCodePath(path);
  let best: { class: ChangeClass; rule: string } | undefined;
  let floored = false;
  for (const rule of rules) {
    const glob = rule.paths.find((candidate) => matchRead(path, candidate, rule.foldCase === true));
    if (glob === undefined) continue;
    if (code && NOT_FOR_CODE.has(rule.class)) {
      floored = true;
      continue;
    }
    if (best === undefined || rank(rule.class) < rank(best.class)) best = { class: rule.class, rule: glob };
  }
  const securityPattern = securityRowPattern(path);
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
      ? { class: "product", rule: "floor: a code or extensionless file is never records or docs" }
      : { class: "product", rule: UNPLACED };
  }
  return { path, class: best.class, rule: best.rule, floored };
}

/**
 * One raw path, read both ways: with backslashes as separators (Windows) and as
 * filename characters (POSIX, where git tracks such names). The stronger
 * reading is kept, the Windows one on a tie, so no spelling lowers a path: a
 * POSIX file named `a\..\docs\x.md` under `.stamity/overrides/` stays
 * there, and `docs\..\.stamity\manifest.json` still meets the manifest rule.
 * `undefined` when both readings are empty.
 */
function readPath(raw: string, rules: readonly ClassRule[]): (PathClass & { floored: boolean }) | undefined {
  const windows = normalizePath(raw);
  const literal = resolveDots(raw);
  const read = (path: string) => (path === "" ? undefined : classifyPath(path, rules));
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
 * read a class file passes the merged set. Every path in `paths` and both sides
 * of every rename are classified, once each, in that order.
 */
export function classifyChange(input: ClassifyInput, rules: readonly ClassRule[] = BUILT_IN_RULES): ClassifyResult {
  const byPath: PathClass[] = [];
  const floored: string[] = [];
  const index = new Map<string, ChangeClass>();
  // The kept reading names the path, so two raw spellings dedupe only when they read as one file.
  const add = (raw: string): void => {
    const placed = readPath(raw, rules);
    if (placed === undefined || index.has(placed.path)) return;
    const { path } = placed;
    index.set(path, placed.class);
    if (placed.floored) floored.push(path);
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
    const from = readPath(rename.from, rules)?.path ?? "";
    const to = readPath(rename.to, rules)?.path ?? "";
    const fromClass = index.get(from);
    const toClass = index.get(to);
    if (fromClass === undefined || toClass === undefined || fromClass === toClass) continue;
    reasons.push(`the rename ${from} -> ${to} crosses ${fromClass} and ${toClass}, so the class is at least product`);
    atLeastProduct.push("product");
  }
  const unplaced = byPath.filter((entry) => entry.rule === UNPLACED).map((entry) => entry.path);
  if (unplaced.length > 0) reasons.push(`no rule places ${namePaths(unplaced)}, so it is product`);
  if (floored.length > 0) {
    reasons.push(`kept out of records and docs as code or an extensionless file: ${namePaths(floored)}`);
  }

  const pathClass = strongest(byPath.map((entry) => entry.class));
  const cls = strongest([...(pathClass === undefined ? [] : [pathClass]), ...atLeastProduct]) ?? "product";
  const top = byPath.find((entry) => entry.class === pathClass);
  if (top !== undefined) {
    reasons.push(`the strongest path is ${top.path}, ${top.class} by ${top.rule}`);
  }

  // The security lens first when the class asks for it, then every row the paths match, each once.
  const lenses = new Set<string>(cls === "security-sensitive" ? [SECURITY_LENS] : []);
  for (const entry of byPath) for (const lens of specialistsForPath(entry.path)) lenses.add(lens);

  return {
    class: cls,
    byPath,
    checks: [...CLASS_CHECKS[cls]],
    lenses: [...lenses],
    reason: reasons.join("; "),
  };
}
