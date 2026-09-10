# Run record — the 1.5.0 release: the fork layer, cut lean the same day (2026-09-10)

The follow-up the 1.4.0 release deferred and the maintainer pulled forward the same morning ("of course it
has to be done"): the fork layer, built as pull request #29 on the maintainer's direction, reviewed, fixed,
attested and merged at `b801fe5`, then cut as 1.5.0 without a new eval run on the maintainer's choice through
the question tool ("Lean release now") — the corpus under test is byte-identical to what run 10 measured this
morning. The spec is `docs/specs/fork-layer.md`; the plan of record is the 1.4.0 plan's non-goal paragraph turned
into a trigger the maintainer pulled; the findings ledger is `ledger.jsonl` beside this file. Builders at
`claude-fable-5-1` (engine, fix round) and `claude-opus-5` (lane, docs); reviewer and attestor at
`claude-fable-5-1`.

## Outcome

**Cut as 1.5.0, every gate green, ready to merge.** Main since `v1.4.0` carries the post-release cleanup (the
advisory two-run repeat discharged, the overlay spec's status) and the fork layer: a `fork/` directory bundled
in the package that adds, replaces and patches corpus artifacts above packs and below consumer overrides,
reaching every client the corpus reaches, with `validate` naming the fork, a package without `fork/`
byte-identical, and the upstream lane deriving drift pairs for it — and, in the same change, resolving every
pair to the corpus file that exists, which a bare-id override of a prefixed file never did before.

## Proof block

### Gate results (the orchestrator's line under Node 22.22.3, the cut tree, exits unmasked)

| Gate | Result |
|---|---|
| `npm run gate` | 0 — 18 rules, 885 files, 0 hits |
| `npm run typecheck` · `npm run lint` · `npm run knip` | 0 · 0 · 0 (knip at the fork layer's head; unchanged by the cut) |
| `npm test` at the cut · `npm test -- --coverage` at the fork layer's head `1fa589e` | 0 — 183 files, 7,350 passed, 2 skipped · every floor met, both floored emit files up |
| `npm run build` | 0 — logic 1.04 of 2.00 MiB, corpus 0.50 of 1.50 MiB |
| `node dist/cli.js check` | 0 — all green, nothing to do |
| APM `--check` · plugin manifests `--check` · pack manifests `--check` · docs generation idempotent | 0 (50 files) · 0 (4 manifests) · 0 (3 packs) · 0, all at 1.5.0 |
| the docs site, built locally | 0 at the fork layer's head |
| CI at the pull request heads | #29 green on the three platforms and the three APM route legs at `1fa589e` and `282cc85`; the cut's pull request: see it |

### The eval run of record — run 10, and why no run 11

The standing rule runs the full set at every release. At this cut the `content/` tree is `3adad2f3…`, the
tree run 10 measured at `a42b45d` this morning, verified by hash before the cut; the sealed-input manifest
differs from run 10's in exactly one case, `rework-triage-revise-versus-defer`, whose advisory criterion A1 was
deleted under the set's two-run rule in pull request #28 — an advisory criterion decides nothing, so every
binding verdict and every metric of run 10 stands unchanged for this corpus. The maintainer chose the lean
release with that reading in front of them; the private layer's decision row for 1.5.0 carries the hashes.

### Review verdicts, per round

| Pass | Outcome |
|---|---|
| The fork layer (`stamity-reviewer`, `claude-fable-5-1`) | no Critical; 4 Warnings and 7 Minors, every one fixed with a test at `claude-fable-5-1` |
| The fork-layer docs (attestor, `claude-fable-5-1`, at `1fa589e`) | five surfaces, about 180 claims: no Critical; the Warnings and Minors applied in `282cc85` |

### Decisions trace

- **Build the layer now**, the maintainer's ("of course it has to be done"); the reading dropped was leaving it on its trigger.
- **Lean release**, the maintainer's, through the question tool, on the stated condition that the corpus bytes are those run 10 measured; the reading dropped was run 11.
- **Assumption stated, not asked:** the layer is named the fork layer, because "org" already means the trust policy and "overlay" the patch mechanism.
- **Assumption stated, not asked:** a pack and the fork layer never share an id (the corpus rule applied to the fork); the reading dropped was letting the fork silently replace a pack's artifact.
- **Assumption stated, not asked:** a fork patch of a pack-only artifact waits rather than fails, because the fork layer is package-global and packs are per-repository.

### Artifacts touched, with the owner

| Commit | What it carries | Owner |
|---|---|---|
| `f62d526` test(evals) | the advisory repeat discharged; the overlay spec's status (pull request #28) | orchestrator |
| `4adfddb` docs(specs) | the fork-layer spec | orchestrator |
| `1a5d98d` feat(upstream) | the lane's drift pairs for `fork/` and the existence-resolved counterpart | implementer at `claude-opus-5` |
| `8b6dbba` feat(content) | the fork layer's engine half | implementer at `claude-fable-5-1` |
| `10a4225` fix(content) | the review round | fixer at `claude-fable-5-1` |
| `1fa589e` docs · `282cc85` docs | the guide, the customization page, the changelog, the specs; the attestation's corrections | implementer at `claude-opus-5`; the corrections by the orchestrator |
| the cut (this record's commit) | 1.5.0 across the version carriers, the CHANGELOG heading and footer, twelve banners, this record | orchestrator, by the script of record plus its hand steps |

### Recommended next step — derived from this run's own state

Merge the cut's pull request by rebase on green checks, tag `v1.5.0` at main's new head and push the tag; the
release workflow re-proves version equality and tag ancestry, runs the APM route smoke against the tag's sha
in its own job, and holds the publish for the maintainer's approval in the `npm-publish` environment; after the
publish, fill the currency instance in the private layer.

## QA walk-through (the human checkpoint)

| # | Scenario | Steps | Expected | Evidence |
|---|---|---|---|---|
| 1 | A fork ships its own rule | in a fork checkout: `fork/rules/security-patterns.md`, `npm run build`, then `init -y --tools claude` in a consumer | `.claude/rules/stamity-security-patterns.md` carries the fork body; `validate` reports the fork replacement | proven: the implementer's end-to-end proof and `test/cli/engine/emission.test.ts` |
| 2 | A package without `fork/` is unchanged | build this repository | goldens and plans identical | proven: the cross-client goldens did not move |
| 3 | The lane sees fork drift | a fork with `fork/rules/secrets.md` takes a release that changes `stamity-secrets.md` | a `shadowed` row naming the prefixed file | proven: `test/upstream/lane.test.ts` lifecycle case |

**Sign-off:** _the maintainer's_.

## Not done

- The lane's pull-request path on GitHub stays proven by the stubbed suite until the organisation's Actions setting or a fork token (the one open inbox row).
