# Package 15 — Plugin-backed distribution lifecycle (plan 008, file 1: batch A and P1)

Status: **closed** — opened 2026-09-19T09:40Z on the kickoff of 2026-09-17 (regenerated at the planning
close); merged 2026-09-19T22:38Z as pull request #45 (`main` `e8715ec`); closed with the entry at the end. Session 2 (2026-09-20) is appended below, merged as pull request #46
(`main` `3d23f75`) and closed with its own entry at the end.
Timestamps after 2026-09-19T21:50Z were re-derived from commit and run times at the close (the local clock
ran two hours ahead of UTC past midnight). The directory is dated by the plan's date because file 3 of the plan names this path
(`.stamity/runs/2026-09-17_plugin-lifecycle/`) as the record every unit of the package appends to.
Every new decision goes to the maintainer through the question tool, one per turn, recommended option
first, default declared; the eleven standing decisions of 2026-09-17 are applied as written.

## Baseline, re-verified at intake (2026-09-19T09:30Z–09:45Z)

- Public `main` = `origin/main` = `cba661d` (the planning pull request #44, merged 2026-09-17T18:59Z on top
  of `ec6668d`, Package 14's close record); working tree clean ✓
- Released 1.8.0: annotated tag `v1.8.0` → `e79dcf0`; `@zomarit/stamity@1.8.0` published 2026-09-16 with
  provenance ✓ (GitHub release list: v1.8.0 latest, 2026-09-16T08:03Z)
- Release run of record: run 30 (`evals/runs/2026-09-15-run-30/`, composed with runs 29 and 27 under
  SET-v7's incremental rule) ✓
- Node 22.22.3 on the machine; engine floor `>=22.22.2` ✓
- The four client binaries the proofs read are installed (`claude`, `codex`, `copilot`, the Cursor `agent`
  CLI) and exported from the shell profile as `STAMITY_<CLIENT>_BIN`; the private layer records both
  sign-ins verified on 2026-09-17 (its commits of 2026-09-17, after the kickoff was written) ✓
- Learnings read: all seven under `.stamity/learnings/` (the commondir race, Codex hooks and the features
  flag, the record re-sync, the local gate weaker than CI, surface pins that drift, the leak gate over
  `.stamity/`, the dogfood sync) ✓
- Deferral inbox: five live rows of 2026-09-17, all written by the plan run itself; the two that touch
  this file's paths (the APM token parity row; the audit's Minors row) carry the plan's own disposition
  (APM unchanged; Minors fixed only where a unit touches the file) — no fold-in question needed ✓
- Package branch: `package-15-plugin-lifecycle` from `cba661d`.

## Frame (2026-09-19T09:45Z)

- Outcome: plan 008 file 1's batch A (the seven audit-fix units A1–A7) lands before any plugin root is
  built; P1 (the distribution contract) follows in this session; B1–B3 continue in the next session if
  time runs out. One pull request per session, merged by rebase once every required check is green.
- Intensity: **deep** — security-sensitive paths (the upstream lane's recovery, the signing rehearsal,
  the hook runtime, credential shapes), public contracts (workflows a fork inherits), a wide diff.
- Model plan: implementers, fixers, writers and runners at `claude-opus-5`; reviewers and the
  whole-branch review at `claude-fable-5-1` (the kickoff's rule). Every worktree agent starts with
  `git reset --hard package-15-plugin-lifecycle` and a `node_modules` symlink to the main checkout.
- Isolation primitive, declared before the first dispatch: git worktrees under the worktree lane's farm
  (`../.stamity-worktrees/stamity/p15-<unit>`), one branch `p15/<unit>` per unit off the package branch;
  the orchestrator integrates each unit's commits onto the package branch (single writer per artifact).
- Freshness guard on the plan artifact: `stamp: ec6668d 2026-09-17`; the only `reads:` files that moved
  between the stamp and `cba661d` are the audit record and the two inbox rows the plan run itself
  committed — verdict: fresh, executed as written.
- Waves: 1 = A1, A2a, A3, A5, A6 (file-disjoint); 2 = A2b (after A2a), A4 (after A3), P1; A7 = the
  maintainer's three private-checkout questions, asked while wave 1 builds.

## Contract census — before the wave-1 fan-out

| Contract | Class | Producer | Consumers found | Owner | Change kind |
|---|---|---|---|---|---|
| `MANIFEST_FIELD_ORDER`, `TOOLS`, `MANIFEST_VERSION` | constant | `src/manifest/manifest.ts` | the recovery step's jq program in `upstream-update.yml` (a frozen copy — the audit's FORK-1) | A1 (binds the workflow's comparison to the constants through a test; no producer change) | reconciled(1) |
| `resolveOwnPackageFacts` | symbol | `src/cli/notice/updateNotice.ts` | `src/cli.ts`, `test/cli/notice/updateNotice.test.ts` | A2a (exports it for the new `packageCommand` helper; signature unchanged) | clean |
| `npx @zomarit/stamity …` remedy literals | constant (string) | seven command files under `src/cli/commands/` | the tests that assert those messages | A2a | reconciled(N) — each moved test named in A2a's return |
| `portableHookCommand(tool, row)` / `HookInterchange.command` | symbol | `src/hooks/portableRunner.ts` | `src/adapters/{cursor,copilot,codex}.ts`, `test/hooks/portableRunner.test.ts` | A3 (the codex starter's resolution rule; the signature is unchanged) | clean |
| the Cursor guard bodies' allow path | emitted bytes | `src/hooks/scripts.ts`, `src/adapters/cursor.ts` | the cross-client golden snapshot, the dogfood tree | A3 | reconciled — the snapshot and the dogfood tree regenerate in the same diff |
| `SIGNING_SOURCE_SHA` | config-key | `.github/workflows/pack-signing-rehearsal.yml` | `scripts/pack-signing-rehearsal.mjs`, `test/ci/packSigningRehearsal.test.ts` | A5 | reconciled(2) |
| `previousRun` / `configurationHash` | symbol | `scripts/eval/run.mjs` | `test/evals/manualRunner.test.ts`, `evals/SET-v7.md` (the sentence naming the key) | A6 | reconciled(2) |
| `references()` in the coverage checker | symbol | `content/skills/st-verify/scripts/spec-plan-coverage.mjs` | the projected copies under `.claude/skills/` and `.apm/skills/` (dogfood sync), `test/authoring/specPlanCoverage.test.ts` | A6 | reconciled — the projections regenerate in the same diff |
| `.stamity/manifest.json` (`updatedAt`, `contentHash` rows) | persisted-name | the dogfood sync | A3 and A6 both regenerate it | the orchestrator re-runs the sync at integration, once per integrated unit | reconciled at integration |

Skip note: A1, A2a and A5 share no contract with any other wave-1 unit beyond the rows above.

## Ledger

`ledger.jsonl` beside this record: one row per finding, appended `open` before it is acted on and
rewritten in place as its state moves.

## A7 — the maintainer's three decisions (2026-09-19T10:05Z–10:20Z, through the question tool)

1. The two APM binaries the release verifier hardcodes under `/tmp` → **parameterise and provision** (the
   recommended option): the verifier reads `STAMITY_APM_MINIMUM` and `STAMITY_APM_CURRENT`, defaulting to a
   `verify-tools/` directory the morning script provisions with pinned `apm-cli` 0.29.1 and 0.30.0.
2. The 1.29 GB untracked tree under the readiness run → **delete the regenerable parts, archive the fixture
   tree** (the recommended option): the build source tree and the unused Copilot runtime go under a dated
   retention line; the 28 MB fixture tree is archived as a working-tree capture first; the ignore rule naming
   a path that does not exist is fixed.
3. The token that reached the two Renovate debug logs on 2026-09-10 → the maintainer answered "refreshed
   just now": recorded as rotated on 2026-09-19.

Execution delegated to one implementer inside the private checkout (commits local, no push; the orchestrator
reviews and pushes at the close). Its verify is the private layer's own hygiene check.

## Wave 1 — returns and integration

### A5 — signing-rehearsal-pin: DONE (2026-09-19T10:17Z; integrated as `4f40177`)

- The rehearsal checks the signing source out at `github.sha` (one checkout; `SIGNING_SOURCE_SHA` deleted;
  `paths:` gains `src/pack/**`, `src/merge/**`, `package-lock.json`); the script derives `sourceSha` from
  `GITHUB_SHA` when no pin is set and calls the native-TypeScript bootstrap with a label; `sign-pack.mjs`
  prints an `EngineError`'s code and message and keeps the generic line for everything else; the `sign.ts`
  comments claiming an interactive identity flow are corrected; the docs page names the two identity
  sources (a GitHub Actions job with `id-token: write`, or `SIGSTORE_ID_TOKEN`); SECURITY.md names the
  rehearsal's public outputs.
- Six new tests, no existing test edited; red-first evidence recorded in the return (four of the six fail
  on the pre-change tree for the audited reasons).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,504 passed, 3 skipped, no floor line),
  leak gate 0 hits. Deferred to the merge: the workflow-dispatch rehearsal on `main` (run URL recorded at
  the close). Windows leg: the CI round-trip is the confirmation of record.
- Contract census: `SIGNING_SOURCE_SHA` reconciled(4) — the workflow, the script's context and prepare
  step, the test.
- Attribution: the implementer signed its commit with its own model's trailer (Opus 5); kept as written.

### A6 — eval-comparator-and-checker: DONE (2026-09-19T10:40Z; integrated as `3208fb9`)

- `previousRun(root, key)` keys on `{ profile, rubricCoreHash, harness }` (the driver's notion) and is
  exported; `configurationHash` stays the exact-input receipt on every summary; SET-v7 § 8 names the key and
  the pre-`comparatorKey` fallback. The checker expands `…`, `to`, `through` and `-` ranges between same-area
  ids (a cross-area range is `invalid-reference`; an unclosable range is `partial-scope`), reports
  `missing-spec-delta` on an absent heading, splits a mixed ADDED/REMOVED line at the keywords, reads a
  plan's own `### REQ-` headings as provisional definitions only where no spec defines the id
  (`provisional-definition`, the first advisory code), strips a trailing `:` from unit ids, and replaces the
  backreference with a post-check. Plan 007 now scopes 22 (was 4); plan 005 scopes 12 (was 2, with an
  `invalid-reference` from a trailing colon); the three 008 files pass.
- One plan line not implemented, by the conditional reading: the `edgeCases` sentence "a provisional
  definition that also exists in a spec is a `duplicate-requirement`" contradicts the unit's own
  `interfaces` sentence, the SKILL.md sentence the unit mandates, and the plan's own construction (the 008
  files restate their spec's headings in their deltas by design; the literal reading yields 26 findings on
  them). Default applied: the spec definition wins and produces no finding; a second provisional definition
  of one id is still `duplicate-requirement`. Recorded in the ledger; the reviewer reads it.
- Dogfood sync and goldens: the two projected st-verify artifacts under `.claude/` and `.apm/`, three lines
  of `.stamity/manifest.json`, 17 golden digests (the two artifacts in five trees plus the manifests that
  embed their hashes) — every moved file explained.
- Gates in the worktree: lint, typecheck, build, sync idempotent, APM `--check`, knip, leak gate all pass;
  `test -- --coverage` 8,512 passed with one pre-existing timeout (`crossClientGoldens` all-four second-run
  case at the 20 s cap under five parallel suites; passes alone and on the package branch at 12:37Z).
- Contract census: `previousRun`/`configurationHash` reconciled(2); `references()` reconciled (projections).
- Spec delta proposed for the side-effects step: MODIFIED REQ-FINISH-008 (the comparator keys on the
  configuration, not the input bytes) in `docs/specs/implementation-finish.md`, both the requirement and its
  acceptance restatement.

### A2a — fork-identity-runtime: DONE (2026-09-19T11:05Z; integrated as `9b6147d`)

- New `src/cli/kit/packageName.ts` (`resolveOwnPackageFacts`, `packageName()`, `packageCommand(verb)`); the
  package-facts reader moved into the kit (the boundaries test's wave order forbids a kit → notice import)
  and is re-exported from `updateNotice.ts` under its old name; 19 remedy literals across seven command
  files render the running package's name; the tarball smoke reads `pkg.name` for the install path and both
  consumer snippets. `grep -rn "@zomarit/stamity" src/cli/commands` returns 0.
- Evidence on a renamed, `private: true` copy built by the guide's own bootstrap block: the pre-change
  smoke fails with `ENOENT … @zomarit/stamity/dist` (FORK-2 reproduced); the fixed smoke passes; the installed
  renamed CLI prints `npx @acme/stamity init` in every remedy.
- One file outside the unit's list: `test/architecture/boundaries.test.ts` gains the `PLAN_MAP` row for the
  new module (the architecture gate refuses an unmapped `src/` file; no batch-A unit owns that file).
  Recorded as a Warning in the ledger and accepted: a mechanical precondition, one line.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,505 passed), tarball smoke, knip, leak
  gate. Contract census: `resolveOwnPackageFacts` reconciled(3, 0 edits); the remedy literals
  reconciled(19) with no existing assertion edited.
- Deferrals noted for A2b/A4: the guide does not yet name the smoke; `docs/troubleshooting.md` and
  `docs/migration.md` carry canonical-name literals in prose (correct for canonical docs).

### P1 — distribution-contract: DONE (2026-09-19T11:12Z; integrated as `294ae8c` + `79665fe`)

- `resolveDistributionIdentity(pkg)` gains `distribution` (`branch`, `tagPattern`, per-client `sources`
  with `kind` in `git-subdir | github | archive | npm`), defaults derived from `repository.url`; refusals by
  name for unknown keys, credential-shaped keys at any depth, credential-shaped values (never echoed; the
  five shapes copied from the leak gate's rules and asserted equal to them), a `github` source on a
  non-github host (naming `git-subdir`). `scripts/plugins/releaseManifest.mjs` (`buildReleaseManifest`,
  fixed key order, byte-stable; `validateReleaseManifest`, one path-named message per defect).
  `renovate/plugins.json` and `renovate/companion.json`. `package.json` carries `stamity.distribution`
  with `branch` and `tagPattern` only (sources stay derived: one literal fewer to drift). `sigstore` moved to
  `optionalDependencies`; 44 lockfile entries gained `optional: true`; the sigstore verifier's unarmed path
  covered.
- Both `--check` generators exit 0 on the committed manifests and the APM package (the identity change is
  additive; both consumers read only the original three fields — clean).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,527 passed), knip, leak gate.
- Spec delta proposed for the side-effects step: MODIFIED REQ-PLUGIN-009 (publisher and distribution
  independently optional; refusal by path; per-kind host boundary) and REQ-PLUGIN-011 (`distribution.commit`
  null while unknown; the validator does no cross-check of packages against catalogs).
- Deferral: `docs/packs-and-trust.md` and `docs/security-mapping.md` do not yet say the Sigstore client is
  optional (an `--omit=optional` install gets a refusal verdict, never a pass) — a docs line for a later unit.

### A1 — upstream-lane-recovery-schema: two of three parts DONE, the DCO part BLOCKED_AMBIGUITY, resolved by the maintainer (2026-09-19T11:20Z–11:40Z; integrated as `5bedda0` + `5f1e164`)

- Recovery (FORK-1, Critical): the plan's literal mechanism (run the engine's validator in the recovery
  step) cannot be applied — the publish job runs no code from the repository it pushes to (its header, the
  executable no-`node`/`npm` test at `test/ci/upstreamWorkflow.test.ts:294-307`, and REQ-UPSTREAM-016's own
  "no code from the prepared branch runs during this comparison"). Built instead: `jq -S 'del(.updatedAt)'`
  deep equality between the two manifests plus the `updatedAt` round-trip; the engine's schema is applied
  where it already runs (`writeManifest` in the uncredentialed prepare job); the version pin, the tool
  roster and the 17-key allowlist are gone. Compile-time binding: a new manifest field breaks `tsc` in the
  two test files the moment it breaks `MANIFEST_FIELD_ORDER` (proven with a temporary field). Red-first: the
  old jq program refused the `ruleDelivery`-bearing fixture.
- Landing policy (Minor): a 404 whose body is `Branch not protected` records `classic=none` and counts as
  checked (the live shape verified on 2026-09-19; cited with the audit's access date); only a 403, another
  404 or a malformed body marks the surface unverified; the note is emitted only then.
- DCO (FORK-4): the plan's exclusion mechanism (`refs/stamity-upstream/*`) exists only in an operator's
  clone; the check has no clone; the 250 cap is applied at listing time. Facts established by the
  orchestrator before asking: the compare endpoint paginates past 250 (633 commits on a public repository,
  page 3 full); every upstream commit across v1.3.0..v1.8.0 carries a sign-off (200 of 200). The maintainer
  chose **the API-only fix** (the recommended option): list the pull request's commits through the
  paginated compare endpoint, and exempt an unsigned commit only when its sha exists in the configured
  upstream repository (github.com upstreams only; otherwise every commit is checked and the message says
  so). It lands as unit **A1b** in this session with its own requirement text under REQ-UPSTREAM-017's
  neighbourhood (the spec-author states it at the side-effects step).
- Gates in the worktree: lint, typecheck, `test -- --coverage` at `--maxWorkers=4` (8,509 passed; the
  default-worker run hit the same load timeouts as the other agents), leak gate.

### A3 — hook-contracts-cursor-copilot-codex: DONE (2026-09-19T11:50Z; integrated as `fac33fe` … `88fd14b`, `79a0ff7` and the dogfood sync re-run at the seam)

- Cursor: both guards and the runner's silent-child path write `{"permission":"allow"}`; the module cites
  one URL (`cursor.com/docs/hooks`) and one date. Copilot: `session_start` plain text is wrapped as
  `additionalContext`, JSON `additionalContext` maps through on session start; five surfaces (the audit's
  four plus `docs/customization.md`) now say "injected as additionalContext"; runner-level faults on the
  core guard exit 0 with the warning. Codex: the starter walks up to `.codex/hooks.json` and runs the script
  beside that file (a decoy nearer the cwd is ignored — tested); the emitted `description` states the trust
  boundary; legacy `approve` is ignored with a warning instead of an exit-2 denial; `session_end` rows get
  `timeout: 3`. 21 dated citations in the runner (criterion ≥ 10); the dead warning-class sentence deleted.
- The plan named `docs/troubleshooting.md` for the Copilot sentence; the sentence lives in
  `docs/customization.md:346`, which was edited instead (a Minor drafting slip in the plan, recorded).
- Goldens: seven cross-client snapshots and three emission snapshots moved, each hunk explained; the
  dogfood tree moved by `.stamity/manifest.json` `updatedAt` only (this repository selects Claude alone,
  whose hooks carry no portable runner). At integration the golden and the manifest collided with A6's rows
  as the census predicted; both were regenerated on the integrated tree (`vitest -u`, then build + sync),
  the diff verified to be A3's set on top of A6's, and a second sync reported nothing to do.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,510 passed), build, sync idempotent,
  check clean, capability matrix byte-identical across two generations, leak gate.
- Reader's decisions recorded: a Copilot session-start JSON object without `additionalContext` is left
  alone with the unknown-field warning (not echoed to the client); the Cursor citation collapse re-dates
  three claims on the same page to 2026-09-17 (the page the audit read that day).

### A7 — private-checkout-tasks: DONE in the private layer (2026-09-19T12:35Z; six local commits there, nothing pushed until the close)

- PRIV-2: the 1.8.0 verifier copy (pinned nowhere; the 1.7.0 copy and the 2026-09-10 original are pinned and
  stay frozen) resolves its two APM clients from `STAMITY_APM_MINIMUM` / `STAMITY_APM_CURRENT`, defaulting to
  `verify-tools/apm-<version>/bin/apm`, checks both before any network work, and gains a `--check-tools`
  dry mode; the morning script provisions the two pinned `apm-cli` versions (one venv each) and runs the
  check first. Evidence: both clients answer their pinned version out of `verify-tools/` after the `/tmp`
  installs were deleted; missing and wrong-version binaries exit 2 naming the path.
- PRIV-3: 125 one-off scripts in 44 directories; every directory carries the historical line, a
  three-column table and the paragraph on the two gate runners that write and then read their own GO
  file. Every script's bytes are archive- or receipt-pinned, so none gained a guard by edit; 124 were
  already non-executable; the one executable, unpinned script got the `STAMITY_REPLAY=1` guard. The
  audit's "eleven" could not be reconstructed as a list; the tables classify all 125 by write root.
- PRIV-4: archive first, then delete — the 28 MB fixture tree packed as a working-tree capture (413 files,
  screened with the public leak gate's shapes, zero hits; verified and restored byte-identical), then the
  820 MB build source and the 443 MB never-used Copilot runtime deleted (untracked, ignored files). The
  dead ignore rule replaced by three rules naming the real paths; the nested ignore file removed; one dated
  retention line under a new "Retention decisions" section of the storage policy. The private layer's
  hygiene check refused the first attempt (a committed pointer needs a release-asset URL and the archive
  exceeds the in-repository size budget), so the pointer is a prepared descriptor and the upload is the
  close's step.
- PRIV-5: all six cramped records are pinned; one reading guide per affected run directory instead of an
  in-place paragraph.
- The fixture repositories: the APM mirror is confirmed deleted with its backup; the four fixture
  repositories of 2026-09-10 still exist, archived read-only — a maintainer decision (asked below). The
  `/tmp` residue (349 MB, 39 directories, none hash-pinned) deleted. The token rotation recorded verbatim.
- Verify: the private layer's hygiene check passes over all six commits (3,711 tracked files, 50 additions
  checked).
- Decision (2026-09-19T12:50Z, the question tool): the four fixture repositories of 2026-09-10 are **kept
  archived** (the recommended option); the private layer's post-close record carries the line at the close.

## Review round 1 — wave 1 (`cba661d..0ca2600`), 2026-09-19T12:40Z onward

### Performance lens (fable): no breach; two Minors, advisory

- Budgets found: the logic half of `dist/` (2.00 MiB) and the corpus half (1.50 MiB) in `tsdown.config.mjs`,
  the 20 s per-test cap; no budget covers files emitted into a user's repository. Per surface: the runner
  template within the logic budget (the +4 kB per emitted body is citation comments; no vendor hook-file
  limit is documented in the tree); the checker within the corpus half and a cold path (nothing in
  `.github/workflows/` invokes it — a premise correction); the comparator scan negligible; the identity
  walk about 125 regex tests per run; the recovery `jq` trivial under the publish job's 15-minute cap.
- M-1 (Minor): the emitted runner grew 4,017 bytes and `.codex/hooks.json` 1,579 bytes; parse cost per
  invocation unmeasured. M-2 (Minor): the two new double-integration recovery tests run several spawns
  each with no per-case timeout override; their measured durations on the ubuntu legs are the open
  question — read from the CI run.

### Security lens (fable): one Warning, two Minors; every audited property of the upstream lane still holds

- SEC-W1-1 (Warning): `src/hooks/portableRunner.ts:189-196` — on Cursor `pre_tool_use`, a child that returns
  well-formed JSON whose decision the runner cannot read (an unrecognized key, or Cursor's own native
  `{"permission":"deny"}` shape) now ends as an explicit `{"permission":"allow"}`; before this change that
  path wrote nothing, which the adopted vendor reading counts as a block. Narrowest fix: write the explicit
  allow only when no unrecognized key was observed; otherwise fail closed with a safe error. Routed to the
  fixer.
- SEC-W1-2 (Minor): `upstream-update.yml:1042` — `jq -S` sorts keys at every depth, so a hand-reordered
  manifest compares equal while the spec (`enterprise-upstream-lane.md:497`) and the guide say every byte
  including field order is compared; both sides come from the same writer, so `-S` buys nothing. Fix:
  drop `-S`; the test pin at `test/ci/upstreamWorkflow.test.ts:713` moves. Handed to the fixer as a
  trivial adjacent change.
- SEC-W1-3 (Minor): the Codex starter resolves by the nearest `.codex/hooks.json` at or above the cwd —
  strictly narrower than before (two planted files needed instead of one), the primary HOOK-5 exposure
  (script bytes outside the trust hash) unchanged and now stated in the emitted description. Accepted
  residual: the real fix is a client-supplied root, which the plugin root variable of unit P2b provides
  for plugin installs.
- Sound: the recovery comparison keeps every property the audit verified (control data validated before
  any push, no force flag, recovery pushes nothing, one exempted path, one masked field; duplicate keys
  and whitespace refused by the canonical re-serialisation); the 404 predicate fails safe; every
  `EngineError` message in `sign.ts` is a fixed string; no refusal in the identity module echoes a value,
  userinfo and non-https refused; the absent Sigstore module yields `verified: false` with no waiver;
  Copilot `additionalContext` carries exactly what Cursor's field already carried; legacy `approve`
  falls to the client's native flow; the records under `.stamity/` carry no credential shape.

### Reviewer (fable): request-changes, confidence 0.8 — two Warnings, four Minors; every claimed audit row closed

- W1 (Warning; the same seam as SEC-W1-2): `upstream-update.yml:1042` `jq -S` sorts keys away while the spec
  (`:495-497`), the guide (`:738`) and the workflow comment (`:1003`) say field order is compared. Fix chosen:
  drop `-S` (both sides come from the same writer; `del` preserves order), move the test literal.
- W2 (Warning): `scripts/pack-signing-rehearsal.mjs:26` `sourceSha = SIGNING_SOURCE_SHA ?? GITHUB_SHA` is the
  branch every run now takes, and no test calls `signingContext` with the pin absent. Fix: the positive
  case (`sourceSha === GITHUB_SHA`) and the negative (`GITHUB_SHA: "untrusted"` with no pin throws).
- M1 (A6): `run.mjs:206` — a summary recording none of the three key fields matches every key; bounded
  today (every committed summary carries `profile`), documented in SET-v7 § 8. M2 (A1): the `classic`
  step output has no reader; a test seam. M3 (P1): `git-subdir` is https-only though called host-neutral;
  an ssh remote is refused naming https. M4 (P1): the credential-value scan also covers `branch`,
  `tagPattern` and `path`; an edge, acceptable under the never-echo rule.
- Deviations judged right: A6's conditional reading; A1's no-engine recovery; A3's `customization.md`;
  A2a's boundaries row; P1's minimal block. Snapshot and lockfile diffs verified as exactly the two units'
  sets. Every edited existing test carries its justification; none weaker.
- Not examined by the reviewer: nothing executed; vendor pages not re-read; Windows beyond the guards.

### Fixer round 1 (opus, worktree `p15-fix1` from `0ca2600`): SEC-W1-1, W1/SEC-W1-2, W2

### A1b — dco-check-past-the-listing-cap: DONE (2026-09-19T13:25Z; integrated as `a2b65ae`)

- The `dco` job lists the pull request's commits through `compare/{base.sha}...{head.sha}` with
  `per_page=100`, walking `page=N` explicitly until the rows in hand equal `total_commits` (a single
  object per page, so `--paginate` is not the right tool); it fails closed on a short listing, an absent or
  zero `total_commits`, an unreadable page or a count that moves between pages. An unsigned commit is
  exempt only when the base branch's `.stamity/upstream.json` names a repository on GitHub (three URL forms
  accepted, `.git` stripped, slug-validated) and `GET repos/<upstream>/commits/<sha>` answers 200; every
  other answer, host or configuration shape leaves it unsigned; the canonical repository configures no
  lane, so nothing is ever exempt there. Counts printed; every unsigned sha named; the clone URL never
  echoed. No new cap on lookups (a cap is the shape of the finding being closed); the job's 5-minute
  timeout stays.
- Red-first: the shipping shell against a fake `gh` serving a 303-commit pull request refused at 250; the
  new shell passes it (`303 of 303 over 4 pages: 291 signed off, 12 exempt as upstream, 0 unsigned`).
  Seven executable cases (`skipIf` on Windows and a missing `bash`/`jq`), three retired static pins named
  in a block comment with a `not.toContain("250")` guard; one docs-page pin.
- Gates in the worktree: lint, typecheck, `test -- --coverage --maxWorkers=4` (8,596 passed), leak gate;
  one flake on the first run (`test/qa/hookRuns.test.ts`, a shared `website/build` race between
  concurrently scheduled QA suites; green on two reruns) — for the test-runner to confirm.
- Not exercisable offline: a fork pull request's head resolving through `refs/pull/N/head` on the base
  repository; the first real update pull request on a fork is the confirmation.
- Spec delta proposed for the side-effects step: ADDED REQ-UPSTREAM-019 (the DCO check lists an update
  pull request whole and exempts only real upstream commits), text in the unit's return.
- Contract census: the `dco` job's shell — reconciled(1) (the workflow test's pins moved in the same commit).

### A4 — docs-and-records-currency: DONE (2026-09-19T13:40Z; integrated as `bc194f2`, clean)

- The contracts page's Codex paragraph states the three loading steps (`features.hooks` written as
  `[features] hooks = true`, `projects.<path>.trust_level = "trusted"`, per-hook `/hooks` trust or the
  bypass flag), the 2026-09-15 measurement (headless `codex exec` on 0.154.0 ran zero project hooks with
  everything on), the honesty clause on the default (the page read 2026-09-17 says on by default; the
  measurement never ran without the key), and the dates. The page joined a new `EVIDENCE_PAGES` bucket in
  `test/docsPages.test.ts` (its own re-attestation date; the hand-page bucket's URL allowlist would have had
  to open for four vendors' pages), with the same currency header, a re-open trigger and six cases.
- `CHANGELOG.md`'s link table gains `[1.7.0]` and `[1.8.0]` with `[Unreleased]` on `v1.8.0...HEAD`; the new
  `test/ci/changelogLinks.test.ts` fails on a heading without a definition and on a broken chain; the
  release workflow's awk extractor was run against the new file for `1.8.0` and `1.0.0`.
- `generate-apm-package.mjs` `headFor` passes `license`, `compatibility`, `allowed-tools` and `metadata`
  through for skills only; eight `.apm/skills/*/SKILL.md` gained two lines each and nothing else moved; the
  apmPackage test derives the skill key set from the authored head so an invented key fails as loudly as a
  dropped one.
- CONTRIBUTING's eval paragraph, the operator skill's section 5 and the README state the two-class rule;
  `session-native-v1.md` is marked historical from the skill and the README; the README's `rubric-v4` row
  reads `runs 5–10` (the run artifacts say so; the plan's `1–10` contradicts the README's own rows above
  it — a factual correction recorded here); the rubric's selector sentence and the v1 profile lines fixed;
  the moved-Expected pin added to `readmeCurrency.test.ts`.
- The readiness handoff gained a dated "Earlier state" paragraph naming `6ad4e0d` and runs 13 and 14; the
  four downstream-contract requirements of the APM spec moved under `## Requirements` (text byte-identical);
  plan 005's dangling findings fell from 23 to 5, the remaining five all `REQ-APM-003`.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,600 passed), APM `--check`, build, sync
  idempotent, leak gate. One flake on a throttled run (`test/worktree/engine.test.ts:1098`, the concurrent
  worktree-add race the learning records; green standalone and on two unthrottled runs).
- Warning deferred: `REQ-APM-001`…`005` are bullets the checker does not read as definitions, so
  `REQ-APM-003` dangles before and after; converting them is a spec-text change outside this unit.
- Spec delta proposed: MODIFIED REQ-FORK-010 (the APM skill head is the six-key Agent Skills head, passed
  through, never synthesized).

### Fixer round 1: all three Warnings fixed (2026-09-19T14:05Z; integrated as `9dbf2b7`, `e149cb2`, `083b2a8`; the dogfood manifest re-synced at the seam)

- SEC-W1-1: the runner's warn loop records whether any output key rendered as `<unrecognized>`; on a
  Cursor `pre_tool_use` row with no readable decision and such a key, it throws the safe error
  `Undecidable hook output` (exit 1, empty stdout — a fail-closed denial) before the explicit allow. A key
  the runner knows and warns by name (`systemMessage`, `updatedInput`, …) still yields the explicit allow;
  the silent-child allow is untouched. Red-first: the native `{"permission":"deny"}` document and a
  misspelled `permissionDecison` were exit 0 with an allow before, exit 1 with no stdout after. The three
  emitted runners grew by 794 bytes each; digests regenerated.
- W1 / SEC-W1-2: `jq 'del(.updatedAt)'` (no `-S`) at the manifest comparison; the comment says the mask
  preserves order; the workflow test pins the new literal and refuses the `-S` form; the run-record
  comparison's own `jq -S` is a different check and stays.
- W2: the rehearsal test's positive live-path case (`sourceSha === GITHUB_SHA` with no pin) and its negative
  (`GITHUB_SHA: "untrusted"` throws), appended at the end of the describe block.
- Gates in the worktree: lint, typecheck, `test -- --coverage --maxWorkers=4` (8,590 passed), build, sync
  idempotent, check clean, leak gate. Noted: the first coverage run failed `test/qa/hookRuns.test.ts` before
  `npm run build` had produced `dist/cli.js` in the fresh worktree — an ordering fragility of the local
  gate (the QA suites shell out to the built CLI), not a defect in the change.

### A2b — fork-identity-tests-and-guide: DONE (2026-09-19T14:15Z; integrated as `e6b5f6d` + `e6f934c`, two conflicts resolved at the seam)

- `test/support/identity.ts` (`canonical()`, `npxCommand()`, `canonicalOnly()`; reads `package.json`
  directly, never the production helper, so it cannot agree with production by construction — A2a's
  pseudo-root test stays the production proof); 22 remedy pins across eight CLI suites derived; the update
  notice, the downstream fixture, the identity and manifest suites made identity-aware; a new opt-in
  `test/ci/forkIdentity.test.ts` builds the renamed private copy. The marketplace renders
  `{ "source": "github", "repo": "<owner>/<repo>" }` when `private: true` (canonical bytes unchanged). The
  guide: the derived rule, the two Renovate presets named as identity data with a repoint line in the
  identity step, the public-GitHub boundary beside the portability claim (a bare domain cannot be spelled
  on a hand page), `STAMITY_BASELINE_TAG`; the three spec "pending" sentences retired.
- Evidence: the renamed private copy (`@acme/stamity`, `private: true`, the guide's own identity block)
  went from 33 failing tests in 14 files to 0 identity-related failures (one load flake in a QA suite,
  green alone). Seven of the plan's listed files needed no edit (their canonical strings are fixtures);
  two the plan did not name were fork-hostile: `releaseManifest.test.ts` (correctly catches presets that
  still watch upstream — fixed by the guide's identity step, not the test) and `apmPackage.test.ts` (a
  regenerate-step failure the guide already prescribes).
- Integration: `docs/specs/apm-canonical-distribution.md` (A4 had relocated the section A2b edited; A4's
  structure kept, A2b's sentence applied to the context paragraph) and `test/docsPages.test.ts` (A1b and
  A2b appended a test at the same spot; both kept). 210 tests across the seven affected suites green after.
- Gates in the worktree: lint, typecheck, `test -- --coverage --maxWorkers=4` (8,592 passed), plugin
  manifests `--check`, knip, leak gate; the opt-in fork suite 4 passed.
- Deferrals: no `ref` pin on the private `github` source (tracks the default branch; P8 owns refs and
  tags); test titles still spell the canonical name as prose while the assertions derive;
  `packSigningRehearsal.test.ts` compares two canonical literals to each other on a fork (true but
  vacuous there). Unit size 20 files, the plan's own decomposition.
- Spec delta proposed: MODIFIED REQ-UPSTREAM-017 (tests read the running identity; the git source for a
  private package; the public-GitHub boundary; the presets as identity data).

## Pull request (2026-09-19T14:25Z)

- `package-15-plugin-lifecycle` pushed at `e6f934c`; pull request #45 opened as a draft so the CI legs
  (including Windows) run while review round 2, the full gate run and the spec-delta merge complete; it
  flips to ready once every required check is green, and merges by rebase as #42 and #44 did.

## Prove — the full gate at `e6f934c` (test-runner, opus, pinned worktree; 2026-09-19T14:30Z)

| gate | command | result |
|---|---|---|
| build | `npm run build` | pass — logic 1.23 of 2.00 MiB, corpus 0.52 of 1.50 MiB |
| lint | `npm run lint` | pass |
| typecheck | `npm run typecheck` | pass |
| tests + coverage | `npm run test -- --coverage` | pass — 216 files, 8,614 passed, 4 skipped; statements 96.49 %, branches 89.89 %, functions 98.72 %, lines 97.35 %; zero per-file floor lines |
| leak gate | `npm run gate` | pass — 0 hits across 1,484 files |
| dogfood | `node dist/cli.js sync` then `check` | pass — 0 updated, 67 unchanged (only the manifest's `updatedAt` stamp moved, reverted); drift clean, 11 doctor rows ok |
| APM package | `node scripts/generate-apm-package.mjs --check` | pass — 59 files |
| plugin manifests | `node scripts/generate-plugin-manifests.mjs --check` | pass — 4 manifests |
| capability matrix | regenerate + `git diff --exit-code` | pass — byte-identical |
| docs | `node scripts/generate-docs.mjs` + `git diff --exit-code docs llms.txt` | pass — 8 pages byte-identical |
| knip | `npm run knip` | pass |
| tarball smoke | `node scripts/tarball-smoke.mjs` | pass |
| structural checker | the three 008 plan files against `docs/specs/` | pass — 18, 9 and 5 requirements in scope, no findings, `semanticReview: required` (the reviewer rounds are that pass) |

No flake on the first run; the tree clean after every generator.

## Review round 2 — `0ca2600..e6f934c` (2026-09-19T14:40Z): request-changes, confidence 0.75

- The three round-1 closures verified closed (SEC-W1-1 at key level; W1 with the spec and guide sentences
  true again; W2 with the note that the negative case throws on the sha-shape assertion before the fallback).
- W-A1b-1 (Warning, security): the exemption's `repos/<upstream>/commits/<sha>` lookup answers 200 for any
  commit in the upstream's fork network (GitHub serves fork-network commits through the parent's endpoint),
  so on a public upstream anyone can push an unsigned commit to a personal fork and have it exempted in the
  private downstream. Fix: ancestry, not existence — `compare/<sha>...<default branch>` must answer `ahead`
  or `identical`; the fixtures serve the compare shape; a case where a sha exists but is not an ancestor.
- W-R1-1 (Warning, security; round-1 residual at value level): `decision` outside `approve`/`block` (for
  example `deny`) is a known key with an unreadable value and falls through to the explicit allow on
  Cursor. Fix: fault on an unsupported decision value.
- Minors: M-A1b-1 (two fail-closed conditions have no executable case: a moving `total_commits`, an
  unreadable page); M-A1b-2 (an unreadable upstream reads as "every commit unsigned" with a note that says
  otherwise); M-A4-1 (the evidence-page bare-domain sentence is not enforced); M-A4-2 (two currency claims
  on the contracts page); M-A4-3 (the Codex learning says the flag defaults OFF at high confidence; the
  contracts page records the default was never measured — the learning overclaims); M-A2b-1 (the update
  notice test asserts `isPrivate` on every non-canonical checkout, so a renamed public downstream fails);
  M-A2b-2 (the generator accepts `private: "true"` as a string, the tests only `true`); M-A2b-3 (the
  private `github` source without a `ref`, already ledgered).
- Every audit row claimed by A1b, A4 and A2b judged closed (FORK-4's exemption carrying W-A1b-1).

### Fixer round 2 (opus, worktree `p15-fix2` from `e6f934c`): W-A1b-1, W-R1-1, plus M-A1b-1, M-A2b-1, M-A2b-2 as adjacent test and predicate fixes

## CI on pull request #45 at `e6f934c` (2026-09-19T14:55Z)

Every check green: Build, check (floor, node 22.22.2) 3m08s, check (lts, node 24) 3m35s, **check (windows,
node 24) 11m33s**, the three APM routes (0.29.1, 0.30.0, the 0.29.0 regression witness), dependency review,
supply-chain currency, dist size budget, DCO sign-off (the rewritten job, on a real pull request), the PR
title check, `all-pr-checks` and `all-ci-checks`. The Windows leg is the confirmation of record for the
path-touching changes of A3, A1, A6 and P1.

## Side effects — the spec-delta merge (spec-author, opus, worktree `p15-spec`; 2026-09-19T15:00Z)

- `docs/specs/enterprise-upstream-lane.md`: REQ-UPSTREAM-016 gains the binding clause (the comparison is
  bound to the engine's manifest constants through its tests, not a workflow copy); REQ-UPSTREAM-011 already
  converged; REQ-UPSTREAM-017 gains the as-built paragraph (remedies name the running package, the smoke
  installs under `pkg.name`, no test needs editing, the two presets as identity data, the `github` source
  for a private package, the public-GitHub boundary); **REQ-UPSTREAM-019 allocated** with five acceptance
  rows in a `#### Acceptance` subsection inside the requirement (the file's main list is declared executable
  over the lane fixtures and is counted by `lane.test.ts`; the DCO rows execute a workflow shell instead).
- `docs/specs/implementation-finish.md`: REQ-FINISH-001, -003, -005 and -008 merged as built (the
  undecidable-verdict fail-closed exit, A6's provisional-definition reading, the one-checkout rehearsal, the
  configuration-keyed comparator), each with its acceptance restatement moved together; a source pointer to
  this run.
- `docs/specs/plugin-lifecycle.md`: REQ-PLUGIN-009 and -011 gain dated as-built paragraphs appended (the
  spec's head says its paragraphs are the plan's delta sections, so no rewrite in place).
- `docs/specs/fork-layer.md`: REQ-FORK-010 gains the six-key skill head clause.
- Judgments recorded by the spec-author: the plan's delta never allocated -019 (a plan amendment follows);
  REQ-UPSTREAM-016 records the built mechanism, not the plan's; REQ-UPSTREAM-011's built note condition is
  broader than the plan's sentence and the spec keeps the built one; REQ-FINISH-005 drops the plan's
  ancestor assertion because none exists; REQ-UPSTREAM-017's fork-edited-test disjunction is not carried
  into the spec; REQ-PLUGIN-011's mirrored digest sentence stays as a pipeline property with the schema's
  boundary stated beside it.
- Two follow-ups sent: REQ-UPSTREAM-019 restated on reachability (fixer round 2's ancestry predicate); the
  plan amended with the ADDED line and the A1b unit so plan, spec and checker agree.

### Fixer round 2: both Warnings and the three adjacent Minors fixed (2026-09-19T15:30Z; integrated as `575ddb5`, `804144c`, `985b359`)

- W-A1b-1: the DCO exemption measures ancestry — the upstream's default branch resolved once from
  `GET repos/<upstream>`; per unsigned sha `GET repos/<upstream>/compare/<sha>...<default branch>` must report
  `ahead` or `identical`; `behind`, `diverged`, an error or an unresolvable branch leave the commit unsigned;
  a fourth exemption state ("the upstream's default branch could not be read") keeps a configured fork from
  being told no configuration exists. Red-first: the `diverged` case exited 0 on the shipped job (the sha was
  exempted on its 200 alone). The guide paragraph and the docs-page pin say reachability; the fixtures serve
  the default-branch answer and the compare shape; M-A1b-1's `pageTotals` and `missingPage` fixture fields
  exercise the moving-total and unreadable-page guards.
- W-R1-1: at the shared validation seam beside `permissionDecision`, a `decision` outside `approve`/`block`
  throws `Unsupported decision` for every client (`block` still denies, `approve` still warns and is
  ignored). Red-first: `decision: "deny"` on Cursor exited 0 with an allow. Goldens regenerated (+591 bytes
  per runner, the manifests' digests, the emission golden's +21 lines); the dogfood tree unmoved beyond the
  stamp.
- M-A2b-1: the non-canonical branch asserts `identity.private`. M-A2b-2: the generator tests
  `private === true` only; the two tests already did. Reported, not fixed: `test/cli/kit/packageName.test.ts:112`
  pins that the kit's reader still accepts `private: "true"` (leniency in the safe direction: a string
  suppresses the registry probe).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,577 passed; two files hit vitest
  worker-startup timeouts under coverage instrumentation, both green alone and untouched by the change),
  leak gate, check clean, plugin manifests `--check`. On the package branch after integration: the seven
  affected suites green, check clean.

## Review round 3 — `e6f934c..985b359` (2026-09-19T15:50Z): **approve, confidence 0.85**; the loop converged in three rounds

- All five closures verified: the compare predicate's direction (`ahead` iff nothing reachable from the sha is
  missing from the branch; a true ancestor can never yield `behind` or `diverged`; a fork-pushed commit
  answers `behind` or `diverged` or 404, all falling to the `case` default), every non-200 or malformed
  answer ending unsigned, the default-branch read failing never reaching an exemption (the regex guard on
  the branch name also defeats a JSON error body on stdout), the fake `gh` honouring `--jq`, the diverged
  case naming exactly the planted sha; the decision guard before the client branches with `block`,
  `approve` and an absent key keeping their prior paths; the two M-A1b-1 cases hitting the two distinct
  shell guards; the identity assertions.
- No new Critical or Warning; no regression on any round-1 or round-2 finding (the fourth exemption state
  narrows round-2's M-A1b-2). Two nits observed and suppressed by the round-3 rule (the compare body size
  per lookup, bounded by the job timeout; a test comment overstating the `approve` warning on Cursor).
- The reviewer's integration condition: the spec merge must say "reachable from the default branch" when
  it lands — it does (the spec-author's second and third passes).

## Side effects — learnings (2026-09-19T16:20Z, through `stamity learn capture`)

- `codex-hooks-need-the-features-flag-and-exec-runs-none` retired and recaptured: the sentence claiming the
  client defaults the flag OFF is replaced by the measured fact (the control ran with the key set false,
  never absent; the page read 2026-09-17 says on; the adapter writes the key so the emission does not
  depend on the default). Every other claim of the 2026-09-15 measurement is carried unchanged.
- New: `gitignore-misses-a-symlinked-node-modules` (high) — the directory-only `node_modules/` line does not
  match the symlinked `node_modules` the worktree lane sets up, so `git add -A` stages the symlink; every
  worktree agent of this run met it. Review horizon: a bare `node_modules` line in `.gitignore` retires it
  (queued in the inbox).
- Not captured (the bar): the intermittent `test/qa/hookRuns.test.ts` failure under concurrent load ("pages
  missing from the build" in a per-test site fixture), seen by three agents and never reproduced alone —
  mechanism unverified; an inbox row for the QA lane instead. The pre-existing `stamity validate` advisory
  (the operator eval skill over the lean threshold: 253 lines on `main`, 275 after A4) is noted, not this
  run's.

## CI on pull request #45 at `c3efabd` (2026-09-19T16:40Z)

Every check green again on the spec commit: floor 3m54s, LTS 3m40s, **Windows 9m29s**, `all-ci-checks`; the
structural checker at `c3efabd` passes the three 008 files (20, 9 and 5 requirements in scope) and 006.

## Whole-branch deep review (fable, frontier class) — `cba661d..c3efabd` (2026-09-19T16:45Z): request-changes, confidence 0.80

- W-WB-1 (Warning, fork consumer): `test/ci/changelogLinks.test.ts` derives the compare-URL home from the
  running `package.json` and asserts every footer definition against it; the CHANGELOG is an inherited
  upstream file naming the canonical repository, so a renamed fork fails the suite on its first inherited
  gate run, against the guide's "no test edit" rule and REQ-UPSTREAM-017 as merged. Neither A2b's
  renamed-copy run (before A4 integrated) nor the fork-identity suite's list caught it. Fix: derive the home
  from the footer's own `[Unreleased]` definition and assert chain consistency, and add the file to the
  fork-identity suite's list.
- W-WB-2 (Warning, product and spec): unit A1's `interfaces`, `testCriteria` and `edgeCases` cells in the
  amended plan still prescribe `jq -S` and the engine's validator in the recovery step; the code, the tests
  and the spec say the opposite. The orchestrator had told the spec-author to leave the Recovery sentence
  as planned and let the record reconcile it; the reviewer is right that the plan's claim of agreement was
  then only structural. Fix: rewrite the three cells to the as-built mechanism.
- Minors: M-WB-1 (two line pins in the lane spec five lines stale after fixer round 2); M-WB-2 (the spec's
  REQ-FINISH-005 omits the ancestry assertion that does exist at `test/ci/packSigningRehearsal.test.ts:181-191`
  — the spec-author's "none exists" judgment, and the record's echo of it, were wrong); M-WB-3 (`prove/17`
  read as open on the branch — the recapture sits in the main checkout's state files and lands with the
  close commit); M-WB-4 (two docs-page pins embed hard line breaks; normalise whitespace); M-WB-5 (gate
  evidence at `c3efabd`: recorded above).
- Every other lens sound: the runner's guard order is one design; the identity step, the presets and the
  fork-identity suite agree; the upstream lane and the DCO job sound end to end; the signing and identity
  refusals never echo; every edited test carries its justification.

### Fixer round 3 (opus, worktree `p15-fix3` from `c3efabd`): W-WB-1, W-WB-2, M-WB-1, M-WB-2, M-WB-4

### Fixer round 3: both Warnings and the three Minors fixed (2026-09-19T22:10Z; integrated as `f7220ba`, `7607722`, `4eec37a`)

- W-WB-1: `test/ci/changelogLinks.test.ts` reads the home from the footer's own `[Unreleased]` definition and
  holds every other definition to it, so the gate measures the footer's internal consistency and not the
  running package; the file joins the fork-identity suite's list. Red-first: the renamed copy failed the old
  assertion and passes the new; the opt-in group exits 1 with the old file and 0 with the new; a dropped
  definition, a broken range and a second home each still fail.
- W-WB-2: unit A1's three cells describe the as-built recovery (`jq 'del(.updatedAt)'` with order preserved,
  the canonical re-serialisation and timestamp round-trip, the engine's schema in the prepare job through
  `writeManifest`, the `ledgar` case through `collectManifestErrors` plus the byte-comparison refusal, the
  older-engine case refused in the prepare job); the checker passes with 20 requirements and 19 units.
- M-WB-1: both lane-spec pins cite names. M-WB-2: the ancestry assertion stated in REQ-FINISH-005 and its
  restatement. M-WB-4: three pins in the same block matched through collapsed whitespace.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,621 passed, no floor line), leak gate, the
  checker, the opt-in renamed-copy group (16 suites, 414 tests nested). The integration in the main
  checkout tripped twice on its own state files (a stale sequencer from a refused cherry-pick, then a stash
  pop over a file already restored); resolved by clearing the sequencer and dropping the redundant stash;
  every state file verified byte-identical afterwards.
- Pushed as `4eec37a`; the whole-branch re-review, the gate run at the head and the harness at the candidate
  run in parallel.

## Whole-branch re-review — `c3efabd..4eec37a` (2026-09-19T22:25Z): **approve, confidence 0.85**

- All five closures verified by reading: the changelog test's anchor on the footer's own `[Unreleased]`
  home with the three failing shapes intact (a heading without a definition, a broken range, a second
  home); A1's cells against the workflow, the tests and the guide; the two named pins resolving; the
  ancestry sentence matching the `it.skipIf` case; the `flowed()` pins weakening nothing.
- No new Critical or Warning; no regression against rounds 1 to 3. Three Minors ledgered: a fork that cuts
  its own release must rewrite the inherited footer to its own home (the guide could say so in one
  sentence); the fork-identity suite's comment says "over fifteen suites" for a list of sixteen; the spec's
  "skips with that reason recorded" overstates a silent `it.skipIf` whose reason lives in comments.
- The review loop and the deep review have both converged; the candidate is `4eec37a`.

## QA checkpoint (2026-09-19T22:30Z–22:40Z)

- What to verify, in one line each: `stamity check` on an uninitialised repository names the running
  package; a renamed private fork passes its inherited gate untouched; the upstream lane's recovery accepts
  any engine-admitted manifest and refuses a hand edit; the DCO check passes a long update pull request and
  exempts only commits reachable from the upstream's default branch; a credential-shaped key in the
  distribution block is refused without echo; Cursor allows out loud and faults on what it cannot read;
  Copilot session-start text reaches the session; the Codex starter runs the script beside its trusted
  file; the signing script names its refusal; Claude hooks deny and allow headlessly; the docs site's
  structure and keyboard journeys hold in both themes and widths.
- The QA skill was invoked by name; the walk-through is `qa-session-1.md` beside this record: sixteen rows
  auto-proven (test assertions cited by file and line, the harness rows at the candidate, the CI legs), six
  rows left for a person (three client hook rows not-run for the recorded client reasons, two L rows, the
  post-merge rehearsal).
- Browser evidence: the harness's site lanes at the candidate (`.stamity/evidence/qa-4eec37a.json`, rows
  H2 and H3a to H3d) are the captured evidence; no separate browser bundle was needed.
- Sign-off: the maintainer answered **Shippable YES, accept the six unperformed rows** (the recommended
  option) through the question tool at 2026-09-19T22:35Z; the three client hook rows are recorded as signed
  off and not performed, a fourth time, with file 3's unit V1 as the row that measures them.

## Proof block

### Gate results (the test-runner at `4eec37a`, 2026-09-19T22:20Z; every gate pass)

| gate | command | result |
|---|---|---|
| build | `npm run build` | pass — logic 1.23 of 2.00 MiB, corpus 0.52 of 1.50 MiB |
| lint | `npm run lint` | pass |
| typecheck | `npm run typecheck` | pass |
| tests + coverage | `npm run test -- --coverage` | pass — 216 files, 8,621 passed, 4 skipped; statements 96.49 %, branches 89.89 %, functions 98.72 %, lines 97.35 %; zero floor lines |
| leak gate | `npm run gate` | pass — 0 hits across 1,484 files |
| dogfood | `node dist/cli.js sync` then `check` | pass — 0 updated, 67 unchanged; drift clean, 11 doctor rows ok |
| APM package | `node scripts/generate-apm-package.mjs --check` | pass |
| plugin manifests | `node scripts/generate-plugin-manifests.mjs --check` | pass |
| capability matrix | regenerate + `git diff --exit-code` | pass — byte-identical |
| docs | `node scripts/generate-docs.mjs` + `git diff --exit-code docs llms.txt` | pass — byte-identical |
| knip | `npm run knip` | pass |
| tarball smoke | `node scripts/tarball-smoke.mjs` | pass |
| structural checker | the three 008 plan files | pass — 20, 9 and 5 requirements in scope; `semanticReview: required`, answered by the five review rounds below |
| fork suite | `STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts` | pass — 4 cases, the renamed copy over 16 suites |
| CI (pull request #45) | every leg at `985b359` and `c3efabd`, including Windows | green; the legs at `4eec37a` recorded in the closing entry |

### Review verdicts, per round

| round | reader | verdict | confidence | findings |
|---|---|---|---|---|
| 1 (wave 1) | reviewer | request-changes | 0.80 | 2 Warnings, 4 Minors |
| 1 (wave 1) | security lens | — | — | 1 Warning, 2 Minors; false-positive estimate 0–1 of 3 |
| 1 (wave 1) | performance lens | no breach | — | 2 Minors, advisory |
| 2 (wave 2 + fixer 1) | reviewer | request-changes | 0.75 | 2 Warnings, 8 Minors |
| 3 (fixer 2) | reviewer | approve | 0.85 | none new |
| deep (whole branch) | reviewer, frontier class | request-changes | 0.80 | 2 Warnings, 5 Minors |
| deep re-review (fixer 3) | reviewer, frontier class | approve | 0.85 | 3 Minors |

### Decisions trace

- The maintainer, through the question tool, one per turn: the A7 APM binaries (parameterise and provision);
  the 1.29 GB tree (delete the regenerable parts, archive the fixtures); the token (refreshed 2026-09-19); the
  DCO fix (API-only, paginated compare listing with the upstream exemption); the four fixture repositories
  (kept archived); the QA sign-off (shippable, six rows accepted unperformed). The eleven standing decisions
  of 2026-09-17 applied as written; none re-asked.
- Defaults applied by the run, each recorded where it happened: A6's conditional reading of the
  provisional-definition edge case; A1's no-engine recovery comparison; A3's `customization.md` instead of
  the plan's `troubleshooting.md`; A2a's one architecture-map row outside its file set; P1's minimal
  distribution block; A4's `runs 5–10`; the spec-author's appended as-built paragraphs under the
  plugin-lifecycle spec and its `#### Acceptance` placement for REQ-UPSTREAM-019; the ancestry predicate
  chosen for the exemption after round 2.
- Deferrals: 25 ledger rows closed `deferred` with a rationale each; 22 inbox rows appended (three folded into
  a sibling's row: the runner-size pair and the contracts-page pair). Rejections: 5 rows, each with its
  reasoning. Nothing pending: the ledger reads no `open` row at exit.

### Artifacts touched, by owner

- A1 (implementer, opus): `upstream-update.yml`, three upstream tests, the guide's recovery paragraph, the
  lane spec. A1b: `pr-checks.yml`, the workflow test, the guide's DCO paragraph, one docs-page pin.
- A2a: `src/cli/kit/packageName.ts`, seven command files, `updateNotice.ts`, `tarball-smoke.mjs`, tests, one
  architecture-map row. A2b: `test/support/identity.ts`, ten test suites, the fork-identity suite, the
  manifest generator, the guide, three spec sentences.
- A3: the portable runner, the hook model and scripts, the three portable adapters, `hooksInfra.ts`, the
  goldens, the capability matrix, `customization.md`, one contracts-page sentence.
- A4: the contracts page, `CHANGELOG.md` and its new test, the APM generator and eight skill heads, the eval
  docs, the readiness handoff's earlier-state paragraph, the APM spec's relocation.
- A5: the signing rehearsal workflow and scripts, `sign.ts` comments, the rehearsal test, the trust page,
  SECURITY.md. A6: the eval runner, the coverage checker and its projections, the verify skill, SET-v7.
- P1: `distribution-identity.mjs`, `releaseManifest.mjs`, the two Renovate presets, `package.json`, the
  lockfile, two new tests.
- Fixers 1 to 3 (opus): the runner's three guards and their tests, the workflow comparison, the rehearsal
  test, the DCO exemption and fixtures, the identity predicate, the changelog test, the plan's A1 cells, two
  specs, three docs-page pins.
- Spec-author (opus): four specs and the plan's delta and units. A7 (opus, the private checkout): the
  verifier, the morning script, 44 script notes, six reading guides, the retention line, the post-close record.
- Orchestrator (this session): the package branch and every integration (three seam regenerations, two
  hand-merged conflicts), the worktrees, the run record, the ledger, the QA record, the harness runs, the
  inbox rows, the learnings captures, the private layer's archive upload and pointer, the pull request.

### Per-action attribution and evidence classes

- Sub-agent work: each unit's, reviewer's and fixer's return is a native transcript in the session's task
  directory (outside the repository); this record quotes their structured returns (class: self-quoted
  completion markers with the gate outputs they pasted).
- Native platform artifacts: the CI runs on pull request #45 (the check URLs in the pull request), the
  private layer's evidence release of 2026-09-19, the maintainer's answers through the question tool.
- Repository artifacts: `.stamity/evidence/qa-4eec37a.json` (the harness at the candidate), the two
  learnings, the ledger and this record.

### Recommended next step

Session 2 opens with batch B1 of plan 008 file 1 (P2b hook-scripts-root, then P7 runtime and locator in
parallel, then P2a the emitter core), then B2 (the four client roots P3 to P6 and P8 the distribution root),
then B3 (P9 the release workflow), all on a fresh branch from `main` after this pull request merges; then
files 2 and 3. The 22 inbox rows of 2026-09-20 wait for the units that touch their files or the hygiene
batch after 1.9.0; the `.gitignore` line for a symlinked `node_modules` is the one worth taking first
because every worktree agent meets it. Not done in this session's scope: nothing; the six QA rows are
accepted unperformed by the maintainer, and the post-merge signing rehearsal is the one step still open
at this entry.

## Closing entry (2026-09-19T22:55Z)

- CI on the state commit `9bdd2fc`: the floor and LTS legs failed on the records gate — the two recaptured
  learnings lacked `reviewBy` and `validatedAgainst`, and three deferred ledger rows had been folded into a
  sibling's inbox row (`test/learnings/repoLearnings.test.ts`, `test/records/ledgers.test.ts`). The gate
  run at the candidate could not see the state files (untracked in the pinned worktree). Fixed in
  `8387090` (the two fields in the head; two more inbox rows; a dated retirement on the frame row): floor
  3m54s, LTS 3m40s, Windows 9m47s, both aggregators green. Lesson recorded in the private layer's kickoff:
  run `test/records`, `test/learnings` and `test/qa` in the main checkout before pushing state files.
- Pull request #45 rebase-merged at 2026-09-19T22:38:07Z: public `main` `e8715ec` (29 commits from
  `cba661d`: batch A, A1b, P1, three fixer rounds, the spec-delta merge, the record and its fix).
- The pack-signing rehearsal dispatched on `main` after the merge (unit A5's post-merge criterion):
  run 35473934277 at `e8715ec`, `prepare`, `sign` and `verify` all `success`
  (https://github.com/zomarit/stamity/actions/runs/35473934277).
- The private layer: A7's eight commits plus the archive pointer and the close (the session's decision row,
  the directive's note, the HANDOFF paragraph, the dashboard banner, the kickoff regenerated for session 2)
  pushed at the close.
- Not done: nothing within this session's scope. Carried: the 24 inbox rows of 2026-09-20; the six QA rows
  accepted unperformed; batches B1 to B3 of file 1, then files 2 and 3, for session 2.

# Session 2 — batches B1 to B3 of file 1 (the plugin roots, the runtime, the distribution, the release workflow)

Session status: opened 2026-09-20 on the kickoff regenerated at the session-1 close; branch
`package-15-plugin-lifecycle-2` cut from `main` `b000bd1` (the four close commits of session 1 on top of the
merge `e8715ec`). One pull request for the session, merged by rebase once every required check is green. The
same rules as session 1: every new decision to the maintainer through the question tool, one per turn,
recommended option first, default declared; the eleven standing decisions of 2026-09-17 and the six of
session 1 applied as written; implementers, fixers, writers, researchers and runners at `claude-opus-5`,
every reviewer and lens at `claude-fable-5-1`. (The measurements page reads this record's first proof block,
session 1's; session 2's own proof block sits at its end and is read by people.)

## Baseline, re-verified at intake (2026-09-20)

- Public `main` = `origin/main` = `b000bd1`; pull request #45 `MERGED` at `e8715ec` (2026-09-19T22:38Z);
  working tree clean; no worktree in the farm; the remote branch of session 1 pruned ✓
- Released 1.8.0: `v1.8.0` → `e79dcf0`; npm `latest` 1.8.0; the GitHub release list shows v1.8.0 latest ✓
- Release run of record: run 30 (the newest directory under `evals/runs/`) ✓
- No plugin root exists: `scripts/plugins/` holds only P1's `releaseManifest.mjs`; no
  `generate-plugin-packages.mjs`, `build-plugin-runtime.mjs` or `build-plugin-distribution.mjs`; no `dist/plugins` ✓
- Node 22.22.3 on the machine; engine floor `>=22.22.2` ✓
- Learnings read: all eight under `.stamity/learnings/` (the seven of session 1 plus the symlinked
  `node_modules` one) ✓
- The private layer read: the kickoff of record, the decision row and the directive of 2026-09-20, the
  dashboard banner, the session log's last paragraph; nothing stale ✓
- Deferral inbox: 24 live rows of 2026-09-20 plus the five of 2026-09-17; the kickoff already assigns the
  overlapping ones to units (the `.gitignore` row first, two to P8, one to P2b, one to file 2) — no fold-in
  question ✓

## Frame (2026-09-20)

- Outcome: batch B1 (P2b hook-scripts-root and P7 runtime-and-locator in parallel, then P2a the emitter
  core), then B2 (P3 to P6 the four client roots, P8 the distribution root), then B3 (P9 the release
  workflow); files 2 and 3 if time remains; whatever is left continues in the session after.
- Intensity: **deep** — emitted hook bytes and path composition (the Windows leg is the confirmation of
  record), a public distribution contract, the release workflow's publishing path, a wide diff.
- Freshness guard on the plan artifact (`stamp: ec6668d 2026-09-17`): 36 of the 63 `reads:` files moved
  between the stamp and `b000bd1`; every one was moved by session 1's own units (batch A, A1b, P1, the
  spec-delta merge, the record) or by the plan run's own outputs, and the B units were written to run after
  them (P2b `depends_on` A3, P7 `depends_on` P1). Verdict: fresh by the plan's own sequencing; the three
  researchers of Phase 1 re-check the B1 interface cells against the as-built tree and report drift.
- Isolation primitive, declared before the first dispatch: git worktrees under the worktree lane's farm
  (`../.stamity-worktrees/stamity/p15s2-<unit>`), one branch `p15s2/<unit>` per unit off the package branch,
  a `node_modules` symlink to the main checkout, every agent starting with `git reset --hard` to the
  package branch and staging by explicit path; the orchestrator integrates each unit's commits onto the
  package branch (single writer per artifact).
- Unit shape: P2a is split at Plan into P2a-i (the planner-independent modules: tokens, corpus staging,
  the capability file, the setup command, each with its tests) and P2a-ii (the emitter CLI, the layout
  registry, the initial per-client layout modules from the P3–P6 interface cells, the integration test,
  the CONTRIBUTING row) — the plan's unit ceiling, applied at Plan rather than mid-build. P2a-i runs in
  wave 1 beside P2b and P7; P2a-ii runs after all three.
- Waves: 1 = U0 (the `.gitignore` inbox row, in the main checkout, before any worktree is cut), P2b, P7,
  P2a-i; 2 = P2a-ii; 3 = P3, P4, P5, P6, P8 (P8 codes against P2a-ii's CLI and re-verifies after P3–P6
  integrate — the facade hold); 4 = P9.

### U0 — gitignore-symlinked-node-modules: DONE (2026-09-20; `50af974` on the package branch)

- A bare `node_modules` line beside the directory-only rule, with the reason above it. Proof in a scratch
  repository: the symlinked `node_modules` matches the bare line and `git status --porcelain` is empty; a
  real `node_modules/` directory stays ignored; the slash-only control reproduces the learning's failure
  (`?? node_modules`). `test/ci/repoHygiene.test.ts` and `test/ci/leakGate.test.ts` green (31 tests), lint
  green, the leak gate and the hygiene script at 1,490 files unchanged. Not run: typecheck and the full
  suite (a `.gitignore` line reaches neither). The three B1 worktrees were cut from this commit and show a
  clean status with their symlink.
- Closes the `.gitignore` inbox row of 2026-09-20 (the ledger row gains its dated retirement at the close);
  the learning `gitignore-misses-a-symlinked-node-modules` reaches its own review horizon and is retired at
  the close through the learn write path.

## Phase 1 — three researchers on the B1 seams (2026-09-20, opus, read-only)

- P2b seams: `EmissionContext.facts` is an inline type with a twin `EmissionFacts` in `src/cli/engine/emission.ts`
  (the plan's file list omits the twin); `HooksPlanContext` carries no facts and needs the root threaded from
  the one planner call site; `CoreHooksPlan.policyDocument` already exists (nothing to add); only the guard
  reads the policy document (the cell's "and the review gate" is wrong); the guard resolves the document
  script-relative and a gating test re-derives that climb from the emitted line; the runner's core-guard
  identity and Cursor's `isCoreScriptRow` match the repository path literally, so a plugin root would flip
  codex's and copilot's fail-mode posture and cursor's `failClosed` silently (Warning, security-relevant, no
  test names it); the runner's child `cwd` is four levels above the runner, wrong under a plugin root; the
  decoded row carries the literal `${VAR}` because the client expands only the config string; Claude's
  `shellWord` single-quotes any `$` token and a gating test pins that for a bare `$VAR`; the review-gate rows
  and Cursor's two adapter guards are built from constants, not interchange rows; codex calls the command
  renderer twice.
- P7 seams: `--version` walks to the nearest versioned `package.json`, not through `findPackageRoot`; the leak
  gate's `--include-build` scans `node_modules` in full and its listing goes through `git ls-files` first, so a
  gitignored directory inside the checkout lists zero files (build in a temp directory); the plan's prune list
  keeps the `@types/node` declarations that the production dependency `@types/make-fetch-happen` drags in;
  the repo-root bound has a second condition (the candidate must hold `.stamity/`); no caret comparator
  exists in `scripts/`; knip, the architecture gate and coverage do not cover `scripts/`.
- P2a seams: `planWithWarnings(ctx)` is the entry; `AdapterOutput` rows carry `path`, `content` (a string),
  `owner.artifactType` and no tool/origin; `resolveSelection(index, {})` selects everything (the cell's
  `{ ids: [] }` is a type lie that happens to work); the synthetic manifest needs `createdAt`/`updatedAt`
  pinned to a constant; `createManifest` cannot express `ruleDelivery`; a pinned staged root gets no fork
  layer unless named; `assertSafePath` already refuses `..`/backslash/absolute and is applied to companions;
  `replacedClaimantOf` already places a fork replacement under the replaced skill's directory; skill
  companions are read as utf8 so a BINARY companion is corrupted by every emission lane (Warning, engine
  defect, outside this package's file set); Copilot also emits `.stamity/mcp/copilot-repo-settings.env`;
  rule-skill bytes differ between a claude-only plan and the four-client emission; the CONTRIBUTING
  regeneration test pins command strings, not the count word, so the plan's red-until-C7 coupling is not
  real; the corpus today: 10 agents, 9 commands, 12 rules, 8 skills (+ the operator's own override skills
  under `.stamity/overrides/`, which are not corpus).

## Contract census — before the B1 fan-out (2026-09-20)

| Contract | Class | Producer | Consumers found | Owner | Change kind |
|---|---|---|---|---|---|
| `EmissionContext.facts` (+ the `EmissionFacts` twin) | type_shape | `src/emit/planner.ts:122-125`, `src/cli/engine/emission.ts:166-169` | two production constructors, 17 test constructors, every adapter through the residue context | P2b (adds optional `hookScriptsRoot`) | reconciled(N) — additive, no consumer edit |
| `HooksPlanContext` | type_shape | `src/emit/hooksInfra.ts:215-241` | one caller `src/emit/planner.ts:386-396`, `test/emit/hooksInfra.test.ts` | P2b | reconciled(1) |
| `HookInterchange.command` | event_schema | `src/emit/hooksInfra.ts:384` | the four adapters' config renderers, the goldens | P2b (root-derived when the fact is set; repository bytes unchanged) | clean |
| `portableHookCommand(tool, row)` | api_signature | `src/hooks/portableRunner.ts:8-26` | cursor:768, copilot:708, codex:633-634 | P2b (signature unchanged; a plugin-mode branch) | clean |
| the runner's core-guard identity; Cursor `isCoreScriptRow` | event_schema (security posture) | `portableRunner.ts:65`, `cursor.ts:219-221` | codex `failureExit`, copilot `failureExit`, cursor `failClosed` | P2b (root-independent match) | reconciled(3) — pinned in both modes |
| `shellWord` / `shellCommand` (byte twins) | api_signature | `claude.ts:767-769`, `cursor.ts:794-800` | one call site each; the gating quoting tests | P2b (the narrow `${NAME}/path` rule, both twins) | reconciled(2) |
| `HOOKS_GENERATED_DIR` seam | constant | `src/emit/hooksInfra.ts:88` | claude, cursor adapters, five tests | P2b reads it; nobody moves it | clean |
| the emitted guard and runner bodies | emitted bytes | `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts` | both golden snapshots, the dogfood tree, `.stamity/manifest.json` hashes | P2b (regenerated in the same diff) | reconciled |
| `REPO_SUBSTITUTION_TOKENS` | constant | `src/emit/substitution.ts:86-96` | P2a-i's `tokens.mjs` (a test binding) | nobody moves it | clean |
| `resolveDistributionIdentity` | symbol | `scripts/distribution-identity.mjs` (P1) | P8 reads it | nobody moves it in B1 | clean |
| the four committed manifests, the APM package | bytes | the two generators | their `--check` tests | nobody in B1–B3 | clean (must not move) |
| `release.yml` step names | config | `.github/workflows/release.yml` | `test/ci/workflow.test.ts` | P9 alone | clean until B3 |
| `.stamity/manifest.json` hashes | persisted-name | the dogfood sync | P2b's sync; later syncs | the orchestrator re-syncs at each integration | reconciled at integration |

Skip note: P7 and P2a-i add only new files and share no contract with P2b beyond the constants above (both
read, neither moves). P2a-ii codes against P2b's `hookScriptsRoot` once it has landed.

## Wave 1 — dispatched (2026-09-20)

P7 (worktree `p15s2-p7`), P2b (`p15s2-p2b`) and P2a-i (`p15s2-p2a-i`), each an implementer at opus with the
researcher's seams in its brief; three defaults applied by the orchestrator and recorded here rather than
asked, because each has one safe reading: (1) the Claude review-gate rows and Cursor's two adapter guards are
root-derived in plugin mode like every other hook command (P3's own criterion needs it); (2) the plugin-mode
runner uses the session's working directory as the child's `cwd` and resolves `${VAR}` from the environment,
falling back to its own directory; (3) a policy document that exists at the plugin root but is oversized or
unparseable is the document (the guard's existing refusal applies), never a silent fallback to another policy.
P7 extends the plan's prune list with the `@types/` scope and every declaration file instead of moving the
two type-only packages between dependency groups (a lockfile change outside the unit).

## Vendor spikes for B2, run beside the B1 builds (2026-09-20, opus, read-only, web)

- Claude Code (code.claude.com plugins, plugins-reference, plugin-marketplaces, discover-plugins, hooks,
  cli-reference; the schemastore manifest schema read byte-exact from the SchemaStore repository, draft-07,
  `name` the only required key, no top-level `additionalProperties`, no `rules` field among its 22 keys):
  `agents` is a file list only; `commands` REPLACES the default scan while `skills` and `hooks` ADD to it
  (pointing them at the default paths risks double registration, so the root omits those two fields and
  relies on discovery — a default applied, recorded here); `hooks/hooks.json` is the documented shape with an
  optional top-level `description`; `${CLAUDE_PLUGIN_ROOT}` is expanded in the command string AND exported to
  the hook process; the vendor asks for the placeholder to be double-quoted in shell form (an absolute install
  path may carry a space) — P2b amended mid-build to double-quote every `${NAME}/…` token; invocation forms
  are `/stamity:<command>`, `/stamity:<skill>` (the bare form resolves when unambiguous) and `@stamity:<agent>`
  (the `@` sigil the plan's cell lacks); the archive-source floor `2.1.224` confirmed verbatim; `marketplace
  add` accepts `owner/repo`, a git URL with `#ref`, a local path; `install --scope project` writes
  `enabledPlugins` and `extraKnownMarketplaces`; third-party marketplaces have auto-update off by default;
  `rollback` is documented in slash form on one page and absent from the CLI reference — kept `not
  established`; `git-subdir` carries `ref` and `sha`, `archive` carries `sha256` only, `npm` carries
  `version`/`registry`, `url` is the generic-git kind.
- Cursor (cursor.com reference/plugins, plugins, hooks, context/rules, skills, agent/subagents, cli reference
  pages): `name` the only required manifest field, no `$schema`; component fields take files or directories
  and REPLACE folder discovery when set; `mcpServers` and `variables` exist (stamity declares none); the hooks
  file carries `"version": 1`; Cursor expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` in
  `command`, `args`, `env` values and `cwd` (export to the child's environment not stated); `commands/`
  discovery reads files, and Cursor converts commands to skills with `disable-model-invocation: true`, so the
  command-as-skill surface rides under `skills/` in the root (a default applied; file 3's V1 measures it);
  invocation `/<id>` for skills and agents (the subagents and skills pages, not the plugins reference); the
  marketplace file REQUIRES `owner` (the P8 cell omits it) and `source` may be a directory path; the team
  marketplace route is Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace, group restriction
  under Marketplace Settings → Marketplace Access, the re-index sentence verbatim ("at most once every 10
  minutes, batching rapid pushes to the latest commit"); no minimum version stated on three pages; no CLI
  install, update, rollback or uninstall subcommand documented (`--plugin-dir` loads a local directory;
  `~/.cursor/plugins/local` is the drop directory).
- Codex (developers.openai.com plugins build page and submission pages, learn.chatgpt.com plugins, hooks and
  config-reference pages, the Agent Plugins specification and its 1.0.0 schema, `codex --help` on 0.154.0):
  the root `plugin.json` schema is closed (`$schema`, `name`, `version`, `description`, `author`, `homepage`,
  `repository`, `license`, `keywords`, `extensions`; only `$schema` and `name` required; `author` closed to
  name/email/url; clients never fetch the schema); `extensions.com.openai` carries `apps`, `hooks`,
  `interface`; `hooks/hooks.json` is discovered by default with no manifest field, so the root ships it and
  omits the extension pointer (the two vendor pages disagree on where an override lives; discovery satisfies
  both — a default applied); the twelve event names; `command` and `mcp_tool` handlers run, `prompt` and
  `agent` are skipped; plugin hooks are skipped until the user trusts them; hook commands run with the
  SESSION cwd (which is what P2b's plugin-mode runner assumes); the variable is `PLUGIN_ROOT` (plus
  `PLUGIN_DATA`, and `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` for compatibility), exported to the hook
  process; whether Codex or the shell expands it inside a `command` string is not stated, and the vendor's
  own example writes `${PLUGIN_ROOT}` there. A plugin carries skills only (agents, commands, rules are outside
  the v1 format; the migration page converts them to skills); invocation `$<id>`; skills need a fresh session;
  the IDE extension reads no plugins. Marketplaces: `$REPO_ROOT/.agents/plugins/marketplace.json`, the legacy
  `.claude-plugin/marketplace.json`, `~/.agents/plugins/marketplace.json`; entry `source` kinds `local`,
  `url`, `git-subdir` (`ref` or `sha`), `npm` (`package`, `version`, `registry`) — no `github`, no `archive`;
  `source.path` must start with `./` and stay inside the marketplace root; every entry must carry
  `policy.installation`, `policy.authentication` and `category`, and no entry `version` is documented; an
  unresolvable entry is skipped silently; installs land under `~/.codex/plugins/cache/<marketplace>/<plugin>/
  <version>/`; `codex plugin add|list|remove` and `codex plugin marketplace add|list|upgrade|remove` exist on
  0.154.0; per-repo `[plugins."<name>@<marketplace>"] enabled`; workspace publishing is admin-gated;
  `platform.openai.com/plugins` is the public portal. No minimum version stated on eight pages (`clientFloor`
  stays `unknown`; the inbox row names the next codex minor as the re-check trigger). Drift for P6/P8: the
  plan's fixture path `../dist/plugins/codex` violates the `./`-inside-root rule and would fail silently; a
  marketplace entry alone installs nothing (the leg needs `codex plugin marketplace add` and `codex plugin
  add` in a scratch `CODEX_HOME`); whether `codex exec` loads plugin skills is unproven, so the binary leg
  asserts the installed cache tree against the root and records the exec listing as a measurement.
- Copilot CLI (docs.github.com cli-plugin-reference, hooks-reference, cli-command-reference, the
  plugins-creating, marketplace, add-skills, invoke-custom-agents and install how-tos, about-plugins; the
  Agent Plugins 1.0.0 schema and specification): the exact `$schema` value opts a plugin into Agent Plugins
  1.0; the root `plugin.json` is the closed ten-field schema (`additionalProperties: false`, `author` closed
  to name/email/url, no `logo`, no component path fields — unknown top-level fields are reported and ignored
  by the CLI but refused by the vendored fixture, which is the stricter gate); `skills/` and `mcp.json` are
  fixed portable locations; the client-specific layout table is `com.github.copilot/agents/` (files
  `<id>.agent.md`, confirmed), `com.github.copilot/commands/` (the file extension is NOT stated — the root
  ships the repository surface's `<id>.prompt.md` spelling and the capability file says so; file 3's V1
  measures it), `com.github.copilot/rules/` (a class the plan's cell does not mention; its format is not
  stated and the emitter has no Copilot rule surface, so `rule` is `repository-owned` with the citation),
  `com.github.copilot/hooks/hooks.json` (CONFIRMED; `hooks.json`/`hooks/hooks.json` is the legacy location);
  the hooks file carries `"version": 1`, entries take `type`, `command` (or `bash`/`powershell`, or `exec` +
  `args` without a shell), `cwd`, `env`, `timeoutSec`; `${PLUGIN_ROOT}` (aliases `${COPILOT_PLUGIN_ROOT}`,
  `${CLAUDE_PLUGIN_ROOT}`) is documented for MCP `args`/`env`/`cwd`, agent-frontmatter `mcp-servers` and LSP
  configuration — its expansion inside a HOOK command, and its export to a hook process, are not stated on
  the hooks reference; the root emits the vendor's variable anyway (the only documented handle) and the
  capability file records the unmeasured expansion beside `hooks: carried`; V1 measures it with the binary.
  Marketplace `.github/plugin/marketplace.json`: `name`, `owner { name, email? }`, `metadata { description?,
  version?, pluginRoot? }`, `plugins[] { name, source (a relative path string, or a `github`/`url` object with
  `ref`, `sha`, `path`), description, version, … }` — the P8 cell's shape holds; `copilot plugin marketplace
  add <owner/repo | owner/repo#ref | url | path>`, `copilot plugin install <plugin@marketplace | owner/repo |
  owner/repo:path | git url | ./local>` (alias `add`), `update`, `uninstall`, `enable`, `disable`, `list`;
  installs land at `~/.copilot/installed-plugins/<marketplace>/<plugin>` or `_direct/<source-id>/` for a
  direct install and are CACHED (a local plugin must be reinstalled to pick up changes); skill precedence is
  first-found with the project's `.github/skills/`, `.agents/skills/` and `.claude/skills/` ahead of plugin
  skills, so a discovery leg must run in a scratch directory and assert the installed tree or the plugin
  list, never a bare skill name inside this checkout (Critical for test validity, applied to P5's brief);
  invocation: agents through `/agent`, natural language or `--agent=<id>` (no `@<id>` form), skills and
  commands `/<id>`; `COPILOT_AUTO_UPDATE=false`; the CLI needs Node 22 or later and installs with
  `npm install -g @github/copilot`; no minimum CLI version for plugins on four pages (`clientFloor` stays
  `unknown`); the plugin-client list names the CLI, the cloud agent and the Copilot App — VS Code is not
  listed (an absence, stated as such).

## Wave 1 — returns and integration

### P2a-i — plugin-emitter-modules: DONE (2026-09-20; integrated as `44be331`)

- `scripts/plugins/tokens.mjs` (the eight charter-reference phrases bound to `REPO_SUBSTITUTION_TOKENS` by a
  test; the invariants token refused; `substitute()` reports every unresolved token in order; the token
  pattern bounded to one line because an unbounded match would have swallowed a paragraph),
  `corpusStage.mjs` (the four content classes' `.md` bodies substituted into a temp copy; the charter and
  every non-`.md` file copied byte-for-byte as Buffers; symlinks, `..` and backslashes refused by name; an
  absent or empty fork layer is not an error; deterministic), `capability.mjs` (the REQ-PLUGIN-002 shape in
  fixed key order, `distribution` last and only when given, `invocation` keys sorted for determinism,
  `runtime.path` and `runtime.locator` defaulted centrally; `validateCapabilityFile` names each defect by
  path; the client list read from `scripts/distribution-identity.mjs`), `setupCommand.mjs` (frontmatter
  `description` alone; four numbered steps through `runtime/locate.mjs`, never a bare `stamity` on PATH; one
  client and one root variable per body). 33 tests in `test/ci/pluginModules.test.ts`, red-first at two
  stages (module absent, then stubs — 24 real assertion diffs), two implementation bugs caught by the suite.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,654 passed; the known `test/qa/hookRuns`
  load flake green alone), knip, leak gate 0 hits over 1,495 files.
- Finding (Warning, for P2a-ii): `content/agents/stamity-test-runner.md:79` carries a bare `` `${STAMITY:` ``
  as prose (pre-existing; the dogfood copy ships it), so REQ-PLUGIN-004's literal clause cannot hold over
  today's corpus; the suite pins the one occurrence by name so a reword removes the exception deliberately.
  P2a-ii rewords the line and ships the corpus edit with its dogfood sync, the APM regeneration and the
  goldens. Minor notes for the client units: `invocation` keys are sorted (the cells' orders are
  illustrative); a `.md` companion under a skill is substituted while every other companion is opaque.

### File 2's C1 dispatched beside wave 1 (2026-09-20; worktree `p15s2-c1` from `44be331`)

File 2's first unit (the manifest's optional `plugin` and `gates` fields) shares no file and no contract with
any B1–B3 unit — the only shared shape is `SetupManifest`, which P2a synthesises and which C1 extends
additively — so it runs as a parallel lane rather than waiting behind file 1 (invariant 3: a dependency
edge is the only reason to serialize). Census row: `MANIFEST_FIELD_ORDER` is a total record over
`SetupManifest` bound by two tests (session 1's A1), so C1 extends those two fixtures with valid values for
the new keys — reconciled(2) by construction.

### P7 — runtime-bundle-and-locator: DONE (2026-09-20; integrated as `a5a0c8f` + `c4baf0f`)

- `scripts/plugins/locate.mjs` (builtins only, copied verbatim into every root): the project rule mirrors both
  halves of the repo-root bound (ancestor-or-equal AND a `.stamity/` directory); the companion probe walks to
  the first `package.json` above the project and accepts by a minimal caret comparator (prerelease range
  accepts only an identical prerelease; a prerelease companion is refused under a released range; a companion
  whose entry file is missing is treated as absent); `--print` always emits `runtime.{kind,path,version,refusal}`
  in one shape (`refusal: null` on success, `kind: "none"` on a refusal) and `node.{version,floor,ok}`; the two
  refusal messages verbatim; a spawn through `process.execPath` with `shell: false`, never PATH.
  `scripts/plugins/runtime.mjs` + `scripts/build-plugin-runtime.mjs`: a minimal ustar/pax reader over
  `node:zlib` (no system tar; links, absolute paths, backslashes and `..` refused by entry name), the
  repository lockfile copied in, `npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund`
  run through npm's JS entry under `process.execPath` (the tarball smoke's `execFileSync('npm', …)` has
  never run on the Windows leg — `tarball_smoke` is the ubuntu floor leg only — so the `.cmd` shim is not
  covered there; documented), the prune list extended with the `@types/` scope and every declaration file
  (the plan's list would have kept `@types/node`, installed through the production dependency
  `@types/make-fetch-happen`), `RUNTIME.json` in fixed key order with the installed roster. 44 tests
  red-first (35 failed before the implementation existed).
- Measured: the runtime is 2,595,099 bytes (2.47 MiB) across 427 files, 31 packages, no `sigstore`, no
  `@types/*` — 21 % of the declared 12 MiB budget; `node dist/cli.js --version` prints `1.8.0` from an empty
  directory; the leak gate over the runtime with `--root … --include-build` reports 0 hits across 427 files.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (218 files, 8,666 passed, no floor line),
  knip, build, leak gate, the pack-and-build verify. A missing `--tarball` file and a non-empty `--out` exit
  2 (argument shape, before any work). Unit size 1,654 lines over five files, the plan's own cell.
- Noticed, not changed: `@types/make-fetch-happen` and `@types/node-fetch` sit in `dependencies` (a
  lockfile move for a later unit — inbox); `scripts/tarball-smoke.mjs` still spawns `npm` by name (correct on
  its ubuntu-only leg; a second copy of the pattern `runNpm()` fixes — inbox).

### P2b — hook-scripts-root: DONE (2026-09-20; integrated as `30a844e`; the seam re-sync moved only the stamp)

- `EmissionContext.facts.hookScriptsRoot?: string` on both twins (the CLI-layer `EmissionFacts` in
  `src/cli/engine/emission.ts` is outside the plan's list — one field, the researcher's finding); threaded
  through `HooksPlanContext` at the one planner call site; interchange commands `["node",
  "<hookScriptsRoot>/<file>"]` when set while every script row keeps its repository path; Claude's
  review-gate rows and Cursor's two adapter guards re-rooted too (the `ConfigChange` row re-roots for free);
  every `${NAME}/…` token DOUBLE-QUOTED (the mid-build amendment from the Claude hooks page — an absolute
  install path may carry a space), other `$` tokens single-quoted as before, both `shellWord` twins moved
  together; `portableHookCommand` renders `node "<root>/stamity-portable-hook.mjs" <data>` for every
  telemetry client in plugin mode (codex's `commandWindows` identical, no `-e` starter); the emitted runner
  resolves `${NAME}` from the environment or beside itself, runs a plugin-rooted child with `cwd:
  process.cwd()`, and identifies the core guard by BASENAME across argv (the brief's extra `command[0] ===
  "node"` clause dropped because a gating test proves the missing-executable path with a non-`node`
  argv[0] — a deviation with its reason); Cursor's `isCoreScriptRow` accepts the plugin prefix so
  `failClosed` survives (the researcher's Warning, red-first: `expected true to be undefined`); the guard's
  `POLICY_FILE` line kept byte-identical for the climb test and a `policyDocumentPath()` resolver added
  (plugin root → `hooks/agent-tool-policies.json` when present, oversized or unparseable there is THE
  document). Codex and Copilot adapters untouched (they render only through the runner). 18 files.
- Snapshots: 8 digest rows in the cross-client golden (the four guard bodies, the three runner bodies, the
  fixture manifest's hashes) and 7 byte-exact bodies in the emission golden; no command string and no
  configuration document moved. Dogfood: the claude guard body and two manifest lines; `.claude/settings.json`
  unmoved. Red-first: 2 + 4 + 8 + 11 + 2 cases across five suites; the codex and copilot plugin-mode cases
  went green on first run (they exercise the seam that was red in the runner suite — recorded as the gap).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (216 files, 8,661 passed, no floor line),
  build, sync idempotent, check clean, leak gate, knip, capability matrix byte-identical. At integration on
  the package branch: build, sync (0 updated beyond the stamp, reverted), check clean, and 26 affected suites
  (937 tests) green. Windows: the plugin root stays one opaque `/`-joined string; native joins at run time;
  the CI leg is the confirmation of record.
- Noticed, not changed: a USER hook row under a plugin root would still render the repository runner path
  (unreachable from the generator, which plans over an empty root; pinned as current behaviour); the basename
  identity is slightly broader than the path match it replaced (negligible against the posture flip).

## Pull request (2026-09-20)

- `package-15-plugin-lifecycle-2` pushed at `30a844e` (U0, P2a-i, P7, P2b); pull request #46 opened as a draft
  so every CI leg, the Windows leg included, runs on each integrated wave; it flips to ready once every required
  check is green at the session's head and merges by rebase as #45 did. P2a-ii (worktree `p15s2-p2a-ii` from
  `30a844e`) builds the emitter CLI and the initial client layouts from the four spikes; C1 builds in parallel.

## Review round 1 — wave 1 (`b000bd1..30a844e`), dispatched 2026-09-20

The reviewer, the security lens and the performance lens (each at `claude-fable-5-1`) read the unified diff
(without snapshots, the APM tree and the lockfile) plus the files at HEAD, with the plan cells and this record's
defaults as the contract; the design-quality lens has no rendered surface on this wave and is marked not
applicable.

### Performance lens (fable): no breach; two Minors, advisory

- Budgets: the logic half 1.24 of 2.00 MiB after the two templates grew by about 3 kB (the guard +1.3 kB per
  body for the resolver, the runner +1.65 kB, mostly comment); the runtime 2.47 MiB of 12 MiB; the 20 s
  per-test cap; no budget covers emitted bodies (session 1's standing Minor). `pluginRuntime.test.ts` runs
  `npm pack` and two `npm ci` installs per suite (the second load-bearing for the determinism proof) against
  a warm `~/.npm` cache on CI, in the ordinary parallel pool, first exercise of the npm-beside-node path on
  the Windows leg; wall time per leg unmeasured until PR #46's durations. `pluginModules.test.ts` spawns
  nothing; `pluginLocate.test.ts` spawns 24 builtins-only children under the cap. The tar reader buffers the
  gunzipped archive (about 1.8 MiB for this package, bounded by the dist budgets). The locator is on no hook
  path (three calls per `st-setup` run and file 2's doctor row). Coverage floors: `hooksInfra.ts` branches
  100/100, `planner.ts` 94.35 against 90; no touched file within a point of its floor.
- M-P1 (Minor): `pluginRuntime.test.ts:125,:283` — 60 s spawn timeouts with no per-case override, so the 20 s
  cap fires first on a refusal path (no green-path cost). M-P2 (Minor): `scripts.test.ts:2584-2640` — the
  nine-spawn worktree case, read from the CI durations.

### C1 — manifest-plugin-fields: DONE (2026-09-20; integrated as the commit after `30a844e`)

- `InstallMode`, `INSTALL_MODES`, `INSTALL_MODE_DEFAULT`, `PluginOwnedClass`, `PLUGIN_OWNED_CLASSES` (derived
  from a total record over the content classes plus `hooks`, so a new class is a compile error rather than
  a short list), `PluginClientRecord`, `PluginConfig`, `GatesConfig`; `SetupManifest.plugin?` and `.gates?`
  additive at schema 1.0.0; `MANIFEST_FIELD_ORDER` gains `plugin` then `gates` after `models`;
  `collectPluginErrors`, `collectGatesErrors` (single-line, non-empty, at most 512 characters — the cap the
  plan states and the spec paragraph does not); `readInstallMode`, `pluginOwnedClasses`, `readGates`; the
  preserved-fields extract and apply halves carry both; the public re-exports. 12 new cases red-first (11
  failed before the source), the additivity guard passing by design; the two A1-bound fixtures extended with
  proof that the binding fired (`TS2739` on both without the edit).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (217 files, 8,667 passed, no floor line),
  build, sync (nothing beyond the stamp), check clean, knip, leak gate; the two bound suites 58 passed. On
  the package branch after integration: the manifest and the two bound suites green.
- Noticed: the rule-delivery constants are not re-exported from `src/index.ts` while these are (pre-existing,
  one line, inbox); the three readers have no `src/` consumer until C2 and C3.

## File 2, wave 2 dispatched beside B1's tail (2026-09-20; worktrees `p15s2-c2`, `p15s2-c3`, `p15s2-c6`)

C2 (gates configuration and the charter), C3 (the ownership boundary in emission and the two doctor rows) and
C6 (the setup engine and the capability-file reader) share no file: `KEY_SPECS` is C2's alone, the adapters'
`planResidue` and `DoctorCheck` ids are C3's, `InitApplyOptions.plugin` and the `plugins` registry group are
C6's; C2's one call-site edit in `skillsProjection.ts` touches a file C3 does not. Each reads the P2b as-built
facts (`hookScriptsRoot`, the double-quoted commands) and the P2a-i capability shape from this record.

### Reviewer (fable): request-changes, confidence high on the Critical — 1 Critical, 4 Warnings, 11 Minors

- C1 (Critical): `runtime.mjs` `pruneTree` applies the suffix prune to every file, not only under `node_modules`,
  so the bundled corpus `dist/content/**/*.md` is deleted from the runtime — the `--version` proof reads
  `package.json` alone and could not see it; the header widened the plan's scope unrecorded. W1: the runner's
  plugin branch admits any `${`-prefixed argv[1] (the security lens's W1 shows the injection through a user
  hook row); W2: the guard's container fallback climbs to a path the layout does not hold, so under a client
  that exports no root variable every tool is blocked; W3: `st-setup`'s remedies name a bare `stamity`;
  W4: the capability file's caret grammar refuses the prerelease ranges the locator honours. Minors M1–M11
  ledgered (tar bounds, the any-argv basename identity, the first-package.json walk, silent malformed
  descriptors, a duplicated client list, two validator gaps, an untested cleanup, no npm timeout, an
  empty-string variable short-circuit, the fallback's basename-only subpath, partial output on a refusal).
- Deviations judged: every recorded default right except the prune's widening (wrong, unrecorded) and the
  guard's env-first resolution (incomplete). Repository-mode byte stability verified at HEAD.

### Security lens (fable): two Warnings, one Minor; false-positive estimate 0.4 of 3

- SEC-W1 = the reviewer's W1 with the path: `.stamity/hooks/*.json` rows reach every tool's interchange
  unmodified, `SHELL_CONTROL_PATTERN` refuses `$(` but not `${` or `"`, the launcher gate accepts any
  committed regular file, so a `${NAME:-…}` default expansion inside the double quotes closes the quote
  and hands `node` an inline-code flag — the class `checkLauncherArgv` exists to refuse. SEC-W2: every
  guard, the repository-mode dogfood guard included, reads three vendors' root variables, so a generic
  `PLUGIN_ROOT` in an unrelated environment redirects it to a foreign document; the header line is false.
  Stronger fix offered: resolve the container document as the SIBLING of the script (the runner's own
  posture), removing the environment from the trust computation. SEC-M1 = M1 (tar bounds).
- Verified sound: the anchored quoting rule in both adapters; the runner's plugin-root resolution, spawn
  posture and preserved fail modes; the locator (never PATH, both `STAMITY_REPO_ROOT` bounds, the caret
  rules, the companion boundary stated as the npm route's own trust); the tar reader's type and path
  refusals; the `npm ci` flags and the `npm_execpath` guard; the staging refusals and 0700 temp root; no new
  dependency; the leak gate over the runtime; no credential shape in the new files.

### Fixer round 1 (opus, worktree `p15s2-fix1`): C1, W1/SEC-W1, W2 + SEC-W2 (resolved together as sibling-first, then the climb, no environment read), W3, W4, plus the adjacent Minors M1, M2, M4, M5, M6, M7, M9 and the performance lens's M-P1

Orchestrator's resolution of W2 + SEC-W2, recorded as an amendment to REQ-PLUGIN-005's literal: the guard
resolves the policy document beside itself when a sibling `agent-tool-policies.json` exists (the container
layout every root uses) and otherwise through the repository climb; no environment variable enters the
computation, so a foreign root variable cannot redirect a repository-mode guard and a client that exports no
variable still finds the plugin's document. The runner keeps its environment-then-beside-itself rule for the
SCRIPT path (it must locate a file the client named), narrowed to the shared anchored shape.

## CI on pull request #46 at `30a844e` (2026-09-20)

Every check green: `check (floor, node 22.22.2)`, `check (lts, node 24)`, **`check (windows, node 24)`**, the
three APM routes, DCO sign-off, the PR title check, dependency review, supply-chain currency, the dist size
budget, `all-pr-checks`. The Windows leg is the confirmation of record for P2b's path composition and for P7's
first exercise of the npm-beside-node install path on that runner.

### P2a-ii — plugin-package-emitter: DONE (2026-09-20; integrated as `6b20a32`)

- `scripts/generate-plugin-packages.mjs` (the CLI grammar of the cell plus `--version`; the corpus staged once
  and disposed; a collision refused before any write; one planner per client with
  `hookScriptsRoot: "${<VAR>}/hooks"`; the rendered set written atomically per root; `--check` with the orphan
  rule naming the first differing file and the regeneration command), `scripts/plugins/layout.mjs`
  (`pluginPathFor` dispatching to `clients/<client>.mjs`, every path through `assertSafePath`, an unmapped
  row an error), the four initial client modules from the plan cells and the spikes, 22 cases in
  `test/ci/pluginPackages.test.ts` (determinism, the three `--check` shapes, no token under any root, the
  charter phrase in `claude/commands/st-work.md`, every capability file valid with counts equal to the files,
  root variables in every hook command and no `.stamity/generated` in any, the locator byte-identical, the
  downstream fixture's fork ids and companions, the unknown-token and collision refusals, an empty fork, a
  runtime without `dist/cli.js`). The real build: 4 roots, 1,936 files, `--check` exit 0; the four `classes`
  blocks: claude agent 10 / skill 10 / command 10 / hooks 4; cursor agent 10 / skill 8 / command 10 (as
  skills) / rule 12 / hooks 6; copilot agent 10 / skill 10 / command 10 / hooks 4; codex skill 17 / hooks 4.
- The corpus reword (`content/agents/stamity-test-runner.md:79`) shipped with its dogfood copy, the APM
  agent, 13 golden digest lines (+10 bytes per dialect), one emission-golden line, and three test pins moved
  with inline reasons; the CONTRIBUTING row, the count word and the docs-pages command array landed together
  (the plan's C7 coupling was not real). Defaults recorded: identity fields derived from `package.json` as the
  manifest generator does (the downstream fixture carries no `.claude-plugin/`; pinned equal to the committed
  file); the collision fixture uses two files declaring one id (a case-differing pair collapses on two
  platforms); `.stamity/generated` asserted absent from hook COMMANDS only (the codex config's `description`
  quotes the path in prose).
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,760 passed; one `afterAll` hook timeout in
  `test/upstream/workflowRecovery.test.ts` under full-suite load, 26 passed alone in 131 s — a second file of
  the known load class), build, sync idempotent, check clean, APM `--check`, plugin manifests `--check`, knip,
  leak gate 0 hits over 1,507 files. At integration: build, sync (stamp only), check clean, the plugin suites
  and both golden suites green.
- Noticed (Warning, to P6): the codex hook config's `description` tells the reader the scripts live under
  `.stamity/generated/hooks/codex/`, misleading inside a plugin root. Minors: two CONTRIBUTING count words
  that stayed accurate; the `dist/plugins/` row has no committed artifact or drift gate of its own (P8, file 3).

## Batch B2 dispatched (2026-09-20; worktrees `p15s2-p3`, `p15s2-p4`, `p15s2-p5`, `p15s2-p6`, `p15s2-p8` from `6b20a32`)

P3 to P6 each own their client module (P2a-ii's initial table) and their own test file; P5 and P6 append one dated
paragraph each to `.github/client-contracts.md` under distinct headings and vendor the Agent Plugins 1.0.0
schema at one path with identical bytes (the orchestrator keeps one copy at integration); every schema check is
applied inline from the vendored fixture (no validator dependency); every real-client leg is `describe.skipIf`
on `STAMITY_<CLIENT>_BIN`, runs in a scratch directory, asserts the installed tree or the plugin list rather
than a bare skill name, and records the model's listing as a measurement. P8 codes against the emitter CLI
(the facade hold) with the four spikes' marketplace facts: Cursor's mandatory `owner`, Codex's mandatory
`policy`/`category` and `./`-prefixed `local` path with no entry `version`, Claude's `git-subdir` `ref` and
optional `sha`, the archive and npm variants; a deterministic zip writer in-script. The branch pushed at
`6b20a32` so CI runs on C1 and P2a-ii meanwhile; the fixer round 1 and file 2's C2, C3, C6 continue in parallel.

### C2 — gates-config-and-charter: DONE (2026-09-20; integrated after `6b20a32`)

- Four `KEY_SPECS` rows (`gates.test|lint|typecheck|all`, hint "a shell command line, or `none` to clear";
  `none` drops the key and an emptied `gates` object), `verificationGatesFor(detected, configured = {})` with a
  configured entry outranking detection per key and `all` composed from the merged rows, the charter and the
  skills projection reading `readGates(manifest)` so `${STAMITY:VERIFY_GATE_*}` renders one pinned set
  everywhere, `config detect` never clearing a pin, `config list` printing `detected:` prefixes; the
  configuration page regenerated (4 rows). Red-first across four suites (14 failures before the edits); one
  test file outside the cell's list (`test/emit/skillsProjection.test.ts`, the seam the cell moved but named
  no test for). Deviations with their reasons: refusals exit 1 with `VALIDATION_ERROR` because the CLI retired
  sysexits (the plan's "exit 64" is stale — C9's REQ-LADDER-001 clause carries the same literal and is
  corrected in its brief); `verificationGatesFromManifest` stays in `agentsMd.ts` (wave 6) and the
  projection call site (wave 5) spells the two arguments itself, because the architecture gate forbids a
  5→6 import — a wave-≤5 home with its `PLAN_MAP` row is C4's to add.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (219 files, 8,767 passed, no floor line;
  `skillsProjection.ts` at 95.65 branches against 90), docs regeneration clean in the committed state, build,
  sync (stamp only), check clean, knip, leak gate; byte-identity suites green without `-u`. At integration:
  docs clean, the config, detect, emission and golden suites green.

### C6 — setup-engine: BLOCKED_AMBIGUITY on placement, resolved by the orchestrator as reading R2 (2026-09-20)

- Built and behaviourally green on `p15s2/c6` (`929e56e`: `src/plugins/capabilityFile.ts` — the strict reader
  mirroring the writer's `TOP_KEYS`, `carriedClasses`, `resolvePluginRoot` over the flag then four
  variables; the setup engine; `InitApplyOptions.plugin?`; 35 new cases, red-first; 8,785 passed), but the
  plan's cell places the setup engine at `src/plugins/setup.ts` — the ENGINE layer — while it must import the
  CLI's `init/plan.ts` and `init/apply.ts`: the architecture gate's rule 1 (the engine never imports the CLI,
  no waiver), rule 2 (wave 14 → 14 across units; the registry at wave 12 cannot hold it), rule 5 (a registry
  module with no production call site until C4's verb exists) and the eslint `no-restricted-imports` rule all
  refuse it. Two readings, one of them unbuildable, so no question: **R2** — the setup engine is a CLI-layer
  module at wave 15 (`src/cli/commands/plugin/setup.ts`, the placement `workspace.ts` already justifies for a
  command that drives the emission engine); the capability-file reader stays in the engine with the registry
  group `plugins: { capabilityFile }`; rule 5 stays red on C6's branch by design until C4 lands the verb, so
  C6 and C4 integrate together. Two spec corrections the unit found: REQ-PLUGIN-015 names three root
  variables and the C6 cell four (built to four, `COPILOT_PLUGIN_ROOT` last); the requirement's "a second
  identical invocation exits 0 and reports 0 changed paths" contradicts the plan's own reading (a) — built as
  a refusal (`VALIDATION_ERROR`) that C4 translates into the clean-then-setup sentence.

### P4 — cursor-root: DONE (2026-09-20; integrated after `85aba31`)

- The module refined (the header states `name` as the only required field and that `mcpServers` and
  `variables` exist unused; `clientFloor` gains the citation REQ-PLUGIN-002 demands beside `unknown`;
  `invocation` gains a `citation` naming the subagents and skills pages; the README names the dashboard
  route, `~/.cursor/plugins/local`, `--plugin-dir`, and that no CLI pin command is documented); 22 cases:
  the manifest against the vendored field list, every `.mdc` byte-equal to a cursor-only in-process
  emission with the head rules, `hooks/hooks.json` byte-equal to the adapter's document with `"version": 1`,
  the eight emitted events bound to the adapter's constants and the vendored list, six scripts under
  `hooks/`, `failClosed` on the two guard rows, the whole `skills/` tree equal to the union of the
  vendor-neutral projection, the nine command-skills (each `name:` + `disable-model-invocation: true`) and
  `st-setup`, the logo refusal before the first byte, the `.customize.yaml` patch on the `.mdc` head. Red-first
  4 of 22 against the unrefined module.
- **Measured with the Cursor `agent` CLI (2026.09.15) on this machine:** the brief's literal invocation
  exits 1 on the Workspace Trust prompt — `--trust` (or `--yolo`/`-f`) is required for any headless run (a
  default for every binary leg and for file 3's V1); with it, "list the skills you can invoke" returns the
  eight corpus skills plus `st-setup` and NONE of the nine touchpoints, because those carry
  `disable-model-invocation: true` and the model answers truthfully; asked for every skill the plugin
  provides including the non-invocable ones, it returns exactly the 18 ids in 39 s. That is V1's Cursor
  discovery measurement, taken early: the `/<id>` command surface works on this client.
- Finding (Critical, core seam — fixer round 2): the generated `st-setup` on Cursor ships without `name:`
  and without `disable-model-invocation: true` (the generator applies no per-container transform), so the
  model may invoke a repository-writing setup on its own; the suite pins the gap by name so closing it
  turns the pin red. Minor: `invocation.citation` reads as a class to a naive reader (reserve the key).
- Gates in the worktree: lint, typecheck, the two plugin suites (43 passed, 1 skipped), `test -- --coverage`
  (221 files, 8,791 passed; two known load timeouts green alone — `crossClientGoldens` second-run and
  `workflowRecovery`), knip, leak gate over 1,510 files, plugin manifests `--check`; the binary leg 1 passed in
  104 s with the variable set.
- Noticed: three suites now seed the charter into the downstream fixture (a helper for `downstreamFixture.ts`
  when a third copy is the point — inbox); the adapter suite's documented-events list and the new fixture are
  one transcription in two places; `test/fixtures/` is a new directory.

### P5 — copilot-root: DONE after one core-suite literal (2026-09-20; `069560c` on `p15s2/p5` plus the literal)

- The module refined; 15 cases (the closed Agent Plugins schema applied inline from the vendored bytes —
  sha256 `0a4aad95…`, shared with P6 by identical bytes — with a negative control, the native skills
  projection compared to an in-process copilot-only emission with the one substituted body pinned by name,
  ten `<id>.agent.md`, ten `<id>.md` commands, the hooks file byte-checked with `"version": 1` and the
  vendored camelCase events, hook scripts under `hooks/`, absences, the capability file, the README, the
  binary leg); one dated section on the contracts page. Red-first 5 of 15 against the unrefined module.
- **Measured with GitHub Copilot CLI 1.0.85 on this machine, in a scratch `HOME`/`COPILOT_HOME`:**
  `copilot plugin install <root>` exits 0 unauthenticated ("Installed 10 skills", with a deprecation
  warning for direct installs in favour of `plugin@marketplace`); `copilot plugin list --json` names
  `stamity` 1.8.0; the deployed tree at `~/.copilot/installed-plugins/_direct/copilot/` is byte-identical
  over all 61 files; `copilot skill list` (unauthenticated) shows all twenty ids under "Plugin skills"; the
  decisive measurement — with the plan's `.prompt.md` the ids read `st-ask.prompt … st-work.prompt`, with
  `<id>.md` they read `st-ask … st-work` — the CLI strips exactly one extension, so the root ships
  `com.github.copilot/commands/<id>.md` (the plan's spelling would have shipped instructions naming commands
  that do not exist, 126 times); `copilot -p … -s` exits 1 with "No authentication information found" in a
  scratch home (the prompt leg is logged, never asserted). That is V1's Copilot install-and-discovery
  measurement, taken early.
- The one literal outside the unit (`test/ci/pluginPackages.test.ts:346`, P2a-ii's closed unit) moves with
  P5 with its reason. Findings: the copilot adapter's PascalCase comment restates the wrong vendor fact
  (Warning, fixer round 2); the plan's P5 cell is refuted on the extension and the agent form.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,784 passed; the core-suite literal and the
  known `crossClientGoldens` second-run timeout, green alone), knip, leak gate over 1,510 files; the binary
  leg 15 passed with the variable set.
- Noticed: `test/fixtures/` is a new convention; the copilot root carries the skills' `agents/openai.yaml`
  companions (REQ-PLUGIN-003 makes every companion travel); unit size over the ceiling by the plan's own
  decomposition.

### P6 — codex-root: DONE (2026-09-20; integrated after `d081035`)

- The module refined (`clientFloor` with the build-page citation, `CARRIED_CLASS_REASONS.hooks` naming the
  trust gate and the headless measurement, the README's `codex plugin marketplace add|upgrade`, `plugin
  add|remove`, `/plugins`, the fresh-session rule, the manual setup line, the IDE note), 17 cases (the closed
  schema inline, skills equal to a codex-only in-process projection — 8 + 9 demoted — no agents, commands,
  rules or config in the root, the hooks document with the vendored twelve events, `commandWindows` equal to
  `command`, no `-e`, the description free of the repository path in plugin mode, the capability file, the
  README, the binary leg), one dated section on the contracts page, and one string in `src/adapters/codex.ts`:
  `buildHooksJson(core, hookScriptsRoot?)` derives the description's scripts directory from the context with
  the repository default unchanged (no snapshot moved; the HOOK-5 pin still passes). Red-first 4 of 17.
- **Measured with codex-cli 0.154.0 in a scratch `CODEX_HOME`:** `codex plugin marketplace add <scratch>`,
  `codex plugin add stamity@stamity-test` and `codex plugin list --json` all exit 0 with no login
  (`installPolicy: "AVAILABLE"`, `authPolicy: "ON_INSTALL"` — the vendor example's values `AVAILABLE`,
  `ON_INSTALL`, `Productivity` cited from the build page); the installed cache root
  `<CODEX_HOME>/plugins/cache/stamity-test/stamity/1.8.0` is byte-identical over 48 files; the home config
  gained the marketplace and plugin tables; `codex exec` refused with 401 in the scratch home and hit a usage
  limit with the operator's credential carried in once (removed afterwards) — whether `exec` loads plugin
  skills stays unproven (the inbox row names the next codex minor as the re-check for the floor and for this).
- Gates in the worktree: lint, typecheck, the targeted five suites (239 passed, no snapshot moved),
  `test -- --coverage` (8,787 passed; two `afterAll` hook timeouts of the known load class, green alone with
  a longer hook budget — fifteen worktrees were active on the machine), build, sync (stamp only), check clean,
  knip, leak gate; the binary leg 17 passed with the variable set.
- **Process incident (Critical, process):** git's stash stack is one per repository, shared by every
  worktree; P6's `git stash push`/`pop` for a red-first baseline received the C3 lane's working set, pushed
  in between. P6 recovered it in full (stashed back as `stash@{0}` with a RECOVERED message, a patch copy in
  the scratchpad; six files in its own commit, verified). Every in-flight lane was told to never use
  `git stash` (a patch file plus `git restore` instead) and C3 was told where its work sits; a learning is
  captured at the close. Two writers on `src/adapters/codex.ts` in this wave (P6's string, C3's residue
  filter) — different regions, reconciled at C3's integration with the adapter and golden suites as the check.

### P3 — claude-root: DONE (2026-09-20; integrated after `dd00eaf`)

- The module refined (`DISTRIBUTION` with the marketplace route and rollback stated as not established, the
  README quoting it, two header corrections), 20 cases (the vendored SchemaStore manifest schema — sha256
  `3f69938d…`, draft-07, 22 properties, `name` the only required key, no `rules` property — applied inline
  with a reader that rejects a manifest without `name`; `agents` entries under both patterns; `commands` under
  `^\./`; `skills`, `hooks`, `rules` absent; `hooks/hooks.json` events members of the schema's 29-value enum
  with the review-gate and `ConfigChange` rows and a kept `matcher`; ten agents, nine commands plus
  `st-setup.md`, the eight skills plus the two demoted rule-skills and nothing else; no rules, MCP, charter or
  bridge file; the README; the capability file with the 2.1.224 archive-source floor and the `@stamity:<id>`
  form; a restricted-`tools:` agent absent through the downstream fixture with an unrestricted sibling); a
  `test/fixtures/plugins/README.md` with the fetch provenance. Red-first 3 of 20 plus six perturbation
  probes, each reverted.
- **Measured with Claude Code 2.1.278:** `claude plugin validate --strict <root>/claude` prints `✔ Validation
  passed` and exits 0; the same root with the `./` prefixes stripped and a missing entry fails with eleven
  named errors — the leg distinguishes. The `-p` invocation leg stays with file 3's V1.
- Finding (Warning, fixer round 2): the schema's own descriptions call `commands` (and `agents`) additive to
  the default scan, against the reference page's "replaces"; the safest manifest declares no component field
  and relies on discovery, with `validate --strict` re-run as the check and V1 counting `st-work` once.
  Process note: the session scratchpad is shared by every lane — P3's first fetch was overwritten by a
  sibling's files; every later brief names a private scratch subdirectory.
- Gates in the worktree: lint, typecheck, the two plugin suites (42 passed with the binary armed),
  `test -- --coverage` (8,790 passed; the known load class in a varying set, green alone), knip, leak gate.

## CI on pull request #46 at `6b20a32` and `d081035` (2026-09-20)

Every check green at both heads (the Windows leg included; the Pages deploy skipped by design on a pull
request): the emitter core (P2a-ii) and the C1 manifest fields at `6b20a32`; C2 and the cursor root (P4) at
`d081035`. The head with P6 and P3 (`03dade4`) pushed next.

### C3 — ownership-in-emission-and-doctor: built in full, blocked on three registry lines, assigned back (2026-09-20)

- Three commits on `p15s2/c3` (`2e30b12`, `a004040`, `2c34158`; 21 files): `src/emit/ownership.ts`
  (`isPluginOwned`, `sharedProjectionOwners`, `pluginOwnedSummary`; 100 % on every axis against its 100/100
  floor), one predicate `withoutPluginOwnedRows` applied over each adapter's finished row set with a
  per-adapter `HOOK_INFRA_ARTIFACT_IDS` set for the hook rows (`.claude/settings.json` and
  `.codex/config.toml` deliberately off both lists — each carries repository configuration too; claude's
  settings split into its `permissions` half always and its `hooks` object only when not plugin-owned; a
  pack skill row exempt), the shared `.agents/skills/` tree written while any reading client still owns
  `skill` and co-owned by exactly those, `check`'s `plugin-runtime` (the locator's `--print` through
  `process.execPath` with a 5 s timeout; `warn` without a root; `fail` on a refusal or a major mismatch
  against `generatedBy`) and `plugin-duplicates` (ledger, apm, unmanaged with the three remedies; `warn`
  under `generated`, `fail` under `plugin-backed`; the census array 11 → 13; the guide's doctor table and
  its sample transcript re-taken), `clean -y`'s uninstall lines (`codex plugin remove stamity@<your
  marketplace>` from `codex --help`, the cell's `/plugins` wording superseded), the sync report's
  `plugin-owned` line and `clean --json`'s `pluginUninstall`, a whole-tree sha-256 map proving `check` changes
  no file, and a planning warning when a user or pack hook row cannot reach a plugin-backed client. Red-first
  across nine suites (one intermediate red shaped the `exemptPaths` design). Two files outside the cell's
  list with reasons (`boundaries.test.ts`'s `PLAN_MAP` row as briefed; `syncEngine.test.ts` for the report
  seam the cell named no test for). Every existing test edit justified inline; nothing weakened.
- The block: `test/composition/root.test.ts` derives registry membership from disk and wants an
  `emit.ownership` entry in `src/composition/root.ts`, a file the plan gave C6; C6's worktree cannot import a
  module that exists only on C3's branch, so the three lines are C3's — assigned back as a fourth commit.
  Gates otherwise: lint, typecheck, build, sync (stamp only), check clean with one advisory warning, knip,
  leak gate; the coverage run did not complete on the red suite (re-run with the fourth commit); the
  cross-client all-four second-run case reproduced its 20 s timeout on the UNTOUCHED base (pre-existing,
  at the ceiling on this machine).
- Noticed: the apm duplicate match is exact on the full package name (the plan's mirror example is not
  detected — the safe direction); an unparseable `apm.yml` reports nothing; `[features] hooks = true` stays
  in a plugin-backed codex config (not live); the shared skills tree yields one line per reading client.
- P5 integrated as `39857a3` + `75b7727` after `03dade4`: the shared Agent Plugins schema fixture merged to one
  file (identical bytes, sha256 `0a4aad95…`), both contracts-page sections in place (Codex at :44, Copilot at
  :112), the three suites green (93 passed, 1 skipped). Branch pushed at `75b7727`. The fixtures README gains a
  section per parallel fixture in fixer round 2.

### C6 — setup-engine: restructured under R2, DONE with the two expected architecture reds (2026-09-20; `929e56e` + `1162a33` on `p15s2/c6`)

- `src/cli/commands/plugin/setup.ts` (wave 15; imports the reader, `types/*`, `init/apply.ts` and
  `init/plan.ts` — every edge same-unit or strictly earlier, none leaving the engine for the CLI),
  `src/plugins/capabilityFile.ts` (engine, wave 2, in the registry group `plugins: { capabilityFile }`),
  `InitApplyOptions.plugin?`, the moved test `test/cli/commands/pluginSetup.test.ts` (the fork-identity gate
  reached it the moment it entered `test/cli/` — the fixture now derives the companion package name from
  `package.json`), the `PLAN_MAP` rows, `.oxlintrc.json`'s derived deny-lists. Full suite 8,786 passed with
  exactly two reds — rule 4 (`src/cli/commands/plugin/setup.ts` unreachable from an entrypoint) and rule 5
  (`src/plugins/capabilityFile.ts` registry-wired with no production caller) — one fact in two hats, both
  closed by C4's verb, which imports the setup engine as a sibling CLI module and adds `status` beside the
  reader. Coverage: the setup engine 100/100, the reader 95.2/93.6. Disclosure: one `git stash push`/`pop`
  on a single file before the process notice, popped clean (verified against the commit's nine files).
- Consequence for C4's cell: the registry group holds `capabilityFile` (and `status` only if `status` can
  live in the engine — it cannot, because it reads C3's duplicate scan in `check.ts`; `status` is a CLI-layer
  sibling too), and `setup` is imported from `./plugin/setup.ts`.

### Fixer round 1: the Critical, every Warning and the adjacent Minors fixed (2026-09-20; integrated as `cd3f085` … `d530f90` plus the seam commit)

- C1: the prune gated on `insideModules` for files and directories alike; the header rewritten ("under
  node_modules only"); three new cases including a standalone `init -y --tools claude` from the built runtime
  in a scratch `git init` repository (the pre-fix runtime failed it with "Charter template not found" — the
  `--version` proof had read `package.json` alone). The runtime now 631 files, 3,314,634 bytes (3.16 MiB of
  12), 50 corpus bodies under `dist/content/`. W1/SEC-W1: `ROOT_VARIABLE_PATH` declared once in
  `portableRunner.ts` and imported by both adapters (the twin declarations and the deferral note retired);
  the plugin branch on a FULL match only, everything else through the repository rendering; the claude
  negative table ported with the injection shape (`${NAME:-"} -e "…"`) asserted to render the repository
  runner and never to reach the shell; `SHELL_CONTROL_PATTERN` refuses `${`. The `"` half REJECTED with
  reasoning: it broke the gating quoting table (`say "hi"` re-split through `/bin/sh`), `"` carries no
  expansion, every renderer single-quotes it, and refusing it would reject an ordinary exec-form argument —
  pinned both ways. W2 + SEC-W2: the guard resolves the document beside itself, else the climb; the
  environment read deleted (M9 moot); the header says no variable selects the document; the container case
  runs from a temp `hooks/`, three foreign-variable cases prove no effect. W3: both remedies through the
  locator with the P2a-i pin moved. W4: the caret grammar admits a prerelease; `version` validated. M1 (tar
  bounds and the pax size), M2 (`basename(command[1])` only, a launcher named after the guard does not claim
  its posture), M4 (a malformed descriptor warns by name), M5, M6, M7 (the cleanup case, mutation-checked),
  M-P1 (paired timeouts from one derived constant). Every existing test edit carries its inline reason.
- Snapshots: the two golden files' guard and runner rows only (guard 8,581 → 8,871 and 8,346 → 8,636 bytes;
  runner ~16,749 → ~16,959); the dogfood guard body and its manifest hash. At the seam the fixer's snapshot
  and manifest hunks collided with P2a-ii's reworded agent hashes (the fixer branched at `26a1872`); both
  regenerated on the integrated tree and verified to move only those rows.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,769 passed, no floor line; the all-four
  second-run golden case at the 20 s cap — measured 12.7 s and 26.5 s back to back on the same tree and
  12.1 s on the base sources: pre-existing, unrelated, wants a per-case timeout), build, sync idempotent,
  check clean, knip, leak gate, the pack-and-build verify and the corpus-reading `init`. The fixer never
  used `git stash` (baselines through `git checkout <base> -- src`).

## Review round 2 — wave 2 (`30a844e..f21e4d3`, 14 commits), dispatched 2026-09-20

The reviewer, the security lens and the performance lens (each at `claude-fable-5-1`) over the unified diff and
the files at HEAD: C1, the emitter core, C2, the four client roots with their suites and fixtures, fixer round
1 and the seam regeneration; the round-1 closures to be verified at the code; the rows already routed to fixer
round 2 named so they are not re-raised. C3 (four commits), C6 (two), P8, C4, C9 and P9 join round 3.

### P8 — distribution-root-and-catalogs: DONE (2026-09-20; integrated after the fixer seam)

- `scripts/plugins/zip.mjs` (a deterministic writer: sorted entries, one fixed mtime from the source commit
  date, deflate through `node:zlib`, CRC-32 in-script; the first run was red on a real defect — a signed
  32-bit shift of the POSIX mode, fixed with `>>> 0` and its reason), `scripts/plugins/catalogs.mjs` (the four
  renderers with the spike facts: Claude `git-subdir` with `ref` and `sha` when the distribution commit is
  given, `archive` with `sha256` and no `ref`, `npm` with `registry` only off the default; Cursor with the
  REQUIRED `owner`, `metadata`, a relative path; Copilot with `owner`, `metadata`, a relative path; Codex with
  `interface.displayName`, the mandatory `policy.installation: AVAILABLE`, `policy.authentication: ON_INSTALL`,
  `category: Productivity` from the vendor example, `local`/`git-subdir`/`npm` sources, NO entry version —
  the requirement's "every entry's version equals the release version" cannot hold for Codex, recorded),
  `scripts/build-plugin-distribution.mjs` (the emitter spawned per client, the APM package into the same root,
  four archives with `<archive>.sha256`, `release.json` validated before writing, the four catalogs, the
  README with each client's four commands, the APM install spec, the https-only `git-subdir` bound and the
  private-mirror route), `stamity.distribution.ownerEmail` (optional, refused non-echoing when malformed —
  P1's identity extended by one key, its own tests untouched), 23 cases (three mutation-verified: the fixed
  mtime, the Codex default source, the digests). The real build: four archives (894–1,011 kB, 471–497
  files), `shasum -c` four OK, `unzip -t` clean, `release.json` as the schema states, `--check --out-dir` of
  the APM generator exit 0 on the built tree.
- Gates in the worktree: lint, typecheck, the plugin suites (111 passed, 2 skipped), `test -- --coverage`
  (221 files, 8,794 passed, 96.51 % statements, no floor line), plugin manifests `--check`, knip, leak gate
  over 1,511 files. One `git stash push -u`/`pop` before the process notice, verified clean afterwards.
- Not changed, with reasons: the private-fork `github` source's `ref` (the inbox row) — that entry addresses
  the SOURCE checkout (`content/…` paths), which no `plugins/v*` tag satisfies; the only self-consistent pin
  is `v<version>`, and the fork guide states no tagging convention; the row is retired against the
  distribution catalogs at the close or re-opened as a fork-tagging item. Noticed: `scripts/apm-install-smoke.mjs`
  lists its source through `git ls-files`, so a freshly built distribution root exports nothing until it is
  `git init`ed (the skipIf leg does so; P9's brief says so); the checked-in `.claude-plugin/marketplace.json`
  and the distribution's copy share a path but address different trees (every README route names a ref);
  reproducibility is byte-identical within one Node/zlib version.

### C3 and C6 integrated (2026-09-20; C3 as `4d97c53` … `efa98f2`, C6 as `a9a7fa6` + `7166fe4`)

- C3's fourth commit wired `emit.ownership` into the registry (three lines plus the doc comment), and a
  fifth covered the new hooks-plan disclosure the coverage run exposed (`hooksInfra.ts` back to 100/100);
  the full suite in the worktree 8,796 passed with every `src/emit/**` file on its floor. Both cherry-pick
  sequences applied without a conflict: the two-writer file `src/adapters/codex.ts` (P6's description
  string, C3's residue filter) merged in disjoint regions, and the adapter, emission, composition,
  architecture, check, clean, sync-report, docs-pages and hooks suites (30 files, 1,136 tests) are green on
  the integrated head; build, sync (stamp only) and check green. C3's stash entry (the RECOVERED one)
  confirmed its own and dropped; the stack is empty. C6's two expected architecture reds now sit on the
  package branch until C4 lands; the branch is pushed for CI knowing those two cases are red at this head.
- Noticed at the seam: `stamity check` on this repository (generated mode, no plugin client recorded) now
  prints the `plugin-runtime` advisory warning on every run — the cell prescribes the `warn`, but a
  repository using no plugin has nothing to act on (Minor, to the next fixer round: `pass` with the note
  when the manifest records no plugin client).
- Worktrees: `p15s2-c9` cut at `efa98f2` (C3 in, C6 not — a green tree for C9, dispatched); `p15s2-c4` cut
  at `7166fe4` (both in — C4 turns the two reds green).

### Security lens, round 2 (fable): one Warning, four Minors; every round-1 closure verified sound

- SEC2-W1: the generated `st-setup` body's step 3 says "stop for the operator" and then phrases the three
  remedies as imperatives to the reader, `clean -y` (non-interactive, removes ledger rows and their files)
  among them — reword them as what the operator runs and restate the stop. SEC2-M1: the guard follows a
  symlinked sibling document (refuse a link as `userHooks.ts` does). SEC2-M2: the codex and copilot binary
  legs spawn with the whole ambient environment (an allowlist). SEC2-M3: the generator's `fail()` exits inside
  the `try`, skipping the staging `finally` (throw instead). SEC2-M4: a pinned gate command is rendered
  unescaped (refuse a backtick and the token prefix). Verified sound: one home for `ROOT_VARIABLE_PATH`, the
  full-match branch, the injection shape single-quoted and refused at ingress, the `"` rejection (no
  expansion; every argv renderer single-quotes it; codex and copilot carry the row base64url and spawn
  without a shell), no environment read in the guard, the tar and prune posture (a link is never followed or
  placed), every placement through `assertSafePath`, the runtime walk dropping links, no credential shape in
  the identity, no new dependency. Noted: the leak gate is not asserted over the built roots by any suite.

### Performance lens, round 2 (fable): no breach; two Warnings and four Minors, advisory

- W-P1: the core suite's `--check` case renders all four roots four times (the generator renders before it
  checks) under a timeout derived for one build. W-P2: the golden all-four second-run case wants the 120 s
  per-case timeout its own hook carries (pre-existing; the per-case timeout, not the pool, is the lever —
  on Windows the golden already runs alone). Minors: the generator imports its module graph before parsing
  arguments; the copilot suite plans twice; the emitter's unbounded `Promise.all` over ~700 files per root
  with the real runtime; `skillsProjection.ts` one uncovered statement from its 98 floor. Counts: the core
  suite runs six four-root renders plus one; each client suite one root; `verificationGatesFor` runs at
  most six times per emission, never per row; the runtime Buffers are shared by reference across the four
  roots. A `globalSetup` fixture cache is the right shape when a sixth spawning suite lands (file 3's V1).

### Reviewer, round 2 (fable): request-changes, confidence high on W-1 and W-2 — 3 Warnings, 14 Minors; every round-1 closure verified

- W-1 = the security lens's M3, elevated: four in-render refusals call `fail()` inside the `try`, so the
  staged corpus and the plan root outlive a collision, an unmapped row, a missing logo or a capability
  defect (the suites reproduce it on every run); throw and let the outer `.catch(fail)` run after the
  `finally`. W-2: `readRuntime` proves the required files with `stat` while the copy walks with
  `isFile()`, so a symlinked `dist/` passes the refusal and ships a root without its runtime; refuse a link
  by name and `lstat` the required files. W-3 (the residual on SEC-W2's closure): a stray sibling document
  beside a repository-mode guard redirects it with no ledger or probe seeing it — prefer the sibling only
  when the repository document does not exist (a plugin root's climb target never does), and refuse a
  symlinked sibling. Minors M-a to M-n ledgered (the `.stamity/` catch-all, a third client list, `+build`
  and date validation, three test-quality items, the Cursor leg's real HOME, a non-array TypeError, the
  codex README's shell variable and cache path, the pax read order, the write boundary, the REQ-PLUGIN-005
  literal, a message name). Every round-1 closure verified closed (C1 with the note that the
  corpus-reading `init` proof runs only after a build in that checkout — the synthetic prune case is the
  gate; M5 half, the layout list); the `"` rejection judged right; every recorded deviation judged right
  with its reason, the W2 amendment incomplete only in that it is not written back to the plan.

### Fixer round 2 (opus, two file-disjoint lanes from `7166fe4`): the emitter lane and the engine lane

Emitter lane (`p15s2-fix2a`: scripts/plugins/**, the generator, the plugin suites, the fixtures README, the
capability reader): the Cursor `st-setup` decoration (Critical), the claude manifest's component fields,
SEC2-W1's remedy wording, W-1, W-2, W-P1, `invocation.citation`, the env allowlist, the arg-parse order,
bounded concurrency, the copilot double plan, M-a to M-e, M-g, M-h, M-j, M-l, M-n, the fixtures README.
Engine lane (`p15s2-fix2b`: src/hooks/scripts.ts, src/adapters/copilot.ts, src/manifest/manifest.ts,
scripts/plugins/runtime.mjs, the golden suite, their tests, the dogfood sync): W-3 with the symlinked
sibling, the copilot PascalCase comment, the gate-command backtick and token refusal, M-i, M-k, W-P2. C4
takes the `plugin-runtime` advisory (it owns `check.ts` now). The spec-author takes M-m and the other
spec-text rows at the side-effects step.

### Fixer round 2b (the engine lane): DONE (2026-09-20; integrated as `b836a2b` … `d85881e`)

- W-3/SEC2-M1: the repository policy document outranks a stray sibling (the sibling is reached only when
  the `../../` climb target is absent — plugin mode), a symlinked sibling is refused as `POLICY_INVALID`
  through `lstatSync` before any read, the `POLICY_FILE` line byte-identical, the header restated;
  red-first 2 cases (a planted sibling denied `Edit` under the old resolver; a link was followed). The
  copilot comment restated to the measured fact (the casing selects the payload format; safe because the
  runner injects `hook_event_name` and `session_id`) with the 2026-09-20 citation — the `citations` row's
  2026-09-17 date stays because `test/adapters/copilot.test.ts:1026-1028` pins it deliberately for the
  whole-page re-attestation (the fixer stopped at the boundary rather than edit a gating pin outside its
  set; accepted). SEC2-M4: a backtick and the `${STAMITY:` prefix refused in a gate command by name. M-i: a
  non-array `classes` reads as owning nothing while validation still names the defect. M-k: every tar body
  bounds-checked before it is read (pax included) and an archive without the two zero blocks refused by
  name, three synthetic cases plus the control. W-P2 and M-P2: the golden second-run case carries the
  fixture timeout; the nine-spawn worktree case a timeout derived from the herd case's own numbers.
- Snapshots: the four guard bodies (+1,332 bytes each) and the fixture manifests' hashes; the dogfood guard
  and two manifest lines; nothing else. Gates in the worktree: lint, typecheck, `test -- --coverage`
  (8,988 passed with exactly the two expected architecture reds and one `afterAll` load flake green alone;
  no floor line), build, sync idempotent, check clean, knip, leak gate over 1,528 files. At integration:
  build, sync (stamp only), check, and eleven affected suites (574 tests) green; pushed at `d85881e`.
- Noticed: `parsePaxRecords` still breaks silently on a malformed record (a later round); the
  container-sibling case's comment describes a seed that decides nothing.

### P9 — release-workflow-distribution: DONE (2026-09-20; integrated as `361142a`; the rehearsal green)

- `release.yml`: in the gates job after the pack, `Build plugin runtime` (`dist/plugin-runtime` — under the
  ignored `dist/`, not the plan's bare directory, which the leak gate's `git ls-files --others` scan and any
  cleanliness check would see), `Build plugin distribution` (`dist/plugins`, the source commit and its
  committer date), `Upload plugin distribution` (`release-plugins`, 7 days, fail on empty, and
  `include-hidden-files: true` — every catalog path and the APM tree are dot directories, which
  `actions/upload-artifact` drops by default; without it the branch would have shipped with every catalog
  missing and every gate green; the rehearsal log shows 2,825 files uploaded), four job outputs read back
  out of the manifest so the workflow never spells the branch or the tag; in the publish job after the npm
  publish, `Download plugin distribution`, `Verify plugin distribution digest` (the manifest against the
  outputs channel, then every archive against the verified manifest), `Attest plugin archives`
  (`actions/attest-build-provenance@4d101475…` v4.2.2 pinned by sha, `subject-path: plugins/*.zip`,
  permissions `attestations: write` AND `artifact-metadata: write` — the action's README requires the
  second for the storage record, a deviation from the brief with its reason), `Push plugin distribution`
  (an orphan commit made DETERMINISTIC by taking both git dates from `release.json`'s `sourceCommitDate`, so
  a re-run reproduces one sha and the tag guard's idempotent arm is reachable; the remote read with
  `ls-remote` before any push; the branch replaced by design, the tag created once and failing closed when
  it names another commit; `git add -A -f` against a dependency's own `.gitignore`), `Stamp the release
  manifest with the distribution commit` (a one-field stamp that refuses a manifest not carrying `null` —
  the publish job checks nothing out, so no re-render and no builder flag), the three asset globs on the
  release; the dry-run summary prints the branch, the tag and the four archives. Egress: the attestation
  and the push reach `api.github.com`, `github.com` and Sigstore's public-good instance — all already
  allowed for npm provenance and `gh release create`; the policy stays `block`; the observed-endpoint
  evidence is deferred to the first real release (a rehearsal never reaches the publish job). The
  checklist paragraph, the egress page and the fork guide's "ship your fork's plugin distribution" section.
- Tests: 7 static cases plus an executed suite of 6 (the push and stamp steps' own shells run verbatim
  against a scratch bare remote through `url.…insteadOf` in a scratch global git config: first push creates
  both refs from a parentless commit with the dot directory present, a second identical run moves neither,
  a tag naming another commit exits 1 and leaves the branch uncreated, the stamp writes one field and
  refuses a stamped or non-sha manifest); two existing cases extended with their inline reasons (the
  publish grants; the summary field list grew); the canonical guards unchanged. Red-first: a collection red
  before any workflow edit, then four mutation probes. The four new shells were also executed verbatim
  out of the parsed YAML against a real local build before the CI attempt.
- **The rehearsal:** `gh workflow run release.yml --ref p15s2/p9 -f dry_run=true` accepted from the
  non-default branch — https://github.com/zomarit/stamity/actions/runs/35511867841, success in 4m29s: the
  runtime 631 files / 3,316,370 bytes, the four archives (675–701 files, 1.22–1.34 MB), the manifest digest
  on the outputs channel, `PLUGINS_BRANCH: plugin-dist`, `PLUGINS_TAG: plugins/v1.8.0`, the four archive
  names, "Would publish the distribution as plugins/v1.8.0 on plugin-dist"; `git ls-remote` shows no
  `plugin-dist` and no `plugins/*` tag — nothing pushed. One attempt used. The throwaway branch deleted
  from the remote after integration.
- Gates in the worktree: lint, typecheck, the targeted four suites (225 passed, 1 skipped),
  `test -- --coverage` (8,914 passed, zero failures; two known `afterAll` load flakes green alone), knip,
  leak gate over 1,522 files. At integration: the workflow and docs-pages suites green (184), pushed at
  `361142a`.
- Follow-up taken (a Warning the unit raised): the artifact download and digest check move AHEAD of the
  npm publish so a missing or corrupt artifact fails before the one irreversible step — a further commit
  from the same lane. Noticed: `actions/attest-build-provenance` v4 is a wrapper over `actions/attest` (a
  later one-line pin swap); the fork section has no docs-pages pin (C7's file); the hand page's
  re-attestation stamp stays with the release-cut ritual.

### C4 — plugin-verb: DONE; C9 — effort-scale: DONE; the P9 reorder (2026-09-20; integrated as `1900296` … `3f76070`)

- P9 follow-up `1900296`: the artifact download and the digest verification now precede the npm publish
  (those two steps can only refuse, and a refusal after npm had published would strand a version no
  re-run can finish); the two order assertions moved with their reason; every other pin unchanged; the
  rehearsal evidence stands (a dry run never reaches the publish job).
- C4 (`9dd589c`, `ea998e9`): `src/cli/commands/plugin.ts` (the verb after `worktree`; `status` default and
  `setup`; workspace.ts's `USAGE` refusal shape, which the funnel reports as exit 1 — the cell's "exit 2"
  does not exist in this CLI), `src/cli/commands/plugin/status.ts` (CLI layer, wave 15 — the plan's engine
  placement impossible one level removed from C6's reason: the duplicates scan composes a remedy through
  the CLI's package-name kit), `src/cli/commands/plugin/probe.ts` (wave 14, the one home `check` and
  `status` both read: `probePluginRuntime`, `collectPluginDuplicates`, the four root variables — extracted
  from `check.ts`, −453/+115, every doctor row's bytes unchanged and its 63-case suite green), the
  `plugin-runtime` row `pass` when no client is recorded and no root is set (the dogfood check prints no
  advisory warning now; three absence states pinned), the setup engine's `PLAN_MAP` row re-keyed to C4
  (a same-wave cross-unit edge otherwise, with authorship kept in the comment), the seven verb pins moved
  (`Ten advertised, twelve registered`; `ADVERTISED` and the two literals; the regenerated CLI reference —
  the docs-pages verb arrays and prose are C7's), C6's parked ownership case un-skipped unaltered and
  green. The clean-then-setup sentence renders through `packageCommand()` (a renamed fork reads its own
  name; a bare `stamity` names a binary a reader may not have) — a literal deviation with its reason;
  `plugin setup` is prompt-free (the planner it calls asks nothing), so `-y` is inert; `compatibility.state`
  gains `not-applicable`; `unconfigured` names detected facts with `config detect` and gates with `config
  set gates.<k>`, a pinned gate never listed, nothing listed before a manifest exists. 24 cases, red-first
  across three mutations (10 of 24 red); full suite 9,011 passed, the two architecture cases green.
- C9 (`f70d092` … `3f76070`): `EFFORT_LEVELS` six-wide with `effortRank`; `effortScale` and a separate
  `effortScaleCitation` per projection row (the scale pages differ from the rows' key pages, and the claude
  suite pins every row citation to 2026-09-10 — re-dating a claim nobody re-read was refused, so the scale
  carries its own citation; copilot `null`); `nearestExpressibleEffort` (down to the ceiling, up to the
  floor), `effortDisclosures` spliced beside the hooks warnings, the clamp on both carriers; `config set`
  refuses an inexpressible level (exit 1, `VALIDATION_ERROR` — the plan's 64 corrected) naming the client
  and its bound in both directions; `(clamped from …)` in `config list`; the three carrier adapters
  publish an `effort-scale` cap; the configuration page and the capability matrix regenerated. One file
  outside the cell (`test/types/domain.test.ts` pinned the three-level tuple and asserted `xhigh` absent —
  moved with its reason, the negative probe on spellings no client documents). 18 failures red-first; two
  real defects in the unit's own tests caught (the frontier rung is a flow placement no agent file declares
  — the emitted proof rides `advanced`). Full suite 8,979 passed. Noticed (Minor): a C1 test is now named
  for "the three the clients share" and asserts the old substring (still green, false in scope).
- At integration: typecheck, 50 suites (2,054 tests), build, sync (stamp only), check clean with no
  advisory, the four regenerated docs pages and `llms.txt` byte-identical; pushed at `3f76070`; the C7
  worktree cut there.

## Side effects — the spec-delta merge (spec-author, opus, worktree `p15s2-spec`; 2026-09-20)

- One dated `As built (2026-09-20):` paragraph appended under every requirement this session built
  (REQ-PLUGIN-001 to -019 and -026 in `docs/specs/plugin-lifecycle.md`, REQ-LADDER-001 in
  `docs/specs/model-ladder.md`), each naming its deviation from the literal and the reason; a
  `Measured early (2026-09-20)` note under REQ-PLUGIN-020 carrying the four client measurements as V1's
  inputs, not its proof; two requirement literals amended with their ledger evidence — REQ-PLUGIN-005 (the
  repository's own document when the climb finds one, the sibling beside the script otherwise, no
  environment variable) and REQ-LADDER-001 (exit 1 with `VALIDATION_ERROR`); the plan cells of P2b, P3–P9,
  C2, C3, C4, C6 and C9 restated to the as-built interfaces; both specs stay at `status: design`.
- Five contradictions the author found and resolved in favour of what shipped, each recorded in the
  paragraph rather than glossed: C3's `warn` versus C4's `pass` for `plugin-runtime` without a recorded
  client (C4 owns the file at the end); C4's cell demanding both "0 changed" and a refusal on a second
  `plugin setup` (built as the refusal); REQ-PLUGIN-026's "golden unchanged" versus the three units that
  moved the guard and runner bodies by design (qualified: no snapshot row moves except where a named unit
  regenerated it); REQ-PLUGIN-010's universal entry version against Codex's catalog; REQ-PLUGIN-002's
  unconditional citation against the validator's optional one. Items with no requirement to carry them
  stated, none invented: U0 and the two learnings, the leak gate not asserted over a built root, the APM
  smoke's `git ls-files` listing, `dist/plugins/` without a drift gate, the codex config's features key in
  plugin-backed mode, the timeout and flake rows, the process incidents.
- The structural checker passes the three 008 plan files against `docs/specs/` with no finding; the spec
  status, authoring, docs-pages suites green (95); the leak gate 0 hits. Committed and integrated onto the
  package branch, pushed.

### Fixer round 2a (the emitter lane): DONE (2026-09-20; integrated as `d538a0b` … `9603ea7`)

- The Critical: a container may export `SETUP_COMMAND_FRONTMATTER`, which the generator hands to
  `renderSetupCommand(client, rootVar, decoration)`; Cursor declares `name: st-setup` and
  `disable-model-invocation: true`, rendered in the adapter's own key order, an undeclared key or a
  decoration over `description` refused; the P4 pin flipped positive and a per-client negative added. W-1: the
  five in-render refusals throw and the outer `.catch(fail)` prints after the unwind, proven with a probe
  that gives the spawned generator its own temp directory. W-2: the runtime walk refuses any entry that is
  neither a regular file nor a directory, by name; the two required files `lstat`ed; `node_modules/.bin`
  the one documented exception (the real runtime carries two links there; 634 files, 2,764 across four
  roots, `--check` clean, zero `.bin` entries carried). SEC2-W1: every remedy names the operator as its
  subject, the `clean -y` row says not to run it yourself and why, the stop restated after the list.
  W-P1: budgets derived from measured bases (a four-root build 7.5 s cold / 3.9 s warm, one root 2.1 s,
  a `--check` 1.8 s / 0.6 s) times one named margin. The Claude manifest: every component field's schema
  description reads "in addition to those in the <dir>/ directory, if it exists" (`agents`, `commands`,
  `skills`, `hooks` alike), so the manifest is identity and version only and discovery carries the four
  classes; `claude plugin validate --strict` on Claude Code 2.1.278 still prints `Validation passed`, the
  suite's armed leg 18/18. The twelve Minors: `invocation.citation` reserved as a note in both halves; env
  allowlists on the codex and copilot legs and the false "CI arms this" claim corrected (no workflow arms
  any `STAMITY_*_BIN`); argv parsed before the seven dynamic imports; `p-limit` at 32 over the per-root
  reads and writes; the copilot plan memoised; every table refuses an unnamed `.stamity/generated/*` row;
  `LAYOUT_CLIENTS` derived with a two-way container assertion; `+build` refused in both grammars and
  `--source-commit-date` a full ISO date-time; the vacuous case an `lstat` walk, the stale comment gone, the
  measurement in `beforeAll`, the Cursor leg isolated in a scratch `HOME` (measured: the binary honours it
  and refuses with "Authentication required" — the leg passes only a deliberately exported `CURSOR_API_KEY`
  and skips with the recorded refusal) — 21 passed, 1 skipped armed; the codex README's cache path;
  `boundaryDir: base`; the fixtures README's six sections with digests.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (8,995 passed, exactly the two expected
  architecture reds, no floor line, no flake), knip, leak gate over 1,528 files, the real build and
  `--check`, the validate run. At integration on the head with C4, C9 and the spec merge: ten plugin, setup
  and verb suites green (220 passed, 5 skipped); pushed at `9603ea7`.
- Noticed: the runtime builder prunes no `.bin` (the generator's exception would go with a builder prune);
  `readRuntime` reads its 634 files sequentially and the recursive walk's `Promise.all` is unbounded across
  directories (candidates for the same bound); the cursor suite's own budget comment is a literal;
  `prepareNativeTypescriptCli` re-execs before argv parsing on a host below Node 22.18.

## Review round 3 — waves 2 and 3 (`f21e4d3..9603ea7`), dispatched 2026-09-20

The reviewer, the security lens and the performance lens (each at `claude-fable-5-1`) over P8, C3, C6, fixer
round 2b, P9 with its reorder, C4, C9, the spec merge and fixer round 2a — the round-2 closures verified at
the code; C7 (in flight) joins the whole-branch deep review.

### Performance lens, round 3 (fable): no breach; two Warnings, two Minors, advisory

- W-P3: the nine-spawn worktree case's derived timeout (10.5 s) is below the 20 s default it replaced — the
  derivation's comment assumed a 5 s default this repository does not have. W-P4: `collectPluginDuplicates`
  builds the content index once per recorded client (four walks per `check` on a four-client repository,
  beside the sync plan's own), and parses `apm.yml` per client — build once, pass the id set down. Minors:
  two timeout bases for one generator across the plugin suites; the publish job unmeasured by nature.
  Round-2 closures verified at the code (W-P1's derived budgets, W-P2's 120 s, the parse order, the
  memoised plan, `p-limit` 32). Counts: the distribution suite runs two full and one narrowed build over a
  three-file stub runtime (the 675–701-file roots exist only in the release job), the executed workflow
  suite is `skipIf(WINDOWS)`, the zip writer holds one root at a time with a table-driven CRC and level-9
  deflate per entry, the locator is spawned only with a root variable set, the ownership predicate costs a
  handful of Set builds per plan, `effortDisclosures` runs once per plan. The coverage summary on disk
  predates C3; the record's floor claims come from runs whose summaries are gone.

### Security lens, round 3 (fable): one Warning, three Minors; every round-2 closure verified; false-positive estimate 0–1 of 4

- SEC3-W1: the repository-first ordering re-opens W-3 one level up — inside a container the climb resolves
  to the plugin root's PARENT (a marketplace clone, a client cache, a `--plugin-dir` project), where a
  planted document or symlink outranks the container's own copy; fixer 2b's comment that "nothing sits
  above it" is false at the code. The fix is one candidate per mode: the generator's containers get a guard
  emitted with the sibling path and no climb (the hook-scripts-root fact selects it at planning), the
  repository guard keeps its climb, and the `lstat` refusal applies to the single path in both modes.
  SEC3-M1: a root's `version` validated as semver at ingress (a mis-declared root would leave generated
  files and no manifest). SEC3-M2: a per-client carriable set refused at setup (a root cannot switch off a
  class no container delivers). SEC3-M3: the locator probe's ceiling is a real ceiling (SIGKILL and a race
  timer). Verified sound: the release job's credential split (the gates job holds `contents: read` and no
  token; only `publish` holds the four write grants; the outputs channel validated upstream; every input
  through `env:` double-quoted; a dry run cannot reach the publish job), the probe's boundary (a plugin root
  is third-party code the operator installed; the probe adds nothing beyond it; the YAML parser caps alias
  expansion; the unmanaged scan follows no link), `setup` writing only through `applyInit` with no
  root-derived path, the ownership split, the zip writer's path refusals and clock-free mtime, every
  catalog value from the validated identity, `p-limit` an existing production dependency.

## CI on pull request #46 at `9603ea7` (2026-09-20)

Every check green — `check (floor)`, `check (lts)`, **`check (windows)`**, the three APM routes, DCO, the
title check, dependency review, supply-chain currency, the dist size budget, the docs-site build, both
aggregators (the Pages deploy skipped by design) — on the head carrying P8, C3, C6, fixer 2b, P9 with its
reorder, C4 (the two architecture cases green again), C9, the spec merge and fixer 2a. The intermediate
heads `7166fe4` … `45800c2` carried C6's two expected architecture reds and were pushed knowing it.

### Reviewer, round 3 (fable): request-changes, confidence high on W1, W2, W4 — 5 Warnings, 5 Minors; every round-2 closure verified at the code

- W1: the apm duplicate source matches the scoped npm name, which the published install spec
  (`<owner>/<repo>#plugins/v<version>`) never contains, the fixtures use a form the route never produces,
  and the as-built paragraph misstates the mechanism — match the repository slug or the npm name, rewrite
  the fixtures, amend the paragraph and the C3 cell. W2: `nativeEntryId` strips `.md`, `.mdc`, `.toml` only,
  so Copilot's `.agent.md` and `.prompt.md` never match — the unmanaged scan is dead for both Copilot
  classes. W3: the shared `.agents/skills/` tree, kept for a remaining generated reader, reaches a
  plugin-backed reader twice by construction and no row reports it — the honest disposition is to state it
  in REQ-PLUGIN-019's as-built and the plugins guide rather than a permanent `fail` on a legitimate mixed
  repository. W4: `docs/troubleshooting.md` still describes the pre-C4 `plugin-runtime` severity and sample
  transcript. W5: two plugin-backed clients have no CLI route (`--client a,b` always refuses) — make
  `--plugin-root` repeatable, pairing each root with its declared client. Minors: the locator report's
  scalars unchecked; `PLUGIN_ROOT_VARIABLES` twice; `clean`'s hardcoded plugin id; a refused locator failing
  a repository that records nothing; the W-3 residue that the security lens raised as SEC3-W1. Every
  round-2 closure verified; every recorded deviation judged right except the REQ-PLUGIN-019 "exact match"
  wording; the executed push proof judged realistic; a dry run still cannot reach a push.

### Fixer round 3 (opus, two file-disjoint lanes from `9603ea7`)

Lane 3a (`p15s2-fix3a`: `src/cli/**`, `src/plugins/**`, `docs/troubleshooting.md`, the REQ-PLUGIN-015/016/019
paragraphs, the C3/C4 cells, their tests): W1, W2, W3's disposition, W4, W5, M1–M4, SEC3-M1, SEC3-M2, SEC3-M3,
W-P4 (the index built once), the C1 test name (build/58). Lane 3b (`p15s2-fix3b`: `src/hooks/scripts.ts`,
`src/emit/hooksInfra.ts`, the hooks and emission tests, the goldens and the dogfood, the REQ-PLUGIN-005
paragraph and the P2b cell, `test/ci/pluginDistribution.test.ts`): SEC3-W1/M5 (one candidate per mode),
W-P3 (the timeout premise), the performance M-1 (one basis).

### C7 — docs-and-pins: DONE (2026-09-20; integrated as `3248d0c` … `ef5d754`)

- `docs/plugins.md` (358 lines: who owns what as one class × client × owner table with the co-ownership
  sentence for the vendor-neutral skills tree; the four install routes; the setup step; pin, update and roll
  back per client with `claude plugin rollback` published as not established and Cursor and Codex as
  having no vendor-documented pin, update or rollback command on 2026-09-20; the companion runtime; the
  clean-then-setup move; private catalogs and Renovate with the `extends` shape marked as a shape; the two
  doctor rows) — EVERY command block carries a provenance line: executed 2026-09-20 on the named client
  (Claude Code 2.1.278 `plugin validate --strict`, the Cursor agent CLI 2026.09.15 with `--trust` and the
  18 ids, GitHub Copilot CLI 1.0.85's ten skills installed unauthenticated, codex-cli 0.154.0's marketplace
  add and plugin add in a scratch home) or "from the vendor's <page>, accessed 2026-09-20; executed by the
  route proof of the next session"; a hand page admits no outside URL, so the dated source URLs live in
  the generated capability matrix's new `Sources:` list. Two claims corrected against the record rather
  than the brief (Claude's local route is `marketplace add` with a local path; the Codex remote-ref form
  points at the built README). README `## Commands` to ten verbs with `plugin` between `worktree` and
  `clean`, the map row, `README_MAX_LINES` 157 → 158 justified; getting-started's ten verbs and the
  install-as-a-plugin section; `CapabilityMatrixInputs.plugins` rendered as `## Plugin containers` from
  `scripts/plugin-container-facts.mjs` (one derivation over the four client modules, read by the generator
  and the test; the two class columns partition the six classes; the `Agent Plugins scope expansion`
  revisit row rewritten); the llms index entry with `null` regeneration and `llms.txt`; the sidebar entry
  (the site builds clean, `/docs/plugins` present); the docs-pages pins (`GUIDES`, `MAPPED_GUIDES`, the
  README array and count word, the getting-started verbs, the guide counts, `REATTESTATION_DATE`
  2026-09-20 with three pages re-stamped); the fork-section claims pinned; the Sigstore-optional sentence
  on both trust pages pinned against `package.json`. 13 new cases; the matrix drift gate and idempotency
  case compare against the generated page (strictly stronger); every existing test edit justified.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (229 files, 9,078 passed, no floor line),
  the two generators with `git diff --exit-code docs llms.txt` clean, the website build with no dropped-id
  warning, knip, leak gate over 1,534 files. At integration on the head with fixer 2a: both generators
  re-run byte-identical, the docs-pages, matrix, roster and CLI-docs suites green (316); pushed at
  `ef5d754`. Seam item to the next fixer: `invocationOf()` spells the reserved note key as a literal where
  fixer 2a's `INVOCATION_NOTE_KEYS` now exists.
- Spec delta proposed for REQ-PLUGIN-024 (every block carries a provenance line, executed or transcribed
  with the proof that executes it; the matrix section derived; the co-ownership statement) and
  REQ-PLUGIN-013 (the documented rollback routes per client) — the spec-author's follow-up after fixer round
  3 lands, with the packs and security specs' Sigstore-optional sentence.

### Fixer round 3b (the hooks lane): DONE (2026-09-20; integrated as `c97c1a3` … `d8eea12`)

- SEC3-W1/M5: the mode is chosen at emission — `policiesPathFor(hookScriptsRoot)` in `hooksInfra.ts` hands
  `planCoreHookScripts` the bare sibling file name under a plugin root and the `../../` climb otherwise —
  and the emitted guard resolves exactly `POLICY_FILE` through `lstatSync`, refusing a symlink as
  `POLICY_INVALID` in BOTH modes (the repository-mode link leg was the sharpest red: a link planted at the
  repository document was followed before); the sibling-versus-climb resolver and its false header deleted;
  `existsSync` dropped from the guard's imports; the climb test extended, not weakened (both shapes pinned;
  the guard bodies asserted to differ on exactly one line between modes); five behaviour cases (the
  container ignores every document above it, an absent single document refuses rather than reaching a
  second, the repository call ignores a stray sibling and a stray ancestor, the two-leg symlink refusal, an
  unreadable document never answered from a laxer one). The five plugin suites' hits on the document all
  assert `<root>/hooks/agent-tool-policies.json` — where the container guard now looks — so lane A needed
  nothing. REQ-PLUGIN-005's clause and as-built paragraph and the P2b cell restated to the one-candidate
  rule. W-P3: the nine-spawn budget floored at the suite default, the false premise corrected, a case
  reading `testTimeout` out of `vitest.config.ts` (red at 10,500 against 20,000). M-1: one measured basis
  cited across both plugin suites, no budget narrowed.
- Snapshots: the four guard bodies (+430 bytes each: the posture line, the resolver doc and body) and the
  five fixture manifests' hashes; the dogfood guard and two manifest lines; nothing else. Gates in the
  worktree: lint, typecheck, `test -- --coverage` (229 files, 9,080 passed, no floor line), build, sync
  idempotent, check clean, knip, leak gate, the checker over plan file 1. At integration on the head with
  C7: build, sync (stamp only), check clean, nine hooks, emission, golden and plugin suites green (410);
  pushed at `d8eea12`.

### Fixer round 3a (the CLI and plugins lane): DONE (2026-09-20; integrated as `21e3ba6` … `f874c89`)

- W1: `repositorySlug()` in the package-name kit (the identity script's derivation) and the apm source
  matching a dependency line containing the slug OR the npm name; the fixtures rewritten to the published
  spec form derived from the checkout's own `package.json` (red: `expected 'pass' to be 'warn'` — no
  dependency the release writes was ever matched); a mirror under another owner is not reported, said so in
  REQ-PLUGIN-019 and the C3 cell. W2: `.agent.md` and `.prompt.md` ahead of `.md` with the order stated as
  load-bearing; a copilot unmanaged case. W3: the disposition pinned — the mixed repository passes after the
  re-sync a real setup is followed by (in the seeded state the row fails with a ledger duplicate, which is
  the red-to-green evidence). W4: the doctor sample re-taken (13 rows `ok`), the row's three states, "only
  four rows can fail" corrected to five (a pre-existing miscount), the sample pinned to the real row from
  the check suite. W5: `--plugin-root` a collecting option paired with each root's declared client,
  `--client` derived when absent and validated both ways, the root-not-listed refusal before the
  client-without-root one so the existing gating case stands; the CLI reference regenerated; REQ-PLUGIN-015
  and the C4 cell amended. M1–M4: every locator scalar checked (`node.version` required, `node.floor`
  nullable, stated); `PLUGIN_ROOT_VARIABLES` exported from the reader and imported by four modules;
  `clean`'s plugin id derived as the catalogs derive it; a refused locator fails only where a client is
  recorded or the mode is plugin-backed. SEC3-M1: `semver.valid` at ingress (a `v` prefix accepted as the
  manifest accepts it; a prerelease with build metadata still parses). SEC3-M2: `CARRIABLE_CLASSES` per
  client refused by name at setup, bound to the four client modules' declarations by a test with a
  non-tautology case; two codex fixtures that declared documents no generator emits moved with reasons.
  SEC3-M3: `SIGKILL` and an independent timer (red: the probe answered `unreadable` after 2,083 ms against
  a locator holding stdout open through a detached grandchild). W-P4: `apm.yml` read once and the corpus
  walked once per check. build/58: the effort-scale test renamed and asserting all six levels.
- Gates in the worktree: lint, typecheck, `test -- --coverage` (229 files, 9,111 passed, no flake), the CLI
  reference regenerated clean, build, sync (nothing), check clean with every row `ok`, knip, leak gate, the
  checker over plan file 2. One repair commit for the lane's own lint and type breakage, caused by piping
  `npm run lint` into `tail` (masking its exit code) — every later gate run unpiped; recorded as the lane's
  process note. At integration on the head with fixer 3b and C7: typecheck, both generators byte-identical,
  the checker on both plan files, the command, kit, plugins, manifest, architecture and docs-pages suites
  green; the records gate red on the WORKING-TREE ledger as expected until the close; pushed at `f874c89`.
- Noticed: the setup suite's repository-owned predicate lists `.cursor/rules/` although the cursor
  container can carry rules (no fixture exercises it); `plugin status` with repeated roots reports the
  first root's runtime only (stated); `node.version` non-nullable at the parse.

## Side effects — the spec follow-up (spec-author, opus; integrated as `7191801`)

REQ-PLUGIN-024 restated to the provenance-line rule (executed client and version, or vendor page and access
date with the proof that will execute it; a hand page carries no absolute URL, so the dated source URLs live
in the generated matrix; the `Plugin containers` section derived through one builder; the co-owned skills
tree stated; the pins moved); REQ-PLUGIN-013's documentation half names the route per client where no
vendor command exists; a dated note under REQ-PLUGIN-006 records the Sigstore client as optional since
1.9.0, for want of a packs-and-trust requirement family (none of the ten specs owns that surface and neither
trust page cites an id — recorded as the nearest home); REQ-PLUGIN-019 gains the unmanaged source's
extension rule. No fixer paragraph reworded; the checker passes both plan files.

## Review round 4 — the re-review (`9603ea7..f874c89` + the seam commit), 2026-09-20

- Reviewer (fable): request-changes, confidence high on the closure table — EVERY round-3 closure verified
  closed at the code (W1–W5, M1–M4, SEC3-W1/M5, W-P3, W-P4, the timeout basis, SEC3-M1–M3, the effort-scale
  name), no regression; two NEW Warnings on code first reviewed this round: W4-1 the apm identity match is
  an unbounded substring (a same-owner sibling whose name starts with the slug reads as a false duplicate —
  bound the match); W4-2 two surface pins the plugin route moved were left behind (the llms index's "nine
  verbs" and the doctrine page's guide counts — the surface-pins learning's own class). Minors: the guide's
  `plugin-runtime` clauses without the shipped qualification; a spec page's "ten guides"; the Copilot
  precedence paragraph undated; the trust pages' attestation headers unmoved (deferred: a whole-page act).
  C7 reviewed once: every "executed" provenance claim matches the record's measurements; the ownership
  table matches the four modules; the matrix builder's partition and refusals cased; no weakened test.
- Security lens (fable): SEC3-W1, SEC3-M1, SEC3-M2 closed; SEC3-M3 incomplete — the parent's pipe ends
  outlive the ceiling, so a grandchild holding fd 1 still holds the process open (SEC4-M1, Minor); the trust
  map for the repeatable roots, the slug helper (no userinfo, never interpolated into a remedy), the guide's
  operator framing and the re-taken sample (no home path, no private name) verified sound.
- The loop's cap: this is the fourth round and it requested changes with two Warnings on newly reviewed
  code, not on a regression; per the escalation ladder the round-4 fixer runs as a FRESH fixer at the
  stronger class (`claude-fable-5-1`), and the whole-branch deep review that follows the loop verifies its
  closures rather than a fifth loop round the default cap does not admit; a deep review that still finds a
  Critical or Warning stops the run at the QA checkpoint with the open findings attached for the
  maintainer, who may raise the cap. Fixer round 4 dispatched with W4-1, W4-2, the guide's doctor clauses,
  the precedence date, the spec page's count and SEC4-M1.

## Fixer round 4 — a fresh fixer at the stronger class (`claude-fable-5-1`, worktree `p15s2-fix4`; integrated as `199d328..27b1837`)

Four commits, one per finding, tree-identical to the fixer's head; pushed as PR #46's new head `27b1837`.

- W4-1 (prove/88) fixed: `probe.ts` matches an apm.yml dependency as a whole token — one regex per
  identity, `(?:^|[\s"'])<escaped>(?:$|[#\s"'])`, through a new `escapeForRegExp` helper; red case in
  `test/cli/commands/check.test.ts` with a synthetic `<slug>-suffix#plugins/v1.9.0` sibling (`expected
  'warn' to be 'pass'` before, green after; the slug, scoped-name and other-owner cases still pass).
- W4-2 (prove/89) fixed: `llmsIndex.ts` says ten verbs and `llms.txt` regenerated; `docs/doctrine.md`
  eleven guides and fourteen; the counts were pinned nowhere, so `test/docsPages.test.ts` gained a
  `COUNT_WORDS`/`countWord` helper and two cases that read the words off `GUIDES.length` and
  `HAND_PAGES.length` and hold `llms.txt`'s README row to the count README states — both red against the
  unfixed pages. `docs/specs/prove-behavior-and-value.md:255-256` moved three words, not one: "eleven
  guides", "fourteen-page bucket", "fifteenth" (the same stale count's arithmetic).
- The guide's doctor clauses (prove/90) fixed with one correction to the finding: `docs/plugins.md` is
  358 lines, so the second location cited did not exist — the second unqualified place was the
  `plugin-duplicates` bullet under the `plugin-runtime` one; both reworded to the shipped rows (pass with a
  note when nothing is recorded; warn only with a client recorded; fail only where the repository claims
  the plugin; the mode repository-level per `src/types/manifest.ts:293`). The Copilot precedence
  paragraph dated (prove/91): "From the vendor's CLI plugin reference, accessed 2026-09-20."
- SEC4-M1 (prove/93) fixed, with the claim corrected by measurement: the hang did not reproduce on the
  shipped path — a driver against a 6 s grandchild exited at 307 ms with no active resources — because
  `execFile`'s own `timeout` destroys the child's streams before signalling (Node 22.22.3's source), an
  undocumented internal the probe's comment did not name. The timer callback now destroys `child.stdout`
  and `child.stderr` beside the SIGKILL and the comment says which mechanism releases what; the new
  process-level case (`releases the process once the probe settles, while the grandchild still holds
  stdout`, a driver `.mjs` importing `probe.ts` under Node's native type stripping) was red with the
  `timeout` option removed (`did not exit on its own (4011ms)`), green with the destroy added, green with
  `timeout` restored. `STUBBORN_LOCATOR` became `stubbornLocator(grandchildMs)`.
- Gates in the worktree, each unpiped: lint 0, typecheck 0, `test -- --coverage` 0 (229 files, 9132
  passed, 9 skipped, 138 s; 96.57 / 89.99 / 98.76 / 97.41), generate-docs and the matrix byte-stable,
  build 0 (logic 1.31 MiB of 2.00, corpus 0.52 of 1.50), sync `0 created, 0 updated, 67 unchanged`, check
  all green, knip 0, leak gate `0 hits for 18 rules across 1534 files`.
- Noticed, not changed: the ceiling describe now leaves a 6 s detached grandchild per run (nothing waits
  on it); the original SEC3-M3 comment's account of the hang is partly folklore and a correcting paragraph
  sits beneath it; the spec page's `test/docsPages.test.ts` line-number citations shifted by about twenty
  lines (the surface-pins class, left).
- Ledger: prove/88, 89, 90, 91, 93 fixed; prove/92 stays deferred (inbox). No row open.

## Prove — dispatched at `27b1837` (2026-09-20)

Three lanes in parallel: the whole-branch deep review (fable, frontier class) over `b000bd1..27b1837`,
told to verify the round-4 closures first; the security lens over the final state (fable), SEC4-M1's
closure first; the test-runner's full gate in the pinned worktree `p15s2-gate` (opus): lint, typecheck,
`test -- --coverage`, build, the dogfood sync and check, the CI generated-surface step, knip, the leak
gate, the tarball smoke, and the plugin route (pack, runtime build, distribution build) into scratch.
The docs site builds beside them for the QA harness.

## Prove — the test-runner's full gate at `27b1837` (opus, worktree `p15s2-gate`)

Fourteen commands, each unpiped. Green: lint, typecheck, build (logic 1.31 MiB of 2.00, corpus 0.52 of
1.50), the dogfood sync (`0 created, 0 updated, 67 unchanged`) and check (thirteen rows `ok`, the stamp
restored), the CI self-consistency step as `ci.yml` writes it (five generators — the matrix, the docs, the
pack manifests, the plugin manifests, the APM package — then `git diff --exit-code`), knip, the leak gate
(`0 hits for 18 rules across 1534 files`), the tarball smoke, and the plugin route end to end: `npm pack`
(227 files), `build-plugin-runtime` (637 files, 3,378,898 bytes), `build-plugin-distribution` (four
archives of 681–707 files, `apm.yml`, `release.json`, four catalogs, the README, `.sha256` sidecars) and
`generate-plugin-packages.mjs --check` (four roots, 2,776 files verified). RED once: `npm run test --
--coverage` exit 1 on one assertion — `test/qa/hookRuns.test.ts:167` (`runClient — a binary probed present
with no measured invocation`) read `failed` where `not-run` was expected, and the abort left the coverage
floors unmeasured on that pass. The run overlapped the docs-site build and the QA harness on the same
machine (the row's fixture build shells out to `dist/cli.js` under a timeout); the file alone in the same
worktree passes (10 passed, 1 skipped), the round-4 fixer's full run at the identical tree passed (9,132
tests, coverage 96.57 / 89.99 / 98.76 / 97.41), and CI's floor and LTS legs at `27b1837` pass the same
`npm test -- --coverage` gate. Classified as a load-induced flake of the QA-harness suite; the full gate is
re-run by the runner at the final candidate, uncontended, before the proof block.

## QA harness at `27b1837` (2026-09-20T15:35Z)

`cd website && npm run build` (Docusaurus, `onBrokenLinks: throw` — every internal link resolves; the new
`docs/plugins` page is in the build) then `node scripts/qa/run.mjs --site website/build --sha 27b1837`
with the four client binaries exported: evidence at `.stamity/evidence/qa-27b1837.json` — H1a `passed`
(claude 2.1.278 headless: 2 calls, 1 denied, 1 allowed), H1b `not-run` (codex exec loads no project hook
layer), H1c and H1d `not-run` (no measured non-interactive invocation on record for the Cursor agent and
the Copilot CLI — file 3's V1 adds them), H2 and H3a–H3d `passed` (structure and keyboard journeys at 375
and 1440, light and dark).

## Whole-branch deep review (fable, frontier class) — `b000bd1..27b1837` (2026-09-20): request-changes, confidence 0.85

Every round-4 closure verified closed at the code (prove/88, 89, 90, 91, 93 — the bounded match and its
boundary analysis, the two derived pins, the doctor clauses against `check.ts:704-758`, the access date
and the arithmetic, the pipe release with the driver's determinism argued from `scripts/native-typescript.mjs`
and the generator's own bare-`node` spawn). Two NEW Warnings that four per-wave reviews could not see:
- W-D1 (prove/94): file 1's route proof and the enterprise-forks guide write `dependencies: apm: [...]`;
  file 2's C3 probe reads only a flat `dependencies` list, so the apm duplicate source never reports on
  the shape the guide tells an operator to write. Each wave was internally consistent.
- W-D2 (prove/95): REQ-PLUGIN-019 says "with its path"; C3's plan cell rewrote the detail format without
  the path, the implementation followed the cell, and the as-built paragraph certified "as stated".
Minors: the boundary set's `/` and case (prove/96), a spec page's line citation (prove/97), four
byte-identical helpers across the container modules (prove/98, deferred to the hygiene batch), the
`--version` regex in three copies with build metadata refused at the child (prove/99), the process-level
case's literal 3 s budget (prove/100), the Codex `commandWindows` line (prove/101, deferred to V1's
route proof — already declared unmeasured on the class). Verified sound for the record: every provenance
line in `docs/plugins.md` has a measurement in the record; the release workflow's credential split, digest
channel, tag guard and orphan-commit idempotence match the three `.github/*.md` companions; the tar
subset's bounds, the zip writer's refusals, the locator's no-PATH rule, the guard's single-candidate path
and symlink refusal; the hook-path chain coherent end to end (generator → planner → hooks planner → the
four containers → the runner → the guard); the contract census held (`hookScriptsRoot`,
`HookInterchange.command`, `resolveDistributionIdentity` additive, `HOOKS_GENERATED_DIR` one home); no
plan cell claimed done is missing from the tree; no weakened test (every removed `expect` retired by the
feature that moved it, two in-place changes justified in the diff).
- Reading applied (recorded, not asked): the review loop's default cap of four rounds governs the loop
  over the built units; the whole-branch deep review is the deep tier's own stage and, as in session 1
  (deep review request-changes 0.80 → fixer → whole-branch re-review approve 0.85), its findings go to a
  fresh fixer at the stronger class and a whole-branch re-review verifies the closures. The maintainer
  sees this at the sign-off question. Fixer dispatched in `p15s2-fix5` at `27b1837` with W-D1, W-D2,
  M-1, M-2, M-4, M-5; the security lens's return is folded in when it lands.

## CI on pull request #46 at `27b1837` (2026-09-20)

Every leg green: floor (node 22.22.2) 4m35s, LTS (node 24) 4m0s, Windows (node 24) 7m40s, the three apm
route legs, Build, DCO, the title check, the dist size budget, the two advisory checks; `all-pr-checks`
pass (the `all-ci-checks` aggregator follows the check legs). The Windows leg is the first measurement of
the round-4 process-level release case on that platform (`it.skipIf(WINDOWS)` does not guard it) — green.

## Security lens over the final state (fable) — `b000bd1..27b1837` (2026-09-20)

SEC4-M1 CLOSED (`probe.ts:182-185` destroys both pipe ends beside the kill; `finish` idempotent; the
six-second orphan inherits the locator's fd 1 — the pipe the probe destroys — not the test's, so it holds
nothing open: tidiness, not a security row). Two findings: SEC5-W1 (prove/102, Warning, A08 CI/CD
integrity) — the publish job force-pushes a branch and pushes a tag whose names it takes from the gates
job's outputs, computed after third-party code ran in that job's checkout, with no shape guard in the
credential-bearing job; a new primitive since the gates outputs previously steered only `gh release
create --verify-tag`. Fix: refuse a tag outside `plugins/v*` and a branch whose remote head is not an
orphan distribution commit, both in `publish` before the push, names still single-sourced. SEC5-M1
(prove/103, Minor, CWE-150) — two check rows render foreign strings raw (the matched apm.yml text, the
root's own refusal string); route both through `sanitizeLabel`. Verified sound with path:line: the guard's
one fixed policy path with `lstatSync` refusal in both modes and no environment read; the anchored
root-variable token (no quote, `$` or backslash admitted); user and pack hooks refusing `${`, shell
operators and symlinks; the runner's `shell: false`; container hook configs carrying core rows only (a
temp `rootDir`); the closed substitution map with unresolved tokens refused; corpus staging and every
placed path through `assertSafePath`; `st-setup` interpolating only an anchored variable name; the probe's
fixed argv, ceiling and scalar-by-scalar document check; the linear identity regex built from the running
package's own manifest; the strict capability reader; the tar reader's ustar magic, bounds, termination,
type and path refusals; `npm ci --ignore-scripts` against the repository's own lockfile; the prune gated
under `node_modules`; the locator's no-PATH rule and bounded `STAMITY_REPO_ROOT`; the zip writer's path
and duplicate refusals with fixed modes and no symlink following; identity-only catalogs and manifest;
workflow-scope `contents: read` with the publish elevation limited to four writes; verify before publish
for the tarball and the distribution; the archives attested; the tag guard fail-closed; four sha-pinned
actions; no new egress; `repositorySlug()` anchored with userinfo, query and fragment yielding null;
credential-shaped refusals never echoing; no dependency hunk in the range. Dropped for want of a reachable
path: the tar reader's missing entry-count bound (the tarball is packed in the same job), the test-only
Node-version override, `release.json` unattested (the archives are), a companion manifest's absolute
`bin`. Two findings posted, both actionable by the lens's own count; no advisory downgrade. Both folded
into fixer-5's scope.

## Fixer for the deep review's and the lens's findings (fable, worktree `p15s2-fix5`; integrated as `d15cc3d..95660ea`)

Seven commits, tree-identical to the fixer's head; pushed as PR #46's head `95660ea` (82 commits from
`b000bd1`).
- W-D1 + M-1 (prove/94, prove/96): `matchedApmDependencies` reads the flat list and `dependencies.apm`;
  the red case seeds the exact `docs/enterprise-forks.md` block (`expected 'pass' to be 'warn'` before);
  the boundary sets gained `/` on both sides and the `i` flag with three red cases (URL, subpath,
  upper-cased slug); the `-suffix` sibling and the other-owner mirror still pass; the guide's duplicates
  bullet names both shapes.
- W-D2 (prove/95): `DuplicateFinding.paths` (sorted; ledger paths, unmanaged repository-relative paths,
  the matched apm spelling), `DUPLICATE_PATHS_SHOWN = 3` with `+N more` through `describeDuplicatePaths()`
  in `check.ts`, `plugin.ts` and the status JSON; three check cases and one status case red-first (the
  status case proven red against the restored pre-fix file with a patch, not a stash); the requirement
  text untouched, the as-built paragraph gained one dated clause; both guides describe the rendering.
- M-2 (prove/97): the citation moved to `:135-152`, final (no later edit of that file).
- M-4 (prove/99): `scripts/plugins/version.mjs` exports the one `PLUGIN_VERSION` the builder, the
  generator and `capability.mjs` read; `1.9.0+1` refused at the builder's own parsing, exit 2 (red:
  `expected 1 to be 2`, the child's exit).
- M-5 (prove/100): the ceiling describe measures the driver's cold start once in `beforeAll` (~130 ms
  here against ~30 ms bare node) and derives the budget (`300 + 8 × coldStart`), the driver timeout (2×)
  and the grandchild life (3×), the assertion printing the arithmetic; red with the probe's destroy lines
  and its `timeout` option removed (`did not exit on its own (2657ms)` against 1340 ms), green restored.
- SEC5-W1 (prove/102): in the push step, a tag guard `case "$TAG" in */v"$VERSION")` tied to the gates
  job's own version output (the literal namespace is forbidden by the workflow suite), and a branch guard
  before the force-push — `git ls-remote --heads`, `git fetch --depth=2` (depth 1 would hide every
  parent), `git rev-list --parents -n 1 FETCH_HEAD`; a head with a parent refused naming the branch and
  the head; an absent or orphan head accepted. Two executed-shell red cases (a tag outside the namespace;
  a branch carrying two normal commits) — both pushed with the guards patched out, refused with them; the
  first-push, idempotent and poisoned-tag cases still pass. One dated sentence in
  `.github/release-controls-checklist.md`.
- SEC5-M1 (prove/103): `sanitizeLabel` at both entries in `probe.ts` — the matched apm.yml line before
  the remedy and the path are built from it (so the status JSON is covered) and the refusal as the
  message is formed; two ESC-byte cases red-first.
- Gates in the worktree, each unpiped: lint 0, typecheck 0, `test -- --coverage` 0 (229 files, 9,145
  passed, 9 skipped, 137.6 s; 96.58 / 89.99 / 98.76 / 97.41, no threshold line), build + sync
  (`0 created, 0 updated, 67 unchanged`) + check all green with the stamp restored, the five generators
  and `git diff --exit-code` 0, knip 0, leak gate `0 hits for 18 rules across 1535 files`. Thirteen cases
  added, one modified; no assertion weakened.
- Noticed, not changed: REQ-PROVE-018's other line citations in the same sentence have drifted too
  (`RELEASE_CUT_DATE` at `:406`, the gate at `:671-715`, the GOVERNANCE handling at `:79-95`) — the
  surface-pins class, inbox; the in-process ceiling case's literal `toBeLessThan(1_500)`; the apm row
  repeats the spelling as the path and inside the remedy.
- Ledger: prove/94, 95, 96, 97, 99, 100, 102, 103 fixed. No row open.

## QA harness at `95660ea` (2026-09-20)

The site rebuilt (`onBrokenLinks: throw`, the plugins page in the build) and the harness re-run at the
final candidate with the four binaries exported: `.stamity/evidence/qa-95660ea.json` — H1a `passed`
(claude 2.1.278 headless), H1b/H1c/H1d `not-run` (the same recorded reasons), H2 and H3a–H3d `passed`.
The file at `27b1837` dropped (the candidate moved).

## Prove at `95660ea` — dispatched

The whole-branch re-review (fable) over the fixer's seven commits with the eight closures to verify; the
test-runner's full gate in the pinned worktree `p15s2-gate2`, uncontended.

## Prove — the test-runner's full gate at `95660ea` (opus, worktree `p15s2-gate2`)

Sixteen commands, each unpiped, verdict GREEN. `npm run test -- --coverage`: the first run went red once
on the same `test/qa/hookRuns.test.ts:167` row while the docs-site rebuild for the harness overlapped it
in the main checkout (the orchestrator's own contention — the runner and the site build should not share
the machine's window); the file alone passed (10 passed, 1 skipped) and the runner re-ran the full gate
unnarrowed, uncontended: 229 files, 9,145 passed, 9 skipped, 132 s, coverage 96.58 / 89.99 / 98.76 /
97.41 with no threshold line. Lint 0, typecheck 0, build 0 (logic 1.31 MiB of 2.00, corpus 0.52 of
1.50), the dogfood sync `0 created, 0 updated, 67 unchanged` and check all `ok` (the two plugin rows
included; the stamp restored), the CI self-consistency chain 0 with no diff, knip 0, the leak gate
`0 hits for 18 rules across 1535 files`, the tarball smoke PASS, the plugin route (pack 227 files; runtime
637 files, 3,379,652 bytes; four archives 681–707 files; `generate-plugin-packages.mjs --check` four roots,
2,776 files) and the new refusal — `--version 1.9.0+1` exit 2 with `--version must be a semantic version
with no build metadata, for example 1.9.0.` Porcelain empty at the end. Two observations for the record:
the QA-harness row at `:167` is load-sensitive (a Minor for the hygiene batch — inbox), and a red suite
run emits no coverage report at all, so a red pass leaves the floors unmeasured rather than failed (the
same class; the gate's own contract, not this change's).

## CI on pull request #46 at `95660ea` (2026-09-20)

Every leg green: floor 4m24s, LTS 4m17s, Windows 12m6s (the derived-budget release case's first Windows
measurement — green), the three apm route legs, Build, DCO, the title check, the size budget, the two
advisory checks; `all-ci-checks` and `all-pr-checks` both `pass`.

## Whole-branch re-review — `27b1837..95660ea` (2026-09-20): **approve, confidence 0.86**

The first dispatch dropped on a connection error before it read anything (the failure ladder's retry, same
brief). Every closure verified at the code — prove/94 (both apm.yml shapes, the red case seeded with the
guide's block, the guide naming both), prove/96 (the widened boundary admits nothing plausible: a foreign
repository named after this owner holding a directory named after this repository is the only false
positive shape; `<slug>.git` stays unreported, the safe direction), prove/95 (the sorted paths from all
three sources, the bound of three with `+N more`, the status JSON, the dated as-built clause, the
requirement untouched), prove/97, prove/99 (one `PLUGIN_VERSION`, no `SEMVER` copy left, prerelease still
accepted, build metadata refused at all three script readers; the engine-side capability reader stays the
lenient `semver.valid` — pre-existing, safe direction), prove/100 (not vacuous: an unreleased pipe holds
the driver until its kill at twice the budget, which fails the assertion; on a pathologically slow leg a
real hang surfaces as vitest's timeout, still red), prove/102 (every expansion quoted, `set -euo pipefail`
turns a failed `ls-remote`, `fetch` or `rev-list` into an exit before any push, an empty parent count
refuses, `--depth=2` makes the parent links real and refuses a merge head too, `VERSION` derives from the
git ref before dependencies install; residual named: a planted or legitimately fresh orphan head is still
overwritten and the tag guard accepts any namespace — prove/107 deferred with the cheap hardening),
prove/103 (the refusal sanitised as formed, the apm line once before both the remedy and the path; the
fixture spells `\e` and `\r` so the case is not vacuous). No weakened test (the literal budget replaced by
a tighter derived one; `scenario()` gained an additive parameter; thirteen new cases assert positive
outcomes and the refusal cases assert nothing was pushed). One Minor on the fixer's own lines (prove/106,
deferred): the apm remedy repeats the spelling and its file-order list can differ from the sorted paths.
Suppressed as unchanged or pre-existing: the `-suffix` case comment's old boundary set, the in-process
ceiling literal, REQ-PROVE-018's other citations (already inboxed). One unverified observation: the
Windows leg took 12m6s at `95660ea` against 7m40s at `27b1837`; nothing in the seven commits obviously
accounts for it. The candidate stands at `95660ea`; the loop and the deep-review stage are closed.

## Side effects — learnings (2026-09-20, through `stamity learn capture`)

Two captured: `git-stash-is-shared-across-worktrees` (one stash stack per repository — P6's pop received
C3's working set; recovered; the safe baseline is a patch file plus `git restore`) and
`engine-layer-modules-cannot-drive-init` (a `src/plugins` module importing `src/cli/commands/init` is
refused by the boundaries test and eslint; a setup engine lives at `src/cli/commands/<verb>/` at wave 15 —
C6's placement), each with `reviewBy` and `validatedAgainst` added in the head. One retired:
`gitignore-misses-a-symlinked-node-modules` — its review horizon was satisfied by U0's bare `node_modules`
line (`git rm` at this close; the ledger row build/21 carries the dated retirement). The spec deltas of
files 1 and 2 were merged as built in two spec-author passes (`45800c2`, `7191801`); no dependency was
added or bumped in the range (no dependency-audit note); the pull request is #46, opened as a draft at the
first push and flipped to ready at this close; no board source is linked (no progress events).
## QA checkpoint (2026-09-20)

- What to verify: the walk-through `qa-session-2.md` beside this record — 40 rows auto-proven by
  assertions in the candidate's tree, the runner's gate and the harness evidence (`qa-95660ea.json`),
  and nine rows left for a person (65 minutes): the plugin-backed setup on a fresh repository with a real
  root, the Copilot, Cursor, Claude Code and Codex install-and-invoke routes (each measured once by a spike
  on its unit's branch, none headlessly at the candidate — file 3's V1 is the unit that measures them),
  the real publish path (walked at the 1.9.0 release), the `.gitignore` line, the upgrade over an existing
  checkout, the plugins guide's rendering.
- Browser evidence: the harness's site lanes at the candidate (H2, H3a–H3d `passed` at 375 and 1440,
  light and dark) stand as the browser evidence; the new guide is not in the harness's page list, so its
  rendering is a person's row.
- The maintainer's answer through the question tool: **Shippable YES, accept the nine unperformed rows** (the recommended option; the declared default) — recorded in `qa-session-2.md`'s sign-off block; the six M rows stay signed off and not performed until file 3's V1 measures the four client routes and V7 walks the publish path.

## Proof block — session 2

- Gate results (the runner at `95660ea`, worktree `p15s2-gate2`, each command unpiped):
  `npm run lint` pass · `npm run typecheck` pass · `npm run test -- --coverage` pass (229 files, 9,145
  passed, 9 skipped; coverage 96.58 / 89.99 / 98.76 / 97.41, no threshold line; one contended red on
  `test/qa/hookRuns.test.ts:167` re-run green alone and in a full uncontended run) · `npm run build`
  pass (logic 1.31 MiB of 2.00, corpus 0.52 of 1.50) · `node dist/cli.js sync` + `check` pass
  (`0 created, 0 updated, 67 unchanged`; every row `ok`) · the CI self-consistency chain pass (five
  generators, no diff) · `npm run knip` pass · `node scripts/leak-gate.mjs` pass (`0 hits for 18 rules
  across 1535 files`) · `node scripts/tarball-smoke.mjs` pass · the plugin route pass (pack, runtime 637
  files, four archives, `--check` four roots 2,776 files) · `--version 1.9.0+1` refused, exit 2 · CI at
  `95660ea`: floor, LTS and Windows legs pass, both aggregators pass · the state-file gates
  (`test/records test/learnings test/qa`) pass in the main checkout · `test/cli/docs/measurements.test.ts`
  pass after the regeneration.
- Review verdicts, per round (reviewers and lenses at `claude-fable-5-1`):
  round 1 (wave 1) request-changes, confidence high — 1 Critical, 4 Warnings, 11 Minors ·
  round 2 (wave 2) request-changes, high — 3 Warnings, 14 Minors, every round-1 closure verified ·
  round 3 (waves 2 and 3) request-changes, high — 5 Warnings, 5 Minors, every round-2 closure verified ·
  round 4 (the re-review) request-changes, high on the closure table — 2 new Warnings, 4 Minors, every
  round-3 closure verified; the security lens closed SEC3 and left SEC4-M1 ·
  the whole-branch deep review request-changes 0.85 — 2 Warnings, 6 Minors, the round-4 closures verified ·
  the security lens over the final state — 1 Warning, 1 Minor, SEC4-M1 closed ·
  the whole-branch re-review approve, confidence 0.86 — every closure verified, one Minor deferred.
- Decisions trace: no decision asked during the run — every ambiguity closed on the standing decisions of
  2026-09-17 and session 1, with these readings recorded in their entries: C6's placement as reading R2
  (the CLI layer at wave 15, the engine-layer learning); the loop's four-round cap governing the loop
  over the built units with the round-4 fixer at the stronger class; the whole-branch deep review as
  the deep tier's own stage with a fresh fixer at the stronger class and a whole-branch re-review (session
  1's precedent); the contended `hookRuns` red classified a load flake after a green file run, a green
  uncontended full run and green CI legs at the same tree. Deferrals: 29 ledger rows closed
  `deferred` with their rationale, each with an inbox row (29 rows in the session-2 block of
  `.stamity/inbox.md`); four session-1 rows retired by this session's units (build/21, build/11, prove/9,
  build/18). The one question asked — the QA sign-off: shippable YES with the nine person rows accepted unperformed.
- Artifacts touched, by owner (worktree lanes `p15s2-<unit>`, integrated by the orchestrator's
  cherry-pick onto `package-15-plugin-lifecycle-2`; every implementer, fixer 1–3 and the spec-author at
  `claude-opus-5`; fixers 4 and 5 at `claude-fable-5-1`):
  U0 `.gitignore` · P2b `src/emit/planner.ts`, `src/emit/hooksInfra.ts`, `src/hooks/scripts.ts`,
  `src/hooks/portableRunner.ts`, `src/hooks/userHooks.ts`, the four adapters, `src/types/core.ts`, the
  goldens · P7 `scripts/build-plugin-runtime.mjs`, `scripts/plugins/runtime.mjs`,
  `scripts/plugins/locate.mjs`, `test/ci/pluginRuntime.test.ts`, `test/ci/pluginLocate.test.ts` · P2a
  `scripts/generate-plugin-packages.mjs`, `scripts/plugins/{tokens,corpusStage,capability,setupCommand,layout}.mjs`,
  `test/ci/pluginPackages.test.ts`, `test/ci/pluginModules.test.ts`, `test/fixtures/plugins/*` · P3–P6
  `scripts/plugins/clients/{claude,cursor,copilot,codex}.mjs`, the four `test/ci/pluginPackages.<client>.test.ts`,
  the vendored schemas · P8 `scripts/build-plugin-distribution.mjs`,
  `scripts/plugins/{zip,catalogs,releaseManifest}.mjs`, `scripts/distribution-identity.mjs`,
  `test/ci/pluginDistribution.test.ts` · P9 `.github/workflows/release.yml`, `.github/release-egress.md`,
  `.github/release-controls-checklist.md`, `.github/client-contracts.md`, `test/ci/workflow.test.ts` · C1
  `src/types/manifest.ts`, `src/manifest/manifest.ts` · C2 `src/cli/commands/config.ts`,
  `src/detect/verificationGates.ts`, the charter's gates line · C3 `src/emit/ownership.ts`,
  `src/emit/skillsProjection.ts`, `src/cli/commands/plugin/probe.ts`, `src/cli/commands/check.ts`,
  `src/cli/commands/clean.ts`, `src/cli/commands/sync/report.ts`, `src/cli/kit/packageName.ts` · C4
  `src/cli/commands/plugin.ts`, `src/cli/commands/plugin/status.ts`, `src/cli.ts`, the docs reference
  pages · C6 `src/cli/commands/plugin/setup.ts`, `src/plugins/capabilityFile.ts`, `src/composition/root.ts`
  · C9 `src/roster/modelLadder.ts`, the manifest's effort scale, the adapters' effort rendering · C7
  `docs/plugins.md` (new), README, `llms.txt`, ten guides, `docs/capability-matrix.md`,
  `scripts/plugin-container-facts.mjs`, `src/emit/capabilityMatrix.ts`, `src/cli/docs/llmsIndex.ts` ·
  the spec-author `docs/specs/plugin-lifecycle.md`, `docs/specs/model-ladder.md`, the two plan files'
  amended cells · fixers 1–5 the files their entries name · the orchestrator this record, the ledger, the
  inbox, the QA walk-through, the two learnings (through `stamity learn capture`), the evidence file, the
  measurements page (regenerated).
- Per-action attribution (evidence class stated): the sub-agents' returns are quoted into this record
  (self-quoted markers; the client's per-agent transcripts sit in the session directory, not in the
  tree); the CI runs are native artifacts (the run URLs in the CI sections); the harness evidence is a
  native artifact (`.stamity/evidence/qa-95660ea.json`); the runner's logs are session-local
  (`scratchpad/gate2/`), quoted here. Hook-gate outcomes: none published by this client's events for the
  loop, so the cap and the ladder were prompt-carried and are recorded as such.
- Isolation primitive: git worktrees under the farm, one per lane, `node_modules` symlinked, declared
  before the first Phase 3 dispatch; the one shared stash stack bit P6 once (recovered; the learning
  captured); the shared scratch directory bit P3 once (private subdirectories per lane thereafter).
- Recommended next step (from this run's own state): session 3 runs file 3 — V1 (the per-client route
  proof, which measures the four install-and-invoke rows this checkpoint left to a person), V2, V3 and V5
  in parallel, V4 on the maintainer's go, V6, then V7 with the 1.9.0 release; the 29 inbox rows of this
  session wait for the units that touch their files (the Codex `commandWindows` line and the `plugin
  status` refinements for V1, the trust pages' re-attestation header and REQ-PROVE-018's citations for
  V7's hand-page re-attestation) or the hygiene batch after 1.9.0. `Not done:` nothing within this session's scope. Carried: the nine QA rows accepted unperformed (V1 and V7 measure them); the 29 inbox rows of this session; file 3 for session 3.

## Closing entry — session 2 (2026-09-20T19:05Z)

- CI on the state commit `32947c7`: floor 3m18s, LTS 4m14s, Windows 10m40s, the three apm route legs, DCO,
  the title check, the size budget, the two advisory checks — every leg green; `all-ci-checks` and
  `all-pr-checks` both `pass`. The state-file gates (`test/records`, `test/learnings`, `test/qa`) and the
  measurements test ran green in the main checkout before the push; the leak gate over the tree with the
  untracked state files reported `0 hits for 18 rules across 1538 files`.
- Pull request #46 rebase-merged at 2026-09-20T18:54:57Z: public `main` `3d23f75` (87 commits from
  `e8715ec`, the four session-1 close commits included: U0, files 1 and 2, five fixer rounds, the
  spec-delta merge and its follow-up, the record). Two merge calls through the GraphQL endpoint failed on
  transport errors (a 499, an EOF) with the pull request untouched; the REST merge endpoint merged on its
  first attempt.
- The measurements page: byte-stable at this close — the 2026-09-20 snapshot written at session 1's close
  already reads 6 of 8 (this record's ledger carried no open row then, as it carries none now), and the
  generator refuses to rewrite a same-day snapshot by design; the live rate is 6 of 8.
- The private layer: the session's decision row (the sign-off), the HANDOFF paragraph of 2026-09-20
  (session 2), the dashboard banner, the directive's note, the kickoff regenerated for session 3 — pushed
  at the close.
- CI on `main` after the merge: the run at `3d23f75` was superseded, the closing-entry commit `db160c2`
  went red on the leak gate (two private ledger ids spelled in this entry — the same class session 1 hit),
  `dd91178` respelled them and every job passed (run 35531546115: floor, LTS, Windows, the three apm route
  legs, `all-ci-checks`). Spell decision rows and directives descriptively in a public file.
- Not done: nothing within this session's scope. Carried: the nine QA rows accepted unperformed (file 3's
  V1 measures the four client routes, V7 walks the publish path); the 29 inbox rows of 2026-09-20 in the
  session-2 block; file 3 (V1–V7) and the 1.9.0 release for session 3. No `plugin-dist` branch and no
  `plugins/*` tag exist yet. The 27 lane worktrees under the farm (`p15s2-*`) are integrated and can be
  pruned.

# Session 3 — the hook-path bug unit, then file 3 (the route proofs, the fixtures, the private chain, the eval, the QA form, the release close) toward 1.9.0

Session status: opened 2026-09-20T20:20Z as an unattended overnight run under the maintainer's overnight
contract of 2026-09-20 (no question blocks before the QA checkpoint; where a decision is needed the
recommended option executes as the declared default and is recorded here as "default executed under the
overnight contract of 2026-09-20"; three holds — V4, the V6 sign-off, the 1.9.0 publish approval — each
with a handoff). Branch `package-15-plugin-lifecycle-3` cut from `main` `67f404b`. One pull request for
the session, opened early as a draft, merged by rebase only after the maintainer reads the morning summary.
The same rules as sessions 1 and 2: the eleven standing decisions of 2026-09-17, the six of session 1, the
one of session 2 and the readings of record applied as written; writers, implementers, fixers and runners
at `claude-opus-5`; reviewers and lenses at `claude-fable-5-1`; a fixer past the loop's cap or for a
whole-branch review's findings at `claude-fable-5-1`.

## Baseline, re-verified at intake (2026-09-20T20:10Z)

- Public `main` = `origin/main` = `67f404b`; pull request #46 `MERGED` by rebase at `3d23f75`
  (2026-09-20T18:54:57Z); the four close commits `db160c2`, `dd91178`, `7436c9c`, `67f404b`; working tree
  clean ✓
- CI on `main`: `7436c9c` run 35532287662 success (every leg); `67f404b` run 35533988057 success
  (docs-only); `db160c2` the recorded leak-gate red, `dd91178` run 35531546115 green ✓
- Released 1.8.0: `v1.8.0` → `e79dcf0`; the GitHub release list shows v1.8.0 latest (2026-09-16) ✓
- Eval run of record: run 30 (the newest directory under `evals/runs/`) ✓
- No `plugin-dist` branch and no `plugins/*` tag on `origin` (`git ls-remote`) ✓
- The plan-008 ledger: 173 rows — 113 `fixed`, 54 `deferred`, 6 `rejected`, 0 `open` ✓
- Node 22.22.3 on the machine; engine floor `>=22.22.2` ✓
- The four client binaries resolve from `PATH` (`claude` 2.1.278, `codex-cli` 0.154.0, GitHub Copilot CLI
  1.0.85, the Cursor agent CLI 2026.09.15); the profile exports `STAMITY_<CLIENT>_BIN` from `command -v`,
  and a non-interactive shell re-exports them before any harness or proof run ✓
- Learnings read: all nine under `.stamity/learnings/` ✓
- The private layer read: the kickoff of record, the two decision rows and the two directives of
  2026-09-20, the orchestrator-context brief and the session-2 measurement, the dashboard banner ✓
- Deferral inbox: the five rows of 2026-09-17, the session-1 rows less the four retired, the 29 rows of
  session 2, and the maintainer's hook-path row of 2026-09-20. The kickoff assigns every overlapping row to
  a unit (the hook-path row → U1; the Codex `commandWindows` line, the `plugin status` refinements and the
  distribution README's Codex `--ref` line → V1; the trust pages' re-attestation header, the contracts
  page's currency constant and REQ-PROVE-018's citations → V7; the `docs/plugins.md` Renovate example → V4);
  no fold-in question is asked under the overnight contract ✓
- The 27 lane worktrees of session 2 (`p15s2-*`) pruned at intake with their branches — every one was
  integrated; the farm holds the main checkout alone; 20 GiB free on the volume ✓

## Frame (2026-09-20T20:20Z)

- Outcome: U1 (the hook-path bug unit) lands first; then batch B1 of file 3 — V1, V2 part 1 (the fixture
  builder and its test), V3 and V5's three cases in parallel, V2 part 2 (the `H5` row and the walk in the
  harness lane V1 creates) after V1 lands; then V5's eval run under the incremental rule once V1–V3 are
  green; then V6's walk-through with the sign-off question asked and left open; then V7's candidate
  preparation (the CHANGELOG section, the checklist's per-release lines, the spec status flips, the
  measurements). V4 waits for the maintainer's go; the 1.9.0 release run waits for the maintainer's
  publish approval. Nothing is merged, tagged or published tonight.
- Intensity: **deep** — a security guard's fail mode (U1), emitted hook bytes, four vendor CLIs driven
  headlessly, the release candidate, a wide diff.
- Freshness guard on the plan artifact (`stamp: ec6668d 2026-09-17`): 16 of file 3's 32 `reads:` entries
  moved between the stamp and `67f404b` (three learnings, two eval tests, two CI tests, two eval files, the
  two workflow files, one CLI test, one spec, one guide, the changelog, the inbox) — every one moved by
  session 1's or session 2's own units, by the plan run's outputs, or by the maintainer's inbox row of
  2026-09-20, and file 3 was written to run after files 1 and 2 (`depends_on`). Verdict: fresh by the
  plan's own sequencing. Two cells are read against the as-built tree rather than as written: V5's
  adversarial case names a `plugin migrate` preview the maintainer cut on 2026-09-17 (the as-built refusal
  names `stamity clean -y` then `plugin setup`), and V1's Codex `commandWindows` decision has no Windows
  host to measure on — each is stated in the unit's brief.
- Isolation primitive, declared before the first dispatch: git worktrees under the worktree lane's farm
  (`../.stamity-worktrees/stamity/p15s3-<unit>`), one branch `p15s3/<unit>` per lane off the package
  branch, a `node_modules` symlink to the main checkout, every agent starting with `git reset --hard` to
  the package branch, staging by explicit path, never `git stash` (a patch file plus `git restore` is the
  baseline), a private scratch subdirectory per lane; the orchestrator integrates each unit's commits onto
  the package branch by cherry-pick (single writer per artifact — this record, the ledger, the inbox, the
  QA walk-through and the handoffs are the orchestrator's alone).
- Model plan and spawn plan: U1 — one researcher (opus, web), one implementer (opus), one reviewer and the
  security lens (fable), fixer rounds as the loop needs (opus; a fresh fixer at fable past the cap), one
  runner (opus). B1 — four implementers (opus) in four lanes, one reviewer per unit plus the security lens
  where a trigger path matches (fable), fixers (opus), one runner per prove pass (opus). V5's run — the
  private driver of record, no sub-agent model call. V6 — the harness and the QA skill inline. V7 — one
  implementer (opus) for the candidate's mechanical lines, a spec-author (opus) for the status flips. Cost
  order: two to three million sub-agent tokens plus the eval run's usage window.
- Waves: 0 = U1; 1 = V1, V2a, V3, V5a (cut from the branch head; U1 integrates first and each lane's
  cherry-pick lands on top of it); 2 = V2b; 3 = V5's eval run; 4 = V6; 5 = V7.

## Contract census — before the B1 fan-out (2026-09-20)

| Contract | Class | Producer | Consumers found | Owner | Change kind |
|---|---|---|---|---|---|
| `QA_ROWS` (`scripts/qa/form.mjs:30`) | shared constant | `form.mjs` | `run.mjs` (the lane dispatch), `test/qa/form.test.ts:113-117` (the nine ids), `test/qa/run.test.ts`, `bind.mjs` through the row ids | V1 adds `H4a`–`H4d` (lane `plugins`); V2 appends `H5` AFTER V1 lands (V2 part 2) | facade-hold: V1 owns the shape, V2 appends |
| `CLIENT_RUNNERS` (`scripts/qa/hook-runs.mjs:71-92`) | shared constant | `hook-runs.mjs` | `runClient`, `test/qa/hookRuns.test.ts:77-85,153-167` | V1 only (cursor gains `binary: "agent"` and `args`; copilot gains `args`; the pins move with it) | reconciled(2) |
| the evidence row shape (`run.mjs` `buildRow`, `bind.mjs` `carryForward`) | persisted schema | `run.mjs` | `form.mjs`, `test/qa/*`, `.stamity/evidence/qa-*.json` | V1 adds rows in the same shape; nobody moves the shape | clean |
| `ci.yml` job map and `all-ci-checks.needs` | config | `.github/workflows/ci.yml` | `test/ci/workflow.test.ts:230-236,428,467-475,648` | V1 only (job `plugin-route`, the aggregator, the lane map) | reconciled(1) |
| `nightly.yml` headless lane steps | config | `.github/workflows/nightly.yml` | `test/ci/workflow.test.ts` (the nightly pins) | V1 only | reconciled(1) |
| `evals/SET-v7.md` roster counts and case index | derived counts | the case files | `test/evals/roster.test.ts`, `evals/README.md:526`, `test/evals/readmeCurrency.test.ts` | V5 only | reconciled |
| `parseSource` (`test/evals/support.ts:121`) | api_signature | `support.ts` | `coverage.test.ts`, `locators.test.ts`, `roster.test.ts` | V5 only, and only if the `.md`-only locator must admit `scripts/plugins/setupCommand.mjs` | reconciled or clean (decided by running) |
| `EXPECTED_PRIMITIVES` / `downstreamCheckout` (`test/ci/downstreamFixture.ts`) | shared fixture | `downstreamFixture.ts` | `test/ci/apmDownstream.test.ts`, `test/ci/pluginPackages.test.ts` | V3 only (additive: `EXPECTED_PLUGIN_FILES`, the identity block, a `git init`) | reconciled(2) — both consumers re-run by V3 |
| `scripts/build-plugin-distribution.mjs` flags (`--version`, `--client`, `--source-commit*`) | api_signature | P8 | V2 (spawns it twice), V3 (spawns it from a fixture checkout), the release workflow | nobody in B1 moves it | clean |
| `validateCapabilityFile` / `PLUGIN_CLASSES` (`scripts/plugins/capability.mjs`) | api_signature | P2a | V1's structure leg, the four package tests | nobody moves it | clean |
| `.github/client-contracts.md` | hand page | U1 (the Claude hook working-directory sentence), V3 (one downstream sentence) | `test/docsPages.test.ts` (the evidence-page contract, `EVIDENCE_REATTESTATION_DATE`) | sequential: U1 lands first, V3's sentence sits in a different bullet | reconciled(1) |
| `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` | emitted bytes | the adapters | the goldens test, the dogfood tree | U1 (the claude sections); V1 only if the Codex `commandWindows` line moves (the codex sections) | reconciled — regenerated per lane, disjoint hunks |
| `docs/plugins.md` | hand page | C7 | `test/docsPages.test.ts` | V1 (the executed command blocks) in B1; V4 and V7 later | clean in B1 |
| `CHANGELOG.md` | hand page | — | `test/ci/changelogLinks.test.ts`, the release workflow's extractor | V7 only | clean |
| this record, the ledger, the inbox | state files | the orchestrator | `test/records`, `test/qa` | the orchestrator alone | clean |

Skip note: V2 part 1 (`scripts/plugin-lifecycle-fixture.mjs`, `test/ci/pluginLifecycle.test.ts`) and V5's
cases share no contract with V1 or V3 beyond the rows above; every row closes as `clean`, `reconciled(N)`
or a facade-hold with its owner named, so the batch dispatches in parallel.
