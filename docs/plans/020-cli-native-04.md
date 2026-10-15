---
id: cli-native-04
intent: feature
stamp: c96c714683de0c70a89db703900fa16cae47b43c 2026-10-14
reads: [.github/workflows/release.yml, .github/release-controls-checklist.md, scripts/records.mjs, test/ci/recordsScript.test.ts, .stamity/overrides/skills/st-eval-run/SKILL.md, evals/SET-v7.md, evals/cases-v6/golden/work-frame-reads-matching-inbox-rows.md, evals/cases-v6/golden/work-lockfile-only-bump-audit-before-lens.md, evals/cases-v6/golden/ask-narrow-symbol.md, test/evals/successorInputs.test.ts, content/commands/st-work.md, test/roster/modelLadder.test.ts, CHANGELOG.md, SECURITY.md, docs/specs/board-writes.md, evals/run-of-record.json]
depends_on: [docs/plans/020-cli-native-02.md, docs/plans/020-cli-native-03.md]
---

# CLI-native — file 4 of 4: the cut's preparation

This file is self-contained. It is the last of four `/st-plan` artifacts for **Package 24** and prepares the
**1.15.0** cut: the release machinery's scheduled fixes, the eval set's rows due before the release's eval run, the
last `/st-work` sentence files 2 and 3 could not both own, the changelog, and one `SECURITY.md` caution. It runs after
files 2 and 3. The cut itself (the full eval run, the spec flips, the tag and the publish) follows the release
checklist on the maintainer's yes; it is listed at the end, not as units.

intent chosen: feature because the units finish the package's behaviour and its release text; no defect is diagnosed
here.

## Context

Eleven deferral-inbox rows fire at the next release, which is 1.15.0: one in the release machinery
(`2026-10-13_records-branch/close/1`: a release restores `refs/remotes/origin/records` as it stands when its run starts,
not as the cut recorded it), four in the eval set (`2026-10-13_records-branch/review/40`;
`2026-10-11_release-1-14-0/build/25`, `build/26`, `build/27`), and six built elsewhere or closed by the cut itself
(`prove/3` in file 1, `close/9` in file 2; `review/6`, `build/35`, `close/13`, `2026-10-12_board-writes/close/3` with
the cut). Two rows of the same records work, `pr/9` and `pr/10` (the records ref spelled short where a same-named tag
would win), ride the release-machinery unit because they edit its files. Out of scope: the eval run, the tag and the
publish (the maintainer's yes), and anything files 1 to 3 own.

## Decisions

The maintainer's walks are summarised in file 1. Declared default **D23**: 1.15.0 at Package 24's end with the whole
release checklist, a full eval run (model-facing text, the emitted client files and the eval set all change), the spec
flips before the tag, QA with at most three person rows, and the maintainer's publish approval; the scheduled proof
`2026-10-11_release-1-14-0/close/13` is owed by this release's preparation.

### Settled by this plan

- **The release restore is pinned** to the records commit the cut records: the cut writes it into the annotated tag's
  message as `records: <sha>`, and `release.yml` restores exactly that commit, refusing when the line is missing or
  malformed.
- **The eval rows:** `build/25` gets a successor case whose Brief hands over only what the inbox query prints (the old
  case retires in the same change, measured by the release run); `build/26`'s advisory A1 is deleted if a binding
  criterion covers its claim, else promoted, and the dated paragraph says which; `build/27` keeps its 1-of-3 miss on
  record with a dated note and no case change.
- **The run artifact is published to the `records` branch** (`node scripts/records.mjs commit`), not committed with
  the change: the eval-run skill's step 6 and the set's run-artifact contract say so.

## Spec delta

The release checklist and the eval set carry no ids.

### REQ-PROVE-023 — The release restores the records the cut recorded (MODIFIED)
Given a cut, Then the annotated tag carries `records: <sha>` and the release workflow restores exactly that commit,
refusing when the line is missing or is not 40 hexadecimal characters.

### REQ-LADDER-006 — A working pick out of the box (the `/st-work` sentence) (MODIFIED)
Defined by file 2; `/st-work`'s Model ladder section says a class resolves through its pin (re-picked when the
account's saved list lacks it), then the client's alias, then the account's list, then — only when no list was read —
the shipped list's first entry, else no key; that an agent file's model takes precedence over a per-call escalation,
with the client named only in that client's capability facts (amended 2026-10-15 from `review/102`, `build/62`,
`build/66`).

## Units

### r1-release-machinery — the records restore pinned; the full ref spelled

| Field | Content |
|---|---|
| `id` | r1-release-machinery |
| `requirements` | REQ-PROVE-023 |
| `files` | `.github/workflows/release.yml` (`:292`, the restore), `.github/release-controls-checklist.md` (`:216-222` the records steps; `:222` and `:336` spell `refs/remotes/origin/records`), `scripts/records.mjs` (`:258`, `:261` the printed repair text uses the full ref), `test/ci/recordsScript.test.ts` (`:50`), `test/ci/workflow.test.ts` (the release restore pin) |
| `interfaces` | The checklist's cut step writes `records: <sha>` (the `git rev-parse refs/remotes/origin/records` value at the cut) into the tag message. `release.yml` reads it in the shell with `git tag -l --format='%(contents)' "$TAG"`, never through a workflow expression; accepts it only when it is exactly 40 lower-case hexadecimal characters; refuses otherwise or when absent; and runs `node scripts/records.mjs restore --no-fetch --force --ref "$SHA"`, keeping today's two flags (`release.yml:292`) |
| `testCriteria` | GIVEN `workflow.test.ts` THEN the restore step reads the tag's `records:` line in the shell, checks the 40-hex shape, keeps `--no-fetch --force`, and refuses without the line. GIVEN a tag message whose `records:` value carries shell text THEN the step refuses before running anything. GIVEN `recordsScript.test.ts` THEN the repair text names `refs/remotes/origin/records`. GIVEN the checklist THEN no short `origin/records` ref remains in a command |
| `edgeCases` | A clone holding a tag named `origin/records` → every command still resolves the remote branch (the full ref) |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/recordsScript.test.ts` |
| `threat` | Trust boundary: the release workflow publishes with provenance and holds `id-token: write`. Trusts: the tag's message, written by the cut. Abuse case: a `records:` value that injects shell text into the step, or names a commit that smuggles a non-record path. Check: the value is read in the shell and must be 40 hexadecimal characters before use; `records.mjs restore --ref` already refuses a commit holding anything but records; tests feed both |

### r2-eval-prep — the rows due before the release's eval run

| Field | Content |
|---|---|
| `id` | r2-eval-prep |
| `requirements` | spec carries no ids |
| `files` | `.stamity/overrides/skills/st-eval-run/SKILL.md` (`:264-265` step 6), `evals/SET-v7.md` (`:2731` the run-artifact contract; the index and dated paragraphs for the three rows), new `evals/cases-v6/golden/work-frame-matched-rows-only.md` (the successor), retire `evals/cases-v6/golden/work-frame-reads-matching-inbox-rows.md`, `evals/cases-v6/golden/work-lockfile-only-bump-audit-before-lens.md` (A1), `evals/cases-v6/golden/ask-narrow-symbol.md` (a dated note only if the case text says it), `evals/README.md`, `scripts/eval/run.mjs:50`, `test/evals/successorInputs.test.ts` |
| `interfaces` | Step 6: "Publish the run artifact with `node scripts/records.mjs commit -m …`; it lives on the `records` branch, never on `main`." The successor's Brief gives the query's printed rows only, never line numbers it could not see |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green with the successor in and the old case out of the index. GIVEN the eval-run skill THEN no sentence says to commit a run's results with the change |
| `edgeCases` | A1 covered by no binding criterion → promoted, with an `EXPECTED_MOVES` row if the case is carried from v5 |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals test/ci/testInputsGuard.test.ts` |

### r3-ladder-sentence — `/st-work`'s ladder text matches the pins

| Field | Content |
|---|---|
| `id` | r3-ladder-sentence |
| `requirements` | REQ-LADDER-006 |
| `files` | `content/commands/st-work.md` (`:466-467`, line-neutral: the sentence "A class without a supported model name or operator pin leaves selection to the client's own default." replaced; a Codex clause), `test/roster/modelLadder.test.ts` (`:270-302`, the wording assertion that reads that passage; the code rule it mirrors, `src/roster/modelLadder.ts:61-72`, is file 2's) |
| `interfaces` | "A class resolves through its pin (re-picked when the account's saved list lacks it), then the client's alias, then the account's own model list, then, only when no list was read, the shipped list; with none of these the key is left out. Where an agent file's model takes precedence over the call's, a per-call escalation leaves it unchanged." (amended 2026-10-15 from `review/102`, `build/62`, `build/66`; the client is named only in its capability facts) And the refusal fallback, in the same section, line-neutral: "When a sub-agent call is refused with a list of models, take the class's first listed fallback, else the closest, and say so in one line." |
| `testCriteria` | GIVEN `modelLadder.test.ts` THEN its wording assertion reads the new sentence and the fallback. GIVEN `work.test.ts` THEN the body and the reserve unchanged |
| `edgeCases` | The sentence cannot fit the two lines → a shorter wording, never a new line |
| `depends_on` | none |
| `verify` | `npx vitest run test/roster/modelLadder.test.ts test/corpus/commands/work.test.ts` |

### r4-changelog-caution — the release text and one caution

| Field | Content |
|---|---|
| `id` | r4-changelog-caution |
| `requirements` | spec carries no ids |
| `files` | `CHANGELOG.md` (`## [Unreleased]`: `Added`, `Changed`, `Fixed` beside file 1's `Removed`), `SECURITY.md` ("What it does not defend", after "Privilege" `:261-262`; and the statements naming rows this package fixed: `:113` the refused-folder reason, `:114` residual (2) the hook runner's launcher) |
| `interfaces` | `Added`: per-client model pins and the pick from the account's list; Cursor's model map and model-fill hook; the `model-pins` doctor row; the close walk on every touchpoint; prove-before-asking QA; `maint-module-depth`; cloud detection at session start; the container CI leg. `Changed`: the manifest's generation 2.0.0 (an older engine refuses it); `ModelConfig`'s shape; Copilot's camelCase hooks with the Claude tool names restored; the setup workflow always installs Node. `Fixed`: each inbox row this package closed, by its id. The caution: "**Runs nobody watches.** A flow started where no person reads its steps as they happen — a cloud session, a scheduled routine, or a headless `claude -p` call — has nothing of its own yet that stops it from pushing to `main` or merging a pull request: it can do whatever the account it runs as can do. Until a later release adds that check, protect `main` with a branch rule that requires a pull request and that no one may bypass, including the account such a run acts as." |
| `testCriteria` | GIVEN `test/ci/changelogLinks.test.ts` and `test/docsPages.test.ts` THEN green. GIVEN the leak gate THEN exit 0. GIVEN `SECURITY.md` THEN `:113` and `:114` (2) describe the behaviour this package shipped, not the residual it closed |
| `edgeCases` | A row this package re-placed instead of fixing → not under `Fixed` |
| `depends_on` | r1-release-machinery, r2-eval-prep, r3-ladder-sentence |
| `verify` | `npx vitest run test/ci/changelogLinks.test.ts test/docsPages.test.ts && npm run gate` |

## Inbox rows this file matched

Eleven rows, all placed: `2026-10-13_records-branch/close/1`, `pr/9`, `pr/10` (`r1`); `2026-10-13_records-branch/review/40`
and `2026-10-11_release-1-14-0/build/25`, `build/26`, `build/27` (`r2`); `2026-10-11_release-1-14-0/review/6`,
`build/35`, `close/13` and `2026-10-12_board-writes/close/3` (the cut). `SECURITY.md` names some of the rows this
package fixes (`close/5`, `review/70`); `r4` re-points those statements, so `SECURITY.md` keeps one writer after file 1.

## Execution order

`r1`, `r2`, `r3` in three lanes (files disjoint), then `r4`. Then the integration step regenerates every derived file
(every `sync` of this repository with `STAMITY_NO_CLIENT_PROBE=1`), runs the full suite alone under the machine lock,
knip, `npm run check`, the leak gate and the hygiene check, each read by its exit code, and the final whole-branch
review runs on the integrated tree.

## The cut (not units; the release checklist, on the maintainer's yes)

1. `close/13`, owed by this preparation and run before the eval run: the 1.14.0 Windows-only cases seen failing against
   the source without the fix, on a throwaway branch's Windows CI, then the branch deleted.
2. The full eval run on the final tree, alone under the machine lock (closes `build/35` with the run-of-record move).
3. The spec flips before the tag: `docs/specs/board-writes.md` to `shipped-with-1.15.0` with `REQ-BOARD-006`'s fourth
   criterion amended (`2026-10-12_board-writes/close/3`); every spec whose requirements this package ships.
4. `review/6` retired as fixed (the output it named is gone).
5. The tag with its `records:` line, the release run, the publish.

## QA walk

At most three person rows, after the prover has tried each:

1. A real close in Claude Code, walked: every leftover asked, the summary last (taste).
2. The release notes' `Removed` and `Changed` sections, read as someone upgrading a removal in a minor (judgment).
3. Only if the prover cannot hold it: a real Cursor session in which a Stamity sub-agent runs on the mapped model,
   read from Cursor's log (a real account).

## Risks

- **Warning** — the release eval run is long and holds the machine lock for hours; nothing merges to `main` while it
  runs.
- **Minor** — a tag without the `records:` line now stops the release; the checklist's cut step writes it.

## Open questions

None.

## Drop list

| Item | Revisit when |
|---|---|
| Moving the records pin from the tag message into a release input | a release needs to be re-run against another records commit |
