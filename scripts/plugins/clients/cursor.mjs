// The Cursor plugin container: where every emitted row lands inside a `cursor/` root, what the
// root's own manifest declares, and how an organization serves it.
//
// Sources, all read 2026-09-20:
//   - https://cursor.com/docs/reference/plugins — the manifest field list. No published JSON
//     schema exists for it, which is why this manifest declares no `$schema`.
//   - https://cursor.com/docs/skills — a command is a skill carrying
//     `disable-model-invocation: true`; the `commands/` discovery path reads FILES.
//   - https://cursor.com/docs/plugins — the team-marketplace route quoted in DISTRIBUTION.
//
// One placement decision worth stating. The engine already renders this client's touchpoint
// commands as SKILL DIRECTORIES (`.cursor/skills/<id>/SKILL.md`), because that is the shape this
// client reads a command in. The container's `commands` field points at a directory of files, so
// pointing it at those directories would declare a surface that does not match what is there.
// The commands therefore ride under `skills/`, exactly as the client's own conversion produces
// them, and `classes.command` stays CARRIED with a reason naming the placement — an operator
// reading the capability file learns both that the commands travel and where they landed.

/** The environment variable this client expands inside a plugin's own files. */
export const ROOT_VARIABLE = 'CURSOR_PLUGIN_ROOT'

const HOOKS_DIR = 'hooks'
const POLICY_DOCUMENT = '.stamity/generated/agent-tool-policies.json'

const COMMAND_REASON =
  'this client converts a command into a skill carrying disable-model-invocation: true, and its ' +
  'commands/ discovery reads files rather than directories (cursor.com/docs/skills and ' +
  '/docs/reference/plugins, 2026-09-20), so the nine touchpoints ride under skills/ as the ' +
  'client renders them'

const MCP_REASON = 'MCP server selection and credential references are repository-owned'

function hookFile(path) {
  return `${HOOKS_DIR}/${path.slice(path.lastIndexOf('/') + 1)}`
}

/** See `clients/claude.mjs` for the three-outcome contract this function shares. */
export function place(row) {
  const path = row.path

  if (path.startsWith('.cursor/rules/')) {
    return { path: `rules/${path.slice('.cursor/rules/'.length)}`, class: 'rule' }
  }
  if (path.startsWith('.cursor/agents/')) {
    return { path: `agents/${path.slice('.cursor/agents/'.length)}`, class: 'agent' }
  }
  // The command-as-skill surface: the id keeps its own directory under `skills/`.
  if (path.startsWith('.cursor/skills/')) {
    return { path: `skills/${path.slice('.cursor/skills/'.length)}`, class: 'command' }
  }
  if (path.startsWith('.agents/skills/')) {
    return { path: `skills/${path.slice('.agents/skills/'.length)}`, class: 'skill' }
  }
  if (path === '.cursor/hooks.json') return { path: `${HOOKS_DIR}/hooks.json`, class: 'hooks' }
  if (path.startsWith('.cursor/hooks/')) return { path: hookFile(path), class: 'hooks' }
  if (path === POLICY_DOCUMENT) return { path: `${HOOKS_DIR}/agent-tool-policies.json`, class: 'hooks' }
  if (path.startsWith('.stamity/generated/hooks/cursor/')) return { path: hookFile(path), class: 'hooks' }

  if (path === '.cursor/mcp.json' || path === 'AGENTS.md') return null
  if (path.startsWith('.stamity/')) return null

  return undefined
}

export const DECLARED_CLASSES = {
  mcp: { status: 'repository-owned', reason: MCP_REASON },
}

/** A reason attached to a class this root DOES carry, where the placement needs explaining. */
export const CARRIED_CLASS_REASONS = {
  command: COMMAND_REASON,
}

export const INVOCATION = {
  agents: '/<id>',
  commands: '/<id>',
  skills: '/<id>',
}

export const CLIENT_FLOOR = {
  version: 'unknown',
  reason:
    'no minimum version stated on cursor.com/docs/reference/plugins, cursor.com/docs/plugins or ' +
    'the CLI reference (accessed 2026-09-20)',
}

export const PREREQUISITES = {}

export const SETUP_COMMAND_PATH = 'skills/st-setup/SKILL.md'

/** The brand asset the manifest's `logo` field resolves to. Absent from the checkout is a refusal. */
export const LOGO_PATH = 'assets/logo.svg'
export const ASSETS = [{ from: LOGO_PATH, to: LOGO_PATH }]

export const MANIFEST_PATH = '.cursor-plugin/plugin.json'

/** How an organization serves this root. Recorded in the capability file and the README alike. */
export const DISTRIBUTION = {
  note:
    'an organization adds a team marketplace in the Cursor dashboard (Dashboard → Plugins & MCPs → ' +
    'Team Marketplaces → Add Marketplace), sets the install mode (Default Off, Default On, ' +
    'Required), may restrict it under Marketplace Settings → Marketplace Access, and Cursor ' +
    're-indexes a marketplace at most once every 10 minutes, batching rapid pushes to the latest ' +
    'commit (cursor.com/docs/plugins, accessed 2026-09-20)',
}

export function buildManifest({ identity, version }) {
  return {
    name: identity.name,
    version,
    description: identity.description,
    author: identity.author,
    homepage: identity.homepage,
    repository: identity.repository,
    license: identity.license,
    keywords: identity.keywords,
    logo: LOGO_PATH,
    rules: './rules/',
    agents: './agents/',
    skills: './skills/',
    hooks: './hooks/hooks.json',
  }
}

export function renderReadme({ identity, version, sourceCommit, sourceCommitDate }) {
  return `# stamity for Cursor

A plugin root built from the stamity corpus at version ${version}, commit ${sourceCommit} (${sourceCommitDate}).

## Install

${DISTRIBUTION.note.replace(/^an organization/, 'An organization')}.

For a local trial of this root without a marketplace:

\`\`\`sh
agent --plugin-dir ./cursor
\`\`\`

## Invoke

- agents: \`${INVOCATION.agents}\`
- commands: \`${INVOCATION.commands}\`
- skills: \`${INVOCATION.skills}\`

Run \`/st-setup\` once after installing. It writes the repository-owned half this root does not
carry — the charter with this repository's facts and gates, and the client configuration — through
the runtime bundled at \`runtime/\`.

## Pin and roll back

A team marketplace imported from a repository tracks that repository's latest commit, so the
version an organization serves is whichever commit its mirror branch points at. Pin by pointing
the mirror branch at a tag and moving it deliberately; roll back by moving it back. Allow up to
ten minutes for the re-index either way.

## What this root does not carry

- MCP servers — ${MCP_REASON}
- the charter (\`AGENTS.md\`) and every \`.stamity/\` state file: they describe one repository, and
  this root is installed into many.

The nine touchpoint commands travel under \`skills/\`: ${COMMAND_REASON}.

Source: ${identity.homepage} · ${identity.repository}
`
}
