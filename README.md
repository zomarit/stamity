<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: the corpus counts, the nine-verb surface or a client capability changes, or a
     newer measurement supersedes the proof figures. `test/docsPages.test.ts` catches the first
     three; the figures are re-read against `docs/measurements.md` and the run record they cite. -->

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

stamity, by zomarit, is an ESM-only TypeScript CLI that generates agentic coding setups from one
canonical source, for Claude Code, Cursor, GitHub Copilot and Codex. Run one command and you get a
charter, commands, agents, skills, rules, hooks and MCP wiring, shaped for the client that reads it.

## What this repository can prove

Every figure below comes from a committed artifact, so you can check it instead of believing it.

**Merge-ready rate: 5 of 7 runs, 0.714.** A run is verified merge-ready when three things hold.
Its final gate table is all passes. Its last review verdict is an approval at or above the
confidence gate that record states. Its findings ledger leaves no row open. Self-declared wording
never counts. The frozen snapshot is
[`evals/measurements/merge-ready-2026-09-15.json`](evals/measurements/merge-ready-2026-09-15.json),
and [Measurements](docs/measurements.md) shows the working and names every run left out.

**Eval run of record: [run 30](evals/runs/2026-09-15-run-30/RESULTS.md), the 1.8.0 release run.**
Golden rubric pass rate 1.000 (50/50), with every floor case passing at 23/23. Adversarial
guardrail hold 1.000 (15/15). Benign-twin false-refusal 0.000 (0/4). Trigger-probe accuracy 1.000
(30/30). The run is composed under the set's incremental rule. One full baseline runs per release,
and a later run re-measures only the cases whose inputs moved, carrying the rest with provenance.

**Reach is a proxy, and real use is unmeasured.** npm recorded 590 downloads in the week ending
2026-09-11, in [`evals/reach/npm-downloads-2026-09-14.json`](evals/reach/npm-downloads-2026-09-14.json).
A download is a package fetch, not a person. Weekly active installs are unmeasured: this project
collects no telemetry, and no figure here stands in for that one.

## Install and first run

```sh
npx @zomarit/stamity init
```

`init` reads your repository, asks what it cannot infer, and writes the setup plus a manifest every
later verb works from. Node `>= 22.22.2` is the only prerequisite, and nothing is installed
globally. The package is `@zomarit/stamity`, and its one binary answers to `stamity` and to `st`.

Git is optional for every verb but `worktree`, which needs a `git` binary on PATH and refuses
without one. Three things reach the network, all documented in [`SECURITY.md`](SECURITY.md). `add`
fetches the Sigstore trust root when it installs a signed pack. `worktree setup` fetches your own
`origin` remote when it needs a branch with no local copy. A startup notice asks npm about newer
versions until you switch it off. Two touchpoints go further, because `/st-board` and
`/st-pr-resolve` call the authenticated GitHub CLI, `gh`. [Getting started](docs/getting-started.md)
has the prerequisites in full, what `init` asks and writes per client, and a second install route
that needs no npm.

## How it works

You author the corpus in `content/` once. The emission core plans standards-first output:
`AGENTS.md`, plus the skills projection under `.agents/skills/`. Cursor, Copilot and Codex read
that where it lands. Claude Code reaches the charter through the managed block in `CLAUDE.md`, and
takes the skills as a copy.

Four adapters add what a client cannot read without help: agents, rules, MCP documents, hook wiring
and a command surface. Hook wiring reaches all four clients. A command surface reaches three of
them: Codex has no repository-level command home, so its touchpoints stay the charter's index.
Your setup state lives in `.stamity/`: a manifest, a per-file ledger, learnings and handoffs.

## Commands

`init` · `sync` · `check` · `validate` · `add` · `config` · `workspace` · `worktree` ·
`clean` — nine verbs. Behind them are two plumbing verbs an agent calls and nobody types,
`learn` and `handoff`. What each verb does, every flag it takes and every status it exits with is
[the CLI reference](docs/cli-reference.md)'s to state. That page renders from the program itself,
so it cannot describe a verb the CLI does not have, or miss one it does.

## Working on this repository

```sh
npm install
npm run check
npm run build          # writes dist/cli.js
node dist/cli.js --help
```

`npm run check` chains the leak gate, typecheck (TypeScript 7 native), lint (oxlint plus ESLint),
tests (Vitest), build (tsdown), and the unused-code scan (knip). All of it passes before a commit.
Develop on the published runtime floor, Node 22.22.2 or 24. The dev toolchain asks for less, so
`package.json`'s `>= 22.22.2` is the floor that binds.

Run `init` and `sync` from a scratch repository, never from this root. At the root they rewrite the
committed setup described under [Why stamity runs on itself](#why-stamity-runs-on-itself).

## Where everything lives

Each entry below is the one home for its subject. This page links; it does not restate.

| Path | What lives there |
|---|---|
| [`content/`](content/) | The canonical corpus — 1 charter, 9 commands, 10 agents, 8 skills, 12 rules. Authored once, emitted per client. |
| [`packs/`](packs/) | Three first-party packs — `ops`, `product-audit`, `scaffold` — installed by `add` behind the trust ladder. |
| [`docs/capability-matrix.md`](docs/capability-matrix.md) | Generated: what each client supports, rendered from adapter code. |
| [`docs/cli-reference.md`](docs/cli-reference.md) | Generated: every command, flag and exit code, rendered from the program. |
| [`docs/configuration.md`](docs/configuration.md) | Generated: the addressable config surface, rendered from the `config` command's key registry, each row's unset value measured against a probe manifest. |
| [`docs/measurements.md`](docs/measurements.md) | Generated: the verified merge-ready rate over this repository's own run records, the npm reach proxy, the eval run of record, and the first-run proof lanes. |
| [`docs/reference/`](docs/reference/) | Generated: one page per content class projected from artifact frontmatter, plus the pack inventory and the MCP server reference. |
| [`llms.txt`](llms.txt) | Generated: the agent-native index of the published pages — the five root pages, the ten guides, the charter and every generated reference page. |
| [`plugin.json`](plugin.json) | Generated: the plugin surfaces — this Agent Plugins manifest, [`.claude-plugin/`](.claude-plugin/) and [`.cursor-plugin/`](.cursor-plugin/). |
| [`apm.yml`](apm.yml) | Generated: the APM package manifest, over the [`.apm/`](.apm/) projection of the corpus, served from this repository. |
| [`website/`](website/) | The Docusaurus site that renders the `docs/` pages from the tree. Its one page of its own is the landing page at `website/src/pages/index.tsx`. |
| [`SECURITY.md`](SECURITY.md) | What the engine defends today, what it does not, and how to report a vulnerability. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The dev loop, the three test lanes, and how to regenerate derived files. |
| [`GOVERNANCE.md`](GOVERNANCE.md) | Who decides, how a change lands, and what the private layer holds. |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1, and the two channels a report goes through. |
| [`docs/getting-started.md`](docs/getting-started.md) | Prerequisites, what `init` asks and writes per client, and the guided first change. |
| [`docs/working-with-stamity.md`](docs/working-with-stamity.md) | The nine touchpoints as one workflow — which to open, what each writes, and how to run two changes at once. |
| [`docs/doctrine.md`](docs/doctrine.md) | The root question every artifact answers, the four pillars and the surfaces that enforce them, and how an artifact is deleted. |
| [`docs/customization.md`](docs/customization.md) | Where an override lives per class, the two authoring paths and the one save gate, shadowing, and what a skill override carries. |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | The exit model, every `check` row and its remedy, and where to report a problem. |
| [`docs/workspaces.md`](docs/workspaces.md) | One policy across several repositories — the manifest, the init offer, the status rows, and the cascade. |
| [`docs/packs-and-trust.md`](docs/packs-and-trust.md) | What a pack is, the trust ladder as shipped, and what `add` refuses. |
| [`docs/enterprise-forks.md`](docs/enterprise-forks.md) | Taking upstream releases into a customized fork — the config, the verbs, conflicts, the `fork/` layer, the gates that decide, and the opt-in workflow. |
| [`docs/security-mapping.md`](docs/security-mapping.md) | The version-pinned crosswalk from this repository's controls to the OWASP, joint-guidance and NIST AI RMF catalogues — seven surfaces, their residuals, and the gaps. |

Hook scripts are not in that corpus row, because they are not corpus content. The three portable
bodies are generated from `src/hooks/scripts.ts` for every selected client, and Claude Code takes a
fourth, the review gate, from its own adapter. Eight rows above are marked Generated, written by
four generators, and [CONTRIBUTING.md](CONTRIBUTING.md) maps each generated path to the command
that rewrites it. Every link on this page is repo-relative, so the docs are read from the tree.

## What the tests cover

Three lanes: virtual-filesystem unit tests of the generators, golden-file assertions on emitted
artifacts, and serialized child-process end-to-end runs against a pseudo-home. Property tests cover
the invariant-bearing cores. Every derived artifact is byte-diffed against a fresh render, so a
stale generated file fails the build instead of drifting. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Why stamity runs on itself

This repository runs its own output. `AGENTS.md`, the managed block in `CLAUDE.md`, `.claude/` and
`.stamity/generated/` are engine-generated and committed, so `node dist/cli.js check` at the root
re-proves them drift-clean against the current engine. A regression in emission then shows up as a
failing check instead of a surprise downstream. Regenerate those paths rather than editing them by
hand. `.agents/` is the exception: that projection is emitted only for a selected client that reads
it, and the one selected here does not. The rest of `.stamity/` is setup state and authored
content, not a regeneration target: the manifest, learnings, handoffs, runs, overrides, the inbox.

## License

MIT © zomarit. See [LICENSE](LICENSE).
