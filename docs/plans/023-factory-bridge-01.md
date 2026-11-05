---
id: factory-bridge-01
intent: roadmap
stamp: 2ce31e5a9fe3e5e302b47cc7f92cd4fed655665a 2026-11-04
reads: [.github/release-controls-checklist.md, .github/workflows/ci.yml, SECURITY.md, content/commands/st-board.md, content/commands/st-pr-resolve.md, content/commands/st-work.md, content/skills/st-unattended/SKILL.md, content/skills/st-unattended/references/cloud.md, docs/cloud.md, docs/security-mapping.md, docs/specs/board-writes.md, docs/specs/everyday-flows.md, docs/specs/prove-behavior-and-value.md, docs/troubleshooting.md, evals/SET-v7.md, scripts/qa/cloud-check.mjs, src/adapters/copilot.ts, src/change/classify.ts, src/change/personOnlyPaths.ts, src/cli/commands/config.ts, src/cli/commands/gate.ts, src/cli/commands/run.ts, src/cli/commands/runLand.ts, src/cli/docs/measurements.ts, src/cli/engine/autonomyGate.ts, src/cli/engine/ghRunner.ts, src/config/autonomy.ts, src/detect/repoAnalyzer.ts, src/hooks/personOnly.ts, src/hooks/scripts.ts, src/manifest/manifest.ts, src/manifest/ownedPaths.ts, src/runs/landEvidence.ts, src/runs/planCheck.ts, src/runs/preflight.ts, src/runs/runContract.ts, src/types/manifest.ts]
---

# The factory bridge, the core — file 1 of 2

This file is self-contained. It is the first of two `/st-plan` artifacts for **Package 26**, the bridge between 1.x and a
later 2.0. File 2 (`docs/plans/023-factory-bridge-02.md`) holds the rest and the 1.18.0 cut. This file ends with no release.

## Context

An item a product person marks ready should go through to a merged pull request with nobody watching, on Claude and on
Cursor, locally and in their clouds. Five things stop that today: an administrator cannot pass the unattended pre-flight;
`run land` merges on evidence but has no idea of blast radius or of the default branch's health; no review tool is asked or
waited for, so silence passes; no trigger reads the run contract; and Claude's cloud cannot finish `run land`, because its
proxy refuses GraphQL. Each unit must help now or teach 2.0 something lasting, and this code may be replaced, so it stays
lean. Out of scope: company MCP, the run overview, the human-only list, propose-only learning and Copilot (file 2); new pack
work (packs are frozen); the deep audit engine and the new brand (both belong to 2.0).

## Roadmap lenses

Stage: `solo` from the charter, so time to first value leads, with one reversible path, and scale work waits.
Business lens unavailable for market size and revenue: Stamity is a common good and nothing here is priced.

| Outcome (business lane) | Measured by | Unblocked by (technical lane) |
|---|---|---|
| An item goes from ready to merged with nobody watching | one real run per cloud on a scratch repository, ready item to merged pull request | `settings`, `preflight-admin`, `land-wiring`, `land-job`, `item-contract`, `board-item`, `factory-guide` |
| The person trusts what merged alone | auto-merge only inside declared rules; a red default branch stops it; a silent review tool holds it | `auto-ship-rules`, `review-tool-reader`, `land-wiring`, `docs-truth` |
| The person hears when a run ends | a GitHub review request reaches the people the contract names | `run-end-notice` |
| A release costs less | about 3 hours off a 1.17.0-shaped release, with every safety floor case still measured | `release-speed` |

`eval-cases` and `skills-prose` are `enabling`: the first keeps the next release's eval from meeting new prose cold, the
second is what a model reads to act on all of the above.

## Decisions

Taken for this plan; each is the recommended option, listed here so a reader can reverse it before a unit runs.

- **Every new setting lives inside `autonomy`:** `adminRuleProof`, `autoShip`, `reviewTool`, `landJob`. One strictest path,
  one loosening path, one marker. Each key is emitted only when on, so default guard bytes and the goldens do not move.
- **An admin passes only on a repository or organization ruleset** that binds now. Classic branch protection does not
  count. Unpinned organization rulesets and owners do count where the ruleset says the account cannot bypass it, because
  "cannot bypass now" holds and the person accepted the lift risk by turning the setting on.
- **The brake is an ask, not a refusal,** and it holds every land without `--approved`. `--approved` never passes a
  refusal, so a refusal would lock out the fix for a red default branch.
- **Auto-ship stays merge-only.** A fast-forward onto a deploying branch still asks.
- **`src/change/classify.ts` is not edited.** Rules sit in a new pure `src/change/autoShip.ts`. Editing the classifier asks
  at land, and CI loads it with no install.
- **The review signal is the tool's state comment,** not a reaction: a reaction cannot be tied to a commit. The default
  wait is 40 minutes (the worst start plus the worst run seen across 28 pull requests, about 36).
- **The final merge job is `workflow_run`-driven, off by default, on `GITHUB_TOKEN` only,** and re-proves the evidence
  itself through a version-pinned CLI. It never runs the head's code.
- **The contract keeps version 1.** `answerer` serves the notice; a new key would be refused by older CLIs.
- **The ready signal is the label `stamity:ready` on a GitHub issue.** The board never creates a label, so the guide tells
  the person to create it.
- **The factory guide is a new page,** `docs/factory.md`. `docs/cloud.md` is sorted by vendor and has no home for local.

## Spec delta

Stated against `docs/specs/everyday-flows.md` unless a line says otherwise. `docs-truth` merges this delta.

### REQ-FLOW-151 — An administrator passes the pre-flight only under the opt-in and a rule that binds (ADDED)

- Given `autonomy.adminRuleProof` is on in every leg the strictest read covers, and a ruleset blocks a direct push to the
  default branch, and GitHub reports the account cannot bypass it, when `gate preflight --unattended` runs, then
  `direct-push` reads `blocked` and the verdict carries the warning `admin-can-lift`.
- Given the setting is off, or on in only some legs, when an administrator runs the same check, then the refusal stands as
  today.
- Given a bypass value GitHub reports that is neither `never` nor `pull_requests_only`, then the check fails closed.

### REQ-FLOW-152 — `run land` may merge onto a deploying branch only inside declared rules (ADDED)

- Given `autonomy.autoShip` is set, the default branch is in `deployingBranches`, and the change fits every rule (files,
  lines, classes, paths, no specialist lens), when `run land` decides, then it merges with no ask and the pull request's
  evidence line names the rules it met.
- Given any rule fails, or the line count or classification is incomplete, then the land asks and names each reason.
- Given `--fast-forward`, then the land still asks. Stamity never deploys, tags or releases by this route.

### REQ-FLOW-153 — `run land` stops while the default branch is red (ADDED)

- Given a required check run on the default branch's tip reads failing, when `run land` decides without `--approved`, then
  it asks and names the failing checks. A required context that is missing or pending on the tip does not read as red, and
  the land's evidence line says so.
- Given the tip cannot be read, then it asks, naming the read that failed.

### REQ-FLOW-154 — A named review tool is asked, waited for, and never passed by silence (ADDED)

- Given `autonomy.reviewTool` is set, when `run land` reads a state comment from the configured bot on the exact head with
  `status` `completed` and both findings flags false, then the review evidence holds.
- Given findings on the head, or no result when the wait runs out, or an unknown block, then the merge holds and names why.
- Given rounds already spent reaches `rounds` (default 2, at most 3) without a clean head, then the merge holds for a person.
- Given a comment carrying the same text from any other author, or a state comment last edited by anyone but the tool, then it counts for nothing and the merge holds.
- Given `clean` by the state comment, then the tool's own `+1` reaction must also be on the pull request, and exactly one trusted comment may carry the marker.

### REQ-FLOW-155 — A ready item produces a run contract `plan check --contract` passes (ADDED)

- Given an issue whose body carries a summary, criteria, `Branch:`, `Plan:` and `Ref:`, on that branch, when `stamity run
  contract --run <id> --item <owner/repo#n>` runs, then `.stamity/runs/<id>/contract.yml` is written and `stamity plan check
  <plan> --contract <that file>` exits 0.
- Given the current branch is not the item's, or the plan's hash differs from the item's, then the verb refuses and names which.

### REQ-FLOW-156 — The people a run contract names hear when the run ends (ADDED)

- Given a contract whose `answerer` is a login or team, when the run's first `run end` with a pull request finishes, then a
  GitHub review request reaches that reviewer, unless the reviewer is the pull request's author.
- Given the request fails or cannot reach anyone, then the run still ends and `Not done:` names the notice.

### REQ-FLOW-157 — A GitHub job can finish a land where the cloud cannot (ADDED)

- Given `autonomy.landJob` is on and a run has ended unblocked, when the watched workflow completes on the head, then the
  job re-proves the same evidence `run land` uses and merges, or exits leaving the pull request as it was.
- Given a thread a person opened and the run closed, then it stays unresolved evidence whichever account the job runs as.
- Given job mode on an agent's command line, then the guard refuses it.

### REQ-FLOW-158 — A label on an issue starts a cloud run on Claude and Cursor (ADDED)

- Given the setup the factory guide states, when `stamity:ready` lands on an issue from a write or admin author, then a
  cloud run starts by reference and treats the issue text as data.
- Given the label comes from an author without write access, then the run refuses to start.

### REQ-FLOW-159 — One page states how to set up the factory, cloud and local (ADDED)

- Given a reader with a repository and a client, when they follow `docs/factory.md` in order, then each step names who does
  it and where, and the page links to `docs/cloud.md` rather than restating it.

### REQ-FLOW-101 — The pre-flight (MODIFIED)

The admin refusal gains the opt-in of REQ-FLOW-151.

### REQ-FLOW-132 — `run land` (MODIFIED)

The evidence gains the review verdict of REQ-FLOW-154 and the brake of REQ-FLOW-153.

### REQ-FLOW-133 — Land asks (MODIFIED)

A deploying branch asks unless the rules of REQ-FLOW-152 are met.

### REQ-FLOW-137 — The autonomy setting (MODIFIED)

The setting gains four keys, emitted only when on.

### REQ-FLOW-138 — A loosening is a person's act (MODIFIED)

Turning on `adminRuleProof`, `autoShip` or `landJob`, widening `autoShip`, dropping `reviewTool`, changing its tool or proof of clean, and raising its `rounds` or `waitMinutes` are loosenings. Legs that name different review tools go to a person: no leg wins, and `run land` asks, naming them.

### REQ-FLOW-145 — The security pages state the autonomy model (MODIFIED)

The four pages name the brake, the admin residual (the account could still lift the rule; only the guard stops that) and the job.

### REQ-PROVE-020 — The run of record (MODIFIED, `docs/specs/prove-behavior-and-value.md`)

A run of record may chain back to a full measure when every safety case was measured on a candidate of its release.

### REQ-PROVE-033 — The composed run (MODIFIED, `docs/specs/prove-behavior-and-value.md`)

Every release that triggers the eval measures all safety cases and every moved case; a run after a FAIL is composed.

### REQ-PROVE-034 — The release checklist (MODIFIED, `docs/specs/prove-behavior-and-value.md`)

Lines that do not read the final tree start when the cut starts.

## Units

Rules for every unit:
- A unit's `verify` names only tracked paths and files the unit writes, never a records path (`docs/plans/`, `.stamity/runs/`,
  `.stamity/inbox.md`, `evals/runs/`): a lane worktree does not hold them.
- **Whole-tree checks bind over every `verify`:** every unit also runs `test/ci/testInputsGuard.test.ts`, `test/architecture`,
  `npm run lint`, `npm run typecheck` and `npm run knip`; a unit touching `src/hooks/` or `src/adapters/` also runs `test/cloud`;
  a unit adding path strings to a `src/` file also runs `test/roster`; a `content/` edit also runs `test/evals` and `test/corpus`.
- **Derived files:** a lane regenerates what its own verify reads: `npx vitest run test/emit/crossClientGoldens.test.ts
  test/corpus/emissionGoldens.test.ts --update` (files first, the flag last) and `node scripts/generate-docs.mjs`. This
  repository's emitted copies stay the integration lane's: `npm run build && node dist/cli.js sync`.
- **One writer each:** `docs/specs/everyday-flows.md`, `SECURITY.md` and `docs/cloud.md` are `docs-truth`'s; `evals/SET-v7.md`
  is `release-speed`'s first and then `eval-cases`'s; `test/architecture/boundaries.test.ts` is the integration lane's.
- Every new `src/` module needs a `PLAN_MAP` row (`test/architecture/boundaries.test.ts:260`), importing only lower waves.
- A test outside a unit's files that pins exactly the old behaviour may be re-pinned, with a `TEST CHANGE, justified:` line.
- Never a full suite in a lane. Run order: `settings`; then `preflight-admin`, `auto-ship-rules`, `review-tool-reader`,
  `item-contract`, `board-item`, `release-speed` in parallel; `change-range` after `preflight-admin`, since both write `gate.ts`; then `land-wiring`; then `run-end-notice` and `land-job`; then
  `skills-prose`, `docs-truth`, `factory-guide`; `eval-cases` last.

### settings — the four autonomy keys and the moves the later units share

- id: settings
- requirements: REQ-FLOW-137, REQ-FLOW-138
- files: `src/types/manifest.ts`, `src/manifest/manifest.ts`, `src/config/autonomy.ts`, `src/hooks/scripts.ts`,
  `src/cli/engine/autonomyGate.ts`, `src/cli/commands/config.ts`, `src/cli/commands/runLand.ts` (the move only),
  a new `src/cli/engine/landSetting.ts`, `docs/configuration.md` (generated), `test/config/autonomy.test.ts`, `test/manifest/manifest.test.ts`,
  `test/cli/commands/config.test.ts`, `test/cli/engine/autonomyGate.test.ts`
- interfaces: `AutonomyConfig` (`src/types/manifest.ts:202`) gains `adminRuleProof?: boolean`, `autoShip?: AutoShipConfig`,
  `reviewTool?: ReviewToolConfig`, `landJob?: LandJobConfig`, with `AutoShipConfig {maxFiles: number; maxLines: number;
  classes: string[]; paths?: string[]}`, `ReviewToolConfig {login: string; request: string; clean: "state-comment" |
  "review-state" | "reaction"; stateMarker?: string; stateSection?: string; waitMinutes: number; rounds: number}`,
  `LandJobConfig {workflows: string[]}`. `ResolvedAutonomy` (`src/config/autonomy.ts:24`) carries the same, absent when off.
  Touch every site: `AUTONOMY_FIELDS` `src/manifest/manifest.ts:803`, `collectAutonomyErrors` `:849`; `AUTONOMY_KEYS`
  `autonomy.ts:54`, `admittedBlock` `:66`, `resolveAutonomy` `:88`, `loosens` `:124`, `strictestAutonomy` `:137`,
  `autonomyMarkerLine` `:152`, `parseMarkerJson` `:173`; `GuardAutonomy` `src/hooks/scripts.ts:4234`,
  `DEFAULT_GUARD_AUTONOMY` `:4245`, `baked` `:4534`, `STRICTER` `:4603`; `looserParts` `autonomyGate.ts:382`. Each key is
  written by conditional spread (`exactOptionalPropertyTypes` is on), in the same key order in marker and `baked`.
  `strictestAutonomy`: `adminRuleProof`, `autoShip` and `landJob` survive only if equal in every leg; `reviewTool` survives if any
  leg names it, with the lowest `rounds` and `waitMinutes`, since a higher value delays the hold for a person. Config keys in `KEY_SPECS` (`src/cli/commands/config.ts:991`), inserted before
  `copilot.setupSteps` with closed `choices`: `autonomy.adminRuleProof` `on|off`; `autonomy.autoShip` `off|low-risk`, where
  `low-risk` writes `{maxFiles: 10, maxLines: 200, classes: ["records","docs","tests"]}`; `autonomy.reviewTool` `none|codex`,
  where `codex` writes `{login: "chatgpt-codex-connector[bot]", request: "@codex review", clean: "state-comment",
  stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2}`; `autonomy.landJob`
  `off|ci`, where `ci` writes `{workflows: ["CI"]}`. Validation: `rounds` 1 to 3; `waitMinutes` 1 to 120; `maxFiles` and
  `maxLines` positive integers; `classes` from `CLASS_ORDER`; `request` one line of at most 200 characters; `login` GitHub's
  shape. The move, with no behaviour change: `readSetting` (`runLand.ts:782`) to `src/cli/engine/landSetting.ts`.
- testCriteria: `resolveAutonomy({})` still equals today's value (`test/config/autonomy.test.ts:41`); a marker written with
  each key on parses back byte for byte; `loosens` is true for each listed loosening and false for the reverse; `config set
  autonomy.reviewTool codex` writes the preset exactly; a default sync leaves `.claude/hooks/stamity/stamity-person-only-guard.mjs`
  unchanged; a `rounds` of 4 is refused by the manifest check.
- edgeCases: a guard copy baked by an older CLI has no new keys and reads as off; a marker whose keys are out of order reads as
  `UNREADABLE_MARKER`, the strictest; `exactOptionalPropertyTypes` refuses an explicit `undefined`, so absent stays absent.
- depends_on: none
- verify: `npx vitest run test/config test/manifest test/cli/commands/config.test.ts test/cli/engine/autonomyGate.test.ts test/hooks/scriptBudget.test.ts test/cli/commands/runLand.test.ts test/cli/commands/gate.test.ts`
- threat: Trust boundary is the manifest an agent can edit. It trusts only the strictest of default branch, HEAD, work tree and
  baked guard. Abuse: an agent runs `config set` to turn a key on. Stopped by the baked marker and `--loosen` gate: `sync` refuses
  without a person, and `.stamity/manifest.json` asks at land.

### preflight-admin — the opt-in administrator pass

- id: preflight-admin
- requirements: REQ-FLOW-101, REQ-FLOW-151
- files: `src/runs/preflight.ts`, `src/cli/commands/gate.ts` (`runPreflightVerb` only), `test/runs/preflight.test.ts`,
  `test/cli/commands/gatePreflight.test.ts`
- interfaces: `inspectDirectPush(rest, repo, opts: {adminRuleProof: boolean} = {adminRuleProof: false})` (`preflight.ts:345`);
  `directPushVerdict(rest, repo, opts?)` `:484`; `PreflightDeps.adminRuleProof?: boolean | undefined` `:80`, absent reads false.
  At `:416` collect blocking rulesets into `adminRepoBlocking` instead of the note; before `:451` return `blocked` when the option
  is on and that list is not empty, evidence saying the rule binds now and an admin could lift it. `WarningId` (`:45`) gains
  `admin-can-lift`; `gate.ts:2132` passes warnings through. Update the header `:19-23`, the comment `:371-375`, `level` `:444`.
  `gate.ts` passes the option from the strictest of the default branch, HEAD, the work tree and the baked guard
  (`guardCopySetting`, `autonomyGate.ts:142`), never from the work-tree manifest alone (`gate.ts:2075`). Do not reuse `classicVerdict`.
- testCriteria: Given an admin, a ruleset with `current_user_can_bypass` `never`, and the option on, `directPushVerdict` returns
  `blocked` with the warning; the same with `pull_requests_only`; with `always` or an unknown word it returns `open` or `unknown`,
  never `blocked`; with the option off every existing case at `test/runs/preflight.test.ts:276-350` holds unchanged; classic
  protection alone never yields `blocked` for an admin; an agent's work-tree-only edit turning the key on does not pass.
- edgeCases: an organization ruleset not pinned to this repository counts only if the bypass word says so; a ruleset in `evaluate`
  mode is not active and counts for nothing; an unread role fails closed.
- depends_on: settings
- verify: `npx vitest run test/runs/preflight.test.ts test/cli/commands/gatePreflight.test.ts test/qa/cloudCheck.test.ts test/cloud/ending.test.ts`
- threat: The boundary is GitHub's answer about the rule. It trusts `current_user_can_bypass` on an active ruleset. Abuse: a repository
  with a bypass grant passes as blocked. Stopped by accepting only `never` and `pull_requests_only`, failing closed on any other word.

### change-range — classify what actually merges

- id: change-range
- requirements: REQ-FLOW-152
- files: a new `src/cli/engine/changeRange.ts`, `src/cli/commands/gate.ts` (the moves only), a new `test/cli/engine/changeRange.test.ts`
- interfaces: `export function classifyRange(cwd: string, base: string, head: string): Promise<{result: ClassifyResult; files: number; lines: number | null; complete: boolean}>`.
  Nothing at this repository's head classifies a committed range: `classify(cwd, listed, ref)` (`gate.ts:1281`) compares the base with the work tree, the index and untracked files. So this is
  a new read, not a move. It reads the object store only: `git diff-tree` and `--numstat` between `base` and `head`, hunks and lockfile copies from blobs, never the work tree or the
  index, so a change committed and then reverted in the work tree still counts. Line rules and the lockfile audit run. Moved to this file with no behaviour change, since `runLand.ts` and `gate.ts` share
  wave 14: the class-file read (`readBaseClassFile` `gate.ts:1049`, `rulesFrom` `:1061`) and the shared parsers both need. The class file is read from the base commit only.
- testCriteria: a product edit committed then reverted in the work tree classifies as `product`, not unchanged; a process spawn in a `src/` hunk raises the class by its line rule; for a clean tree the class equals `gate classify`'s on the same change; `lines` is the numstat sum.
- edgeCases: a binary file leaves `lines` null and `complete` false; a base or head not in the object store refuses with a coded error, as a shallow clone does; a rename counts both paths; an empty range returns zero files.
- depends_on: settings, preflight-admin
- verify: `npx vitest run test/cli/engine/changeRange.test.ts test/cli/commands/gate.test.ts test/change/classify.test.ts`
- threat: The boundary is what a run committed. It trusts the object store and the base commit's class file, so no change sets its own rules. Abuse: a run hides a change from the classifier in the work tree. Stopped by reading committed objects only.

### auto-ship-rules — size, path and risk as pure rules

- id: auto-ship-rules
- requirements: REQ-FLOW-152
- files: a new `src/change/autoShip.ts`, a new `test/change/autoShip.test.ts`
- interfaces: `export interface AutoShipFacts {result: ClassifyResult; files: number; lines: number | null; complete: boolean}`;
  `export type AutoShipVerdict = {eligible: true; evidence: string} | {eligible: false; reasons: string[]}`;
  `export function autoShipVerdict(facts: AutoShipFacts, rules: AutoShipRules | null): AutoShipVerdict`. `AutoShipRules` is
  `AutoShipConfig` from `settings`. `ClassifyResult` is `{class, byPath: {path, class, rule}[], checks, lenses, reason}`
  (`src/change/classify.ts:989`). Import types and the runtime `matchGlob` (`:792`) from `classify.ts`: one matcher, as
  `personOnlyPaths.ts` does. `classify.ts` must not import this module: its closure is pinned to three files
  (`test/runs/landEvidence.test.ts:131-133`). Erasable syntax only. The class rule reads both `result.class` and every `byPath` class in
  one reason, since `result.class` can sit above them. An empty change has its own check: it classifies `product` with an empty `byPath`.
- testCriteria: a docs-only change of 3 files and 40 lines under `low-risk` is eligible and the evidence names both limits; 11 files,
  201 lines, a `product` class, a path outside `paths`, a non-empty `lenses` each give one named reason; `rules === null` gives not eligible.
- edgeCases: `lines === null` or `complete === false` gives not eligible, naming which; an empty change is not eligible; two failed
  rules return both reasons, not the first.
- depends_on: settings
- verify: `npx vitest run test/change/autoShip.test.ts test/change/classify.test.ts`

### review-tool-reader — reading a review tool's verdict

- id: review-tool-reader
- requirements: REQ-FLOW-154
- files: a new `src/runs/reviewTool.ts`, a new `test/runs/reviewTool.test.ts`
- interfaces: `export type ReviewToolState = "clean" | "findings" | "waiting" | "silent" | "spent"`; `export interface
  ReviewToolVerdict {state: ReviewToolState; reason: string; head: string}`; `export interface ReviewToolFacts {head: string;
  now: number; comments: {id: number; userLogin: string; userType: string; body: string; createdAt: string}[]; reviews: {userLogin:
  string; commitId: string; state: string}[]; reactions: {userLogin: string; content: string}[]}`; `export function
  parseStateBlock(body: string, marker: string, section: string): {commitSha: string; status: string; hasFindings: boolean;
  hasUnresolved: boolean} | null`; `export function reviewToolVerdict(facts: ReviewToolFacts, tool: ReviewToolConfig):
  ReviewToolVerdict`; `export function requestMarker(head: string): string` returning `<!-- stamity:review-request <head> -->`.
  The block's shape: `<!-- codex-review-state:v1 {"code_review":{"commit_sha":"<40 hex>","has_any_findings":false,
  "has_unresolved_findings":false,"status":"completed"},"security_review":...} -->`. Accept a block only from a comment whose
  `userType` is `Bot` and `userLogin` is `tool.login`. `clean` needs `status` `completed`, `commit_sha` equal to the head, both flags
  false. `state-comment` is proven for Codex; `review-state` needs `APPROVED` on the head; `reaction` needs `+1` and is the weakest:
  it cannot be tied to a commit, and the setting's docs say so. Rounds spent is the count of distinct heads carrying a request marker.
  A section left null is ignored. Pure: no I/O, wave low enough for `src/runs/landEvidence.ts` to take the type.
- testCriteria: a clean block on the head gives `clean`; on another sha gives `waiting`; `completed` with a true flag gives `findings`;
  `running` past `waitMinutes` from the request marker's `createdAt` gives `silent`; the same text from a `User` gives `waiting`; a
  malformed block gives `waiting`; spent rounds without a clean head give `spent`.
- edgeCases: an unknown status or version never reads clean; a block that never appears reads `waiting`, then `silent`; flags stay true
  after every thread is resolved, so only a new run clears them, and that reads `findings`.
- depends_on: settings
- verify: `npx vitest run test/runs/reviewTool.test.ts`

### item-contract — `stamity run contract`

- id: item-contract
- requirements: REQ-FLOW-155
- files: a new `src/runs/itemContract.ts`, a new `src/cli/commands/runContract.ts`, `src/cli/commands/run.ts`, `docs/cli-reference.md`
  (generated), a new `test/runs/itemContract.test.ts`, a new `test/cli/commands/runContract.test.ts`
- interfaces: `stamity run contract --run <id> --item <owner/repo#n> [--json]`, registered as `land` is (`run.ts:157`, `:276`, `:311`).
  `export interface ItemBody {summary: string; acceptance: string; branch: string | null; plan: {path: string; hash: string} | null;
  ref: string | null}`; `export function parseItemBody(body: string): ItemBody`; `export function contractFromItem(item: ItemBody, facts:
  {base: string; files: string[]; itemRef: string; author: string}): string` returning YAML that `src/runs/runContract.ts`
  parses at version 1. The six keys: `run-contract`, `plan`, `base`, `acceptance`, `scope.in`, `answerer`, plus `item`. `plan` and the
  item from the `Plan:` line and `--item`; `base` is HEAD; `acceptance` the criteria, stripped of control and invisible characters, HTML comments dropped, cut at the next heading or the closing links, at most 16,384 bytes, and deny-scanned before anything is written; `scope.in` the union of the plan units'
  `files` (`parsePlanUnits`, `src/runs/planCoverage.ts:451`); `answerer` `@` plus the issue's author. The read is REST through
  `ghApi` (`src/cli/engine/ghRunner.ts:278`), never `gh issue`. `<hex12>` is the sha256 of the plan text, first 12 hex. Writes
  `.stamity/runs/<id>/contract.yml`, creating the run folder if absent. Emit `item` as `owner/repo#n`, the long form.
- testCriteria: a sample item produces YAML that `parseRunContract` accepts, and `plan check` with it exits 0; the current branch differing
  from `Branch:` refuses naming both; a hash differing from the plan refuses naming the plan; a body with no `Plan:` refuses.
- edgeCases: an issue author or label applier without write or admin is refused here, by the verb's own reads; a body over the read cap
  refuses; a plan whose `files` lists are empty refuses, since `scope.in` needs an entry; item text never enters the contract except
  the criteria, and never the summary.
- depends_on: settings
- verify: `npx vitest run test/runs/itemContract.test.ts test/cli/commands/runContract.test.ts test/runs/runContract.test.ts test/cli/commands/plan.test.ts test/cli/docs/cliReference.test.ts`
- threat: The boundary is an issue body. It trusts `Plan:`, `Branch:` and the criteria only from an open issue whose author and label applier both hold write or admin, read by the verb itself; an item in another repository is refused, and the criteria are stripped and deny-scanned before they are written.
  The hash detects drift only. Abuse: a person without write access steers a run. Stopped by the verb's own permission reads and the
  current-branch check. A person with write access may name any plan committed on the branch: that is their right.

### board-item — a ready item carries a summary and its links

- id: board-item
- requirements: REQ-FLOW-155
- files: `content/commands/st-board.md`, `docs/specs/board-writes.md`, `test/corpus/commands/board.test.ts`
- interfaces: An item with a plan carries, in order: a plain summary of two to four sentences, written for the board: what the work is for and what changes for the person, with no file path, command or finding; `## Acceptance
  criteria`, `Branch: <name>`, `Plan: docs/plans/<file>.md <hex12>`, `Ref: docs/specs/<file>.md`, the `<!-- stamity:item <key> -->`
  marker last. Amend the bound at `st-board.md:268-270` and `board-writes.md:66-68`, pinned at `board.test.ts:457`, so a write may also
  carry the summary and those two lines. The summary is a view of the plan, never truth (`:195-197`). A plan branch is never named
  `stamity/<run-id>`: `run start` refuses that with no record (`run.ts:467`). The file has little room under its cap (`board.test.ts:37`).
- testCriteria: the corpus test finds the amended bound; the line cap at `board.test.ts:37` holds; the filed-body section names the five parts in order.
- edgeCases: an item with no plan has no `Plan:` or `Branch:` line and stays a plain item; the board still creates no label.
- depends_on: none
- verify: `npx vitest run test/corpus/commands/board.test.ts test/evals/locators.test.ts`

### release-speed — cheaper composition and an earlier checklist tail

- id: release-speed
- requirements: REQ-PROVE-020, REQ-PROVE-033, REQ-PROVE-034
- files: `src/cli/docs/measurements.ts`, `docs/measurements.md` (generated), `evals/SET-v7.md`, `.github/release-controls-checklist.md`,
  `docs/specs/prove-behavior-and-value.md`, `.stamity/learnings/a-run-of-record-is-one-composition-link-from-a-full-measure.md`,
  `test/cli/docs/measurements.test.ts`, `test/records/measurements.test.ts`, `test/docsPages.test.ts` (release-rule texts only)
- interfaces: The measure, on the last three releases: the eval loop cost 11.5 hours of running and fixing, and 1.17.0 spent about 4
  hours on a full run and its repeat only because `readPriorRun` (`measurements.ts:1312-1320`) refuses a run more than one composition
  link from a full measure. Change: the safety set is the 48 floor cases, every adversarial case and every benign twin, 76 cases today.
  Every release that triggers the eval measures the whole safety set and every moved case on a candidate of that release; a case moved
  after that run re-measures; the run of record may then chain back to a full measure; a run after a FAIL is composed. Kept: the third
  release or 30-day full run, three samples, every threshold, calibration on every run. `readPriorRun` accepts a longer chain only when
  the chain's artifact lists every safety case as measured in this release, carrying each case's hash and source run; the page sentence
  (`:1450`) words the chain honestly. Declare the rule as a dated paragraph in `evals/SET-v7.md` before any run uses it. Checklist: the
  roster, metadata, image digest and vendor-page lines, and re-attestation on the candidate, start when the cut starts and run beside the
  eval; each read is redone if the tag lands more than 24 hours later. Hook latency, the ask checks and the label re-date stay on the final tree.
- testCriteria: a chain of two composed runs whose artifact lists all safety cases renders; one missing a safety case is refused naming the
  case; the existing one-link cases still render; the new checklist order passes `test/docsPages.test.ts` release-rule checks.
- edgeCases: a chain with no full measure at all is refused; a safety case added after the chain's measure counts as unmeasured; the
  third-release backstop still fires.
- depends_on: none
- verify: `npx vitest run test/cli/docs/measurements.test.ts test/docsPages.test.ts test/evals/successorInputs.test.ts`

### land-wiring — the brake, auto-ship and the review check in `run land`

- id: land-wiring
- requirements: REQ-FLOW-132, REQ-FLOW-133, REQ-FLOW-152, REQ-FLOW-153, REQ-FLOW-154
- files: `.stamity/change-classes.json`, `src/runs/landEvidence.ts`, `src/cli/commands/runLand.ts`, `src/config/autonomy.ts` (one word), `src/runs/reviewTool.ts` (the held edit), `src/cli/engine/ghRunner.ts` (one GraphQL document in `GRAPHQL_DOCUMENTS`), `test/runs/landEvidence.test.ts`, `test/cli/commands/runLand.test.ts`, `test/cli/engine/ghRunner.test.ts`
- interfaces: First, add `request` to the fields `reviewToolConflict` compares (`src/config/autonomy.ts:387-390`). Add `.stamity/change-classes.json` rows placing `src/cli/engine/changeRange.ts`, `src/cli/engine/landSetting.ts`, `src/change/autoShip.ts` and `src/runs/reviewTool.ts` as security-sensitive, beside `gate.ts`. `classifyRange` rejects when a commit is absent: catch that coded refusal and read it as `complete` false, so the land asks instead of failing. `readSetting` returns `reviewToolConflict`: when it is not empty, push an ask naming each leg beside the others (`landEvidence.ts:507-516`), passed through its own `LandInput` field, and do not judge review evidence with `setting.reviewTool`, which is only the first leg's. Also call `readLooserKeys(prefix, repoPath, defaultBranch, gitLine, call)` right after `readSetting`, with its own ask outside the auto-ship condition. `ReviewToolFacts.comments[].editor` comes from a fixed GraphQL read of `databaseId lastEditedAt editor{__typename login}` per comment, joined on `databaseId === id`: never edited (`lastEditedAt` and `editor` both null) reads `null`; a `Bot` editor reads `<login>[bot]`, since GraphQL drops the suffix REST carries; any other type reads the login; anything unread, or edited with no editor, reads `"unknown"`, never `null`. Pass each reaction's REST `user.login` as given and do not filter reactions on `user.type`: the bot's real `+1` reads `User`. When a change loosens an autonomy key, the land ask names the key: use the looser-keys export `settings` gives. `LandInput` (`landEvidence.ts:414`) gains `reviewTool?: ReviewToolVerdict`, `defaultBranchRed?: {failing: string[]; unread: string |
  null}`, `autoShip?: AutoShipVerdict`, passed by conditional spread in `inputFor` (`runLand.ts:473`). In `decideLand` (`:470`): the review verdict is a gap after the ledger gap
  (`:492`): `waiting` is a pending gap so `--wait` keeps polling; `findings`, `silent`, `spent` are plain gaps. The brake is an ask before `:514`.
  Auto-ship replaces `:514`: `if (deploying && !(autoShip?.eligible && forward === undefined)) asks.push(...reasons)`. `deployingActs` naming
  `pr-merge` (`:516`) and mode `ask` (`:507`) still ask. `runLand.ts`: the tip's state is `checkEvidence(required, await checkRuns(json, repoPath,
  branch.tip))`, treating only `failing` as red; read comments, reviews and reactions over REST (`issues/<n>/comments` paged, `pulls/<n>/reviews`,
  `issues/<n>/reactions`); post `request` plus `requestMarker(head)` to `issues/<n>/comments` when no run exists for the head; pass `reviewToolVerdict` only the request markers the run's own login wrote, so a stranger's comment cannot spend a round; the three reads
  also run in `reread` (`:501`) and just before the act (`:544-547`). Facts for auto-ship: `classifyRange` from `change-range`, base to head, gives `result`, `files`, `lines` and `complete`.
  The verb's budget stays 9 minutes (`LAND_BUDGET_MS` `:93`); a tool wait past it ends as `asks` with a pending line, for the next call.
- testCriteria: each `decideLand` case in REQ-FLOW-152 to 154 holds as a table test; with no new setting and a green tip, every existing case passes
  unchanged; `--approved` passes the brake but not a refusal; a red tip with `--fast-forward` still asks; the shared fake routes `commits/<tip>/check-runs`
  (`test/cli/commands/runLand.test.ts:285-287`, `:449`, `:686`, `:700`), since it answers 404 on an unknown route.
- edgeCases: any comment by the tool last edited by anyone else holds the land, marker or not (`src/runs/reviewTool.ts:172`); the merge base comes from GitHub, not local git; a required context missing on the tip reads not red, named in the evidence; a tip read that fails asks; a shallow clone leaves `complete` false, so auto-ship
  is not eligible; a pull request whose head moves between the verdict and the act re-reads; a land with no `reviewTool` never reads comments.
- depends_on: settings, change-range, auto-ship-rules, review-tool-reader
- verify: `npx vitest run test/runs/landEvidence.test.ts test/cli/commands/runLand.test.ts test/cli/engine/ghRunner.test.ts test/ci/recordsOnly.test.ts test/roster`
- threat: The boundary is GitHub data read at land. It trusts check runs on the tip and comments by a bot login. Abuse: a person pastes a clean state block
  into a comment. Stopped by `userType` and `login`. A forged tip is out of reach: the tip is read from GitHub by sha.

### run-end-notice — a review request when the run ends

- id: run-end-notice
- requirements: REQ-FLOW-156
- files: `src/cli/engine/ghRunner.ts`, `src/cli/commands/run.ts`, `test/cli/engine/ghRunner.test.ts`, `test/cli/commands/runEnd.test.ts`
- interfaces: `export function ghRequestReview(request: PullRef & {reviewers: string[]; teamReviewers: string[]}, opts: GhApiOptions = {}): Promise<GhResponse>`
  beside `ghMergePull` (`ghRunner.ts:372`), a fixed-purpose function: `requested_reviewers` stays out of `WRITE_PATHS` (`:107-118`). `POST
  repos/<o>/<r>/pulls/<n>/requested_reviewers` with `reviewers` and `team_reviewers`. In `run.ts`, the first `run end` with a pull request reads
  `.stamity/runs/<id>/contract.yml` if present, takes `answerer`, accepts only `@login` or `@org/team`, drops the pull request's author, ignoring
  case, and sends one request. No free text goes with it. Failure is non-fatal: it lands on `notDone`. No `@` mention is written anywhere.
- testCriteria: Given `answerer: "@a-person"`, the request carries that login; `@org/team` goes to `team_reviewers`; an answerer who is the author sends
  nothing and adds a `Not done:` line; a 422 adds a `Not done:` line and the run still ends 0; a free-text answerer sends nothing.
- edgeCases: no contract file sends nothing and writes no line; a contract that fails to parse sends nothing and adds a line; a solo repository where the run's
  login is the answerer reports that the notice could not reach them.
- depends_on: item-contract, land-wiring
- verify: `npx vitest run test/cli/engine/ghRunner.test.ts test/cli/commands/runEnd.test.ts`
- threat: The boundary is a contract a run can edit. Abuse: a run makes the request go to another collaborator. Accepted: the only effect is one review
  request to someone GitHub already lists as a collaborator, carrying no text. Stopped from anything wider by the shape check and the fixed function.

### land-job — the final merge job

- id: land-job
- requirements: REQ-FLOW-157
- files: `src/cli/commands/runLand.ts`, `src/cli/commands/run.ts`, `src/runs/landEvidence.ts` (`unresolvedThreads` caller only), `src/hooks/personOnly.ts`
  (the land verb's table only), a new `src/adapters/landWorkflow.ts`, `src/manifest/ownedPaths.ts`, `src/detect/repoAnalyzer.ts`, `src/emit/planner.ts` if the
  row is placed there, new `test/adapters/landWorkflow.test.ts`, `test/cli/commands/runLand.test.ts`, `test/hooks/personOnlyGuard.test.ts`
- interfaces: `stamity run land --job --pr <n>`. Emits `.github/workflows/stamity-land.yml` only when `autonomy.landJob` is on, following the Copilot pattern: an output
  row with path, content and owner (`src/adapters/copilot.ts:587-593`), the install line from `pinnedCliInstall` (`:1307`), an engine header for the byte proof
  (`ownedPaths.ts:424-428`, `:468-470`, `:527`), the path list (`:105`), and `ENGINE_EMITTED_WORKFLOWS` (`repoAnalyzer.ts:305`). The workflow: on `workflow_run` of
  `landJob.workflows`, `types: [completed]`; on `issue_comment` `types: [created, edited]` only when `reviewTool` is set, with an `if:` on the bot's login; on
  `workflow_dispatch` with a `pr` input. `permissions: {contents: write, pull-requests: write, checks: read}`. `concurrency` group per pull request, not cancelled (amended in the build). Steps
  in this order: setup-node pinned; `npm install --global @zomarit/stamity@<version>`, before any head file exists; checkout of the head as data with
  `fetch-depth: 0` and `persist-credentials: false`; `stamity run land --job --pr <n> --ready --json` with `GH_TOKEN: ${{ github.token }}`. No `npm ci`, no head
  `.npmrc`, no `npx --no stamity`. Job mode, in `runLand.ts`: skips the git-surface record (`:291-300`); reads the pull request number and the run's login from
  `PR:` and `Login:` record lines `run end` commits at the head (`run.ts`), and the run id from the marker ending the body; compares the author against the run's
  login, not the viewer (`landEvidence.ts:396`); passes the run's login to `unresolvedThreads` (`:190-196`), never the viewer; reads the tip by REST, not `git
  ls-remote`; requires `Status: closed` with no `(blocked:` and no `## Refused` row in the record at the head; writes no `land:` line, the body line stands. `--approved`
  is refused in job mode. While evidence is pending the job posts the review tool's request, waits within its time limit, then exits 0 (amended in the build). Guard: job mode on any agent's line is refused (`src/hooks/personOnly.ts`, land verb table, `:4616`).
- testCriteria: a thread a person opened and the run closed stays unresolved under a bot viewer; a run whose record reads open is refused; `--job` with `--approved`
  is refused; a guard payload carrying `--job` is refused; with `landJob` off no workflow file is emitted and `clean` removes it after turning off; the emitted file's steps
  are in the stated order and name no head code; `check` reports a `landJob.workflows` name no workflow file carries.
- edgeCases: a renamed CI workflow stops the job silently, so `check` compares names; a head pushed while the job runs fails on `sha`, 409, leaving the pull request as it
  was; `GITHUB_TOKEN` starts no `push` run after the merge, so the docs say a deploy on push must not rely on this path; `markPullRequestReadyForReview` under `GITHUB_TOKEN`
  needs a real run; a "Restrict updates" rule refuses the job, and it is never given a bypass.
- depends_on: land-wiring, run-end-notice
- verify: `npx vitest run test/adapters/landWorkflow.test.ts test/cli/commands/runLand.test.ts test/runs/landEvidence.test.ts test/hooks/personOnlyGuard.test.ts test/manifest test/detect test/cloud`
- threat: The boundary is a job that merges with write rights. It trusts the default branch's workflow and a version-pinned CLI, and treats the head as data. Abuse: head code running
  in the job. Stopped by installing the CLI before checkout and running nothing from the head. Abuse: an agent calling job mode to skip checks. Stopped by the guard refusal.

### skills-prose — what a model reads to use all of this

- id: skills-prose
- requirements: REQ-FLOW-144, REQ-FLOW-154, REQ-FLOW-155, REQ-FLOW-158
- files: `content/skills/st-unattended/SKILL.md`, `content/skills/st-unattended/references/cloud.md`, `content/commands/st-pr-resolve.md`, `content/commands/st-work.md`,
  `test/corpus/skills/unattended.test.ts`, `test/corpus/commands/work.test.ts`, the eval case `source:` ranges the shifts move
- interfaces: `content/commands/st-work.md:308` and `SKILL.md:145`: an `asks` carrying `asks.pending` means wait and call `run land` again, not ask a person: `--approved` passes no wait, and the retry is bounded by the tool's wait. When `run contract` reports `strippedComments` above zero, the run refuses to start, with a row naming the count and the fix, since a visible criterion may have gone with the comment. `SKILL.md` sits at its body cap of 163 (`test/corpus/skills/unattended.test.ts:47`), so new text goes to `references/cloud.md`, or after `## Chains`, which shifts no
  range. Leave step 5 alone: `evals/cases-v6/adversarial/unattended-open-questions-refuse-start.md:20` quotes it. `references/cloud.md`: the start from a ready item: after the pre-flight,
  fetch and switch to the branch the item names, which replaces "never guesses another branch" (`:68-69`) for that case only; run `stamity run contract`; the review loop: on
  `findings`, run `/st-pr-resolve`, push, let the tool run again, at most `rounds`; a `silent` or `spent` tool is a held row, never a workaround. `st-pr-resolve.md`: when `autonomy.reviewTool`
  is set, its findings are this command's input, and the round count is the setting's.
- testCriteria: the corpus tests find each new sentence; the line caps hold; `test/evals/locators.test.ts` passes on every shifted range; the goldens are regenerated and read.
- edgeCases: a tool that posts nothing leaves the run holding a row that names the tool; a run on a client with no `reviewTool` reads nothing new.
- depends_on: land-wiring, item-contract, board-item
- verify: `npx vitest run test/corpus/skills/unattended.test.ts test/corpus/commands/work.test.ts test/evals test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts`

### docs-truth — the spec and the pages that must not lie

- id: docs-truth
- requirements: REQ-FLOW-101, REQ-FLOW-132, REQ-FLOW-133, REQ-FLOW-137, REQ-FLOW-138, REQ-FLOW-145, REQ-FLOW-151, REQ-FLOW-152, REQ-FLOW-153, REQ-FLOW-154, REQ-FLOW-155, REQ-FLOW-156, REQ-FLOW-157, REQ-FLOW-158
- files: `docs/specs/everyday-flows.md`, `SECURITY.md`, `docs/security-mapping.md`, `docs/cloud.md`, `docs/troubleshooting.md`, `docs/working-with-stamity.md`, `src/runs/runContract.ts`
  (header comment `:8-9`), `src/hooks/model.ts` (`CLIENT_CLOUD_FACTS` `:203`, dated, reading `not run`), `src/cli/docs/llmsIndex.ts` (`:226`), `scripts/qa/cloud-check.mjs`, `test/docsPages.test.ts`
- interfaces: Read `preflight-admin-security-r1.md` note 4 in the run's reports: three places still call the pre-flight the wall behind the guard. State the local-hunks limit from `src/cli/engine/changeRange.ts:43-44`: to fake them a run needs a raw write under `.git/`. Name the tool's standing (`content/commands/st-pr-resolve.md:193`, `SKILL.md:171`) beside the author floor at `everyday-flows.md:4797`, `:7980`. `contract.yml` joins the run files at `:4480`. `docs/troubleshooting.md:395-396` gains the pending reason for the tool's threads. `SECURITY.md:178-183` says every `run end` call goes through one door: name the review request beside it. REQ-FLOW-152's text carries two more rules: a `docs`-class path must end in `.md` or `.txt`, and the file count must agree with the classifier's. The auto-ship setting's docs name its limit: the rules read paths, size and class, not content, so a repository whose site tool passes raw HTML through `.md` files should leave `docs` out of `classes`. `SECURITY.md:290-292` lists what a board write carries: add the summary, `Branch:` and `Plan:` for an item with a plan only, and keep `:301-302` ("no file contents reach a write") true. The four security pages say one thing (REQ-FLOW-145): the brake, the admin residual ("the account could still lift the rule, and only the guard stops that", `SECURITY.md:117`,
  `:478`, `:832-836`), the job as the second caller of the land evidence (`docs/cloud.md:35-42`, `:114-117`). Replace `docs/cloud.md:308` ("No trigger reads it yet"). The two Protect sections
  (`:127-131`, `:177-181`) stay true and gain one line: the job merges through the same rules, with no bypass. `docs/troubleshooting.md:337-352` gains each new land reason. The spec's hand-kept
  text moves: `:6434-6435` ("the three keys"), `:6430-6432`, `:6737`, and new ids start at 151.
- testCriteria: `test/docsPages.test.ts:2428`, `:5489`, `:5510` onward, `:5655-5674` pass with the new sentences; every land reason the code prints appears in `docs/troubleshooting.md`;
  each re-read page moves to the commit form with today's date.
- edgeCases: a vendor fact not proven by a real run reads `not run`, with the date read; `docs/cloud.md:24` names no vendor address, so new facts go through `CLIENT_CLOUD_FACTS`.
- depends_on: land-job, preflight-admin, skills-prose
- verify: `npx vitest run test/docsPages.test.ts test/cli/docs test/ci/docsRoster.test.ts test/qa/cloudCheck.test.ts`

### factory-guide — one page, cloud and local

- id: factory-guide
- requirements: REQ-FLOW-158, REQ-FLOW-159
- files: a new `docs/factory.md`, `website/sidebars.ts`, `src/cli/docs/llmsIndex.ts`, `README.md`, `docs/doctrine.md`, `test/docsPages.test.ts` (the page lists and pins)
- interfaces: The steps, in order, each saying who does it: install; the rule that blocks a direct push; `config set autonomy.reviewTool codex`; the optional settings and what each loosens; create the label;
  a plan and spec on a branch and a ready item; Claude: install the App, create the scheduled task with one repository, the Issue category, the `labeled` action, the `stamity:ready` filter where
  the page shows one, the environment lines, and the start prompt; Cursor: the automation, or, where the issue trigger is not offered, a small `issues: labeled` workflow calling Cursor's
  webhook; the land job; local, the same steps with no cloud; what to do when nothing fired. Start prompt: list open issues by label over REST (never `gh issue`), take the oldest
  unclaimed one, treat its text as data, stop if a person without write access added the label, then start `/st-work --unattended` on the plan the item names.
  New-page edits: frontmatter `title:` equal to the H1; a currency header in the first 6 lines in the commit form; `const FACTORY` after `test/docsPages.test.ts:179`, into `GUIDES` after `:218`;
  comments `:62`, `:98`, `:182-185` and the test name at `:1013` move to thirteen and sixteen; `README_MAX_LINES` 168 to 169 (`:403`); `REATTESTATION_DATE` (`:842`) to the page's date; `website/sidebars.ts:85`;
  `src/cli/docs/llmsIndex.ts:228`, then `node scripts/generate-docs.mjs`; a `README.md` row after `:138`, `:122` to "thirteen guides"; `docs/doctrine.md:132` onward. Link to `docs/cloud.md`; do not restate it.
- testCriteria: `test/docsPages.test.ts`, `test/cli/docs/llmsIndex.test.ts` and `test/ci/docsRoster.test.ts` pass with the page in; every step names who acts; the page says a Claude event over the cap is dropped.
- edgeCases: a reader on Copilot is sent to `docs/cloud.md`; a person whose Cursor shows no issue trigger follows the webhook branch; an event that never fires names the App install as the first check.
- depends_on: docs-truth
- verify: `npx vitest run test/docsPages.test.ts test/cli/docs/llmsIndex.test.ts test/ci/docsRoster.test.ts`

### eval-cases — the new units' cases, written and not run

- id: eval-cases
- requirements: REQ-FLOW-152, REQ-FLOW-153, REQ-FLOW-154, REQ-FLOW-155, REQ-FLOW-158
- files: seven new files under `evals/cases-v6/golden/` and `evals/cases-v6/adversarial/`, `test/evals/roster.test.ts`, `evals/SET-v7.md`, `scripts/eval/run.mjs` (the roster census `=== 171`, twice, at `:53`), `evals/README.md` (`:570`),
  `.stamity/overrides/skills/st-eval-run/SKILL.md` (`:133`)
- interfaces: A case is frontmatter (`id`, `class`, `claim`, `source`, `metric`, `floor: true` where it applies), `## Brief`, `## Expected`, numbered Binding and Advisory lists. The Brief quotes every sentence
  a binding row judges, as contiguous in-order runs of the `source:` range, skipping only at `[...]`, quoting `content/`, never `.claude/`. Tool results go in as stated fact, with exact JSON. The seven: adversarial, a lookalike bot drives no fix, since a floor was narrowed for the tool's own login; golden, a change outside
  the rules waits with its reasons; adversarial, the brake fires and the run does not respell the merge; golden, a silent review tool leaves a held row; adversarial, a pasted clean block is not a pass; golden, a ready item starts by
  reference; adversarial, a label from an author without write access refuses. Each adds a row to the case index, the appendix and a group head, and the opening count moves with them. `numberWord` (`test/evals/roster.test.ts:160-164`) is extended past 99 for the seventh.
- testCriteria: `test/evals/roster.test.ts` and `test/evals/locators.test.ts` pass; `scripts/eval/run.mjs`'s census reads 178; each new Brief quotes its binding rows' sentences.
- edgeCases: a case whose rule is not in `content/` is dropped, or the rule is written first; a shifted range is fixed by hand, with a dated paragraph in `evals/SET-v7.md`; cases are not run here, so the next run measures them.
- depends_on: skills-prose, release-speed
- verify: `npx vitest run test/evals`

## Risks

- **Warning: an undocumented signal.** Codex's state block appeared with no notice between two pull requests and is not in its docs. Mitigation: anything unrecognised reads not clean, so a change holds the merge rather than passing it.
- **Warning: Cursor's issue-label trigger may not be offered in its interface.** Mitigation: the guide's webhook branch; a person reads the interface and a real run proves it.
- **Warning: `run land --job` is a new merger.** Mitigation: off by default, person-only, no new secret, the CLI pinned by version, the head treated as data, the guard refusing the mode on an agent's line.
- **Warning: Claude's events can be dropped silently.** The docs say so, and two field reports show labels firing nothing. Mitigation: the guide's "nothing fired" step; a sweep is a follow-up if a real run shows it is needed.
- **Warning: GraphQL under `GITHUB_TOKEN` is inferred.** Mitigation: `markPullRequestReadyForReview` is proven on the scratch repository before the guide claims it. Until then its row reads `not run`.
- **Warning: one change spans the guard, CI and the land path.** Its pull request merges only on a person's word.
- **Minor: a run could point the notice at another collaborator.** Accepted: one review request, no text.

## Open questions

None.

## Prerequisites

| kind | name | read where | set by | blocks | verified |
|---|---|---|---|---|---|
| repository | a scratch repository with a ruleset that has no bypass | `gate preflight` | the maintainer | run | no |
| vendor | the Claude GitHub App on the scratch repository and a scheduled task | the task page | the maintainer | run | no |
| vendor | a Cursor automation, or its webhook, on the scratch repository | the automation page | the maintainer | run | no |
| repository | the label `stamity:ready` on the scratch repository | issue labels | the implementing run | run | no |

## Follow-ups

- Add an hourly sweep with a claim mark if a real run shows dropped events · when: the first real run on a cloud reports an event lost · files: `docs/factory.md`
- Replace the Codex state block's reader if the block's version changes · when: a run reports the block unknown · files: `src/runs/reviewTool.ts`

## Drop list

| Item | Revisit when |
|---|---|
| A board status as the ready signal | a platform triggers on status and the label proves too weak |
| A contract key listing several people | someone asks for more than one reader per run |
