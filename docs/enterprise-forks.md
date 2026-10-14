---
title: Enterprise forks
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit c3d81529. Re-attested 2026-10-14 against the records branch, which now holds the plan and the run record this page links and names, and the recommended generatedPaths list, which no longer names the measurements page, and for the identity section against the identity script as commit 382a6173 leaves it, and for the release section and the section on dropping the deleted routes against the fork release workflow as commit 0801927b leaves it and the upstream lane script at commit 5284eaaa, and for that section's order against the 1.14 identity script and its test suite at commit c96c7146 -->
<!-- Re-open when: a verb or an outcome joins or leaves `scripts/upstream.mjs`, a key joins or leaves
     `.stamity/upstream.json`, the fork layer's layout or precedence changes in `src/content/catalog.ts`,
     or the jobs or the permissions in `.github/workflows/upstream-update.yml` change. `test/docsPages.test.ts`
     holds this page to the hand-page contract. `test/upstream/lane.test.ts` owns the lane's behaviour, and
     the content, emission and validate suites own the fork layer's. A move of CONTRIBUTING.md's
     regeneration table moves the `regenerate` list and the `generatedPaths` list below with it.
     Re-open the identity and release sections when a flag joins or leaves
     `scripts/fork-identity.mjs`, or a variable, secret, job or proof moves in
     `.github/workflows/fork-release.yml`.
     Re-open the gates section when the census in `test/ci/testInputsGuard.test.ts` changes what
     it asks of a test's reads, or the `*.md` entry leaves the `testInputs` map of
     `.stamity/change-classes.json`. -->

# Enterprise forks

This page is for the engineer who keeps a fork of stamity and has to take the next upstream
release without losing the fork's own changes. When you finish it you can configure the upstream
lane, run it, act on what it reports, land the result, and move your customizations into a layer
upstream never writes.

Start here, in your fork:

```sh
node scripts/upstream.mjs status
```

It prints which release your branch already has, which release is next, and what that release
touches. Nothing is merged and nothing is written.

The lane is three things: one plain-Node script, `scripts/upstream.mjs`; one configuration file,
`.stamity/upstream.json`; and one opt-in GitHub workflow that runs the script. Run the script as
`node scripts/upstream.mjs <verb>` or as `npm run upstream -- <verb>`. Run `help` for the verb and
flag list. It needs Node built-ins and `git` 2.24 or newer, and it imports nothing from `src/`. It
is a script rather than a CLI verb because it has to run in a tree that is mid-merge, where `src/`
may not compile and `dist/` may be stale.

## What the lane does not promise

Three limits, so you do not plan around a guarantee that is not there.

- **A conflict-free upgrade for any edit.** Two edits to the same lines are a conflict. The lane's
  job is to report one well, not to guess at it.
- **Semantic compatibility from a clean merge.** A clean merge is a statement about text. Your own
  gates are what say the product still works, and the lane runs them.
- **Anything model-assisted.** No suggestion, no resolution and no summary comes from a model.

## Get a fork that carries the upstream history

The lane needs one property, and nothing else: the upstream's history in your object store, so a
merge base exists. It relies on nothing in the GitHub fork network.

**A public fork.** Fork the repository and clone it. The upstream commits are already there. Work
in that clone.

**A private copy.** A private copy of a public repository cannot be a fork, because a fork's
visibility is tied to its network. The private case is a single-branch import of upstream `main`,
pushed into a new, empty repository. Follow the four steps below in order.

The import route gives up every fork feature. There is no "Sync fork", no merge-upstream endpoint,
no pull request back to upstream, and `gh repo sync` refuses with "repository is not fork". None of
that matters to the lane, which is git-native. Two platform facts hold on both routes. Upstream
`release` and `push` events never reach another repository, so a fork learns about a release by
polling or by dispatch. And `gh repo sync` is fast-forward-only, with `--force` meaning a hard
reset, so it is no route for a customized fork.

### Check the prerequisites before you import

Start with approved empty private package and consumer repositories, an integration branch that
permits reviewed merge commits, and named owners for updates and for monitoring. Confirm access to
upstream git releases, npm dependencies, Actions, and the runner you selected. Where network
policy requires mirrors, configure the approved git and npm endpoints and the permitted Actions
first, then repeat the same fetch, build and install checks against them. Official sources and
tested clients are recorded in
[the enterprise downstream plan](https://github.com/zomarit/stamity/blob/records/docs/plans/005-enterprise-downstream-support.md).

Confirm the destination owner's GitHub plan supports the private branch controls you need. Private
rulesets and protected branches need GitHub Pro, Team or Enterprise Cloud. A plan-related `403`
leaves required-check enforcement and landing-policy proof blocked until the owner provides
supported private controls. Keep the repository private. Changing visibility is not a recovery
step.

### Import the history into a private repository

Set the destination to your own approved equivalent of the example below. Keep credentials out of
variables that name repositories and out of git URLs. Disable Actions **before importing any
refs**: a pushed ref can start the workflows it carries before you have reviewed them, and an older
commit's workflows can lack the current publication guards.

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
gh repo create "$STAMITY_DOWNSTREAM" --private
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .private)" = true
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .fork)" = false
gh api --method PUT "repos/$STAMITY_DOWNSTREAM/actions/permissions" -F enabled=false
STAMITY_PRIVATE_URL="$(gh repo view "$STAMITY_DOWNSTREAM" --json url --jq .url)"
git clone --bare --single-branch --branch main --no-tags https://github.com/zomarit/stamity stamity-import.git
git -C stamity-import.git push "$STAMITY_PRIVATE_URL.git" 'refs/heads/main:refs/heads/main'
git clone "$STAMITY_PRIVATE_URL.git" stamity-private
cd stamity-private
git remote add upstream https://github.com/zomarit/stamity
git fetch upstream
STAMITY_BASELINE_TAG='v1.8.0'
git merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD
```

The last command checks the baseline this example imported. It runs in this working clone, where
`git fetch upstream` brought upstream's tags; the import itself pushed none. Set
`STAMITY_BASELINE_TAG` to the exact upstream tag or SHA your organisation approved, not to whatever
the newest release happens to be. The value above is an example and it ages: a check against a tag
your import predates fails, and that failure is the point of the command. Confirm `origin` points
to the private destination before every initial push. The import narrows GitHub's own bare-clone
procedure, linked from [the enterprise downstream plan](https://github.com/zomarit/stamity/blob/records/docs/plans/005-enterprise-downstream-support.md):
it copies `main` alone, no other branch and no tag, so `plugin-dist`, `plugins/v*`, the `v*`
release tags and the evidence-archive, replay and retirement tags stay upstream, and the push
deletes nothing at the destination. Keep the bare import as a backup until the downstream and
consumer checks pass. Every later update comes through the upstream lane instead. This working
clone holds upstream's tags, so push the private copy's own release tags by name
(`git push origin <tag>`), never with `--tags`. Push from it without `--follow-tags` and with
`push.followTags` unset, too: either makes a plain branch push carry upstream's annotated `v*` tags
along, because they point at commits the pushed branch contains. A copy imported with the earlier
`--mirror` recipe keeps `plugin-dist`, `plugins/v*` and upstream's other tags until its owner
deletes them, and nothing in the lane reads them.

### Set the private package's identity

One command sets the publisher, the repository and the package name, from the checkout's root:

```sh
node scripts/fork-identity.mjs --repository "$STAMITY_PRIVATE_URL"
npm install --package-lock-only --ignore-scripts
```

`scripts/fork-identity.mjs` sets `name` to `@<scope>/stamity`, `stamity.publisher` to the owner,
and `repository.url`, `homepage` and `bugs.url` to the repository you name; version, description
and license keep their values. It sets `private: true`, removes `publishConfig` and moves the
Renovate preset. It runs no generator and needs nothing installed, since it reads only Node's
built-ins and its sibling scripts. The lockfile refresh comes last because the script stays offline
and leaves `package-lock.json`, whose root entry carries the old name, alone.

Two flags change what it writes:

- `--registry <url>` makes a fork that publishes its own CLI. It removes `private` and sets
  `publishConfig.registry` to that https URL, which is what the release workflow in
  **Release your fork** below requires. Without it the package stays private and has no npm
  channel.
- `--scope <scope>` names the npm scope when it differs from the owner. The default is the owner
  in lowercase. The package is always `@<scope>/stamity`.

It validates through `scripts/distribution-identity.mjs`, and it refuses before writing anything
on an invalid identity: a repository off the public GitHub host, a scope npm would refuse, or a
registry URL that is not plain https. That is the rule every pinned CLI call applies to the registry it names: `https://<host>[:<port>][/<path>]`, the host of letters,
digits, `.` and `-`, the path of letters, digits, `.`, `_`, `~`, `/` and `-`, so no credentials,
query, fragment, `%` escape, space or shell character. It never echoes the URL it refused. It also refuses, naming the file, to rewrite a file with uncommitted
edits. A rerun with the same arguments moves no byte, and `--check` writes nothing and exits 1
naming each file that differs from its target.

The script moves the Renovate preset because it carries the identity as data rather than deriving
it: `renovate/companion.json` names the npm package it pins. A fork tree that still holds the
`renovate/plugins.json` preset of the deleted plugin route keeps it untouched. Everything else
follows your manifest on its own. The runtime's own remedies
(`run: npx -y --@<scope>:registry=<url> <your package>@<version> init` with `--registry`,
`npx --no <your package>@<version> init` without it) and `scripts/tarball-smoke.mjs` read `name`
from `package.json`.

The CLI calls your setup writes follow the same split. `init` and `sync` pin every call they write
into `AGENTS.md`, the generated bodies, the hook hints, the guard messages and `.codex/hooks.json` to your package at the version that wrote it, and the CLI's own remedies
do the same. A touchpoint body tries `npx --no stamity <verb>` first — the `stamity` bin of a copy
the project already has installed, whatever package name that copy carries, and never a download —
and falls back to the pinned call only where npm refuses because no copy is installed. With
`--registry` the call is `npx -y --@<scope>:registry=<url> @<scope>/stamity@<version> <verb>`.
npx finds a scope's registry only in npm's configuration, and `publishConfig` in your manifest
steers `npm publish` only, so the call carries the setting itself: npx takes your package from
your registry on every machine, with or without a scope mapping in its `.npmrc`, and every other
package from the default registry. The setup, the CLI's remedies, the update notice's move command
and `sync --help` all print this form. The flag outranks an `.npmrc` mapping, so a
machine that reaches your scope through a mirror is sent to the registry you published to for the
fallback call, while a project that installs the pinned version runs that copy with no registry
request. A registry URL outside the plain-https rule above (no credentials, query, fragment, `%`
escape, space or shell character) is never written into a command. The
identity script's `--registry` refuses one before writing anything, so only a hand edit of
`publishConfig.registry` can leave it, and such a fork's calls render `npx --no`, as without
`--registry` below. Hold your scope on
the public registry too, and publish nothing there, so a call someone types without the flag ends
with a 404 instead of fetching a package someone else published under your name. The
startup update notice asks your registry, never the public one, whether a newer version exists. It
sends no credentials, so a registry that needs them leaves the notice silent. Without `--registry`
the call is `npx --no @<scope>/stamity@<version> <verb>`. Your scope is a public, predictable name
that nobody holds on the public npm registry, and a `-y` call would install whatever a third party
published there under it, without asking. `--no` makes npm run a copy the project already has
installed at that version and refuse to fetch one. Anywhere else the call stops with an npm error, a
404 while nothing is published under the name and `npx canceled due to missing packages` once
something is, and no package is installed or run. The hints also name the short `stamity <verb>`
form, for a machine where the CLI is on `PATH`.

The release and docs-deployment workflows you inherit also check the running repository's identity
and visibility. Their public publication jobs run only in the public canonical repository. Preserve
those guards when you review an upstream release. A fork's own npm publishing goes through
`.github/workflows/fork-release.yml` (**Release your fork** below), which does nothing until you name your destination. Docs
deployment needs a separate reviewed workflow and an explicit private destination before you
enable it.

### Turn the workflows on last

Commit your identity, your customization and `.stamity/upstream.json`, with its `branch` set to the
integration branch you intend to use. Run the regeneration commands and the behaviour gates before
you push.

Align the downstream CI workflows' `push` and `pull_request` branch filters with that branch. Match
the branch protection's required check names to the jobs that actually run. Verify those checks on
a real update pull request: inherited filters limited to `main` do not cover another branch. Update
the workflow tests to match your deliberate customization. This repository's
`test/ci/workflow.test.ts` asserts the canonical `main` filter exactly, so keep an equally explicit
assertion for your own filters and your full gate still checks the policy you intended.

Your rename needs no test edit at all. Every suite that has to know who this package is reads
`test/support/identity.ts`, which answers from your own `package.json`: the name, the version, the
publisher, whether the package is private, whether a registry serves it, which registry its pinned
calls name, and the `<owner>/<repository>` route your `repository.url` names. So a test asserts the remedy string
or the Renovate pin that YOUR identity implies, and the inherited gate is green
on your tree for the same reason it is green upstream. Three things are still yours to keep true, and
all three are data rather than tests: the identity step above (the manifest and the Renovate
preset), the branch filters in the paragraph before this one, and the test-input map. A test your
fork adds declares the tracked documents it names in the `testInputs` map of
`.stamity/change-classes.json`, as **Write the gates that decide the upgrade** below shows for its
sample. Run the regenerate list in the
same commit as the rename, because the generated trees are compared byte for byte and a skipped
regeneration reads as drift.

Only then enable the approved CI, upstream and private-release workflows and repository Actions,
after the organisation owner has verified the bot permissions and the real required pull-request
checks. Keep Actions disabled until the current workflows, identity, credentials and destinations
have been reviewed, including how historical tags are handled. Do not copy the canonical branch
rules blindly: this integration branch must allow merge ancestry, while your existing protections
stay in force everywhere else.

### Recover when there is no shared history

`status`, `preview` and `integrate` all refuse on a tree that shares no merge base with the
release. The outcome is `ancestry-missing`, the exit code is 1, no merge is attempted, and the lane
never runs `--allow-unrelated-histories`.

Forks arrive there two ways: a tree imported without its history, or a repository started from a
tarball. There are three recoveries.

- **A shallow clone.** Run `git fetch --unshallow origin` against your authorized history source,
  then fetch upstream and retry `status`.
- **No common history at all.** Re-create the repository from a clone that carries the upstream
  history, and replay your commits on top. Preserve the original checkout while you do it.
- **A known base commit.** When you know the upstream commit your tree was taken at, replay your
  local changes as one commit onto that commit.

Erasing records or forcing unrelated histories together does not reconstruct the missing base.

## Configure `.stamity/upstream.json`

The lane reads its configuration from `.stamity/upstream.json` in your repository, and committing
that file is what turns the lane on. `version` and `upstream` are the two required keys, and
`version` must be `1`. Every other key has a default. An unknown key, a top level that is not a
JSON object, and a missing or non-`1` `version` are each a configuration error that exits 2.

| Key | Default | What it does |
|---|---|---|
| `version` | — | Must be `1`. |
| `upstream` | required | The clone URL the lane fetches from. |
| `remote` | `upstream` | The remote name. The lane creates it with that URL when it is absent. A remote of that name with a *different* URL refuses the run and names both URLs, rather than being repointed. |
| `branch` | `main` | Your integration branch. Releases are merged into it, and ancestry is read from it. |
| `releases` | — | An object holding the two keys below. |
| `releases.pattern` | `v*` | Which upstream tags count as releases — and the only tags the lane keeps. |
| `releases.prerelease` | `false` | Whether a tag carrying a prerelease suffix may be selected. |
| `gates` | empty | `[{ "name": ..., "run": ... }]`, run in order in the update worktree. An empty list is reported in words: *no gates configured — a clean merge proves nothing about behaviour*. |
| `regenerate` | empty | Commands that rebuild the generated tree, run in order before the gates. |
| `generatedPaths` | empty | Globs the lane treats as regenerable rather than as merge inputs. |
| `watch` | empty | Globs you want named in the report whenever a release touches them. |
| `shadows` | empty | `{ "<your path>": "<upstream path>" }` — a file of yours that stands in for an upstream one. |

### Start from these values for a fork of this repository

```json
{
  "version": 1,
  "upstream": "https://github.com/zomarit/stamity",
  "gates": [{ "name": "check", "run": "npm ci --ignore-scripts && npm run check" }],
  "regenerate": [
    "npm ci --ignore-scripts",
    "node scripts/generate-capability-matrix.mjs",
    "node scripts/generate-docs.mjs",
    "node scripts/generate-pack-manifests.mjs",
    "npm run build && node dist/cli.js sync"
  ],
  "generatedPaths": [
    ".claude/**", "AGENTS.md", "CLAUDE.md", ".stamity/manifest.json",
    ".stamity/generated/**",
    "docs/cli-reference.md", "docs/configuration.md", "docs/reference/**",
    "docs/capability-matrix.md", "llms.txt", "src/pack/catalogPins.ts"
  ],
  "watch": ["content/charter/**", "src/types/core.ts", "src/roster/**", "src/mcp/catalog.ts"],
  "shadows": { "packs/acme/rules/acme-secrets.md": "content/rules/stamity-secrets.md" }
}
```

`remote`, `branch` and `releases` are left at their defaults here. The `regenerate` list is
[the regeneration table in CONTRIBUTING.md](../CONTRIBUTING.md) in command form, less two rows:
the measurements row, whose `merge-ready-rate.mjs --write` freezes a dated snapshot and whose
second command the plain `generate-docs.mjs` above already covers; and the pack-manifest
`generate-pack-manifests.mjs --write` row, which rewrites an integrity map after a deliberate pack
edit. `generatedPaths` is the
tracked left column of the rows that remain, plus `.stamity/manifest.json`, which `sync` writes
beside `.stamity/generated/`. The measurements page is not listed: a fork holds no records, so
`generate-docs.mjs` skips that page there with a notice and leaves the committed page as it is.
`npm ci --ignore-scripts` leads the list because the commands run in a fresh linked worktree that
has no `node_modules` of its own.

Keep the two lists in step. A generated path that is not listed is offered to a human as a conflict
nobody should resolve by hand. A listed path that nothing regenerates keeps its conflict markers
and is refused at `continue`.

`watch` is advisory and cheap. The four globs above are where a downstream customization is most
often quietly invalidated: the charter template, the core types, the agent roster and its grants,
and the MCP catalog. `shadows` is the one thing the lane cannot derive for itself. Declare a file
of yours that stands in for a bundled artifact, and a release that moves the artifact behind it is
reported even when the merge is clean.

### Drop the deleted routes from a fork set up before 1.15.0

1.15.0 deletes the APM and plugin routes, and with them the two generators an earlier version of
this guide put in `regenerate`: `node scripts/generate-plugin-manifests.mjs` and
`node scripts/generate-apm-package.mjs`. The lane runs the `regenerate` list it reads from the
merged tree, so a fork that still lists either one ends its 1.15.0 integration as
`regenerate-failed`. One edit has to land on your integration branch before you integrate 1.15.0:
in `.stamity/upstream.json`, remove both commands from `regenerate`, and remove `.apm/**`,
`apm.yml`, `plugin.json`, `.claude-plugin/**` and `.cursor-plugin/**` from `generatedPaths`.

Leave `package.json` and `renovate/plugins.json` alone on the integration branch. It still runs
1.14 code until the update branch lands, and in 1.14 the identity script and its always-on test
suite read `renovate/plugins.json`, so deleting it there turns your CI red. Both go in the update
worktree instead, as part of the merge:

- The release removes the `stamity.distribution` block from `package.json`. Where your fork changed
  that block, the merge reports a conflict there; take upstream's side of those lines. 1.15.0
  ignores a block that stays behind and names it in a one-line notice for one release.
- The release deletes `renovate/plugins.json`. Drop it from any Renovate configuration of yours that
  extends it, in the same worktree.

The release also deletes `.apm/`, `apm.yml`, `plugin.json`, `.claude-plugin/` and
`.cursor-plugin/`. Where your fork changed one of these paths or `renovate/plugins.json` (the 1.14
identity script retargets that preset), the merge reports a modify/delete conflict, and `git rm` on
that path resolves it before `continue`. Where a conflict in
`.github/workflows/fork-release.yml` falls inside the distribution steps the release removes, take
upstream's side of those lines. If either the block or the preset is still there once the update
branch has landed, delete it then; by that point the branch runs 1.15.0. A distribution branch and
tags your fork already pushed stay where they are: nothing in 1.15.0 reads or moves them, and a
consumer pinned to one still resolves it. If an integration already ended `regenerate-failed`, run
`abort`, commit the `.stamity/upstream.json` edit, and run `integrate` again.

## Take the next release

```sh
node scripts/upstream.mjs status                  # what is integrated, what is next, what it touches
node scripts/upstream.mjs preview                 # merge in a throwaway worktree, report, abort
node scripts/upstream.mjs integrate               # the newest stable release
node scripts/upstream.mjs integrate --release v1.4.0
```

Without `--release`, the target is the newest release matching the pattern in semantic-version
order. `--prerelease` admits a tag with a prerelease suffix. Skipped releases are not skipped work:
several are integrated as **one merge of the newest one**, and that merge's ancestry then covers
every release the newest one contains. A maintenance release cut on a side branch is not covered
and stays a candidate. The report lists every release the merge covers, so a reviewer sees each
one.

The other flags:

- `--json` puts one document on stdout and nothing else there. Every verb takes it, and it is how
  the workflow reads results.
- `--offline` skips the fetch and reads what the last fetch brought.
- `--config <path>` reads the configuration from somewhere other than `.stamity/upstream.json`.
- `--no-gates` does not run the gates. The record then says `skipped`, which never counts as
  integrated.
- `--recreate` lets `integrate` start a stale update branch over. See `update-branch-stale` below.
- `--branch <name>` takes another branch as the target, for every verb. Use it to run `status`
  against the update branch itself, or `integrate` from a runner checkout under another name.
- `--release <tag>` also names which update branch `continue`, `validate` and `abort` act on, when
  several exist.

`preview` is the safe one. It merges in a temporary detached worktree, reads the result, then
aborts the merge and removes the worktree. Your working tree, index, stash list and branches are
byte-identical before and after, and a dirty tree is no obstacle.

`integrate` cuts `stamity-upstream/<tag>` from your integration branch's head. It checks that out
under `.stamity/upstream-work/<tag>/`, which is gitignored. There it merges the release with
`--no-ff --no-commit`, regenerates, runs your gates, writes the record, and commits. The commit
message is `Merge upstream release <tag> into <branch>`, with three trailers:
`Stamity-Upstream-Release: <tag>`, `Stamity-Upstream-Commit: <sha>` and
`Stamity-Upstream-Gates: passed | failed | none | skipped`.

`integrate`, `continue` and `validate` run the merged tree's `regenerate` commands and `gates` with
your environment. Review the release before you run them on a workstation that holds credentials,
or run them in CI, where the preparation job holds none. The lane prints that warning itself.

The record beside the trailers is `.stamity/upstream/integrations/<tag>.json`, committed **in the
merge commit itself**. It carries:

- the release and its commit, the merge base, and the target head the branch was cut from;
- every gate with its command, exit code and duration, and the regeneration commands;
- every conflicted path with its kind and its `resolvedBy`, which is `human` or `regeneration`;
- the drift rows, the record format's version and the timestamp.

The record is evidence, never authority. Delete every record and `status` is still correct, only
less detailed, because **history is the marker**.

### Read the outcome and the exit code

| Outcome | Exit | What it means |
|---|---|---|
| `up-to-date` | 0 | The selected release is already in the branch's ancestry, with a record that agrees. |
| `update-available` | 0 | A newer release exists. `status` and `preview` say so; nothing was merged. |
| `integrated` | 0 | The merge is committed on the update branch, and the gates passed or none were configured. |
| `conflict` | 1 | The merge stopped. Nothing is committed. The update worktree holds it, and the report names every conflicted path and its kind. |
| `validation-failed` | 1 | The merge is clean and your gates failed. On `status` it carries a second meaning. The release is in the ancestry, but its record says the gates failed or were skipped. So it is in history and still not integrated. |
| `regenerate-failed` | 1 | A `regenerate` command exited non-zero, or regeneration rewrote a tracked path that no `generatedPaths` glob covers. The sequence stops at the first failure with its output captured, and an unlisted path is named with the fix: list it. Nothing is staged or committed either way. |
| `conflict-pending` | 1 | An update worktree from an earlier run still holds an in-progress merge. Finish it or run `abort`. Nothing is redone behind your back. |
| `update-branch-stale` | 1 | The update branch was cut from a target head that has since moved. `--recreate` starts over when the branch carries nothing but the lane's own merge commit. Otherwise merge your branch into the update worktree by hand. |
| `ancestry-missing` | 1 | There is no merge base with the release. |
| `ancestry-lost` | 1 | A record claims a release the history does not contain. This is almost always a squash or rebase landing. |
| `not-a-fork` | 2 | There is no `.stamity/upstream.json`, so this repository is not a fork that opted in. |
| `error` | 2 | A configuration or usage error, git missing or below the 2.24 floor, a remote name clash, or a failed fetch. |

The exit-0 outcomes `aborted` and `help` are what `abort` and `help` report.

## Resolve a conflict

A conflicted `integrate` leaves the merge in progress in `.stamity/upstream-work/<tag>/` and
commits nothing. Work there, not in your own checkout:

```sh
cd .stamity/upstream-work/v1.4.0                  # the conflict list is in the report too
git status                                        # edit, then stage what you resolved
git add <paths>
cd - && node scripts/upstream.mjs continue
```

Two things make this shorter than it looks.

**Generated paths are never hand-merged.** A conflicted path matching `generatedPaths` is not
offered to you at all. `continue` runs the `regenerate` commands and stages the result, so the
resolution comes from derivation rather than from preference, and the record marks those paths
`resolvedBy: regeneration`. When a merge's *only* conflicts are generated paths, `integrate`
finishes it on its own.

**Resolutions are replayed.** The lane runs the merge and its merge commit under `rerere`, passing
`-c rerere.enabled=true` per invocation so that nothing is written to your git configuration. A
resolution recorded once in the shared `rr-cache` is replayed the next time git meets the same
conflict.

`continue` refuses while any unmerged index entry remains. It also refuses while any `<<<<<<<`,
`=======` or `>>>>>>>` marker line remains in a file the merge touched. A bare `=======` counts only
beside another marker, so a setext underline on its own does not block you. A marker that survives
regeneration is a defect in your `generatedPaths` list, and the lane reports it as one rather than
committing it.

## Write the gates that decide the upgrade

The lane merges text. Only your own tests can say whether the merged product still does what your
organisation needs, which makes `gates` the load-bearing part of the configuration.

Gates run in the update worktree, in order, after regeneration and before the merge commit, so that
commit carries their verdict. The first failure stops the sequence. `validate` re-runs the gates on
an existing update branch and commits a fresh record, so a branch you fixed by hand turns from
`validation-failed` into `integrated` without rewriting history.

The gate worth writing first asserts that a downstream clause is still there. This one checks a
clause your fork added to `content/charter/stamity-charter.md`:

```ts
// test/enterprise/charter-clause.test.ts — an upgrade gate, not a unit test.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLAUSE = "Acme: a change under `billing/` carries a finance reviewer.";

describe("the downstream charter clause survives an upstream release", () => {
  it("reaches the AGENTS.md that init writes", () => {
    const repo = mkdtempSync(join(tmpdir(), "acme-upgrade-"));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, "README.md"), "# fixture\n");
    const cli = join(process.cwd(), "dist/cli.js");
    execFileSync(process.execPath, [cli, "init", "-y", "--tools", "claude"], { cwd: repo });
    expect(readFileSync(join(repo, "AGENTS.md"), "utf-8")).toContain(CLAUSE);
  });
});
```

It can rely on `dist/cli.js` because the recommended `regenerate` list built it one step earlier. A
release that rewrites the charter in a file your fork never edited merges perfectly cleanly and
fails this test, which is the point. **A clean textual merge proves nothing about behaviour.** A
fork with no gates gets `Stamity-Upstream-Gates: none`, so silence never reads as a pass.

Declare the test's reads in the same commit. The suite carries a test-input census,
`test/ci/testInputsGuard.test.ts` over `src/change/testInputs.ts`. It takes every string literal in a
test source that names a tracked file other than code as a read of that file. A read of a page, of a
record, or of any path an entry of the `testInputs` map in `.stamity/change-classes.json` matches
then needs an entry whose glob matches the path and whose `tests` list names the test, or a folder
holding it. The sample names `README.md` and `AGENTS.md`, both tracked, and the map's `*.md` entry
lists upstream's tests by name. Added as printed, the sample fails the census once per read:

```text
test/enterprise/charter-clause.test.ts reads AGENTS.md, and no map entry matching AGENTS.md lists test/enterprise/charter-clause.test.ts
```

With the recommended gate that is a red `npm run check`, and `integrate` ends `validation-failed`.
The entry the sample needs is one line in the `tests` list of the map's `*.md` entry,
`"test/enterprise/charter-clause.test.ts"`. Upstream edits that list too. A release that changes the
lines beside yours conflicts there, and the resolution keeps both sides.

## Land the update branch

Ancestry is the marker, so only a **merge-commit landing** preserves it. Allow merge commits on
your integration branch, or keep a dedicated branch that allows them and land onto your default
branch separately.

Squash and rebase both destroy the ancestry, and that is verified rather than assumed. After either
one, the release commit is not an ancestor and the lane still reports the release as pending. The
next merge then re-conflicts on lines only the fork touched, because the merge base regressed to
the root. This repository's own `main` ruleset requires linear history and allows squash and rebase
only. That is exactly the policy a fork must not copy onto its integration branch.

On GitHub the workflow checks three surfaces: the active rulesets across all response pages, the
repository merge settings, and classic branch protection. A linear-history requirement, or a
restriction to squash and rebase, or a merge queue set to either, produces a warning in the pull
request and in the job summary. Classic protection needs Administration: read. A branch that has no
classic protection answers 404 with `Branch not protected`. That is an answer, not a failure, so
the check records no classic protection and stays complete. A branch protected by rulesets alone
therefore carries no note. A permission failure, a 404 with any other message, and a malformed
response are each marked **not fully checked**, while restrictions the check already observed still
produce their warnings. The note appears only when a surface stayed unverified. Confirm any
unreadable setting with the repository administrator, and do not broaden the automation token just
to silence the note. The pull request still opens, and the landing decision stays yours.

New and recovered pull requests get a conventional title, `chore(upstream): integrate <tag>`. An
existing pull request's title, body and labels are left untouched. Commits the lane creates carry a
`Signed-off-by` trailer naming the configured committer, and the workflow configures its own
automation identity. A trailer a script writes is a trailer, not a certification by the person it
names: the Developer Certificate of Origin is a statement whoever submits the contribution makes,
so before you submit to a DCO-gated repository, configure an approved contributor identity, then
review the contribution and sign it off yourself. The local placeholder fallback is still
available, and it writes no trailer at all. Upstream commits keep their original messages.

This repository's own DCO check reads an update pull request's commits from the comparison
endpoint and walks its pages until the rows in hand reach the `total_commits` that endpoint
reports, so a pull request carrying several hundred upstream commits is checked whole rather than
refused for its length, and a listing that comes up short fails the check rather than passing on
the part that arrived. There is one exemption. An unsigned commit is waived when it is reachable
from the default branch of the upstream repository your `.stamity/upstream.json` names — an
ancestor of that branch, or its tip — read from the pull request's base branch, so no pull request
can introduce the configuration that exempts it, and only when that `upstream`
names a repository on GitHub, because the question the check asks is a GitHub API read. Reachability, and not mere
existence: GitHub serves a commit pushed to any repository in a fork network through the parent
repository's endpoint, so "the upstream has this sha" would be answered yes for a commit anyone
pushed to a personal fork, and against a public upstream that would let a contributor waive the
DCO on their own commit. Only the upstream's maintainers move its default branch. A commit that
branch never reached, an upstream whose default branch cannot be read, an upstream on any other
host, and a repository that configures no lane at all each leave every commit needing its own
trailer, and the check says which of the four it applied. A missing upstream sign-off still needs a maintainer's decision, and it
does not justify exempting the update pull request from its required checks.

When policy forbids merge commits, construct the merge by hand from the record's upstream commit
with git 2.40 or newer, then move your branch onto the result:

```sh
git merge-tree --write-tree --merge-base=<the record's upstream commit> <your branch> <release>
git commit-tree <the tree that printed> -p <your branch> -p <release> -m "Merge upstream release <tag>"
```

## Back out an attempt or a landed release

**Back out an attempt.** `node scripts/upstream.mjs abort` aborts the in-progress merge and removes
the update worktree. It deletes the update branch only when that branch carries no commit beyond
the target head it was cut from. A branch with any commit on it, including the lane's own merge
commit, is kept, and the lane says so. Your integration branch is untouched either way, and a
second `abort` is a no-op.

**Back out a landed integration.** Run `git revert -m 1 <the merge commit>` on the integration
branch. Git then remembers the merge as reverted, so revert the revert before you merge that
release again. Otherwise the second merge brings back nothing.

**Clean up after an interrupted run.** A process killed during the merge or the gates leaves the
update worktree behind. The next `integrate` recognises it and reports `conflict-pending` or
`update-branch-stale` rather than starting over. Uncommitted changes and untracked files in your own
checkout are intact, because no verb writes there.

## Choose where your customization lives

Each boundary below costs a fork a different amount at upgrade time. Pick the cheapest one that can
express what you need. [Customization](customization.md) is the full reference for the override
tree and the overlay patches.

| Boundary | Where it lives | Conflict cost | What the lane reports |
|---|---|---|---|
| Replacement override | `.stamity/overrides/<class>/<id>.md` | None. The file is yours; upstream never writes it. | An override-drift row when the release changes the artifact behind it: *the default behind `<path>` changed in `<tag>`; the override still applies and hides the change — review it*. It reads *orphaned* when the upstream side was deleted, naming the rename target when git found one. |
| Patch overlay | `.stamity/overrides/<class>/<id>.customize.yaml` or `.customize.md` | None on the merge. The risk is a patch that quietly stops matching what it patches. | The same drift rows, derived rather than declared. Both shadow roots spell their ids as bare slugs: `.stamity/overrides/` and `fork/`. The counterpart is whichever corpus spelling exists at your branch's head, not the bare name. `rules/secrets.md` pairs with `content/rules/stamity-secrets.md`, and `skills/qa/SKILL.customize.yaml` with `content/skills/st-qa/SKILL.md`. |
| Pack | `packs/<id>/` and its `pack.json` | None while the pack only adds. | Nothing, unless the pack shadows a bundled id. Declare that in `shadows` and it is reported like an override. |
| Fork layer | `fork/<class>/<id>.md` and `fork/skills/<id>/SKILL.md` inside the package, with `.customize.yaml` or `.customize.md` siblings for a patch instead of a replacement. | None. Upstream never writes under `fork/`, so no release can conflict with it. A replaced or patched default that moves upstream is drift, not a conflict. | A `shadowed` row per fork file whose bundled counterpart changed, resolved to the prefixed corpus file: `fork/rules/secrets.md` pairs with `content/rules/stamity-secrets.md`. It reads *orphaned* when that counterpart was deleted or renamed. A fork ADDITION has no counterpart, so it derives no pair and the lane says nothing about it. |
| Direct core edit | `src/**`, the roster, the MCP catalog, the hook bodies. Also `content/**`, for the two things the fork layer cannot express. One is the charter template under `content/charter/`, which is not a content class. The other is an edit to the middle of a bundled body that has to keep tracking upstream. A whole replacement stops tracking it, and an appended patch cannot state it. | The real cost. Same lines on both sides is a conflict. Same file, different lines is a clean merge that may still be wrong. | `overlaps`, one row per path both sides changed, each reading *merged cleanly on both sides' edits; semantic review needed*. Plus one `watched` row per changed path a `watch` glob matches, each with the upstream line delta. |

Those rows are the lane's honest limit. It can say *look here*. It cannot say *this is fine*.

Adding content downstream also moves this repository's own hand-maintained pins, and an upgrade
conflicts on them by design. The corpus counts in README's `content/` map row are hand-typed and
held to the catalog's own count, and a guide your fork adds moves the page-roster literals the same
way. Expect that conflict. Resolve it by re-deriving the counts for your fork, rather than by
taking either side whole.

## Author in the fork layer

`fork/` is a directory inside the package that a fork of this repository fills with its own agents,
rules, commands and skills. It exists for one reason. The most common core edit is your wording of
a shipped rule, your extra agent, or a shipped default carrying your tags. The fork layer turns each
of those into a file upstream never touches, so what used to be a conflict every release becomes a
file every release merges past.

**The layout** is the override tree's, rooted at the package instead of at a consumer repository:

| Class | Replace it whole | Patch it |
|---|---|---|
| agent | `fork/agents/<id>.md` | `fork/agents/<id>.customize.yaml`, `fork/agents/<id>.customize.md` |
| rule | `fork/rules/<id>.md` | `fork/rules/<id>.customize.yaml`, `fork/rules/<id>.customize.md` |
| command | `fork/commands/<id>.md` | `fork/commands/<id>.customize.yaml`, `fork/commands/<id>.customize.md` |
| skill | `fork/skills/<id>/SKILL.md`, plus the skill's own files | `fork/skills/<id>/SKILL.customize.yaml`, `fork/skills/<id>/SKILL.customize.md` |

In a checkout it is `fork/` beside `content/`. In the package your build publishes it is
`dist/fork` beside `dist/content`, staged by `tsdown.config.mjs` only when the checkout has one,
and counted in the corpus half of the size budget. A package with no `fork/` directory indexes,
plans and emits byte-identically to one built before the layer existed. This repository ships none.

**Replace or patch, never both for one id.** A fork file claiming an id the corpus holds replaces
that artifact whole, and the replaced one leaves the index: one identity, one body. A
`.customize.yaml` instead patches the resolved artifact's frontmatter key by key, and a
`.customize.md` appends to its body. The base keeps flowing from the corpus or from the pack that
supplies it, so the patch survives an upstream rewrite of everything it did not name. The two
shapes are mutually exclusive per layer. `fork/rules/testing.md` beside
`fork/rules/testing.customize.md` is refused naming both files, exactly as that pair is refused in
a consumer's override tree.

### Name a fork file with a bare slug

The corpus spells its own filenames with the prefix the engine mints: `stamity-` for agents and
rules, `st-` for commands and skills. A fork file wearing that prefix is refused at index time:

> a fork-layer filename carries the engine content prefix, which names the generated corpus, not
> the fork's own artifact. Save it under the bare spelling "security-patterns.md" instead — a bare
> slug that matches a bundled artifact's id replaces it, prefix and all.

The same refusal covers a skill directory such as `fork/skills/st-qa/`. The engine mints the prefix
onto what it emits, so you never spell it yourself. So `fork/rules/security-patterns.md` is how you
replace `content/rules/stamity-security-patterns.md`, and the bare spelling is what the drift
derivation above resolves back to the prefixed corpus file.

### Know what wins, and what a pack may not do

**The precedence chain** any `(class, id)` resolves through is corpus or pack → fork → user. Each
of the two upper stages can hold either shape, a full replacement or a patch. A consumer of your
fork can still replace or patch what your fork layer put there, because their `.stamity/overrides/`
tree sits above it.

**A pack and the fork layer never share an id.** Whichever of the two arrives first, the pack is
the one refused on contact, with *Packs must not shadow existing content*. That is the same rule
that already holds between a pack and the corpus. Whoever meets it has the same two remedies:
remove the pack with `clean --pack <id>`, or ask the pack's author to rename the artifact. From the
fork's side there is no reason to reach for a pack's id at all. To change what a pack supplies,
patch it with `fork/<class>/<id>.customize.yaml` or `fork/<class>/<id>.customize.md`, or ship your
own artifact under an id of your own. A pack's skill is the exception: overlays on pack skills are
not applied, so a fork patch of one is skipped, and the only route is your own skill under an id of
your own. The refusal says so when the artifact is a skill.

**A fork patch can outrun the pack it patches.** The fork layer is package-global and packs are
per-repository. A fork patch addressed at an agent, command or rule only an installed pack supplies
is skipped in a consumer repository that does not carry that pack. A fork patch of a skill is
skipped whether or not the pack is there, and its warning says it will not apply even once a pack
supplies the skill. `validate` shows a warning row naming the
artifact the patch waits for; it cannot name the pack, because nothing installed supplies it. It is
never an error, because nothing there is wrong. A consumer's own orphan patch keeps its error: it
names an id nothing in that repository supplies, which is almost always a typo in the filename.
And where a consumer's own override has already replaced the id a fork patch addresses, the patch
is reported as inert under that override rather than as applied.

### Read what `validate` reports

Every id the layer replaces or patches is a row, marked so a reader can tell a fork's customization
from a consumer's:

```text
shadowing — 1 fork replacement takes a bundled id, 1 fork overlay patches one

  rule security-patterns  fork/rules/security-patterns.md  replaces rules/stamity-security-patterns.md — fork layer
  rule testing  fork/rules/testing.customize.yaml  patches rules/stamity-testing.md (corpus) — fork layer
```

The JSON envelope carries the same rows, a replacement as `winner: "fork"` and a patch as
`layer: "fork"`. Like every shadowing line, they are information and never move the exit code.
Nothing about the layer relaxes a floor. A fork artifact passes the index-time contract a bundled
one passes. The merged artifact a fork patch produces is checked exactly as a consumer's patched
artifact is, with the finding addressed to the fork file.

### Know what your consumers receive

**Fork artifacts are always on.** Selection admits one by presence, the way it admits a consumer's
override: a fork ships what it put under `fork/`, and no selection record deselects it. Each then
reaches every client location its class reaches for corpus content, unless its name is refused as
a clash (below). The per-client copy is an
adapter-owned, regenerated, reclaimable file, while the source under `fork/` is never planned,
never wrapped in a managed block and never reclaimed.

**A fork skill that replaces a bundled one keeps the bundled spelling.** The directory you author is
bare, `fork/skills/verify/SKILL.md`. Because `verify` is the id the bundled `st-verify` holds, it
projects to every client as `st-verify`, directory and `name` alike. Every call site and every
cross-reference to that skill keeps working. A fork skill whose id nothing bundled holds is an
addition, and it projects under its own bare directory. Either way the directory travels whole:
`SKILL.md` plus the supported companion files beneath it, as UTF-8 text. The one
thing a fork skill cannot do is land in a projection directory another skill already occupies under
a different id. That is refused, naming the file to move. Nor can any fork artifact take a name
that an artifact of another class installs under. A fork command `qa` lands in `st-qa`, the folder
of the bundled skill `st-qa`, and so does a command beside a fork skill that replaced the bundled
one. `sync`, `check` and `init` refuse such a name in every consumer before they plan
anything. The refusal names the fork file to rename in the fork's source, and the fix ships only
when you publish the package again.

**Your generated reference pages will list your artifacts.** `docs/reference/` is rendered from the
built index. So in a fork, `node scripts/generate-docs.mjs` writes the fork's agents, rules,
commands and skills into those pages and moves their count lines with them. That is what a fork's
own reference should say. This repository's README counts and its corpus census read `content/`
alone, so those do not move.

[The fork-layer spec](specs/fork-layer.md) is the design reference behind all of it: what was
decided, what was dropped, and why.

## Release your fork

`.github/workflows/fork-release.yml` releases a fork's CLI from one tag. It ships in every copy of
this repository and does nothing until you name your destination. In this repository it ends green with a notice on every run, because the canonical
release goes through `release.yml` and nowhere else.

### Arm the workflow

Set the identity with `--registry` first, as **Set the private package's identity** above
describes. The workflow publishes the CLI, so it refuses a package that is still `private: true`,
one that still carries the canonical name, and one whose `publishConfig.registry` differs from the
registry you name below.

Next, create the `fork-release` environment in the repository's settings, with required
reviewers. It is the run's one approval point: the publish job waits there, and it holds the only
credential the run has. Create it before anything else, and before the first tag, because GitHub
creates an environment that a job names and nobody created, with no protection rules.

Then set the three variables in the repository's Actions settings, and the secret in the
`fork-release` environment:

| Name | Kind | Value |
|---|---|---|
| `STAMITY_FORK_RELEASE` | repository variable | This repository's own `<owner>/<repo>`. Until it names this repository, every run ends green with a notice and nothing else runs, which is what keeps a copy of the file inert. |
| `STAMITY_RELEASE_REGISTRY` | repository variable | The registry's https URL, the one you passed to `--registry`. A value with credentials, a query or a fragment fails the run, which names the variable and never prints the value. |
| `STAMITY_RELEASE_BRANCH` | repository variable, optional | The branch a release tag must be reachable from. The default is `main`. |
| `STAMITY_REGISTRY_TOKEN` | environment secret on `fork-release` | The registry's publish token. GitHub Packages does not need it. |

Put the token in the environment, not in the repository's secrets. A repository secret reaches
every workflow a push starts, so anyone who can push a branch could add a workflow that reads it,
and your reviewers would never see that run. An environment secret reaches only a job that names
the environment, and only after a reviewer approves it.

GitHub Packages takes scoped names only, and it authenticates the per-run `GITHUB_TOKEN`, which
the publish job holds with `packages: write`. The workflow hands that token only to a registry
whose host is exactly GitHub Packages' npm host. Every other host, including one whose name only
starts with it, gets `STAMITY_REGISTRY_TOKEN` instead. On GitHub Packages the scope must also be
this repository's owner, and the gates refuse any other. GitHub's *Working with the npm registry*
page gives that registry's URL.

### Tag a release

Set `version` in `package.json`, commit it on the release branch, and push the tag
`v<version>`. A suffix keeps a fork's releases apart from upstream's, and the tag carries it too:

```sh
git tag v1.14.0-acme.1
git push origin v1.14.0-acme.1
```

A dispatch of the workflow is a rehearsal unless you say otherwise. Its `dry_run` input starts at
true, and a rehearsal runs every gate, builds every artifact, publishes nothing and writes what a
real run would ship into the run summary. It can run from a branch. A real run is a tag push, or a
dispatch from the tag with `dry_run` set to false.

A run has four jobs, split by trust. A real run uses the first three; a rehearsal runs the last
one in place of `publish`:

- **`probe`** reads the three variables. The canonical repository, or a fork that has not named
  itself, ends here, green, with a notice.
- **`gates`** holds no secret and only `contents: read`. It proves the release first: the tag is
  `v` plus `package.json`'s version and is reachable from the release branch (a rehearsal skips
  these two and says so), and the package is not the canonical one, not private, and names the
  variable's registry. A failed proof stops the run with a remedy naming
  `scripts/fork-identity.mjs`. Then it runs the canonical release's ladder, from `npm ci` to the
  tarball smoke, packs the tarball and uploads it, kept for seven days, which is how long the
  approval can wait.
- **`publish`** runs in the `fork-release` environment and checks nothing out. It verifies what
  `gates` uploaded before it acts: the tarball's digest, and its own name, version and registry.
  Then it publishes the tarball to your registry and creates the GitHub release `v<version>`
  carrying the tarball and its `.sha256` file.
- **`dry-run-summary`** holds no permission. It writes what a real run would have published into
  the run summary.

A fork can still hold this repository's `v*` tags: a public fork, a private copy imported with
the earlier `--mirror` recipe, or one whose working clone pushed the tags `git fetch upstream`
brought. A push of one of those runs the workflow, and the name proof refuses it, because that
commit carries the canonical package name.

### Run it again safely

A rerun of the same release publishes nothing twice. The registry step skips a version already
published with this tarball's integrity, and it refuses one published from another tarball; a
published version is never replaced. An existing GitHub release receives only the assets it is
missing, and none it already carries is replaced.

### Know what proves a release

The tarball's checksum and your registry's own authentication. A consumer checks the tarball from
the GitHub release with `sha256sum -c <asset>.sha256`. A fork release carries no npm
provenance, because npm provenance needs a public source repository. It carries no build attestation either. GitHub's attestations for a private
repository need GitHub Enterprise Cloud, and the maintainer's decision of 2026-09-24 leaves them
unbuilt until a company asks for them.

### Consume the release

A developer who installs the CLI from your registry maps your scope to it once, in their own
`.npmrc`, and signs in with the registry's own credential through `npm login` with the same
`--scope` and `--registry`:

```ini
@<scope>:registry=<url>
```

### Know how the workflow reaches your fork

The workflow first shipped with the 1.10.0 upstream release. The upstream lane never pushes a
release that touches `.github/workflows/`, so that update arrives as the
`Upstream <tag> needs a reviewed push` issue. A person reads the workflow diff and pushes it, as
**Turn on the GitHub workflow** below describes. A fork on an earlier release has no release
workflow until that push lands.

## Turn on the GitHub workflow

`.github/workflows/upstream-update.yml` ships in every copy of this repository and does nothing
until you opt in. **Committing `.stamity/upstream.json` is the activation.** The first job probes
for that file. Where there is none it writes a notice, and the run ends green with the jobs after it
skipped. That is this repository's own case, permanently.

The workflow runs on `workflow_dispatch` and on an hourly schedule at minute 17 (`17 * * * *`). The
dispatch takes two inputs: `release`, an optional tag, and `dry_run`, which prepares the update and
publishes nothing: no branch, no pull request, no issue. Change the cron through a reviewed
downstream edit when your policy requires another cadence. Scheduling is best effort, not a
deadline, and an upstream release does not itself trigger this workflow. Two more schedule facts
are the platform's rather than the lane's. Scheduled workflows are **disabled by default in a
fork**. They are also auto-disabled after sixty idle days in a public repository. Enable them, and
expect to re-enable them.

Two jobs follow the probe, split by trust:

- **`prepare`** — `contents: read`, `persist-credentials: false`, and **no secret in its
  environment**. It fetches, merges, regenerates and runs your gates. Every one of those executes
  third-party code out of your dependency tree, which is why the job holds nothing that can push.
  It hands the result forward as an artifact: the two reports, and the update branch as a git
  bundle.
- **`publish`** — `contents: write`, `pull-requests: write`, `issues: write`. It runs only `git` and
  `gh` over that artifact and executes none of your code. It pushes `stamity-upstream/<tag>` when
  the remote branch does not already exist, opens one pull request for it, and applies the
  landing-policy check. It fails the run on `validation-failed`, so the check on that pull request
  is red. On a conflict there is nothing to push, so it opens or updates one issue per release,
  `Upstream <tag> needs conflict resolution`, carrying the report and the local commands.

`prepare` can fetch a public upstream without credentials. The publish-only
`STAMITY_UPSTREAM_TOKEN` does not authenticate a private upstream or mirror during preparation.
Choose an approved source that job can reach without the write secret, or have the platform owner
review a separate authenticated-fetch design before you claim that deployment is supported.

**An update branch that already exists on the remote is preserved.** A later run reports its open
pull request without changing the body, title, labels or branch.

If the push succeeded but pull request creation failed, a retry can create the missing pull request
only after proving the same owned integration. That means a matching release and target, matching
merge parents, a matching non-record tree, and a semantic integration record, with no human
follow-up. A fresh sync may change only the generated manifest's top-level `updatedAt`. Recovery
accepts that one timestamp difference and requires every byte except `updatedAt` to match. It
keeps no copy of the manifest schema. The schema is the engine's, and the engine applied it when
your own regenerate command wrote the manifest, so a key a newer engine admits cannot break
recovery. The one masked value must still be a valid UTC millisecond timestamp, because it is the
only value the comparison never reads. A missing, linked, executable, malformed or noncanonical
changed manifest requires review. Every other generated file
stays part of the exact tree comparison. The recovered pull request names the remote SHA it
retained.

Target movement, human fixups, a wrong base or ambiguous ownership all require manual review and
create nothing. A closed or merged pull request is never reopened or replaced. The
`upstream-publication` artifact retains `publish-result.json` and the prepared and remote record
evidence. The lane finds its own issues by a marker it writes into the body rather than by title
alone. The marker is `<!-- stamity-upstream-lane: <tag> <kind> -->`. Renaming an issue therefore
never produces a second one.

**Automation never pushes a workflow change.** When the release touches anything under
`.github/workflows/`, `publish` pushes nothing at all. It opens or updates one issue,
`Upstream <tag> needs a reviewed push`, carrying the report and the commands that push the update
branch from your own checkout. This is not a token limit to work around. A pushed branch's own
workflow files run on `push` under the pushing identity, so a person reads the workflow diff, pushes
it, and opens the reviewed pull request. Even when the reviewed workflow-change branch is already on
the remote, automatic missing-pull-request recovery stays refused for it. Upstream releases of this
product do touch workflow files, so expect that issue.

A `concurrency` group serialises runs and never cancels one in flight, because a killed `integrate`
leaves state the next run has to reconcile.

### Add the optional token, and what it buys

The workflow needs no token and no App: `publish` falls back to the per-run repository token. The
optional `STAMITY_UPSTREAM_TOKEN` is a fine-grained PAT with Contents: write, Pull requests: write
and Issues: write, and only `publish` reads it. It buys exactly one thing: the pull request's own
CI.

Since 2026-06-11 a pull request created with the repository token does start `pull_request` runs,
but in an approval-required state, where someone clicks "Approve and run" on each. With the secret
they start on their own. The secret also sidesteps the other half of that limit. Opening a pull
request with the repository token needs the repository or organisation setting **"Allow GitHub
Actions to create and approve pull requests"**. Without it, `gh pr create` fails, the branch is
still pushed, and the run says exactly that. Correct the permission or the credential and retry: an
unchanged owned branch can then receive its missing pull request without a branch rewrite.

Store the PAT in the approved Actions secret store, scoped to the downstream repository, with a
named owner, an expiration and a rotation procedure. It reaches `publish` alone. If your
organisation selects a GitHub App instead, its approved integration must mint a short-lived
installation token per run. An expiring installation token saved as a static secret is not a
supported setup. Verify the real required checks on a real bot-created pull request under your own
rules, because a passing preparation report does not prove those platform checks ran.

What the secret does **not** buy is a workflow-touching release. That path is closed by design, as
above, not by permission. Either way your gates already ran in `prepare` and their verdict is
committed on the branch, so the pull request is never the first place the merged tree is tested.

**Any other host.** The lane script is portable. A self-hosted remote or a mirror runs
`node scripts/upstream.mjs integrate` the same way, and no verb asks the host anything. Only the
landing-policy check does not carry over, because it is a GitHub API read. Elsewhere, set the
project's merge-method setting to the option that produces a merge commit rather than a
fast-forward or a squash, and check it by hand. Only the GitHub reading is automated and only it was
verified for this release. Everywhere else the same misconfiguration surfaces as `ancestry-lost`
after the first landing.

The identity step is not portable in that sense, and the boundary is `repository.url`. The
identity script, `scripts/fork-identity.mjs`, resolves the identity through
`scripts/distribution-identity.mjs`, which accepts a URL on the public GitHub host and refuses every
other host before it writes a byte.
A copy on GitHub Enterprise Server, on GitLab or on a bare mirror therefore cannot name its real
remote there. Keep `repository.url` on the public destination you mirror from and hold the other
host as a remote only. The lane and the gates work either way. The identity resolution is the only
part that requires the public host.

### Recover from a failed run

| Condition | Recovery and retained evidence |
| --- | --- |
| Authentication or permission failure | Retain the run and the report. Check repository access, token expiry and SSO, and the effective grants, then retry. A failed remote lookup is never an absent branch. |
| `conflict` or `conflict-pending` | Resolve the named source conflicts in the update worktree, run `continue`, then review and push. |
| `regenerate-failed` or `validation-failed` | Fix the failed command or the failed behaviour, regenerate, and use `continue` or `validate` for the existing state. Preserve the earlier failures. |
| Missing or lost ancestry | Restore the full history, or reconstruct from the known base, and review the landing method. Preserve the original checkout. |
| Workflow files changed | Read the complete diff and the reviewed-push issue, then perform its local push under the approved reviewer identity. No stronger token bypasses the guard. |
| Missing pull request on an unchanged owned branch | Correct the creation failure and retry. Verify one pull request at the original SHA, with no rewrite. |
| Closed pull request, changed branch, or ambiguous owner | Preserve the state and review it manually. An operator decides whether to reopen the existing pull request or use a separately reviewed recovery branch. |

Assign an operations owner, and connect failed Actions runs to your existing notification
destination. An external monitor has to compare the latest attempted poll and the latest successful
poll against an agreed threshold. Three hours is a reasonable starting threshold for hourly
polling, to review with that owner. A disabled or missed workflow cannot emit its own failure
notification. Test both a controlled failed run and a stale-or-disabled-poll signal in approved
fixtures, and retain proof that the destination received both.

Before you clean up those fixtures, retain:

- the private and non-fork metadata, and the initial and final tags and SHAs;
- the ordinary-file upstream release, the update run, and the pull request with its checks;
- the reviewed merge ancestry and customization;
- the missing-pull-request retry, the unchanged repeat, the separate landing-policy warning, and
  the reviewed workflow-change recovery.

Missing authorization, credentials or a monitoring destination leaves
that exact proof as `Not done:` while independent work continues. Keep private evidence in its
approved private location.

## Know who guarantees what

**The lane guarantees these automatically.** The merge commit carries the upstream release in its
ancestry, or the run does not claim `integrated`. Everything happens on an isolated update branch in
its own worktree, so your integration branch and your working tree are never written. No conflict
marker is ever committed. Every commit reachable from your branch and from the release stays
reachable from the merge commit. Every verb but `validate` is idempotent: run it twice and there is
still one branch, one worktree, one record, one pull request, one issue. `validate` keeps those at
one each too, but every run stamps the record again and commits it, so a second run adds a commit
to the update branch. Where that branch is already pushed, your local branch is then ahead of the
remote one, which the workflow leaves as it is, so the new record reaches it only when you push.

**Your gates decide whether the merged product still behaves.** A clean merge is a statement about
text and nothing more. `Stamity-Upstream-Gates: none` is the lane telling you nobody asked.

**A maintainer decides the three questions no check can answer.** Whether a clean overlap is
semantically right. Whether an override should still apply now that the default behind it moved.
Whether an extension point your fork depends on was quietly retired upstream. The lane surfaces all
three as rows, and none of them is a verdict.

**AI assistance: none required, none used.** No step calls a model. Nothing the lane itself sends
leaves the machine except a `git fetch` of the upstream you configured, plus that platform's own
API through `gh` in the GitHub workflow. Your own `regenerate` and `gates` commands reach whatever
they reach. The recommended list's `npm ci` reaches the npm registry.

## Keep upgrades cheap downstream

These six are for stamity's maintainers, and they are what a fork's upgrade cost is made of.

- **Keep generated trees regenerable and listed.** A generated file that cannot be rebuilt from a
  command is a file every fork hand-merges forever. A new generator moves CONTRIBUTING.md's
  regeneration table and the `generatedPaths` list above with it.
- **Prefer additive changes to prose.** Appending a section conflicts with nothing. Rewriting a
  whole rule conflicts with every fork that touched a line of it.
- **Keep pins derivable.** A count computed from its source cannot conflict with a downstream
  addition. A count typed into a page conflicts with every one of them.
- **Keep `CHANGELOG.md` sections per release.** The lane extracts the `## [<version>]` section at
  the release commit into the report and the pull request body. That is how a fork's reviewer sees
  what they are taking.
- **Tag releases as `v*`.** It is the default `releases.pattern`, and it is what makes "the newest
  stable release" answerable from tag names alone.
- **Document a retired extension point in the changelog.** It is the one class of breakage no
  upgrade gate catches: the merge is clean, the fork's tests may pass, and the feature they hung
  off is gone.

## Where to go next

- [Customization](customization.md) — the override tree and the overlay patches: the boundaries that cost a fork nothing.
- [Working with stamity](working-with-stamity.md) — the touchpoints, for the work either side of an upgrade.
- [Contributing](../CONTRIBUTING.md) — the gate ladder and the regeneration table this configuration mirrors.
