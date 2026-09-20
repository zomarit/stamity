// The GitHub Copilot CLI plugin container — an Agent Plugins 1.0 package with a
// `com.github.copilot/` namespace directory beside the vendor-neutral `skills/` tree.
//
// Sources, all read 2026-09-20:
//   - https://agent-plugins.org/schemas/1.0.0/plugin.schema.json — the manifest schema, which is
//     CLOSED (`additionalProperties: false`) and whose `author` is closed to name/email/url.
//   - https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference —
//     the container layout and its namespace directory.
//   - https://docs.github.com/en/copilot/reference/hooks-reference — the hook event names.
//   - https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli — the CLI's
//     own Node requirement.
//
// Two spellings this table uses that the vendor pages do NOT state, each recorded as a reason on
// its class so a consumer reads the uncertainty rather than inheriting it silently:
//
//   1. The FILE EXTENSION under `com.github.copilot/commands/`. The reference names the directory
//      and not what a file in it is called. The repository surface's `.prompt.md` spelling is what
//      travels, because it is the spelling this client already reads at `.github/prompts/`.
//   2. `${PLUGIN_ROOT}` expansion INSIDE a hook command. The hooks reference documents the
//      variable for the plugin's own files and says nothing about expansion inside a command
//      string. The commands are written root-relative regardless, because the alternative — a
//      repository-relative path — is certainly wrong for an installed plugin.
//
// Both are measured by file 3's route proof rather than argued here.

/** The environment variable this client expands inside a plugin's own files. */
export const ROOT_VARIABLE = 'PLUGIN_ROOT'

/** The reverse-domain directory this client reads its own classes from. */
const NAMESPACE = 'com.github.copilot'

const HOOKS_DIR = 'hooks'
const POLICY_DOCUMENT = '.stamity/generated/agent-tool-policies.json'

const RULE_REASON =
  'the Copilot CLI container defines com.github.copilot/rules/ but its file format is not stated ' +
  '(docs.github.com cli-plugin-reference, 2026-09-20) and this engine has no Copilot rule ' +
  'surface; stamity plugin setup writes .github/instructions/ for VS Code and the CLI alike'

const MCP_REASON = 'MCP server selection and credential references are repository-owned'

const COMMAND_REASON =
  'the file extension under com.github.copilot/commands/ is not stated on the reference page ' +
  "(2026-09-20); the repository surface's .prompt.md spelling is used and the route proof measures it"

const HOOKS_REASON =
  '${PLUGIN_ROOT} expansion inside a hook command is not stated on the hooks reference ' +
  '(2026-09-20); the route proof measures it'

function hookFile(path) {
  return `${HOOKS_DIR}/${path.slice(path.lastIndexOf('/') + 1)}`
}

/** See `clients/claude.mjs` for the three-outcome contract this function shares. */
export function place(row) {
  const path = row.path

  if (path.startsWith('.github/agents/')) {
    return { path: `${NAMESPACE}/agents/${path.slice('.github/agents/'.length)}`, class: 'agent' }
  }
  if (path.startsWith('.github/prompts/')) {
    return { path: `${NAMESPACE}/commands/${path.slice('.github/prompts/'.length)}`, class: 'command' }
  }
  if (path.startsWith('.agents/skills/')) {
    return { path: `skills/${path.slice('.agents/skills/'.length)}`, class: 'skill' }
  }
  if (path === '.github/hooks/stamity.json') return { path: `${NAMESPACE}/hooks/hooks.json`, class: 'hooks' }
  if (path === POLICY_DOCUMENT) return { path: `${HOOKS_DIR}/agent-tool-policies.json`, class: 'hooks' }
  if (path.startsWith('.stamity/generated/hooks/copilot/')) return { path: hookFile(path), class: 'hooks' }

  // Rules: repository-owned, see RULE_REASON.
  if (path.startsWith('.github/instructions/')) return null
  if (path === '.github/workflows/copilot-setup-steps.yml') return null
  if (path === '.vscode/mcp.json') return null
  if (path === 'AGENTS.md') return null
  if (path.startsWith('.stamity/')) return null

  return undefined
}

export const DECLARED_CLASSES = {
  rule: { status: 'repository-owned', reason: RULE_REASON },
  mcp: { status: 'repository-owned', reason: MCP_REASON },
}

export const CARRIED_CLASS_REASONS = {
  command: COMMAND_REASON,
  hooks: HOOKS_REASON,
}

export const INVOCATION = {
  agents: '/agent <id> (or --agent=<id>)',
  commands: '/<id>',
  skills: '/<id>',
}

export const CLIENT_FLOOR = {
  version: 'unknown',
  reason:
    'no minimum CLI version for plugins stated on the four docs.github.com pages read 2026-09-20; ' +
    'the CLI itself needs Node 22 or later',
}

export const PREREQUISITES = { copilot: 'npm install -g @github/copilot' }

export const SETUP_COMMAND_PATH = `${NAMESPACE}/commands/st-setup.prompt.md`

export const ASSETS = []

/** Agent Plugins puts the manifest at the root of the package. */
export const MANIFEST_PATH = 'plugin.json'

/** The closed schema's key set and nothing else — an extra key fails validation outright. */
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
  return `# stamity for the GitHub Copilot CLI

A plugin root built from the stamity corpus at version ${version}, commit ${sourceCommit} (${sourceCommitDate}).

## Install

\`\`\`sh
npm install -g @github/copilot
copilot plugin marketplace add ${slug}
copilot plugin install stamity@stamity
\`\`\`

A plugin named \`stamity\` already installed from another marketplace is the client's own refusal,
not this root's: uninstall the other one, or install from a marketplace you control.

## Invoke

- agents: \`${INVOCATION.agents}\`
- commands: \`${INVOCATION.commands}\`
- skills: \`${INVOCATION.skills}\`

Run \`/st-setup\` once after installing. It writes the repository-owned half this root does not
carry — the charter with this repository's facts and gates, and the client configuration — through
the runtime bundled at \`runtime/\`.

## Pin and roll back

\`\`\`sh
copilot plugin update stamity
\`\`\`

The marketplace entry resolves to a branch, so an install takes whatever that branch points at.
Pin by adding the marketplace at a tag; roll back by reinstalling at the previous tag.

## What this root does not carry

- rules — ${RULE_REASON}
- MCP servers — ${MCP_REASON}
- the charter (\`AGENTS.md\`) and every \`.stamity/\` state file: they describe one repository, and
  this root is installed into many.

Two spellings in this root are unverified against a vendor page and are measured by the route
proof rather than promised here: ${COMMAND_REASON}; and ${HOOKS_REASON}.

Copilot in VS Code has no plugin container at all — the same artifacts reach it as repository
files written by \`stamity plugin setup\`.

Source: ${identity.homepage} · ${identity.repository}
`
}
