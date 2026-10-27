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
import { CLIENT_CLOUD_FACTS, CLIENT_HOOK_GUARANTEES, type ClientCloudFact } from "../../src/hooks/model.ts";
import { buildSessionStartScript } from "../../src/hooks/scripts.ts";
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

/** Live inputs with the cloud table replaced — the same derive rule. */
const withCloud = (rows: readonly ClientCloudFact[]): typeof LIVE_CAPABILITY_INPUTS => ({
  ...LIVE_CAPABILITY_INPUTS,
  cloud: rows,
});

const cloudFact = (tool: Tool, subject: string): ClientCloudFact => {
  const row = CLIENT_CLOUD_FACTS.find((fact) => fact.tool === tool && fact.subject === subject);
  if (row === undefined) throw new Error(`no ${tool} cloud fact named ${subject}`);
  return row;
};

/** The currency table's rows, one per declared trigger. */
const currencyRows = (): string[] =>
  tableRows(section(renderCapabilityMatrix(), "## Currency and revisit triggers"));

describe("renderCapabilityMatrix — drift gate", () => {
  it("byte-matches the committed page", () => {
    // TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): the compared render is
    // `renderCapabilityMatrix()` again, not a render with the plugin containers the generator
    // supplied. The containers' builder is deleted with the plugin route in 1.15.0, so the
    // zero-argument render is the whole page once more. The gate is not weakened: it still
    // byte-compares a fresh render against the committed bytes, now over every section.
    expect(STALE_MESSAGE).toContain(REGENERATE_COMMAND);
    expect(renderCapabilityMatrix(), STALE_MESSAGE).toBe(committedPage());
  });

  it("ends with exactly one trailing newline", () => {
    const page = renderCapabilityMatrix();
    expect(page.endsWith("\n")).toBe(true);
    expect(page.endsWith("\n\n")).toBe(false);
  });

  it("opens with the frontmatter block, then the generated banner", () => {
    // Asserted against the LIVE render, not against the committed page: the
    // byte-compare above proves only that the two agree, so a render that
    // dropped the frontmatter would stay green the moment the page was
    // regenerated with it missing. The site generator reads frontmatter only at
    // byte 0, and the whole cost of losing it is silent — the page keeps
    // publishing, under its slug instead of its title.
    expect(renderCapabilityMatrix().startsWith(
      "---\ntitle: Client capability matrix\n---\n\n<!-- GENERATED FILE",
    )).toBe(true);
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

  it("renders an injected nonblocking guarantee honestly in both tables", () => {
    // 2026-09-10: all live client rows now declare a blocking exit, so they no
    // longer exercise the public renderer's supported null guarantee. Supply
    // a synthetic observation-only transport through that input seam; this
    // fixture makes no claim about Cursor's current native hook behavior.
    const notes = "Fixture transport observes hook failures without blocking the action.";
    const page = renderCapabilityMatrixFrom({
      ...LIVE_CAPABILITY_INPUTS,
      guarantees: LIVE_CAPABILITY_INPUTS.guarantees.map((row) =>
        row.tool === "cursor"
          ? { ...row, failMode: "fail-open", blockingExitCode: null, notes }
          : row,
      ),
    });
    const guarantee = tableRows(section(page, "## Hook guarantee honesty"))
      .find((row) => cells(row)[0] === "`cursor`");
    const glance = tableRows(section(page, "## Coverage at a glance"))
      .find((row) => cells(row)[0] === "`cursor`");

    expect(cells(guarantee ?? "")).toEqual(["`cursor`", "`fail-open`", "never blocks", notes]);
    expect(cells(glance ?? "")[4]).toBe("`fail-open` — never blocks");
    // The live native contract remains blocking; rendering the supplied row
    // must not mutate the shared inputs or silently fall back to their value.
    expect(LIVE_CAPABILITY_INPUTS.guarantees.find((row) => row.tool === "cursor")?.blockingExitCode)
      .toBe(2);
  });

  // TEST CHANGE: the current CLI/cloud contract denies preToolUse failures,
  // while native timeouts and the identity-free core role guard remain weaker.
  it("states Copilot denial and retains its timeout and role-identity limitations", () => {
    const copilot = rows.find((row) => cells(row)[0] === "`copilot`") ?? "";
    expect(cells(copilot)[1]).toBe("`fail-closed`");
    expect(cells(copilot)[2]).toBe("`2`");
    expect(copilot).toContain("errors and JSON deny block");
    expect(copilot).toContain("Timeouts always fail-open");
    expect(copilot).toContain("identity-free core role guard is telemetry");
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

describe("the declared effort scales", () => {
  const page = renderCapabilityMatrix();

  /** The date each client's scale was last read, as its projection row cites it. */
  const SCALE_READ_ON: Partial<Record<Tool, string>> = {
    claude: "2026-09-17",
    codex: "2026-10-10",
    cursor: "2026-09-17",
  };

  it("renders one `effort-scale` row per client that carries the axis", () => {
    // Three carriers declare an `effort-scale` row; Copilot states its scale
    // inside its `effort-axis` row instead (pinned below), a different row
    // that stays where it is.
    const carriers = TOOLS.filter(
      (tool) => factsFor(tool).caps.some((row) => row.name === "effort-scale"),
    );
    expect(carriers).toEqual(["claude", "cursor", "codex"]);
    expect(factsFor("copilot").caps.some((row) => row.name === "effort-scale")).toBe(false);

    for (const tool of carriers) {
      const value = factsFor(tool).caps.find((row) => row.name === "effort-scale")!.value;
      const group = section(page, `### \`${tool}\``).join("\n");
      expect(group, `${tool} renders no effort-scale row`).toContain(value);
      // Every scale claim is a vendor claim, so it carries its own dated
      // source inline the way the hook rows on this page already do.
      // TEST CHANGE, justified (2026-10-10, q4b-codex-scale): the case held every scale row to
      // one date, 2026-09-17. The Codex row was re-read on 2026-10-10 and the others were not,
      // so each row is held to its own read; the rule that each row is dated did not change.
      expect(value, `${tool} scale row is undated`).toContain(`accessed ${SCALE_READ_ON[tool]}`);
    }
  });

  it("states the pass-through client's risk rather than promising the level lands", () => {
    const value = factsFor("cursor").caps.find((row) => row.name === "effort-scale")!.value;
    expect(value).toContain("pass-through");
    expect(value).toContain("vary by model");
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

  // The condition fired: Claude Code 2.1.277+ reads `AGENTS.md` directly, but by default only where no
  // `CLAUDE.md` exists (code.claude.com/docs/en/memory, read 2026-10-26). This engine emits a
  // `CLAUDE.md`, so the bridge import stays, and the status has to say both halves.
  it("records the Claude AGENTS.md trigger as fired, and why the bridge stays", () => {
    const status = triggerFor("Claude Code AGENTS.md support change").status;
    expect(status).toMatch(/^Fired/);
    expect(status).not.toMatch(/^Unchanged/);
    expect(status).toContain("2.1.277");
    expect(status).toContain("only where no `CLAUDE.md` exists");
    expect(status).toContain("`@AGENTS.md` bridge import");
    expect(status).toContain("entry file");
  });

  // TEST CHANGE: emitted CLI/cloud hooks and VS Code's Preview editor surface
  // are distinct contracts; the old future-GA assertion conflated them.
  it("distinguishes the emitted CLI/cloud deny gate from the editor revisit trigger", () => {
    const cap = factsFor("copilot").caps.find((row) => row.name === "deny-gate");
    expect(cap?.value).toContain("Copilot CLI/cloud");
    expect(cap?.value).toContain("preToolUse denies");
    expect(factsFor("copilot").hooksConfigPath).toBe(".github/hooks/stamity.json");
    const trigger = triggerFor("VS Code deny-gate GA");
    expect(trigger.status).toContain("CLI/cloud preToolUse hooks are emitted now");
    expect(trigger.status).toContain("timeout fail-open");
    expect(trigger.status).toContain("https://code.visualstudio.com/docs/agent-customization/hooks");
    expect(trigger.status).toContain("remain Preview");
    expect(trigger.status).toContain("separate verification");
    expect(trigger.action).toContain("editor-specific");
    expect(trigger.watch).toBe("copilot");
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
 * The 2026-09-30 currency pass (plan 013, `sw14-client-currency-sweep`). A client's citation date
 * moves only when every claim it covers re-verified on that date (the all-or-nothing rule in
 * `src/adapters/copilot.ts`), so the pass moved Claude's and held the other three: each of them
 * had a claim that changed or could not be verified, and those claims carry their own inline
 * date instead.
 */
describe("the 2026-09-30 client currency pass", () => {
  const datesOf = (tool: Tool): string[] =>
    factsFor(tool).citations.map((citation) => citation.accessDate);
  const capOf = (tool: Tool, name: string): string =>
    factsFor(tool).caps.find((row) => row.name === name)?.value ?? "";

  it("re-stamps Claude's citations, and leaves Copilot's, Codex's and Cursor's where they were", () => {
    expect(datesOf("claude").length).toBeGreaterThan(0);
    // TEST CHANGE, justified: re-read 2026-10-23 — plan 022's b18 cell read Copilot's hooks reference,
    // Codex's hooks page and Claude's hooks page on 2026-10-23, so those three dates move to that day.
    // TEST CHANGE, justified: re-read 2026-10-26 — Copilot's four one-stamp pages, Cursor's five pages and
    // Claude's memory, skills and settings pages were read claim by claim on 2026-10-26 (ledger row
    // review/80), so those dates move to that day. Claude's sub-agents page was not read whole since
    // 2026-09-30 and keeps that date. Every date neither read covered is held below.
    expect(datesOf("claude")).toEqual(["2026-10-26", "2026-10-26", "2026-09-30", "2026-10-23", "2026-10-26"]);
    // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): Copilot's list gained a sixth
    // page, the CLI command reference, read 2026-10-10 for the effort scale and the
    // `--no-custom-instructions` flag. The five dates the pass left where they were are unchanged.
    // TEST CHANGE, justified (plan 020 file 2, e8-copilot-codex-claude-pins, build/64; moved by
    // e10-cloud-docs-matrix, which owns this file): e8 re-read Copilot's hooks reference on
    // 2026-10-14 (the fifth date, 2026-09-17 before) and cited two new pages read that day, the VS
    // Code custom-agents page and the cloud agent's model page; it re-read Codex's subagents page
    // on 2026-10-14 for the model precedence (the first date, 2026-09-10 before). Every date the
    // 2026-09-30 pass left where it was and no later unit re-read is still held as it was.
    expect(datesOf("copilot")).toEqual([
      "2026-10-26",
      "2026-10-26",
      "2026-10-26",
      "2026-10-26",
      "2026-10-23",
      "2026-10-10",
      "2026-10-14",
      "2026-10-14",
    ]);
    expect(datesOf("codex")).toEqual(["2026-10-14", "2026-10-23", "2026-09-15", "2026-09-10"]);
    expect(datesOf("cursor")).toEqual(["2026-10-26", "2026-10-26", "2026-10-26", "2026-10-26", "2026-10-26"]);
  });

  // TEST CHANGE, justified (2026-10-10, q6c-copilot-effort-key): the case read "states that Copilot
  // agents accept `reasoning-effort` and that this engine does not write it" and held the row to
  // "not emitted … this engine does not write it yet". The engine writes the key now
  // (REQ-LADDER-004), so the row is held to "emitted", its scale and its sources. The two release
  // versions and the refuted "publishes no effort key" wording are pinned as before.
  // TEST CHANGE, justified (e8-copilot-codex-claude-pins, build/64; moved by e10-cloud-docs-matrix):
  // e8 added the live run that proved the key, Copilot CLI 1.0.89 on 2026-10-11, and where its
  // record lives. Every other word of the row is held as before, the cloud agent's undocumented
  // handling included.
  // TEST CHANGE, justified: re-read 2026-10-23 — the row names the CLI installed at that re-read
  // (1.0.100) and that the 1.0.89 run was not repeated on it; every other word is held.
  it("states that Copilot agents carry `reasoning-effort`, on what scale and from which sources", () => {
    const value = capOf("copilot", "effort-axis");
    expect(value).toBe(
      "emitted — `reasoning-effort: <level>` per agent, on the scale `low` … `max` (Copilot CLI " +
        "reference, accessed 2026-10-10; the key in the 1.0.89 loader and its changelog, 1.0.66 and " +
        "1.0.88); a live run on Copilot CLI 1.0.89 (2026-10-11) loaded an agent carrying " +
        "`reasoning-effort: high` and its sub-agent ran at that level " +
        "(`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` branch, QA row 2), and that " +
        "run has not been repeated on 1.0.100, the CLI installed at the 2026-10-23 re-read; a level " +
        "the model does not offer is reported and falls back to the session's; the " +
        "cloud agent's handling of the key is undocumented (custom-agents configuration page, " +
        "accessed 2026-10-10)",
    );
    expect(value).not.toContain("publishes no effort key");
    // And the row reaches the published page, in Copilot's own group.
    expect(section(renderCapabilityMatrix(), "### `copilot`").join("\n")).toContain(value);
  });

  it("calls Cursor's no-spaces glob list this engine's choice, not the vendor's rule", () => {
    const shape = factsFor("cursor").ruleShape;
    expect(shape).toContain("comma-separated");
    expect(shape).toContain("this engine's choice");
    expect(shape).not.toContain("comma-separated list with no spaces;");
  });

  it("states what codex-cli 0.155.1 measured about hooks, what stays unmeasured, and keeps 0.154.0 as history", () => {
    const value = capOf("codex", "hook enforcement");
    expect(value).toContain("0.154.0");
    expect(value).toContain("0.155.1");
    expect(value).toContain("on by default");
    expect(value).toContain("did not turn it off");
    expect(value).toContain("cause is not isolated");
    expect(value).toContain("unmeasured");
    // The claim the 0.155.1 run refuted: that the project file's key is what is read.
    expect(value).not.toMatch(/measurably read|measured .* to flip the feature/);
  });
});

/**
 * REQ-FLOW-085 and REQ-FLOW-086, the documentation half (plan 020 file 2, e10-cloud-docs-matrix):
 * one dated table says what each vendor's cloud runs of the repository's hooks, the matrix renders
 * it as a column and a section, and the session start's cloud lines are held equal to it, so a
 * cloud fact has one place to be wrong in.
 */
describe("the cloud column and the Cloud sessions section", () => {
  const page = renderCapabilityMatrix();
  const rows = tableRows(section(page, "## Cloud sessions"));

  it("renders every cloud fact once, with its page and the date it was read", () => {
    // Non-degenerate: every client has rows, and all three statuses occur.
    for (const tool of TOOLS) {
      expect(CLIENT_CLOUD_FACTS.filter((fact) => fact.tool === tool).length, tool).toBeGreaterThan(0);
    }
    expect(new Set(CLIENT_CLOUD_FACTS.map((fact) => fact.status))).toEqual(
      new Set(["documented", "not documented", "unverified"]),
    );
    expect(rows).toHaveLength(CLIENT_CLOUD_FACTS.length);
    for (const fact of CLIENT_CLOUD_FACTS) {
      const row = rows.find((line) => cells(line)[0] === `\`${fact.tool}\`` && cells(line)[1] === fact.subject);
      expect(row, `${fact.tool} ${fact.subject}`).toBeDefined();
      const [, , text, printed, status, source] = cells(row ?? "");
      expect(text).toBe(fact.fact);
      expect(printed).toBe(fact.sessionStart ?? "—");
      expect(source).toMatch(/^<https:\/\/\S+> — accessed \d{4}-\d{2}-\d{2}$/);
      expect(source).toBe(`<${fact.citation.url}> — accessed ${fact.citation.accessDate}`);
      // A silent page is dated like a statement: "not documented, read <date>", never a guess.
      expect(status).toBe(
        fact.status === "not documented" ? `not documented, read ${fact.citation.accessDate}` : fact.status,
      );
    }
  });

  it("gives every client a dated cloud cell in the glance table", () => {
    const glance = tableRows(section(page, "## Coverage at a glance"));
    expect(page).toContain("| In the vendor's cloud |");
    for (const tool of TOOLS) {
      const fact = CLIENT_CLOUD_FACTS.filter((row) => row.tool === tool && row.glance !== undefined);
      expect(fact, tool).toHaveLength(1);
      const row = glance.find((line) => cells(line)[0] === `\`${tool}\``) ?? "";
      expect(cells(row)[6]).toBe(`${fact[0]?.glance} — read ${fact[0]?.citation.accessDate}`);
    }
  });

  it("says plainly which clouds run which hooks", () => {
    expect(cloudFact("codex", "Project hooks").status).toBe("not documented");
    expect(cloudFact("codex", "Project hooks").fact).toContain("assume none run");
    expect(cloudFact("codex", "Project hooks").fact).toContain("sandbox is the enforcement");
    // Re-pinned 2026-10-27 (the 1.17.0 cut's vendor-fact line): the cloud-environments page now
    // scopes the several-repositories rule to an Anthropic-hosted environment and adds that a
    // project's cloud thread loads no repository's hooks at all, so the fact and its pins moved.
    const claudeHooks = cloudFact("claude", "Project hooks");
    expect(claudeHooks.fact).toContain("in a session with one repository, outside a project's cloud threads");
    expect(claudeHooks.fact).toContain(
      "In an Anthropic-hosted environment, a session with several repositories loads no repository's hooks",
    );
    expect(claudeHooks.fact).toContain("a project's cloud thread loads none whatever the number of repositories");
    expect(claudeHooks.fact).toContain("a self-hosted environment goes by its runner's settings");
    expect(claudeHooks.citation.accessDate).toBe("2026-10-27");
    expect(claudeHooks.glance).toContain("project thread");
    expect(cloudFact("copilot", "Default branch").fact).toContain("present on the repository's default branch");
    expect(cloudFact("copilot", "Project hooks").fact).toContain("in the cloned repository");
    expect(cloudFact("cursor", "Project hooks").fact).toContain(
      "except `sessionStart`, `sessionEnd` and the MCP hooks",
    );
  });

  it("says a lost review-gate counter is rebuilt, never that it resets or opens the gate (REQ-FLOW-085, REQ-FLOW-106)", () => {
    const claude = CLIENT_CLOUD_FACTS.filter((row) => row.tool === "claude" && row.sessionStart !== undefined);
    expect(claude.map((row) => row.sessionStart)).toContain(
      "A missing review-gate counter is rebuilt from the run record on this branch.",
    );
    for (const row of claude) {
      expect(row.sessionStart, row.subject).not.toBe("The review-gate counter resets with the VM.");
      expect(row.sessionStart, row.subject).not.toMatch(/\bopen/i);
    }
    // The cloud table prints the same line beside the vendor's fact it answers.
    const printed = rows.find((line) => cells(line)[0] === "`claude`" && cells(line)[1] === "Session state");
    expect(cells(printed ?? "")[3]).toBe("A missing review-gate counter is rebuilt from the run record on this branch.");
  });

  it("records the open Copilot path-argument question as unverified, not as a claim", () => {
    const row = cloudFact("copilot", "Tool arguments");
    expect(row.status).toBe("unverified");
    expect(row.fact).toContain("`filePath`");
    expect(row.fact).toContain("`path`");
    expect(row.fact).toContain("raised in review on 2026-10-14");
    expect(row.citation.url).toBe("https://docs.github.com/en/copilot/reference/hooks-reference");
  });

  /** The person-check cell of a Cloud sessions row: the column after Source. */
  const personCheck = (doc: string, tool: Tool, subject: string): string | undefined => {
    const line = tableRows(section(doc, "## Cloud sessions")).find(
      (row) => cells(row)[0] === `\`${tool}\`` && cells(row)[1] === subject,
    );
    return line === undefined ? undefined : cells(line)[6];
  };

  it("names each fact's person check, reading \"not run\" where a fact carries none (REQ-PROVE-044)", () => {
    expect(tableRows(section(page, "## Cloud sessions")).length).toBeGreaterThan(1);
    // No person check has run against a cloud yet: every live row reads "not run".
    for (const fact of CLIENT_CLOUD_FACTS) {
      expect(fact.run, `${fact.tool} ${fact.subject}`).toBeUndefined();
      expect(personCheck(page, fact.tool, fact.subject), `${fact.tool} ${fact.subject}`).toBe("not run");
    }
    // Activated: one fact carrying a run names its check and date, and only that row moves.
    const ran = cloudFact("claude", "Draft pull request");
    const withRun = renderCapabilityMatrixFrom(
      withCloud(
        CLIENT_CLOUD_FACTS.map((row) => (row === ran ? { ...row, run: { record: "P1 cloud check", date: "2026-10-20" } } : row)),
      ),
    );
    expect(personCheck(withRun, "claude", "Draft pull request")).toBe("P1 cloud check, run 2026-10-20");
    expect(personCheck(withRun, "claude", "Questions")).toBe("not run");
    expect(personCheck(withRun, "copilot", "Session limit")).toBe("not run");
  });

  it("refuses a person check with no record or an undated one, naming the fact", () => {
    const ran = cloudFact("cursor", "Questions");
    const call = (run: { record: string; date: string }): string =>
      renderCapabilityMatrixFrom(withCloud(CLIENT_CLOUD_FACTS.map((row) => (row === ran ? { ...row, run } : row))));
    expect(() => call({ record: " ", date: "2026-10-20" })).toThrowError(EngineError);
    expect(() => call({ record: " ", date: "2026-10-20" })).toThrowError(
      /`cursor` cloud fact "Questions" names a person check with no record/,
    );
    expect(() => call({ record: "P2 cloud check", date: "last night" })).toThrowError(
      /`cursor` cloud fact "Questions" dates its person check "last night", which is not an ISO calendar date/,
    );
  });

  it("states Claude Code's GitHub Action as a six-hour job with no question tool by default (REQ-FLOW-113)", () => {
    const cap = cloudFact("claude", "GitHub Action job cap");
    expect(cap.status).toBe("documented");
    expect(cap.fact).toContain("6 hours");
    expect(cap.fact).toContain("never an overnight surface");
    expect(cap.citation).toEqual({ url: "https://docs.github.com/en/actions/reference/limits", accessDate: "2026-10-18" });

    // TEST CHANGE, justified (v11 review, round 1): the row rests on the page's silence, which the
    // status legend calls `not documented` with its read date, not `unverified`.
    const questions = cloudFact("claude", "GitHub Action questions");
    expect(questions.status).toBe("not documented");
    expect(questions.fact).toContain("declared default");
    const questionsRow = rows.find((line) => cells(line)[0] === "`claude`" && cells(line)[1] === questions.subject) ?? "";
    expect(cells(questionsRow)[4]).toBe("not documented, read 2026-10-18");

    // TEST CHANGE, justified (w6-claude-hooks-in-claude-dir, REQ-FLOW-113, REQ-FLOW-104): the hook entries now
    // run the copies under `.claude/hooks/stamity/`, beside the policy document's copy, so the restore covers the
    // scripts the hooks run too; the generated copies are still written and no entry runs them.
    // TEST CHANGE, justified (w6 security lens, round 1, review/158): the restore covers only the scripts of
    // Stamity's own entries. A user hook's or a pack hook's script stays at its own path outside `.claude/`,
    // so the pull request supplies it and the Action runs it; the unqualified "the scripts the hooks run are
    // the base branch's too" was a guarantee that does not hold for those entries, and the row now names
    // that residual.
    const config = cloudFact("claude", "GitHub Action configuration");
    expect(config.status).toBe("documented");
    expect(config.fact).toContain("`.claude/`");
    expect(config.fact).toContain("hook entries are the base branch's");
    expect(config.fact).toContain("`.claude/hooks/stamity/`");
    expect(config.fact).toContain("The scripts Stamity's own entries start");
    expect(config.fact).not.toContain("the scripts the hooks run are the base branch's too");
    expect(config.fact).toContain(
      "A user hook or a pack hook keeps its script at its own path outside `.claude/`, so on a pull request " +
        "that script is the pull request's, and the Action runs it.",
    );
    // The reverted-change limit is stated in the Action's source, not on the cited security page
    // (checked at claude-code-action 5eb090f3), so the row names where it is stated.
    expect(config.fact).not.toContain("the Action's own named limit");
    expect(config.fact).toContain("`src/github/operations/restore-config.ts`");
    expect(config.fact).not.toContain("come from the pull request, so a pull request can change what the guard runs");
    // TEST CHANGE, justified (u5-hook-copies, plan 018 file 2, REQ-FLOW-113, REQ-FLOW-088): the generated copies
    // are no longer written, so the row says they leave on the upgrade's `sync`, which copy a session run by hand
    // starts, and the window an upgrade pull request on a base older than 1.16.0 opens.
    expect(config.fact).toContain(
      "The older copies under `.stamity/generated/hooks/claude/` are no longer written and the upgrade's `sync` removes them",
    );
    expect(config.fact).toContain("a session run by hand starts `.claude/hooks/stamity/stamity-session-start.mjs`");
    expect(config.fact).toMatch(/An upgrade pull request whose base predates 1\.16\.0 runs that base's entries, which name the removed scripts/);
    // TEST CHANGE, justified (ledger row 2026-10-21_packs-rebuilt-02/review/9, the maintainer's decision "Correct
    // the docs, add one step"): releases before 1.9.0 wrote the guard entry with no fail-closed tail, so the row
    // states the window by base version and names the one upgrade step for a base older than 1.9.0.
    expect(config.fact).toContain(
      "From a 1.9.0 to 1.15.x base the guard's entry, failing closed, refuses every tool call until the upgrade merges",
    );
    expect(config.fact).toContain("before 1.9.0 the entry has no fail-closed tail, so the guard does not run on that run");
    expect(config.fact).toContain(
      "A base older than 1.9.0 upgrades through 1.16.0 first, whose settings already name `.claude/hooks/stamity/`, " +
        "or keeps the Action off that one upgrade pull request.",
    );
    expect(config.fact).not.toMatch(/cannot start and the guard's entry, failing closed/);
    expect(config.fact).not.toMatch(/are still (written|emitted)/);
    expect(config.citation.url).toBe("https://github.com/anthropics/claude-code-action/blob/main/docs/security.md");

    // The Action's job prints no session line: no row of it carries one.
    for (const row of [cap, questions, config]) {
      expect(row.sessionStart, row.subject).toBeUndefined();
      expect(personCheck(page, "claude", row.subject), row.subject).toBe("not run");
    }
  });

  it("gives each cloud its unattended rows: the draft-PR ending, questions, and Copilot's chained sessions (REQ-PROVE-044)", () => {
    // Copilot's question fact is its "Ask decisions" row: a `preToolUse` ask is read as deny because
    // no user is there to answer. No separate Copilot "Questions" row is kept (decided in the v11
    // review, round 1).
    const UNATTENDED: Readonly<Partial<Record<Tool, readonly string[]>>> = {
      claude: ["Draft pull request", "Questions"],
      copilot: ["Draft pull request", "Ask decisions", "Session limit", "Next session"],
      cursor: ["Draft pull request", "Questions"],
    };
    for (const [tool, subjects] of Object.entries(UNATTENDED) as [Tool, readonly string[]][]) {
      for (const subject of subjects) {
        const fact = cloudFact(tool, subject);
        expect(fact.sessionStart === undefined || fact.status === "documented", `${tool} ${subject}`).toBe(true);
        const row = rows.find((line) => cells(line)[0] === `\`${tool}\`` && cells(line)[1] === subject);
        expect(row, `${tool} ${subject}`).toBeDefined();
      }
    }
    // Copilot's unattended rows read documented, not run: no Copilot cloud-agent account exists.
    for (const subject of UNATTENDED.copilot ?? []) {
      const row = rows.find((line) => cells(line)[0] === "`copilot`" && cells(line)[1] === subject) ?? "";
      expect([cells(row)[4], cells(row)[6]], subject).toEqual(["documented", "not run"]);
    }
    expect(cloudFact("copilot", "Session limit").fact).toContain("59 minutes");
    expect(cloudFact("copilot", "Next session").fact).toContain("`@copilot`");
    expect(cloudFact("copilot", "Draft pull request").fact).toContain("cannot mark it ready for review");
    expect(cloudFact("claude", "Draft pull request").fact).toContain("refuses a tag push");
    expect(cloudFact("claude", "Questions").fact).toContain("until a person answers");
    // Cursor's pages are silent on whether its pull request is a draft, so that row states the
    // assumption and is dated as such.
    expect(cloudFact("cursor", "Draft pull request").status).toBe("not documented");
    // TEST CHANGE, justified: re-read 2026-10-23 — Cursor's run-modes page says a cloud agent never
    // asks a person to approve an action, so the Questions row is documented from that page.
    expect(cloudFact("cursor", "Questions").status).toBe("documented");
    // Cursor's own push meets no guard, so its row names the wall, as Claude's does.
    expect(cloudFact("cursor", "Draft pull request").fact).toContain("meet no shell guard, held-path hold or scan");
    expect(cloudFact("cursor", "Draft pull request").fact).toContain("branch protection on the default branch");
  });

  it("holds the session start's cloud lines equal to the table's, marker and order included", () => {
    const block = /^const SESSIONS = \[\n([\s\S]*?)\n\];$/m.exec(buildSessionStartScript())?.[1] ?? "";
    const sessions = block
      .split("\n")
      .map((line) => JSON.parse(line.trim().replace(/,$/, "")) as { vars: string[]; lines: string[] });
    const MARKERS: Readonly<Record<string, Tool>> = {
      CLAUDE_CODE_REMOTE: "claude",
      COPILOT_AGENT_PROMPT: "copilot",
      CURSOR_AGENT_SOCKET: "cursor",
    };
    const clientSessions = sessions.filter((session) => MARKERS[session.vars[0] ?? ""] !== undefined);
    expect(clientSessions).toHaveLength(3);
    for (const session of clientSessions) {
      const marker = session.vars[0] ?? "";
      const tool = MARKERS[marker] as Tool;
      expect(session.lines, tool).toEqual(
        CLIENT_CLOUD_FACTS.filter((row) => row.tool === tool && row.sessionStart !== undefined).map(
          (row) => row.sessionStart,
        ),
      );
      expect(cloudFact(tool, "Session marker").fact).toContain(`\`${marker}\``);
    }
    // review/120 and review/121: a session line is printed as a fact, so it rests only on a
    // documented row; an unverified or silent page prints nothing.
    for (const row of CLIENT_CLOUD_FACTS.filter((fact) => fact.sessionStart !== undefined)) {
      expect(row.status, `${row.tool} ${row.subject}`).toBe("documented");
    }
    // Codex Cloud documents no project hook, so no session start runs there to print a line.
    expect(CLIENT_CLOUD_FACTS.some((row) => row.tool === "codex" && row.sessionStart !== undefined)).toBe(false);
  });

  it("is cited by the two guides that state a cloud fact", () => {
    // The guides link pages, not fragments (the docs suite resolves every link as a file), so the
    // citation is the page link and the section's own heading named beside it.
    expect(page.split("\n")).toContain("## Cloud sessions");
    for (const guide of ["docs/customization.md", "docs/troubleshooting.md"]) {
      expect(readFileSync(join(REPO_ROOT, guide), "utf-8").replace(/\s+/g, " "), guide).toContain(
        "[capability matrix](capability-matrix.md) under Cloud sessions",
      );
    }
  });

  it("refuses a cloud fact for an unsupported client, or one left blank", () => {
    const first = CLIENT_CLOUD_FACTS[0]!;
    expect(() => renderCapabilityMatrixFrom(withCloud([...CLIENT_CLOUD_FACTS, { ...first, tool: "windsurf" as Tool }])))
      .toThrowError(/`windsurf`, which is not a supported client/);
    expect(() => renderCapabilityMatrixFrom(withCloud([{ ...first, fact: "  " }, ...CLIENT_CLOUD_FACTS.slice(1)])))
      .toThrowError(/no subject or no fact/);
  });

  it("refuses an undated or unsourced cloud fact, naming it", () => {
    const first = CLIENT_CLOUD_FACTS[0]!;
    const rest = CLIENT_CLOUD_FACTS.slice(1);
    const call = (citation: ClientCloudFact["citation"]): string =>
      renderCapabilityMatrixFrom(withCloud([{ ...first, citation }, ...rest]));
    expect(() => call({ url: " ", accessDate: "2026-10-15" })).toThrowError(EngineError);
    expect(() => call({ url: " ", accessDate: "2026-10-15" })).toThrowError(/`claude` cloud fact "Project hooks" declares a citation with no URL/);
    expect(() => call({ url: first.citation.url, accessDate: "October 2026" })).toThrowError(/ISO calendar date/);
  });

  it("refuses a repeated fact, a second glance row, and a client with none", () => {
    const plain = CLIENT_CLOUD_FACTS.find((row) => row.glance === undefined)!;
    expect(() => renderCapabilityMatrixFrom(withCloud([...CLIENT_CLOUD_FACTS, plain]))).toThrowError(/declared twice/);

    const codexGlance = cloudFact("codex", "Project hooks");
    expect(() =>
      renderCapabilityMatrixFrom(withCloud([...CLIENT_CLOUD_FACTS, { ...codexGlance, subject: "Again" }])),
    ).toThrowError(/gives `codex` two glance rows/);

    const noCursorGlance = CLIENT_CLOUD_FACTS.map((row) => {
      if (row.tool !== "cursor" || row.glance === undefined) return row;
      const { glance: _dropped, ...rest } = row;
      return rest;
    });
    expect(() => renderCapabilityMatrixFrom(withCloud(noCursorGlance))).toThrowError(/no glance row for `cursor`/);
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

  it("states that no plugin container is emitted since the plugin route's deletion", () => {
    // TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees) — the BEHAVIOUR moved
    // back, and this case moved with it. Through 1.14.0 four containers were emitted, one root
    // per client, and the case held the page to saying what each carried. The plugin route and
    // its builders are deleted in 1.15.0, so the case is the old discipline again: neither the
    // render nor the committed page may describe a container, the revisit trigger must say none
    // is emitted, and it must not name the deleted builder. The one thing every form of this
    // case protected, that this client's native skills location is named, is kept at the foot.
    expect(page).not.toContain("## Plugin containers");
    expect(committedPage()).not.toContain("## Plugin containers");
    expect(committedPage()).not.toContain("`stamity plugin setup`");

    const container = triggerFor("Agent Plugins scope expansion");
    expect(container.status).toMatch(/No container is emitted/);
    expect(container.status).not.toMatch(/Four containers are emitted/);
    expect(container.status).not.toContain("generate-plugin-packages");

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

// TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): the "plugin containers"
// block, its fixture and its live-partition case went with the section they rendered. The
// renderer takes no container input since 1.15.0, so there is no section to render, no input to
// refuse and no builder to read; the case above holds the page to naming none.

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
    // TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): compared against
    // `renderCapabilityMatrix()` again, for the reason the drift gate is: the script supplies no
    // plugin containers since 1.15.0, so what it writes is the zero-argument render.
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

describe("always-on cost section", () => {
  // The section renders the pinned ratchet ceilings and the two shared-bytes figures, and
  // refuses inputs that would state a load nobody measured. Both refusals are exercised here
  // because a discipline gate with no test is a comment: the emit lane's coverage floor is
  // what holds this section to its own contract.
  const page = renderCapabilityMatrixFrom(LIVE_CAPABILITY_INPUTS);

  it("renders one row per client with its ceiling and what it loads unconditionally", () => {
    expect(page).toContain("## Always-on cost by client");
    for (const tool of TOOLS) {
      expect(page).toMatch(
        new RegExp(`^\\| \`${tool}\` \\| ${LIVE_CAPABILITY_INPUTS.alwaysOn.ceilings[tool]} \\| `, "m"),
      );
    }
    // CHANGED with the `on-demand` default. The three reasons this asserted were
    // the three shapes under `always-on`, and two of them are no longer what the
    // page says: claude and copilot now pay the charter alone, and codex pays it
    // plus the floors rather than plus every rule. The case still asserts three
    // DISTINCT reasons over the four clients, which is what stops the cell from
    // collapsing into one sentence for everyone — the strings moved with the
    // behaviour, the shape of the claim did not. The `always-on` wordings are
    // asserted below, under the mode they belong to.
    expect(page).toContain("the charter plus the rules that must be unconditional");
    expect(page).toContain(
      "the charter alone — a rule with no globs is pulled in when the conversation matches it",
    );
    expect(page).toContain(
      "the charter alone — a rule with no globs is delivered as a skill instead",
    );
    expect(page).toContain(`${LIVE_CAPABILITY_INPUTS.alwaysOn.sharedBytesWithCodex} bytes`);
    expect(page).toContain(`${LIVE_CAPABILITY_INPUTS.alwaysOn.sharedBytesWithoutCodex} without it`);
    expect(page).toContain(`${LIVE_CAPABILITY_INPUTS.alwaysOn.codexDroppedRuleCount} rules`);
    // ADDED with sw18: the codex-only file's bytes count in codex's own row, and in no other.
    const overrideCell = `${LIVE_CAPABILITY_INPUTS.alwaysOn.codexOverrideBytes} bytes, in its own \`AGENTS.override.md\``;
    expect(page).toMatch(new RegExp(String.raw`^\| \`codex\` \| \d+ \| .*${overrideCell.replaceAll(".", String.raw`\.`)} \|$`, "m"));
    expect(page.split("\n").filter((line) => line.includes(overrideCell))).toHaveLength(1);
    // The paragraph wraps, so its words are compared with the line breaks folded.
    expect(page.replace(/\s+/g, " ")).toContain(
      `the shared root \`AGENTS.md\` is ${LIVE_CAPABILITY_INPUTS.alwaysOn.sharedBytesWithCodex} bytes with codex selected`,
    );
    // ADDED with sw18 review r1: an edit to AGENTS.md reaches the override only where an import
    // decision keeps operator text there; with none or `replace` the next sync restores the file.
    const folded = page.replace(/\s+/g, " ");
    expect(folded).toContain("Under a `supplement` or `skip` import decision the operator's own text");
    expect(folded).toContain("With no import decision, or `replace`, `AGENTS.md` is engine-owned whole");
    expect(folded).not.toContain("on every sync, so an edit to `AGENTS.md` reaches codex");
  });

  it("names each client's delivery of a description-scoped rule in its own column", () => {
    expect(page).toContain("| Delivery of description-scoped rules |");
    // Non-degenerate: cursor's answer differs from the other three, so a column
    // rendering one constant for everyone fails here.
    expect(page).toMatch(/^\| `cursor` \| \d+ \| rule, pulled on relevance \| /m);
    for (const tool of ["claude", "copilot", "codex"] as const) {
      expect(page).toMatch(new RegExp(String.raw`^\| \`${tool}\` \| \d+ \| skill, on demand \| `, "m"));
    }
    expect(page).toContain(`Measured under \`ruleDelivery: ${LIVE_CAPABILITY_INPUTS.alwaysOn.ruleDelivery}\``);
  });

  it("renders the same section under always-on with the other mode's wording", () => {
    // The page describes whichever mode ships. Rendering the alternative proves
    // the cells are derived from the mode rather than typed for today's default,
    // which is the failure the column would otherwise hide when a repo flips it.
    const alternative = renderCapabilityMatrixFrom({
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: { ...LIVE_CAPABILITY_INPUTS.alwaysOn, ruleDelivery: "always-on" },
    });

    expect(alternative).toContain("the charter plus EVERY selected rule");
    expect(alternative).toContain("the charter plus every rule with no globs");
    expect(alternative).toMatch(/^\| `claude` \| \d+ \| rule, every session \| /m);
    // Cursor never depended on the mode, so its cell is the control that does
    // not move between the two renders.
    expect(alternative).toMatch(/^\| `cursor` \| \d+ \| rule, pulled on relevance \| /m);
  });

  it("discloses what codex folds, what it pulls, and the skills-list budget that pays for it", () => {
    const { codexFoldedRuleIds, codexRuleSkillCount, codexSkillsListChars, codexSkillsListCap } =
      LIVE_CAPABILITY_INPUTS.alwaysOn;

    // The renderer hard-wraps its prose, so a sentence spanning a line break is
    // matched against a whitespace-flattened copy rather than against the
    // wrapped bytes — the claim under test is the sentence, not the column it
    // happened to break at.
    const flat = page.replaceAll(/\s+/g, " ");

    for (const id of codexFoldedRuleIds) expect(flat).toContain(`\`${id}\``);
    expect(flat).toContain(`the appendix carries ${codexFoldedRuleIds.length} rules`);
    expect(flat).toContain(`The other ${codexRuleSkillCount} rules are projected as`);
    expect(flat).toContain("`.agents/skills/stamity-<rule-id>/SKILL.md`");
    // Both halves of the budget claim, and they are different numbers: a page
    // carrying only the total, or only the cap, states no headroom at all.
    expect(flat).toContain(`caps that list at ${codexSkillsListCap} characters`);
    expect(flat).toContain(`The full selection measures ${codexSkillsListChars}`);
    expect(codexSkillsListChars).toBeLessThan(codexSkillsListCap);
  });

  it("discloses what co-selecting codex duplicates into the shared skills tree", () => {
    const { sharedTreeDuplicateRules, codexRuleSkillCount } = LIVE_CAPABILITY_INPUTS.alwaysOn;
    const flat = page.replaceAll(/\s+/g, " ");

    expect(flat).toContain("Those directories sit in the SHARED `.agents/skills/` tree");
    // Every client with a non-zero residual is named WITH its count; a page that
    // stated the mechanism and no number would disclose nothing measurable.
    for (const tool of TOOLS) {
      const duplicates = sharedTreeDuplicateRules[tool];
      if (duplicates === 0) continue;
      expect(flat, tool).toContain(`\`${tool}\` ${duplicates}`);
    }
    // The three qualifications that keep the sentence honest: it is a pull, not
    // an always-on load; it moves none of the line figures; a selection without
    // codex does not pay it.
    expect(flat).toContain("pulled on relevance and never loaded at launch");
    expect(flat).toContain("moves none of the line figures above");
    expect(flat).toContain("a selection without `codex` does not pay it at all");
    // And the client the filter took to zero is named as absent rather than
    // silently missing from the list.
    expect(sharedTreeDuplicateRules.claude).toBe(0);
    expect(flat).toContain("`claude` is absent from that list because it reads no shared tree");
    // Non-degenerate: at least one client is over zero and under the tree size,
    // so the sentence is about a real partial overlap rather than all-or-nothing.
    const nonZero = TOOLS.filter((tool) => sharedTreeDuplicateRules[tool] > 0);
    expect(nonZero.length).toBeGreaterThan(0);
    expect(Math.max(...nonZero.map((tool) => sharedTreeDuplicateRules[tool]))).toBeLessThanOrEqual(
      codexRuleSkillCount,
    );
  });

  it("refuses a shared-tree duplicate count no emission could produce", () => {
    const negative = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        sharedTreeDuplicateRules: {
          ...LIVE_CAPABILITY_INPUTS.alwaysOn.sharedTreeDuplicateRules,
          cursor: -1,
        },
      },
    };
    expect(() => renderCapabilityMatrixFrom(negative)).toThrowError(EngineError);
    expect(() => renderCapabilityMatrixFrom(negative)).toThrowError(/`cursor`/);

    const overTree = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        sharedTreeDuplicateRules: {
          ...LIVE_CAPABILITY_INPUTS.alwaysOn.sharedTreeDuplicateRules,
          copilot: LIVE_CAPABILITY_INPUTS.alwaysOn.codexRuleSkillCount + 1,
        },
      },
    };
    expect(() => renderCapabilityMatrixFrom(overTree)).toThrowError(/more copies than the tree/);
  });

  it("refuses a skills-list total that was never measured or that the emission would reject", () => {
    const unmeasured = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: { ...LIVE_CAPABILITY_INPUTS.alwaysOn, codexSkillsListChars: 0 },
    };
    expect(() => renderCapabilityMatrixFrom(unmeasured)).toThrowError(EngineError);
    expect(() => renderCapabilityMatrixFrom(unmeasured)).toThrowError(/never measured/);

    const overCap = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        codexSkillsListChars: LIVE_CAPABILITY_INPUTS.alwaysOn.codexSkillsListCap + 1,
      },
    };
    expect(() => renderCapabilityMatrixFrom(overCap)).toThrowError(/refuses/);

    const noFloors = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: { ...LIVE_CAPABILITY_INPUTS.alwaysOn, codexFoldedRuleIds: [] },
    };
    expect(() => renderCapabilityMatrixFrom(noFloors)).toThrowError(/names no rule/);
  });

  it("refuses a client with no measured ceiling", () => {
    const zeroed = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        ceilings: { ...LIVE_CAPABILITY_INPUTS.alwaysOn.ceilings, copilot: 0 },
      },
    };
    const call = (): string => renderCapabilityMatrixFrom(zeroed);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`copilot`/);
    expect(call).toThrowError(/no measured ceiling/);

    const unmeasured = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        ceilings: { ...LIVE_CAPABILITY_INPUTS.alwaysOn.ceilings, cursor: Number.NaN },
      },
    };
    expect(() => renderCapabilityMatrixFrom(unmeasured)).toThrowError(/`cursor`/);
  });

  // TEST CHANGE, justified (sw18-codex-rules-leave-shared-charter, REQ-PROVE-005). This
  // case fed EQUAL shared figures and expected a refusal, because codex's appendix used to
  // grow the shared file and equal figures meant a stale reading. The appendix now lives in
  // the codex-only AGENTS.override.md, so equal is the only valid state: the guard refuses
  // any DIFFERENCE, in either direction, and a second case below refuses an override that
  // is not larger than the file it repeats.
  it("refuses shared-bytes figures that differ with and without codex", () => {
    const { sharedBytesWithoutCodex } = LIVE_CAPABILITY_INPUTS.alwaysOn;
    for (const sharedBytesWithCodex of [sharedBytesWithoutCodex + 1, sharedBytesWithoutCodex - 1]) {
      const unequal = {
        ...LIVE_CAPABILITY_INPUTS,
        alwaysOn: { ...LIVE_CAPABILITY_INPUTS.alwaysOn, sharedBytesWithCodex },
      };
      const call = (): string => renderCapabilityMatrixFrom(unequal);
      expect(call).toThrowError(EngineError);
      expect(call).toThrowError(/same with and without it and one of these two is stale/);
    }
  });

  it("refuses a codex override no larger than the shared file it repeats", () => {
    const shrunk = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        codexOverrideBytes: LIVE_CAPABILITY_INPUTS.alwaysOn.sharedBytesWithoutCodex,
      },
    };
    const call = (): string => renderCapabilityMatrixFrom(shrunk);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/cannot be the smaller of the two/);
    // Non-degenerate: the live figures render.
    expect(() => renderCapabilityMatrixFrom(LIVE_CAPABILITY_INPUTS)).not.toThrow();
  });

  // REQ-FLOW-114 (review/80): Cursor's cloud block is appended to the shared file with cursor
  // selected, so a with-cursor figure no larger than the charter's, or an empty block, is a
  // stale reading the page would otherwise publish.
  it("refuses a with-cursor shared file no larger than the charter's", () => {
    const unchanged = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: {
        ...LIVE_CAPABILITY_INPUTS.alwaysOn,
        sharedBytesWithCursor: LIVE_CAPABILITY_INPUTS.alwaysOn.sharedBytesWithoutCodex,
      },
    };
    const call = (): string => renderCapabilityMatrixFrom(unchanged);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/the block cannot be empty; one is stale/);
  });

  it("refuses a Cursor cloud block of no lines", () => {
    const empty = {
      ...LIVE_CAPABILITY_INPUTS,
      alwaysOn: { ...LIVE_CAPABILITY_INPUTS.alwaysOn, cursorBlockLines: 0 },
    };
    const call = (): string => renderCapabilityMatrixFrom(empty);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/the block cannot be empty; one is stale/);
  });
});

describe("client section edges the floor holds", () => {
  // Two branches the live declarations never take: a citation with an empty URL, and a
  // client declaring no caps. Both are reachable by any adapter edit, so both are exercised
  // rather than left to the coverage floor to notice one day.
  it("refuses a citation with no URL", () => {
    const facts = factsFor("cursor");
    const call = (): string =>
      renderCapabilityMatrixFrom(
        withFacts("cursor", { citations: [{ ...facts.citations[0]!, url: "   " }] }),
      );
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`cursor`/);
    expect(call).toThrowError(/no URL/);
  });

  it("renders a client with no declared caps as exactly that", () => {
    const page = renderCapabilityMatrixFrom(withFacts("cursor", { caps: [] }));
    expect(page).toContain("Declared caps: none.");
  });
});

/**
 * Plan 022 file 2, unit b18-vendor-claims (spec carries no ids for the client fact tables; nearest
 * REQ-PROVE-045, the dated-source rule). The client fact tables were checked against the vendors' pages:
 * the pages the b18 cell names on 2026-10-23, and the pages the citation stamps cover on 2026-10-26 (ledger
 * row review/80). Red on the parent: the rows below carried 2026-09-10, 2026-09-17 and 2026-09-30, the
 * Copilot deny-gate row named no editor, and Cursor's Questions row read "not documented".
 */
describe("the 2026-10-23 and 2026-10-26 vendor reads (b18-vendor-claims)", () => {
  const page = renderCapabilityMatrix();
  const FLOOR = "2026-10-14";
  // Claude's sub-agents page was not read whole by either read, so it keeps 2026-09-30 and stays
  // outside the floor; the agent row dates the one claim fetched from it on 2026-10-26 inline.
  const CLAUDE_SUB_AGENTS = "https://code.claude.com/docs/en/sub-agents";

  it("holds no access date older than 2026-10-14 on the rows the reads covered", () => {
    const named: { label: string; date: string }[] = [
      ...factsFor("claude")
        .citations.filter((c) => c.url !== CLAUDE_SUB_AGENTS)
        .map((c) => ({ label: `claude ${c.url}`, date: c.accessDate })),
      ...factsFor("cursor").citations.map((c) => ({ label: `cursor ${c.url}`, date: c.accessDate })),
      // Copilot's one-stamp pages and its hooks reference; the CLI command reference (read 2026-10-10
      // for the effort scale) was not part of the re-read and keeps its own date.
      ...factsFor("copilot")
        .citations.filter((c) => !c.url.endsWith("/cli-command-reference"))
        .map((c) => ({ label: `copilot ${c.url}`, date: c.accessDate })),
      ...factsFor("codex")
        .citations.filter((c) => c.url.endsWith("/docs/hooks") || c.url.endsWith("/subagents"))
        .map((c) => ({ label: `codex ${c.url}`, date: c.accessDate })),
      { label: "copilot Ask decisions", date: cloudFact("copilot", "Ask decisions").citation.accessDate },
      { label: "cursor Questions", date: cloudFact("cursor", "Questions").citation.accessDate },
    ];
    // Non-degenerate: every client contributes, so a dropped citation list cannot pass vacuously.
    expect(named.length).toBeGreaterThanOrEqual(4 + 5 + 7 + 2 + 2);
    for (const { label, date } of named) expect(date >= FLOOR, `${label} read ${date}`).toBe(true);
    // The rendered page carries none of the parent's stale dates on those rows' sources.
    for (const tool of ["claude", "cursor"] as const) {
      const sources = section(page, `### \`${tool}\``).filter(
        (line) => line.startsWith("- <") && !line.includes(CLAUDE_SUB_AGENTS),
      );
      expect(sources.length).toBeGreaterThan(0);
      for (const line of sources) expect(line, line).not.toMatch(/accessed 2026-09-(10|17|30)$/);
    }
    // The page no read covered keeps its last whole read, so Claude's oldest-source signal stays true.
    expect(factsFor("claude").citations.find((c) => c.url === CLAUDE_SUB_AGENTS)?.accessDate).toBe("2026-09-30");
    expect(triggerFor("Claude Code AGENTS.md support change").watch).toBe("claude");
    expect(page).toContain("`claude`, oldest source read 2026-09-30");
  });

  it("names VS Code on Copilot's hooks rows: the deny-gate cap and the editor trigger", () => {
    const cap = capOfFacts("copilot", "deny-gate");
    expect(cap).toContain("VS Code also reads `.github/hooks/*.json` (Preview)");
    expect(cap).toContain("`.claude/settings.json` hooks beside it");
    expect(section(page, "### `copilot`").join("\n")).toContain(cap);
    const trigger = triggerFor("VS Code deny-gate GA").status;
    expect(trigger).toContain("VS Code reads the repository's `.github/hooks/*.json`");
    // The renderer holds no ISO date literal, so the trigger carries none either.
    expect(trigger).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("reads Cursor's Questions row as documented from the run-modes page, and Copilot's ask as deny in autopilot too", () => {
    const questions = cloudFact("cursor", "Questions");
    expect(questions.status).toBe("documented");
    expect(questions.citation.url).toBe("https://cursor.com/docs/agent/security/run-modes");
    expect(questions.fact).toContain("never asks a person to approve an action");
    const row = tableRows(section(page, "## Cloud sessions")).find(
      (line) => cells(line)[0] === "`cursor`" && cells(line)[1] === "Questions",
    );
    expect(cells(row ?? "")[4]).toBe("documented");
    const ask = cloudFact("copilot", "Ask decisions");
    expect(ask.fact).toContain("autopilot reads it as deny too, since 1.0.97");
    // The printed session line is unchanged: it answers in the cloud agent's session only.
    expect(ask.sessionStart).toBe("An ask answer is read as deny.");
  });

  it("says Copilot CLI applies the path-specific instruction files from 1.0.100", () => {
    expect(capOfFacts("copilot", "rule-activation")).toContain("Copilot CLI applies these path-specific files from 1.0.100");
    expect(factsFor("claude").ruleShape).toContain("Also read by VS Code Copilot and by Copilot CLI");
    // review/80: the memory page (read 2026-10-26) takes `paths` as a YAML list or a comma-separated
    // string, and loads a path-scoped rule on a read, write or edit of a matching file.
    expect(factsFor("claude").ruleShape).toContain("glob patterns as a YAML list or a comma-separated string");
    expect(factsFor("claude").ruleShape).toContain("loads when Claude reads, writes or edits a matching file");
    expect(factsFor("claude").ruleShape).not.toContain("a YAML glob list, matched when Claude reads a file");
    // review/80: the sub-agents page keeps 2026-09-30, so the one claim fetched from it later is dated inline.
    expect(factsFor("claude").agentsFormat).toContain(
      "`permissionMode`, `disallowedTools` and `autoCompactWindow` (2.1.296 or later; sub-agents page, read 2026-10-26)",
    );
    // review/81: the autopilot claim names the changelog entry it rests on and when that was read.
    expect(cloudFact("copilot", "Ask decisions").fact).toContain(
      "(the CLI's changelog entry for 1.0.97, dated 2026-10-13, read 2026-10-26)",
    );
  });
});

/** One declared cap's value, or the empty string. */
function capOfFacts(tool: Tool, name: string): string {
  return factsFor(tool).caps.find((row) => row.name === name)?.value ?? "";
}
