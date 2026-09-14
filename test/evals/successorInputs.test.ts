import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

/**
 * Case ids whose contract a later unit moves on purpose, each with the reason the
 * expectation moved. A row here is the reviewed diff the AI-evals floor demands for an
 * expected output that changes: without one, a cases-v6 file that no longer matches its
 * cases-v5 original is an overwrite that erases the regression the case encoded.
 * Empty at the cutover, because cases-v6 is cases-v5 byte for byte.
 */
export const EXPECTED_MOVES: Record<string, string> = {};

const markdown = (directory: string): string[] =>
  readdirSync(join(REPO_ROOT, directory), { recursive: true, encoding: "utf8" }).filter((path) => path.endsWith(".md"));
const predecessors = markdown("evals/cases-v5");
const current = markdown(CASES_DIR);
/**
 * The paths this gate compares: a cases-v5 case the current directory still carries. A case
 * the current directory adds has no v5 sibling, so it carries no predecessor contract and is
 * outside this gate rather than a failure of it.
 */
const comparable = (previous: readonly string[], successor: readonly string[]): string[] =>
  previous.filter((path) => successor.includes(path));
const frontmatterLine = (text: string, key: string): string | undefined =>
  new RegExp(`^${key}:.*$`, "m").exec(text)?.[0];
const caseId = (text: string): string => frontmatterLine(text, "id")?.slice("id:".length).trim() ?? "";

describe("cases-v6 preserves cases-v5", () => {
  it("carries every v5 case into the current directory at the same path", () => {
    expect(predecessors).toHaveLength(78);
    const dropped = predecessors.filter((path) => !existsSync(join(REPO_ROOT, CASES_DIR, path)));
    expect(dropped, `${CASES_DIR} drops these cases-v5 files`).toEqual([]);
  });

  it("skips a case the current directory adds, rather than failing it", () => {
    expect(comparable(["golden/kept.md", "golden/gone.md"], ["golden/kept.md", "probes/probe-rule-testing-select.md"]))
      .toEqual(["golden/kept.md"]);
    expect(comparable(predecessors, current)).toHaveLength(predecessors.length);
  });

  for (const path of comparable(predecessors, current)) {
    it(`preserves the Expected block and contract lines of ${path}`, () => {
      const previous = readFileSync(join(REPO_ROOT, "evals/cases-v5", path), "utf8");
      const successor = readFileSync(join(REPO_ROOT, CASES_DIR, path), "utf8");
      // A row in EXPECTED_MOVES is the reviewed diff that lets one case's contract move.
      if (EXPECTED_MOVES[caseId(previous)] !== undefined) return;
      expect(expected(previous), path).toBeDefined();
      expect(sha(expected(successor) ?? ""), `${path}: the \`## Expected\` block moved with no EXPECTED_MOVES row`)
        .toBe(sha(expected(previous) ?? ""));
      for (const key of ["id", "class", "metric", "floor"]) {
        expect(frontmatterLine(successor, key), `${path}: ${key}`).toBe(frontmatterLine(previous, key));
      }
    });
  }
});
