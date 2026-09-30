---
id: codex-hooks-default-on-and-codex-exec-ran-none
title: codex hooks default on and codex exec ran none
date: 2026-09-30
confidence: high
reviewBy: 2027-03-20
validatedAgainst: "RUST_LOG=debug codex exec -m gpt-6-astra --dangerously-bypass-hook-trust --json and codex features list in two stamity init -y --tools codex fixtures on codex-cli 0.155.1, 2026-09-30 (run 2026-09-30_optimization-sweep, ledger rows build/95 to build/98)"
summary: "codex-cli 0.155.1: the hooks feature defaults on; a project-file hooks key did not set it under -c trust; codex exec ran zero project hooks, cause not isolated (2026-09-30)"
integrity: sha256:cc60d5b0152e6a1f97899af9555c9c6a398f304b1cd50790aabfe713816d162c
---

On codex-cli 0.155.1 (measured 2026-09-30, model gpt-6-astra, ChatGPT auth), four facts
hold for this repository's codex hook emission, and one question stays open.

1. The codex adapter writes a `[features]` table with `hooks = true` into
   `.codex/config.toml` (`src/adapters/codex.ts`, `composeConfigToml`); the fixture's emitted
   file carries it.
2. The `hooks` feature defaults ON. With no `[features]` table in either the user config or the
   project config, the `RUST_LOG=debug` feedback tags carry `CodexHooks` (2 per completed run)
   and `codex features list` reads `hooks  stable  true`. The learning this replaces called the
   default unmeasured.
3. The project file's key did NOT set the feature under a per-invocation trust override
   (`-c 'projects."<fixture>".trust_level="trusted"'`). With `hooks = false` written into the
   project `.codex/config.toml`, `CodexHooks` still appeared 2 times and `codex features list`
   still read `true`. Only the CLI override `-c features.hooks=false` turned the feature off
   (0 occurrences, `features list` reads `false`). The 0.154.0 claim "the written key is
   measurably read" rested on that CLI control, which never exercises the file.
4. `codex exec` ran no project hook. In 3 of 3 feature-on runs (hook trust bypassed; once also
   with `--enable hooks` and the trust override) the PreToolUse hook's `qa-observations.jsonl`
   was never created, and the denied read `head -n 1 qa-denied.txt` exited 0 with its content.
   The debug log carries the bypass warning and no line naming `hooks.json`, a hook load or a
   trust decision. A `codex.hooks.run` metrics-instrument line appears at turn end even in the
   feature-off control, so it is not evidence of a hook run.

Unmeasured: facts 3 and 4 share one confound. Under the `-c` trust override the project
`.codex/` layer may not load at all, so "exec never runs project hooks" cannot be told apart
from "the untrusted project layer never loaded". A trusted-folder run settles it: a
`[projects."<fixture>"] trust_level = "trusted"` entry in the home `~/.codex/config.toml` (the
operator's file, not written by that pass), then `codex features list` in a fixture whose project
file says `hooks = false`, and one exec run read for observation lines. Also unmeasured:
codex-cli 0.159.2; nothing in this learning ran on it.

## Why

Measured 2026-09-30 in run 2026-09-30_optimization-sweep (pass `sw14-codex-learning`, ledger
rows build/95 to build/98), in two disposable fixtures outside the repository built with
`scripts/qa/fixtures.mjs` `createFixture`: `git init`, `stamity init -y --tools codex`,
`config set hooks.userHooksDir qa-hooks`, `sync -y`, `check` ok, and a PreToolUse hook that
appends one JSONL line per call and exits 2 on `qa-denied.txt`. The engine was that branch's
`dist/cli.js` (1.10.0). The home config held no `[features]` table and no `hooks.json`, so
"absent" was absent in both layers. Five completed runs, one tool call each: bypass alone, and
bypass plus `--enable hooks` plus the trust override, gave 0 observations; the
`-c features.hooks=false` control gave `CodexHooks` 0; key absent gave 2; project-file
`hooks = false` gave 2. Validated against: `RUST_LOG=debug codex exec -m gpt-6-astra
--dangerously-bypass-hook-trust --json` in those fixtures, and `codex features list` in each.
This recaptures `codex-hooks-need-the-features-flag-and-exec-runs-none` (codex-cli 0.154.0,
2026-09-19), retired in the same commit: its "key is read" claim failed as stated and its
"default unmeasured" claim is now measured. The debug logs carry account identity fields on
their telemetry lines, which is why no log line is quoted here. Review horizon: the
trusted-folder run above, or the next codex-cli minor; a run that shows a project hook firing
under `exec` retires fact 4.

## How to apply

"The emitted file is correct" and "the client runs it" are two separate claims for this client.
The adapter's `hooks = true` is a defensive write: the default is on, and under the
per-invocation trust override the file key is not what decides the feature, so no measured run
depends on it. Removing it would still move no gate, because the gates compare emitted bytes. A
`codex exec` run is not evidence for or against a hook row on 0.155.1; the honest record is
`not-run` with the confound named. The cheap re-check is the fixture above: no
`qa-observations.jsonl` after the run means no hook fired, whatever the model's reply says. The
user-config default model `gpt-6.1-sol` was refused for ChatGPT auth under `codex exec`
(HTTP 400), so a harness run that relies on the default model fails before any turn; the runs
above passed `-m gpt-6-astra`.
