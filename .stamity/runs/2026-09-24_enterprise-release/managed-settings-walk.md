# E4 — the managed-settings template walked live on Claude Code (REQ-PLUGIN-029), 2026-09-26

Run by the `e4-managed-settings-walk` implementer (plan 010 file 1, the cell as amended on 2026-09-26) in a
throwaway Linux container on the session's Docker Desktop engine (server 29.0.1). The policy was rendered on the
host by `renderClaudeManagedSettings` (`scripts/plugins/managed-settings.mjs` at `fcc4f59e`) for the canonical
identity (`buildCatalogIdentity(package.json, resolveDistributionIdentity(package.json))`) at ref `plugins/v1.9.1`,
the public distribution tag (`plugins/v1.9.1` = `plugin-dist` = `79b4a4e3…` on `ls-remote` the same minute), and
copied into the container. No credential entered the container: no environment variable naming a key or token
(`S2`), no login, no git credential; every fetch was an anonymous clone of the public repository. The host's own
Claude sessions and settings were never touched: the policy existed only at `/etc/claude-code/` inside the
container, and the client ran there as the image's unprivileged `node` user (and a second fresh user `walk5` for
W5), so the policy file was root-owned and not writable by the client's user (`S1`).

Every step below carries its UTC start time, the exit code of the captured command and the sha-256 of the raw
captured output (stdout and stderr together; the first twelve hex digits here, the full digests at the end).
Where a capture is a compound command, the exit is the compound's last command and the client's own exit is
stated in the facts. `<scratch>` is the implementer's session scratch directory on the host, deleted at the end.
Every client command ran with `DISABLE_AUTOUPDATER=1`, so the version measured is the version installed.

## Summary

- **Client measured:** Claude Code **2.1.281** (`claude --version`), npm `@anthropic-ai/claude-code@2.1.281`, on
  Node **v22.23.3**, Debian 12 (bookworm) aarch64, image `node:22-bookworm` =
  `node@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7`; container
  `3c99942bae45…`, created 2026-09-26T15:34:42Z, removed by id at 2026-09-26T15:41:03Z.
- **The policy is honoured at the documented Linux path** `/etc/claude-code/managed-settings.json` on 2.1.281
  (W3, W4, W5 all enforced), unlike the macOS host's `CLAUDE_CODE_MANAGED_SETTINGS_PATH` (ledger `build/17`).
- **W1 — passes only after a first interactive start.** On a fresh user, `claude plugin marketplace list`
  says "No marketplaces configured", `plugin install stamity@stamity` fails with "Plugin "stamity" not found in
  marketplace "stamity"" and `plugin marketplace update stamity` fails with "not found". A headless `claude -p`
  without a login exits at the login check and materializes nothing. The client's background reconcile records
  the declared marketplace when an interactive session starts; after one interactive start (not logged in, past
  onboarding) `marketplace list` names `stamity`, `Source: GitHub (zomarit/stamity@plugins/v1.9.1)`.
- **W2 — passes: the allowlist does not gate the plugin entry's own source.** With the marketplace recorded,
  `claude plugin install stamity@stamity` succeeds and installs 1.9.1 at commit `79b4a4e3…`, although the
  plugin entry's source (`git-subdir`, `https://github.com/zomarit/stamity.git`, path `claude`) is not on the
  allowlist. `strictKnownMarketplaces` gates marketplace sources only; **the renderer needs no edit**. The
  interactive start did not install the plugin by itself: `enabledPlugins` alone left "No plugins installed"
  until the explicit install (logged-in behaviour: not-run, see below).
- **W3 — passes.** `marketplace add anthropics/claude-code` exits 1: "is blocked by enterprise policy. Allowed
  sources: github:zomarit/stamity@plugins/v1.9.1".
- **W4 — passes.** With `requiredMinimumVersion: "99.0.0"`, `claude -p`, `claude plugin list` and an interactive
  start all exit 1 with "Claude Code 2.1.281 is older than the minimum version required by your organization
  (99.0.0)." `claude --version` still answers (exit 0).
- **W5 — passes: a mismatched allowlist `ref` locks the plugin out, for new and existing users.** With the
  allowlist at `plugins/v1.9.0` and the declared source at `plugins/v1.9.1`, a fresh user's interactive start
  records no marketplace, `plugin install` fails, and `marketplace add zomarit/stamity#plugins/v1.9.1` is
  "blocked by enterprise policy"; a user who already had the plugin sees it "✘ failed to load — Marketplace
  'stamity' is not in the allowed marketplace list", and `marketplace update stamity` is blocked.
- **Not run, needs a login:** whether a logged-in interactive session, or a logged-in `claude -p`, installs the
  enabled plugin on its own, and `/status` → Setting sources. Both recorded `not-run`, never as a pass.

## The policies

| File | How it was made | sha-256 |
|---|---|---|
| `managed-settings.json` (W1–W3) | `renderClaudeManagedSettings(identity, { ref: 'plugins/v1.9.1' })`, `JSON.stringify(…, null, 2) + "\n"` — the builder's own serialization | `d2c64c96a3a3…` |
| `managed-settings-w4.json` (W4) | the same call with `minimumVersion: '99.0.0'` (the renderer admits it: at or above the floor) | `0546c144e349…` |
| `managed-settings-w5.json` (W5) | the W1 file with `strictKnownMarketplaces[0].ref` changed to `plugins/v1.9.0`, the declared source left at `plugins/v1.9.1` — the one-key drift `test/ci/managedSettings.test.ts` guards | `e2e6ff638f7d…` |

The rendered W1 file, verbatim:

```json
{
  "extraKnownMarketplaces": {
    "stamity": {
      "source": {
        "source": "github",
        "repo": "zomarit/stamity",
        "ref": "plugins/v1.9.1"
      }
    }
  },
  "enabledPlugins": {
    "stamity@stamity": true
  },
  "strictKnownMarketplaces": [
    {
      "source": "github",
      "repo": "zomarit/stamity",
      "ref": "plugins/v1.9.1"
    }
  ],
  "requiredMinimumVersion": "2.1.277"
}
```

Linux has one documented policy path, so the cell's "second policy directory" for W4 (a shape from the macOS
variable) was walked by replacing the file at `/etc/claude-code/managed-settings.json` with `install -o root -g
root -m 644`, the W1 file kept at `/root/policy-w1.json`; W5 replaced it the same way. Each swap's `sha256sum`
inside the container matched the host digest above.

## The walk

| # | Step | Command | Exit · output sha-256 · facts |
|---|---|---|---|
| S0 | The container and the client | `docker run -d --name stamity-e4-walk node:22-bookworm sleep 7200` · `node --version` · `npm install -g @anthropic-ai/claude-code@2.1.281` · `claude --version` | container `3c99942bae45…` at `2026-09-26T15:34:08Z` · exit 0. `2026-09-26T15:34:58Z` · exit 0 · `195fd0aa0986…` — `v22.23.3`, Linux 6.12.54-linuxkit aarch64, Debian 12. `2026-09-26T15:34:58Z` · exit 0 · `fdc41a435632…` — the install (the exit is the `tail` of its pipe; the next capture proves the install). `2026-09-26T15:35:09Z` · exit 0 · `1e600e5fc887…` — **`2.1.281 (Claude Code)`**, `npm ls -g` `@anthropic-ai/claude-code@2.1.281` |
| C0 | Control: no policy | `claude plugin marketplace list` | `2026-09-26T15:35:17Z` · exit 0 · `5a22273e85bc…` — no `/etc/claude-code`; "No marketplaces configured" |
| S1 | The W1 policy installed as root | `docker cp` · `chown -R root:root /etc/claude-code` · `chmod 644` | `2026-09-26T15:35:18Z` · exit 0 · `1460ee88a809…` — `-rw-r--r-- root root`, `sha256sum` = `d2c64c96a3a3…`, "not-writable-by-node" |
| S2 | No credential in the container | `env \| grep -ciE "anthropic\|claude_code_oauth\|api_key\|token"` | `2026-09-26T15:35:45Z` · exit 0 · `631e9d0d861e…` — count **0** |
| W1 | `marketplace list` on a fresh user under the policy | `claude plugin marketplace list` · `… --json` | `2026-09-26T15:35:21Z` · exit 0 · `5bb42e4fe5d4…` — **"No marketplaces configured"**; `2026-09-26T15:35:22Z` · exit 0 · `37517e5f3dc6…` — `[]` |
| W1 | What a user tries next | `claude plugin install stamity@stamity` · `plugin marketplace list; plugin list; ls ~/.claude` · `claude plugin marketplace update stamity` · `marketplace list` | `2026-09-26T15:35:31Z` · exit 1 · `efc13f17dbc4…` — "Failed to install plugin "stamity@stamity": Plugin "stamity" not found in marketplace "stamity". Your local copy may be out of date — try `claude plugin marketplace update stamity`." `2026-09-26T15:35:31Z` · exit 2 (the `ls`) · `754d0d987454…` — no marketplace, no plugin, no `~/.claude/plugins`. `2026-09-26T15:35:37Z` · exit 1 · `9f917f934ccd…` — "Marketplace 'stamity' not found. Available marketplaces: ". `2026-09-26T15:35:38Z` · exit 0 · `5bb42e4fe5d4…` — unchanged |
| W1 | A headless start, not logged in | `timeout 120 claude -p "say ok"` · `marketplace list` | `2026-09-26T15:35:45Z` · capture exit 0 (the `echo`), **client exit 1** · `3d7d92a9e962…` — "Not logged in · Please run /login". `2026-09-26T15:35:46Z` · exit 0 · `e965a442c849…` — still "No marketplaces configured"; `~/.claude/plugins/marketplaces/` created empty |
| W1 | An interactive start on a pseudo-terminal, first run | `timeout 45 script -qfc claude /dev/null` · `marketplace list` | `2026-09-26T15:36:18Z` · capture exit 0, client ended by the timeout (124) · `68f7f7e6b0d1…` — the client stopped at the first-run theme picker. `2026-09-26T15:37:06Z` · exit 0 · `b3a207c9ec8f…` — still none, no `known_marketplaces.json` |
| W1 | An interactive start past onboarding, not logged in | `~/.claude.json` given `hasCompletedOnboarding: true`, `theme`, and the home folder's trust accepted (no credential) · `timeout 60 script -qfc claude /dev/null` · `marketplace list` | `2026-09-26T15:37:14Z` · capture exit 0, client ended by the timeout (124) · `7cd904db7f0a…` — the session screen "Claude Code v2.1.281 … Not logged in Run /login". **`2026-09-26T15:38:16Z` · exit 0 · `ea32ab11b0e5…` — "Configured marketplaces: ❯ stamity  Source: GitHub (zomarit/stamity@plugins/v1.9.1)"**; `known_marketplaces.json` records the declared source verbatim, `lastUpdated` 15:37:16Z, two seconds into the session |
| W2 | The plugin, before and after an explicit install | `claude plugin list` · `claude plugin install stamity@stamity` · `claude plugin list` | `2026-09-26T15:38:23Z` · exit 0 · `ca5e1b4b0430…` — "No plugins installed"; `installed_plugins.json` empty (the interactive start did not install the enabled plugin). **`2026-09-26T15:38:23Z` · exit 0 · `c52fdf59465a…` — "✔ Successfully installed plugin: stamity@stamity (scope: user)".** `2026-09-26T15:38:31Z` · exit 0 · `4b3aa099e525…` — `stamity@stamity` 1.9.1, "✔ enabled", `gitCommitSha` `79b4a4e31a963f4327cad5f6087e800e3cea2cac` = the tag; the plugin entry's `git-subdir` source was fetched although only the `github` marketplace source is on the allowlist |
| W2 | What the install wrote | `cat ~/.claude/settings.json` | `2026-09-26T15:40:58Z` · exit 0 · `71e663421dff…` — the user settings carry `enabledPlugins: { "stamity@stamity": true }` and nothing else |
| W3 | A marketplace off the allowlist | `claude plugin marketplace add anthropics/claude-code` | **`2026-09-26T15:35:27Z` · exit 1 · `5125c2a479fc…` — "Failed to add marketplace: Marketplace source 'github:anthropics/claude-code' (github.com) is blocked by enterprise policy. Allowed sources: github:zomarit/stamity@plugins/v1.9.1"** |
| W4 | The 99.0.0 floor | `claude -p "say ok"` · `claude plugin list` · `claude --version` · `timeout 30 script -qfec claude /dev/null` | **`2026-09-26T15:38:47Z` · exit 1 · `e7acfa910a2a…` — "Claude Code 2.1.281 is older than the minimum version required by your organization (99.0.0). Update Claude Code using your organization's approved method, then try again. If automatic updates are available, `claude update` may also work."** `2026-09-26T15:38:47Z` · exit 1 · `e7acfa910a2a…` — the same bytes for `plugin list`. `2026-09-26T15:38:47Z` · exit 0 · `2491c978d7f3…` — `--version` still prints `2.1.281 (Claude Code)`. `2026-09-26T15:38:52Z` · capture exit 0, **client exit 1** (`script -e`, before the timeout) · `f2508b6f8631…` — the same message on the terminal |
| W5 | A fresh user under the mismatched allowlist | `useradd -m walk5` · onboarding flag and trust as in W1 · `timeout 60 script -qfc claude /dev/null` · `marketplace list` · `plugin install stamity@stamity` · `marketplace add zomarit/stamity#plugins/v1.9.1` · `plugin list` | `2026-09-26T15:39:11Z` · capture exit 0, client ended by the timeout (124) · `21a1c8e77d7d…` — the session screen, not logged in. `2026-09-26T15:40:13Z` · exit 1 (the `cat`) · `053c020008b5…` — "No marketplaces configured", no `known_marketplaces.json`: the reconcile did not record the declared marketplace. **`2026-09-26T15:40:13Z` · exit 1 · `efc13f17dbc4…` — the install fails, with the same "not found in marketplace" bytes as a fresh user in W1 (no policy named).** **`2026-09-26T15:40:14Z` · exit 1 · `a8a33bf70cd3…` — "Marketplace source 'github:zomarit/stamity@plugins/v1.9.1' (github.com) is blocked by enterprise policy. Allowed sources: github:zomarit/stamity@plugins/v1.9.0".** `2026-09-26T15:40:14Z` · exit 2 (the `ls`) · `8aa39a2fc962…` — "No plugins installed", no cache |
| W5 | The W1–W2 user, already installed, under the mismatched allowlist | `marketplace list` · `plugin list` · `marketplace update stamity` | `2026-09-26T15:40:22Z` · exit 0 · `8052447751b9…` — the recorded marketplace still listed. **`2026-09-26T15:40:22Z` · exit 0 · `09a48735c2b6…` — `stamity@stamity` "✘ failed to load  Error: Marketplace 'stamity' is not in the allowed marketplace list".** `2026-09-26T15:40:22Z` · exit 1 · `bebec5f246fb…` — "Marketplace source 'github:zomarit/stamity@plugins/v1.9.1' is blocked by enterprise policy." |
| — | Not run: a logged-in session | an interactive or `-p` session with a login | **not-run** — needs a login, and no credential may enter the container. Open: whether a logged-in start installs the `enabledPlugins` entry without `claude plugin install`, and `/status` → Setting sources. The unlogged `-p` said "Not logged in · Please run /login" (`3d7d92a9e962…`) |
| — | Cleanup | `docker rm -f 3c99942bae45b5d57e479b51828696ed8cbcbb7d2deca2d8acfb437b3f2ebd02` · `rm -rf <scratch>/walk` | `2026-09-26T15:41:03Z` · exit 0 — `docker ps -a --filter id=3c99942bae45` lists nothing. The pulled `node:22-bookworm` image stays in the engine's cache. The host scratch directory, with the three policy files and the raw captures, was deleted after this record's digests were taken |

## What the client says about itself

Read from the 2.1.281 binary inside the container (strings, not executed), to explain W1 and W4:

- The `strictKnownMarketplaces` schema text: "When set in managed settings, ONLY these sources can be added as
  marketplaces. Entries match exactly, except that a github entry may use the owner-wildcard form" `owner/*`, and
  "Note: this is a policy gate only — it does NOT register marketplaces. To pre-register allowed marketplaces
  for users, also set extraKnownMarketplaces." Consistent with W2 (the plugin entry's source is not gated) and
  W3.
- A declared marketplace "is declared in settings … but not recorded in known_marketplaces.json yet: … the
  background reconcile records it" — the mechanism behind W1: the CLI subcommands read the recorded list, and an
  interactive session's reconcile writes it.
- The version gate skips the top-level commands `update`, `install` and `doctor` (a set in the check), so an
  outdated client can still update itself; `--version` also answered in W4.

## Full output digests (sha-256)

- `S0-node-version` — `195fd0aa098619faceed683fb6dd1ca66d4e1e0789553b99ba8efbea5ccf7089`
- `S0-install` — `fdc41a4356325f61e1b1a3fb4bc98e720ccbb2f06d3930bfb119f4b8939e82c4`
- `S0-claude-version` — `1e600e5fc88773df475f716bcabfbf9537e1bff5052d67fe77b7ff175ef2f76d`
- `C0-marketplace-list-no-policy` — `5a22273e85bc715f87b57bdf7f690d2a09d28d7735733a4ad7d49757f6c1d050`
- `S1-policy-installed` — `1460ee88a8092337deca57db47e9ff143cdbdc2e38426abe7a45132d6393f1e6`
- `S2-no-credential` — `631e9d0d861e22ac68be767799f5034ef5d5908b37c9479758d343284f2725ec`
- `W1-marketplace-list` — `5bb42e4fe5d419d54fa55552cffedfdca43a07b47a31aa9d1f42e17b573c83ac`
- `W1b-marketplace-list-json` — `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`
- `W2a-plugin-install` — `efc13f17dbc40bbe6b2dcc1fc734a3ca4c638816b82ea21072355d2a66806a10`
- `W2a-after-marketplace-list` — `754d0d9874548803cead19154cad87f1ff36acffecdabcc5bae70396fb2fe556`
- `W1c-marketplace-update` — `9f917f934ccd0ce80490e83e07c31b0bbe73f28717628e9412037ee77e387a64`
- `W1d-marketplace-list` — `5bb42e4fe5d419d54fa55552cffedfdca43a07b47a31aa9d1f42e17b573c83ac`
- `W1e-headless-start` — `3d7d92a9e962ae11dcc6532ac291e73dc5b8d2e9cf9d498976bd0ebd0140ac88`
- `W1f-marketplace-list` — `e965a442c849ee8a0bf0e06c6147e9782f4768d90f291200f9cf8243103c1680`
- `W1g-interactive-start-pty` — `68f7f7e6b0d1bf67434a386af11d44aba44078e0baf0cf2046f9bec317db7af0`
- `W1h-marketplace-list` — `b3a207c9ec8f23f3745a07e5fc67811eea53b4273c8a513530a92efe9c8eab03`
- `W1i-interactive-start-onboarded` — `7cd904db7f0a4e7c7f1224453e7aea12f80428169e92c64f17512f6a98b09690`
- `W1j-marketplace-list` — `ea32ab11b0e5148912e5121b246971c7dae778023a4b572c0dcda78f0ddc9dca`
- `W2b-plugin-list-before` — `ca5e1b4b043092d6481ce67609b458f44df4cc3d9bc07e808d4a13a5ad29f4e3`
- `W2c-plugin-install` — `c52fdf59465a23fc7586d4741037c6c259a8cd4663f79fb404ff7881f27121c5`
- `W2d-plugin-list-after` — `4b3aa099e52582b2614c3b9adad04e769c20a515fe069ce2105911715462d96b`
- `S3-user-settings-after-install` — `71e663421dffe36d8cb96558781a0d5fa2da157f4d800fe0de43cbd04d7d3a8b`
- `W3-marketplace-add-off-allowlist` — `5125c2a479fc83e6d260357a517eb94ef69687adcf749d54758f4ecacab2b7ee`
- `W4a-headless-start-min-99` — `e7acfa910a2a0aa111d8277c5ddcec8e0b30fcb3a1685ad94d132eac2d8e32c6`
- `W4b-plugin-list-min-99` — `e7acfa910a2a0aa111d8277c5ddcec8e0b30fcb3a1685ad94d132eac2d8e32c6`
- `W4c-version-min-99` — `2491c978d7f3a31f13518af9ef3c571e294bd7e9a26bc45a753486f9176392c2`
- `W4d-interactive-start-min-99` — `f2508b6f86314b8e9a8f743d431a0fe0291d2d582cec7ddf051601421b999a70`
- `W5a-interactive-start-fresh-user` — `21a1c8e77d7d10dba3b8a6dc880e5a0e90ba7fa847cf0ae569bbeb71971c6c81`
- `W5b-marketplace-list` — `053c020008b563a1175ed5a9c363d5cb994f90ed89cf4d9d3732cc7d855fb32d`
- `W5c-plugin-install` — `efc13f17dbc40bbe6b2dcc1fc734a3ca4c638816b82ea21072355d2a66806a10`
- `W5d-marketplace-add-declared` — `a8a33bf70cd325f17791f92c0e379784ada01ef5346fdf4ede707c902088702d`
- `W5e-plugin-list` — `8aa39a2fc962aa5ba043fa692f7837e4acc85c1df3130bae8fee0b7003834162`
- `W5f-existing-user-marketplace-list` — `8052447751b97747b324ed9195f4312c467da7d66d079cbf7bb1de436a7609ab`
- `W5g-existing-user-plugin-list` — `09a48735c2b60340eee28a6e790c7e12c47e6d44b7715e3740863fb176f108d4`
- `W5h-existing-user-marketplace-update` — `bebec5f246fbd34ab2643866f4ce04b76d3eb26015b21335b0d0253989fb7428`
- policy `managed-settings.json` — `d2c64c96a3a3466980306beb39cb2499022f2ac8a2b5dd9e0b528be6f05f266b`
- policy `managed-settings-w4.json` — `0546c144e349151599ae3a18db50e9e5c6b30aa6a6e76d1a437b256c6a76c0bd`
- policy `managed-settings-w5.json` — `e2e6ff638f7decc9a3869e2faa0446450a852d6ef0399de2c2526bca8fcc1ef1`
