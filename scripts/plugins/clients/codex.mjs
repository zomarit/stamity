// The Codex plugin container — an Agent Plugins 1.0 package, the same closed manifest the Copilot
// container uses, and the narrowest of the four roots: skills and hooks, nothing else.
//
// Sources, all read 2026-09-20:
//   - https://agent-plugins.org/schemas/1.0.0/plugin.schema.json — the closed manifest schema.
//   - https://developers.openai.com/plugins/build/plugins and https://learn.chatgpt.com/docs/plugins
//     — the container's classes and its hook discovery.
//   - the installed `codex plugin --help` surface for the install and upgrade verbs below.
//
// Three subtractions and one omission, each with its reason on the class it removes.
//
// AGENTS. The Agent Plugins specification carries no agent class, so this client's ten subagent
// definitions cannot ride in the container; `stamity plugin setup` writes `.codex/agents/`.
//
// COMMANDS. This client documents no project-scoped command directory. The engine already says so
// in its own emission (`src/adapters/codex.ts`), and the consequence here is that this root also
// carries no generated `st-setup` command — the README's manual line is the setup route instead.
//
// RULES. A glob-less rule is delivered as a skill by the engine's rule-delivery default and
// travels under `skills/`; the container carries no rules class for the rest.
//
// The OMISSION is `extensions.com.openai.hooks`. The two vendor pages disagree about where a hooks
// override lives, and DEFAULT DISCOVERY of `hooks/hooks.json` satisfies both readings — so this
// root places the file at the default and declares no pointer. A pointer that named the wrong key
// would be worse than no pointer at all, and the closed schema would refuse a misspelled one.

/** The environment variable this client expands inside a plugin's own files. */
export const ROOT_VARIABLE = 'PLUGIN_ROOT'

const HOOKS_DIR = 'hooks'
const POLICY_DOCUMENT = '.stamity/generated/agent-tool-policies.json'

const AGENT_REASON =
  'the Agent Plugins container carries no agent class (agent-plugins.org specification, ' +
  '2026-09-20); stamity plugin setup writes .codex/agents/'

const COMMAND_REASON = 'this client documents no project-scoped command directory'

const RULE_REASON = 'glob-less rules ride as skills; the container carries no rules class'

const MCP_REASON = 'MCP server selection and credential references are repository-owned'

function hookFile(path) {
  return `${HOOKS_DIR}/${path.slice(path.lastIndexOf('/') + 1)}`
}

/** See `clients/claude.mjs` for the three-outcome contract this function shares. */
export function place(row) {
  const path = row.path

  if (path.startsWith('.agents/skills/')) {
    return { path: `skills/${path.slice('.agents/skills/'.length)}`, class: 'skill' }
  }
  if (path === '.codex/hooks.json') return { path: `${HOOKS_DIR}/hooks.json`, class: 'hooks' }
  if (path === POLICY_DOCUMENT) return { path: `${HOOKS_DIR}/agent-tool-policies.json`, class: 'hooks' }
  if (path.startsWith('.stamity/generated/hooks/codex/')) return { path: hookFile(path), class: 'hooks' }

  // Subagents and the client configuration: repository-owned, see AGENT_REASON.
  if (path.startsWith('.codex/agents/')) return null
  if (path === '.codex/config.toml') return null
  if (path === 'AGENTS.md') return null
  if (path.startsWith('.stamity/')) return null

  return undefined
}

export const DECLARED_CLASSES = {
  agent: { status: 'repository-owned', reason: AGENT_REASON },
  command: { status: 'repository-owned', reason: COMMAND_REASON },
  rule: { status: 'repository-owned', reason: RULE_REASON },
  mcp: { status: 'repository-owned', reason: MCP_REASON },
}

export const CARRIED_CLASS_REASONS = {}

export const INVOCATION = {
  skills: '$<id>',
}

export const CLIENT_FLOOR = {
  version: 'unknown',
  reason: 'no minimum version stated on the eight vendor pages read 2026-09-20',
}

export const PREREQUISITES = {}

/** No command class, so no generated command: the README carries the setup line instead. */
export const SETUP_COMMAND_PATH = null

export const ASSETS = []

export const MANIFEST_PATH = 'plugin.json'

/** The closed schema's key set and nothing else — see the header on the omitted extensions key. */
export function buildManifest({ identity, version }) {
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: identity.name,
    version,
    description: identity.description,
    author: identity.author,
    homepage: identity.homepage,
    repository: identity.repository,
    license: identity.license,
    keywords: identity.keywords,
  }
}

export function renderReadme({ identity, version, sourceCommit, sourceCommitDate, slug }) {
  return `# stamity for Codex

A plugin root built from the stamity corpus at version ${version}, commit ${sourceCommit} (${sourceCommitDate}).

## Install

\`\`\`sh
codex plugin marketplace add ${slug}
codex plugin add stamity@stamity
\`\`\`

## Invoke

- skills: \`${INVOCATION.skills}\`

## Set the repository up

This root carries no \`st-setup\` command — ${COMMAND_REASON}. Run the setup directly instead,
once per repository:

\`\`\`sh
node "$PLUGIN_ROOT/runtime/locate.mjs" -- plugin setup --client codex -y
\`\`\`

It writes the repository-owned half this root does not carry: the charter with this repository's
facts and gates, and the client configuration.

## Hooks

The hook document is at \`hooks/hooks.json\`, where this client discovers it by default. Three
steps still stand between an installed plugin and a hook that runs: \`features.hooks = true\` in
\`.codex/config.toml\` (written by the setup above), project trust in the Codex home config, and a
per-hook trust review through \`/hooks\`. A headless run proves discovery, never enforcement.

## Pin and roll back

\`\`\`sh
codex plugin marketplace upgrade
\`\`\`

The marketplace entry resolves to a branch, so an install takes whatever that branch points at.
Pin by adding the marketplace at a tag; roll back by re-adding the previous tag.

## What this root does not carry

- subagents — ${AGENT_REASON}
- commands — ${COMMAND_REASON}
- rules — ${RULE_REASON}
- MCP servers — ${MCP_REASON}
- the charter (\`AGENTS.md\`) and every \`.stamity/\` state file: they describe one repository, and
  this root is installed into many.

Source: ${identity.homepage} · ${identity.repository}
`
}
