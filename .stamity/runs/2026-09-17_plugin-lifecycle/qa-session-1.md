# QA walk-through — Package 15, session 1 (pull request #45; batch A of plan 008 file 1 plus P1)

Candidate: `4eec37a` (the head of `package-15-plugin-lifecycle` after fixer round 3).
Harness evidence: `.stamity/evidence/qa-4eec37a.json` (2026-09-20T00:20Z; the earlier file at `c3efabd` dropped
because the candidate moved) (the hooks lane and the site lanes, written by
`node scripts/qa/run.mjs --site website/build --sha <candidate>`). Gate of record: the test-runner's full
gate at `e6f934c` and CI green on every leg at `985b359` and `c3efabd` (the run record's Prove and CI
sections); the round-3 fixer's delta is tests and documents only and re-runs the same gates.

## Rows derived (the triggers)

User-visible surfaces changed: the CLI remedies (the running package's name); the emitted hook runtime for
Cursor, Copilot and Codex; six documentation pages and the changelog; the contracts page. Error and
fallback paths changed: the upstream lane's recovery comparison and landing-policy read; the DCO check's
listing and exemption; the hook runner's fail-closed paths; the signing script's refusal message. Config
changed: `package.json` (`stamity.distribution`; `sigstore` optional) and the lockfile. Security-adjacent
paths changed: the DCO exemption, the credential-shaped refusals, the recovery comparison, the Cursor
allow paths, the signing rehearsal's source. Themes and breakpoints: the docs site renders the changed
pages at 375 and 1440 in light and dark.

## Appendix — rows auto-proven by artifacts that exist for this change

| # | Scenario | Proof |
|---|---|---|
| A1 | `stamity check` on an uninitialised repository names the running package in its remedy | `test/cli/commands/check.test.ts:405`; gate `npm run test -- --coverage` pass; the renamed-copy evidence in A2a's return |
| A2 | A renamed private fork passes its inherited gate without editing a test | `test/ci/forkIdentity.test.ts:46` (opt-in group, 4 passed); re-run after fixer round 3 adds the changelog suite |
| A3 | Recovery accepts a manifest carrying every optional key and refuses a `ledgar` typo | `test/upstream/workflowRecovery.test.ts:250`, `:340` |
| A4 | A 404 `Branch not protected` counts as checked; a 403 marks the surface unverified | `test/upstream/workflowLandingPolicy.test.ts:18` |
| A5 | The DCO check passes a 303-commit update pull request and refuses a sha the upstream's default branch never reached | `test/ci/workflow.test.ts:820`, `:1091`; live: the rewritten job passed on pull request #45 itself |
| A6 | A credential-shaped key or value in `stamity.distribution` is refused and never echoed | `test/ci/distributionIdentity.test.ts:199`, `:219` |
| A7 | Cursor: a silent child allows explicitly; an unreadable verdict or `decision: "deny"` faults (exit 1, no output) | `test/hooks/portableRunner.test.ts:50`, `:262`, `:284` |
| A8 | Copilot session-start text reaches the session as `additionalContext` | `test/hooks/portableRunner.test.ts:214` |
| A9 | The Codex starter runs the script beside `.codex/hooks.json` and ignores a nearer decoy | `test/hooks/portableRunner.test.ts:154` |
| A10 | The signing script prints the integrity refusal; the rehearsal's live path derives its source sha | `test/ci/packSigningRehearsal.test.ts:251`, `:28` |
| A11 | Claude Code hooks deny and allow headlessly at the candidate | harness row H1a `passed` (claude 2.1.278, `claude -p … --output-format stream-json`) |
| A12 | The built site's structure and keyboard journeys at 375 and 1440, light and dark | harness rows H2, H3a, H3b, H3c, H3d `passed` |
| A13 | Every changelog heading has a definition and the compare ranges chain | `test/ci/changelogLinks.test.ts:11` |
| A14 | APM skill heads carry `license` and `compatibility`; the committed package verifies | `test/ci/apmPackage.test.ts:131`; `generate-apm-package.mjs --check` pass |
| A15 | The checker scopes a prose range and reports a missing heading; the comparator finds the prior run across a case-byte change | `test/authoring/specPlanCoverage.test.ts:33`; `test/evals/manualRunner.test.ts:12` |
| A16 | A clean first install of the changed dependency set builds and tests green | CI floor, LTS and Windows legs at `c3efabd` (`npm ci`); `node scripts/tarball-smoke.mjs` pass |

## Walk-through — rows left for a person (55 minutes, one session)

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| H1 | Cursor hooks with the explicit allow | 1. In an empty directory: `git init`, `npx @zomarit/stamity init -y --tools cursor`, `npx @zomarit/stamity sync -y`. 2. Create `qa-denied.txt` and `qa-allowed.txt`; add a user PreToolUse hook that exits 2 on the denied file (the harness fixture under `scripts/qa/fixtures`). 3. Open the directory in Cursor and ask the agent to read the denied file, then the allowed one. | The denied read is blocked with the guard's message; the allowed read succeeds; no spawn or MCP call is blocked by silence. | M | 10 | harness H1c `not-run` (no measured non-interactive invocation on record; file 3's V1 adds it) — [ ] |
| H2 | Copilot CLI hooks and session-start injection | 1. Same setup with `--tools copilot`. 2. Run `copilot -p "Read qa-denied.txt, then qa-allowed.txt, and reply with what you could read" -s`. | The transcript shows the learnings index injected at session start and the denied read refused. | M | 10 | harness H1d `not-run` (same reason) — [ ] |
| H3 | Codex hooks under interactive trust | 1. Same setup with `--tools codex`. 2. Open the TUI, accept the project trust and the `/hooks` review. 3. Ask for the two reads. | The denied read is refused; `qa-observations.jsonl` gains one line per call. | M | 10 | harness H1b `not-run` (headless codex loads no project hooks) — [ ] |
| H4 | Upgrade over an existing checkout after the dependency move | 1. In an existing clone at the previous release: `git pull` the branch. 2. `npm install --ignore-scripts`. 3. `npm test`. | The lockfile gains only `optional` flags; `node_modules/sigstore` still present; the suite green. | L | 8 | — [ ] |
| H5 | The changed pages render on the built site | 1. `cd website && npm run build && npm run serve`. 2. Open the enterprise-forks guide, packs-and-trust, customization, the changelog. | Every page renders; every link resolves; no raw markup. | L | 5 | — [ ] |
| H6 | The signing rehearsal on `main` after the merge | 1. `gh workflow run pack-signing-rehearsal.yml --ref main`. 2. Wait for the run. | The run concludes `success`; its summary names the commit it signed. | M | 12 | the orchestrator's post-merge step; the run URL lands in the record — [ ] |

## Sign-off — Package 15 session 1, candidate `4eec37a`, 2026-09-20T00:35Z

The maintainer answered through the question tool: **Shippable YES, accept the six unperformed rows**
(the recommended option).

- [x] Every H row walked and passing — no H-risk row remained after the auto-prove pass (sixteen rows
  auto-proven; the six person rows are M or L).
- [x] Every failing M row has a filed follow-up, linked — no M row failed; H1, H2 and H3 are recorded as
  **signed off and not performed** (a fourth time, after 1.7.0, 1.8.0 and Package 14), with file 3's unit
  V1 as the row that measures them through the clients' now-installed invocation routes; H6 runs after the
  merge and its URL lands in the run record.
- L failures are recorded, not blocking — H4 and H5 unperformed, no failure recorded.
- Rollback: the pull request merges by rebase; `git revert` of the merged range (or reverting the merge on
  `main`) restores the previous tree; nothing is published to npm or to a distribution branch in this
  session.
- Shippable: **YES**.
