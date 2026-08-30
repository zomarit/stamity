import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../../src/adapters/registry.ts";
import {
  applySync,
  type SyncApplyReport,
  type SyncPlan,
} from "../../../src/cli/commands/sync/engine.ts";
import {
  getEmissionPlanner,
  noopEmissionPlanner,
  OVERRIDE_EMITTING_CLASSES,
  type EmissionContext,
} from "../../../src/cli/engine/emission.ts";
import { buildContentIndex } from "../../../src/content/catalog.ts";
import { composeEmissionPlanner } from "../../../src/emit/planner.ts";
import { createManifest } from "../../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../../src/pack/install.ts";
import {
  CONTENT_CLASSES,
  type AdapterOutput,
  type ContentClass,
} from "../../../src/types/content.ts";
import type { PackageEntry } from "../../../src/types/detect.ts";
import type { Tool } from "../../../src/types/core.ts";
import { EngineError } from "../../../src/types/errors.ts";
import type { ImportDecision } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The emission seam is pure by contract — planning never touches the working
 * tree — so every planner test here runs on data alone (the real planner's
 * corpus reads resolve the package-bundled content, never the plan's rootDir).
 * The ghost root below is the filesystem-silence probe: it does not exist, and
 * must still not exist after planning, so any write under a plan's rootDir
 * would surface as either a thrown ENOENT or a created directory.
 *
 * The final block is the deliberate exception: where a plan's outputs LAND is
 * only observable at write time, so it drives `applySync` over real temp
 * directories. Nothing above it gains a filesystem dependency.
 */

/** Fixed clock: manifest timestamps never read the wall clock. */
const FIXED_NOW = new Date("2026-08-13T12:00:00.000Z");

/** A rootDir that must not exist before, during, or after planning. */
const GHOST_ROOT = join(tmpdir(), `stamity-p2u03-ghost-${process.pid}`);

/** Live monorepo layout, frozen: the planner receives it read-only. */
const PACKAGES: readonly PackageEntry[] = Object.freeze([
  { name: "pkg-a", path: "packages/a" },
  { name: "pkg-b", path: "packages/b" },
]);

function contextOf(
  facts: EmissionContext["facts"],
  // The manifest holds a decision LIST (one record per pre-existing file);
  // widened here with the schema so the helper speaks its shape.
  importChoice?: readonly ImportDecision[],
): EmissionContext {
  return {
    rootDir: GHOST_ROOT,
    manifest: createManifest({
      tools: ["claude"],
      selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
      ...(importChoice === undefined ? {} : { importChoice }),
      generatorVersion: "0.0.0-test",
      now: FIXED_NOW,
    }),
    engineVersion: "0.0.0-test",
    facts,
  };
}

/**
 * A context for the REAL composed planner: ghost rootDir, empty selection
 * (the corpus contributes nothing selection-driven, keeping plans minimal),
 * tools as given — [] included, the defensive state `createManifest` accepts
 * even though validation rejects it at the parse boundary.
 */
function composedContextOf(tools: Tool[]): EmissionContext {
  return {
    rootDir: GHOST_ROOT,
    manifest: createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "0.0.0-test",
      now: FIXED_NOW,
    }),
    engineVersion: "0.0.0-test",
    facts: { greenfield: true, monorepoPackages: [] },
  };
}

/**
 * One context per shape the CLI can hand a planner: greenfield, each import
 * decision taken, monorepo.
 *
 * TEST CHANGE, justified: the import choice used to ride `facts.importChoice`,
 * a per-run field no caller ever set and no emitter ever read. It now lives on
 * the manifest (`SetupManifest.importChoice`), because the decision has to
 * survive init and bind every later sync — so the same four shapes are built
 * with the decision on the manifest instead. Coverage is unchanged in kind and
 * stronger in fact: these contexts now reach code that acts on the field.
 */
const CONTEXTS: EmissionContext[] = [
  contextOf({ greenfield: true, monorepoPackages: [] }),
  contextOf({ greenfield: false, monorepoPackages: [] }, [{ path: "AGENTS.md", mode: "supplement" }]),
  contextOf({ greenfield: false, monorepoPackages: PACKAGES }, [{ path: "AGENTS.md", mode: "replace" }]),
  contextOf({ greenfield: false, monorepoPackages: PACKAGES }, [{ path: "AGENTS.md", mode: "skip" }]),
];

describe("noopEmissionPlanner", () => {
  it("resolves [] for any context and leaves the filesystem untouched", async () => {
    expect(existsSync(GHOST_ROOT)).toBe(false);

    // Planned concurrently, not in an await-per-iteration loop (`no-await-in-loop`):
    // planning is pure and shares no state between contexts, so interleaving is
    // equivalent to sequencing — same four contexts, same per-context assertion.
    await Promise.all(
      CONTEXTS.map((ctx) => expect(noopEmissionPlanner.plan(ctx)).resolves.toEqual([])),
    );

    // A planner that wrote anything under its rootDir would have created it.
    expect(existsSync(GHOST_ROOT)).toBe(false);
  });

  it("is identified as 'noop'", () => {
    expect(noopEmissionPlanner.id).toBe("noop");
  });

  it("resolves a fresh array per call, so a caller mutating its plan cannot bleed into the next run", async () => {
    const ctx = contextOf({ greenfield: true, monorepoPackages: [] });
    const first = await noopEmissionPlanner.plan(ctx);
    const second = await noopEmissionPlanner.plan(ctx);
    expect(first).not.toBe(second);

    const output: AdapterOutput = {
      path: "AGENTS.md",
      content: "",
      owner: { adapter: "claude", artifactId: "reviewer", artifactType: "agent" },
    };
    first.push(output);

    await expect(noopEmissionPlanner.plan(ctx)).resolves.toEqual([]);
  });

  it("answers the findings view too, with both halves fresh per call", async () => {
    const ctx = contextOf({ greenfield: true, monorepoPackages: [] });

    const first = await noopEmissionPlanner.planWithWarnings(ctx);
    expect(first).toEqual({ outputs: [], warnings: [] });
    first.warnings.push("mutated");
    first.outputs.push({
      path: "AGENTS.md",
      content: "",
      owner: { adapter: "claude", artifactId: "reviewer", artifactType: "agent" },
    });

    await expect(noopEmissionPlanner.planWithWarnings(ctx)).resolves.toEqual({
      outputs: [],
      warnings: [],
    });
  });
});

// Registry wiring: the earlier assertion "getEmissionPlanner() returns
// noopEmissionPlanner" churned by design — the seam's whole point was that the
// adapter layer swaps the dispatch body while callers stay put. The suite now
// asserts the composed core+registry planner: stable id naming all four
// registered adapters, plan purity via the same ghost-root probe (exercised
// against the REAL planner with an empty-tools manifest), an end-to-end
// single-tool registry proof, and statelessness across calls. Every
// noopEmissionPlanner purity assertion above is kept intact.
describe("getEmissionPlanner", () => {
  it("returns the composed registry planner with a stable id naming all four adapters", () => {
    const planner = getEmissionPlanner();
    expect(planner.id).toBe("core+residue[claude,cursor,copilot,codex]");
    expect(getEmissionPlanner().id).toBe(planner.id);
  });

  it("plans [] over an empty-tools manifest and leaves the filesystem untouched", async () => {
    expect(existsSync(GHOST_ROOT)).toBe(false);

    await expect(getEmissionPlanner().plan(composedContextOf([]))).resolves.toEqual([]);

    // The real planner read the bundled corpus, not the plan's rootDir: a
    // planner that wrote anything under its rootDir would have created it.
    expect(existsSync(GHOST_ROOT)).toBe(false);
  });

  it("plans a single-tool claude manifest end-to-end through the registry: AGENTS.md plus CLAUDE.md", async () => {
    const rows = await getEmissionPlanner().plan(composedContextOf(["claude"]));
    const paths = rows.map((row) => row.path);

    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    expect(new Set(paths).size).toBe(paths.length);

    // Planning a real tool is still pure: reads of the bundled corpus only.
    expect(existsSync(GHOST_ROOT)).toBe(false);
  });

  it("returns stateless planners: two calls produce byte-identical plans for one context", async () => {
    const ctx = composedContextOf(["claude"]);
    const first = await getEmissionPlanner().plan(ctx);
    const second = await getEmissionPlanner().plan(ctx);

    expect(first.length).toBeGreaterThan(0);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("plans a tool's rows once when a defensive manifest names it twice", async () => {
    const once = await getEmissionPlanner().plan(composedContextOf(["claude"]));
    const twice = await getEmissionPlanner().plan(composedContextOf(["claude", "claude"]));

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    const paths = twice.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

/**
 * Where a plan's outputs LAND. The planner above is pure, so this block is the
 * only one here on real directories: it drives `applySync` — the write half the
 * emission feeds — over planted symlinks, because the boundary the sync lane
 * declares is only observable at write time.
 *
 * Sync passes the repo root as the write boundary, so the merge engine answers
 * containment exactly instead of falling back to its structural rule. Three
 * cases: a redirect out of the root refused with nothing landing outside; the
 * in-repo alias the structural fallback cannot tell apart from a redirect
 * (a link that leaves its own directory but stays in the repo) emitted
 * normally; and a root reached THROUGH an ancestor link, where both sides of
 * the boundary compare must resolve or every write to such a host refuses.
 */
/** A whole-file emission row owned by one adapter — the shape `applySync` writes. */
function syncOutput(path: string, content: string): AdapterOutput {
  return {
    path,
    content,
    owner: { adapter: "claude", artifactId: "guide", artifactType: "rule" },
  };
}

describe("sync emission write boundary", () => {
  const getRepo = useTempDir("sync-boundary");
  const getOutside = useTempDir("sync-outside");

  const T1 = new Date("2026-01-02T00:00:00.000Z");

  /** A plan carrying exactly these outputs, every other field inert: the write
   *  lane is the subject, and `planSync` would only re-derive them. */
  function planOf(outputs: AdapterOutput[]): SyncPlan {
    return {
      manifest: createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: "0.0.0-test",
        now: FIXED_NOW,
      }),
      entries: outputs.map((row) => ({
        path: row.path,
        action: "create" as const,
        adapter: row.owner.adapter,
        artifactId: row.owner.artifactId,
      })),
      collisions: [],
      reclaim: [],
      dirty: { available: false, dirty: false, changedCount: 0 },
      manifestMigrated: false,
      plannerId: "test",
      outputs,
    };
  }

  const applyTo = async (root: string, outputs: AdapterOutput[]): Promise<SyncApplyReport> =>
    applySync(root, planOf(outputs), {
      engineVersion: "0.0.0-test",
      force: false,
      dryRun: false,
      now: T1,
    });

  it("refuses an output whose directory is redirected out of the repo root", async () => {
    const root = getRepo().dir;
    const outside = getOutside();
    await symlink(outside.dir, join(root, "docs"), "dir");

    let thrown: unknown;
    try {
      await applyTo(root, [syncOutput("docs/stamity-guide.md", "Guide body.\n")]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    expect((thrown as EngineError).code).toBe("FS_ERROR");
    expect((thrown as EngineError).message).toContain(`resolves outside ${root}`);
    // The link is live, so a write that followed it would have landed there.
    expect(await readdir(outside.dir)).toEqual([]);
  });

  it("writes through an in-repo alias into the directory the link really names", async () => {
    const root = getRepo().dir;
    await mkdir(join(root, ".cursor"), { recursive: true });
    await mkdir(join(root, "shared", "rules"), { recursive: true });
    await symlink(join(root, "shared", "rules"), join(root, ".cursor", "rules"), "dir");

    const report = await applyTo(root, [syncOutput(".cursor/rules/stamity-guide.md", "Guide body.\n")]);

    expect(report.created).toBe(1);
    expect(report.wrote).toEqual([{ path: ".cursor/rules/stamity-guide.md", action: "created" }]);
    expect(await readFile(join(root, "shared", "rules", "stamity-guide.md"), "utf8")).toBe(
      "Guide body.\n",
    );
  });

  it("writes normally when the repo root itself is reached through an ancestor symlink", async () => {
    // The host shape the suite's realpath'd fixtures otherwise hide (macOS
    // `/tmp` -> `/private/tmp`, a projects directory moved to another volume):
    // the declared boundary and the resolved landing are spelled differently,
    // and a compare that resolves only one side refuses every write here.
    const base = getRepo().dir;
    const physical = join(base, "physical", "repo");
    await mkdir(join(physical, ".cursor"), { recursive: true });
    await mkdir(join(physical, "shared", "rules"), { recursive: true });
    await symlink(join(base, "physical"), join(base, "via"), "dir");
    const root = join(base, "via", "repo");
    // The in-repo alias rides along: inside an ancestor-linked root it is the
    // shape that needs BOTH halves — the threaded boundary and a boundary
    // resolved on the same terms as the landing.
    await symlink(join(root, "shared", "rules"), join(root, ".cursor", "rules"), "dir");

    const report = await applyTo(root, [
      syncOutput("docs/stamity-guide.md", "Guide body.\n"),
      syncOutput(".cursor/rules/stamity-guide.md", "Rule body.\n"),
    ]);

    expect(report.created).toBe(2);
    expect(await readFile(join(physical, "docs", "stamity-guide.md"), "utf8")).toBe("Guide body.\n");
    expect(await readFile(join(physical, "shared", "rules", "stamity-guide.md"), "utf8")).toBe(
      "Rule body.\n",
    );
  });
});

/**
 * The repo's own content layer, reaching emission.
 *
 * Real temp directories, and for once that is the point rather than an
 * exception: the override tree is READ from `rootDir`, so a ghost root cannot
 * host these cases. Planning stays pure — the assertions below check that the
 * tree is untouched afterwards and that no planned row targets a path inside
 * it.
 *
 * `.stamity/overrides/rules/<id>.md` is the fixture shape throughout: rules
 * reach all four clients through four different dialects (a `.claude/rules`
 * file, a `.cursor` `.mdc`, a `.github` instructions file, and the codex root
 * appendix), so one override proves the layer arrives everywhere rather than
 * only where one adapter happens to look.
 */
describe("override content layer", () => {
  const getRepo = useTempDir("emission-overrides");

  /** A sentence that appears in the user's body and nowhere in the corpus. */
  const USER_MARKER = "House rule: name every branch after the ticket it closes.";

  /** A bundled rule this repo ships, emitted by every client with no `tools:` limit. */
  const SHADOWED_ID = "testing";

  /** A floor-tagged bundled rule — deselection-resistant, so it exercises the floor path. */
  const FLOOR_ID = "security-patterns";

  /** A bundled SKILL an override can take the id of, for the declared-gap case. */
  const SHADOWED_SKILL_ID = "qa";

  function override(id: string): string {
    return [
      "---",
      `id: ${id}`,
      "type: rule",
      "description: The house version of this rule, authored in this repo.",
      "tags:",
      "  - review",
      "load: on-demand",
      "obsolete_when: the repository's own linter enforces it",
      // Glob-scoped, with no directory anchor: cursor refuses an always-applied
      // rule outright, and codex routes an anchored rule into that directory's
      // own AGENTS.md instead of the root appendix.
      "scope: conditional",
      'globs: ["**/*.md"]',
      "---",
      "",
      USER_MARKER,
      "",
    ].join("\n");
  }

  /** The same authored body in the shape the skills class is walked as. */
  function overrideSkill(id: string): string {
    return [
      "---",
      `id: ${id}`,
      "type: skill",
      "description: The house version of this skill, authored in this repo.",
      "tags:",
      "  - implementation",
      "load: on-demand",
      "obsolete_when: the repository's own runbook covers it",
      "---",
      "",
      USER_MARKER,
      "",
    ].join("\n");
  }

  /**
   * A context for a REAL repo root and all four clients. The selection record
   * is empty on purpose: a user artifact is admitted by PRESENCE, so an empty
   * selection is the strictest possible statement that the tree is what carried
   * it into the plan.
   */
  function repoContext(rootDir: string): EmissionContext {
    return {
      rootDir,
      manifest: createManifest({
        tools: ["claude", "cursor", "copilot", "codex"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: "0.0.0-test",
        now: FIXED_NOW,
      }),
      engineVersion: "0.0.0-test",
      facts: { greenfield: true, monorepoPackages: [] },
    };
  }

  it("emits the USER body to every selected client, exactly once per client", async () => {
    const repo = getRepo();
    await repo.seedFiles({ [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: override(SHADOWED_ID) });

    const rows = await getEmissionPlanner().plan(repoContext(repo.dir));
    const byPath = new Map(rows.map((row) => [row.path, row.content]));

    // One dialect per client, all four carrying the same authored body.
    expect(byPath.get(`.claude/rules/stamity-${SHADOWED_ID}.md`)).toContain(USER_MARKER);
    expect(byPath.get(`.cursor/rules/stamity-${SHADOWED_ID}.mdc`)).toContain(USER_MARKER);
    expect(byPath.get(`.github/instructions/stamity-${SHADOWED_ID}.instructions.md`)).toContain(
      USER_MARKER,
    );
    // codex down-converts rules into the root appendix rather than a file of its own.
    expect(byPath.get("AGENTS.md")).toContain(USER_MARKER);

    // Exactly once per client: one path each, no duplicate path in the plan.
    const carrying = rows.filter((row) => row.content.includes(USER_MARKER));
    expect(carrying.map((row) => row.path).toSorted()).toEqual([
      ".claude/rules/stamity-testing.md",
      ".cursor/rules/stamity-testing.mdc",
      ".github/instructions/stamity-testing.instructions.md",
      "AGENTS.md",
    ]);
    expect(new Set(rows.map((row) => row.path)).size).toBe(rows.length);

    // And NOT both bodies: the bundled rule it took the id of is gone.
    const bundled = await corpusMarker(SHADOWED_ID);
    expect(rows.filter((row) => row.content.includes(bundled))).toEqual([]);
  });

  /**
   * The boundary of the claim above, pinned: skills are the one content class
   * the layer does not reach, and these assertions are what keep the seam's
   * header from overclaiming it (see the "Declared gap — SKILLS" note in
   * `src/cli/engine/emission.ts`).
   *
   * Not an endorsement of the behaviour — a drift guard in both directions.
   * The catalog half is asserted first, so the case localizes the gap instead
   * of merely recording it: the walk DOES index a user skill as `origin:
   * "user"`, and the two edits that would project it live in the skills seam
   * (`buildCoreEmissionPlan` narrows the spec to its corpus half before calling
   * `projectSkills`; `ProjectSkillsOptions.contentRoot` is a bare corpus-root
   * string with nowhere to put an override root) — neither is this unit's file
   * to write.
   *
   * When that option widens to the full `ContentRoots` spec this case goes RED.
   * The fix then is to INVERT it into the positive assertion the other three
   * classes carry, and to put "skill" back into the header sentence. Deleting
   * it to get green would restore exactly the text-vs-mechanism drift it exists
   * to catch.
   */
  it("does not reach the skills class — the declared gap, pinned against the header", async () => {
    const repo = getRepo();
    // Two shapes at once: a NEW user skill (nothing to shadow) and one taking a
    // shipped skill's id. The second is the sharper failure — a repo that
    // believes it replaced a skill silently keeps running the shipped body.
    await repo.seedFiles({
      ".stamity/overrides/skills/st-house-drill/SKILL.md": overrideSkill("house-drill"),
      [`.stamity/overrides/skills/st-${SHADOWED_SKILL_ID}/SKILL.md`]:
        overrideSkill(SHADOWED_SKILL_ID),
    });

    // The walk sees both: whatever drops them, it is not the content layer.
    const index = await buildContentIndex({
      packRoots: [],
      overrideRoot: join(repo.dir, ".stamity", "overrides"),
    });
    const userSkills = index.items.filter(
      (item) => item.type === "skill" && item.origin === "user",
    );
    expect(userSkills.map((item) => item.id).toSorted()).toEqual([
      "house-drill",
      SHADOWED_SKILL_ID,
    ]);

    const base = repoContext(repo.dir);
    const rows = await getEmissionPlanner().plan({
      ...base,
      manifest: {
        ...base.manifest,
        selection: {
          items: { agent: [], skill: [SHADOWED_SKILL_ID], rule: [], command: [] },
        },
      },
    });

    // No row anywhere carries an authored body, and nothing half-lands under
    // the projection dir for the skill that had nothing to shadow.
    expect(rows.filter((row) => row.content.includes(USER_MARKER))).toEqual([]);
    expect(rows.filter((row) => row.path.includes("house-drill"))).toEqual([]);
    // The shadowed one emits — with the SHIPPED body, which is the gap's
    // user-visible shape rather than an absence anyone would notice.
    const projected = rows.filter((row) =>
      row.path.startsWith(`.agents/skills/st-${SHADOWED_SKILL_ID}/`),
    );
    expect(projected.length).toBeGreaterThan(0);
    expect(projected.every((row) => !row.content.includes(USER_MARKER))).toBe(true);
  });

  /**
   * The second boundary of the same claim, now held as a POSITIVE: an installed
   * pack does not take the layer away. This case was written inverted — it
   * pinned the gap where `residueContext` (`src/emit/planner.ts`) rebuilt the
   * content spec from `{root, packRoots}` once the resolved pack set was
   * non-empty and dropped the override root, the third part — and it went red,
   * as its own instruction said it would, when that rebuild started carrying
   * all three parts. Inverted here into the same assertions the no-pack case
   * above makes, per that instruction; the seam header's pack-gap note went
   * with it.
   *
   * Kept rather than folded into the case above, because the state it varies is
   * exactly the one that used to change the answer: a ledgered pack is what
   * makes the rebuild run at all, so this is the only case in the suite that
   * exercises the layer through it. The failure mode it guards is silent — the
   * override did not error, it disappeared, and where it took a shipped id the
   * SHIPPED body emitted under it — so an absent case here would not read as a
   * regression until a repo noticed it running a body its author replaced.
   */
  it("keeps the layer once a pack is installed — same four dialects, override body winning", async () => {
    const repo = getRepo();
    const packFiles = {
      "rules/stamity-opsguard.md": [
        "---",
        "id: opsguard",
        "type: rule",
        "description: Pack-supplied deployment guard rule.",
        "tags:",
        "  - devops",
        "load: on-demand",
        "obsolete_when: the deploy pipeline enforces it",
        "scope: conditional",
        'globs: ["**/*.md"]',
        "---",
        "",
        "Watch the rollout counters before declaring the deploy done.",
        "",
      ].join("\n"),
    };
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: override(SHADOWED_ID),
      ...Object.fromEntries(
        Object.entries(packFiles).map(([rel, body]) => [`pack-src/opspack/${rel}`, body]),
      ),
      "pack-src/opspack/pack.json": `${JSON.stringify(
        {
          name: "opspack",
          version: "1.0.0",
          integrity: Object.fromEntries(
            Object.entries(packFiles).map(([rel, body]) => [
              rel,
              createHash("sha256").update(body, "utf8").digest("hex"),
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    });

    // The real install path, so the ledger state is the one a user's repo has.
    const base = repoContext(repo.dir);
    const plan = await planPackInstall(repo.dir, join(repo.dir, "pack-src", "opspack"), {
      allowUntrusted: true,
    });
    expect(plan.collisions).toEqual([]);
    const applied = await applyPackInstall(repo.dir, plan, base.manifest, {
      engineVersion: base.engineVersion,
      now: FIXED_NOW,
    });
    expect(applied.result.installed).toBe(true);

    const rows = await getEmissionPlanner().plan({ ...base, manifest: applied.manifest });

    // The pack arrived, which is what makes the rebuild run at all.
    expect(rows.some((row) => row.path.includes("opsguard"))).toBe(true);

    // And so did the override. The same fixture that reaches all four clients
    // in the first case of this suite reaches the same four here: one dialect
    // per client, each carrying the authored body, no duplicate path.
    const carrying = rows.filter((row) => row.content.includes(USER_MARKER));
    expect(carrying.map((row) => row.path).toSorted()).toEqual([
      ".claude/rules/stamity-testing.md",
      ".cursor/rules/stamity-testing.mdc",
      ".github/instructions/stamity-testing.instructions.md",
      "AGENTS.md",
    ]);
    expect(new Set(rows.map((row) => row.path)).size).toBe(rows.length);

    // The sharper half, where the id is a SELECTED corpus rule: the row comes
    // back carrying the AUTHORED text and not the shipped body it took the id
    // of — the shape whose absence used to leave the repo running a body the
    // author had replaced.
    const selected = await getEmissionPlanner().plan({
      ...base,
      manifest: {
        ...applied.manifest,
        selection: {
          items: { ...applied.manifest.selection.items, rule: [SHADOWED_ID] },
        },
      },
    });
    const bundled = await corpusMarker(SHADOWED_ID);
    expect(selected.find((row) => row.path === `.claude/rules/stamity-${SHADOWED_ID}.md`)?.content)
      .toContain(USER_MARKER);
    expect(selected.filter((row) => row.content.includes(bundled))).toEqual([]);
  });

  /**
   * The header's class set, asserted as a SET rather than as a count. The gap
   * note used to say "three of the four content classes arrive" and leave the
   * reader to work out which three from the constant below; a count is also the
   * one shape that stays true while the membership rots. Each class carries its
   * own marker here, so the answer is per class rather than per row, and the
   * expectation is `OVERRIDE_EMITTING_CLASSES` itself — the exported list the
   * validate command reports from — so the header, the constant and the
   * mechanism cannot drift apart in pairs.
   */
  it("emits overrides for exactly the classes OVERRIDE_EMITTING_CLASSES names", async () => {
    const repo = getRepo();
    const marker: Record<ContentClass, string> = {
      agent: "House agent body: escalate before deleting anything.",
      rule: "House rule body: name every branch after the ticket it closes.",
      command: "House command body: run the gates before reporting.",
      skill: "House skill body: check the runbook first.",
    };
    const head = (id: string, type: ContentClass, extra: readonly string[] = []): string =>
      [
        "---",
        `id: ${id}`,
        `type: ${type}`,
        `description: The house version of this ${type}, authored in this repo.`,
        "tags:",
        "  - review",
        "load: on-demand",
        "obsolete_when: the repository's own tooling covers it",
        ...extra,
        "---",
        "",
        marker[type],
        "",
      ].join("\n");

    await repo.seedFiles({
      ".stamity/overrides/agents/stamity-house-agent.md": head("house-agent", "agent", [
        "capabilities: [read]",
        "model_class: advanced",
      ]),
      // Glob-scoped for the same reason the rule fixture above is: an
      // always-applied rule is refused by cursor and re-homed by codex.
      ".stamity/overrides/rules/stamity-house-rule.md": head("house-rule", "rule", [
        "scope: conditional",
        'globs: ["**/*.md"]',
      ]),
      ".stamity/overrides/commands/stamity-house-command.md": head("house-command", "command"),
      ".stamity/overrides/skills/stamity-house-skill/SKILL.md": head("house-skill", "skill"),
    });

    const rows = await getEmissionPlanner().plan(repoContext(repo.dir));

    // Non-degenerate: the plan is real and the four authored bodies are
    // distinguishable, so "arrived" is a per-class answer.
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(Object.values(marker)).size).toBe(4);

    const arrived = CONTENT_CLASSES.filter((cls) =>
      rows.some((row) => row.content.includes(marker[cls])),
    );
    expect(arrived.toSorted()).toEqual([...OVERRIDE_EMITTING_CLASSES].toSorted());
    // Said the other way round too, because the gap is the half a reader needs
    // named: the fourth class is `skill`, and nothing carries its body.
    expect(arrived).not.toContain("skill");
  });

  it("keeps a floor rule whole when an override takes its id", async () => {
    const repo = getRepo();
    await repo.seedFiles({ [`.stamity/overrides/rules/${FLOOR_ID}.md`]: override(FLOOR_ID) });

    const rows = await getEmissionPlanner().plan(repoContext(repo.dir));

    // The floor is still present — one rule under that id reaches each client —
    // and it is the author's body, not the shipped one, and not both.
    const claudeRule = rows.find((row) => row.path === `.claude/rules/stamity-${FLOOR_ID}.md`);
    expect(claudeRule?.content).toContain(USER_MARKER);
    expect(rows.filter((row) => row.path.includes(FLOOR_ID))).toHaveLength(3);

    const bundled = await corpusMarker(FLOOR_ID);
    expect(rows.filter((row) => row.content.includes(bundled))).toEqual([]);
  });

  it("never plans the source file, so nothing in the override tree is regenerated or reclaimed", async () => {
    const repo = getRepo();
    const source = `.stamity/overrides/rules/${SHADOWED_ID}.md`;
    await repo.seedFiles({ [source]: override(SHADOWED_ID) });

    const rows = await getEmissionPlanner().plan(repoContext(repo.dir));

    // No planned path lands anywhere under the tree. Reclaim candidates are
    // derived from the ledger, and the ledger records planned rows only, so a
    // tree no row targets is a tree no sweep can reach.
    expect(rows.filter((row) => row.path.startsWith(".stamity/overrides"))).toEqual([]);
    // Nor does any row claim ownership of the source under another spelling.
    expect(rows.filter((row) => row.path.includes("overrides"))).toEqual([]);

    // Planning is a read: the author's file is byte-identical afterwards, and
    // no managed block was written into it.
    const after = await readFile(repo.path(source), "utf8");
    expect(after).toBe(override(SHADOWED_ID));
    expect(after).not.toContain("STAMITY:BEGIN");
  });

  it("plans byte-identically to a planner without the layer when the repo has no overrides", async () => {
    // The reference is the composed planner itself — the exact planner this
    // seam returned before the override root was threaded — rather than a
    // literal digest, which would go stale on every unrelated corpus edit and
    // stop testing this unit's promise. The digest comparison is kept because
    // it is what a regression would actually look like: one changed byte
    // anywhere in the plan.
    const repo = getRepo();
    const ctx = repoContext(repo.dir);

    const [withLayer, reference] = await Promise.all([
      getEmissionPlanner().plan(ctx),
      composeEmissionPlanner(ADAPTER_REGISTRY).plan(ctx),
    ]);

    expect(withLayer.length).toBeGreaterThan(0);
    expect(digestOf(withLayer)).toBe(digestOf(reference));
  });

  it("still plans byte-identically when the override tree exists but holds nothing", async () => {
    const repo = getRepo();
    await mkdir(join(repo.dir, ".stamity", "overrides", "rules"), { recursive: true });
    const ctx = repoContext(repo.dir);

    const [withLayer, reference] = await Promise.all([
      getEmissionPlanner().plan(ctx),
      composeEmissionPlanner(ADAPTER_REGISTRY).plan(ctx),
    ]);

    expect(digestOf(withLayer)).toBe(digestOf(reference));
  });

  it("overlays the override root on the findings view too, not only on the rows view", async () => {
    // The seam has two entry points and both go through the wrapper. A layer
    // applied to one of them would make the repo's own content depend on which
    // view the caller asked for — appearing and disappearing with unrelated
    // state, which is the shape `overlayContentRoots` exists to refuse.
    const repo = getRepo();
    await repo.seedFiles({ [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: override(SHADOWED_ID) });
    const ctx = repoContext(repo.dir);

    const [rows, full] = await Promise.all([
      getEmissionPlanner().plan(ctx),
      getEmissionPlanner().planWithWarnings(ctx),
    ]);

    expect(rows.some((row) => row.content.includes(USER_MARKER))).toBe(true);
    expect(digestOf(full.outputs)).toBe(digestOf(rows));
    // The channel is present and describes the BUILD, not the layer: this repo
    // authored no hooks, so nothing in it is a user-hook rejection. (A four-tool
    // selection does earn a `hook wiring [copilot]` row — that client takes no
    // hook configuration — which is the planner reporting a real fact about the
    // selection, and is `hooksInfra`'s own suite to pin.)
    expect(Array.isArray(full.warnings)).toBe(true);
    expect(full.warnings.every((warning) => !warning.includes("user hook"))).toBe(true);
  });

  it("carries a pinned corpus root through alongside the derived override root", async () => {
    // The spec has three parts and a caller that rebuilds one has to carry all
    // of them: a derivation that dropped the corpus root would silently swap
    // the pinned corpus for the bundled one, which reads as a content change
    // nobody made rather than as an error anyone can see.
    const repo = getRepo();
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: override(SHADOWED_ID),
      // A corpus of exactly one rule, pinned as the plain string form. The
      // charter template rides along because a corpus without one cannot emit
      // a setup at all — it is copied rather than invented so the fixture
      // cannot drift from what the renderer expects.
      "vendor/corpus/rules/stamity-house-style.md": override("house-style"),
      "vendor/corpus/charter/stamity-charter.md": await readFile(
        join(process.cwd(), "content", "charter", "stamity-charter.md"),
        "utf8",
      ),
    });

    const base = repoContext(repo.dir);
    const rows = await getEmissionPlanner().plan({
      ...base,
      // The pinned corpus artifact is selected; the override is not, because a
      // user artifact is admitted by presence. Both must still arrive.
      manifest: {
        ...base.manifest,
        selection: { items: { agent: [], skill: [], rule: ["house-style"], command: [] } },
      },
      contentRoot: join(repo.dir, "vendor", "corpus"),
    });
    const paths = rows.map((row) => row.path);

    // Both roots were read: the pinned corpus supplied `house-style`, the
    // derived override root supplied `testing`.
    expect(paths).toContain(".claude/rules/stamity-house-style.md");
    expect(paths).toContain(`.claude/rules/stamity-${SHADOWED_ID}.md`);
    // And the bundled corpus was NOT read — no other shipped rule came along.
    expect(paths.filter((path) => path.startsWith(".claude/rules/"))).toHaveLength(2);
  });

  it("leaves an override root a caller pinned itself alone", async () => {
    // The derivation fills a gap; it never overrules a caller that knows better
    // (a workspace member planning against another repo's tree). The repo's own
    // tree holds a live override, so honouring the pin is observable: that body
    // must NOT appear.
    const repo = getRepo();
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: override(SHADOWED_ID),
      "elsewhere/overrides/rules/other-rule.md": override("other-rule"),
    });

    const rows = await getEmissionPlanner().plan({
      ...repoContext(repo.dir),
      contentRoot: { overrideRoot: join(repo.dir, "elsewhere", "overrides") },
    });

    // The pinned tree was read — `other-rule` reaches the plan — and the repo's
    // own `.stamity/overrides` was not: `testing` is deselected by the empty
    // selection record, and only presence in the walked tree would have kept it.
    const paths = rows.map((row) => row.path);
    expect(paths).toContain(".claude/rules/stamity-other-rule.md");
    expect(paths).not.toContain(`.claude/rules/stamity-${SHADOWED_ID}.md`);
  });
});

/**
 * The distinctive opening line of a bundled rule's body, read from the corpus.
 * Read at run time rather than pinned as a literal, so an unrelated edit to the
 * shipped rule cannot quietly make the "not both bodies" assertion vacuous.
 */
async function corpusMarker(id: string): Promise<string> {
  const raw = await readFile(join(process.cwd(), "content", "rules", `stamity-${id}.md`), "utf8");
  const body = raw.slice(raw.indexOf("\n---", 3) + 4);
  const line = body.split("\n").find((entry) => entry.trim().length > 40 && !entry.startsWith("#"));
  // A corpus rule with no prose line long enough to fingerprint would make the
  // assertion it feeds vacuous, so the fixture refuses to proceed.
  expect(line).toBeDefined();
  return line!.trim();
}

/** A plan as one digest: any single changed byte moves it. */
function digestOf(rows: readonly AdapterOutput[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
