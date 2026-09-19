# Package 15 — Plugin-backed distribution lifecycle (plan 008, file 1: batch A and P1)

Status: **closed** — opened 2026-09-19T09:40Z on the kickoff of 2026-09-17 (regenerated at the planning
close); merged 2026-09-19T22:38Z as pull request #45 (`main` `e8715ec`); closed with the entry at the end.
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
