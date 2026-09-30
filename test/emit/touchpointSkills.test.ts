import { describe, expect, it } from "vitest";
import { CLAUDE_COMMANDS_DIR } from "../../src/adapters/claude.ts";
import { COPILOT_PROMPTS_DIR } from "../../src/adapters/copilot.ts";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { resolveBundledContentRoot } from "../../src/content/contentRoot.ts";
import { composeEmissionPlanner, type EmissionContext } from "../../src/emit/planner.ts";
import {
  NATIVE_SKILL_DIRS,
  SKILLS_PROJECTION_DIR,
  TOUCHPOINT_POLICY_FILE,
} from "../../src/emit/skillsProjection.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import { outputOwners, type AdapterOutput } from "../../src/types/content.ts";
import type { Tool } from "../../src/types/core.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-026 (sw17-touchpoints-as-shared-skills): the nine touchpoints ship once, as
 * `.agents/skills/st-<id>/SKILL.md`, when Codex or Cursor is selected — co-owned by the two,
 * never copied into Claude's native skills directory, never emitted for Copilot alone, and no
 * longer under `.cursor/skills/`.
 *
 * Driven through the composed planner over the real adapter registry and the shipped corpus,
 * because ownership is decided where the residues MERGE: each adapter emits the rows as its own,
 * and only the composer can show the two became one write with two owners.
 */

const getTemp = useTempDir("touchpoint-skills");

const TOUCHPOINT_IDS = ["ask", "board", "debug", "plan", "pr-resolve", "quick", "rework", "spec", "work"];

async function planFor(tools: readonly Tool[]): Promise<AdapterOutput[]> {
  const index = await buildContentIndex(resolveBundledContentRoot());
  const commands = index.items.filter((item) => item.type === "command").map((item) => item.id);
  expect(commands).toHaveLength(9);
  const ctx: EmissionContext = {
    rootDir: getTemp().path("repo"),
    manifest: createManifest({
      tools: [...tools],
      selection: { items: { agent: [], skill: ["onboard"], rule: [], command: commands } },
      generatorVersion: "0.0.0-test",
      now: new Date("2026-09-30T00:00:00.000Z"),
    }),
    engineVersion: "0.0.0-test",
    facts: { monorepoPackages: [] },
    contentRoot: resolveBundledContentRoot(),
  };
  return composeEmissionPlanner(ADAPTER_REGISTRY).plan(ctx);
}

const touchpointSkill = (id: string): string => `${SKILLS_PROJECTION_DIR}/st-${id}/SKILL.md`;

const ownersOf = (row: AdapterOutput | undefined): string[] =>
  row === undefined ? [] : outputOwners(row).map((owner) => owner.adapter).toSorted();

describe("the nine touchpoints as shared skills", () => {
  it("writes each touchpoint once for codex + cursor, owned by both", async () => {
    const plan = await planFor(["cursor", "codex"]);
    const byPath = new Map(plan.map((row) => [row.path, row]));

    for (const id of TOUCHPOINT_IDS) {
      const skill = byPath.get(touchpointSkill(id));
      expect(skill, id).toBeDefined();
      expect(ownersOf(skill), id).toEqual(["codex", "cursor"]);
      expect(outputOwners(skill!).every((owner) => owner.artifactType === "command"), id).toBe(true);
      const policy = byPath.get(`${SKILLS_PROJECTION_DIR}/st-${id}/${TOUCHPOINT_POLICY_FILE}`);
      expect(ownersOf(policy), id).toEqual(["codex", "cursor"]);
    }
    expect(plan.filter((row) => row.path.startsWith(".cursor/skills/"))).toEqual([]);
  });

  it("ships the nine to codex alone", async () => {
    const plan = await planFor(["codex"]);
    const skills = plan.filter(
      (row) => row.owner.artifactType === "command" && row.path.endsWith("/SKILL.md"),
    );
    expect(skills.map((row) => row.path)).toEqual(TOUCHPOINT_IDS.map(touchpointSkill));
    for (const row of skills) expect(ownersOf(row)).toEqual(["codex"]);
  });

  it("keeps claude on its own commands and leaves .cursor/skills empty for claude + cursor", async () => {
    const plan = await planFor(["claude", "cursor"]);
    const paths = new Set(plan.map((row) => row.path));
    const nativeDir = NATIVE_SKILL_DIRS.claude ?? "";
    expect(nativeDir).not.toBe("");

    for (const id of TOUCHPOINT_IDS) {
      expect(ownersOf(plan.find((row) => row.path === touchpointSkill(id))), id).toEqual(["cursor"]);
      // Claude's one door per touchpoint is its command file, never a second skill copy.
      expect(paths.has(`${CLAUDE_COMMANDS_DIR}/st-${id}.md`), id).toBe(true);
      expect(paths.has(`${nativeDir}/st-${id}/SKILL.md`), id).toBe(false);
    }
    // Non-degenerate: the content skill selected beside them IS copied natively.
    expect(paths.has(`${nativeDir}/st-onboard/SKILL.md`)).toBe(true);
    expect([...paths].filter((path) => path.startsWith(".cursor/skills/"))).toEqual([]);
  });

  it("emits no shared touchpoint for copilot alone, which keeps its prompt files", async () => {
    const plan = await planFor(["copilot"]);
    const paths = new Set(plan.map((row) => row.path));
    for (const id of TOUCHPOINT_IDS) {
      expect(paths.has(touchpointSkill(id)), id).toBe(false);
      expect(paths.has(`${COPILOT_PROMPTS_DIR}/st-${id}.prompt.md`), id).toBe(true);
    }
    // The content skill still reaches copilot through the shared tree.
    expect(paths.has(`${SKILLS_PROJECTION_DIR}/st-onboard/SKILL.md`)).toBe(true);
  });
});
