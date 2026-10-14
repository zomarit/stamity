# Plan — the 1.12.0 release's preparation fixes (in-flow)

Two units, then the release checklist. The diagnoses behind each fix are in `record.md` (Frame).

### e1-eval-case-fixes — the five 1.11.0 eval misses fixed where each one's cause lies

| Field | Content |
|---|---|
| `id` | e1-eval-case-fixes |
| `requirements` | none in `docs/specs/` — the eval set's own rules (`evals/SET-v7.md`) govern case changes |
| `files` | `evals/cases-v6/golden/quick-string-rename-with-its-tests.md`, `evals/cases-v6/golden/spec-create-small-repo-whole-app.md`, `evals/cases-v6/golden/agent-researcher-return-contract.md`, `evals/cases-v6/golden/ask-citation-discipline.md`, `evals/cases-v6/golden/plugin-mode-invocation.md`, `content/commands/st-ask.md`, `evals/SET-v7.md`, `test/evals/successorInputs.test.ts` (only if an `EXPECTED_MOVES` row is required), the dogfood copies `node dist/cli.js sync` regenerates for `st-ask`; widened 2026-10-07 after the builder's BLOCKED_DEPENDENCY (W1): `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/emit/crossClientGoldens.test.ts`, `evals/cases-v6/adversarial/repo-content-directive-is-data.md`, `evals/cases-v6/golden/ask-next-step-derived-from-run-state.md` (their `source:` ranges shift with the `st-ask.md` edit), `.apm/prompts/st-ask.prompt.md` (only if `sync` regenerates it; otherwise the cut's APM regeneration does), `.stamity/manifest.json` |
| `interfaces` | (1) quick-string-rename B4: a sealed, tool-free response that names the one `test-runner` spawn running the full gate and reports it not run, with no row green, meets B4; skipping, splitting per file, running inline, or claiming a run fails; the `claim:` line and its `SET-v7.md` index row say the same. (2) spec-create: widen `source:` to the `st-spec.md` single-writer lines (`:256-258`, `:274-276` at the head) and quote them in the Brief's Dispatch block; B6 asks that the scope is written by `spec-author` in `brownfield` mode after a `researcher` pass, as `docs/specs/` files with `REQ-<area>-<nnn>` ids, and that the response must NOT say the command writes a spec itself; B1 drops the placement of `docs/specs/` in the mode line (stated in the opening response instead); the index row's `source:` follows. (3) researcher-return: the Brief's Q2 states the probe ("You read `src/api/export.ts` end to end and grepped it for `retry`; …"). (4) ask-citation: `content/commands/st-ask.md` says the band and the assumption sit inside the claim's sentence before its full stop, with one inline example, and that a band after the full stop or an assumption opened as its own sentence is outside the claim; the case re-quotes that text and moves its `source:` range and index row. (5) plugin-mode: the Brief asks "and under exactly which name you name the skill it runs". (6) One dated `SET-v7.md` paragraph per case, or one paragraph naming all five: what moved, why (the run 37/38/39 judge evidence), that no threshold, roster count or floor tag moves, and that each case re-measures because its bytes moved. |
| `depends_on` | none |
| `verify` | `npm run build` · `env -u STAMITY_CLAUDE_BIN -u STAMITY_CURSOR_BIN -u STAMITY_COPILOT_BIN -u STAMITY_CODEX_BIN npx vitest run test/evals test/corpus test/emit/crossClientGoldens.test.ts` · `npm run lint && npm run typecheck` · `npm run knip` · `node dist/cli.js sync && git status --porcelain` (only the expected `st-ask` copies) |

### e2-setup-clean-line — the generated setup body says what `clean -y` deletes

| Field | Content |
|---|---|
| `id` | e2-setup-clean-line |
| `requirements` | none new; inbox row "scripts/plugins/setupCommand.mjs:172-174 · the generated st-setup body …" |
| `files` | `scripts/plugins/setupCommand.mjs`, `test/ci/pluginModules.test.ts`, `evals/cases-v6/adversarial/st-setup-refuses-generated-setup.md`, `evals/cases-v6/golden/st-setup-fresh-repository.md`, `evals/SET-v7.md` |
| `interfaces` | `clean -y` "takes no confirmation, removes ledger rows and the files they name, and deletes the whole `.stamity/` directory — learnings, handoffs, overrides, run records and packs — unless a hooks file it keeps still runs a script there"; the operator copies out what to keep first. A test pins the sentence. The two setup cases' `source:` ranges and the adversarial case's fixture fence move with it; a dated `SET-v7.md` paragraph records it. |
| `depends_on` | plan 016 file 0 merged (its S17 makes the "unless" clause true) |
| `verify` | `env -u … npx vitest run test/ci/pluginModules.test.ts test/evals` · `npm run lint && npm run typecheck` |

### e3-spec-status-written-ahead — a plan written ahead of a release does not ship its design spec with it

Added 2026-10-08 by the orchestrator: at the `v1.12.0` tag the shipped-spec check would read plans 015 and 016 file 3
(stamp `88fcfd32`, an ancestor of the tag) as shipped and fail on `docs/specs/board-writes.md` (`status: design`), whose
requirements no test cites (REQ-BOARD-001…010 appear nowhere under `test/`, `src/` or `content/`). Flipping the spec to
`shipped-with-1.12.0` would be false; inbox row 457 foresaw both.

| Field | Content |
|---|---|
| `id` | e3-spec-status-written-ahead |
| `requirements` | REQ-PROVE-016 (amended) |
| `files` | `test/records/specStatus.test.ts`, `docs/specs/prove-behavior-and-value.md` (REQ-PROVE-016's text and its GIVEN line) |
| `interfaces` | The shipped scan flags a `design` spec named by a plan whose stamp precedes the newest tag only when the tree cites one of that spec's own requirement ids (`REQ-<AREA>-<nnn>`, read from the spec's text) in a file under `test/` — the join key plan units, deltas and test names share; a `design` spec that defines no requirement id keeps the old rule (flagged). Still derived, never typed. Fixture cases: a written-ahead plan whose spec no test cites passes; one whose spec a test cites fails naming plan and tag; a spec with no ids fails as before. The tree check passes at a local `v1.12.0` tag on the candidate. |
| `depends_on` | none |
| `verify` | `npx vitest run test/records` · with a temporary local tag: `git tag v1.12.0 && npx vitest run test/records/specStatus.test.ts; git tag -d v1.12.0` (and `git tag -l v1.12.0` empty afterwards) · `npm run lint && npm run typecheck` |
