# Independent verification — Package 10 integrated candidate

PASS for the reviewed source and configured local gates. No open source-review findings remain. This is not release approval: fresh behavioral execution, human QA and the root-owned platform/release evidence remain separate.

Verified on Darwin arm64, Node v22.22.3, npm 10.9.8. The verifier authored no product source or tracked generated-file edits and did not stage, commit or tag anything.

## Candidate binding

Baseline HEAD: `99c1094953346ef19a8aaab3ee0bd7d292c36ba6`. Final uncommitted input digest: `b099abbc995aa6a93865824f12c581374ac22e09c24073afd7d2d3e8c6734d0d` over 1071 tracked/untracked-not-ignored input records; the post-gate digest is identical. The current public run directory is excluded because agents write evidence there concurrently. Full inventory and bulky logs are retained under `/tmp/stamity-package10-verifier-53zp_wt0`; `verification.json` records command arguments, timestamps, exit codes, log hashes, selected source hashes and artifact bindings.

Final coverage, lint, typecheck, Knip, root build, size, generated-doc comparison, packed consumer, dogfood and website build proofs use `b099abbc995aa6a93865824f12c581374ac22e09c24073afd7d2d3e8c6734d0d`. The previously passing pack/plugin/APM generation checks and website typecheck remain applicable because their package/corpus/generator and website TypeScript inputs are unchanged. The earlier candidate results remain recorded as superseded.

## Executed gates

| Command | Exit | Duration |
|---|---:|---:|
| `npm run lint` | 0 | 1.41s |
| `npm run typecheck` | 0 | 1.00s |
| `npm run test -- --coverage` | 0 | 110.41s |
| `npm run build` | 0 | 1.03s |
| `npm run gate` | 0 | 5.29s |
| `npm run knip` | 0 | 1.60s |
| `node scripts/size-budget.mjs` | 0 | 0.13s |
| `node scripts/generate-pack-manifests.mjs --check` | 0 | 0.46s |
| `node scripts/generate-plugin-manifests.mjs --check` | 0 | 0.32s |
| `node scripts/generate-apm-package.mjs --check` | 0 | 0.32s |
| `python3 /tmp/stamity-package10-verifier-53zp_wt0/compare_generators.py` | 0 | 0.71s |
| `node dist/cli.js check` | 0 | 0.35s |
| `node scripts/tarball-smoke.mjs` | 0 | 14.73s |
| `(website) npm run typecheck` | 0 | 0.43s |
| `(website) npm run build` | 0 | 4.57s |

Coverage result: Test Files  194 passed (194); Tests  7662 passed | 2 skipped (7664); Duration  109.86s (tests 96%, import 3%, transform 1%). Vitest's configured per-file floors passed without changing `vitest.config.ts`; global coverage remains report-only. The two existing opt-in skips are the actual APM client route (`STAMITY_APM_BIN`) and the live Sigstore trust-root test (`STAMITY_SIGSTORE_NETWORK_TEST`).

The packed consumer installed the actual 1.7.0 tarball outside the checkout, compiled strict NodeNext TypeScript with `skipLibCheck: false`, checked a rejected unsupported client type, imported the JavaScript API, and completed CLI init/check. The packed tree passed its leak scan. Build size is within the 2,097,152-byte logic/declaration and 1,572,864-byte corpus budgets; exact measured totals are retained in the size log. Dogfood check reports all 67 Claude ledger rows drift-clean. Generator checks cover three packs, four plugin manifests, the 59-file APM package and all ten generated documentation outputs.

## Findings and independent delta review

Coverage attempt 1 found three stale assertions in `test/corpus/hookWiring.test.ts`: the telemetry banner, native guarantee ladder and identity-free client membership. The repair retains explicit independent expectations and adds real process checks for synthetic role telemetry and documented identity-free payload silence. Attempt 2 found one remaining old extension-scope prose assertion in `test/hooks/model.test.ts`. Its replacement pins the current Claude integration, published Copilot event, required verdict/decision behavior and retained prose ladder; table ownership, Cursor exclusions and citations remain asserted. A related obsolete byte-count comment was corrected without changing the invariant. Attempt 3 then passed every test but failed the unchanged 93% capability-matrix branch floor at 90%: removing the last live nonblocking guarantee left two supported rendering arms untested. A synthetic valid guarantee fixture now asserts both never-blocks cells while retaining live-client checks; the final full run reaches 56/60 branches (93.33%). Root browser review also caught H1-to-H3 jumps in generated reference pages; the shared producer now emits H2 entries, with six new hierarchy regressions. Independent comparison verified all six page changes are heading promotions only, preserving heading text and other bytes. All findings are closed; all three red coverage logs are retained.

The Codex context ceiling is tightened from 1065 to 1063. Independent direct composition measures charter 97/150 and client loads Cursor 97/97, Claude 240/240, Copilot 240/240, Codex 1063/1063. Golden byte measurements and public disclosure both read 29,071 with Codex and 4,614 without. Full golden tests and generated-page comparison pass.

The disclosure delta correctly separates Copilot CLI/cloud native hooks from VS Code Preview, native command denial from identity-free role telemetry, and Codex instruction grants from its filesystem sandbox. Compatibility API values are retained. The package/lockfile version is 1.7.0; existing lockfile integrity/platform fields and user-owned Claude settings/outside-managed-block text were preserved. The earlier U1/U2 source review and raw historical-eval classification remain in `review-u1-u2.md`; no corpus case or Expected block changed in this verification delta.

The verified website is `/Users/denismasatovic/Projects/zomarit/stamity/website/build`: 134 files, 5,203,039 bytes, artifact digest `b55042d36fe1ccde8e13bb4f73752eb4b929e1e7671a89a621351504453eafa6`. Its typecheck/build pass; interactive browser evidence is owned by the root agent.

## Not done

- Actual Linux/Windows CI and the actual APM route are root-owned external evidence, not established by this Darwin run.
- Browser checks and release dry_run rehearsal remain root-owned candidate-bound evidence.
- Live-client hook trust/runtime behavior is not established by generated-process fixtures.
- No admitted fresh model execution, judge calibration, affected/all-adversarial samples or fresh full release eval was run; deterministic fixtures do not substitute for the unavailable authorized API credential.
- Human QA and the existing platform approval remain required before release.
