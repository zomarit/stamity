// The replay's protocol table and the few scoring rules the scorer and the comparison share
// (plan 011, contract S2). A leaf: it imports nothing from `scripts/replay/`, so `score.mjs` and
// `compare.mjs` both read these bindings without `compare.mjs` importing `score.mjs` — the import
// cycle `build/273` recorded. The private driver's `replay.mjs` mirrors `PROTOCOLS` with a comment
// naming this file; a change here is a change there.

/**
 * Each protocol version's committed paths, repository-relative and POSIX: the protocol file, the
 * fixture data (`fixture.mjs`'s data-directory override), the runs folder and the comparison.
 */
export const PROTOCOLS = Object.freeze({
  v1: Object.freeze({ path: 'evals/replay/REPLAY-v1.md', data: 'evals/replay/v1', runs: 'evals/replay/runs', comparison: 'evals/replay/COMPARISON-v1.md' }),
  v2: Object.freeze({ path: 'evals/replay/REPLAY-v2.md', data: 'evals/replay/v2', runs: 'evals/replay/v2/runs', comparison: 'evals/replay/COMPARISON-v2.md' }),
})

/** The version a command reads when it is given no `--protocol`: v1, so v1's recorded commands keep working. */
export const DEFAULT_PROTOCOL = 'v1'

/** True when `value` names a version of the table. */
export const isProtocolVersion = (value) => typeof value === 'string' && Object.hasOwn(PROTOCOLS, value)

/** The version whose committed protocol path is `path`, or null. */
export const versionOfPath = (path) => Object.keys(PROTOCOLS).find((v) => PROTOCOLS[v].path === path) ?? null

const stem = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')

/**
 * The names a rendered file gives its protocol and its comparison (`REPLAY-v2`, `COMPARISON-v2`),
 * read off the protocol path a summary records. A path no version commits reads as v1's, the one
 * pair of names every file carried before v2.
 */
export function protocolNames(path) {
  const entry = PROTOCOLS[versionOfPath(path) ?? DEFAULT_PROTOCOL]
  return { protocol: stem(entry.path), comparison: stem(entry.comparison) }
}

/** §10: an invalid run is replaced, at most this many times per shape (a test pins the sentence). */
export const MAX_REPLACEMENTS_PER_SHAPE = 2

/** The §12 rows, in the protocol's order. */
export const ROW_IDS = ['security-seeds', 'pooled-recall', 'decoy-flags', 'compaction-loss', 'verdict-class', 'verdict-rounds', 'approved-unfixed', 'loop-chars', 'subagent-tokens', 'eval-set-floors']

export function median(values) {
  const sorted = values.toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** §12: a security seed the implementer removed before the lens started counts as found. */
export const securityHeld = (x) => x.found || x.caughtByImplementer
