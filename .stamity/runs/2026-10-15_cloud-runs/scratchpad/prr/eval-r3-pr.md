**Status: DONE.** I evaluated H3 (thread comment 4305200097, `src/runs/pullRequest.ts:158`) against HEAD `d137ef85`, reading the code only. I ran no commands. The reviewer's text was treated as claims to check.

### Record — H3

- **decision:** ACCEPT
- **severity:** Warning. When it happens, `run end` updates or comments on the wrong pull request (PR) and still reports success. It merges nothing, runs no person-only action, and leaks nothing. It only happens if a PR from the run branch into a non-default base is already open.
- **confidence:** high, basis `direct` for Q1 (I read the lookup, the matcher and the caller at the lines below). Q2 is medium, basis `inferred`: it combines the kept-branch path at `src/cli/commands/run.ts:282` with GitHub's documented behaviour (one open PR per head+base pair, so one head can have several open PRs with different bases). That GitHub behaviour is not in the repo, so that half is `unverified` at the `codebase` tool tier. Q3 is medium, basis `inferred` from the spec wording below.
- **applicability:** current. `test/runs/pullRequest.test.ts:45` (`LOOKUP` has no `base=`) and `:67-69` (the `openPr` test helper has no `base` field) show it has not been addressed.
- **evidence:**
  - `src/runs/pullRequest.ts:260` — the lookup query is just `head=<owner>:<head>&state=open`. `base` is in scope (`:239`) but not used.
  - `src/runs/pullRequest.ts:153-158` — `openPrOnBranch` checks only `head.ref` and `head.label`. `entry.base` is never read.
  - `src/runs/pullRequest.ts:284-286` — the first match goes to `update`, which runs PATCH at `:251` or posts a comment at `:254` and returns `existing` or `commented`. It never reaches `create` at `:288`, which is the only call that sends `base`.
  - `src/runs/pullRequest.ts:277-280` — after an "already exists" 422, `relook` runs the same head-only lookup.
  - `src/cli/commands/run.ts:1183`, `:1219` — `base` is `at.defaults.named`, the default branch that was read. Both `run end` and `run checkpoint --pr` reach this through `draftPr` (`docs/specs/everyday-flows.md:3561-3562`).
  - `src/cli/commands/run.ts:282` — an attended run can keep its current branch ("kept: not the default branch"). That branch may already have a person's PR open into another base, for example a release branch.
  - `docs/specs/everyday-flows.md:3555-3557` — REQ-FLOW-092 says "an open one on the branch … else REST `POST …/pulls`". It never says which base that open PR has. The requirement is "one draft pull request" targeting the default branch (`:3554`, `:3558-3559`).
- **causal_chain:**
  1. `draftPr` calls `ensureDraftPr` with `base` set to the default branch (`run.ts:1219`).
  2. The lookup asks for every open PR with head `owner:head`, whatever its base (`pullRequest.ts:260`).
  3. `openPrOnBranch` returns the first entry whose head matches, which can be a PR into `release/x` (`:158`).
  4. `update` patches it if it carries this run's marker, or otherwise comments on it, and returns `existing` or `commented` (`:249-255`).
  5. `run end` exits 0 with a PR reported. No PR into the default branch is opened, and the morning list sits on the wrong PR.
- **Q3 (what should happen):** create a new PR against the intended base; don't refuse. GitHub allows a second open PR from the same head when the base differs, and REQ-FLOW-092's one PR is the one into the default branch. Leave the PR into the other base untouched: no comment, no PATCH. The phrase "an open one on the branch" at `everyday-flows.md:3555-3556` should become "an open one from the branch into the default branch". This changes spec text and needs `/st-pr-resolve` to sign it off.
- **smallest_fix:** Two changes in `src/runs/pullRequest.ts`. At `:260`, add `&base=${encodeQueryValue(base)}` to the lookup query. In `openPrOnBranch`, take `base` as a parameter, and at `:158` skip any entry unless `isRecord(entry["base"]) && entry["base"]["ref"] === base`. The second check is needed because, as the docblock at `:150-151` notes, GitHub ignores a filter it cannot read.
- **proving_test:** In `test/runs/pullRequest.test.ts`, add the case "opens a draft into the default branch when the branch's only open pull request targets another base". The lookup returns `openPr(7, MARKER-ended body, BRANCH)` with `base: { ref: "release/1.x" }`. The test expects the second call to be `POST repos/acme/app/pulls` with `base: "main"`, and expects no PATCH and no comment on #7. It must fail before the fix.
  - The fix also changes two test fixtures, and the change needs an inline reason that the lookup now filters by base:
    - `LOOKUP` at `:45` gains `&base=main`.
    - The `openPr` helper at `:67-69` gains `base: { ref: "main" }`.

### Breaking-change candidates
None. `ensureDraftPr`'s exported signature, `DraftPrRequest` and `PrOutcome` stay the same, and only internal matching changes (`pullRequest.ts:37-60`, `:238`). Confidence: high, basis `direct`.

### Unanswerable
- **Question:** Does GitHub's list-pulls endpoint honour `base=` together with `head=`, and does its "already exists" 422 apply per head+base?
- **Probed:** the repo only (tool tier `codebase`). No vendored GitHub docs or recorded payloads mention it.
- **Smallest input that settles it:** a `+web` re-spawn reading docs.github.com REST "List pull requests" and "Create a pull request". The fix does not depend on the answer, because the `entry.base.ref` check keeps it correct either way.

Sources consulted:
- `src/runs/pullRequest.ts`
- `src/cli/commands/run.ts`
- `test/runs/pullRequest.test.ts`
- `docs/specs/everyday-flows.md`
- `brief-r3.txt`