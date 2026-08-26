import { describe, expect, it } from "vitest";
import { DETECTABLE_LANGUAGES } from "../../src/detect/repoAnalyzer.ts";
import {
  DEFAULT_GATE_COMMANDS,
  unresolvedGate,
  verificationCommandsFor,
  verificationGatesFor,
  type PersistedDetection,
} from "../../src/detect/verificationGates.ts";
import { DETECTION_UNKNOWN } from "../../src/emit/substitution.ts";

/**
 * The module that decides EVERY emitted gate command, under its own suite for
 * the first time.
 *
 * It had none: its behaviour was observed only sideways, through the charter
 * renderer and two golden fixtures, and four separate defects survived in it —
 * a hard-coded `vitest`/`eslint` exec fallback that ignored the runners
 * detection had recorded, an `npx` that would fetch an unpinned package from
 * the registry, a `found === null ? true` ternary that handed a type-check gate
 * to a repository with no identified language, and an `in`-operator table
 * lookup that accepted inherited prototype keys. Each has a case below, and
 * each case fails against the pre-fix resolver.
 *
 * The matrix the module actually branches on: four package managers × declared
 * vs undeclared script × recognised vs unrecognised language.
 */

/** A persisted summary carrying only the fields a case is about. */
function detection(over: PersistedDetection = {}): PersistedDetection {
  return { ...over };
}

/** The four managers with their run and exec spellings — the whole table, enumerated. */
const MANAGERS = [
  { name: "npm", run: "npm run", exec: "npx --no" },
  { name: "pnpm", run: "pnpm run", exec: "pnpm exec" },
  { name: "yarn", run: "yarn", exec: "yarn exec" },
  { name: "bun", run: "bun run", exec: "bunx" },
] as const;

describe("verificationCommandsFor — the four-manager matrix", () => {
  it("names the declared script, in each manager's own spelling", () => {
    for (const { name, run } of MANAGERS) {
      const commands = verificationCommandsFor(
        detection({
          languages: ["typescript"],
          packageManager: name,
          packageScripts: ["test", "lint", "typecheck"],
        }),
      );

      expect(commands, name).toEqual({
        test: `${run} test`,
        lint: `${run} lint`,
        typecheck: `${run} typecheck`,
        all: `${run} lint && ${run} typecheck && ${run} test`,
      });
    }
  });

  it("falls back to the DETECTED runner's binary when the script is not declared", () => {
    for (const { name, exec } of MANAGERS) {
      const commands = verificationCommandsFor(
        detection({
          languages: ["typescript"],
          packageManager: name,
          packageScripts: [],
          testFrameworks: ["vitest"],
          linters: ["eslint"],
        }),
      );

      expect(commands, name).toEqual({
        test: `${exec} vitest run`,
        lint: `${exec} eslint .`,
        typecheck: `${exec} tsc --noEmit`,
        all: `${exec} eslint . && ${exec} tsc --noEmit && ${exec} vitest run`,
      });
    }
  });

  it("gives an unrecognised language on package-manager evidence the Node scripts, minus the type check", () => {
    for (const { name, run } of MANAGERS) {
      const commands = verificationCommandsFor(
        detection({
          languages: ["klingon"],
          packageManager: name,
          packageScripts: ["test", "lint", "typecheck"],
        }),
      );

      // The scripts are named because the repo declares them; the type check is
      // NOT, because nothing identified a typed language. A `typecheck` script
      // can exist in a repo the engine cannot call typed.
      expect(commands, name).toEqual({
        test: `${run} test`,
        lint: `${run} lint`,
        all: `${run} lint && ${run} test`,
      });
    }
  });

  it("emits nothing at all for an unrecognised language with no evidence of any runner", () => {
    for (const { name } of MANAGERS) {
      const commands = verificationCommandsFor(
        detection({
          languages: ["klingon"],
          packageManager: name,
          packageScripts: [],
          testFrameworks: [],
          linters: [],
        }),
      );

      expect(commands, name).toEqual({});
    }
  });

  it("refuses an inherited prototype key as a package-manager name", () => {
    // `"constructor" in RUN_PREFIX` is true for every object alive, so the old
    // `in` guard accepted it and wrote `function Object() { [native code] }`
    // into every emitted charter and skill body. Object.hasOwn does not.
    for (const inherited of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const commands = verificationCommandsFor(
        detection({
          languages: ["typescript"],
          packageManager: inherited,
          packageScripts: ["test", "lint", "typecheck"],
        }),
      );

      expect(commands.test, inherited).toBe("npm run test");
      expect(JSON.stringify(commands), inherited).not.toContain("native code");
      expect(JSON.stringify(commands), inherited).not.toContain("function");
    }
  });
});

describe("verificationCommandsFor — what detection actually found", () => {
  it("picks the detected runner and linter, never a hard-coded vitest or eslint", () => {
    const commands = verificationCommandsFor(
      detection({
        languages: ["typescript"],
        packageScripts: [],
        testFrameworks: ["jest"],
        linters: ["biome"],
      }),
    );

    expect(commands.test).toBe("npx --no jest");
    expect(commands.lint).toBe("npx --no biome check .");
    expect(commands.all).not.toContain("vitest");
    expect(commands.all).not.toContain("eslint");
  });

  it("lets the repo's own script win over the detected runner", () => {
    const commands = verificationCommandsFor(
      detection({
        languages: ["typescript"],
        packageScripts: ["test", "lint"],
        testFrameworks: ["jest"],
        linters: ["biome"],
      }),
    );

    // The repo's command is authoritative: a declared `test` script is what the
    // project runs, whatever runner sits behind it.
    expect(commands.test).toBe("npm run test");
    expect(commands.lint).toBe("npm run lint");
  });

  it("prefers the first runner in the table when a repo configured several", () => {
    const commands = verificationCommandsFor(
      detection({
        languages: ["javascript"],
        packageScripts: [],
        testFrameworks: ["cypress", "vitest"],
        linters: ["prettier", "eslint"],
      }),
    );

    expect(commands.test).toBe("npx --no vitest run");
    expect(commands.lint).toBe("npx --no eslint .");
  });

  it("emits no test or lint command when the detected runner is not a Node binary", () => {
    // A Node repo that detected `pytest` (a stray conftest.py) gets no test
    // command rather than an npm-side invocation of a Python runner.
    const commands = verificationCommandsFor(
      detection({
        languages: ["javascript"],
        packageScripts: [],
        testFrameworks: ["pytest"],
        linters: ["ruff"],
      }),
    );

    expect(commands.test).toBeUndefined();
    expect(commands.lint).toBeUndefined();
    expect(commands.all).toBeUndefined();
  });

  it("treats a missing runner list as undetected, never as empty-and-therefore-default", () => {
    // A manifest written before `testFrameworks`/`linters` were carried here.
    // Absent is not the same as recorded-and-empty, but neither invents a tool:
    // both produce no exec fallback, and only a declared script names a command.
    const legacy = verificationCommandsFor(
      detection({ languages: ["typescript"], packageManager: "npm", packageScripts: [] }),
    );

    expect(legacy.test).toBeUndefined();
    expect(legacy.lint).toBeUndefined();
    expect(legacy.typecheck).toBe("npx --no tsc --noEmit");
    expect(legacy.all).toBe("npx --no tsc --noEmit");
  });
});

describe("verificationCommandsFor — the type-check gate", () => {
  it("gives a repo with no identified language no type-check gate at all", () => {
    const commands = verificationCommandsFor(
      detection({ languages: [], packageManager: "npm", packageScripts: ["test", "lint"] }),
    );

    expect(commands.typecheck).toBeUndefined();
    expect(commands.all).toBe("npm run lint && npm run test");
  });

  it("never hands a plain-JS repo a TypeScript type check", () => {
    const declared = verificationCommandsFor(
      detection({ languages: ["javascript"], packageScripts: ["test", "lint", "typecheck"] }),
    );
    const undeclared = verificationCommandsFor(
      detection({ languages: ["javascript"], packageScripts: [], linters: ["eslint"] }),
    );

    // JS has no separate type check, so it reports its static-analysis pass —
    // the linter — exactly as every other such stack does.
    expect(declared.typecheck).toBe("npm run lint");
    expect(undeclared.typecheck).toBe("npx --no eslint .");
    for (const commands of [declared, undeclared]) {
      expect(JSON.stringify(commands)).not.toContain("tsc");
    }
  });

  it("gives TypeScript the type check, from the script or from the compiler", () => {
    expect(
      verificationCommandsFor(detection({ languages: ["typescript"], packageScripts: ["typecheck"] }))
        .typecheck,
    ).toBe("npm run typecheck");
    expect(
      verificationCommandsFor(detection({ languages: ["typescript"], packageScripts: [] })).typecheck,
    ).toBe("npx --no tsc --noEmit");
  });

  it("pins the exec form to a non-installing runner", () => {
    // `npx <bin>` fetches an unpinned package from the registry and runs it.
    // Generated guidance must not say that; `npx --no` runs what is installed
    // or fails, and the other three runners are local-only already.
    const commands = verificationCommandsFor(
      detection({ languages: ["typescript"], packageManager: "npm", packageScripts: [] }),
    );

    expect(commands.typecheck).toContain("npx --no ");
    expect(commands.typecheck).not.toMatch(/npx (?!--no)/);
  });
});

describe("verificationCommandsFor — language ranking", () => {
  it("carries a gate row and a declared rank for every language detection can emit", () => {
    // Table completeness in both directions: a language with no LANGUAGE_GATES
    // row, or one missing from GATE_LANGUAGE_PRECEDENCE, resolves to the empty
    // answer instead of its own commands and fails here — which is the skew a
    // user would otherwise discover as a charter naming no test command.
    for (const language of DETECTABLE_LANGUAGES) {
      const alone = verificationCommandsFor(detection({ languages: [language] }));
      const behindNoise = verificationCommandsFor(detection({ languages: ["klingon", language] }));

      expect(alone.test, language).toBeTypeOf("string");
      expect(alone.lint, language).toBeTypeOf("string");
      expect(alone.all, language).toBeTypeOf("string");
      // An unrecognised name is skipped, not treated as the answer.
      expect(behindNoise, language).toEqual(alone);
    }
  });

  it("ranks by the declared precedence, not by the order detection listed the languages", () => {
    const pythonFirst = verificationCommandsFor(detection({ languages: ["python", "rust"] }));
    const rustFirst = verificationCommandsFor(detection({ languages: ["rust", "python"] }));

    // Both orders answer the same, and the answer is the ranked language — a
    // detection-order winner would give `pytest` for the first and `cargo test`
    // for the second, which is the same repository described two ways.
    expect(pythonFirst).toEqual(rustFirst);
    expect(rustFirst.test).toBe("cargo test");
  });

  it("puts a toolchain language ahead of a companion package.json", () => {
    const commands = verificationCommandsFor(
      detection({ languages: ["typescript", "rust"], packageManager: "npm" }),
    );

    // A Rust repo with a package.json for its asset pipeline is a Rust repo:
    // the lockfile is the weakest evidence of what the repo's gates are.
    expect(commands.test).toBe("cargo test");
  });

  it("lets a declared gate script pull the Node language back to the front", () => {
    const commands = verificationCommandsFor(
      detection({
        languages: ["typescript", "rust"],
        packageManager: "npm",
        packageScripts: ["test", "lint", "typecheck"],
      }),
    );

    // A declared script is the repository stating its own gate — the strongest
    // evidence the manifest carries, so it outranks a file-presence indicator.
    expect(commands.test).toBe("npm run test");
    expect(commands.typecheck).toBe("npm run typecheck");
  });

  it("resolves a non-Node language from its own row, package manager or not", () => {
    const commands = verificationCommandsFor(
      detection({ languages: ["go"], packageManager: "pnpm", packageScripts: ["test"] }),
    );

    expect(commands).toEqual({
      test: "go test ./...",
      lint: "golangci-lint run",
      typecheck: "go vet ./...",
      all: "golangci-lint run && go vet ./... && go test ./...",
    });
  });

  it("reports the linter as the static-analysis gate for a stack with no type check", () => {
    const commands = verificationCommandsFor(detection({ languages: ["ruby"] }));

    expect(commands.typecheck).toBe("bundle exec rubocop");
    // De-duplicated: the same command never runs twice in one chain.
    expect(commands.all).toBe("bundle exec rubocop && bundle exec rspec");
  });
});

describe("verificationCommandsFor — the composite", () => {
  it("omits absent gates from `all` instead of joining holes", () => {
    const commands = verificationCommandsFor(
      detection({ languages: [], packageScripts: [], testFrameworks: ["jest"], linters: [] }),
    );

    expect(commands).toEqual({ test: "npx --no jest", all: "npx --no jest" });
    expect(commands.all).not.toContain("undefined");
  });

  it("has no `all` when no gate resolved", () => {
    expect(verificationCommandsFor(detection({ languages: [] }))).toEqual({});
  });

  it("orders the chain cheapest-signal-first: lint, then type check, then tests", () => {
    const commands = verificationCommandsFor(
      detection({ languages: ["typescript"], packageScripts: ["test", "lint", "typecheck"] }),
    );

    expect(commands.all).toBe("npm run lint && npm run typecheck && npm run test");
  });
});

describe("verificationCommandsFor — hostile persisted shapes", () => {
  it("survives a hand-edited manifest whose list fields are not lists", () => {
    // Defence in depth behind `collectDetectedErrors`: a migration-sourced or
    // hand-edited manifest must not reach `.includes` on a string and throw a
    // raw TypeError out of emission.
    const hostile = {
      languages: "typescript",
      packageScripts: "test",
      testFrameworks: 7,
      linters: null,
    } as unknown as PersistedDetection;

    expect(() => verificationCommandsFor(hostile)).not.toThrow();
    expect(verificationCommandsFor(hostile)).toEqual({});
  });

  it("ignores a list holding non-strings", () => {
    const hostile = { languages: ["typescript", 7] } as unknown as PersistedDetection;

    expect(verificationCommandsFor(hostile)).toEqual({});
  });
});

describe("verificationGatesFor — the substitution view", () => {
  // TEST CHANGE, justified (strictly stronger): these four values are
  // substituted into COMMAND positions in the shipped corpus — "Run `X`", "It
  // runs `X`", "| test | `X` |" — so the bare word `unknown` told an agent in a
  // repository with nothing to detect to run a command called `unknown`, in
  // seven emitted bodies including the onboarding guide's Prove phase. The
  // sentinel still LEADS the value (the charter legend and the two corpus
  // bodies that branch on the word keep matching, and that is asserted), and
  // the assertions below now also pin the instruction that made it safe to
  // interpolate — which the equality-to-`unknown` assertions could not express.
  it("renders the documented sentinel plus its instruction for every unevidenced gate", () => {
    const gates = verificationGatesFor(
      detection({ languages: [], packageScripts: [], testFrameworks: [], linters: [] }),
    );

    expect(gates).toEqual({
      test: unresolvedGate("test"),
      lint: unresolvedGate("lint"),
      typecheck: unresolvedGate("typecheck"),
      all: unresolvedGate("full-gate"),
    });
    for (const value of Object.values(gates)) {
      expect(value.startsWith(DETECTION_UNKNOWN)).toBe(true);
      expect(value).toMatch(/ask the user/);
      // Never a bare word: a value equal to the sentinel is what reads as a
      // command in every position the corpus quotes it in.
      expect(value).not.toBe(DETECTION_UNKNOWN);
    }
  });

  it("renders the sentinel per gate, not per repository", () => {
    const gates = verificationGatesFor(
      detection({ languages: [], packageScripts: ["test"], testFrameworks: [], linters: [] }),
    );

    expect(gates.test).toBe("npm run test");
    expect(gates.lint).toBe(unresolvedGate("lint"));
    expect(gates.typecheck).toBe(unresolvedGate("typecheck"));
    expect(gates.all).toBe("npm run test");
  });

  it("keeps the conventional npm defaults for a manifest carrying no detection block", () => {
    // Absence of the record is not a record of absence: a manifest written
    // before detection was persisted gets the answer it has always been given.
    // A `detected` block whose lists are empty is a positive record and does
    // NOT come here — the case above proves it resolves to the sentinel.
    expect(verificationGatesFor(undefined)).toEqual(DEFAULT_GATE_COMMANDS);
    expect(DEFAULT_GATE_COMMANDS).toEqual({
      test: "npm run test",
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      all: "npm run lint && npm run typecheck && npm run test",
    });
  });

  it("agrees with the resolver it wraps on every gate that did resolve", () => {
    const fixtures: PersistedDetection[] = [
      { languages: ["python"] },
      { languages: ["typescript"], packageManager: "pnpm", packageScripts: ["test"] },
      { languages: [], packageScripts: [], testFrameworks: [], linters: [] },
      { languages: ["javascript"], packageScripts: [], linters: ["oxlint"] },
    ];

    for (const fixture of fixtures) {
      const commands = verificationCommandsFor(fixture);
      const gates = verificationGatesFor(fixture);
      const label = JSON.stringify(fixture);

      for (const key of ["test", "lint", "typecheck", "all"] as const) {
        const sentinel = unresolvedGate(key === "all" ? "full-gate" : key);
        expect(gates[key], `${label} ${key}`).toBe(commands[key] ?? sentinel);
      }
    }
  });
});
