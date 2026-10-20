**Status: DONE.** Two of the three findings are worth fixing. J10 and J6 are true at `558b1200` and the fixes are small, so ACCEPT both. J2 is also true as written, but it can't happen during an unattended run, so DECLINE the refuse-in-every-mode fix and leave open one narrow hardening if you want it. This is a read-only pass at standard depth: I traced the code and ran no commands, and no regression case has been seen red.

### J2 — run.ts:592, a default the guard cannot persist

- **decision:** DECLINE. The fix as asked is "fail closed whenever", in every mode, and I decline that.
- **severity:** Minor.
- **confidence:** medium, basis `inferred`. Whether the claim is true at the cited lines is high, basis `direct`. The step between sources: an unattended raw push is refused by `unattendedPushVerdict` whatever the default branch is called, so the gap exists only in attended sessions, and there it doesn't depend on the run verbs at all.
- **applicability:** current.
- **evidence:**
  - The non-failing path is real:
    - `src/cli/commands/run.ts:592` returns a "not written" line.
    - `run start` prints that line and still exits 0 (`run.ts:299-301`, `run.ts:335-338`).
    - checkpoint and end only add it to `notDone` (`run.ts:734`) and carry on. `finish(true)` then exits 0 (`run.ts:689-708`, `run.ts:953`).
  - The guard reads the default branch from `origin/HEAD` only (`src/hooks/scripts.ts:3597-3602`, then `src/hooks/personOnly.ts:717`).
  - What blocks the bypass:
    - The verb's own push checks against the REST-named set (`run.ts:715`, `run.ts:723`, `run.ts:928`), so the verb never pushes the default branch.
    - Unattended, every raw `git push` is refused (`scripts.ts:3763-3767`, `personOnly.ts:15-19`, `docs/specs/everyday-flows.md:3854-3860`).
    - The pre-flight's REST check is a second wall behind that (`personOnly.ts:40-41`).
  - There's no test for the line-592 path. `test/cli/commands/run.test.ts:492-550` covers only the names the check already accepts.
- **counter_argument:**
  - **Unattended:** the reviewer's example, `git push origin 'HEAD:refs/heads/release$next'`, is refused by `unattendedPushVerdict` before the default branch matters. The verbs' own pushes are already kept off the default.
  - **Attended:** the guard knows only what `origin/HEAD` says in every attended session, including the many that never call `run start`. Refusing the verbs closes nothing there.
  - **What attended users would lose:** `run start`, `checkpoint` and `end` stop working entirely on any repository whose default branch name has a character outside `[A-Za-z0-9._/-]` (for example `+`, `@`, `#` or `$`).
  - **The pattern already in place:** the earlier fallback fix (pr/55) refuses unattended runs only, and its test is called "lets an attended one keep the branch" (`run.ts:285-293`, `run.ts:745-749`, `run.test.ts:552`).
- **smallest_fix:** If you still want hardening, refuse unattended only, mirroring pr/55 at `run.ts:286` and `run.ts:746` when `alignOriginHead` returns "not written". Alternatively, drop the `PUSHABLE_BRANCH` gate on the write itself (that check governs the verb's own refspec, not the guard's list of defaults). Whether the guard reads a `$` name correctly is `unverified`.
- **test_rows:** An unattended `start` refuses where REST names `release$next` and an attended one exits 0 with the "not written" line (seeded as at `run.test.ts:552`).

### J10 — run.ts:756, deleted run-owned files are not staged

- **decision:** ACCEPT.
- **severity:** Minor.
- **confidence:** high, basis `direct`.
- **applicability:** current.
- **evidence:**
  - `src/cli/commands/run.ts:756` filters the run-owned paths through `isRegular` (`run.ts:1357-1363`, an lstat that is false for a missing file).
  - `--paths` keeps a missing path that the index tracks (`run.ts:1107-1113`).
  - `add` only stages what it is given (`run.ts:1143-1145`).
  - The run-owned list is `RUN_FILES` (`run.ts:159`) plus `INBOX_PATH` (`run.ts:165`). `record.md` can't be the deleted file, because the verb fails earlier without it (`run.ts:665-673`).
  - The spec says these files "ride the branch" (`docs/specs/everyday-flows.md:3587-3589`).
- **causal_chain:**
  1. A tracked `ledger.jsonl` or `.stamity/inbox.md` is deleted in the work tree.
  2. `isRegular` drops it from `own` (`run.ts:756`), so it's missing from `stage` (`run.ts:770-772`) and never reaches `git add`.
  3. Another staged change makes the commit and push go ahead (`run.ts:875-883`, `run.ts:943-948`), and the verb exits 0.
  4. The pushed branch still carries the stale file, so a later checkout, such as the morning walk, reads it.
  5. It also fails the other way: if the deletion was already staged with `git rm`, it isn't in the stage list. `strayStaged` (`run.ts:1157-1166`, called at `run.ts:863-872`) then refuses the whole checkpoint with "is staged and not in --paths".
- **smallest_fix:** Yes, resolve missing own paths against the index as `--paths` does. Move the `ls-files --cached` resolution at `run.ts:1107-1113` into a helper used by both. For own paths, keep a path if it is a regular file, or if it doesn't exist (`!exists`) and the index tracks it. Symlinks (present but not regular) stay out, as today.
- **test_rows:**
  - Unattended, `rm` a committed `ledger.jsonl` and change `plan.md`. The checkpoint's commit then has `ledger.jsonl` as deleted (`D`) and the push leaves it off the branch.
  - Same setup after `git rm`: the checkpoint commits instead of answering "commit refused".

### J6 — policy.ts:526, the run-ended marker copied into a worktree

- **decision:** ACCEPT.
- **severity:** Minor. The ask gate lets the question through when unsure by design ("a question is the safe failure", `scripts.ts:3937-3940`). The trigger also needs a `.stamity` copy row the operator wrote themselves: the built-in defaults have none (`policy.ts:107-122`).
- **confidence:** high, basis `direct`, that the claim is true. medium, basis `inferred`, on reach: the `attach` path needs the run's branch not to be checked out anywhere else.
- **applicability:** current.
- **evidence:**
  - `src/worktree/policy.ts:526` forces `skip` only for the review-gate state and the canary.
  - `assertRulesAdmissible` refuses only those two by name (`policy.ts:564-578`).
  - The setup walk's skip check reads `resolveStrategy` (`src/worktree/setup.ts:565`, `src/worktree/materialize.ts:243`).
  - The marker is documented as machine-local (`src/mcp/env.ts:196-204`).
- **causal_chain:**
  1. The operator's policy has a `.stamity` copy row. `resolveStrategy` answers `copy` for `.stamity/run-ended.json` (`policy.ts:526-527`).
  2. `worktree setup` attaches the closed run's branch (`src/worktree/git.ts:706`) within 15 minutes of `run end --final-round`. The copied marker carries its own `at` inside the JSON, so it is still in its window.
  3. In that worktree, with `STAMITY_UNATTENDED` set and no run in progress, the ask gate gets `endedRun(root)` from the copy (`scripts.ts:4077-4089`). The branch and run match the closed record on the branch (`scripts.ts:4104-4108`), so `AskUserQuestion` goes through and the session waits for someone who isn't there.
- **smallest_fix:**
  - **How the canary is handled today:** `isPreflightCanaryPath` (`policy.ts:222-224`) compares names with case and trailing dots folded. `resolveStrategy` forces `skip` on a match at `policy.ts:526`, and `assertRulesAdmissible` refuses an explicit copy or symlink row naming it at `policy.ts:572-578`.
  - **The fix:** add `isRunEndedMarkerPath` with the same comparison against `RUN_ENDED_MARKER_FILE`, OR it into `policy.ts:526`, and add a refusal block after `policy.ts:578`.
  - **What stays:** a `symlink` row on `.stamity` still shares the marker live, the same leftover gap the canary has (`policy.ts:522-523`).
- **test_rows:** Mirror `test/hooks/personOnlyGuard.test.ts:897-913`. A `.stamity` copy row resolves `.stamity/run-ended.json` to `skip`, and a row naming it throws a run-ended-marker refusal.

### Breaking-change candidates

None. J6's fix makes `.stamity/worktree.json` refuse a row it used to accept. That's a validation tightening on a file the operator writes, not one of the listed categories. Confidence high, basis `direct` (`policy.ts:559-601`).

### Unanswerable

None. The one open point is whether the guard reads a default branch name containing `$` correctly, which is the J2 alternative fix and is marked `unverified` there. The smallest input that settles it is a `personOnlyVerdict` case with `defaultBranches: ["release$next"]`.

**Sources:** the files named above, plus the findings brief at `brief-r4.txt`.
