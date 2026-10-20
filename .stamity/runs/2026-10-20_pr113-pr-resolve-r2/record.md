# Run 2026-10-20_pr113-pr-resolve-r2 — `/st-pr-resolve` round 2 on PR #113

Status: replied — round 2 of 3 complete; 3 of 3 threads answered (FIX, landed and pushed at `6a4970d3`) and resolved
Mode: attended
Plan: docs/plans/021-cloud-runs-02.md
Invocation: /st-pr-resolve 113 — round 2: the review bot's three comments on 035f078d (4323847931 at src/cli/commands/run.ts:281, 4323847917 at :367, 4323847923 at :954). The maintainer's standing answer from the morning walk of 2026-10-20 ("Fix them like round 1"); the maintainer is away, so the triage takes its declared default. Fixes are built in run 2026-10-18_cloud-runs-2; replies post after the fix push, then the threads resolve.
Round: 2 · PR head `035f078d` (reviewed by the bot at 10:13:36Z, review 5583683869)

## Pre-flight

- **Fork PR:** no. The head is `feat/cloud-runs-2` in `zomarit/stamity`, which this run can push to.
- **Scope:** PR #113 only.
- **Reply channel:** the invocation is the consent, and replies post.
- **Attempts:** one earlier round ordinal on #113, round 1's two replies, so this is round 2 of 3. The bot's
  reviews of `ea27c645`, `1f558154` and `c526348a` left no comment, so no round answered them.
- **Resolved threads:** round 1's two. Open threads: `PRRT_kwDOUEQOdM6uSU3t` (`:281`), `PRRT_kwDOUEQOdM6uSU3f`
  (`:367`) and `PRRT_kwDOUEQOdM6uSU3n` (`:954`), none outdated.
- **Run marker:** no fetched comment carries one.
- **Mode:** attended, with nobody present to answer. The triage ask takes its declared default (`accept`), recorded below
  as a `Default applied:` line. Stamity's own unattended mode is not set, so the FIX routes go to `/st-work`.

## Ingress screen

- **Inline comments 4323847931, 4323847917 and 4323847923** (review 5583683869, on `035f078d`): each `kept`. None
  matched any class (`instruction-override`, `tool-preamble`, `exfil-signal`, `invisible-smuggling`, `marker-forgery`).
  - Scanned: 782, 782 and 786 bytes.
  - No format, tag-block or bidirectional control character.
  - Link host: the bot's priority badge (`img.shields.io`).
  - Each ends with the bot's own finding marker, which is not a run marker.
- **Review summary 5583683869:** the bot's status boilerplate, with no ask about the code, so not a finding.

## Findings, decisions and replies

**Evaluation.** One read-only researcher on Opus 5.5 at `medium`, for the one file cluster (`src/cli/commands/run.ts`),
at `035f078d`, returned at about 10:27Z. Each claim below is restated in this run's own words.
- **P1 (`:281`):** `ACCEPT`, `current`, Warning, high on the mechanism (direct read) and medium on the impact.
  - `startsUnattended` (`:720-724`) reads only the work tree's record, and `readsUnattended(null, undefined)`
    (`:1695-1698`) is false. `startVerbGit` fixes the start's git hardening at `:281` before `originRunTip` reads
    origin's record (`:365-394`), and the fallback refusal at `:299` asks the same question.
  - On a fresh-clone continuation of an unattended run with `STAMITY_UNATTENDED` unset, the start keeps git's
    program-valued variables (`src/cli/engine/gitWrite.ts:150-159`) and passes the fallback refusal. The next
    checkpoint reads the switched work tree's record and enforces both, so no push escapes.
  - Counter-argument, which loses: a run declared only by `--unattended` also starts attended before its record
    exists. But here the record exists and says unattended, the docblock (`:52-55`) promises start reads it, and the
    start-time refusal is otherwise dead on this path.
  - Fix: decide the mode once. With no work-tree record, read the record head with hardened git from
    `refs/heads/stamity/<id>`, then `refs/remotes/origin/stamity/<id>`, through a helper shared with `originRunTip`'s
    regular-file check.
- **P2 (`:367`):** `ACCEPT`, `current`, Minor, high on the mechanism and medium on likelihood. It needs a long-lived
  clone that reuses a run id.
  - `originRunTip` takes `refs/remotes/origin/<runBranch>` as origin's state with no `ls-remote`, against the file's
    own rule at `:632-635`. A branch the server deleted is recreated from the stale tip (`:325`), and the next
    checkpoint pushes it back.
  - Counter-argument, which loses: start then needs the network. But start already calls `gh api`, and the checkpoint
    already depends on `ls-remote`.
  - Fix: `remoteRefs` (`:637-651`) before the tip is used. A branch origin no longer has is refused, naming
    `git fetch --prune origin`; a tip origin moved past is refused, "fetch origin first"; a failed read is refused (see
    the sign-off below).
- **P3 (`:954`):** `ACCEPT`, `current`, Warning, high (direct read; the fresh-clone premise is pinned by
  `test/cli/commands/runCheckpoint.test.ts:2101`).
  - `if (sectioned.length === 0)` guards the only read of the committed patch (`:958`), so a checkpoint holding a new
    change rewrites `person-only.patch` from the work tree alone (`:970-1009`), and `held` (`:1028`) drops the earlier
    paths. On a fresh clone the earlier change lives only in that patch.
  - Counter-argument, which loses: the comment at `:955` keeps the patch "until a checkpoint writes a new one", and the
    old patch is in history. But the same comment says a clone holds its change "in that patch alone", and the branch
    tip and `held` are what the hand-off reads.
  - Fix: keep the committed sections whose paths are not held now, in order before the new ones, with their paths
    joining `held`. Split at line-start `diff --git ` headers, which suits binary sections, since base85 has no space.
- **Unit shape:** P1 and P2 share `originRunTip`, and P3 is separate. All three are one file, about 250–300 changed
  lines with tests, so one unit and one writer.

**Triage.** `Default applied: triage → accept (nobody present to answer; the maintainer's standing answer "Fix them
like round 1")`. All three route FIX through `/st-work`'s run `2026-10-18_cloud-runs-2`, unit `n14-bot-round-2`,
which carries its own review loop and a security lens.

`Default applied: P2's failed origin read → refuse in both modes`. A start that cannot read origin's branch could not
checkpoint either, and failing closed is the safer default. Not taken: falling back to the tracking ref with a note
when attended.

| ID | Comment | File:line | Severity / confidence | Screen | Decision | Carried by | Reply |
|---|---|---|---|---|---|---|---|
| P1 | 4323847931 | `src/cli/commands/run.ts:281` | Warning / high | kept | FIX | `n14-bot-round-2`, landed `d46b9ec9` | posted 4325028070 |
| P2 | 4323847917 | `src/cli/commands/run.ts:367` | Minor / high | kept | FIX | `n14-bot-round-2`, landed `d3caedf6` | posted 4325028462 |
| P3 | 4323847923 | `src/cli/commands/run.ts:954` | Warning / high | kept | FIX | `n14-bot-round-2`, landed `7786be4d`, `e08325fb`, `474ee9fd`, `5421ce61` | posted 4325028863 |

**The fix's progress (in run `2026-10-18_cloud-runs-2`).**
- `n14` built P1, P2 and P3 (`fff260f3`, `504f9f93`, `9679bfca`, `ac6fd9d2`), and its review approved.
- Its security lens found that P3's new carry of earlier patch sections reads a work-tree file a steered run can write.
  Rounds 1 to 3 closed two of the routes through it. The third, a rename in git's older header spelling, takes one
  round past the cap, by sign-off, with an allowlist.
- P1 and P2 hold.
- The replies wait for the push that carries the finished fix.
- 12:06Z: the round past the cap closed the last route (`n14-security-r4.md`), and `n14` is folded onto the cut's
  branch (`d46b9ec9`..`5421ce61`).
- 12:41Z: the cut's push carried the finished fix (`035f078d..6a4970d3`), and the replies posted.

## Gates

The fix went through run `2026-10-18_cloud-runs-2`'s own review loop. `n14` had a review, a security lens over four
rounds (the fourth past the cap, by sign-off), and closure reviews that approved. The whole-branch review on Fable 5.1
over `035f078d..4a0d5331` found one Warning on the pages, fixed in `6a4970d3` and closed by its round 9.

The final gates on the pushed head `6a4970d3` (that run's record, 12:31Z) exit 0, except `gate scan`, which exits 1 on
the six deliberate hits the maintainer accepted:
- the full suite, alone under the machine lock: 309 files, 16,965 passed, 21 skipped, no re-run;
- coverage 96.72 / 90.65 / 99.01 / 97.77, every floor held;
- lint, typecheck, knip, `check`, the leak gate and the hygiene check.

## Egress guards

- **Push:** `feat/cloud-runs-2`, `035f078d..6a4970d3`, a fast-forward, at 12:41:02Z. A fresh read of the pull request's
  head sha equalled it before any `Implemented in` reply.
- **Replies:** 3 posted at 12:41:25Z to 12:41:31Z, each on the first attempt. Each came from a file that
  `gate scan --text … --label reply` passed (exit 0), and each carries the round-2 signature with its confidence. No
  machine-local path is in any body.
- **Threads:** all three resolved at 12:41:44Z, after the replies, on the maintainer's standing instruction for this
  pull request. The command's own guard leaves resolution to the reviewer, but the review bot does not resolve
  threads, and `main`'s ruleset needs them resolved before the merge. A fresh read counts 0 open threads.
- **No review verdict, label or check was touched.**
- **The description** was replaced before the push (12:40:51Z), from a file `gate scan --text … --label pr-body`
  passed (exit 0). A read-back equals the file.

## Close

- **Rows written:** none. Nothing was deferred, and no FIX stayed blocked.
- `Default applied: re-poll → done (nobody present to answer)`. The bot's review of `6a4970d3` is read once by run
  `2026-10-18_cloud-runs-2`, as after every push. Any comment it leaves goes to the maintainer as the next round's
  input, with no third round started while they are away.
- 12:44Z: the bot's review of `6a4970d3` found nothing. It left its 👍 on the pull request, and its summary comment's
  state reads no findings on that commit. The comment was screened and kept, with no class matched.
- **Next step:** none for this command. Round 3 stays unspent, and the pull request has no open thread.

Status: replied — round 2 of 3 complete; 3 of 3 threads answered and resolved, and the bot's review of `6a4970d3`
found nothing.
