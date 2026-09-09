# Run record — the 1.3.0 release (2026-09-09)

The release cut from the Package 9 tree on the maintainer's word, one day after 1.2.0: the full eval set at the
candidate (run 9), the hand pages re-attested read-only, the changelog completed under its own rule, the cut by
the script of record, then the pull request, the merge, the tag and the publish waiting on the maintainer's
approval. The findings ledger is `ledger.jsonl` beside this file; the eval run the release carries is
`evals/runs/2026-09-09-run-9/`. Every attestor, reviewer and judge ran at `claude-fable-5-1`; every fixer and
loader at `claude-opus-5` (attesting `claude-opus-5[1m]`); the orchestrator ran the cut script, the gate line
and the two inline sentence edits the reviewers supplied verbatim.

## Outcome

**Cut as 1.3.0, every gate green, ready to merge.** Main since `v1.2.0` carried the close-step prompt change,
twenty-seven fixes, SECURITY.md's workspace wording, the migration page's title, sigstore 5 in the verifier's
graph and the Node floor at 22.22.2 — consumer-visible changes no release had reached. The maintainer chose
1.3.0 (a patch may not raise an engines floor or add behaviour; the floor moved within Node 22 to the range
the committed graph already declared). Run 9 is red on two of four metrics under the strict rule, the reading
1.2.0 shipped on, with the golden rate up from 0.854 to 0.927 and five of 1.2.0's seven red cases now holding
at three samples; it ships under a decision row in the private layer naming its four cases, which is the
standing release rule.

## Proof block

### Gate results (the orchestrator's line under Node 22.22.3, the cut tree, exits unmasked)

| Gate | Result |
|---|---|
| `npm run gate` | 0 — 18 rules, 868 files, 0 hits |
| `npm run typecheck` · `npm run lint` · `npm run knip` | 0 · 0 · 0 |
| `npm test -- --coverage` | 0 — 180 files, 7,127 passed, 1 skipped, every floor met |
| `npm run build` | 0 — logic 1.03 of 2.00 MiB, corpus 0.50 of 1.50 MiB |
| `node dist/cli.js check` | 0 — drift clean, ten doctor probes ok, 58 managed files, engine 1.3.0 |
| APM `--check` · plugin manifests `--check` · pack manifests `--check` | 0 · 0 · 0, all at 1.3.0 |
| the docs site, built locally (typecheck and build) | 0 · 0; the migration page renders its declared title |
| CI at the pull request head | see the pull request; the merge is the maintainer's |

### Review verdicts, per round

| Pass | Outcome |
|---|---|
| The CHANGELOG's Unreleased section (writer at `claude-opus-5`, attestor at `claude-fable-5-1`) | five rounds: 0.86 rc → 0.86 rc → 0.86 rc → 0.90 rc → 0.86 rc, each round one or two claims the tree did not prove (the floor sentence false at HEAD; four guarded restore steps where the tree guards two; the `--no-color` lead naming a symptom the fixing commit says never reproduced; the sigstore hardenings attributed to the wrong package), then the last lead sentence applied inline with the reviewer's exact wording; the extraction test green at every round |
| The hand pages (one attestor per page) | eleven pages, up to four passes each with a fixer between; 1,087 claims in the final passes; nine clear by the fourth pass, SECURITY.md (197 claims) and the customization guide (103) clear on a fifth pass at `f1a4749` |
| Run 9 (the harness of record) | calibration 5/5 with the labels withheld and the rubric core's hash recorded; 207 scenarios and 15 loaders `claude-opus-5[1m]`, 207 judge calls `claude-fable-5-1`; 0 redone |

### Decisions trace

- **The version**, the maintainer's: 1.3.0, asked "why not 1.2.1" and answered with the floor and the new close-step behaviour; 2.0.0 offered and not taken.
- **A red metric shipping with its row**: the session's declared reading per the 1.2.0 precedent, recorded with the reading dropped (a corpus lever on the two golden floors that failed on three-sample variance); the maintainer overturns with one row.
- **Assumption stated, not asked:** the changelog footer's link-definitions move with the cut, so the file does not go stale as it did at 1.2.0.
- **Assumption stated, not asked:** the two last hand-page corrections were applied by the fleet's fourth-round fixers after the attestations that flagged them; the fifth pass at the docs commit is what clears them, and the banners point at that commit.

### Artifacts touched, with the owner

| Commit | What it carries | Owner |
|---|---|---|
| `f1a4749` docs | eleven hand pages corrected at their sources; the CHANGELOG's Unreleased section completed; the docs-suite pins that moved with them | fixers (attestation and changelog rounds); two sentences by the orchestrator under the Tier-1 carve-out |
| `a5711ee` test(evals) | run 9: `RESULTS.md` and `samples.jsonl` | the harness; rendered by the orchestrator |
| the cut (this record's commit) | 1.3.0 across the version carriers, the CHANGELOG heading and footer, eleven banners, the cut-date pin, the manifest and emitted markers, this record | orchestrator, by the script of record plus its two hand steps |

### Per-action attribution

| Role | Count | Attested id |
|---|---|---|
| changelog writer and fixers | 5 | `claude-opus-5[1m]` |
| changelog attestors | 5 | `claude-fable-5-1` |
| hand-page attestors (five passes) | 45 | `claude-fable-5-1` |
| hand-page fixers | 32 | `claude-opus-5[1m]` |
| run 9: loaders and scenarios | 222 | `claude-opus-5[1m]` |
| run 9: calibration and judge calls | 212 | `claude-fable-5-1` |

### Recommended next step — derived from this run's own state

Merge the pull request by rebase on green checks, tag `v1.3.0` at main's new head and push the tag; the
release workflow re-proves version equality and tag ancestry and holds the publish job for the maintainer's
approval in the `npm-publish` environment; fifteen minutes after publish (thirty-three at 1.2.0), the
currency instance in the private layer takes its registry rows. Nothing is deferred: the one deferred row
(run 9's two red metrics) is retired to the next release's full run in the same close.

## QA walk-through (the human checkpoint)

No user-visible surface moved in this release beyond what Package 9's record drove and the maintainer signed
this morning; the cut moves version carriers, banners and the changelog. Two rows, both driven:

| # | Scenario | Driven how | Observed | Risk | Proof |
|---|---|---|---|---|---|
| 1 | The published version reads 1.3.0 on every carrier and the emitted markers | the cut script and the three `--check` generators | ten carriers at 1.3.0; `check` drift clean | L | the gate table |
| 2 | The migration page renders its declared title | the docs site built locally from the cut tree | `og:title` "Migrating from hatch3r \| stamity" | L | `website/build` (untracked) |

**Sign-off** — the 1.3.0 release, 2026-09-09

- [x] Every H row walked and passing. (No H row on this path.)
- [x] Every failing M row has a filed follow-up, linked. (No M row.)
- L failures are recorded, not blocking.
- Rollback: the publish is the maintainer's click; before it, `git revert` of the cut commit; after it, the next patch.
- Shippable: **YES** — the checkpoint closes on the maintainer's publish approval, the human control the flow reserves.

## Not done

**None.** Run 9's two red metrics are named in the release's decision row and retired to the next release's
full run; the publish is the maintainer's approval by design.
