import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { LEAN_LINE_THRESHOLDS } from "../../../src/content/userContent.ts";
import { AGENT_POLICY_ROSTER } from "../../../src/roster/agentPolicies.ts";
import { SPECIALIST_TRIGGER_TABLE } from "../../../src/roster/triggers.ts";
import { FUNCTIONAL_TOOL_CATEGORIES } from "../../../src/tools/categories.ts";
import { CONTENT_PREFIX } from "../../../src/types/markers.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The three trigger-conditional specialists — `security`, `design-quality`,
 * `performance` — as a contract over their shipped bodies.
 *
 * What this suite binds beyond the corpus-wide frontmatter contract:
 *
 *   - **Read-only, by frontmatter and by roster.** `capabilities` is what the tool-policy
 *     roster and the emitted guard derive a grant from. A specialist that gained `edit`
 *     would answer its own finding in the following round, so the grant is asserted on
 *     both ends and the two ends are compared.
 *   - **The four mandated sections.** A specialist is defined by what pulls it in, what it
 *     refuses to raise, the precision bar it holds itself to, and what it hands back.
 *     Delete any one of those headings and the agent stops being a specialist, so each is
 *     asserted as its own top-level section.
 *   - **Body-to-roster lockstep.** The `Trigger` section names the patterns the roster
 *     holds. The roster is the single source; this suite fails when the body drifts from
 *     it, which is the drift a reader cannot detect by reading either file alone.
 *   - **The precision number is one number.** The false-positive bar is pinned here and
 *     asserted to appear in every body, so a body cannot quietly relax its own bar.
 *   - **No runnable checks in a body.** Check bodies live in the verify skill's per-axis
 *     references. A fenced block in an agent body is how a copy of a check gets in, and a
 *     copy drifts from the axis it came from.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a reflowed
 * paragraph is not a failure; structural assertions run against the raw body.
 */

/**
 * The four model classes — the half of the Model-Independence Contract this suite owns.
 *
 * The other half, that no shipped body names a vendor or a model id, is invariant 17 in
 * `test/corpus/invariants.test.ts`: ONE token list over EVERY shipped markdown file. This
 * suite used to carry its own regex over its own three files; that copy was deleted
 * because eight such copies, no two alike, are how a vendor name ships
 * green on one axis while its sibling would have failed the build. Widen `VENDOR_TOKENS`
 * there; do not mint a copy here — the re-add guard in that suite scans this file.
 */
const MODEL_CLASSES: readonly string[] = ["frontier", "advanced", "standard", "economy"];

/** The nine touchpoints: every `/st-*` mention in these bodies must resolve to one. */
const COMMAND_IDS: readonly string[] = [
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

/** Body cap for an agent: the engine's own lean ceiling, made hard for canonical content. */
const AGENT_BODY_CAP = LEAN_LINE_THRESHOLDS.agent;

/** The shared return-contract status enums every sub-agent body inlines. */
const STATUS_ENUMS: readonly string[] = [
  "DONE",
  "BLOCKED_AMBIGUITY",
  "BLOCKED_DEPENDENCY",
  "BLOCKED_FAILURE",
];

/**
 * The false-positive ceiling every specialist holds itself to, as a whole percent.
 * Pinned once here: a body stating a different number fails, rather than shipping a
 * specialist whose bar is whatever its own prose last said.
 */
const FALSE_POSITIVE_BAR_PERCENT = 10;

/** The sections a specialist body is defined by; each is asserted present and non-empty. */
const REQUIRED_SECTIONS: readonly string[] = [
  "Trigger",
  "Exclusions",
  "Precision contract",
  "Return contract",
];

interface Specialist {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  /** Privilege grant, mirroring what the agent-policy roster hands this role. */
  capabilities: string[];
  modelClass: string;
  /** The verify-skill axis references this body points at, in place of inlining checks. */
  axisReferences: string[];
}

const SPECIALISTS: readonly Specialist[] = [
  {
    id: "security",
    relPath: "agents/stamity-security.md",
    // The one specialist on the protected floor. `floor:security` is not a
    // capability tag — it is the inclusion marker that keeps this agent out of
    // a trimmed selection, alongside the three security rules it reads. Without
    // it the rules ship floored and the agent that applies them does not.
    tags: ["review", "floor:security"],
    capabilities: ["read"],
    modelClass: "advanced",
    axisReferences: ["references/security.md"],
  },
  {
    id: "design-quality",
    relPath: "agents/stamity-design-quality.md",
    tags: ["review"],
    capabilities: ["read"],
    modelClass: "advanced",
    axisReferences: ["references/ui.md", "references/ux.md"],
  },
  {
    id: "performance",
    relPath: "agents/stamity-performance.md",
    tags: ["review"],
    capabilities: ["read"],
    modelClass: "standard",
    axisReferences: ["references/performance.md"],
  },
];

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** The body with every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flow(file: CorpusFile): string {
  return file.parsed.body.replace(/\s+/g, " ");
}

/** The text of a top-level `## <heading>` section, up to the next top-level heading. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** The trigger row the roster holds for a specialist's runtime id. */
function rosterRow(id: string) {
  const runtimeId = `${CONTENT_PREFIX}${id}`;
  const row = SPECIALIST_TRIGGER_TABLE.find((entry) => entry.specialist === runtimeId);
  expect(row, `${runtimeId}: no row in SPECIALIST_TRIGGER_TABLE`).toBeDefined();
  return row!;
}

describe("specialist agents — frontmatter contract", () => {
  it.each(SPECIALISTS)("$id carries the agent identity head", async (agent) => {
    const file = await load(agent.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(agent.id);
    expect(filenameSlug(file.relPath)).toBe(agent.id);
    expect(frontmatterField(file.parsed, "type")).toBe("agent");
    expect(frontmatterField(file.parsed, "tags")).toEqual(agent.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Agents load on spawn. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it.each(SPECIALISTS.filter((agent) => agent.id !== "performance"))(
    "$id's deletion trigger carries the bar itself, not a pointer at prose",
    async (agent) => {
      const trigger = String(frontmatterField((await load(agent.relPath)).parsed, "obsolete_when"));

      // docs/reference/agents.md renders this value as a frontmatter-only row, so
      // "the bar stated below" resolved there to the NEXT agent's block. The number
      // the body already states now travels with the trigger.
      expect(trigger).toContain(`below ${FALSE_POSITIVE_BAR_PERCENT}%`);
      expect(trigger).not.toMatch(/stated below|gate below|the bar\b(?!\s+of)/i);
    },
  );

  it.each(SPECIALISTS)("$id is read-only, on the file and in the roster", async (agent) => {
    const file = await load(agent.relPath);
    const capabilities = frontmatterField(file.parsed, "capabilities");

    expect(capabilities).toEqual(["read"]);
    expect(capabilities).toEqual(agent.capabilities);
    for (const capability of agent.capabilities) {
      expect(FUNCTIONAL_TOOL_CATEGORIES as readonly string[]).toContain(capability);
    }
    // A specialist that could edit would review its own fix in the following round; one
    // that could execute or fetch would be a read-only reviewer with a side channel.
    for (const withheld of ["edit", "execute", "network", "spawn", "planning"]) {
      expect(capabilities as readonly string[], `${agent.id} must not hold ${withheld}`).not.toContain(
        withheld,
      );
    }

    // The pair a new agent must edit: the file's grant and the roster row are one grant
    // expressed twice, so they are compared rather than each asserted alone.
    const row = AGENT_POLICY_ROSTER.find(
      (entry) => entry.agentId === `${CONTENT_PREFIX}${agent.id}`,
    );
    expect(row, `${agent.id}: no policy row — the guard would answer NO_POLICY`).toBeDefined();
    expect([...(row?.allow ?? [])]).toEqual(capabilities);

    // `tools:` is the engine's target-tool restriction, not a privilege grant.
    expect(frontmatterField(file.parsed, "tools")).toBeUndefined();
  });

  it.each(SPECIALISTS)("$id declares a plain model class from the ladder", async (agent) => {
    const file = await load(agent.relPath);

    expect(frontmatterField(file.parsed, "model_class")).toBe(agent.modelClass);
    expect(MODEL_CLASSES).toContain(agent.modelClass);
  });
});

describe("specialist agents — body budget and write-path hygiene", () => {
  it.each(SPECIALISTS)("$id stays inside the agent body cap and scans clean", async (agent) => {
    const file = await load(agent.relPath);

    assertLineCap(file, AGENT_BODY_CAP);
    assertDenyClean(file);
  });

  it.each(SPECIALISTS)("$id opens with an H1 equal to its bare id", async (agent) => {
    const file = await load(agent.relPath);

    expect(file.parsed.body.trimStart().startsWith(`# ${agent.id}\n`)).toBe(true);
  });

  it.each(SPECIALISTS)("$id mentions only touchpoints that exist", async (agent) => {
    const file = await load(agent.relPath);
    const mentioned = [...file.parsed.body.matchAll(/\/st-([a-z][a-z-]*)/g)].map(
      (match) => match[1],
    );

    for (const id of new Set(mentioned)) {
      expect(COMMAND_IDS, `${file.relPath}: /st-${id} is not a touchpoint`).toContain(id);
    }
  });

  it.each(SPECIALISTS)("$id embeds no runnable check block", async (agent) => {
    const file = await load(agent.relPath);

    // Runnable checks live in the verify skill's per-axis references. A fence is how a
    // copy of one gets into an agent body, and a copy drifts from the axis it came from.
    expect(file.parsed.body, `${file.relPath}: fenced block in an agent body`).not.toContain("```");
  });

  it.each(SPECIALISTS)("$id points at the verify axis it loads on demand", async (agent) => {
    const text = flow(await load(agent.relPath));

    for (const reference of agent.axisReferences) {
      expect(text, `${agent.id}: no pointer to ${reference}`).toContain(reference);
    }
    expect(text).toMatch(/not restated here/i);
  });
});

describe("specialist agents — the four mandated sections", () => {
  it.each(SPECIALISTS)("$id carries every required section, each with a body", async (agent) => {
    const file = await load(agent.relPath);

    for (const heading of REQUIRED_SECTIONS) {
      expect(file.parsed.body, `${file.relPath}: missing "## ${heading}"`).toContain(
        `\n## ${heading}\n`,
      );
      // A heading with nothing under it satisfies a `toContain` and satisfies nothing else.
      expect(section(file, heading).trim().length, `${file.relPath}: "${heading}" is empty`)
        .toBeGreaterThan(80);
    }
  });

  it.each(SPECIALISTS)("$id states triggers that match its roster row exactly", async (agent) => {
    const trigger = section(await load(agent.relPath), "Trigger");
    const row = rosterRow(agent.id);

    // The roster is the single source; the body names what it holds. Both directions are
    // checked, so neither a pattern added to the roster nor one left behind in the body
    // can pass as agreement.
    for (const pattern of row.triggerPaths) {
      expect(trigger, `${agent.id}: Trigger omits roster pattern ${pattern}`).toContain(
        `\`${pattern}\``,
      );
    }
    const stated = [...trigger.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
    for (const pattern of stated) {
      expect(
        row.triggerPaths as readonly string[],
        `${agent.id}: Trigger states ${pattern}, which the roster does not hold`,
      ).toContain(pattern);
    }
  });

  it.each(SPECIALISTS)("$id excludes named classes rather than hedging", async (agent) => {
    const exclusions = section(await load(agent.relPath), "Exclusions").replace(/\s+/g, " ");

    // Each row must name a class and say it is not raised — an exclusion list that only
    // says "use judgment" excludes nothing and holds no rate down.
    expect(exclusions).toMatch(/not raise|out of scope|is not raised|not posted/i);
    const rows = exclusions.match(/- \*\*/g) ?? [];
    expect(rows.length, `${agent.id}: fewer than four exclusion rows`).toBeGreaterThanOrEqual(4);
  });

  it.each(SPECIALISTS)("$id states one false-positive bar, with its meter and its kill switch", async (agent) => {
    const contract = section(await load(agent.relPath), "Precision contract").replace(/\s+/g, " ");

    // The number is pinned in this suite: a body relaxing its own bar fails here.
    expect(contract).toContain(`${FALSE_POSITIVE_BAR_PERCENT}%`);
    const stated = [...contract.matchAll(/(\d+)%/g)].map((match) => Number(match[1]));
    expect(stated.length, `${agent.id}: no percentage in the precision contract`).toBeGreaterThan(0);
    for (const value of stated) {
      expect(value, `${agent.id}: a second, different bar appears`).toBe(
        FALSE_POSITIVE_BAR_PERCENT,
      );
    }

    // How it is measured, and what happens at the bar. Without both, the number is a claim.
    //
    // TEST CHANGE, justified: `/downgrades itself to advisory/` pinned a
    // self-downgrade keyed on a rate the agent could read back. Nothing computes that
    // rate — the QA checkpoint records no per-finding disposition and nothing under
    // `.stamity/` persists one — so the assertion was pinning an unreachable mechanism.
    // What replaces it is stricter, not weaker: the meter's real scope is asserted
    // word for word, the switch's thrower is asserted, and the negative case below
    // fails the moment a body claims a persisted rate again.
    expect(contract).toMatch(/QA checkpoint/i);
    expect(contract).toMatch(/operator-observed, per run, unpersisted/i);
    expect(contract).toMatch(/kill switch/i);
    expect(contract).toMatch(/operator-thrown/i);
    expect(contract).toMatch(/opens the run in advisory mode/i);
    expect(contract).toMatch(/declared in the return/i);
    expect(contract).toMatch(/re-qualification/i);
  });

  it.each(SPECIALISTS)("$id claims no persisted rate and no self-computed threshold", async (agent) => {
    const file = await load(agent.relPath);
    const body = flow(file);
    const contract = section(file, "Precision contract").replace(/\s+/g, " ");

    // The three claims that had no mechanism behind them. The QA checkpoint
    // carries no findings or disposition column, its handback returns a shippability
    // sign-off rather than dispositions, and nothing under `.stamity/` stores a finding
    // or a rate — so a body asserting any of these describes a meter that cannot run.
    expect(contract).not.toMatch(/every finding reaching it carries a disposition/i);
    expect(contract).not.toMatch(/dismissals over posted findings is the rate/i);
    expect(contract).not.toMatch(/(?:at or above|when the rate (?:reaches|hits))\s*10%/i);
    expect(contract).not.toMatch(/a measured window/i);
    // No window vocabulary anywhere in the body: a "window" is the thing nothing keeps.
    expect(body).not.toMatch(/in the same window/i);
    expect(body).not.toMatch(/window holding fewer than/i);

    // And the positive half — the bar survives the rewrite rather than being deleted
    // with the mechanism, and it is stated with the scope that is actually true.
    expect(contract).toContain(`**below ${FALSE_POSITIVE_BAR_PERCENT}%**`);
    expect(contract).toMatch(/cannot read its own rate back/i);
    expect(section(file, "Return contract").replace(/\s+/g, " ")).toMatch(
      /no rate is reported/i,
    );
  });

  it.each(SPECIALISTS)("$id inlines the shared return contract", async (agent) => {
    const contract = section(await load(agent.relPath), "Return contract");

    for (const status of STATUS_ENUMS) {
      expect(contract).toContain(status);
    }
    // Rendering, not just presence: every agent body writes the enum backticked and
    // pipe-separated, so the ten bodies read as one contract rather than ten spellings.
    expect(contract).toContain(
      `**status:** ${STATUS_ENUMS.map((status) => `\`${status}\``).join(" | ")}.`,
    );
    for (const severity of ["Critical", "Warning", "Minor"]) {
      expect(contract).toContain(severity);
    }
    expect(contract.replace(/\s+/g, " ")).toMatch(
      /Sub-agents do not put questions to the operator/i,
    );
  });

  it.each(SPECIALISTS)("$id carries the posting gates: path:line evidence and a severity floor", async (agent) => {
    const contract = section(await load(agent.relPath), "Return contract").replace(/\s+/g, " ");

    expect(contract).toContain("`path:line`");
    expect(contract).toMatch(/only `Critical` and `Warning` findings reach the human/i);
    expect(contract).toMatch(/`Minor` rows are ledgered/i);
  });
});

describe("performance — advisory unless budgets", () => {
  it("blocks only on a breached declared budget and caps everything else at Warning", async () => {
    const file = await load("agents/stamity-performance.md");
    const advisory = section(file, "Advisory unless budgets").replace(/\s+/g, " ");

    expect(advisory).toMatch(/a declared budget makes a finding blocking/i);
    expect(advisory).toMatch(/measured past one is `Critical`/i);
    expect(advisory).toMatch(/the strongest finding available is a `Warning`/i);
    expect(advisory).toMatch(/neither passed nor failed/i);

    // The severity ceiling is restated where a caller reads the result, not only where the
    // rule is argued — a rule stated once and dropped from the return contract is a rule
    // the consumer never sees.
    const contract = section(file, "Return contract").replace(/\s+/g, " ");
    expect(contract).toMatch(/`Critical` requires a breached declared budget/i);
  });
});

describe("design-quality — merged lens, deepened rather than duplicated", () => {
  it("names success criteria and the token source instead of restating the reviewer's rubric", async () => {
    const file = await load("agents/stamity-design-quality.md");
    const beyond = section(file, "Beyond the reviewer's lens").replace(/\s+/g, " ");

    // The merge is the point: one agent over interface and flow, stated as such.
    expect(flow(file)).toMatch(/one agent over both/i);
    // Depth over the lens: criteria by number, and the repo's own token source as the
    // authority. Restating the reviewer's UI/UX rows here would be the duplication this
    // tier exists to avoid.
    expect(beyond).toMatch(/WCAG 2\.2 AA criterion/i);
    expect(beyond).toContain("1.4.3");
    expect(beyond).toContain("4.1.2");
    expect(beyond).toMatch(/token source named by the design-system inventory is the authority/i);
    expect(beyond).toMatch(/four-state contract/i);
  });
});

describe("security — always-on-match, not always-on", () => {
  it("scopes itself to its trigger surfaces and says why the difference matters", async () => {
    const trigger = section(await load("agents/stamity-security.md"), "Trigger").replace(
      /\s+/g,
      " ",
    );

    expect(trigger).toMatch(
      /always-on-match means every change on these surfaces, not every change in the repository/i,
    );
    // The roster backs the claim: a `*` row would make the agent always-on outright.
    expect(rosterRow("security").triggerPaths as readonly string[]).not.toContain("*");
  });

  it("carries the resource-level census and the boundary map the lens does not", async () => {
    const beyond = section(
      await load("agents/stamity-security.md"),
      "Beyond the reviewer's lens",
    ).replace(/\s+/g, " ");

    expect(beyond).toMatch(/resource-level authorization census/i);
    expect(beyond).toMatch(/verifies a session but not the caller's claim on the specific record/i);
    expect(beyond).toMatch(/trust-boundary map/i);
    // OWASP ids are vocabulary, never the finding itself.
    expect(beyond).toContain("`A01`");
    expect(beyond).toContain("`ASI01`");
    // RR-S1: the web ids move between editions, so the edition is named beside them.
    // `ASI01`-`ASI10` stay unversioned — that series has one published edition.
    expect(beyond).toContain("OWASP Top 10:2025");
    expect(beyond).toMatch(/`A01`–`A10` from OWASP Top 10:2025/);
    expect(beyond).toMatch(/numbering moves between editions/i);
    expect(beyond).not.toMatch(/ASI01`–`ASI10` from OWASP/);

    // The edition pin is a WORDING change: no id value in this file moved. The
    // shipped set is the two range endpoints of each series and nothing else —
    // per-category ids are the verify axis's, not this body's.
    const ids = new Set(
      [...(await load("agents/stamity-security.md")).raw.matchAll(/\b(ASI\d{2}|A\d{2})\b/g)].map(
        (match) => match[1],
      ),
    );
    expect([...ids].toSorted()).toEqual(["A01", "A10", "ASI01", "ASI10"]);
    expect(beyond).toMatch(/category id with no `path:line` behind it is not a finding/i);
    // A body that shipped attack strings would poison every context it is read into.
    expect(beyond).toMatch(/never carries a payload string/i);
  });
});
