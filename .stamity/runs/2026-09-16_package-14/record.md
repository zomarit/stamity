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
- 2026-09-17T00:05Z–01:45Z The fourteen writers returned, each with its report (opening sentences,
  claims re-attested and corrected with sources, pins kept, cross-page notes, gates); each page was
  cherry-picked onto the package branch as it arrived, in this order: workspaces (229→347 lines, 5
  corrections), doctrine (171→205, 3 — run 30 cited; the always-on split restated; "eight rules
  dropped" removed, 0 are dropped today), GOVERNANCE (121→182, 4), migration (282→377, 5; keeps the
  release-cut stamp), security-mapping (205→276, 3), getting-started (272→333, 7), customization
  (293→370, 7), troubleshooting (161→226, 4), working-with-stamity (150→150, 3; the spine heading
  renamed with its CSS selector in the same commit), CONTRIBUTING (232→293, 6; took the CI lane names
  from getting-started), packs-and-trust (348→423, 4; the armed-verifier case confirmed), SECURITY
  (271→284, 2), README (157→157, 2 — proof-led; the false "Copilot takes no hook configuration"
  claim corrected against `src/adapters/copilot.ts:73` and the capability matrix), enterprise-forks
  (781→873, 9). No writer needed a test pin moved. Every writer ran the docs suites, the leak gate and
  lint green in its worktree. Their cross-page findings are collected in `editor-notes.md`.
- Two defects in a generated page's prose template, found by the troubleshooting writer and fixed as
  their own units through `src/cli/docs/cliReference.ts` with census tests: `CLEAN_ERROR` described a
  "part-way removal" where both throw sites are a declined or unaskable confirmation before anything
  is removed (`src/cli/commands/clean.ts:156, :168`); `INTEGRITY_ERROR` described only the drift
  family of its three producers (the pack trust gates and the write-safety refusals were unnamed).
- Carried out of this package, on purpose (a `content/` byte moves a measured input):
  `content/agents/stamity-creator.md` says a skill override is projected under the directory name it
  was saved as; the code projects under the replaced skill's directory and spec name
  (`src/emit/skillsProjection.ts:249–270`). It goes to the next case pass with the two set residues.
- 01:50Z Integrated gate on the fourteen pages before the editor's pass: lint, typecheck,
  `npm run test -- --coverage` (211 files, 8,494 passed, 3 skipped, no per-file floor missed), leak
  gate 0 hits; the site's typecheck and build green (no broken route between the rewritten pages).
  The editor's cross-page pass dispatched (voice, terms, the glossary, the index descriptions and
  README map rows derived from each page's opening, the sidebar's daily-use order).
- 02:20Z The editor returned two commits (one vocabulary and one voice across the fourteen pages;
  one reading order for the guides and index lines derived from the openings): the glossary of fifteen
  rows at the end of getting-started; the Guides sidebar in daily-use order (customization,
  troubleshooting, workspaces, packs-and-trust, enterprise-forks, security-mapping) with README's map
  and `llms.txt` in the same order; twelve index descriptions re-derived from the pages' openings;
  Copilot's `.github/hooks/stamity.json` added to SECURITY's hook caveat beside the pinned literals;
  about twenty-six sentences across six pages brought under the contract. Cherry-picked; the candidate
  is `be27e0c` (28 commits on `main`, every one DCO-signed). Draft PR #42 opened so CI's legs run
  beside the reviews.
- 02:25Z QA harness at the candidate (`node scripts/qa/run.mjs --site website/build --sha be27e0c`,
  hooks included): H1a passed (Claude Code 2.1.273, one call denied and one allowed); H2 passed — the
  structural checks hold on every built page and the scanner reports no violation; H3a–H3d passed at
  375 and 1440 in light and dark; H1b, H1c, H1d not-run for the reasons the 1.8.0 form records (Codex
  exec loads no project hook layer headlessly; no Cursor or Copilot CLI binary on this machine). The
  evidence file is committed once the reviews settle, because a page change reopens H2 and H3 by hash.
  Two reviewers dispatched over the candidate (the daily-use pages and README; the governance pages
  with a security lens and the two template fixes), each reading the diff against `75aa866`.
- 02:50Z CI on PR #42 at `be27e0c`: every pull-request check and both Linux legs green; **the Windows
  leg red** on `test/docsPages.test.ts` › SECURITY.md › "holds the in-process check's disclosure to
  the call graph, both ways". Root cause in the test, not the page: `referencesTo()` (`:846–859`)
  compares `relative(REPO_ROOT, file)` — native separators on Windows — with the POSIX literal
  `src/tools/allowlist.ts`, so on Windows the declaring file is never stripped of its own declaration,
  counts as a caller, and the inverse branch rejects the page's true sentence "it has no production
  caller". The 1.8.0 page did not contain that exact phrase, which is why the defect was latent through
  every earlier Windows run. Fix routed to the governance fixer as W4: normalise the path at the
  comparison seam, as the learning on the local gate prescribes; the page stays as written.
- 02:45Z Review round 1, governance half: request-changes, no Critical; W1 SECURITY miscounts the
  release proofs ("all three" where the workflow states two and GOVERNANCE says both); W2 the published
  TypeScript API facts were dropped from packs-and-trust with no new home; W3 the currency-date pin now
  rests on the migration page alone and its comment describes a bucket that no longer exists — the
  re-attestation date is made an enforced pin; M1–M8 (one spelling; the PASS status held to the
  artifact; the INTEGRITY_ERROR census tolerant of comment-only mentions and pinning both write-refusal
  producers; GOVERNANCE's hygiene-scan event condition; CONTRIBUTING's narrowed re-open trigger; the
  measurements page naming the SET-v6 scoring rule over the SET-v7 set as the currency record does).
  All routed to one fixer; the daily-use half's review is still out.
- 02:30Z The full gate chain at the candidate `be27e0c` (omitted from the log above when it ran, which
  the daily-use review then flagged as an evidence gap): lint and typecheck clean; `npm run test --
  --coverage` 211 files, 8,496 passed, 3 skipped, no per-file floor missed; build within both size
  budgets; knip clean; `node dist/cli.js check` at the root "all green — nothing to do", drift clean;
  leak gate 0 hits over 1,468 files. The same chain runs again at the fixed candidate.
- 03:05Z Review round 1, daily-use half: request-changes, no Critical; W1 the getting-started
  `.stamity/` inventory omits Copilot's coding-agent MCP document (`.stamity/mcp/copilot-repo-settings.env`,
  `src/mcp/emit.ts:174–180`); W2 the evidence gap above; six Minors (a customization sentence that
  contradicts its own sample; git listed as a prerequisite while denied as one; a stale APM count in
  `docs/specs/apm-canonical-distribution.md:54`; SECURITY's "250 000-byte" where the producer counts
  characters — pinned, so routed to the governance fixer with the test; the migration page's re-open
  comment silent on why its stamp form is load-bearing; the `cleanup` bullet on the 150-line workflow
  page as one run of five behaviours). Routed to a second fixer, file-disjoint from the first.
- 03:30Z Fixer round 1, daily-use half, returned four commits (cherry-picked): the `.stamity/mcp/` row
  for Copilot's coding-agent MCP document; the customization sentence matched to the output it
  describes (a `patches` row prints inside the `shadowing` block); "Recommended: a git repository";
  the spec's APM row corrected to this tree with the 2026-09-09 probe's numbers kept on the record;
  the migration page's re-open comment now says its stamp form is load-bearing for the suite's
  `RELEASE_CUT_DATE`, repacked so both comments still sit within the six-line window. Answered rather
  than applied: the `cleanup` bullet on the workflow page stays a paragraph — every prose block on the
  150-line page is already at its wrap floor, so a five-item list costs four lines the page cannot
  recover without a page-wide reflow; recorded, not done. One more contradiction the fixer found
  (getting-started still says nothing requires git, where `worktree` refuses without it) goes to a
  one-sentence unit.
- 03:55Z Fixer round 1, governance half, returned two commits (cherry-picked). W1 answered, not
  applied: `.github/workflows/release.yml:153–157` enumerates three proofs (a `v*` tag; the tag names
  the version `package.json` declares; the tagged commit reachable from `origin/main`), each with its
  own failure path in `Resolve version`; the header comment the reviewer read collapses the first two;
  SECURITY's "all three" stands and GOVERNANCE now enumerates the same three. W2 fixed: the published
  TypeScript API (declarations shipped, `createEngine` and `SetupManifest` exported, the `signPack`
  route) on packs-and-trust; the declaration graph, the two Knip exceptions and the packed-consumer
  `skipLibCheck: false` gate on CONTRIBUTING — each claim verified. W3 fixed: the re-attestation date is
  an enforced pin (`REATTESTATION_DATE = "2026-09-16"`; every hand page must carry one of the two dates;
  falsification proved). W4 fixed: `referencesTo()` normalises the separator, with the Windows failure
  named. M1 fixed, M2 answered (`authorization` is unanimous across the hand pages), M3–M8 fixed, and
  M9 (bytes → characters) fixed with the byte pin kept for the stdin row that counts bytes. The final
  candidate is `022018f`; pushed; the gate chain, the QA harness, CI and review round 2 (both halves)
  run on it together.
- 04:15Z At the final candidate `022018f`: lint and typecheck clean; `npm run test -- --coverage` 211
  files, 8,496 passed, 3 skipped, no per-file floor missed; build within both size budgets; knip clean;
  `node dist/cli.js check` all green, drift clean; leak gate 0 hits over 1,468 files; the site's
  typecheck and build green. QA harness at `022018f`: H1a passed (Claude Code 2.1.273); H2 passed on
  every built page; H3a–H3d passed; H1b, H1c, H1d not-run (the same client reasons as at 1.8.0; their
  inputs unchanged). Evidence committed as `.stamity/evidence/qa-022018f….json` (`e845b5e`); the human
  QA form filed privately with the rows bound to their hashes and the maintainer's up-front sign-off of
  decision 3 recorded as a sign-off without a performance, the third time, with track D3's acceptance
  line noted as unmet. Branch pushed; CI runs on the head; review round 2 out on both halves.
