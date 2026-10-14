// The records set: the paths this repository keeps on the orphan `records` branch instead of on
// `main` (REQ-PROVE-023). One list, read by `scripts/records.mjs` for every verb, so the exclude
// block `setup` writes, the files `commit` publishes, the paths `verify` compares and the paths
// `guard` refuses on `main` cannot disagree. Plain Node, no import, so the CI step that runs
// `guard` before `npm ci` can load it.

/** Repository-relative pathspecs, POSIX-spelled: a directory covers everything under it. */
export const RECORDS_PATHSPECS = Object.freeze([
  '.stamity/runs',
  '.stamity/inbox.md',
  '.stamity/handoffs',
  '.stamity/evidence',
  'docs/plans',
  'evals/runs',
  'evals/measurements',
  'evals/reach',
  'evals/EVIDENCE-STORAGE.md',
  'evals/ARCHIVE-MIGRATION-2026-09-15.json',
])

/** Paths under a pathspec that stay on `main`: init's scaffold writes the handoffs placeholder. */
export const KEEP_ON_MAIN = Object.freeze(['.stamity/handoffs/.gitkeep'])

/**
 * Whether a POSIX repository-relative path is a record: it equals a pathspec or sits under one,
 * is not kept on `main`, and has no `.`, `..`, empty or `.git` segment and no backslash, so a path
 * read from a tree can never name a file outside the record folders when it is joined to the root.
 */
export function isRecordPath(path) {
  if (typeof path !== 'string' || path === '' || path.includes('\\') || path.includes('\0')) return false
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..' || part.toLowerCase() === '.git'))
    return false
  if (KEEP_ON_MAIN.includes(path)) return false
  return RECORDS_PATHSPECS.some((spec) => path === spec || path.startsWith(`${spec}/`))
}
