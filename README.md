# stamity 1.9.0 — plugin distribution

Built from https://github.com/zomarit/stamity at commit 719ea79983a2a2024af3eba8b9bce7928ba24308 (2026-09-23T01:16:44+02:00).

This tree is FOUR things at once, and they describe one corpus at one version:

- four plugin roots, `claude/`, `cursor/`, `copilot/`, `codex/`, one per client;
- a complete APM package — `apm.yml` plus `.apm/` at this root;
- four marketplace catalogs, one per client, each in its own vendor's shape;
- one archive plus one `.sha256` per root, and `release.json` describing all of it.

Verify before you install anything:

```sh
sha256sum -c stamity-plugin-<client>-1.9.0.zip.sha256
```

## APM

```sh
apm install zomarit/stamity#plugins/v1.9.0
```

The install spec is also in `release.json` as `apm.installSpec`. Renovate's native `apm`
manager bumps it, and `renovate/plugins.json` in the source repository bumps the `ref` field of
the catalogs below through its regex manager.

## Claude Code

Root: `claude/` · archive: `stamity-plugin-claude-1.9.0.zip` (`stamity-plugin-claude-1.9.0.zip.sha256`) · catalog: `.claude-plugin/marketplace.json`

### Install

```sh
claude plugin marketplace add zomarit/stamity#plugin-dist
claude plugin install stamity@stamity --scope project
```

### Pin

```sh
claude plugin marketplace add zomarit/stamity#plugins/v1.9.0
```

### Update

```sh
claude plugin update stamity@stamity --scope project
```

### Roll back

```sh
claude plugin marketplace add zomarit/stamity#plugins/v<previous>
claude plugin install stamity@stamity --scope project
claude plugin update stamity@stamity --scope project
```

A `rollback` subcommand is settled absent — `claude plugin rollback stamity` answers `error: unknown command 'rollback'` on 2.1.278, and the vendor pages read 2026-09-21 name none — so the route back is the marketplace re-added at the previous tag, the reinstall, and then `plugin update` at the same scope: the first two are the documented route and leave the recorded version where it was, and the third is what moves it (measured 2026-09-22).

## Cursor

Root: `cursor/` · archive: `stamity-plugin-cursor-1.9.0.zip` (`stamity-plugin-cursor-1.9.0.zip.sha256`) · catalog: `.cursor-plugin/marketplace.json`

### Install

```sh
# Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace, pointed at your
# mirror of this tree. For a local trial of this root with no marketplace at all:
agent --plugin-dir ./cursor
```

### Pin

```sh
git push <mirror> plugins/v1.9.0^{commit}:refs/heads/plugin-dist
```

### Update

```sh
# the re-index runs at most once every 10 minutes, batching rapid pushes
```

### Roll back

```sh
git push --force <mirror> plugins/v<previous>^{commit}:refs/heads/plugin-dist
```

Cursor documents no plugin install, update, rollback or uninstall subcommand. A team marketplace is added through Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace, and it tracks a repository branch — so the version an organization serves is whichever commit its mirror branch points at, and pinning and rolling back are branch moves. The command above is the local trial of this root without a marketplace.

## GitHub Copilot CLI

Root: `copilot/` · archive: `stamity-plugin-copilot-1.9.0.zip` (`stamity-plugin-copilot-1.9.0.zip.sha256`) · catalog: `.github/plugin/marketplace.json`

### Install

```sh
npm install -g @github/copilot
copilot plugin marketplace add zomarit/stamity#plugin-dist
copilot plugin install stamity@stamity
```

### Pin

```sh
copilot plugin marketplace add zomarit/stamity#plugins/v1.9.0
```

### Update

```sh
copilot plugin update stamity
```

### Roll back

```sh
copilot plugin uninstall stamity
copilot plugin marketplace add zomarit/stamity#plugins/v<previous>
copilot plugin install stamity@stamity
```

Installed plugins are cached: a local plugin has to be reinstalled to pick up a change, and `COPILOT_AUTO_UPDATE=false` turns off the CLI's own updates.

## Codex

Root: `codex/` · archive: `stamity-plugin-codex-1.9.0.zip` (`stamity-plugin-codex-1.9.0.zip.sha256`) · catalog: `.agents/plugins/marketplace.json`

### Install

```sh
codex plugin marketplace add zomarit/stamity --ref plugin-dist
codex plugin add stamity@stamity
```

### Pin

```sh
codex plugin marketplace add zomarit/stamity --ref plugins/v1.9.0
```

### Update

```sh
codex plugin marketplace upgrade
```

### Roll back

```sh
codex plugin remove stamity@stamity
codex plugin marketplace remove stamity
codex plugin marketplace add zomarit/stamity --ref plugins/v<previous>
codex plugin add stamity@stamity
```

An entry in a marketplace file installs nothing on its own — the two install commands above are both needed, and the same `plugin add` closes the rollback because `plugin remove` purges the local cache. The marketplace is removed before it is re-added at the previous tag: `codex plugin marketplace --help` on 0.155.1 (read 2026-09-22) lists `remove`, and the walk measured only a local marketplace re-added in place ("already added"), so the re-point of a git marketplace already on record is unmeasured and removing it first is the route this page can stand behind. Plugin hooks additionally need `features.hooks = true`, project trust, and a per-hook trust review before any of them runs.

## Two bounds a mirror has to know

1. **`git-subdir` sources are https-only.** `scripts/distribution-identity.mjs` calls the kind
   host-neutral and it is — any host, not any protocol. An `ssh://` or `git@` remote is refused
   when the configuration is resolved, so a mirror has to expose an https URL (a read token in
   the URL is refused too: authentication belongs to the fetching client, never to a published
   catalog).
2. **A tag is the only pin a catalog carries by itself.** The catalogs here name `plugins/v1.9.0`, and
   `release.json`'s `distribution.commit` is `null` until the tree is pushed, after which the
   release's own copy of the manifest carries the commit and each git-backed catalog entry gains
   a `sha` beside its `ref`.

## The private mirror route

An organization that cannot fetch from the public repository mirrors this tree instead of
re-deriving it:

```sh
git init dist && cd dist && git switch --orphan plugin-dist
cp -R <this tree>/. . && git add -A -f && git commit -m 'plugins: v1.9.0'
git tag plugins/v1.9.0
git push <your remote> plugin-dist plugins/v1.9.0
```

`-f` is load-bearing, not tidiness: a dependency inside the bundled runtime may ship a
`.gitignore` of its own, and without `-f` those files are staged by nobody — a mirror that
quietly lost files is worse than a push that failed. The release workflow that publishes this
tree stages it with the same flag for the same reason.

Then point `stamity.distribution.sources.<client>` in your fork's `package.json` at that remote
and rebuild the catalogs: every `source` object above is projected from that block, so nothing
else in the tree changes. `docs/enterprise-forks.md` in the source repository carries the fork
layer this assumes.
