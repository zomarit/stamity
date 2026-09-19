---
title: Enterprise forks
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: a verb or an outcome joins or leaves `scripts/upstream.mjs`, a key joins or leaves
     `.stamity/upstream.json`, the fork layer's layout or precedence changes in `src/content/catalog.ts`,
     or the jobs or the permissions in `.github/workflows/upstream-update.yml` change. `test/docsPages.test.ts`
     holds this page to the hand-page contract. `test/upstream/lane.test.ts` owns the lane's behaviour, and
     the content, emission and validate suites own the fork layer's. A move of CONTRIBUTING.md's
     regeneration table moves the `regenerate` list and the `generatedPaths` list below with it. -->

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
visibility is tied to its network. The private case is a bare clone mirror-pushed into a new, empty
repository. Follow the four steps below in order.

The mirror route gives up every fork feature. There is no "Sync fork", no merge-upstream endpoint,
no pull request back to upstream, and `gh repo sync` refuses with "repository is not fork". None of
that matters to the lane, which is git-native. Two platform facts hold on both routes. Upstream
`release` and `push` events never reach another repository, so a fork learns about a release by
polling or by dispatch. And `gh repo sync` is fast-forward-only, with `--force` meaning a hard
reset, so it is no route for a customized fork.

### Check the prerequisites before you import

Start with approved empty private package and consumer repositories, an integration branch that
permits reviewed merge commits, and named owners for updates and for monitoring. Confirm access to
upstream git releases, npm dependencies, the APM client and its Python dependencies, Actions, and
the runner you selected. Where network policy requires mirrors, configure the approved git, npm and
Python endpoints and the permitted Actions first, then repeat the same fetch, build and install
checks against them. This guide uses APM's private git route; an experimental APM registry is a
separate deployment choice. Official sources and tested clients are recorded in
[the enterprise downstream plan](plans/005-enterprise-downstream-support.md).

Confirm the destination owner's GitHub plan supports the private branch controls you need. Private
rulesets and protected branches need GitHub Pro, Team or Enterprise Cloud. A plan-related `403`
leaves required-check enforcement and landing-policy proof blocked until the owner provides
supported private controls. Keep the repository private. Changing visibility is not a recovery
step.

### Import the history into a private repository

Set the destination to your own approved equivalent of the example below. Keep credentials out of
variables that name repositories and out of git URLs. Disable Actions **before importing any
refs**: historical tags can carry older workflows that lack the current publication guards.

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
gh repo create "$STAMITY_DOWNSTREAM" --private
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .private)" = true
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .fork)" = false
gh api --method PUT "repos/$STAMITY_DOWNSTREAM/actions/permissions" -F enabled=false
STAMITY_PRIVATE_URL="$(gh repo view "$STAMITY_DOWNSTREAM" --json url --jq .url)"
git clone --bare https://github.com/zomarit/stamity stamity-import.git
git -C stamity-import.git push --mirror "$STAMITY_PRIVATE_URL.git"
git clone "$STAMITY_PRIVATE_URL.git" stamity-private
cd stamity-private
git remote add upstream https://github.com/zomarit/stamity
git fetch upstream
STAMITY_BASELINE_TAG='v1.8.0'
git merge-base --is-ancestor "$STAMITY_BASELINE_TAG" HEAD
```

The last command checks the baseline this example imported. Set `STAMITY_BASELINE_TAG` to the
exact upstream tag or SHA your organisation approved, not to whatever the newest release happens
to be. The value above is an example and it ages: a check against a tag your import predates
fails, and that failure is the point of the command. Confirm `origin` points to the private
destination before every initial push. The duplication follows GitHub's own bare-clone procedure,
linked from [the enterprise downstream plan](plans/005-enterprise-downstream-support.md); it
imports branches and tags without the pull-request refs GitHub rejects on push. Keep the bare
import as a backup until the downstream and consumer checks pass. Do not repeat `push --mirror`
after customization. It would replace your downstream refs. Every later update comes through the
upstream lane instead.

### Set the private package's identity

Configure the publisher and the repository through package metadata:

```sh
STAMITY_PUBLISHER="${STAMITY_DOWNSTREAM%%/*}"
npm pkg set "name=@$STAMITY_PUBLISHER/stamity" "stamity.publisher=$STAMITY_PUBLISHER"
npm pkg set "repository.url=git+$STAMITY_PRIVATE_URL.git" "homepage=$STAMITY_PRIVATE_URL"
npm pkg set "bugs.url=$STAMITY_PRIVATE_URL/issues"
npm pkg set private=true --json
npm pkg delete publishConfig
node -e 'const fs=require("fs"),p=require("./package.json");
const slug=p.repository.url.replace(/^git\+|\.git$/g,"").split("/").slice(-2).join("/");
const swap=(f,a,b)=>fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll(a,b));
swap("renovate/plugins.json","zomarit/stamity",slug);
swap("renovate/companion.json","@zomarit/stamity",p.name);'
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
node scripts/generate-plugin-manifests.mjs
node scripts/generate-apm-package.mjs
```

`stamity.publisher` defaults to `zomarit` when it is absent. When you set it, it must be a valid
owner slug that matches `repository.url`. An unsupported key or a mismatched or invalid identity
fails before generation writes anything, and both generators share that validator. Name, version,
description and license keep their existing package fields. `private: true` blocks npm publishing
for this APM-only setup. Deleting the public `publishConfig` makes the destination review explicit.

The `node -e` line moves the two Renovate presets, which carry the identity as data rather than
deriving it: `renovate/plugins.json` names the repository its tag manager watches, and
`renovate/companion.json` names the npm package it pins. Everything else follows your manifest on
its own. The runtime's own remedies (`run: npx <your package> init`) and `scripts/tarball-smoke.mjs`
read `name` from `package.json`, and the four plugin manifests are projected from it. A private
package has no npm channel, so the regenerated marketplace entry carries a `github` source naming
your repository instead of an npm package you never publish.

The release and docs-deployment workflows you inherit also check the running repository's identity
and visibility. Their public publication jobs run only in the public canonical repository. Preserve
those guards when you review an upstream release. Private APM needs its generated tree and a
private git ref. Enterprise npm publishing or docs deployment needs a separate reviewed workflow
and an explicit private destination before you enable it.

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
`test/support/identity.ts`, which answers from your own `package.json`: the name, the publisher and
whether the package is private. So a test asserts the remedy string, the marketplace source or the
Renovate pin that YOUR identity implies, and the inherited gate is green on your tree for the same
reason it is green upstream. Two things are still yours to keep true, and both are data rather than
tests: the identity step above (the manifest and the two Renovate presets), and the branch filters
in the paragraph before this one. Run the regenerate list in the same commit as the rename, because
the generated trees are compared byte for byte and a skipped regeneration reads as drift.

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
| `releases.pattern` | `v*` | Which upstream tags count as releases. |
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
    "node scripts/generate-plugin-manifests.mjs",
    "node scripts/generate-apm-package.mjs",
    "npm run build && node dist/cli.js sync"
  ],
  "generatedPaths": [
    ".apm/**", ".claude/**", "AGENTS.md", "CLAUDE.md", ".stamity/manifest.json",
    ".stamity/generated/**",
    "apm.yml", "plugin.json", ".claude-plugin/**", ".cursor-plugin/**",
    "docs/cli-reference.md", "docs/configuration.md", "docs/reference/**",
    "docs/capability-matrix.md", "llms.txt", "src/pack/catalogPins.ts"
  ],
  "watch": ["content/charter/**", "src/types/core.ts", "src/roster/**", "src/mcp/catalog.ts"],
  "shadows": { "packs/acme/rules/acme-secrets.md": "content/rules/stamity-secrets.md" }
}
```

`remote`, `branch` and `releases` are left at their defaults here. The `regenerate` list is
[the regeneration table in CONTRIBUTING.md](../CONTRIBUTING.md) in command form, and
`generatedPaths` is that table's left column. `npm ci --ignore-scripts` leads the list because the
commands run in a fresh linked worktree that has no `node_modules` of its own.

Keep the two lists in step. A generated path that is not listed is offered to a human as a conflict
nobody should resolve by hand. A listed path that nothing regenerates keeps its conflict markers
and is refused at `continue`.

`watch` is advisory and cheap. The four globs above are where a downstream customization is most
often quietly invalidated: the charter template, the core types, the agent roster and its grants,
and the MCP catalog. `shadows` is the one thing the lane cannot derive for itself. Declare a file
of yours that stands in for a bundled artifact, and a release that moves the artifact behind it is
reported even when the merge is clean.

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
- the drift rows, the tool version and the timestamp.

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
the part that arrived. There is one exemption. An unsigned commit is waived when it exists in the
upstream repository your `.stamity/upstream.json` names — read from the pull request's base branch,
so no pull request can introduce the configuration that exempts it, and only when that `upstream`
names a repository on GitHub, because the question the check asks is a GitHub API read. A commit
the upstream does not have, an upstream on any other host, and a repository that configures no lane
at all each leave every commit needing its own trailer, and the check says which of the three it
applied. A missing upstream sign-off still needs a maintainer's decision, and it
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
own artifact under an id of your own.

**A fork patch can outrun the pack it patches.** The fork layer is package-global and packs are
per-repository. A fork patch addressed at an id only an installed pack supplies is skipped in a
consumer repository that does not carry that pack. `validate` shows a warning row naming the
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
reaches every client location its class reaches for corpus content. The per-client copy is an
adapter-owned, regenerated, reclaimable file, while the source under `fork/` is never planned,
never wrapped in a managed block and never reclaimed.

**A fork skill that replaces a bundled one keeps the bundled spelling.** The directory you author is
bare, `fork/skills/verify/SKILL.md`. Because `verify` is the id the bundled `st-verify` holds, it
projects to every client as `st-verify`, directory and `name` alike. Every call site and every
cross-reference to that skill keeps working. A fork skill whose id nothing bundled holds is an
addition, and it projects under its own bare directory. Either way the directory travels whole:
`SKILL.md` plus the supported companion files beneath it, as UTF-8 text for the CLI and as the
original bytes for APM. APM excludes patch control files from the installed companions. The one
thing a fork skill cannot do is land in a projection directory another skill already occupies under
a different id. That is refused, naming the file to move.

**Your generated reference pages will list your artifacts.** `docs/reference/` is rendered from the
built index. So in a fork, `node scripts/generate-docs.mjs` writes the fork's agents, rules,
commands and skills into those pages and moves their count lines with them. That is what a fork's
own reference should say. This repository's README counts and its corpus census read `content/`
alone, so those do not move.

[The fork-layer spec](specs/fork-layer.md) is the design reference behind all of it: what was
decided, what was dropped, and why.

## Ship your fork through APM

Direct `content/` edits already reach the generated APM package. Fork additions, full replacements
and patches reach it through the same resolved catalog: a replacement appears once with your body,
and a patch preserves the resolved patched body. Run `node scripts/generate-apm-package.mjs` after
authoring, then commit `apm.yml` and `.apm/`. Check for your own expected content in an installed
consumer, because generation alone cannot prove the client discovered it.

| Distribution | Author customization | What consumers receive |
| --- | --- | --- |
| Canonical public APM | Canonical source | Generated rules, commands, agents and skills |
| Public downstream APM | Direct `content/` edits and the fork layer | Those four resolved classes from the downstream ref |
| Independent private APM | The same inputs and explicit identity | Those classes after authenticated private git installation |
| Packaged CLI | Source and engine changes, plus the bundled fork layer | Existing CLI behaviour and supported client emission, with consumer override precedence |

APM delivery depends on the target profile. The tested Claude, Copilot and Cursor profiles deploy
all four classes. Codex deploys agents and skills, with instructions compiled by APM separately.
This package does not deliver stamity's charter, hooks, MCP wiring, engine and runtime, or CLI
behaviour through APM. Editing those sources changes a downstream repository or its packaged CLI,
not the APM projection. Plugin manifests keep their direct `content/` surface; the fork layer is not
projected into plugin installation. Consumer `.stamity/overrides/` precedence belongs to the CLI and
is not read during APM generation.

### Cut a private release

Use your existing private APM and Renovate engine's release convention. Choose a tag that is
distinct from the imported upstream tags and that your version policy accepts. `v1.5.0-acme.1`, for
example, is a prerelease and needs a consumer policy that allows prereleases. Update the package
version, regenerate, run the full gates, review and commit on the integration branch, and only then
tag.

Your update engine also has to order those tags correctly. Native Renovate APM updates use a
coerced version policy by default, which can treat `.1` and `.2` prerelease tags as the same
version. For that manager, merge a rule scoped to this private dependency into your existing
configuration, then prove it offers the second tag:

```json
{
  "packageRules": [{
    "matchManagers": ["apm"],
    "matchPackageNames": ["acme/stamity-private"],
    "versioning": "semver",
    "ignoreUnstable": false
  }]
}
```

If your deployed engine uses another manager, apply that manager's equivalent supported policy, or
choose its supported stable tag convention. Keep the existing engine, and do not infer ordering
from a successful APM install. [The upstream-lane spec](specs/enterprise-upstream-lane.md) records
the dependency contracts behind this prerequisite.

```sh
set -euo pipefail
STAMITY_PRIVATE_TAG='v1.5.0-acme.1'
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .private)" = true
test "$(gh api "repos/$STAMITY_DOWNSTREAM" --jq .fork)" = false
test "$(node -p "require('./package.json').version")" = "${STAMITY_PRIVATE_TAG#v}"
node scripts/generate-apm-package.mjs --check
test -z "$(git status --porcelain)"
git tag "$STAMITY_PRIVATE_TAG"
git push origin "$STAMITY_PRIVATE_TAG"
```

The private git tag is enough for APM on its own. If your engine consumes GitHub Release objects,
add one on that same private repository with its reviewed notes:
`gh release create "$STAMITY_PRIVATE_TAG" --repo "$STAMITY_DOWNSTREAM" --verify-tag`. Check the
actual visibility immediately before you release. These releases stay separate from the canonical
project's public npm, APM and docs release.

### Install it in a consumer repository

The consumer names the private ref in `apm.yml` in the same form as a public dependency. Declare
the intended supported clients in `targets` as well; this example selects Claude. Native Renovate
APM runs plain `apm install` to refresh the lock and the deployed files. A manual `--target` flag is
not remembered for that run, and several detected clients with no manifest targets can fail a
noninteractive installation. List every intended client explicitly. Write `[claude, copilot]` when
both are required.

```yaml
targets: [claude]
dependencies:
  apm:
    - acme/stamity-private#v1.5.0-acme.1
```

Use apm-cli **0.29.1 or newer**; **0.30.0** is the current tested client. Supply an approved read
credential through your secret manager as `GITHUB_APM_PAT_ACME` for this example owner, or as
`GITHUB_APM_PAT`. A per-organisation credential takes precedence over the general APM token, which
in turn precedes `GITHUB_TOKEN` and `GH_TOKEN`. A consumer's Actions token normally cannot read
another private repository: grant the selected credential access explicitly, and complete
organisation SSO authorization where it is needed. Keep the values out of manifests, URLs, command
history, logs and evidence.

```sh
apm install
```

Then read `apm.lock.yaml`. The dependency must be `apm_package` and must resolve to the private
commit you intended. Assert an independently specified customization marker in every expected
installed class, skill directory and name, and companion file. Retain the client version, the source
ref, the resolved SHA and the byte hashes in your approved private evidence location. An
authentication failure is an incomplete installation, even when stale files from an earlier install
remain.

After the reviewed upstream merge and the second private release, let your existing Renovate engine
open its consumer update pull request. Verify its actual run, the ref it chose, its access, its
checks and the resolved lockfile and installed content. Keep that engine's manager and policy
configuration: a proposed config or a simulated update does not prove the deployed integration. The
distribution owner closes this step with observed evidence.

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

The two generators are not portable in that sense, and the boundary is `repository.url`. Both
`scripts/generate-plugin-manifests.mjs` and `scripts/generate-apm-package.mjs` resolve the identity
through `scripts/distribution-identity.mjs`, which accepts a URL on the public GitHub host and
refuses every other host before it writes a byte. A copy on GitHub Enterprise Server, on GitLab or
on a bare mirror therefore cannot run the regenerate step against its real remote. Two ways
through: keep `repository.url` on the public destination you mirror from and hold the other host as
a remote only, or run the generators against a manifest whose `repository.url` names that public
destination and publish the generated tree from there. The lane, the gates and the APM tree work
either way. The identity resolution is the only part that requires the public host.

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
- the authenticated installed-content assertions;
- the ordinary-file upstream release, the update run, and the pull request with its checks;
- the reviewed merge ancestry and customization;
- the actual Renovate consumer pull request, and the final installation;
- the missing-pull-request retry, the unchanged repeat, the separate landing-policy warning, and
  the reviewed workflow-change recovery.

Missing authorization, credentials, an observed Renovate run or a monitoring destination leaves
that exact proof as `Not done:` while independent work continues. Keep private evidence in its
approved private location.

## Know who guarantees what

**The lane guarantees these automatically.** The merge commit carries the upstream release in its
ancestry, or the run does not claim `integrated`. Everything happens on an isolated update branch in
its own worktree, so your integration branch and your working tree are never written. No conflict
marker is ever committed. Every commit reachable from your branch and from the release stays
reachable from the merge commit. Every verb is idempotent: run it twice and there is still one
branch, one worktree, one record, one pull request, one issue.

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
