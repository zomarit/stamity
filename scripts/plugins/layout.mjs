// Where a planned emission row lands inside a plugin root — the dispatcher over the four
// per-client tables, and the one place that judges a row no table names.
//
// The planner speaks REPOSITORY paths: `.claude/agents/stamity-reviewer.md` is where that agent
// goes in a repository this engine set up. A plugin root is a different address space — it is
// installed into repositories this engine never saw — so every row is re-addressed here, and a
// row whose repository home has no plugin home is DROPPED with a stated reason rather than
// carried to a path nobody reviewed.
//
// Three outcomes, and the third is what keeps this file honest:
//
//   - a path        — the row travels, under the class the table names it for;
//   - `null`        — the table names the row and drops it (the charter, an MCP document, the
//                     repository's own state tree, a class the container cannot carry); the
//                     class-level reason is on the client module;
//   - a REFUSAL     — no table entry matches. That is a new emission surface, not a row to pass
//                     through: passing it through would publish an artifact at a guessed path, and
//                     dropping it silently would publish a root missing an artifact. Either way a
//                     human should see it once, which is what the thrown message is for.
//
// Every non-null path is validated with the engine's own `assertSafePath`, so a table entry that
// composed a `..`, an absolute path or a backslash is refused here rather than at a consumer's
// unpack. The import is static and the module is loaded dynamically by the generator, after the
// TypeScript bootstrap — see `scripts/generate-plugin-packages.mjs`.

import { DISTRIBUTION_CLIENTS } from '../distribution-identity.mjs'
import { assertSafePath } from '../../src/content/catalog.ts'

import * as claude from './clients/claude.mjs'
import * as codex from './clients/codex.mjs'
import * as copilot from './clients/copilot.mjs'
import * as cursor from './clients/cursor.mjs'

/** The four containers, keyed by the client id every surface in this repository uses. */
export const CLIENT_CONTAINERS = { claude, cursor, copilot, codex }

/**
 * The clients a build may target, in emission order — DERIVED from the distribution roster
 * rather than restated beside it. The two lists carried the same four ids in the same order and
 * nothing computed either from the other, which is the shape a surface pin drifts in: a fifth
 * distribution client would have been served with no container and no complaint.
 */
export const LAYOUT_CLIENTS = DISTRIBUTION_CLIENTS

// Load-time, because a mismatch here is a build that cannot be correct rather than a run that
// might be. The derivation above only makes the LISTS agree; this is what makes the containers
// agree with them, in both directions.
for (const client of LAYOUT_CLIENTS) {
  if (!Object.hasOwn(CLIENT_CONTAINERS, client)) {
    throw new Error(
      `plugins/layout.mjs: ${client} is a distribution client with no container module. Add ` +
        `scripts/plugins/clients/${client}.mjs and register it in CLIENT_CONTAINERS.`,
    )
  }
}
for (const client of Object.keys(CLIENT_CONTAINERS)) {
  if (!LAYOUT_CLIENTS.includes(client)) {
    throw new Error(
      `plugins/layout.mjs: ${client} has a container module but is not a distribution client, so ` +
        'nothing would ever serve the root it builds. Add it to DISTRIBUTION_CLIENTS or remove it.',
    )
  }
}

function containerFor(client) {
  const container = CLIENT_CONTAINERS[client]
  if (container === undefined) {
    // Named for the caller a reader will actually be standing in: `placeRow` is what the
    // generator calls and what `pluginPathFor` and `pluginClassFor` both route through.
    throw new Error(`placeRow: ${String(client)} is not one of ${LAYOUT_CLIENTS.join(', ')}`)
  }
  return container
}

/**
 * The full placement of one row: `{ path, class, content? }`, or `null` when the table drops it.
 *
 * `content` is present only where the plugin's copy of a row is not the repository's copy — the
 * Claude settings file, whose hooks half alone becomes the plugin hooks document. Everything else
 * travels with the planner's own bytes.
 */
export function placeRow(client, row) {
  const placement = containerFor(client).place(row)
  if (placement === null) return null
  if (placement === undefined) {
    throw new Error(
      `${client}: no plugin home is declared for the emitted path ${JSON.stringify(row.path)}. ` +
        `A row this layout has never seen is a new emission surface, not a file to guess a home ` +
        `for: add it to scripts/plugins/clients/${client}.mjs, as a path or as a stated drop.`,
    )
  }
  assertSafePath(placement.path, `the ${client} plugin root`)
  return placement
}

/**
 * Where one row lands inside `client`'s root, or `null` when the table drops it.
 * Throws when no table entry matches — see the module header.
 */
export function pluginPathFor(client, row) {
  return placeRow(client, row)?.path ?? null
}

/** Which artifact class a row travels as inside the root, or `null` when it does not travel. */
export function pluginClassFor(client, row) {
  return placeRow(client, row)?.class ?? null
}

/**
 * The `classes` block of a root's capability file, computed from what the layout actually placed.
 *
 * Counting rules, stated once because the capability file's readers depend on them: agents,
 * commands and rules count FILES; skills count top-level DIRECTORIES under `skills/`, because a
 * skill is a directory and counting its companions would report a number no operator recognises;
 * hooks count hook SCRIPTS, not the hook configuration document or the policy document beside it.
 *
 * A class the client module declares (`repository-owned` or `unsupported`) is emitted with its
 * reason. A class that is neither declared nor placed is `unsupported` — the container has no
 * surface for it at all.
 */
export function buildClasses(client, placements, pluginClasses) {
  const container = containerFor(client)
  const declared = container.DECLARED_CLASSES ?? {}
  const reasons = container.CARRIED_CLASS_REASONS ?? {}

  const skillDirs = new Set()
  const counts = {}
  for (const placement of placements) {
    const name = placement.class
    if (name === 'skill') {
      skillDirs.add(placement.path.split('/').slice(0, 2).join('/'))
      continue
    }
    if (name === 'hooks' && !placement.path.endsWith('.mjs')) continue
    counts[name] = (counts[name] ?? 0) + 1
  }
  if (skillDirs.size > 0) counts['skill'] = skillDirs.size

  const classes = {}
  for (const name of pluginClasses) {
    if (Object.hasOwn(declared, name)) {
      classes[name] = { ...declared[name] }
      continue
    }
    if ((counts[name] ?? 0) > 0) {
      const entry = { status: 'carried', count: counts[name] }
      if (Object.hasOwn(reasons, name)) entry.reason = reasons[name]
      classes[name] = entry
      continue
    }
    classes[name] = {
      status: 'unsupported',
      reason: `this container carries no ${name} surface and this corpus projects none into it`,
    }
  }
  return classes
}
