import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { planPackFit, type PackFitReport } from "../../../src/cli/engine/packFit.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall, type PackInstallPlan } from "../../../src/pack/install.ts";
import { PACK_MANIFEST_FILE } from "../../../src/pack/manifest.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { SetupManifest } from "../../../src/types/manifest.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u4-pack-fit (REQ-PACK-004): `add`'s fit check measures the skills list Codex
 * would show with the incoming pack staged, by the measure `sync`'s refusal
 * reads (`measureCodexSkillsList`).
 *
 * Real temp repositories, the real install planner and the bundled corpus, no
 * mocks: the subject is the measure the next `sync` would take, so the core's
 * share is whatever the shipped corpus lists. The assertions are therefore
 * differences against a baseline the same corpus produces, never the corpus's
 * own figure, which `test/adapters/codex.test.ts` pins.
 */

const ENGINE_VERSION = "1.17.0";
const NOW = new Date("2026-10-21T00:00:00.000Z");
const getProject = useTempDir("pack-fit");

/** One corpus-shaped artifact: the frontmatter keys the catalog walk requires. */
function artifact(id: string, type: "skill" | "command" | "rule", description: string): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: ${JSON.stringify(description)}`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    "---",
    "",
    `# ${id}`,
    "",
    "Fixture body for the pack-fit suite.",
    "",
  ].join("\n");
}

/** Plain prose of exactly `length` characters. */
function prose(length: number, seed: string): string {
  const sentence = `Acme ${seed} guidance keeps the demo pack listing honest about its size. `;
  return sentence.repeat(Math.ceil(length / sentence.length) + 1).slice(0, length - 1).concat(".");
}

const HIDDEN = "policy:\n  allow_implicit_invocation: false\n";

/** `count` skills `st-<prefix>-<n>` at `length` description characters, optionally hidden. */
function skills(prefix: string, count: number, length: number, hidden = false): Record<string, string> {
  const files: Record<string, string> = {};
  for (let n = 1; n <= count; n += 1) {
    files[`skills/st-${prefix}-${n}/SKILL.md`] = artifact(`${prefix}-${n}`, "skill", prose(length, `${prefix} ${n}`));
    if (hidden) files[`skills/st-${prefix}-${n}/agents/openai.yaml`] = HIDDEN;
  }
  return files;
}

/** One shown row's share: the folder name, the description, and the 3 separators. */
const rowShare = (folder: string, length: number): number => folder.length + length + 3;

/** Seeds `packs/<dir>` in the project with a `pack.json` whose integrity map covers every file. */
async function seedPack(
  dir: string,
  name: string,
  files: Record<string, string>,
  declaredTools?: readonly string[],
): Promise<string> {
  const integrity = Object.fromEntries(
    Object.entries(files).map(([rel, body]) => [rel, createHash("sha256").update(body, "utf8").digest("hex")]),
  );
  await getProject().seedFiles({
    ...Object.fromEntries(Object.entries(files).map(([rel, body]) => [`packs/${dir}/${rel}`, body])),
    [`packs/${dir}/${PACK_MANIFEST_FILE}`]: JSON.stringify(
      { name, version: "1.0.0", integrity, ...(declaredTools === undefined ? {} : { declaredTools }) },
      null,
      2,
    ),
  });
  return `./packs/${dir}`;
}

async function initProject(tools: Tool[]): Promise<SetupManifest> {
  const manifest = createManifest({
    tools,
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: "0.0.0",
    now: NOW,
  });
  await writeManifest(getProject().dir, manifest, { now: NOW });
  return manifest;
}

async function currentManifest(): Promise<SetupManifest> {
  const manifest = await readManifest(getProject().dir);
  if (manifest === null) throw new Error("expected a project manifest on disk");
  return manifest;
}

const plan = (spec: string): Promise<PackInstallPlan> =>
  planPackInstall(getProject().dir, spec, { allowUntrusted: true });

/** Installs `spec` through the engine's own plan and apply, bypassing `add` and its fit check. */
async function install(spec: string): Promise<void> {
  const manifest = await currentManifest();
  const applied = await applyPackInstall(getProject().dir, await plan(spec), manifest, { now: NOW });
  if (!applied.result.installed) throw new Error(`fixture install failed: ${applied.result.errors.join("; ")}`);
  await writeManifest(getProject().dir, applied.manifest, { now: NOW });
}

type Measured = Extract<PackFitReport["codex"], { applies: true }>;

async function measured(spec: string): Promise<Measured> {
  const report = await planPackFit(getProject().dir, await currentManifest(), await plan(spec), ENGINE_VERSION);
  if (!report.codex.applies) throw new Error("expected the fit check to measure a codex setup");
  return report.codex;
}

/** The core's own list: a commands-only pack shows no row, so the total is the core's. */
async function baseline(): Promise<number> {
  const spec = await seedPack("baseline", "acme-baseline", {
    "commands/st-acme-only.md": artifact("acme-only", "command", prose(900, "command")),
  });
  const fit = await measured(spec);
  expect(fit.packShare, "a command row is never shown, so the commands-only pack adds nothing").toEqual({
    characters: 0,
    skills: 0,
  });
  expect(fit.measure.total).toBe(fit.measure.core.characters);
  expect(fit.measure.core.skills, "non-degenerate: the bundled core lists skills").toBeGreaterThan(0);
  return fit.measure.total;
}

describe("planPackFit — the Codex skills list with the pack staged", () => {
  it("measures a pack under the cap as fitting, its share exactly its shown rows", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    const spec = await seedPack("small", "acme-small", skills("acme-small", 2, 200));

    const fit = await measured(spec);

    const share = 2 * rowShare("st-acme-small-1", 200);
    expect(fit.packShare).toEqual({ characters: share, skills: 2 });
    expect(fit.measure.packs.get("acme-small")).toEqual({ characters: share, skills: 2 });
    expect(fit.measure.total).toBe(core + share);
    expect(fit.measure.cap).toBe(8_000);
    expect(fit.fits).toBe(true);
  });

  it("measures a pack that takes the list past 8,000 as not fitting, naming its share and the total", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    const spec = await seedPack("big", "acme-demo", skills("acme-skill", 4, 900));

    const fit = await measured(spec);

    const share = 4 * rowShare("st-acme-skill-1", 900);
    expect(fit.packShare).toEqual({ characters: share, skills: 4 });
    expect(fit.measure.total).toBe(core + share);
    expect(fit.measure.total).toBeGreaterThan(fit.measure.cap);
    expect(fit.fits).toBe(false);
  });

  it("adds nothing for a pack whose skills each ship allow_implicit_invocation: false", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    const spec = await seedPack("hidden", "acme-hidden", skills("acme-skill", 4, 900, true));

    const fit = await measured(spec);

    // Non-degenerate: the same four skills, shown, are the over-cap pack above.
    expect(core + 4 * rowShare("st-acme-skill-1", 900)).toBeGreaterThan(fit.measure.cap);
    expect(fit.packShare).toEqual({ characters: 0, skills: 0 });
    expect(fit.measure.total).toBe(core);
    expect(fit.fits).toBe(true);
  });

  it("measures a re-add with the installed copy replaced, not counted twice", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    const spec = await seedPack("re-add", "acme-demo", skills("acme-skill", 3, 900));
    await install(spec);
    const installed = await currentManifest();
    expect(
      installed.ledger.some((row) => row.adapter === "pack:acme-demo"),
      "fixture: the pack is installed before the re-add is measured",
    ).toBe(true);

    const fit = await measured(spec);

    const share = 3 * rowShare("st-acme-skill-1", 900);
    // Counted twice, the list would read core + 2 × share and refuse.
    expect(core + 2 * share).toBeGreaterThan(fit.measure.cap);
    expect(fit.packShare).toEqual({ characters: share, skills: 3 });
    expect(fit.measure.total).toBe(core + share);
    expect(fit.fits).toBe(true);
  });

  it("names the current total when the setup is already over the cap before the pack", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    // Installed by the engine alone, past the cap: the state an earlier release left.
    const bulky = await seedPack("bulky", "acme-bulky", skills("acme-bulky", 4, 900));
    await install(bulky);
    const spec = await seedPack("tiny", "acme-tiny", skills("acme-tiny", 1, 100));

    const fit = await measured(spec);

    const bulkyShare = 4 * rowShare("st-acme-bulky-1", 900);
    const tinyShare = rowShare("st-acme-tiny-1", 100);
    expect(fit.packShare).toEqual({ characters: tinyShare, skills: 1 });
    expect(fit.measure.packs.get("acme-bulky")).toEqual({ characters: bulkyShare, skills: 4 });
    expect(fit.measure.total).toBe(core + bulkyShare + tinyShare);
    expect(fit.fits).toBe(false);
  });

  it("counts a pack skill whose tools: leaves Codex out, as sync does", async () => {
    await initProject(["codex"]);
    const core = await baseline();
    const body = artifact("acme-claude", "skill", prose(300, "claude only")).replace(
      "type: skill\n",
      "type: skill\ntools:\n  - claude\n",
    );
    const spec = await seedPack("scoped", "acme-scoped", { "skills/st-acme-claude/SKILL.md": body }, [
      "claude",
      "codex",
    ]);

    const fit = await measured(spec);

    expect(fit.packShare).toEqual({ characters: rowShare("st-acme-claude", 300), skills: 1 });
    expect(fit.measure.total).toBe(core + rowShare("st-acme-claude", 300));
  });

  it("does not measure a setup without Codex", async () => {
    await initProject(["claude", "cursor"]);
    const spec = await seedPack("big", "acme-demo", skills("acme-skill", 4, 900));

    const report = await planPackFit(getProject().dir, await currentManifest(), await plan(spec), ENGINE_VERSION);

    expect(report).toEqual({ codex: { applies: false } });
  });
});
