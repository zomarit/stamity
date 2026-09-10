---
title: Enterprise forks
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 0f7b0e9. -->
<!-- Re-open when: a verb or an outcome joins or leaves `scripts/upstream.mjs`, a key joins or leaves
     `.stamity/upstream.json`, the fork layer's layout or precedence changes (`src/content/catalog.ts`),
     the job split or the permissions in `.github/workflows/upstream-update.yml` change, or
     CONTRIBUTING.md's regeneration table moves. `test/docsPages.test.ts` holds this page to the
     hand-page contract, and `test/upstream/lane.test.ts` owns the lane's behaviour below, and the
     fork layer's is owned by the content, emission and validate suites. -->

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
`git` 2.24 or newer, nothing imported from `src/`.

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
visibility is tied to its network — so the private case is a bare clone mirror-pushed into a
new, empty repository. Follow the ordered private onboarding below: Actions must be disabled
before importing historical refs, then reviewed before enabling the downstream workflows.

Clone that normally and work in it. The mirror route gives up every fork feature — no "Sync
fork", no merge-upstream endpoint, no pull request back to upstream, `gh repo sync` refusing with
"repository is not fork" — and none of it matters to the lane, which is why the lane is
git-native. Two platform facts hold either way: upstream `release` and `push` events never reach
another repository, so a fork learns about a release by polling or by dispatch; and `gh repo
sync` is fast-forward-only, its `--force` a hard reset, so it is no route for a customized fork.

### Private onboarding and destinations

Start with approved empty private package and consumer repositories, an integration branch
that permits reviewed merge commits, and owners for updates and monitoring. Confirm access
to upstream git releases, npm dependencies, the APM client and its Python dependencies,
Actions and the selected runner. Where network policy requires mirrors, configure approved
git/npm/Python endpoints and permitted Actions first, then perform the same fetch, build and
install checks against them. This guide uses APM's private git route; an experimental APM
registry is a separate deployment choice. Official sources and tested clients are recorded
in [the implementation plan](plans/005-enterprise-downstream-support.md).

Confirm the destination owner's GitHub plan supports the required private branch controls.
Private rulesets and protected branches on GitHub require GitHub Pro, Team or Enterprise
Cloud. A plan-related `403` leaves required-check enforcement and landing-policy proof
blocked until the owner provides supported private
controls. Keep the repository private; changing visibility is not a recovery step.

Set the destination to your approved example equivalent. Keep credentials out of variables
that name repositories and out of git URLs. Disable Actions **before importing any refs**:
historical tags can carry older workflows without the current publication guards.

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
git merge-base --is-ancestor v1.5.0 HEAD
```

The ancestry command checks the illustrated imported baseline; substitute the exact approved
upstream tag/SHA for another import. Confirm `origin` points to the private destination before
every initial push. The initial duplication follows GitHub's bare-clone procedure, linked
from [the implementation plan](plans/005-enterprise-downstream-support.md). It imports
branches and tags without pull-request refs that GitHub rejects on push.
Keep the bare import backup until downstream and consumer checks pass.
Repeating `push --mirror` after customization would replace downstream refs; subsequent
updates use the upstream lane. Keep Actions disabled until current workflows, identity,
credentials and destinations have been reviewed, including how historical tags are handled.

Configure publisher and repository identity through package metadata:

```sh
STAMITY_PUBLISHER="${STAMITY_DOWNSTREAM%%/*}"
npm pkg set "name=@$STAMITY_PUBLISHER/stamity" "stamity.publisher=$STAMITY_PUBLISHER"
npm pkg set "repository.url=git+$STAMITY_PRIVATE_URL.git" "homepage=$STAMITY_PRIVATE_URL"
npm pkg set "bugs.url=$STAMITY_PRIVATE_URL/issues"
npm pkg set private=true --json
npm pkg delete publishConfig
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
node scripts/generate-plugin-manifests.mjs
node scripts/generate-apm-package.mjs
```

`stamity.publisher` defaults to `zomarit` when absent. When configured, it must be a valid
owner slug matching `repository.url`; unsupported keys or mismatched/invalid identities fail
before generation writes anything. Both generators share this validator. Name, version,
description and license remain their existing package fields. `private: true` blocks npm
publishing for this APM-only setup; removing public `publishConfig` makes the destination
review explicit.

The inherited canonical release and docs deployment workflows additionally check the executing
repository's identity and visibility. Their public publication jobs run only in the public
canonical repository. Preserve those guards during upstream review. Private APM needs its
generated tree and a private git ref; enterprise npm or docs deployment needs a separate
reviewed workflow and explicit private destination before enabling it.

Commit identity, customization and `.stamity/upstream.json`, setting its `branch` to the
intended integration branch. Run the regeneration table and behavior gates before pushing.
Align the downstream CI workflows' `push` and `pull_request` branch filters with that branch,
and match its protection's required check names to the jobs that actually run. Verify those
checks on a real update PR; inherited filters limited to `main` do not cover another branch.
Update the corresponding workflow tests with that deliberate customization: this repository's
`test/ci/workflow.test.ts` asserts the canonical `main` filter exactly. Keep an equally explicit
assertion for the downstream's chosen filters so its full gate still checks the intended policy.
Only then enable the approved CI/upstream/private-release workflows and repository Actions,
after the organization owner verifies the bot permissions and actual required PR checks.
Do not copy canonical branch rules blindly: this integration branch must allow merge ancestry;
existing protections remain in force elsewhere.

### The one precondition, and what to do without it

`status`, `preview` and `integrate` all refuse on a tree that shares no merge base with the
release: outcome `ancestry-missing`, exit 1, no merge attempted, and never
`--allow-unrelated-histories`. Forks arrive there two ways — a tree imported without its history,
or a repository started from a tarball — and there are two recoveries: re-create the repository
from a clone that carries the upstream history and replay your commits on top, or, when you know
the upstream commit your tree was taken at, replay your local changes as one commit onto it.
A shallow clone first runs `git fetch --unshallow origin` against its authorized history
source, then fetches upstream and retries `status`. If no common history exists, preserve
the original checkout and replay reviewed changes onto a fresh full-history clone. Erasing
records or forcing unrelated histories together does not reconstruct the missing base.

## Configuring `.stamity/upstream.json`

The file at the repository root is what enables the lane. `version` (which must be `1`) and
`upstream` are the two required keys; every other has a default, and an unknown key, a
non-object, or a missing or non-`1` `version` is a configuration error (exit 2).

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
    ".stamity/generated/**",
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

## The update loop

```sh
node scripts/upstream.mjs status                  # what is integrated, what is next, what it touches
node scripts/upstream.mjs preview                 # merge in a throwaway worktree, report, abort
node scripts/upstream.mjs integrate               # the newest stable release
node scripts/upstream.mjs integrate --release v1.4.0
```

Without `--release`, the target is the newest release matching the pattern by semantic-version
order; `--prerelease` admits a prerelease suffix. Skipped releases are not skipped work: several
are integrated as **one merge of the newest one**, whose ancestry then covers every release the
newest one contains (a maintenance release cut on a side branch is not covered and stays a
candidate), and the report lists them so a reviewer sees each one. `--offline` reads what the
last fetch brought, `--config <path>` moves the configuration file, `--branch <name>` takes
another branch as the target for any verb — `status` against the update branch itself, or
`integrate` from a runner checkout under another name — and every verb takes `--json` — one
document on stdout and nothing else there, which is how the workflow reads results.

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
| `regenerate-failed` | 1 | A `regenerate` command exited non-zero — the sequence stops at the first one, output captured — or regeneration rewrote a tracked path no `generatedPaths` glob covers, named with the fix (list it). Nothing is staged or committed either way. |
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
generated paths, `integrate` finishes it on its own. And the lane runs the merge and its merge
commit under `rerere` (`-c rerere.enabled=true` per invocation — nothing is written to your git
configuration), so a resolution recorded once in the shared `rr-cache` is replayed the next time
git meets the same conflict.

`continue` refuses while any unmerged index entry remains, or any `<<<<<<<`, `=======` or
`>>>>>>>` marker line remains in a file the merge touched (a bare `=======` counts only beside
another marker — a setext underline alone does not). A marker that survives regeneration is a
defect in your `generatedPaths` list, and is reported as one rather than committed.

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

On GitHub the workflow checks active rulesets across all response pages, repository merge
settings, and classic branch protection. A linear-history requirement or a restriction to
squash/rebase (including a merge queue) produces a warning in the PR and job summary. Classic
protection needs Administration: read; unavailable, 404 or malformed responses are marked
**not fully checked**, while restrictions already observed still produce warnings. Confirm
unreadable settings with the repository administrator; do not broaden the automation token
just to suppress the note. The PR still opens and the landing decision remains yours.

New and recovered PRs use a conventional title (`chore(upstream): integrate <tag>`). Existing
PR titles, bodies and labels remain untouched. Lane-created commits use the configured
committer's DCO sign-off under this repository's contribution policy; the workflow configures
its automation identity. The local placeholder fallback remains available but carries no
DCO sign-off: configure an approved contributor identity and review/sign off the contribution
before submitting it to a DCO-gated repository. Upstream commits retain their original
messages; missing upstream sign-offs need maintainer resolution and do not justify exempting
the update PR from required checks.

When policy forbids merge commits, construct the merge by hand from
the record's upstream commit (git 2.40 or newer), then move your branch onto the result:

```sh
git merge-tree --write-tree --merge-base=<the record's upstream commit> <your branch> <release>
git commit-tree <the tree that printed> -p <your branch> -p <release> -m "Merge upstream release <tag>"
```

## Recovery

- **Back out an attempt.** `node scripts/upstream.mjs abort` aborts the in-progress merge and
  removes the update worktree, deleting the update branch only when it carries no commit beyond
  the target head it was cut from — a branch with any commit on it, the lane's own merge commit
  included, is kept, and the lane says so.
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
| Patch overlay | `.stamity/overrides/<class>/<id>.customize.yaml` or `.customize.md` | None on the merge. The risk is a patch that quietly stops matching what it patches. | The same drift rows, derived rather than declared. Both shadow roots — `.stamity/overrides/` and `fork/` — spell their ids as bare slugs, so the counterpart is whichever corpus spelling EXISTS at your branch's head — the target head the pairs are derived from — rather than the bare name: `rules/secrets.md` pairs with `content/rules/stamity-secrets.md`, and `skills/qa/SKILL.customize.yaml` with `content/skills/st-qa/SKILL.md`. |
| Pack | `packs/<id>/` and its `pack.json` | None while the pack only adds. | Nothing, unless the pack shadows a bundled id — declare that in `shadows` and it is reported like an override. |
| Fork layer | `fork/<class>/<id>.md` and `fork/skills/<id>/SKILL.md` inside the package, with `.customize.yaml` / `.customize.md` siblings for a patch instead of a replacement. | None. Upstream never writes under `fork/`, so no release can conflict with it; a replaced or patched default that moves upstream is drift, not a conflict. | A `shadowed` row per fork file whose bundled counterpart changed, resolved to the prefixed corpus file — `fork/rules/secrets.md` pairs with `content/rules/stamity-secrets.md`. Reads *orphaned* when that counterpart was deleted or renamed. A fork ADDITION has no counterpart, so it derives no pair and the lane says nothing about it. |
| Direct core edit | `src/**`, the roster, the MCP catalog, the hook bodies — and `content/**` for what the fork layer cannot express: the charter template under `content/charter/`, which is not a content class, and an edit to the middle of a bundled body that has to keep tracking upstream, which a whole replacement stops doing and an appended patch cannot state | The real cost. Same lines on both sides: a conflict. Same file, different lines: a clean merge that may still be wrong. | `overlaps`, one row per path both sides changed — *merged cleanly on both sides' edits; semantic review needed* — and one `watched` row per changed path a `watch` glob matches, each with the upstream line delta. |

Those rows are the lane's honest limit: it can say *look here*, and it cannot say *this is fine*.

Adding content downstream also moves this repository's own hand-maintained pins, and an upgrade
conflicts on them by design: the corpus counts in README's `content/` map row — hand-typed, and
held to the catalog's own count by `test/docsPages.test.ts` — and, if your fork adds a guide,
that test's page-roster literals. Expect that conflict, and resolve it by re-deriving the counts
for your fork rather than taking either side whole.

A bundled layer — a directory inside the package that adds and shadows corpus artifacts without
editing `content/` — used to be a non-goal on this page, with a trigger: the first fork reporting
recurring conflicts on content additions. The trigger was pulled, and the layer is the **fork
layer** in the table above: it is what turns the most common core edit into a boundary that costs a
fork nothing. [Authoring in the fork layer](#authoring-in-the-fork-layer) is the whole of it.

## Authoring in the fork layer

`fork/` is a directory inside the package that a fork of this repository fills with its own agents,
rules, commands and skills. It exists for one reason: the most common core edit — our wording of
that rule, our extra agent, that default with our tags — becomes a file upstream never touches, so
what used to be a conflict every release is a file every release merges past.

**The layout** is the override tree's, rooted at the package instead of at a consumer repository:

| Class | Replace it whole | Patch it |
|---|---|---|
| agent | `fork/agents/<id>.md` | `fork/agents/<id>.customize.yaml`, `fork/agents/<id>.customize.md` |
| rule | `fork/rules/<id>.md` | `fork/rules/<id>.customize.yaml`, `fork/rules/<id>.customize.md` |
| command | `fork/commands/<id>.md` | `fork/commands/<id>.customize.yaml`, `fork/commands/<id>.customize.md` |
| skill | `fork/skills/<id>/SKILL.md`, plus the skill's own files | `fork/skills/<id>/SKILL.customize.yaml`, `fork/skills/<id>/SKILL.customize.md` |

In a checkout it is `fork/` beside `content/`; in the package your build publishes it is
`dist/fork` beside `dist/content`, staged by `tsdown.config.mjs` only when the checkout has one and
counted in the corpus half of the size budget. A package with no `fork/` directory indexes, plans
and emits byte-identically to one built before the layer existed — this repository ships none.

**Replace or patch, never both for one id.** A fork file claiming an id the corpus holds replaces
that artifact whole, and the replaced one leaves the index: one identity, one body. A
`.customize.yaml` instead patches the resolved artifact's frontmatter key by key and a
`.customize.md` appends to its body, with the base still flowing from the corpus or the pack that
supplies it — so the patch survives an upstream rewrite of everything it did not name. The two
shapes are mutually exclusive per layer: `fork/rules/testing.md` beside
`fork/rules/testing.customize.md` is refused naming both files, exactly as that pair is refused in a
consumer's override tree.

**Ids are bare slugs.** The corpus spells its own filenames with the prefix the engine mints —
`stamity-` for agents and rules, `st-` for commands and skills — and a fork file wearing that prefix
is refused at index time: *a fork-layer filename carries the engine content prefix, which names the
generated corpus, not the fork's own artifact. Save it under the bare spelling
"security-patterns.md" instead — a bare slug that matches a bundled artifact's id replaces it, prefix
and all.* The same refusal covers a skill directory (`fork/skills/st-qa/`); the engine mints the
prefix onto what it emits, so you never spell it yourself. So `fork/rules/security-patterns.md` is
how you replace `content/rules/stamity-security-patterns.md`, and the bare spelling is what the
drift derivation above resolves back to the prefixed corpus file.

**The precedence chain** any `(class, id)` resolves through is corpus or pack → fork (a full
replacement or a patch) → user (a full replacement or a patch). A consumer of your fork can still
replace or patch what your fork layer put there, because their `.stamity/overrides/` tree sits above
it.

**A pack and the fork layer never share an id.** Whichever of the two arrives first, the pack is the
one refused on contact, with *Packs must not shadow existing content* — the same rule that already
holds between a pack and the corpus, and the same two remedies for whoever meets it: remove the
pack, or ask its author to rename the artifact. From the fork's side there is no reason to reach for
a pack's id at all. To change what a pack supplies, patch it —
`fork/<class>/<id>.customize.yaml`, `fork/<class>/<id>.customize.md` — or ship your own artifact
under an id of your own.

**A fork patch can outrun the pack it patches.** The fork layer is package-global and packs are
per-repository, so a fork patch addressed at an id only an installed pack supplies is skipped in a
consumer repository that does not carry that pack, and `validate` shows a warning row naming the
artifact the patch waits for (the pack itself cannot be named: nothing installed supplies it) —
never an error, because nothing there is wrong. A consumer's own orphan
patch keeps its error: it names an id nothing in that repository supplies, which is almost always a
typo in the filename. And where a consumer's own override has already replaced the id a fork patch
addresses, the patch is reported as inert under that override rather than as applied.

**What `validate` shows.** Every id the layer replaces or patches is a row, marked so a reader can
tell a fork's customization from a consumer's:

```text
shadowing — 1 fork replacement takes a bundled id, 1 fork overlay patches one

  rule security-patterns  fork/rules/security-patterns.md  replaces rules/stamity-security-patterns.md — fork layer
  rule testing  fork/rules/testing.customize.yaml  patches rules/stamity-testing.md (corpus) — fork layer
```

The JSON envelope carries the same rows — a replacement as `winner: "fork"`, a patch as
`layer: "fork"` — and, like every shadowing line, they are information and never move the exit code.
Nothing about the layer relaxes a floor: a fork artifact passes the index-time contract a bundled
one passes, and the merged artifact a fork patch produces goes through the same gate a consumer's
patch does, with the finding addressed to the fork file.

**Fork artifacts are always on for your consumers.** Selection admits one by presence, the way it
admits a consumer's override: a fork ships what it put under `fork/`, and no selection record
deselects it. Each then reaches every client location its class reaches for corpus content, and the
per-client copy is an adapter-owned, regenerated, reclaimable file while the source under `fork/` is
never planned, never wrapped in a managed block and never reclaimed.

**A fork skill that replaces a bundled one keeps the bundled spelling.** The directory you author is
bare — `fork/skills/verify/SKILL.md` — and because `verify` is the id the bundled `st-verify` holds,
it projects to every client as `st-verify`, directory and `name` alike, so every call site and every
cross-reference to that skill keeps working. A fork skill whose id nothing bundled holds is an
addition, and projects under its own bare directory. Either way the directory travels whole:
`SKILL.md` plus supported companion files beneath it (UTF-8 text for the CLI, original bytes
for APM). APM excludes patch control files from installed companions.
What a fork skill cannot do is land in a projection
directory another skill already occupies under a different id — that is refused, naming the file to
move.

**Your generated reference pages will list your artifacts.** `docs/reference/` is rendered from the
built index, so in a fork `node scripts/generate-docs.mjs` writes the fork's agents, rules, commands
and skills into those pages and moves their count lines with them — which is what a fork's own
reference should say. This repository's README counts and its corpus census read `content/` alone,
so those do not move.

[The fork-layer spec](specs/fork-layer.md) is the design reference behind all of it: what was
decided, what was dropped, and why.

## APM authoring, installation and capabilities

Direct `content/` edits already reach the generated APM package. Fork additions, full
replacements and patches reach it through the same resolved catalog: a replacement appears
once with your body, and a patch preserves the resolved patched body. Run
`node scripts/generate-apm-package.mjs` after authoring, then commit `apm.yml` and `.apm/`.
Check independent expected content in an installed consumer; generation alone cannot prove
the client discovered it.

| Distribution | Author customization | What consumers receive |
| --- | --- | --- |
| Canonical public APM | Canonical source | Generated rules, commands, agents and skills |
| Public downstream APM | Direct `content/` edits and the fork layer | Those four resolved classes from the downstream ref |
| Independent private APM | The same inputs and explicit identity | Those classes after authenticated private git installation |
| Packaged CLI | Source/engine changes and bundled fork layer | Existing CLI behavior and supported client emission, with consumer override precedence |

APM delivery depends on its target profile: the tested Claude, Copilot and Cursor profiles
deploy all four classes; Codex deploys agents and skills, with instructions compiled by APM
separately. This package does not deliver Stamity's charter, hooks, MCP wiring, engine/runtime
or CLI behavior through APM. Editing those sources changes a downstream repository or its
packaged CLI, not the APM projection. Plugin manifests retain their direct `content/` surface;
this change does not add fork projection to plugin installation. Consumer
`.stamity/overrides/` precedence belongs to the CLI and is not read during APM generation.

### A private release and authenticated consumer

Use the existing private APM and Renovate engine's release convention. Choose a tag distinct
from imported upstream tags that its version policy accepts: `v1.5.0-acme.1`, for example,
is a prerelease and needs a consumer policy allowing that prerelease. Update package version,
regenerate, run full gates, review and commit on the integration branch before tagging.

The existing update engine must also order those tags correctly. Native Renovate APM updates
use a coerced version policy by default, which can treat `.1` and `.2` prerelease tags as the
same version. For that manager, merge a rule scoped to this private dependency into the
existing configuration, then prove it offers the second tag:

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

If the deployed engine uses another manager, apply its equivalent supported policy or choose
its supported stable tag convention. Keep the existing engine; do not infer ordering from a
successful APM install. The [version-policy source notes](https://github.com/zomarit/stamity/blob/main/docs/specs/enterprise-upstream-lane.md)
record the dependency contracts behind this prerequisite.

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

The private git tag is sufficient for APM. If your existing engine consumes GitHub Release
objects, add one on that same private repository using its reviewed notes and
`gh release create "$STAMITY_PRIVATE_TAG" --repo "$STAMITY_DOWNSTREAM" --verify-tag`.
Check actual visibility immediately before release. These releases remain separate from
canonical Stamity's public npm/APM/docs release.

The consumer names the private ref in `apm.yml` in the same form as a public dependency.
Also declare the intended supported clients in `targets`; this example selects Claude.
Native Renovate APM runs plain `apm install` to refresh the lock and deployed files. A
manual `--target` flag is not remembered for that run, and multiple detected clients without
manifest targets can fail noninteractive installation. List every intended client explicitly
(for example, `[claude, copilot]` when both are required).

```yaml
targets: [claude]
dependencies:
  apm:
    - acme/stamity-private#v1.5.0-acme.1
```

Use apm-cli **0.29.1 or newer**; **0.30.0** is the current tested client. Supply an approved
read credential through the secret manager as `GITHUB_APM_PAT_ACME` for this example owner,
or `GITHUB_APM_PAT`. Per-organization credentials take precedence over the general APM token,
which precedes `GITHUB_TOKEN` and `GH_TOKEN`. A consumer's Actions token normally cannot
read another private repository; explicitly grant the selected credential access and
complete organization SSO authorization where needed. Keep values out of manifests, URLs,
command history, logs and evidence.

```sh
apm install
```

Read `apm.lock.yaml`: the dependency must be `apm_package` and resolve the intended private
commit. Assert an independently specified customization marker in every expected installed
class, skill directory/name and companion file. Retain client version, source ref, resolved
SHA and byte hashes in the approved private evidence location. An authentication failure
is incomplete installation even if stale files from an earlier install remain.

After the reviewed upstream merge and second private release, let the existing Renovate
engine open its consumer update PR. Verify its actual run, chosen ref, access, checks and
resolved lockfile/installed content. Keep that engine's manager and policy configuration;
a proposed config or simulated update does not prove the deployed integration. The
distribution owner closes this step with observed evidence.

## The GitHub workflow

`.github/workflows/upstream-update.yml` ships in every copy of this repository and does nothing
until you opt in. **Activation is committing `.stamity/upstream.json`**: the first job probes for
that file, and where there is none it writes a notice and the run ends green with the jobs after
it skipped — this repository's own case, permanently.

It runs on `workflow_dispatch` (inputs: `release`, an optional tag, and `dry_run`) and an hourly
schedule at minute 17 (`17 * * * *`). Change the cron through a reviewed downstream workflow
edit when policy requires another cadence. Scheduling is best effort, not a deadline, and
upstream releases do not themselves trigger this workflow. Two schedule facts are the
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

The preparation job can fetch the public upstream without credentials. Its publish-only
`STAMITY_UPSTREAM_TOKEN` does not authenticate a private upstream or mirror during preparation.
Choose an approved source reachable by that job without the write secret, or have the platform
owner review a separate authenticated-fetch design before claiming that deployment is supported.

**An update branch that already exists on the remote is preserved.** A later run reports its
open PR without changing its body, title, labels or branch. If the push succeeded but PR
creation failed, retry can create the missing PR only after proving the same owned integration:
matching release/target, merge parents, non-record tree and semantic integration record,
with no human follow-up. A fresh sync may change only the generated manifest's top-level
`updatedAt`: recovery accepts that timestamp difference in canonical schema-1.0.0 manifests,
with valid UTC millisecond timestamps, while requiring every other manifest byte to match.
Missing, linked, executable, malformed or noncanonical changed manifests require review;
other generated files remain part of the exact tree comparison. The recovered PR names that
retained remote SHA. Target movement,
human fixups, wrong base or ambiguous ownership require manual review and create nothing.
A closed or merged PR is never reopened or replaced. The `upstream-publication` artifact
retains `publish-result.json` and the prepared/remote record evidence. The lane finds its own issues by a marker it writes into
the body — `<!-- stamity-upstream-lane: <tag> <kind> -->` — rather than by title alone, so
renaming one does not produce a second.

**Automation never pushes a workflow change.** When the release touches anything under
`.github/workflows/`, `publish` pushes nothing at all and opens or updates one issue,
`Upstream <tag> needs a reviewed push`, carrying the report and the commands that push the update
branch from your own checkout. This is not a token limit to work around: a pushed branch's own
workflow files run on `push` under the pushing identity, so a person reads the workflow diff and
pushes it and opens the reviewed PR. Even if the reviewed workflow-change branch is already
on the remote, automatic missing-PR recovery remains refused for it. Upstream releases of
this product do touch workflow files — expect that issue.

A `concurrency` group serialises runs and never cancels one in flight, because a killed
`integrate` leaves state the next run has to reconcile.

### The optional secret, and the one thing it buys

The workflow needs no token and no App: `publish` falls back to the per-run repository token. The
optional `STAMITY_UPSTREAM_TOKEN` — a fine-grained PAT with Contents: write, Pull
requests: write and Issues: write, read only by `publish` — buys exactly one thing, the pull
request's own CI. Since
2026-06-11 a pull request created with the repository token does start `pull_request` runs, but
in an approval-required state: someone clicks "Approve and run" on each, and with the secret they
start on their own. It also sidesteps the second half of that limit — opening a pull request with
the repository token needs the repository or organisation setting **"Allow GitHub Actions to
create and approve pull requests"**, and without it `gh pr create` fails, the branch is still
pushed, and the run says exactly that. Correct the permission or credential and retry: an
unchanged owned branch can then receive its missing PR without a branch rewrite.

Store the PAT in the approved Actions secret store, scoped to the downstream repository,
with a named owner, expiration and rotation procedure. It reaches `publish` alone. If the
organization selects a GitHub App, its approved integration must mint a short-lived
installation token per run; an expiring installation token saved as a static secret is not
a supported setup. Verify the actual required checks on a real bot-created PR under your
rules. A passing preparation report alone does not prove those platform checks ran.

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

### Failure, monitoring and recovery evidence

| Condition | Recovery and retained evidence |
| --- | --- |
| Authentication/permission failure | Retain the run/report; check repository access, token expiry/SSO and effective grants, then retry. A failed remote lookup is never an absent branch. |
| `conflict` or `conflict-pending` | Resolve named source conflicts in the update worktree, run `continue`, then review and push. |
| `regenerate-failed` or `validation-failed` | Fix the failed command or behavior, regenerate and use `continue` or `validate` for the existing state; preserve earlier failures. |
| Missing/lost ancestry | Restore full history or reconstruct from the known base and review the landing method; preserve the original checkout. |
| Workflow files changed | Read the complete diff and reviewed-push issue, then perform its local push under the approved reviewer identity. No stronger token bypasses the guard. |
| Missing PR on unchanged owned branch | Correct the creation failure and retry; verify one PR at the original SHA without a rewrite. |
| Closed PR, changed branch or ambiguous owner | Preserve state and review manually. An operator decides whether to reopen the existing PR or use a separately reviewed recovery branch. |

Assign an operations owner and connect failed Actions runs to the existing notification
destination. An external monitor must compare the latest attempted/successful poll with an
agreed threshold; three hours for hourly polling is an initial threshold to review with that
owner. A disabled or missed workflow cannot emit its own failure notification. Test a
controlled failed run and a stale/disabled-poll signal in approved fixtures, retaining proof
that the selected destination received both.

Before fixture cleanup, retain private/non-fork metadata, initial/final tags and SHAs,
authenticated installed-content assertions, the ordinary-file upstream release, update run
and PR/checks, reviewed merge ancestry/customization, the actual Renovate consumer PR and
final installation. Capture missing-PR retry, unchanged repeat, the separate landing-policy
warning and reviewed workflow-change recovery. Missing authorization, credentials, observed
Renovate run or monitoring destination leaves that exact proof as `Not done:` while
independent work continues. Keep private evidence in its approved private location.

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

**AI assistance: none required, none used.** No step calls a model, and nothing the lane itself
sends leaves the machine except a `git fetch` of the upstream you configured — your own
`regenerate` and `gates` commands reach whatever they reach (the recommended list's `npm ci`
reaches the npm registry) — plus, in the GitHub workflow, that platform's own API through `gh`.

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
