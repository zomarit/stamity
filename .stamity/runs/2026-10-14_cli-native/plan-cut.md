# The 1.15.0 cut's remaining checklist lines — in-flow units

Written 2026-10-15 by the orchestrator, from `.github/release-controls-checklist.md` ("Per-release record currency": a
minor runs every line) and the 1.14.0 cut's plan (`.stamity/runs/2026-10-11_release-1-14-0/plan.md` on the `records`
branch, units `c4`–`c7`). The release candidate is `4e892337` (the release tree the eval run 47 measured, PASS). The
units run in the lane `cut` (local branch `lane/cut`, worktree `.stamity-worktrees/stamity/cut`, based on `4e892337`).
Writers run one at a time in that lane; the four re-attestation passes write nothing.

Lines already settled at this cut: the hook latency table (the sixth line, run on the candidate), the
metadata and admin-roster read (the third line), the cloud-container digest re-read (current, `ci.yml` unchanged).

Landing order (two pushes to `main` around one `records` publish):
1. `main` ← the candidate, `c7a`, `c5` (the run of record still names run 45, which the `records` branch holds).
2. `records` ← run 47's four exported files and `c67`'s merge-ready snapshot (`node scripts/records.mjs commit`).
3. `main` ← `c67` (the snapshot pin and every run-of-record surface), its changelog line naming the `records` commit
   of step 2. Then the tag, whose `records:` line is that commit.

### c4a to c4d — the hand pages re-attested (read-only, four reviewers in parallel)

| Field | Content |
|---|---|
| `id` | c4a, c4b, c4c, c4d |
| `requirements` | the checklist's fourth line: every hand page — the bucket `test/docsPages.test.ts` declares (`HAND_PAGES`), plus `GOVERNANCE.md` — re-attested claim by claim against the candidate tree |
| `files` | none written. Read: `c4a` `docs/enterprise-forks.md`, `docs/enterprise-quickstart.md`; `c4b` `README.md`, `GOVERNANCE.md`, `SECURITY.md`, `docs/security-mapping.md`, `CONTRIBUTING.md`, `docs/working-with-stamity.md`; `c4c` `docs/packs-and-trust.md`, `docs/workspaces.md`, `docs/customization.md`; `c4d` `docs/troubleshooting.md`, `docs/getting-started.md`, `docs/migration.md`, `docs/doctrine.md`. A hand page in no group is a finding of the reviewer that notices it. |
| `interfaces` | Each claim a page makes about the tree — a verb, flag, config key, path, count, default, refusal, emitted file, version, a control or a residual — is checked against the tree at `4e892337` and against what changed since `v1.14.0`. A claim the tree contradicts is a Warning; a stale but harmless detail is a Minor; a claim that would mislead an operator into an unsafe or destructive step is a Critical. Every finding cites the page line and the tree line. The stamps, the date constants, the run of record and the merge-ready figure are `c5`'s and `c67`'s and are not findings. |
| `depends_on` | none |
| `verify` | none (a verdict pass) |

### c7a-size-exception — the run artifact's summary admitted for the 1.15.0 window

| Field | Content |
|---|---|
| `id` | c7a-size-exception |
| `requirements` | the checklist's eval line (the run artifact on the `records` branch); `scripts/repo-hygiene.mjs`'s exact-path rule |
| `files` | `scripts/repo-hygiene.mjs` (one `LARGE_FILE_EXCEPTIONS` entry with its reason, and the comment above the map), `test/ci/repoHygiene.test.ts` (the pinned list) |
| `interfaces` | The entry names `evals/runs/2026-10-15-run-47/summary.json` exactly (5,569,796 bytes as exported): run 47, the full 1.15.0 measure, PASS, retiring at the 1.15.0 close's archive step as the 1.14.0 window's three did. No other path, no ceiling change. The `records` branch's own workflow runs `main`'s hygiene script over a `records` push, so this lands on `main` before the publish. |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/repoHygiene.test.ts` · `node scripts/repo-hygiene.mjs` · `npm run lint && npm run typecheck` |

### c5-pages-and-stamps — the re-attestation rows applied, the sample refreshed, every hand page restamped

| Field | Content |
|---|---|
| `id` | c5-pages-and-stamps |
| `requirements` | the checklist's fourth line |
| `files` | the hand pages `c4a`–`c4d` read, as their signed-off rows need; `SECURITY.md` (the open alerts, read live at the edit: `gh api repos/zomarit/stamity/dependabot/alerts?state=open`); `docs/troubleshooting.md` (the `stamity check` sample from a real 1.15.0 run of the lane's built CLI in a throwaway repository made with `mktemp -d` outside every checkout, deleted afterwards); `test/docsPages.test.ts` (`RELEASE_CUT_DATE` to 2026-10-15 with a dated comment in the form the file already uses, and any other date constant the restamp moves) |
| `interfaces` | (1) Every signed-off `c4` row applied or answered with reasons; nothing a row did not ask for. (2) SECURITY.md names every alert open at the edit, each with its package, its manifest and "no patched version". (3) Every hand page restamped `verified against the tree at the 1.15.0 release cut (2026-10-15)` in the form its header already has; `GOVERNANCE.md` dated. README's run-of-record and merge-ready lines stay as they are (`c67`'s). (4) Commits split by concern: the re-attestation fixes; the sample; the restamp with the constants. |
| `depends_on` | c4a–c4d (their rows signed off by the orchestrator), c7a |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/cli/docs` · `npm run lint && npm run typecheck` |

**Split at 13:28Z, after `c4a`–`c4d` returned 21 rows (`reattest/1`–`reattest/21`), into three writers** so the
rows fit the size ceiling: `c5a` and `c5b` in parallel lanes on disjoint files, then `c5r` once `c5a`'s commits are
picked onto `lane/cut`. Every row is applied (a stale claim under a fresh stamp is a false attestation); the
network-reach sentences on README, getting started and packs-and-trust take SECURITY.md's own wording at the candidate
(its client-CLI start for the model lists and `STAMITY_NO_CLIENT_PROBE=1`), so the three pages say one thing.

| Writer | Lane | Files | Rows |
|---|---|---|---|
| `c5a-pages` | `cut-a` (local `lane/cut-a` on `62d6b8b0`) | `README.md` (not its run-of-record line or merge-ready figure), `SECURITY.md` (with the open alerts read live), `CONTRIBUTING.md`, `docs/security-mapping.md`, `docs/packs-and-trust.md`, `docs/workspaces.md` | `reattest/1`–`reattest/8` |
| `c5b-pages-and-sample` | `cut` (`lane/cut`) | `docs/troubleshooting.md` (with the real 1.15.0 `check` sample), `docs/getting-started.md`, `docs/doctrine.md` (not its run-of-record sentences), `docs/enterprise-forks.md`, `docs/enterprise-quickstart.md`, `.github/client-contracts.md`, `src/cli/commands/check.ts` (the row text only) with the test that pins it, `scripts/upstream.mjs` (its header and usage wording only) | `reattest/9`–`reattest/21` |
| `c5r-restamp` | `cut`, after `c5a` is picked | every hand page and `GOVERNANCE.md` restamped; `test/docsPages.test.ts` (`RELEASE_CUT_DATE`, with its dated comment) | — |

Sign-offs (the recommended option each): `reattest/9` — fix the page and `check`'s row text that carries the same
sentence (`src/cli/commands/check.ts`, not an eval input: run 47's `inputs.json` hashes no `src/cli/` file);
`reattest/13` — `.github/client-contracts.md` joins `c5b`'s files and its two stale claims are corrected;
`reattest/19` — the forks page and the script's own header and usage text say the lane reads its configuration from
the checkout it runs in (wording only; the lane's behaviour does not change here).

### c67-measurements-and-run-of-record — the merge-ready snapshot, its pin, and every page that names the run of record

| Field | Content |
|---|---|
| `id` | c67-measurements-and-run-of-record |
| `requirements` | the checklist's fifth line and its eval line; REQ-PROVE-020, REQ-PROVE-033 |
| `files` | `evals/measurements/merge-ready-2026-10-15.json` (new, written by `node scripts/merge-ready-rate.mjs --write`; a record, published to `records`, never committed to `main`); `src/cli/docs/measurements.ts` (`MEASUREMENT_SNAPSHOT_PATH` only); `docs/measurements.md` (re-rendered); `evals/run-of-record.json`; `README.md` (the run-of-record line and the merge-ready figure and link); `docs/doctrine.md`; `.github/release-controls-checklist.md` (the run paragraph); `evals/SET-v7.md` (one dated paragraph); `docs/specs/prove-behavior-and-value.md` (a dated amendment to REQ-PROVE-020); `CHANGELOG.md` (the 1.15.0 eval line, written last, after the `records` publish, linking the evidence at that commit) |
| `interfaces` | Every number, status and case id is read from run 47's exported `RESULTS.md` (`evals/runs/2026-10-15-run-47/`), never typed from memory: run 47 is a full baseline (no composition), PASS, so no surface carries a FAIL-baseline disclosure and `exception` stays `null`. The snapshot is written once and copied byte for byte to the publishing checkout. Mirrors the 1.14.0 cut's `bf3d10bf`. |
| `depends_on` | c5; run 47 exported; the `records` publish for the changelog line |
| `verify` | `npx vitest run test/evals test/cli/docs/measurements.test.ts test/docsPages.test.ts test/ci/repoHygiene.test.ts` · `npm run test:records` · `node scripts/repo-hygiene.mjs` · `node scripts/leak-gate.mjs` · `npm run lint && npm run typecheck` |

### c7r-retire-size-exception — the 1.15.0 window's size exception retired at the close (added 2026-10-15, after the publish)

| Field | Content |
|---|---|
| `id` | c7r-retire-size-exception |
| `requirements` | `scripts/repo-hygiene.mjs`'s exact-path rule and its comment ("an entry buys one retention window and retires at the release close that ends it"); `c7a`'s own interfaces cell (retiring at the 1.15.0 close's archive step) |
| `files` | `scripts/repo-hygiene.mjs` (the run 47 entry removed; the comment's 1.15.0 window paragraph becomes its retirement record, in the form the 1.14.0 window's paragraph already has), `test/ci/repoHygiene.test.ts` (the pinned list empty; run 47's summary joins the retired paths the case stages and refuses) |
| `interfaces` | Mirrors the 1.14.0 close's `41b1899a` for these two files (`git show 41b1899a -- scripts/repo-hygiene.mjs test/ci/repoHygiene.test.ts`). The facts the comment records: run 47's public summary compacted on the `records` branch at `22fe89afa03d3014eda6add87e8369865b8c655c`, from 5569796 to 94448 bytes, beside an `ARCHIVE.json` pointer into the `evidence-archive-2026-10-15` release (the archive `public-2026-10-15-run-47.tar.gz`, 655332 bytes, packed from the `records` commit `eb3135d2`, verified byte for byte). No ceiling change, no other entry. |
| `depends_on` | the `records` publish `22fe89af` (lands before this, so the `records` branch's workflow, which runs `main`'s script, never sees the full summary without its exception) |
| `verify` | `node scripts/records.mjs restore` (the records at `22fe89af`), then `npx vitest run test/ci/repoHygiene.test.ts` · `node scripts/repo-hygiene.mjs` · `npm run test:records` · `node scripts/leak-gate.mjs` · `npm run lint && npm run typecheck` |
