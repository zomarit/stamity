// The four plugin containers, as the capability matrix's `## Plugin containers` section renders
// them — built from the emitter modules that DECIDE each fact rather than transcribed beside
// them.
//
// Why this module exists at all, and why it is here rather than in `src/emit/`. The renderer is
// engine code: it is bundled into `dist/`, and it cannot import `scripts/plugins/clients/*.mjs`,
// which are build-time modules that never ship. So the facts cannot be read where they are
// rendered. They are read HERE, by the one generator that writes the page
// (`./generate-capability-matrix.mjs`) and by the suite that byte-compares it
// (`test/emit/capabilityMatrix.test.ts`), so the page and its drift gate are one derivation and
// not two transcriptions that can disagree.
//
// Every value below is read off an export of the client module. Nothing is re-typed: a class
// that changes owner, an invocation form that moves, a client floor that gains a version all
// reach the published page through the same regeneration the emitter's own tests already gate.

import * as claude from './plugins/clients/claude.mjs'
import * as codex from './plugins/clients/codex.mjs'
import * as copilot from './plugins/clients/copilot.mjs'
import * as cursor from './plugins/clients/cursor.mjs'
import { PLUGIN_CLASSES } from './plugins/capability.mjs'

/** The client modules in the canonical `TOOLS` order the page renders in. */
const MODULES = [
  ['claude', claude],
  ['cursor', cursor],
  ['copilot', copilot],
  ['codex', codex],
]

/**
 * The invocation forms as one cell, in the order the capability file lists them.
 *
 * `INVOCATION.citation` is prose about where the forms were read, not a class — it is skipped
 * here and the module header on the client that carries it is where it stays.
 */
function invocationOf(module) {
  const forms = Object.entries(module.INVOCATION)
    .filter(([key]) => key !== 'citation')
    .map(([klass, form]) => `${klass} \`${form}\``)
  return forms.length === 0 ? 'none declared' : forms.join(', ')
}

/**
 * The client floor with the reason beside it.
 *
 * `unknown` is a real answer here and the reason is what makes it one — three of the four
 * vendors state no minimum version for their plugin system, and a bare `unknown` would read as
 * a fact nobody looked for.
 */
function floorOf(module) {
  const { version, reason } = module.CLIENT_FLOOR
  return reason === undefined ? version : `${version} — ${reason}`
}

/**
 * One container's facts.
 *
 * `carries` is the COMPLEMENT of what the module declares: a client module names only the
 * classes its container does NOT carry (with the reason each is repository-owned), so deriving
 * the carried set by subtraction is what keeps a newly declared class out of both lists instead
 * of silently staying in one.
 */
function factsFor(tool, module) {
  const declared = module.DECLARED_CLASSES
  return {
    tool,
    container: module.MANIFEST_PATH,
    carries: PLUGIN_CLASSES.filter((klass) => declared[klass] === undefined),
    repositoryOwned: PLUGIN_CLASSES.filter((klass) => declared[klass] !== undefined),
    invocation: invocationOf(module),
    floor: floorOf(module),
    rootVariable: module.ROOT_VARIABLE,
    citations: [module.CLIENT_FLOOR.citation],
  }
}

/** The four facts, in `TOOLS` order. Pure: two calls return equal data. */
export function buildPluginContainerFacts() {
  return MODULES.map(([tool, module]) => factsFor(tool, module))
}
