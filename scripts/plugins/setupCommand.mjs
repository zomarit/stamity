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
 * Render the `st-setup` command body for one client.
 *
 * Pure: the same two arguments render the same bytes, which is what keeps a regenerated root
 * byte-identical to the committed one. Frontmatter is `description` alone — every client the
 * roots target reads that key, and a vendor-specific one would make this file unportable across
 * the four containers that carry it.
 */
export function renderSetupCommand(client, rootVar) {
  if (!CLIENTS.includes(client)) {
    throw new Error(`renderSetupCommand: client must be one of ${CLIENTS.join(', ')} — received ${String(client)}`)
  }
  if (typeof rootVar !== 'string' || !ROOT_VARIABLE.test(rootVar)) {
    throw new Error(
      `renderSetupCommand: the plugin root variable must be an upper-case variable name — received ${String(rootVar)}`,
    )
  }
  const locate = `node "\${${rootVar}}/runtime/locate.mjs"`
  return `---
description: "${DESCRIPTION}"
---

Set this repository up to run on the installed stamity plugin. Work the four steps in order and
stop at the one that asks for the operator.

1. Read the current state. Every step below reads from this report.

   \`\`\`bash
   ${locate} -- plugin status --json
   \`\`\`

2. When \`setup.needed\` is true, write the repository-owned files — the charter carrying this
   repository's facts and gates, and the client configuration the plugin does not carry:

   \`\`\`bash
   ${locate} -- plugin setup --client ${client} -y
   \`\`\`

   When it is false, skip this step: a setup already exists, and replacing it is a job for the
   two commands in step 3, run deliberately.

3. When \`duplicates\` is non-empty, print every entry with its remedy and stop for the operator.
   Do not remove a file yourself — a duplicate is a file two installs both claim, and which one
   goes is the operator's call:

   - a file this engine wrote: run \`${locate} -- clean -y\`, then
     \`${locate} -- plugin setup --client ${client} -y\` again;
   - a file an APM dependency installed: remove that APM dependency;
   - a file nobody manages: remove it, or keep it as an override under \`.stamity/overrides/\`.

4. Finish by reporting the resolved state, as the table an operator reads:

   \`\`\`bash
   ${locate} -- plugin status
   \`\`\`

Report what changed, what stayed, and any duplicate you stopped on.
`
}
