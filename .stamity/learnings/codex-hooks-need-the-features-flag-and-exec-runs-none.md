---
id: codex-hooks-need-the-features-flag-and-exec-runs-none
title: codex hooks need the features flag and exec runs none
date: 2026-09-19
confidence: high
summary: the adapter writes [features] hooks = true and the key is read; the default is unmeasured (the page read 2026-09-17 says on); codex exec 0.154.0 ran zero project hooks with trust bypassed
reviewBy: 2026-12-01
validatedAgainst: "RUST_LOG=debug codex exec --dangerously-bypass-hook-trust in a stamity init -y --tools codex fixture on codex-cli 0.154.0"
integrity: sha256:b7481f5c88199378724cabab2d3f2038cb0a135cfcadca1adf94676fa0394604
---

Codex reads `.codex/hooks.json` only when `features.hooks` is on. The codex adapter
writes a `[features]` table with `hooks = true` into `.codex/config.toml`
(`src/adapters/codex.ts`, `composeConfigToml`), and that written key is measurably
read. Whether the client reads the file with the key ABSENT is unmeasured: the
2026-09-15 control ran with the key set to false, never with the key absent, and the
vendor page read on 2026-09-17 says the default is on. A second fact travels with the
first and does not have the same fix: `codex exec` on codex-cli 0.154.0 runs no project
hook at all, with the feature on, the project trusted and hook trust bypassed. Headless
codex is therefore not a lane where an emitted hook enforces anything, and a QA row that
asks it to is measuring the client, not the emission.

## Why

Measured 2026-09-15 in a disposable fixture outside the repository (`git init`,
`stamity init -y --tools codex`, `config set hooks.userHooksDir`, a PreToolUse hook that
appends one JSONL line per call and exits 2 on the denied file, `sync -y`, `check` clean,
drift clean), against codex-cli 0.154.0, model gpt-6-astra, auth Chatgpt.

Half one, positive and attributed: with the emitted `[features] hooks = true` in
`.codex/config.toml`, the `RUST_LOG=debug` session line `feedback_tags: … features=[…]`
carries `CodexHooks` (3 occurrences in the run). The control, the same fixture and prompt
run with `-c features.hooks=false`, carries it 0 times. So the key the adapter writes is
read by `codex exec` and does flip the feature; that is the fix working at its own layer.
What the control does not show is the default: no run was made with the key absent, so
"the client defaults the key off" was an inference, not a measurement, and the vendor's
hooks page read on 2026-09-17 states the opposite. The adapter writes the key so the
emission does not depend on the default either way.

Half two, negative and replicated: the hook still never ran. Three runs, with
`--dangerously-bypass-hook-trust`, the same plus `--enable hooks` and
`-c projects."<fixture>".trust_level="trusted"`, and the feature-off control, produced
ZERO observations. `qa-observations.jsonl` was never created in any of them, while the
debug log shows the client's own shell calls executing (`/bin/zsh -lc 'cat qa-denied.txt'`)
and the model answering that it read both files. The log carries the bypass warning
("`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for
this invocation.") and no hook-discovery line of any kind: no mention of `hooks.json`, no
load, no trust decision. The vendor pages read 2026-09-15
(learn.chatgpt.com/docs/config-file/config-reference, learn.chatgpt.com/docs/hooks) state
the feature flag, the project-trust requirement and the per-hook `/hooks` review, and do
not state whether `exec` loads the project hook layer at all. Validated against:
`RUST_LOG=debug codex exec --dangerously-bypass-hook-trust` in the fixture above.
Review horizon: re-run the fixture on the next codex-cli minor, once with the key absent
to settle the default; a release that starts loading hooks in `exec` retires half two and
turns the QA row from `not-run` into a measurable pass or fail. This is the 2026-09-19
recapture of the 2026-09-15 learning, corrected on the default claim by the audit of
2026-09-17 (its DOC-1 row) and the review of Package 15.

## How to apply

Treat "the emitted file is correct" and "the client runs it" as two separate claims for
this client, and never let the first stand in for the second. Emission side: any change
to the codex hook emission keeps `[features] hooks = true` in `.codex/config.toml`;
dropping it makes the emission depend on an unmeasured default, and no gate in this
repository would go red, because the gates compare emitted bytes. The comment above the
key names all three loading steps (feature flag, `projects.<path>.trust_level`, per-hook
`/hooks` trust or `--dangerously-bypass-hook-trust`) and the operator needs all three; a
reply that names only the flag is the same half-answer this learning exists to stop.
Verification side: `codex exec` is not evidence for a hook row on 0.154.0; the honest
record is `not-run` with the reason, and the interactive `/hooks` trust plus a TUI
observation stay a human step. The cheap re-check is the fixture above: if
`qa-observations.jsonl` does not exist after the run, no hook fired, whatever the model's
reply says.
