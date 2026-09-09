---
id: enterprise-upstream-lane
# A design document, authored outside the spec command and excluded from the site build.
status: shipped-with-1.4.0
obsolete_when: the lane's behaviour moves into the CLI reference and the enterprise-forks guide carries every requirement below, or a decision cuts the surface
---
# The enterprise upstream lane

An organisation that forks this repository, changes anything in it — a rule's prose, a
default in `src/`, a hook body, a generated tree — and then wants the next upstream release
without losing that work needs three things git does not give it on its own: a truthful
answer to "which upstream release is in here", an integration attempt that cannot damage
the branch it integrates into, and a result that says what happened in words a reviewer
can act on. This spec designs that lane. It ships as one plain-Node script,
`scripts/upstream.mjs`, one opt-in GitHub workflow that is a thin layer over it, one
configuration file, and the acceptance suite that proves the lifecycle over temporary
repositories.

Every claim about existing behaviour below carries a `path:line` citation taken from the
tree at `a42b45d` (the 1.3.0 head) at the time of writing. Citations are code spans rather
than links: they address lines, which no link form can resolve.

## Intent

Let a downstream fork take upstream releases, one at a time or several at once, through a
reviewable pull request whose merge commit carries the upstream release in its ancestry —
while every customization the fork made survives, every conflict is a first-class result
the fork's people resolve, every generated artifact is regenerated rather than hand-merged,
and every claim the lane makes about "integrated" is backed by history it can re-derive.

Three things it deliberately does not promise. It does not promise a conflict-free upgrade
for arbitrary edits: two edits to the same lines are a conflict, and the lane's job is to
report it well, not to guess. It does not promise semantic compatibility from a clean
textual merge: that is what the fork's own gates are for, and the lane runs them. And it
does not send anything to a model or a service: the whole lane is git, Node, and the
fork's own commands.

## Context

### What a fork of this repository is made of

The repository is not a conventional library. Its product is mostly prose under
`content/` (agents, rules, skills, commands and the charter), an engine under `src/` that
projects that prose per client, generated manifests at the root (`apm.yml`, `plugin.json`,
`.claude-plugin/`, `.cursor-plugin/`), generated documentation, and a **dogfooded emitted
tree** that is committed: `.claude/**`, `.apm/**`, `AGENTS.md`'s managed block and
`.stamity/manifest.json` (`CONTRIBUTING.md:141-150`; the `.apm/` tree is written only by
`scripts/generate-apm-package.mjs`, never by `sync` — no file under `src/` names it).

That last class is the one that makes a naive merge painful. A downstream edit to
`content/rules/stamity-secrets.md` legitimately touches three tracked files — the source,
`.claude/rules/stamity-secrets.md` and `.apm/instructions/stamity-secrets.instructions.md`
— because the repository's own learning demands the emitted copies move with the source
(`.stamity/learnings/corpus-edits-ship-with-a-dogfood-sync.md`). When upstream edits the same
rule, git reports three conflicts where only one is real. The lane therefore treats
**generated paths as regenerable**, not as merge inputs (REQ-UPSTREAM-007).

### The customization boundaries that exist today

- **Replacement and patch overrides** live under `.stamity/overrides/` per consuming
  repository: a copy of a bundled artifact shadows it whole (`src/content/userContent.ts:64-70`,
  the merge precedence USER > PACK > CORPUS in `src/content/catalog.ts:41-51`), and a
  `.customize.yaml` / `.customize.md` beside it patches frontmatter or appends to the body
  (`src/content/userContent.ts:73-99`). These are the consumer-side boundary; a fork
  dogfoods them too.
- **Packs** are the additive channel: `packs/<id>/pack.json` plus content directories,
  bundled into the package (`tsdown.config.mjs:257-260`), discovered through the curated
  list (`src/pack/curated.ts:150`), pinned by a generator (`scripts/generate-pack-manifests.mjs`).
- **Everything else is a direct edit**: `content/**` (declared framework territory in
  `docs/customization.md:19-22`), defaults such as `DEFAULT_MATURITY_TIER`
  (`src/types/core.ts:41`), the roster and grants under `src/roster/`, the MCP catalog
  (`src/mcp/catalog.ts`), the hook bodies (`src/hooks/scripts.ts`; the emitted copies under
  `.stamity/generated/hooks/` are reclaimed by `sync`).

The lane supports all three. It cannot make the third conflict-free, and it does not try;
what it adds for the third is **drift reporting**: when upstream changes a file the fork
also changed, or a default the fork shadows, the report says so even when git merged the
bytes cleanly (REQ-UPSTREAM-008).

### The landing-policy trap, observed on this repository itself

This repository's own `main` ruleset requires linear history and allows only squash and
rebase merges (read 2026-09-09 through the rulesets API: `required_linear_history`,
`allowed_merge_methods: ["squash","rebase"]`). A fork that copies that policy cannot land
an upstream merge commit, and a squash or rebase of the update branch produces a `main`
whose history does not contain the upstream release commit at all. Every later run would
then see the release as "not integrated" and re-merge it, and every previously resolved
conflict would come back. The lane detects that condition after the fact from history
(REQ-UPSTREAM-004) and, on GitHub, before the fact from the branch rules (REQ-UPSTREAM-011),
and the guide tells a fork to allow merge commits on its integration branch or to keep a
dedicated integration branch that does.

### The exit-code contract this lane is designed on

The CLI publishes three exit statuses — 0 for success, 1 for a result the caller must act
on, 2 for a usage or environment problem (`docs/cli-reference.md`, "Exit statuses") — and
the worktree lane's spec settled that a partial success is a returned exit-1 result carrying
its payload, never a throw (`docs/specs/worktree-lane.md`, REQ-WORKTREE-011). The upstream
lane keeps that contract: `conflict`, `validation-failed`, `ancestry-missing` and
`update-branch-stale` are exit 1 with a full report; a missing config, an unreadable
remote, a git older than the floor, or an unknown verb is exit 2.

### Why a plain script and not a CLI verb

The lane must run in a tree that is mid-merge: `src/` may not compile, `dist/` may be
stale, and the whole point of the run is to get out of that state. A verb inside
`dist/cli.js` would need a build the tree cannot produce. `scripts/leak-gate.mjs` is the
precedent for a repository tool that runs standalone against an arbitrary root with no
TypeScript import (`test/ci/leakGate.test.ts:7-10`); the lane follows it. The script uses
only Node built-ins and the `git` binary. It is invoked as `node scripts/upstream.mjs
<verb>` and, for convenience, as `npm run upstream -- <verb>`.

## Invariants

1. **The target branch is never written.** The lane reads the fork's integration branch
   and writes only an update branch, in its own worktree. No verb checks out, resets,
   commits to, or otherwise moves the target branch or the operator's working tree.
2. **History is the marker.** A release is "integrated" only when its upstream commit is
   an ancestor of the target branch AND the integration record for it says the gates
   passed or that no gates were configured. A record without ancestry, or ancestry without
   a passing record, is reported as exactly that, never as integrated.
3. **No conflict marker is ever committed.** `continue` refuses while any unmerged index
   entry or any `<<<<<<<`/`=======`/`>>>>>>>` marker line remains in a tracked file.
4. **No blanket side preference.** The lane never runs `merge -X ours`, `-X theirs`,
   `checkout --ours/--theirs` over the conflict set, `reset --hard`, a force push, or a
   file copy that hides a conflict. Generated paths are regenerated from their sources by
   the repository's own commands, which is resolution by derivation, not by preference.
5. **Both sides' work survives.** Every commit reachable from the target branch and from
   the upstream release stays reachable from the update branch's merge commit.
6. **Idempotent by construction.** Running any verb twice with the same inputs produces
   the same outcome and no second copy of any artifact: no duplicate branch, worktree,
   record, pull request or issue.
7. **Nothing leaves the machine.** No network call other than `git fetch` of the
   configured upstream and, in the GitHub layer, the platform's own API through `gh`.

## Requirements

### REQ-UPSTREAM-001 — One configuration file, one verb surface

The fork declares its upstream in `.stamity/upstream.json` at the repository root:

```json
{
  "version": 1,
  "upstream": "https://github.com/zomarit/stamity.git",
  "remote": "upstream",
  "branch": "main",
  "releases": { "pattern": "v*", "prerelease": false },
  "gates": [{ "name": "check", "run": "npm ci --ignore-scripts && npm run check" }],
  "regenerate": [
    "node scripts/generate-apm-package.mjs",
    "node scripts/generate-plugin-manifests.mjs",
    "npm run build && node dist/cli.js sync"
  ],
  "generatedPaths": [".apm/**", ".claude/**", "AGENTS.md", "CLAUDE.md", ".stamity/manifest.json", "apm.yml", "plugin.json", ".claude-plugin/**", ".cursor-plugin/**", "docs/cli-reference.md", "docs/configuration.md", "docs/reference/**", "docs/capability-matrix.md", "llms.txt", "src/pack/catalogPins.ts"],
  "watch": ["content/charter/**", "src/types/core.ts"],
  "shadows": { "packs/acme/rules/acme-secrets.md": "content/rules/stamity-secrets.md" }
}
```

`upstream` is required. Every other key has a default: `remote` "upstream", `branch`
"main", `releases.pattern` "v*", `releases.prerelease` false, `gates` empty (and the report
then says so in words: *no gates configured — a clean merge proves nothing about behaviour*),
`regenerate` empty, `generatedPaths` empty, `watch` empty, `shadows` empty. An unknown key,
a non-object, or a `version` other than 1 is a config error (exit 2).

The verbs are `status`, `preview`, `integrate`, `continue`, `validate`, `abort`, and
`help`. Every verb accepts `--json` (one JSON document on stdout, nothing else on stdout)
and `--config <path>`. `status`, `preview` and `integrate` accept `--release <tag>` to
select a release explicitly; without it the target is the newest stable release by
semantic-version order of the tag names matching the pattern. `--prerelease` admits tags
carrying a prerelease suffix. `--offline` skips the fetch and reads what the last fetch
brought. The canonical repository carries no `.stamity/upstream.json`; the script and the
workflow treat its absence as "this is not a fork" (exit 2 for the script, a notice and a
clean skip for the workflow).

### REQ-UPSTREAM-002 — Fetching into a namespace of its own

`status`, `preview` and `integrate` fetch the upstream's release tags and its default
branch into refs the fork's own tags cannot collide with:
`refs/stamity-upstream/tags/<tag>` (annotated tags peeled to their commits when compared)
and `refs/stamity-upstream/heads/<branch>`. The fork's own `v*` tags — a fork may cut its
own releases under the same names — stay untouched, and a run never creates or moves a tag
in `refs/tags/`. The remote named in the config is created with the configured URL if
absent, and a run refuses (exit 2) when a remote of that name exists with a different URL,
naming both, rather than silently repointing it.

### REQ-UPSTREAM-003 — Derived state: integrated release, target release, divergence

`status` reports, from history alone:

- **integrated**: the highest release whose commit is an ancestor of the target branch
  (`git merge-base --is-ancestor`), plus its integration record if one exists and agrees;
- **target**: the selected release, its exact commit, and the tag's date;
- **candidates**: every release newer than the integrated one, in order, so a fork that
  skipped releases sees each one it is about to take in a single merge;
- **divergence**: commits on the target branch not in the target release, and commits in
  the target release not on the target branch (`rev-list --count` both ways), and whether
  upstream's default branch is ahead of the selected release;
- **affected**: three lists — files changed on both sides since the merge base
  (`overlaps`), watched paths the release changes (`watched`), and shadowed defaults the
  release changes (`shadowed`; REQ-UPSTREAM-008) — each with the number of changed lines
  on the upstream side;
- **outcome**: `up-to-date`, `update-available`, `ancestry-missing` (REQ-UPSTREAM-004) or
  `ancestry-lost` (REQ-UPSTREAM-004).

An exit of 0 for `up-to-date` and `update-available`; 1 for the two ancestry outcomes.

### REQ-UPSTREAM-004 — Missing and lost ancestry are named, never repaired by force

When the target branch and the selected release share no merge base, the outcome is
`ancestry-missing` and the report explains the two ways a fork gets there — a tree
imported without its history, or a repository started from a tarball — and the recovery:
re-create the fork from a clone that carries the upstream history and graft the local
commits on top, or, when the tree really was taken at a known upstream commit, replay the
local changes as one commit onto that commit. The lane never runs
`--allow-unrelated-histories`.

When an integration record claims a release the history does not contain — the usual cause
is a squash or rebase landing of an earlier update branch, and both lose the ancestry (the
release commit is no longer reachable, and the next merge re-conflicts on lines only the
fork touched, verified on git 2.52) — the outcome is `ancestry-lost`, the report names the
record, the release and the commit that is not an ancestor, and the recovery: land update
branches by merge commit (REQ-UPSTREAM-011), and for the release already lost, run
`integrate` again; git will re-merge it, previously resolved conflicts may reappear, and
`git rerere` (which the lane enables in the update worktree) replays recorded resolutions
when it can. The guide also carries the manual rescue that restores the ancestry in one
step when the record's upstream commit is trusted: `git merge-tree --write-tree
--merge-base=<recorded upstream commit> <branch> <release>` (git 2.40 or newer) and a
`git commit-tree` with both parents.

### REQ-UPSTREAM-005 — Preview modifies nothing the operator owns

`preview` performs the merge in a temporary detached worktree of the target branch with
`git merge --no-commit --no-ff <release-commit>`, reads the result — conflicted paths with
their kind (content, modify/delete, rename/delete, add/add), the merged diff stat, the
release notes (the `## [<version>]` section of upstream's `CHANGELOG.md` at the release
commit, extracted the way `release.yml`'s "Compose release notes" extracts it), the
affected lists from REQ-UPSTREAM-003 — then aborts the merge and removes the worktree.
The operator's working tree, index, stash list and branches are byte-identical before and
after; the acceptance suite asserts it. A dirty operator worktree is not an obstacle: the
lane never touches it.

### REQ-UPSTREAM-006 — Integrate on an isolated update branch and worktree

`integrate` creates the branch `stamity-upstream/<tag>` from the target branch's current
head, checks it out in the worktree `.stamity/upstream-work/<tag>/` (the directory is
ignored by the repository's `.gitignore`), enables `rerere` there, and runs
`git merge --no-ff --no-commit <release-commit>`.

- **Clean merge**: the lane regenerates (REQ-UPSTREAM-007), runs the gates (REQ-UPSTREAM-009),
  writes the record (REQ-UPSTREAM-010), and commits the merge with the message
  `Merge upstream release <tag> into <branch>` and the trailers
  `Stamity-Upstream-Release: <tag>`, `Stamity-Upstream-Commit: <sha>`,
  `Stamity-Upstream-Gates: passed | failed | none`. Outcome `integrated` (exit 0) or
  `validation-failed` (exit 1).
- **Conflict**: the merge is left in progress in the update worktree, nothing is committed,
  and the report lists every conflicted path, its kind, whether it is a generated path
  (resolved by regeneration on `continue`, so the human need not touch it), and the
  commands to finish: edit, `git add`, then `node scripts/upstream.mjs continue`. Outcome
  `conflict` (exit 1).
- **Existing update branch**: if `stamity-upstream/<tag>` already exists and its head
  contains the release commit and descends from the target branch's current head, the
  outcome is the branch's recorded one (`integrated`, `validation-failed`) or
  `conflict-pending` when its worktree still holds an in-progress merge, and nothing is
  redone. If the target branch moved since the branch was cut, the outcome is
  `update-branch-stale` (exit 1) with two remedies: `--recreate` when the branch carries
  nothing but the lane's own merge commit (the lane then deletes it and starts over), or a
  manual `git merge <branch>` inside the update worktree when a human has committed
  resolutions there — a branch with human commits is never deleted by the lane.

Several releases are integrated as one merge of the newest selected release: the merge
commit's ancestry then covers every skipped release, and `status` lists them as
integrated together.

### REQ-UPSTREAM-007 — Generated paths are regenerated, not merged by hand

A path matching `generatedPaths` that git reports as conflicted is not offered to the human.
On a clean merge and on `continue`, after every non-generated conflict is resolved, the lane
runs the `regenerate` commands in the update worktree in order, stops at the first
non-zero exit (outcome `regenerate-failed`, exit 1, output captured in the report), then
stages the generated paths. A generated path that still carries a marker after
regeneration is a defect in the `generatedPaths` list and is reported as such rather than
committed (invariant 3). The default list for this repository is written into the guide
and mirrors `CONTRIBUTING.md`'s regeneration table.

### REQ-UPSTREAM-008 — Drift a clean merge hides is reported

For each entry of `shadows` (`<fork path> → <upstream path>`), and for each automatic pair
the lane derives — `.stamity/overrides/<class>/<id>.md` → `content/<class>/<id>.md`,
`.stamity/overrides/<class>/<id>.customize.{yaml,md}` → the same,
`.stamity/overrides/skills/<id>/SKILL.md` → `content/skills/<id>/SKILL.md` — the report
carries one row when the release changes the upstream side: *the default behind
`<fork path>` changed in `<tag>` (+a/−b lines); the override still applies and hides the
change — review it.* When the upstream side was deleted or renamed in the release, the row
reads *orphaned* and names the rename target when git detected one.

For each `watch` glob the release touches, one row names the path and the line delta. For
each overlap — a path changed on both sides that git merged without a conflict — one row
reads *merged cleanly on both sides' edits; semantic review needed*. These rows are the
lane's honest limit: it can say *look here*, and it cannot say *this is fine*.

### REQ-UPSTREAM-009 — The fork's own gates decide, and their result is the record's

Each `gates` entry runs in the update worktree through the platform shell, in order, with
stdout and stderr captured; the first failure stops the sequence. A gate list that is empty
is reported as `none` and the guide says what that means. The gates run after
regeneration and before the merge commit, so the commit carries their result; the
`validate` verb re-runs them on an existing update branch and writes a new record commit
(`upstream lane: gates re-run for <tag>`) so a branch fixed by hand can turn from
`validation-failed` to `integrated` without rewriting history.

The reference example the guide carries, and the acceptance suite proves on a fixture, is a
behaviour gate: a test that asserts a downstream default (the fixture's `tier` in its
`config.json`; for this repository, the enterprise's own vitest file under `test/` asserting
what `init` emits) still holds after the merge. An upstream release that changes the
default in a file the fork never edited merges cleanly and fails that gate, and the update
branch then carries `Stamity-Upstream-Gates: failed`, which the GitHub layer turns into a
failing check on the pull request.

### REQ-UPSTREAM-010 — The integration record, and what it may claim

`integrate` and `continue` write `.stamity/upstream/integrations/<tag>.json` into the
update branch, committed in the merge commit itself: the release, its commit, the merge
base, the target head the branch was cut from, every gate with its name, command, exit code
and duration, the regeneration commands run, the conflict list with each path's kind and
`resolvedBy: "human"` when one was, the overlap, watched and shadowed rows, the tool
version, and the timestamp. `status` reads the record for the integrated release and
cross-checks it against ancestry (invariant 2); a mismatch is `ancestry-lost`. The record is
evidence, never authority: deleting every record leaves `status` correct, only less
detailed.

### REQ-UPSTREAM-011 — Landing policy: detected on GitHub, derived everywhere

Because the marker is ancestry, only a merge commit landing preserves it. On GitHub, the
workflow (REQ-UPSTREAM-013) reads the target branch's effective rules
(`GET /repos/{owner}/{repo}/rules/branches/{branch}`) and, when `required_linear_history`
is present or merge commits are not among the allowed methods, writes a warning into the
pull request body and the job summary naming the setting to change; the pull request is
still opened, because the decision belongs to the fork. Everywhere else — GitLab, a
self-hosted remote, a policy the API cannot see — the same condition surfaces after the
first squash as `ancestry-lost` (REQ-UPSTREAM-004), and the guide lists the equivalent
settings per host as far as they were verified.

### REQ-UPSTREAM-012 — Abort and recovery

`abort` aborts an in-progress merge in the update worktree, removes the worktree, and
deletes the update branch when — and only when — it carries no commit beyond the target
head it was cut from; otherwise it removes the worktree and keeps the branch, saying so.
The target branch is untouched in both cases. Recovery from a landed integration is the
ordinary git one, written into the guide: `git revert -m 1 <merge commit>` on the
integration branch, and — because git remembers a reverted merge — a revert of that revert
before the same release is merged again.

An interrupted run (a killed process during the merge or the gates) leaves an update
worktree the next `integrate` recognises from its branch and in-progress state and reports
as `conflict-pending` or `update-branch-stale`, never as a fresh start that would duplicate
work.

### REQ-UPSTREAM-013 — The GitHub layer is thin, split by trust, and idempotent

`.github/workflows/upstream-update.yml` runs on `workflow_dispatch` (inputs: `release`, an
optional tag; `dry_run`, default false) and on a daily schedule. Its first job probes
`.stamity/upstream.json`; when absent it writes a notice and the run ends green, which is
the canonical repository's own case. Two jobs follow:

- `prepare` (`permissions: contents: read`, no secret in the environment): checkout with
  full history and `persist-credentials: false`, Node at the floor, then
  `node scripts/upstream.mjs integrate --json` — the merge, the regeneration and the
  fork's gates run here, on code the run does not trust with a write token. It uploads the
  update branch as a git bundle plus the JSON and markdown reports as one artifact.
- `publish` (`permissions: contents: write, pull-requests: write, issues: write`): runs
  only git and `gh`. It fetches the bundle, pushes `stamity-upstream/<tag>` when no such
  remote branch exists (an existing remote branch is never force-updated; the run reports
  the existing pull request instead), opens one pull request per tag — or updates the body
  of the open one — from the markdown report, applies the landing-policy check
  (REQ-UPSTREAM-011), and marks the run failed when the outcome is `validation-failed` so
  the check on the pull request is red. On `conflict` it cannot push a conflicted tree, so
  it opens or updates one issue titled `Upstream <tag> needs conflict resolution` carrying
  the report and the local commands, and exits 1. A `concurrency` group serialises runs.

The workflow needs no personal token and no App to run, and two platform limits shape
what the repository token can do. First, that token cannot push a commit that creates or
changes a file under `.github/workflows/` — and upstream releases of this product do touch
workflow files — so `publish` checks the bundle for workflow-file changes before pushing:
with no `STAMITY_UPSTREAM_TOKEN` secret configured it does not push, uploads the bundle,
opens or updates one issue (`Upstream <tag> needs a push with workflow permission`) carrying
the report and the local push commands, and exits 1. Second, a pull request opened with the
repository token starts the fork's own `pull_request` runs only in an approval-required
state (GitHub's 2026-06-11 change; before it they did not start at all), and opening one at
all requires the repository or organisation setting "Allow GitHub Actions to create and
approve pull requests". The optional secret — a fine-grained token or App token with
Contents, Pull requests and Workflows write — lifts both limits, is read only by `publish`,
and is documented in the guide. The gates still run in `prepare`, and their result is on the
branch and in the check either way.

### REQ-UPSTREAM-014 — Portable clones and platform limits are documented, not assumed

The lane works on any git repository that has the upstream history in its object store:
a GitHub fork, a plain clone pushed to a private repository under another organisation, a
GitLab or self-hosted mirror. It relies on nothing in the fork network. The guide states
the platform facts the lane cannot change — a private copy of a public repository cannot
be a GitHub fork at all (a fork's visibility is tied to its network), so the private case
is a mirror clone pushed to a new repository with its history and none of the fork
features (`Sync fork`, the merge-upstream endpoint, pull requests to upstream, `gh repo
sync`); `gh repo sync` is fast-forward-only and its `--force` is a hard reset; scheduled
workflows are disabled by default in a fork and stop after sixty idle days in a public
repository; upstream release and push events never reach another repository — each
verified against the platform documentation and the `gh` source on 2026-09-09 and recorded
in the plan's research section.

### REQ-UPSTREAM-015 — A repository that never runs the lane is byte-identical

The canonical repository ships the script, the workflow and the `.gitignore` entry and
nothing else: no config, no record, no worktree. Nothing under `.stamity/upstream/` or
`.stamity/upstream-work/` exists here, and the workflow's first job ends at the probe.

## Acceptance criteria

Each criterion is executable over temporary repositories built by the suite: an
"upstream" with releases `v1.0.0` … `v1.3.0` whose tree mirrors this repository's risk
classes (a source under `content/`, a generated file derived from it by a committed
generator script, a default in `config.json`, a pin file `README.md`, a gate script), and a
"fork" cloned from it with its history.

- GIVEN a fork with no customizations at `v1.0.0` WHEN `integrate` runs for `v1.1.0` THEN the
  outcome is `integrated`, the update branch's merge commit has the fork head and the
  release commit as parents, the record names the release and `gates: none`, and `status`
  on the update branch reads `up-to-date`.
- GIVEN a fork with independent customizations (a new file, an edit to a file upstream
  never touches) WHEN `integrate` runs THEN the outcome is `integrated`, every fork commit
  remains reachable, and both the fork's file and upstream's changes are in the merged tree.
- GIVEN overlapping edits (the fork and the release both changed the same lines of the
  same source) WHEN `integrate` runs THEN the outcome is `conflict`, the report names the
  path and kind `content`, no commit was made, the target branch and the operator worktree
  are byte-identical to before, and both sides' versions are recoverable from the index
  stages.
- GIVEN that conflict resolved by a human in the update worktree WHEN `continue` runs THEN
  the merge commits with the record's `resolvedBy: human`, the generated file derived from
  the resolved source was regenerated (its content matches the generator's output for the
  resolved source, and it carries no marker), and the outcome is `integrated`.
- GIVEN that landed integration WHEN a second release `v1.2.0` is integrated THEN the merge
  base is the previous release's commit, only the second release's changes are merged, the
  previously resolved conflict does not reappear, and `status` lists `v1.1.0` and `v1.2.0`
  as integrated with the records agreeing.
- GIVEN a fork at `v1.0.0` WHEN `integrate` runs with no `--release` and `v1.1.0` … `v1.3.0`
  exist THEN the target is `v1.3.0`, the report lists the skipped releases, and one merge
  commit integrates all of them.
- GIVEN an update branch already prepared WHEN `integrate` runs again with the same inputs
  THEN nothing is recreated, the outcome repeats, and there is exactly one branch, one
  worktree and one record; on GitHub, exactly one pull request.
- GIVEN a release that deletes a source the fork modified WHEN `integrate` runs THEN the
  outcome is `conflict` with kind `modify/delete`, and the report says which side deleted.
- GIVEN a release that renames a source the fork modified WHEN `integrate` runs THEN git's
  rename detection carries the fork's edit into the renamed path, or reports
  `rename/delete`, and either way the report names both paths.
- GIVEN a fork whose `shadows` maps a fork file to an upstream default WHEN a release changes
  that default THEN the report carries the shadowed row naming both paths and the delta,
  even though the merge was clean.
- GIVEN a fork whose gate asserts a downstream default WHEN a release changes that default
  in a file the fork never edited THEN the merge is clean, the gate fails, the outcome is
  `validation-failed`, the record and the merge trailer say `failed`, and `status` on the
  branch does not read `integrated`.
- GIVEN an operator worktree with uncommitted changes and an untracked file WHEN
  `integrate` runs and is interrupted (the gate process killed) THEN the uncommitted
  changes and the untracked file are intact, the target branch is unmoved, and the next
  `integrate` reports the in-progress state rather than starting over.
- GIVEN a fork with an unrelated history WHEN `status` runs THEN the outcome is
  `ancestry-missing` and no merge is attempted.
- GIVEN an integration record on the target branch whose release commit is not an ancestor
  WHEN `status` runs THEN the outcome is `ancestry-lost` and the report names the record.
- GIVEN `preview` on any of the above WHEN it completes THEN the operator's working tree,
  index, stash list and branch list are byte-identical to before.
- GIVEN the canonical repository WHEN `status` runs THEN it exits 2 naming the missing
  config, and the workflow's probe job ends with a notice.

## Non-goals for v1

- An "org overlay" content layer inside the fork's package (a bundled directory that adds
  and shadows corpus artifacts without editing `content/`). It would reduce the most
  common fork edit to zero conflicts and is the natural next step; it touches the catalog's
  precedence chain and the corpus-count pins, so it gets its own spec. Trigger: the first
  fork that reports recurring conflicts on content additions.
- Landing the pull request. The lane prepares; people merge.
- Any model-assisted resolution or suggestion.
- A GitLab or Bitbucket pipeline. The script is the portable half; the guide names the
  settings, and a pipeline is a translation of the workflow's two jobs.

## Test plan sketch

`test/upstream/` — a fixture builder (`fixtures.ts`) that makes the upstream and fork
repositories with an isolated git environment (the `seedGitRepo` idiom from
`test/support/repoFixtures.ts:83-124`: `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`,
`HOME`, `commit.gpgsign=false`, `init.defaultBranch=main`), then one spec per acceptance
criterion above spawning `scripts/upstream.mjs` with `--json` and asserting on the
document, the refs, the worktree bytes, and the records. `test/ci/workflow.test.ts` gains
the new workflow through its directory scan and the assertions specific to its job split.

## References

Filled in the "Research record" section of the plan (`docs/plans/004-apm-canonical-and-enterprise-upstream.md`)
with the date and link of every platform fact the guide states.

## Risks

- A fork whose `generatedPaths` list is wrong ships a marker into a generated file. Held by
  invariant 3: `continue` refuses, names the path and the list.
- A fork whose gates are slow makes `integrate` slow. Held by `--no-gates` for a local
  preview of the merge, with the record then saying `skipped`, which `status` does not
  count as integrated.
- Nested worktrees under `.stamity/upstream-work/` confuse a tool that walks the tree.
  Held by the `.gitignore` entry and by the leak gate's untracked-but-ignored exclusion.
