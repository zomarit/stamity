# Client contract evidence

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 6f8f103. Re-attested 2026-09-30 for the Codex hook paragraph alone, against the codex-cli 0.155.1 re-run of that date and the Codex hooks page read the same day; every other bullet stands as re-attested 2026-09-22 against the vendor pages it cites and the Copilot CLI measurements of that date. -->
<!-- Re-open when: a cited vendor page changes what a client guarantees, an adapter emits a
     different configuration key, or a measurement supersedes a dated one below.
     `test/docsPages.test.ts` holds this page to the evidence-page contract and to the Codex
     hook-loading facts. -->

One currency claim, and it is the header above: every bullet's cited page was re-read on the date
that header names, and a claim resting on a measurement instead carries its own date in place.
These source-derived fixtures exercise emitted configuration and local hook processes;
they do not claim authenticated client sessions, native trust approval, or human QA.

- **Claude:** existing command files retain `/st-*` compatibility with skills; no command
  migration is needed. The bridge keeps the managed `AGENTS.md` import and removes the
  duplicated skill-discovery paragraph. Skill license and compatibility metadata use the
  supported fields. A hook handler "run[s] in the current directory with Claude Code's
  environment" — the session's own working directory, which a `cd` in the Bash tool moves for the
  rest of the session — while `${CLAUDE_PROJECT_DIR}` is "the project root where the session
  started" and is exported to the handler in both shell and exec form; shell form is "passed to a
  shell: `sh -c` on macOS and Linux, Git Bash on Windows, or PowerShell when Git Bash isn't
  installed", and that page asks that "in shell form, wrap each placeholder in double quotes"; exit
  2 "means a blocking error" and on `PreToolUse` "blocks the tool call", while "Any other exit code
  doesn't block on its own for most hook events" — the qualifier is the vendor's, and `PreToolUse`
  is one of the events it covers (hooks page, read 2026-09-21). The consequence is the anchoring this
  repository emits: every repository-relative hook command is rendered as one double-quoted word
  under that variable, because a relative command run from a moved working directory fails as
  `Cannot find module` with exit 1 — which does not block, so the pre-tool-use guard went unenforced
  for every call after a `cd` (189 occurrences in one consumer run). Measured 2026-09-20 in a
  disposable fixture on claude 2.1.278: the pre-change emission recorded one hook call for the `cd`
  itself and none after it, with the denied file read successfully; the anchored emission recorded
  the denial and the allowance from the same sub-directory, which also measures that headless
  `claude -p` exports the variable. The core guard's command alone carries a POSIX fail-closed tail
  (`|| { s=$?; [ "$s" -eq 2 ] && exit 2; echo …; exit 2; }`) so a guard that cannot launch blocks
  instead of passing, while the guard's OWN exit 2 is re-raised in silence — exit 2 is the status on
  which the page says stderr returns to the model, so a tail that printed on every non-zero status
  would answer each legitimate refusal with a false remediation. The whole anchoring is unmeasured
  under the PowerShell fallback the page names for a Windows host with no Git Bash, and the
  expectation there is worse than "no tail": `${CLAUDE_PROJECT_DIR}` is PowerShell variable syntax
  rather than an environment lookup (`$env:NAME`), so every anchored command (six entries over
  four scripts) would expand to an empty root and never launch — a possible regression on that
  host from "ran while the session sat at the root" to "never runs", recorded as unmeasured rather
  than claimed either way.
  [Skills](https://code.claude.com/docs/en/skills),
  [memory and imports](https://code.claude.com/docs/en/memory),
  [hooks](https://code.claude.com/docs/en/hooks) (all three read 2026-09-21).
- **Codex:** `.agents/skills` supports named `$st-*` invocation. Optional `agents/openai.yaml`
  companions add display names and default prompts. Hooks use command strings, and three
  loading steps all have to hold before the client runs one. First, `features.hooks` must be
  on: the adapter writes `[features] hooks = true` into `.codex/config.toml`. The 2026-09-15
  measurement on codex-cli 0.154.0 showed the feature on with the key written and off under
  `-c features.hooks=false`, which is a CLI override and never exercises the file. Second, the
  project must carry `projects.<path>.trust_level = "trusted"`. Third, each hook needs per-hook
  `/hooks` trust, or an invocation started with `--dangerously-bypass-hook-trust`. They do not consume
  Stamity digests as approval. The hooks page, read 2026-09-30, says "Hooks are enabled by
  default." (its 2026-09-17 read said the same); the config reference states no default for this
  key (read 2026-09-30), where its 2026-09-21 read marked other `[features]` keys "on by default"
  in so many words. The adapter writes the key either way. The 2026-09-15 measurement covers the
  emitted key only: it never ran without the key, and the 0.155.1 re-run below is the one that
  measured the default. Headless `codex exec` on codex-cli 0.154.0 ran zero
  project hooks with the feature on, the project trusted and hook trust bypassed (measured
  2026-09-15; three runs, no observation file written, no hook-discovery line in the debug
  log). The re-run on codex-cli 0.155.1 (2026-09-30, the same fixture recipe, six runs) measured
  what 0.154.0 left open and failed one claim it had made: with the key absent from both the
  user and the project config the feature is ON (`codex features list` reads `hooks  stable
  true`), and a project-file `hooks = false` did NOT turn it off under the recipe's
  per-invocation trust override (`-c 'projects."<path>".trust_level="trusted"'`), so the
  project file's key is not shown to be read. `codex exec` again ran zero project hooks in 3 of 3
  feature-on runs. Both measurements trusted the project only through that override, which may
  leave the project `.codex/` layer unloaded, so the cause is not isolated — `exec` itself, or a
  layer that never loaded — and a run with the project trusted in the home `~/.codex/config.toml`
  is unmeasured, as is codex-cli 0.159.2. An emitted hook therefore enforces nothing measured on
  that lane, and a QA row that asks it to is measuring the client.
  INTERACTIVELY it does enforce, measured 2026-09-22 at 14:41Z on codex-cli 0.155.1 — the build
  the 2026-09-30 headless re-run used, here with the project trusted in the home config — by walking the emitted hooks in the QA hook fixture:
  `features.hooks = true` came from the emitted `.codex/config.toml`, the client asked for the two
  trust decisions and recorded both in the operator's home config (the project's `trust_level =
  "trusted"`, the hook's `trusted_hash`), and it then rendered `Blocked by hook` for
  `qa-denied.txt` carrying the emitted hook's own `permissionDecision: deny` while reading
  `qa-allowed.txt`; the hook's own log holds one `denied` and one `allowed` line (sha-256
  `756246be52bd0bd85faab288f1e8ae5b43e98d42d3750734478c0d108081097b`). So the three loading steps
  above are the whole of it on that lane: with them satisfied the emitted document is enforcement
  in an interactive session, and the headless lane's zero remains the headless lane's.
  "Commands run with the session cwd as their working directory", and the same page asks that a
  repo-local hook "prefer resolving from the git root instead of using a relative path such as
  `.codex/hooks/...`" because "Codex may be started from a subdirectory" (hooks page, read
  2026-09-21) — which is what the emitted starter does: it walks UP from `process.cwd()` to the
  directory holding the trusted `.codex/hooks.json` and launches the script beside it, covering a
  session in a sub-directory of the project and not one outside its ancestry. Session-relative hook CWD
  requires locating the nearest initialized project. PreToolUse carries no calling-agent identity, and some tool paths bypass hooks. No
  native per-agent `tools` key is documented; generated developer instructions carry the
  category restriction and `sandbox_mode` the filesystem boundary. Unsupported PreToolUse
  `ask`/stop controls become explicit denials pending manual review; unsupported output flags
  are diagnosed without losing a denial.
  [Skills](https://learn.chatgpt.com/docs/build-skills),
  [hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-15, re-read 2026-09-17 and
  2026-09-21),
  [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) (read
  2026-09-15, re-read 2026-09-17 and 2026-09-21),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

- **Cursor:** neutral-tree skills support `/st-*` invocation. Native hook timeouts use
  seconds; explicit exit 2 denies supported actions and `failClosed` covers errors and
  timeouts. PreToolUse `ask` is unenforced, so portable `ask` denies pending human review.
  Session-start and post-tool context map to `additional_context`. Identity-free tool
  payloads cannot enforce calling-role grants. The former fixed MCP tool-count claim is
  absent from the current contract and is removed. Hooks run from the WORKSPACE root, not from the
  session's shell directory: measured 2026-09-20 on the Cursor agent CLI 2026.09.15 in a disposable
  fixture whose extra user hook logged its own `process.cwd()`, every one of six hook invocations
  recorded the fixture root — including the three after the model had run `cd sub` in the shell —
  and the denial was still enforced on the calls that followed. The vendor page now states the same
  rule and scopes it by source: a project hook in `.cursor/hooks.json` runs "from the project
  root", a user hook in `~/.cursor/hooks.json` runs from `~/.cursor/` (hooks page, read
  2026-09-21) — so a repository-relative command is correct for the project rows this engine emits
  and would not be for a user row of the same shape. The client also exports a
  project-root variable name (`CURSOR_PROJECT_DIR`, observed in the same log; values never read), so
  an anchor is available if that behaviour ever changes, but the emitted repository-relative command
  needs none today. The vendor pages refused every connection from the measuring host on 2026-09-20, which is why the
  measurement above was taken; they answered that same host on 2026-09-21, and the three cited
  below were re-read then. What the hooks page settles beside the working directory: exit 2 blocks
  and is "equivalent to returning `permission: "deny"`"; any other non-zero exit is a hook
  failure that "fail[s] open by default" unless `failClosed: true` is set, and no output counts as
  one of those failures; and where several sources match, "any deny wins over ask, and ask wins
  over allow". [Skills](https://cursor.com/docs/skills),
  [hooks](https://cursor.com/docs/hooks), [MCP](https://cursor.com/docs/mcp) (all three read
  2026-09-21).
- **Copilot:** repository command hooks run in CLI/cloud, with PascalCase event aliases
  preserving canonical tool-name matcher semantics. PreToolUse rejects nonzero exits and
  explicit deny; timeouts always fail-open. String and object tool arguments normalize at
  the portable boundary. Session-start command output is injected as additionalContext
  (the hooks reference, read 2026-09-17 and again 2026-09-21). Each hook entry carries its own
  working directory, `cwd`, documented as "relative to repository root" and emitted as `"."`, so a
  repository-relative command needs no anchor here (hooks reference, read 2026-09-21). An emitted
  hook file is loaded only where the FOLDER IS TRUSTED, which is the fact a headless run turns on:
  `COPILOT_ALLOW_ALL` set to exactly `"true"` "additionally trusts the working directory without
  prompting, which loads that directory's skills, plugins, MCP servers, and hooks, including hooks
  that run shell commands", while the other truthy spellings — and `--allow-all-tools`, whose own
  help defers to that variable — "only auto-approve tools" (`copilot help environment` on 1.0.87,
  read 2026-09-22, stdout sha-256 `dac68e84255d3a00ab9c013f5d9accd8079f9c7fb8c1b5a5df23653e60d6c662`).
  Measured 2026-09-22 on the same build: one hook fixture recorded NOTHING under the flag alone, and
  seven hook observations with the variable set, one of them a `PreToolUse` denial the client
  rendered as `Denied by preToolUse hook: hook exited with code 2` — so a QA row that drives this
  client without the variable measures folder trust rather than the emitted wiring. Only
  machine-wide policy hooks "are available regardless of folder trust state"; the repository-level
  files this engine writes (`.github/hooks/*.json`) are not, and neither are a plugin's own. The
  PascalCase aliases are the vendor's "VS Code compatible format" (`SessionStart`, `PreToolUse`,
  fields in snake_case), and a PascalCase `PreToolUse` entry takes Claude's matcher semantics
  instead of the native regex rule, where "`*`, `**`, or an empty `matcher` value fires for every
  tool" (the hooks reference, fetched 2026-09-22, sha-256
  `39d4274e9ca1aea384f57693c76252e6b53e857d28578d9d2e11d4cea1021d40`). The cloud
  configuration must reach the default branch through the normal review/approval path.
  [Hook schema and decisions](https://docs.github.com/en/copilot/reference/hooks-reference),
  [cloud discovery](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks).

The second-client native-memory trigger has fired: Claude and Codex both offer local
memory. Retain `st-learn` because its repository evidence is versioned and portable across
clients and machines. Reassess when durable, repository-scoped, cross-vendor memory is
available; preserve historical learnings during that review.
[Claude memory](https://code.claude.com/docs/en/memory),
[Codex memory](https://learn.chatgpt.com/docs/customization/memories).

Local evidence lives in `test/adapters/`, `test/hooks/portableRunner.test.ts`,
`test/hooks/scripts.test.ts`, `test/emit/hooksInfra.test.ts`,
`test/emit/skillsProjection.test.ts` and `test/cli/commands/initPanel.test.ts`.
The argv fixture includes spaces and shell metacharacters; malformed payload diagnostics
must not echo credential or tool-input fragments. Generated outputs remain subject to
the normal drift, lifecycle, public-consumer and full verification gates.
