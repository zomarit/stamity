import { describe, expect, it } from "vitest";
import { RUBRIC_FILE, SET_FILE, readRepoFile } from "./support.ts";

interface ModelRole {
  readonly model: string;
  readonly reasoningEffort: "high" | null;
}

interface ModelProfile {
  readonly harness: "claude-code" | "codex";
  readonly rubric: string;
  readonly scenario: ModelRole;
  readonly judge: ModelRole;
}

interface ProfileDocument {
  readonly schemaVersion: number;
  readonly set: string;
  readonly defaultProfile: string;
  readonly profiles: Readonly<Record<string, ModelProfile>>;
}

const document = JSON.parse(readRepoFile("evals/model-profiles-v1.json")) as ProfileDocument;
const profiles = Object.entries(document.profiles);
const baseId = (id: string): string => id.replace(/\[[^\]]+\]$/, "");
const grading = (text: string): string => text.slice(text.indexOf("## Verdict vocabulary\n"));

describe("eval model profiles", () => {
  it("keeps the Claude instrument as the default with its original explicit model pins", () => {
    expect(document.schemaVersion).toBe(1);
    expect(document.set).toBe(SET_FILE);
    expect(document.defaultProfile).toBe("claude");
    expect(document.profiles[document.defaultProfile]).toEqual({
      harness: "claude-code",
      rubric: RUBRIC_FILE,
      scenario: { model: "claude-opus-5", reasoningEffort: null },
      judge: { model: "claude-fable-5-1", reasoningEffort: null },
    });
  });

  it("supports Astra in either role with a distinct Codex model in the other role", () => {
    expect(document.profiles["codex-astra"]).toEqual({
      harness: "codex",
      rubric: "evals/rubric-v5.md",
      scenario: { model: "gpt-6-astra", reasoningEffort: "high" },
      judge: { model: "gpt-5.6-sol", reasoningEffort: "high" },
    });
    expect(document.profiles["codex-astra-judge"]).toEqual({
      harness: "codex",
      rubric: "evals/rubric-v5.md",
      scenario: { model: "gpt-5.6-sol", reasoningEffort: "high" },
      judge: { model: "gpt-6-astra", reasoningEffort: "high" },
    });
  });

  it("never declares a judge that is the model under test, even with a context-window suffix", () => {
    expect(profiles.length).toBeGreaterThan(1);
    for (const [name, profile] of profiles) {
      expect(baseId(profile.scenario.model), name).not.toBe(baseId(profile.judge.model));
      for (const role of [profile.scenario, profile.judge]) {
        expect(role.model, name).toMatch(/^(?:claude-|gpt-)\S+$/);
        expect(role.model, name).not.toMatch(/\b(?:latest|auto|inherit)\b/);
      }
    }
  });

  it("resolves each declared rubric to a sealed grading core and calibration fixtures", () => {
    for (const [name, profile] of profiles) {
      const rubric = readRepoFile(profile.rubric);
      const [core, calibration, unexpected] = rubric.split("## Calibration protocol\n");
      expect(unexpected, name).toBeUndefined();
      expect(core, name).toContain("## Grading procedure");
      expect(core, name).not.toMatch(/^### Fixture C|^Expected verdict:/m);
      expect(calibration?.match(/^### Fixture C/gm)?.length, name).toBeGreaterThan(0);
    }
  });

  it("preserves the grading procedure and every calibration label when adding a model-neutral rubric", () => {
    const legacy = readRepoFile(RUBRIC_FILE);
    const alternate = readRepoFile("evals/rubric-v5.md");
    expect(alternate).toContain("## Verdict vocabulary\n");
    expect(grading(alternate)).toBe(grading(legacy));
    expect(alternate.split("## Calibration protocol\n")[0]).not.toMatch(/claude-|gpt-/);
  });
});
