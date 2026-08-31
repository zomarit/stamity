<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-30). -->
<!-- Re-open when: the corpus counts, the seven-verb command surface, or a client capability
     this page describes changes. `test/docsPages.test.ts` derives all three from the content
     catalog and the generated capability matrix and fails here first. -->

<!-- The banner leads the rendered page and replaces nothing under it: GitHub picks the source by
     the reader's theme, and every other surface — a plain markdown viewer, a text terminal, the
     npm page — falls through to the `img` and its `alt`. Both files are the site's own copies in
     `website/static/img/`, read by repo-relative path so a fork or a clone renders them too. -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="website/static/img/wordmark-dark.svg">
    <img src="website/static/img/wordmark.svg" alt="stamity" width="440">
  </picture>
</p>

# stamity

stamity, by zomarit, is an ESM-only TypeScript CLI that generates agentic coding setups — a
charter, commands, agents, skills, rules, hooks and MCP wiring — for Claude Code, Cursor,
GitHub Copilot and Codex from one canonical source model.

## Install and first run

```sh
npx @zomarit/stamity init
```

`init` reads the repository, asks what it cannot infer, and writes the setup plus a manifest
that every later command works from. Node `>= 22.12` is the only prerequisite: nothing is
installed globally, and the engine contacts no service to do its work. The package is
`@zomarit/stamity` and it installs two names for the same binary — `stamity` and the short
alias `st` — so an installed copy runs as `stamity sync` or `st sync`.

## How it works

The corpus in `content/` is authored once; the emission core plans standards-first output —
`AGENTS.md` and the skills projection under `.agents/skills/` — which Cursor, Copilot and
Codex read where it lands, while Claude Code reaches the charter through a managed import
block in `CLAUDE.md` and takes the skills as a copy. Four adapters add what a client cannot
read without help: agents, rules, MCP documents, and — each on the three clients that have
somewhere to put it — hook wiring and a command surface. The two three-of-four classes are
different clients: Codex has no repository-level command home, so its touchpoints stay the
charter's index, and Copilot takes no hook configuration, so its adapter declares that
rather than emitting one. Setup state lives in `.stamity/`: a manifest, a per-file ledger,
learnings, handoffs.

## Commands

`init` · `sync` · `check` · `validate` · `add` · `config` · `clean` — seven verbs, plus the
hidden `learn` plumbing verb agents call to record a learning through the engine's write
gates. `init` sets a repo up, `sync` regenerates every managed file from the manifest,
`check` diagnoses the environment and fails on drift between disk and what the engine would
write now, `validate` checks the content this repo authored, `add` installs a pack once its
trust gates pass, `config` reads and changes the setup, `clean` removes all of it.

## Working on this repository

```sh
npm install
npm run check
```

`npm run check` chains the leak gate, typecheck (TypeScript 7 native), lint (oxlint plus
ESLint), tests (Vitest), build (tsdown), and the unused-code scan (knip). All of them pass
before a commit.

Two Node floors, and they differ. The published runtime floor is `>= 22.12`, which is what
`package.json` declares and what the CLI needs. The DEV toolchain floor is higher: at 22.12
`npm install` reports `EBADENGINE` for 14 packages, tsdown and ESLint among them, so develop
on Node 22.18 or 24.

```sh
npm run build          # writes dist/cli.js
node dist/cli.js --help
```

Run `init` and `sync` from a scratch repository, not from this root: at the root they
rewrite the committed setup described under [Dogfooding](#dogfooding).

## Map

Each entry below is the one home for its subject. This page links; it does not restate.

| Path | What lives there |
|---|---|
| [`content/`](content/) | The canonical corpus — 1 charter, 9 commands, 10 agents, 8 skills, 12 rules. Authored once, emitted per client. |
| [`packs/`](packs/) | Three first-party packs — `ops`, `product-audit`, `scaffold` — installed by `add` behind the trust ladder. |
| [`docs/capability-matrix.md`](docs/capability-matrix.md) | Generated: what each client supports, rendered from adapter code. |
| [`docs/cli-reference.md`](docs/cli-reference.md) | Generated: every command, flag and exit code, rendered from the program. |
| [`docs/configuration.md`](docs/configuration.md) | Generated: the addressable config surface, rendered from the typed manifest. |
| [`docs/reference/`](docs/reference/) | Generated: one page per content class, projected from artifact frontmatter. |
| [`llms.txt`](llms.txt) | Generated: the agent-native index of every page in this repository. |
| [`plugin.json`](plugin.json) | Generated: the plugin surfaces — this Agent Plugins manifest, [`.claude-plugin/`](.claude-plugin/) and [`.cursor-plugin/`](.cursor-plugin/). |
| [`apm.yml`](apm.yml) | Generated: the APM package manifest, over the [`.apm/`](.apm/) projection of the corpus. |
| [`website/`](website/) | The Docusaurus site that renders the `docs/` pages above. It holds no page of its own. |
| [`SECURITY.md`](SECURITY.md) | What the engine defends today, what it does not, and how to report a vulnerability. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The dev loop, the three test lanes, and how to regenerate derived files. |
| [`GOVERNANCE.md`](GOVERNANCE.md) | Who decides, how a change lands, and what the private layer holds. |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1, and the two channels a report goes through. |
| [`docs/getting-started.md`](docs/getting-started.md) | Prerequisites, what `init` asks and writes per client, and the guided first change. |
| [`docs/packs-and-trust.md`](docs/packs-and-trust.md) | What a pack is, the trust ladder as shipped, and what `add` refuses. |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | The exit model, every `check` row and its remedy, and where to report a problem. |

Hook scripts are absent from that row because they are not corpus content: the three
portable bodies are generated from `src/hooks/scripts.ts` for every selected client, and
Claude Code takes a fourth — the review gate — from its own adapter.

Seven rows above are marked Generated, and they come from four different generators: the
capability matrix from `node scripts/generate-capability-matrix.mjs`; the four docs pages —
`docs/cli-reference.md`, `docs/configuration.md`, `docs/reference/`, `llms.txt` — from
`node scripts/generate-docs.mjs`; the plugin surfaces from
`node scripts/generate-plugin-manifests.mjs`; and the APM package from
`node scripts/generate-apm-package.mjs`. CONTRIBUTING.md's regeneration table is the
one home for that split. Each generator's own suite existence-checks the paths it lists;
this page's test resolves every link target and holds the corpus counts above to what the
content catalog indexes. Every link on this page is repo-relative — the docs are read from
the tree.

## Tests

Three lanes: virtual-filesystem unit tests of the generators, golden-file assertions on
emitted artifacts, and serialized child-process end-to-end runs against a pseudo-home.
Property tests cover the invariant-bearing cores, and every derived artifact is byte-diffed
against a fresh render, so a stale generated file fails the build instead of drifting.
Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Dogfooding

This repository runs its own output. `AGENTS.md`, `.agents/`, `.claude/` and `.stamity/` are
engine-generated and committed, so `node dist/cli.js check` at the root re-proves them
drift-clean against the current engine — the living integration test, and the reason a
regression in emission shows up as a failing check rather than as a surprise downstream.
Regenerate those paths instead of editing them by hand.

## License

MIT © zomarit. See [LICENSE](LICENSE).
