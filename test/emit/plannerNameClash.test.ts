import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import type { ContentRoots } from "../../src/content/catalog.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../src/pack/install.ts";
import type { Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The emission planner's cross-class name refusal (run
 * 2026-10-03_pack-engine-defects, defect 1, the `sync` half): a command and a
 * skill the catalog keys apart by class still land in ONE `st-<x>` folder, and
 * a repository can already hold such a pair — a pack installed by an engine
 * that had no `add`-time check, an override, a fork artifact. `sync`, `check`,
 * `init` and `plugin setup` all plan through `composeEmissionPlanner`, so the
 * refusal is asserted there, on the plan, naming every owner and its remedy.
 *
 * No mocks: real temp repositories, packs installed through the engine's own
 * plan/apply path (which records a name clash but, unlike `add`, does not act
 * on it — the state an earlier engine left behind), the bundled corpus, and
 * the production adapter registry.
 */

const getRepo = useTempDir("planner-name-clash");

const FIXED_NOW = new Date("2026-10-03T00:00:00.000Z");
const ENGINE_VERSION = "0.0.0-test";

const sha256 = (body: string): string => createHash("sha256").update(body, "utf8").digest("hex");

/** A command or skill file with the frontmatter both classes accept. */
function artifact(id: string, type: "command" | "skill"): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: "Fixture ${type} ${id} for the planner name-clash suite."`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    "---",
    "",
    `# ${id}`,
    "",
    "Fixture body.",
    "",
  ].join("\n");
}

/** A pack staged outside the repo's state dir, with a sha256 integrity map over its files. */
async function stagePack(packId: string, files: Record<string, string>): Promise<string> {
  const manifest = {
    name: packId,
    version: "1.0.0",
    integrity: Object.fromEntries(Object.entries(files).map(([rel, body]) => [rel, sha256(body)])),
  };
  await getRepo().seedFiles({
    ...Object.fromEntries(
      Object.entries(files).map(([rel, body]) => [`pack-src/${packId}/${rel}`, body]),
    ),
    [`pack-src/${packId}/pack.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
  });
  return getRepo().path("pack-src", packId);
}

/** Install through the engine's plan/apply path, which writes a clashing pack as an older engine did. */
async function installPack(packDir: string, manifest: SetupManifest): Promise<SetupManifest> {
  const plan = await planPackInstall(getRepo().dir, packDir, { allowUntrusted: true });
  expect(plan.collisions).toEqual([]);
  const applied = await applyPackInstall(getRepo().dir, plan, manifest, {
    engineVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
  expect(applied.result.installed).toBe(true);
  return applied.manifest;
}

function manifestFor(tools: Tool[]): SetupManifest {
  return createManifest({
    tools,
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: ENGINE_VERSION,
    now: FIXED_NOW,
  });
}

function ctxOf(manifest: SetupManifest, contentRoot?: ContentRoots): EmissionContext {
  return {
    rootDir: getRepo().dir,
    manifest,
    engineVersion: ENGINE_VERSION,
    facts: { monorepoPackages: [] },
    ...(contentRoot === undefined ? {} : { contentRoot }),
  };
}

/** The refusal a plan rejected with; fails the case when the plan built. */
async function refusalOf(ctx: EmissionContext): Promise<EngineError> {
  const outcome = await composeEmissionPlanner(ADAPTER_REGISTRY)
    .planWithWarnings(ctx)
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(outcome, "the plan built; a name clash must refuse it").toBeInstanceOf(EngineError);
  const refusal = outcome as EngineError;
  expect(refusal.code).toBe("VALIDATION_ERROR");
  // The composer's single-writer check is the backstop, never the diagnosis.
  expect(refusal.message).not.toContain("Two planners emitted different content");
  return refusal;
}

/** A path as the refusal prints it: POSIX on every platform. */
const posix = (path: string): string => path.replaceAll("\\", "/");

const DRILL_LINE =
  'st-drill — pack "acme-demo" command "drill" and pack "acme-demo" skill "drill" both install ' +
  "as st-drill (one folder on Cursor and Codex; on Claude the skill hides the command)";

/** This suite's pinned call: `ctxOf` names no package, so the canonical one at {@link ENGINE_VERSION}. */
const call = (verb: string): string => `npx -y @zomarit/stamity@${ENGINE_VERSION} ${verb}`;

// TEST CHANGE, justified: 2026-10-06, run 2026-10-03_pack-engine-defects
// review/42. The remedy printed a bare `stamity <verb>`, which the documented
// `npx` setup cannot run; it now prints the pinned call `check`'s `pack-reach`
// row prints for the same `clean --pack` step.
// TEST CHANGE, justified (prove/3): 2026-10-06. The three-step order failed at
// `add` when the pack had been synced: `clean --pack` leaves the client copies,
// so `add` found their paths "already owned". A `sync` between `clean --pack`
// and `add` reclaims them; the remedy is now four steps
// (test/pack/upgradeRemedy.test.ts runs them).
const ACME_REMEDY =
  `pack "acme-demo": run \`${call("clean --pack acme-demo")}\`, then ` +
  `\`${call("sync")}\` to remove its client copies, then ` +
  `\`${call("add acme-demo")}\` once the pack ships distinct names, then \`${call("sync")}\``;

describe("composeEmissionPlanner — an installed cross-class name clash", () => {
  it.each<[string, Tool[]]>([
    ["cursor,codex", ["cursor", "codex"]],
    // No two rows share a path on Claude, so only the name check can refuse here.
    ["claude", ["claude"]],
  ])(
    "refuses a pack's command and skill that both install as st-drill (tools=%s)",
    async (_, tools) => {
      const packDir = await stagePack("acme-demo", {
        "commands/st-drill.md": artifact("drill", "command"),
        "skills/st-drill/SKILL.md": artifact("drill", "skill"),
      });
      const manifest = await installPack(packDir, manifestFor(tools));

      const refusal = await refusalOf(ctxOf(manifest));

      expect(refusal.message.split("\n")).toContain(`  ${DRILL_LINE}`);
      expect(refusal.message).toContain(ACME_REMEDY);
      expect(refusal.why).toContain("one folder");
      expect(refusal.next).toContain(`\`${call("sync")}\``);
      expect(refusal.next).toContain(`\`${call("plugin setup")}\``);
      expect(refusal.next).not.toMatch(/`stamity /u);
    },
  );

  it("lists every clash in one refusal, and a pack's remedy once", async () => {
    const packDir = await stagePack("acme-demo", {
      "commands/st-drill.md": artifact("drill", "command"),
      "commands/st-probe.md": artifact("probe", "command"),
      "skills/st-drill/SKILL.md": artifact("drill", "skill"),
      "skills/st-probe/SKILL.md": artifact("probe", "skill"),
    });
    const manifest = await installPack(packDir, manifestFor(["cursor"]));

    const refusal = await refusalOf(ctxOf(manifest));
    const lines = refusal.message.split("\n");

    expect(refusal.message).toMatch(/^2 name\(s\)/);
    expect(lines).toContain(`  ${DRILL_LINE}`);
    expect(lines.filter((line) => line.startsWith("  st-probe — "))).toHaveLength(1);
    expect(lines.filter((line) => line.includes(ACME_REMEDY))).toHaveLength(1);
  });

  // TEST CHANGE, justified: REQ-PLUGIN-048 (review/78) — two rows added, and the
  // tuple gains the context's `npmRegistry`; the first two rows are unchanged.
  // The fallback names a scope registry the call can write, and fails closed to
  // `--no` for one it cannot, so the refusal still names runnable steps.
  it.each<[string, boolean | undefined, string | undefined, string]>([
    ["an npm channel", undefined, undefined, "npx @zomarit/stamity"],
    ["no npm channel", false, undefined, "npx --no @zomarit/stamity"],
    [
      "a scope registry",
      undefined,
      "https://npm.pkg.github.com",
      "npx --@zomarit:registry=https://npm.pkg.github.com @zomarit/stamity",
    ],
    ["a registry the call cannot name", undefined, "http://npm.acme.example/", "npx --no @zomarit/stamity"],
  ])(
    "keeps the unpinned call when the version cannot be pinned (%s), rather than failing the refusal",
    async (_, npmChannel, npmRegistry, prefix) => {
      const packDir = await stagePack("acme-demo", {
        "commands/st-drill.md": artifact("drill", "command"),
        "skills/st-drill/SKILL.md": artifact("drill", "skill"),
      });
      const manifest = await installPack(packDir, manifestFor(["cursor"]));

      // Not semver-shaped, so `pinnedCliCall` throws; the refusal still names the step.
      const refusal = await refusalOf({
        ...ctxOf(manifest),
        engineVersion: "dev",
        ...(npmChannel === undefined ? {} : { npmChannel }),
        ...(npmRegistry === undefined ? {} : { npmRegistry }),
      });

      expect(refusal.message).toContain(`run \`${prefix} clean --pack acme-demo\``);
      expect(refusal.next).toContain(`\`${prefix} sync\``);
      // A refused registry is never echoed into a command.
      expect(`${refusal.message}\n${refusal.next ?? ""}`).not.toContain("npm.acme.example");
    },
  );

  it("refuses an override command that installs as a core skill's name, with no pack installed", async () => {
    await getRepo().seedFiles({
      ".stamity/overrides/commands/verify.md": artifact("verify", "command"),
    });
    const overridePath = posix(getRepo().path(".stamity", "overrides", "commands", "verify.md"));

    const refusal = await refusalOf(
      ctxOf(manifestFor(["cursor"]), { overrideRoot: join(getRepo().dir, ".stamity", "overrides") }),
    );

    expect(refusal.message).toContain(
      `st-verify — the core skill "st-verify" and the override command "verify" at ${overridePath}`,
    );
    expect(refusal.message).toContain(
      `the override at ${overridePath}: rename or remove ${overridePath}`,
    );
    expect(refusal.message).not.toContain("clean --pack");
  });

  it("names an override that replaced a core skill by the core skill's folder", async () => {
    // The override takes the core skill's id from a directory of its own, so it
    // lands in st-verify; only the replaced claimant says so. Named by its own
    // folder ("verify"), it would clash with nothing and the pack command's
    // st-verify touchpoint would overwrite it on Cursor.
    const packDir = await stagePack("acme-demo", {
      "commands/st-verify.md": artifact("verify", "command"),
    });
    const manifest = await installPack(packDir, manifestFor(["cursor"]));
    await getRepo().seedFiles({
      ".stamity/overrides/skills/verify/SKILL.md": artifact("verify", "skill"),
    });
    const overridePath = posix(
      getRepo().path(".stamity", "overrides", "skills", "verify", "SKILL.md"),
    );

    const refusal = await refusalOf(
      ctxOf(manifest, { overrideRoot: join(getRepo().dir, ".stamity", "overrides") }),
    );

    expect(refusal.message).toContain(
      `st-verify — pack "acme-demo" command "verify" and the override skill "verify" at ${overridePath}`,
    );
    // Either owner can move, so both remedies are offered.
    expect(refusal.message).toContain(ACME_REMEDY);
    expect(refusal.message).toContain(`the override at ${overridePath}: rename or remove`);
  });

  it("refuses a clash inside the core and the fork layer, naming the fork file as the thing to move", async () => {
    await getRepo().seedFiles({ "fork/commands/verify.md": artifact("verify", "command") });
    const forkPath = posix(getRepo().path("fork", "commands", "verify.md"));

    const refusal = await refusalOf(
      ctxOf(manifestFor(["claude"]), { forkRoot: getRepo().path("fork") }),
    );

    expect(refusal.message).toContain(
      `st-verify — the core skill "st-verify" and the fork-layer command "verify" at ${forkPath}`,
    );
    expect(refusal.message).toContain(
      `the fork-layer file at ${forkPath}: rename or remove it in the fork's source`,
    );
    expect(refusal.message).not.toContain("clean --pack");
  });

  it("plans a pack whose names are distinct, its skill reaching the shared tree", async () => {
    const packDir = await stagePack("acme-demo", {
      "commands/st-drill.md": artifact("drill", "command"),
      "skills/st-drill-steps/SKILL.md": artifact("drill-steps", "skill"),
    });
    const manifest = await installPack(packDir, manifestFor(["cursor"]));

    const plan = await composeEmissionPlanner(ADAPTER_REGISTRY).plan(ctxOf(manifest));

    const paths = plan.map((row) => row.path);
    expect(paths).toContain(".agents/skills/st-drill/SKILL.md");
    expect(paths).toContain(".agents/skills/st-drill-steps/SKILL.md");
  });
});
