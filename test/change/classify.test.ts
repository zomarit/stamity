import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_RULES,
  BUILT_IN_TEST_GLOBS,
  CLASS_CHECKS,
  CLASS_FILE,
  CLASS_ORDER,
  CODE_EXTENSIONS,
  classifyChange,
  matchGlob,
  mergeRules,
  outsideSecurityRule,
  parseClassFile,
  type ChangeClass,
  type ClassRule,
} from "../../src/change/classify.ts";
import { SPECIALIST_TRIGGER_TABLE, type SpecialistTrigger } from "../../src/roster/triggers.ts";

/**
 * p1a-classifier-verb (REQ-FLOW-061): the change classifier over a path list.
 *
 * Pure module, no filesystem and no git: every input is a path string, so no
 * double stands in for anything here. Every case that asserts a class other than
 * `product` is non-degenerate on purpose — `product` is what an unplaced path and
 * every fail-closed branch return, so a classifier that placed nothing would
 * pass any case expecting it.
 */

/** A fixture rule set that places one path per class, beyond the built-ins. */
const FIXTURE_RULES: readonly ClassRule[] = [
  ...BUILT_IN_RULES,
  { class: "tests", paths: ["test/**"], rationale: "fixture: the test tree" },
  { class: "config", paths: ["tsconfig*.json"], rationale: "fixture: tool configuration" },
  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, p1d-classify-security-row.
   * This fixture placed `src/api/**` in public-contract. The trigger roster's security row
   * matches the `api/` segment, and p1d makes the classifier read that row, so `src/api/v1.ts`
   * is now security-sensitive whatever a caller's rules say. The public-contract fixture moves
   * to a path no trigger row matches, so the seven-classes case still reaches public-contract.
   */
  { class: "public-contract", paths: ["src/published/**"], rationale: "fixture: the published API" },
  { class: "security-sensitive", paths: ["src/auth/**"], rationale: "fixture: authentication" },
];

const given = (paths: readonly string[], rules?: readonly ClassRule[]) =>
  classifyChange({ paths, base: "given" }, rules);

describe("the class vocabulary", () => {
  it("orders the seven classes strongest first, per S1", () => {
    expect(CLASS_ORDER).toEqual([
      "security-sensitive",
      "public-contract",
      "product",
      "config",
      "tests",
      "docs",
      "records",
    ]);
  });

  it("gives each class the checks of D1, the full gates from config up", () => {
    expect(CLASS_CHECKS.records).toEqual(["scan", "tests-selected"]);
    expect(CLASS_CHECKS.docs).toEqual(["scan", "tests-selected", "review-once"]);
    expect(CLASS_CHECKS.tests).toEqual(["scan", "tests-selected", "lint", "typecheck", "review"]);
    for (const cls of ["config", "product", "public-contract", "security-sensitive"] as const) {
      expect(CLASS_CHECKS[cls]).toEqual(["scan", "gates-all", "review"]);
    }
  });

  it("lists the code extensions every later rule reads, and the built-in test globs", () => {
    for (const ext of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs"]) {
      expect(CODE_EXTENSIONS).toContain(ext);
    }
    for (const ext of [".java", ".kt", ".swift", ".cs", ".php", ".sh", ".bash", ".ps1"]) {
      expect(CODE_EXTENSIONS).toContain(ext);
    }
    expect(CODE_EXTENSIONS).not.toContain(".md");
    expect(CODE_EXTENSIONS).not.toContain(".json");
    expect(BUILT_IN_TEST_GLOBS).toEqual(["**/*.test.*", "**/*.spec.*", "test/**", "tests/**", "**/__tests__/**"]);
  });
});

describe("matchGlob", () => {
  it("lets ** span segments, including none, and keeps * inside one", () => {
    expect(matchGlob("docs/a/b/c.md", "docs/**")).toBe(true);
    expect(matchGlob("a.test.ts", "**/*.test.*")).toBe(true);
    expect(matchGlob("src/x/a.test.ts", "**/*.test.*")).toBe(true);
    expect(matchGlob("README.md", "*.md")).toBe(true);
    expect(matchGlob("docs/README.md", "*.md")).toBe(false);
    expect(matchGlob("docsx/a.md", "docs/**")).toBe(false);
  });

  it("reads every other character literally", () => {
    expect(matchGlob("a.md", "a?md")).toBe(false);
    expect(matchGlob("a?md", "a?md")).toBe(true);
    expect(matchGlob("tsconfigXjson", "tsconfig.json")).toBe(false);
    expect(matchGlob("a[1].md", "a[1].md")).toBe(true);
  });

  it("matches a Windows-separated path as its POSIX twin", () => {
    expect(matchGlob("docs\\x.md", "docs/**")).toBe(true);
  });
});

describe("classifyChange: the built-in rules", () => {
  const cases: readonly (readonly [string, ChangeClass])[] = [
    [".stamity/runs/2026-10-08_x/record.md", "records"],
    [".stamity/inbox.md", "records"],
    [".stamity/handoffs/h.md", "records"],
    ["docs/guide.md", "docs"],
    ["CHANGELOG.md", "docs"],
    [".stamity/change-classes.json", "config"],
    [".stamity/manifest.json", "security-sensitive"],
    [".stamity/overrides/rules/x.md", "security-sensitive"],
  ];

  for (const [path, cls] of cases) {
    it(`places ${path} in ${cls}`, () => {
      const result = given([path]);
      expect(result.class).toBe(cls);
      expect(result.byPath).toEqual([{ path, class: cls, rule: expect.any(String) as string }]);
      expect(result.checks).toEqual([...CLASS_CHECKS[cls]]);
    });
  }

  it("places plans and specs in docs, with one review pass", () => {
    for (const path of ["docs/plans/x.md", "docs/specs/x.md"]) {
      const result = given([path]);
      expect(result.class).toBe("docs");
      expect(result.checks).toContain("review-once");
      expect(result.checks).not.toContain("gates-all");
    }
  });

  it("leaves AGENTS.md and CLAUDE.md out of docs: they steer every session (D10)", () => {
    expect(given(["AGENTS.md"]).class).toBe("product");
    expect(given(["CLAUDE.md"]).class).toBe("product");
    /*
     * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, fix round 1 for p1a
     * (review/6, review/7, signed off by the orchestrator). This pinned `docs/AGENTS.md` to `docs`
     * ("the exception is the top-level pair only"). Clients load nested instruction files too, so
     * D10 now reaches them at any depth: the pin moves from `docs` to `product`, a stronger class.
     */
    expect(given(["docs/AGENTS.md"]).class).toBe("product");
  });

  it("places an agent instruction file at any depth, in any case, at least in product", () => {
    const paths = [
      "docs/AGENTS.md",
      "docs/guide/CLAUDE.md",
      "AGENTS.override.md",
      "CLAUDE.local.md",
      "docs/a/AGENTS.override.md",
      ".stamity/runs/2026-10-08_x/CLAUDE.md",
      ".stamity/handoffs/CLAUDE.local.md",
      "claude.md",
      "Agents.md",
      "docs/Claude.Local.md",
      "packages/a/agents.OVERRIDE.md",
    ];
    for (const path of paths) {
      const result = given([path]);
      expect(result.class, path).toBe("product");
      expect(result.byPath[0]?.rule, path).not.toBe("unplaced");
    }
    // A stronger rule still wins over the instruction-file placement.
    expect(given([".stamity/overrides/CLAUDE.md"]).class).toBe("security-sensitive");
  });

  it("matches the instruction-file names whole, not as a suffix or a prefix", () => {
    for (const path of ["docs/MYCLAUDE.md", "docs/CLAUDE.md.txt", "docs/AGENTS.md.d/x.md", "docs/xAGENTS.override.md"]) {
      expect(given([path]).class, path).toBe("docs");
    }
  });

  it("matches the built-in security rules without case, as the trigger table does (build/5)", () => {
    for (const path of [".Stamity/manifest.json", ".STAMITY/MANIFEST.JSON", ".stamity/Overrides/rules/x.md"]) {
      const result = given([path]);
      expect(result.class, path).toBe("security-sensitive");
      expect(result.lenses, path).toEqual(["stamity-security"]);
    }
  });

  it("keeps the weaker built-in rules case-sensitive, so a case variant never lowers a path", () => {
    // `DOCS/` is not `docs/` to a case-sensitive checkout, so it stays unplaced: product.
    expect(given(["DOCS/x.md"]).class).toBe("product");
    expect(given([".Stamity/runs/x/record.md"]).class).toBe("product");
  });

  it("never places the engine's state in records", () => {
    const result = given([".stamity/manifest.json", ".stamity/inbox.md"]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
  });
});

describe("classifyChange: the code-path floor", () => {
  it("keeps a code file under docs/** out of docs: it is product (closes plan/10)", () => {
    for (const path of ["docs/conf.py", "docs/.vitepress/config.ts"]) {
      const result = given([path]);
      expect(result.class).toBe("product");
      expect(result.byPath[0]?.rule).toContain("floor");
    }
  });

  it("places a code file under a test glob that a docs rule matched in tests", () => {
    const result = given(["docs/a.test.ts"]);
    expect(result.class).toBe("tests");
    expect(result.checks).toEqual([...CLASS_CHECKS.tests]);
  });

  it("keeps a code file out of records too", () => {
    expect(given([".stamity/runs/2026-10-08_x/probe.mjs"]).class).toBe("product");
  });

  it("binds a caller's rules as well as the built-ins", () => {
    const rules: readonly ClassRule[] = [
      { class: "docs", paths: ["website/**"], rationale: "fixture: the site" },
      { class: "records", paths: ["notes/**"], rationale: "fixture: notes" },
    ];
    expect(given(["website/x.md"], rules).class).toBe("docs");
    expect(given(["website/src/x.tsx"], rules).class).toBe("product");
    expect(given(["notes/x.sh"], rules).class).toBe("product");
  });

  it("reads the extension case-insensitively, so an upper-case script is still code", () => {
    expect(given(["docs/BUILD.SH"]).class).toBe("product");
  });

  it("keeps an extensionless file out of docs and records: it may be an executable (build/7)", () => {
    for (const path of ["docs/Makefile", "docs/bin/run", "docs/.envrc", ".stamity/runs/2026-10-08_x/hook"]) {
      const result = given([path]);
      expect(result.class, path).toBe("product");
      expect(result.byPath[0]?.rule, path).toContain("floor");
    }
    expect(given(["notes/deploy"], [{ class: "records", paths: ["notes/**"], rationale: "fixture" }]).class).toBe(
      "product",
    );
  });

  it("still places the extensionless doc names in docs, in any case", () => {
    for (const name of ["LICENSE", "NOTICE", "AUTHORS", "CHANGELOG", "COPYING", "README", "readme", "License"]) {
      expect(given([`docs/${name}`]).class, name).toBe("docs");
    }
  });
});

describe("classifyChange: the strongest class wins", () => {
  it("reaches each of the seven classes through a fixture rule set", () => {
    const expected: Record<string, ChangeClass> = {
      ".stamity/inbox.md": "records",
      "docs/x.md": "docs",
      "test/a.test.ts": "tests",
      "tsconfig.json": "config",
      "src/x.ts": "product",
      // TEST CHANGE, justified: 2026-10-09, p1d — the fixture's public-contract path moved (see FIXTURE_RULES).
      "src/published/v1.ts": "public-contract",
      "src/auth/login.ts": "security-sensitive",
    };
    for (const [path, cls] of Object.entries(expected)) {
      expect(given([path], FIXTURE_RULES).class, path).toBe(cls);
    }
  });

  it("gives a mixed change its strongest path's class, and keeps every path's own", () => {
    const result = given(["docs/x.md", "test/a.test.ts", ".stamity/inbox.md"], FIXTURE_RULES);
    expect(result.class).toBe("tests");
    expect(result.byPath.map((entry) => [entry.path, entry.class])).toEqual([
      ["docs/x.md", "docs"],
      ["test/a.test.ts", "tests"],
      [".stamity/inbox.md", "records"],
    ]);

    const stronger = given(["docs/x.md", "src/auth/login.ts"], FIXTURE_RULES);
    expect(stronger.class).toBe("security-sensitive");
    expect(stronger.lenses).toEqual(["stamity-security"]);
  });

  // TEST CHANGE, justified: 2026-10-09, p1d — retitled from "names no lens below security-sensitive":
  // a design-quality or performance row now adds its lens at any class; these paths match no row.
  it("names no lens for paths no trigger row matches", () => {
    expect(given(["docs/x.md"]).lenses).toEqual([]);
    expect(given(["src/x.ts"]).lenses).toEqual([]);
  });
});

describe("classifyChange: at least product, never lower", () => {
  it("makes an unplaced path product, naming it", () => {
    const result = given(["src/x.ts"]);
    expect(result.class).toBe("product");
    expect(result.reason).toContain("src/x.ts");
    expect(result.reason).toContain("no rule places");
  });

  it("makes an empty path list product", () => {
    const result = given([]);
    expect(result.class).toBe("product");
    expect(result.byPath).toEqual([]);
    expect(result.reason).toContain("no changed path");
  });

  it("makes an unresolved base product even for a docs-only change", () => {
    const result = classifyChange({ paths: ["docs/x.md"], base: "unresolved" });
    expect(result.class).toBe("product");
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: "docs/**" }]);
    expect(result.reason).toContain("base could not be resolved");
  });

  it("keeps a stronger class through an unresolved base", () => {
    const result = classifyChange({ paths: [".stamity/manifest.json"], base: "unresolved" });
    expect(result.class).toBe("security-sensitive");
  });

  it("makes a rename across classes product, naming both sides", () => {
    const result = classifyChange({
      paths: ["src/a.ts"],
      renames: [{ from: "docs/a.md", to: "src/a.ts" }],
      base: "given",
    });
    expect(result.class).toBe("product");
    expect(result.reason).toContain("docs/a.md -> src/a.ts");
  });

  it("lifts a rename between two weaker classes to product", () => {
    const result = classifyChange({
      paths: [".stamity/inbox.md"],
      renames: [{ from: "docs/a.md", to: ".stamity/inbox.md" }],
      base: "given",
    });
    // docs and records differ, so the rename is at least product.
    expect(result.class).toBe("product");
  });

  it("keeps a rename within one class at that class", () => {
    const result = classifyChange({
      paths: ["docs/b.md"],
      renames: [{ from: "docs/a.md", to: "docs/b.md" }],
      base: "given",
    });
    expect(result.class).toBe("docs");
    expect(result.byPath.map((entry) => entry.path)).toEqual(["docs/b.md", "docs/a.md"]);
  });

  it("never lowers a rename into a stronger class to product", () => {
    const result = classifyChange(
      { paths: ["src/a.ts"], renames: [{ from: "docs/a.md", to: "src/a.ts" }], base: "given" },
      [{ class: "security-sensitive", paths: ["src/a.ts"], rationale: "fixture" }, ...BUILT_IN_RULES],
    );
    expect(result.class).toBe("security-sensitive");
  });
});

describe("classifyChange: no base (D5)", () => {
  it("classifies each known path by its built-in class, saying no base was given", () => {
    const result = classifyChange({ paths: ["docs/x.md"], base: "absent" });
    expect(result.class).toBe("docs");
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: "docs/**" }]);
    expect(result.reason).toContain("no base was given");
  });

  it("does not say so when a base was given", () => {
    expect(given(["docs/x.md"]).reason).not.toContain("no base was given");
  });
});

describe("classifyChange: path normalisation", () => {
  it("normalises a Windows path to POSIX before matching", () => {
    const result = given(["docs\\x.md"]);
    expect(result.class).toBe("docs");
    expect(result.byPath[0]?.path).toBe("docs/x.md");
  });

  it("drops a leading ./ and a repeated path", () => {
    const result = given(["./docs/x.md", "docs/x.md"]);
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: "docs/**" }]);
  });

  it("resolves dot segments and doubled separators, so no spelling escapes a stronger rule", () => {
    expect(given(["docs/../.stamity/manifest.json"]).class).toBe("security-sensitive");
    expect(given([".stamity//manifest.json"]).class).toBe("security-sensitive");
    expect(given(["docs/./x.md"]).byPath[0]?.path).toBe("docs/x.md");
    // A path that climbs out of the repository matches no rule.
    expect(given(["../docs/x.md"]).class).toBe("product");
  });
});

describe("classifyChange: a backslash read both ways (review/5, review/9)", () => {
  // On POSIX a backslash is a filename character: this is one file in `.stamity/overrides/`,
  // which a separator reading would resolve to `docs/x.md`.
  const literal = ".stamity/overrides/a\\..\\..\\..\\docs\\x.md";

  it("keeps the POSIX reading when it is the stronger one", () => {
    const result = given([literal]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
    expect(result.byPath).toEqual([{ path: literal, class: "security-sensitive", rule: ".stamity/overrides/**" }]);
  });

  it("does not fold the literal name into the path its separator reading names", () => {
    const result = given(["docs/x.md", literal]);
    expect(result.class).toBe("security-sensitive");
    expect(result.byPath.map((entry) => entry.class)).toEqual(["docs", "security-sensitive"]);
  });

  it("keeps the stronger reading on a rename's side too", () => {
    const result = classifyChange({ paths: ["docs/x.md"], renames: [{ from: literal, to: "docs/x.md" }], base: "given" });
    expect(result.class).toBe("security-sensitive");
  });

  it("keeps the Windows reading when it is the stronger one", () => {
    expect(given(["docs\\..\\.stamity\\manifest.json"]).class).toBe("security-sensitive");
    expect(given([".stamity\\overrides\\x.md"]).class).toBe("security-sensitive");
    expect(given(["src\\auth\\login.ts"], FIXTURE_RULES).class).toBe("security-sensitive");
    expect(given(["src\\auth\\login.ts"], FIXTURE_RULES).byPath[0]?.path).toBe("src/auth/login.ts");
  });

  // review/20, option (b): a listed path is read both ways, so a Windows path whose
  // POSIX twin is weaker over-gates to product and names the raw string. Accepted.
  it("over-gates a listed Windows path whose separator reading is the weaker one, naming the raw path", () => {
    const image = given(["docs\\img.png"]);
    expect(image.class).toBe("product");
    expect(image.byPath).toEqual([{ path: "docs\\img.png", class: "product", rule: "unplaced" }]);
    expect(image.reason).toContain("no rule places docs\\img.png");
    expect(given([".stamity\\runs\\x\\ledger.jsonl"]).class).toBe("product");
    expect(classifyChange({ paths: ["docs\\img.png"], base: "given", source: "listed" }).class).toBe("product");
  });
});

describe("classifyChange: a path git named is read literally (review/20, option a)", () => {
  const fromGit = (paths: readonly string[]) => classifyChange({ paths, base: "given", source: "git" });

  it("reports git's own name: a backslash is a filename character there, never a separator", () => {
    expect(fromGit(["docs/a\\b.md"]).byPath).toEqual([{ path: "docs/a\\b.md", class: "docs", rule: "docs/**" }]);
    expect(fromGit(["docs\\img.png"]).byPath).toEqual([{ path: "docs\\img.png", class: "product", rule: "unplaced" }]);
  });

  it("gives no separator reading to a git name, so a top-level file spelled like a state path is not one", () => {
    const result = fromGit(["docs\\..\\.stamity\\manifest.json"]);
    expect(result.class).toBe("product");
    expect(result.byPath[0]?.path).toBe("docs\\..\\.stamity\\manifest.json");
  });

  it("keeps the literal class of a git name, a backslash name under a security folder included", () => {
    const literal = ".stamity/overrides/a\\..\\..\\..\\docs\\x.md";
    expect(fromGit([literal]).byPath).toEqual([{ path: literal, class: "security-sensitive", rule: ".stamity/overrides/**" }]);
  });

  it("reads a rename's sides from git literally too", () => {
    const result = classifyChange({ paths: [], renames: [{ from: "docs/a\\b.md", to: "docs/c.md" }], base: "given", source: "git" });
    expect(result.byPath.map((entry) => entry.path)).toEqual(["docs/a\\b.md", "docs/c.md"]);
  });
});

describe("classifyChange: the trigger roster's security row (p1d, REQ-FLOW-065)", () => {
  it("places src/auth/login.ts in security-sensitive with the security lens, by the built-ins alone", () => {
    const result = given(["src/auth/login.ts"]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
    expect(result.checks).toEqual([...CLASS_CHECKS["security-sensitive"]]);
    expect(result.byPath).toEqual([
      { path: "src/auth/login.ts", class: "security-sensitive", rule: "the trigger roster's security row (auth/)" },
    ]);
    expect(result.reason).toContain("security-sensitive by the trigger roster's security row (auth/)");
  });

  it("reads each pattern form of the row: a segment, a suffix and a basename, in any case", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["server/routes/users.ts", "routes/"],
      ["certs/server.pem", "*.pem"],
      ["package.json", "package.json"],
      ["web/package-lock.json", "package-lock.json"],
      ["Gemfile", "gemfile"],
      ["SRC/Auth/Login.ts", "auth/"],
    ];
    for (const [path, pattern] of cases) {
      const result = given([path]);
      expect(result.class, path).toBe("security-sensitive");
      expect(result.byPath[0]?.rule, path).toBe(`the trigger roster's security row (${pattern})`);
      expect(result.lenses, path).toEqual(["stamity-security"]);
    }
  });

  it("lifts a path a weaker rule placed: a docs page under an auth/ segment is security-sensitive", () => {
    expect(given(["docs/x.md"]).class).toBe("docs");
    const result = given(["docs/auth/x.md"]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
  });

  // review/22: D10's instruction-file rule gives product; the row is stronger and must raise over it.
  it("raises a nested instruction file under a security segment over D10's product", () => {
    expect(given(["docs/guide/AGENTS.md"]).class).toBe("product");
    const cases: readonly (readonly [string, string])[] = [
      ["docs/auth/AGENTS.md", "auth/"],
      ["web/routes/claude.local.md", "routes/"],
    ];
    for (const [path, pattern] of cases) {
      const result = given([path]);
      expect(result.class, path).toBe("security-sensitive");
      expect(result.byPath, path).toEqual([
        { path, class: "security-sensitive", rule: `the trigger roster's security row (${pattern})` },
      ]);
      expect(result.lenses, path).toEqual(["stamity-security"]);
    }
  });

  it("binds whatever rules a caller passes, so no rule set can drop the row", () => {
    const narrowing: readonly ClassRule[] = [{ class: "docs", paths: ["**"], rationale: "fixture: everything is docs" }];
    expect(given(["guide/x.md"], narrowing).class).toBe("docs");
    expect(given(["guide/auth/x.md"], narrowing).class).toBe("security-sensitive");
    expect(given(["guide/auth/x.md"], []).class).toBe("security-sensitive");
  });

  it("keeps a built-in security rule's name when both place the path", () => {
    expect(given([".stamity/manifest.json"]).byPath[0]?.rule).toBe(".stamity/manifest.json");
  });

  it("adds a design-quality or performance lens and leaves the class unchanged", () => {
    const design = given(["src/components/Button.tsx"]);
    expect(design.class).toBe("product");
    expect(design.lenses).toEqual(["stamity-design-quality"]);

    const performance = given(["src/workers/drain.ts"]);
    expect(performance.class).toBe("product");
    expect(performance.lenses).toEqual(["stamity-performance"]);

    const docsPage = given(["docs/pages/intro.md"]);
    expect(docsPage.class).toBe("docs");
    expect(docsPage.lenses).toEqual(["stamity-design-quality"]);
  });

  it("unions the lenses over every path, security first, each once", () => {
    const result = given(["src/components/a.tsx", "src/components/b.tsx", "src/auth/login.ts", "src/jobs/x.ts"]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security", "stamity-design-quality", "stamity-performance"]);
  });

  it("names the security lens for a class a built-in rule set, with any trigger lens beside it", () => {
    const result = given([".stamity/manifest.json", "src/components/a.tsx"]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security", "stamity-design-quality"]);
  });

  it("reads a rename's sides for the row too", () => {
    const result = classifyChange({
      paths: [],
      renames: [{ from: "src/login.ts", to: "src/auth/login.ts" }],
      base: "given",
    });
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
  });
});

describe("classifyChange: the trigger table is an input (review/23)", () => {
  const fixtureTable: readonly SpecialistTrigger[] = [
    { specialist: "stamity-security", triggerPaths: ["vault/"], triggerKeywords: [], rationale: "fixture: a vault" },
    { specialist: "stamity-performance", triggerPaths: ["jobs/"], triggerKeywords: [], rationale: "fixture: jobs" },
  ];

  it("defaults to the shipped table", () => {
    expect(classifyChange({ paths: ["src/auth/login.ts"], base: "given" }, BUILT_IN_RULES, SPECIALIST_TRIGGER_TABLE)).toEqual(
      given(["src/auth/login.ts"]),
    );
  });

  it("raises nothing and names no trigger lens on an empty table, the class's own lens kept", () => {
    const login = classifyChange({ paths: ["src/auth/login.ts", "src/components/a.tsx"], base: "given" }, BUILT_IN_RULES, []);
    expect(login.class).toBe("product");
    expect(login.lenses).toEqual([]);
    expect(login.byPath.map((entry) => entry.rule)).toEqual(["unplaced", "unplaced"]);

    const manifest = classifyChange({ paths: [".stamity/manifest.json"], base: "given" }, BUILT_IN_RULES, []);
    expect(manifest.class).toBe("security-sensitive");
    expect(manifest.lenses).toEqual(["stamity-security"]);
  });

  it("reads a caller's table for the security row and the lenses", () => {
    const result = classifyChange(
      { paths: ["src/auth/login.ts", "src/vault/key.ts", "src/jobs/x.ts"], base: "given" },
      BUILT_IN_RULES,
      fixtureTable,
    );
    expect(result.byPath.map((entry) => entry.class)).toEqual(["product", "security-sensitive", "product"]);
    expect(result.byPath[1]?.rule).toBe("the trigger roster's security row (vault/)");
    expect(result.lenses).toEqual(["stamity-security", "stamity-performance"]);
  });
});

// review/37: the outside-path security check lives in the classifier, so the trigger roster keeps one src/ reader.
describe("outsideSecurityRule: the security rule a path outside the project meets", () => {
  it("names the built-in security floor first, matched without case", () => {
    expect(outsideSecurityRule(".stamity/manifest.json")).toBe("built-in .stamity/manifest.json");
    expect(outsideSecurityRule(".Stamity/Overrides/x.md")).toBe("built-in .stamity/overrides/**");
  });

  it("reads the name literally against the built-in floor, so a backslash is a filename character", () => {
    expect(outsideSecurityRule(".stamity/overrides/a\\..\\..\\..\\docs\\x.md")).toBe("built-in .stamity/overrides/**");
    expect(outsideSecurityRule(".stamity\\manifest.json")).toBeUndefined();
    expect(outsideSecurityRule(".stamity\\manifest.json", "git")).toBeUndefined();
  });

  // review/43: on win32 git's names are read as listed paths are, both ways, and the floor meets either reading.
  it("reads a listed-source name both ways against the built-in floor", () => {
    expect(outsideSecurityRule(".stamity\\manifest.json", "listed")).toBe("built-in .stamity/manifest.json");
    expect(outsideSecurityRule(".Stamity\\Overrides\\x.md", "listed")).toBe("built-in .stamity/overrides/**");
    expect(outsideSecurityRule(".stamity/overrides/a\\..\\..\\..\\docs\\x.md", "listed")).toBe("built-in .stamity/overrides/**");
    expect(outsideSecurityRule("docs\\guide.md", "listed")).toBeUndefined();
  });

  it("names the shipped security row's pattern when no built-in rule matches", () => {
    expect(outsideSecurityRule("package-lock.json")).toBe("security row package-lock.json");
    expect(outsideSecurityRule("lib/auth/session.ts")).toBe("security row auth/");
  });

  it("names nothing for a path neither the floor nor the row matches", () => {
    expect(outsideSecurityRule("docs/guide.md")).toBeUndefined();
    expect(outsideSecurityRule("src/components/a.tsx")).toBeUndefined();
  });

  it("reads a caller's table for the row, and an empty table leaves only the built-in floor", () => {
    const fixtureTable: readonly SpecialistTrigger[] = [
      { specialist: "stamity-security", triggerPaths: ["vault/"], triggerKeywords: [], rationale: "fixture: a vault" },
    ];
    expect(outsideSecurityRule("src/vault/key.ts", "git", fixtureTable)).toBe("security row vault/");
    expect(outsideSecurityRule("lib/auth/session.ts", "git", fixtureTable)).toBeUndefined();
    expect(outsideSecurityRule("lib/auth/session.ts", "git", [])).toBeUndefined();
    expect(outsideSecurityRule(".stamity/manifest.json", "git", [])).toBe("built-in .stamity/manifest.json");
  });
});

// ── The repository's class file (p2a-class-file, REQ-FLOW-061, REQ-FLOW-062) ──

/** `parseClassFile` over a JSON value, asserting it was accepted. */
function accepted(file: unknown): Extract<ReturnType<typeof parseClassFile>, { ok: true }> {
  const parsed = parseClassFile(JSON.stringify(file));
  if (!parsed.ok) throw new Error(`refused: ${parsed.errors.join("; ")}`);
  return parsed;
}

/** The first error `parseClassFile` gives for `text`, asserting it was refused. */
function firstError(text: string): string {
  const parsed = parseClassFile(text);
  if (parsed.ok) throw new Error(`accepted: ${text}`);
  expect(parsed.errors.length).toBeGreaterThan(0);
  return parsed.errors[0] ?? "";
}

/** The built-in rules merged with a class file's, as `gate` merges a base copy. */
const withFile = (file: unknown): ClassRule[] => mergeRules(BUILT_IN_RULES, accepted(file).rules);

const classOf = (path: string, rules: readonly ClassRule[]) =>
  classifyChange({ paths: [path], base: "given" }, rules);

describe("parseClassFile: what the class file may say", () => {
  it("names the file's place in the project", () => {
    expect(CLASS_FILE).toBe(".stamity/change-classes.json");
  });

  it("reads one rule per class, the tests globs and the test inputs", () => {
    const parsed = accepted({
      classes: { docs: ["website/**"], tests: ["evals/**"], "security-sensitive": ["src/merge/**"] },
      testInputs: [
        { glob: "docs/**", tests: ["test/docsPages.test.ts"] },
        { glob: "content/**", tests: "all" },
      ],
    });

    expect(parsed.rules.map((rule) => [rule.class, rule.paths])).toEqual([
      ["security-sensitive", ["src/merge/**"]],
      ["tests", ["evals/**"]],
      ["docs", ["website/**"]],
    ]);
    expect(parsed.testGlobs).toEqual(["evals/**"]);
    expect(parsed.testInputs).toEqual([
      { glob: "docs/**", tests: ["test/docsPages.test.ts"] },
      { glob: "content/**", tests: "all" },
    ]);
  });

  it("takes both keys as optional", () => {
    expect(accepted({})).toEqual({ ok: true, rules: [], testGlobs: [], testInputs: [] });
  });

  // review/12: a rule that raises a path folds case; a weaker one never does, so a case variant never lowers a path.
  it("folds case on the product, public-contract and security-sensitive rules and on no other", () => {
    const parsed = accepted({
      classes: Object.fromEntries(CLASS_ORDER.map((cls) => [cls, [`${cls}/**`]])),
    });
    const folded = Object.fromEntries(parsed.rules.map((rule) => [rule.class, rule.foldCase === true]));
    expect(folded).toEqual({
      "security-sensitive": true,
      "public-contract": true,
      product: true,
      config: false,
      tests: false,
      docs: false,
      records: false,
    });
  });

  it.each([
    ["invalid JSON", "{ classes: ", "not valid JSON"],
    ["a JSON value that is no object", "[]", "not a JSON object"],
    ["an unknown top-level key", '{"class": {}}', '"class" is not a key of the class file'],
    ["classes that are no object", '{"classes": []}', "classes is not an object"],
    ["an unknown class key", '{"classes": {"librarian": ["x/**"]}}', '"librarian" is not a change class'],
    ["a class whose globs are no list", '{"classes": {"docs": "website/**"}}', "classes.docs is not a list of globs"],
    ["a glob that is no string", '{"classes": {"docs": [3]}}', "classes.docs[0] is not a string"],
    ["an empty glob", '{"classes": {"docs": ["website/**", ""]}}', "classes.docs[1] is empty"],
    ["test inputs that are no list", '{"testInputs": {}}', "testInputs is not a list"],
    ["a test input with no glob", '{"testInputs": [{"tests": "all"}]}', "testInputs[0].glob is not a non-empty string"],
    ["a test input with no tests", '{"testInputs": [{"glob": "docs/**"}]}', 'testInputs[0].tests is neither "all" nor a list'],
    ["a test input with an unknown key", '{"testInputs": [{"glob": "docs/**", "tests": "all", "why": 1}]}', '"why" is not a key of testInputs[0]'],
  ])("refuses %s", (_label, text, error) => {
    expect(firstError(text)).toContain(error);
  });

  // The sign-off on plan/8: a glob that matches every path may only raise.
  it.each([["**"], ["**/*"], ["*/**"], ["./**"], ["***"], ["**/**/*"]])(
    "refuses the match-all glob %s for every class weaker than product, naming it",
    (glob) => {
      for (const cls of ["config", "tests", "docs", "records"] as const) {
        const error = firstError(JSON.stringify({ classes: { [cls]: [glob] } }));
        expect(error).toContain(`classes.${cls}[0]`);
        expect(error).toContain(JSON.stringify(glob));
        expect(error).toContain("matches every path");
      }
      for (const cls of ["product", "public-contract", "security-sensitive"] as const) {
        expect(parseClassFile(JSON.stringify({ classes: { [cls]: [glob] } })).ok).toBe(true);
      }
    },
  );

  it("keeps a glob that only looks wide: one with a literal segment, or a single *", () => {
    expect(accepted({ classes: { docs: ["*", "**/*.md", "notes/**"] } }).rules[0]?.paths).toEqual([
      "*",
      "**/*.md",
      "notes/**",
    ]);
  });

  // plan/23: a test entry reaches `npx vitest run` as an argument, so it is a plain file path or nothing.
  it.each([
    ["-x", "starts with '-'"],
    ["--reporter=x", "starts with '-'"],
    ["test/*.ts", "holds a glob character"],
    ["test/a?.ts", "holds a glob character"],
    ["test/[a].ts", "holds a glob character"],
    ["test/{a,b}.ts", "holds a glob character"],
    ["a b.ts", "holds whitespace or a control character"],
    ["a\tb.ts", "holds whitespace or a control character"],
    ["/abs/a.test.ts", "is not a repository-relative POSIX path"],
    ["C:/a.test.ts", "is not a repository-relative POSIX path"],
    ["test\\a.test.ts", "is not a repository-relative POSIX path"],
    ["test/../../a.test.ts", "has a '..' segment"],
    ["", "is empty"],
  ])("refuses the test entry %j", (entry, error) => {
    const message = firstError(JSON.stringify({ testInputs: [{ glob: "docs/**", tests: ["test/ok.test.ts", entry] }] }));
    expect(message).toContain("testInputs[0].tests[1]");
    expect(message).toContain(error);
  });

  it("refuses a control character in a test entry", () => {
    const entry = `test/a${String.fromCodePoint(1)}.ts`;
    expect(firstError(JSON.stringify({ testInputs: [{ glob: "docs/**", tests: [entry] }] }))).toContain(
      "holds whitespace or a control character",
    );
  });

  it("lists every error, the first one first", () => {
    const parsed = parseClassFile(JSON.stringify({ classes: { records: ["**"], docs: [""] } }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]).toContain("classes.records[0]");
  });
});

describe("mergeRules: a class file's globs join their class and never lower a path", () => {
  it("keeps every built-in rule and adds the file's, marked as the file's", () => {
    const merged = withFile({ classes: { docs: ["website/**"] } });
    expect(merged.slice(0, BUILT_IN_RULES.length)).toEqual(BUILT_IN_RULES);
    expect(merged.slice(BUILT_IN_RULES.length)).toEqual([
      expect.objectContaining({ class: "docs", paths: ["website/**"], origin: "class-file" }),
    ]);
  });

  it("holds the case rule even for a hand-built extension: a weaker rule never folds, a raising one always does", () => {
    const merged = mergeRules(BUILT_IN_RULES, [
      { class: "docs", paths: ["notes/**"], rationale: "hand-built", foldCase: true },
      { class: "security-sensitive", paths: ["lib/**"], rationale: "hand-built" },
    ]);
    const added = merged.slice(BUILT_IN_RULES.length);
    expect(added.map((rule) => rule.foldCase === true)).toEqual([false, true]);
  });

  it("places a docs page by the file and keeps the floor for code under the same glob", () => {
    const rules = withFile({ classes: { docs: ["website/**"] } });
    expect(classOf("website/x.md", rules).class).toBe("docs");
    expect(classOf("website/src/x.tsx", rules).class).toBe("product");
    expect(classOf("website/x.md", BUILT_IN_RULES).class).toBe("product");
  });

  it.each([
    ["src/auth/x.ts", "docs", "src/**", "security-sensitive"],
    ["docs/x.md", "records", "docs/**", "docs"],
    [".stamity/manifest.json", "records", ".stamity/*.json", "security-sensitive"],
  ])("does not narrow %s by a %s glob, and names the glob", (path, cls, glob, expected) => {
    const result = classOf(path, withFile({ classes: { [cls]: [glob] } }));
    expect(result.class).toBe(expected);
    expect(result.reason).toContain(glob);
    expect(result.reason).toContain("weaker globs do not lower");
  });

  // p2a reviewer M-2: where the code-path floor decided, the floor clause names it; no stronger rule is claimed.
  it("names the floor, not a stronger rule, when only the floor kept a code file out of a weak glob's class", () => {
    const result = classOf("website/src/x.tsx", withFile({ classes: { docs: ["website/**"] } }));
    expect(result.class).toBe("product");
    expect(result.reason).toContain("kept out of records and docs as code or an extensionless file: website/src/x.tsx");
    expect(result.reason).not.toContain("weaker globs do not lower");
    const tests = classOf("test/x.ts", withFile({ classes: { docs: ["test/**"] } }));
    expect(tests.class).toBe("tests");
    expect(tests.reason).not.toContain("weaker globs do not lower");
  });

  it("names no ignored glob when the file's glob decides the path", () => {
    expect(classOf("website/x.md", withFile({ classes: { docs: ["website/**"] } })).reason).not.toContain(
      "weaker globs do not lower",
    );
  });

  it("keeps an agent instruction file and an extensionless file at least product under a docs glob", () => {
    const rules = withFile({ classes: { docs: ["**/AGENTS.md", "notes/**"] } });
    expect(classOf("notes/AGENTS.md", rules).class).toBe("product");
    expect(classOf("notes/Makefile", rules).class).toBe("product");
    expect(classOf("notes/x.md", rules).class).toBe("docs");
  });

  it("keeps a dotfile under a records glob at product (review/11)", () => {
    const rules = withFile({ classes: { records: ["keep/**"] } });
    expect(classOf("keep/.gitkeep", rules).class).toBe("product");
    expect(classOf("keep/x.md", rules).class).toBe("records");
  });

  // review/12: a raising rule folds case, a weaker one does not.
  it("raises LIB/x.ts by a lib/** security glob, and places NOTES/x.md by no notes/** docs glob", () => {
    expect(classOf("LIB/x.ts", withFile({ classes: { "security-sensitive": ["lib/**"] } }))).toMatchObject({
      class: "security-sensitive",
      lenses: ["stamity-security"],
    });
    const notes = classOf("NOTES/x.md", withFile({ classes: { docs: ["notes/**"] } }));
    expect(notes.class).toBe("product");
    expect(notes.byPath[0]?.rule).not.toBe("notes/**");
  });

  it("gives a path the file lists under two classes the stronger one", () => {
    const rules = withFile({ classes: { docs: ["guides/**"], config: ["guides/settings.json"] } });
    expect(classOf("guides/settings.json", rules).class).toBe("config");
    expect(classOf("guides/a.md", rules).class).toBe("docs");
  });

  it("keeps a glob that matches nothing, with no error", () => {
    const rules = withFile({ classes: { docs: ["nowhere/**"] } });
    expect(classOf("docs/x.md", rules).class).toBe("docs");
  });
});

describe("this repository's class file", () => {
  const committed = parseClassFile(readFileSync(new URL("../../.stamity/change-classes.json", import.meta.url), "utf8"));
  const rules = committed.ok ? mergeRules(BUILT_IN_RULES, committed.rules) : [];

  it("is valid", () => {
    expect(committed.ok ? [] : committed.errors).toEqual([]);
  });

  // review/8: the code that decides the checks gets the lens.
  it.each([
    ["src/change/classify.ts"],
    ["src/cli/commands/gate.ts"],
    ["src/roster/triggers.ts"],
    ["scripts/ci/records-only.mjs"],
    ["src/merge/writeEscape.ts"],
    ["src/manifest/manifest.ts"],
    ["src/runs/ledgerStore.ts"],
    ["src/cli/engine/gitStatus.ts"],
  ])("places %s security-sensitive with the lens", (path) => {
    expect(classOf(path, rules)).toMatchObject({ class: "security-sensitive", lenses: ["stamity-security"] });
  });

  it.each([
    ["content/commands/st-work.md", "product"],
    ["website/index.md", "docs"],
    ["test/change/classify.test.ts", "tests"],
    ["evals/cases-v6/golden/x.md", "tests"],
    ["vitest.config.ts", "config"],
    ["tsconfig.json", "config"],
    ["knip.json", "config"],
    [".oxlintrc.json", "config"],
    ["eslint.config.js", "config"],
  ])("places %s in %s", (path, cls) => {
    expect(classOf(path, rules).class).toBe(cls);
  });
});
