import { createHash } from "node:crypto";
import { basename } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLAUDE_MD_PATH, CLAUDE_SETTINGS_PATH } from "../../src/adapters/claude.ts";
import { CODEX_AGENTS_MD_BUDGET_BYTES, CODEX_HOOKS_FILE } from "../../src/adapters/codex.ts";
import { COPILOT_SETUP_STEPS_PATH } from "../../src/adapters/copilot.ts";
import { CURSOR_COMMANDS_DIR, CURSOR_HOOKS_CONFIG_PATH } from "../../src/adapters/cursor.ts";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { AGENTS_MD_FILE } from "../../src/emit/agentsMd.ts";
import { AGENT_TOOL_POLICIES_PATH, HOOKS_GENERATED_DIR } from "../../src/emit/hooksInfra.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../src/emit/skillsProjection.ts";
import { TOOLS, type Tool } from "../../src/types/core.ts";
import type { SetupManifest } from "../../src/types/manifest.ts";
import {
  artifactTypesByPath,
  emittedPaths,
  findReservedNameHits,
  makeGoldenRepo,
  ownersByPath,
  readEmittedTree,
  treeDigest,
  GOLDEN_MCP_SERVER_ID,
  GOLDEN_SEED_FILES,
  GOLDEN_USER_HOOK,
  UNLEDGERED_ENGINE_PATHS,
  type GoldenRepo,
} from "./goldenFixture.ts";

/**
 * The cross-client golden suite: what the four adapters actually write, proven
 * through the real init pipeline into temp directories — the goldens
 * run the code under test end to end and never rebuild an expectation from the
 * same builders that produced it.
 *
 * Two goldens per selection, because they answer different questions:
 *
 *   1. **Tree digest** — every emitted path with the sha256 and byte length of
 *      its content. Answers "did the emitted TREE move": a path appearing,
 *      vanishing, or changing by one byte fails it. Digested rather than
 *      inlined because one corpus body is projected into up to four client
 *      dialects, and four copies of the corpus in one snapshot is a snapshot
 *      that gets `-u`'d instead of read.
 *   2. **Residue documents** — the full bytes of every emitted path whose
 *      ledger rows are all `artifactType: "infra"`, i.e. the documents the
 *      engine and its adapters SHAPE rather than project: charters, client
 *      entry files, hook config, MCP dialects. Excluded
 *      from it, and only these: the per-tool hook script copies under
 *      `.stamity/generated/hooks/` and the policy document, both already
 *      goldened byte-for-byte in `test/corpus/emissionGoldens.test.ts` — the
 *      exclusion is "has a byte-exact golden elsewhere", not "is large".
 *
 * Snapshot-update discipline is the corpus suite's, restated because it binds
 * harder here: a diff in either golden IS a shipped-artifact change. Read it as
 * a file review; `vitest -u` without that review deletes the net.
 *
 * Everything the snapshots cannot express is a plain assertion: determinism
 * across two runs, placeholder cleanliness of emitted bytes, ledger
 * attribution per path, the shared-path dedup proof, and the per-client
 * contract probes.
 */

/** Selections the suite goldens: each tool alone, then the four-tool union. */
const SELECTIONS: readonly { label: string; tools: readonly Tool[] }[] = [
  ...TOOLS.map((tool) => ({ label: tool, tools: [tool] as readonly Tool[] })),
  { label: "all-four", tools: TOOLS },
];

/**
 * Core paths every selected tool co-owns — one file, one write, N ledger rows.
 *
 * TEST CHANGE, justified: a maintainer ruling deleted the Agent-Plugins container,
 * so its path leaves this set. The co-ownership guarantee the set encodes is
 * unchanged and still asserted below over every remaining member — same
 * property, one fewer path.
 */
const SHARED_CORE_PATHS: readonly string[] = [AGENTS_MD_FILE, AGENT_TOOL_POLICIES_PATH];

/**
 * Where each client's own residue lands. `.github/workflows/` is deliberately
 * matched as one exact file rather than a prefix: the fixture seeds a CI
 * workflow there, so the directory is shared with the user.
 */
const CLIENT_RESIDUE: Readonly<Record<Tool, (path: string) => boolean>> = {
  claude: (path) => path.startsWith(".claude/"),
  cursor: (path) => path.startsWith(".cursor/"),
  copilot: (path) =>
    [".github/instructions/", ".github/agents/", ".github/prompts/", ".vscode/"].some((prefix) =>
      path.startsWith(prefix),
    ) || path === COPILOT_SETUP_STEPS_PATH,
  codex: (path) => path.startsWith(".codex/"),
};

/**
 * The full-byte golden set: infra-typed emissions minus the two families that
 * already carry a byte-exact golden in `test/corpus/emissionGoldens.test.ts`
 * (hook script copies, policy document). Derived from the persisted ledger, not
 * a hand-kept path list — a new adapter document joins the golden by existing.
 */
function residueDocuments(
  tree: Readonly<Record<string, string>>,
  manifest: SetupManifest,
): Record<string, string> {
  const types = artifactTypesByPath(manifest);
  const paths = [...types.entries()]
    .filter(([path, kinds]) => {
      if (kinds.size !== 1 || !kinds.has("infra")) return false;
      if (path.startsWith(`${HOOKS_GENERATED_DIR}/`)) return false;
      return path !== AGENT_TOOL_POLICIES_PATH;
    })
    .map(([path]) => path)
    .toSorted();

  const documents: Record<string, string> = {};
  for (const path of paths) {
    const content = tree[path];
    if (content === undefined) throw new Error(`ledger names ${path}, which the tree does not carry`);
    documents[path] = content;
  }
  return documents;
}

/** Parsed JSON of an emitted document, failing loudly rather than returning `unknown`. */
function readJson(tree: Readonly<Record<string, string>>, path: string): Record<string, unknown> {
  const raw = tree[path];
  if (raw === undefined) throw new Error(`emitted tree has no ${path}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

describe.each(SELECTIONS)("emitted tree for $label", ({ label, tools }) => {
  let repo: GoldenRepo;
  let tree: Record<string, string>;

  beforeAll(async () => {
    repo = await makeGoldenRepo({ tools });
    tree = await readEmittedTree(repo.rootDir);
  });

  afterAll(async () => {
    await repo.cleanup();
  });

  // Reviewed refreshes, newest first — each committed after reading BOTH
  // goldens as a file review, so a later reader can attribute every moved line
  // to a named rework item. The sibling suite keeps the same ledger; a refresh
  // recorded in only one of them leaves half the emitted surface unaccounted.
  //
  //   - 2026-09-04, the closure run's Minor-findings fix pass. TWO emitted files
  //     moved, plus the manifest rows that record them:
  //
  //     CHANGED `commands/st-rework.md` 17129 -> 17354 (cursor 17176 -> 17401),
  //       the claude command and the copilot prompt sharing one digest and the
  //       cursor skill carrying its own head. The persistence guard's secret-scan
  //       step now states that the secrets floor still governs what the run
  //       itself writes — nothing of a value reaches any file, and a mask is not
  //       a reproduction — and that the guard adds only that the run does not
  //       rewrite the operator's text for them, which settles a contradiction
  //       against the secrets rule's own golden case. The edit is NET-ZERO in
  //       lines inside the guard: the list's lead-in sentence moved up into the
  //       paragraph above it, and item 1 spent the two lines that freed. Every
  //       `source:` range into this file below the guard therefore still lands on
  //       the text it names, and +225 bytes is the added clause alone.
  //     CHANGED `.stamity/generated/hooks/claude/stamity-review-gate.mjs`
  //       (33820 -> 34294 bytes) in the two claude-bearing selections. The
  //       reviewer's under-lock content-fault report was the one path carrying no
  //       recovery hint: it said the counter "could not be read", which
  //       misdescribes STATE_INVALID — that code parsed a file it did read — and
  //       it left the operator without the sentence the unlocked path has always
  //       carried. Both paths now say the counter cannot be trusted and that
  //       deleting the file restarts it, and that it is not overwritten from
  //       here. +474 bytes, most of it the comment stating why the two wordings
  //       are one. Posture unchanged: still fail-open at exit 0.
  //     CHANGED `.stamity/manifest.json` in all five selections, each at
  //       UNCHANGED byte length — the fixed-width sha256 rows for the two files
  //       above and nothing else.
  //
  //     What did NOT move: every other corpus body, every rule, every skill, the
  //       three portable hook scripts, every generated page, every client entry
  //       file and every residue document. The pass's other edits —
  //       `src/cli/kit/terminal.ts` and `src/cli/kit/prompts.ts` (the TERM=dumb
  //       literal is now imported rather than spelled twice), `tsdown.config.mjs`,
  //       `website/docusaurus.config.ts`, `evals/rubric-v4.md`, the `st-eval-run`
  //       override skill (repo-local, so it reaches no golden fixture), the
  //       re-inlined eval case brief, the plan and the run ledger — reach no
  //       emitted tree.
  //
  //   - 2026-09-04, the closure run's review round 1 fix pass. ONE emitted file
  //     moved, plus the manifest rows that record it:
  //
  //     CHANGED `.stamity/generated/hooks/claude/stamity-review-gate.mjs`
  //       (32108 -> 33820 bytes) in the two claude-bearing selections. Review
  //       round 1 found the counter-reset guard open at the one errno site the
  //       wave below did not cover: `load()` stats before it reads, and every
  //       stat errno mapped to "no file", which the caller reads as "no runs
  //       yet" — so a sharing hold on the stat under the lock published a
  //       one-round document over every round already counted, on a path that
  //       exits 0. The stat now retries the sharing family on the read's own
  //       20/40/80/160 ms schedule, treats only ENOENT and a non-regular name
  //       as absence, and returns STATE_UNREADABLE otherwise, which the guard
  //       drops the round on. +1712 bytes, most of it that comment and the
  //       rewritten LOCK_CEILING_MS note, which now states the invocation's
  //       compound worst case (~30.6s win32 / ~26.7s POSIX against the 600s
  //       the wired events allow) instead of a 30s-class margin the retry
  //       budgets had overtaken. Posture unchanged: still fail-open at exit 0.
  //     CHANGED `.stamity/manifest.json` in all five selections, each at
  //       UNCHANGED byte length — the fixed-width sha256 row for the file
  //       above and nothing else.
  //
  //     What did NOT move: every corpus body, every rule, every skill, the
  //       three portable hook scripts, every generated page and every client
  //       entry file. The round's other edits — `website/src/pages/index.tsx`,
  //       `tsdown.config.mjs`, `test/support/support.test.ts`,
  //       `test/hooks/scripts.test.ts`, the plan and the run ledger — reach no
  //       emitted tree.
  //
  //   - 2026-09-04, the closure run's execution wave. Two source changes moved
  //     bytes here, plus the manifest rows that record them:
  //
  //     CHANGED six corpus bodies, each in every dialect that carries it.
  //       `agents/stamity-design-quality.md` 7677 -> 7859 claude, 7601 -> 7783
  //       cursor, 7666 -> 7848 copilot, 8132 -> 8314 codex; and
  //       `agents/stamity-performance.md` 8004 -> 8159 claude, 7927 -> 8082
  //       cursor, 7989 -> 8144 copilot, 8454 -> 8609 codex. Four command
  //       bodies moved too, the claude command and the copilot prompt sharing
  //       one digest and the cursor skill carrying its own head:
  //       `commands/st-ask.md` 6861 -> 7269 (cursor 6905 -> 7313),
  //       `commands/st-plan.md` 23023 -> 23385 (cursor 23066 -> 23428),
  //       `commands/st-rework.md` 16273 -> 17129 (cursor 16320 -> 17176) and
  //       `commands/st-spec.md` 15365 -> 15789 (cursor 15410 -> 15834). Codex
  //       carries no command bodies, so its tree moved on the two agents and
  //       the charter alone.
  //     CHANGED the charter, and this is the only edit of the wave that
  //       reaches the RESIDUE-document goldens: invariant 7 now says that
  //       handing the operator a line, diff, or file body to paste is the same
  //       protocol violation as an orchestrator editing inline. The paragraph
  //       rewrapped at four lines either way, so the whole move is +70 bytes —
  //       `AGENTS.md` 4404 -> 4474 in the claude, cursor and copilot
  //       selections, 28956 -> 29026 for the codex root file that also carries
  //       the appendix, and `packages/alpha/AGENTS.md` and
  //       `packages/beta/AGENTS.md` 4404 -> 4474 in the two multi-root
  //       selections. Nine residue document bodies moved, every one of them a
  //       charter, and no other residue byte in any selection.
  //     CHANGED `.stamity/generated/hooks/claude/stamity-review-gate.mjs`
  //       (26669 -> 32108 bytes) in the two claude-bearing selections. One
  //       predicate over EACCES/EBUSY/EPERM now decides, at the lock create,
  //       the state read, the publish rename and the unlock, whether an errno
  //       is an answer or a momentary hold; the rename budget is the schedule
  //       `src/merge/atomicWrite.ts` already settled on rather than this
  //       script's own pre-fix one. +5439 bytes, most of it the comment blocks
  //       that state why each site waits, and every terminal failure still
  //       exits 0 with the round unblocked.
  //     CHANGED `.stamity/manifest.json` in all five selections, each at
  //       UNCHANGED byte length (16080 claude, 16089 cursor, 16240 copilot,
  //       10810 codex, 54488 all-four) — fixed-width sha256 ledger rows for
  //       the files above and nothing else.
  //
  //     What did NOT move: every corpus body outside the six, `st-work`,
  //       `st-board`, `st-debug`, `st-quick` and `st-pr-resolve` among them;
  //       every rule and every skill; the three portable hook scripts in all
  //       four clients (only the claude review gate moved, which is the
  //       containment the rows below rely on); every generated page and every
  //       client entry file. The same wave repointed the repo-local
  //       `st-eval-run` skill override to the v4 eval set, which no golden
  //       here holds — that skill is an override, not corpus, so it appears in
  //       neither snapshot file — and changed `src/cli/kit/terminal.ts`,
  //       `tsdown.config.mjs` and three `website/` files, none of which the
  //       emitted tree carries. The APM projection moved in the same change
  //       and is regenerated by `scripts/generate-apm-package.mjs`, not by
  //       sync.
  //
  //   - 2026-09-04, the recommended-next-step close-out — Package 8, carried
  //     from the last package's register sweep by name. CORPUS PROSE moved on
  //     six command bodies, each in every dialect that carries one (claude
  //     commands, copilot prompts, cursor skills), and on nothing else:
  //
  //     CHANGED `commands/st-ask.md` (6491 -> 6861 bytes claude/copilot, 6535
  //       -> 6905 cursor), `commands/st-debug.md` (11274 -> 11659, cursor 11318
  //       -> 11703), `commands/st-quick.md` (7846 -> 8227, cursor 7890 -> 8271),
  //       `commands/st-spec.md` (14987 -> 15365, cursor 15032 -> 15410),
  //       `commands/st-rework.md` (15898 -> 16273, cursor 15945 -> 16320) and
  //       `commands/st-pr-resolve.md` (19501 -> 19882, cursor 19552 -> 19933).
  //       Each gained one closing paragraph naming a recommended next step
  //       DERIVED from that run's own state rather than read off the fixed
  //       ladder or table the file already carried — the contract `st-work`,
  //       `st-board` and `st-plan` already shipped, so all nine touchpoints now
  //       close on one. Codex carries no command bodies, so neither of its two
  //       goldens moved.
  //     CHANGED the `.stamity/manifest.json` row in the four command-bearing
  //       tree digests (claude, copilot, cursor, all-four): six `contentHash`
  //       values moved and the byte length did not, so each row shows a new
  //       digest at an unchanged size. The residue-document goldens do not
  //       carry the manifest and did not move — the four updated snapshots are
  //       tree digests only.
  //
  //     What did NOT move: the charter (`AGENTS.md`) in every selection, every
  //       generated page, every hook script, `commands/st-work.md`,
  //       `commands/st-board.md` and `commands/st-plan.md` — byte-identical
  //       rows in every dialect that carries them — and every other corpus
  //       body.
  //
  //   - 2026-09-02, the identity-casing fix, refreshed after the content-wave
  //     refresh below had already landed. HOOK SCRIPTS moved, nothing else:
  //     three operator-facing prose strings in `src/hooks/scripts.ts` opened
  //     with the product name capitalised at sentence start, which the identity
  //     rule forbids; they now open lowercase. Byte lengths unchanged
  //     (session-start 22872, config-tamper-notice 2383 per client), digests
  //     moved — so the five tree goldens moved on those two paths per client,
  //     and the codex and all-four residue documents moved only in the manifest
  //     hash rows that record those scripts. The sibling suite's byte-exact
  //     hook-script golden took the same refresh with its own row.
  //
  //     What did NOT move: every corpus body, every generated page, every
  //       client entry file.
  //
  //   - 2026-09-02, the closure run's content wave plus the codex floor ranking.
  //     The widest corpus movement of the run, and the first refresh that changes
  //     WHICH rules one client receives:
  //
  //     CHANGED nine corpus artifacts, each in every dialect that carries it —
  //       `rules/stamity-injection-screening.md` (+1409 bytes: run-time ingress
  //       that never lands in the state directory is screened at the same tier),
  //       `rules/stamity-learnings-schema.md` (-2448: the authoring contract
  //       folded into the writer that enforces it, leaving the curation posture),
  //       `commands/st-work.md` (+467), `commands/st-pr-resolve.md` (+501),
  //       `commands/st-debug.md` (+312), `commands/st-quick.md` (+16, one
  //       threshold row renamed to what it measures), `skills/st-handoff`
  //       (+687), `skills/st-qa` (+92) and `skills/st-dep-audit` (+64, an
  //       `obsolete_when` line rewritten to a condition somebody can check —
  //       three more of those moved on artifacts whose emitted copies strip the
  //       field, so they show here only as unchanged rows).
  //     CHANGED the codex root `AGENTS.md`, 32361 -> 28956 bytes, and this is a
  //       DELIVERY change rather than a size one: the appendix pays for the
  //       larger `injection-screening` (a `floor:security` rule, so it holds its
  //       rank) out of its tail, and `api-versioning` — no floor tag, `normal`
  //       precedence — is now dropped whole. Codex receives five rules where it
  //       received six. `test/adapters/codex.test.ts` re-pins both sets, and
  //       `ALWAYS_ON_SHARED_BYTES_WITH_CODEX` moves with the byte figure.
  //     CHANGED the omission notice's ordering sentence in every file that
  //       carries one: "then security-floor rules" -> "then floor-tagged rules",
  //       following the shaper's rank from the one `floor:security` tag to
  //       `floor:*` membership. No rule changes rank today — the security floor
  //       is the only floor the rules corpus declares — so this half moved text
  //       and nothing else.
  //
  //     What did NOT move: every generated file, every hook script, and every
  //       corpus body outside the nine above.
  //
  //   - 2026-09-02, the eval-driven refusal fix. CORPUS PROSE moved on
  //     `commands/st-quick.md` alone, in every dialect that carries it
  //     (6956 -> 7830 bytes claude/copilot, 7000 -> 7874 cursor, codex likewise):
  //
  //     The hard refusal enumerated three unlock routes — no proceed-anyway
  //       option, no confirmation prompt, no operator flag — and an adversarial
  //       eval case found a fourth the text never barred: hand the refused change
  //       to the operator as a diff, on the reasoning "I'm not the one making the
  //       edit". The contract now says a hand-off is the same refused change with
  //       a different hand on the keyboard. Re-measured after the edit: that case
  //       went 2/3 -> 3/3, so this diff is a closed guardrail leak rather than a
  //       wording preference.
  //     The refusal template also now says `<threshold>` is the fired row's own
  //       name copied from the table, not a coined category. That half did NOT
  //       change the behaviour on re-run and is kept because it states the
  //       contract correctly; the residual is a model-adherence finding.
  //
  //     What did NOT move: every other corpus body and every generated file.
  //
  //   - 2026-09-02, the closure run's close-out. CORPUS PROSE moved again, in
  //     the dialects that carry the edited artifacts:
  //
  //     CHANGED `commands/st-work.md` (the run-exit invariant now says it binds
  //       at exit and that a run holding a live question has not exited, so
  //       asking is not a pending finding; the severity floor now says who
  //       closes a Minor row, since not reaching the QA checkpoint was never the
  //       same as not closing; and the in-flow decompose names the requirement
  //       ids) and `commands/st-plan.md` (a `requirements` field on the unit
  //       table, an L4 lint row checking it, and the return contract reporting
  //       L4). Both edits close claim-vs-claim collisions rather than adding
  //       features: two shipped texts told a run to close a row and to ask about
  //       it, and the requirement id was named as a join key by every artifact
  //       except the one that produces the units.
  //
  //     What did NOT move: every path whose source was untouched. The APM
  //       projection moved in the same change and is regenerated by its own
  //       script, not by sync — a separate step, and the reason its three tests
  //       went red here before it was run.
  //
  //   - 2026-09-01, the closure run's content batch. CORPUS PROSE moved, in
  //     every dialect that carries the edited artifacts and in none that does
  //     not:
  //
  //     CHANGED the five edited corpus artifacts across the selections that
  //       carry them -- `commands/st-work.md` (the light row now names the two
  //       specialist lenses it skips and the security lens it keeps, the deep
  //       row's undefined "Prove-final" placement is anchored to the phase
  //       order that exists, and the dependency-audit note points at the skill
  //       that owns those fields), `agents/stamity-reviewer.md` (a
  //       whole-branch carve-out so the diff-only scope stops contradicting
  //       the deep pass, and a head that says "mutation" where it meant it),
  //       `agents/stamity-implementer.md` (the spec delta names the
  //       requirement id), `commands/st-plan.md` and `skills/st-dep-audit`
  //       (the delegation and its return route). Each moved in the claude,
  //       cursor, copilot, codex and `.agents/` forms that hold it, which is
  //       the projection working: one source edit, every dialect.
  //
  //     What did NOT move: every path whose source this batch did not touch.
  //       A corpus edit reaching an unrelated emitted file would mean the
  //       projection had stopped being a function of its input.
  //
  //   - 2026-09-01, the timing-margin pass over the lock-staleness flake class.
  //     One generated script moved and nothing else:
  //
  //     CHANGED `.stamity/generated/hooks/claude/stamity-review-gate.mjs`
  //       (24741 -> 26669 bytes) in the two claude-bearing selections. The
  //       counter's wait ceiling went 10s -> 25s. The progress detector added
  //       in the row below already waits out a queue that keeps handing the
  //       lock on, but the ceiling was checked unconditionally underneath it,
  //       so a herd of 30 writers on a loaded runner still hit it at roughly
  //       330ms per critical section and dropped the tail writer's round --
  //       fail-open by design, and the 29-of-30 signature on the windows leg.
  //       25s is 4% of the 600s the client allows this hook's events and under
  //       the 30s of its tightest class, so re-wiring the gate cannot put the
  //       wait outside the budget. A holder that DIED still costs ~1s, not 25:
  //       it hands the lock to nobody, so the idle detector returns and the
  //       ceiling is never consulted.
  //     CHANGED `.stamity/manifest.json` in the same two selections, each at
  //       UNCHANGED byte length (16080 claude / 54488 all-four) -- the
  //       fixed-width sha256 ledger row for that one script, and nothing else.
  //
  //     What did NOT move: every other emitted path in both trees, and the
  //     cursor, copilot and codex selections entire -- the same containment
  //     the row below relies on, and the reason a byte moving elsewhere would
  //     have meant the edit escaped the claude adapter's residue.
  //
  //   - 2026-08-26, the review-gate lock rewrite (windows leg, round 2). One
  //     generated script moved and nothing else:
  //
  //     CHANGED `.stamity/generated/hooks/claude/stamity-review-gate.mjs`
  //       (19592 -> 24741 bytes) in the two claude-bearing selections. The
  //       counter's lock stopped counting ticks and started watching for
  //       progress: an observed change of holder re-arms the idle window, so a
  //       queue of finishing reviewers is waited out rather than read as a lock
  //       nobody will release, and the rename that stores the round is retried
  //       on the two errnos a held destination raises. The flat 50 x 20ms
  //       budget it replaces dropped rounds wherever a critical section cost
  //       more than ~33ms -- reproduced at 27 of 30 writers, and the reason the
  //       herd case in `test/hooks/scripts.test.ts` went green-to-red on the
  //       windows leg with no source change between the two runs.
  //     CHANGED `.stamity/manifest.json` in the same two selections, each at
  //       UNCHANGED byte length (16215 claude / 54983 all-four) -- the
  //       fixed-width sha256 ledger row for that one script, and nothing else.
  //
  //     What did NOT move, and would have surfaced here if the edit had
  //     escaped its class: every other emitted path in both trees, and the
  //     cursor, copilot and codex selections entire. The review gate is claude
  //     adapter residue and no other client carries it, so a byte moving in one
  //     of them would have meant the lock rewrite had reached a shared path it
  //     has no business in.
  //
  //   - 2026-08-18, the model-ladder provenance rewrite (integration fixer
  //     round 1). One corpus body moved and nothing else:
  //
  //     CHANGED `st-work` in each of the three dialects that carry it —
  //       `.claude/commands/st-work.md` and
  //       `.github/prompts/st-work.prompt.md` (14379 → 15534, ONE digest
  //       shared by the pair, so that render stays dialect-independent) and
  //       `.cursor/skills/st-work/SKILL.md` (14428 → 15583). The body says
  //       where a role's class is DECLARED (the agent file), that the ladder
  //       table restates rather than decides it, that an unresolvable class
  //       omits the key instead of guessing, and which two placements are the
  //       flow's own — the shipped half of the `src/roster/modelLadder.ts`
  //       header rewrite. Same +1155 bytes on all three, and the
  //       cursor-to-claude offset holds at 49 bytes across the refresh, which
  //       is what proves a body edit rather than a frontmatter dialect change.
  //     CHANGED `.stamity/manifest.json` in the four selections carrying that
  //       command, each at UNCHANGED byte length (59845 / 20750 / 16315 /
  //       16165) — fixed-width sha256 ledger rows and nothing else.
  //
  //     What did NOT move, and would have surfaced here if the edit had
  //     escaped its class: the entire `codex` selection, tree and manifest
  //     both. Codex emits no command dialect at all, so it holds zero
  //     `st-work` paths. Nor did the override-layer fix in the same round
  //     (`residueContext` now rebuilds the content spec with all three parts,
  //     `src/emit/planner.ts`) move a byte here — these fixtures install no
  //     pack and seed no override tree, so that rebuild never runs in them;
  //     `test/cli/engine/emission.test.ts` is where it is held.
  //
  //   - 2026-08-17, the rework regeneration. ~450
  //     moved lines, the widest refresh either golden has taken. By artifact
  //     class, each with the unit that caused it:
  //
  //     REMOVED `.agents/plugins/stamity/plugin.json`. The container left the
  //       plan, so the reclaim sweep drops the path
  //       and its ledger row with it. Its residue document is the single
  //       largest deletion here, and nothing replaced it: the skills tree it
  //       pointed at is emitted directly and was already goldened.
  //     ADDED `.claude/skills/**` (18 paths) and `.claude/commands/*.md` (9) —
  //       their native homes on each client. Every native skill body
  //       is byte-identical to its `.agents/skills` twin, which is a re-target
  //       rather than a second render; the assertion in the four-tool union
  //       below proves that file for file instead of leaving it to the digest.
  //     ADDED `.cursor/skills/stamity-*/SKILL.md` (9) — the same nine command
  //       bodies in cursor's dialect.
  //     ADDED `stamity-{security,design-quality,performance}` in all four agent
  //       dialects, their three ids in the `ROSTER` of
  //       `.cursor/hooks/subagent-guard.mjs` (1962 → 2034 bytes), and three
  //       rows in `.stamity/generated/agent-tool-policies.json` (7 rows → 10,
  //       2711 → 3860 bytes) — the specialist tier. The guard and the policy
  //       document moving WITH the roster is the point: a specialist that
  //       reached the tree without reaching both would be a spawnable agent no
  //       enforcement point knows about.
  //     ADDED `.stamity/generated/hooks/claude/stamity-review-gate.mjs` (13948
  //       bytes) plus its `TaskCompleted` and `SubagentStop` wiring in
  //       `.claude/settings.json` (1163 → 1590). Claude
  //       residue by design: the CORE plan is still three portable scripts,
  //       and `test/corpus/emissionGoldens.test.ts` holds those three unmoved.
  //     CHANGED every agent body carrying a model key — `effort: high` added on
  //       claude (+13 bytes each), `model: inherit` dropped on cursor (−15
  //       each), the codex pin rewritten at equal width (same byte count, new
  //       digest) — the model-key rework. Copilot's agent files carry no model
  //       key and moved only where the BODY moved, which is the cross-check
  //       that this was a frontmatter change and not a quiet body rewrite.
  //     CHANGED eight corpus bodies, once per client dialect each:
  //       `st-onboard` (5958 → 8798), `st-verify` (5325 → 5971),
  //       `st-work`, `st-board` and `st-spec`, `st-quick` and
  //       `stamity-creator` (7045 → 9852), `stamity-fixer` (5375 → 5647), and the
  //       `stamity-security-patterns` rule (6065 → 6161).
  //     CHANGED `CLAUDE.md` (306 → 310) — the bridge now names
  //       `.claude/skills/` and direct `/st-onboard` invocation instead of
  //       telling the reader to open a path by hand.
  //     CHANGED `AGENTS.md` (30546 → 28693) in the codex-bearing selections.
  //       The 32 KiB drop list is risk-ordered now — critical kept longest,
  //       then security floors, then declared precedence, then id — so
  //       `security-patterns` survives and `migrations` + `question-protocol`
  //       drop in its place.
  //     CHANGED `AGENTS.md` (3804 → 4204) in the claude, copilot and cursor
  //       selections: the charter's `## Conditional layer` section was
  //       rewritten to split the twelve rules into nine glob-scoped and three
  //       description-scoped, and to state that a description-scoped rule's
  //       cost depends on the client. +400 bytes on every charter render, which
  //       is also part of the codex row above.
  //
  //       LEDGER CORRECTION (this refresh was recorded wrong at the time, and
  //       the correction is kept in place rather than rewritten away). Three
  //       claims were false: the codex figure read 28293 against a real 28693;
  //       the charters were said to "stay byte-identical at 3804" when they had
  //       moved to 4204; and the conclusion drawn from that — that the reorder
  //       was "budget-scoped rather than a charter rewrite" — rested on the
  //       false datum, so it is dropped rather than restated. The charter DID
  //       change in this commit, on its own line above. Both figures are the
  //       snapshot's own (`"AGENTS.md"` digest rows), and the corpus invariant
  //       suite now pins them as disclosure constants so a ledger row and the
  //       golden cannot drift apart again unnoticed.
  //     CHANGED `.stamity/manifest.json` in all five selections — the ledger
  //       rows for every path above.
  //
  //     What did NOT move, and would have surfaced here as a further changed
  //     row if it had: the three core hook scripts, the MCP dialects
  //     (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`),
  //     `.github/workflows/copilot-setup-steps.yml`, and the monorepo
  //     sub-charter `packages/alpha/AGENTS.md`.
  //
  //   - 2026-08-17 (3b3bc96), the session-start rebuild. All five selections:
  //     `stamity-session-start.mjs` (13472 → 15319 bytes, one new digest shared
  //     by every client because the script is client-independent), plus exactly
  //     the two documents that EMBED that digest — `.codex/hooks.json` and
  //     `.stamity/manifest.json`, both unchanged in byte length, since a hex
  //     sha256 is fixed width. Justification: the session-start screen composes
  //     three catalogs instead of two (`INJECTION_PATTERNS` joined the read
  //     path in `src/hooks/scripts.ts`), and the invisible-character class it
  //     embeds became the full `Default_Ignorable_Code_Point` property rather
  //     than a six-range hand-list (`src/denyscan/denyScan.ts`). The screen
  //     gained rows and dropped none: `test/hooks/scripts.test.ts` pins the
  //     embedded id set and proves every row left out carries network
  //     vocabulary — the one stated reason — so that refresh could not have
  //     hidden a lost detector. Nothing else moved: no corpus body, no charter,
  //     no client entry file, no other hook script.
  it("matches the tree digest golden", () => {
    expect(treeDigest(tree)).toMatchSnapshot(`${label} tree digest`);
  });

  it("matches the residue-document golden byte for byte", () => {
    expect(residueDocuments(tree, repo.manifest)).toMatchSnapshot(`${label} residue documents`);
  });

  it("emits a byte-identical tree on a second run into a fresh directory", async () => {
    const second = await makeGoldenRepo({ tools });
    try {
      expect(await readEmittedTree(second.rootDir)).toEqual(tree);
    } finally {
      await second.cleanup();
    }
  });

  it("emits no reserved product name in any byte it writes", () => {
    expect(findReservedNameHits(tree)).toEqual({});
  });

  it("carries the fixture's detection facts into the persisted manifest", () => {
    // The fixture is a real project, not an empty directory: emission
    // substitutes on these facts, so a silently undetected one would golden a
    // charter that no user repo would ever get. The package manager and the
    // script list are load-bearing for exactly that reason — they decide
    // whether the emitted gate is a command this repo can run.
    expect(repo.manifest.detected).toEqual({
      languages: ["typescript"],
      linters: ["eslint"],
      testFrameworks: ["vitest"],
      ciProviders: ["github-actions"],
      packageManager: "pnpm",
      packageScripts: ["test", "lint", "typecheck"],
    });
    expect(repo.manifest.maturityTier).toBe("team");
    expect(repo.manifest.mcp?.servers).toEqual([GOLDEN_MCP_SERVER_ID]);
  });

  it("gives every emitted path ledger attribution", () => {
    const owners = ownersByPath(repo.manifest);
    const unattributed = emittedPaths(tree).filter(
      (path) => !UNLEDGERED_ENGINE_PATHS.has(path) && (owners.get(path)?.length ?? 0) === 0,
    );
    expect(unattributed).toEqual([]);
  });

  it("records one row per selected tool on co-owned paths and exactly one on per-tool paths", () => {
    const owners = ownersByPath(repo.manifest);
    const shared = Object.fromEntries(
      SHARED_CORE_PATHS.map((path) => [path, [...(owners.get(path) ?? [])].toSorted()]),
    );
    expect(shared).toEqual(
      Object.fromEntries(SHARED_CORE_PATHS.map((path) => [path, [...tools].toSorted()])),
    );

    // Per-tool artifacts: a path in one client's own residue is owned by that
    // client alone — no co-ownership leaks across the residue boundary.
    for (const tool of tools) {
      const isResidue = CLIENT_RESIDUE[tool];
      const rows = [...owners.entries()].filter(([path]) => isResidue(path));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter(([, adapters]) => adapters.length !== 1 || adapters[0] !== tool)).toEqual([]);
    }
  });

  it("emits into the selected clients' residue paths only", () => {
    const unselected = TOOLS.filter((tool) => !tools.includes(tool));
    const strays = Object.keys(tree).filter((path) =>
      unselected.some((tool) => CLIENT_RESIDUE[tool](path)),
    );
    expect(strays).toEqual([]);
  });

  it("keys the emitted tree with POSIX separators only", () => {
    expect(Object.keys(tree).filter((path) => path.includes("\\"))).toEqual([]);
  });

  it("leaves every seeded user file byte-untouched", () => {
    // Init writes beside the user, never over them: the seeded project files —
    // the committed hook among them — must read back exactly as authored.
    const seeded = Object.fromEntries(
      Object.keys(GOLDEN_SEED_FILES).map((path) => [path, tree[path]]),
    );
    expect(seeded).toEqual(GOLDEN_SEED_FILES);
  });
});

describe("four-tool union", () => {
  let repo: GoldenRepo;
  let tree: Record<string, string>;

  beforeAll(async () => {
    repo = await makeGoldenRepo({ tools: TOOLS });
    tree = await readEmittedTree(repo.rootDir);
  });

  afterAll(async () => {
    await repo.cleanup();
  });

  it("writes one root charter, one skills tree, and one policy document for all four", () => {
    const owners = ownersByPath(repo.manifest);

    // Exactly one ROOT charter: the nested copies that exist are codex's
    // documented down-conversion targets, each under its own directory.
    expect(Object.keys(tree).filter((path) => path === AGENTS_MD_FILE)).toEqual([AGENTS_MD_FILE]);
    expect([...(owners.get(AGENTS_MD_FILE) ?? [])].toSorted()).toEqual([...TOOLS].toSorted());

    const skills = Object.keys(tree).filter((path) => path.startsWith(`${SKILLS_PROJECTION_DIR}/`));
    expect(skills.length).toBeGreaterThan(0);
    // TEST CHANGE, justified: the projection's owners are the clients
    // that READ it, not every selected client. `claude` declares
    // `readsAgentsSkillsDir: false` and receives its own native copy under
    // `.claude/skills/`, so owning the neutral tree as well made the tree
    // un-reclaimable on a repo whose only reader had been deselected, and made
    // a claude-ONLY repo receive 18 files it never opens. Ownership is asserted
    // against the declared readers, which is strictly more specific than the
    // blanket four.
    const projectionReaders = TOOLS.filter(
      (tool) => ADAPTER_REGISTRY[tool].facts.readsAgentsSkillsDir,
    );
    expect(projectionReaders.length).toBeGreaterThan(0);
    for (const path of skills) {
      expect([...(owners.get(path) ?? [])].toSorted()).toEqual([...projectionReaders].toSorted());
    }

    // TEST CHANGE, justified: native skill and native command homes gave
    // `SKILL.md` two further locations, so "every
    // SKILL.md sits under the vendor-neutral tree" stopped being true. The
    // property it protected — no path invented, no body rendered twice — is
    // asserted here in the two halves it split into, not weakened: every
    // SKILL.md sits under one of the three DECLARED roots, and each native
    // copy is byte-identical to the vendor-neutral row it re-targets.
    const skillRoots = [
      SKILLS_PROJECTION_DIR,
      ...Object.values(NATIVE_SKILL_DIRS),
      ...(CURSOR_COMMANDS_DIR === null ? [] : [CURSOR_COMMANDS_DIR]),
    ];
    const strayCopies = Object.keys(tree).filter(
      (path) =>
        basename(path) === "SKILL.md" &&
        !skillRoots.some((root) => path.startsWith(`${root}/`)),
    );
    expect(strayCopies).toEqual([]);

    // The re-target property: claude's native tree is the SAME bytes at a
    // second path, file for file — a copy, never a second render.
    const nativeSkillsDir = NATIVE_SKILL_DIRS.claude ?? "";
    expect(nativeSkillsDir).not.toBe("");
    const nativeCopies = Object.keys(tree)
      .filter((path) => path.startsWith(`${nativeSkillsDir}/`))
      .toSorted();
    expect(nativeCopies.length).toBeGreaterThan(0);
    expect(nativeCopies.map((path) => path.slice(nativeSkillsDir.length))).toEqual(
      skills.map((path) => path.slice(SKILLS_PROJECTION_DIR.length)).toSorted(),
    );
    for (const path of nativeCopies) {
      const twin = `${SKILLS_PROJECTION_DIR}${path.slice(nativeSkillsDir.length)}`;
      expect({ path, content: tree[path] }).toEqual({ path, content: tree[twin] });
    }
    expect(
      Object.keys(tree).filter((path) => basename(path) === basename(AGENT_TOOL_POLICIES_PATH)),
    ).toEqual([AGENT_TOOL_POLICIES_PATH]);
    expect([...(owners.get(AGENT_TOOL_POLICIES_PATH) ?? [])].toSorted()).toEqual([...TOOLS].toSorted());
  });

  it("bridges Claude Code to the charter through a managed CLAUDE.md import", () => {
    const claudeMd = tree[CLAUDE_MD_PATH] ?? "";
    expect(claudeMd).toContain(`@${AGENTS_MD_FILE}`);
    expect(claudeMd).toContain("STAMITY:BEGIN");
    // TEST CHANGE, justified: this client's skills moved to their native
    // location, so the bridge now points a reader at that directory. Same
    // assertion — the pointer names a directory the client actually reads —
    // against the constant the emitter reads, so the two cannot drift apart.
    expect(claudeMd).toContain(NATIVE_SKILL_DIRS.claude ?? "");
    expect(claudeMd).not.toContain(SKILLS_PROJECTION_DIR);
  });

  it("scopes Cursor rules with a comma-separated glob list carrying no spaces", () => {
    const mdcPaths = Object.keys(tree).filter((path) => path.endsWith(".mdc"));
    expect(mdcPaths.length).toBeGreaterThan(0);
    const globLines = mdcPaths
      .map((path) => (tree[path] ?? "").split("\n").find((line) => line.startsWith("globs:")))
      .filter((line): line is string => line !== undefined);
    expect(globLines.length).toBeGreaterThan(0);
    for (const line of globLines) {
      // Cursor's `.mdc` reader splits on "," and does not trim: a space after
      // the comma becomes part of the next glob.
      expect(line).not.toMatch(/,\s/);
      expect(line).not.toMatch(/^globs:\s*\[/);
    }
  });

  it("scopes Copilot instructions with a quoted applyTo list carrying no spaces", () => {
    const instructions = Object.keys(tree).filter((path) => path.endsWith(".instructions.md"));
    expect(instructions.length).toBeGreaterThan(0);
    const applyTo = instructions
      .map((path) => (tree[path] ?? "").split("\n").find((line) => line.startsWith("applyTo:")))
      .filter((line): line is string => line !== undefined);
    expect(applyTo).toHaveLength(instructions.length);
    // Non-degenerate: at least one shipped rule declares several globs, so the
    // separator assertion below has something to bind.
    expect(applyTo.filter((line) => line.includes(",")).length).toBeGreaterThan(0);
    for (const line of applyTo) {
      expect(line).toMatch(/^applyTo: ".+"$/);
      // The documented separator is a bare comma (`src/adapters/copilot.ts` →
      // APPLY_TO_SEPARATOR). A padded one parses only through a trim that lives
      // in a different code path of the consuming client.
      expect(line).not.toMatch(/,\s/);
    }
  });

  it("targets Copilot agents at github-copilot with a non-empty least-privilege tool list", () => {
    const agents = Object.keys(tree).filter((path) => path.endsWith(".agent.md"));
    expect(agents.length).toBeGreaterThan(0);
    for (const path of agents) {
      const front = (tree[path] ?? "").split("---")[1] ?? "";
      expect(front).toContain("target: github-copilot");
      const tools = front.split("\n").find((line) => line.startsWith("tools:")) ?? "";
      expect(tools).toMatch(/^tools: \[".+"\]$/);
    }
    expect(tree[COPILOT_SETUP_STEPS_PATH]).toBeDefined();
  });

  it("digests every generated codex hook command against the script bytes on disk", () => {
    const hooks = readJson(tree, CODEX_HOOKS_FILE);
    const events = Object.keys(hooks["hooks"] as Record<string, unknown>);
    expect(events).toEqual(events.filter((event) => /^[A-Z][A-Za-z]+$/.test(event)));

    const entries = Object.values(hooks["hooks"] as Record<string, { hooks: unknown[] }[]>)
      .flat()
      .flatMap((group) => group.hooks as { command: string[]; sha256?: string }[]);
    const generated = entries.filter((entry) =>
      (entry.command[1] ?? "").startsWith(`${HOOKS_GENERATED_DIR}/`),
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const entry of generated) {
      const scriptPath = entry.command[1] ?? "";
      const bytes = tree[scriptPath];
      expect(bytes, `${scriptPath} is referenced by ${CODEX_HOOKS_FILE} but not emitted`).toBeDefined();
      expect(entry.sha256).toBe(createHash("sha256").update(bytes ?? "", "utf8").digest("hex"));
    }

    // User hooks are the repository's own trust domain: wired verbatim, never
    // digested by the engine (it did not author those bytes).
    const user = entries.filter((entry) => (entry.command[1] ?? "").startsWith(".stamity/hooks/"));
    expect(user.length).toBeGreaterThan(0);
    for (const entry of user) expect(entry.sha256).toBeUndefined();
  });

  it("keeps the root charter inside the codex AGENTS.md budget", () => {
    const charter = tree[AGENTS_MD_FILE] ?? "";
    expect(Buffer.byteLength(charter, "utf8")).toBeLessThanOrEqual(CODEX_AGENTS_MD_BUDGET_BYTES);
  });

  it("carries the user hook into every client that takes a hook config, and no other", () => {
    const userCommand = GOLDEN_USER_HOOK.command[1] ?? "";
    expect(tree[CLAUDE_SETTINGS_PATH]).toContain(userCommand);
    expect(tree[CURSOR_HOOKS_CONFIG_PATH]).toContain(userCommand);
    expect(tree[CODEX_HOOKS_FILE]).toContain(userCommand);

    // Copilot has no hook-config surface v1, so nothing it emits may claim one.
    const copilotEmissions = emittedPaths(tree).filter(
      (path) => path.startsWith(".github/") || path.startsWith(".vscode/"),
    );
    expect(copilotEmissions.length).toBeGreaterThan(0);
    expect(copilotEmissions.filter((path) => (tree[path] ?? "").includes(userCommand))).toEqual([]);
  });
});

describe("empty tool selection", () => {
  it("refuses to persist a manifest that names no target tool", async () => {
    // The brief's "state dirs + manifest only" tree is unreachable by design:
    // manifest validation rejects an empty tool set before the commit point, so
    // the honest golden is the refusal plus the absence of a manifest. Making
    // it emit instead would be an engine behaviour change, not a test fix.
    await expect(makeGoldenRepo({ tools: [] })).rejects.toThrow(/at least one target tool/);
  });
});
