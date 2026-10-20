**status: DONE.** Five of the six findings are true at HEAD `ae65b89e`. F2 is also true, but SECURITY.md already lists it as a tracked residual, so I recommend declining it. Nothing was run. Every verdict comes from reading the code. Where a verdict depends on how git behaves (F4's switch refusal, F6's two-layer patch), the basis is marked `inferred`.

Summary: **ACCEPT F4, F5, F6, F7, F20. DECLINE F2.**

---

### F4 — `run start` pins origin before switching to an existing run branch (run.ts:255)
- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high, `inferred`. The order is read directly at run.ts:255 and :269. That git refuses to overwrite an untracked file whatever its content is git's documented checkout behaviour. I did not reproduce it.
- **applicability:** current
- **evidence:**
  - `pinOrigin` runs at `src/cli/commands/run.ts:255`, before the switch at `:265-269`.
  - `pinOrigin` reads the pin from the work tree (`:367`, `readOriginPin` → `exists(join(cwd, pinRel))` at `:341`). If none is there it writes `origin.json` (`:383`).
  - `origin.json` is in `RUN_FILES` (`:131`, `:134`), so a checkpoint commits it on the run branch. The spec confirms this: "the pin rides the branch with the record (`RUN_FILES`, `:134`)" (`docs/specs/everyday-flows.md:3587-3588`).
  - The existing-branch test (`test/cli/commands/run.test.ts:267-279`) branches from `HEAD~1`, which has no pin tracked, so it never hits this case. The test at `run.test.ts:291` shows the pin is left as an untracked `??` file.
- **causal_chain:**
  1. A run checkpoints, which commits `.stamity/runs/<id>/origin.json` on `stamity/<id>`.
  2. Later, `run start --run <id>` runs from the default branch, where that file does not exist. `readOriginPin` returns `undefined`, so `pinOrigin` writes a fresh untracked `origin.json`.
  3. `git switch stamity/<id>` has to check out a tracked file at that path. Git refuses because the untracked file would be overwritten, and identical bytes don't change that.
  4. `run start` exits 1 ("could not switch") and leaves a stray untracked pin on the default branch. The resume path it advertises (`:29-31`, "checking the one that does out") can never succeed. Separately, the branch's own committed pin is never compared at start.
- **smallest_fix:** Move the `pinOrigin(ctx, cwd, run)` call to after the switch (after `:278`, plus just before the kept-branch return at `:261`). The pin is then read from the branch's own tree: kept where it matches, refused where origin changed.
- **proving test:** in `run.test.ts`, commit a matching `origin.json` on `RUN_BRANCH`, start from `main`, then expect:
  - exit 0, and `current(repo) === RUN_BRANCH`
  - stdout contains `(pinned in …, kept)`
  - `git status --porcelain` is empty

  A second case: the committed pin names another repository → exit 1 with "origin changed".

### F5 — a pre-staged path outside `--paths` reaches the checkpoint commit (run.ts:700)
- **decision:** ACCEPT
- **severity:** Minor
- **confidence:** high, `direct` (run.ts:611-613, :698-700)
- **applicability:** current
- **evidence:**
  - Staging is limited to `stage = own ∪ named` (`run.ts:611-613`, `add` at `:623`, `:684`).
  - But the commit is pathless: `["commit", "--quiet", "--message=…", …]` at `:700`. It is gated only on `git diff --cached --quiet` (`:698`), which takes the whole index.
  - The spec promises that `run end` "commits an explicit path list" (`everyday-flows.md:3546`) and that `run checkpoint` "commits the explicit path list" (`:3576-3577`).
  - No test covers an unrelated pre-staged entry. The closest is `runCheckpoint.test.ts:367-382`, which covers unstaged files only.
- **causal_chain:**
  1. The agent (or a tool) runs `git add other.ts` and leaves it staged.
  2. The checkpoint stages `--paths` and the run files without touching `other.ts`'s index entry.
  3. `git diff --cached --quiet` returns 1, and the pathless `git commit` takes the whole index, `other.ts` included.
  4. The push sends a commit holding a path the caller never listed, which breaks REQ-FLOW-092/093's "explicit path list".
- **mitigation:** severity stays Minor because every pushed byte still passes the held-path check (`heldOf` over the whole index, `:629-631`) and the pushed secret scan (`:725`). Those are the security floors, and the push only goes to the run's own branch.
- **do not use `--only` / `commit -- <paths>`:** this is the reviewer's suggestion, and it is wrong here. Both modes commit the **work-tree** content of the listed paths. That would undo the held paths' `restore --staged --source=<Base>` (`:672`) for any `--paths` entry naming a held path, which breaks review/156 and review/200.
- **smallest_fix:** Before `:698`, list `git diff --cached --name-only -z HEAD`. If any path is not in `stage ∪ patchFiles ∪ held ∪ the stale patch` (directory `--paths` entries matched by prefix), refuse with `commit refused: <path> is staged and not in --paths` and exit 1.
- **proving test:** `git add` an unlisted `b.txt`, checkpoint `--paths a.txt`, then expect exit 1, that notDone names `b.txt`, and that `pushes()` is empty.

### F6 — a partially staged (`MM`) held file loses its work-tree layer (run.ts:647)
- **decision:** ACCEPT
- **severity:** Minor
- **confidence:** medium, `inferred`. The side selection is read directly at run.ts:645-648. That git apply accepts two sections for the same file in one patch is from git's documented apply behaviour and was not verified here.
- **applicability:** current
- **evidence:**
  - The code picks one side per path: `[["--cached"], held.filter(inIndex)]` and `[[], held.filter(!inIndex)]` (`run.ts:645-648`). Its own comment at `:642` says it takes "the index where it changes the path, else the work tree".
  - The header doc says the opposite: it "writes the work tree's and the index's change against `Base:`" (`:78-79`).
  - The text output says "the work tree keeps them" (`:689`). That is not true once a cloud session's work tree is gone.
  - Test `runCheckpoint.test.ts:250-268` is itself an `MM` case (base A, staged B, work tree back to A). It asserts only that `+steered rules` is in the patch, so the B→C layer is never asserted.
- **causal_chain:**
  1. A held path has base A. The agent stages B, then edits the work tree to C, and does not name the path in `--paths`, so `add` (`:623`) does not collapse it.
  2. The path is in `inIndex`, so only `git diff --cached Base -- path` (A→B) is written to `held/person-only.patch`.
  3. `restore --staged` (`:672`) puts the index back to A. The pushed branch carries a patch reproducing B only.
  4. In an unattended cloud run the work tree is thrown away, so C is lost and the person's recovery patch is stale.
- **smallest_fix:** For each `inIndex` path whose work tree differs from the index, append a third part, `git diff --binary --full-index …DIFF_PINS -- <paths>` (index→work tree), after the `--cached` part. The patch then applies A→B→C. The alternative is a separate `held/person-only.worktree.patch`, but `removeStalePatch` (`:975`) would then need to handle it too.
- **proving test:** stage B on `.cursorrules`, write C, checkpoint. The pushed patch contains `+B` and `+C`, and `git apply` of the patch onto Base gives C. The `:250` case must still pass.

### F7 — `scan.unscanned` never reaches `notDone` (run.ts:740)
- **decision:** ACCEPT
- **severity:** Warning
- **confidence:** high, `direct` (run.ts:730-740; everyday-flows.md:2405-2409)
- **applicability:** current
- **evidence:**
  - `result.scan.unscanned` is filled at `run.ts:732` and printed at `:738`. No `notDone` push happens for it, and `:740` returns only on hits or `incomplete`.
  - The spec: "A non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths", with the exit staying 0 (`everyday-flows.md:2405-2409`; `gate.ts:1644` exits 0 on unscanned).
  - The skill copies `notDone[]` into the record and the morning list only for a checkpoint "that exits 1" (`content/skills/st-unattended/SKILL.md:83-84`). So an exit-0 entry would also be dropped. The same gap applies to `records: not committed` (`run.ts:93-94`).
  - Tests: `runCheckpoint.test.ts:471` and `:598` assert `unscanned: []` only. No non-empty case exists.
- **causal_chain:**
  1. A pushed code file can't be read (for example a NUL byte or over the size cap), so `readTreeDiff` puts it in `unscanned` (`gate.ts:1480`).
  2. The checkpoint pushes and exits 0 with `notDone` empty.
  3. The skill copies nothing on exit 0, so the morning list never says a pushed file went unscanned. The person reading the draft PR thinks the scan covered the whole change.
- **smallest_fix:** After `run.ts:738`, if `result.scan.unscanned.length > 0`, push `secret scan: <n> files unscanned (<list>)` to `notDone`, keeping the exit code. Also change `SKILL.md:83` to copy `notDone[]` "on any exit" (two lines).
- **proving test:** commit a `.ts` file with a NUL byte and checkpoint. Expect exit 0, `pushed: true`, and notDone `["secret scan: 1 files unscanned (x.ts)"]`. Also add a corpus assertion on the skill wording.

### F20 — "nothing ahead" trusts only the local remote-tracking ref (run.ts:746)
- **decision:** ACCEPT
- **severity:** Minor
- **confidence:** high, `direct` (run.ts:744-746, :90-92)
- **applicability:** current
- **evidence:**
  - `tip === commitAt(refs/remotes/origin/<current>)` skips the push (`run.ts:744-746`). Nothing contacts the remote.
  - The doc says "Exit 0 when the remote branch holds `HEAD` (pushed now, or already there with nothing ahead)" (`:90-92`).
  - The spec and the skill say "pushes only when the branch is ahead" (`everyday-flows.md:3578`, `SKILL.md:81`).
  - A gating test asserts the no-op: `runCheckpoint.test.ts:421-432` expects `pushed: false` and `pushes()` to be `[]`.
- **causal_chain:**
  1. The first checkpoint pushes, and git updates `refs/remotes/origin/<branch>` to equal HEAD.
  2. The remote branch is deleted or moved from outside, and no fetch or prune happens.
  3. The next `checkpoint` (without `--pr`) sees the stale tracking ref equal to HEAD. It prints "nothing ahead", skips the push and exits 0, even though no remote branch holds the run, breaking the `:90-92` contract.
- **precondition:** this needs an outside act on the run's branch. Deleting a remote branch is a person's call (`SKILL.md:126`), which is why severity is Minor. Without `--pr` nothing later catches it.
- **smallest_fix:** Replace the tracking-ref read at `:745` with `git ls-remote --exit-code origin refs/heads/<current>` (no `--`) and compare its sha to `tip`. That is one remote read and keeps test `:421` green. "Always push" would instead break that gating test.
- **proving test:** checkpoint once, delete the remote's branch (`git -C remote update-ref -d refs/heads/<branch>`), checkpoint again. Expect exit 0, `pushed: true`, and the remote's ref equal to HEAD.

### F2 — `--no-merges` drops merges from the pushed history scan (gate.ts:1498)
- **decision:** DECLINE
- **severity:** Warning
- **confidence:** high, `direct` (gate.ts:1498, :1525; SECURITY.md:103, :106)
- **applicability:** already-addressed (stated as a tracked limit)
- **evidence:**
  - The history scan lists commits with `rev-list --reverse --no-merges` (`src/cli/commands/gate.ts:1498`). The net read is only `[base, "HEAD"]` (`:1525`). The docstring says merges are left out (`:1486`, `:1518-1519`).
  - So the claim is true.
  - `SECURITY.md:103` already lists it as a known residual: "The history read leaves merges out, so a value added in a merge commit and removed later is never scanned (`2026-10-08_product-core/close/2`)". `SECURITY.md:106` says the same for the run verbs ("merges left out").
  - The spec states "merges left out" for the scan (`everyday-flows.md:2389`). However, its next clause, "so a value committed and removed again still stops the run", overstates for merge-introduced values.
  - No test covers a merge.
- **counter_argument:**
  - The gap is an accepted residual that SECURITY.md publishes, with its own inbox row. Fixing it here would reopen a deferred item inside a review-resolution round.
  - The reviewer's implied fix (drop `--no-merges`) does not work alone:
    - `readTreeDiff` on a merge commit with one rev prints no diff unless it is given `-m`, `-c` or `--cc` (`gate.ts:1451-1469` passes none).
    - `parsePatch` has no combined-diff (`@@@`) support (no match in `src/`).
    - A first-parent diff would re-flag lines already on origin.
  - The real fix (`--remerge-diff`, or combined-diff parsing) belongs to that inbox row.
  - The PR reply should cite `SECURITY.md:103`, and could optionally correct the spec sentence at `everyday-flows.md:2389-2390`.
- **smallest_fix (for the inbox row, not this PR):** List merges with `rev-list --merges` over the same range and read each one with `diff-tree --remerge-diff` (needs git ≥ 2.36) through `readTreeDiff`.

---

### Breaking-change candidates
None. The F7 fix adds a `notDone` entry, which is additive. The F5 fix adds a new refusal reason inside the existing exit-1 contract. The F20 fix leaves the `pushed` meaning unchanged. No field, flag or export is renamed, dropped or narrowed. Confidence high, `inferred` from the fixes above against the six categories.

### Unanswerable
- **Is inbox row `2026-10-08_product-core/close/2` still open?** That row is F2's tracked residual, cited at `SECURITY.md:103`.
  - Probed: SECURITY.md only. `.stamity/inbox.md` lives on the `records` branch, which is out of scope.
  - Smallest input that settles it: `git show records:.stamity/inbox.md`, searched for that row id.
  - Confidence: low, `unverified`.
- **Does git apply accept the two-section patch the F6 fix produces?** I could not run anything to check.
  - Smallest input that settles it: run the F6 test.
  - Confidence: medium, `inferred` from git's documented apply behaviour.

### Sources consulted
- `src/cli/commands/run.ts`
- `src/cli/commands/gate.ts` (lines 1395-1660)
- `src/cli/engine/gitWrite.ts` (searched only)
- `content/skills/st-unattended/SKILL.md`
- `docs/specs/everyday-flows.md` (2385-2417, 3541-3590, 3761-3850)
- `test/cli/commands/run.test.ts`
- `test/cli/commands/runCheckpoint.test.ts`
- `SECURITY.md:103,106` — only a targeted search, because question 2 asks about it even though the scope list leaves it out.
- `src/change/scan.ts` was not needed: every finding resolves in run.ts and gate.ts.