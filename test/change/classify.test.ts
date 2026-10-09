import { readFileSync } from "node:fs";
import { posix } from "node:path";
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
  SECURITY_LINE_RULES,
  type ChangeClass,
  type ClassRule,
  type Hunk,
} from "../../src/change/classify.ts";
import { SPECIALIST_TRIGGER_TABLE, type SpecialistTrigger } from "../../src/roster/triggers.ts";

// Fixture data kept out of the test-input census: these globs are built at run time, as literals they name this repository's docs, site and .md files.
const DOCS_GLOB = ["docs", "**"].join("/");
const SITE_GLOB = ["website", "**"].join("/");
const TOP_MD_GLOB = ["*", "md"].join(".");
const ANY_MD_GLOB = ["**/*", "md"].join(".");
// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own inbox.
const INBOX = [".stamity", "inbox.md"].join("/");

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
    expect(matchGlob("docs/a/b/c.md", DOCS_GLOB)).toBe(true);
    expect(matchGlob("a.test.ts", "**/*.test.*")).toBe(true);
    expect(matchGlob("src/x/a.test.ts", "**/*.test.*")).toBe(true);
    expect(matchGlob("README.md", TOP_MD_GLOB)).toBe(true);
    expect(matchGlob("docs/README.md", TOP_MD_GLOB)).toBe(false);
    expect(matchGlob("docsx/a.md", DOCS_GLOB)).toBe(false);
  });

  it("reads every other character literally", () => {
    expect(matchGlob("a.md", "a?md")).toBe(false);
    expect(matchGlob("a?md", "a?md")).toBe(true);
    expect(matchGlob("tsconfigXjson", "tsconfig.json")).toBe(false);
    expect(matchGlob("a[1].md", "a[1].md")).toBe(true);
  });

  it("matches a Windows-separated path as its POSIX twin", () => {
    expect(matchGlob("docs\\x.md", DOCS_GLOB)).toBe(true);
  });

  it("reads **/ as whole segments, none included, and a run of three stars as ** then *", () => {
    expect(matchGlob("a/b", "a/**/b")).toBe(true);
    expect(matchGlob("a/x/y/b", "a/**/b")).toBe(true);
    expect(matchGlob("ax/y/b", "a**/b")).toBe(true);
    expect(matchGlob("a/xb", "a/**/b")).toBe(false);
    expect(matchGlob("x/y.md", "***")).toBe(true);
    expect(matchGlob("x/y/", "x/**/")).toBe(true);
    expect(matchGlob("x/y", "x/**/")).toBe(false);
  });

  // review/71: a bare ** matches any character, a line terminator included, as * and **/ already did.
  it.each([0x0a, 0x0d, 0x2028, 0x2029])("lets a bare ** match the line terminator %i", (point) => {
    const name = `.stamity/overrides/a${String.fromCharCode(point)}b.md`;
    expect(matchGlob(name, ".stamity/overrides/**")).toBe(true);
    expect(matchGlob(name, ".stamity/overrides/**", { literal: true })).toBe(true);
    expect(given([name])).toMatchObject({ class: "security-sensitive", lenses: ["stamity-security"] });
    expect(outsideSecurityRule(name)).toBe("built-in .stamity/overrides/**");
  });

  it("lets a single * match a line terminator inside one segment, and never a /", () => {
    for (const point of [0x0a, 0x0d, 0x2028, 0x2029]) {
      const name = `a${String.fromCharCode(point)}b.md`;
      expect(matchGlob(name, TOP_MD_GLOB, { literal: true }), String(point)).toBe(true);
      // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every top-level docs page.
      expect(matchGlob(`docs/${name}`, ["docs", "*"].join("/"), { literal: true }), String(point)).toBe(true);
    }
    expect(matchGlob("a/b.md", TOP_MD_GLOB)).toBe(false);
  });

  /*
   * The matcher's equivalence evidence (review/50, review/71): a seeded run compares it with a reference built on
   * a regular expression, the shape the matcher replaced, over generated glob and path pairs with and without case
   * folding. `**` is `[\s\S]*` here, since review/71 lets it match a line terminator. Half the paths are drawn from
   * their glob, so matches are exercised as well as misses.
   */
  it("decides as a reference regular expression does over seeded glob and path pairs", () => {
    const units = [
      "a", "b", "A", ".", "/",
      ...[0x0a, 0x0d, 0x2028, 0x2029, 0xe9, 0xc9, 0x17f, 0x212a, 0x6b, 0x4b, 0xdf].map((point) => String.fromCharCode(point)),
    ];
    const tokens = [...units, "*", "**", "**/"];
    let seed = 0x5eed;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const run = (from: readonly string[], max: number): string => {
      let text = "";
      for (let n = Math.floor(random() * (max + 1)); n > 0; n -= 1) text += pick(from);
      return text;
    };
    const noSlash = units.filter((unit) => unit !== "/");
    const reference = (glob: string, foldCase: boolean): RegExp => {
      const normalized = posix.normalize(glob.replaceAll("\\", "/"));
      const source = normalized === "." ? "" : normalized;
      let pattern = "";
      for (let at = 0; at < source.length; ) {
        if (source.startsWith("**/", at)) [pattern, at] = [`${pattern}(?:[^/]*/)*`, at + 3];
        else if (source.startsWith("**", at)) [pattern, at] = [`${pattern}[\\s\\S]*`, at + 2];
        else if (source[at] === "*") [pattern, at] = [`${pattern}[^/]*`, at + 1];
        else [pattern, at] = [pattern + (source[at] ?? "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), at + 1];
      }
      return new RegExp(`^${pattern}$`, foldCase ? "i" : "");
    };

    let compared = 0;
    let matched = 0;
    const differences: string[] = [];
    for (let pair = 0; pair < 3_000; pair += 1) {
      const globTokens = Array.from({ length: Math.floor(random() * 8) }, () => pick(tokens));
      const glob = globTokens.join("");
      const path =
        random() < 0.5
          ? run(units, 10)
          : globTokens
              .map((token) => {
                if (token === "*") return run(noSlash, 3);
                if (token === "**") return run(units, 4);
                if (token === "**/") return Array.from({ length: Math.floor(random() * 3) }, () => `${run(noSlash, 2)}/`).join("");
                return random() < 0.2 ? pick(units) : token;
              })
              .join("");
      for (const foldCase of [false, true]) {
        const expected = reference(glob, foldCase).test(path);
        compared += 1;
        if (expected) matched += 1;
        if (matchGlob(path, glob, { literal: true, foldCase }) !== expected) {
          differences.push(JSON.stringify({ glob, path, foldCase, expected }));
        }
      }
    }

    expect(differences).toEqual([]);
    expect(compared).toBe(6_000);
    expect(matched).toBeGreaterThan(600);
    expect(compared - matched).toBeGreaterThan(600);
  });

  it("folds case only when asked", () => {
    expect(matchGlob("LIB/X.ts", "lib/*.ts", { foldCase: true })).toBe(true);
    expect(matchGlob("LIB/X.ts", "lib/*.ts")).toBe(false);
  });

  // review/50: matching is linear in the path, whatever wildcards the glob holds, so no glob stalls `gate classify`.
  it.each([
    ["an alternating-star glob, 8 stars, against 40 letters", `${"*a".repeat(8)}*b`, "a".repeat(40)],
    ["an alternating-star glob, 20 stars, against 20,000 letters", `${"*a".repeat(20)}*b`, "a".repeat(20_000)],
    ["four ** between letters against a deep path", "**a**a**a**a*b", `${"a/".repeat(5_000)}a`],
    ["four **/ against a deep path", "**/a/**/a/**/a/**/a/*b", `${"a/".repeat(5_000)}a`],
  ])("matches %s well under a second", (_label, glob, path) => {
    const started = performance.now();
    expect(matchGlob(path, glob)).toBe(false);
    expect(matchGlob(path, glob, { foldCase: true })).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("classifies a long name against a hostile glob a class file accepts, well under a second (review/50)", () => {
    const glob = `${"*a".repeat(20)}*b`;
    expect(glob.length).toBeLessThanOrEqual(200);
    const parsed = parseClassFile(JSON.stringify({ classes: { "security-sensitive": [glob], tests: [glob] } }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const started = performance.now();
    const result = classifyChange({ paths: [`${"a".repeat(20_000)}.md`], base: "given" }, mergeRules(BUILT_IN_RULES, parsed.rules));
    expect(performance.now() - started).toBeLessThan(500);
    expect(result.class).toBe("docs");
  });
});

describe("classifyChange: the built-in rules", () => {
  const cases: readonly (readonly [string, ChangeClass])[] = [
    [".stamity/runs/2026-10-08_x/record.md", "records"],
    [INBOX, "records"],
    [".stamity/handoffs/h.md", "records"],
    ["docs/guide.md", "docs"],
    ["CHANGELOG.md", "docs"],
    // TEST CHANGE, justified: 2026-10-09, review/49 — the class file decides every later change's checks, so the
    // built-in rule places it security-sensitive (was config).
    [".stamity/change-classes.json", "security-sensitive"],
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

  // review/49: a change to the class file gets the security lens, in any case, whatever the repository's own file says.
  it("places the class file security-sensitive with the lens, a case variant included", () => {
    for (const path of [".stamity/change-classes.json", ".Stamity/Change-Classes.json"]) {
      expect(given([path]), path).toMatchObject({ class: "security-sensitive", lenses: ["stamity-security"] });
    }
    expect(outsideSecurityRule(".stamity/change-classes.json")).toBe("built-in .stamity/change-classes.json");
  });

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
    const result = given([".stamity/manifest.json", INBOX]);
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

  // review/55: the config floor binds a class file's rules and the built-in docs rule, never the built-in records rule.
  it("keeps a data file under the engine's own record paths in records, and code there on the floor", () => {
    const fileRules = mergeRules(BUILT_IN_RULES, [{ class: "docs", paths: ["notes/**"], rationale: "fixture" }]);
    for (const rules of [BUILT_IN_RULES, fileRules]) {
      for (const path of [".stamity/runs/x/qa-evidence.json", ".stamity/runs/x/ci.yml", ".stamity/handoffs/h.json"]) {
        const result = given([path], rules);
        expect(result.class, path).toBe("records");
        expect(result.reason, path).not.toContain("kept out of records");
      }
      expect(given([".stamity/runs/x/probe.mjs"], rules).class).toBe("product");
      expect(given([".stamity/runs/x/hook"], rules).class).toBe("product");
      expect(given(["docs/x.json"], rules).class).toBe("product");
    }
    expect(given(["notes/x.json"], fileRules).class).toBe("product");
    // A caller's records rule over the same globs is not the built-in one, so the floor binds it.
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every run record.
    const copied: readonly ClassRule[] = [{ class: "records", paths: [[".stamity/runs", "**"].join("/")], rationale: "fixture" }];
    expect(given([".stamity/runs/x/qa-evidence.json"], copied).class).toBe("product");
  });

  it("binds a caller's rules as well as the built-ins", () => {
    const rules: readonly ClassRule[] = [
      { class: "docs", paths: [SITE_GLOB], rationale: "fixture: the site" },
      { class: "records", paths: ["notes/**"], rationale: "fixture: notes" },
    ];
    expect(given(["website/x.md"], rules).class).toBe("docs");
    expect(given(["website/src/x.tsx"], rules).class).toBe("product");
    /*
     * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, p5b-security-trigger-rows.
     * This pinned `notes/x.sh` to product. The security row now holds `*.sh` (S7), so that path is
     * security-sensitive, a stronger class; the code floor under a caller's records rule is still the
     * behaviour this case reads, so it moves to a script extension no trigger row holds.
     */
    expect(given(["notes/x.py"], rules).class).toBe("product");
  });

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, p5b-security-trigger-rows.
   * This pinned `docs/BUILD.SH` to product. The security row now holds `*.sh` and matches without case,
   * so that path is security-sensitive (pinned in the S7 path-row describe); the floor's case-insensitive
   * extension read moves to an upper-case extension no trigger row holds.
   */
  it("reads the extension case-insensitively, so an upper-case script is still code", () => {
    expect(given(["docs/BUILD.PY"]).class).toBe("product");
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
      [INBOX]: "records",
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
    const result = given(["docs/x.md", "test/a.test.ts", INBOX], FIXTURE_RULES);
    expect(result.class).toBe("tests");
    expect(result.byPath.map((entry) => [entry.path, entry.class])).toEqual([
      ["docs/x.md", "docs"],
      ["test/a.test.ts", "tests"],
      [INBOX, "records"],
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
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: DOCS_GLOB }]);
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
      paths: [INBOX],
      renames: [{ from: "docs/a.md", to: INBOX }],
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
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: DOCS_GLOB }]);
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
    expect(result.byPath).toEqual([{ path: "docs/x.md", class: "docs", rule: DOCS_GLOB }]);
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
    expect(fromGit(["docs/a\\b.md"]).byPath).toEqual([{ path: "docs/a\\b.md", class: "docs", rule: DOCS_GLOB }]);
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

describe("classifyChange: the S7 path rows of the security row (p5b, REQ-FLOW-065)", () => {
  it("places CI workflows, scripts, container builds and client hooks and settings in security-sensitive", () => {
    const cases: readonly (readonly [string, string])[] = [
      [".github/workflows/ci.yml", ".github/workflows/"],
      ["packages/a/.github/workflows/release.yaml", ".github/workflows/"],
      // TEST CHANGE, justified: 2026-10-09, plan 019 file 2, the p5 group's fix round 1, `build/63`. The row read
      // `plugin/hooks/pre-tool.js` by the bare segment `hooks/`, which also placed every front-end hook folder
      // here; the segment narrows to client configuration folders, so the case names one of them.
      [".claude/hooks/pre-tool.js", ".claude/hooks/"],
      ["scripts/x.sh", "*.sh"],
      ["scripts/x.bash", "*.bash"],
      ["scripts/x.zsh", "*.zsh"],
      ["scripts/x.ps1", "*.ps1"],
      ["scripts/Module.psm1", "*.psm1"],
      ["Dockerfile", "dockerfile"],
      ["services/api-gw/Dockerfile", "dockerfile"],
      [".cursor/hooks.json", "hooks.json"],
      [".claude/settings.json", ".claude/settings.json"],
      [".claude/settings.local.json", "settings.local.json"],
      // Added 2026-10-09 (the p5 group's fix round 1, `build/63`, `review/159`, `review/164`, `review/169`).
      [".stamity/hooks/guard.mjs", ".stamity/hooks/"],
      [".stamity/generated/hooks/pre-tool-use.mjs", ".stamity/generated/hooks/"],
      [".husky/pre-commit", ".husky/"],
      [".vscode/settings.json", ".vscode/settings.json"],
      [".mcp.json", ".mcp.json"],
      [".cursor/mcp.json", "mcp.json"],
      [".github/actions/setup/action.yml", ".github/actions/"],
      ["action.yaml", "action.yaml"],
      ["deploy/Dockerfile.prod", "dockerfile.*"],
      ["api.Dockerfile", "*.dockerfile"],
      ["Containerfile", "containerfile"],
      [".npmrc", ".npmrc"],
      [".yarnrc", ".yarnrc"],
      [".yarnrc.yml", ".yarnrc.yml"],
      [".pnpmfile.cjs", ".pnpmfile.cjs"],
      ["npm-shrinkwrap.json", "npm-shrinkwrap.json"],
    ];
    for (const [path, pattern] of cases) {
      const result = given([path]);
      expect(result.class, path).toBe("security-sensitive");
      expect(result.lenses, path).toEqual(["stamity-security"]);
      expect(result.checks, path).toEqual([...CLASS_CHECKS["security-sensitive"]]);
      expect(result.byPath[0]?.rule, path).toBe(`the trigger roster's security row (${pattern})`);
    }
  });

  it("matches the new rows without case, as the row's matcher does (record.md:88)", () => {
    for (const path of [".GitHub/Workflows/ci.yml", "scripts/BUILD.SH", "Scripts/Deploy.PS1", ".Claude/Settings.JSON"]) {
      const result = given([path]);
      expect(result.class, path).toBe("security-sensitive");
      expect(result.lenses, path).toEqual(["stamity-security"]);
    }
  });

  it("lifts what a weaker rule placed, and leaves near-miss names where they were", () => {
    // A records rule over notes/** would place a script there in records; the row is stronger.
    const records: readonly ClassRule[] = [{ class: "records", paths: ["notes/**"], rationale: "fixture: notes" }];
    expect(given(["notes/x.md"], records).class).toBe("records");
    expect(given(["notes/x.sh"], records).class).toBe("security-sensitive");
    // Not the names the row holds: a page about hooks, a workflows folder outside .github, a doc on settings.
    for (const path of ["docs/hooks.md", "docs/workflows/ci.md", "docs/settings.md"]) {
      const result = given([path]);
      expect(result.class, path).toBe("docs");
      expect(result.lenses, path).toEqual([]);
    }
  });

  // Added 2026-10-09 (the p5 group's fix round 1, `build/63`): a front-end hook folder and a settings file outside
  // a client folder are not client configuration, so the row leaves them to the other rules.
  it("leaves a front-end hook folder and a non-client settings file to the other rules", () => {
    for (const path of ["src/hooks/useAuth.ts", "web/hooks/useCart.js", "config/settings.json"]) {
      const result = given([path]);
      expect(result.class, path).not.toBe("security-sensitive");
      expect(result.lenses, path).toEqual([]);
    }
  });

  it("names the security row for an outside path on the new rows", () => {
    expect(outsideSecurityRule("../.github/workflows/ci.yml")).toBe("security row .github/workflows/");
    expect(outsideSecurityRule("../tools/x.ps1")).toBe("security row *.ps1");
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

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70 (Minor, signed off). A records
   * or docs glob now ends in a concrete extension or names a file, so the fixtures that used a folder glob
   * there (`website/**`, `notes/**`, `${cls}/**`) take an extension glob such as `website/**\/*.md`, and the
   * two keep-cases drop `notes/**` and `*` for docs and records (the second moves to config, whose match-all
   * check it pins). The config-format floor case builds its notes/** rule by hand through mergeRules, since
   * the floor binds a hand-built rule as it binds a file's. What each case asserts is unchanged.
   */
  it("reads one rule per class, the tests globs and the test inputs", () => {
    const parsed = accepted({
      classes: { docs: ["website/**/*.md"], tests: ["evals/**"], "security-sensitive": ["src/merge/**"] },
      testInputs: [
        { glob: DOCS_GLOB, tests: ["test/docsPages.test.ts"] },
        { glob: "content/**", tests: "all" },
      ],
    });

    expect(parsed.rules.map((rule) => [rule.class, rule.paths])).toEqual([
      ["security-sensitive", ["src/merge/**"]],
      ["tests", ["evals/**"]],
      ["docs", ["website/**/*.md"]],
    ]);
    expect(parsed.testGlobs).toEqual(["evals/**"]);
    expect(parsed.testInputs).toEqual([
      { glob: DOCS_GLOB, tests: ["test/docsPages.test.ts"] },
      { glob: "content/**", tests: "all" },
    ]);
  });

  it("takes both keys as optional", () => {
    expect(accepted({})).toEqual({ ok: true, rules: [], testGlobs: [], testInputs: [] });
  });

  // review/12: a rule that raises a path folds case; a weaker one never does, so a case variant never lowers a path.
  it("folds case on the product, public-contract and security-sensitive rules and on no other", () => {
    const parsed = accepted({
      classes: Object.fromEntries(CLASS_ORDER.map((cls) => [cls, [`${cls}/**/*.md`]])),
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
    ["a class whose globs are no list", `{"classes": {"docs": "${SITE_GLOB}"}}`, "classes.docs is not a list of globs"],
    ["a glob that is no string", '{"classes": {"docs": [3]}}', "classes.docs[0] is not a string"],
    ["an empty glob", '{"classes": {"docs": ["website/**/*.md", ""]}}', "classes.docs[1] is empty"],
    ["test inputs that are no list", '{"testInputs": {}}', "testInputs is not a list"],
    ["a test input with no glob", '{"testInputs": [{"tests": "all"}]}', "testInputs[0].glob is not a non-empty string"],
    ["a test input with no tests", `{"testInputs": [{"glob": "${DOCS_GLOB}"}]}`, 'testInputs[0].tests is neither "all" nor a list'],
    ["a test input with an unknown key", `{"testInputs": [{"glob": "${DOCS_GLOB}", "tests": "all", "why": 1}]}`, '"why" is not a key of testInputs[0]'],
    // review/50: a glob's matching cost is bounded by its length and its ** count.
    // review/73: the two ** globs are joined at run time, so this file holds no literal over the bound (review/62).
    ["a glob longer than 200 characters", JSON.stringify({ classes: { product: [`${"a".repeat(198)}/**`] } }), "classes.product[0] is longer than 200 characters"],
    ["a glob with more than four **", JSON.stringify({ classes: { "security-sensitive": [["**", "a", "**", "b", "**", "c", "**", "d", "**"].join("/")] } }), "classes.security-sensitive[0] holds more than four **"],
    ["a test-input glob with more than four **", JSON.stringify({ testInputs: [{ glob: `${["**", "**", "**", "**", "**"].join("/")}.md`, tests: "all" }] }), "testInputs[0].glob holds more than four **"],
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

  it("keeps a glob of exactly 200 characters and one with four **", () => {
    const long = `${"a".repeat(197)}/**`;
    expect(long).toHaveLength(200);
    expect(accepted({ classes: { product: [long, "**/a/**/b/**/c/**"] } }).rules[0]?.paths).toHaveLength(2);
  });

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/59 (W, security). This case
   * pinned `**\/*.*` and `**.*` as accepted under docs and records, bounded only by the floors. Those
   * floors are extension allowlists, so a wildcard extension still lowered every unlisted file type
   * (Terraform, SQL, Gradle, `*.mk`). review/59 refuses a wildcard extension for those two classes, so
   * that half of the case moves to the refusal cases below; the tests half is unchanged.
   */
  // review/47: a glob that leaves something literal is kept under tests, and the floors bound what it can lower.
  // Fixture data kept out of the test-input census: these globs are built at run time, as literals they name every dotted file.
  it.each([[["**/*", "*"].join(".")], [["**", "*"].join(".")]])(
    "bounds %s under tests: code is tests only under a built-in test glob",
    (glob) => {
      const tests = withFile({ classes: { tests: [glob] } });
      expect(classOf("src/x.ts", tests).class).toBe("product");
      expect(classOf("src/x.ts", tests).reason).toContain("src/x.ts");
      expect(classOf("test/x.test.ts", tests).class).toBe("tests");
      expect(classOf("notes/a.png", tests).class).toBe("tests");
    },
  );

  // review/59: the floors are extension allowlists, so records and docs take only a concrete extension.
  // Fixture data kept out of the test-input census: these globs are built at run time, as literals they name every dotted file.
  it.each([[["**/*", "*"].join(".")], [["*", "*"].join(".")], [".*"], [["**", "*"].join(".")], ["notes/*.m*"], ["notes/x.*"], ["./notes/**/*.*"]])(
    "refuses the wildcard-extension glob %s for docs and records, naming it",
    (glob) => {
      for (const cls of ["docs", "records"] as const) {
        const error = firstError(JSON.stringify({ classes: { [cls]: [glob] } }));
        expect(error).toContain(`classes.${cls}[0]`);
        expect(error).toContain(JSON.stringify(glob));
        expect(error).toContain("wildcard extension");
      }
      for (const cls of ["tests", "config", "product", "security-sensitive"] as const) {
        expect(parseClassFile(JSON.stringify({ classes: { [cls]: [glob] } })).ok, cls).toBe(true);
      }
    },
  );

  // review/70: a records or docs glob ends in a concrete extension or names a file, so no unlisted type lowers.
  // Fixture data kept out of the test-input census: these globs are built at run time, as literals they name records and site files.
  it.each([["notes/**"], [SITE_GLOB], [["**", "/m", "*"].join("")], ["**/*tf"], [["**", "s/", "**"].join("")], ["*"], ["*."], ["notes/*.md/**"]])(
    "refuses the docs and records glob %s, which names no concrete extension, naming it",
    (glob) => {
      for (const cls of ["docs", "records"] as const) {
        const error = firstError(JSON.stringify({ classes: { [cls]: [glob] } }));
        expect(error).toContain(`classes.${cls}[0]`);
        expect(error).toContain(JSON.stringify(glob));
        expect(error).toContain("names no concrete extension");
      }
      for (const cls of ["tests", "config", "product", "security-sensitive"] as const) {
        expect(parseClassFile(JSON.stringify({ classes: { [cls]: [glob] } })).ok, cls).toBe(true);
      }
    },
  );

  it("lowers no unlisted file type through a folder glob: a refused file keeps none of its docs globs", () => {
    const parsed = parseClassFile(JSON.stringify({ classes: { docs: ["infra/**"], "security-sensitive": ["lib/**"] } }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const rules = mergeRules(BUILT_IN_RULES, parsed.raising);
    for (const path of ["infra/main.tf", "infra/001_init.sql", "infra/build.gradle", "infra/rules.mk"]) {
      expect(classOf(path, rules).class, path).toBe("product");
    }
  });

  it("keeps a docs or records glob with a concrete extension or a literal file name", () => {
    // Fixture data kept out of the test-input census: the .md globs are built at run time, as literals they name every tracked .md.
    const globs = [ANY_MD_GLOB, TOP_MD_GLOB, "notes/**/*.html", "**/*.*.md", "notes/README", ".gitkeep", "x*.md", ["**", "md"].join(".")];
    for (const cls of ["docs", "records"] as const) {
      expect(accepted({ classes: { [cls]: globs } }).rules[0]?.paths, cls).toEqual(globs);
    }
  });

  it("lowers no unlisted file type through a wildcard extension: a refused file keeps none of its records globs", () => {
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every dotted file.
    const parsed = parseClassFile(JSON.stringify({ classes: { records: [["**/*", "*"].join(".")], "security-sensitive": ["lib/**"] } }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const rules = mergeRules(BUILT_IN_RULES, parsed.raising);
    for (const path of ["infra/main.tf", "db/001_init.sql", "build.gradle", "rules.mk"]) {
      expect(classOf(path, rules).class, path).toBe("product");
    }
  });

  it("holds every config format out of records and docs, the .env family included", () => {
    const rules = mergeRules(BUILT_IN_RULES, [{ class: "docs", paths: ["notes/**"], rationale: "hand-built" }]);
    for (const ext of ["json", "jsonc", "yml", "yaml", "toml", "ini", "cfg", "conf", "xml", "properties", "env", "JSON"]) {
      expect(classOf(`notes/a.${ext}`, rules).class, ext).toBe("product");
    }
    for (const name of [".env", ".env.production", ".ENV.local"]) expect(classOf(`notes/${name}`, rules).class, name).toBe("product");
    expect(classOf("notes/a.md", rules).class).toBe("docs");
    expect(classOf("notes/environment.md", rules).class).toBe("docs");
  });

  it("places a code file in tests by a class-file glob only under a built-in test glob", () => {
    const rules = withFile({ classes: { tests: ["src/**", "test/**"] } });
    expect(classOf("src/x.ts", rules).class).toBe("product");
    expect(classOf("src/x.test.ts", rules).class).toBe("tests");
    expect(classOf("test/helpers/x.ts", rules).class).toBe("tests");
    expect(classOf("src/fixtures/x.json", rules).class).toBe("tests");
  });

  it("keeps a glob that only looks wide: one with a literal segment, or a single *", () => {
    expect(accepted({ classes: { config: ["*", ANY_MD_GLOB, "notes/**"] } }).rules[0]?.paths).toEqual([
      "*",
      ANY_MD_GLOB,
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
    const message = firstError(JSON.stringify({ testInputs: [{ glob: DOCS_GLOB, tests: ["test/ok.test.ts", entry] }] }));
    expect(message).toContain("testInputs[0].tests[1]");
    expect(message).toContain(error);
  });

  it("refuses a control character in a test entry", () => {
    const entry = `test/a${String.fromCodePoint(1)}.ts`;
    expect(firstError(JSON.stringify({ testInputs: [{ glob: DOCS_GLOB, tests: [entry] }] }))).toContain(
      "holds whitespace or a control character",
    );
  });

  // review/48: a refused file still raises by each entry that parses on its own; it lowers by none.
  it("keeps each raising entry of a refused file that parses on its own, and no lowering entry", () => {
    const parsed = parseClassFile(
      JSON.stringify({
        classes: { "security-sensitive": ["lib/**"], product: ["app/**", ""], records: ["**"], docs: [SITE_GLOB] },
        testInputs: {},
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.raising.map((rule) => [rule.class, rule.paths, rule.foldCase])).toEqual([
      ["security-sensitive", ["lib/**"], true],
      ["product", ["app/**"], true],
    ]);
    const rules = mergeRules(BUILT_IN_RULES, parsed.raising);
    expect(classOf("lib/x.ts", rules)).toMatchObject({ class: "security-sensitive", lenses: ["stamity-security"] });
    expect(classOf("website/x.md", rules).class).toBe("product");
  });

  it.each([
    ["text that does not parse", '{ "classes": { "security-sensitive": ["lib/**"] '],
    ["a value that is no object", '["lib/**"]'],
    ["classes that are no object", '{"classes": [["security-sensitive", "lib/**"]]}'],
  ])("keeps no raising entry from %s", (_label, text) => {
    const parsed = parseClassFile(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.raising).toEqual([]);
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
  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70 (Minor, signed off). A records
   * or docs folder glob is now refused, so each docs or records fixture below names the extensions or the
   * files its case reaches (`website/**\/*.md` beside `website/**\/*.tsx` for the code floor, `notes/Makefile`
   * and `keep/.gitkeep` for the extensionless floor, `guides/*.json` for the two-class case). Every path each
   * case classifies, and the class it expects, is unchanged.
   */
  it("keeps every built-in rule and adds the file's, marked as the file's", () => {
    const merged = withFile({ classes: { docs: ["website/**/*.md"] } });
    expect(merged.slice(0, BUILT_IN_RULES.length)).toEqual(BUILT_IN_RULES);
    expect(merged.slice(BUILT_IN_RULES.length)).toEqual([
      expect.objectContaining({ class: "docs", paths: ["website/**/*.md"], origin: "class-file" }),
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
    const rules = withFile({ classes: { docs: ["website/**/*.md", "website/**/*.tsx"] } });
    expect(classOf("website/x.md", rules).class).toBe("docs");
    expect(classOf("website/src/x.tsx", rules).class).toBe("product");
    expect(classOf("website/x.md", BUILT_IN_RULES).class).toBe("product");
  });

  it.each([
    ["src/auth/x.ts", "docs", "src/**/*.ts", "security-sensitive"],
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every docs page.
    ["docs/x.md", "records", ["docs/", "**/*", ".md"].join(""), "docs"],
    [".stamity/manifest.json", "records", ".stamity/*.json", "security-sensitive"],
  ])("does not narrow %s by a %s glob, and names the glob", (path, cls, glob, expected) => {
    const result = classOf(path, withFile({ classes: { [cls]: [glob] } }));
    expect(result.class).toBe(expected);
    expect(result.reason).toContain(glob);
    expect(result.reason).toContain("weaker globs do not lower");
  });

  // p2a reviewer M-2: where the code-path floor decided, the floor clause names it; no stronger rule is claimed.
  it("names the floor, not a stronger rule, when only the floor kept a code file out of a weak glob's class", () => {
    const result = classOf("website/src/x.tsx", withFile({ classes: { docs: ["website/**/*.tsx"] } }));
    expect(result.class).toBe("product");
    expect(result.reason).toContain("kept out of records and docs as code, config or an extensionless file");
    expect(result.reason).toContain("outside a built-in test glob: website/src/x.tsx");
    expect(result.reason).not.toContain("weaker globs do not lower");
    const tests = classOf("test/x.ts", withFile({ classes: { docs: ["test/**/*.ts"] } }));
    expect(tests.class).toBe("tests");
    expect(tests.reason).not.toContain("weaker globs do not lower");
  });

  it("names no ignored glob when the file's glob decides the path", () => {
    expect(classOf("website/x.md", withFile({ classes: { docs: ["website/**/*.md"] } })).reason).not.toContain(
      "weaker globs do not lower",
    );
  });

  it("keeps an agent instruction file and an extensionless file at least product under a docs glob", () => {
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names AGENTS.md.
    const rules = withFile({ classes: { docs: [["**", "/AGENTS.md"].join(""), "notes/Makefile", "notes/*.md"] } });
    expect(classOf("notes/AGENTS.md", rules).class).toBe("product");
    expect(classOf("notes/Makefile", rules).class).toBe("product");
    expect(classOf("notes/x.md", rules).class).toBe("docs");
  });

  it("keeps a dotfile under a records glob at product (review/11)", () => {
    const rules = withFile({ classes: { records: ["keep/.gitkeep", "keep/*.md"] } });
    expect(classOf("keep/.gitkeep", rules).class).toBe("product");
    expect(classOf("keep/x.md", rules).class).toBe("records");
  });

  // review/12: a raising rule folds case, a weaker one does not.
  it("raises LIB/x.ts by a lib/** security glob, and places NOTES/x.md by no notes/** docs glob", () => {
    expect(classOf("LIB/x.ts", withFile({ classes: { "security-sensitive": ["lib/**"] } }))).toMatchObject({
      class: "security-sensitive",
      lenses: ["stamity-security"],
    });
    const notes = classOf("NOTES/x.md", withFile({ classes: { docs: ["notes/*.md"] } }));
    expect(notes.class).toBe("product");
    expect(notes.byPath[0]?.rule).not.toBe("notes/*.md");
  });

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, p5b-security-trigger-rows.
   * The fixture's file named `guides/settings.json`. The security row now holds the basename
   * `settings.json` (S7), which lifts that path past both of the file's classes; the case reads the
   * stronger of two class-file classes, so its fixture moves to a basename no trigger row holds.
   */
  it("gives a path the file lists under two classes the stronger one", () => {
    const rules = withFile({ classes: { docs: ["guides/*.md", "guides/*.json"], config: ["guides/options.json"] } });
    expect(classOf("guides/options.json", rules).class).toBe("config");
    expect(classOf("guides/a.md", rules).class).toBe("docs");
  });

  it("keeps a glob that matches nothing, with no error", () => {
    const rules = withFile({ classes: { docs: ["nowhere/*.md"] } });
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
    // Added 2026-10-09 (the p5 group's fix round 1, `build/63`): the engine's own hook code, which the
    // narrowed client-hooks row no longer reaches.
    ["src/hooks/userHooks.ts"],
  ])("places %s security-sensitive with the lens", (path) => {
    expect(classOf(path, rules)).toMatchObject({ class: "security-sensitive", lenses: ["stamity-security"] });
  });

  it.each([
    ["content/commands/st-work.md", "product"],
    ["website/index.md", "docs"],
    ["website/static/img/mark.svg", "docs"],
    ["website/src/css/custom.css", "docs"],
    ["website/src/pages/index.tsx", "product"],
    ["website/static/CNAME", "product"],
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

/**
 * p5a-security-classifier (REQ-FLOW-065, S7 (c), D3): the security line rules
 * over a change's hunks. Pure, so every hunk is a literal input and nothing is
 * stubbed. Each dangerous-call line is built at run time with `~` cut out of it
 * (the run's fixture rule), so no line of this file is itself a call shape.
 */
describe("classifyChange: the security line rules (p5a, REQ-FLOW-065)", () => {
  const built = (text: string): string => text.replaceAll("~", "");
  const RM_LINE = built("  fs.rm~Sync(dir, { recursive: true });");

  /** One hunk of `path`, its added lines numbered from `from` (10 unless said), with the file's `head` when given. */
  const hunk = (
    path: string,
    lines: { added?: string[]; removed?: string[]; context?: string[]; head?: string; from?: number },
  ): Hunk => ({
    path,
    added: (lines.added ?? []).map((text, at) => ({ line: (lines.from ?? 10) + at, text })),
    removed: lines.removed ?? [],
    context: lines.context ?? [],
    ...(lines.head === undefined ? {} : { head: lines.head }),
  });
  const withLines = (hunks: readonly Hunk[], extra: { unscanned?: string[] } = {}) =>
    classifyChange({ paths: [...new Set(hunks.map((entry) => entry.path))], base: "given", source: "git", hunks, ...extra });

  it("spells four rule families, each with a rationale", () => {
    expect(SECURITY_LINE_RULES.map((rule) => rule.id)).toEqual([
      "process-spawn",
      "delete-or-overwrite",
      "network-or-registry",
      "secret-name",
    ]);
    for (const rule of SECURITY_LINE_RULES) expect(rule.rationale.length, rule.id).toBeGreaterThan(20);
  });

  it("places an added recursive delete in src/x.ts security-sensitive, naming the rule and path:line", () => {
    const result = withLines([hunk("src/x.ts", { added: ["const keep = 1;", RM_LINE] })]);
    expect(result.class).toBe("security-sensitive");
    expect(result.lenses).toEqual(["stamity-security"]);
    expect(result.byPath).toEqual([
      { path: "src/x.ts", class: "security-sensitive", rule: "line rule delete-or-overwrite at src/x.ts:11" },
    ]);
    expect(result.reason).toContain("delete-or-overwrite at src/x.ts:11");
  });

  it("reads a context line in a hunk that only removes the guard around an existing delete", () => {
    const result = withLines([hunk("src/x.ts", { removed: ["if (safe) {", "}"], context: [RM_LINE] })]);
    expect(result.class).toBe("security-sensitive");
    expect(result.byPath[0]?.rule).toBe("line rule delete-or-overwrite at src/x.ts, a context line of a hunk that removes one");
  });

  it("reads a removed line", () => {
    const result = withLines([hunk("src/x.ts", { removed: [RM_LINE] })]);
    expect(result.byPath[0]?.rule).toBe("line rule delete-or-overwrite at src/x.ts, a removed line");
  });

  it("leaves context out of a hunk that removes nothing: an unrelated line beside an existing delete", () => {
    const result = withLines([hunk("src/x.ts", { added: ["const n = 2;"], context: [RM_LINE] })]);
    expect(result.class).toBe("product");
    expect(result.byPath[0]?.rule).toBe("unplaced");
  });

  it.each([["docs/x.md"], ["src/__snapshots__/x.test.ts.snap"], ["config/x.json"], ["test/x.test.ts"], ["src/x.test.ts"]])(
    "reads no line of %s: not a code file, or under a test glob",
    (path) => {
      const result = withLines([hunk(path, { added: [RM_LINE], removed: [RM_LINE] })]);
      expect(result.class).not.toBe("security-sensitive");
      expect(result.byPath[0]?.rule).not.toMatch(/^line rule/);
    },
  );

  it.each([
    ["process-spawn", 'import { exec~File } from "node:child~_process";'],
    ["process-spawn", 'const cp = require("child~_process");'],
    ["process-spawn", 'exec~FileSync("git", ["status"]);'],
    ["process-spawn", "const out = exec~Sync(cmd);"],
    ["process-spawn", 'spa~wn("ls", []);'],
    ["process-spawn", 'spa~wnSync("ls", []);'],
    ["process-spawn", "ex~ec(cmd, done);"],
    ["process-spawn", "child~_process.ex~ec(cmd);"],
    ["process-spawn", 'require("node:child~_process").ex~ec(cmd);'],
    ["process-spawn", 'subprocess.ru~n(["ls"])'],
    ["process-spawn", "subprocess.cal~l(args)"],
    ["process-spawn", "proc = Pop~en(args)"],
    ["process-spawn", "os.syst~em(cmd)"],
    ["delete-or-overwrite", "await r~m(dir, { recursive: true });"],
    ["delete-or-overwrite", "unl~ink(path, done);"],
    ["delete-or-overwrite", "unl~inkSync(path);"],
    ["delete-or-overwrite", "rmd~ir(path, done);"],
    ["delete-or-overwrite", "rmd~irSync(path);"],
    ["delete-or-overwrite", "await write~File(path, text);"],
    ["delete-or-overwrite", "write~FileSync(path, text);"],
    ["delete-or-overwrite", "await rena~me(from, to);"],
    ["delete-or-overwrite", "rena~meSync(from, to);"],
    ["delete-or-overwrite", "trunc~ate(path, 0, done);"],
    ["delete-or-overwrite", "shutil.rmt~ree(path)"],
    ["delete-or-overwrite", "os.rem~ove(path)"],
    ["delete-or-overwrite", 'const clean = "r~m -rf build";'],
    ["network-or-registry", "const res = await fet~ch(url);"],
    ["network-or-registry", "http.requ~est(options);"],
    ["network-or-registry", "https.requ~est(options);"],
    ["network-or-registry", "await axi~os.get(url);"],
    ["network-or-registry", "await axi~os(config);"],
    ["network-or-registry", 'const probe = "cu~rl -s https://example.test";'],
    ["network-or-registry", "const pull = 'wg~et https://example.test';"],
    ["network-or-registry", 'const ship = "np~m publish --tag next";'],
    ["secret-name", 'const tok~en = "abc";'],
    ["secret-name", "apiK~ey = process.env.KEY;"],
    ["secret-name", 'pass~word = os.environ["PW"]'],
    ["secret-name", 'const client = { clientSec~ret: "abc" };'],
    ["secret-name", 'let dbCredent~ial: string = "abc";'],
    // build/52, review/86, review/90: the same APIs' missed shapes join the lists.
    /*
     * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/90 (signed off): `cp.exec(cmd)` was
     * pinned in the no-hit list below. `cp` is the conventional name of the imported child_process module, so the
     * call is a shell exec and now hits; the RegExp receivers `re.exec(s)` and `pattern.exec(text)` stay no-hits.
     */
    ["process-spawn", "cp.ex~ec(cmd);"],
    ["process-spawn", "const run = promis~ify(ex~ec);"],
    ["process-spawn", "const run = util.promis~ify(cp.ex~ec);"],
    ["process-spawn", 'const worker = for~k("./worker.js");'],
    ["process-spawn", 'out = subprocess.check_out~put(["ls"])'],
    ["process-spawn", "subprocess.check_ca~ll(args)"],
    ["delete-or-overwrite", "const out = fs.createWrite~Stream(path);"],
    ["delete-or-overwrite", "await copy~File(from, to);"],
    ["delete-or-overwrite", "copy~FileSync(from, to);"],
    ["delete-or-overwrite", "await fs.c~p(from, to, { recursive: true });"],
    ["delete-or-overwrite", "c~pSync(from, to);"],
    ["network-or-registry", "http.ge~t(url, done);"],
    ["network-or-registry", "https.ge~t(url, done);"],
    ["secret-name", 'pass~word = os.get~env("PW")'],
    ["secret-name", 'API_K~EY = "abc"'],
    ["secret-name", 'api_k~ey = os.environ["K"]'],
    ["secret-name", 'const keys = { "api_k~ey": "abc" };'],
    ["secret-name", "  apiK~ey: process.env.KEY,"],
    // build/47: a placeholder that reads an environment value is still one.
    ["secret-name", "const tok~en = `${process.env.T}`;"],
  ])("hits %s on %s", (id, fragments) => {
    const result = withLines([hunk("src/x.ts", { added: [built(fragments)] })]);
    expect(result.class).toBe("security-sensitive");
    expect(result.byPath[0]?.rule).toBe(`line rule ${id} at src/x.ts:10`);
  });

  it.each([
    ["re.exec(s)"],
    ["const match = pattern.exec(text);"],
    ["run.exec(cmd);"],
    ["transform(x)"],
    ["perform(task)"],
    ["confirm(answer)"],
    ["prefetch(url)"],
    ["use(API_TOKEN_NAME)"],
    ["const n = MAX_TOKENS + 1;"],
    ['if (token === "x") return;'],
    ["return token;"],
    ["const parts = tokenize(text);"],
    ['const tokenCount = count("x");'],
    ["// the rm -rf of a build folder, in prose"],
    // build/47: a value that is wholly a template placeholder is no credential.
    [built('export const CLI_TOK~EN = "${STAMITY:CLI}";')],
    [built("const tok~en = `${name}`;")],
    // review/92: a secret name matches in an assignment or an object key only.
    [built('function pick(tok~en: "a" | "b") {}')],
    [built('const label = ok ? tok~en : "x";')],
  ])("does not hit on %s", (line) => {
    const result = withLines([hunk("src/x.ts", { added: [line] })]);
    expect(result.class).toBe("product");
    expect(result.byPath[0]?.rule).toBe("unplaced");
  });

  it("carries no text of a matched line in the reason or byPath", () => {
    const marker = ["MARK", "ER", "7731"].join("");
    const result = withLines([
      hunk("src/x.ts", { added: [built(`write~FileSync("${marker}", data);`)] }),
      hunk("src/y.ts", { removed: [built(`const tok~en = "${marker}";`)] }),
    ]);
    expect(result.class).toBe("security-sensitive");
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(result.reason).toContain("delete-or-overwrite at src/x.ts:10");
    expect(result.reason).toContain("secret-name at src/y.ts, a removed line");
  });

  it("keeps a stronger path class and names it, not the line rule", () => {
    const result = withLines([hunk(".stamity/manifest.json", { added: [RM_LINE] }), hunk("src/auth/login.ts", { added: [RM_LINE] })]);
    expect(result.byPath.map((entry) => entry.rule)).toEqual([".stamity/manifest.json", "the trigger roster's security row (auth/)"]);
  });

  it("places a hunk's path that the path list missed", () => {
    const result = classifyChange({ paths: ["docs/x.md"], base: "given", source: "git", hunks: [hunk("src/x.ts", { added: [RM_LINE] })] });
    expect(result.byPath.map((entry) => entry.path)).toEqual(["docs/x.md", "src/x.ts"]);
    expect(result.class).toBe("security-sensitive");
  });

  it("makes the class at least product for a tracked code file the read could not show, counting it", () => {
    const docsOnly = withLines([hunk("docs/x.md", { added: ["text"] })]);
    expect(docsOnly.class).toBe("docs");
    const result = withLines([hunk("docs/x.md", { added: ["text"] })], { unscanned: ["src/x.ts"] });
    expect(result.class).toBe("product");
    // TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/94 (signed off): untracked files past
    // the total read cap are unscanned too, of any type, so the clause says "changed file", not "tracked code file".
    expect(result.reason).toContain("1 changed file the read could not show is unscanned, so the class is at least product: src/x.ts");
  });

  // review/86, review/90: `exec` on the imported child_process module counts under whatever name the file gives it.
  it.each([
    ['import * as run from "node:child~_process";'],
    ['const run = require("child~_process");'],
    ['import run, { spawn } from "child~_process";'],
    ['import run = require("node:child~_process");'],
  ])("hits exec on the module a file imports as run: %s", (importLine) => {
    const call = built("  run.ex~ec(cmd);");
    const imported = withLines([hunk("src/x.ts", { added: [call], head: `${built(importLine)}\nexport {};\n` })]);
    const unknown = withLines([hunk("src/x.ts", { added: [call], head: "export {};\n" })]);

    expect(imported.byPath[0]?.rule).toBe("line rule process-spawn at src/x.ts:10");
    expect(unknown.class).toBe("product");
  });

  it("reads the import from the hunk's own lines when no head is given", () => {
    const result = withLines([hunk("src/x.ts", { context: [built('const run = require("child~_process");')], added: [built("run.ex~ec(cmd);")] })]);
    expect(result.byPath[0]?.rule).toBe("line rule process-spawn at src/x.ts:10");
  });

  // review/85: the rules read the languages their shapes are written for, and name the code files they cannot read.
  it.each([["src/x.go"], ["scripts/clean.sh"], ["scripts/clean.ps1"], ["src/Main.java"]])(
    "reads no line of %s, another language, and names it in the reason",
    (path) => {
      const result = withLines([hunk(path, { added: [RM_LINE, built("rm -r~f build")] })]);
      expect(result.class).toBe("product");
      expect(result.byPath[0]?.rule).not.toMatch(/^line rule/);
      expect(result.reason).toContain(`read by no line rule, as none covers its language: ${path}`);
    },
  );

  it.each([["src/x.py"], ["src/x.mjs"], ["src/App.vue"], ["src/x.tsx"]])("reads the lines of %s", (path) => {
    const result = withLines([hunk(path, { added: [built("shutil.rmt~ree(path)")] })]);
    expect(result.byPath[0]?.rule).toBe(`line rule delete-or-overwrite at ${path}:10`);
    expect(result.reason).not.toContain("read by no line rule");
  });

  // build/52: a first-line shebang makes a file code for the line rules; its interpreter decides the language.
  it.each([
    ["#!/usr/bin/env node", "bin/tool"],
    ["#!/usr/bin/python3", "bin/tool"],
    ["#!/usr/bin/env -S node --no-warnings", "scripts/release.txt"],
  ])("reads a file whose first line is %s", (shebang, path) => {
    const result = withLines([hunk(path, { added: [RM_LINE], head: `${shebang}\n` })]);
    expect(result.class).toBe("security-sensitive");
    expect(result.byPath[0]?.rule).toBe(`line rule delete-or-overwrite at ${path}:10`);
  });

  it("reads a shebang from an added first line when no head is given", () => {
    const result = withLines([hunk("bin/clean", { added: ["#!/usr/bin/env python3", built("shutil.rmt~ree(p)")], from: 1 })]);
    expect(result.byPath[0]?.rule).toBe("line rule delete-or-overwrite at bin/clean:2");
  });

  it("names a shell script found by its shebang as read by no line rule, and reads no extensionless file without one", () => {
    const shell = withLines([hunk("bin/clean", { added: [built("rm -r~f build")], head: "#!/bin/sh\n" })]);
    const plain = withLines([hunk("bin/notes", { added: [RM_LINE], head: "notes\n" })]);

    expect(shell.reason).toContain("read by no line rule, as none covers its language: bin/clean");
    expect(plain.class).toBe("product");
    expect(plain.reason).not.toContain("read by no line rule");
  });

  // review/93: a line is cut to a bound before the rules run, and the cut is named.
  it("reads a line only up to 4,096 characters, says so, and makes the class at least product", () => {
    const early = withLines([hunk("src/x.ts", { added: [`${RM_LINE}${" ".repeat(5_000)}`] })]);
    const late = withLines([hunk("src/x.ts", { added: [`${" ".repeat(5_000)}${RM_LINE}`] })]);
    const docs = withLines([hunk("docs/x.md", { added: ["text"] }), hunk("src/__tests__/x.ts", { added: ["x".repeat(5_000)] })]);

    expect(early.class).toBe("security-sensitive");
    expect(late.class).toBe("product");
    expect(late.byPath[0]?.rule).toBe("unplaced");
    expect(late.reason).toContain("a line longer than 4096 characters was read only that far, so the class is at least product: src/x.ts");
    expect(docs.reason).not.toContain("longer than");
  });
});
