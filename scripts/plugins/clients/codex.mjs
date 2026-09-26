// The Codex plugin container — an Agent Plugins 1.0 package, the same closed manifest the Copilot
// container uses, and the narrowest of the four roots: skills and hooks, nothing else.
//
// Sources, all read 2026-09-20:
//   - https://agent-plugins.org/schemas/1.0.0/plugin.schema.json — the closed manifest schema,
//     vendored byte-for-byte at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json`.
//   - https://developers.openai.com/plugins/build/plugins and https://learn.chatgpt.com/docs/plugins
//     — the container's classes, its hook discovery, and the marketplace entry rules.
//   - https://learn.chatgpt.com/docs/hooks — the twelve event names and the trust rule.
//   - the installed `codex plugin --help` surface (codex-cli 0.154.0) for the verbs below.
//
// Two facts about the ADDRESS SPACE, recorded here because the README and the capability file
// both lean on them. The root variable is `PLUGIN_ROOT` (with `PLUGIN_DATA`, and
// `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` carried for compatibility), exported to the hook
// process; whether the client or the shell expands it inside a `command` STRING is not stated on
// any page read, and the vendor's own example writes it there anyway, so this root does too. Hook
// commands run with the SESSION working directory, not the plugin root — which is why the runner
// the commands launch is addressed absolutely and the repository it reports on is `process.cwd()`.
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

/**
 * Why `hooks: carried` is not the same promise here that it is in the other three roots.
 *
 * The file travels and the client discovers it — that much is measured. What is NOT promised is
 * that a hook in it ever runs: this client skips a plugin's hooks until the operator trusts them,
 * and the one headless lane anybody measured ran none at all. A consumer reading `carried` without
 * that sentence would plan a gate around an artifact that enforces nothing on their lane, which is
 * the exact failure `.github/client-contracts.md` records for the 1.7.0 window.
 */
const HOOKS_REASON =
  'the document travels and this client discovers it at the default hooks/hooks.json, but a ' +
  "plugin's hooks are skipped until the operator trusts them (developers.openai.com/plugins/" +
  'build/plugins and learn.chatgpt.com/docs/hooks, 2026-09-20), and headless codex exec on ' +
  'codex-cli 0.154.0 ran no project hook at all (measured 2026-09-15) — carried means shipped ' +
  'and discoverable here, never enforced'

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

export const DECLARED_CLASSES = {
  agent: { status: 'repository-owned', reason: AGENT_REASON },
  command: { status: 'repository-owned', reason: COMMAND_REASON },
  rule: { status: 'repository-owned', reason: RULE_REASON },
  mcp: { status: 'repository-owned', reason: MCP_REASON },
}

/** A carried class whose `carried` needs a caveat beside it — see {@link HOOKS_REASON}. */
export const CARRIED_CLASS_REASONS = { hooks: HOOKS_REASON }

export const INVOCATION = {
  skills: '$<id>',
}

export const CLIENT_FLOOR = {
  version: 'unknown',
  citation: { url: 'https://developers.openai.com/plugins/build/plugins', accessDate: '2026-09-20' },
  reason:
    'no minimum version is stated on any of the eight vendor pages read 2026-09-20 (the build ' +
    'and submission pages above, learn.chatgpt.com/docs/plugins, /docs/hooks and ' +
    '/docs/config-file/config-reference, the Agent Plugins specification and its 1.0.0 schema); ' +
    'the surface was measured against codex-cli 0.154.0',
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

export function renderReadme({ identity, version, sourceCommit, sourceCommitDate, slug, distribution }) {
  // The resolved `stamity.distribution`, so a fork's own branch and tag pattern are what the page
  // names — the refs its remote carries, and the ones the distribution README prints.
  const { branch, tagPattern } = distribution
  const tag = tagPattern.replaceAll('<version>', version)
  const previous = tagPattern.replaceAll('<version>', '<previous>')
  return `# stamity for Codex

A plugin root built from the stamity corpus at version ${version}, commit ${sourceCommit} (${sourceCommitDate}).

## Install

\`\`\`sh
codex plugin marketplace add ${slug} --ref ${branch}
codex plugin add stamity@stamity
\`\`\`

The \`--ref\` is not optional. Without it the client checks out the repository's default branch,
which carries no Codex catalog, falls back to that branch's Claude catalog and installs the npm
package that catalog names — on the private mirror it was measured against, the public package,
with no \`runtime/\` and no hooks. Measured on codex-cli 0.155.1 on 2026-09-24, as is
the \`--ref\` form above installing this root.

\`/plugins\` lists what the running session has installed, and is the view to check the install
against before anything else.

## Invoke

- skills: \`${INVOCATION.skills}\`

A skill this root adds is picked up by a FRESH session — installing or upgrading mid-session does
not put it in reach of the session that ran the install. Start a new one before you look for it.

## Set the repository up

This root carries no \`st-setup\` command — ${COMMAND_REASON}. Run the setup yourself instead,
once per repository, from that repository's directory:

\`\`\`sh
node "<plugin root>/runtime/locate.mjs" -- plugin setup --client codex -y --plugin-root "<plugin root>"
\`\`\`

\`<plugin root>\` is a path YOU substitute, and \`$PLUGIN_ROOT\` is not it: that variable is
exported to hook processes and to nothing else, so in your own shell it expands to nothing and
the line above would send \`node\` to \`/runtime/locate.mjs\`. An install through the
marketplace above puts this root at

\`\`\`
<CODEX_HOME>/plugins/cache/${identity.name}/${identity.name}/${version}/
\`\`\`

where \`<CODEX_HOME>\` is \`~/.codex\` unless you have set it, the first \`${identity.name}\`
is the marketplace's name and the second is this plugin's. Run \`codex plugin list --json\` if
the version directory is not the one above.

It writes the repository-owned half this root does not carry: the charter with this repository's
facts and gates, and the client configuration.

## Hooks

The hook document is at \`hooks/hooks.json\`, where this client discovers it by default. Three
steps still stand between an installed plugin and a hook that runs: \`features.hooks = true\` in
\`.codex/config.toml\` (written by the setup above), project trust in the Codex home config, and a
per-hook trust review through \`/hooks\`. A headless run proves discovery, never enforcement.

## Pin, roll back, remove

The install above resolves to a branch, so it takes whatever that branch points at, and
\`codex plugin marketplace upgrade\` refreshes it. Pin by adding the marketplace at this version's
tag instead:

\`\`\`sh
codex plugin marketplace add ${slug} --ref ${tag}
codex plugin add stamity@stamity
\`\`\`

Roll back by removing the plugin and the marketplace, re-adding the marketplace at the previous tag
and installing again:

\`\`\`sh
codex plugin remove stamity@stamity
codex plugin marketplace remove stamity
codex plugin marketplace add ${slug} --ref ${previous}
codex plugin add stamity@stamity
\`\`\`

The removal comes first because a git marketplace already on record is not re-pointed in place:
the re-add at another ref answers "already added from a different source" (codex-cli 0.155.1,
measured 2026-09-24). \`codex plugin remove\` uninstalls and clears the local cache.

## Where this root is read

The CLI. This client's IDE extension reads no plugins at all, so an editor session sees only what
\`plugin setup\` wrote into the repository — which is another reason to run the setup line above
rather than treat the install as the whole story.

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
