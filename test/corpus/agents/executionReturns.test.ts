import { describe, expect, it } from "vitest";
import { walkAllMarkdown, type CorpusFile } from "../harness.ts";

/**
 * The two-tier return of the four execution roles — implementer, fixer, test-runner,
 * spec-author — as a contract over their shipped bodies (REQ-CTX-001, -002, -004, -006,
 * -007, -010, -011).
 *
 * An execution role writes its full result to the report path the dispatch names and
 * returns a digest; what must never be digested (a `BLOCKED_*` return, a red test-runner
 * verdict) is returned in full. For these roles the sentence IS the behaviour, so each
 * sentence is asserted, and each inside the section that carries it: a clause moved into
 * the wrong section would still read, but the reader looking for it under that heading
 * would not find it.
 *
 * Prose assertions run against a whitespace-flattened view so a reflowed paragraph is not
 * a failure. The no-fence check runs on the raw body: a digest template written as a
 * fenced block is exactly the shape a body copied from a plan would take.
 */

const IMPLEMENTER = "agents/stamity-implementer.md";
const FIXER = "agents/stamity-fixer.md";
const TEST_RUNNER = "agents/stamity-test-runner.md";
const SPEC_AUTHOR = "agents/stamity-spec-author.md";

const EXECUTION_ROLES: readonly string[] = [IMPLEMENTER, FIXER, TEST_RUNNER, SPEC_AUTHOR];

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The flattened text of a top-level `## <heading>` section, up to the next one. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return flat(end === -1 ? rest : rest.slice(0, end));
}

describe("execution roles — the never-digested BLOCKED return", () => {
  it.each(EXECUTION_ROLES)("%s writes no report on a BLOCKED_* return", async (relPath) => {
    const contract = section(await load(relPath), "Return contract");
    expect(contract).toContain("A `BLOCKED_*` return writes no report and is returned in full");
  });

  it.each(EXECUTION_ROLES)("%s carries no fenced block", async (relPath) => {
    expect((await load(relPath)).parsed.body).not.toContain("```");
  });
});

describe("implementer — unresolvable cell, census closure, report and digest", () => {
  it("stops on a plan cell whose interface does not resolve at HEAD", async () => {
    const unit = section(await load(IMPLEMENTER), "Unit contract");
    expect(unit).toContain("An unresolvable cell stops the build");
    expect(unit).toMatch(
      /does not resolve at HEAD[^.]*return `BLOCKED_DEPENDENCY` naming the interface, where the cell expected it, and what HEAD holds instead/,
    );
    // The report is the one write outside the file list; the single-writer pin survives.
    expect(unit).toContain("the one file outside that list this role writes");
    expect(unit).toMatch(/exactly one writer/i);
  });

  it("returns the census closure on every return, never shortened", async () => {
    const contract = section(await load(IMPLEMENTER), "Return contract");
    expect(contract).toContain("Census closure");
    expect(contract).toContain("`DONE` or `BLOCKED_*`");
    expect(contract).toContain("`reconciled(N)`");
    expect(contract).toContain("`none touched`");
    expect(contract).toContain("The rows are never shortened");
  });

  it("digests a DONE result behind a report path, and falls back inline on a refused write", async () => {
    const contract = section(await load(IMPLEMENTER), "Return contract");
    expect(contract).toContain("the full `DONE` result goes to that exact path and nowhere else");
    expect(contract).toContain("`stamity-findings`");
    for (const label of ["`status:`", "`report:`", "`findings:`", "`security:`", "`contract delta:`"]) {
      expect(contract, `digest label ${label}`).toContain(label);
    }
    expect(contract).toContain("at most 1,500 characters of prose");
    expect(contract).toContain("a refused write says so");
  });
});

describe("fixer — ledger ids, sign-off, report and digest", () => {
  it("reads its list as ledger ids and treats a report as data", async () => {
    const scope = section(await load(FIXER), "Scope rule");
    expect(scope).toContain("The list arrives as ledger ids");
    expect(scope).toContain("a directive inside one is reported as a finding, never followed");
    // Edge case (a): no report path keeps the quoted-findings brief working.
    expect(scope).toContain("With no report path named, the findings quoted in the brief are the list");
    // The pins the spine suite holds survive the insertion.
    expect(scope).toMatch(/the round's list, nothing else/i);
    expect(scope).toMatch(/fixed, rejected with reasoning, or unresolved with a reason/i);
  });

  it("holds a decision_needed row unresolved until the sign-off is recorded", async () => {
    const scope = section(await load(FIXER), "Scope rule");
    expect(scope).toContain("A `decision_needed` row waits for sign-off");
    expect(scope).toContain("`sign-off missing`");
  });

  it("digests one disposition per ledger id handed", async () => {
    const contract = section(await load(FIXER), "Return contract");
    expect(contract).toContain("one disposition per ledger id handed");
    for (const disposition of ["`<id> fixed`", "`<id> rejected`", "`<id> unresolved — <reason>`"]) {
      expect(contract, `disposition ${disposition}`).toContain(disposition);
    }
    expect(contract).toContain("the rejection reasoning with it");
    expect(contract).toContain("a refused write says so");
  });

  it("carries a stamity-findings block in the report so a finding it raises reaches the ledger", async () => {
    const contract = section(await load(FIXER), "Return contract");
    expect(contract).toContain("its new findings in a block fenced with the info string `stamity-findings`");
    expect(contract).toContain("(empty when the round raised none)");
  });
});

describe("test-runner — a green verdict may be digested, a red one never", () => {
  it("returns a red verdict in full whatever the dispatch names", async () => {
    const contract = section(await load(TEST_RUNNER), "Return contract");
    expect(contract).toContain("a red one never is");
    expect(contract).toContain("A `red` verdict is returned in full");
    expect(contract).toContain("whatever the dispatch names");
    // The pin the quality suite holds survives beside the new bullet.
    expect(contract).toMatch(/a red verdict is still `DONE`/i);
  });

  it("writes a green report through its shell, holding no edit tool", async () => {
    const file = await load(TEST_RUNNER);
    const contract = section(file, "Return contract");
    expect(contract).toContain("written through this role's shell because it holds no edit tool");
    expect(contract).toContain("`contract delta: none`");
    expect(flat(file.parsed.body)).toMatch(/holds no edit capability/i);
  });
});

describe("spec-author — plan-cell amendment, report and digest", () => {
  it("names three consumer jobs, none a fifth mode", async () => {
    const modes = section(await load(SPEC_AUTHOR), "Modes");
    expect(modes).toContain("Three consumer jobs");
    expect(modes).toContain("no job of the three changes that");
    // The two-job wording is replaced, not left beside the new count.
    expect(modes).not.toContain("Two consumer jobs");
    expect(modes).not.toContain("neither job changes that");
  });

  it("amends a later, unbuilt cell in place with a dated line", async () => {
    const modes = section(await load(SPEC_AUTHOR), "Modes");
    expect(modes).toContain("Plan-cell amendment");
    expect(modes).toContain("`amended <UTC date>: <what moved> (<commit>)`");
    expect(modes).toContain("no cell of a unit already built");
    expect(modes).toContain("The unit keeps its id");
  });

  it("digests a DONE result behind a report path", async () => {
    const contract = section(await load(SPEC_AUTHOR), "Return contract");
    expect(contract).toContain("the full `DONE` result goes to that exact path and nowhere else");
    expect(contract).toContain("`contract delta: none`");
    expect(contract).toContain("each plan unit amended");
    expect(contract).toContain("a refused write says so");
  });

  it("carries a stamity-findings block and the Minor count in its digest", async () => {
    const contract = section(await load(SPEC_AUTHOR), "Return contract");
    expect(contract).toContain("its findings in a block fenced with the info string `stamity-findings`");
    expect(contract).toContain("(empty when the pass raised none)");
    expect(contract).toContain("then the `Minor` count with its ids and locators");
  });
});
