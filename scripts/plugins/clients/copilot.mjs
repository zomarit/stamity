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
// Two spellings the vendor pages do NOT state. One of them is now MEASURED, against GitHub
// Copilot CLI 1.0.85 in a scratch `COPILOT_HOME`, by the binary leg of
// `test/ci/pluginPackages.copilot.test.ts`; the other is still open and says so on its class.
//
//   1. The FILE EXTENSION under `com.github.copilot/commands/` — MEASURED, and the answer is
//      NOT the repository surface's spelling. The CLI derives a command's id by stripping ONE
//      extension from the file name: `st-work.prompt.md` registers `st-work.prompt`, and
//      `st-work.md` registers `st-work`. The corpus bodies this root carries name `/st-work`
//      126 times, so `.prompt.md` would publish a root whose own instructions point at commands
//      that do not exist. The container therefore takes `<id>.md`, and `.prompt.md` stays what
//      it always was — this client's convention for the REPOSITORY's `.github/prompts/`.
//   2. `${PLUGIN_ROOT}` expansion INSIDE a hook command — still not stated. The hooks reference
//      documents the variable for MCP `args`/`env`/`cwd`, agent frontmatter and LSP
//      configuration, and says nothing about a hook command string or about exporting it to the
//      hook process. The commands are written root-relative regardless, because the alternative
//      — a repository-relative path — is certainly wrong for an installed plugin. The class
//      carries the gap as its reason rather than letting a consumer inherit it silently.

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
  '(docs.github.com cli-plugin-reference, 2026-09-20); measured against GitHub Copilot CLI ' +
  '1.0.85 in a scratch COPILOT_HOME: <id>.md registers the id <id>, while <id>.prompt.md ' +
  'registers <id>.prompt, so the container takes <id>.md and the repository keeps .prompt.md'

const HOOKS_REASON =
  '${PLUGIN_ROOT} expansion inside a hook command, and its export to a hook process, are not ' +
  'stated on the hooks reference (docs.github.com hooks-reference, 2026-09-20); the variable is ' +
  'the only documented handle on the installed root, so every command uses it unmeasured'

function hookFile(path) {
  return `${HOOKS_DIR}/${path.slice(path.lastIndexOf('/') + 1)}`
}

/** The repository spelling of a prompt file, which does NOT travel into the container. */
const PROMPTS_PREFIX = '.github/prompts/'
const PROMPT_SUFFIX = '.prompt.md'

/**
 * `com.github.copilot/commands/<id>.md`, measured rather than inferred — see COMMAND_REASON and
 * the header. A name that is not a `.prompt.md` travels unchanged: this client emits nothing
 * else into `.github/prompts/`, and renaming a shape nobody has seen would be a second guess.
 */
function commandFile(path) {
  const name = path.slice(PROMPTS_PREFIX.length)
  const id = name.endsWith(PROMPT_SUFFIX) ? name.slice(0, -PROMPT_SUFFIX.length) : null
  return `${NAMESPACE}/commands/${id === null ? name : `${id}.md`}`
}

/** See `clients/claude.mjs` for the three-outcome contract this function shares. */
export function place(row) {
  const path = row.path

  if (path.startsWith('.github/agents/')) {
    return { path: `${NAMESPACE}/agents/${path.slice('.github/agents/'.length)}`, class: 'agent' }
  }
  if (path.startsWith(PROMPTS_PREFIX)) {
    return { path: commandFile(path), class: 'command' }
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
  citation: {
    url: 'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference',
    accessDate: '2026-09-20',
  },
  reason:
    'no minimum CLI version for plugins stated on the four docs.github.com pages read 2026-09-20; ' +
    'the CLI itself needs Node 22 or later',
}

export const PREREQUISITES = { copilot: 'npm install -g @github/copilot' }

export const SETUP_COMMAND_PATH = `${NAMESPACE}/commands/st-setup.md`

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

\`copilot plugin install ./copilot\` takes this directory straight off disk, which is the route
the route proof uses; the vendor deprecates direct installs in favour of the marketplace form
above (measured on 1.0.85, 2026-09-20).

A plugin named \`stamity\` already installed from another marketplace is the client's own refusal,
not this root's: uninstall the other one, or install from a marketplace you control.

## Where an install lands, and what a reinstall is for

\`\`\`
~/.copilot/installed-plugins/<marketplace>/<plugin>   # installed through a marketplace
~/.copilot/installed-plugins/_direct/<source-id>/     # installed directly
\`\`\`

\`COPILOT_HOME\` moves both. An install is a CACHED COPY, so editing a local plugin directory
changes nothing until you reinstall it — \`copilot plugin install\` again, or
\`copilot plugin update stamity\` for a marketplace install. \`copilot plugin list\` names what is
installed, and \`copilot plugin uninstall stamity\` removes it.

Set \`COPILOT_AUTO_UPDATE=false\` to stop the CLI downloading a newer version of itself behind a
run you meant to keep reproducible.

## Invoke

- agents: \`${INVOCATION.agents}\`
- commands: \`${INVOCATION.commands}\`
- skills: \`${INVOCATION.skills}\`

A project's own \`.github/skills/\`, \`.agents/skills/\` and \`.claude/skills/\` are searched before
a plugin's, so a skill id this root ships is shadowed by a repository file of the same id.

Run \`/st-setup\` once after installing. It writes the repository-owned half this root does not
carry — the charter with this repository's facts and gates, and the client configuration —
through the runtime bundled at \`runtime/\`.

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

One spelling in this root is unverified against a vendor page and is measured by the route proof
rather than promised here: ${HOOKS_REASON}.

The vendor's plugin-client list names the Copilot CLI, the cloud agent and the Copilot app; VS
Code is not on it (read 2026-09-20). The same artifacts reach Copilot in VS Code as repository
files written by \`stamity plugin setup\`.

Source: ${identity.homepage} · ${identity.repository}
`
}
