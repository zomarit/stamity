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
  substituteCharterTokens,
  substituteCliTokens,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type CharterInvariants,
  type DetectedRepoContext,
  type VerificationGateSet,
} from "../../src/emit/substitution.ts";
import { planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { buildPortableHookRunner } from "../../src/hooks/portableRunner.ts";
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
 * The package and version the core scripts' CLI hints pin (sw26-engine-cli-call-form,
 * REQ-FLOW-002). Passed as a literal, not read from this checkout, so the bytes
 * under test are the same in a renamed fork.
 */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };

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
 *   - 2026-10-10, plan 019 file 3, unit q9t-board-inbox-rules, review round 1
 *     (run 2026-10-10_next-tier; ledger rows review/41 to review/45, build/25
 *     and build/26). NOTHING moved in this suite; the row keeps the two
 *     ledgers in step. The round's one emitted change is `commands/st-board.md`,
 *     26656 -> 27308 bytes and 444 -> 454 lines, all of it inside
 *     `## Deferral inbox` (the Writers bullet's `/st-work` clause, the
 *     filler-alone trigger, the `scheduled` retire value, and the withheld or
 *     skipped row a close lists and never decides). It is not a substitution
 *     target, the catalog, the policy document or a core hook script, so no
 *     golden here carries it; the sibling suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q10a-work-close (run
 *     2026-10-10_next-tier; REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-019,
 *     REQ-FLOW-024, REQ-CTX-020). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 33304 -> 34899 bytes and
 *     471 -> 485 lines in the corpus source, five hunks. The Severity floor
 *     closes a Minor row "through the close's leftovers part, where each
 *     reaches the person as a leftover with its recommendation" and opens its
 *     last sentence "Before the close," (edited within its seven lines). "The
 *     close asks once" gains a four-line pointer, "The leftovers join it as a
 *     fourth part, by `/st-board`'s Leftovers at a close", set before the
 *     paragraph's last sentence (+4 lines). The Proof block gains a
 *     "**Leftovers line.**" paragraph after the usage lines (+3). The append
 *     paragraph puts a deferred row below the inbox's schedule-rule heading
 *     with `by:` or `when:` unless the close dropped it or scheduled it
 *     elsewhere, reads "scheduled to a place with a date or a trigger", and
 *     ends "and each accepted risk", rewrapped whole (+1). The fixed-row
 *     paragraph's last sentence becomes three: an answered inbox row follows
 *     `/st-board`'s Removal rule, a withheld or skipped row is listed and
 *     never decided, and "A row no answer reached stays as it is." (+6). All
 *     five sit below the re-attachment cut (`### Specialist pass` holds at
 *     17076). No token sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, unit q9t-board-inbox-rules (run
 *     2026-10-10_next-tier; REQ-FLOW-076, REQ-FLOW-074, REQ-FLOW-075,
 *     REQ-FLOW-024). NOTHING moved in this suite; the row keeps the two
 *     ledgers in step. The unit's one emitted change is `commands/st-board.md`,
 *     22255 -> 26656 bytes and 383 -> 444 lines, all of it inside
 *     `## Deferral inbox` (the schedule fields of the row grammar, the
 *     `decision-waiting` triage order, the come-back and answer rules of
 *     Removal, the widened `/st-work` retirer and the new last bullet,
 *     "Leftovers at a close"). It is not a substitution target, the catalog,
 *     the policy document or a core hook script, so no golden here carries
 *     it; the sibling suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q4t-ladder-placement-text (run
 *     2026-10-10_next-tier; REQ-LADDER-003, the plan's `build/87` row). ONE
 *     golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 33178 -> 33304 bytes and
 *     470 -> 471 lines in the corpus source, one hunk. The Model ladder
 *     paragraph's last sentence opens "The three placements no agent file can
 *     declare that this table records are the flow's own escalations and
 *     drop" and ends "and the escalation fixer's effort step (Review loop)
 *     are two more, which no row records" (+58, three lines become four). The
 *     table's frontier cell gains ", and for the one closure re-review after
 *     an escalation (Review loop)" and closes "flow placements, declared by
 *     no agent file" (+68, edited in place). Both sit below the re-attachment
 *     cut (`### Specialist pass` holds at 17076). No token sits in the moved
 *     text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, unit q3b-plan-size-text (run
 *     2026-10-10_next-tier; REQ-FLOW-070). NOTHING moved in this suite; the
 *     row keeps the two ledgers in step. The unit's two emitted changes are
 *     `commands/st-plan.md`, 26510 -> 26954 bytes and 411 -> 412 lines (the
 *     Plan-lint gate's L5 row and the return line's `L5 none|<n> advisory`),
 *     and `skills/st-verify/SKILL.md`, 7007 -> 7135 bytes at an unchanged 129
 *     lines (one line naming the four L5 codes, and the closing paragraph's
 *     last word pulled up a line). Neither is a substitution target, the
 *     catalog, the policy document or a core hook script, so no golden here
 *     carries them; the sibling suite itemises both.
 *
 *   - 2026-10-10, plan 019 file 3, unit q6c-copilot-effort-key (run
 *     2026-10-10_next-tier; REQ-LADDER-004). NOTHING moved in this suite; the
 *     row keeps the two ledgers in step. The unit's one emitted change is a
 *     frontmatter line, `reasoning-effort: <level>`, closing the ten Copilot
 *     agent files. A Copilot residue file is not a substitution target, not
 *     the catalog, not the policy document and not a core hook script, so no
 *     golden here carries it; the sibling suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q3a-plan-size-script, its review
 *     round 1 fix (run 2026-10-10_next-tier; review/12 with build/7;
 *     REQ-FLOW-070). NOTHING moved in this suite; the row keeps the two
 *     ledgers in step. The fix's one emitted change is
 *     `skills/st-verify/scripts/spec-plan-coverage.mjs`, 17656 -> 17916 bytes
 *     and 302 -> 304 lines: `delta-verbose` also reads a delta entry headed
 *     `### ADDED REQ-…`, `### MODIFIED REQ-…` or `### REMOVED REQ-…`. A skill
 *     script is no golden of this suite, as the unit's own row below says;
 *     the sibling suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q6b-copilot-instructions-key (run
 *     2026-10-10_next-tier; REQ-FLOW-071). NOTHING moved in this suite; the
 *     row keeps the two ledgers in step. The unit's one emitted change is a
 *     frontmatter line, `include-custom-instructions: true`, on the ten
 *     Copilot agent files, +34 bytes each. A Copilot residue file is not a
 *     substitution target, not the catalog, not the policy document and not a
 *     core hook script, so no golden here carries it; the sibling suite
 *     itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q3a-plan-size-script (run
 *     2026-10-10_next-tier; REQ-FLOW-070). NOTHING moved in this suite; the
 *     row keeps the two ledgers in step. The unit's one emitted change is
 *     `skills/st-verify/scripts/spec-plan-coverage.mjs`, 15373 -> 17656 bytes
 *     and 262 -> 302 lines: plan-lint L5's four advisory size codes and the
 *     unindented-heading rule for units. A skill script is not a substitution
 *     target, not the catalog, not the policy document and not a core hook
 *     script, so no golden here carries it; the sibling suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, fixer round 1 of unit q1t-frame-inbox-read
 *     (run 2026-10-10_next-tier; REQ-FLOW-019, REQ-FLOW-068, review/28 with
 *     build/15 and review/29 as signed off). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 33157 -> 33178 bytes at an
 *     unchanged 470 lines in the corpus source, one hunk. Frame step 4's first
 *     sentence opens "Read and surface the deferral inbox rows whose paths
 *     overlap this change's files" (+12: the duty to show the matched rows,
 *     which the unit's first commit dropped), and its never-open rule reads
 *     "A row it withholds or skips is listed as it prints" (+9: a row the
 *     query skips is named too). The step is rewrapped in place at an
 *     unchanged ten lines, every other word as it was. It sits above the
 *     re-attachment cut (`### Specialist pass` moves 17055 -> 17076). No token
 *     sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, second commit of unit q1t-frame-inbox-read
 *     (run 2026-10-10_next-tier; REQ-FLOW-068, q1a's security re-review as
 *     signed off). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 33164 -> 33157 bytes and
 *     469 -> 470 lines in the corpus source, three hunks. Frame step 4's
 *     withheld-row sentence reads "A row it withholds is listed as it prints,
 *     the person's to read; never open the inbox for it." (nine lines become
 *     ten, the rest of the step rewrapped and unchanged). The Plan-artifact
 *     intake bullet loses the label "Discovery:" and reads "keep those whose
 *     head" and "Two still matching is one ambiguity-gate question",
 *     rewrapped at an unchanged five lines. The Freshness guard bullet loses
 *     ", unrestated" and reads "Only two head keys are read", rewrapped at an
 *     unchanged four lines. All sit above the re-attachment cut (`###
 *     Specialist pass` moves 17062 -> 17055). No token sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, unit q1t-frame-inbox-read (run
 *     2026-10-10_next-tier; REQ-FLOW-068, REQ-FLOW-019, ledger row review/1).
 *     ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 32764 -> 33164 bytes and
 *     467 -> 469 lines in the corpus source, four hunks. Frame step 4's
 *     first sentence is replaced: the run reads the inbox rows that match its
 *     change through the `ledger` verb's `inbox` query (`--paths`, `--plan`),
 *     lists a row the query withholds as it prints, reads the whole file only
 *     when the CLI or that query is absent, and reports any other failure (a
 *     refusal, a crash, a failing exit) as a finding (five lines become nine,
 *     the rest of the step rewrapped and unchanged). The Freshness guard's
 *     last sentence drops "recorded" and pulls its last line up. The Decompose
 *     bullet's in-flow plan sentence ends "the record's `Plan:` line names
 *     it". The Coverage before Build bullet's last sentence reads "A
 *     structural pass alone is not clarity." and pulls its last line up. All
 *     four sit above the re-attachment cut (`### Specialist pass` moves
 *     16662 -> 17062). No token sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, fixer round 1 of unit
 *     q6t-test-runner-ci-line (run 2026-10-10_next-tier; review/14 as signed
 *     off). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on agents/stamity-test-runner.md, 8754 -> 8809 bytes
 *     at an unchanged 157 lines in the corpus source: the Gate set's
 *     `unknown`-provider sentence also fires where the provider "is still an
 *     unresolved `STAMITY` substitution token", so a surface that copies the
 *     body without substitution (the APM package) runs every gate. Three
 *     lines moved, the paragraph's last three, rewrapped in place; the
 *     detected fixture still renders the token as `github-actions`.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, fixer round 1 of unit q5-usage-lines (run
 *     2026-10-10_next-tier; review/8 as signed off). ONE golden moved,
 *     SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 32722 -> 32764 bytes at an
 *     unchanged 467 lines in the corpus source: the Proof block's usage-lines
 *     paragraph has the line appended to the run record as each phase or
 *     review round ends, the way a capacity line is, a line of its own and
 *     never directly above a table, where it named a place after the proof
 *     block's field list, which no record holds mid-run. Both of its lines
 *     moved; it still sits below the re-attachment cut (`### Specialist pass`
 *     stays at 16662). No token sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, unit q6t-test-runner-ci-line (run
 *     2026-10-10_next-tier; REQ-FLOW-063, inbox rows build/61 and build/85).
 *     ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on agents/stamity-test-runner.md, 8683 -> 8754 bytes
 *     at an unchanged 157 lines in the corpus source: the Gate set's
 *     `unknown`-provider sentence names the provider through
 *     `${STAMITY:CI_PROVIDER}`, which the detected fixture renders as
 *     `github-actions`, in place of the charter field it pointed at; and the
 *     Return contract's red sentence states that a `red` verdict writes
 *     nothing to the named path. Both rewrapped inside their paragraphs.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, fixer round 1 of unit q2-qa-rows (run
 *     2026-10-10_next-tier; review/2, review/3, review/4). NOTHING moved in
 *     this suite; the row keeps the two ledgers in step. The round's one
 *     emitted change is `skills/st-qa/SKILL.md`, +137 bytes in its person-rows
 *     paragraph and class clause, which no golden here carries; the sibling
 *     suite itemises it.
 *
 *   - 2026-10-10, plan 019 file 3, unit q5-usage-lines (run
 *     2026-10-10_next-tier; REQ-CTX-019). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 32480 -> 32722 bytes and
 *     464 -> 467 lines in the corpus source: the Proof block gains a
 *     usage-lines paragraph (one blank line and two lines) after its field
 *     list's last item, naming the `- <UTC> usage: …` record line and its
 *     placement. The edit sits below the re-attachment cut (`### Specialist
 *     pass` stays at 16662). No token sits in the moved text.
 *
 *     NOTHING else moved here.
 *
 *   - 2026-10-10, plan 019 file 3, unit q2-qa-rows (run 2026-10-10_next-tier;
 *     REQ-FLOW-069). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 32396 -> 32480 bytes and
 *     463 -> 464 lines in the corpus source: the QA checkpoint's step 2 hands
 *     the qa skill the class and lenses `gate classify` named (`unclear` when
 *     none ran), its sentence rewrapped from four lines to five. The edit sits
 *     below the re-attachment cut (`### Specialist pass` stays at 16662). No
 *     token sits in the moved text.
 *
 *     NOTHING else moved here; the qa skill's own change is goldened in the
 *     sibling suite, which itemises the emitted copies.
 *
 *   - 2026-10-10, plan 019 file 3, unit f0-make-room (run
 *     2026-10-10_next-tier; inbox rows 2026-10-08_product-core/build/1 and
 *     close/10). ONE golden moved, SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md, 32995 -> 32396 bytes and
 *     507 -> 463 lines in the corpus source: room above the re-attachment cut
 *     (`### Specialist pass` at offset 17858 -> 16662) and under the 500-line
 *     cap (body 498 -> 454). Unquoted blocks rewrap at 100 columns; the
 *     opening line, Frame's "Seconds, not ceremony", the Dispatch contract's
 *     lead-in and the Review loop's opening line go; Frame step 4's census
 *     sentence, the isolation examples, the findings-ledger tail, the resume
 *     bullet, the return lead-in, the cap bullet and the nit bullet shorten;
 *     Frame's four record-head lines and the reports `.gitignore` move to the
 *     Proof block's record paragraph; the light cap's hook caveat moves to
 *     the Intensity client-events paragraph; both Dials rows add "or a
 *     `reason` naming a failed read" to the no-class clause. No token sits in
 *     the moved text.
 *
 *     NOTHING else moved here; the sibling suite itemises the emitted copies.
 *
 *   - 2026-10-09, plan 019 file 2, consolidated at the close (run
 *     2026-10-08_product-core; build/24). FIFTEEN commits on the branch from
 *     5be05cda moved this suite's snapshot, each reviewed in its unit's round;
 *     THREE goldens moved, all SUBSTITUTION:
 *
 *     SUBSTITUTION moved on commands/st-work.md in thirteen of them, 31282 ->
 *     32995 bytes and 502 -> 507 lines in the corpus source: the room made
 *     above the re-attachment cut (4968e8e6); the review loop's cap of 3,
 *     escalation, confidence and acceptance wording (48e5f7c7, 3b6bef7a,
 *     9c1d762a, f52cea5c); the digest rule (2a159409); the Prove pass's secret
 *     scan and class gates on the classified base (11f711cc, c26cd6d8,
 *     111f054d, b06e3a10); the security lens by class (4fc41475, fca476b3);
 *     the final tree runs every gate after a classify exiting 1 (33c014e2).
 *
 *     SUBSTITUTION moved on the charter in two, 5695 -> 5754 bytes at an
 *     unchanged line count (95): invariant 4 names the class's gates,
 *     invariants 1.2.0 (51667e43), then takes the class from gate classify
 *     (62850e8d).
 *
 *     SUBSTITUTION moved on agents/stamity-test-runner.md in two, 8006 ->
 *     8683 bytes and 147 -> 157 lines: the class-to-gate mapping (11f711cc,
 *     c26cd6d8).
 *
 *     NOTHING else moved here; the sibling suite itemises the emitted copies.
 *
 *   - 2026-09-30, plan 013 whole-branch review, fixer round 1 (run
 *     2026-09-30_optimization-sweep, pass `branch`; review/162 signed off,
 *     review/164). TWO goldens moved:
 *
 *     SUBSTITUTION moved on the charter by +8 bytes at an unchanged line
 *     count (5687 -> 5695 in the corpus source, the same in the golden: no
 *     token sits in the moved text). The Touchpoints paragraph's three lines
 *     rewrap: a client that reads `.agents/skills/` gets the nine as skills,
 *     started as any skill (`/st-<id>` or `$st-<id>`), where it gave only
 *     `$st-<id>`.
 *
 *     SUBSTITUTION moved on commands/st-work.md by +5 bytes at an unchanged
 *     line count: the "Resume after a compaction" bullet says the hook prints
 *     the resume card after a compaction or on a resume; its four lines rewrap.
 *
 *     NOTHING else moved here; the sibling suite itemises the emitted copies.
 *
 *   - 2026-09-30, plan 013 file 3, fixer round 1 of unit
 *     sw17-touchpoints-as-shared-skills (run 2026-09-30_optimization-sweep;
 *     review/157). ONE golden moved:
 *
 *     SUBSTITUTION moved on the charter by +20 bytes at an unchanged line
 *     count (5667 -> 5687 in the corpus source, the same in the golden: no
 *     token sits in the moved text). The Touchpoints paragraph's two
 *     reworded lines say a client that reads `.agents/skills/` instead of a
 *     command surface receives the nine there as skills, started as
 *     `$st-<id>`, where they said that client received no command file at
 *     all.
 *
 *     NOTHING else moved here: the round's `src/` edits (the one
 *     `frontmatterScalar` home, the codex `command-surface` cap text, two
 *     comments) render no byte into any golden in this suite; the sibling
 *     suite itemises the charter's emitted copies.
 *
 *   - 2026-09-30, plan 013 file 3, unit sw08-fresh-re-reviewer (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by five added lines and two
 *     reworded ones in the Review loop, +367 bytes (30124 -> 30491 in the
 *     corpus source, the same in the golden: no token sits in the moved
 *     text): the confidence gate is the one the run record declares, and with
 *     none declared an approval counts and no extra round runs (the hook
 *     still refuses a `low` approval); each re-review is a fresh reviewer
 *     spawn briefed as a verdict role with each finding's locator at HEAD
 *     and no fixer claim.
 *
 *     NOTHING else moved here: the reviewer agent body changed too, but no
 *     golden in this suite carries it; no file under `src/` changed.
 *
 *   - 2026-09-30, plan 013 file 2, unit work-cli-call-form (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by two added lines, 476 ->
 *     478 body lines: the Dispatch contract gains a CLI calls bullet before
 *     Ledger writes — the shared sentence that defines how a `stamity <verb>`
 *     call runs (`npx --no stamity <verb>` for an installed copy, else the
 *     pinned call), and the one writer's by-hand ledger edit when neither form
 *     runs. The golden carries the pinned call rendered at the golden engine
 *     version (`npx -y @zomarit/stamity@1.0.0-golden <verb>`), so its added
 *     bytes exceed the corpus source's +665 (29459 -> 30124) by the token's
 *     rendered length. The golden's added lines are the corpus diff's two
 *     added lines and nothing else (none removed).
 *
 *     NOTHING else moved here: no file under `src/` changed, so the charter,
 *     every agent body and every script are byte-identical.
 *
 *   - 2026-09-30, plan 013 file 2, fixer round 2 of unit work-qa-states (run
 *     2026-09-30_optimization-sweep; review/83). NOTHING moved in this suite;
 *     the row keeps the two ledgers in step. The round's one emitted change is
 *     `skills/st-qa/SKILL.md`, +94 bytes in its sign-off paragraph, which no
 *     golden here carries; the sibling suite itemises it.
 *
 *   - 2026-09-30, plan 013 file 2, fixer round 1 of unit work-qa-states (run
 *     2026-09-30_optimization-sweep). NOTHING moved in this suite; the row
 *     keeps the two ledgers in step. The round's one emitted change is
 *     `skills/st-qa/SKILL.md`, +302 bytes in its sign-off, Shippable line and
 *     handback. A skill body is not a substitution target, not the catalog,
 *     not the policy document and not a core hook script, so no golden here
 *     carries it; the sibling suite itemises it.
 *
 *   - 2026-09-30, plan 013 file 2, unit work-asks-once (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by +841 bytes, 463 -> 476
 *     body lines: Frame's deferral-inbox step lists a row a persisted plan
 *     already settles and asks nothing about it; the Plan gate takes a fresh
 *     persisted plan as the go-ahead at standard and logs `Default applied:
 *     plan gate → option 1, execute now (persisted plan <path>)`, while deep
 *     and an in-flow plan still ask; the QA checkpoint gains "The close asks
 *     once." after the Row states paragraph; the spec merge's confirmation is
 *     the close's one question; the standard intensity row says so. The
 *     golden's changed lines are the corpus diff's and nothing else; the
 *     corpus source went 28618 -> 29459 bytes. The `st-qa` skill body also
 *     changed (one handback sentence), but no golden here carries it.
 *
 *     NOTHING else moved here: no file under `src/` changed, so the charter,
 *     every agent body and every script are byte-identical.
 *
 *   - 2026-09-30, plan 013 file 2, unit work-qa-states (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by +619 bytes, 453 -> 463
 *     body lines: the QA checkpoint gains a Row states paragraph after "The
 *     checkpoint covers what automation cannot." — each row closes `walked`,
 *     `auto-proven` or `accepted-unwalked`, a bare sign-off is never `walked`,
 *     an unattended run records `not signed` — and the Proof block gains a QA
 *     rows line after the review-verdicts line. The golden's added lines are
 *     the corpus diff's ten added lines and nothing else (none removed); the
 *     corpus source went 27999 -> 28618 bytes. The `st-qa` skill body also
 *     changed, but no golden here carries it.
 *
 *     NOTHING else moved here: no file under `src/` changed, so the charter,
 *     every agent body and every script are byte-identical.
 *
 *   - 2026-09-30, plan 013 file 2, unit work-verdict-brief (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by +395 bytes, 447 -> 453
 *     body lines: the Dispatch contract gains a Verdict dispatch bullet after
 *     Pointer dispatch — a reviewer or lens brief names the range, the plan
 *     cell whose criteria it judges and the report path, never the
 *     implementer's or fixer's account, and with no git grant points at the
 *     orchestrator's patch file. The golden's added lines are the corpus
 *     diff's six added lines and nothing else (none removed); the corpus
 *     source went 27604 -> 27999 bytes.
 *
 *     NOTHING else moved here: no file under `src/` changed, so the charter,
 *     every agent body and every script are byte-identical.
 *
 *   - 2026-09-30, plan 013 file 2, unit work-gates-once (run
 *     2026-09-30_optimization-sweep). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by +405 bytes, 441 -> 447
 *     body lines: the Gates paragraph runs each gate once, reads the exit
 *     code from the tool (an unreadable code is `unknown`, never a pass) and
 *     lets a byte-identical tree cite an earlier result while the final tree
 *     gets its own run; the Proof block's gate-results line reads
 *     pass/fail/unknown. The golden's removed and added lines are the corpus
 *     diff's lines and nothing else; the corpus source went 27199 -> 27604
 *     bytes.
 *
 *     NOTHING else moved here: no file under `src/` changed, so the charter,
 *     the test-runner body and every script are byte-identical.
 *
 *   - 2026-09-27, plan 010 D5, unit invariant-2-tighten (run
 *     2026-09-24_enterprise-release). ONE golden moved:
 *
 *     SUBSTITUTION moved on the charter by +55 bytes at an unchanged line
 *     count: invariant 2 now says ask one question, exactly one, and make no
 *     second request in the same turn, rewrapped inside its three lines. The
 *     golden's three removed and three added lines are the corpus diff's
 *     lines and nothing else.
 *
 *     NOTHING else moved here: the one `src/` change is the two shared-bytes
 *     disclosure constants, which emit nothing, so every command, agent,
 *     rule, skill, guard and runner is byte-identical.
 *
 *   - 2026-09-24, Package 16 session 1's sixth batch sync (run
 *     2026-09-23_orchestrator-context). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by +24 bytes, 486 -> 487
 *     lines, from the capacity rung (ad520576, build/340): a later
 *     `limit-reset` is BLOCKED_DEPENDENCY "naming the reset time". The
 *     golden's one removed and two added lines are the corpus diff's lines
 *     and nothing else; the corpus source went 30021 -> 30045 bytes, 494 ->
 *     495 lines.
 *
 *     NOTHING else moved here: no file under `src/` changed since the fifth
 *     sync, so the session-start scripts, the four guards, the charter, the
 *     catalog, the MDC companion heads, the policy document, the tamper
 *     notice, the review gate and the three portable runners are
 *     byte-identical. The replay instrument, the specs, the plans and
 *     SECURITY.md emit nothing.
 *
 *   - 2026-09-24, Package 16 session 1's fifth batch sync, after the
 *     whole-branch fixes (run 2026-09-23_orchestrator-context). FIVE goldens
 *     moved:
 *
 *     SESSION START moved on `stamity-session-start.mjs` for all four clients
 *     (one shared body): 859 -> 887 lines, 38280 -> 39677 bytes, from the
 *     whole-branch engine rounds 1 and 2 (510d8a24, ca0669d6) on the card
 *     twin `src/runs/cardSource.ts`: `CARD_REPORT_NAME` so only report-named
 *     files are listed as unledgered and every other `.md` is counted as
 *     "not report-named", never printed (build/247); `cardLedger` lstat-ing
 *     the ledger and returning `failed` so a ledger that is there but not
 *     read prints "could not be read" (build/258); `cardRender` taking the
 *     ledger and reports records; and `CARD_UNPRINTABLE` gaining U+061C,
 *     U+2028 and U+2029 (build/248, build/299).
 *
 *     CLAUDE GUARD moved on `stamity-pre-tool-use-guard.mjs` for claude only:
 *     475 -> 475 lines, 18995 -> 19125 bytes, from build/259 and build/299:
 *     `printable()` now strips with `GUARD_UNPRINTABLE`, the engine's shared
 *     unprintable class embedded by source and flags, in place of its own
 *     code-point loop — so the guard also drops the zero-width marks, the
 *     line and paragraph separators, U+061C and the byte-order mark. The
 *     codex, copilot and cursor guards are byte-identical.
 *
 *     NOTHING else moved here: the charter, the catalog, the MDC companion
 *     heads, the policy document, the tamper notice, the review gate, the
 *     three portable runners and the substituted bodies are byte-identical.
 *     The corpus round's reviewer, spec-author and injection-screening edits
 *     are itemised in the sibling ledger; this suite holds none of them.
 *     Engine round 3 (59add396) and the replay rounds emit nothing.
 *
 *   - 2026-09-24, Package 16 session 1's final sync, unit p16-dogfood-sync
 *     (run 2026-09-23_orchestrator-context). ONE golden moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md` by -4 bytes at an unchanged
 *     486 lines, from the Minor sweep's re-review sentence (f33cb6ad): a
 *     closure naming an id the re-review was not handed now "refuses the
 *     whole close" where it read "is a finding, never applied", matching the
 *     landed `stamity ledger close`. The golden's two changed lines are the
 *     corpus diff's two changed lines and nothing else.
 *
 *     CUMULATIVE for the package against its base fed39ac, the three batch
 *     rows below plus this one, on the byte scale those rows use:
 *     `commands/st-work.md` 23375 -> 29524 bytes (+6149), 400 -> 486 lines;
 *     `agents/stamity-test-runner.md` 5425 -> 6001 bytes (+576), 113 -> 120
 *     lines; the session-start script for all four clients 23600 -> 38280
 *     bytes; the claude guard 10398 -> 18995 bytes, the other three guards
 *     unchanged; the policy document's four verdict rows gain a `writePaths`
 *     report glob. The charter, the catalog, the MDC companion heads, the
 *     tamper notice, the review gate and the three portable runners are
 *     byte-identical to the base. The other seven agent bodies moved and are
 *     itemised in the sibling ledger; this suite holds none of them.
 *
 *   - 2026-09-24, Package 16 session 1's third batch sync (run
 *     2026-09-23_orchestrator-context). FIVE goldens moved:
 *
 *     CLAUDE GUARD moved on `stamity-pre-tool-use-guard.mjs` for claude only:
 *     266 -> 475 lines, 10398 -> 18995 bytes, from the c8b unit (the Claude
 *     guard's path-scoped Write): a header note on the metadata reads, the
 *     `realpathSync` and path-helper imports, the write-path grammar twin,
 *     the segment matcher with the digits-only round number, the win32
 *     reserved-device refusal, `writePathCheck` (root anchored on the
 *     script's own location, realpath walk, lstat for links, non-regular and
 *     hard-linked leaves), `printable`, and the `WRITE_PATH_DENIED` branch in
 *     `evaluate()` ahead of the category check. The codex, copilot and cursor
 *     guards are byte-identical: the path-scoped Write is Claude-only.
 *
 *     SESSION START moved on `stamity-session-start.mjs` for all four clients
 *     (one shared body): 848 -> 859 lines, 37779 -> 38280 bytes, from the
 *     ctx-ledger-status unit, whose engine twin now renders the card source —
 *     the `CARD_UNPRINTABLE` pattern and its strip in `cardFlat` (C1, bidi and
 *     zero-width characters dropped), `cardLanes` skipping a worktrees folder
 *     that is not a real directory and an empty `gitdir`, and the two
 *     reworded doc comments.
 *
 *     NOTHING else moved here: the charter, the catalog, the MDC companion
 *     heads, every agent body (the four verdict agents' `Write` lives in the
 *     Claude frontmatter, which this suite does not pin), the tamper notice,
 *     the review gate and the three portable runners are byte-identical.
 *     ctx-ledger-append, ctx-ledger-close, r2, r3, r6, the replay protocol
 *     and the plan amendments emit nothing.
 *
 *   - 2026-09-24, Package 16 session 1's second batch sync (run
 *     2026-09-23_orchestrator-context). TWO goldens moved:
 *
 *     SUBSTITUTION moved on `commands/st-work.md`: 400 -> 486 lines, +6153
 *     bytes, the /st-work text unit (the run-record head and `reports/`
 *     folder at Preflight, the in-flow `plan.md` copy, the capacity rung,
 *     ledger writes, pointer dispatch, resume after a compaction, the two
 *     return tiers with the digest and the report path, re-review closures
 *     confined to the handed ids, the two optional ledger fields, and the
 *     capacity rung's third placement under the model table). The golden's
 *     106 changed lines, unescaped, are the corpus diff's 96 added and 10
 *     removed lines and nothing else, so substitution left no token behind.
 *
 *     POLICY DOCUMENT moved on the four verdict rows (design-quality,
 *     performance, reviewer, security): each gains a `writePaths` array
 *     holding its one report glob, `*-<role>-r*.md` under any run's
 *     `reports/` folder in `.stamity/runs/`, and a closing rationale
 *     sentence naming that report as its lone write (security's "No write
 *     grant" now reads "No code write grant"), from the verdict write-paths
 *     roster unit; the rows' `allow` stays `read` and every other row is
 *     unchanged.
 *
 *     NOTHING else moved here: the charter, the catalog, the MDC companion
 *     heads, every agent body, the hook scripts and the three portable
 *     runners are byte-identical. The replay walk and the eval-case moves
 *     emit nothing.
 *
 *   - 2026-09-24, Package 16 session 1's first batch sync (run
 *     2026-09-23_orchestrator-context). SIX goldens moved:
 *
 *     HOOK SCRIPTS: `stamity-session-start.mjs` moved for all four clients,
 *     445 -> 849 snapshot lines, with the SAME delta in each and the four
 *     bodies still identical to one another. The script now imports the fs
 *     and path names the resume card needs plus `isatty`, splits `screened`
 *     into `screenHit` (returns the first matching pattern id) and a boolean
 *     wrapper, inlines the stdin payload reader, the field helper and the
 *     resume-card source from `src/runs/cardSource.ts`, and appends the card
 *     to the banner only when the payload's `source` is `compact`; its header
 *     names the payload read. The claude golden is byte-identical to the
 *     dogfood copy at `.stamity/generated/hooks/claude/`.
 *
 *     SUBSTITUTION moved on two bodies. `agents/stamity-test-runner.md`
 *     5425 -> 6001 bytes, 113 -> 120 lines: the seven-line paragraph that
 *     lets a green verdict be digested to a report and keeps a red one in
 *     full, the same +576 the corpus source moved. `commands/st-work.md` at
 *     UNCHANGED 23375 bytes and 400 lines: a pure reorder that moves
 *     `## Dispatch contract` and `## Return contract` ahead of Phase 4. In
 *     both, the golden's changed lines are the corpus diff's changed lines
 *     and nothing else, so substitution left no token behind.
 *
 *     NOTHING else moved here: the charter, the catalog, the MDC companion
 *     heads, the policy document, the guard and tamper scripts and the three
 *     portable runners are byte-identical. The seven other agent bodies moved
 *     too; this suite holds none of them, and the sibling ledger itemises them.
 *
 *   - 2026-09-10, Package 10 client and authoring integration. The three
 *     core script paths and portable event triple are unchanged. Codex's role
 *     guard now declares BLOCKING=false; its header and the Cursor/Copilot
 *     headers identify their documented identity-free payloads. Three new
 *     full-byte portable-runner snapshots cover src/hooks/portableRunner.ts;
 *     its shell-free child execution and native output/timeout translations
 *     also have process fixtures. The work substitution moves only with the
 *     canonical structural/semantic coverage, browser-skip and effective-model
 *     clauses. Charter and test-runner substitution, catalog, rule companion
 *     heads, policy document, session-start and tamper scripts are unchanged.
 *     The sibling tree/residue refresh accounts for every projected dialect.
 *
 *   - 2026-09-09, the dev-group bump (vitest 4.1.10 -> 5.0.0 and its siblings).
 *     Nothing in this suite moved: its snapshot keys carry no interpolated
 *     describe label, so vitest 5's naming change renamed none of them and
 *     every golden reads byte-identical. The row exists so the two ledgers
 *     stay in step — the sibling suite's ten keys were renamed, values
 *     untouched, and are itemised there.
 *   - 2026-09-09, Package 9's retirement shape. SUBSTITUTION moved on
 *     `commands/st-work.md` alone, +77 bytes (23145 -> 23222 in the corpus
 *     source) at UNCHANGED line counts — still 390 body lines and 399 file
 *     lines, because the edit reflows inside the one paragraph the row below
 *     added rather than growing it. The clause that said the ledger row "gains
 *     a dated `retired` line" now names the carrier: an optional EIGHTH field
 *     on the same row, `retired`, whose value opens with the date and then
 *     states the disposition. That phrasing supersedes the row below's, which
 *     described the same behaviour without saying where it is written; the
 *     records gate (`test/records/ledgers.test.ts`) enforces the field, and the
 *     shipped text now declares it. Holding the line count is deliberate: the
 *     eval case `evals/cases-v4/golden/work-proof-block-fields.md` cites source
 *     range 211-270 of this file, so a line added here would silently move a
 *     sealed brief's window.
 *
 *     NOTHING else moved here. `charter/stamity-charter.md`,
 *     `agents/stamity-test-runner.md`, the catalog, the MDC companion heads,
 *     the policy document and the three core hook scripts are byte-identical,
 *     and `commands/st-board.md` was not touched by this round at all. The
 *     round's other edits — the derived legacy-vocabulary and converge-by-id
 *     assertions in `test/records/ledgers.test.ts`, the matching corpus
 *     assertion in `test/corpus/commands/work.test.ts`, and the re-inlined
 *     governing block in the eval case — reach no emitted document.
 *
 *   - 2026-09-09, Package 9's close-step inbox append. SUBSTITUTION moved on
 *     `commands/st-work.md` alone, +947 bytes at 376 -> 390 body lines (399
 *     file lines against the 500-line cap): the Proof block gains one paragraph
 *     saying that at exit every row that closed
 *     `deferred` is appended to `.stamity/inbox.md` in `/st-board`'s declared
 *     grammar with a `Ref:` to the ledger row, that the ledger row gains its
 *     dated `retired` line only when that inbox row leaves, that a row still
 *     `open` when the record is written is a gate failure, and that the
 *     next-step and `Not done:` lines answer to those rows. The +947 is the
 *     content edit byte for byte, so substitution passed the new prose through
 *     and left no token behind.
 *
 *     NOTHING else moved here. `charter/stamity-charter.md` and
 *     `agents/stamity-test-runner.md` — the other two substitution targets —
 *     are byte-identical, and so are the catalog, the MDC companion heads, the
 *     policy document and the three core hook scripts. The change's second
 *     corpus edit — `commands/st-board.md`'s five-writer inbox census, its
 *     fourth removal path and the anchored `Ref: <path>#<anchor>` its row
 *     grammar now declares beside the bare `Ref: <path>` — reaches nothing this
 *     suite holds: it carries no command bodies beyond the one substitution
 *     target. Both command bodies
 *     land in the sibling suite's three command dialects, itemised there.
 *
 *   - 2026-09-07, the Package 4 review's fix round 2. NOTHING moved in this
 *     suite. The row exists so the two ledgers stay in step: a refresh was run
 *     here (`vitest -u` on this file alone) and wrote no byte, which is a
 *     measured result rather than a skipped step — the snapshot file's digest
 *     was taken before and after and is the same.
 *
 *     The round's one emitted change is `skills/st-handoff/SKILL.md`, +221
 *     bytes in its resume section saying what `--dry-run` withholds. A skill
 *     body is not a substitution target, not the catalog, not the policy
 *     document and not a core hook script, so it reaches nothing this suite
 *     holds; it lands in the sibling suite's two skill roots, itemised there.
 *     `charter/stamity-charter.md` is byte-identical, and so are the other two
 *     substitution targets, every MDC companion head — round 1's
 *     `rules/stamity-injection-screening.md` head included, which holds at its
 *     refreshed value — the catalog, the policy document and the three core
 *     hook scripts. `src/hooks/scripts.ts` carries an uncommitted diff in the
 *     tree, and it is round 1's: the claude review-gate residue it produces is
 *     still 39463 bytes, the core three are untouched, and `stamity check`
 *     reported `drift: clean` against it.
 *
 *   - 2026-09-07, the Package 4 review's fix wave. ONE line moved: the MDC
 *     companion head for `rules/stamity-injection-screening.md`, whose
 *     `description` now says a hit is reported by its class and its source with
 *     a pattern id only where a catalog scan actually ran, where it used to say
 *     "by its source and pattern id". Frontmatter, +59 bytes, and the whole of
 *     what this suite holds for that rule.
 *
 *     NOTHING else moved here. The same rule's BODY also changed (+23 bytes:
 *     item 2's run-time-ingress paragraph and the gate bullet that restates it),
 *     and its `obsolete_when` moved with the description — neither reaches this
 *     snapshot, because the companion head carries `description`, `globs` and
 *     `alwaysApply` and nothing else. The body lands in the sibling suite's
 *     three rule dialects and in the codex appendix, itemised there.
 *     `charter/stamity-charter.md` is byte-identical, and so are the other two
 *     substitution targets, the catalog, the policy document and the three core
 *     hook scripts. The wave's other emitted-surface changes are a command body
 *     (`commands/st-rework.md`, the critical-deferral row grammar and plan-lint
 *     `L4`) and claude adapter residue (the review-gate hook script): this suite
 *     holds neither, and the sibling ledger carries both.
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

/**
 * Fixed invariants fixture for the charter pass. Not the shipped charter's
 * values: these goldens resolve a body against fixture inputs, and reusing the
 * real version would make a resolved line indistinguishable from an unresolved
 * one that happened to read correctly.
 */
const INVARIANTS: CharterInvariants = {
  version: "4.5.6",
  ratified: "2026-02-03",
  amended: "2026-04-05",
};

/** Fixed emission context for the pinned-CLI pass; the golden engine version, never `latest`. */
const CLI = { packageName: "@zomarit/stamity", version: "1.0.0-golden" } as const;

/**
 * All four substitution passes composed; the module contract makes the order
 * immaterial.
 *
 * TEST CHANGE, justified (2026-09-15): the charter gained a third token family
 * — `${STAMITY:INVARIANTS_VERSION}`, resolved from the charter's own frontmatter
 * — so "both passes" became three. The residue assertions below are unchanged
 * and now cover one more token: a two-pass render of the current charter would
 * leave it standing, which is the failure this composition fixes rather than
 * the one it hides.
 *
 * TEST CHANGE, justified (2026-09-30, sw26-cli-token): a fourth family,
 * `${STAMITY:CLI}` — the pinned CLI call, resolved from the emission context —
 * now appears in the charter's maturity line, so the composition runs four
 * passes. The residue assertions are unchanged and cover one more token.
 */
function resolveBody(body: string, ctx: DetectedRepoContext): string {
  return substituteCliTokens(
    substituteVerificationGateTokens(
      substituteRepoTokens(substituteCharterTokens(body, INVARIANTS), ctx),
      GATES,
    ),
    CLI,
  );
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
        // survive are the ones that never formed a token in the source.
        //
        // TEST CHANGE, justified: the one body that carried such an occurrence — the
        // test-runner agent, which quoted the prefix in prose while describing its own
        // unresolved-token detection — was reworded by P2a-ii, because a published plugin body
        // carrying the literal defeats REQ-PLUGIN-004's check that no file under a generated
        // root contains it. The accounting is unchanged and still computed from the body rather
        // than asserted as a constant; the per-file expectation is now the strict zero for
        // every body, which is the stronger statement of the same property.
        const proseOnly = countOf(body.replace(WELL_FORMED_TOKEN, ""), RAW_TOKEN_PREFIX);
        expect(countOf(output, RAW_TOKEN_PREFIX)).toBe(proseOnly);
        expect(proseOnly).toBe(0);
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
   * TEST CHANGE: current Codex, Cursor and Copilot tool-call payloads carry no
   * agent identity, so their core role guard is telemetry even where a native
   * user hook can deny. Claude retains the identity-bearing exit-2 role gate.
   */
  const BLOCKING_BY_TOOL: Record<Tool, boolean> = {
    claude: true,
    codex: false,
    cursor: false,
    copilot: false,
  };

  it.each(TOOLS)("plans three deterministic scripts for %s on the portable event triple", (tool) => {
    const scripts = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool, CLI_PIN);
    const again = planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool, CLI_PIN);
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

  it("gives Claude the exit-2 role gate and identity-free clients explicit telemetry", () => {
    const claudeGuard = at(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, "claude", CLI_PIN), 1);
    expect(claudeGuard.content).toContain("Blocking client: a refusal exits 2 and the action stops.");
    expect(claudeGuard.content).toContain("const BLOCK_EXIT = 2;");
    expect(claudeGuard.content).toContain("const BLOCKING = true;");

    for (const tool of ["cursor", "copilot", "codex"] as const) {
      const guard = at(planCoreHookScripts(POLICY_PATH_FROM_SCRIPT, tool, CLI_PIN), 1);
      expect(guard.content).toContain("its hook payload carries no calling-agent");
      expect(guard.content).toContain("this script does not enforce a role grant");
      expect(guard.content).toContain("const BLOCKING = false;");
    }
  });

  // These new adapter launchers sit beside the three unchanged core paths.
  // Golden their full bytes here, as promised by the cross-client exclusions.
  it.each(["cursor", "copilot", "codex"] as const)(
    "preserves the deterministic portable runner bytes for %s",
    (tool) => {
      const script = buildPortableHookRunner(tool);
      expect(buildPortableHookRunner(tool)).toBe(script);
      expect(script).toMatchSnapshot();
    },
  );
});
