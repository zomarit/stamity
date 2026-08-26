import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractToolsFrontmatter, frontmatterField } from "../../../src/content/frontmatter.ts";
import { scanAntiSlop } from "../../../src/denyscan/denyScan.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../../src/emit/substitution.ts";
import {
  CORPUS_ROOT,
  assertDenyClean,
  assertLineCap,
  corpusFileOf,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  type CorpusFile,
} from "../harness.ts";

/**
 * `/stamity-spec` — the spec touchpoint's corpus contract.
 *
 * Three things bind here, and only here, at file granularity: the frontmatter
 * head and its command discriminator (a command orchestrates at least one
 * sub-agent, so `spawns` is non-empty and every named role is a real agent);
 * the design decisions the artifact must carry as text (mode dispatch, the
 * sync tiers, the drift taxonomy, the four edge cases the design calls out);
 * and the register gates (line cap, deny scan, dropped vocabulary). Corpus-wide
 * census and cross-class invariants belong to the corpus-invariant suite —
 * this one fails with the artifact named and the missing clause quoted.
 *
 * Phrase assertions run against whitespace-normalized prose, so a clause that
 * wraps across two source lines still matches and re-flowing the markdown is
 * never a false failure.
 */

/** Corpus-relative path of the artifact under test. */
const COMMAND_PATH = "commands/stamity-spec.md";

/** Body-line cap for a command artifact. */
const COMMAND_BODY_MAX_LINES = 500;

/** The agent roster a command's `spawns` may name. */
const AGENT_CENSUS: readonly string[] = [
  "researcher",
  "implementer",
  "reviewer",
  "fixer",
  "test-runner",
  "spec-author",
  "creator",
];

/** The nine SDLC touchpoints; a `/stamity-*` mention outside this set is a dangling reference. */
const COMMAND_CENSUS: readonly string[] = [
  "spec",
  "plan",
  "work",
  "board",
  "ask",
  "debug",
  "quick",
  "rework",
  "pr-resolve",
];

/** Mandated section skeleton, as an ordered subsequence of the `#`/`##` headings. */
const SKELETON: readonly string[] = [
  "# /stamity-spec",
  "## Mode dispatch",
  "## Greenfield vs brownfield detection",
  "## Artifact model",
  "## Sync tiers",
  "## Spec format",
  "## API leg",
  "## Return contract",
];

/** The four dispatch verbs. */
const VERBS: readonly string[] = ["create", "extract", "check", "sync"];

/** The four API drift classes. */
const DRIFT_CLASSES: readonly string[] = ["Matching", "Undocumented", "Stale", "Drifted"];

/**
 * The predecessor family's DROP list, as a regression grep. Each row died with
 * a reason: consulting-deck output and scorecard ceremony are not spec work,
 * the template libraries were ~1,600 lines of embedded boilerplate, the session
 * cache and per-command protocol closers were run-machinery the successor does
 * not carry. Acronym rows are case-sensitive so ordinary prose cannot trip them.
 */
const DROPPED_VOCABULARY: readonly (readonly [string, RegExp])[] = [
  ["total addressable market", /\bTAM\b/],
  ["serviceable addressable market", /\bSAM\b/],
  ["serviceable obtainable market", /\bSOM\b/],
  ["go-to-market", /\bGTM\b|\bgo[- ]to[- ]market\b/i],
  ["pricing consulting output", /\bpricing\b/i],
  ["market sizing / research deliverable", /\bmarket (?:sizing|research)\b/i],
  ["competitive analysis deliverable", /\bcompetitive analysis\b/i],
  ["A-F scorecard ceremony", /\bscorecard\b|\bgrade [A-F]\b/i],
  ["session cache", /\bsession cache\b/i],
  ["embedded template library", /\btemplate librar/i],
  ["per-command protocol closer", /\biteration summary\b|\bcost_estimate\b|\bcost_actuals\b/i],
  ["dual entry point", /\bdual entry point/i],
];

/** Content artifacts mint no product URLs or domains. */
const URL_OR_DOMAIN = /https?:\/\/|www\./i;

/** Model-Independence Contract: shipped content names no vendors or models. */
const VENDOR_OR_MODEL_NAMES =
  /\b(?:claude|cursor|copilot|codex|anthropic|openai|gemini|gpt|llama|mistral)\b/i;

/** Read once for the whole suite; a missing artifact rejects every case by path. */
const artifact: Promise<CorpusFile> = readFile(join(CORPUS_ROOT, COMMAND_PATH), "utf8").then(
  (raw) => corpusFileOf(COMMAND_PATH, raw),
);

/** Body with every whitespace run collapsed — line wrapping is not semantics. */
async function prose(): Promise<string> {
  return (await artifact).parsed.body.replace(/\s+/g, " ");
}

/** The `#` and `##` headings, in document order; `###` sub-headings are not skeleton. */
function headings(body: string): string[] {
  return [...body.matchAll(/^#{1,2} .+$/gm)].map((match) => match[0].trim());
}

describe("/stamity-spec — frontmatter contract", () => {
  it("declares the command identity head, on-demand load class, and deletion trigger", async () => {
    const file = await artifact;
    const field = (name: string): unknown => frontmatterField(file.parsed, name);

    expect(field("id")).toBe("spec");
    expect(field("id")).toBe(filenameSlug(COMMAND_PATH));
    expect(field("type")).toBe("command");
    expect(field("tags")).toEqual(["planning"]);

    const description = field("description");
    expect(description).toBeTypeOf("string");
    expect(description as string).not.toBe("");
    expect(description as string).not.toMatch(/\byou(?:r|rs|rself)?\b/i);

    expect(() => requireLoadClass(file, ["on-demand"])).not.toThrow();
    expect(() => requireObsoleteWhen(file)).not.toThrow();
    // Engine-reserved key: absent means the artifact ships to every target tool.
    expect(extractToolsFrontmatter(file.raw, COMMAND_PATH)).toBeUndefined();
  });

  it("satisfies the command discriminator: spawns the researcher, spec-author and runner roles", async () => {
    const spawns = frontmatterField((await artifact).parsed, "spawns");

    // TEST CHANGE, justified: the roster gained `test-runner`. `check` mode's
    // testability census confirms a criterion by running the repo's test gate, and
    // the body declared its spawns read-only — so the gate had nowhere to run but
    // this command's own context. Nothing is relaxed: the set is still exact.
    expect(spawns).toEqual(["researcher", "spec-author", "test-runner"]);
    // A command orchestrates at least one sub-agent, and every named role exists.
    expect(spawns as string[]).not.toHaveLength(0);
    for (const role of spawns as string[]) {
      expect(AGENT_CENSUS).toContain(role);
    }
  });
});

describe("/stamity-spec — body skeleton", () => {
  it("carries the mandated sections in order", async () => {
    const found = headings((await artifact).parsed.body);

    // Subsequence match: extra sections are allowed, reordering and omission are not.
    let cursor = 0;
    for (const heading of SKELETON) {
      const at = found.indexOf(heading, cursor);
      expect(at, `missing or out of order: "${heading}" in ${found.join(" | ")}`).toBeGreaterThan(-1);
      cursor = at + 1;
    }
    expect(found[0]).toBe("# /stamity-spec");
  });
});

describe("/stamity-spec — design decisions carried as text", () => {
  it("emits a mode-chosen line with its evidence clause", async () => {
    const text = await prose();

    expect(text).toContain("mode chosen:");
    expect(text).toContain("mode chosen: <verb> because <evidence>");
  });

  it("names all four dispatch verbs, and states that an explicit verb wins over detection", async () => {
    const text = await prose();

    for (const verb of VERBS) {
      expect(text, `verb \`${verb}\` is not offered as a mode`).toContain(`\`${verb}\``);
    }
    expect(text).toMatch(/explicit verb[^.]*wins over the detected state/i);
  });

  it("breaks the tie when two mode rows match the same repo state", async () => {
    const text = await prose();

    // The entry decision was non-deterministic: a brownfield repo with tests and no
    // `docs/specs/` satisfies the create row AND the extract row, and no rule said
    // which won — in a command that stops when it cannot name its evidence. The
    // tiebreak is declared, the losing row is reported, and the explicit verb is the
    // documented way to pick the other one.
    expect(text).toMatch(/Rows are read top to bottom and the \*\*first match wins\*\*/);
    expect(text).toMatch(
      /brownfield repo with a test suite and no `docs\/specs\/` matches the\s*`create` row and the `extract` row both, and `create` takes it/,
    );
    expect(text).toMatch(/mode-chosen line names the row that was beaten/i);
  });

  it("names a home for every greenfield output, inside the seven sections or outside the spec", async () => {
    const text = await prose();

    // Greenfield promised outputs the format contract has no section for, and the
    // writing agent enumerates the identical seven — so personas, the test plan, the
    // resolved-clarification record and the stack trade-off table had nowhere to land.
    expect(text).toMatch(/The spec format below closes at seven sections/);
    expect(text).toMatch(/Intent, personas \| \*\*Intent\*\*/);
    expect(text).toMatch(/Test plan \| \*\*Acceptance criteria\*\* plus one `test` pointer/);
    expect(text).toMatch(/there is no separate test-plan section/i);
    expect(text).toMatch(/`Resolved clarifications`[^|]*\| an ADR stub under `docs\/adr\/`/);
    expect(text).toMatch(/Stack trade-off table[^|]*\| the same ADR stub/);
  });

  it("grades sync into three tiers with T2 confirm-gated and T3 never silent", async () => {
    const body = (await artifact).parsed.body;
    const text = await prose();

    for (const tier of ["T1", "T2", "T3"]) {
      expect(body, `sync tier ${tier} has no row`).toMatch(new RegExp(`^\\| ${tier} \\|`, "m"));
    }
    expect(text).toContain("Fully automatic");
    expect(text).toContain("confirm-gated, append/merge-only");
    expect(text).toContain("Never silent");
  });

  it("classifies API drift into the four-class taxonomy", async () => {
    const body = (await artifact).parsed.body;

    for (const drift of DRIFT_CLASSES) {
      expect(body, `drift class ${drift} is missing`).toMatch(new RegExp(`^\\| ${drift} \\|`, "m"));
    }
    // The code-form artifact is the contract; prose points at it.
    expect(await prose()).toMatch(/OpenAPI or AsyncAPI file \*\*is\*\* the api-spec\s*of record/);
  });

  it("makes the manifest the source of truth and blocks handoff on open clarifications", async () => {
    const text = await prose();

    expect(text).toContain("Deliverable Manifest");
    expect(text).toContain("manifest wins");
    expect(text).toContain("[NEEDS CLARIFICATION]");
    expect(text).toMatch(/a spec carrying one is not handed to `?\/stamity-work/i);
    // Deltas live in the plan artifact and merge into truth at work's Prove side effect.
    expect(text).toMatch(/`ADDED`, `MODIFIED`, `REMOVED`/);
    expect(text).toContain("Same-delivery mandate");
  });

  it("runs the testability census and the single-writer dispatch rule", async () => {
    const text = await prose();

    expect(text).toContain("Testability census");
    expect(text).toMatch(/machine-checkable[^.]*or\s+carries a `judgment:` tag/);
    expect(text).toMatch(/merge through a single writer/);
    // The suite is the normative record once it exists, and it cites what it covers.
    expect(text).toMatch(/normative spec of record for that requirement/);
    expect(text).toMatch(/Tests name the requirement id they cover/);
  });

  it("runs the census gate in a runner spawn rather than in its own context", async () => {
    const text = await prose();
    const body = (await artifact).parsed.body;

    // `check` mandated the repo test gate while declaring only read-only spawns, so
    // the gate ran in the orchestrator's context against the corpus's own rule.
    expect(body).toMatch(/^\| `test-runner` \|/m);
    expect(text).toMatch(/confirmed through a `test-runner` spawn running the repo's test\s*gate/);
    expect(text).toMatch(/structured per-gate result — the gate command,\s*pass or fail/);
    expect(text).toMatch(/never runs the gate in this\s*command's own context/);
    // Adding the runner adds no write path: it reports, and `check` stays report-only.
    expect(text).toMatch(/the runner\s*applies no edit, and this command writes nothing in that mode/);
  });

  it("names the spec-author mode on every dispatch row that writes", async () => {
    const body = (await artifact).parsed.body;

    // The command binds itself to no inline writes, yet brownfield day one produces
    // two artifacts outside `docs/specs/` — the codebase map and the ADR stubs — and
    // the brief named neither the mode that writes them nor which mode to ask for.
    for (const mode of ["greenfield", "brownfield", "architect", "docs"]) {
      expect(body, `dispatch row for spec-author \`${mode}\` mode is missing`).toMatch(
        new RegExp(`^\\| \`spec-author\` · \`${mode}\` \\|`, "m"),
      );
    }
    const text = await prose();
    expect(text).toMatch(/`spec-author` · `docs` \| `docs\/codebase-map\.md`/);
    expect(text).toMatch(/takes one mode per invocation and the brief names which/i);
  });

  it("states the return contract's status enums and severity scale", async () => {
    const text = await prose();

    for (const status of ["DONE", "BLOCKED_AMBIGUITY", "BLOCKED_DEPENDENCY", "BLOCKED_FAILURE"]) {
      expect(text, `status enum ${status} is missing`).toContain(status);
    }
    for (const severity of ["Critical", "Warning", "Minor"]) {
      expect(text, `severity ${severity} is missing`).toContain(severity);
    }
  });
});

describe("/stamity-spec — edge cases the design names", () => {
  it("bounds the greenfield interview to one round and marks what stays open", async () => {
    const text = await prose();

    expect(text).toMatch(/\*\*one\*\* clarification round/);
    expect(text).toContain("does not buy a second round");
    // An empty repo still produces a spec rather than an endless interview.
    expect(text).toMatch(/empty repo with no code and no answers still produces a spec/i);
    expect(text).toMatch(/interview stops at the round boundary/i);
  });

  it("refuses bulk backfill and requires an explicitly named scope", async () => {
    const text = await prose();

    expect(text).toContain("**No bulk backfill.**");
    expect(text).toMatch(/backfill request needs an explicitly named scope/i);
    // An ambiguous sweep request asks once and defaults to declining.
    expect(text).toMatch(/no named scope gets one question/i);
    expect(text).toContain("decline the sweep");
    expect(text).toMatch(/200k-line codebase/);
    // Comment corrected with the body it describes: day one is the regenerable
    // map, not a spec tree — and not the charter either, which the engine emits.
    // The assertion itself is unchanged; charter ownership is its own case below.
    expect(text).toMatch(/codebase-map\.md[^.]*inventory, not truth/);
  });

  it("leaves charter production to the engine — a spec run never writes it", async () => {
    const text = await prose();

    // Ownership, not phrasing: the charter is emitted at install and refreshed by
    // sync, so a body listing it as a day-one spec product would send users here
    // to fix a file this command cannot write, and would claim an output that
    // never appears in the run's manifest delta.
    expect(text).toMatch(/The charter is not this command's output/);
    expect(text).toMatch(/`AGENTS\.md` is emitted by `stamity init` and refreshed\s*by `stamity sync`/);
    // Relaxed from the earlier `docs/specs/ and that map, nothing else` pin. That clause
    // closed the whole output set, and this same body falsifies it: `create` and `extract`
    // also write ADR stubs under `docs/adr/` (Inferred ADR below), a specified capability.
    // The closure this case is about is the CHARTER, so the assertion scopes it there —
    // the write set is named, the exclusion binds one file, and the exhaustiveness claim
    // that the mechanism contradicts is gone.
    // UPDATED from `the ADR stubs it infers`: the ADR tree now also receives the
    // greenfield interview's resolved clarifications, which are decided rather than
    // inferred, so the write-set clause says `writes`. The closure this case is
    // about — the charter — is unchanged and still binds.
    expect(text).toMatch(
      /a spec run writes `docs\/specs\/`, that map, and the ADR\s*stubs it writes — never the charter/,
    );
    // Pinned together so the pair cannot drift apart: if the ADR mandate is ever dropped
    // the write set above becomes wrong, and this fails first with the reason.
    expect(text).toMatch(/it writes an ADR stub under `docs\/adr\/`/);
    expect(text).not.toMatch(/produces the charter/i);
  });

  it("makes sync on a converged spec a byte-stable no-op", async () => {
    const text = await prose();

    expect(text).toContain("**byte-stable no-op**");
    expect(text).toMatch(/no file is opened for writing/i);
    expect(text).toMatch(/unchanged tree yields an identical report/i);
    // Cosmetic rewrites of a converged file are a defect, not convergence.
    expect(text).toMatch(/reordering rows, reflowing prose, restamping a date[^.]*is a defect/i);
  });

  it("asks supplement / replace / abort before touching a hand-authored spec", async () => {
    const text = await prose();

    expect(text).toMatch(/\*\*Supplement\*\*/);
    expect(text).toMatch(/\*\*Replace\*\*/);
    expect(text).toMatch(/\*\*Abort\*\*/);
    expect(text).toMatch(/Default when no answer arrives/i);
    expect(text).toMatch(/existing spec file is not overwritten without that answer/i);
  });
});

describe("/stamity-spec — register and gates", () => {
  it("stays within the command body cap and passes the write-path deny scan", async () => {
    const file = await artifact;

    expect(() => assertLineCap(file, COMMAND_BODY_MAX_LINES)).not.toThrow();
    expect(() => assertDenyClean(file)).not.toThrow();
    expect(scanAntiSlop(file.parsed.body)).toEqual([]);
  });

  it.each(DROPPED_VOCABULARY)("drops %s from the predecessor family", async (_label, pattern) => {
    expect((await artifact).parsed.body).not.toMatch(pattern);
  });

  it("mints no product URL or domain and names no vendor or model", async () => {
    const body = (await artifact).parsed.body;

    expect(body).not.toMatch(URL_OR_DOMAIN);
    expect(body).not.toMatch(VENDOR_OR_MODEL_NAMES);
  });

  it("uses only wired substitution tokens", async () => {
    const body = (await artifact).parsed.body;

    const tokens = [...body.matchAll(/\$\{STAMITY:[A-Z_]+\}/g)].map((match) => match[0]);
    for (const token of tokens) {
      expect(REPO_SUBSTITUTION_TOKENS).toContain(token);
    }
    // No malformed token survives: every opener is a well-formed match.
    expect(body.split("${STAMITY:").length - 1).toBe(tokens.length);
  });

  it("references only touchpoints that exist", async () => {
    const body = (await artifact).parsed.body;

    const mentions = [...body.matchAll(/\/stamity-([a-z-]+[a-z])/g)].map((match) => match[1]);
    expect(mentions.length).toBeGreaterThan(0);
    for (const mention of mentions) {
      expect(COMMAND_CENSUS, `/stamity-${mention} is not a touchpoint`).toContain(mention);
    }
  });
});
