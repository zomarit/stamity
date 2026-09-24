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
// NO COMPONENT FIELD IS DECLARED. The manifest carries identity and version and nothing else.
// The two vendor documents disagreed — the plugins reference reads as though a declared field
// REPLACES the default scan — and the schema settles it, because each of the four component
// fields describes its own first form in the same words:
//
//   agents    "Path to additional agent file (in addition to those in the agents/ directory,
//              if it exists), relative to the plugin root"
//   commands  "Path to additional command file or skill directory (in addition to those in the
//              commands/ directory, if it exists), relative to the plugin root"
//   skills    "Path to additional skill directory (in addition to those in the skills/
//              directory, if it exists), relative to the plugin root"
//   hooks     "Path to file with additional hooks (in addition to those in hooks/hooks.json,
//              if it exists), relative to the plugin root"
//
// Every one of them ADDS to the default scan. This root puts its agents at `agents/`, its
// commands at `commands/`, its skills at `skills/` and its hooks at `hooks/hooks.json` — the
// four defaults exactly — so declaring any of them asks the client to discover each file twice.
// `skills` and `hooks` were already omitted on that reading; `agents` (a ten-entry file list)
// and `commands` (`./commands/`) were declared on the other one and are omitted now for the
// same reason. `claude plugin validate --strict` accepts the root either way: the fields are
// optional, so dropping them removes a duplicate registration and forfeits nothing.
//
// A field would be declared here only for an artifact placed somewhere OTHER than its default —
// which is what "additional" means and what this root has no instance of.
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
  // `.stamity/generated/` is NOT part of the catch-all below. The two rows this container takes
  // from it — the policy document and this client's hook scripts — are matched by name above;
  // anything else under it is a generated document a hook or an agent is meant to READ, and
  // where it lands inside a plugin root is a placement decision. Returning `undefined` sends it
  // to the layout's refusal, so the next such document is placed deliberately rather than
  // dropped into the same silence as the state tree.
  if (path.startsWith('.stamity/generated/')) return undefined
  // The rest of `.stamity/` is this repository's own state — the ledger, the run records, the
  // learnings — and describes one checkout. Dropped, with the reason the capability file carries.
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
 * reference did not list it, and the installed client settled it on 2026-09-22 (`unknown command
 * 'rollback'` on 2.1.278). A consumer planning a downgrade needs to know that the supported route
 * is the three-command reinstall the lifecycle walk measured that day, whose third command —
 * `plugin update` at the install's scope — is what re-records the version.
 *
 * The refresh carries `@stamity` and `--scope project` because `plugin update` defaults to user
 * scope: MEASURED on Claude Code 2.1.278 (2026-09-20), the bare `claude plugin update stamity`
 * refuses a project-scope install with `Plugin "stamity" is not installed at scope user`, and the
 * qualified spelling is what the release's lifecycle walk executed on 2026-09-22 (exit 0,
 * `updateOutcome: "updated"`). The scope has to match the install's, which is why the clause
 * names the user-scope counterpart instead of implying one flag fits both installs.
 */
export const DISTRIBUTION = {
  note:
    'an operator runs `claude plugin marketplace add <owner/repo | git URL#ref | local path>` and ' +
    '`claude plugin install stamity@stamity --scope project`, which writes `enabledPlugins` alone into ' +
    "the project's `.claude/settings.json`; `marketplace add` declares the marketplace in the " +
    "configuration directory's user settings (measured on Claude Code 2.1.278, 2026-09-22, and " +
    '2.1.280, 2026-09-23); a third-party marketplace has auto-update off by default, so ' +
    '`claude plugin update stamity@stamity --scope project` is the refresh — the scope has to match ' +
    'the install\'s, so a user-scope install refreshes with `--scope user` — and a marketplace added ' +
    'at a tag or a commit is the pin. A `rollback` subcommand is settled absent: one vendor page quoted it in slash form ' +
    'and the CLI reference omitted it (code.claude.com/docs/en/plugin-marketplaces and ' +
    'code.claude.com/docs/en/cli-reference, accessed 2026-09-20), and `claude plugin rollback stamity` ' +
    "answers `error: unknown command 'rollback'` on 2.1.278 (measured 2026-09-22). The route back is " +
    'three commands, walked the same day: the marketplace re-added at the previous tag, ' +
    '`claude plugin install stamity@stamity --scope project`, then `claude plugin update stamity@stamity --scope project` ' +
    '— the first two answer already on disk and already installed and leave the recorded version where ' +
    'it was, and the third is what re-records it',
}

/**
 * Build the container manifest: identity and version, and no component field at all — every one
 * of the four is additive over a default scan this root already sits on. See the header.
 */
export function buildManifest({ identity, version }) {
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

## Pin, update, roll back

The marketplace entry above resolves to a branch, so an install takes whatever that branch points
at. Pin by adding the marketplace at a tag or a commit instead of \`#plugin-dist\`, and record the
pin with the repository rather than in a shell history. The refresh, at the install's own scope:

\`\`\`sh
claude plugin update stamity@stamity --scope project
\`\`\`

Rolling back takes three commands, not two — measured 2026-09-22 on Claude Code 2.1.278: the
marketplace re-added at the previous tag answers that the source is already on disk, the reinstall
answers already installed, and the third command is what re-records the version. A \`rollback\`
subcommand answers \`error: unknown command 'rollback'\` on that build.

\`\`\`sh
claude plugin marketplace add ${slug}#plugins/v<previous>
claude plugin install stamity@stamity --scope project
claude plugin update stamity@stamity --scope project
\`\`\`

The route in full, as \`stamity-plugin.json\` records it: ${DISTRIBUTION.note}.

## What this root does not carry

- glob-scoped rules — ${RULE_REASON}
- MCP servers — ${MCP_REASON}
- the charter (\`AGENTS.md\`, \`CLAUDE.md\`) and every \`.stamity/\` state file: they describe one
  repository, and this root is installed into many.

Source: ${identity.homepage} · ${identity.repository}
`
}
