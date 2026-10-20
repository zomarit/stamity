**Status: DONE.** Both claims hold at HEAD `d137ef85`. Recommendation: ACCEPT both, at Warning. Nothing was run or written.

---

### H5: `src/hooks/scripts.ts:3683`, the unattended detection drops records before reading them

- **decision:** ACCEPT
- **severity:** Warning. The bypass is real but unlikely by accident: a still-open unattended run has to fall behind 50 folders whose names sort after it. The remote's own protection on the default branch still stands. For the ask gate the effect is only a wasted question, which its design accepts (`scripts.ts:3926-3929`), so Minor there.
- **confidence:** high, direct (lines read).
- **applicability:** current
- **evidence:**
  - Guard: `scripts.ts:3678-3683` keeps every folder whose name is a run id, sorts by name with the newest first, and cuts the list to `RUNS_READ_MAX` (= `GUARD_RUNS_READ_MAX` = 50, `:3079`, `:3172`). Only then are the record heads read (`:3684-3688`).
  - The variable is only a fallback: with `STAMITY_UNATTENDED` unset, the guard returns attended (`:3693-3694`).
  - The only call site is `decide`, for a command the unattended rule would refuse (`:3751-3755`).
  - The ask gate makes the same cut (`:4015-4020`, used at `:4080-4087`).
  - The filter checks only "is a directory" and "matches the run-id pattern" (`RUN_ID_PATTERN`, `src/runs/layout.ts:24`). A folder with no `record.md` still takes one of the 50 places.
  - An existing test fixes the current behaviour: `test/hooks/personOnlyGuard.test.ts:761-770` expects an old in-progress unattended record behind 50 newer folders to be ignored (`:767` expects `deny: false`).
  - Spec and docs cite this behaviour: `docs/specs/everyday-flows.md:3854-3856` and `SECURITY.md:105` ("among the newest run folders").
- **causal_chain:**
  1. 50 folders sort after the open run's folder: same date with a later slug, a future date, or even empty folders made with `mkdir`, which no guard rule refuses (`scripts.ts:3678-3683`).
  2. The open record is cut before its head is read, so it never gets a vote (`:3684-3688`).
  3. With the variable unset (valid when the run was declared with `--unattended`), `unattendedBy` returns null (`:3694`). `decide` then allows a raw `git push` to any branch other than the default (`:3753-3758`). That push skips the held paths and the last scan, the gap `SECURITY.md:426-428` describes.
- **related residual:** an agent that sets out to get around the rule can already rewrite its own record head (`everyday-flows.md:3861`). So H5 is mostly about folders piling up by accident. The empty-folder spelling of the same trick is named nowhere, though.
- **smallest_fix:** in both scripts, drop the `.slice` and read every run folder's head, which costs at most one lstat plus one read of up to 64 KiB each (`readdirSync` already lists every entry at `:3674`/`:4011`). Keep `RUNS_READ_MAX` only as a hard ceiling on folder count. Past it, the guard throws a coded error, which its catch turns into a refusal (`:3762-3767`) that only a would-be-refused push ever reaches; the ask gate fails open with its fault note.
- **test_rows:**
  - Change `personOnlyGuard.test.ts:767` to expect a denial, with an inline reason saying the cap no longer hides an open record.
  - Add: 50 empty future-dated folders (`9999-12-31_xN`) plus today's open unattended record: raw push denied.
  - Add: a count past the ceiling: raw push denied with the code named, while `npm test` is still allowed.
  - Add the ask-gate twins: a question refused with 50 newer closed records, and fail-open with the fault note past the ceiling.
  - Re-point the line citations at `everyday-flows.md:3856` and update the comments at `scripts.ts:3129` and `:3908`.

### H6: `src/hooks/scripts.ts:3590`, a custom default branch is unknown when `origin/HEAD` is absent or stale

- **decision:** ACCEPT, with a narrower fix than fail-closed (see design_note).
- **severity:** Warning. The gap only exists in attended sessions: unattended, every raw push is already refused, and the run verbs read the default branch from the REST API. It needs both a custom default name and a missing or stale `origin/HEAD`.
- **confidence:** high that the claim is true, direct (lines read). Medium on how often `origin/HEAD` is missing in practice: unverified, since which clone tools write it was not checked at this tier.
- **applicability:** current
- **evidence:**
  - The guard's only source for the default is the `refs/remotes/origin/HEAD` file (`scripts.ts:3589-3590`). Absent, the list is `[]`. Stale, the list holds the wrong name.
  - Nothing else is consulted for the default. `.git/HEAD` only sets the current branch (`:3587`). In a reftable repository there is no loose `origin/HEAD` file, so the list is always empty there.
  - The push check sees only `main`, `master` and that list (`src/hooks/personOnly.ts:705`), so `git push origin develop` passes the default-branch check (`:801-804`).
  - The run verbs are already covered: `defaultBranches` asks the REST API first, then `origin/HEAD`, then falls back to main/master (`src/cli/commands/run.ts:536-547`), and checks its own push against that list (`run.ts:866-870`).
  - Unattended, `unattendedPushVerdict` refuses every raw push (`personOnly.ts:1171-1191`, applied at `scripts.ts:3752-3755`).
  - No default branch is stored anywhere the hook can read:
    - `origin.json` holds only `{ host, owner, repo }` (`run.ts:387-400`, `:433`).
    - The pre-flight reads `default_branch` (`src/runs/preflight.ts:348`) but writes nothing.
    - The canary holds only `{ at }` (`scripts.ts:3726`).
    - The record's `Branch:` line names the run's own branch, not the default.
  - `SECURITY.md` names no residual for this case (searched for `origin/HEAD`, `stale`, `custom default`).
- **causal_chain:**
  1. In an attended clone with no `refs/remotes/origin/HEAD`, or one left behind after the remote renamed its default, `contextsOf` sets `defaultBranches` to `[]` or to the old name (`scripts.ts:3590`).
  2. `pushVerdict`'s default list is `{main, master}` plus that (`personOnly.ts:705`).
  3. `git push origin develop` is not in the list, so the person-only "push of the default branch" rule (REQ-FLOW-102, `everyday-flows.md:3765-3766`) lets it through without any signal. Only the remote's own protection, if the repository has any, stands in front of it.
- **smallest_fix:** when the REST API answered, `run start` and `checkpoint`/`end` write `refs/remotes/origin/HEAD` as a symbolic ref to `refs/remotes/origin/<named>` if it is absent or names another branch, and say so in their text output. The guard needs no change. Also add a `SECURITY.md` residual for attended clones where no run verb ever ran.
- **test_rows:**
  - `run start` with REST answering `develop` and no `origin/HEAD` writes the ref; afterwards the guard denies `git push origin develop` as push-default.
  - A stale `origin/HEAD` naming `main` is rewritten to `develop`.
  - With REST unavailable, `origin/HEAD` is left untouched.
  - Under `--dry-run`, nothing is written.
  - A `docsPages` row for the new residual.
- **design_note:**
  - **Where the guard could learn the default without the network:** only from git metadata it already reads. No discovered default is stored today, so the fix has to add a writer.
  - **Option A, write `origin/HEAD` from the run verbs (recommended).**
    - The guard keys each place by its git common dir, so worktrees are covered with no guard change.
    - It fixes the stale case as well as the absent one.
    - It is the same effect as `git remote set-head origin -a`.
    - Limit: it only covers clones where a run verb has run, which includes the attended morning walk.
  - **Option A', a git-ignored `.stamity` file the guard adds to its list.** It also works, since adding names can only add refusals. But it is read from the repo root and so would also apply to places in other repositories. It is a new contract and needs a census. It is second choice.
  - **Option B, fail closed when `origin/HEAD` is absent. Not recommended.**
    - Unattended, it adds nothing: raw pushes are already refused.
    - Attended, it would refuse every named push in a clone without `origin/HEAD`. That breaks "An attended session keeps its own pushes" (`everyday-flows.md:3860`).
    - It cannot catch a stale `origin/HEAD` without the network either.
  - **Where fail-closed does belong (inferred, adjacent finding, Warning).** The input steps:
    - `run.ts:546`: when neither REST nor `origin/HEAD` answers, `defaultBranches` falls back to `{main, master}`.
    - `run.ts:280-283`: `run start` then keeps a `develop` checkout, because it is "not the default branch".
    - `run.ts:866-870`: `checkpoint` then pushes `HEAD:refs/heads/develop` past the person-only check.
    - The step between them: the only remaining wall is the remote protection the pre-flight demanded, and `SECURITY.md:384-385` says no run verb requires the pre-flight to have passed.
    - Smallest guard: in an unattended run (`readsUnattended`, `run.ts:1016`), make `start`/`checkpoint`/`end` refuse when the source is `"fallback"`.
  - **Recommendation:** Option A, plus the fail-closed on `"fallback"` for unattended run verbs only, plus the attended residual in `SECURITY.md`.

### Breaking-change candidates
None. No exported signature, type, event, export or flag changes. The meaning of the `GUARD_RUNS_READ_MAX` constant changes, but it is module-private (`scripts.ts:3079`) and only these two emitted scripts and the guard test use it.

### Unanswerable
- Which clone paths leave `origin/HEAD` absent (CI checkouts, cloud-session clones, `git init` plus `remote add`) was not settled. Low, unverified: the brief is codebase-only and no external source was read. The smallest input that settles it: run `git symbolic-ref refs/remotes/origin/HEAD` in a fresh clone from each target platform.

### Sources consulted
`src/hooks/scripts.ts`, `src/hooks/personOnly.ts`, `src/cli/commands/run.ts`, `src/runs/preflight.ts`, `src/runs/layout.ts`, `test/hooks/personOnlyGuard.test.ts`, `SECURITY.md`, `docs/specs/everyday-flows.md`, and the brief at `brief-r3.txt`.