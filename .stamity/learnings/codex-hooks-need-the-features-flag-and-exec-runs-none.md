---
id: codex-hooks-need-the-features-flag-and-exec-runs-none
title: codex hooks need the features flag and exec runs none
date: 2026-09-14
confidence: high
summary: the adapter now emits [features] hooks = true (verified to flip the client feature); codex exec 0.154.0 still ran zero project hooks with trust bypassed
reviewBy: 2026-12-01
validatedAgainst: RUST_LOG=debug codex exec --dangerously-bypass-hook-trust in a `stamity init -y --tools codex` fixture on codex-cli 0.154.0
integrity: sha256:1657ba9116bcb94929ce372846c622d70051bb3e79883af74eb84e2761dd93b8
---

Codex reads `.codex/hooks.json` only when `features.hooks` is on, and the client defaults that
key OFF — so every byte this engine emitted into that file was inert until the codex adapter
started writing a `[features]` table. It now does (`src/adapters/codex.ts`, `composeConfigToml`),
and the key is measurably read. A second fact travels with it and does not have the same fix:
`codex exec` on codex-cli 0.154.0 runs no project hook at all, with the feature on, the project
trusted and hook trust bypassed. Headless codex is therefore not a lane where an emitted hook
enforces anything, and a QA row that asks it to is measuring the client, not the emission.

## Why

Measured 2026-09-15 in a disposable fixture outside the repository (`git init`, `stamity init -y
--tools codex`, `config set hooks.userHooksDir`, a PreToolUse hook that appends one JSONL line per
call and exits 2 on the denied file, `sync -y`, `check` clean, drift clean), against codex-cli
0.154.0, model gpt-6-astra, auth Chatgpt.

Half one, positive and attributed: with the emitted `[features] hooks = true` in
`.codex/config.toml`, the `RUST_LOG=debug` session line `feedback_tags: … features=[…]` carries
`CodexHooks` (3 occurrences in the run). The control — the same fixture, same prompt, run with
`-c features.hooks=false` — carries it 0 times. So the key the adapter now writes is read by
`codex exec` and does flip the feature; that is the fix working at its own layer.

Half two, negative and replicated: the hook still never ran. Three runs — `--dangerously-bypass-
hook-trust`; the same plus `--enable hooks` and `-c projects."<fixture>".trust_level="trusted"`;
and the feature-off control — produced ZERO observations. `qa-observations.jsonl` was never
created in any of them, while the debug log shows the client's own shell calls executing
(`/bin/zsh -lc 'cat qa-denied.txt'`) and the model answering that it read both files. The log
carries the bypass warning ("`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run
without review for this invocation.") and no hook-discovery line of any kind: no mention of
`hooks.json`, no load, no trust decision. The vendor pages read 2026-09-15
(learn.chatgpt.com/docs/config-file/config-reference, learn.chatgpt.com/docs/hooks) state the
feature flag, the project-trust requirement and the per-hook `/hooks` review, and do not state
whether `exec` loads the project hook layer at all. Review horizon: re-run the fixture on the next
codex-cli minor — a release that starts loading hooks in `exec` retires half two and turns the
QA row from `not-run` into a measurable pass or fail.

## How to apply

Treat "the emitted file is correct" and "the client runs it" as two separate claims for this
client, and never let the first stand in for the second. Emission side: any change to the codex
hook emission keeps `[features] hooks = true` in `.codex/config.toml` — dropping it silently
disables every hook the adapter writes, and no gate in this repository would go red, because the
gates compare emitted bytes. The comment above the key names all three loading steps (feature
flag, `projects.<path>.trust_level`, per-hook `/hooks` trust or `--dangerously-bypass-hook-trust`)
and the operator needs all three; a reply that names only the flag is the same half-answer this
learning exists to stop. Verification side: `codex exec` is not evidence for a hook row on
0.154.0 — the honest record is `not-run` with the reason, and the interactive `/hooks` trust plus
a TUI observation stay a human step. The cheap re-check is the fixture above: if
`qa-observations.jsonl` does not exist after the run, no hook fired, whatever the model's reply
says.
