# Package 14 — Docs rewrite, README, client-polish close

Status: **in progress** — opened 2026-09-16T12:22Z as one session on the kickoff of 2026-09-16 (the
maintainer's re-sequencing after the double-check of the roadmap-refactor proposal: user-facing words
first, then the benchmark with 1.9.0, then the review-and-proof package with the audit cycle, then
everything waiting on other people). Every decision below was taken by the maintainer through the
question tool, one per turn, with the recommended option first and a declared default.

## Baseline, re-verified at intake (2026-09-16T12:10Z–12:22Z)

- Released 1.8.0: annotated tag `v1.8.0` → `e79dcf0` ✓; `@zomarit/stamity@1.8.0` published 2026-09-16
  08:03Z with provenance (registry version time 08:05Z); `dist-tags.latest` 1.8.0 ✓
- `main` = `origin/main` = `75aa866`, working tree clean ✓; open pull requests 0 ✓
- The private currency helper reports zero stale carriers at v1.8.0 ✓
- Product tree: `src/`, `content/`, `docs/`, the root pages and `llms.txt` are byte-identical between
  `e79dcf0` and `75aa866` — the diff since the tag is record commits, dependabot bumps and the rehearsal
  pin (PR #41); the site's `react` moved 19.2.8 → 19.3.0. So "verified against the 1.8.0 tree" and
  "verified against `main` at the branch point" name the same product bytes.
- Release run of record: run 30 (composed with runs 29 and 27 under SET-v7's incremental rule); no eval
  call is planned in this package because no measured input moves.
- Learnings read: all seven under `.stamity/learnings/` (the commondir race, Codex hooks, the record
  re-sync, the local gate weaker than CI, surface pins that drift, the leak gate over `.stamity/`, the
  dogfood sync).
- Package branch: `docs/package-14-rewrite` from `75aa866`.

## Disagreements with the kickoff's frozen state — reported before the first question

1. **The docs site does not deploy on a merge.** `.github/workflows/docs-site.yml` builds on a push to
   `main` touching `docs/**`, `website/**` or `README.md`, and deploys only on a `workflow_dispatch` with
   `deploy: true` or on a successful release run of a real `v*` tag (the deploy job's `if`, :94–97). So
   "the docs go live on merge" means one armed dispatch after the merge; no release is needed.
2. **All fourteen stamped pages carry the 1.8.0 cut stamp**, not eleven. The consequence stands: at least
   one page keeps it until a cut moves `RELEASE_CUT_DATE`.
3. **Three currency defects found on re-read**, none a shipped product byte: `docs/measurements.md`'s
   "run of record" still names run 24 (the 1.7.0 run) through the literal `RUN_OF_RECORD_PATH` in
   `src/cli/docs/measurements.ts:87`, held by `test/cli/docs/measurements.test.ts` — the 1.8.0 run of
   record is run 30, and the release checklist's refresh line covers the merge-ready snapshot but not this
   pin; `docs/doctrine.md:84` cites run 24 the same way; `.stamity/runs/2026-09-14_package-11/record.md:3`
   still reads `in progress`, which is why the measurements snapshot lists that record as such. All three
   are fixed in this package (the generator's prose template and pin, the doctrine line inside the
   rewrite, the record's status line).

## Step 0 — the records (2026-09-16T12:22Z–13:05Z; no product change)

- The private layer: a decision row of 2026-09-16 sets the order (Package 14 next; Track B after it and
  before Package 12, with 1.9.0) and supersedes in part the earlier row that had deferred Track B past
  Package 12; the maintainer's directive of 2026-09-16 filed as executing with their three instructions
  quoted; the 2026-09-16 proposal's status set to superseded in part with the double-check's corrections;
  the kickoff saved as the next-session prompt; a continuity row; committed and pushed.
- Local roadmap (git-excluded): a new 2026-09-16 banner ("Next: Package 14, then Track B (1.9.0), then
  Package 12, then the manually triggered audit"); the Package 14 section before Package 12 with the scope
  table, `todo.md`'s two items copied in, the seven blocks and the decisions; Package 12's "Depends on"
  rewritten and 12D given the boundaries-table recheck and the `todo.md` deletion; L1 boxes 1–3 and L2
  annotated "owned by Package 14"; track B's and old Package 7's notes re-sequenced; package ids unchanged.
- The time-bound carry: the artifacts of pack-signing rehearsal runs 34758487370 (expiring 2026-09-20),
  35022756533 and 35086254315 archived to the public evidence release `evidence-archive-2026-09-15` by the
  PR #37 procedure — one working-tree archive per run (`public-pack-signing-rehearsal-<run>.tar.gz`, its
  pointer published beside it), each screened for credential shapes (none), downloaded back through
  GitHub, verified against its pointer and restored byte-identical; pointers and a README committed at
  `4e8789f` under `.stamity/runs/2026-09-14_package-11/evidence/`; leak gate and repository hygiene green.
  Delegated to one sub-agent in its own worktree; merged fast-forward onto the package branch.

## Decisions applied up front

1. **Doctrine in the docs** → option 1: `docs/doctrine.md` stays the plain-words "why" page, rewritten;
   no pin moves; the deferral sentence stays true; its run-24 citation is fixed.
2. **The marketing exclusion** → option 1: kept; the README states technical claims only and goes
   proof-led on 11C's measurements; the boundaries row stays.
3. **Human QA** → the maintainer answered in their own words: "you got my approval". Read as the sign-off
   given up front. The session prepares the walk kit (fixtures, the form, a step list) and offers the
   90-minute walk at the QA checkpoint block 6 already schedules as the human decision; if the walk is
   performed the row reads from it, otherwise the row is recorded as signed off and not performed, a
   third time, with 11D3's acceptance line annotated as unmet.
4. **1.8.1** → option 1: no release. The docs and README go live on GitHub and, after one armed dispatch,
   on the site; the npm README waits for 1.9.0; the measurements snapshot refreshes at the next cut. If
   block 5's re-read finds a code defect, one further question.
5. **Page scope** → (pending)
6. **The style contract** → (pending; `style-contract.md` beside this record)

## Contract census — before the fan-out

`contract-census.md` beside this record (read-only, 2026-09-16). The single writers it fixes:
`src/cli/docs/llmsIndex.ts` plus the regenerated `llms.txt`; `website/sidebars.ts`; the README map
rows; the docsPages pins move only when a page's content forces them and are recorded here per pin.
The census's traps are handed to every writer with their page brief.

## Blocks 4 (L1 box 2) and 5 (L2) — record closes (2026-09-17T00:10Z)

A read-only verifier read the 1.8.0 tree for the evidence each box needs; nothing was built, because
each item had shipped already and the roadmap had not been ticked.

- **L2, all three boxes: present.** (1) The Codex/Copilot always-on budget: the on-demand rule delivery
  shipped in 1.8.0 (`src/types/manifest.ts:216` defaults it on); the ceilings `ALWAYS_ON_BUDGET_LINES`
  read cursor 95 · claude 95 · copilot 95 · codex 407 (`src/content/charter.ts:184–215`), asserted by
  `test/corpus/invariants.test.ts` and disclosed on `docs/capability-matrix.md:42–97`; Codex's always-on
  file renders the charter body once (`src/adapters/codex.ts:1061`) and its omission notice still names
  any rule the 32 KiB budget would drop (`codex.ts:1135–1155`); the ratchets were ratified by the
  maintainer's decision row of 2026-09-16. (2) The model ladder is operator-facing through `stamity
  config list` and `config get <model-class>` (`src/cli/commands/config.ts:71–121, 224–376`), with
  Copilot's effort-axis omission disclosed on the capability matrix; the Copilot adapter emits a real
  repository-hooks document (`src/adapters/copilot.ts:73, 151, 243, 286`) rather than scripts the client
  cannot run; `hookSpecificOutput` is a first-class field of the portable runner
  (`src/hooks/portableRunner.ts:85–123`); shipped with 10A in 1.7.0
  (`.stamity/runs/2026-09-10_package-10/integration.md:127–132`). (3) Every emitted manual fallback names
  its client (`copilot.ts:297`; `codex.ts:371–378, 406–413`; `src/emit/capabilityMatrix.ts:543`).
  No defect found on re-read, so no code change and no release follows from this block. The roadmap's
  L2 heading and its three boxes are ticked with these locators.
- **L1 box 2: closed as a record.** Both North-Star metrics are defined and the rule published
  (`docs/measurements.md:19–91`; the snapshot `evals/measurements/merge-ready-2026-09-15.json`;
  `scripts/merge-ready-rate.mjs`); the merge-ready rate is first-measured (5 of 7 runs, 0.714); weekly
  active installs are NOT measured and the page says so in as many words (`docs/measurements.md:107–111`),
  with npm downloads published as a labelled proxy (`evals/reach/npm-downloads-2026-09-14.json`). The
  verifier called this "partly present" on the reading that both axes should carry a number; the
  package reads it as the disposition the boundaries table already records — no telemetry is invented —
  and ticks the box with that wording. The no-gaming pairing constraint is on the same page
  (`:113–118`). L1 box 1 (the README) ticks when the README merges; box 3's three marketing items stay
  open by decision 2.

## Phase 3 — dispatch log

- 13:10Z Block 1 research (one researcher, primary sources read the same day) → `style-contract.md`; the
  contract census (one read-only researcher over the suites, the index, the sidebar and the pages) →
  `contract-census.md`. Two factual amendments to the contract before it was put to the maintainer:
  sidebar groups and slugs stay (the draft had moved pages across groups), and the verb/touchpoint rows
  of the glossary keep README's pinned `## Commands` heading. Decision 5 → option 1 (all fourteen pages
  plus README, daily-use first); decision 6 → approve.
- 13:12Z The measurements page's run-of-record pin moved to run 30 through its prose template
  (`src/cli/docs/measurements.ts`; the figures derived by the suite from the RESULTS file instead of
  pinned; the page regenerated; full gate with coverage green; leak gate green) — cherry-picked as
  `514c369`. The Package 11 record's status line closed (`44d7c08`).
- 13:20Z Fourteen page writers dispatched, one per page in its own worktree, each with the common
  writer brief (`writer-brief.md`) and a page note (`page-notes/`). Every one of them was terminated by
  the account's usage cap before its first edit (the model route's credits ran out); nothing was lost
  because nothing had been written. Found on the way: a fresh worktree is cut from `main`, not from the
  package branch, so the briefs were not in it — every writer now starts with
  `git reset --hard docs/package-14-rewrite`.
- The maintainer re-authenticated ("limit reset, continue, im going to sleep"); from here the session
  runs unattended. Writers re-dispatched at `claude-opus-5` — the implementer tier under the existing
  model rule, which keeps `claude-fable-5-1` for the roles that find and judge — all fourteen at once,
  the daily-use pages and README first and the seven governance pages a minute later, and the read-only
  verifier for the L1 and L2 record closes beside them.
