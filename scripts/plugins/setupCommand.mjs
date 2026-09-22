// `st-setup`: the one command a plugin root GENERATES rather than carries.
//
// A plugin ships the artifacts that are the same in every repository. The rest — the charter's
// repo facts, the verification-gate commands, the client's own configuration file — is
// repository-owned, and the engine writes it through `stamity plugin setup`. That leaves a gap
// the moment a plugin is installed: the operator has the artifacts and not the facts they cite,
// and nothing in the root tells them so. This command closes it, in the client's own idiom, by
// walking the agent through the runtime the root already bundles.
//
// It is generated because it is not corpus content: its body names ONE client and ONE plugin-root
// variable, and both are facts of the root being built, not of the canonical tree. Three clients,
// three variables (`CLAUDE_PLUGIN_ROOT`, `CURSOR_PLUGIN_ROOT`, `PLUGIN_ROOT`), and a body that
// names any client other than its own would send an operator to the wrong install.
//
// The body carries no `${STAMITY:*}` token by construction — it is written here, not staged — and
// every command runs through `runtime/locate.mjs`, never a bare `stamity` on `PATH`: the locator
// is what prefers a repository's own companion install over the bundled copy, and what refuses a
// Node below the floor with a message instead of a stack.

import { DISTRIBUTION_CLIENTS } from '../distribution-identity.mjs'

/** The clients a root is built for; the body names exactly one of them. */
const CLIENTS = DISTRIBUTION_CLIENTS

/**
 * A shell-safe environment variable name. Narrow on purpose: the value is interpolated into a
 * command an agent runs, so anything but a variable name is a refusal rather than a rendering.
 */
const ROOT_VARIABLE = /^[A-Z][A-Z0-9_]*$/

const DESCRIPTION =
  'Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates.'

/**
 * Every frontmatter key this file may emit, in the order it emits them.
 *
 * `description` is the one every container carries and is rendered here. The other two are
 * CURSOR vocabulary, declared by that container as `SETUP_COMMAND_FRONTMATTER` and passed in:
 * on that client a file is a COMMAND rather than a model-invocable skill only when it declares
 * `disable-model-invocation: true`, and the `name` beside it is the id the operator types
 * (cursor.com/docs/skills, accessed 2026-09-20). The order is `src/adapters/cursor.ts`'s own —
 * `buildCursorCommand` renders name, description, disable-model-invocation — so the generated
 * command's head is indistinguishable from the nine carried ones.
 *
 * A key absent from this list is a REFUSAL rather than an appended line: the position of a new
 * key is a decision, and a container that could append one would decide it silently.
 */
const FRONTMATTER_ORDER = ['name', 'description', 'disable-model-invocation']

/** A decoration value safe to emit as a bare YAML scalar, unquoted, on its own line. */
const BARE_SCALAR = /^[A-Za-z0-9][\w.-]*$/

/** One decoration entry as a frontmatter line, refusing anything that could escape it. */
function frontmatterLine(key, value) {
  if (typeof value === 'boolean') return `${key}: ${value ? 'true' : 'false'}`
  if (typeof value === 'string' && BARE_SCALAR.test(value)) return `${key}: ${value}`
  throw new Error(
    `renderSetupCommand: the frontmatter value for ${key} must be a boolean or a bare scalar — ` +
      `received ${JSON.stringify(value)}`,
  )
}

/**
 * Render the `st-setup` command body for one client.
 *
 * Pure: the same arguments render the same bytes, which is what keeps a regenerated root
 * byte-identical to the committed one. `description` is the key every client the roots target
 * reads; anything beyond it is per-container residue the container itself declares, because a
 * vendor-specific key emitted for all four would state a restriction three runtimes never apply.
 */
export function renderSetupCommand(client, rootVar, decoration = {}) {
  if (!CLIENTS.includes(client)) {
    throw new Error(`renderSetupCommand: client must be one of ${CLIENTS.join(', ')} — received ${String(client)}`)
  }
  if (typeof rootVar !== 'string' || !ROOT_VARIABLE.test(rootVar)) {
    throw new Error(
      `renderSetupCommand: the plugin root variable must be an upper-case variable name — received ${String(rootVar)}`,
    )
  }
  if (decoration === null || typeof decoration !== 'object' || Array.isArray(decoration)) {
    throw new Error(`renderSetupCommand: the frontmatter decoration must be a record — received ${String(decoration)}`)
  }
  if (Object.hasOwn(decoration, 'description')) {
    throw new Error('renderSetupCommand: description is rendered here and cannot be decorated over.')
  }
  for (const key of Object.keys(decoration)) {
    if (!FRONTMATTER_ORDER.includes(key)) {
      throw new Error(
        `renderSetupCommand: ${key} is not a frontmatter key this command renders. Add it to ` +
          `FRONTMATTER_ORDER at the position the client's own command files put it.`,
      )
    }
  }

  const front = FRONTMATTER_ORDER.filter((key) => key === 'description' || Object.hasOwn(decoration, key)).map((key) =>
    key === 'description' ? `description: "${DESCRIPTION}"` : frontmatterLine(key, decoration[key]),
  )

  // The Copilot CLI exports NO plugin-root variable to a command's shell — measured on 1.0.87
  // (prove/258, prove/262): the session's environment carries no `*PLUGIN_ROOT`, and the binary's
  // changelog says only plugin HOOKS receive one (since 1.0.26, the same in 1.0.85). A body that
  // read `${PLUGIN_ROOT}` therefore ran `node "/runtime/locate.mjs"` and the model hunted the
  // filesystem. So that client's body is DISCOVERY-FIRST, in the form the client can satisfy: its
  // own `skill list --json` lists this root's skills AND its prompt entries (measured on 1.0.87,
  // 2026-09-22: ten rows at `<root>/skills/<id>` and ten command rows whose `path` is the
  // directory `<root>/com.github.copilot/commands`), so the rule trims at `/skills/` or at
  // `/com.github.copilot/`, whichever the path carries — trimming only the first shape derived
  // two roots from one install and tripped the stop (prove/273). NOT `plugin list --json`'s
  // `installedFrom`: measured the same day, it names the MARKETPLACE directory the plugin was
  // added from (whose catalog maps the plugin to `./copilot` beneath it), not the root. Every
  // command below names the root literally and hands it to the CLI as `--plugin-root`. Claude
  // and Cursor export their variables to commands and keep the variable form.
  const discovered = client === 'copilot'
  const locate = discovered ? 'node "<root>/runtime/locate.mjs"' : `node "\${${rootVar}}/runtime/locate.mjs"`
  const rootFlag = discovered ? ' --plugin-root "<root>"' : ''
  const discovery = discovered
    ? `
Before step 1, find the installed root. This client passes no plugin-root variable to a command's
shell — \`\${${rootVar}}\` expands to nothing here, so do not use it. Ask the client where this
plugin's skills live:

   \`\`\`bash
   copilot skill list --json
   \`\`\`

Take every entry whose \`source\` is \`plugin\` and whose \`name\` starts with \`st-\` or \`stamity-\`.
The listing carries this root's SKILLS and its PROMPT entries alike, and their \`path\` values
take two shapes: \`<root>/skills/<name>\` for a skill, and \`<root>/com.github.copilot/...\` for a
command or agent. The rule for both: \`<root>\` is the part of \`path\` before \`/skills/\` when the
path contains it, otherwise the part before \`/com.github.copilot/\`. Apply it to every entry and
collect the distinct results. (Not \`plugin list --json\`'s \`installedFrom\`: that names the
marketplace the plugin was added from, not the root.) Two stops before anything else runs:

- No such entry: the plugin is not loaded in this session — the folder is not trusted, or the
  plugin is not installed. Report that in those words and STOP. Write nothing, and do not search
  the filesystem for a root.
- More than one distinct \`<root>\` after that rule: two stamity-derived plugins are installed
  (a canonical root beside a fork, or two marketplaces). List every root and STOP, asking the
  operator which one this repository should run on.

With exactly one root, substitute \`<root>\` literally, quotes kept, wherever it appears below.
`
    : ''
  return `---
${front.join('\n')}
---

Set this repository up to run on the installed stamity plugin. Work the four steps in order and
stop at the one that asks for the operator.
${discovery}
1. Read the current state. Every step below reads from this report.

   \`\`\`bash
   ${locate} -- plugin status --json${rootFlag}
   \`\`\`

2. When \`setup.needed\` is true, write the repository-owned files — the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry:

   \`\`\`bash
   ${locate} -- plugin setup --client ${client} -y${rootFlag}
   \`\`\`

   When it is false, skip this step: a setup already exists, and replacing it is a job for the
   two commands in step 3, run deliberately.

3. When \`duplicates\` is non-empty, print every entry with the remedy beside it and STOP. A
   duplicate is a file two installs both claim, and which one goes is the operator's call. The
   three remedies below are what THE OPERATOR runs — they are reported, never performed here:

   - a file this engine wrote: the operator runs \`${locate} -- clean -y\` and then
     \`${locate} -- plugin setup --client ${client} -y${rootFlag}\` again. Do not run either yourself:
     \`clean -y\` takes no confirmation and removes ledger rows and the files they name;
   - a file an APM dependency installed: the operator removes that APM dependency;
   - a file nobody manages: the operator removes it, or the operator keeps it as an override
     under \`.stamity/overrides/\`.

   Stop at this step. Remove no file yourself and run none of the three remedies; report the
   duplicates with their remedies and let the operator choose. Step 4 runs once they have.

4. Finish by reporting the resolved state, as the table an operator reads:

   \`\`\`bash
   ${locate} -- plugin status${rootFlag}
   \`\`\`

Report what changed, what stayed, and any duplicate you stopped on.
`
}
