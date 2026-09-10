# Run record — the 1.4.0 release: APM served from the main repository, and the enterprise upstream lane (2026-09-09 → 2026-09-10)

One overnight autonomous run on the maintainer's four answers (2026-09-09, 23:35 local: a full 1.4.0
release; no `delete_repo` scope, the maintainer deletes the mirror themselves after a "safe to delete"
checkpoint; temporary smoke repositories allowed; direct engineering with sub-agent fan-out), paused by a
model session limit from about 00:45 to 09:01 and resumed on the maintainer's "continue". The plan is
`docs/plans/004-apm-canonical-and-enterprise-upstream.md`; the specs are
`docs/specs/apm-canonical-distribution.md` and `docs/specs/enterprise-upstream-lane.md`; the findings
ledger is `ledger.jsonl` beside this file; the release's eval run is `evals/runs/2026-09-10-run-10/`. The
orchestrator ran at `claude-fable-5-1`; the builders at `claude-opus-5` except the lane script and its fix
round at `claude-fable-5-1`; every reviewer, attestor and judge at `claude-fable-5-1`; the eval
scenarios at `claude-opus-5` (attested `claude-opus-5[1m]`).

## Outcome

**Both changes shipped on one branch, every gate green, the route proven live, the release cut by the
process of record.** The APM package this repository already generated is now the canonical
distribution: microsoft/apm's precedence fix (issue 2735, PR 2776, shipped in 0.29.1 on 2026-09-06) made
`apm install zomarit/stamity` and `zomarit/stamity#v1.3.0` deploy the full corpus for claude, copilot,
cursor and codex under 0.29.1 and 0.30.0, byte-identical to the mirror's tree, before this change touched
anything; the change proves it (an install smoke that verifies deployed content, three CI legs including a
regression witness at 0.29.0, a release gate against the canonical ref in its own credential-free job),
documents it (the route, the 0.29.1 floor and its symptom, the vendored tree), and retires the mirror as a
channel. The enterprise upstream lane — `scripts/upstream.mjs`, `.stamity/upstream.json`, the opt-in
`upstream-update.yml`, the enterprise-forks guide — takes an upstream release into a fork through an
isolated update branch with the record derived from history, and its lifecycle is proven by 85 tests over
temporary repositories and by four GitHub Actions runs in a temporary private fork. Run 10 is red on three
of four metrics under the strict rule on a corpus byte-identical to 1.3.0's; it ships under the standing
release rule with a decision row in the private layer naming its six cases.

## Proof block

### Gate results (the orchestrator's line under Node 22.22.3, the candidate tree, exits unmasked)

| Gate | Result |
|---|---|
| `npm run gate` | 0 — 18 rules, 884 files, 0 hits |
| `npm run typecheck` · `npm run lint` · `npm run knip` | 0 · 0 · 0 (knip after two fixture constants lost an `export` nothing imported) |
| `npm test -- --coverage` | 0 — 183 files, 7,261 passed, 2 skipped (pre-existing), every floor met |
| `npm run build` | 0 — logic 1.03 of 2.00 MiB, corpus 0.50 of 1.50 MiB |
| `node dist/cli.js check` | 0 — all green, nothing to do |
| APM `--check` · plugin manifests `--check` · pack manifests `--check` · docs generation idempotent | 0 (50 files) · 0 (4 manifests) · 0 (3 packs, pins in sync) · 0 (only the guide's own edit in the diff) |
| `node scripts/apm-install-smoke.mjs` at 0.30.0 · 0.29.1 · 0.29.0 `--expect-failure` | pass (135 primitives, four targets) · pass · pass (the witness saw `agent_plugin` in the lockfile) |
| the live tag route `zomarit/stamity#v1.3.0` at 0.30.0 | pass, resolved commit `c950e18a` |
| the docs site, built locally | 0 (the docs unit's build; `onBrokenLinks: throw`) |
| CI at the pull request head | see the pull request |

### Review verdicts, per round

| Pass | Outcome |
|---|---|
| Lane script (`stamity-reviewer`, `claude-fable-5-1`) | request-changes: 1 Critical (a lost record blocked the re-integration the lane itself recommended), 8 Warnings, 8 Minor; fixed in one round at `claude-fable-5-1` except M5 (rejected with its reason) and W9 (the spec moved); 85 lane tests after the round |
| Workflow, CI legs, smoke (`stamity-security`, `claude-fable-5-1`) | 1 Critical (the release gate ran pip's unpinned closure and apm inside the gates workspace before `npm pack`), 2 Warnings, 3 Minor; fixed in one round at `claude-opus-5`: the smoke moved to its own credential-free job, publish re-validates its inputs and never pushes workflow-file changes, an existing pull request is reported rather than rewritten, issues carry a lane-owned marker, the witness demands a routing failure |
| Hand pages and the changelog (one attestor, `claude-fable-5-1`, at `a349fd7`) | six surfaces, about 310 claims: 0 Critical; Warnings — the guide's "only required key" (`version` is required too), the guide's count-literal attribution, the changelog's "before the tarball is packed" (the smoke gates shipping from its own job) and "every `v*` tag" (main and v1.3.0 are what was proven), the getting-started Homebrew remedy (sourced from the client's README, now in the record), and the banner shas left behind by the sign-off rebase (restamped at the cut); nine Minors tightened; all applied in one round by the orchestrator (`6b258e4`) |
| Run 10 (the harness of record) | calibration 5/5 with the labels withheld and the rubric core's hash recorded; 207 scenarios and 15 loaders `claude-opus-5[1m]`, 207 judge calls `claude-fable-5-1`; 0 redone |

### Decisions trace

- **Landing scope**, the maintainer's: the full release; PR-only and merge-without-release dropped.
- **Deletion**, the maintainer's, revised at 00:20: no `delete_repo` scope; the backup lands in the private
  layer and the run stops at the safe-to-delete checkpoint; the maintainer deletes the mirror.
- **Fixture repositories**, the maintainer's: two temporary repositories under the organisation; the
  maintainer deletes both (no scope).
- **Process**, the maintainer's: direct engineering with fan-out and the repository's records.
- **Assumption stated, not asked:** the version is 1.4.0, a semver minor (two additive capabilities, no
  breaking change; the APM client floor is a requirement of a new route, not a change to an old one).
- **Assumption stated, not asked:** the lane is a `scripts/*.mjs` tool, because it must run in a tree
  that is mid-merge and does not build; a CLI verb dropped.
- **Assumption stated, not asked:** no edit under `content/`, so the release runs the full set by the
  standing rule and no prompt-triggered slice opens; the eval ran at `a42b45d` in parallel with the
  build because the corpus and the sealed-input manifest are byte-identical to the candidate's.
- **Assumption stated, not asked:** the org-overlay content layer is a recorded non-goal with a trigger,
  not built tonight.
- **Assumption stated, not asked:** automation never pushes a branch that changes workflow files, with or
  without a secret — the reviewer's reading, taken over the first draft's "the secret lets them land".
- **Assumption stated, not asked:** invariant 2 of the lane spec moved to what the code does (a record
  that says failed or skipped is never integrated; ancestry with no record counts), because REQ-010
  allows records to be deleted; the reading dropped was to refuse ancestry without a record.
- **Default applied:** no organisation-level Actions setting was changed and no token was created — both
  are the maintainer's — so the smoke proves the documented failure paths for pull-request creation and
  the pull-request path only through the workflow suite's stubbed runs.

### Artifacts touched, with the owner

| Commit | What it carries | Owner |
|---|---|---|
| `0441e90` docs(specs) | the two specs and the plan with the dated research record | orchestrator |
| `5452c02` feat(apm) | `scripts/apm-install-smoke.mjs`, `test/ci/apmInstall.test.ts`, the `apm-install` job, the release gate, the generator's HISTORY block | implementer at `claude-opus-5` |
| `01edc1a` feat(upstream) | `scripts/upstream.mjs`, `test/upstream/*`, `.gitignore` | implementer at `claude-fable-5-1` (its session ended on a limit with the work green and the report unsent; the orchestrator audited the suite and ran the real-clone smoke) |
| `438e223` ci(upstream) | `upstream-update.yml`, `test/ci/upstreamWorkflow.test.ts`, the closed lists | implementer at `claude-opus-5`; the two closed-list rows by the orchestrator |
| `b65b6f4` test(evals) | run 10 | the harness; rendered by the orchestrator |
| `36f37e4` fix(ci) · `d326638` fix(upstream) | the runner-context parse error and the merge-time identity, both found by the smoke's first dispatches | orchestrator |
| `2002647` docs · `a3306d6` docs(specs) | the guide, the install pages, the changelog, the nine pins, the spec corrections | implementer at `claude-opus-5`; the spec by the orchestrator |
| `43f877e` fix(ci) | the security review's six findings | fixer at `claude-opus-5` |
| `acedec1` fix(upstream) | the lane review's findings | fixer at `claude-fable-5-1` |
| `a349fd7` chore | the guide's generated-path list, the knip fix, the inbox rows | orchestrator |
| the cut (this record's commit) | 1.4.0 across the version carriers, the changelog heading and footer, the banners, this record | orchestrator, by the script of record plus its hand steps |

### Per-action attribution

| Role | Count | Attested id |
|---|---|---|
| research agents (APM source; enterprise-fork approaches; codebase census) | 3 | `claude-fable-5-1` |
| implementers (APM route; workflow; docs) | 3 | `claude-opus-5[1m]` |
| implementer (lane script and suite) | 1 | `claude-fable-5-1` |
| reviewers (lane; security) | 2 | `claude-fable-5-1` |
| fixers (security round; lane round) | 2 | `claude-opus-5[1m]` · `claude-fable-5-1` |
| hand-page attestor | 1 | `claude-fable-5-1` |
| run 10: loaders and scenarios | 222 | `claude-opus-5[1m]` |
| run 10: calibration and judge calls | 212 | `claude-fable-5-1` |

### Recommended next step — derived from this run's own state

<!-- NEXT: patched at the close -->
Merge the pull request by rebase on green checks, tag `v1.4.0` at main's new head and push the tag; the
release workflow re-proves version equality and tag ancestry, runs the APM route smoke against the tag's
sha in its own job, and holds the publish for the maintainer's approval in the `npm-publish` environment;
after the publish, verify `apm install zomarit/stamity#v1.4.0`, take the mirror's backup into the private
layer, and hand the maintainer the safe-to-delete checkpoint.

## QA walk-through (the human checkpoint)

Rows auto-proven from this run's evidence first; the sign-off is the maintainer's.

| # | Scenario | Steps | Expected | Evidence |
|---|---|---|---|---|
| 1 | Install through APM from the main repository | `apm install zomarit/stamity#v1.3.0 --target claude` with apm-cli 0.30.0 in an empty directory | 10 agents, 9 commands, 12 rules, 8 skills under `.claude/`; `apm.lock.yaml` types the package `apm_package` | proven: the probes of 2026-09-09 and the smoke's live run (`resolvedCommit c950e18a`) |
| 2 | An older client says why | the same with apm-cli 0.29.0 | exit 0, zero primitives, the line the docs name | proven: the probe and the regression witness leg |
| 3 | A fork takes a release | in a clone with `.stamity/upstream.json`: `status`, `preview`, `integrate --release <tag>` | the outcomes and exit codes the guide lists; the update branch under `.stamity/upstream-work/<tag>/` | proven: 85 lane tests; the real-clone smoke (`up-to-date` at v1.3.0); Actions run 34448974334 |
| 4 | A conflict is a result, not a guess | overlapping edits on both sides | `conflict`, the path and kind named, nothing committed, both sides in the index | proven: lane tests (criteria 3, 4, 8, 9) |
| 5 | The workflow in a fork | dispatch `upstream-update.yml` | a pushed branch and a pull request, or the documented failure message; a second run reports and touches nothing | proven for the branch, the idempotent re-run and the reviewed-push issue (runs 34451192663, 34451283507, 34451392157); the pull-request creation is blocked by the organisation policy and is proven by the stubbed suite only |
| 6 | The canonical repository never runs the lane | push to main here | the probe ends green with a notice | to observe on the first scheduled run after the merge |
| 7 | The release cut | the release workflow on `v1.4.0` | gates, the `apm-route` job, the publish held for approval | to observe at the cut |

**Sign-off:** _the maintainer's_.

## Not done

<!-- NOTDONE: patched at the close -->
- The pull-request creation path in Actions is proven by the workflow suite's stubbed runs, not live: the
  organisation forbids Actions-created pull requests and no token was created (both the maintainer's).
- The landing-policy warning's positive branch is proven by the stubbed runs only: the private smoke
  repository's plan exposes no branch-rules endpoint.
- Run 10's six red cases and the one advisory two-run repeat travel with their spans to the decision row
  and the inbox; no case text and no threshold moved.
- The org-overlay content layer is a recorded non-goal with its trigger.
- The mirror repository and the two smoke repositories are deleted by the maintainer.
