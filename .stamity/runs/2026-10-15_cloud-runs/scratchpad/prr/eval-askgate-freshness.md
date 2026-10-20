**status:** DONE

I checked both findings against HEAD `ae65b89e`. F17 is a real gap, but it is narrower than the reviewer says, so I rate it Warning rather than P1. F18 is literally true but sits outside the freshness guard's contract, so I decline it. Choosing F17's fix changes a requirement that was signed off, so that decision belongs to the operator in the triage ask.

One scope note: question 3 asked about the pre-flight, so I grepped `src/runs/preflight.ts`, which is outside the listed files. I opened no other out-of-scope file and ran no commands.

---

### F17 — the closed-run exception is tied to the branch only (`src/hooks/scripts.ts:4057`)

- **decision:** ACCEPT
- **severity:** Warning (the reviewer said P1). The gate is a backstop: the skill already says to put no question before Frame (`content/skills/st-unattended/SKILL.md:67-70`). The gap only matters when a model asks anyway while it is on an earlier run's branch.
- **confidence:**
  - That the claim holds at HEAD: high, `direct` (the lines below).
  - That a later session can reach the gap: medium, `inferred`. It combines the skill's order (`SKILL.md:29-31`, `:37`, `:51`, `:144-145`) with the spec's chain rule (`everyday-flows.md:3633-3635`).
  - That a refused-to-be-blocked question then waits forever: low, `unverified`. Nothing I read shows how a cloud session behaves while a question is pending.
- **applicability:** current
- **evidence:**
  - `src/hooks/scripts.ts:3079`: `GUARD_RUNS_READ_MAX = 50`.
  - `:3996-4001`: the 50 newest run folders by name, with no time or run-identity check.
  - `:4051-4052`: the variable has to be set.
  - `:4054`: the exception applies only when nothing is in progress (`running.length === 0`); it keeps every unattended head that has a `Branch:` line.
  - `:4056-4057`: it allows the question when **any** of those heads has a `Branch:` equal to the current branch. Nothing else is compared: no run id, no date, no marker.
  - `test/hooks/unattendedAskGate.test.ts:131-141` and `:189-208` test only the branch match, not a later session on the same branch.
  - `docs/specs/everyday-flows.md:3504-3506` and `:4780-4781`: the spec states the exception by branch alone, so the code matches its spec.
- **causal_chain:**
  1. The variable is set for the whole environment: `STAMITY_UNATTENDED=1 on a cloud environment, routine or automation` (`SKILL.md:24-25`). Every later session in that environment sees it.
  2. A later unattended start on the same branch is something the flows do on purpose. An unattended start on a closed run's branch is allowed (`SKILL.md:144-145`), as is a chain's next file on one branch (`everyday-flows.md:3633-3635`). An unattended `/st-pr-resolve` checks out its pull request's head, which can be an earlier run's `stamity/<id>` branch (`SKILL.md:161-162`).
  3. In that session, the new record does not read `in progress` until Frame. `run start` runs first, and only then are the head lines written (`SKILL.md:29-31`). The pre-flight is the first act, "before Frame" (`:35-37`), followed by floors, learnings and the ready check (`:41-57`). For `/st-pr-resolve`, the record opens after the fetch (`:161`).
  4. Throughout that window, `running` is empty and the earlier run's closed record matches the branch, so `unattendedSource` returns null at `scripts.ts:4057`. `AskUserQuestion` goes through with nobody there to answer, which breaks REQ-FLOW-090's first clause, "an unattended run asks nothing" (`everyday-flows.md:3499`).
  5. The same thing happens between two files of a chain in one session: file N's record is closed, file N+1's is not open yet. The final round is supposed to happen once, at the run's end (`SKILL.md:147-148`), not between chain files.
- **What could tie the exception to the run that just ended (question 2):**
  - **A run id:** nothing the gate can read carries one for the current session. The gate reads no session-scoped state and writes nothing (`scripts.ts:3928-3930`). A run id also doesn't separate chain file N from N+1 in one session.
  - **A time window:** `Status: closed <date>` and run ids carry only a UTC date (`scripts.ts:3897-3899`, `SKILL.md:97`). A file's last-modified time resets on a fresh clone, so it fails in exactly the cloud case.
  - **A marker:** the only option that survives all three cases. It would be a git-ignored file written by `run end` only at the run's final exit, naming the run id. A fresh clone or another checkout never carries it, and `run start` deletes it. This is my design inference (`inferred` from `SKILL.md:76-77`, `:93-100` and `scripts.ts:4054-4057`), not something I found in the code.
- **smallest_fix:** Have `run end` write a git-ignored marker naming the run id, have `run start` delete it, and have `scripts.ts:4054-4057` require that marker as well as the `Branch:` match. Amend the REQ-FLOW-090 text and the acceptance criteria at `everyday-flows.md:3505-3506` and `:4780-4781` to match, and add a case to `unattendedAskGate.test.ts` that is one fact away: a closed record on the same branch with no marker should be refused.
- **contract_note:** REQ-FLOW-090 (`everyday-flows.md:3495-3509`) and REQ-FLOW-095 (`:3618-3619`) promise that the final round can ask after the record closes, and they tie that only to `Branch:`. The skill promises "No question is put" (`SKILL.md:67`) and that the gate "denies the question tool while the mode is unattended" (`:72`). Read literally, the signed-off branch tie and that promise conflict in the window before Frame. The fix narrows the signed-off exception, so it needs the operator's call and a spec amendment, not just a code edit.

---

### F18 — freshness ignores staged and uncommitted edits (`src/runs/freshness.ts:96`)

- **decision:** DECLINE
- **severity:** Minor
- **confidence:** high, `direct` (the contract text and code at the locations below). That a plan researched on a dirty tree would be falsely flagged stale is medium, `inferred` from the stamp format (`planCheck.ts:298`) and how the guard compares.
- **applicability:** current. The literal claim is true; the conclusion drawn from it is not.
- **evidence:**
  - `src/runs/freshness.ts:94-96`: a path with 0 commits in `stamp..HEAD` returns at once, and is stale only if `missing`. The index and work tree are never read.
  - `:76`, `:148-155`: the only file-system check is whether the path exists (`lstat`).
  - `:5-13`: the stated contract is "moved since the commit the plan was stamped at", measured by `git rev-list --count <stamp>..HEAD`.
  - `src/runs/planCheck.ts:17-19`: "a `reads` path moved since the stamp".
  - `planCheck.ts:57-73`: the blocker codes have no work-tree or dirty-tree code.
  - `planCheck.ts:298`: the stamp is `<commit sha> <UTC date>`, with no hash of the tree.
  - `docs/specs/everyday-flows.md:3520-3526`: REQ-FLOW-091 lists no dirty-tree blocker.
  - `everyday-flows.md:3636-3637`: REQ-FLOW-096 measures by commits.
  - `src/runs/preflight.ts:40`: the pre-flight checks are `hooks-loaded | node-engine | cli-pin | gate-scan | direct-push | input-author | floors`. None is about the work tree.
  - `test/runs/freshness.test.ts`: a grep for `work tree|worktree|staged|uncommitted|index|edit` matched nothing.
- **counter_argument:**
  1. The guard's contract, in its own doc comment, the plan check and the spec, is about commits since the stamp. It never promises anything about the work tree, so this finding asks for a new contract, not a fix to the existing one.
  2. The stamp records a commit, not the content the research read. If `/st-plan` ran on a dirty tree, comparing the work tree with HEAD would flag paths whose content is exactly what the research read. The proposed check can't tell "edited after research" from "already dirty during research", so it doesn't prove the reviewer's "content different from what the plan research read".
  3. The `missing` case isn't a precedent for a content check. A path that doesn't exist can't be built against whatever was read; an uncommitted edit is the person's own work in their own checkout.
  4. If a dirty tree should block an unattended start, that check belongs to the start conditions (the pre-flight, or `run start`), which today have none. It doesn't belong in `freshness()`.
- **smallest_fix:** No change to `freshness.ts`. If the operator wants a clean tree before an unattended start, schedule a separate pre-flight check (a new check id next to `preflight.ts:40`, plus a skill and spec row) as its own planned item.
- **contract_note:** The guard's contract is "a `reads` path is fresh when `git rev-list --count <stamp>..HEAD -- <path>` is 0, `moved` when a commit since the stamp touched it, `missing` when it is not on disk" (`freshness.ts:9-13`). REQ-FLOW-091's blockers are `stale` (moved or missing), `stamp-unresolved` and `freshness-error` (`everyday-flows.md:3521-3523`). Neither the plan check nor the pre-flight treats a dirty tree as a blocker.

---

### Breaking-change candidates

None at HEAD; neither finding's code changes an exported shape. If F17's marker fix is adopted, it adds a new file read by the gate and written by `run end` / `run start`. That is an addition, not a drop, rename or narrowing, so no category applies. Confidence medium, `inferred` from `scripts.ts:3937-3954` and `SKILL.md:76-77`.

### Unanswerable

- **Does a cloud Claude Code session really wait forever on a question nobody can answer?**
  - Probed: the gate's comments (`scripts.ts:3887-3890`) and the skill (`SKILL.md:147-148`). Neither states a timeout.
  - Why that doesn't settle it: it's client runtime behaviour, which no in-scope file describes.
  - What would: the client's documentation on how `AskUserQuestion` behaves in a headless or cloud session (a `+docs` tier). Confidence low, `unverified`.

### Sources consulted

- `src/hooks/scripts.ts`
- `src/runs/freshness.ts`
- `src/runs/planCheck.ts`
- `src/runs/preflight.ts` (grep only, outside the listed scope)
- `test/hooks/unattendedAskGate.test.ts`
- `test/runs/freshness.test.ts` (grep only)
- `content/skills/st-unattended/SKILL.md`
- `docs/specs/everyday-flows.md`
- `brief-R2.txt` (the findings, read as data)