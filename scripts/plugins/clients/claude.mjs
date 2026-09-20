// The Claude Code plugin container: where every emitted row lands inside a `claude/` root,
// what the root's own manifest declares, and what the root tells its operator.
//
// Sources, all read 2026-09-20:
//   - https://json.schemastore.org/claude-code-plugin-manifest.json — the manifest schema.
//   - https://code.claude.com/docs/en/plugins-reference — the component fields and, decisively,
//     which of them ADD to a default discovery path rather than replacing it.
//   - https://code.claude.com/docs/en/plugin-marketplaces — the version floor below.
//
// Two rulings this table encodes, both of them subtractions.
//
// `skills` and `hooks` are OMITTED from the manifest. The reference documents both as additive:
// a declared `skills` path is searched IN ADDITION TO the default `skills/` directory, and a
// declared `hooks` file is loaded IN ADDITION TO the default `hooks/hooks.json`. This root puts
// its files at exactly those defaults, so naming them would ask the client to discover the same
// artifact twice. `agents` is a file list because that is the shape the schema takes.
//
// `commands` IS declared, and the two vendor documents disagree about what that means: the
// plugins reference reads as a replacement of the default scan, while the schema's own
// description for the field says "in addition to those in the commands/ directory". The
// declaration is the plan's, kept because `claude plugin validate --strict` accepts it and
// because a client that replaces the default still finds every command; if the additive reading
// is the true one, the cost is a duplicate registration of the same ten files and the fix is to
// drop the field exactly as `skills` and `hooks` are dropped. Measuring an installed client is
// what settles it — an invocation leg, not this table.
//
// `rules` does not exist as a manifest field at all. A glob-scoped rule therefore cannot ride in
// this container; `stamity plugin setup` writes it into the repository's own `.claude/rules/`,
// and a rule with no globs is already delivered here as a skill by the engine's rule-delivery
// default. The class is declared `repository-owned` with that reason rather than quietly dropped.

/** The environment variable this client expands inside a plugin's own files. */
export const ROOT_VARIABLE = 'CLAUDE_PLUGIN_ROOT'

/** Where the hook scripts and the policy document live in EVERY root, this one included. */
const HOOKS_DIR = 'hooks'

/** The policy document the pre-tool-use guard reads, at its one fixed name. */
const POLICY_DOCUMENT = '.stamity/generated/agent-tool-policies.json'

const RULE_REASON =
  'the Claude Code plugin manifest has no rules field ' +
  '(json.schemastore.org/claude-code-plugin-manifest.json, 2026-09-20); glob-scoped rules are ' +
  'written by stamity plugin setup into .claude/rules/; glob-less rules ride as skills'

const MCP_REASON = 'MCP server selection and credential references are repository-owned'

/** `<root>/hooks/<basename>`, the one hook convention all four containers share. */
function hookFile(path) {
  return `${HOOKS_DIR}/${path.slice(path.lastIndexOf('/') + 1)}`
}

/**
 * Where one planned row lands inside this root.
 *
 * Three outcomes, and the third is the point: a path this table NAMES maps, a path it names as
 * repository-owned returns `null`, and a path it has never heard of returns `undefined` so the
 * generator refuses the build instead of guessing a home for an artifact class nobody reviewed.
 */
export function place(row) {
  const path = row.path

  if (path.startsWith('.claude/agents/')) {
    return { path: `agents/${path.slice('.claude/agents/'.length)}`, class: 'agent' }
  }
  if (path.startsWith('.claude/commands/')) {
    return { path: `commands/${path.slice('.claude/commands/'.length)}`, class: 'command' }
  }
  if (path.startsWith('.claude/skills/')) {
    return { path: `skills/${path.slice('.claude/skills/'.length)}`, class: 'skill' }
  }
  // Glob-scoped rules: repository-owned, see RULE_REASON.
  if (path.startsWith('.claude/rules/')) return null
  if (path === '.claude/settings.json') {
    // The settings file is two halves with two owners. The `hooks` half is the plugin's, and it
    // is re-emitted alone as the plugin hooks document; the `permissions` half describes what an
    // operator lets THEIR agent do in THEIR repository and travels with no plugin.
    const settings = JSON.parse(row.content)
    if (settings.hooks === undefined) return null
    return { path: `${HOOKS_DIR}/hooks.json`, class: 'hooks', content: `${JSON.stringify({ hooks: settings.hooks }, null, 2)}\n` }
  }
  if (path === POLICY_DOCUMENT) return { path: `${HOOKS_DIR}/agent-tool-policies.json`, class: 'hooks' }
  if (path.startsWith('.stamity/generated/hooks/claude/')) return { path: hookFile(path), class: 'hooks' }

  // The vendor-neutral skills tree is a surface this client does not read; its own `.claude/skills/`
  // copy above is what travels.
  if (path.startsWith('.agents/skills/')) return null
  if (path === 'CLAUDE.md' || path === 'AGENTS.md' || path === '.mcp.json') return null
  if (path.startsWith('.stamity/')) return null

  return undefined
}

/** Per-class status for everything this container does NOT carry. Carried classes are counted. */
export const DECLARED_CLASSES = {
  rule: { status: 'repository-owned', reason: RULE_REASON },
  mcp: { status: 'repository-owned', reason: MCP_REASON },
}

/** The literal an operator types to reach each carried class. */
export const INVOCATION = {
  agents: '@stamity:<id>',
  commands: '/stamity:<id>',
  skills: '/stamity:<id>',
}

export const CLIENT_FLOOR = {
  version: '2.1.224',
  citation: { url: 'https://code.claude.com/docs/en/plugin-marketplaces', accessDate: '2026-09-20' },
  reason: 'the archive-source floor; no floor for the plugin system as a whole is stated',
}

/** Tool prerequisites beyond Node and git, which every root declares. */
export const PREREQUISITES = {}

/** Where the generated `st-setup` command lands, or `null` for a client with no command class. */
export const SETUP_COMMAND_PATH = 'commands/st-setup.md'

/** Files copied verbatim out of the checkout into this root. */
export const ASSETS = []

/** The container manifest, at the path this client discovers it by. */
export const MANIFEST_PATH = '.claude-plugin/plugin.json'

/**
 * How this root is served, refreshed and — the part worth stating — rolled back. Recorded in the
 * capability file and quoted by the README, so the two cannot drift apart.
 *
 * The rollback half is a NEGATIVE fact, and it is here because silence would read as either
 * answer: one vendor page quoted a `rollback` subcommand in slash form that day and the CLI
 * reference did not list it. A consumer planning a downgrade needs to know that the supported
 * route is a reinstall at the previous pin until an installed client says otherwise.
 */
export const DISTRIBUTION = {
  note:
    'an operator runs `claude plugin marketplace add <owner/repo | git URL#ref | local path>` and ' +
    '`claude plugin install stamity@stamity --scope project`, which writes `enabledPlugins` and ' +
    '`extraKnownMarketplaces`; a third-party marketplace has auto-update off by default, so ' +
    '`claude plugin update stamity` is the refresh and a marketplace added at a tag or a commit is ' +
    'the pin. A `rollback` subcommand is not established — one vendor page quoted it in slash form ' +
    'and the CLI reference omitted it (code.claude.com/docs/en/plugin-marketplaces and ' +
    'code.claude.com/docs/en/cli-reference, accessed 2026-09-20) — so the route back is a reinstall ' +
    'at the previous pin until an installed client is measured'
}

/**
 * Build the container manifest. `agents` is the sorted file list the schema takes; `commands` is
 * declared at the plan's instruction; `skills` and `hooks` are omitted — see the header for both.
 */
export function buildManifest({ identity, version, agentPaths }) {
  return {
    $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
    name: identity.name,
    version,
    description: identity.description,
    author: identity.author,
    homepage: identity.homepage,
    repository: identity.repository,
    license: identity.license,
    keywords: identity.keywords,
    agents: agentPaths.map((path) => `./${path}`).toSorted(),
    commands: './commands/',
  }
}

/** The page an operator reads before installing: the route in, the route to a pin, the route back. */
export function renderReadme({ identity, version, sourceCommit, sourceCommitDate, slug }) {
  return `# stamity for Claude Code

A plugin root built from the stamity corpus at version ${version}, commit ${sourceCommit} (${sourceCommitDate}).

## Install

\`\`\`sh
claude plugin marketplace add ${slug}#plugin-dist
claude plugin install stamity@stamity --scope project
\`\`\`

## Invoke

- agents: \`${INVOCATION.agents}\`
- commands: \`${INVOCATION.commands}\` (the bare \`/st-work\` form resolves when it is unambiguous)
- skills: \`${INVOCATION.skills}\`

Run \`/stamity:st-setup\` once after installing. It writes the repository-owned half this root
does not carry — the charter with this repository's facts and gates, and the client configuration —
through the runtime bundled at \`runtime/\`.

## Pin and roll back

The marketplace entry above resolves to a branch, so an install takes whatever that branch points
at. Pin by adding the marketplace at a tag or a commit instead of \`#plugin-dist\`, and record the
pin with the repository rather than in a shell history.

\`\`\`sh
claude plugin update stamity
\`\`\`

The route in full, as \`stamity-plugin.json\` records it: ${DISTRIBUTION.note}. Run
\`claude plugin --help\` on the installed client and prefer a \`rollback\` subcommand if yours
lists one.

## What this root does not carry

- glob-scoped rules — ${RULE_REASON}
- MCP servers — ${MCP_REASON}
- the charter (\`AGENTS.md\`, \`CLAUDE.md\`) and every \`.stamity/\` state file: they describe one
  repository, and this root is installed into many.

Source: ${identity.homepage} · ${identity.repository}
`
}
