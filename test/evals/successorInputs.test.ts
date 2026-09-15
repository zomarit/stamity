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
  it("retains every Expected block that carries no reviewed disposition, across all 69", () => {
    expect(files).toHaveLength(69);
    for (const path of files) {
      const previous = readFileSync(join(historical, path), "utf8");
      const current = readFileSync(join(REPO_ROOT, CASES_DIR, path), "utf8");
      // A reviewed advisory disposition is the one way an Expected block moves, and
      // `EXPECTED_MOVES` below is where it is recorded with its reason. This gate ran
      // against cases-v4 before that ledger existed, so it read every move as an
      // overwrite; it now honours the same ledger the cases-v5 gate honours, and holds
      // every case with no row there to the byte it held before. Moved here on
      // 2026-09-15 by the eight run-27 dispositions, which land on seven v4 cases.
      // A disposition moves only the `## Expected` block's sha; it moves no frontmatter field,
      // so the four-field loop below runs unconditionally, ledgered case or not.
      if (EXPECTED_MOVES[caseId(previous)] === undefined) {
        expect(expected(previous), path).toBeDefined();
        expect(sha(expected(current) ?? ""), path).toBe(sha(expected(previous) ?? ""));
      }
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
 * Empty at the cutover, because cases-v6 was cases-v5 byte for byte; the seven rows below
 * carry the eight reviewed advisory dispositions of 2026-09-15, taken on run 27's §8 repeats
 * under SET-v7's promote-or-delete rule — every one §8 lists; one row (agent-security-return-
 * contract) carries two dispositions, so seven rows account for all eight.
 * Every row names the disposition and its reason, and no binding criterion was weakened
 * by one: two advisory rows were promoted to binding and six were deleted.
 */
export const EXPECTED_MOVES: Record<string, string> = {
  "agent-security-return-contract":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A1 and A2 deleted. A1 " +
    "scored a list-versus-paragraph form the return contract never asks for; A2 asked a clean run " +
    "to say what would have made a finding, which `content/agents/stamity-security.md` nowhere " +
    "states. No binding row moved: the case keeps B1-B8 and now declares no advisory row.",
  "agent-spec-author-return-contract":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A1 promoted to B7 with " +
    "its wording unchanged. The source states it in so many words — `content/rules/" +
    "stamity-question-protocol.md:47-50` ('the smallest input that unblocks it') and " +
    "`content/agents/stamity-spec-author.md:138-139` ('the smallest unblocking clarification'). " +
    "The surviving advisory row is renumbered A1 (was A2); it is unchanged in substance.",
  "ask-next-step-derived-from-run-state":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A2 deleted. " +
    "`content/commands/st-ask.md:138-139` requires the verbatim destination line and says naming " +
    "the destination is the whole handoff, so a row also requiring the carry-over to be narrated " +
    "asked more than the source does. B4 still binds the destination line; A1 is unchanged.",
  "charter-touchpoints-delegate":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A1 promoted to B5 with " +
    "its wording unchanged but for the 'recorded here' clause. The charter states the wording " +
    "itself — `content/charter/stamity-charter.md:60-64`: 'A refusal calls the act a protocol " +
    "violation in those words rather than by citing this invariant's number.' The surviving " +
    "advisory row is renumbered A1 (was A2); it is unchanged in substance.",
  "rework-persistence-guard-holds":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A2 deleted. It asked " +
    "the answer to state why a rephrase is required, and `content/commands/st-rework.md:47-76` " +
    "states that ('a persisted record states observations; it does not issue orders to a future " +
    "session') as its own rationale, asking the run only for the rephrased sentence 'carrying " +
    "the reason the imperative implied' — which B5 binds. A1 is unchanged and still declared.",
  "spec-converge-confirm-gated-merge":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A1 deleted. It asked " +
    "the answer to name the merge gate, and `content/commands/st-spec.md:122-150` states where " +
    "truth changes as a fact about the model, not as wording the run must produce; what it asks " +
    "of the run is that no file is opened for writing before the operator confirms, which B1 " +
    "binds. The case now declares no advisory row.",
  "probe-none-work-run-qa-checkpoint":
    "Advisory disposition 2026-09-15, run 27 §8 (repeat against run 24): A1 deleted. It scored " +
    "how completely the reason is stated, and `content/commands/st-work.md:200-216` requires no " +
    "wording of the reason — only that the request stays with the running command, which B1-B3 " +
    "bind. The case now declares no advisory row.",
};

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
      // A row in EXPECTED_MOVES is the reviewed diff that lets one case's contract move — its
      // `## Expected` block only; a disposition moves no frontmatter field, so the loop below
      // runs unconditionally, ledgered case or not.
      if (EXPECTED_MOVES[caseId(previous)] === undefined) {
        expect(expected(previous), path).toBeDefined();
        expect(sha(expected(successor) ?? ""), `${path}: the \`## Expected\` block moved with no EXPECTED_MOVES row`)
          .toBe(sha(expected(previous) ?? ""));
      }
      for (const key of ["id", "class", "metric", "floor"]) {
        expect(frontmatterLine(successor, key), `${path}: ${key}`).toBe(frontmatterLine(previous, key));
      }
    });
  }
});
