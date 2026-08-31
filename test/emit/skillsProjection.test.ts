import { parse } from "yaml";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EmissionContext } from "../../src/cli/engine/emission.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import {
  NATIVE_SKILL_DIRS,
  SKILLS_PROJECTION_DIR,
  projectSkills,
  retargetProjection,
  type ProjectedFile,
  type ProjectSkillsOptions,
} from "../../src/emit/skillsProjection.ts";
import { PLATFORM_TOOL_MARKER, buildAskUserPlatformTable } from "../../src/tools/translator.ts";
import type { ContentSelection } from "../../src/types/content.ts";
import type { DetectedSummary } from "../../src/types/detect.ts";
import { EngineError } from "../../src/types/errors.ts";
import { makeVolume } from "../support/vfs.ts";

/**
 * Two lanes, matching the module's two responsibilities:
 *
 * - The REAL bundled corpus proves the projection over what actually ships —
 *   the shipped skill set, `st-verify`'s references subtree, path discipline.
 * - The virtual-fs lane states corpus shapes as literals — token substitution,
 *   verbatim references, collisions, floor survival — without staging disk
 *   fixtures.
 *
 * Contexts are typed as the CLI layer's `EmissionContext` on purpose: the
 * module accepts a structural subset, and these tests are the compile-time
 * proof that a full emission context is assignable to it unchanged (the
 * brief's `projectSkills(ctx: EmissionContext)` call shape).
 */

/** Fixed clock: manifest timestamps never read the wall clock. */
const FIXED_NOW = new Date("2026-08-13T12:00:00.000Z");

/** A rootDir that must not exist before, during, or after planning. */
const GHOST_ROOT = join(tmpdir(), `stamity-p4u02-ghost-${process.pid}`);

/** Every shipped skill id, as authored in the bundled corpus's frontmatter. */
const ALL_SKILL_IDS = [
  "browser-evidence",
  "dep-audit",
  "design-system-detect",
  "handoff",
  "learn",
  "onboard",
  "qa",
  "verify",
] as const;

/** The `st-verify` directory: SKILL.md plus its ten axis references. */
const VERIFY_FILES = [
  "SKILL.md",
  "references/enhancability.md",
  "references/maintainability.md",
  "references/performance.md",
  "references/product-spec.md",
  "references/reliability.md",
  "references/scalability.md",
  "references/security.md",
  "references/testability.md",
  "references/ui.md",
  "references/ux.md",
] as const;

function contextOf(skillIds: readonly string[], detected?: DetectedSummary): EmissionContext {
  const selection: ContentSelection = {
    items: { agent: [], skill: [...skillIds], rule: [], command: [] },
  };
  return {
    rootDir: GHOST_ROOT,
    manifest: createManifest({
      tools: ["claude"],
      selection,
      generatorVersion: "0.0.0-test",
      now: FIXED_NOW,
      ...(detected === undefined ? {} : { detected }),
    }),
    engineVersion: "0.0.0-test",
    facts: { greenfield: true, monorepoPackages: [] },
  };
}

const pathsOf = (rows: readonly ProjectedFile[]): string[] => rows.map((row) => row.path);

/** A markdown artifact: fenced frontmatter over a body. */
const artifact = (frontmatter: string, body: string): string => `---\n${frontmatter}\n---\n${body}`;

/** Volume-backed projection over a literal corpus shape. */
async function projectFixture(
  files: Record<string, string>,
  ctx: EmissionContext,
): Promise<ProjectedFile[]> {
  const volume = makeVolume(files);
  const options: ProjectSkillsOptions = { contentRoot: volume.root, fs: volume.fs };
  return projectSkills(ctx, options);
}

// ── Real bundled corpus ──────────────────────────────────────────

describe("projectSkills over the bundled corpus", () => {
  it("projects all 8 skills under .agents/skills, st-verify with its full references subtree, path-sorted", async () => {
    const rows = await projectSkills(contextOf(ALL_SKILL_IDS));
    const paths = pathsOf(rows);

    const dirs = new Set(paths.map((path) => path.split("/")[2]));
    expect([...dirs].toSorted()).toEqual(ALL_SKILL_IDS.map((id) => `st-${id}`));

    expect(paths.filter((path) => path.startsWith(`${SKILLS_PROJECTION_DIR}/st-verify/`))).toEqual(
      VERIFY_FILES.map((file) => `${SKILLS_PROJECTION_DIR}/st-verify/${file}`),
    );

    // One deterministic order: sorted by path, duplicates impossible.
    expect(paths).toEqual([...paths].toSorted());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("narrowed selection projects exactly the named skill directories and nothing else", async () => {
    const rows = await projectSkills(contextOf(["handoff", "verify"]));
    const dirs = new Set(pathsOf(rows).map((path) => path.split("/")[2]));

    expect([...dirs].toSorted()).toEqual(["st-handoff", "st-verify"]);
    // handoff ships its SKILL.md alone; verify ships its full 11-file subtree.
    expect(rows).toHaveLength(1 + VERIFY_FILES.length);
  });

  it("returns repo-relative POSIX paths only, attributed to their source skill", async () => {
    const rows = await projectSkills(contextOf(ALL_SKILL_IDS));

    for (const row of rows) {
      expect(row.path.startsWith(`${SKILLS_PROJECTION_DIR}/`), row.path).toBe(true);
      expect(row.path.includes("\\"), row.path).toBe(false);
      expect(row.path.startsWith("/"), row.path).toBe(false);
      expect(row.path.split("/").includes(".."), row.path).toBe(false);
      expect(row.artifactType).toBe("skill");
      expect(`st-${row.artifactId}`).toBe(row.path.split("/")[2]);
    }
  });

  it("plans purely: a ghost rootDir stays untouched by projection", async () => {
    expect(existsSync(GHOST_ROOT)).toBe(false);
    await projectSkills(contextOf(ALL_SKILL_IDS));
    expect(existsSync(GHOST_ROOT)).toBe(false);
  });
});

// ── Literal corpus shapes ────────────────────────────────────────

describe("projectSkills transforms", () => {
  const TOKEN_SKILL = artifact(
    "id: alpha\ntype: skill\ndescription: Fixture.\ntags: [review]",
    [
      "Lint with ${STAMITY:LINTER}, then run ${STAMITY:VERIFY_GATE_TEST}.",
      "Prose mentioning ${STAMITY: without forming a token stays put.",
      "",
    ].join("\n"),
  );
  const REFERENCE_BODY = "Raw ${STAMITY:LINTER} and ${STAMITY:VERIFY_GATE_TEST} stay verbatim.\n";

  const CORPUS: Record<string, string> = {
    "skills/stamity-alpha/SKILL.md": TOKEN_SKILL,
    "skills/stamity-alpha/references/keep.md": REFERENCE_BODY,
    "skills/stamity-alpha/references/sub/deep.md": "Nested reference.\n",
  };

  const DETECTED: DetectedSummary = {
    // First RECOGNISED language decides the gates: the unknown name is skipped.
    languages: ["klingon", "python"],
    linters: ["eslint", "oxlint"],
    testFrameworks: ["pytest"],
    ciProviders: [],
  };

  it("substitutes repo and verification-gate tokens in SKILL.md", async () => {
    const rows = await projectFixture(CORPUS, contextOf(["alpha"], DETECTED));
    const skill = rows.find((row) => row.path.endsWith("/SKILL.md"));

    expect(skill).toBeDefined();
    // The head is now the spec shape (see the frontmatter suite below); the
    // engine's `id` moved under `metadata` rather than staying top-level.
    expect(skill?.content.startsWith("---\n")).toBe(true);
    expect(skill?.content).toContain("name: stamity-alpha");
    expect(skill?.content).toContain("Lint with eslint, oxlint, then run pytest.");
    expect(skill?.content).not.toContain("${STAMITY:LINTER}");
    expect(skill?.content).not.toContain("${STAMITY:VERIFY_GATE_TEST}");
    // Token-anchored grammar: a bare prefix is prose, not a substitution site.
    expect(skill?.content).toContain("Prose mentioning ${STAMITY: without forming a token stays put.");
  });

  it("falls back to the conventional npm gates when detection carries no recognised language", async () => {
    const rows = await projectFixture(CORPUS, contextOf(["alpha"]));
    const skill = rows.find((row) => row.path.endsWith("/SKILL.md"));

    expect(skill?.content).toContain("run npm run test.");
  });

  it("projects references byte-identical to source, nested subdirectories preserved", async () => {
    const rows = await projectFixture(CORPUS, contextOf(["alpha"], DETECTED));
    const byPath = new Map(rows.map((row) => [row.path, row.content]));

    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/stamity-alpha/references/keep.md`)).toBe(REFERENCE_BODY);
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/stamity-alpha/references/sub/deep.md`)).toBe(
      "Nested reference.\n",
    );
  });

  it("renders the neutral ask-user platform table exactly once per marker occurrence", async () => {
    const rows = await projectFixture(
      {
        "skills/st-ask/SKILL.md": artifact(
          "id: ask\ntype: skill\ndescription: Fixture.\ntags: [review]",
          `Before asking:\n\n${PLATFORM_TOOL_MARKER}\n\nThen stop.\n`,
        ),
      },
      contextOf(["ask"]),
    );

    const content = rows[0]?.content ?? "";
    expect(content).not.toContain(PLATFORM_TOOL_MARKER);
    // Split on the full rendered table: exactly one occurrence -> two halves.
    expect(content.split(buildAskUserPlatformTable())).toHaveLength(2);
  });

  describe("SKILL.md frontmatter is projected to the Agent Skills spec shape", () => {
    /**
     * The spec permits six top-level keys and a strict validator rejects the whole
     * file on any other: "Unexpected key(s) in SKILL.md frontmatter … Allowed
     * properties are: allowed-tools, compatibility, description, license,
     * metadata, name" (code.claude.com/docs/en/skills § "Using skill frontmatter
     * outside Claude Code", accessed 2026-08-16). Canonical content is authored in
     * the engine's own vocabulary, so emitting the head verbatim shipped files
     * that hard-fail packaging on exactly the distribution paths the portability
     * promise is about.
     */
    const SPEC_KEYS = new Set([
      "name",
      "description",
      "license",
      "compatibility",
      "allowed-tools",
      "metadata",
    ]);

    async function headOf(): Promise<Record<string, unknown>> {
      const rows = await projectFixture(CORPUS, contextOf(["alpha"], DETECTED));
      const skill = rows.find((row) => row.path.endsWith("/SKILL.md"));
      expect(skill).toBeDefined();
      const match = /^---\n([\s\S]*?)\n---\n/.exec(skill!.content);
      expect(match, "emitted SKILL.md must carry a frontmatter block").not.toBeNull();
      return parse(match![1]!) as Record<string, unknown>;
    }

    it("emits no top-level key outside the six the spec allows", async () => {
      const head = await headOf();
      const offenders = Object.keys(head).filter((key) => !SPEC_KEYS.has(key));
      expect(offenders, `non-spec top-level key(s): ${offenders.join(", ")}`).toEqual([]);
    });

    it("carries the required name, synthesized from the directory the command comes from", async () => {
      const head = await headOf();
      expect(head["name"]).toBe("stamity-alpha");
      expect(String(head["name"])).toMatch(/^[a-z0-9-]{1,64}$/);
    });

    it("keeps the engine's own vocabulary by hoisting it into metadata, losing nothing", async () => {
      const head = await headOf();
      const metadata = head["metadata"] as Record<string, unknown>;
      expect(metadata).toBeTypeOf("object");
      expect(metadata["id"]).toBe("alpha");
      expect(metadata["type"]).toBe("skill");
    });

    /**
     * An author may declare `metadata` themselves — it is one of the six spec
     * keys. It then has to merge with the keys hoisted out of the engine's
     * vocabulary rather than replace them or be dropped, and only a genuine
     * MAP can merge: YAML makes `metadata:` with nothing under it `null`, and
     * a sequence or a scalar is a map-shaped slot filled with a non-map. Each
     * of those spellings takes the guard's other arm, where the authored value
     * is ignored and the hoisted keys still land.
     */
    describe("an author-declared metadata value", () => {
      async function metadataOf(declaration: string): Promise<Record<string, unknown>> {
        const rows = await projectFixture(
          {
            "skills/stamity-alpha/SKILL.md": artifact(
              `id: alpha\ntype: skill\ndescription: Fixture.\ntags: [review]\n${declaration}`,
              "Body.\n",
            ),
          },
          contextOf(["alpha"]),
        );
        const skill = rows.find((row) => row.path.endsWith("/SKILL.md"));
        expect(skill, "fixture skill must project").toBeDefined();
        const match = /^---\n([\s\S]*?)\n---\n/.exec(skill!.content);
        expect(match, "emitted SKILL.md must carry a frontmatter block").not.toBeNull();
        const head = parse(match![1]!) as Record<string, unknown>;
        return head["metadata"] as Record<string, unknown>;
      }

      it("merges a declared map under the hoisted keys, letting the author's win", async () => {
        const metadata = await metadataOf("metadata:\n  id: authored-wins\n  extra: kept");

        expect(metadata["id"]).toBe("authored-wins");
        // The hoisted vocabulary survives alongside it — the merge adds, and
        // only the colliding key is overridden.
        expect(metadata["type"]).toBe("skill");
        expect(metadata["extra"]).toBe("kept");
      });

      it("ignores a declared sequence and keeps the hoisted keys", async () => {
        const metadata = await metadataOf("metadata:\n  - one\n  - two");

        expect(Array.isArray(metadata)).toBe(false);
        expect(metadata["id"]).toBe("alpha");
        expect(metadata["type"]).toBe("skill");
      });

      it("ignores a declared scalar and keeps the hoisted keys", async () => {
        const metadata = await metadataOf("metadata: just a string");

        expect(metadata["id"]).toBe("alpha");
      });

      it("ignores an empty declaration, which YAML reads as null", async () => {
        const metadata = await metadataOf("metadata:");

        expect(metadata["id"]).toBe("alpha");
      });
    });
  });

});

describe("projectSkills selection edges", () => {
  it("returns [] for an empty skill selection", async () => {
    const rows = await projectFixture(
      { "skills/stamity-alpha/SKILL.md": artifact("id: alpha\ntype: skill", "Body.\n") },
      contextOf([]),
    );
    expect(rows).toEqual([]);
  });

  it("keeps a floor-tagged skill that a hand-edited selection dropped", async () => {
    const rows = await projectFixture(
      {
        "skills/stamity-alpha/SKILL.md": artifact("id: alpha\ntype: skill", "Body.\n"),
        "skills/stamity-guard/SKILL.md": artifact(
          "id: guard\ntype: skill\ntags: [floor:security]",
          "Floor body.\n",
        ),
      },
      contextOf([]),
    );
    expect(pathsOf(rows)).toEqual([`${SKILLS_PROJECTION_DIR}/stamity-guard/SKILL.md`]);
  });

  it("projects only the catalog-reachable claimant of a duplicated id, with no path emitted twice", async () => {
    const rows = await projectFixture(
      {
        // Walk order is name-sorted, so `stamity-alpha` claims the id first and
        // stays the reachable entry; `zz-alpha` is the reported collision loser.
        "skills/stamity-alpha/SKILL.md": artifact("id: alpha\ntype: skill", "First claimant.\n"),
        "skills/stamity-alpha/references/keep.md": "Kept.\n",
        "skills/zz-alpha/SKILL.md": artifact("id: alpha\ntype: skill", "Shadowed claimant.\n"),
      },
      contextOf(["alpha"]),
    );

    const paths = pathsOf(rows);
    expect(paths).toEqual([
      `${SKILLS_PROJECTION_DIR}/stamity-alpha/SKILL.md`,
      `${SKILLS_PROJECTION_DIR}/stamity-alpha/references/keep.md`,
    ]);
    expect(new Set(paths).size).toBe(paths.length);
    expect(rows[0]?.content).toContain("First claimant.");
  });
});

// ── The repo's own override tree ─────────────────────────────────

/**
 * `.stamity/overrides/skills/` reaching THIS projection, which is the whole of
 * operator decision 11: the option below used to be a bare corpus-root string,
 * so a user `SKILL.md` that won its id in the index still emitted the SHIPPED
 * body — silently, because the index reported the override as taken. These are
 * the cases the file had none of; every one of them was inexpressible while
 * `ProjectSkillsOptions.contentRoot` had no third slot to name an override root
 * in.
 *
 * Both roots live in ONE volume, read through the same injected seam the rest
 * of this file uses — the corpus under `corpus/`, the override tree under
 * `overrides/`, exactly the two-root shape `buildContentIndex` merges.
 */
describe("projectSkills over an override tree", () => {
  const CORPUS_DIR = "corpus";
  const OVERRIDE_DIR = "overrides";

  /** A skill body distinguishable per layer, so "which body shipped" is answerable. */
  const skillDoc = (id: string, description: string, body: string): string =>
    artifact(
      [
        `id: ${id}`,
        "type: skill",
        `description: ${description}`,
        "tags: [review]",
        "load: on-demand",
        "obsolete_when: never",
      ].join("\n"),
      body,
    );

  const SHIPPED_MARKER = "Shipped body: run the bundled drill.";
  const HOUSE_MARKER = "House body: run this repository's own drill.";

  function volumeOf(files: Record<string, string>): {
    fs: ProjectSkillsOptions["fs"];
    corpusRoot: string;
    overrideRoot: string;
  } {
    const volume = makeVolume(files);
    return {
      fs: volume.fs,
      corpusRoot: `${volume.root}/${CORPUS_DIR}`,
      overrideRoot: `${volume.root}/${OVERRIDE_DIR}`,
    };
  }

  it("emits the OVERRIDE body for a skill whose id a corpus skill already holds", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The bundled version of this skill.",
        `${SHIPPED_MARKER}\n`,
      ),
      [`${OVERRIDE_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The house version of this skill, authored in this repo.",
        `${HOUSE_MARKER}\n`,
      ),
      // A second corpus skill nobody overrides: the override layer replaces one
      // identity, it does not narrow the projection to the overridden one.
      [`${CORPUS_DIR}/skills/st-beta/SKILL.md`]: skillDoc(
        "beta",
        "A bundled skill no override touches.",
        "Untouched bundled body.\n",
      ),
    });

    const rows = await projectSkills(contextOf(["alpha", "beta"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });
    const byPath = new Map(rows.map((row) => [row.path, row.content]));

    const shadowed = byPath.get(`${SKILLS_PROJECTION_DIR}/st-alpha/SKILL.md`);
    expect(shadowed).toContain(HOUSE_MARKER);
    // Not both bodies, and not the shipped one anywhere in the plan.
    expect(rows.filter((row) => row.content.includes(SHIPPED_MARKER))).toEqual([]);
    // The head is the override's too, not just the body.
    expect(shadowed).toContain("The house version of this skill, authored in this repo.");
    // The untouched skill still projects: this is a replacement, not a filter.
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-beta/SKILL.md`)).toContain(
      "Untouched bundled body.",
    );
  });

  it("emits a user skill the corpus never shipped", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The bundled version of this skill.",
        `${SHIPPED_MARKER}\n`,
      ),
      [`${OVERRIDE_DIR}/skills/st-house-drill/SKILL.md`]: skillDoc(
        "house-drill",
        "A skill this repo authored and the corpus never had.",
        `${HOUSE_MARKER}\n`,
      ),
    });

    const rows = await projectSkills(contextOf(["alpha", "house-drill"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });

    expect(pathsOf(rows)).toEqual([
      `${SKILLS_PROJECTION_DIR}/st-alpha/SKILL.md`,
      `${SKILLS_PROJECTION_DIR}/st-house-drill/SKILL.md`,
    ]);
    const drill = rows.find((row) => row.path.includes("st-house-drill"));
    expect(drill?.content).toContain(HOUSE_MARKER);
    // Attribution follows the artifact, so the ledger names the user skill.
    expect(drill?.artifactId).toBe("house-drill");
    expect(drill?.artifactType).toBe("skill");
  });

  it("stamps `origin` per row — the mechanism the pack/override merge guard reads", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The bundled version of this skill.",
        `${SHIPPED_MARKER}\n`,
      ),
      [`${OVERRIDE_DIR}/skills/st-house-drill/SKILL.md`]: skillDoc(
        "house-drill",
        "A skill this repo authored and the corpus never had.",
        `${HOUSE_MARKER}\n`,
      ),
    });

    const rows = await projectSkills(contextOf(["alpha", "house-drill"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });

    const byPath = new Map(rows.map((row) => [row.path, row]));
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-alpha/SKILL.md`)?.origin).toBe("corpus");
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-house-drill/SKILL.md`)?.origin).toBe("user");
  });

  it("ships the OVERRIDE directory's support files, not the shadowed corpus skill's", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The bundled version of this skill.",
        `${SHIPPED_MARKER}\n`,
      ),
      [`${CORPUS_DIR}/skills/st-alpha/references/shipped.md`]: "Bundled reference.\n",
      [`${OVERRIDE_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The house version of this skill, authored in this repo.",
        `${HOUSE_MARKER}\n`,
      ),
      [`${OVERRIDE_DIR}/skills/st-alpha/references/house.md`]: "House reference.\n",
      [`${OVERRIDE_DIR}/skills/st-alpha/references/deep/nested.md`]: "House nested reference.\n",
    });

    const rows = await projectSkills(contextOf(["alpha"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });

    // The whole override DIRECTORY is the unit that ships — the shadowed
    // corpus skill's own references do not survive alongside it, which is what
    // keeps a skill's dispatch table describing files that are actually there.
    expect(pathsOf(rows)).toEqual([
      `${SKILLS_PROJECTION_DIR}/st-alpha/SKILL.md`,
      `${SKILLS_PROJECTION_DIR}/st-alpha/references/deep/nested.md`,
      `${SKILLS_PROJECTION_DIR}/st-alpha/references/house.md`,
    ]);
    const byPath = new Map(rows.map((row) => [row.path, row.content]));
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-alpha/references/house.md`)).toBe(
      "House reference.\n",
    );
    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-alpha/references/deep/nested.md`)).toBe(
      "House nested reference.\n",
    );
  });

  it("plans byte-identically to a corpus-only projection when the repo has no override tree", async () => {
    const files = {
      [`${CORPUS_DIR}/skills/st-alpha/SKILL.md`]: skillDoc(
        "alpha",
        "The bundled version of this skill.",
        `${SHIPPED_MARKER}\n`,
      ),
      [`${CORPUS_DIR}/skills/st-alpha/references/shipped.md`]: "Bundled reference.\n",
      [`${CORPUS_DIR}/skills/st-beta/SKILL.md`]: skillDoc(
        "beta",
        "A second bundled skill.",
        "Untouched bundled body.\n",
      ),
    };
    const ctx = contextOf(["alpha", "beta"]);

    const bare = volumeOf(files);
    const asString = await projectSkills(ctx, {
      contentRoot: bare.corpusRoot,
      ...(bare.fs === undefined ? {} : { fs: bare.fs }),
    });

    const absent = volumeOf(files);
    const withMissingOverride = await projectSkills(ctx, {
      // The common case: the option always carries the repo's override path and
      // the directory is simply not there (ENOENT), the same non-event an
      // absent class directory is.
      contentRoot: { root: absent.corpusRoot, overrideRoot: absent.overrideRoot },
      ...(absent.fs === undefined ? {} : { fs: absent.fs }),
    });

    // Non-degenerate: a real three-row plan, not an empty one agreeing with itself.
    expect(asString).toHaveLength(3);
    expect(withMissingOverride).toEqual(asString);
  });
});

/**
 * A PATCH, not a replacement: `.customize.yaml`/`.customize.md` beside where an
 * override would sit merge onto the base rather than standing in for it, and
 * the base keeps supplying everything the overlay does not name. `buildItem`
 * folds the merge into the item's own `body`/`frontmatter` but — by spec
 * REQ-003, the merge-identity rule — the patched item keeps the BASE's
 * `filePath`, because the merged artifact IS that artifact, not a new file
 * living somewhere else.
 *
 * A projection that re-reads `SKILL.md` from `filePath` on disk therefore
 * reads the UNPATCHED corpus bytes straight past the merge: the catalog
 * reports the patch applied, `validate` prints `patched`/`emits: true`, and
 * the shipped file carries none of it. This is the regression case for that
 * hole (`src/emit/skillsProjection.ts`'s `projectOneSkill`), watched red
 * against the unfixed projection (a disk re-read at `filePath`) before the fix
 * that renders `SKILL.md` from the merged `item.body`/`item.frontmatter`
 * instead.
 */
describe("projectSkills over a patched (overlay) skill", () => {
  const CORPUS_DIR = "corpus";
  const OVERRIDE_DIR = "overrides";

  const BASE_BODY_MARKER = "Base step: run the bundled recipe.";
  const PATCHED_BODY_MARKER = "House step: run this repo's own recipe addendum.";

  function volumeOf(files: Record<string, string>): {
    fs: ProjectSkillsOptions["fs"];
    corpusRoot: string;
    overrideRoot: string;
  } {
    const volume = makeVolume(files);
    return {
      fs: volume.fs,
      corpusRoot: `${volume.root}/${CORPUS_DIR}`,
      overrideRoot: `${volume.root}/${OVERRIDE_DIR}`,
    };
  }

  it("emits the MERGED body for a corpus skill an overlay body-patches, not the unpatched corpus bytes", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-recipe/SKILL.md`]: artifact(
        "id: recipe\ntype: skill\ndescription: The bundled recipe.\ntags: [review]",
        `${BASE_BODY_MARKER}\n`,
      ),
      // Overlay slug resolves from the CARRIER directory's own name
      // (`recipe`), matched against the base item's id — not against the
      // corpus directory name (`st-recipe`).
      [`${OVERRIDE_DIR}/skills/recipe/SKILL.customize.md`]: `${PATCHED_BODY_MARKER}\n`,
    });

    const rows = await projectSkills(contextOf(["recipe"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });
    const skill = rows.find((row) => row.path.endsWith("/st-recipe/SKILL.md"));

    expect(skill).toBeDefined();
    // Append-only merge: the base's own line survives AND the overlay's
    // addendum ships alongside it. A disk re-read carries the first and drops
    // the second silently — this is the assertion that catches it.
    expect(skill?.content).toContain(BASE_BODY_MARKER);
    expect(skill?.content).toContain(PATCHED_BODY_MARKER);

    // Ships into BOTH trees identically: the vendor-neutral projection above,
    // and the native re-target the claude adapter serves from the same bytes.
    const native = retargetProjection(rows, ".claude/skills");
    const nativeSkill = native.find((row) => row.path.endsWith("/st-recipe/SKILL.md"));
    expect(nativeSkill?.content).toContain(PATCHED_BODY_MARKER);
  });

  it("emits the MERGED frontmatter for a corpus skill an overlay frontmatter-patches", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-recipe/SKILL.md`]: artifact(
        "id: recipe\ntype: skill\ndescription: The bundled recipe.\ntags: [review]",
        `${BASE_BODY_MARKER}\n`,
      ),
      [`${OVERRIDE_DIR}/skills/recipe/SKILL.customize.yaml`]: "description: Our house recipe.\n",
    });

    const rows = await projectSkills(contextOf(["recipe"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });
    const skill = rows.find((row) => row.path.endsWith("/st-recipe/SKILL.md"));

    // The patched description reaches the spec-shaped head; the unpatched
    // corpus value ("The bundled recipe.") is nowhere in the emitted file.
    expect(skill?.content).toContain("description: Our house recipe.");
    expect(skill?.content).not.toContain("The bundled recipe.");
  });

  it("still projects support files from disk — an overlay patches SKILL.md only", async () => {
    const volume = volumeOf({
      [`${CORPUS_DIR}/skills/st-recipe/SKILL.md`]: artifact(
        "id: recipe\ntype: skill\ndescription: The bundled recipe.\ntags: [review]",
        `${BASE_BODY_MARKER}\n`,
      ),
      [`${CORPUS_DIR}/skills/st-recipe/references/steps.md`]: "Corpus reference, unpatched.\n",
      [`${OVERRIDE_DIR}/skills/recipe/SKILL.customize.md`]: `${PATCHED_BODY_MARKER}\n`,
    });

    const rows = await projectSkills(contextOf(["recipe"]), {
      contentRoot: { root: volume.corpusRoot, overrideRoot: volume.overrideRoot },
      ...(volume.fs === undefined ? {} : { fs: volume.fs }),
    });
    const byPath = new Map(rows.map((row) => [row.path, row.content]));

    expect(byPath.get(`${SKILLS_PROJECTION_DIR}/st-recipe/references/steps.md`)).toBe(
      "Corpus reference, unpatched.\n",
    );
  });
});

// ── Native per-client re-targeting ───────────────────────────────

/**
 * Skills reach Claude Code at its own project-level skills location. The
 * vendor-neutral projection stays — Codex, Cursor and Copilot read it directly
 * — so the native tree is an ADDITIONAL copy of the same rendered bytes, not a
 * replacement. These tests pin the rule the seam exists to protect: one read,
 * one render, many targets. A second render would let the two trees disagree
 * under a manifest change, and the composer's content-equality dedup refuses a
 * path whose claimants disagree rather than picking a winner.
 */

/** A projected row as the projection lays it down, for the pure-input lanes. */
const projectedRow = (relative: string, content = "Body.\n"): ProjectedFile => ({
  path: `${SKILLS_PROJECTION_DIR}/${relative}`,
  content,
  artifactId: "alpha",
  artifactType: "skill",
});

/** The native root under test; `NATIVE_SKILL_DIRS` pins the value separately. */
const NATIVE_DIR = ".claude/skills";

/** Everything after `<projection root>/`, i.e. the part re-targeting keeps. */
const suffixOf = (row: ProjectedFile): string => row.path.slice(SKILLS_PROJECTION_DIR.length + 1);

describe("NATIVE_SKILL_DIRS", () => {
  it("names Claude Code's project-level skills directory as a repo-relative POSIX path", () => {
    // "Where skills live": Project → `.claude/skills/<skill-name>/SKILL.md`,
    // scope "This project only" (code.claude.com/docs/en/skills, accessed
    // 2026-08-17).
    const dir = NATIVE_SKILL_DIRS.claude;

    expect(dir).toBe(".claude/skills");
    expect(dir?.startsWith("/")).toBe(false);
    expect(dir?.endsWith("/")).toBe(false);
    expect(dir?.includes("\\")).toBe(false);
    expect(dir?.split("/").includes("..")).toBe(false);
  });

  it("holds exactly one entry: the clients that read the vendor-neutral tree are ABSENT", () => {
    // `cursor`, `copilot` and `codex` each declare `readsAgentsSkillsDir: true`
    // in their dialect facts, so SKILLS_PROJECTION_DIR already reaches them. A
    // second copy would be duplicated always-available context with no reader
    // plus a second tree to keep in sync — absence is the assertion here, not
    // an omission waiting to be filled in "for symmetry".
    expect(Object.keys(NATIVE_SKILL_DIRS)).toEqual(["claude"]);

    for (const tool of ["cursor", "copilot", "codex"] as const) {
      expect(NATIVE_SKILL_DIRS[tool], `${tool} reads ${SKILLS_PROJECTION_DIR}`).toBeUndefined();
    }
  });
});

describe("retargetProjection", () => {
  it("carries the whole corpus projection onto the native root byte-for-byte", async () => {
    const source = await projectSkills(contextOf(ALL_SKILL_IDS));
    const native = retargetProjection(source, NATIVE_DIR);

    // Non-degenerate: 8 skills, and `st-verify` alone contributes 11 rows.
    expect(source.length).toBeGreaterThan(ALL_SKILL_IDS.length);
    expect(native).toHaveLength(source.length);

    for (const [index, row] of source.entries()) {
      const target = native[index];
      expect(target?.content, row.path).toBe(row.content);
      expect(target?.artifactId, row.path).toBe(row.artifactId);
      expect(target?.artifactType, row.path).toBe(row.artifactType);
      // The only difference is the leading directory.
      expect(target?.path).toBe(`${NATIVE_DIR}/${suffixOf(row)}`);
    }
  });

  it("re-targets a references subtree whole — SKILL.md and every reference file", async () => {
    const source = await projectSkills(contextOf(["verify"]));
    const native = retargetProjection(source, NATIVE_DIR);
    const byPath = new Map(native.map((row) => [row.path, row.content]));

    expect(pathsOf(native)).toEqual(
      VERIFY_FILES.map((file) => `${NATIVE_DIR}/st-verify/${file}`),
    );
    for (const row of source) {
      expect(byPath.get(`${NATIVE_DIR}/${suffixOf(row)}`), row.path).toBe(row.content);
    }
  });

  it("returns path-sorted rows, identical on a second call over the same input", async () => {
    const source = await projectSkills(contextOf(ALL_SKILL_IDS));
    const first = retargetProjection(source, NATIVE_DIR);

    expect(pathsOf(first)).toEqual([...pathsOf(first)].toSorted());
    expect(retargetProjection(source, NATIVE_DIR)).toEqual(first);
  });

  it("sorts an unsorted input rather than passing its order through", () => {
    const native = retargetProjection(
      [
        projectedRow("stamity-b/SKILL.md"),
        projectedRow("stamity-a/references/keep.md"),
        projectedRow("stamity-a/SKILL.md"),
      ],
      NATIVE_DIR,
    );

    expect(pathsOf(native)).toEqual([
      `${NATIVE_DIR}/stamity-a/SKILL.md`,
      `${NATIVE_DIR}/stamity-a/references/keep.md`,
      `${NATIVE_DIR}/stamity-b/SKILL.md`,
    ]);
  });

  it("keeps both claimants of one path in input order — deduplication is the composer's job", () => {
    const native = retargetProjection(
      [projectedRow("stamity-a/SKILL.md", "first"), projectedRow("stamity-a/SKILL.md", "second")],
      NATIVE_DIR,
    );

    expect(native.map((row) => row.content)).toEqual(["first", "second"]);
  });

  it("returns [] for an empty projection: no selected skills means no native copies", () => {
    expect(retargetProjection([], NATIVE_DIR)).toEqual([]);
  });

  it("re-renders nothing: an unsubstituted token in a row survives verbatim", () => {
    // The rendered bytes are the input. A second render would resolve this
    // token, and the two trees would then disagree on the same skill.
    const row = projectedRow("stamity-a/SKILL.md", "Lint with ${STAMITY:LINTER}.\n");
    const [native] = retargetProjection([row], NATIVE_DIR);

    expect(native?.content).toBe(row.content);
  });

  it("reads no filesystem: a row for a directory that exists nowhere re-targets fine", () => {
    // A re-read would fail with ENOENT here — the row is the only input.
    const native = retargetProjection([projectedRow("stamity-ghost/references/x.md")], NATIVE_DIR);

    expect(pathsOf(native)).toEqual([`${NATIVE_DIR}/stamity-ghost/references/x.md`]);
  });

  it("assigns no ledger owner — the adapter wraps these rows as its own residue", async () => {
    const source = await projectSkills(contextOf(["handoff"]));
    const [native] = retargetProjection(source, NATIVE_DIR);

    // TEST CHANGE, justified: `origin` joined the shape so the pack/override
    // merge guard (`../../src/emit/planner.ts`'s `mergeSkillProjections`) can
    // tell an override-origin row from a corpus one without a second walk.
    // `retargetProjection` still carries every field through verbatim — the
    // assertion this case protects, that re-targeting spreads the row rather
    // than reconstructing it — so `origin` belongs in the list, not a reason
    // to drop the case.
    expect(Object.keys(native ?? {}).toSorted()).toEqual([
      "artifactId",
      "artifactType",
      "content",
      "origin",
      "path",
    ]);
  });

  it("refuses a target root that could aim the copy outside the repo", () => {
    const rows = [projectedRow("stamity-a/SKILL.md")];

    for (const dir of ["../outside/skills", "/etc/skills", "C:/skills", ".claude\\skills", ""]) {
      const refuse = (): ProjectedFile[] => retargetProjection(rows, dir);
      expect(refuse, dir).toThrow(EngineError);
      expect(refuse, dir).toThrow(/Unsafe content path in native skills projection root/);
    }
  });

  it("refuses a row the projection did not lay down", () => {
    const stray: ProjectedFile = {
      path: ".agents/rules/stamity-testing.md",
      content: "Body.\n",
      artifactId: "testing",
      artifactType: "rule",
    };
    let thrown: unknown;

    try {
      retargetProjection([stray], NATIVE_DIR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("VALIDATION_ERROR");
    expect((thrown as EngineError).message).toContain(`not under ${SKILLS_PROJECTION_DIR}/`);
  });

  it("re-targets a skill whose directory is not a valid client command name", async () => {
    // Naming is the client's concern: the directory is preserved as authored so
    // the skill's internal links survive, and the spec `name` key already
    // carries the sanitised form the client derives its command from.
    const source = await projectFixture(
      { "skills/stamity-Alpha_1/SKILL.md": artifact("id: alpha\ntype: skill", "Body.\n") },
      contextOf(["alpha"]),
    );
    const native = retargetProjection(source, NATIVE_DIR);

    expect(pathsOf(native)).toEqual([`${NATIVE_DIR}/stamity-Alpha_1/SKILL.md`]);
    expect(native[0]?.content).toContain("name: stamity-alpha-1");
  });
});