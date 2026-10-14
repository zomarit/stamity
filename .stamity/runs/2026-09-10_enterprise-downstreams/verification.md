# Independent release candidate verification

Candidate: `da7d8a76bad16eec38cf734a5bfeb01d0c419d38` (Package 13, prepared package version 1.6.0). Every product gate ran in a fresh isolated detached checkout of this commit. Root product files and concurrent run-record work were untouched; no commits were made.

Verdict: all requested local release gates passed, and the timestamp correction is approved. Platform release controls, the final release and human QA remain separate root-owned work.

## Executed gates

| Gate | Result |
| --- | --- |
| `npm run lint && npm run typecheck && npm run test` | Exit 0; 187 files, 7,455 passed, 2 existing skips |
| `npm test -- --coverage` | Exit 0; same 7,455 passed / 2 skips; all configured per-file floors pass |
| `npm run build` | Exit 0 |
| `npm run gate` | Exit 0; 900 committed files scanned, zero hits |
| `npm run knip` | Exit 0 |
| CI's capability/docs/pack/plugin/APM generator sequence plus `git diff --exit-code` | Exit 0; no generated drift |
| `node dist/cli.js check` | Exit 0; 58 managed client files, drift clean |
| `node dist/cli.js sync` | Exit 0; only `.stamity/manifest.json.updatedAt` changed; original bytes restored in isolated checkout |
| `node scripts/tarball-smoke.mjs` | Exit 0; actual pack/install, packed-tree leak scan, five content classes, three packs, init and check |
| Website `npm run typecheck && npm run build` | Exit 0; current candidate's documentation production build |
| Independent workflow correction red/green | Prior workflow fails the new fresh-sync test at the expected recovery assertion; shipping workflow passes all 62 tests in the three selected workflow suites |

Coverage totals: statements 96.38%, branches 89.65%, functions 98.68%, lines 97.27%. The floor verdict comes from the successful coverage command, not only these aggregate numbers.

Environment: macOS 26.6.1 arm64, Node 22.22.3, npm 10.9.8. Root and website dependencies installed from committed lockfiles with lifecycle scripts disabled. Linux floor/LTS and Windows remain the actual GitHub CI legs; this local run does not substitute for them.

## Fresh documentation browser evidence

The copied prior independent harness ran against this freshly built candidate at `http://127.0.0.1:4183`, using the previously authorized disposable Playwright 1.63.0 / Chrome 146.0.7680.153 / axe-core 4.13.0 tools. No product dependency changed. Only paths, candidate metadata and target port changed in the copied script; the original evidence remains intact.

- Enterprise forks, getting started and customization: light/dark at 375px and 1440px, 12 scans total. Zero serious, critical or other violations, and zero page errors. WCAG 2A/AA, 2.1A/AA and best-practice rules ran without exclusions.
- Twenty actual keyboard Tab/ArrowRight probes reached overflowing tables, moved their horizontal scroll and observed visible focus outlines. Fitting tables remained outside the tab order after hydration.
- Native table/header accessibility roles, resize and enlarged-text tab-stop behavior, page overflow checks, and no-JavaScript table fallback passed.
- Mobile light/dark enterprise focus captures were opened and visually inspected. There is no committed visual baseline or pixel tolerance; no screenshot-diff claim is made. Full human keyboard journey and actual screen-reader use remain human QA.

See `a11y/bundle.json`, raw axe/AX JSON, screenshots and `a11y-check.mjs`. The dedicated local server remains available in tool session 32669 for the root's review.

## Independent review and proof boundaries

`REVIEW.md` approves the timestamp correction and gives file/line evidence. `QA-POINTERS.md` maps the package promises to load-bearing tests. The new regression reaches the real git/jq workflow shell and real manifest writer, while GitHub mutation is explicitly substituted at the unavailable unit-test boundary. Actual public/private platform lifecycle proofs belong to the root and fixture agents.

The first regression harness launch raced temporary worktree creation and reached no tests (`MODULE_NOT_FOUND`). Those logs and metadata remain under `.initial-infrastructure` names; they do not count as the red control. The successful red/green run follows them in separate files. The regression worktree has only its disposable node_modules symlink untracked; the primary isolated checkout ends clean.

The leak scan above covers this committed candidate. It does not cover the root's concurrent untracked run records or any later commit; run the final public-record leak gate after staging those artifacts.

The fresh eval was not rerun. The user expressly approved reuse of run 10 for this release, retaining its recorded failed floors and limitations. This verification does not convert it to a passing result or a Codex baseline. Required human QA and npm-publish approval are not inferred from local green gates.

`gates.json`, per-command logs, `environment.json` and `sha256-manifest.json` retain exact commands, outcomes, source SHA and artifact identity. Earlier customized CLI, APM and browser evidence remain historical artifacts; this report does not overwrite them or claim to re-execute all earlier external fixtures.
