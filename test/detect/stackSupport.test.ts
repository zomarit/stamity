import { describe, expect, it } from "vitest";
import { DETECTABLE_LANGUAGES } from "../../src/detect/repoAnalyzer.ts";
import {
  FRAMEWORK_SUPPORT,
  LANGUAGE_SUPPORT,
  STACK_GUIDANCE_INVENTORY,
  classifyDetectedStacks,
  classifyFramework,
  classifyLanguage,
  classifyStacksAgainst,
  deriveStackSupport,
  suggestStackPacks,
} from "../../src/detect/stackSupport.ts";
import type { Framework, RepoInfo } from "../../src/types/detect.ts";

/**
 * Coverage for `src/detect/stackSupport.ts`.
 *
 * This file is a MOVE, not new coverage and not a reduction. A maintainer ruling
 * deleted `test/detect/aux.test.ts` along with the three detect modules it
 * mostly covered; stackSupport was kept and wired into the init stack-suggestion
 * pass, so every case from that file's `describe("stack support")` block lives
 * on here — six of them, each marked below as ported unchanged or as an
 * expectation that legitimately moved with it, with the reason inline. Nothing
 * was dropped.
 *
 * What moved: the tiers used to be asserted row by row, and nine of them
 * claimed guidance the corpus does not contain. They are now derived from
 * `STACK_GUIDANCE_INVENTORY`, which is empty, so every shipped row reads
 * `partial` — and the cases that used to turn on a `full` row now drive the
 * derivation with a fixture inventory instead, which is what proves the table
 * is computed rather than restated.
 */

/** A `RepoInfo` carrying only the facts a case is about; everything else reads empty. */
function repoInfo(facts: Partial<Omit<RepoInfo, "packageManager">> = {}): RepoInfo {
  return {
    rootDir: "/repo",
    languages: [],
    frameworks: [],
    linters: [],
    testFrameworks: [],
    ciProviders: [],
    monorepoPackages: [],
    hasDockerfile: false,
    hasDataArtifacts: false,
    hasExistingAgents: false,
    existingTools: [],
    ...facts,
  };
}

/**
 * The whole `Framework` union, enumerated. `satisfies` catches a name this list
 * carries that the union does not; the key-set case below catches the reverse,
 * and the source's `Record<Framework, …>` is what makes a new framework fail to
 * compile before either can run.
 */
const ALL_FRAMEWORKS = [
  "next",
  "angular",
  "vue",
  "svelte",
  "sveltekit",
  "remix",
  "astro",
  "nuxt",
  "react",
  "express",
  "fastify",
  "hono",
  "nestjs",
  "django",
  "flask",
  "rails",
  "spring",
  "laravel",
  "tanstack-start",
  "solid-start",
  "qwik",
  "fastapi",
  "phoenix",
  "axum",
  "actix",
] as const satisfies readonly Framework[];

describe("the shipped support tables", () => {
  it("claims nothing it does not ship: every row reads partial, no row says it ships", () => {
    // The review's finding in one assertion. Nine framework rows and
    // eleven language rows used to read `full` with "Dedicated X guidance ships
    // with the corpus" against a corpus of twelve generic glob rules and zero
    // stack-idiom files. "ship" is the claim word — it belongs to the `full`
    // note alone, so its absence here is the proof that no row overstates.
    expect(STACK_GUIDANCE_INVENTORY.size).toBe(0);

    const rows = [...Object.entries(FRAMEWORK_SUPPORT), ...Object.entries(LANGUAGE_SUPPORT)];
    expect(rows.length).toBeGreaterThan(40);

    for (const [name, support] of rows) {
      expect(support.tier, name).toBe("partial");
      expect(support.notes, name).not.toMatch(/ship/i);
      // The floor is stated, not implied: an honest tier that names nothing a
      // user gets reads as a failure instead of a floor.
      expect(support.notes, name).toMatch(/charter floor/i);
      expect(support.notes, name).toMatch(/file-scoped rule/i);
    }
  });

  it("carries a note on every framework row", () => {
    // Ported unchanged from test/detect/aux.test.ts.
    for (const [framework, support] of Object.entries(FRAMEWORK_SUPPORT)) {
      expect(support.notes, framework).not.toBe("");
    }
  });

  it("maps every language detection can emit, so none is only ever drift", () => {
    // Ported unchanged from test/detect/aux.test.ts.
    const unmapped = DETECTABLE_LANGUAGES.filter(
      (language) => classifyLanguage(language).tier === "none",
    );

    expect(unmapped).toEqual([]);
  });

  it("keys the framework table by the whole Framework union", () => {
    // The compile-time guarantee survived the move to a derived table: the
    // derivation preserves its subject map's key set, and that map is a
    // `Record<Framework, string>`.
    expect(Object.keys(FRAMEWORK_SUPPORT).toSorted()).toEqual(ALL_FRAMEWORKS.toSorted());
  });

  it("reports an unmapped language as none with something to act on", () => {
    // Ported unchanged from test/detect/aux.test.ts.
    const support = classifyLanguage("cobol");

    expect(support.tier).toBe("none");
    expect(support.notes).toMatch(/add project rules/i);
    expect(support.notes).toMatch(/verification gates/i);
  });

  it("falls back to unmapped for a framework value cast in from outside the type", () => {
    // The fallback's only real caller: a framework name read back from a
    // manifest an older build wrote.
    const support = classifyFramework("winforms" as Framework);

    expect(support.tier).toBe("none");
    expect(support.notes).toMatch(/add project rules/i);
  });
});

describe("derivation from the guidance inventory", () => {
  it("flips exactly the inventoried subject's row and leaves every other row untouched", () => {
    // The core requirement: the tables are computed from the inventory, so
    // one added subject moves one row and a restated table could not survive
    // this case.
    const tables = deriveStackSupport(new Set([...STACK_GUIDANCE_INVENTORY, "Next.js"]));

    expect(tables.frameworks.next).toEqual({
      tier: "full",
      notes:
        "Dedicated Next.js guidance ships with the corpus, on top of the always-on charter floor.",
    });

    for (const [name, support] of Object.entries(tables.frameworks)) {
      if (name === "next") continue;
      expect(support, name).toEqual(FRAMEWORK_SUPPORT[name as Framework]);
    }
    expect(tables.languages).toEqual(LANGUAGE_SUPPORT);
  });

  it("lights every stack that shares one subject, so the axes cannot disagree by accident", () => {
    // Guidance is authored per subject, not per stack name: one Python file
    // answers the language and its three web frameworks at once. This is what
    // makes the no-cross-axis-suppression claim in classifyStacksAgainst
    // structural — django can never read `full` while python reads `partial`.
    const tables = deriveStackSupport(new Set(["Python"]));

    for (const framework of ["django", "flask", "fastapi"] as const) {
      expect(tables.frameworks[framework].tier, framework).toBe("full");
    }
    expect(tables.languages.python?.tier).toBe("full");

    // Nothing else moved: Rust's frameworks share Rust's subject, not Python's.
    expect(tables.frameworks.axum.tier).toBe("partial");
    expect(tables.languages.rust?.tier).toBe("partial");
  });

  it("classifies the two axes independently", () => {
    // Ported from test/detect/aux.test.ts; the expectation moved with the wiring.
    // It used to read django `full` / next `partial` against hard-coded rows.
    // The doctrine it protects is unchanged — a framework row answers the
    // framework's idioms and a language row answers the language's, and
    // collapsing them loses the one the user asked about — so it is now driven
    // through the inventory: shipping Next.js guidance says nothing about
    // TypeScript, and shipping TypeScript guidance says nothing about Next.js.
    const withNext = deriveStackSupport(new Set(["Next.js"]));
    expect(withNext.frameworks.next.tier).toBe("full");
    expect(withNext.languages.typescript?.tier).toBe("partial");

    const withTypeScript = deriveStackSupport(new Set(["TypeScript and JavaScript"]));
    expect(withTypeScript.frameworks.next.tier).toBe("partial");
    expect(withTypeScript.languages.typescript?.tier).toBe("full");
    expect(withTypeScript.languages.java?.tier).toBe("partial");
  });
});

describe("classifyDetectedStacks", () => {
  it("reports the detected stacks that read below full, frameworks first", () => {
    // Ported from test/detect/aux.test.ts; the expectation moved with the wiring.
    // The ordering it asserts — frameworks before languages, most specific
    // first — is unchanged. What moved is `typescript`: it used to be filtered
    // out as `full`, and with the inventory empty it is reported like the rest.
    const stacks = classifyDetectedStacks(
      repoInfo({ frameworks: ["next"], languages: ["typescript", "java"] }),
    );

    expect(stacks).toEqual([
      { name: "next", kind: "framework", support: classifyFramework("next") },
      { name: "typescript", kind: "language", support: classifyLanguage("typescript") },
      { name: "java", kind: "language", support: classifyLanguage("java") },
    ]);
  });

  it("de-duplicates a name detection reported twice", () => {
    const stacks = classifyDetectedStacks(
      repoInfo({ frameworks: ["react", "react"], languages: ["java", "java", "scala"] }),
    );

    expect(stacks.map((stack) => stack.name)).toEqual(["react", "java", "scala"]);
  });

  it("stays silent only when every detected stack reads full", () => {
    // Ported from test/detect/aux.test.ts; the expectation moved with the wiring.
    // django + python used to return [] against hard-coded `full` rows. With
    // the shipped inventory empty, the honest answer is both rows — and the
    // silent case is proved where it now lives, against a pair of tables in
    // which the stacks really are covered. The `full` filter must stay live:
    // the first stack pack that ships makes it fire in production again.
    const detected = repoInfo({ frameworks: ["django"], languages: ["python"] });

    expect(classifyDetectedStacks(detected).map((stack) => stack.name)).toEqual([
      "django",
      "python",
    ]);
    expect(classifyStacksAgainst(detected, deriveStackSupport(new Set(["Python"])))).toEqual([]);
    // Nothing detected is silent on any inventory.
    expect(classifyDetectedStacks(repoInfo())).toEqual([]);
  });
});

describe("suggestStackPacks", () => {
  const detected = repoInfo({
    frameworks: ["next", "express"],
    languages: ["typescript", "cobol"],
  });

  it("suggests writing the rules, never installing a pack that does not exist", () => {
    // Stack packs are SUGGESTED by detection, never auto-installed —
    // and with no stack pack in the curated catalog, an "install the X pack"
    // line would send a user after something `stamity add` cannot resolve.
    //
    // MODIFIED: the two per-row phrase assertions moved from every row to the
    // `none` row. They asserted a CONSTANT action string, which is the defect
    // this change removes — the row now prints its own tier note, so the
    // write-the-rules sentence belongs to the tier that actually asks for it.
    // The install-refusal assertion, which is what the case is named for, is
    // unchanged and still binds every row.
    const suggestions = suggestStackPacks(detected);

    expect(suggestions.length).toBe(4);
    for (const suggestion of suggestions) {
      expect(suggestion.packId, suggestion.name).toBeUndefined();
      expect(suggestion.action, suggestion.name).not.toMatch(/install/i);
      expect(suggestion.action, suggestion.name).not.toBe("");
    }

    const unmapped = suggestions.find((row) => row.tier === "none");
    expect(unmapped?.action).toMatch(/add project rules/i);
    expect(unmapped?.action).toMatch(/verification gates/i);
  });

  it("carries each row's own support note instead of repeating one sentence", () => {
    // The defect: both inventories are empty by design, so this branch fires on
    // 100% of installs — and a constant action made a four-stack repo read the
    // identical instruction four times while the per-tier note and the subject,
    // the only parts that differed, were computed and dropped one line later.
    const suggestions = suggestStackPacks(detected);
    const actions = suggestions.map((row) => row.action);

    expect(new Set(actions).size).toBe(actions.length);
    for (const suggestion of suggestions) {
      expect(suggestion.action, suggestion.name).toBe(
        suggestion.kind === "framework"
          ? classifyFramework(suggestion.name as Framework).notes
          : classifyLanguage(suggestion.name).notes,
      );
    }
    // The subject reaches the reader: the row for `next` names Next.js, and the
    // row for `typescript` names its own subject, not the framework's.
    expect(suggestions[0]?.action).toContain("Next.js");
    expect(suggestions[2]?.action).toContain("TypeScript");
    // The unmapped tier reads visibly differently from the partial tier.
    expect(suggestions.at(-1)?.action).toMatch(/unmapped/i);
  });

  it("keeps the classify order and carries each row's tier", () => {
    // Frameworks before languages, most specific first, so the panel's cap
    // keeps the rows that matter; the unmapped language keeps its `none`.
    expect(suggestStackPacks(detected).map((row) => [row.name, row.kind, row.tier])).toEqual([
      ["next", "framework", "partial"],
      ["express", "framework", "partial"],
      ["typescript", "language", "partial"],
      ["cobol", "language", "none"],
    ]);
  });

  it("names the pack when the catalog carries one for the subject", () => {
    // The branch that must survive until a stack pack ships: a catalogued
    // subject turns the row into a copy-pasteable install line, and every other
    // row keeps the write-your-own-rules action.
    const suggestions = suggestStackPacks(detected, new Map([["Next.js", "next-stack"]]));
    const [next, express] = suggestions;

    expect(next?.packId).toBe("next-stack");
    expect(next?.action).toBe("Install the next-stack pack: stamity add next-stack");
    expect(express?.packId).toBeUndefined();
    // MODIFIED from /add project rules/i: the uncatalogued row now prints its
    // own support note, which names the subject and the floor that does apply.
    // Same claim as before — this row is NOT an install line — stated against
    // the string the row actually carries.
    expect(express?.action).toBe(classifyFramework("express").notes);
    expect(express?.action).toMatch(/express/i);
    expect(express?.action).not.toMatch(/install/i);
  });

  it("offers one pack to every stack that shares its subject", () => {
    // Same subject keying as the guidance inventory: a Python pack answers the
    // language and its frameworks, so both rows name it rather than one row
    // naming it and the other sending the user to write rules by hand.
    const suggestions = suggestStackPacks(
      repoInfo({ frameworks: ["django"], languages: ["python"] }),
      new Map([["Python", "python-stack"]]),
    );

    expect(suggestions.map((row) => [row.name, row.packId])).toEqual([
      ["django", "python-stack"],
      ["python", "python-stack"],
    ]);
    for (const suggestion of suggestions) {
      expect(suggestion.action, suggestion.name).toBe(
        "Install the python-stack pack: stamity add python-stack",
      );
    }
  });
});
