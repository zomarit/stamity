import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import {
  DEFAULT_MAX_REVIEW_ITERATIONS,
  HARD_MAX_REVIEW_ITERATIONS,
  MIN_MAX_REVIEW_ITERATIONS,
  clampReviewIterations,
} from "../../src/roster/reviewCaps.ts";
import {
  SPECIALIST_TRIGGER_TABLE,
  duplicateSpecialistIds,
  findSpecialistTrigger,
  specialistsForPath,
  type SpecialistTrigger,
} from "../../src/roster/triggers.ts";

/**
 * Stand-in for a filled roster, kept after the real rows landed: it holds row
 * shapes the shipped roster does not use (`*`, separator-only patterns, a
 * duplicate id), so the matching semantics stay covered independently of
 * whatever the roster happens to contain. The shipped-table cases below assert
 * the rows themselves.
 */
/** Minimal row carrying only an id — for id-level checks that ignore matching. */
const idRow = (specialist: string): SpecialistTrigger => ({
  specialist,
  triggerPaths: [],
  triggerKeywords: [],
  rationale: "fixture",
});

const FILLED_TABLE: readonly SpecialistTrigger[] = [
  {
    specialist: "interface-reviewer",
    triggerPaths: ["*.tsx", "components/"],
    triggerKeywords: ["component", "design token"],
    rationale: "Rendered surfaces carry accessibility and design-system obligations.",
  },
  {
    specialist: "supply-chain-reviewer",
    triggerPaths: ["package.json", "lockfiles/"],
    triggerKeywords: ["dependency"],
    rationale: "Dependency manifests change the trusted code surface.",
  },
  {
    specialist: "backend-reviewer",
    triggerPaths: ["routes/"],
    triggerKeywords: ["endpoint"],
    rationale: "Request handlers own the reliability budget.",
  },
];

describe("review-iteration caps", () => {
  it("keeps the band ordered and sane: 0 < MIN <= DEFAULT <= HARD <= 20", () => {
    expect(MIN_MAX_REVIEW_ITERATIONS).toBeGreaterThan(0);
    expect(MIN_MAX_REVIEW_ITERATIONS).toBeLessThanOrEqual(DEFAULT_MAX_REVIEW_ITERATIONS);
    expect(DEFAULT_MAX_REVIEW_ITERATIONS).toBeLessThanOrEqual(HARD_MAX_REVIEW_ITERATIONS);
    expect(HARD_MAX_REVIEW_ITERATIONS).toBeLessThanOrEqual(20);
    for (const cap of [
      MIN_MAX_REVIEW_ITERATIONS,
      DEFAULT_MAX_REVIEW_ITERATIONS,
      HARD_MAX_REVIEW_ITERATIONS,
    ]) {
      expect(Number.isInteger(cap)).toBe(true);
    }
  });

  it("pins the values generated prompt text is lockstepped against", () => {
    expect(MIN_MAX_REVIEW_ITERATIONS).toBe(1);
    // TEST CHANGE, justified (2026-10-09, plan 019 file 2, unit p4a-review-cap): the default
    // review cap moved from 4 to 3 (REQ-FLOW-064: rounds stop when they stop paying);
    // the floor and the ceiling are unchanged.
    expect(DEFAULT_MAX_REVIEW_ITERATIONS).toBe(3);
    expect(HARD_MAX_REVIEW_ITERATIONS).toBe(10);
  });
});

describe("clampReviewIterations", () => {
  it("raises anything below the floor to MIN", () => {
    expect(clampReviewIterations(MIN_MAX_REVIEW_ITERATIONS - 1)).toBe(MIN_MAX_REVIEW_ITERATIONS);
    expect(clampReviewIterations(0)).toBe(MIN_MAX_REVIEW_ITERATIONS);
    expect(clampReviewIterations(-5)).toBe(MIN_MAX_REVIEW_ITERATIONS);
    expect(clampReviewIterations(-Infinity)).toBe(MIN_MAX_REVIEW_ITERATIONS);
  });

  it("lowers anything above the ceiling to HARD", () => {
    expect(clampReviewIterations(HARD_MAX_REVIEW_ITERATIONS + 1)).toBe(HARD_MAX_REVIEW_ITERATIONS);
    expect(clampReviewIterations(999)).toBe(HARD_MAX_REVIEW_ITERATIONS);
    // An unbounded request is exactly what the ceiling exists to bound.
    expect(clampReviewIterations(Infinity)).toBe(HARD_MAX_REVIEW_ITERATIONS);
  });

  it("is the identity on every integer inside the band", () => {
    for (let n = MIN_MAX_REVIEW_ITERATIONS; n <= HARD_MAX_REVIEW_ITERATIONS; n += 1) {
      expect(clampReviewIterations(n)).toBe(n);
    }
    expect(clampReviewIterations(DEFAULT_MAX_REVIEW_ITERATIONS)).toBe(
      DEFAULT_MAX_REVIEW_ITERATIONS,
    );
  });

  it("returns MIN for NaN and never propagates it", () => {
    const clamped = clampReviewIterations(Number.NaN);
    expect(Number.isNaN(clamped)).toBe(false);
    expect(clamped).toBe(MIN_MAX_REVIEW_ITERATIONS);
  });

  it("floors fractions so a fractional cap never buys an extra round", () => {
    expect(clampReviewIterations(4.9)).toBe(4);
    expect(clampReviewIterations(1.999)).toBe(1);
    // Floors to 0, which is below the band and lands on MIN.
    expect(clampReviewIterations(0.5)).toBe(MIN_MAX_REVIEW_ITERATIONS);
    expect(clampReviewIterations(10.9)).toBe(HARD_MAX_REVIEW_ITERATIONS);
  });

  it("always lands on an in-band integer, for any number at all", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (requested) => {
        const clamped = clampReviewIterations(requested);
        expect(Number.isInteger(clamped)).toBe(true);
        expect(clamped).toBeGreaterThanOrEqual(MIN_MAX_REVIEW_ITERATIONS);
        expect(clamped).toBeLessThanOrEqual(HARD_MAX_REVIEW_ITERATIONS);
      }),
    );
  });

  it("is idempotent — clamping a clamped value changes nothing", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (requested) => {
        const once = clampReviewIterations(requested);
        expect(clampReviewIterations(once)).toBe(once);
      }),
    );
  });
});

/**
 * The shipped roster. These cases replace the previous "ships empty" block:
 * the table carried no rows while the specialist agents were unwritten, and
 * asserting emptiness was the contract for that stage only. The behaviour that
 * block protected — consumers must not assume rows exist — is unchanged and is
 * still covered, by the empty-table case at the end of this describe and by
 * every fixture-table case below.
 */
describe("SPECIALIST_TRIGGER_TABLE — the shipped roster", () => {
  const SPECIALISTS: readonly string[] = [
    "stamity-security",
    "stamity-design-quality",
    "stamity-performance",
  ];

  it("ships exactly the three trigger-conditional specialists, in runtime id form", () => {
    expect(SPECIALIST_TRIGGER_TABLE.map((row) => row.specialist)).toEqual(SPECIALISTS);
  });

  it("carries no duplicate ids", () => {
    expect(duplicateSpecialistIds(SPECIALIST_TRIGGER_TABLE)).toEqual([]);
    expect(duplicateSpecialistIds()).toEqual([]);
  });

  it("names only specialists the policy roster grants — never a NO_POLICY spawn", () => {
    // The silent-lockout pairing: a trigger row invites the specialist in and
    // the tool-policy guard answers NO_POLICY, so the agent runs with nothing
    // allowed. The two rosters are separate modules, so the join is asserted.
    const granted = new Set(AGENT_POLICY_ROSTER.map((row) => row.agentId));

    for (const row of SPECIALIST_TRIGGER_TABLE) {
      expect(granted.has(row.specialist), `${row.specialist} has no policy row`).toBe(true);
    }
  });

  it("gives every row usable patterns, keywords, and a rationale of its own", () => {
    for (const row of SPECIALIST_TRIGGER_TABLE) {
      expect(row.triggerPaths.length, row.specialist).toBeGreaterThan(0);
      expect(row.triggerKeywords.length, row.specialist).toBeGreaterThan(0);
      expect(row.rationale.trim(), row.specialist).not.toBe("");
      expect(row.rationale.trimEnd().endsWith("."), row.specialist).toBe(true);
      expect(new Set(row.triggerPaths).size, row.specialist).toBe(row.triggerPaths.length);
    }
    const rationales = SPECIALIST_TRIGGER_TABLE.map((row) => row.rationale);
    expect(new Set(rationales).size).toBe(rationales.length);
  });

  it("holds no malformed pattern — none blank, separator-only, or match-all", () => {
    // A blank or separator-only pattern matches nothing, so it reads as a
    // configured trigger while triggering never; `*` matches everything, which
    // would make a specialist always-on rather than trigger-conditional.
    for (const row of SPECIALIST_TRIGGER_TABLE) {
      for (const pattern of row.triggerPaths) {
        const trimmed = pattern.trim();
        expect(trimmed, `${row.specialist}: blank pattern`).not.toBe("");
        expect(
          trimmed.replaceAll("/", ""),
          `${row.specialist}: separator-only pattern ${JSON.stringify(pattern)}`,
        ).not.toBe("");
        expect(trimmed, `${row.specialist}: match-all pattern`).not.toBe("*");
      }
    }
  });
});

describe("specialistsForPath on the shipped table", () => {
  it("pulls in security for an auth/ segment at any depth", () => {
    expect(specialistsForPath("src/server/auth/session.ts")).toEqual(["stamity-security"]);
    expect(specialistsForPath("auth/login.go")).toEqual(["stamity-security"]);
  });

  it("pulls in security for a dependency manifest, by exact basename", () => {
    expect(specialistsForPath("package.json")).toEqual(["stamity-security"]);
    expect(specialistsForPath("apps/web/package-lock.json")).toEqual(["stamity-security"]);
    // Exact basename, not a substring: a doc about the manifest is not the manifest.
    expect(specialistsForPath("docs/package.json.md")).toEqual([]);
  });

  it("pulls in design-quality for a *.tsx basename and a components/ segment", () => {
    expect(specialistsForPath("src/app/page.tsx")).toEqual(["stamity-design-quality"]);
    expect(specialistsForPath("src/components/Button.vue")).toEqual(["stamity-design-quality"]);
    // `.ts` is not `.tsx` — the suffix match is on the whole extension.
    expect(specialistsForPath("src/app/page.ts")).toEqual([]);
  });

  it("pulls in performance for a *.sql file and a workers/ segment", () => {
    expect(specialistsForPath("db/queries/report.sql")).toEqual([
      "stamity-performance",
    ]);
    expect(specialistsForPath("src/workers/digest.ts")).toEqual(["stamity-performance"]);
  });

  it("returns every matching specialist when a path is on two surfaces", () => {
    // A rendered surface inside an api/ segment is genuinely both, and the
    // table returns both rather than letting the first row win.
    expect(specialistsForPath("src/api/dashboard/panel.tsx")).toEqual([
      "stamity-security",
      "stamity-design-quality",
    ]);
  });

  it("triggers nothing for a path on no specialist surface", () => {
    for (const path of ["README.md", "src/types/core.ts", "no-extension"]) {
      expect(specialistsForPath(path), path).toEqual([]);
    }
  });

  it("returns [] for an empty path, and still triggers nothing on an empty table", () => {
    expect(specialistsForPath("")).toEqual([]);
    // The consumer contract the module header states: an empty table triggers
    // nothing rather than throwing or defaulting to a row.
    expect(specialistsForPath("src/server/auth/session.ts", [])).toEqual([]);
  });

  it("finds a shipped row by id, and nothing for an unshipped one", () => {
    expect(findSpecialistTrigger("stamity-security")?.triggerPaths).toContain("auth/");
    expect(findSpecialistTrigger("interface-reviewer")).toBeUndefined();
    expect(findSpecialistTrigger("")).toBeUndefined();
  });
});

describe("findSpecialistTrigger on a filled table", () => {
  it("returns the matching row", () => {
    expect(findSpecialistTrigger("backend-reviewer", FILLED_TABLE)?.rationale).toBe(
      "Request handlers own the reliability budget.",
    );
    expect(findSpecialistTrigger("absent", FILLED_TABLE)).toBeUndefined();
  });

  it("returns the FIRST row on a duplicate id, and flags it as a validator failure", () => {
    // Duplicate ids are a roster data defect, not a supported merge: the lookup
    // stays first-wins and predictable, while duplicateSpecialistIds is the
    // check the roster validator must run so a duplicate never ships.
    const withDuplicate: readonly SpecialistTrigger[] = [
      ...FILLED_TABLE,
      {
        specialist: "backend-reviewer",
        triggerPaths: ["handlers/"],
        triggerKeywords: ["shadow row"],
        rationale: "Second row with an id already taken.",
      },
    ];

    expect(findSpecialistTrigger("backend-reviewer", withDuplicate)).toBe(withDuplicate[2]);
    expect(findSpecialistTrigger("backend-reviewer", withDuplicate)?.rationale).toBe(
      "Request handlers own the reliability budget.",
    );
    expect(duplicateSpecialistIds(withDuplicate)).toEqual(["backend-reviewer"]);
  });

  it("reports every duplicated id once, whatever the multiplicity", () => {
    expect(
      duplicateSpecialistIds([idRow("a"), idRow("a"), idRow("a"), idRow("b"), idRow("b")]),
    ).toEqual(["a", "b"]);
    expect(duplicateSpecialistIds([idRow("a"), idRow("b")])).toEqual([]);
  });
});

describe("specialistsForPath matching semantics", () => {
  it("matches a basename suffix pattern", () => {
    expect(specialistsForPath("src/app/page.tsx", FILLED_TABLE)).toEqual(["interface-reviewer"]);
  });

  it("matches an exact basename pattern, not a path substring", () => {
    expect(specialistsForPath("package.json", FILLED_TABLE)).toEqual(["supply-chain-reviewer"]);
    expect(specialistsForPath("apps/web/package.json", FILLED_TABLE)).toEqual([
      "supply-chain-reviewer",
    ]);
    expect(specialistsForPath("docs/package.json.md", FILLED_TABLE)).toEqual([]);
  });

  it("matches a directory-segment glob at any depth, including the leading segment", () => {
    expect(specialistsForPath("src/server/routes/auth.ts", FILLED_TABLE)).toEqual([
      "backend-reviewer",
    ]);
    expect(specialistsForPath("routes/auth.ts", FILLED_TABLE)).toEqual(["backend-reviewer"]);
  });

  it("does not let a segment glob match a mere substring of a name", () => {
    expect(specialistsForPath("src/myroutesfile.ts", FILLED_TABLE)).toEqual([]);
    expect(specialistsForPath("src/routesmanager/index.ts", FILLED_TABLE)).toEqual([]);
  });

  it("normalizes to posix separators, so platform never changes the result", () => {
    const posix = "src/server/routes/auth.ts";
    const windows = "src\\server\\routes\\auth.ts";
    expect(specialistsForPath(windows, FILLED_TABLE)).toEqual(
      specialistsForPath(posix, FILLED_TABLE),
    );
    expect(specialistsForPath(windows, FILLED_TABLE)).toEqual(["backend-reviewer"]);
    expect(specialistsForPath("apps\\web\\package.json", FILLED_TABLE)).toEqual([
      "supply-chain-reviewer",
    ]);
  });

  it("matches case-insensitively on both path and pattern", () => {
    expect(specialistsForPath("SRC/Server/Routes/Auth.TS", FILLED_TABLE)).toEqual([
      "backend-reviewer",
    ]);
    expect(specialistsForPath("src/app/Page.TSX", FILLED_TABLE)).toEqual(["interface-reviewer"]);
  });

  it("reports a specialist once even when several of its patterns match", () => {
    // Hits both `*.tsx` and `components/` on the one row.
    expect(specialistsForPath("src/components/Button.tsx", FILLED_TABLE)).toEqual([
      "interface-reviewer",
    ]);
  });

  it("returns every matching specialist, in table order", () => {
    const overlapping: readonly SpecialistTrigger[] = [
      ...FILLED_TABLE,
      {
        specialist: "docs-reviewer",
        // Fixture data kept out of the test-input census: "*.md" is built at run time, as a literal it names every top-level .md.
        triggerPaths: ["routes/", ["*", "md"].join(".")],
        triggerKeywords: ["docs"],
        rationale: "Route changes alter documented behaviour.",
      },
    ];
    expect(specialistsForPath("src/routes/auth.ts", overlapping)).toEqual([
      "backend-reviewer",
      "docs-reviewer",
    ]);
  });

  it("returns [] for an empty path and ignores empty patterns", () => {
    const emptyPattern: readonly SpecialistTrigger[] = [
      {
        specialist: "noop-reviewer",
        triggerPaths: ["", "   "],
        triggerKeywords: [],
        rationale: "Malformed row: patterns must never match everything.",
      },
    ];
    expect(specialistsForPath("", FILLED_TABLE)).toEqual([]);
    expect(specialistsForPath("src/app/page.tsx", emptyPattern)).toEqual([]);
  });

  it("treats `*` as the always-trigger pattern", () => {
    // The row shape carries no mode flag, so `*` is how a specialist that must
    // see every change is authored. Pinned here because the roster rows land
    // later and will rely on this spelling.
    const always: readonly SpecialistTrigger[] = [
      {
        specialist: "always-reviewer",
        triggerPaths: ["*"],
        triggerKeywords: [],
        rationale: "Sees every change.",
      },
    ];
    for (const path of ["src/app/page.tsx", "README", "deep/nested/file.rs", "package.json"]) {
      expect(specialistsForPath(path, always)).toEqual(["always-reviewer"]);
    }
    // Still bounded by the path guard rather than matching a non-path.
    expect(specialistsForPath("", always)).toEqual([]);
  });

  it("does not let a malformed separator-only pattern match everything", () => {
    // A bare `/` would match every absolute path if it fell through to the
    // segment-glob branch, so a typo would silently read as an always-on row.
    const malformed: readonly SpecialistTrigger[] = [
      {
        specialist: "typo-reviewer",
        triggerPaths: ["/", "//", " / "],
        triggerKeywords: [],
        rationale: "Malformed row: separator-only patterns match nothing.",
      },
    ];
    for (const path of ["/abs/path.ts", "src/app/page.tsx", "/"]) {
      expect(specialistsForPath(path, malformed)).toEqual([]);
    }
  });

  it("ignores surrounding whitespace in a pattern", () => {
    const padded: readonly SpecialistTrigger[] = [
      {
        specialist: "padded-reviewer",
        triggerPaths: ["  routes/  ", " *.tsx "],
        triggerKeywords: [],
        rationale: "Whitespace is authoring noise, not part of the pattern.",
      },
    ];
    expect(specialistsForPath("src/routes/auth.ts", padded)).toEqual(["padded-reviewer"]);
    expect(specialistsForPath("src/app/page.tsx", padded)).toEqual(["padded-reviewer"]);
    expect(specialistsForPath("src/app/page.ts", padded)).toEqual([]);
  });

  // Added 2026-10-09 (plan 019 file 2, the p5 group's fix round 1, `build/63`, `review/169`): two
  // more forms, so a row can name one file inside one folder and a basename's prefix.
  it("matches a folder-qualified basename as the path's last segments, never a substring", () => {
    const qualified: readonly SpecialistTrigger[] = [
      {
        specialist: "client-reviewer",
        triggerPaths: [".claude/settings.json"],
        triggerKeywords: [],
        rationale: "A file named inside one folder.",
      },
    ];
    for (const path of [".claude/settings.json", "apps/web/.claude/settings.json", ".Claude\\Settings.JSON"]) {
      expect(specialistsForPath(path, qualified), path).toEqual(["client-reviewer"]);
    }
    for (const path of ["settings.json", "src/settings.json", "x.claude/settings.json", ".claude/settings.json.bak"]) {
      expect(specialistsForPath(path, qualified), path).toEqual([]);
    }
  });

  it("matches a basename prefix ending `.*`, and only on the basename", () => {
    const prefixed: readonly SpecialistTrigger[] = [
      {
        specialist: "build-reviewer",
        triggerPaths: ["dockerfile.*"],
        triggerKeywords: [],
        rationale: "A basename's prefix.",
      },
    ];
    for (const path of ["Dockerfile.prod", "services/api/dockerfile.dev"]) {
      expect(specialistsForPath(path, prefixed), path).toEqual(["build-reviewer"]);
    }
    for (const path of ["Dockerfile", "dockerfile.", "src/mydockerfile.prod", "dockerfile.prod/readme.md"]) {
      expect(specialistsForPath(path, prefixed), path).toEqual([]);
    }
  });
});

describe("the security row's client, CI and install-steering rows (build/63, review/159, review/164, review/169)", () => {
  it("pulls in security for client hooks and settings only inside client configuration folders", () => {
    for (const path of [
      ".claude/hooks/pre-tool.js",
      ".cursor/hooks/audit.mjs",
      ".codex/hooks/stop.py",
      ".github/hooks/policy.json",
      ".stamity/hooks/guard.mjs",
      ".stamity/generated/hooks/pre-tool-use.mjs",
      ".husky/pre-commit",
      "plugin/hooks/hooks.json",
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".vscode/settings.json",
      ".mcp.json",
      ".cursor/mcp.json",
    ]) {
      expect(specialistsForPath(path), path).toEqual(["stamity-security"]);
    }
    // A front-end hook folder and a settings file outside a client folder are not client configuration.
    for (const path of ["src/hooks/useAuth.ts", "test/hooks/scripts.test.ts", "web/hooks/useCart.js", "config/settings.json"]) {
      expect(specialistsForPath(path), path).toEqual([]);
    }
  });

  it("pulls in security for container builds, composite actions and install-steering files", () => {
    for (const path of [
      "Dockerfile",
      "deploy/Dockerfile.prod",
      "api.Dockerfile",
      "Containerfile",
      ".github/actions/setup/action.yml",
      "action.yml",
      "tools/release/action.yaml",
      ".npmrc",
      "web/.npmrc",
      ".yarnrc",
      ".yarnrc.yml",
      ".pnpmfile.cjs",
      "npm-shrinkwrap.json",
    ]) {
      expect(specialistsForPath(path), path).toEqual(["stamity-security"]);
    }
    for (const path of ["docs/actions.md", "dockerfiles/readme.txt", "src/npmrc.ts"]) {
      expect(specialistsForPath(path), path).toEqual([]);
    }
  });

  // Added 2026-10-09 (run 2026-10-08_product-core, review/180, review/181 signed off): Codex's MCP server file and
  // the manifest's documented `.config/stamity/hooks` folder join the row. A top-level `hooks/` folder does not:
  // the grammar has no root-anchored form, and the bare segment would take every front-end hook folder back, so a
  // repository whose hooks directory is `hooks` places it through its class file.
  it("pulls in security for Codex's config.toml and the .config/stamity/hooks folder, and names no bare hooks/ folder", () => {
    for (const path of [".codex/config.toml", "apps/x/.codex/config.toml", ".Codex\\Config.TOML", ".config/stamity/hooks/guard.json", ".config/stamity/hooks/guard.mjs"]) {
      expect(specialistsForPath(path), path).toEqual(["stamity-security"]);
    }
    for (const path of ["config.toml", "src/config.toml", "x.codex/config.toml", ".config/other/hooks/a.mjs", "hooks/guard.json", "hooks/guard.mjs"]) {
      expect(specialistsForPath(path), path).toEqual([]);
    }
  });
});

/**
 * The trigger module's header names its consumers. It used to name two that do
 * not exist — a validator lane and generated prompt text — which is a claim a
 * reader cannot check and a maintainer cannot maintain. It now names four
 * files, and this block is what makes that list a checkable statement rather
 * than a second thing to keep in sync by hand.
 *
 * Both directions are asserted. A path the header names that does not read the
 * table fails the first case; a `src/` module that starts reading the table
 * fails the second, which is the day the header's "no `src/` module does" stops
 * being true and has to be rewritten with the new consumer in it.
 */
describe("src/roster/triggers.ts — the header's consumer claim", () => {
  const MODULE_PATH = "src/roster/triggers.ts";
  const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
  const SOURCE = readFileSync(join(REPO_ROOT, MODULE_PATH), "utf8");

  /** Everything above the first declaration: the module doc comment. */
  const HEADER = SOURCE.slice(0, SOURCE.indexOf("\nexport "));

  /** Every repo-relative `.ts` path the header quotes in backticks. */
  const NAMED: readonly string[] = [
    ...new Set([...HEADER.matchAll(/`((?:src|test)\/[\w./-]+\.ts)`/g)].map((match) => match[1]!)),
  ];

  it("names consumers at all, and every one of them reads the table", () => {
    // Non-degenerate: an empty list would satisfy the loop vacuously, and an
    // empty list is exactly what the pre-fix header carried.
    expect(NAMED.length).toBeGreaterThanOrEqual(4);

    for (const relative of NAMED) {
      const consumer = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(consumer, `${relative} does not import ${MODULE_PATH}`).toContain("roster/triggers.ts");
    }
  });

  /** The composition root imports every module to wire the graph; it reads none of them. */
  const REGISTRY = "composition/root.ts";

  /*
   * TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, p1d-classify-security-row.
   * This case pinned "no src/ module reads the table" (`importers` equal to `[]`). The change
   * classifier now reads the security row to place a path in `security-sensitive` and unions the
   * rows into a change's lenses (REQ-FLOW-061, REQ-FLOW-065), so the pin moves to "the classifier
   * is the one src/ importer", and the header must name it.
   */
  it("holds the header's other half: the change classifier is the one src/ module reading the table", () => {
    const srcRoot = join(REPO_ROOT, "src");
    const modules = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
      .filter((relative) => relative.endsWith(".ts"))
      .map((relative) => relative.split(sep).join("/"))
      .filter((relative) => `src/${relative}` !== MODULE_PATH && relative !== REGISTRY);

    // Non-degenerate: the walk found the engine, not an empty directory.
    expect(modules.length).toBeGreaterThan(50);

    // The one exclusion, earned rather than assumed: the registry names the
    // module in a namespace import and touches nothing it exports.
    const registry = readFileSync(join(srcRoot, REGISTRY), "utf8");
    expect(registry).toContain('import * as rosterTriggers from "../roster/triggers.ts"');
    expect(registry).not.toMatch(/specialistsForPath|findSpecialistTrigger|SPECIALIST_TRIGGER_TABLE/);

    const importers = modules.filter((relative) =>
      readFileSync(join(srcRoot, relative), "utf8").includes("roster/triggers.ts"),
    );
    // When this fails, the header is what needs the edit: name the new consumer
    // there, and this case goes green describing the truth again.
    expect(importers).toEqual(["change/classify.ts"]);
    expect(NAMED).toContain("src/change/classify.ts");
  });

  it("no longer claims the two consumers that never existed", () => {
    expect(HEADER).not.toMatch(/[Ss]ingle source of truth for both/);
    // The retraction stays readable — the header says what the old claim was —
    // so these assert the CLAIM shape, not the absence of the words.
    expect(HEADER).not.toMatch(/is the single source of truth for the validator/i);
  });
});
