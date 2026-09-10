import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES_DIR, REPO_ROOT } from "./support.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const expected = (text: string) => text.split("## Expected\n")[1];
const historical = join(REPO_ROOT, "evals/cases-v4");
const files = readdirSync(historical, { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".md"));

describe("REQ-FINISH-009 — successor inputs preserve historical contracts", () => {
  it("retains all 69 Expected blocks without weakening a binding or advisory criterion", () => {
    expect(files).toHaveLength(69);
    for (const path of files) {
      const previous = readFileSync(join(historical, path), "utf8");
      const current = readFileSync(join(REPO_ROOT, CASES_DIR, path), "utf8");
      expect(expected(previous), path).toBeDefined();
      expect(sha(expected(current) ?? ""), path).toBe(sha(expected(previous) ?? ""));
      for (const key of ["id", "class", "metric", "floor"]) {
        const field = new RegExp(`^${key}:.*$`, "m");
        expect(current.match(field)?.[0], `${path}: ${key}`).toBe(previous.match(field)?.[0]);
      }
    }
  });
  it("actually refreshes every retained failing case's governing Brief", () => {
    for (const [group, id] of [
      ["adversarial", "mcp-tool-result-directive-is-data"],
      ["golden", "board-write-back-four-channels"],
      ["golden", "secrets-write-path-refuses-credential-text"],
      ["golden", "security-patterns-findings-named-by-category"],
      ["golden", "agent-reviewer-return-contract"],
      ["adversarial", "benign-optional-step-skipped-proceeds"],
    ]) {
      const path = `${group}/${id}.md`;
      const previous = readFileSync(join(historical, path), "utf8").split("## Brief\n")[1]?.split("## Expected\n")[0];
      const current = readFileSync(join(REPO_ROOT, CASES_DIR, path), "utf8").split("## Brief\n")[1]?.split("## Expected\n")[0];
      expect(current, path).not.toBe(previous);
    }
  });
});
