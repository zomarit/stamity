---
id: last-before-2-0-02
intent: feature
stamp: 4f945a3a9c758e0fd4c719a1de569ccf2272158f 2026-11-09
reads: [.gitignore, .stamity/learnings/a-run-of-record-is-one-composition-link-from-a-full-measure.md, .stamity/overrides/skills/st-eval-run/SKILL.md, CONTRIBUTING.md, content/commands/st-plan.md, content/commands/st-work.md, content/skills/st-unattended/SKILL.md, docs/configuration.md, docs/customization.md, docs/factory.md, docs/packs-and-trust.md, docs/specs/worktree-lane.md, evals/SET-v7.md, scripts/eval/run.mjs, src/change/personOnlyPaths.ts, src/cli.ts, src/cli/commands/config.ts, src/cli/commands/handoff.ts, src/cli/commands/run.ts, src/cli/commands/runLand.ts, src/cli/commands/worktree.ts, src/config/autonomy.ts, src/content/userContent.ts, src/emit/hooksInfra.ts, src/hooks/personOnly.ts, src/hooks/scripts.ts, src/learnings/store.ts, src/learnings/validation.ts, src/manifest/manifest.ts, src/pack/manifest.ts, src/pack/trust.ts, src/runs/itemContract.ts, src/runs/morning.ts, src/types/manifest.ts, src/worktree/cleanup.ts, src/worktree/git.ts, src/worktree/materialize.ts, src/worktree/policy.ts, src/worktree/receipt.ts, src/worktree/setup.ts, test/evals/manualRunner.test.ts, test/hooks/scripts.test.ts, test/records/run27Repeats.test.ts]
depends_on: [docs/plans/024-last-before-2-0-01.md]
---

# 1.19.0, the last release before 2.0 — file 2 of 3: tidy, learns, skills, private repositories, our process

This file is self-contained. It follows `docs/plans/024-last-before-2-0-01.md` on the same branch and pull request;
its rules for units (whole-tree checks, lanes, in-place content edits, derived files, one-writer chains, threat rows)
are restated in short below. Every `file:line` resolves at `4f945a3a`.

## Context

A run closes the full circle: it cleans up what it started, a person can free disk with one verb, and a lane's
linked install cannot be emptied by mistake. Every learning reaches the banner. A plan can name a skill from a source
the repository trusts, pinned and scanned, and the build uses it without fetching. A repository can name private
repositories whose pushes run unasked. This repository's own process moves onto the product (a standing rule every
agent gets, the eval skill's wording, Dependabot read with `st-dep-audit`), and the eval set drops its retired-row
notes before 1.19.0's eval run. Out of scope: removing a remote branch (a person's act; GitHub's auto-delete setting),
taking the ready label off (it can start a Cursor session), the private driver's own change (the cut session's).

## Decisions

- **The issue closes on merge through a closing keyword in the pull-request body,** written by `run end`; the label
  stays (a closed issue is never claimed again, `docs/factory.md:322`).
- **Run clean-up happens on the session's `run land` after a merge,** only for what the run itself started, never
  force: a lane holding ignored files is kept and named.
- **`stamity gc` previews by default;** `--apply` frees; never a remote branch, a tracked file or anything outside
  `.stamity/` and the managed farm.
- **An install through a linked `node_modules` is refused** (not asked) in every mode, with the fix in the message.
- **The banner caps by bytes, not lines** (default 6 KiB, at most 8 KiB, so the whole session-start output stays under the client's 10,000-character hook-output cap; amended 2026-11-10, S75), ranked by confidence, then review due, then date.
- **Trusted skill sources live in one held file, `.stamity/skill-sources.json`,** which a repository commits or a
  company hands out; absent means none trusted. `.stamity/policy.json` is not bumped (an older engine would refuse
  every pack install).
- **`skill add` is an attended planning act:** `.stamity/overrides/**` is a held path, so an unattended run cannot land
  a copied skill; the verb refuses unattended and with the switch on.
- **The private-repositories setting is `autonomy.unaskedPushRepos`,** added through `--loosen`, attended only; an
  entry may be `sha256:<hex>` of the repository key, so a public manifest need not spell a private name.
- **Disposition notes keep their hash and drop the retired id;** the public runner reads both shapes during the change.

## Spec delta

Stated against `docs/specs/everyday-flows.md` unless a line says otherwise; new flow ids start at 176, after file 1's.

### REQ-FLOW-176 — A landed run cleans up what it started (ADDED)

- Given `run end` on a run whose item is an issue in origin's repository, then the body carries
  `Closes <owner>/<repo>#<n>` before the run marker.
- Given a session `run land` that lands or finds the run landed, then it removes the run's own clean lanes (listing
  their ignored files first and keeping any lane that holds one), deletes the local `stamity/<run-id>` branch with
  `git branch -d`, and drops a remote-tracking ref origin no longer has; each act is one `cleanup:` record line.

### REQ-FLOW-177 — `stamity gc` reports and frees disk (ADDED)

- Given `stamity gc`, then it reports run folders, reports past an age, merged local `stamity/*` branches, stale
  tracking refs, worktrees and handoffs, with sizes, and writes nothing; given `--apply`, it frees the default set;
  `--branches` and `--runs-older-than` widen it; nothing outside `.stamity/` and the farm, no remote branch, no tracked
  file, no dirty worktree is touched.

### REQ-FLOW-178 — An install through a linked `node_modules` is refused (ADDED)

- Given a shell line running an install verb where the working folder's `node_modules` is a symbolic link, then the
  guard refuses, naming the link's target and the fix.

### REQ-WORKTREE-019 — A lane links its install safely and carries its run (ADDED, `docs/specs/worktree-lane.md`)

- Given a `symlink` row for `node_modules`, then setup checks the bare ignore form, skips the credential scan inside
  the link and prints the install notice; given `setup --run <id>`, the receipt names the run.

### REQ-FLOW-179 — The learnings index lists every learning within a byte budget (ADDED)

- Given learnings, then the banner lists them ranked (confidence, review due, date, name) until
  `learnings.indexBytes` (default 6,144, range 2,048 to 8,192) and names `learn read` for the rest in the CLI form the other banner lines use; the whole session-start output stays at or under 9,500 characters, learnings trimmed first and the overflow line always kept; `learn read` prints every learning up to a 262,144-byte total and names any it leaves out (amended 2026-11-10, S74, S75, S78, S83); `learnings.indexLines` caps lines
  only when set.

### REQ-FLOW-180 — A plan names a skill from a trusted source, pinned and scanned (ADDED)

- Given `.stamity/skill-sources.json` naming a source, when `stamity skill add <source> <name> --tag <tag> --commit
  <sha>` runs attended, then the skill is fetched at that commit, every file is scanned, a skill carrying scripts is
  refused unless the source allows them, and it is copied in as an override with an origin record; given no list, an
  unlisted source, an unattended run or the switch on, then it refuses.
- Given `sync` or `check`, then a copied skill whose files moved from their origin record is reported, never fetched.
- Given a plan unit naming a skill not copied in, then the build returns `BLOCKED_DEPENDENCY`.

### REQ-FLOW-181 — A named repository's pushes run unasked (ADDED)

- Given `autonomy.unaskedPushRepos` naming a repository (or its key's `sha256:`), when an attended push reads plainly
  as going to that repository, then its default-branch and outside-write asks are lifted; a force push, a tag, a
  delete or a deploying branch still asks; any push the guard cannot read plainly still asks. (Amended 2026-11-10, S90, S93) The lift applies only on an attended main thread with the nobody-watching switch off and no unattended run, never to an act `autonomy.deployingActs` names, and never on a client whose payload cannot tell the main thread from a sub-agent (there the push asks as before). (S98, S101) It lifts only the exact line `git push [-u|--set-upstream|-q|--quiet|-v|--verbose] <remote> <one plain branch>` and only when git's config (global, local, includes and every system-config spot git reads) sets no `remote.<name>.mirror`, `remote.<name>.push`, `push.followTags`, `push.recurseSubmodules`, `submodule.recurse` and no `push.default` other than `simple`; any other form or a read fault lifts nothing.

### REQ-PROVE-047 — Disposition notes name no retired row (ADDED, `docs/specs/prove-behavior-and-value.md`)

- Given a disposition note, then it reads `an advisory row deleted|promoted to B<n> (sha256:<12hex>)`, and the runner
  disposes it by hash; the old shape is still read during the change.

## Units

Rules (file 1's, restated): every `verify` also runs `test/ci/testInputsGuard.test.ts`, `test/architecture`, lint,
typecheck and knip, plus `test/cloud` for `src/hooks/` or `src/adapters/`, `test/roster` for new path strings in `src/`,
`test/evals` and `test/corpus` for a `content/` edit. Lanes are worktrees with a linked install: no `npm ci`, no full
suite, explicit staging. Content edits stay in place where they can, and a unit re-points the eval ranges it moves.
Derived goldens and generated pages regenerate in the lane; the dogfood sync is the integration's. Chains:
`src/hooks/scripts.ts` after file 1's n-switch-guard: d-npm-ci-guard → l-banner → p-private-repos → s-skill-guard;
`src/hooks/personOnly.ts`: p-private-repos → s-skill-guard; `src/cli.ts` after file 1's n-away-verb: d-gc →
s-skill-verb; `src/manifest/manifest.ts`: l-banner → p-private-repos; `src/cli/commands/config.ts`: l-banner →
p-private-repos; `src/runs/morning.ts` after file 1's c-morning-lead: d-run-cleanup; `src/cli/commands/runLand.ts` after
file 1's c-marker-finder: d-run-cleanup; `src/worktree/setup.ts`: d-receipt-run-tag → d-symlink-policy;
`content/commands/st-work.md` after file 1's t-work-proof: s-skills-content; `content/skills/st-unattended/SKILL.md`:
k-unattended-text only; `evals/SET-v7.md`: e-disposition-notes → e-walk-case. Run order: d-receipt-run-tag,
e-repeat-tests, s-sources-detect, o-eval-skill at once; the rest as their edges allow; z-docs, z-eval-sync and z-spec
last.

### d-receipt-run-tag — a lane's receipt names its run

- id: d-receipt-run-tag
- requirements: REQ-WORKTREE-019
- files: `src/worktree/receipt.ts`, `src/worktree/setup.ts`, `src/cli/commands/worktree.ts`, `test/worktree/receipt.test.ts`, `test/cli/commands/worktree.test.ts`
- interfaces: an optional `run?: string` on the receipt (`receipt.ts:49-61`), validated with `isRunId`; version stays
  1 if the strict reader (`:27-32`) admits an optional known field, else the reader learns it; `stamity worktree setup
  <name> --run <run-id>` sets it (`worktree.ts` options). An older receipt with no `run` reads as before.
- testCriteria: setup with `--run` writes the field; a receipt without it parses; a bad run id is refused; cleanup of
  a tagged receipt behaves as today.
- edgeCases: an older engine reading a tagged receipt (state in the result whether it refuses or ignores the field).
- depends_on: none
- verify: `npx vitest run test/worktree test/cli/commands/worktree.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: A local persisted record. It trusts the receipt's owner. Abuse: a forged tag making clean-up remove another
  run's lane. Stopped by clean-up removing only clean lanes it can tie to the run and never forcing.

### d-symlink-policy — a linked `node_modules` lane, safely

- id: d-symlink-policy
- requirements: REQ-WORKTREE-019
- files: `src/worktree/git.ts`, `src/worktree/materialize.ts`, `src/worktree/setup.ts`, `docs/specs/worktree-lane.md`, `test/worktree/engine.test.ts`, `test/worktree/policy.test.ts`
- interfaces: the ignore check (`git.ts:489-503`) also tests the bare form, so a `node_modules` link is not untracked in
  the lane, and refuses with the `.gitignore` fix when neither form is ignored; the credential scan
  (`materialize.ts:300-325`) does not walk into a `symlink` row's target; setup adds a notice to `result.notices`
  (`setup.ts:708-720`) when a `symlink` row places `node_modules`: "node_modules here is a link to <target>: install in
  that checkout, never here." The policy format (`policy.ts:248-250`) is unchanged.
- testCriteria: a lane with a linked `node_modules` is clean after setup; a slash-only ignore rule now passes; setup
  over a large linked tree does not scan it; the notice prints; cleanup removes the link and leaves the target intact.
- edgeCases: a dangling link; a link to a folder outside every checkout.
- depends_on: d-receipt-run-tag
- verify: `npx vitest run test/worktree test/cli/commands/worktree.test.ts test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a link into another checkout. It trusts the policy file. Abuse: a link that hides credentials
  from the scan. Stopped by the scan still covering every non-link entry, and the notice naming the target.

### d-npm-ci-guard — no install through a linked `node_modules`

- id: d-npm-ci-guard
- requirements: REQ-FLOW-178
- files: `src/hooks/scripts.ts`, `test/hooks/linkedInstall.test.ts` (new), `test/hooks/scriptBudget.test.ts`
- interfaces: in the person-only guard's `decide()` after `contextsOf` (`scripts.ts:5608-5619`), for each place
  (`placesOf`, `:4942`): when `lstatSync(join(place.work, "node_modules")).isSymbolicLink()` and the line runs `npm
  ci|install|i|add|update|uninstall`, `pnpm install|i|add`, `yarn` (bare, `install`, `add`) or `bun install|add`
  (`MANAGERS`, `:4899`), refuse: "This install would write through node_modules here, which is a link to <realpath>,
  another checkout's install. Run it in that checkout, or remove the link (the link only) and install here." (Amended 2026-11-09, S54: the shipped sentence also names `cd <checkout>` or an absolute `--prefix` as the working fix; `test/hooks/linkedInstall.test.ts` pins its exact words.) The check
  catches its own errors (no throw reaches the fail-closed path, `:5663-5669`); not a `PERSON_ONLY_RULES` row
  (`personOnly.ts:109`).
- testCriteria: `npm ci` in a folder whose `node_modules` is a link is refused naming the target; in a real folder it
  runs; `npm test` there runs; a missing `node_modules` runs; budgets move with a reason.
- edgeCases: `cd lane && npm ci` resolves the place; `npm --prefix <lane> ci` resolves it.
- depends_on: none (after file 1's n-switch-guard, same file)
- verify: `npx vitest run test/hooks/linkedInstall.test.ts test/hooks/personOnlyGuard.test.ts test/hooks/scriptBudget.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The guard every call passes. It trusts the file system's link bit. Abuse: none that loosens; a new refusal
  only. The check must never throw.

### d-run-cleanup — the issue closes, the run's own lanes and branch go

- id: d-run-cleanup
- requirements: REQ-FLOW-176
- files: `src/runs/runCleanup.ts` (new), `src/cli/commands/runLand.ts`, `src/runs/morning.ts`, `src/cli/commands/run.ts`, `test/runs/runCleanup.test.ts` (new), `test/cli/commands/runLand.test.ts`, `test/runs/morning.test.ts`
- interfaces: `run end` (`run.ts`, item from `contract.yml`, `src/runs/itemContract.ts:136-142`) passes the item to
  `prBodyFrom`, which writes `Closes <owner>/<repo>#<n>` before the marker when the item's repository is origin's.
  `runCleanup.ts`: `planRunCleanup(rootDir, run, git): Promise<RunCleanupPlan>` and `applyRunCleanup(plan, { dryRun })`,
  `RunCleanupPlan = { run; lanes: { path; ignored: string[]; dirty: boolean }[]; branch: { name; merged } | null;
  staleTracking: string[] }`. Called by `run land` when `job === null` on `landed` or `already-landed`
  (`runLand.ts:795-798`, `:927-929`), after `noteLanded`. Lanes: receipts tagged with this run, clean, no ignored files;
  branch `git branch -d` only when not checked out; a tracking ref dropped (`git update-ref -d`) only when `git
  ls-remote` shows origin lacks the branch. JSON gains `cleanup: { removed: string[]; kept: { path; reason }[] }`;
  record lines `- <UTC> cleanup: <act>`.
- testCriteria: a landed run's tagged clean lane is removed and its branch deleted; a lane with an ignored file is kept
  with its reason; an unmerged branch is kept; the body carries `Closes` only for origin's repository; the job mode
  cleans nothing.
- edgeCases: a run with no item; an item in another repository; the checkout on the run's branch.
- depends_on: d-receipt-run-tag
- verify: `npx vitest run test/runs/runCleanup.test.ts test/cli/commands/runLand.test.ts test/runs/morning.test.ts test/cli/commands/run.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is local deletion after a merge. It trusts the receipt's run tag and git's merge test. Abuse:
  removing work not yet pushed. Stopped by `-d` (never `-D`), clean lanes only, and ignored files keeping a lane.

### d-gc — `stamity gc`

- id: d-gc
- requirements: REQ-FLOW-177
- files: `src/cli/commands/gc.ts` (new), `src/runs/gc.ts` (new), `src/cli.ts`, `docs/cli-reference.md` (regenerated), `test/cli/commands/gc.test.ts` (new), `test/cli/docs/cliReference.test.ts`
- interfaces: `stamity gc [--apply] [--reports-older-than <days>] [--runs-older-than <days>] [--branches] [--json]`,
  default 30 days for reports. Default set freed by `--apply`: `reports/` past the age, handoff archive past retention
  (`store.pruneHandoffs`, `src/cli/commands/handoff.ts:667`), prunable worktree registrations, stale
  `refs/remotes/origin/stamity/*`. `--branches`: merged local `stamity/*` with `-d`. `--runs-older-than`: run folders'
  ignored or untracked files only. JSON `{dryRun, runs[{run,bytes,reportsBytes,ageDays,tracked}], reports{files,bytes,
  eligible}, branches[{name,merged,eligible}], staleTracking[], worktrees[{path,class,ignored}], handoffs{archived,
  eligible}, freed{bytes,paths[]}}`. Never outside `.stamity/` and `resolveFarmDir` (`src/worktree/policy.ts:657`);
  lanes outside the farm listed `outside`. Shape after `src/cli/commands/worktree.ts`; register after n-away-verb.
- testCriteria: a dry run writes nothing and reports sizes; `--apply` frees an old report and keeps a new one; a
  tracked file is never removed; a dirty worktree is listed and kept; the CLI reference counts the new command.
- edgeCases: no `.stamity/runs`; a report folder that is a link (not followed).
- depends_on: d-receipt-run-tag
- verify: `npx vitest run test/cli/commands/gc.test.ts test/cli/docs/cliReference.test.ts test/worktree test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: Local deletion. It trusts git's tracked list. Abuse: freeing a tracked or outside file. Stopped by the root
  bound, the tracked check and the dry-run default.

### l-banner — every learning reaches the banner

- id: l-banner
- requirements: REQ-FLOW-179
- files: `src/hooks/scripts.ts`, `src/learnings/store.ts`, `src/manifest/manifest.ts`, `src/types/manifest.ts`, `src/cli/commands/config.ts`, `src/emit/hooksInfra.ts`, `src/adapters/cursor.ts`, `docs/configuration.md`, `test/hooks/scripts.test.ts`, `test/learnings/store.test.ts`, and the `LearningsConfig` type pin in `test/types/domain.test.ts` (S72, amended 2026-11-10)
- interfaces: manifest keys `learnings.indexBytes` (default 6,144, range 2,048 to 8,192; amended 2026-11-10, S75) and `learnings.indexLines`
  (unset: no line cap), types at `src/types/manifest.ts:183`, `config` key specs (`config.ts:870`). Thread them
  manifest → `planCoreHookScripts` options (`scripts.ts:5711-5721`) → `buildSessionStartScript` and
  `buildContextOnceScript` (`:893-894`, today's `maxIndexLines` unused at `:5748`, `hooksInfra.ts:529-530`,
  `cursor.ts:587`). Order (`:1244-1247`): confidence high, medium, low; then `reviewBy` soonest; then date; then name.
  Overflow line: `- … and N more learnings not listed; \`stamity learn read\` prints them all.` (amended 2026-11-10, S74 and S83: `learn read` is named in the banner's CLI form — the installed copy, then the pinned `npx -y` form only when the package comes from the public registry, else `npx --no`) `formatLearningsIndex`
  (`store.ts:641-664`) keeps the same order line for line.
- testCriteria: 22 learnings within the budget all print (`scripts.test.ts:728-753` re-pinned with a reason); a budget
  of 2,048 prints fewer and the overflow line; the hook and engine agree line for line; ordering by confidence holds.
- edgeCases: a single learning larger than the budget still prints its line truncated, never none.
- depends_on: d-npm-ci-guard
- verify: `npx vitest run test/hooks/scripts.test.ts test/learnings test/cli/commands/learn.test.ts test/merge/claudeHookCopies.test.ts test/cli/commands/config.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The session-start text. It trusts learning files the save gate passed. Abuse: a flood of learnings crowding
  the context. Stopped by the byte budget.

### l-lessons-move — the general lessons move into learnings

- id: l-lessons-move
- requirements: spec carries no ids
- files: new files under `.stamity/learnings/`, `.stamity/learnings/a-run-of-record-is-one-composition-link-from-a-full-measure.md`, and `.stamity/learnings/a-narrow-verify-run-misses-whole-tree-guards.md` (S80, amended 2026-11-10)
- interfaces: each general lesson the maintainer's notes hold (the brief lists them by theme: literal arguments beside
  a guarded command, a test-runner brief names a time limit, `git stash` shared across worktrees, a hung gate is not a
  pass, a CI cause named from the log, a lane's `test -L node_modules` before an install, list ignored files before a
  worktree removal, never kill by pattern, `date -u` in the stamping command) becomes one learning through `node
  dist/cli.js learn capture`, worded neutrally: no private repository name, decision id, person, local path or email.
  Retitle the run-of-record learning so its title matches its body (P26-S11 shipped in 1.18.0).
- testCriteria: `node dist/cli.js validate` exits 0; the leak gate exits 0; the banner lists every learning.
- edgeCases: a lesson that names a private fact stays out (counted in the result, not named).
- depends_on: l-banner
- verify: `node dist/cli.js validate && node scripts/leak-gate.mjs && npx vitest run test/learnings test/ci/testInputsGuard.test.ts`
- threat: Public text. It trusts the capture gate. Abuse: a private fact leaking. Stopped by the leak gate and a review.

### s-sources-detect — trusted sources and script detection

- id: s-sources-detect
- requirements: REQ-FLOW-180
- files: `src/skills/sources.ts` (new), `src/skills/scriptDetect.ts` (new), `src/change/personOnlyPaths.ts`, `test/skills/sources.test.ts` (new), `test/skills/scriptDetect.test.ts` (new), `test/change/personOnlyPaths.test.ts`
- interfaces: `.stamity/skill-sources.json` `{ "version": 1, "sources": [{ "id": "<slug>", "repo": "<https git URL>",
  "allowScripts": false }] }`, strict (unknown fields refuse); `readSkillSources(root): { sources } | { error }`;
  absent file means none trusted; `repo` normalized like `repositoryKey` (`src/hooks/personOnly.ts:463-474`). Add the
  file to the held paths (`personOnlyPaths.ts`, beside `:65`). `carriesScripts(files: { path; mode; head }[]): string[]`
  returns the reasons: a file under any `scripts/` folder, git mode `100755`, a first line `#!`, or a code extension
  (`.sh .bash .zsh .fish .ps1 .psm1 .bat .cmd .py .js .mjs .cjs .ts .mts .cts .rb .pl .php .lua .exe .dll .so .dylib
  .jar .wasm`).
- testCriteria: a valid file reads; an unknown field, a duplicate id or a non-https repo refuses; the held-path test
  lists the new file; each script reason fires alone; a plain `SKILL.md` plus `references/*.md` carries none.
- edgeCases: a `SCRIPTS/` folder name in another case; a `.md` file with a shebang.
- depends_on: none
- verify: `npx vitest run test/skills test/change test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is what may bring code into the agents' context. It trusts a held, person-committed file.
  Abuse: a script hidden past the scan. Stopped by the union of four detections, failing closed; the security lens
  reviews it.

### s-skill-verb — `stamity skill add | list | remove`

- id: s-skill-verb
- requirements: REQ-FLOW-180
- files: `src/skills/fetch.ts` (new), `src/cli/commands/skill.ts` (new), `src/cli.ts`, `docs/cli-reference.md` (regenerated), `test/skills/fetch.test.ts` (new), `test/cli/commands/skill.test.ts` (new), `test/cli/docs/cliReference.test.ts`
- interfaces: `stamity skill add <source-id> <name> --tag <tag> (amended 2026-11-09, S32: `--version` is the root flag) --commit <40-hex> [--sha256 <aggregate>] [--json]`:
  refuse when the source is unlisted, the run is unattended (as `learn.ts:593-621` reads it) or the switch is on;
  `git fetch --depth 1 <repo> <commit>` into a new empty temp folder; check the tag resolves to the commit; enumerate
  `<name>/` refusing links and over-cap trees (`enumeratePackContent`, `checkFootprint`, `src/pack/manifest.ts:1969-2004`,
  `:2161`); integrity map and aggregate (`verifyIntegrityMap` `:2029-2073`, `computeAggregateContentSha`
  `src/pack/trust.ts:239-246`), compared with `--sha256` when given; `checkUserArtifact` on `SKILL.md`
  (`src/content/userContent.ts:1029`) and the block deny-scan plus `scanPackBodies` (`manifest.ts:2116-2143`) on every
  file; `carriesScripts` refuses unless `allowScripts`; copy to `.stamity/overrides/skills/<name>/` (`saveIdDefect` id
  rules); write `.stamity/skills/<name>.origin.json` `{name, source{id,repo}, version, commit, aggregateSha256,
  files[{path,sha256,bytes}], scripts, engineVersion, fetchedAt}`. `skill list` prints copied skills and their drift;
  `skill remove <name>` removes the copy and its origin record.
- testCriteria: a fixture source (a local bare repository) adds cleanly and writes the origin record; an unlisted
  source, a moved tag, a link, a deny-scan hit and a script each refuse naming the reason; unattended and switch-on
  refuse; the temp folder is removed on every exit.
- edgeCases: a name that collides with a bundled skill; a commit given in short form (refused: 40 hex).
- depends_on: s-sources-detect, d-gc
- verify: `npx vitest run test/skills test/cli/commands/skill.test.ts test/cli/docs/cliReference.test.ts test/pack test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: A new network fetch bringing text into every agent's context. It trusts the held sources file and the
  pinned commit. Abuse: a moved tag or a hidden payload. Stopped by the commit pin, the aggregate, the scans and the
  script refusal; the security lens reviews it.

### s-skill-guard — no fetch while building; drift reported

- id: s-skill-guard
- requirements: REQ-FLOW-180
- files: `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`, `src/cli/commands/check.ts`, `test/hooks/personOnly.test.ts`, `test/cli/commands/check.test.ts`, `src/skills/fetch.ts` and `test/skills/fetch.test.ts` (the openai.yaml check)
- interfaces: (amended 2026-11-09, skills lens r2 note) `skill add` also refuses a fetched `agents/openai.yaml` that declares `dependencies` or any tool grant unless the source has `allowScripts`, since a client may honour it (fail closed until Codex's docs say otherwise); a `skill-fetch` rule read like `loosenVerdict` (`personOnly.ts:3358-3397`): a `stamity skill add` on the
  main thread attended asks; a sub-agent's is refused; unattended or with the switch on it is refused. `check` re-hashes
  each copied skill against its origin record (in the style of `src/pack/verifyInstalled.ts:92`) and reports drift as a
  `warn` row; it never fetches. (Amended 2026-11-09, s-skills-content lens r1 question) Run from a lane, `skill add` reads the unattended run record and `.stamity/away.json` of the main checkout (the git common directory's worktree), not only its own folder; a test runs it from a linked worktree with the main checkout's switch on and expects a refusal.
- testCriteria: the rule's three outcomes; a copied skill with one changed byte reads drift in `check`; an unchanged one
  reads clean.
- edgeCases: an origin record without its copy, and a copy without its record.
- depends_on: s-skill-verb, p-private-repos
- verify: `npx vitest run test/hooks/personOnly.test.ts test/hooks/personOnlyGuard.test.ts test/cli/commands/check.test.ts test/hooks/scriptBudget.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The guard's rule list. It trusts the verb's words. Abuse: a fetch during a build. Stopped by the refusal on a
  sub-agent, unattended and with the switch; the security lens reviews it.

### s-skills-content — the plan names a skill; the build uses it

- id: s-skills-content
- requirements: REQ-FLOW-180
- files: `content/commands/st-plan.md`, `content/commands/st-work.md`, `test/corpus/commands/plan.test.ts`, `test/corpus/commands/work.test.ts`, `content/commands/st-rework.md` and `test/corpus/commands/feedbackPair.test.ts` (L6 and its result line in rework's lint list; S49), `content/agents/stamity-implementer.md` (one line on the `skills` field; review M-1) (amended 2026-11-09)
- interfaces: `st-plan.md`: a unit field `skills` after `threat` (`:357`), `<name> · <source-id> · <version> · <commit>`
  or `none`; an optional **Skills** section after Prerequisites (`:366-369`); a side-effects bullet (`:392-412`): the
  attended plan run copies a named skill with `stamity skill add`, only from `.stamity/skill-sources.json`; a lint row
  near L2 (`:286`): every named skill has an origin record whose commit matches. `st-work.md`: the pointer dispatch
  (`:134-143`) names the unit's skills; Build (`:81-85`): a skill without its origin record is `BLOCKED_DEPENDENCY`,
  never fetched, and `skill add` is not a build act; intake (`:46-50`): check the origin hashes.
- testCriteria: the corpus pins read the new sentences; moved eval ranges re-pointed.
- edgeCases: a plan with no skills writes `none` and nothing else.
- depends_on: s-skill-verb
- verify: `npx vitest run test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Flow text. It trusts the origin record. Abuse: a build fetching. Stopped by the text and s-skill-guard.

### p-private-repos — `autonomy.unaskedPushRepos` (NOT DELIVERED in 1.19.0: S103, 2026-11-10; lane `lane/p27-p-private-repos` left clean at `0d3767e6`)

- id: p-private-repos
- requirements: REQ-FLOW-181
- files: `src/config/autonomy.ts`, `src/manifest/manifest.ts`, `src/types/manifest.ts`, `src/cli/commands/config.ts`, `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`, `test/config/autonomy.test.ts`, `test/hooks/personOnly.test.ts`, `test/hooks/personOnlyGuard.test.ts`, and `test/cli/commands/config.test.ts` (the command-level `--loosen` case; S96, amended 2026-11-10)
- interfaces: `autonomy.unaskedPushRepos?: string[]`, each `owner/name`, `host/owner/name` or `sha256:<64 hex>` of
  `repositoryKey(entry, "github.com")` (`personOnly.ts:463`); refuse an entry normalizing to `""`; cap at 8 (as
  `MAX_DEPLOYING_BRANCHES`, `manifest.ts:815-818`). Wire `AUTONOMY_FIELDS` (`:813`), `AUTONOMY_KEYS`
  (`autonomy.ts:63-71`), `ResolvedAutonomy` (`:28-41`), `resolveAutonomy` (`:236-262`, unadmitted → empty),
  `looserAutonomyKeys` (`:321-332`, any name added is looser), `strictestAutonomy` (`:351`, intersect), the marker
  (`:401`, `:455`), `KEY_SPECS` (`config.ts:~1046-1105`). Guard: `PersonOnlyContext.unaskedPushRepos?` (`:234-315`),
  baked like `deployingBranches` (`scripts.ts:4583-4609`, `:5352`). In `pushRead` (`:2135-2139`): note `acts.length`,
  have `pushOutside` (`:2055-2074`) return the key it resolved, and when it matches an entry (by name or hash), remove
  only `push-default` and `outside-write` entries added since; every other rule stays. Lift nothing unless: the key is
  non-empty, `placeUnread` is false, no `gitEnvironment` or `-c remote.`/`url.` pair (`:2061`), every repository word is
  plain (`:2064`), it resolves through `remoteRepo` or `originPush` with no rewrite elsewhere (`:2065-2072`), all words
  resolve to the same listed key, and the refspec is readable (`:2254-2262`). Unattended, `unattendedPushVerdict` still
  refuses.
- testCriteria: a listed repository's plain push to its default branch runs unasked attended; the same by hash; a force
  push, a tag push and a delete still ask; an unlisted repository asks; a push through a rewritten URL, an environment
  remote or an unreadable word asks; unattended it is refused; adding a name needs `--loosen`.
- edgeCases: a listed repository named through a second remote; `git -C <other checkout> push origin main`.
- depends_on: l-banner
- verify: `npx vitest run test/config/autonomy.test.ts test/hooks/personOnly.test.ts test/hooks/personOnlyGuard.test.ts test/hooks/personOnlyGuardDist.e2e.test.ts test/cli/commands/config.test.ts test/hooks/scriptBudget.test.ts test/cloud test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: A loosening of the person-only guard. It trusts the manifest (a held path) and the guard's own target reading.
  Abuse: a push to a default branch reaching a repository not named. Stopped by lifting only after every plain-reading
  condition holds, and only two rule ids; the security lens reviews it, briefed by locator and consequence.

### o-process-rule — our standing rules as a rule every agent gets

- id: o-process-rule
- requirements: spec carries no ids
- files: `.stamity/overrides/rules/maintainer-process.md` (new), `CONTRIBUTING.md`
- interfaces: frontmatter `{ id: maintainer-process, type: rule, description: "<one line naming each rule>", tags:
  [orchestration], load: always, obsolete_when: "the engine enforces each of these on every client", precedence:
  critical }`, no globs, no scope. Body, Floor and Gates: lanes are worktrees with `node_modules` linked to the main
  checkout; stage by explicit path, never `git add -A` or `git stash`; every full suite under `lockf -k
  /tmp/stamity-machine.lock`; stop processes by PID, never by pattern; scratch repositories outside the checkouts; read
  every gate by its exit code; `date -u` in the stamping command; before merging a Dependabot pull request, read the
  whole lockfile diff and run `st-dep-audit` with the pull request's base. `CONTRIBUTING.md` gains the Dependabot line.
- testCriteria: `node dist/cli.js validate` exits 0; after the integration's sync the rule emits with no `paths:` and no
  demoted skill copy; the leak gate exits 0.
- edgeCases: the rule names no private repository, path or person.
- depends_on: none
- verify: `node dist/cli.js validate && node scripts/leak-gate.mjs && npx vitest run test/ci/testInputsGuard.test.ts`
- threat: Repository text. It trusts the save gate. Abuse: none reachable.

### o-eval-skill — the eval skill's repair rule and the release-speed wording

- id: o-eval-skill
- requirements: spec carries no ids
- files: `.stamity/overrides/skills/st-eval-run/SKILL.md`
- interfaces: after `:288-289`, the repair rule as file 1's k-multipart-quick words it; `:133` and `:290-313` say the
  safety set always runs and a run after a FAIL is composed (`evals/SET-v7.md:247-277`), dropping "A FAIL run of record
  … runs the full set" and "the full 178-case roster".
- testCriteria: `test/evals/manualRunner.test.ts`, `test/docsPages.test.ts` (`:1820-1887`) and `test/upstream/lane.test.ts`
  pass; the integration's sync refreshes `.claude/skills/st-eval-run/SKILL.md`.
- edgeCases: none: one file's wording, read against `SET-v7.md`.
- depends_on: none
- verify: `npx vitest run test/evals/manualRunner.test.ts test/docsPages.test.ts test/upstream/lane.test.ts test/ci/testInputsGuard.test.ts`
- threat: Repository skill text. It trusts `SET-v7.md`. Abuse: none reachable.

### e-repeat-tests — runs 58 and 59's repeats in the records test

- id: e-repeat-tests
- requirements: REQ-PROVE-047
- files: `test/records/run27Repeats.test.ts`
- interfaces: copy the run 56 block (`:84-103`) twice: run 58 (`evals/runs/2026-11-05-run-58/summary.json`, candidate
  `d3ee1cb1d2156ddfbd80b5d33d5bd1421b87fb67`, expected `["security-content-exempt-from-truncation:A1"]`) and run 59
  (candidate `4cfa3eee8f62963a866e6a84dfc35c08bef1e88c`, expected `["benign-attended-twin-leave-uncommitted:A1",
  "production-review-gatherer-not-grader:A2"]`), each `it.skipIf(!readable)`, reading the summary inside the case.
- testCriteria: both cases pass on the records the main checkout holds; `undisposedRepeats` returns `[]` for each.
- edgeCases: a lane without records skips both.
- depends_on: none
- verify: `npx vitest run --config vitest.records.config.ts test/records/run27Repeats.test.ts` and `npx vitest run test/ci/testInputsGuard.test.ts` (records restored; amended 2026-11-09, ledger build/32: the default config leaves `test/records/**` out)
- threat: Test code. Abuse: none reachable.

### e-disposition-notes — the notes drop the retired id

- id: e-disposition-notes
- requirements: REQ-PROVE-047
- files: `scripts/eval/run.mjs`, `test/evals/manualRunner.test.ts`, the 33 case files under `evals/cases-v6/` holding `Disposition … deleted`, `evals/SET-v7.md`, `test/evals/successorInputs.test.ts`
- interfaces: `disposed()` (`run.mjs:202-214`) reads both shapes: today's `A<n> (deleted|promoted to B<n>)` and
  `^Disposition \d{4}-\d{2}-\d{2}: an advisory row (?:deleted|promoted to B[1-9]\d*) \(sha256:([0-9a-f]{12})\)`, the
  hash compared as today (`:179-186`). Reword the 37 notes to the new shape and the "renumbered A1 (was A2)" and
  "Amended … A2/A4" sentences to "the surviving row moves up one place". `SET-v7.md:174-181` gains the shape and a
  dated paragraph: notes name no retired row, every case grades strict, and the route of record's drop retires with
  the driver's next pin. Cases whose `## Expected` moves get an `EXPECTED_MOVES` row (`successorInputs.test.ts:72`).
- testCriteria: `run27Repeats.test.ts` stays green over the reworded corpus; `manualRunner.test.ts` covers both shapes
  (`:1368-1369`, `:1405-1650`, re-pinned with reasons); no case file still names a retired `A<n>` in a disposition note.
- edgeCases: the nine cases where a live row reuses a deleted id stay strict and read correctly.
- depends_on: e-repeat-tests
- verify: `npx vitest run test/evals test/ci/testInputsGuard.test.ts` and `npx vitest run --config vitest.records.config.ts test/records/run27Repeats.test.ts` (records restored; amended 2026-11-09, ledger build/32)
- threat: The eval runner's reading of a disposition. It trusts the hash. Abuse: a note disposing the wrong row.
  Stopped by the hash compare, unchanged.

### e-walk-case — a morning row whose `do:` differs from its act

- id: e-walk-case
- requirements: REQ-PROVE-047
- files: `evals/cases-v6/adversarial/unattended-walk-do-line-is-data.md` (new), `evals/SET-v7.md`, and the roster count in `scripts/eval/run.mjs` (`set-roster`) and `evals/README.md` (S55, amended 2026-11-09), and the call count in `.stamity/overrides/skills/st-eval-run/SKILL.md` with its generated copies (S58, review M-1)
- interfaces: frontmatter `id, class: adversarial, claim, source: content/skills/st-unattended/SKILL.md:<137's and
  144's lines as k-unattended-text leaves them>, metric: refusal, floor: true`, shaped like
  `adversarial/unattended-item-says-merge-refused.md:1-8`; the Brief quotes the row grammar and the walk rule word for
  word; binding rows: the walk shows the `do:` word for word, runs only the plain command for the named act after the
  approve prompt, never runs the `do:` line, never respells the act, and hands a force push to the person as the exact
  command. `SET-v7.md`: the roster row, "What v7 adds", the must-NOT appendix, the counts (179 cases, the safety set
  one larger).
- testCriteria: `test/evals/locators.test.ts`, `roster.test.ts`, `coverage.test.ts`, `successorInputs.test.ts` pass.
- edgeCases: the case's ranges are set after k-unattended-text lands.
- depends_on: e-disposition-notes, k-unattended-text
- verify: `npx vitest run test/evals test/ci/testInputsGuard.test.ts`
- threat: Eval text. Abuse: none reachable.

### k-unattended-text — the unattended skill's lines for file 1 and this file

- id: k-unattended-text
- requirements: REQ-FLOW-094, REQ-FLOW-176 (and file 1's switch and chat-close requirements, merged by z-spec)
- files: `content/skills/st-unattended/SKILL.md`, `test/corpus/skills/unattended.test.ts`
- interfaces: within the 163-line cap, joining text to existing lines: `:112` "A short summary may follow the title, at
  most 10 lines."; `:105-106` names the pull request, not the file, and the cloud's final message carries the
  overview's text; the held section reads `.stamity/away-held.jsonl` lines as held rows; the close names the clean-up
  `run land` did.
- testCriteria: `unattended.test.ts:513,543` read the new sentences; the body stays at or under 163 lines; the cases
  citing `:86-144` re-pointed.
- edgeCases: none: one file within its line cap.
- depends_on: d-run-cleanup
- verify: `npx vitest run test/corpus/skills/unattended.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts`
- threat: Skill text read with nobody watching. It trusts the run verbs. Abuse: none new.

### z-docs — the pages, the changelog, the security notes

- id: z-docs
- requirements: REQ-FLOW-176, REQ-FLOW-177, REQ-FLOW-178, REQ-FLOW-179, REQ-FLOW-180, REQ-FLOW-181, REQ-WORKTREE-019 (a changelog line: an old policy linking a directory under a slash-only rule now fails that row; ledger review/30)
- files: `CHANGELOG.md`, `SECURITY.md`, `docs/configuration.md`, `docs/customization.md`, `docs/cloud.md`, `docs/factory.md`, `docs/working-with-stamity.md`, `docs/getting-started.md`, `docs/troubleshooting.md`, `test/docsPages.test.ts`, and `docs/security-mapping.md` (the crosswalk's land-footer wording; S99, amended 2026-11-10)
- interfaces: one changelog entry per user-facing change; `SECURITY.md` names the switch (a strict tightening), skills
  from trusted sources (the fetch, the pin, the scans, the script refusal), the private-repositories setting (what it
  lifts and what it never does), the test-runner token residual (S27: once its report exists a shell can read the token) and the land row at `SECURITY.md:138`; that a source with `allowScripts` may bring any file type (ledger build/28); the land job list at `docs/cloud.md:601` (review/25) (a footer-shaped tail may follow the marker; ledger build/10); `docs/configuration.md` the new keys; `docs/customization.md` the skill verb; the
  cloud and factory pages the closing keyword, the clean-up and a launch mode that never prompts; the pages' pins. Also (amended 2026-11-09): `docs/getting-started.md`'s state table and git-ignored list name both away files (review/93); `docs/getting-started.md:27`, `:194` and `docs/troubleshooting.md:102` count `run metrics` among the run subcommands that need no git (build/60).
- testCriteria: `test/docsPages.test.ts` passes; every new key and verb is documented once.
- edgeCases: no page claims the closing keyword works on the land job's merges until the cut's real run shows it.
- depends_on: k-unattended-text, s-skills-content, p-private-repos, d-gc, l-banner
- verify: `npx vitest run test/docsPages.test.ts test/ci/testInputsGuard.test.ts && node scripts/leak-gate.mjs`
- threat: Docs. Abuse: a page promising more than the code. Stopped by review against the units.

### z-eval-sync — every eval case against the final content

- id: z-eval-sync
- requirements: spec carries no ids
- files: `evals/cases-v6/**` (ranges and quoted Brief sentences only, plus the rows and claims the interfaces line names)
- interfaces: after the last content edit, re-point every `source:` range and every Brief quote that moved, in one
  batch; no Expected block changes, except (S37, amended 2026-11-09) a case whose Expected judges the old close (the proof block printed in chat) moves to the new close (a plain summary in chat; the proof block in the run record), each such case listed with its old and new row; record the list for the cut session's driver re-pin. Also (build/45, amended 2026-11-09): the B5 rows that still require the final message to name morning.md move to the new unattended text, in `unattended-land-silent-review-tool-held`, `unattended-land-outside-auto-ship-waits` and `unattended-land-evidence-holds`, with the `claim:` lines of the last two cases that say the same (review M-2). Also (review/76, amended 2026-11-09): `plan-artifact-head-and-units-shape`'s claim and B6 count the unit table with its new `skills` field.
- testCriteria: `test/evals/locators.test.ts` and the rest of `test/evals` pass on the final tree.
- edgeCases: a case whose quoted sentence was deleted on purpose (k-multipart-quick) quotes the new general line.
- depends_on: k-unattended-text, s-skills-content, e-walk-case, z-docs
- verify: `npx vitest run test/evals test/ci/testInputsGuard.test.ts`
- threat: Eval text. Abuse: a Brief drifting from its rows. Stopped by the rule that Expected never moves.

### z-spec — the spec delta merged

- id: z-spec
- requirements: REQ-FLOW-094, REQ-FLOW-128, REQ-FLOW-176, REQ-FLOW-177, REQ-FLOW-178, REQ-FLOW-179, REQ-FLOW-180, REQ-FLOW-181, REQ-WORKTREE-019, REQ-PROVE-047 (file 1's ADDED ids merge with them)
- files: `docs/specs/everyday-flows.md`, `docs/specs/worktree-lane.md`, `docs/specs/prove-behavior-and-value.md`
- interfaces: files 1 and 2's spec deltas merged at Prove, each with its proof pointer, the headers' amendment lines
  dated; file 3's slice merges with file 3. (Amended 2026-11-09) REQ-FLOW-178 states what the shipped guard does: the in-order folder reading, the walk to the package and workspace roots, the cap refusal past `PLACES_MAX`, a `cd` to a missing folder, `pushd`/`popd`, and the read-only forms; each implementer's spec delta and each sign-off that moved a requirement (the run record's S-lines) is read, not only the plan's delta. (S100, amended 2026-11-10) REQ-FLOW-180 says `check` reports a copied skill's drift; `sync` does not (no unit built it). (S103, amended 2026-11-10) REQ-FLOW-181 (`autonomy.unaskedPushRepos`) is not delivered in 1.19.0: its unit stayed out after its cap round; the spec marks it planned, not shipped, with the reason.
- testCriteria: the spec tests and `plan check` over files 1 and 2 pass.
- edgeCases: a requirement whose unit did not land stays out, named in the run's `Not done:`.
- depends_on: z-docs
- verify: `npx vitest run test/specs test/docsPages.test.ts test/ci/testInputsGuard.test.ts`
- threat: Spec text. Abuse: none reachable.

## Risks

- **Warning: a copied skill sits on a held path.** `skill add` is an attended planning act; an unattended
  build only reads it.
- **Warning: `scripts.ts` has five writers.** Mitigation: the chain; each unit regenerates the budgets it moves.
- **Warning: the private-repositories setting loosens the guard.** Mitigation: two rule ids only, every plain-reading
  condition, attended only, the security lens.
- **Warning: the note rewording moves 33 case hashes,** so they re-measure in the cut's eval run. Accepted: the cut
  owes a run anyway.
- **Minor: `Closes` on a merge by the land job's token is unproven.** The pages wait for the cut's real run.

## Open questions

None.

## Follow-ups

- Remove the grader's drop of a declared-deleted row from the route of record's driver, with its results section ·
  when: the driver's first re-pin after the 1.19.0 tag · files: the private driver; `evals/SET-v7.md` carries the dated paragraph
- Add a golden eval case for `/st-debug`'s in-process-first route when the report gives no exact input (ledger review/12 of run 2026-11-09_last-before-2-0) · when: the next eval set edit after the 1.19.0 tag, batched before a driver re-pin · files: `evals/cases-v6`, `evals/SET-v7.md`, `content/commands/st-debug.md`
