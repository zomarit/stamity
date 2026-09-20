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
// Nine tokens exist; eight are mapped. `${STAMITY:INVARIANTS_VERSION}` is deliberately absent:
// its input is the charter's OWN frontmatter, and the charter is repository-owned — the plugin
// layout never carries it as a body. Leaving the token unmapped is what makes a body that
// somehow carries it refuse to stage, rather than shipping a broken template variable to an
// agent. Every token not in the map, known or unknown, comes back as `unresolved` for the
// caller to refuse; this module judges nothing and writes nothing.

/** The literal that opens every token the emission layer wires. */
export const TOKEN_PREFIX = '${STAMITY:'

/**
 * The phrase each wired token reads as inside a plugin body. The key set is bound to
 * `REPO_SUBSTITUTION_TOKENS` (`src/emit/substitution.ts`) by `test/ci/pluginModules.test.ts`,
 * so a tenth engine token fails that suite the day it lands instead of leaking into a root.
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
 * Replace every mapped token in `body` with its phrase and report the rest.
 *
 * Total and pure. An unmapped token is LEFT IN PLACE rather than blanked, so the caller's
 * refusal message can quote the body as it stands; `unresolved` lists each distinct token once,
 * in order of first appearance, which is the order an author reads their own file in. A body
 * carrying no token is returned as the same string — the common case pays one `includes`.
 */
export function substitute(body) {
  const text = typeof body === 'string' ? body : ''
  if (!text.includes(TOKEN_PREFIX)) return { text, unresolved: [] }
  const unresolved = []
  const resolved = text.replace(TOKEN_PATTERN, (token) => {
    if (Object.hasOwn(CHARTER_REFERENCE_PHRASES, token)) return CHARTER_REFERENCE_PHRASES[token]
    if (!unresolved.includes(token)) unresolved.push(token)
    return token
  })
  return { text: resolved, unresolved }
}
