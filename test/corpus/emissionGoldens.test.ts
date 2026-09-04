import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../src/content/catalog.ts";
import { composeFrontmatter, parseFrontmatter } from "../../src/content/frontmatter.ts";
import {
  cursorCompanionFrontmatter,
  planMdcCompanions,
  type MdcCompanion,
} from "../../src/content/mdcCompanions.ts";
import {
  DETECTION_UNKNOWN,
  REPO_SUBSTITUTION_TOKENS,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type DetectedRepoContext,
  type VerificationGateSet,
} from "../../src/emit/substitution.ts";
import { planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { AGENT_POLICY_ROSTER } from "../../src/roster/agentPolicies.ts";
import {
  AGENT_TOOL_POLICIES_FILE,
  AGENT_TOOL_POLICIES_SCHEMA,
  buildAgentToolPoliciesJson,
  validateToolPolicies,
} from "../../src/tools/allowlist.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import { loadCorpusIndex, walkAllMarkdown } from "./harness.ts";

/**
 * Emission goldens: the byte-level regression net over the kernel builders —
 * the catalog walk, the `.mdc` companions, the frontmatter round-trip,
 * substitution, the policy document, and the core hook scripts.
 *
 * No `AdapterOutput`-level golden lives here, and the reason is the split, not
 * an absent layer: this suite goldens BUILDER OUTPUT from in-process calls,
 * while `test/emit/crossClientGoldens.test.ts` goldens the EMITTED TREE that
 * the real init pipeline writes for all four adapters into temp directories.
 * (The header used to say the emission planner was "still the no-op seam", so
 * there was nothing to golden. It has not been a seam for some time —
 * `src/emit/planner.ts` is the plan composer, and the sibling suite has
 * goldened every adapter end to end for some time.) The two families that appear in
 * both are goldened byte-exactly HERE and excluded there: the per-tool hook
 * script copies and the agent-tool policy document.
 *
 * Snapshot update discipline: a snapshot diff IS a reviewed artifact change.
 * Read the diff as you would a shipped file before accepting it — running
 * `vitest -u` without that review defeats the whole net. What feeds each
 * golden, so a moved snapshot is attributable:
 *
 *   - catalog          — `src/content/catalog.ts` walking `content/`
 *   - mdc companions   — `src/content/mdcCompanions.ts` over the indexed rules
 *   - round-trip       — `src/content/frontmatter.ts` (parse/compose pair)
 *   - substitution     — `src/emit/substitution.ts` over the charter, work,
 *                        and test-runner bodies
 *   - policy document  — `src/roster/agentPolicies.ts` serialized by
 *                        `src/tools/allowlist.ts`. The serializer also accepts
 *                        rows an install supplies, resolved by
 *                        `src/roster/agentGrants.ts` and stamped with a
 *                        `source` — but the emission composer hands it none
 *                        today, so this golden is the shipped roster alone and
 *                        a pack row appearing in it is a change to report, not
 *                        one to accept.
 *   - hook scripts     — `src/hooks/scripts.ts`, embedding constants from
 *                        `src/denyscan/denyScan.ts` (deny patterns),
 *                        `src/learnings` + `src/handoffs` (size caps),
 *                        `src/tools/allowlist.ts` (schema discriminator),
 *                        `src/tools/translator.ts` (client tool names), and
 *                        `src/hooks/model.ts` (per-client fail modes) — an
 *                        engine change to any of those legitimately moves these
 *                        snapshots, and the diff review names the module.
 *                        The CORE plan is three scripts on the portable event
 *                        triple and stays three: the review gate
 *                        (`stamity-review-gate.mjs`) is claude residue
 *                        planned by `src/adapters/claude.ts`, so it is
 *                        goldened in `test/emit/crossClientGoldens.test.ts`
 *                        and a fourth script here would mean the core plan
 *                        grew.
 *
 * Determinism is asserted before every snapshot (two builds, identical
 * output): a nondeterministic golden input is an engine bug to report, never
 * something to sort around in a test.
 *
 * Reviewed refreshes, newest first — each committed after reading the diff as
 * a file review, so a later reader can attribute every moved line:
 *
 *   - 2026-09-04, the closure run's eval-repair wave. SUBSTITUTION moved on
 *     `charter/stamity-charter.md` alone, 4513 -> 4655 bytes at an unchanged
 *     91 lines: invariant 1 now says that a hand-off framed so the operator can
 *     close without the floor is itself the relaxation, and names invariant 4's
 *     `Not done:` report as the honest exit. The paragraph took the line that
 *     invariant 3 freed by rewrapping from three lines to two, which is why the
 *     line count holds. Of the +142, +140 is the content edit byte for byte and
 *     +2 is this snapshot's own escaping of the two new backticks — the golden
 *     diff is the content edit and nothing else, so substitution passed the new
 *     prose through and left no token behind.
 *
 *     NOTHING else moved here. `commands/st-work.md` and
 *     `agents/stamity-test-runner.md` — the other two substitution targets —
 *     are byte-identical, and so are the catalog, the MDC companion heads, the
 *     policy document and the three core hook scripts. The wave's second corpus
 *     edit, `rules/stamity-security-patterns.md`'s floor item 9, reaches this
 *     suite only through the MDC companion head, which is frontmatter and did
 *     not move; its body lands in the sibling suite's three rule dialects and
 *     in the codex appendix, itemised there.
 *
 *   - 2026-09-04, the closure run's Minor-findings fix pass. NOTHING moved in
 *     this snapshot, and that is the reviewed result rather than a skipped
 *     refresh. The pass changed two emitted surfaces — `commands/st-rework.md`
 *     (the persistence guard's secret-scan step gains the clause that the
 *     secrets floor still governs what the run itself writes, net-zero in lines
 *     inside the guard) and the claude review-gate hook script (33820 -> 34294
 *     bytes, the reviewer's under-lock content-fault report now carrying the
 *     same recovery hint the unlocked path gives). This suite holds neither: it
 *     carries no command bodies, and the review gate is claude adapter residue
 *     goldened in the sibling suite. The three core hook scripts and every
 *     charter body are byte-identical across the pass, which is the containment
 *     claim rather than an absence of evidence; the sibling ledger itemises the
 *     moved bytes.
 *
 *   - 2026-09-04, the closure run's review round 1 fix pass. NOTHING moved in
 *     this snapshot, and that is the reviewed result rather than a skipped
 *     refresh: the round's only emitted-surface change is the claude review-gate
 *     hook script (32108 -> 33820 bytes, the counter's stat now distinguishing a
 *     sharing hold from an absent file), which is a generated script and not a
 *     corpus body, so it appears in the sibling suite alone. Its ledger row
 *     there carries the reasoning; this entry exists so a reader comparing the
 *     two ledgers sees the refresh was run against both.
 *
 *   - 2026-09-04, the closure run's execution wave. SUBSTITUTION moved on
 *     `charter/stamity-charter.md` alone, 4443 -> 4513 bytes at an unchanged
 *     91 lines: invariant 7 now says that handing the operator a line, diff,
 *     or file body to paste is the same protocol violation as an orchestrator
 *     editing product files inline, and the paragraph rewrapped inside its own
 *     four lines. The golden diff is that content edit byte for byte, so
 *     substitution passed the new prose through and left no token behind.
 *
 *     NOTHING else moved here. `commands/st-work.md` and
 *     `agents/stamity-test-runner.md` — the other two substitution targets —
 *     are byte-identical, and so are the catalog, the MDC companion heads, the
 *     policy document and the three core hook scripts. The wave also edited
 *     six corpus bodies this suite does not hold (`st-ask`, `st-plan`,
 *     `st-rework`, `st-spec`, `agents/stamity-design-quality.md` and
 *     `agents/stamity-performance.md`) and rewrote the lock handling in
 *     `stamity-review-gate.mjs`, which is claude adapter residue goldened in
 *     the sibling suite; the three core scripts staying byte-identical across
 *     that rewrite is the containment claim, not an absence of evidence. The
 *     moved bytes for all of it are itemised in the sibling ledger.
 *
 *   - 2026-09-04, the recommended-next-step close-out — Package 8, carried from
 *     the last package's register sweep by name. NOTHING moved here, and the
 *     row exists so the two ledgers stay in step. The wave changed six corpus
 *     command bodies — `st-ask`, `st-debug`, `st-quick`, `st-spec`, `st-rework`
 *     and `st-pr-resolve` — each gaining one closing paragraph that names a
 *     recommended next step derived from the run's own state, which makes all
 *     nine touchpoints carry the line. This suite holds none of the six bodies:
 *     its substitution golden is `commands/st-work.md` and its MDC companion
 *     heads are rules, so no golden here has a byte to move. The moved bytes
 *     are itemised in the sibling ledger.
 *
 *   - 2026-09-02, the identity casing fix. HOOK SCRIPTS moved, and only on the
 *     three operator-facing lines that speak the product name: the session-start
 *     "no learnings and no resumable handoffs" line and the config-tamper
 *     notice's two, each of which opened `Stamity:` and now opens `stamity:`.
 *     The name is written lowercase wherever it is spoken, sentence-initial
 *     included, and these were the last three places in `src/hooks/scripts.ts`
 *     that capitalised it. Twelve lines across the four clients — the same three
 *     strings, goldened once per client — and nothing else in either script
 *     body moved.
 *
 *   - 2026-09-02, the closure run's content wave plus the codex floor ranking.
 *     SUBSTITUTION moved on `commands/st-work.md` again — the review-loop
 *     paragraph now says the gate rides both client events fail-closed and
 *     spends its one blocking status on the completion event, and the QA
 *     checkpoint says the qa skill is invoked BY NAME because the step belongs
 *     to the command already running rather than to a trigger match. MDC
 *     COMPANION heads moved for two rules: `injection-screening` (its
 *     description now covers run-time ingress that never lands in the state
 *     directory) and `learnings-schema` (the authoring contract folded into the
 *     writer that enforces it, leaving the curation posture the description now
 *     states). Nothing else in either set moved.
 *
 *     The same wave moved eight more corpus artifacts and changed WHICH rules
 *     the codex appendix delivers — `api-versioning` is dropped whole so the
 *     larger `floor:security` screening rule can hold its rank — none of which
 *     this suite holds. Recorded so the two ledgers stay in step; the moved
 *     bytes are itemised in the sibling ledger.
 *
 *   - 2026-09-02, the closure run's close-out. SUBSTITUTION moved on
 *     `commands/st-work.md` again: the run-exit invariant gained the sentence
 *     that it binds at exit and that a run holding a live question has not
 *     exited — asking is not a pending finding — and the severity floor gained
 *     the half it was missing, naming who closes a Minor row that never reaches
 *     the QA checkpoint. Both were found by the eval set: a scenario refused to
 *     close a run with an open finding and asked instead, which the judge scored
 *     a failure and which turned out to be two shipped texts contradicting each
 *     other rather than a model error. `commands/st-plan.md` also moved (unit
 *     `requirements` field, L4 lint row) but carries no golden body here.
 *
 *   - 2026-09-01, the closure run. Two refreshes, recorded together because
 *     they landed in one arc and only one of them reached this suite:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` alone, from the content
 *     batch. Three edits: the light intensity row stopped claiming it skips
 *     "specialist passes" wholesale and now names the two lenses it drops and
 *     the security lens it keeps on a trigger-path match — the charter's
 *     universal floor holds at every tier, so a tier that shed the security
 *     lens outright made that floor false; the deep row and the frontier
 *     ladder cell stopped citing "Prove-final", a stage name defined nowhere
 *     in the tree, and now place the whole-branch pass where it runs, once the
 *     review loop converges and before the QA checkpoint; and the
 *     dependency-audit note stopped restating the dep-audit skill's own fields
 *     and points at the skill that owns them. Nothing else in the substitution
 *     set moved.
 *
 *     NOTHING moved from the timing-margin pass in the same arc, recorded so
 *     the two ledgers stay in step: the script that changed is
 *     `stamity-review-gate.mjs`, claude adapter residue this suite does not
 *     hold, and its three core scripts are byte-identical across that refresh.
 *     The moved bytes are itemised in the sibling ledger.
 *
 *   - 2026-08-26, the review-gate lock rewrite (windows leg, round 2). NOTHING
 *     moved here, recorded so the two ledgers stay in step: the script that
 *     changed is `stamity-review-gate.mjs`, claude adapter residue this suite
 *     does not hold. Its three core scripts are byte-identical across the
 *     refresh, which is the point -- a lock fix that had leaked into the
 *     portable scripts would have moved them. The moved bytes are itemised in
 *     the sibling ledger.
 *
 *   - 2026-08-18, the model-ladder provenance rewrite (integration fixer round
 *     1). SUBSTITUTION moved on `commands/st-work.md` alone: the ladder
 *     section gained the paragraphs naming the agent file as the one place a
 *     role's class is declared, the table as a restatement that decides
 *     nothing, the omit-rather-than-guess rule for a class no client resolves,
 *     and the two placements the flow makes for itself — the shipped half of
 *     the `src/roster/modelLadder.ts` header rewrite. The golden diff is that
 *     content edit byte for byte, which is the point: substitution passed the
 *     new prose through and left no token behind, and the residue accounting
 *     above still reads zero for this body. CATALOG and the POLICY DOCUMENT
 *     did not move — no id, class or grant changed — and neither did the
 *     charter or test-runner substitution goldens, so the edit stayed inside
 *     the one body it was aimed at.
 *
 *   - 2026-08-17, three goldens moved together on the rework build. CATALOG
 *     gained `agent:design-quality`, `agent:performance` and `agent:security`
 *     (the specialist tier) — three added rows, nothing
 *     renamed or dropped. POLICY DOCUMENT gained the matching read-only rows
 *     (the specialist tier plus grant resolution), taking the roster from
 *     seven to ten. SUBSTITUTION moved on TWO bodies:
 *       `commands/st-work.md` — the specialist pass, the
 *         review-gate paragraph, the round-4 cap wording and the
 *         reworked model-class table;
 *       `charter/stamity-charter.md` — the `## Conditional layer`
 *         section rewritten to split the twelve rules into nine glob-scoped and
 *         three description-scoped and to state that a description-scoped
 *         rule's cost depends on the client. +400 bytes on every charter
 *         render, which the sibling suite records as `AGENTS.md` 3804 → 4204.
 *     The test-runner body did not move, and the hook-script and mdc-companion
 *     goldens did not move at all.
 *
 *     LEDGER CORRECTION, kept in place: this row previously said SUBSTITUTION
 *     moved "on `commands/st-work.md` alone" and that "the charter and
 *     test-runner bodies did not move". The charter body did move, in this same
 *     commit, and its own golden here carries the diff. The sibling ledger in
 *     `test/emit/crossClientGoldens.test.ts` carried the matching error and is
 *     corrected there; a refresh recorded wrong in one of the two leaves half
 *     the emitted surface misattributed, which is why both are fixed together.
 */

/** Emission layout the guard is planned against: the policy document one level above the scripts. */
const POLICY_PATH_FROM_SCRIPT = `../${AGENT_TOOL_POLICIES_FILE}`;

/** A well-formed substitution token, per the engine's own grammar (`substitution.ts` TOKEN_PATTERN). */
const WELL_FORMED_TOKEN = /\$\{STAMITY:[A-Z_]+\}/g;

/** The raw token prefix. Prose can carry it without forming a token — see the residue accounting below. */
const RAW_TOKEN_PREFIX = "${STAMITY:";

/** Fixed detection fixture: one linter, one test framework, one CI provider. */
const DETECTED: DetectedRepoContext = {
  linters: ["eslint"],
  testFrameworks: ["vitest"],
  ciProviders: ["github-actions"],
};

/** The nothing-detected posture: every detection list renders the sentinel. */
const NOTHING_DETECTED: DetectedRepoContext = {
  linters: [],
  testFrameworks: [],
  ciProviders: [],
};

/** Fixed verification-gate fixture; values are opaque shell strings to the engine. */
const GATES: VerificationGateSet = {
  test: "npx vitest run",
  lint: "npx eslint .",
  typecheck: "npx tsc --noEmit",
  all: "npx tsc --noEmit && npx eslint . && npx vitest run",
};

/** The three corpus bodies the substitution goldens resolve. */
const SUBSTITUTION_TARGETS = [
  "charter/stamity-charter.md",
  "commands/st-work.md",
  "agents/stamity-test-runner.md",
] as const;

/** Element at `index`, or a loud failure — keeps index reads honest under noUncheckedIndexedAccess. */
function at<T>(items: readonly T[], index: number): T {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`no element at index ${index} (length ${items.length})`);
  }
  return item;
}

/** Occurrences of `needle` in `haystack`. */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Every well-formed token in `text`, in document order. */
function wellFormedTokens(text: string): string[] {
  return text.match(WELL_FORMED_TOKEN) ?? [];
}

/** Both substitution passes composed; the module contract makes the order immaterial. */
function resolveBody(body: string, ctx: DetectedRepoContext): string {
  return substituteVerificationGateTokens(substituteRepoTokens(body, ctx), GATES);
}

/** One catalog item as a golden row: `type:id -> relativePath`, plus precedence where set. */
function catalogRow(item: CatalogItem): string {
  const precedence = item.precedence === undefined ? "" : ` (precedence: ${item.precedence})`;
  return `${item.type}:${item.id} -> ${item.relativePath}${precedence}`;
}

/** The planned companion for one rule, or a loud failure naming the rule. */
function companionFor(companions: readonly MdcCompanion[], rule: CatalogItem): MdcCompanion {
  const companion = companions.find((candidate) => candidate.sourcePath === rule.filePath);
  if (companion === undefined) {
    throw new Error(`no companion planned for rule ${rule.id} (${rule.relativePath})`);
  }
  return companion;
}

/** The parsed bodies of the substitution targets, keyed by corpus-relative path. */
async function substitutionBodies(): Promise<Map<string, string>> {
  const files = await walkAllMarkdown();
  const bodies = new Map<string, string>();
  for (const relPath of SUBSTITUTION_TARGETS) {
    const file = files.find((candidate) => candidate.relPath === relPath);
    if (file === undefined) {
      throw new Error(`substitution target missing from corpus: ${relPath}`);
    }
    bodies.set(relPath, file.parsed.body);
  }
  return bodies;
}

describe("emission goldens — catalog", () => {
  it("indexes the corpus to sorted, collision-free, POSIX-addressed rows", async () => {
    const index = await loadCorpusIndex();
    const rebuilt = await loadCorpusIndex();

    // Determinism first: two walks over one corpus serialize identically.
    const rows = index.items.map(catalogRow).toSorted();
    expect(rebuilt.items.map(catalogRow).toSorted()).toEqual(rows);

    // Collisions are asserted empty, not snapshotted: a contested identity is
    // a corpus defect to fix, never a state to pin.
    expect(index.collisions).toEqual([]);

    // POSIX relative paths are the engine contract — asserted, never converted,
    // so a platform-dependent walk fails here instead of forking the snapshot.
    for (const item of index.items) {
      expect(item.relativePath).not.toContain("\\");
    }

    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toMatchSnapshot();
  });
});

describe("emission goldens — mdc companions", () => {
  it("plans a warning-free companion per rule whose body is the source body, byte for byte", async () => {
    const index = await loadCorpusIndex();
    const warnings: string[] = [];
    const companions = planMdcCompanions(index.items, { warnings });

    // Determinism: planning is pure over the index.
    expect(planMdcCompanions(index.items, { warnings: [] })).toEqual(companions);

    const rules = index.items.filter((item) => item.type === "rule");
    // Reviewed constant: the shipped rule class is 12 artifacts. A corpus
    // change moves this number together with the catalog golden above.
    expect(rules).toHaveLength(12);
    // Non-rule artifacts yield no companion, so the unfiltered index plans
    // exactly one companion per rule.
    expect(companions).toHaveLength(rules.length);
    // No deprecated frontmatter shapes ship in the corpus: the sink stays empty.
    expect(warnings).toEqual([]);

    const heads = new Map<string, string>();
    for (const rule of rules) {
      const companion = companionFor(companions, rule);
      const head = cursorCompanionFrontmatter(rule.frontmatter, { source: rule.relativePath });
      // The transform's core property: derived head over the untouched body.
      expect(companion.content).toBe(`${head}\n${rule.body}`);
      // Reader-level body identity — byte compare, not snapshot: what a client
      // parses back out of the companion is exactly the source rule body.
      expect(parseFrontmatter(companion.content, companion.outputPath).body).toBe(rule.body);
      expect(companion.outputPath).toBe(rule.filePath.replace(/\.md$/, ".mdc"));
      heads.set(rule.id, head);
    }

    const sortedHeads = Object.fromEntries(
      [...heads.entries()].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(sortedHeads).toMatchSnapshot();
  });
});

describe("emission goldens — frontmatter round-trip", () => {
  it("compose(parse(file)) re-parses to the same head and the same body bytes for every artifact", async () => {
    const files = await walkAllMarkdown();
    const artifacts = files.filter((file) => file.parsed.hadFrontmatter);
    expect(artifacts.length).toBeGreaterThan(0);

    for (const file of artifacts) {
      const composed = composeFrontmatter(file.parsed.frontmatter, file.parsed.body);
      const reparsed = parseFrontmatter(composed, file.relPath);
      // Parse-level identity for the head: compose hoists the LEAD_KEYS
      // deterministically, so byte identity of the head would false-negative
      // on any artifact whose author ordered keys differently. The compared
      // objects carry the file path so a failure names the artifact.
      expect({ file: file.relPath, had: reparsed.hadFrontmatter }).toEqual({
        file: file.relPath,
        had: true,
      });
      expect({ file: file.relPath, head: reparsed.frontmatter }).toEqual({
        file: file.relPath,
        head: file.parsed.frontmatter,
      });
      // BYTE-level identity for the body — the half emission ships verbatim.
      expect({ file: file.relPath, body: reparsed.body }).toEqual({
        file: file.relPath,
        body: file.parsed.body,
      });
    }
  });
});

describe("emission goldens — substitution", () => {
  it("resolves every well-formed token in both fixture variants, leaving no residue", async () => {
    const bodies = await substitutionBodies();
    for (const [relPath, body] of bodies) {
      // Every token the source carries is one the engine wires, so a clean
      // output below is attributable to substitution rather than to a token
      // the residue grammar happens to miss.
      for (const token of wellFormedTokens(body)) {
        expect(REPO_SUBSTITUTION_TOKENS).toContain(token);
      }

      for (const ctx of [DETECTED, NOTHING_DETECTED]) {
        const output = resolveBody(body, ctx);
        // Residue = an unresolved well-formed token. None survive.
        expect({ file: relPath, residue: wellFormedTokens(output) }).toEqual({
          file: relPath,
          residue: [],
        });
        // Raw-prefix accounting: the only `${STAMITY:` occurrences allowed to
        // survive are the ones that never formed a token in the source. The
        // test-runner body documents the prefix in prose (exactly one, its
        // unresolved-token detection instruction), so a bare zero-substring
        // assertion is unsatisfiable there by the artifact's own design;
        // charter and work carry none, so for them this IS the strict zero.
        const proseOnly = countOf(body.replace(WELL_FORMED_TOKEN, ""), RAW_TOKEN_PREFIX);
        expect(countOf(output, RAW_TOKEN_PREFIX)).toBe(proseOnly);
        expect(proseOnly).toBe(relPath === "agents/stamity-test-runner.md" ? 1 : 0);
      }
    }
  });

  it("renders detected values, and the literal sentinel when detection is empty", async () => {
    const bodies = await substitutionBodies();
    const charter = bodies.get("charter/stamity-charter.md") ?? "";

    const detected = resolveBody(charter, DETECTED);
    expect(detected).toContain("Linter: eslint");
    expect(detected).toContain("Test framework: vitest");
    expect(detected).toContain("CI provider: github-actions");
    expect(detected).toContain(`Tests: \`${GATES.test}\``);

    const empty = resolveBody(charter, NOTHING_DETECTED);
    expect(empty).toContain(`Linter: ${DETECTION_UNKNOWN}`);
    expect(empty).toContain(`Test framework: ${DETECTION_UNKNOWN}`);
    expect(empty).toContain(`CI provider: ${DETECTION_UNKNOWN}`);
  });

  it("matches the committed goldens for the detected-fixture outputs", async () => {
    const bodies = await substitutionBodies();
    for (const [relPath, body] of bodies) {
      const output = resolveBody(body, DETECTED);
      // Determinism, asserted rather than assumed of the pure function.
      expect(resolveBody(body, DETECTED)).toBe(output);
      expect(output).toMatchSnapshot(relPath);
    }
  });
});

describe("emission goldens — policy document", () => {
  it("serializes the shipped roster byte-stably and matches the committed golden", () => {
    const document = buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER);
    // Determinism: two serializations of one roster are byte-identical.
    expect(buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER)).toBe(document);

    const parsed = JSON.parse(document) as { schema?: unknown };
    expect(parsed.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);

    // Full-text snapshot: key order, indentation, id sort — the snapshot
    // itself asserts the byte-stable serialization contract.
    expect(document).toMatchSnapshot();
  });

  it("carries one core row per shipped agent, id-sorted, with no policy problem", () => {
    // Stated rather than only snapshotted: a snapshot refresh can absorb a
    // dropped row without a reader noticing, and this document is the
    // client-side half of the two enforcement points. Reviewed constant: the
    // roster is ten agents — seven spine roles plus the three specialists added
    // later. A roster change moves this number with the golden above.
    const ids = AGENT_POLICY_ROSTER.map((row) => row.agentId);
    expect(ids).toHaveLength(10);
    expect(ids).toEqual([...new Set(ids)]);

    // Every problem the validator names is a defect in the shipped roster.
    expect(validateToolPolicies(AGENT_POLICY_ROSTER)).toEqual([]);

    // The SERIALIZED order is the contract a client reads, so it is asserted
    // on the document rather than on the source array.
    const parsed = JSON.parse(buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER)) as {
      schema: string;
      policies: { agentId: string; allow: string[]; rationale: string }[];
    };
    expect(parsed.schema).toBe(AGENT_TOOL_POLICIES_SCHEMA);
    expect(parsed.policies.map((policy) => policy.agentId)).toEqual(ids.toSorted());
    // Non-degenerate: every emitted row grants something and says why.
    for (const policy of parsed.policies) {
      expect({ id: policy.agentId, grants: policy.allow.length > 0 }).toEqual({
        id: policy.agentId,
        grants: true,
      });
      expect(policy.rationale.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * Why the committed script goldens look the way they do. Each entry is a
 * refresh that was reviewed rather than `-u`'d, newest first; both movements
 * are absorbed into the snapshot below.
 *
 * `stamity-session-start.mjs`, all four tools — the embedded screen gained ten
 * `block`-severity rows and its invisible-character class was rewritten. The
 * screen now composes three catalogs instead of two (`INJECTION_PATTERNS` joins
 * `LEARNINGS_INJECTION_PATTERNS` and `CONTENT_DENY_PATTERNS` in
 * `src/hooks/scripts.ts`), which is what carries chat-template tokens, role
 * headers, base64 overrides and Unicode-tag payloads into a screen that had
 * none of them; and the class is now the full `Default_Ignorable_Code_Point`
 * property rather than a six-range hand-list (`src/denyscan/denyScan.ts`), so a
 * keyword split by CGJ or a variation selector no longer walks through. The
 * movement is additive in both directions — no row left the screen, and the
 * id-level pins in `test/hooks/scripts.test.ts` are what prove it, since a
 * snapshot alone cannot tell a gained row from a swapped one.
 *
 * `stamity-pre-tool-use-guard.mjs`, all four tools — the guard's embedded
 * `TOOL_CATEGORY` map gained `"Skill": "read"` and `"Task": "spawn"`. The guard
 * derives that map from `CLAUDE_TOOL_NAMES` in `src/tools/translator.ts`, and
 * the adapter phase resolved the two names the table had left unmapped: `Task`
 * is the accepted alias of `Agent` (same `spawn` category), and `Skill` is
 * side-effect-free procedure ingestion (`read`). Both were previously absent,
 * so a client payload naming either refused as `UNKNOWN_TOOL` — a wrong denial,
 * not a safe default. The movement was exactly the two added rows.
 */
describe("emission goldens — hook scripts", () => {
  /**
   * Blocking posture per tool, held by hand so the emitted bytes are pinned by
   * something other than the code that produced them.
   *
   * Two client facts decide a row, not one. `copilot` is `false` for the fail
   * mode the guarantee ladder publishes — it never honours a hook exit status.
   * `cursor` is `false` for the second, independent reason: its tool-call
   * payload carries no agent identity, so the guard's scope test never matches
   * and no refusal is ever reached to enforce. A body claiming otherwise
   * advertises an enforcement point that returns early on every call it sees.
   */
  const BLOCKING_BY_TOOL: Record<Tool, boolean> = {
    claude: true,
    codex: true,
    cursor: false,
    copilot: false,
  };

  it.each(TOOLS)("plans three deterministic scripts for %s on the portable event triple", (tool) => {
    const scripts = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool);
    const again = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool);
    // Determinism first: two plans produce byte-identical script bodies.
    expect(again.map((script) => script.content)).toEqual(scripts.map((script) => script.content));

    expect(scripts).toHaveLength(3);
    expect(scripts.map((script) => script.event)).toEqual([
      "session_start",
      "pre_tool_use",
      "session_start",
    ]);

    // The guard embeds the same schema discriminator the policy golden
    // carries — quoted from that golden's own bytes, binding the two.
    const goldenSchema = (
      JSON.parse(buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER)) as { schema: string }
    ).schema;
    const guard = at(scripts, 1);
    expect(guard.content).toContain(`const POLICY_SCHEMA = ${JSON.stringify(goldenSchema)};`);
    expect(guard.content).toContain(`const BLOCKING = ${BLOCKING_BY_TOOL[tool]};`);

    for (const script of scripts) {
      expect(script.content).toMatchSnapshot(script.fileName);
    }
  });

  it("gives claude the exit-2 blocking path and copilot the reporting-only path", () => {
    const claudeGuard = at(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, "claude"), 1);
    expect(claudeGuard.content).toContain("Blocking client: a refusal exits 2 and the action stops.");
    expect(claudeGuard.content).toContain("const BLOCK_EXIT = 2;");
    expect(claudeGuard.content).toContain("const BLOCKING = true;");

    const copilotGuard = at(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, "copilot"), 1);
    expect(copilotGuard.content).toContain(
      "Reporting-only client: this client never blocks on a hook exit status,",
    );
    expect(copilotGuard.content).toContain("const BLOCKING = false;");
  });
});
