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
 * names ({@link DOC_NAMES}) are exempt, and so is a config file under the
 * engine's own record paths, which the built-in `records` rule keeps there as
 * the data the engine writes (review/55). A rule places a code or extensionless
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
 * **The security line rules** (REQ-FLOW-065, S7 (c), D3). A caller that read
 * the change's lines passes them as hunks; {@link SECURITY_LINE_RULES} run over
 * the lines of each JavaScript, TypeScript or Python file (by extension, or by
 * a first-line shebang) outside the built-in test globs, a code file of another
 * language is named as read by no line rule (review/85), and a hit makes that
 * path `security-sensitive`. A line is read to its end, `secret-name` in
 * overlapping windows so its cost stays linear in the line (review/93,
 * review/123); a line past a hard cap is not read and makes the class
 * `security-sensitive`, so the lens reads it. Added and removed
 * lines count, and context lines only in a hunk that also removes one, so
 * removing the guard around an existing dangerous call still classifies. The
 * reason names the rule id and where, never the line's text (plan/17). A file
 * the read could not show is `unscanned`: a code file makes the class
 * `security-sensitive` (review/125), any other at least `product` (plan/62).
 *
 * **Audit first** (REQ-FLOW-065, S7 (a), plan/12, plan/52). A caller that read
 * a changed npm lockfile's two copies passes them as `lockfiles`. When every
 * path the class's paths placed `security-sensitive` is a `package-lock.json`
 * whose base and head copies both parse at `lockfileVersion` 2 or 3, no
 * `package.json` changed, and no differing `packages` entry carries an install
 * script at head, the checks gain `dependency-audit` and the lenses lose the
 * security lens: the audit runs first and the lens only on its flag. Any other
 * format, a missing base copy, a parse failure, or a raise by a line past the
 * cap or an unscanned code file keeps the lens, and the reason says why. A
 * later read that raises the class puts the lens back ({@link keepSecurityLens}).
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

/** One security line rule: a call shape on a named API, matched per line (S7 (c)). */
interface LineRule {
  id: string;
  pattern: RegExp;
  rationale: string;
}

/**
 * The security line rules (S7 (c), the sign-off on plan/29): four families of
 * call shapes, each word-bounded and with its opening parenthesis, so prose and
 * a name that merely contains a word do not match. S7's fifth risk, state read
 * back as authority, is placed by path. A bare `exec` call counts, or one on a
 * `child_process` receiver (`cp` included, and any name the file imports the
 * module as, by {@link fileNames}), or a call of a name the file binds
 * one of the module's spawning members to (review/124), or assigns a spawning
 * or network member to, Python's import aliases included (review/145), never a
 * RegExp's `exec` method; a network or filesystem member counts under the name an
 * import binds it or its module to (review/199); a secret name counts only where it is assigned, or is an object key given, a
 * string literal or an environment value, and never a literal that is wholly
 * one `${…}` template placeholder (build/47, review/92). The shapes are
 * JavaScript, TypeScript and Python APIs, so they read only the files of
 * {@link LINE_RULE_EXTENSIONS} and of a covered shebang (review/85).
 */
export const SECURITY_LINE_RULES: readonly LineRule[] = [
  {
    id: "process-spawn",
    pattern:
      /(?:\b(?:require|import)\s*\(\s*|\bfrom\s*|^\s*import\s*)["'](?:node:)?child_process["']|\b(?:execFile|execFileSync|execSync|spawn|spawnSync|fork|Popen)\(|(?<![\w$.])exec\(|\b(?:child_process|childProcess|cp)(?:["']\s*\))?\.exec\(|\bpromisify\(\s*(?:[\w$]+\.)?exec\s*\)|\bsubprocess\.(?:run|call|check_output|check_call)\(|\bos\.(?:system|popen)\(/,
    rationale: "a child process runs a command the change can shape: an import of child_process, or a spawn, fork or exec call",
  },
  {
    id: "delete-or-overwrite",
    pattern:
      /\b(?:rmSync|rm|unlink|unlinkSync|rmdir|rmdirSync|writeFile|writeFileSync|createWriteStream|copyFile|copyFileSync|cp|cpSync|rename|renameSync|truncate)\(|\bshutil\.rmtree\(|\bos\.remove\(|["'`][^"'`]*\brm\s+-(?:rf|fr)\b/,
    rationale: "a file is deleted or overwritten: an fs delete, write, copy, rename or truncate call, or a recursive rm in a string",
  },
  {
    id: "network-or-registry",
    pattern:
      /\bfetch\(|\bhttps?\.(?:request|get)\(|\baxios(?:\.\w+)?\(|\brequests\.(?:get|post|put|patch|delete|head|options|request)\(|\burllib\.request\.urlopen\(|["'`][^"'`]*\b(?:(?:curl|wget)\s|npm\s+publish\b)/,
    rationale:
      "a call leaves the machine: a fetch call, an http or https request, an axios or Python requests call, urlopen, or a download or publish command in a string",
  },
  {
    id: "secret-name",
    pattern:
      /(?:(?:^|[^\w$])[\w$]*?(?:token|secret|password|credential|api_?key)[\w$]*(?:\s*:\s*[\w$.<>[\]| ]{1,80}?)?\s*=(?![=>])|(?:^|[{,])\s*["']?[\w$]*?(?:token|secret|password|credential|api_?key)[\w$]*["']?\s*:)\s*(?:(["'`])(?!\$\{(?!\s*process\.env\b)[^}"'`]*\}\1)|process\.env\b|os\.environ\b|os\.getenv\()/i,
    rationale: "a token, secret, password, credential or API key name assigned, or keyed to, a string literal or an environment value",
  },
];

/**
 * The extensions whose language the line rules' shapes are written in:
 * JavaScript and TypeScript (with the component formats that hold them) and
 * Python. Any other code file is named as read by no line rule (review/85).
 */
const LINE_RULE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".py",
]);

/** A shebang interpreter in a covered language: Node and its runners, or Python. */
const LINE_RULE_INTERPRETER = /^(?:node(?:js)?|deno|bun|tsx|ts-node|python[\d.]*)$/;

/**
 * `secret-name` backtracks over a long word run, so it reads a line in windows
 * of this many characters (review/93), each overlapping the last by
 * {@link LINE_RULE_OVERLAP}: a match up to that long is found wherever it sits
 * (review/123). The other rules are linear and read the whole line.
 */
const LINE_RULE_WINDOW = 4_096;
const LINE_RULE_OVERLAP = 1_024;
/** The rule a long line is windowed for. */
const WINDOWED_RULE = "secret-name";
/** A line longer than this is not read, and makes the class `security-sensitive` (review/123). */
const LINE_RULE_MAX_CHARS = 256 * 1024;

/** At most this many characters of a file's head are searched for its child_process import names. */
const HEAD_MAX_CHARS = 64 * 1024;

/** One diff hunk of a changed file: its added lines (numbered on the new side), removed lines and context lines. */
export interface Hunk {
  path: string;
  added: readonly { line: number; text: string }[];
  removed: readonly string[];
  context: readonly string[];
  /**
   * The start of the file's head side, when the reader has it: its first line
   * is read for a shebang and its imports for the child_process module's names.
   */
  head?: string;
}

/** Whether a path's extension is in {@link CODE_EXTENSIONS}; an extensionless file is not. */
export function hasCodeExtension(path: string): boolean {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return CODE_EXTENSIONS.includes(posix.extname(basename).toLowerCase());
}

/** An import or require that binds the whole child_process module to a name, in JavaScript or TypeScript. */
const CHILD_PROCESS_BINDING =
  /\bimport\s+(?:\*\s*as\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\}\s*)?from\s*["'](?:node:)?child_process["']|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:require|import)\s*\(\s*["'](?:node:)?child_process["']|\bimport\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["'](?:node:)?child_process["']/g;

/**
 * A named import or a destructuring of the child_process module, its braces'
 * content in group 1 or 2 (`exec as run`, `execSync: sh`); the braces are read
 * to a bound, so an unclosed one costs no more than that per match start
 * (review/124).
 */
const CHILD_PROCESS_MEMBER_BINDING =
  /\bimport\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]{0,1024})\}\s*from\s*["'](?:node:)?child_process["']|\b(?:const|let|var)\s*\{([^}]{0,1024})\}\s*=\s*(?:await\s+)?(?:require|import)\s*\(\s*["'](?:node:)?child_process["']/g;

/** The child_process members that run a command. */
const SPAWNING_MEMBERS: ReadonlySet<string> = new Set(["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork"]);

/**
 * The whole-module and the member bindings of a JavaScript module other than
 * child_process, `module` an alternation of its specifiers, in the forms of
 * {@link CHILD_PROCESS_BINDING} and {@link CHILD_PROCESS_MEMBER_BINDING} (review/199).
 */
const jsBindings = (module: string): { whole: RegExp; members: RegExp } => {
  const from = `["'](?:node:)?(?:${module})["']`;
  return {
    whole: new RegExp(
      `\\bimport\\s+(?:\\*\\s*as\\s+)?([A-Za-z_$][\\w$]*)\\s*(?:,\\s*\\{[^}]*\\}\\s*)?from\\s*${from}|\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:require|import)\\s*\\(\\s*${from}|\\bimport\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*require\\s*\\(\\s*${from}`,
      "g",
    ),
    members: new RegExp(
      `\\bimport\\s+(?:[A-Za-z_$][\\w$]*\\s*,\\s*)?\\{([^}]{0,1024})\\}\\s*from\\s*${from}|\\b(?:const|let|var)\\s*\\{([^}]{0,1024})\\}\\s*=\\s*(?:await\\s+)?(?:require|import)\\s*\\(\\s*${from}`,
      "g",
    ),
  };
};
/** The fs module (and fs/promises), whose delete and overwrite members a named import may rebind (review/199). */
const FS_BINDINGS = jsBindings("fs|fs/promises");
/** The fs members the `delete-or-overwrite` rule names. */
const FS_MEMBERS: ReadonlySet<string> = new Set([
  "rmSync", "rm", "unlink", "unlinkSync", "rmdir", "rmdirSync", "writeFile", "writeFileSync", "createWriteStream",
  "copyFile", "copyFileSync", "cp", "cpSync", "rename", "renameSync", "truncate",
]);
/** The http and https modules, whose `request` and `get` the `network-or-registry` rule names (review/199). */
const HTTP_BINDINGS = jsBindings("https?");
const HTTP_MEMBERS: ReadonlySet<string> = new Set(["request", "get"]);
/** The axios module, imported under another name (review/199). */
const AXIOS_BINDINGS = jsBindings("axios");

/** A Python `import` line's items, `subprocess as sp`, read for the aliases of the modules the rules name (review/145). */
const PY_IMPORT = /^[ \t]*import[ \t]+([^\n#]{1,1024})/gm;
/** A Python `from <module> import` of a module the rules name, its items parenthesised over lines or on one (review/145). */
const PY_FROM_IMPORT = /^[ \t]*from[ \t]+(subprocess|os|urllib\.request|urllib|requests|shutil)[ \t]+import[ \t]+(?:\(([^)]{0,1024})\)|([^\n#]{0,1024}))/gm;
/** One import item: a dotted name and its `as` alias. */
const PY_ITEM = /^([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?$/;
/**
 * The spawning members of Python's `subprocess` and `os`, the network ones of
 * `urllib.request` and `requests`, and the delete ones of `os` and `shutil`
 * (review/199).
 */
const PY_MEMBERS: Readonly<Record<string, { spawn: readonly string[]; network: readonly string[]; delete: readonly string[] }>> = {
  subprocess: { spawn: ["run", "call", "check_output", "check_call", "Popen"], network: [], delete: [] },
  os: { spawn: ["system", "popen"], network: [], delete: ["remove"] },
  "urllib.request": { spawn: [], network: ["urlopen"], delete: [] },
  requests: { spawn: [], network: ["get", "post", "put", "patch", "delete", "head", "options", "request"], delete: [] },
  shutil: { spawn: [], network: [], delete: ["rmtree"] },
};

/** The names a file binds to the modules and members the spawn and network rules read. */
interface FileNames {
  /** Names of the child_process module (JS), and of Python's `subprocess`, `os` and `urllib.request`. */
  modules: string[];
  pySubprocess: string[];
  pyOs: string[];
  pyRequest: string[];
  /** Names of Python's `requests` and `shutil`, of the http and https modules, and of axios (review/199). */
  pyRequests: string[];
  pyShutil: string[];
  http: string[];
  axios: string[];
  /** Names a call of which spawns, leaves the machine, or deletes or overwrites a file. */
  spawn: string[];
  network: string[];
  delete: string[];
}

const alternation = (names: Iterable<string>): string => [...names].map((name) => name.replaceAll("$", "\\$")).join("|");

/**
 * The names `texts` bind the child_process module to (review/90), `cp` in a
 * namespace import of the module as `cp`; the names they bind a spawning
 * member to (review/124), `run` in `import { exec as run }` or
 * `const { execSync: run } = require(…)`; Python's aliases and from-imports of
 * `subprocess`, `os` and `urllib.request`; and, read after those, each name
 * assigned a spawning or network member, or `promisify` of one, `execAsync` in
 * `const execAsync = promisify(exec)` (review/145); and the names an import
 * binds the delete and overwrite members of fs, Python's `os` and `shutil`, the
 * network members of http, https and Python's `requests`, or those modules and
 * axios themselves, to (review/199). A member passed on, or bound in another
 * file, is not followed.
 */
function fileNames(texts: readonly string[]): FileNames {
  const heads = texts.map((text) => text.slice(0, HEAD_MAX_CHARS));
  const modules = new Set<string>();
  const spawn = new Set<string>();
  const network = new Set<string>();
  const remove = new Set<string>();
  const http = new Set<string>();
  const axios = new Set<string>();
  const py = {
    subprocess: new Set<string>(),
    os: new Set<string>(),
    "urllib.request": new Set<string>(),
    requests: new Set<string>(),
    shutil: new Set<string>(),
  };
  // A named import or destructuring's items, each `member as name` or `member: name`, or a member under its own name.
  const boundMembers = (items: string, members: ReadonlySet<string>, into: Set<string>): void => {
    for (const part of items.split(",")) {
      const bound = /^\s*([A-Za-z_$][\w$]*)\s*(?:(?:\bas\b|:)\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (bound?.[1] !== undefined && members.has(bound[1])) into.add(bound[2] ?? bound[1]);
    }
  };
  for (const head of heads) {
    for (const [bindings, into] of [[HTTP_BINDINGS, http], [AXIOS_BINDINGS, axios]] as const) {
      for (const match of head.matchAll(bindings.whole)) {
        const name = match[1] ?? match[2] ?? match[3];
        if (name !== undefined) into.add(name);
      }
    }
    for (const match of head.matchAll(FS_BINDINGS.members)) boundMembers(match[1] ?? match[2] ?? "", FS_MEMBERS, remove);
    for (const match of head.matchAll(HTTP_BINDINGS.members)) boundMembers(match[1] ?? match[2] ?? "", HTTP_MEMBERS, network);
    for (const match of head.matchAll(CHILD_PROCESS_BINDING)) {
      const name = match[1] ?? match[2] ?? match[3];
      if (name !== undefined) modules.add(name);
    }
    for (const match of head.matchAll(CHILD_PROCESS_MEMBER_BINDING)) {
      for (const part of (match[1] ?? match[2] ?? "").split(",")) {
        const bound = /^\s*([A-Za-z_$][\w$]*)\s*(?:\bas\b|:)\s*([A-Za-z_$][\w$]*)/.exec(part);
        if (bound?.[1] !== undefined && bound[2] !== undefined && SPAWNING_MEMBERS.has(bound[1])) spawn.add(bound[2]);
      }
    }
    for (const match of head.matchAll(PY_IMPORT)) {
      for (const part of (match[1] ?? "").split(",")) {
        const item = PY_ITEM.exec(part.trim());
        const module = item?.[1];
        if (module !== undefined && item?.[2] !== undefined && Object.hasOwn(py, module)) py[module as keyof typeof py].add(item[2]);
      }
    }
    for (const match of head.matchAll(PY_FROM_IMPORT)) {
      const from = match[1] ?? "";
      for (const part of (match[2] ?? match[3] ?? "").split(",")) {
        const item = PY_ITEM.exec(part.trim());
        const name = item?.[1];
        if (name === undefined) continue;
        const bound = item?.[2] ?? name;
        if (from === "urllib" && name === "request") py["urllib.request"].add(bound);
        if (PY_MEMBERS[from]?.spawn.includes(name) === true) spawn.add(bound);
        if (PY_MEMBERS[from]?.network.includes(name) === true) network.add(bound);
        if (PY_MEMBERS[from]?.delete.includes(name) === true) remove.add(bound);
      }
    }
  }
  const members = alternation(SPAWNING_MEMBERS);
  const spawnSource = [
    `(?:child_process|childProcess|cp${modules.size === 0 ? "" : `|${alternation(modules)}`})\\.(?:${members})`,
    `require\\(\\s*["'](?:node:)?child_process["']\\s*\\)\\.(?:${members})`,
    `(?:subprocess${py.subprocess.size === 0 ? "" : `|${alternation(py.subprocess)}`})\\.(?:${alternation(PY_MEMBERS["subprocess"]?.spawn ?? [])})`,
    `(?:os${py.os.size === 0 ? "" : `|${alternation(py.os)}`})\\.(?:system|popen)`,
    `(?:${members}${spawn.size === 0 ? "" : `|${alternation(spawn)}`})`,
  ].join("|");
  const networkSource = [
    `(?:https?${http.size === 0 ? "" : `|${alternation(http)}`})\\.(?:request|get)`,
    "fetch",
    `(?:axios${axios.size === 0 ? "" : `|${alternation(axios)}`})(?:\\.\\w+)?`,
    `(?:requests${py.requests.size === 0 ? "" : `|${alternation(py.requests)}`})\\.(?:${alternation(PY_MEMBERS["requests"]?.network ?? [])})`,
    `(?:urllib\\.request${py["urllib.request"].size === 0 ? "" : `|${alternation(py["urllib.request"])}`})\\.urlopen`,
    ...(network.size === 0 ? [] : [`(?:${alternation(network)})`]),
  ].join("|");
  // The member alone on the right, never a call of it (`cp.exec(…)`), a property of it or a longer name.
  const assigned = (source: string): RegExp =>
    new RegExp(
      `(?<![\\w$.])(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*(?:(?:\\butil\\.)?promisify\\(\\s*(?:${source})\\s*\\)|(?:${source})(?![\\w$.(]))`,
      "g",
    );
  for (const [source, into] of [[spawnSource, spawn], [networkSource, network]] as const) {
    const pattern = assigned(source);
    for (const head of heads) for (const match of head.matchAll(pattern)) if (match[1] !== undefined) into.add(match[1]);
  }
  return {
    modules: [...modules],
    pySubprocess: [...py.subprocess],
    pyOs: [...py.os],
    pyRequest: [...py["urllib.request"]],
    pyRequests: [...py.requests],
    pyShutil: [...py.shutil],
    http: [...http],
    axios: [...axios],
    spawn: [...spawn],
    network: [...network],
    delete: [...remove],
  };
}

/**
 * The calls through a file's own names, per rule: `process-spawn` the `exec`
 * call on one of its child_process names, a member call on its aliases of
 * Python's `subprocess` or `os`, and the bare call of a name bound to a
 * spawning member; `delete-or-overwrite` `rmtree` and `remove` on its aliases
 * of Python's `shutil` and `os` and the bare call of a name bound to a delete
 * or overwrite member; `network-or-registry` `urlopen` on its aliases of
 * `urllib.request`, a request on its aliases of `requests`, http, https and
 * axios, and the bare call of a name bound to a network member.
 */
function aliasCalls(names: FileNames): ReadonlyMap<string, RegExp> {
  const calls = new Map<string, RegExp>();
  const add = (rule: string, shapes: readonly string[]): void => {
    if (shapes.length > 0) calls.set(rule, new RegExp(`(?<![\\w$.])(?:${shapes.join("|")})`));
  };
  add("process-spawn", [
    ...(names.modules.length === 0 ? [] : [`(?:${alternation(names.modules)})\\.exec\\(`]),
    ...(names.pySubprocess.length === 0 ? [] : [`(?:${alternation(names.pySubprocess)})\\.(?:${alternation(PY_MEMBERS["subprocess"]?.spawn ?? [])})\\(`]),
    ...(names.pyOs.length === 0 ? [] : [`(?:${alternation(names.pyOs)})\\.(?:system|popen)\\(`]),
    ...(names.spawn.length === 0 ? [] : [`(?:${alternation(names.spawn)})\\(`]),
  ]);
  add("delete-or-overwrite", [
    ...(names.pyShutil.length === 0 ? [] : [`(?:${alternation(names.pyShutil)})\\.rmtree\\(`]),
    ...(names.pyOs.length === 0 ? [] : [`(?:${alternation(names.pyOs)})\\.remove\\(`]),
    ...(names.delete.length === 0 ? [] : [`(?:${alternation(names.delete)})\\(`]),
  ]);
  add("network-or-registry", [
    ...(names.pyRequest.length === 0 ? [] : [`(?:${alternation(names.pyRequest)})\\.urlopen\\(`]),
    ...(names.pyRequests.length === 0 ? [] : [`(?:${alternation(names.pyRequests)})\\.(?:${alternation(PY_MEMBERS["requests"]?.network ?? [])})\\(`]),
    ...(names.http.length === 0 ? [] : [`(?:${alternation(names.http)})\\.(?:request|get)\\(`]),
    ...(names.axios.length === 0 ? [] : [`(?:${alternation(names.axios)})(?:\\.\\w+)?\\(`]),
    ...(names.network.length === 0 ? [] : [`(?:${alternation(names.network)})\\(`]),
  ]);
  return calls;
}

/** The interpreter a `#!` line names, `env` and its options passed over, or `undefined` for a line that is none. */
function shebangInterpreter(line: string): string | undefined {
  if (!line.startsWith("#!")) return undefined;
  const words = line.slice(2).trim().split(/\s+/);
  const program = (word: string | undefined): string => (word ?? "").slice((word ?? "").lastIndexOf("/") + 1);
  if (program(words[0]) !== "env") return program(words[0]);
  return program(words.slice(1).find((word) => !word.startsWith("-") && !word.includes("=")));
}

/** What the line rules do with a file: read it, name it as a language they do not cover, or pass it over as no code. */
type LineReading = "read" | "uncovered" | "none";

/**
 * Whether the line rules read a hunk of this raw path (D3, review/85): a file
 * outside the built-in test globs whose extension is in
 * {@link LINE_RULE_EXTENSIONS}, or whose first line is a shebang naming a
 * covered interpreter, is read; another code file, by extension or by any
 * shebang, is `uncovered`. A listed path is read both ways and the stronger
 * reading kept, so no spelling hides a file's lines. A class file's wider
 * `tests` globs never apply here, as they never take code off the full gates
 * (review/47).
 */
function lineRulesRead(raw: string, source: PathSource, shebang: string | undefined): LineReading {
  const readings = source === "git" ? [raw] : [normalizePath(raw), resolveDots(raw)];
  const interpreter = shebang === undefined ? undefined : shebangInterpreter(shebang);
  const outcomes = new Set(
    readings.map((path): LineReading => {
      if (BUILT_IN_TEST_GLOBS.some((glob) => matchRead(path, glob))) return "none";
      const extension = posix.extname(path.slice(path.lastIndexOf("/") + 1)).toLowerCase();
      if (LINE_RULE_EXTENSIONS.has(extension)) return "read";
      if (interpreter !== undefined && LINE_RULE_INTERPRETER.test(interpreter)) return "read";
      return CODE_EXTENSIONS.includes(extension) || interpreter !== undefined ? "uncovered" : "none";
    }),
  );
  if (outcomes.has("read")) return "read";
  return outcomes.has("uncovered") ? "uncovered" : "none";
}

/**
 * Whether the line rules read a file of this path whose first line is
 * `firstLine` (review/125): a reader that must bound its reads reads these
 * first, so no budget leaves them unread.
 */
export function lineRulesCover(path: string, source: PathSource, firstLine: string | undefined): boolean {
  return lineRulesRead(path, source, firstLine) === "read";
}

/** Whether `rule` matches `text`: {@link WINDOWED_RULE} window by window, any other over the whole text. */
function ruleMatches(rule: LineRule, text: string): boolean {
  if (rule.id !== WINDOWED_RULE || text.length <= LINE_RULE_WINDOW) return rule.pattern.test(text);
  for (let start = 0; start + LINE_RULE_OVERLAP < text.length; start += LINE_RULE_WINDOW - LINE_RULE_OVERLAP) {
    if (rule.pattern.test(text.slice(start, start + LINE_RULE_WINDOW))) return true;
  }
  return false;
}

/**
 * The first line rule a hunk hits and where, never the line's text, or no
 * `hit`; and whether it held a line past {@link LINE_RULE_MAX_CHARS}, which no
 * rule reads. Added lines first, then removed lines, then, only in a hunk that
 * removes a line, its context lines. `calls` adds, per rule, the calls through
 * the file's own names for its modules and members ({@link aliasCalls}).
 */
function lineRuleHit(hunk: Hunk, path: string, calls: ReadonlyMap<string, RegExp> | undefined): { hit?: string; overCap: boolean } {
  let overCap = false;
  const matches = (rule: LineRule, text: string): boolean => {
    if (text.length > LINE_RULE_MAX_CHARS) {
      overCap = true;
      return false;
    }
    return ruleMatches(rule, text) || calls?.get(rule.id)?.test(text) === true;
  };
  const first = (lines: readonly string[]): LineRule | undefined =>
    SECURITY_LINE_RULES.find((rule) => lines.some((text) => matches(rule, text)));
  for (const added of hunk.added) {
    const rule = first([added.text]);
    if (rule !== undefined) return { hit: `${rule.id} at ${path}:${added.line}`, overCap };
  }
  if (hunk.removed.length === 0) return { overCap };
  const removed = first(hunk.removed);
  if (removed !== undefined) return { hit: `${removed.id} at ${path}, a removed line`, overCap };
  const context = first(hunk.context);
  return context === undefined
    ? { overCap }
    : { hit: `${context.id} at ${path}, a context line of a hunk that removes one`, overCap };
}

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

/**
 * The engine's own record paths. The one rule the config floor does not bind
 * (review/55): a data file the engine writes there (a ledger, a QA evidence
 * file) stays `records`. Matched by identity, so a caller's rule with the same
 * globs is bound as any other; code and extensionless files there keep the floor.
 */
const RECORDS_RULE: ClassRule = {
  class: "records",
  paths: [".stamity/runs/**", ".stamity/inbox.md", ".stamity/handoffs/**"],
  rationale: "work-run records, the inbox and handoffs: read back as data, never as authority",
};

/** The generic rules every repository gets, before its own class file. */
export const BUILT_IN_RULES: readonly ClassRule[] = [
  RECORDS_RULE,
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
 * (review/47), the built-in records rule excepted (review/55), compared lower-cased; `.env` and `.env.<anything>` are matched by
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

/** `*`: any run of characters inside one segment. */
const STAR = 0;
/** `**` not followed by `/`: any run of characters, a line terminator included, across segments (review/71). */
const ANY = 1;
/** `**` followed by `/`: any run of whole segments, none included, each with its `/`. */
const SEGMENTS = 2;

/** One step of a compiled glob: a wildcard, or one literal UTF-16 code unit (canonical when folding case). */
type GlobStep = typeof STAR | typeof ANY | typeof SEGMENTS | string;

const globCache = new Map<string, readonly GlobStep[]>();

/** A code unit compared without case, by the rule a non-Unicode `i` regular expression applies. */
function canonical(unit: string): string {
  const upper = unit.toUpperCase();
  if (upper.length !== 1) return unit;
  return unit.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128 ? unit : upper;
}

/** `**` spans segments (`**` followed by `/` spans none too), `*` stays in one, the rest is literal. */
function compileGlob(glob: string, foldCase: boolean): readonly GlobStep[] {
  const key = `${foldCase ? "i" : "-"}${glob}`;
  const cached = globCache.get(key);
  if (cached !== undefined) return cached;
  const source = normalizePath(glob);
  const steps: GlobStep[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("**/", index)) {
      steps.push(SEGMENTS);
      index += 3;
    } else if (source.startsWith("**", index)) {
      steps.push(ANY);
      index += 2;
    } else if (source[index] === "*") {
      steps.push(STAR);
      index += 1;
    } else {
      const unit = source[index] ?? "";
      steps.push(foldCase ? canonical(unit) : unit);
      index += 1;
    }
  }
  globCache.set(key, steps);
  return steps;
}

/**
 * Whether `path` meets the compiled `steps` (review/50). Every possible position
 * in the glob is carried forward together, one path character at a time, so the
 * cost is at most the glob's steps times the path's length and nothing
 * backtracks, whatever the glob's wildcards. `at[i]` is "before step i";
 * `inside[i]` is "inside one segment of the `**` + `/` at step i, before its `/`".
 */
function globMatches(steps: readonly GlobStep[], path: string, foldCase: boolean): boolean {
  const size = steps.length + 1;
  let at = new Uint8Array(size);
  let inside = new Uint8Array(size);
  let nextAt = new Uint8Array(size);
  let nextInside = new Uint8Array(size);
  // A wildcard may match nothing, so being before one is also being after it.
  const skipEmpty = (state: Uint8Array): void => {
    for (let i = 0; i < steps.length; i += 1) if (state[i] === 1 && typeof steps[i] === "number") state[i + 1] = 1;
  };
  at[0] = 1;
  skipEmpty(at);
  for (let k = 0; k < path.length; k += 1) {
    const unit = path[k] ?? "";
    const read = foldCase ? canonical(unit) : unit;
    nextAt.fill(0);
    nextInside.fill(0);
    let live = false;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (at[i] === 1) {
        if (step === STAR) {
          if (unit !== "/") nextAt[i] = 1;
        } else if (step === ANY) {
          nextAt[i] = 1;
        } else if (step === SEGMENTS) {
          if (unit === "/") nextAt[i] = 1;
          else nextInside[i] = 1;
        } else if (step === read) {
          nextAt[i + 1] = 1;
        }
      }
      if (inside[i] === 1) {
        if (unit === "/") nextAt[i] = 1;
        else nextInside[i] = 1;
      }
    }
    skipEmpty(nextAt);
    for (let i = 0; i < size && !live; i += 1) live = nextAt[i] === 1 || nextInside[i] === 1;
    [at, nextAt] = [nextAt, at];
    [inside, nextInside] = [nextInside, inside];
    if (!live) return false;
  }
  return at[steps.length] === 1;
}

/**
 * Whether `path` matches `glob`, both read as POSIX paths. `literal` reads a
 * name git gave: no separator rewrite, so a backslash stays a filename
 * character (review/20). `foldCase` matches without case.
 */
export function matchGlob(path: string, glob: string, options: { literal?: boolean; foldCase?: boolean } = {}): boolean {
  const read = options.literal === true ? path : normalizePath(path);
  return matchRead(read, glob, options.foldCase === true);
}

/** Whether an already-read `path` matches `glob`: no second separator rewrite, so a literal backslash stays one. */
function matchRead(path: string, glob: string, foldCase = false): boolean {
  return globMatches(compileGlob(glob, foldCase), path, foldCase);
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
  const config = !code && isConfigPath(path);
  const builtInTest = code && BUILT_IN_TEST_GLOBS.some((glob) => matchRead(path, glob));
  let best: { class: ChangeClass; rule: string } | undefined;
  let floored = false;
  const fromFile: { class: ChangeClass; glob: string; refused: boolean }[] = [];
  for (const rule of rules) {
    const glob = rule.paths.find((candidate) => matchRead(path, candidate, rule.foldCase === true));
    if (glob === undefined) continue;
    // The floor (review/47): no records or docs for code, config or extensionless files; tests for code only under a built-in test glob.
    // A config file under the engine's own record paths stays records (review/55).
    const heldOut = NOT_FOR_CODE.has(rule.class) && (code || (config && rule !== RECORDS_RULE));
    const refused = heldOut || (code && rule.class === "tests" && !builtInTest);
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
  /** The change's diff hunks, for the security line rules; a hunk's path is placed too. */
  hunks?: readonly Hunk[];
  /**
   * Files the read could not show (plan/62, review/94); any makes the class at
   * least `product`, and a code one `security-sensitive` (review/125).
   */
  unscanned?: readonly string[];
  /** Those of `unscanned` the reader knows are code though no extension says so: a covered shebang, or an unread file git records executable (review/138, review/146, review/200). */
  unscannedCode?: readonly string[];
  /** The changed npm lockfiles' two copies, for the audit-first rule; `base` is `null` when no base copy was read. */
  lockfiles?: readonly Lockfile[];
}

/**
 * One changed lockfile: its project-relative path, the base commit's copy (or
 * `null`, with why when the read failed) and the work tree's, and whether the
 * index copy `git commit` records is the work tree's to the byte (review/155).
 */
export interface Lockfile {
  path: string;
  base: string | null;
  head: string;
  staged: "same" | "differs" | "unread";
  /** Why the base copy's read failed, named in the reason (build/78). */
  baseFailure?: string;
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
  const lineHits: string[] = [];
  const uncovered = new Set<string>();
  const overCap = new Set<string>();
  // Per file: its shebang (the head's first line, or an added line 1) and its names for the child_process module.
  const files = new Map<string, Hunk[]>();
  for (const hunk of input.hunks ?? []) files.set(hunk.path, [...(files.get(hunk.path) ?? []), hunk]);
  const facts = new Map(
    [...files].map(([raw, hunks]) => {
      const heads = hunks.flatMap((hunk) => (hunk.head === undefined ? [] : [hunk.head]));
      const firstAdded = hunks.flatMap((hunk) => hunk.added).find((added) => added.line === 1)?.text;
      const shebang = heads[0]?.split("\n", 1)[0] ?? firstAdded;
      const lines = hunks.flatMap((hunk) => [...hunk.added.map((added) => added.text), ...hunk.removed, ...hunk.context]);
      return [raw, { shebang, calls: aliasCalls(fileNames([...heads, ...lines])) }] as const;
    }),
  );
  for (const hunk of input.hunks ?? []) {
    add(hunk.path);
    const entry = byPath.find((placed) => placed.path === readRaw(hunk.path)?.path);
    const fileFacts = facts.get(hunk.path);
    if (entry === undefined) continue;
    const reading = lineRulesRead(hunk.path, source, fileFacts?.shebang);
    if (reading === "uncovered") uncovered.add(entry.path);
    if (reading !== "read") continue;
    const { hit, overCap: wasOver } = lineRuleHit(hunk, entry.path, fileFacts?.calls);
    if (wasOver) overCap.add(entry.path);
    if (hit === undefined) continue;
    lineHits.push(hit);
    if (rank("security-sensitive") < rank(entry.class)) {
      entry.class = "security-sensitive";
      entry.rule = `line rule ${hit}`;
      index.set(entry.path, entry.class);
    }
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
  // review/125: no line rule read an unscanned code file, so the lens reads it, as for a failed read.
  const shebangCode = new Set(input.unscannedCode ?? []);
  const isCode = (path: string): boolean => hasCodeExtension(path) || shebangCode.has(path);
  const unscannedCode = (input.unscanned ?? []).filter((path) => isCode(path));
  const unscanned = (input.unscanned ?? []).filter((path) => !isCode(path));
  if (unscannedCode.length > 0) {
    const one = unscannedCode.length === 1;
    reasons.push(
      `${unscannedCode.length} changed code file${one ? "" : "s"} the read could not show ${one ? "is" : "are"} unscanned, so the class is security-sensitive and its lens reads ${one ? "it" : "them"}: ${namePaths(unscannedCode)}`,
    );
    atLeastProduct.push("security-sensitive");
  }
  if (unscanned.length > 0) {
    const one = unscanned.length === 1;
    reasons.push(
      `${unscanned.length} changed file${one ? "" : "s"} the read could not show ${one ? "is" : "are"} unscanned, so the class is at least product: ${namePaths(unscanned)}`,
    );
    atLeastProduct.push("product");
  }
  if (overCap.size > 0) {
    reasons.push(
      `a line longer than ${LINE_RULE_MAX_CHARS} characters was not read, so the class is security-sensitive and its lens reads it: ${namePaths([...overCap])}`,
    );
    atLeastProduct.push("security-sensitive");
  }
  if (lineHits.length > 0) reasons.push(`the security line rules hit: ${namePaths(lineHits)}`);
  if (uncovered.size > 0) reasons.push(`read by no line rule, as none covers its language: ${namePaths([...uncovered])}`);
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

  // S7 (a): a proven lockfile-only bump runs the dependency audit first, in place of the security lens.
  const raisedByLines = atLeastProduct.includes("security-sensitive");
  const refusal = cls === "security-sensitive" && !raisedByLines ? auditFirstRefusal(input, byPath) : undefined;
  const auditFirst = refusal === null;
  if (auditFirst) reasons.push(AUDIT_FIRST_REASON);
  else if (refusal !== undefined) reasons.push(`the security lens stays: ${refusal}`);

  // The security lens first when the class asks for it, then every row the paths match, each once.
  const lenses = new Set<string>(cls === "security-sensitive" && !auditFirst ? [SECURITY_LENS] : []);
  for (const entry of byPath) {
    for (const lens of specialistsForPath(entry.path, triggers)) if (!(auditFirst && lens === SECURITY_LENS)) lenses.add(lens);
  }

  return {
    class: cls,
    byPath,
    checks: [...CLASS_CHECKS[cls], ...(auditFirst ? (["dependency-audit"] as const) : [])],
    lenses: [...lenses],
    reason: reasons.join("; "),
  };
}

// ── Audit first (S7 (a), REQ-FLOW-065) ───────────────────────────────────────

/** The reason clause of a change the audit-first rule took off the security lens. */
export const AUDIT_FIRST_REASON = "lockfile-only bump: dependency audit first";

/** The one lockfile format whose two copies prove a bump: npm's, which records `hasInstallScript` per entry. */
const NPM_LOCKFILE = "package-lock.json";
/** The npm lockfile versions whose `packages` map carries `hasInstallScript`. */
const PROVEN_LOCKFILE_VERSIONS: ReadonlySet<unknown> = new Set([2, 3]);
/** The lockfile names a refusal is worth naming for: a change holding none of them was never a bump. */
const LOCKFILE_NAMES: ReadonlySet<string> = new Set([NPM_LOCKFILE, "pnpm-lock.yaml", "yarn.lock"]);

const basenameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** A lockfile copy's `packages` map and its legacy `dependencies` tree flattened under the same keys. */
interface LockCopy {
  packages: Map<string, Record<string, unknown>>;
  legacy: Map<string, Record<string, unknown>>;
}

/** The clause of a bump that adds a package the base copy's graph does not hold (review/163). */
const NEW_PACKAGE = "adds a package new to the graph";

/** A legacy `dependencies` tree deeper than this proves nothing. */
const LEGACY_MAX_DEPTH = 64;

/**
 * A legacy `dependencies` tree (review/158) flattened into `into` under the
 * `packages` map's keys (`node_modules/a/node_modules/b`), each entry without
 * its nested tree, or why it proves nothing.
 */
function flattenLegacy(tree: unknown, prefix: string, depth: number, into: Map<string, Record<string, unknown>>): string | undefined {
  if (!isRecord(tree)) return "holds a legacy dependencies section that is not an object";
  if (depth > LEGACY_MAX_DEPTH) return `nests its legacy dependencies deeper than ${LEGACY_MAX_DEPTH}`;
  for (const [name, entry] of Object.entries(tree)) {
    if (!isRecord(entry)) return "holds a legacy dependencies entry that is not an object";
    const key = `${prefix}node_modules/${name}`;
    const { dependencies: nested, ...own } = entry;
    into.set(key, own);
    if (nested === undefined) continue;
    const why = flattenLegacy(nested, `${key}/`, depth + 1, into);
    if (why !== undefined) return why;
  }
  return undefined;
}

/** A lockfile copy's `packages` map, each entry an object, and its legacy tree, or why the copy proves nothing. */
function lockCopy(text: string): LockCopy | string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "does not parse";
  }
  if (!isRecord(value)) return "is not a JSON object";
  if (!PROVEN_LOCKFILE_VERSIONS.has(value["lockfileVersion"])) return "is not at lockfileVersion 2 or 3";
  const packages = value["packages"];
  if (!isRecord(packages)) return "holds no packages map";
  const copy: LockCopy = { packages: new Map(), legacy: new Map() };
  for (const [key, entry] of Object.entries(packages)) {
    if (!isRecord(entry)) return "holds a package entry that is not an object";
    copy.packages.set(key, entry);
  }
  // npm 6 and other readers install from the legacy tree, so it is read wherever it is present.
  if (value["dependencies"] !== undefined) return flattenLegacy(value["dependencies"], "", 0, copy.legacy) ?? copy;
  return copy;
}

/** An entry's `resolved` as a URL, or `undefined` for none or one that does not parse. */
function resolvedUrl(entry: Record<string, unknown> | undefined): URL | undefined {
  const resolved = entry?.["resolved"];
  if (typeof resolved !== "string") return undefined;
  try {
    return new URL(resolved);
  } catch {
    return undefined;
  }
}

/** An npm package name as a registry path carries it, scoped or not; anything else proves no tarball. */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;
/** A version as a registry tarball's file name carries it: no separator, no escape, no dot segment. */
const TARBALL_VERSION = /^[0-9a-z][0-9a-z.+-]*$/i;

/** The package an entry installs: its `name` (an npm alias) or its key's last `node_modules/` segment. */
function entryName(key: string, entry: Record<string, unknown>): string {
  const name = entry["name"];
  if (typeof name === "string") return name;
  const at = key.lastIndexOf("node_modules/");
  return at < 0 ? key : key.slice(at + "node_modules/".length);
}

/** A registry tarball path's tail for `name` at `version`: `/<name>/-/<basename>-<version>.tgz`, or `undefined` for a shape that proves none. */
function tarballTail(name: string, version: unknown): string | undefined {
  if (!PACKAGE_NAME.test(name) || typeof version !== "string" || !TARBALL_VERSION.test(version)) return undefined;
  return `/${name}/-/${name.slice(name.indexOf("/") + 1)}-${version}.tgz`;
}

const OFF_SOURCE = "resolves a changed package from a source that is no https tarball on the origin its base entry resolves from";
const OFF_TARBALL = "resolves a changed package from a tarball that is not its own name and version on its base entry's registry path";
const NOT_UPGRADE = "moves a package to a version that is no semver upgrade of its base entry's";

/** A semver 2.0.0 version: its core, its prerelease identifiers, and build metadata the order ignores. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i;

/** Two digit strings with no leading zero, ordered by value. */
function compareDigits(a: string, b: string): number {
  return a.length === b.length ? (a < b ? -1 : a > b ? 1 : 0) : a.length - b.length;
}

/** Two prerelease identifiers in semver precedence: numeric below alphanumeric, each its own way. */
function compareIdentifier(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) return compareDigits(a, b);
  if (numeric.test(a) !== numeric.test(b)) return numeric.test(a) ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whether `to` is a higher semver version than `from` (review/183): a rollback, a move semver cannot order
 * (either side no semver version) or one between versions of equal precedence is none. Written here, not
 * imported: the CI `changes` job loads this module with no install (`scripts/ci/records-only.mjs`).
 */
function isUpgrade(from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string") return false;
  const a = SEMVER.exec(from);
  const b = SEMVER.exec(to);
  if (a === null || b === null) return false;
  for (const part of [1, 2, 3]) {
    const order = compareDigits(b[part] ?? "", a[part] ?? "");
    if (order !== 0) return order > 0;
  }
  const before = a[4]?.split(".");
  const after = b[4]?.split(".");
  // A release outranks its own prereleases.
  if (before === undefined || after === undefined) return before !== undefined && after === undefined;
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    const x = before[index];
    const y = after[index];
    if (x === undefined || y === undefined) return x === undefined;
    const order = compareIdentifier(y, x);
    if (order !== 0) return order > 0;
  }
  return false;
}

/**
 * Why one entry that differs between the copies is no proven bump (review/157),
 * or `undefined`: no install script, no link, a base twin (a package new to the
 * graph refuses, review/163), a `resolved` that is an `https` URL with no
 * credentials, query or fragment on the same origin as its base twin's (never
 * `git+`, `file:`, `github:` or another host), no `resolved` or `integrity`
 * moved at an unchanged version, and — the base twin resolving a registry
 * tarball, `/<name>/-/<basename>-<version>.tgz` under some prefix — the head
 * path the same prefix and tarball for the entry's own name at its head
 * version (review/171), and a version that moves only to a higher semver
 * version (review/183). A base twin resolving anything else proves no head
 * source. The project's own root entry (`""`) installs from no source. The
 * clauses name no key: the key is the change's own text.
 */
function entryRefusal(key: string, entry: Record<string, unknown>, before: Record<string, unknown> | undefined): string | undefined {
  const script = entry["hasInstallScript"];
  if (script !== undefined && script !== false) return "bumps a package with an install script";
  const link = entry["link"];
  if (link !== undefined && link !== false) return "links a package";
  if (key === "") return undefined;
  if (before === undefined) return NEW_PACKAGE;
  const url = resolvedUrl(entry);
  const was = resolvedUrl(before);
  if (url?.protocol !== "https:" || was === undefined || url.origin !== was.origin || url.username !== "" || url.password !== "") {
    return OFF_SOURCE;
  }
  if (before["version"] === entry["version"] && (before["resolved"] !== entry["resolved"] || before["integrity"] !== entry["integrity"])) {
    return "moves a package's resolved or integrity at an unchanged version";
  }
  const name = entryName(key, entry);
  const baseTail = tarballTail(entryName(key, before), before["version"]);
  const headTail = tarballTail(name, entry["version"]);
  if (name !== entryName(key, before) || baseTail === undefined || headTail === undefined || !was.pathname.endsWith(baseTail)) return OFF_TARBALL;
  const prefix = was.pathname.slice(0, was.pathname.length - baseTail.length);
  if (url.pathname !== `${prefix}${headTail}` || url.search !== "" || url.hash !== "") return OFF_TARBALL;
  // review/183: a rollback is no audit class's move, so a version that moves and is no upgrade keeps the lens.
  if (before["version"] !== entry["version"] && !isUpgrade(before["version"], entry["version"])) return NOT_UPGRADE;
  return undefined;
}

/**
 * Why one security-placed path is no proven npm lockfile bump, or `undefined`
 * when it is: its staged copy is the work tree's (review/155), both copies
 * parse at `lockfileVersion` 2 or 3, and each `packages` entry that differs
 * between them passes {@link entryRefusal}, an install script refusing whether
 * the entry is new there or had one at base too (plan/12, plan/52); each legacy
 * `dependencies` entry that differs has a `packages` twin at its version and
 * passes the same checks (review/158). A package new to the graph, a
 * `packages` key or a legacy entry absent at base, refuses too: no audit flags
 * a new dependency with no advisory yet (review/163); a removed one does not.
 * Any value of `hasInstallScript` but
 * absent or `false` counts as one.
 */
function lockfileRefusal(path: string, lockfiles: readonly Lockfile[]): string | undefined {
  if (basenameOf(path) !== NPM_LOCKFILE) return `${path} is not an npm lockfile`;
  const lockfile = lockfiles.find((candidate) => candidate.path === path);
  if (lockfile === undefined) return `${path} was not read`;
  if (lockfile.base === null) return `${path} has no base copy${lockfile.baseFailure === undefined ? "" : ` (${lockfile.baseFailure})`}`;
  if (lockfile.staged === "unread") return `${path}'s staged copy was not read`;
  if (lockfile.staged !== "same") return `${path}'s staged copy differs from the work tree's`;
  const base = lockCopy(lockfile.base);
  if (typeof base === "string") return `${path}'s base copy ${base}`;
  const head = lockCopy(lockfile.head);
  if (typeof head === "string") return `${path}'s head copy ${head}`;
  const changed = (entry: Record<string, unknown>, before: Record<string, unknown> | undefined): boolean =>
    JSON.stringify(entry) !== JSON.stringify(before);
  for (const [key, entry] of head.packages) {
    const before = base.packages.get(key);
    const why = changed(entry, before) ? entryRefusal(key, entry, before) : undefined;
    if (why !== undefined) return `${path} ${why}`;
  }
  for (const [key, entry] of head.legacy) {
    const before = base.legacy.get(key);
    if (!changed(entry, before)) continue;
    if (head.packages.get(key)?.["version"] !== entry["version"]) {
      return `${path} holds a legacy dependencies entry with no packages twin at its version`;
    }
    const why = entryRefusal(key, entry, before);
    if (why !== undefined) return `${path} ${why}`;
  }
  return undefined;
}

/**
 * The audit-first rule over a `security-sensitive` change its paths placed:
 * `null` when it holds — every security-placed path is a proven npm lockfile
 * bump and no `package.json` changed — or why it does not. `undefined` when no
 * security-placed path is a lockfile, so there is no bump to name a refusal for.
 */
function auditFirstRefusal(input: ClassifyInput, byPath: readonly PathClass[]): string | null | undefined {
  const placed = byPath.filter((entry) => entry.class === "security-sensitive").map((entry) => entry.path);
  if (!placed.some((path) => LOCKFILE_NAMES.has(basenameOf(path)))) return undefined;
  const manifest = byPath.find((entry) => basenameOf(entry.path).toLowerCase() === "package.json");
  if (manifest !== undefined) return `${manifest.path} changed`;
  for (const path of placed) {
    const why = lockfileRefusal(path, input.lockfiles ?? []);
    if (why !== undefined) return why;
  }
  return null;
}

/**
 * `result` with the security lens it needs once a read after the classifier
 * raises it to `security-sensitive` (an outside path, a failed line read): the
 * audit-first rule held only over the paths, so its check and its reason clause
 * go and the lens comes first. A result that has the lens comes back as it is.
 */
export function keepSecurityLens(result: ClassifyResult): ClassifyResult {
  if (result.lenses.includes(SECURITY_LENS)) return result;
  return {
    ...result,
    class: "security-sensitive",
    checks: [...CLASS_CHECKS["security-sensitive"]],
    lenses: [SECURITY_LENS, ...result.lenses],
    reason: result.reason
      .split("; ")
      .filter((clause) => clause !== AUDIT_FIRST_REASON)
      .join("; "),
  };
}

// ── The class file ───────────────────────────────────────────────────────────

/**
 * The classes whose rules raise a path, so they fold case (review/12) and are
 * the entries a refused file still applies (review/48); every other class
 * matches with case and lowers.
 */
const FOLDS_CASE: ReadonlySet<ChangeClass> = new Set(["product", "public-contract", "security-sensitive"]);

/**
 * Input limits on a class file's glob: at most this many characters, and this many `**`. They bound the size of
 * what is read, not the matching cost; that bound is the matcher's own ({@link globMatches}, review/50).
 */
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

/**
 * Whether a glob's last segment has an extension holding a wildcard (`**\/*.*`, `*.*`, `.*`, `x.m*`), so no
 * floor's extension list can say which file types it reaches (review/59). A last segment with no `.` names no
 * extension of its own, as `notes/**` and `*` do, and is not this shape.
 */
function hasWildcardExtension(glob: string): boolean {
  const last = lastSegment(glob);
  const dot = last.lastIndexOf(".");
  return dot !== -1 && last.slice(dot + 1).includes("*");
}

/**
 * Whether a glob's last segment holds a wildcard and ends in no concrete extension (`notes/**`, `*`, `**\/m*`,
 * `**\/*tf`, `*.`), so it reaches every file type below it and no floor's extension list bounds it (review/70).
 * A last segment with no `*` names one file and is not this shape.
 */
function lacksConcreteExtension(glob: string): boolean {
  const last = lastSegment(glob);
  if (!last.includes("*")) return false;
  const dot = last.lastIndexOf(".");
  return dot === -1 || dot === last.length - 1;
}

/** The last `/`-separated segment of a glob, read as {@link compileGlob} reads it. */
function lastSegment(glob: string): string {
  const normalized = normalizePath(glob);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/** Why a glob is over the input limits, or `undefined` (review/50); a test source's glob literal meets it too (review/62). */
export function globCostError(glob: string): string | undefined {
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
 * than it names. Every name a test selection emits meets it too (review/61).
 */
export function testEntryError(entry: string): string | undefined {
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
      } else if (NOT_FOR_CODE.has(key) && hasWildcardExtension(glob)) {
        errors.push(
          `${where}: the glob ${JSON.stringify(glob)} has a wildcard extension, and a ${key} glob's extension must be concrete, such as *.md`,
        );
      } else if (NOT_FOR_CODE.has(key) && lacksConcreteExtension(glob)) {
        errors.push(
          `${where}: the glob ${JSON.stringify(glob)} names no concrete extension, and a ${key} glob must end in one, such as **/*.md, or name a file`,
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
 * than `product` (the sign-off on plan/8), a `records` or `docs` glob whose
 * extension holds a wildcard (review/59) or whose last segment holds a wildcard
 * and ends in no concrete extension (review/70), a test entry that is not a plain
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
