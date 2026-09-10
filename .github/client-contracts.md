# Client contract evidence

Revalidated 2026-09-10 against released 1.6.0 source and the current official pages.
These source-derived fixtures exercise emitted configuration and local hook processes;
they do not claim authenticated client sessions, native trust approval, or human QA.

- **Claude:** existing command files retain `/st-*` compatibility with skills; no command
  migration is needed. The bridge keeps the managed `AGENTS.md` import and removes the
  duplicated skill-discovery paragraph. Skill license and compatibility metadata use the
  supported fields. [Skills](https://code.claude.com/docs/en/skills),
  [memory and imports](https://code.claude.com/docs/en/memory),
  [hooks](https://code.claude.com/docs/en/hooks).
- **Codex:** `.agents/skills` supports named `$st-*` invocation. Optional `agents/openai.yaml`
  companions add display names and default prompts. Hooks use command strings and native
  `/hooks` trust; they do not consume Stamity digests as approval. Session-relative hook CWD
  requires locating the nearest initialized project. PreToolUse carries no calling-agent
  identity, and some tool paths bypass hooks. No native per-agent `tools` key is documented;
  generated developer instructions carry the category restriction and `sandbox_mode` the
  filesystem boundary. Unsupported PreToolUse `ask`/stop controls become explicit denials
  pending manual review; unsupported output flags are diagnosed without losing a denial.
  [Skills](https://learn.chatgpt.com/docs/build-skills),
  [hooks](https://learn.chatgpt.com/docs/hooks),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- **Cursor:** neutral-tree skills support `/st-*` invocation. Native hook timeouts use
  seconds; explicit exit 2 denies supported actions and `failClosed` covers errors and
  timeouts. PreToolUse `ask` is unenforced, so portable `ask` denies pending human review.
  Session-start and post-tool context map to `additional_context`. Identity-free tool
  payloads cannot enforce calling-role grants. The former fixed MCP tool-count claim is
  absent from the current contract and is removed. [Skills](https://cursor.com/docs/skills),
  [hooks](https://cursor.com/docs/hooks), [MCP](https://cursor.com/docs/mcp).
- **Copilot:** repository command hooks run in CLI/cloud, with PascalCase event aliases
  preserving canonical tool-name matcher semantics. PreToolUse rejects nonzero exits and
  explicit deny; timeouts always fail-open. String and object tool arguments normalize at
  the portable boundary. Session-start command output does not inject learning context,
  so the emitted guidance requires a manual read. The cloud configuration must reach the
  default branch through the normal review/approval path.
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
