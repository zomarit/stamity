# Audit of the Codex and GPT-6 Astra sessions — findings

Requested by the maintainer on 2026-09-17: audit everything the Codex CLI and GPT-6 Astra sessions
touched in the public product and in the private layer, because a consuming enterprise will
re-create its private fork on the next release and the fork route must be sound and usable for
years. Read-only; nothing in either checkout was changed by the audit. The fix batch is planned in
`docs/plans/008-plugin-lifecycle-01.md` (batch A); Minors not taken there are listed here and
pointed at from `.stamity/inbox.md`.

## Scope

- Public window: commits `d6096ac^..6ad4e0d` (2026-09-10 to 2026-09-11; 35 commits, 316 files
  outside the eval run artifacts and the generated trees). Attribution: no commit names the
  model; the three sessions were identified by their run records (Codex sandbox paths such as
  `/root/model_census`, the `codex-astra` profile) and by their commit fingerprint (terse
  conventional subjects), and the maintainer confirmed the set: the Astra model-pin support run
  (PR #32), Package 13 enterprise downstreams (plan 005, 1.6.0) and Package 10 finish-implementation
  with its readiness and session-eval runs (plan 006, the 1.7.0 candidate). Later commits from
  `d921ab0` onward are other sessions; each finding says whether the current HEAD still has it.
- Private layer: the five run directories of those packages (2026-09-10 enterprise downstreams,
  2026-09-10 package 10 and its intake, 2026-09-11 package 10 readiness, 2026-09-11 package 10
  session evals) and the 17 private commits of the window.
- Method: six parallel read-only reviews (fork and downstream lane; adapters and hook runtime;
  signing and release plumbing; eval runner and authoring checker; corpus and docs; private
  layer), each with git blame attribution, vendor pages re-read on 2026-09-17, and a claims-versus-
  code pass. Grades: Critical blocks the fork route or inverts an enforcement; Warning is a defect
  or a false claim with a bounded fix; Minor is drift or hygiene.

## Headline

Two Criticals, sixteen Warnings, about forty Minors, all listed below with file and line. The
window's code is careful where it touches credentials and pushes (nothing force-pushed, nothing
pushed on recovery, secrets read by one job, zero credential shapes in 2,779 tracked and 49,835
on-disk private files), and every hash-level claim in its records that could be tested holds. The
defects cluster in three places: assumptions frozen into copies (a manifest schema copied into a
workflow, a signing rehearsal pinned to a dangling commit, canonical identity literals a renamed
fork cannot change), vendor facts re-stamped without re-reading (Cursor's `failClosed` wording,
Copilot's session-start injection, the Codex hooks flag), and records or docs that describe a
state the tree left behind (three specs "pending" after shipping, a rewritten public handoff, the
eval protocol documents still on the retired set).

## Critical

| id | area | path:line | finding | status |
|---|---|---|---|---|
| FORK-1 | upstream lane | `.github/workflows/upstream-update.yml:996-1003`; `src/manifest/manifest.ts:181-199` | Missing-pull-request recovery re-validates `.stamity/manifest.json` against a frozen copy of the manifest schema (version, tools, a 17-key allowlist). The source has 18 keys since `ruleDelivery` landed on 2026-09-15, and `updatedAt` moves on every sync so the branch always runs. Executed: the workflow's own jq program accepts this repository's manifest and refuses the same manifest plus `ruleDelivery`. A fork that set the option loses recovery with a message blaming its schema. | open at HEAD (regressed by 86a79ca) |
| HOOK-1 | Cursor adapter | `src/adapters/cursor.ts:780-785, 771, 943-953, 1147-1152`; `src/hooks/portableRunner.ts:156` | cursor.com/docs/hooks (read 2026-09-17) counts "no output" as a `failClosed` failure. Both emitted guards and every runner-wrapped authored pre-tool-use row allow by writing nothing, so a client that implements its text blocks every sub-agent spawn, MCP call and silently-allowing user hook. The module's own revisit trigger for exactly this clause (`cursor.ts:874-881`) had fired and the window re-stamped the page without acting. `cursor.test.ts:1082-1116` pins the silent path as correct. Contingent on the vendor's behaviour; the fix (an explicit allow) is correct either way. | open at HEAD |

## Warning

| id | area | path:line | finding | status |
|---|---|---|---|---|
| FORK-2 | identity | `scripts/tarball-smoke.mjs:92,130,152` | Install path and consumer imports hardcode `@zomarit/stamity`; the guide tells a fork to rename the package, and CI runs the smoke on every PR, so the fork's inherited required check goes red until it patches the script. Not named in the guide. | open |
| FORK-3 | identity | `test/cli/notice/updateNotice.test.ts:410-424`; `test/docsPages.test.ts:213-214,275,542-543,732` and ~20 more test files | Tests read the real `package.json` and pin `name === "@zomarit/stamity"` and `private === false`; the guide's rename makes every fork red on its recommended gate and names only one test to edit. CHANGELOG 1.6.0 promises "configured downstreams can run the same suite". | open |
| FORK-4 | inherited checks | `.github/workflows/pr-checks.yml:88-93` | The DCO job fails closed at 250 listed commits; an update PR lists every upstream commit since the last integration (v1.7.0..v1.8.0 is 118, v1.7.0..HEAD is 184), so a fork that skips two releases cannot pass and cannot split a merge PR. | open |
| FORK-5 | portability | `scripts/distribution-identity.mjs:30-34`; `upstream-update.yml:258-259,916,1050` | `repository.url` must be a github.com URL, so a GHES or GitLab private copy cannot run the regenerate step the guide recommends, while the guide says "the script is portable". | open |
| HOOK-2 | Copilot adapter | `src/hooks/portableRunner.ts:79,153`; `src/hooks/model.ts:112`; `src/adapters/copilot.ts:297`; `.github/client-contracts.md:34`; `docs/capability-matrix.md:182,234` | The Copilot hooks reference (read 2026-09-17) says `sessionStart` can inject `additionalContext`; the runner discards session-start output on Copilot and four surfaces say the client cannot inject it, so the learnings and handoff index never reaches Copilot sessions. | open |
| HOOK-3 | Codex adapter | window diff of `src/adapters/codex.ts` | The window shipped `.codex/hooks.json` without `[features] hooks = true`; every Codex hook was inert on 0.154.0 while REQ-FINISH-001 was declared met. | repaired at fee7a76 (2026-09-15); the repair's "defaults OFF" prose is itself unestablished, see NE |
| HOOK-4 | sustainability | `src/hooks/portableRunner.ts:35,53-56,64-66,108,133-135,141-146,151-152`; `src/adapters/codex.ts:601,613-614`; `src/adapters/copilot.ts:697,699` | About fifteen vendor literals (event-name map, field names, timeout policy, tool names, the SessionEnd 3-second cap) carry no citation or access date; one Cursor page is cited under two URLs and two dates in one module. | open |
| HOOK-5 | security | `src/hooks/portableRunner.ts:15-18` | The Codex starter walks up from the session cwd and executes the nearest hook script it finds; Codex trusts the hook definition's hash only, and the scripts live in the agent-writable workspace. The window removed a fictional `sha256` field and replaced it with nothing. | open (pre-existing exposure, widened slightly) |
| SIGN-1 | signing rehearsal | `.github/workflows/pack-signing-rehearsal.yml:7-10,22,68-72`; `scripts/pack-signing-rehearsal.mjs:50-53` | `SIGNING_SOURCE_SHA` is on no branch and not an ancestor of `main`; the rehearsal signs that frozen source, and its `paths:` filter never re-runs it when `src/pack/**` or the lockfile changes, so the live-signing proof SECURITY.md cites no longer witnesses the code that ships. GitHub may prune the dangling commit. | open (75aa866 repointed only the branch name) |
| SIGN-2 | signing docs | `docs/packs-and-trust.md:203-230,248-253`; `scripts/sign-pack.mjs:14-18`; `src/pack/sign.ts:116` | The author flow says no token is needed, but the sigstore client has no interactive identity provider (only GitHub Actions OIDC or `SIGSTORE_ID_TOKEN`), and the script swallows every error message, integrity refusals included. | open |
| DOC-1 | client contracts | `.github/client-contracts.md:13-20` | Byte-unchanged since the window: describes Codex hooks as command strings plus `/hooks` trust, without the feature flag, the project trust level or the headless measurement; the page holds the spec's "dated dispositions" and is outside the re-attestation bucket. | open |
| DOC-2 | specs | `docs/specs/enterprise-upstream-lane.md:473-474`; `docs/specs/apm-canonical-distribution.md:156-157`; `docs/specs/fork-layer.md:216-217` | All three say the 1.6.0 extension's publication is "pending"; 1.6.0, 1.7.0 and 1.8.0 have shipped. The bootstrap check in the guide still asserts `v1.5.0` as the imported baseline. | open |
| DOC-3 | changelog | `CHANGELOG.md:653-654` | The link table stops at 1.6.0; 1.7.0 and 1.8.0 render unlinked and "Unreleased" spans them. Nothing pins the table. | open |
| DOC-4 | APM package | `scripts/generate-apm-package.mjs:557-567`; `CHANGELOG.md:211` | "Shipped skills declare compatibility and license metadata" holds on the CLI projection only; the APM `headFor` drops both keys (0 of 10 `.apm/skills/*/SKILL.md` carry them), and the enterprise guide routes downstreams through APM. | open |
| EVAL-1 | public eval runner | `scripts/eval/run.mjs:16-24,52,57-60,194-206,218-220` | The advisory-repeat comparator keys on a hash of every input byte; the 17 committed summaries carry 17 distinct hashes, so it has never matched and cannot across any content edit; the promote-or-delete rule is unenforceable through this route. | open |
| EVAL-2 | eval docs | `CONTRIBUTING.md:253-263`; `.stamity/overrides/skills/st-eval-run/SKILL.md:17,57,80,185`; `evals/README.md:436-450`; `evals/rubric-v7.md:3`; `evals/README.md:10-11` | The contributor guide describes the retired three-of-three rule; the operator skill and the v2 profile route a run to protocol documents pinned to the retired 78-case set; the current rubric misstates who selects it; the README contradicts the set on the eight moved Expected blocks. | open (mixed window and post-window lines) |
| CHECK-1 | authoring checker | `content/skills/st-verify/scripts/spec-plan-coverage.mjs:21-41,71-80,146-149` | Three false-pass classes: a prose range ("REQ-X-001 … REQ-X-021") scopes only its endpoints (plan 007 passed with 4 of 22 in scope); an absent or suffixed `## Spec delta` heading passes with nothing in scope; a line carrying ADDED and REMOVED hides the added ids. The explicit range form (`REQ-X-001–012`) is expanded correctly. | open |
| PRIV-1 | public record | `.stamity/runs/2026-09-11_package-10-readiness/handoff.md:1-21` | Rewritten in place on 2026-09-12 and 13; at HEAD it describes the 1.7.0 release and no longer names runs 13 and 14, the Codex route or the window's Not-done list, against the record set's own chronological convention. | open |
| PRIV-2 | private layer | the release verifier under `runs/2026-09-10-enterprise-downstreams/published-verification/verifier-source/verify-release.py:106`, inherited by the 1.7.0 and 1.8.0 copies | The verifier of record hardcodes two APM binaries under `/tmp` created on 2026-09-10; nothing provisions them, so the next post-publication verification fails at the APM rows after a reboot. | open |
| PRIV-3 | private layer | about 60 one-off scripts under the five run directories | Machine-bound (absolute home and `/tmp` paths, sibling-checkout assumptions, browser tools never retained); more than 30 cannot run today and eleven would overwrite frozen, hash-pinned evidence if run; two gate runners issue their own "root GO" file and then consume it. | open |
| PRIV-4 | private layer | `runs/2026-09-11-package-10-readiness/qa-final-preparation/` | 45,108 untracked files, 1.29 GB, ignored by a nested rule outside the storage policy's names and in no archive: a regenerable build source tree, a never-used Copilot runtime, and a 28 MB fixture tree that should be archived. | open |
| PRIV-5 | private layer | `runs/2026-09-10-package-10/STATE.md` (51 of 207 lines), five sibling files | Cramped no-spaces prose; readable successors exist for everything except the overnight operational chronology. | open |

## Minor

Fork lane: landing-policy check treats a 404 as unverified so rulesets-only branches never clear
the note (`upstream-update.yml:618-634`); the bot's `--signoff` trailer is presented as a DCO
certification (`scripts/upstream.mjs:1657`; guide 413-414); a private fork's regenerated
marketplace advertises an npm package it never publishes (`generate-plugin-manifests.mjs:423`);
runtime remedy strings hardcode `npx @zomarit/stamity` in `check.ts`, `sync.ts`, `handoff.ts`,
`learn.ts`, `clean.ts`, `add.ts` and `sync/engine.ts`.

Adapters: runner-level faults on the Copilot core guard fail closed while every surface calls
the guard telemetry (`portableRunner.ts:47,70`); legacy `approve` becomes a deny on Codex only
(`:102-105`); "Cursor has no ask decision" wording (`:134`); Codex `session_end` inherits the
client's 1-second default undisclosed (`codex.ts:614`); `HOOK_CONFIG_CAPABLE_TOOLS` documents a
warning class nothing emits (`hooksInfra.ts:110-111,160,442`); the contracts page describes the
Copilot camelCase path the emission never selects (`client-contracts.md:33`); cloud Copilot lacks
`agentStop` (`copilot.ts:183`); Codex `hooks.json` carries an undocumented top-level `description`
key (`codex.ts:617-621`).

Signing and build: a residual symlink race after the final destination check (`sign.ts:21-26,
123-124`); a raw `ENOENT` escapes before the integrity refusal (`sign.ts:65-66,87`); identity is
compared only after the transparency-log entry exists (`sign.ts:93-95,107-115`); the size-budget
prose says declaration comments are measured while the declaration config strips them
(`tsdown.config.mjs:53-55`; `tsconfig.declarations.json:9`); two scripts skip or mislabel the
native-TypeScript bootstrap (`sign-pack.mjs:4`; `pack-signing-rehearsal.mjs:9`); the rehearsal's
public outputs (two transparency-log entries per run, archived fixture packs) are unstated; stale
"candidate branch" comments in `test/ci/workflow.test.ts:2008-2011,2112-2114`; `image-size` 2.0.4
exists while the accepted-risk note says "through 2.0.2"; Node pinned at 22.22.2 with 22.23.2
current; the rehearsal suite does not evaluate its `if`, the digest steps or the source-pin split.

Corpus and docs: eight template `agents/openai.yaml` companions (`display_name: "Qa"`), two key
orders for the same skill vocabulary, a rule restated in seven bodies with no pin, the codex
capability row naming no model or effort carrier while `st-work` says the disclosure does, the
"three client proposals" criterion nobody can check, "only ratchets down" presented as tested when
the gate is an equality pin, undated restatements of dated facts across the fork guide, and the
website table component adding a pre-hydration tab stop with a doubled announcement.

Evals and checker: model ids, thresholds, fixture and roster counts pinned as literals in two to
five places each; run-14 results text implies labels that were never admitted; a self-comparison
in a private verification script that cannot fail; a red-green script that records but never
asserts; unit-heading and token shapes the checker rejects with misleading messages; a
non-RE2 backreference.

Private layer: the run-14 configuration hash names no retained file; a "closed" banner compresses
a re-scoping into a proof; two Renovate debug logs held a token before in-place redaction and
nothing records a rotation; the 2026-09-10 fixture repositories and 349 MB of `/tmp` residue have
no deletion record.

## Claims versus code that survive at HEAD

- Recovery "requires every other manifest byte to match" (guide 734-739, spec 482-491); the
  workflow also requires an exact 17-key set (FORK-1).
- "Configured downstreams can run the same suite" (CHANGELOG 275-277); the DCO cap and the
  canonical-name pins say otherwise (FORK-3, FORK-4).
- "The script is portable, any other host" (guide 786-787); the regenerate step is github.com-only
  (FORK-5).
- "Session-start command output does not inject learning context" on Copilot (four surfaces);
  the vendor page says it can (HOOK-2).
- "Hooks use command strings and native /hooks trust" for Codex (client-contracts 13-20); the
  code writes a feature flag the page never names (DOC-1).
- "Publication and the required live lifecycle evidence are pending" in three specs (DOC-2).
- "Shipped skills declare compatibility and license metadata" (CHANGELOG 211); not on APM (DOC-4).
- "Strict three-sample scoring" (CONTRIBUTING 260); the runner scores two of three (EVAL-2).
- "Every Expected block byte-identical" (evals README 10-11); eight moved (EVAL-2).
- "Declaration comments are included in its measured bytes" (tsdown.config 53-55); stripped.
- "Interactive identity flow" comment in `sign.ts:116`; no such provider exists (SIGN-2).

Verified sound, no finding: control-data validation before any push, no force flag, recovery
pushes nothing, ownership refusals, URL redaction, the one-secret publish job, the canonical guards
failing closed on absent privacy; the signing helper signing exactly the verifier's payload with 24
pinned refusal cases; the release digest handoff and dry-run complement; every window token in the
corpus resolving to the nine wired tokens; the eight companion files conforming to the vendor
schema; the private records' hash-level claims (final gate 7,819 tests, platform receipts, run-14
terminal report, push receipts, the 1.6.0 verification with a real 76-file leak scan).

## Not established

- Cursor's actual handling of a `failClosed` hook that exits 0 with no stdout (one fixture hook in
  Cursor settles it).
- Codex `features.hooks` default: the hooks page read 2026-09-17 says on by default; the
  2026-09-15 measurement never ran without the key.
- Whether any Codex hook runs interactively (only headless `exec` was measured).
- Copilot CLI and cloud running the emitted file end to end (no binary on the maintainer's
  machine at the time).
- The public-fixture platform results of Package 13 (run and PR ids in the record; not reachable
  from the tree).
- Whether `image-size` 2.0.3 and 2.0.4 patch the two named advisories.
- Whether the token that reached the two Renovate debug logs was rotated.

## Disposition

- Criticals and Warnings in the public repository: fix units A1 to A7 in
  `docs/plans/008-plugin-lifecycle-01.md`, batch A, before any plugin work, because the plugin
  roots inherit the hook runtime and the enterprise fork route runs through the upstream lane.
- Private-layer items PRIV-2 to PRIV-5: a maintainer task list in unit A7 (private checkout only).
- Minors: not fixed in 1.9.0 unless a fix unit touches the file anyway; one inbox row points at
  this record.
- Open Not-done items from the window that are still open: the nine human QA rows (accepted
  unperformed three times), Copilot CLI entitlement, the enterprise's own engine identifiers, private
  required-check enforcement on the account plan, fixture cleanup. Unchanged by this audit.
