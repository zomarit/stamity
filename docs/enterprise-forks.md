---
title: Enterprise forks
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 45bc35d. -->
<!-- Re-open when: a verb or an outcome joins or leaves `scripts/upstream.mjs`, a key joins or
     leaves `.stamity/upstream.json`, the job split or the permissions in
     `.github/workflows/upstream-update.yml` change, or CONTRIBUTING.md's regeneration table
     moves. `test/docsPages.test.ts` holds this page to the hand-page contract, and
     `test/upstream/lane.test.ts` is the acceptance suite that owns every behaviour below. -->

# Enterprise forks

An organisation that forks this repository, changes something in it — a rule's prose, a default
under `src/`, a generated tree — and then wants the next upstream release without losing that
work needs three answers git does not give on its own: which release is really in this branch, an
integration attempt that cannot damage the branch it integrates into, and a result a reviewer can
act on. That is the upstream lane: one plain-Node script (`scripts/upstream.mjs`), one
configuration file (`.stamity/upstream.json`), and one opt-in GitHub workflow over the script.

It is a repository tool rather than a CLI verb, because it has to run in a tree that is mid-merge,
where `src/` may not compile and `dist/` may be stale. Run it as `node scripts/upstream.mjs
<verb>` or `npm run upstream -- <verb>`, and `help` for the verb and flag list: Node built-ins and
`git` 2.20 or newer, nothing imported from `src/`.

Three things it does not promise. **A conflict-free upgrade for arbitrary edits** — two edits to
the same lines are a conflict, and the lane's job is to report one well, not guess at it.
**Semantic compatibility from a clean textual merge** — that is what your own gates are for, and
the lane runs them. **Anything model-assisted** — no suggestion, no resolution and no summary
comes from a model.

## Getting a fork that carries the history

The lane relies on nothing in the fork network. It needs one property: the upstream's history in
your object store, so a merge base exists.

**A public fork.** Fork the repository and clone it. The upstream commits are already there.

**A private copy.** A private copy of a public repository cannot be a fork at all — a fork's
visibility is tied to its network — so the private case is a mirror clone pushed into a new,
empty repository:

```sh
git clone --mirror https://github.com/zomarit/stamity stamity-mirror.git
cd stamity-mirror.git
git push --mirror <your new empty private repository>
```

Clone that normally and work in it. The mirror route gives up every fork feature — no "Sync
fork", no merge-upstream endpoint, no pull request back to upstream, `gh repo sync` refusing with
"repository is not fork" — and none of it matters to the lane, which is why the lane is
git-native. Two platform facts hold either way: upstream `release` and `push` events never reach
another repository, so a fork learns about a release by polling or by dispatch; and `gh repo
sync` is fast-forward-only, its `--force` a hard reset, so it is no route for a customized fork.

### The one precondition, and what to do without it

`status`, `preview` and `integrate` all refuse on a tree that shares no merge base with the
release: outcome `ancestry-missing`, exit 1, no merge attempted, and never
`--allow-unrelated-histories`. Forks arrive there two ways — a tree imported without its history,
or a repository started from a tarball — and there are two recoveries: re-create the repository
from a clone that carries the upstream history and replay your commits on top, or, when you know
the upstream commit your tree was taken at, replay your local changes as one commit onto it.

## Configuring `.stamity/upstream.json`

The file at the repository root is what enables the lane. `upstream` is the only required key;
every other has a default, and an unknown key, a non-object or a `version` other than 1 is a
configuration error (exit 2).

| Key | Default | What it does |
|---|---|---|
| `version` | — | Must be `1`. |
| `upstream` | required | The clone URL the lane fetches from. |
| `remote` | `upstream` | The remote name. Created with that URL when absent; a remote of that name with a *different* URL refuses the run, naming both, rather than being repointed. |
| `branch` | `main` | Your integration branch — where releases are merged and where ancestry is read from. |
| `releases.pattern` | `v*` | Which upstream tags count as releases. |
| `releases.prerelease` | `false` | Whether a tag carrying a prerelease suffix may be selected. |
| `gates` | empty | `[{ "name": ..., "run": ... }]`, run in order in the update worktree. Empty is reported in words: *no gates configured — a clean merge proves nothing about behaviour*. |
| `regenerate` | empty | Commands that rebuild the generated tree, run in order before the gates. |
| `generatedPaths` | empty | Globs the lane treats as regenerable rather than as merge inputs. |
| `watch` | empty | Globs you want named in the report whenever a release touches them. |
| `shadows` | empty | `{ "<your path>": "<upstream path>" }` — a file of yours that stands in for an upstream one. |

### The values to start from for a fork of this repository

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
    "apm.yml", "plugin.json", ".claude-plugin/**", ".cursor-plugin/**",
    "docs/cli-reference.md", "docs/configuration.md", "docs/reference/**",
    "docs/capability-matrix.md", "llms.txt", "src/pack/catalogPins.ts"
  ],
  "watch": ["content/charter/**", "src/types/core.ts", "src/roster/**", "src/mcp/catalog.ts"],
  "shadows": { "packs/acme/rules/acme-secrets.md": "content/rules/stamity-secrets.md" }
}
```

`remote`, `branch` and `releases` are left at their defaults. The `regenerate` list is [the
regeneration table in CONTRIBUTING.md](../CONTRIBUTING.md) in command form, and `generatedPaths` is
that table's left column; `npm ci --ignore-scripts` leads it because the commands run in a fresh
linked worktree with no `node_modules` of its own. Keep the two lists in step: a generated path
that is not listed is offered to a human as a conflict nobody should resolve by hand, and a listed
path that nothing regenerates keeps its markers and is refused at `continue`.

`watch` is advisory and cheap — those four are where a downstream customization is most often
quietly invalidated: the charter template, the core types, the agent roster and its grants, the
MCP catalog. `shadows` is the one thing the lane cannot derive: a file of yours standing in for a
bundled artifact, declared so a release that moves the artifact behind it is reported even when
the merge is clean.

## The daily loop

```sh
node scripts/upstream.mjs status                  # what is integrated, what is next, what it touches
node scripts/upstream.mjs preview                 # merge in a throwaway worktree, report, abort
node scripts/upstream.mjs integrate               # the newest stable release
node scripts/upstream.mjs integrate --release v1.4.0
```

Without `--release`, the target is the newest release matching the pattern by semantic-version
order; `--prerelease` admits a prerelease suffix. Skipped releases are not skipped work: several
are integrated as **one merge of the newest one**, whose ancestry then covers every release in
between, and the report lists them so a reviewer sees each one. `--offline` reads what the last
fetch brought, `--config <path>` moves the configuration file, `--branch <name>` evaluates
`status` against another branch, and every verb takes `--json` — one document on stdout and
nothing else there, which is how the workflow reads results.

`preview` is the safe one: it merges in a temporary detached worktree, reads the result, then
aborts and removes it. Your working tree, index, stash list and branches are byte-identical
before and after, and a dirty tree is no obstacle.

`integrate` cuts `stamity-upstream/<tag>` from your integration branch's head, checks it out
under `.stamity/upstream-work/<tag>/` (gitignored), merges the release there with
`--no-ff --no-commit`, regenerates, runs your gates, writes the record, and commits with the
message `Merge upstream release <tag> into <branch>` and three trailers —
`Stamity-Upstream-Release: <tag>`, `Stamity-Upstream-Commit: <sha>` and
`Stamity-Upstream-Gates: passed | failed | none | skipped`.

The record beside them is `.stamity/upstream/integrations/<tag>.json`, committed **in the merge
commit itself**: the release and its commit, the merge base, the target head the branch was cut
from, every gate with its command, exit code and duration, the regeneration commands, every
conflicted path with its kind and `resolvedBy` (`human` or `regeneration`), the drift rows, the
tool version and the timestamp. It is evidence, never authority — delete every record and
`status` is still correct, only less detailed, because **history is the marker**.

### Outcomes and exit codes

| Outcome | Exit | What it means |
|---|---|---|
| `up-to-date` | 0 | The selected release is already in the branch's ancestry, with a record that agrees. |
| `update-available` | 0 | A newer release exists. `status` and `preview` say so; nothing was merged. |
| `integrated` | 0 | The merge is committed on the update branch and the gates passed, or none were configured. |
| `conflict` | 1 | The merge stopped. Nothing is committed; the update worktree holds it, and the report names every conflicted path and its kind. |
| `validation-failed` | 1 | The merge is clean and your gates failed. On `status`, also: the release is in the ancestry but its record says the gates failed or were skipped — in history and still not integrated. |
| `regenerate-failed` | 1 | A `regenerate` command exited non-zero. The sequence stops at the first one, output captured. |
| `conflict-pending` | 1 | An update worktree from an earlier run still holds an in-progress merge. Finish it or `abort`; nothing is redone behind your back. |
| `update-branch-stale` | 1 | The update branch was cut from a target head that has since moved. `--recreate` starts over when the branch carries nothing but the lane's own merge commit; otherwise merge your branch into the update worktree by hand. |
| `ancestry-missing` | 1 | No merge base with the release. |
| `ancestry-lost` | 1 | A record claims a release the history does not contain — almost always a squash or rebase landing. |
| — | 2 | No `.stamity/upstream.json` (*this is not a fork*), a configuration or usage error, git missing or below the floor, a remote name clash, a failed fetch. |

## Resolving a conflict

A conflicted `integrate` leaves the merge in progress in `.stamity/upstream-work/<tag>/` and
commits nothing. Work there, not in your own checkout:

```sh
cd .stamity/upstream-work/v1.4.0                  # the conflict list is in the report too
git status                                        # edit, then stage what you resolved
git add <paths>
cd - && node scripts/upstream.mjs continue
```

Two things make this shorter than it looks. **Generated paths are never hand-merged**: a
conflicted path matching `generatedPaths` is not offered to you at all — `continue` runs the
`regenerate` commands and stages the result, resolution by derivation rather than by preference,
and the record marks those paths `resolvedBy: regeneration`. When a merge's *only* conflicts are
generated paths, `integrate` finishes it on its own. And `git rerere` is enabled in the update
worktree, so a resolution recorded once is replayed the next time git meets the same conflict.

`continue` refuses while any unmerged index entry or any `<<<<<<<` / `=======` / `>>>>>>>` marker
line remains in a tracked file. A marker that survives regeneration is a defect in your
`generatedPaths` list, and is reported as one rather than committed.

## Gates are upgrade gates

The lane merges text. Only your own tests can say whether the merged product still does what
your organisation needs, so `gates` is the load-bearing part of the configuration. They run in
the update worktree, in order, after regeneration and before the merge commit, so the commit
carries their verdict; the first failure stops the sequence. `validate` re-runs them on an
existing update branch and commits a fresh record, so a branch fixed by hand turns from
`validation-failed` into `integrated` without rewriting history.

The gate worth writing first asserts a downstream clause is still there — say one your fork added
to `content/charter/stamity-charter.md`:

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

It can rely on `dist/cli.js` because the recommended `regenerate` list built it one step earlier.
A release that rewrites the charter in a file your fork never edited merges perfectly cleanly and
fails this test — which is the point. **A clean textual merge proves nothing about behaviour**,
and a fork with no gates gets `Stamity-Upstream-Gates: none` rather than silence reading as a
pass.

## Landing the update branch

Ancestry is the marker, so only a **merge-commit landing** preserves it. Allow merge commits on
your integration branch, or keep a dedicated one that allows them and land onto your default
branch separately. Squash and rebase both destroy the ancestry, verified rather than assumed:
after either, the release commit is not an ancestor, the lane still reports the release as
pending, and the next merge re-conflicts on lines only the fork touched, because the merge base
regressed to the root. This repository's own `main` ruleset requires linear history and allows
squash and rebase only — exactly the policy a fork must not copy onto its integration branch.

On GitHub the workflow reads the branch's effective rules and, when `required_linear_history` is
set or merge commits are not among the allowed methods, writes a warning into the pull request
body and the job summary naming the setting to change. It still opens the pull request: the
decision is yours. When policy genuinely forbids merge commits, construct the merge by hand from
the record's upstream commit (git 2.40 or newer), then move your branch onto the result:

```sh
git merge-tree --write-tree --merge-base=<the record's upstream commit> <your branch> <release>
git commit-tree <the tree that printed> -p <your branch> -p <release> -m "Merge upstream release <tag>"
```

## Recovery

- **Back out an attempt.** `node scripts/upstream.mjs abort` aborts the in-progress merge and
  removes the update worktree, deleting the update branch only when it carries no commit beyond
  the target head it was cut from — a branch with human commits is kept, and the lane says so.
  Your integration branch is untouched either way, and a second `abort` is a no-op.
- **Back out a landed integration.** `git revert -m 1 <the merge commit>` on the integration
  branch. Git then remembers the merge as reverted, so revert the revert before merging that
  release again — otherwise the second merge brings back nothing.
- **An interrupted run.** A killed process during the merge or the gates leaves the update
  worktree behind; the next `integrate` recognises it and reports `conflict-pending` or
  `update-branch-stale` rather than starting over. Uncommitted changes and untracked files in
  your own checkout are intact, because no verb writes there.

## Customization boundaries, and what each costs

| Boundary | Where it lives | Conflict cost | What the lane reports |
|---|---|---|---|
| Replacement override | `.stamity/overrides/<class>/<id>.md` | None. The file is yours; upstream never writes it. | An override-drift row when the release changes the artifact behind it: *the default behind `<path>` changed in `<tag>`; the override still applies and hides the change — review it*. Reads *orphaned* when the upstream side was deleted, naming the rename target when git found one. |
| Patch overlay | `.stamity/overrides/<class>/<id>.customize.yaml` or `.customize.md` | None on the merge. The risk is a patch that quietly stops matching what it patches. | The same drift rows — those pairs are derived from the override path, so nothing has to be declared. |
| Pack | `packs/<id>/` and its `pack.json` | None while the pack only adds. | Nothing, unless the pack shadows a bundled id — declare that in `shadows` and it is reported like an override. |
| Direct core edit | `content/**`, `src/**`, the roster, the MCP catalog, the hook bodies | The real cost. Same lines on both sides: a conflict. Same file, different lines: a clean merge that may still be wrong. | `overlaps`, one row per path both sides changed — *merged cleanly on both sides' edits; semantic review needed* — and one `watched` row per `watch` glob the release touches, each with the upstream line delta. |

Those rows are the lane's honest limit: it can say *look here*, and it cannot say *this is fine*.

Adding content downstream also moves this repository's own hand-maintained pins, and an upgrade
conflicts on them by design: the corpus counts in README's `content/` map row, and the literals
in `test/docsPages.test.ts` that hold those counts and the page roster. Expect that conflict, and
resolve it by re-deriving the counts for your fork rather than taking either side whole.

A bundled org-overlay layer — a directory inside the package that adds and shadows corpus
artifacts without editing `content/` — would reduce the most common fork edit to zero conflicts.
It is a stated non-goal here: it touches the content catalog's precedence chain and those same
corpus-count pins, so it gets its own spec, and the trigger is the first fork that reports
recurring conflicts on content additions.

## The GitHub workflow

`.github/workflows/upstream-update.yml` ships in every copy of this repository and does nothing
until you opt in. **Activation is committing `.stamity/upstream.json`**: the first job probes for
that file, and where there is none it writes a notice and the run ends green with the jobs after
it skipped — this repository's own case, permanently.

It runs on `workflow_dispatch` (inputs: `release`, an optional tag, and `dry_run`) and on a daily
schedule — enough, since releases are tags, a handful a year. Two schedule facts are the
platform's rather than the lane's: scheduled workflows are **disabled by default in a fork**, and
are auto-disabled after sixty idle days in a public repository. Enable them, and expect to
re-enable them. Two jobs follow the probe, split by trust:

- **`prepare`** — `contents: read`, `persist-credentials: false`, **no secret in its
  environment**. It fetches, merges, regenerates and runs your gates, every one of which executes
  third-party code out of your dependency tree, and hands the result forward as an artifact: the
  two reports and the update branch as a git bundle.
- **`publish`** — `contents: write`, `pull-requests: write`, `issues: write`. It runs only git
  and `gh` over that artifact and executes none of your code. It pushes `stamity-upstream/<tag>`
  when the remote branch does not already exist, opens one pull request for it, applies the
  landing-policy check, and fails the run on `validation-failed` so the check on the pull request
  is red. On a conflict there is nothing to push, so it opens or updates one issue per release,
  `Upstream <tag> needs conflict resolution`, carrying the report and the local commands.

**An update branch that already exists on the remote is reported, never rewritten.** There is no
force flag anywhere in the file, and a later run does not rewrite the open pull request's body
either — it reports the one that is there and stops, because that branch may carry a human's
conflict resolution or a review fixup. The lane finds its own issues by a marker it writes into
the body — `<!-- stamity-upstream-lane: <tag> <kind> -->` — rather than by title alone, so
renaming one does not produce a second.

**Automation never pushes a workflow change.** When the release touches anything under
`.github/workflows/`, `publish` pushes nothing at all and opens or updates one issue,
`Upstream <tag> needs a reviewed push`, carrying the report and the commands that push the update
branch from your own checkout. This is not a token limit to work around: a pushed branch's own
workflow files run on `push` under the pushing identity, so a person reads the workflow diff and
pushes it. Upstream releases of this product do touch workflow files — expect that issue.

A `concurrency` group serialises runs and never cancels one in flight, because a killed
`integrate` leaves state the next run has to reconcile.

### The optional secret, and the one thing it buys

The workflow needs no token and no App: `publish` falls back to the per-run repository token. The
optional `STAMITY_UPSTREAM_TOKEN` — a fine-grained or App token with Contents: write and Pull
requests: write, read only by `publish` — buys exactly one thing, the pull request's own CI. Since
2026-06-11 a pull request created with the repository token does start `pull_request` runs, but
in an approval-required state: someone clicks "Approve and run" on each, and with the secret they
start on their own. It also sidesteps the second half of that limit — opening a pull request with
the repository token needs the repository or organisation setting **"Allow GitHub Actions to
create and approve pull requests"**, and without it `gh pr create` fails, the branch is still
pushed, and the run says exactly that.

What the secret does **not** buy is a workflow-touching release: that path is closed by design,
above, not by permission. Either way your gates already ran in `prepare` and their verdict is
committed on the branch, so the pull request is never the first place the merged tree is tested.

**Any other host.** The script is portable: a self-hosted remote or a mirror runs
`node scripts/upstream.mjs integrate` the same way, and no verb asks the host anything. Only the
landing-policy check does not carry over, being a GitHub API read — elsewhere set the project's
merge-method setting to the option that produces a merge commit rather than a fast-forward or a
squash, and check it by hand. Only the GitHub reading is automated and only it was verified for
this release; everywhere else the same misconfiguration surfaces as `ancestry-lost` after the
first landing.

## What is guaranteed, and by whom

**Automatic.** The merge commit carries the upstream release in its ancestry, or the run does not
claim `integrated`. Everything happens on an isolated update branch in its own worktree; your
integration branch and working tree are never written. No conflict marker is ever committed, and
every commit reachable from your branch and from the release stays reachable from the merge
commit. Every verb is idempotent: run it twice and there is still one branch, one worktree, one
record, one pull request, one issue.

**Your gates decide.** Whether the merged product still behaves. A clean merge is a statement
about text and nothing more; `Stamity-Upstream-Gates: none` is the lane telling you nobody asked.

**A maintainer decides.** Whether a clean overlap is semantically right; whether an override
should still apply now that the default behind it moved; whether an extension point your fork
depends on was quietly retired upstream. The lane surfaces all three as rows — none is a verdict.

**AI assistance: none required, none used.** No step calls a model, and nothing leaves the
machine except a `git fetch` of the upstream you configured — plus, in the GitHub workflow, that
platform's own API through `gh`.

## For stamity maintainers: keeping upgrades cheap downstream

- **Keep generated trees regenerable and listed.** A generated file that cannot be rebuilt from a
  command is a file every fork hand-merges forever; a new generator moves CONTRIBUTING.md's
  regeneration table and the `generatedPaths` list above with it.
- **Prefer additive changes to prose.** Appending a section conflicts with nothing; rewriting a
  whole rule conflicts with every fork that touched a line of it.
- **Keep pins derivable.** A count computed from its source cannot conflict with a downstream
  addition; a count typed into a page conflicts with every one of them.
- **Keep `CHANGELOG.md` sections per release.** The lane extracts the `## [<version>]` section at
  the release commit into the report and the pull request body — that is how a fork's reviewer
  sees what they are taking.
- **Tag releases as `v*`.** The default `releases.pattern`, and what makes "the newest stable
  release" answerable from tag names alone.
- **Document a retired extension point in the changelog.** The one class of breakage no gate
  catches: the merge is clean, the fork's tests may pass, and the feature they hung off is gone.

## Where to go next

- [Customization](customization.md) — the override tree and the overlay patches: the boundaries that cost a fork nothing.
- [Working with stamity](working-with-stamity.md) — the touchpoints, for the work either side of an upgrade.
- [Contributing](../CONTRIBUTING.md) — the gate ladder and the regeneration table this configuration mirrors.
