# Run record: the factory bridge, file 2

Status: closed 2026-11-09 — proved on the release tree `f81136c5`; ledger 138 rows, 0 open; the 1.18.0 cut follows
Mode: attended
Branch: feat/factory-bridge-02
Plan: docs/plans/023-factory-bridge-02.md
Base: 04966e3aa3142418248a693bb8d16bd074f0d5ab
Invocation: /st-work docs/plans/023-factory-bridge-02.md
Confidence gate: medium
Effort: deep

## Frame

A person gets what they need around the factory bridge: their own knowledge server, one short page after a run, one list of
what is truly theirs, and learning that proposes instead of editing itself. The real runs then prove the routes, and 1.18.0 is
cut. In scope: file 2's units, the items the next-session card carries in, and the review of the late work from file 1. Out of
scope: new pack work, the deep audit engine and the new brand.

Model plan: implementers, reviewers, lenses and fixers on Opus 5.5 at high; researchers at medium; the whole-branch review once on
the frontier class. Isolation: a git worktree per unit, under the worktree farm, with one writer per file.

## Blast radius

Wide at the first whole-branch read: the manifest schema (`mcp.ownServers`), the guard's rule set on every client's copy, the
person-only path set and the land-evidence set, with three new verbs. Every setup that syncs after 1.18.0 meets them. The closing
read of that review is moderate: every strict reader of an own row passes one seam, so a false refusal stops a person's whole sync,
and the round moved no persisted field, wire field or event name.

From each approval. Contained: `safety-measure` (only a composed run that names its list reaches the check), `test-time-limit` (26
test files, no `src/`), `deps-website` (one page and a build-only lockfile), `land-wording` (no land or guard logic moved),
`guide-truth` (two pages and one test file). Moderate: `human-only-list` (no engine code, but the text reaches every unattended
morning list, the attended close and the walk on every client), `own-server` (read on every sync, check and clean plan, reaching four
client documents, the Copilot env file, the manifest and the ledger), `run-overview` (a read-only verb and one outward comment on the
failed-notice path of `run end`, no land evidence). `propose-learning`'s last unit read is moderate too, a request for changes
whose fix the whole-branch review read: the guard's ask class on every client, every unattended close's learnings, the morning list,
the public CLI page and seven eval Briefs.

The cheapest real test of what remains: one real `sync` with an own row on the scratch repository, and one table of ordinary link
rows through `withOwnServers`.

## Decisions

- Default applied: plan gate → option 1, execute now (persisted plan docs/plans/023-factory-bridge-02.md)
- Deferral inbox: 248 rows, 1 shown (always, a decision-waiting row about nested workspaces), none settled by the plan; left in the inbox.
- Freshness guard: stale on the paths file 1 moved, as the plan says it will be; 9 of its reads moved, so the plan is re-read and restamped before any unit runs.
- Signed off (`clone-land`): it waits for a real run that meets it, so the cut does not depend on it. Today a person's clone refuses and the person merges on GitHub, which fails safe.
- Signed off (`own-server`): the unit re-cut into three, as its cell left out `sync`'s readers. The curated reference page does not move, and a member keeps its selected own ids with their rows.
- Signed off (build/2, build/4): a row is removed by `config mcp own --remove`, and an organization's policy gates pack sources, not rows a person adds to the manifest: stated in `SECURITY.md`, not built.
- Signed off (review/7, review/57): an own row meets the pack's own text scan through one export, and a stricter bar for own rows only refuses a credential held in a link. Packs do not change.
- Signed off (review/24): the migration read of `ownServers` is dropped, since no predecessor could have written the key.
- Signed off (build/13, build/14): a re-init keeps today's selection rule, and the guard does not read `config`, as the page says.
- Signed off (review/37): the page says only that the package carries no override, since what one would do for a registry install is not settled.
- Signed off (review/46, review/48, review/54): the page never says a run has not landed when it cannot know; the failed-notice comment carries the run's marker; refused rows print first under `Only you can do`.
- Signed off (review/22): the time limit covers every twin the line search found, on one shared helper.
- Signed off (review/61, review/67): `learn accept` takes learnings only, so one yes cannot replace a shipped rule, and an override is not proposed in this release.
- Signed off (review/62): `learn accept` is a person-only act, and the guard asks on it.
- Signed off (review/69): the logic budget moved from 2.875 MiB to 3 MiB, one step, with a dated reason. The branch's own features are the size, and a fresh build read 13,720 bytes over the old ceiling.
- A person's word (the secret scan): four hits in `test/mcp/ownServers.test.ts` were fixtures holding no key, settled as "Fixtures: reshape the lines". The scan keeps no allow-list.
- Signed off (review/70): the guard's byte ceiling moved from 299,008 to 303,104, by what was measured, with a dated reason, since the new ask left about 5 bytes.

## Log

- 2026-11-09T08:31Z leftovers: shown=8 real=8 fixed=0 scheduled=8 dropped=0 accepted=0 notes=unknown changed=0

## Proof block

Gate results — class `security-sensitive`, base `04966e3a`, merged tree `4e920548`:

The release tree is `f81136c5`. Its code was last gated at `0ed09862`, on 2026-11-08, alone and under the machine lock; after it only pages, the spec, `CHANGELOG.md` and their pins moved.

- `npm run build`, `npm run lint`, `npm run typecheck`, `npx knip`: each exit 0. Logic 2.93 of 3.00 MiB.
- `node scripts/leak-gate.mjs`: exit 0, 0 hits in 1,516 files.
- `node dist/cli.js check`: exit 0, drift clean, the known `autonomy-deploying` advisory.
- `node scripts/ci/test-run.mjs --coverage`: exit 0, 342 files, 21,942 passed, 19 skipped, every per-file floor held.
- `node scripts/qa/hook-runs.mjs --ask --require-observation`: exit 0, Claude Code and Copilot CLI held, Copilot's three facts held.
- `node scripts/hook-latency.mjs`: exit 0, overhead 2.1 and 4.6 ms, within 15.
- At `f81136c5`: `npx vitest run test/docsPages.test.ts` exit 0; `node dist/cli.js gate scan --base 4e920548` exit 0, no hits, 137 files; `node scripts/repo-hygiene.mjs --base 4e920548` exit 0. The records suite runs in CI's records job.

- classify: `node dist/cli.js gate classify --base 04966e3a --json`, read at `4e920548`, pass, exit 0, 116 paths.
- scan: `node dist/cli.js gate scan --base 04966e3a`, read at `4e920548`, exit 1, 4 hits, 117 files scanned, none unscanned. All four are `inline-api-key-assignment` in `test/mcp/ownServers.test.ts`: three from commit `42aa32ee`, one from commit `2fab0440`. Each is a header name beside a code variable, and none holds a key. `84adaf39` reshaped the lines, but the scan reads every commit since the base and keeps no allow-list. They stand on a person's word, as fixtures: "Accept the 4 history hits (Recommended)".
- CI on `4e920548`: 27 passed, 9 skipped, `all-ci-checks` and `all-pr-checks` among them, with both Windows legs, the fork probes and the records job.

- CI on the release tree `f81136c5`, on the private copy with its slower runner's longer time limit: 13 passed, 4 skipped as that copy always skips them (lanes, fork probe, prove-pr, records). `check` lts, floor (Node 22.22.2), windows-1 and windows-2 each passed, with `all-ci-checks` and `all-pr-checks`. `main`'s own push runs follow at the cut.

One earlier gate, on `db4db550`, was red on the scan alone: 8 of 9 gates passed, the suite at 340 files, 20,880 passed, 19 skipped, floors met. The scan's four hits are the ones named above.

Review verdicts:

- Each unit: reviewed to an approval, except `propose-learning`, whose last unit read asked for changes that the fixer made and the whole-branch review read. `own-server` went past its cap on the argument scan, and a fresh fixer one effort step up found the one cause; its closure read approves at medium. `copilot-trigger` is one dated docs row, read in the whole-branch rounds.
- Whole-branch, on the frontier class: request-changes at medium, then a closure round: an approve at medium. Rests on: the second pass of `run end` carries only the first pass's `notDone` lines, so its splice takes back nothing but a failed notice's own line, walked.
- The ledger's closing read: an approve.
- The pull request's review bot: two P2 findings on `84adaf39`, both real, fixed at `4e920548`. Its summary comment names `4e920548`, its `+1` is on the pull request, and both threads are resolved. #137 merged by fast-forward at `4e920548`.

Ledger: 138 rows, 2 Critical, 69 Warning, 67 Minor. 123 fixed, 3 rejected with reasons, 12 deferred, each retired to a scheduled place. None open.

Decisions trace: under Decisions above.

Eval: run 61 is the run of record, PASS, composed back to run 56 through runs 59 and 57: golden 94/94, floors 54/54, adversarial 43/43, benign twins 0/10, probes 31/31. It rests on a grader change made after runs 58 to 60 were scored, read by a separate review. After `ff3509b1`, nothing under `content/`, the goldens or `evals/` moved, so the eval line does not run again.

Not done:

- The real runs, as `docs/factory.md` gives them. Claude's cloud, 2026-11-06, several sessions: the label started the task, a run passed the pre-flight, pushed through the run verbs and opened a draft pull request with green CI, and stopped before landing (prove/1 to prove/3, scheduled). Cursor's cloud, 2026-11-08, three sessions: two refused at `direct-push`, the guard stopped one earlier; none pushed (prove/4, scheduled). Not run: the webhook route, a merge by the land job, `run land` on Cursor's cloud, a local run to a merge.
- File 1's QA rows: row 1 walked, and it did not reach a merge (a draft with green CI). Row 2 walked, and it refused at `direct-push`. Row 3 half walked: `direct-push` read pass under the ruleset with no bypass on the scratch repository; the run with the bypass list set is still open.

- Scheduled: `clone-land`, in the plan, until a real run shows the merge on GitHub is not enough; the catalog reshape, when the 2.0 planning session starts; what a real run reads for an administrator, the webhook's key and the setup line, at the first real runs. Each is in `docs/plans/023-factory-bridge-02.md`.
- Accepted: the four scan hits, by commit above. Each of these is stated in `SECURITY.md`: a credential in a link's path or under another parameter name (review/58); a live `learn capture` on an attended session asks nobody; a file a local unattended run writes by hand stays in the work tree; the guard does not read `stamity config` (build/14); the three advisories under `What is still open`.

- The last leftovers: prove/1 to prove/4 and build/25 to build/28, each in plan file 2's Follow-ups with its files, when the first planning session after the 1.18.0 tag starts. The maintainer's word scheduled the real-run limits; the session placed the four build rows beside them, since each is the same 403 or footer family and a `content/` edit fires the eval line.

Recommended next step: the cut of 1.18.0 from `f81136c5`, then the next release's planning with the Follow-ups first.
