import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { corpusFileOf, walkAllMarkdown, type CorpusFile } from "../harness.ts";

/**
 * The four verdict roles — reviewer, security, performance, design-quality — as a contract
 * over their report write, findings block and digest (REQ-CTX-002, REQ-CTX-003, REQ-CTX-004,
 * REQ-CTX-005, REQ-CTX-008).
 *
 * What this suite binds:
 *
 *   - **The one write is named before the first section.** Each body is read-only; the head
 *     names the single exception, the role's own report file, and only where the client
 *     grants the write. The grant itself stays `capabilities: [read]` — the write is a
 *     client-side path allowance, not a new capability — so the frontmatter is re-pinned here.
 *   - **The Return contract carries the two-tier shape.** A `stamity-findings` block with its
 *     `decision_needed` field and its 300-character summary cap; the report written to the
 *     dispatch's exact path; a digest whose 1,500-character cap binds the prose; and the
 *     three never-digested exits (no report path or a refused write → inline, a `BLOCKED_*`
 *     return → no report and no findings block). Each is one sentence the orchestrator and the
 *     ledger verb rely on, so each is asserted.
 *   - **Each role's digest names its own labelled lines.** The reviewer's `verdict:` and
 *     `confidence:` (the review gate parses them), a lens's `mode:` and posted count, and the
 *     two role-specific payloads: security returns every finding in full, performance keeps
 *     its `method:` rows and reports a breached budget.
 *   - **A re-review answers every prior id** in a `stamity-closures` block with the five
 *     statuses (REQ-CTX-008).
 *
 * Prose assertions run against a whitespace-collapsed view, so a reflowed sentence is not a
 * failure. The sentence checks go through one helper, {@link returnContractGaps}, and a
 * fixture proves the helper can go red.
 */

interface VerdictRole {
  readonly id: string;
  readonly relPath: string;
  /** Role-specific phrases the Return contract must also carry, whitespace-collapsed. */
  readonly digestLines: readonly string[];
}

/** The phrases every verdict role's Return contract carries, whitespace-collapsed. */
const SHARED_RETURN_PHRASES: readonly string[] = [
  "`stamity-findings`",
  "`decision_needed`",
  "at most 300 characters",
  "a `BLOCKED_*` return carries none",
  "exact path and nowhere else",
  "at most 1,500 characters of prose",
  "writes no report and is returned in full",
  "returned inline and a refused write says so",
  "`contract delta: none`",
];

/** The sentence each body states before its first top-level section. */
const HEAD_WRITE_SENTENCE = "Its one write, where the client grants one, is its own report file";

/** The three lenses share the posted-or-advisory mode line. */
const LENS_LINES: readonly string[] = ["`mode:`", "posted count"];

const VERDICT_ROLES: readonly VerdictRole[] = [
  {
    id: "reviewer",
    relPath: "agents/stamity-reviewer.md",
    digestLines: ["`verdict:`", "`confidence:` with its basis word"],
  },
  {
    id: "security",
    relPath: "agents/stamity-security.md",
    digestLines: [...LENS_LINES, "every finding of this run in full"],
  },
  {
    id: "performance",
    relPath: "agents/stamity-performance.md",
    digestLines: [
      ...LENS_LINES,
      "whether a declared budget was breached",
      "every `method:` row",
    ],
  },
  {
    id: "design-quality",
    relPath: "agents/stamity-design-quality.md",
    digestLines: [...LENS_LINES],
  },
];

/** The five statuses a re-review closure may carry (C9). */
const CLOSURE_STATUSES: readonly string[] = [
  "`fixed`",
  "`not-fixed`",
  "`regressed`",
  "`rejection-upheld`",
  "`rejection-overturned`",
];

const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** Collapse every whitespace run, so a wrapped sentence still reads as one. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * The text of a top-level `## <heading>` section, up to the next top-level heading, or
 * `undefined` when the body has no such section.
 */
function sectionOf(file: CorpusFile, heading: string): string | undefined {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  if (start === -1) {
    return undefined;
  }
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** The body before its first top-level `## ` heading. */
function headOf(file: CorpusFile): string {
  const body = file.parsed.body;
  const end = body.indexOf("\n## ");
  return end === -1 ? body : body.slice(0, end);
}

/**
 * Every required phrase the file's Return contract lacks, in order; empty when the contract
 * is whole. A missing section is itself a gap, so the helper never passes on absence.
 */
function returnContractGaps(file: CorpusFile, required: readonly string[]): string[] {
  const contract = sectionOf(file, "Return contract");
  if (contract === undefined) {
    return ["## Return contract"];
  }
  const text = collapse(contract);
  return required.filter((phrase) => !text.includes(phrase));
}

describe("verdict roles — the one write is named in the head", () => {
  it.each(VERDICT_ROLES)("$id names its report write before its first section", async (role) => {
    const file = await load(role.relPath);

    expect(collapse(headOf(file))).toContain(HEAD_WRITE_SENTENCE);
  });

  it.each(VERDICT_ROLES)("$id keeps the read-only grant in frontmatter", async (role) => {
    const file = await load(role.relPath);

    // The report write is a client path allowance scoped to the role's own report file,
    // not a capability: the grant the roster mirrors stays read-only.
    expect(frontmatterField(file.parsed, "capabilities")).toEqual(["read"]);
  });
});

describe("verdict roles — the Return contract carries the findings block and the digest", () => {
  it.each(VERDICT_ROLES)("$id states every shared return sentence", async (role) => {
    const file = await load(role.relPath);

    expect(returnContractGaps(file, SHARED_RETURN_PHRASES)).toEqual([]);
  });

  it.each(VERDICT_ROLES)("$id names its own labelled digest lines", async (role) => {
    const file = await load(role.relPath);

    expect(returnContractGaps(file, role.digestLines)).toEqual([]);
  });

  it.each(VERDICT_ROLES)(
    "$id carries the findings block, then the digest, after the existing bullets",
    async (role) => {
      // Both bullets close the section, so the status enum and the BLOCKED_* payload stay
      // the first thing a reader of the contract meets.
      const contract = collapse(sectionOf(await load(role.relPath), "Return contract") ?? "");
      const findings = contract.indexOf("**The findings block.**");
      const digest = contract.indexOf("**Report and digest.**");

      expect(findings, `${role.id}: no findings-block bullet`).toBeGreaterThan(
        contract.indexOf("**status:**"),
      );
      expect(digest, `${role.id}: digest bullet before the findings block`).toBeGreaterThan(
        findings,
      );
    },
  );

  it("marks every security finding as security-relevant", async () => {
    const contract = collapse(
      sectionOf(await load("agents/stamity-security.md"), "Return contract") ?? "",
    );

    expect(contract).toContain("`security` set true on every row this agent raises");
  });
});

describe("reviewer — a re-review answers every prior id", () => {
  it("names the closures block, its five statuses, and the read line", async () => {
    const nit = collapse(sectionOf(await load("agents/stamity-reviewer.md"), "Nit policy") ?? "");

    expect(nit).toContain("`stamity-closures`");
    for (const status of CLOSURE_STATUSES) {
      expect(nit, `Nit policy: no ${status} status`).toContain(status);
    }
    expect(nit).toContain("`read: <files>; lenses: <list>`");
  });
});

describe("returnContractGaps — the helper goes red", () => {
  const whole = [
    "---",
    "id: fixture",
    "type: agent",
    "---",
    "",
    "# fixture",
    "",
    "## Return contract",
    "",
    `- ${SHARED_RETURN_PHRASES.join("; ")}.`,
    "",
  ].join("\n");

  it("passes the whole fixture", () => {
    const file = corpusFileOf("agents/stamity-fixture.md", whole);

    expect(returnContractGaps(file, SHARED_RETURN_PHRASES)).toEqual([]);
  });

  it("names the BLOCKED clause when a contract drops it", () => {
    const dropped = whole.replace("a `BLOCKED_*` return carries none; ", "");
    const file = corpusFileOf("agents/stamity-fixture.md", dropped);

    expect(dropped).not.toBe(whole);
    expect(returnContractGaps(file, SHARED_RETURN_PHRASES)).toEqual([
      "a `BLOCKED_*` return carries none",
    ]);
  });

  it("names the section when the body has no Return contract", () => {
    const file = corpusFileOf(
      "agents/stamity-fixture.md",
      whole.replace("## Return contract", "## Something else"),
    );

    expect(returnContractGaps(file, SHARED_RETURN_PHRASES)).toEqual(["## Return contract"]);
  });
});
