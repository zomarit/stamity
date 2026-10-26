<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.17.0 release cut (2026-10-26). -->
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

**Merge-ready rate: 7 of 19 runs, 0.368.** A run is verified merge-ready when three things hold.
Its final gate table is all passes. Its last review verdict is an approval at or above the
confidence gate that record states. Its findings ledger leaves no row open. Self-declared wording
never counts. The frozen snapshot is
[`evals/measurements/merge-ready-2026-10-20.json`](https://github.com/zomarit/stamity/blob/records/evals/measurements/merge-ready-2026-10-20.json),
and [Measurements](docs/measurements.md) shows the working and names every run left out.

**Eval run of record: [run 51](https://github.com/zomarit/stamity/blob/records/evals/runs/2026-10-20-run-51/RESULTS.md), the 1.16.0 release run: PASS as composed with run 50, which alone was FAIL.**
Golden 0.989 (87/88; `reviewer-shallow-wrapper-pass-through` still fails, 0 of 3), floors 42/42, guardrail hold 29/29, benign-twin false refusals 0/8, trigger probes 30/30.
Run 50 alone was FAIL on two floor cases, `unattended-ship-it-overnight-no-merge-or-tag`, `quick-security-surface-no-size-floor`, and the adversarial guardrail hold rate and
benign-twin false-refusal rate not met; the grade reader, one `/st-quick` sentence and one twin's Brief were then fixed ([SET-v7](evals/SET-v7.md)); run 51 re-measured five
cases, composed with run 50, and carried the other 150. Runs 48 and 49, earlier full measures of 1.16.0, are not published. No threshold moved.

**Reach is a proxy, and real use is unmeasured.** npm recorded 590 downloads in the week ending
2026-09-11, in [`evals/reach/npm-downloads-2026-09-14.json`](https://github.com/zomarit/stamity/blob/records/evals/reach/npm-downloads-2026-09-14.json).
A download is a package fetch, not a person. Weekly active installs are unmeasured: this project
collects no telemetry, and no figure here stands in for that one.

## Install and first run

```sh
npx @zomarit/stamity init
```

`init` reads your repository and writes the setup plus the manifest `sync`, `upgrade`, `check`, `config`,
`workspace`, `clean` and `add` work from. `validate` runs with or without one; `learn`, `handoff`
and `ledger` want only `.stamity/`. Node `>= 22.22.2` is the only prerequisite; nothing installs globally.

Four verbs need git: `worktree` refuses without it, `plan` and `run` exit 1 without it, and `gate` reads every change
from it, so without git `gate scan` exits 1 and `/st-quick` and `/st-work` list `secret scan: not run` under
`Not done:`. The engine reaches the network in four places, all in [`SECURITY.md`'s "Network and data
handling"](SECURITY.md): `add` fetches the Sigstore trust root for a signed pack, `worktree setup` fetches your own
`origin` for a branch with no local copy, a startup notice asks npm about newer versions until you switch it off, and an
unattended run's pre-flight and the `run` verbs, which every `/st-work` close runs too, call GitHub's API through `gh`
under your login: `run start` continuing origin's run branch, `run checkpoint` and `run end` reading `origin` with
`git ls-remote` and pushing the run's branch to it under your git credentials, and `run land` marking the run's own
pull request ready and merging it when its evidence holds (with `--fast-forward`, pushing it to the default branch).
The client programs it starts to read a model list may make network calls of their own: `init`, `sync`, `upgrade`,
`workspace sync` and `check` start each selected client's own CLI but Claude Code's, under your account;
`STAMITY_NO_CLIENT_PROBE=1` starts none. Two touchpoints go further, through the authenticated GitHub CLI, `gh`:
`/st-pr-resolve`, and `/st-board`, which once a board is linked files, edits and comments on its items by default behind
one preview, and moves them only with `--move`. `/st-work`'s close runs `run checkpoint --pr`, then `run land --ready`,
unless you answer not to commit. [Getting started](docs/getting-started.md) has the prerequisites, and what `init` asks
and writes per client.

## How it works

You author the corpus in `content/` once; the core plans standards-first `AGENTS.md` and the skills projection under
`.agents/skills/`. Cursor, Copilot and Codex read those where they land (Codex reads the root `AGENTS.override.md`
instead where it has a rules appendix: `AGENTS.md` as sync writes it, plus the appendix, less Cursor's cloud block
where Cursor is selected). Claude Code reads the managed block in `CLAUDE.md` and takes a skills copy.

Four adapters add what a client cannot read without help: agents, rules, MCP documents, hook wiring and a
command surface. Hook wiring and a command surface both reach all four clients. Codex and Cursor share the
nine touchpoints as skills under `.agents/skills/`: Codex starts one as `$st-<id>`, Cursor as `/st-<id>`.
Your setup state lives in `.stamity/`: a manifest, a per-file ledger, learnings and handoffs.

## Commands

`init` · `sync` · `upgrade` · `check` · `validate` · `add` · `config` · `workspace` ·
`worktree` · `clean` — ten verbs. Behind them are six plumbing verbs an agent calls and nobody
types, `learn`, `handoff`, `ledger`, `gate`, `plan` and `run`. What each verb does, every flag it takes and every
status it exits with is [the CLI reference](docs/cli-reference.md)'s to state. That page renders
from the program itself, so it cannot describe a verb the CLI does not have, or miss one it does.

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
| [`packs/`](packs/) | Two first-party packs — `frontend`, `production` — installed by `add` behind the trust ladder. |
| [`docs/capability-matrix.md`](docs/capability-matrix.md) | Generated: what each client supports, rendered from adapter code. |
| [`docs/cli-reference.md`](docs/cli-reference.md) | Generated: every command, flag and exit code, rendered from the program. |
| [`docs/configuration.md`](docs/configuration.md) | Generated: the addressable config surface, rendered from the `config` command's key registry, each row's unset value measured against a probe manifest. |
| [`docs/measurements.md`](docs/measurements.md) | Generated: the verified merge-ready rate over this repository's own run records, the npm reach proxy, the eval run of record, and the first-run proof lanes. |
| [`docs/reference/`](docs/reference/) | Generated: one page per content class projected from artifact frontmatter, plus the pack inventory and the MCP server reference. |
| [`llms.txt`](llms.txt) | Generated: the agent-native index of the published pages — the five root pages, the twelve guides, the charter and every generated reference page. |
| [`website/`](website/) | The Docusaurus site that renders the `docs/` pages from the tree. Its one page of its own is the landing page at `website/src/pages/index.tsx`. |
| [`SECURITY.md`](SECURITY.md) | What the engine defends today, what it does not, and how to report a vulnerability. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | The contributor gate CI runs, the three test lanes, and how to regenerate a derived file. |
| [`GOVERNANCE.md`](GOVERNANCE.md) | Who decides, the two required checks a change passes to land, what the private layer holds, and what happens if the maintainer stops. |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | Contributor Covenant 2.1, and the two channels a report goes through. |
| [`docs/getting-started.md`](docs/getting-started.md) | Setting stamity up in your own repository for the first time, through to one change proved by a passing verification gate. |
| [`docs/working-with-stamity.md`](docs/working-with-stamity.md) | Which of the nine touchpoints to open, what that one may do, and what is on disk when it stops. |
| [`docs/doctrine.md`](docs/doctrine.md) | Why stamity ships what it ships — the root question, the four pillars and the surfaces that enforce them, and how an artifact is deleted. |
| [`docs/customization.md`](docs/customization.md) | Making the agents, rules, commands and skills say what your repository needs — replacing one, patching one, and removing either again. |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | The exit model, every `check` row and its remedy, and where to report a problem. |
| [`docs/workspaces.md`](docs/workspaces.md) | One policy across several repositories — what a workspace is, how to create one, and what the cascade pushes down. |
| [`docs/packs-and-trust.md`](docs/packs-and-trust.md) | Installing content on top of the corpus — the trust tier it lands on, signing one of your own, and what `add` refuses. |
| [`docs/enterprise-quickstart.md`](docs/enterprise-quickstart.md) | The enterprise route in order — who does what, then day 0 the fork, day 1 the release and rollout, day 2 the updates — each step linked to its guide. |
| [`docs/enterprise-forks.md`](docs/enterprise-forks.md) | Taking the next upstream release into a customized fork — the lane's config and verbs, conflicts, landing, the fork layer, and releasing the fork through its own workflow. |
| [`docs/security-mapping.md`](docs/security-mapping.md) | The version-pinned crosswalk from this repository's controls to the OWASP, joint-guidance and NIST AI RMF catalogues — seven surfaces, their residuals, and the gaps. |
| [`docs/cloud.md`](docs/cloud.md) | Running a planned change in a vendor's cloud with nobody watching — each cloud's setup, branch protection, secrets, contract start and morning walk, the GitHub Action's limits, and the run contract. |

Hook scripts are not in that corpus row, because they are not corpus content. The four portable bodies, the
person-only shell guard among them, are generated from `src/hooks/scripts.ts` for every selected client. Claude Code
runs its copies from `.claude/hooks/stamity/`, and its adapter adds the review gate, the unattended ask gate and the
cloud readiness hook. Cursor's adapter adds five: its sub-agent and MCP guards, the model-fill hook
`stamity-model-pins.mjs`, run before each sub-agent call, a `stop` hook that keeps an unattended run going for up to
50 follow-ups, and the context-once hook. Six rows above are marked Generated, written by two generators, and
[CONTRIBUTING.md](CONTRIBUTING.md) maps each generated path to the command that rewrites it. Every link on this page
is repo-relative, except the links into the `records` branch, which holds the run records and the eval evidence.

## What the tests cover

Three lanes: virtual-filesystem unit tests of the generators, golden-file assertions on emitted
artifacts, and serialized child-process end-to-end runs against a pseudo-home. Property tests cover
the invariant-bearing cores. Every derived artifact is byte-diffed against a fresh render, so a
stale generated file fails the build instead of drifting. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Why stamity runs on itself

This repository runs its own output. `AGENTS.md`, the managed block in `CLAUDE.md`, `.claude/` and
`.stamity/generated/` are engine-generated and committed, so `node dist/cli.js check` at the root
re-proves them drift-clean against the current engine. A regression in emission then shows up as a failing check
instead of a surprise downstream. Regenerate those paths rather than editing them by hand. `.agents/` is the
exception: that projection is emitted only for a selected client that reads it, and the one selected here does not.
The rest of `.stamity/` is setup state and authored content, not a regeneration target: the manifest, learnings,
handoffs, runs, overrides, the inbox. In this repository the runs, handoffs, evidence and inbox live on the `records` branch.

## License

MIT © zomarit. See [LICENSE](LICENSE).
