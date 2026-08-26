import { DETECTION_UNKNOWN } from "../emit/substitution.ts";
import type { DetectedSummary } from "../types/detect.ts";
import type { PackageManagerName } from "./packageManager.ts";

/**
 * The commands that verify a change in this repository.
 *
 * Generated guidance must be able to say "run the tests" in a form the project
 * can actually execute. Hard-coding `npm run test` breaks the moment the repo
 * is a Cargo workspace or a pnpm monorepo, and an agent that runs a command
 * which does not exist reports a passing gate on a non-result. So the gates are
 * resolved here, from what detection found, and carried into content through
 * emission-time tokens rather than written into the corpus.
 *
 * **A gate the repository showed no evidence for is not invented.** Emitted
 * content presents these strings as detection-derived FACTS about the reader's
 * repo, so the answer for an unevidenced gate is ABSENCE. It renders through
 * {@link unresolvedGate}, which LEADS with the {@link DETECTION_UNKNOWN}
 * sentinel the charter already documents ("treat that item as unconfigured and
 * report it; do not invent a value") and then says what to do instead. That
 * sentinel is the one thing this module reads out of the emission layer: the
 * resolved values ARE substitution values, and a second spelling of the same
 * word would drift from the charter paragraph that defines it. The tail exists
 * because these four values land in command positions — see
 * {@link unresolvedGate}.
 *
 * **Why there is no build gate.** `all` chains lint, then type-check, then
 * tests, and stops at the first failure. A build step would be a fifth token
 * (`${STAMITY:VERIFY_GATE_BUILD}`) and the emission layer carries four
 * (`src/emit/substitution.ts` → `REPO_SUBSTITUTION_TOKENS`), so a row added
 * here would resolve into no emitted file. It is also largely covered: on the
 * compiled stacks the type-check gate IS the build (`stack build`,
 * `dotnet build --no-restore`, `sbt compile`, `swift build`, `dune build`,
 * `mvn -q compile`), and on Node a `build` script packages what `tsc --noEmit`
 * has already type-checked. Wiring a real build gate is a substitution-token
 * change plus a charter row, not a row in the table below.
 */

/**
 * Gate commands as the substitution layer consumes them: every field a string,
 * with an {@link unresolvedGate} sentence standing where the resolver had no
 * evidence.
 */
export interface VerificationGateCommands {
  test: string;
  lint: string;
  /** The static-analysis gate; equals `lint` for stacks with no separate type check. */
  typecheck: string;
  /** `lint`, `typecheck`, and `test` chained with `&&`, de-duplicated. */
  all: string;
}

/**
 * The resolver's own answer, before the sentinel is filled in.
 *
 * Every field is optional and an absent field means EXACTLY ONE thing: the
 * repository gave no evidence for that gate. Keeping absence in the type is
 * what makes the sentinel reachable at all — the previous shape forced a string
 * into every slot, so "no evidence" had to be spelled as somebody's default.
 */
export interface VerificationCommands {
  readonly test?: string;
  readonly lint?: string;
  readonly typecheck?: string;
  readonly all?: string;
}

/** One language's native commands. `typecheck` is absent when the stack has no such step. */
interface LanguageGate {
  test: string;
  lint: string;
  typecheck?: string;
}

/** How each package manager spells "run this script". */
const RUN_PREFIX: Record<PackageManagerName, string> = {
  npm: "npm run",
  pnpm: "pnpm run",
  yarn: "yarn",
  bun: "bun run",
};

/** Languages whose gates are package-manager scripts rather than fixed commands. */
const NODE_LANGUAGES: ReadonlySet<string> = new Set(["typescript", "javascript"]);

/**
 * Node gates for a run prefix. JavaScript takes `typed: false`: a plain JS repo
 * has no type-check script to call, and inventing one would produce a gate that
 * always fails.
 */
function nodeGate(prefix: string, typed: boolean): LanguageGate {
  return {
    test: `${prefix} test`,
    lint: `${prefix} lint`,
    ...(typed ? { typecheck: `${prefix} typecheck` } : {}),
  };
}

/**
 * Native gate commands per detected language.
 *
 * Every language detection can emit has a row. A missing row would send a
 * positively-identified stack to the Node defaults — emitting `npm run test`
 * into a pure sbt project, which is a wrong answer rather than a safe one.
 */
const LANGUAGE_GATES: Record<string, LanguageGate> = {
  typescript: nodeGate("npm run", true),
  javascript: nodeGate("npm run", false),
  python: { test: "pytest", lint: "ruff check .", typecheck: "mypy ." },
  go: { test: "go test ./...", lint: "golangci-lint run", typecheck: "go vet ./..." },
  rust: { test: "cargo test", lint: "cargo clippy -- -D warnings", typecheck: "cargo check" },
  java: { test: "mvn test", lint: "mvn checkstyle:check", typecheck: "mvn -q compile" },
  kotlin: { test: "gradle test", lint: "gradle ktlintCheck" },
  ruby: { test: "bundle exec rspec", lint: "bundle exec rubocop" },
  php: { test: "vendor/bin/phpunit", lint: "vendor/bin/phpstan analyse" },
  swift: { test: "swift test", lint: "swiftlint", typecheck: "swift build" },
  dart: { test: "dart test", lint: "dart analyze" },
  elixir: { test: "mix test", lint: "mix credo", typecheck: "mix dialyzer" },
  csharp: {
    test: "dotnet test",
    lint: "dotnet format --verify-no-changes",
    typecheck: "dotnet build --no-restore",
  },
  scala: { test: "sbt test", lint: "sbt scalafmtCheckAll", typecheck: "sbt compile" },
  zig: { test: "zig build test", lint: "zig fmt --check ." },
  ocaml: { test: "dune test", lint: "dune build @fmt", typecheck: "dune build" },
  haskell: { test: "stack test", lint: "hlint .", typecheck: "stack build" },
  clojure: { test: "lein test", lint: "clj-kondo --lint src" },
  lua: { test: "busted", lint: "luacheck ." },
};

/**
 * Declared gate precedence over the languages detection can report — the whole
 * ranking, in one reviewable place, and total over {@link LANGUAGE_GATES}.
 *
 * A polyglot repository detects several languages and gets ONE gate set (the
 * emission layer carries four gate tokens, not four per language), so something
 * decides. That decision used to be the order {@link LANGUAGE_GATES} happens to
 * be written in — a table order, not a ranking, and one that says nothing about
 * the repository. Two rules replace it, strongest evidence first:
 *
 * 1. **A declared script wins.** A root `package.json` declaring `test`, `lint`
 *    or `typecheck` is the repository stating its own gate. Nothing else the
 *    manifest persists is that direct, so a detected Node language plus a
 *    declared script outranks every file-presence indicator.
 * 2. **Otherwise this list decides, top down.** Toolchain languages whose root
 *    manifest declares the build for the whole repository come before the Node
 *    pair, because `package.json` is the commonest companion file in a polyglot
 *    repo — asset pipelines, docs sites, git hooks — and so the weakest evidence
 *    that npm scripts are that repo's gates.
 *
 * The runner-up is emitted nowhere: a Rust + TypeScript repo is given the Rust
 * gates and its other suite is named in no generated file. That is the known
 * limit of a four-token gate surface, stated here rather than left for a reader
 * to infer from a command that covers half their repository.
 */
const GATE_LANGUAGE_PRECEDENCE: readonly string[] = [
  "rust",
  "go",
  "java",
  "kotlin",
  "scala",
  "csharp",
  "swift",
  "dart",
  "elixir",
  "haskell",
  "ocaml",
  "clojure",
  "zig",
  "lua",
  "ruby",
  "php",
  "python",
  "typescript",
  "javascript",
];

/** Script names whose presence in the root manifest is the repo declaring a gate. */
const GATE_SCRIPTS: readonly string[] = ["test", "lint", "typecheck"];

/**
 * Node test runners as the binary a package runner can execute, preferred in
 * declaration order when a repo detected several.
 *
 * Only runners that ARE a Node binary appear. `pytest`, `rspec`, `go-test` and
 * `cargo-test` are detectable too, but a repo whose gates resolve through this
 * table is a Node repo, and naming a Python runner as its npm-side test command
 * would be a worse answer than naming none.
 */
const NODE_TEST_BINARIES: readonly (readonly [string, string])[] = [
  ["vitest", "vitest run"],
  ["jest", "jest"],
  ["mocha", "mocha"],
  ["playwright", "playwright test"],
  ["cypress", "cypress run"],
];

/**
 * Node linters as the binary a package runner can execute, same ordering rule.
 * `prettier` is last and is a formatter: `--check` is a real gate, but a repo
 * that also configured a linter should be told about the linter.
 */
const NODE_LINT_BINARIES: readonly (readonly [string, string])[] = [
  ["eslint", "eslint ."],
  ["biome", "biome check ."],
  ["oxlint", "oxlint"],
  ["prettier", "prettier --check ."],
];

/**
 * Fallback gates for a manifest carrying NO `detected` block at all — one
 * written before detection was persisted, or hand-built. Conventional npm
 * scripts, which is the answer that shape has always been given.
 *
 * This is not the "detection found nothing" answer. A `detected` block whose
 * lists are empty is a positive record — analysis ran, the repository showed
 * nothing — and it resolves to absent gates, not to these.
 */
export const DEFAULT_GATE_COMMANDS: VerificationGateCommands = filled(
  commandsFrom(nodeGate("npm run", true)),
);

// ── Manifest-side resolution ─────────────────────────────────────

/**
 * What the manifest persisted about this repository, as the gate resolver needs
 * it: a `Pick` of the real {@link DetectedSummary}, not a second declaration of
 * the same fields. The re-declaration it replaces claimed to keep this module a
 * leaf, which the first line of the file already falsified — and it is how the
 * resolver came to hard-code `vitest` and `eslint` while the runners detection
 * had actually recorded sat one field away, unreadable because the type did not
 * carry them.
 *
 * Every member optional, and an absent member means UNDETECTED — never
 * empty-and-therefore-default. A manifest written before a field existed
 * carries none of it.
 */
export type PersistedDetection = Partial<
  Pick<
    DetectedSummary,
    "languages" | "packageManager" | "packageScripts" | "testFrameworks" | "linters"
  >
>;

/**
 * How each package manager spells "run a binary that is not a declared script"
 * — the fallback form when the repo has no matching entry in `scripts`.
 *
 * npm takes `--no`, which refuses to install: a bare `npx <bin>` in generated
 * guidance is an instruction to fetch an unpinned package from the registry and
 * execute it, which is not what "run your linter" should mean. The other three
 * runners execute only what the project already has installed.
 */
const EXEC_PREFIX: Record<PackageManagerName, string> = {
  npm: "npx --no",
  pnpm: "pnpm exec",
  yarn: "yarn exec",
  bun: "bunx",
};

/**
 * Gate commands for a repository, from what the manifest recorded about it.
 *
 * The branch order, which is also what {@link verificationGatesFor} and every
 * emitted gate row follow:
 *
 * 1. **No `detected` block** → {@link DEFAULT_GATE_COMMANDS}. Absence of the
 *    record is not a record of absence.
 * 2. **A ranked non-Node language** ({@link GATE_LANGUAGE_PRECEDENCE}) → that
 *    language's native row, whole.
 * 3. **Node evidence** — a ranked Node language, a persisted package manager,
 *    or a persisted `scripts` block → {@link nodeCommands}: the script form for
 *    a script the repo declares, the detected runner's binary when it does not,
 *    and nothing at all when detection recorded no runner either.
 * 4. **Nothing** → every gate absent, which renders as the sentinel.
 *
 * Package-manager evidence IS read (step 3 picks the prefix from it), so a pnpm
 * or bun repo is never told to run `npm run test`; and a script is named only
 * once detection has seen it in the repo's `scripts` block.
 */
export function verificationCommandsFor(
  detected: PersistedDetection | undefined,
): VerificationCommands {
  if (detected === undefined) return DEFAULT_GATE_COMMANDS;

  const languages = stringList(detected.languages) ?? [];
  const scripts = stringList(detected.packageScripts);
  const found = rankedLanguage(languages, scripts);
  if (found !== null && !NODE_LANGUAGES.has(found.language)) return commandsFrom(found.gate);

  const name = detected.packageManager;
  if (found === null && name === undefined && scripts === undefined) return {};

  const manager: PackageManagerName =
    typeof name === "string" && Object.hasOwn(RUN_PREFIX, name)
      ? (name as PackageManagerName)
      : "npm";
  return nodeCommands(manager, found?.language ?? null, detected, scripts);
}

/**
 * {@link verificationCommandsFor} with the sentinel filled in — the shape the
 * substitution pass takes, where every token must resolve to some string.
 */
export function verificationGatesFor(
  detected: PersistedDetection | undefined,
): VerificationGateCommands {
  return filled(verificationCommandsFor(detected));
}

/** Absent gate → {@link unresolvedGate}; the charter documents what that word means. */
function filled(commands: VerificationCommands): VerificationGateCommands {
  return {
    test: commands.test ?? unresolvedGate("test"),
    lint: commands.lint ?? unresolvedGate("lint"),
    typecheck: commands.typecheck ?? unresolvedGate("typecheck"),
    all: commands.all ?? unresolvedGate("full-gate"),
  };
}

/**
 * What an unresolvable gate renders as — a sentence, not a word.
 *
 * These four tokens are substituted into COMMAND POSITIONS: "Run `X`", "It runs
 * `X` and reports", "| test | `X` |". The bare {@link DETECTION_UNKNOWN} put
 * the word `unknown` in each of them, so the first-run repository the onboarding
 * guide is written for — no lockfile, no wired scripts, nothing to detect —
 * told its agent to "Run `unknown`" in the Prove phase, and said the same thing
 * in six other touchpoint bodies. Branching at each site was the alternative and
 * it is the wrong shape: the reason a value cannot be run belongs to the value,
 * not to the seven places it is quoted.
 *
 * It still LEADS with {@link DETECTION_UNKNOWN} so the charter's legend and the
 * two bodies that already branch on the word keep matching, and the tail states
 * the only correct next action for an agent that finds it.
 */
export function unresolvedGate(kind: string): string {
  return `${DETECTION_UNKNOWN} — no ${kind} command detected; ask the user`;
}

/**
 * The detected language whose gates win, per {@link GATE_LANGUAGE_PRECEDENCE},
 * or `null` when no detected name carries a gate row. A name the table does not
 * carry says nothing about how to run the tests, so it is skipped rather than
 * collapsing the whole answer.
 */
function rankedLanguage(
  languages: readonly string[],
  scripts: readonly string[] | undefined,
): { language: string; gate: LanguageGate } | null {
  const detected = new Set(languages);

  if (scripts !== undefined && GATE_SCRIPTS.some((script) => scripts.includes(script))) {
    for (const node of NODE_LANGUAGES) {
      const gate = LANGUAGE_GATES[node];
      if (detected.has(node) && gate !== undefined) return { language: node, gate };
    }
  }

  for (const language of GATE_LANGUAGE_PRECEDENCE) {
    const gate = LANGUAGE_GATES[language];
    if (detected.has(language) && gate !== undefined) return { language, gate };
  }
  return null;
}

/**
 * Node gates for one repo: the script form when the repo declares the script,
 * the DETECTED runner's binary when it does not, and absence when detection
 * recorded no runner for that gate either — the `unknown` the charter reads as
 * "unconfigured", rather than a guess at somebody's favourite tool.
 *
 * When detection recorded no `scripts` block at all, the script form still
 * applies: absence of that record is not evidence of absence of the script (a
 * manifest predating the field carries none).
 */
function nodeCommands(
  manager: PackageManagerName,
  language: string | null,
  detected: PersistedDetection,
  scripts: readonly string[] | undefined,
): VerificationCommands {
  const run = RUN_PREFIX[manager];
  const exec = EXEC_PREFIX[manager];
  const gate = (script: string, binary: string | undefined): string | undefined => {
    if (scripts === undefined || scripts.includes(script)) return `${run} ${script}`;
    return binary === undefined ? undefined : `${exec} ${binary}`;
  };

  const test = gate("test", firstBinary(NODE_TEST_BINARIES, detected.testFrameworks));
  const lint = gate("lint", firstBinary(NODE_LINT_BINARIES, detected.linters));
  // TypeScript is the evidence for a type-check gate, and the only evidence:
  // `tsc` belongs to the language, not to the package manager. Plain JavaScript
  // has no separate type check, so it reports its linter — the static-analysis
  // pass it does have — on the same rule every other such stack follows. A repo
  // whose language was never identified reports neither: there is no stack to
  // name a pass for.
  const typecheck =
    language === "typescript"
      ? gate("typecheck", "tsc --noEmit")
      : language === "javascript"
        ? lint
        : undefined;

  return compose(test, lint, typecheck);
}

/** The first table row whose tool name detection reported, or `undefined`. */
function firstBinary(
  table: readonly (readonly [string, string])[],
  detected: readonly string[] | undefined,
): string | undefined {
  const names = stringList(detected);
  if (names === undefined) return undefined;
  const found = new Set(names);
  for (const [name, command] of table) {
    if (found.has(name)) return command;
  }
  return undefined;
}

/**
 * One language's own row as resolved commands. A stack with no separate
 * type-check step reports its linter for that gate — the static-analysis pass
 * it does have.
 */
function commandsFrom(gate: LanguageGate): VerificationCommands {
  return compose(gate.test, gate.lint, gate.typecheck ?? gate.lint);
}

/**
 * Chain the gates that exist. Lint runs first and the test suite last: the
 * cheapest signal should fail first, and a chain stops at the first failure.
 * Absent gates are omitted from `all` rather than joined as holes, and an `all`
 * with nothing in it is itself absent.
 */
function compose(
  test: string | undefined,
  lint: string | undefined,
  typecheck: string | undefined,
): VerificationCommands {
  const chain = [...new Set([lint, typecheck, test].filter((step) => step !== undefined))];
  return {
    ...(test === undefined ? {} : { test }),
    ...(lint === undefined ? {} : { lint }),
    ...(typecheck === undefined ? {} : { typecheck }),
    ...(chain.length === 0 ? {} : { all: chain.join(" && ") }),
  };
}

/**
 * A persisted list, or `undefined` when the field is absent or not a list of
 * strings. Defence in depth: a hand-edited or migration-sourced manifest can
 * reach here with any shape, and a non-list is no signal rather than a crash
 * inside a `.includes` call.
 */
function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === "string") ? (value as string[]) : undefined;
}
