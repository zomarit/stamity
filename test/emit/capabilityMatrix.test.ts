import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  CAPABILITY_MATRIX_DOC_PATH,
  LIVE_CAPABILITY_INPUTS,
  REGENERATE_COMMAND,
  REVISIT_TRIGGERS,
  renderCapabilityMatrix,
  renderCapabilityMatrixFrom,
  type RevisitTrigger,
} from "../../src/emit/capabilityMatrix.ts";
import { CLIENT_HOOK_GUARANTEES } from "../../src/hooks/model.ts";
import { ADAPTER_ALLOWLIST_COVERAGE } from "../../src/tools/translator.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * The suite is the drift gate. The page is a projection of adapter code, so
 * the only way it can lie is by being stale — which is exactly what the
 * byte-comparison below catches, and why the failure message carries the
 * regeneration command instead of leaving a reader to guess at it.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MODULE_SOURCE_PATH = fileURLToPath(
  new URL("../../src/emit/capabilityMatrix.ts", import.meta.url),
);
const SCRIPT_PATH = fileURLToPath(
  new URL("../../scripts/generate-capability-matrix.mjs", import.meta.url),
);

/** Named so the criterion "the failure names the regen command" is asserted, not assumed. */
const STALE_MESSAGE =
  `${CAPABILITY_MATRIX_DOC_PATH} is stale — the render no longer matches the committed ` +
  `page. Regenerate it with \`${REGENERATE_COMMAND}\` and commit the diff.`;

const committedPage = (): string =>
  readFileSync(join(REPO_ROOT, CAPABILITY_MATRIX_DOC_PATH), "utf-8");

/** A heading's body: everything up to the next heading of the same or higher level. */
function section(doc: string, heading: string): string[] {
  const lines = doc.split("\n");
  const start = lines.indexOf(heading);
  expect(start, `missing section heading: ${heading}`).toBeGreaterThanOrEqual(0);
  const level = heading.split(" ")[0]?.length ?? 0;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#+ /.test(line) && (line.split(" ")[0]?.length ?? 0) <= level);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Table body rows inside a block of lines — header and delimiter dropped. A
 * block may hold several tables (a client group has facts and caps), so body
 * membership tracks the delimiter rather than filtering on shape alone.
 */
function tableRows(lines: readonly string[]): string[] {
  const rows: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (line.startsWith("|---")) inBody = true;
    else if (!line.startsWith("| ")) inBody = false;
    else if (inBody) rows.push(line);
  }
  return rows;
}

/** Cells of one row, split on UNESCAPED pipes — the split GFM itself performs. */
function cells(row: string): string[] {
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((value) => value.trim());
}

const factsFor = (tool: Tool): (typeof LIVE_CAPABILITY_INPUTS.facts)[number] => {
  const facts = LIVE_CAPABILITY_INPUTS.facts.find((row) => row.tool === tool);
  if (facts === undefined) throw new Error(`no live facts for ${tool}`);
  return facts;
};

/** Live inputs with one client's facts replaced — variants derive, never duplicate. */
const withFacts = (
  tool: Tool,
  patch: Partial<(typeof LIVE_CAPABILITY_INPUTS.facts)[number]>,
): typeof LIVE_CAPABILITY_INPUTS => ({
  ...LIVE_CAPABILITY_INPUTS,
  facts: LIVE_CAPABILITY_INPUTS.facts.map((row) => (row.tool === tool ? { ...row, ...patch } : row)),
});

/** Live inputs carrying one declared trigger, patched — the same derive rule. */
const withTrigger = (patch: Partial<RevisitTrigger>): typeof LIVE_CAPABILITY_INPUTS => {
  const first = REVISIT_TRIGGERS[0];
  if (first === undefined) throw new Error("no live revisit triggers");
  return { ...LIVE_CAPABILITY_INPUTS, triggers: [{ ...first, ...patch }] };
};

const triggerFor = (when: string): RevisitTrigger => {
  const trigger = REVISIT_TRIGGERS.find((row) => row.when === when);
  if (trigger === undefined) throw new Error(`no revisit trigger named ${when}`);
  return trigger;
};

/** The currency table's rows, one per declared trigger. */
const currencyRows = (): string[] =>
  tableRows(section(renderCapabilityMatrix(), "## Currency and revisit triggers"));

describe("renderCapabilityMatrix — drift gate", () => {
  it("byte-matches the committed page", () => {
    expect(STALE_MESSAGE).toContain(REGENERATE_COMMAND);
    expect(renderCapabilityMatrix(), STALE_MESSAGE).toBe(committedPage());
  });

  it("ends with exactly one trailing newline", () => {
    const page = renderCapabilityMatrix();
    expect(page.endsWith("\n")).toBe(true);
    expect(page.endsWith("\n\n")).toBe(false);
  });
});

describe("guarantee-honesty section", () => {
  const rows = tableRows(section(renderCapabilityMatrix(), "## Hook guarantee honesty"));

  it("renders one row per guarantee entry, in table order", () => {
    expect(rows).toHaveLength(CLIENT_HOOK_GUARANTEES.length);
    expect(rows.map((row) => cells(row)[0])).toEqual(
      CLIENT_HOOK_GUARANTEES.map((row) => `\`${row.tool}\``),
    );
  });

  it("renders failMode and blockingExitCode verbatim, with null as 'never blocks'", () => {
    CLIENT_HOOK_GUARANTEES.forEach((guarantee, index) => {
      const row = rows[index] ?? "";
      const [, failMode, exitCode, notes] = cells(row);
      expect(failMode).toBe(`\`${guarantee.failMode}\``);
      expect(exitCode).toBe(
        guarantee.blockingExitCode === null ? "never blocks" : `\`${guarantee.blockingExitCode}\``,
      );
      expect(notes).toBe(guarantee.notes);
    });
  });

  it("keeps the copilot row honest about never blocking", () => {
    const copilot = rows.find((row) => cells(row)[0] === "`copilot`") ?? "";
    expect(cells(copilot)[2]).toBe("never blocks");
    expect(copilot).not.toContain("`2`");
  });

  /**
   * The glance table states enforcement too, so it is a second surface that
   * could drift from the ladder. Both read the same constant; this asserts
   * they still agree client by client rather than trusting that they do.
   */
  it("agrees with the glance table's enforcement cell for every client", () => {
    const glance = tableRows(section(renderCapabilityMatrix(), "## Coverage at a glance"));
    for (const guarantee of CLIENT_HOOK_GUARANTEES) {
      const row = glance.find((line) => cells(line)[0] === `\`${guarantee.tool}\``) ?? "";
      expect(cells(row)[4], `glance enforcement cell for ${guarantee.tool}`).toBe(
        guarantee.blockingExitCode === null
          ? `\`${guarantee.failMode}\` — never blocks`
          : `\`${guarantee.failMode}\` — blocks on exit \`${guarantee.blockingExitCode}\``,
      );
    }
  });
});

describe("allowlist-coverage section", () => {
  const rows = tableRows(
    section(renderCapabilityMatrix(), "## Agent tool-allowlist enforcement coverage"),
  );

  it("renders every coverage entry verbatim, provisional marker included", () => {
    expect(rows).toHaveLength(ADAPTER_ALLOWLIST_COVERAGE.length);
    ADAPTER_ALLOWLIST_COVERAGE.forEach((entry, index) => {
      const [tool, mechanism, strength] = cells(rows[index] ?? "");
      expect(tool).toBe(`\`${entry.tool}\``);
      expect(mechanism).toBe(entry.mechanism);
      expect(strength).toBe(
        entry.provisional === true ? `${entry.strength} (provisional)` : entry.strength,
      );
    });
  });

  it("refuses a coverage table that does not cover every client", () => {
    expect(() =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        coverage: LIVE_CAPABILITY_INPUTS.coverage.filter((row) => row.tool !== "claude"),
      }),
    ).toThrowError(/allowlist-coverage table is missing a row for `claude`/);
  });
});

describe("citation discipline", () => {
  const page = renderCapabilityMatrix();

  it("gives every client row group an ISO-dated source for each declared citation", () => {
    for (const tool of TOOLS) {
      const group = section(page, `### \`${tool}\``);
      const sources = group.filter((line) => line.startsWith("- <"));
      const facts = factsFor(tool);
      expect(sources, `no sources rendered for ${tool}`).toHaveLength(facts.citations.length);
      expect(sources.length).toBeGreaterThan(0);
      for (const line of sources) {
        expect(line, `undated source in the ${tool} row group: ${line}`).toMatch(
          /^- <https?:\/\/\S+> — accessed \d{4}-\d{2}-\d{2}$/,
        );
      }
      for (const citation of facts.citations) {
        expect(group.join("\n")).toContain(`<${citation.url}> — accessed ${citation.accessDate}`);
      }
    }
  });

  it("refuses a facts entry with zero citations, naming the client", () => {
    const call = (): string => renderCapabilityMatrixFrom(withFacts("cursor", { citations: [] }));
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`cursor`/);
    expect(call).toThrowError(/citation/i);
    try {
      call();
    } catch (err) {
      expect((err as EngineError).code).toBe("ADAPTER_ERROR");
    }
  });

  it("refuses a citation whose access date is not an ISO calendar date", () => {
    const call = (): string =>
      renderCapabilityMatrixFrom(
        withFacts("codex", {
          citations: [{ url: "https://example.invalid/docs", accessDate: "August 2026" }],
        }),
      );
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`codex`/);
    expect(call).toThrowError(/ISO/);
  });
});

/**
 * The currency process names five conditions that re-open a design
 * decision; the page recorded one verbatim, left two out entirely, and carried
 * a third as a GAP ("upstream gap: open codex#34002") with no action beside it.
 * Four conditions nobody could check is a process that binds nothing, so these
 * cases hold every one of them to the page — and each status to the declaration
 * it claims, so the block is not five more sentences of prose.
 */
describe("currency block — the named revisit triggers", () => {
  const page = renderCapabilityMatrix();

  it("records all five conditions with the action each one takes", () => {
    expect(REVISIT_TRIGGERS).toHaveLength(5);
    const rows = currencyRows();
    expect(rows).toHaveLength(REVISIT_TRIGGERS.length);

    REVISIT_TRIGGERS.forEach((trigger, index) => {
      const [when, action, status] = cells(rows[index] ?? "");
      expect(when, `condition ${index}`).toBe(trigger.when);
      expect(action, `action for ${trigger.when}`).toBe(trigger.action);
      expect(status, `status for ${trigger.when}`).toBe(trigger.status);
      expect(action?.trim(), `${trigger.when} renders an action`).not.toBe("");
    });
  });

  it("names the five conditions the currency process names, and no substitute for one", () => {
    for (const when of [
      "Antigravity adoption/demand",
      "codex#34002 resolution",
      "Claude Code AGENTS.md support change",
      "Agent Plugins scope expansion",
      "VS Code deny-gate GA",
    ]) {
      expect(REVISIT_TRIGGERS.map((row) => row.when), `${when} is not recorded`).toContain(when);
    }
  });

  /**
   * The date on a row has to be a date a page was read, not a stamp. It is
   * derived from the watched client's own citations — the same constants the
   * Sources lists render — and the module carries no ISO date literal at all,
   * so there is nowhere to type one in.
   */
  it("dates each watched row from that client's oldest citation, never from a literal", () => {
    const rows = currencyRows();
    REVISIT_TRIGGERS.forEach((trigger, index) => {
      const watched = cells(rows[index] ?? "")[3] ?? "";
      if (trigger.watch === null) {
        expect(watched, trigger.when).toBe("unwatched — no supported client carries a source for it");
        return;
      }
      const dates = factsFor(trigger.watch).citations.map((citation) => citation.accessDate);
      const oldest = dates.toSorted()[0];
      expect(watched, trigger.when).toBe(`\`${trigger.watch}\`, oldest source read ${oldest}`);
      // The bound, not the flattering end of the range.
      for (const date of dates) expect(date >= (oldest ?? ""), `${trigger.watch} ${date}`).toBe(true);
    });

    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source, "an ISO date literal in the renderer is a hand-stamped access date").not.toMatch(
      /\d{4}-\d{2}-\d{2}/,
    );
  });

  /**
   * The bound, not the flattering end of the range. A client whose sources were
   * read on different days has one page nobody has looked at since the earliest
   * of them, and that is how stale the status can be — the newest date would
   * report the day someone happened to open one other page.
   */
  it("takes the OLDEST of a client's access dates, whichever order they are declared in", () => {
    const spread = [
      { url: "https://learn.chatgpt.com/docs/hooks", accessDate: "2026-08-17" },
      { url: "https://learn.chatgpt.com/docs/custom-prompts", accessDate: "2025-01-04" },
      { url: "https://learn.chatgpt.com/docs/config-file/config-reference", accessDate: "2026-02-28" },
    ];
    const forward = renderCapabilityMatrixFrom(withFacts("codex", { citations: spread }));
    const reversed = renderCapabilityMatrixFrom(
      withFacts("codex", { citations: [...spread].toReversed() }),
    );

    const cellOf = (rendered: string): string =>
      cells(
        tableRows(section(rendered, "## Currency and revisit triggers")).find((row) =>
          row.includes("codex#34002"),
        ) ?? "",
      )[3] ?? "";

    expect(cellOf(forward)).toBe("`codex`, oldest source read 2025-01-04");
    expect(cellOf(reversed)).toBe(cellOf(forward));
    expect(cellOf(forward)).not.toContain("2026-08-17");
  });

  /**
   * Each status is an assertion about this repo, so each is pinned to the
   * declaration that makes it true. A status nothing pins is the hand-kept
   * prose the page's own trust paragraph now warns about.
   */
  it("pins the codex status to that client's declared rule shape", () => {
    expect(factsFor("codex").ruleShape).toContain("codex#34002");
    expect(triggerFor("codex#34002 resolution").status).toMatch(/^Open/);
    expect(triggerFor("codex#34002 resolution").watch).toBe("codex");
  });

  it("pins the entry-file status to the one client that declares an entry file", () => {
    const withEntryFile = LIVE_CAPABILITY_INPUTS.facts
      .filter((facts) => facts.entryFile !== null)
      .map((facts) => facts.tool);
    expect(withEntryFile).toEqual(["claude"]);
    expect(triggerFor("Claude Code AGENTS.md support change").status).toContain("entry file");
    expect(triggerFor("Claude Code AGENTS.md support change").watch).toBe("claude");
  });

  it("pins the deny-gate status to copilot's own declared cap", () => {
    const cap = factsFor("copilot").caps.find((row) => row.name === "deny-gate");
    expect(cap?.value).toContain("Preview");
    expect(cap?.value).toContain("GA");
    expect(triggerFor("VS Code deny-gate GA").status).toContain("Preview");
    expect(triggerFor("VS Code deny-gate GA").watch).toBe("copilot");
  });

  it("leaves the trigger no client covers unwatched instead of dating it", () => {
    const trigger = triggerFor("Antigravity adoption/demand");
    expect(trigger.watch).toBeNull();
    expect(TOOLS.map((tool) => String(tool).toLowerCase())).not.toContain("antigravity");
    expect(page).toContain("unwatched — no supported client carries a source for it");
  });

  it("refuses a trigger watching a client that declares no facts here", () => {
    const call = (): string => renderCapabilityMatrixFrom(withTrigger({ watch: "windsurf" as Tool }));
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`windsurf`/);
    expect(call).toThrowError(/no access date/);
  });

  it("refuses a trigger with no action, and one with no status", () => {
    expect(() => renderCapabilityMatrixFrom(withTrigger({ action: "  " }))).toThrowError(
      /declares no action/,
    );
    expect(() => renderCapabilityMatrixFrom(withTrigger({ status: "" }))).toThrowError(
      /declares no status/,
    );
  });

  it("refuses a currency block with no trigger at all", () => {
    const empty = { ...LIVE_CAPABILITY_INPUTS, triggers: [] };
    expect(() => renderCapabilityMatrixFrom(empty)).toThrowError(EngineError);
    expect(() => renderCapabilityMatrixFrom(empty)).toThrowError(/no revisit trigger/);
  });

  it("refuses the same condition declared twice", () => {
    const first = REVISIT_TRIGGERS[0];
    expect(first).toBeDefined();
    expect(() =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        triggers: [first!, { ...first! }],
      }),
    ).toThrowError(/declared twice/);
  });
});

/**
 * The page's central trust claim was that "the page cannot drift from
 * what the generator emits". The byte-compare proves the page equals what the
 * adapters DECLARE — it says nothing about whether a declaration equals what
 * the adapter emits, and several cells are hand-written prose relocated into a
 * constant. A reader who takes "cannot drift" at face value trusts a guarantee
 * nothing provides, which is the class this page exists to close.
 */
describe("the trust claim states what the byte-compare proves", () => {
  const page = renderCapabilityMatrix();

  it("no longer claims the page cannot drift from what the generator emits", () => {
    expect(page).not.toMatch(/cannot\s+drift/i);
    expect(page).not.toMatch(/No claim here is hand-kept prose/i);
  });

  it("names the declaration/emission boundary and where it is actually pinned", () => {
    expect(page).toContain("what the adapters DECLARE");
    expect(page).toContain("EMITS");
    expect(page).toMatch(/only where a test pins the two together/);
    expect(page).toMatch(/prose someone wrote into a constant/);
  });

  it("resolves the pinning test it cites, so the citation cannot go stale silently", () => {
    const cited = [...page.matchAll(/`(test\/[^`]+\.ts)`/g)].map((match) => match[1] ?? "");
    expect(cited.length).toBeGreaterThan(0);
    for (const path of cited) {
      expect(existsSync(join(REPO_ROOT, path)), `the page cites missing ${path}`).toBe(true);
    }
  });
});

/**
 * Two dialect claims this page used to make were retired by the rework build,
 * and both were wrong in the direction that costs an operator time: they
 * described a delivery path that did not deliver. A drift gate catches a page
 * that lags the code; these catch the code re-acquiring the claim.
 */
describe("retired dialect claims", () => {
  const page = renderCapabilityMatrix();

  it("describes no plugin container as a delivery path for skills", () => {
    // The Agent-Plugins container was deleted, so no cell
    // may point a reader at one. Matched case-insensitively on the word and on
    // the path shape the container used to occupy.
    //
    // NARROWED, not weakened. The currency block records the
    // condition "Agent Plugins scope expansion → container widens" verbatim,
    // and its status is that NO container is emitted — the opposite of a
    // delivery-path claim, and the sentence a reader needs to know the decision
    // was made rather than forgotten. The word ban therefore holds over every
    // section except that one, the two path shapes still hold page-wide, and
    // the currency row's own text is pinned below so the exemption cannot
    // shelter a re-acquired claim.
    const currency = section(page, "## Currency and revisit triggers");
    const elsewhere = page.split("\n").filter((line) => !currency.includes(line)).join("\n");
    expect(elsewhere).not.toMatch(/agent[- ]plugins/i);
    expect(page).not.toMatch(/plugin\.json/i);
    expect(page).not.toMatch(/\/plugins\//i);

    const container = triggerFor("Agent Plugins scope expansion");
    expect(container.status).toMatch(/^No container is emitted/);
    expect(container.status).not.toMatch(/plugin/i);

    // The replacement is stated, not merely the old claim removed: this
    // client's native skills location is named in its own row group.
    const claudeGroup = section(page, "### `claude`").join("\n");
    expect(claudeGroup).toContain(".claude/skills/");
  });

  it("claims no unledgered `model: inherit` for cursor", () => {
    // The engine stopped restating a client default as if it were a
    // decision. The key is emitted only under an operator pin, so the page may
    // not describe `inherit` as what this client's agents carry.
    // `inherit` is this client's word for "apply your own default", and the
    // whole retired claim was that the engine writes it. The bare word is the
    // assertion: any phrasing that re-introduces the value — `always
    // inherit`, `model: inherit`, `inherit by default` — trips it, where a
    // key-then-value pattern would have missed the parenthesised original.
    const cursorGroup = section(page, "### `cursor`").join("\n");
    expect(cursorGroup).not.toMatch(/\binherit/i);
    expect(cursorGroup).toContain("pinned");
  });
});

describe("determinism", () => {
  it("renders byte-identically twice", () => {
    expect(renderCapabilityMatrix()).toBe(renderCapabilityMatrix());
  });

  it("reads no clock — access dates come from the facts constants", () => {
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
    expect(source).not.toMatch(/performance\.now\(/);
  });
});

describe("client coverage", () => {
  const page = renderCapabilityMatrix();

  it("covers exactly the four supported clients and no fifth", () => {
    expect(TOOLS).toHaveLength(4);

    const glance = tableRows(section(page, "## Coverage at a glance"));
    expect(glance.map((row) => cells(row)[0])).toEqual(TOOLS.map((tool) => `\`${tool}\``));

    const groups = page.split("\n").filter((line) => line.startsWith("### "));
    expect(groups).toEqual(TOOLS.map((tool) => `### \`${tool}\``));

    const coverage = tableRows(section(page, "## Agent tool-allowlist enforcement coverage"));
    expect(coverage).toHaveLength(TOOLS.length);
  });

  it("refuses a facts set carrying an unsupported client", () => {
    const fifth = { ...factsFor("cursor"), tool: "antigravity" as Tool };
    const call = (): string =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        facts: [...LIVE_CAPABILITY_INPUTS.facts, fifth],
      });
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`antigravity`/);
  });

  it("refuses a facts set missing a client", () => {
    expect(() =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        facts: LIVE_CAPABILITY_INPUTS.facts.filter((row) => row.tool !== "codex"),
      }),
    ).toThrowError(/missing a row for `codex`/);
  });

  it("refuses a guarantee table that does not cover every client", () => {
    expect(() =>
      renderCapabilityMatrixFrom({
        ...LIVE_CAPABILITY_INPUTS,
        guarantees: LIVE_CAPABILITY_INPUTS.guarantees.filter((row) => row.tool !== "copilot"),
      }),
    ).toThrowError(/hook-guarantee table is missing a row for `copilot`/);
  });
});

describe("markdown escaping", () => {
  it("escapes a pipe inside a declared value so the row keeps its columns", () => {
    const page = renderCapabilityMatrixFrom(
      withFacts("cursor", { ruleShape: "globs take `a|b` alternation" }),
    );
    const row = tableRows(section(page, "### `cursor`")).find((line) =>
      line.startsWith("| Rule shape |"),
    );
    expect(row).toBeDefined();
    expect(row).toContain("`a\\|b`");
    // Two cells after the GFM split; a raw pipe would have sheared it into three.
    expect(cells(row ?? "")).toHaveLength(2);
    expect(row?.split("|")).toHaveLength(4 + 1);
  });

  it("collapses a multi-line declared value into a single cell", () => {
    const page = renderCapabilityMatrixFrom(
      withFacts("codex", { agentsFormat: "TOML subagents\nunder `.codex/agents/`" }),
    );
    const row = tableRows(section(page, "### `codex`")).find((line) =>
      line.startsWith("| Agent format |"),
    );
    expect(cells(row ?? "")[1]).toBe("TOML subagents under `.codex/agents/`");
  });
});

describe("scripts/generate-capability-matrix.mjs", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-p4u10-matrix-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  const run = (out: string): string => {
    execFileSync(process.execPath, [SCRIPT_PATH, "--out", out], { encoding: "utf-8" });
    return readFileSync(out, "utf-8");
  };

  it("writes the rendered page, and a second run produces zero diff", () => {
    const out = join(workspace, "nested", "capability-matrix.md");

    const first = run(out);
    expect(first).toBe(renderCapabilityMatrix());

    const second = run(out);
    expect(second).toBe(first);
  });

  it("rejects an unknown argument with the usage exit code", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--bogus"], { encoding: "utf-8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--out");
  });
});
