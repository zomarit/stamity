// What a `${STAMITY:*}` token becomes on its way into a plugin body.
//
// The engine resolves these tokens per repository: emission reads the persisted manifest and
// the resolved gate commands and writes `npm run test` into one project and `pytest` into the
// next. A PLUGIN body has no such input — it is built once, published, and installed into
// repositories this engine never detected — so the same token cannot carry a value there.
// It carries a REFERENCE instead: a fixed phrase naming the row of `AGENTS.md` the reading
// agent resolves the fact from at the moment it needs it. The charter and the gate table in
// that file are written by `stamity plugin setup` in the consuming repository, so the
// indirection lands on a real document rather than on a guess baked in at build time.
//
// Ten tokens exist; nine are mapped. Eight map to a phrase. The ninth, `${STAMITY:CLI}`, maps
// to a LITERAL: the pinned call `npx -y <package>@<plugin version>`, the same form the engine
// renders into a repository. Its inputs are the plugin's own — the package it is built from and
// the version it ships at — so the build passes them in and the value is fixed at build time,
// not read off the consuming repository. A build that passes none leaves the token unresolved,
// and the caller refuses the body.
//
// `${STAMITY:INVARIANTS_VERSION}` is deliberately absent: its input is the charter's OWN
// frontmatter, and the charter is repository-owned — the plugin layout never carries it as a
// body. Leaving the token unmapped is what makes a body that somehow carries it refuse to stage,
// rather than shipping a broken template variable to an agent. Every token not in the map, known
// or unknown, comes back as `unresolved` for the caller to refuse; this module writes nothing.

import { PLUGIN_VERSION } from './version.mjs'

/** The literal that opens every token the emission layer wires. */
export const TOKEN_PREFIX = '${STAMITY:'

/** The pinned CLI call token — `CLI_TOKEN` in `src/emit/substitution.ts`, held equal by test. */
export const CLI_TOKEN = '${STAMITY:CLI}'

/**
 * A runnable npm package name — the grammar `src/shared/cliCall.ts` holds the engine's call to,
 * restated because this module runs under bare Node with no TypeScript: lower-case, an optional
 * `@scope/`, each part opening on a letter or digit so the word can never read as an npx flag.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

/**
 * The value `${STAMITY:CLI}` takes in a plugin body: `npx -y <packageName>@<version>`.
 *
 * Throws on a name that is not a runnable package and on a version that is not a plugin version
 * (`scripts/plugins/version.mjs`): `latest`, a range or an empty string would publish an
 * unpinned call, and build metadata has nowhere to go in an npm install spec.
 */
export function pinnedCliPrefix({ packageName, version } = {}) {
  if (typeof packageName !== 'string' || !PACKAGE_NAME.test(packageName)) {
    throw new Error(
      `Cannot render the pinned CLI call: ${JSON.stringify(packageName)} is not a runnable npm package name.`,
    )
  }
  if (typeof version !== 'string' || !PLUGIN_VERSION.test(version)) {
    throw new Error(
      `Cannot render the pinned CLI call: version ${JSON.stringify(version)} is not a plugin version (major.minor.patch, an optional prerelease).`,
    )
  }
  return `npx -y ${packageName}@${version}`
}

/**
 * The phrase each wired token reads as inside a plugin body. The key set is bound to
 * `REPO_SUBSTITUTION_TOKENS` (`src/emit/substitution.ts`) by `test/ci/pluginModules.test.ts`,
 * so an engine token that is neither a phrase here nor `CLI_TOKEN` fails that suite the day it
 * lands instead of leaking into a root.
 */
export const CHARTER_REFERENCE_PHRASES = {
  '${STAMITY:LINTER}': 'the linter named under Repo facts in AGENTS.md',
  '${STAMITY:TEST_FRAMEWORK}': 'the test framework named under Repo facts in AGENTS.md',
  '${STAMITY:CI_PROVIDER}': 'the CI provider named under Repo facts in AGENTS.md',
  '${STAMITY:MATURITY_TIER}': 'the maturity tier named under Repo facts in AGENTS.md',
  '${STAMITY:VERIFY_GATE_TEST}': 'the Tests command listed under Verification gates in AGENTS.md',
  '${STAMITY:VERIFY_GATE_LINT}': 'the Lint command listed under Verification gates in AGENTS.md',
  '${STAMITY:VERIFY_GATE_TYPECHECK}': 'the Typecheck command listed under Verification gates in AGENTS.md',
  '${STAMITY:VERIFY_GATE_ALL}': 'the Full gate command listed under Verification gates in AGENTS.md',
}

/**
 * Every WELL-FORMED token occurrence, whatever it names. Two deliberate bounds.
 *
 * Wider than the mapped key set, because an unknown token has to be SEEN to be refused: a
 * pattern matching only the eight would let a ninth spelling through as ordinary prose.
 *
 * Bounded to one line, because a token never spans one. Without the bound, an unterminated
 * `${STAMITY:` — which the corpus carries once, as PROSE, at
 * `content/agents/stamity-test-runner.md:79`, where the agent is told what an unresolved token
 * looks like — would match forward to the next `}` anywhere in the document and swallow a
 * paragraph into a bogus token name. A bare prefix is left standing and is not reported: it
 * names no token, so there is nothing to resolve and nothing to refuse.
 */
const TOKEN_PATTERN = /\$\{STAMITY:[^}\n]*\}/g

/**
 * Replace every mapped token in `body` with its phrase — and `${STAMITY:CLI}` with the pinned
 * call when `cli` (`{ packageName, version }`) is given — and report the rest.
 *
 * Pure. An unmapped token is LEFT IN PLACE rather than blanked, so the caller's refusal message
 * can quote the body as it stands; `unresolved` lists each distinct token once, in order of first
 * appearance, which is the order an author reads their own file in. With no `cli`, the CLI token
 * is unresolved like any other. A `cli` that cannot render a pinned call throws
 * ({@link pinnedCliPrefix}) when the body carries the token. A body carrying no token is returned
 * as the same string — the common case pays one `includes`.
 */
export function substitute(body, cli) {
  const text = typeof body === 'string' ? body : ''
  if (!text.includes(TOKEN_PREFIX)) return { text, unresolved: [] }
  const cliValue = cli === undefined || !text.includes(CLI_TOKEN) ? null : pinnedCliPrefix(cli)
  const unresolved = []
  const resolved = text.replace(TOKEN_PATTERN, (token) => {
    if (Object.hasOwn(CHARTER_REFERENCE_PHRASES, token)) return CHARTER_REFERENCE_PHRASES[token]
    if (token === CLI_TOKEN && cliValue !== null) return cliValue
    if (!unresolved.includes(token)) unresolved.push(token)
    return token
  })
  return { text: resolved, unresolved }
}
