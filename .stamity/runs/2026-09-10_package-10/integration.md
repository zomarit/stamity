# Package 10 integration

Status: focused integration gates pass; independent full verification is pending.
This is a 1.7.0 candidate preparation record, not a release or human QA sign-off.
Baseline: `99c1094953346ef19a8aaab3ee0bd7d292c36ba6` / released 1.6.0.
The exact commands, measurements and generated path hashes are recorded in
`integration-evidence.json` beside this file.

## Integration and preservation

Source convergence was explicitly confirmed before generation. The five documented
generators ran successfully, followed by build and dogfood sync. No pack source changed,
so the pack generator verified the existing integrity maps and left catalog pins intact;
maintenance `--write` was unnecessary. The documentation generator left CLI/configuration,
reference pages and `llms.txt` byte-identical. Planning/specification material did not enter
the generated distribution or public documentation routes.

The first sync created nine companions, updated 22 files and left 36 unchanged. The final
sync created or updated no generated content and reported 67 unchanged files. The U4
repository-local eval skill override reached its Claude projection. APM received the eight
authored metadata companions and the structural helper, with each companion's bytes equal
to source. The generated inventories contain 62 created/updated files and 82 unchanged files,
including both golden artifacts. No path was removed from any of the five golden selections.

The actual repository's `.claude/settings.json` stayed byte-identical. Text outside the
managed blocks in `AGENTS.md` and `CLAUDE.md` stayed byte-identical. Manifest configuration,
selection, identity and creation fields were preserved; only generation version, update time
and the generated ledger changed. The existing multi-client lifecycle fixtures passed their
seeded user-content preservation checks.

Package and lockfile root versions are 1.7.0. The prepared changelog describes consumer-visible
behavior without claiming an admitted live evaluation. All existing dependency declarations,
locked versions, resolved URLs, integrity hashes and libc constraints remain unchanged. The
24 new lockfile entries belong to U3's required declaration graph. Integration restored 38
existing libc metadata fields omitted by npm's lockfile rewrite; no dependency upgrade was made.
The website configuration's obsolete numeric spec count was removed.

## Contract corrections before the golden refresh

The initial focused gate reported 31 failures: generated staleness, golden differences and
plain assertions describing the old native hook contracts. Source-owner transfer assigned
the three test sources and the capability currency producer to the integration writer.

- Core generation still produces exactly three scripts on the same event triple. Codex,
  Cursor and Copilot core role guards now describe their identity-free payloads honestly;
  Claude retains its exit-2 role gate. The tests hold that distinction independently.
- Codex tests decode the actual native string registration, retain commandWindows parity,
  reject the unsupported native sha256 field, and compare generated script bytes against
  their manifest ledger hashes. They preserve the complete authored argv, matcher and timeout.
- Cursor and Copilot tests decode the actual registered argv, compare it with the full user
  hook fixture and assert native matcher and five-second timeout fields. Copilot's new hook
  path joins per-client ownership and stray-output checks. Seeded user scripts stay unowned.
- The Claude bridge assertion now requires exactly the managed import block; the separate
  existing native-skill equality checks still prove skill discovery files retain their bytes.
- Full-byte golden coverage was added for all three portable runner variants, maintaining
  the cross-client suite's documented exclusion of hook bodies covered by the corpus suite.

The currency row now distinguishes the emitted CLI/cloud command hook behavior and native
timeout limit from separate editor compatibility work. Current official documentation confirms
the [CLI/cloud surfaces and failure behavior](https://docs.github.com/en/copilot/reference/hooks-reference)
and identifies [VS Code hooks as Preview](https://code.visualstudio.com/docs/agent-customization/hooks).
Both sources were read on 2026-09-10. The row no longer claims the existing CLI/cloud gate
will first be emitted when the editor capability reaches GA.

After these corrections, the pre-update gate had only 14 stale snapshot failures; all 105
other tests passed. Vitest created three new runner snapshots and updated the 14 stale ones.
Both golden diffs were reviewed: changed corpus projections, metadata companions, native
hook registrations, identity-free guard text and the smaller shared rule appendix account
for the movement. Review rationale is recorded inline in both golden test sources.

## Context measurements

| Surface | Baseline | Candidate | Held or tightened ceiling |
|---|---:|---:|---:|
| Charter template, lines | 97 | 97 | 150 |
| Cursor composite, lines | 97 | 97 | 97 |
| Claude composite, lines | 240 | 240 | 240 |
| Copilot composite, lines | 240 | 240 | 240 |
| Codex composite, lines | 1065 | 1063 | 1063 |
| Shared root without Codex, bytes | 4614 | 4614 | Exact measurement |
| Shared root with Codex, bytes | 29326 | 29071 | Exact measurement |

The Codex byte figure fell by 255, and the ratio to the charter-only file is approximately
6.3. The source measurement constants and generated capability page were reconciled after a
repository-wide reader census. These changes tighten the line ratchet and publish the actual
golden byte counts; no floor or size ceiling increased.

## Verification performed here

- Full `npm run lint`, `npm run typecheck` and `npm run build`: exit 0.
- Lifecycle, sync/clean, downstream/APM/plugin and reference/roster gate: 15 files, 455 tests pass.
- Final golden, corpus invariant, capability, portable runner, package and docs gate:
  12 files, 425 tests pass.
- Explicit golden-update run: two files, 75 tests pass; 14 updated snapshots and three added
  portable-runner snapshots. The later ordinary run passes without update mode.
- Final five-generator consistency pass: exit 0 and byte-identical output across all 144
  captured generated artifacts. Pack/plugin/APM checks are in read-only `--check` mode.
- `node dist/cli.js check`: exit 0, drift clean. Final sync: 67 unchanged generated files.
- The projected structural helper passes the Package 10 plan/spec, finding all ten requirement
  IDs and five units, with `semanticReview: required` retained.
- Final build accounts for 1,261,330 logic bytes including declarations under 2,097,152, and
  538,084 corpus bytes under 1,572,864. `git diff --check` exits 0.
- After writing these records, `node scripts/leak-gate.mjs` passes over 1085 files with
  zero hits across all 18 rules.

Source inputs changed after the earlier U1–U4 reviews: `src/content/charter.ts` measurement
metadata, `src/emit/capabilityMatrix.ts` currency prose, the three integration test consumers,
candidate version/lockfile preservation, changelog and website count comment. Generated
outputs and snapshots were refreshed afterward. These exact changes require the independent
integration review now assigned by the orchestrator.

Not done: full independent tests with coverage and remaining local/packed/site gates; actual
Linux/Windows CI and non-publishing release rehearsal; fresh full admitted release eval;
current human QA and platform approval. No commit, PR, tag, release or authenticated signing
proof is established by this record. Historical evaluation results and fixture trees were
not changed.

## Independent verification follow-up

The independent verifier's first full coverage run found three remaining stale assertions
in `test/corpus/hookWiring.test.ts`. The source-owner correction pins the current guarantee
ladder, the precise telemetry banner and all three clients with identity-free tool-call
payloads. Copilot denial/error and native timeout limitations stay explicit. Real-process
tests now exercise synthetic denied role calls and documented identity-free payloads on
Cursor, Codex and Copilot; the former remain telemetry and the latter invent no role verdict.

The extended reader census also found current documentation saying Copilot had no hook
configuration and that Codex emitted an undocumented tools placeholder. Those claims were
corrected in troubleshooting, the getting-started generated-path roster, translator coverage
prose and its generated capability table. Associated comments in hook model/scripts and
three test readers were reconciled. The shared review gate remains wired only for Claude;
another client's published lifecycle event does not establish this gate's integration.
The translator's public helper and returned comma-list values remain unchanged and supply
developer-instruction prose. No native event wiring, runtime behavior, floor, historical
result or versioned behavioral input changed.

Final follow-up checks: eight files and 269 tests pass, including both golden suites;
configured lint and typecheck pass. All five generator commands/checks pass, with only the
capability table's prose changing generated bytes. A fresh build and its dogfood check pass
with clean drift; the revised declaration comments and coverage text yield 1,261,341 logic
bytes, with corpus still 538,084 bytes. The retired current-claim search has zero matches.

`integration-evidence.json` records the exact ten changed input paths and hashes for this
follow-up. A final source freeze was sent to the orchestrator and independent verifier;
their new coverage, consumer and site proofs must cover these final bytes. Independent
verification and all release/human controls remain the authoritative completion gates.

## Second coverage-reader correction

Independent full coverage attempt 2 passed 7,654 tests with one stale extension-scope
prose assertion failing and two existing skips. The corrected `test/hooks/model.test.ts`
retains the exact Claude table ownership, Cursor exclusions and citation checks, and
asserts the current Claude gate boundary, Copilot `subagentStop` availability, required
verdict/decision integration and retained prompt review ladder. Its adjacent title and
comment now describe integration scope. `test/corpus/invariants.test.ts` changes only
the measurement comment to 29,071 / 4,614 ≈ 6.3x; all numeric assertions stay intact.

`npx vitest run test/hooks/model.test.ts test/corpus/invariants.test.ts && npm run lint &&
npm run typecheck` exits 0: two files and 81 tests pass. `git diff --check` also passes.
The current-reader census finds no retired extension-scope or byte-ratio claim; dated
golden history remains intact. These two test files are frozen for another independent
full coverage run. Product, generated and website bytes are unchanged. Exact final hashes
are recorded in `integration-evidence.json`. No overall gate or release completion is
claimed while the required coverage rerun and other release controls remain outstanding.

## Browser heading-order repair

Real browser accessibility evidence found H1 → H3 on the skills reference. The
shared reference renderer used the same skipped level in all six ungrouped inventories.
`src/cli/docs/referencePages.ts` now emits H2 for artifact, pack and MCP server entries.
The generated agents, skills, rules, commands, packs and MCP-server pages change exactly
52 heading markers; every heading's text/slug input and every other byte is preserved.
Grouped headings in the CLI/configuration sibling renderers remain unchanged.

Six new hierarchy cases in `test/cli/docs/referencePages.test.ts` fail against the original
producer, one per page, before the fix. Existing invocation-name, ordering, inventory and
refusal assertions remain intact with their heading levels reconciled and dated reasons.
The seven-file docs/sibling/site-focused run passes 206 tests, followed by configured lint
and typecheck. Regeneration of all nine generated documentation/index files is byte-stable
on repeat, and `git diff --check` passes. No corpus or dogfood artifact changed.

The eight changed paths and their exact hashes are recorded in `integration-evidence.json`
and frozen for independent verification. The original failed browser proof remains intact;
refreshed browser checks must cover all six reference pages. Full coverage and browser gates
remain pending, including the verifier's separately identified supported null-exit matrix
branch fixture gap.

## Supported nonblocking matrix fixture

The public renderer still supports a fail-open/null guarantee although every live client
now declares a blocking exit. One synthetic input fixture in
`test/emit/capabilityMatrix.test.ts` independently asserts the complete guarantee row and
the glance enforcement cell as `never blocks`, and verifies that the original live Cursor
input remains blocking exit 2. Every existing native live-row assertion remains in place.
No production, generated or coverage configuration changes were made.

The focused suite passes all 45 tests, then configured lint and typecheck pass. An additional
isolated matrix-only coverage run honestly exits 1 at 55/60 branches (91.66%), below the held
93% floor; its narrower test set omits a branch exercised elsewhere by the full suite. The
verifier's preceding full suite had 54/60 before the two null arms were exercised. The
required new full coverage run, not an inferred arithmetic result, decides closure. Both
red logs are preserved. The test is frozen and its exact hash is recorded in the JSON
evidence. The subsequent leak gate passes across 1,085 files with zero hits under all
18 rules; no confidential repository identifier was found in the integration records.

The existing `test/emit/coverageGaps.test.ts` supplies the refusal branch absent from the
45-test-only run. Running that existing suite together with the matrix suite and scoped
matrix coverage exits 0: 56 tests, 56/60 branches (93.33%), 119/121 statements (98.34%),
and 100% functions/lines. The held matrix floors pass. No further edits were needed;
the narrower red log remains preserved and the independent full suite stays authoritative.

## Final read-only scope check

Compared the authorized Package 10 scope with its current plan/spec, client and authoring
dispositions, signing/distribution and runner evidence, and all independent source reviews.
No concrete missing implementation or current disclosure was found. All six proposals have
actual outcomes: authored skill metadata, Codex companions, compatible Claude command
delivery, structural/semantic coverage workflow, the authoring checklist, and existing
dated plan/run/git archive. Native-memory overlap has its dated retention rationale.

Fresh admitted live behavior, final candidate-bound local/site/browser proof, actual CI and
non-publishing rehearsal, human QA and platform approval remain explicit outstanding
controls. The integration records contain no confidential repository or ledger identifiers.
This check performed no later-package measurement, final audit, cleanup or source edits.
