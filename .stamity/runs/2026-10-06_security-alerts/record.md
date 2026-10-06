# Run 2026-10-06_security-alerts — the five Dependabot security PRs merged, and the docs site's four other fixable alerts

Status: closed — Dependabot #79–#83 merged and #84 merged to `main` by fast-forward (`f731896d`, 2026-10-06T13:36:58Z), without a release; nine advisories closed; ledger 7 rows, 0 open
Plan: .stamity/runs/2026-10-06_security-alerts/plan.md
Invocation: /st-work The maintainer's answer of 2026-10-06 ("Merge five, fix four more (Recommended)"): review each of Dependabot's security PRs #79–#83, merge them once CI is green and read main's push runs; then one pull request removing the four other fixable alerts from the docs site's lockfile (tinypool #28 and #29, postcss-selector-parser #30, katex #34). The three alerts with no fixed version (http-cache-semantics #23 and #27, braces #26) stay watched.
Intensity: standard — dependency changes in the docs site's build tooling (private, not shipped) and lockfile-only bumps in dev tooling; the final review before each merge at Fable 5.1
Confidence gate: medium
Isolation: one manual worktree lane outside the checkout (`security`, branch `fix/website-security-alerts` from `main` at `57c89f8a`, the root `node_modules` symlinked, the website's installed fresh in the lane)
Opened: 2026-10-06T13:10Z

## Frame (Phase 0)

**Outcome.** Every open Dependabot alert with a published fix is closed: five through Dependabot's PRs, four through
this run's pull request. The docs site still builds.

The alerts on 2026-10-06, before this run:

| Alert | Severity | Package | Where | In the published CLI | Fix |
|---|---|---|---|---|---|
| #32 | critical | proxy-addr < 2.0.8 | `website/` | no | PR #83 |
| #33 | high | source-map-js < 1.2.2 | `website/` | no | PR #80 |
| #31 | high | compression < 1.8.2 | `website/` | no | PR #81 |
| #24 | high | source-map-js < 1.2.2 | root, dev-only | no | PR #82 |
| #25 | medium | smol-toml < 1.9.0 | root, dev-only | no | PR #79 |
| #28, #29 | critical | tinypool < 2.1.2 (1.1.1 via `@docusaurus/core`) | `website/` | no | this run |
| #30 | medium | postcss-selector-parser < 7.1.6 (6.1.4 and 7.1.5) | `website/` | no | this run |
| #34 | low | katex < 0.18.2 (0.16.47 via mermaid) | `website/` | no | this run |
| #23 | high | http-cache-semantics (via `sigstore` → `make-fetch-happen`) | root | yes, sigstore's signing path | none published; watched |
| #27 | high | http-cache-semantics | `website/` | no | none published; watched |
| #26 | high | braces | `website/` | no | none published; watched |

Out of scope:
- any dependency outside these alerts;
- the three alerts with no fixed version;
- code changes beyond `website/package.json` and `website/package-lock.json`, unless a parent upgrade needs a config
  line, which the unit reports first.

**Deferral inbox (step 4).** No row names `website/package.json` or either lockfile.

## Dependabot PRs #79–#83

- **Review** (Fable 5.1, the final review before the merges, report `dependabot-reviewer-r1.md`): approve all five,
  confidence high.
  - Each lockfile diff changes only its named package's version, `resolved` URL and `integrity`. Every integrity
    matches `npm view`.
  - #81 adds one dependency range, `destroy` 1.2.0, which is already installed. #81 and #83 add `funding` metadata.
  - Each published source diff (`npm diff`) is its advisory's fix, with no install script, network call or new
    dependency.
  - Two Minors: smol-toml 1.9.0 returns null-prototype parse objects (its one consumer, knip, is dev-only), and the
    PRs that share a lockfile need merging in order.
- **Merged** at 13:02:36Z–13:03:20Z by rebase, in severity order: #83, #81, #80, #82, #79.
  - Each was approved with the verification summary.
  - Each merged under the admin bypass at its reviewed head (`--match-head-commit`). Every PR was one records-only
    commit behind `main` (the strict ruleset), with its own CI green.
  - `main` is at `57c89f8a`.
- **Push runs.**
  - The Pack signing rehearsal passed on `8295a830` and on `57c89f8a`; both root lockfile changes are in its `paths:`
    filter.
  - Docs site passed on `823712e7` and on `9c254eec`, the last website merge.
  - Intermediate CI runs were cancelled by the newer pushes. CI on `57c89f8a` is the one of record.
- **Alerts.** #24, #25, #31, #32 and #33 are closed.

## Plan (Phase 2)

`plan.md` beside this record: one unit, `u1-website-alerts`. **Plan gate:** execute now, on the maintainer's answer
above. **Contract census:** one unit, no peer.

## Build (Phase 3)

- 13:11Z: `u1-website-alerts` dispatched to an implementer at Opus 5.5 in the `security` lane.
- **CI of record for the Dependabot merges:** CI on `57c89f8a` finished green at 13:11Z.
- **u1-website-alerts.** DONE (report 13:22Z). Route 1, a parent upgrade, was closed for all four alerts:
  - `@docusaurus/core` 3.10.2 is the newest 3.x and pins `tinypool ^1.0.2`.
  - The cssnano 6 plugins Docusaurus 3.10.2 uses pin `postcss-selector-parser ^6`.
  - Every mermaid release through 12.1.0 pins `katex ^0.16.47`.

  So each took route 2, an `overrides` entry, checked against its consumer's calls and the package's changelog:
  - tinypool 1.1.1 → 2.2.0 under `@docusaurus/core` (#28, #29);
  - postcss-selector-parser 6.1.4 and 7.1.5 → one 7.1.6, a global entry, because the cssnano 6 node is shared by
    several paths (#30);
  - katex 0.16.47 → 0.18.10 under `mermaid` (#34). 0.18.11 is deprecated upstream.

  The evidence:
  - the built CSS is byte-identical;
  - all 24 pages are identical once the runtime chunk hash is normalized;
  - a pooled-worker build, forced on through a scratch config, passes on both tinypool versions;
  - a browser probe of the mermaid page, with math injected, renders identical MathML;
  - `npm audit` lists only braces and http-cache-semantics.

  Gates: `npm ci`, `npm run build`, `npm ls`, the docs tests (290 passed), lint, and the website's typecheck all exit
  0. `npm audit` exits 1, on the two watched alerts only.
- **The findings blocks.** Both reports' blocks were refused by the ledger: an unknown `evidence` key, and summaries
  over 300 characters. They were appended through `--stdin` in the ledger's grammar, same substance:
  - `review/1` and `review/2`, the Dependabot review's Minors;
  - `build/1`, a Warning: `http-cache-semantics` 4.3.0 was published on 2026-10-04. Its advisory still lists no
    patched version, but a lock refresh may close #23 and #27 once 4.3.0 is confirmed fixed;
  - `build/2` and `build/3`, Minors: no CHANGELOG line; KaTeX 0.18's renamed CSS classes.
- **Committed** as `f731896d`. The integrity of all four changed versions matches `npm view`, and none has an install
  script. Pushed; PR #84 opened as a draft at 13:23Z.
- **Prove, 13:24Z.** Dispatched in parallel, the security lens at Opus 5.5 (the dependency set), the final review at
  Fable 5.1, and the full local gate at Opus 5.5.
- **Security lens** (report 13:27Z): posted, no findings.
  - Each override's lower bound is its alert's first fixed version, and each upper bound stops at the next major.
  - Only four versions move, all upward and all from the registry. No vulnerable tarball is left in the lockfile.
  - The npm package ships only `dist`, and the root lockfile is untouched by #84. The Docs site job runs these
    packages with `contents: read` and install scripts off.
- **Final review at Fable 5.1** (report 13:29Z): approve, confidence high.
  - Route 1 was closed on the installed tree.
  - Each override is compatible with its consumer's calls:
    - tinypool's options and worker internals;
    - the cssnano 6 plugins never insert on a selector container;
    - katex's settings schema still holds mermaid's three options.
  - The global parser scope is justified.
  - Two Minors were ledgered: `review/3`, that no retirement condition is in the tree, and `review/4`, that the
    global key pins future consumers.
- **Full gate on `f731896d`** (test-runner, the `security` lane, alone, each gate once as written;
  `STAMITY_CLAUDE_BIN` unset; report 13:36Z): every gate passes.
  - The suite: 10,796 passed, none failing, 14 skipped. `test/docsPages.test.ts` passed 79 of 79. The Cursor, Copilot
    and Codex walks pass.
  - Coverage: no "does not meet" line.
  - `check`, knip and the leak gate pass.

  The lane's root `node_modules` is the main checkout's, installed before #79 and #82, so CI's fresh `npm ci` is what
  ran the bumped root tools.
- **PR CI on `f731896d`:** green on every leg, with the docs site's `Build` job.
- **`http-cache-semantics` 4.3.0** (`build/1`), checked by the orchestrator with `npm diff`: 4.3.0 changes only `Vary`
  matching (own-property lookups, `*` inside a list) and adds `status()`. It does not touch the `max-stale` handling
  GHSA-ch52-4w7c-c8xp names. A lock refresh would make GitHub close #23 and #27, because 4.3.0 is outside the
  vulnerable range, without proving the bug fixed. So the alerts stay watched, as the maintainer decided. Inbox row.
- **Ledger:** 7 rows, 0 open. 5 `rejected` with reasons, and 2 `deferred`, `build/1` and `review/3`, each with an
  inbox row in this run's dated block.

## QA checkpoint (2026-10-06)

Built with st-qa by name. Four rows were derived:
- the docs site's pages, the one visible surface;
- the two lockfiles, a config change: a clean install and run;
- the alerts, a security-adjacent change: nothing inside a fixed advisory's range remains.

`npm ci` always installs from scratch, so the upgrade over existing state is the same run as the clean install. Two
rows are auto-proven; two needed a person.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 3 | The docs site's pages look as before, the mermaid diagram included | In `website/` of an up-to-date checkout: `npm ci`, `npm run build`, `npm run serve`; open `/docs/working-with-stamity/` and one other page | The pages and the diagram look as before; no console error | M | 7 | accepted-unwalked · `6b9865ebe8790fdacd51c8ec951be4e248a7ba2d5dfbffe6690dd4a8613f79f9` |
| 4 | GitHub lists no alert this run fixed | Open the repository's Security tab, then Dependabot | Three open alerts, #23, #26 and #27; #24, #25 and #28–#34 closed | M | 1 | accepted-unwalked · `d79391b121c44f10fc55c376dc74690d22c487b330e8d2941f0d2d5f31f03885` |

Input hashes are the sha256 of the sorted `<path> <git hash-object>` lines at `f731896d`:
- row 3 over `website/package.json` and `website/package-lock.json`;
- row 4 over those two and `package-lock.json`.

Cited beside them, not as proof: the implementer's build comparison and browser render (row 3), and GitHub's alert
API at 13:46Z, which listed exactly #23, #26 and #27 open (row 4).

**Appendix: auto-proven rows.**

| # | Scenario | Risk | Evidence |
|---|---|---|---|
| 1 | The docs site builds from a fresh install of the new lockfile | M | Docs site push run 37472207604 on `f731896d`, success (`npm ci --ignore-scripts`, `npm run build`); PR #84's `Build` job; `test/docsPages.test.ts` 79 of 79 in the full gate on `f731896d` |
| 2 | The root's dev tools run on smol-toml 1.9.0 and source-map-js 1.2.2 | M | CI push run 37472207591 on `f731896d`, success: `npm ci` (`.github/workflows/ci.yml:263`), then `npm run knip` (`:348`), knip being smol-toml's one consumer |

**Sign-off** — the security alerts, 2026-10-06:

- [x] Every H row walked or auto-proven, and passing: no H row.
- [x] Every failing M row has a filed follow-up, linked: none fails.
- L failures are recorded, not blocking: none.
- Rollback: a revert pull request of `f731896d` for the overrides, or of #79–#83's merge commits for a single bump.
- Shippable: YES. No H row is accepted unwalked.

The maintainer's answer (2026-10-06): "Accept both unwalked (Recommended)". Rows 3 and 4 are recorded
`accepted-unwalked` with their input hashes.

## Close (2026-10-06)

- **The merge.** `main` was fast-forwarded from `57c89f8a` to `f731896d` under the admin bypass at 13:36:57Z, after PR
  CI passed. PR #84 reads MERGED at 13:36:58Z, with `f731896d` as its merge commit.
- **Push runs on `f731896d`:** Docs site 37472207604 and CI 37472207591 are both green. The signing rehearsal did not
  run: no file in its `paths:` filter changed.
- **Alerts.** GitHub closed #28, #29, #30 and #34 after the merge. Earlier it had closed #24, #25, #31, #32 and #33.
  Open: #23, #26 and #27, which have no fixed version.

## Change list for the next release's CHANGELOG section

This repository writes a release's section at its cut. This run merges without one, so the list is kept here.

- **Security**
  - Docs site build tooling: proxy-addr 2.0.8, compression 1.8.2 and source-map-js 1.2.2 (Dependabot #83, #81,
    #80); tinypool 2.2.0, postcss-selector-parser 7.1.6 and katex 0.18.10 through overrides (#84). Together with the
    next item, nine advisories close: Dependabot alerts #24, #25 and #28–#34.
  - Development tooling: smol-toml 1.9.0 and source-map-js 1.2.2 (#79, #82). Neither ships in the package.

## Proof block (2026-10-06 — five Dependabot PRs and #84 merged to `main`, without a release)

- **Candidate and merges.**
  - Dependabot #83, #81, #80, #82 and #79 merged by rebase at 13:02:36Z–13:03:20Z, under the admin bypass at their
    reviewed heads (`main` at `57c89f8a`).
  - #84, one commit `f731896d` over `57c89f8a` (+43 / −211 in the two website files), was fast-forwarded at
    13:36:57Z.
  - Both were on the maintainer's answer "Merge five, fix four more (Recommended)". No tag, no publish.
- **Build isolation.** One manual worktree lane, `security`. One unit; nothing in parallel.
- **Gates.** The gate of record for the merged tree is the full gate on `f731896d`, which is `main`'s tree; this run's
  records add only `.stamity/` files.

  Gate results (the full gate of record on `f731896d`):

  | Gate | Command | Result |
  |---|---|---|
  | build | `npm run build` | pass |
  | lint | `npm run lint` | pass (the one known warning, `content/skills/st-verify/scripts/spec-plan-coverage.mjs:1`) |
  | typecheck | `npm run typecheck` | pass |
  | suite | `env -u STAMITY_CLAUDE_BIN npx vitest run` (JSON reporter) | pass: 10,796 passed, none failing, 14 skipped; `docsPages` 79 of 79; the Cursor, Copilot and Codex walks pass |
  | coverage | `env -u STAMITY_CLAUDE_BIN npm test -- --coverage` | pass: no "does not meet" line |
  | drift | `node dist/cli.js check` | pass: drift clean |
  | unused code | `npx knip` | pass |
  | leak gate | `node scripts/leak-gate.mjs` | pass: 0 hits for 19 rules across 1,745 files |
  | PR CI, #84 | every leg, with the docs site's `Build` job | pass |
  | push runs, `f731896d` | CI 37472207591, Docs site 37472207604 | pass |
  | push runs, the Dependabot merges | CI 37467824868 on `57c89f8a`; Pack signing rehearsal 37467801155 and 37467824723; Docs site 37467732606 and 37467778145 | pass |

- **Review verdicts.** The record declares `Confidence gate: medium`.

  Review verdicts, per round (each round a fresh spawn):

  | Pass | Round | Model | Verdict | Confidence | Where |
  |---|---|---|---|---|---|
  | dependabot, the five PRs, the final review before their merges | 1 | Fable 5.1 | approve | high | record.md, Dependabot PRs section |
  | u1-website-alerts, the final review before #84's merge | 1 | Fable 5.1 | approve | high | record.md, Build section |

- **The specialist pass.** The standard tier ran the security lens on the dependency set, at Opus 5.5. It posted 0
  findings.
- **Security.** Nine advisories closed. The three left have no fixed version: #23 (in the CLI through sigstore's
  signing path), #26 and #27. The `http-cache-semantics` 4.3.0 lead was checked and is not the fix, so it is watched
  through an inbox row.
- **QA checkpoint.** 4 rows: 2 auto-proven, and 2 accepted unwalked with their input hashes, on the maintainer's
  answer. No H row. Shippable: YES.
- **Decisions trace.** The maintainer's answers (2026-10-06): "Merge five, fix four more (Recommended)", then "Accept
  both unwalked (Recommended)". The orchestrator closed the seven ledger rows with the reasons in `ledger.jsonl`.
- **Ledger.** 7 rows, 0 open. 5 rejected with reasons; 2 deferred (`build/1` and `review/3`), each with an inbox row.
- **Artifacts touched** (path, then its owner):

  | Path | Owner |
  |---|---|
  | `package-lock.json`, `website/package-lock.json` (#79–#83) | Dependabot, reviewed at Fable 5.1 |
  | `website/package.json`, `website/package-lock.json` (#84) | the implementer |
  | `record.md`, `plan.md`, `ledger.jsonl`, `.stamity/inbox.md` | the orchestrator, through the file tools and the ledger CLI |

- **Per-action attribution.**

  | Role | Model | Tool and surface | Outcome |
  |---|---|---|---|
  | reviewer, the Dependabot PRs | Fable 5.1 | read-only, with precomputed diffs and registry data | approve, high |
  | implementer | Opus 5.5 | the `security` lane, `website/` installs and builds | the four alerts closed by overrides |
  | security lens | Opus 5.5 | read-only | 0 findings |
  | reviewer, #84 | Fable 5.1 | read-only, the installed tree | approve, high |
  | test-runner | Opus 5.5 | the `security` lane, each gate once | the full gate above |
  | orchestrator | the session, Opus 5.5 | approvals, merges, `stamity ledger`, the question tool, st-qa | this close |

- **Process slips, recorded:**
  - The two verdict reports' findings blocks did not parse. The Dependabot review used an unknown `evidence` key; the
    implementer's Warning ran past 300 characters. Both were appended through `--stdin` with the same substance.
  - The local full gate ran the root's old dev tools, because the main checkout's `node_modules` predates #79 and #82.
    CI's fresh install covers it.
- **Recommended next step.** Package 19 in a fresh session. Its kickoff now starts with the Claude check's diagnosis.
