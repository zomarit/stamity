**Status: DONE.** Both claims are true at HEAD `cbc610ac`. Both are ACCEPT: G1 Warning, G2 Minor.

## G1: gate.ts:1503, the pushed history reads `Base..HEAD` when origin has no remote-tracking ref

- **decision:** ACCEPT
- **severity:** Warning. A secret in history below `Base:` can be pushed without being scanned. It only happens in a narrow setup (an empty or never-fetched origin, or a remote-tracking ref that is stale or was written by hand). The default branch stays protected.
- **confidence:** high on the code claim, `direct`: the lines below, plus a test that asserts the reviewer's exact scenario as a pass. Medium on how often real runs hit it, `inferred` plus `unverified` (see the Unanswerable list).
- **applicability:** current. It is the same gap as ledger row review/223, which is Minor and still open (`.stamity/runs/2026-10-15_cloud-runs/ledger.jsonl:381`). Its line citation `run.ts:879-898` is out of date. The same code is now at `run.ts:974-988`. Fixing G1 closes review/223.
- **evidence:**
  - `src/cli/commands/gate.ts:1502`: "tracked" means only that `for-each-ref refs/remotes/origin/` lists at least one ref.
  - `gate.ts:1503`: without one, `commits = since`, which is `Base..HEAD` only (`:1501`).
  - `gate.ts:1509` and `:1430`: the fallback adds a note, nothing more.
  - `gate.ts:1538-1543`: the doc comment promises the scan covers "every commit `origin` lacks, those below the base included". The fallback breaks that promise.
  - `src/cli/commands/run.ts:974-988`: the same fallback in `heldInHistory` (`:977` builds `HEAD --not <base>`). The only difference is that a failed `for-each-ref` counts as tracked (`:976`), which errs on the safe side.
  - `run.ts:852`: the push goes out after both reads.
  - `test/cli/commands/runCheckpoint.test.ts:825-843`: an empty bare remote, the tracking ref deleted, and a token committed then removed below `Base:`. The test expects `pushed: true` and `scan: { hits: [] }`. The token commit lands on the remote and the scan reports clean.
  - `run.ts:482-495` (`remoteTip`, pr/20) and the spec at `docs/specs/everyday-flows.md:3602-3603` already treat remote-tracking refs as stale local state and ask `ls-remote` instead. The reviewer's second premise is already accepted in this file.
- **causal_chain:**
  1. The checkout's origin has no `refs/remotes/origin/*`. That happens with an empty remote, a remote added and never fetched, or a sha-only fetch. Separately, a stale or hand-written ref names commits the remote does not hold.
  2. `readHistory` (`gate.ts:1501-1503`) and `heldInHistory` (`run.ts:977`) read only `Base..HEAD`, or with a stale ref they exclude everything below it.
  3. `git push origin HEAD:refs/heads/<branch>` (`run.ts:852`) sends every commit the remote lacks, `Base:` and its ancestors included on an empty remote. A credential added and removed below `Base:` becomes reachable on the remote, with a clean scan (shown by the test at `runCheckpoint.test.ts:825-843`).
  4. A related point, `inferred`: `Base:` comes from the agent-written record head (`run.ts:604`). A run that rewrites `Base:` to HEAD and writes a tracking ref at HEAD leaves both reads empty. The `ls-remote` fix closes this as well, because the remote's real tips no longer depend on local state. SECURITY.md's record-head residual (`SECURITY.md:476-483`) names `Mode:` only.
- **Which run does which check:**
  - The secret scan runs on every `checkpoint` and `end`, attended or unattended (`run.ts:816` has no condition).
  - The held-path history check runs only when unattended (`run.ts:773`, `:806`).
- **Choosing the fix:**
  - **Recommended: `ls-remote` refs as the `--not` set.** It also fixes stale or written tracking refs. It keeps review/201's case (a remote that holds the history but was never fetched) at a small set, because the remote's tips exist locally. It keeps `/st-pr-resolve`'s fetched-head design working (`everyday-flows.md:3675-3677`).
  - **Rejected: "scan all ancestors when no ref can be read".** It fixes only the empty or unfetched case. It brings back review/201's false refusal for a never-fetched remote that already holds the history (ledger row 359).
  - **Trade-off to decide:** on a truly empty remote, the held-path check would then refuse whenever pre-`Base:` history touches a held path. That is technically accurate, since the push does send those commits. But HEAD's tree is pushed regardless, because `atTip` only diffs `Base..HEAD` (`run.ts:807`). Applying the fix to the scan is required. Applying it to the held-path check is what the reviewer asks for, at the cost of that refusal.
- **smallest_fix:** In `run.ts`, read `git ls-remote origin` once (`refs/heads/*` and `refs/tags/*`). Pass those shas to `heldInHistory` and to `scanChange(..., { scope: "pushed", remoteTips })`, and read `HEAD --not <shas>` with `--ignore-missing` (all of HEAD's history when the list is empty). Hold the push when `ls-remote` fails. Drop the `for-each-ref` probe and both no-ref notes. `gate.ts` makes no network call itself.
- **proving_test:** Edit the test at `runCheckpoint.test.ts:825-843` so it expects exit 1, `push held: secret scan hit at c.txt:1 (commit <old>)` and no refs on the bare remote. It gates the behaviour, so the edit needs an inline `TEST CHANGE, justified:` note. Add two cases: one with a tracking ref written at `older fix` and an empty remote (still held), and one where the remote already holds the seed with the tracking refs deleted (push passes, no `held path in history`).

## G2: run.ts:652, a record with no `Branch:` skips the branch check

- **decision:** ACCEPT
- **severity:** Minor. The check fails open. A missing or malformed `Branch:` lets a checkpoint or `end` commit, push and open a draft PR from whatever non-default branch is checked out. Detached HEAD, the default branch, the origin pin, held paths and the scan all still apply. And since the head is agent-writable anyway (`SECURITY.md:476-483`), this check only catches accidents.
- **confidence:** high, `direct`.
- **applicability:** current.
- **evidence:**
  - `run.ts:652` reads `head.branch !== null && !matches(head.branch, current)`, so a null branch skips the mismatch.
  - `src/runs/resumeCard.ts:239`: no match leaves `branch` null.
  - `src/runs/layout.ts:94`: the pattern `/^branch:\s*(\S+)/i` only matches at column 0, so `- Branch: x` or `**Branch:** x` reads as null.
  - `run.ts:257-317`: `run start` writes no record head. It writes only `origin.json` (`:430`) and returns `branch`/`base` as JSON.
  - `content/skills/st-unattended/SKILL.md:29-31` and `content/commands/st-work.md:405-411`: the agent writes `Branch:` after `run start`. The skill warns "bare at column 0" because this slip is realistic.
  - `run.ts:606-613`: a missing `Base:` refuses. `Branch:` has no matching refusal.
  - `run.ts:69-72`: the doc comment promises the branch check with no exception.
  - No test checkpoints a record without `Branch:`. Every fixture carries one: `runCheckpoint.test.ts:178`, `:660`, `:835`; `runEnd.test.ts:164`, `:534`. The record at `runEnd.test.ts:529` belongs to the earlier run, not the one being checkpointed.
- **causal_chain:**
  1. The agent writes the head line malformed (indented, bulleted or bolded) or leaves it out. `run start` cannot catch this, because it writes no head (`run.ts:257-317`).
  2. `readRecordHead` returns `branch: null` (`resumeCard.ts:239`, `layout.ts:94`).
  3. The ternary at `run.ts:652` falls through to `PUSHABLE_BRANCH` (`:654`). Any non-default branch passes, and the run continues to the commit (`:791`), the push to `refs/heads/<current>` (`:838`, `:852`) and the draft PR from `current` (`:865`).
- **Can a record lack `Branch:` during a checkpoint?** Not in the documented order. Every documented writer puts it there: the unattended skill (`SKILL.md:30`), the attended `/st-work` Frame (`st-work.md:408`) and `/st-pr-resolve` (`SKILL.md:162`). A malformed line or a rewrite can still remove it.
- **Should it refuse?** Yes. A refusal breaks no documented caller, and the attended close walk's `run start` on the default branch still matches through build/97 (`run.ts:643-645`).
- **smallest_fix:** At `run.ts:652`, add `head.branch === null ? \`commit refused: ${recordRel} names no Branch:\` :` before the mismatch branch. That keeps it a `notDone` refusal, so `run end` still copies it into the morning list.
- **proving_test:** In `runCheckpoint.test.ts`, use `seed("unattended")`, rewrite the record once with no `Branch:` line and once with `- Branch: <RUN_BRANCH>`, and switch to `feature/other`. Expect exit 1, `notDone` naming the missing `Branch:`, `pushes()` empty and no refs on the remote. Add the same case to `runEnd.test.ts`, asserting that no pulls request was made.

## Breaking-change candidates
None. `scanChange` would gain an optional option field, which is additive. The new refusal is a behaviour change, not a flag, type or export change. Confidence high, `direct` (`gate.ts:1545`).

## Unanswerable
These parts of question 2 are about git and platform behaviour, which a codebase-tier read cannot check.

1. **Does a fresh clone, including `--depth N`, always create `refs/remotes/origin/*`?**
   - What I found: the repo assumes it does. The test seed at `runCheckpoint.test.ts:171-173` says "as a run's clone has it".
   - My own reading of git, not checked: yes for a non-empty remote; no for a clone of an empty remote or a sha-only fetch. A CI pull-request checkout may fetch under `refs/remotes/pull/*`.
   - Confidence low, `unverified`.
   - What would settle it: run `git clone`, `git clone --depth 1` and a clone of an empty bare remote, then `git for-each-ref refs/remotes/origin/` on each. Plus the cloud clients' clone commands, which need the `+web` tier.
2. **Is `Base:` always already on origin in the fallback cases?**
   - Never on an empty remote, because `Base:` is a local commit (`run.ts:262`, `:298`). Unknown for an added, never-fetched remote. Confidence medium, `inferred` from the two cited lines plus the empty-remote case.
3. **Do `git rev-list` and `git log` accept `--ignore-missing`, and does `git push` negotiate only against advertised refs that exist locally?**
   - Not checked, `unverified`.
   - What would settle it: `git rev-list --help`, or a one-line run with a made-up sha.
4. **Does the shell guard allow `git update-ref refs/remotes/...` during an unattended run?**
   - Not checked, `unverified`. `src/hooks/personOnly.ts` is outside this brief's scope.

## Sources consulted
- `src/cli/commands/gate.ts`
- `src/cli/commands/run.ts`
- `src/runs/layout.ts`
- `src/runs/resumeCard.ts`
- `test/cli/commands/runCheckpoint.test.ts`
- `test/cli/commands/runEnd.test.ts`
- `test/cli/commands/run.test.ts`
- `SECURITY.md`
- `docs/specs/everyday-flows.md`
- `content/skills/st-unattended/SKILL.md`
- `content/commands/st-work.md`
- `.stamity/runs/2026-10-15_cloud-runs/ledger.jsonl` (rows 359 and 381)

`resumeCard.ts` and the two content files were read only to trace where the record head comes from. I ran no commands.