#!/usr/bin/env node
// QA row binding: what a row was measured against, and whether a human answer still holds.
//
// A manual QA row is a claim about a tree, not about a date. "Performed 2026-09-13" says nothing
// on its own — the pages, the fixtures and the hook scripts the person walked may all have moved
// since, and a form that carries the date forward without carrying the INPUTS forward is a
// signature on a document nobody re-read. Twice now the nine human rows were accepted UNPERFORMED
// at a release because there was no way to tell which of them had actually changed.
//
// So every row names its inputs by content. `rowHash` folds a row's `{path, sha256}` list into one
// hash, sorted by path so the caller's enumeration order cannot change the answer, and a single
// byte anywhere under the row's inputs changes it. `carryForward` is the whole policy that hash
// buys: a row a human performed stays performed, with its ORIGINAL date and name, for exactly as
// long as its hash holds; the moment an input moves the row reopens as `unperformed` and says
// which hash it was performed against. Nothing here decides that a row passed — an automated row's
// status comes from the harness that ran it, and a human row's from a person.
//
// Pure functions over plain data: no clock, no filesystem beyond `hashFile`, no process state. The
// suite (`test/qa/bind.test.ts`) is the contract.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** The five statuses a row can carry. `performed`/`unperformed` are the human half. */
export const ROW_STATUSES = ['passed', 'failed', 'not-run', 'performed', 'unperformed']

/** Hex sha256 of a string or buffer. One hash function for the whole harness. */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Hex sha256 of a file's BYTES.
 *
 * Bytes, not text: a CRLF normalization would make two different trees hash alike, and the point
 * of the hash is that a reviewer can re-derive it with `shasum -a 256 <path>` and get the same
 * string. A path that cannot be read is the caller's to handle — an unreadable input is a defect
 * in the row's input list, not a zero.
 */
export function hashFile(path) {
  return sha256(readFileSync(path))
}

/**
 * Fold a row's inputs into one hash.
 *
 * `inputs` is a list of `{ path, sha256 }`. The list is sorted by path before it is serialized, so
 * two callers that enumerated the same tree in different orders (a directory walk, a glob, a
 * hand-written list) produce the same hash. Serialization is over the two fields only, so an
 * enriched input record (a size, a mtime) cannot silently change a row's identity.
 */
export function rowHash(inputs) {
  const normalized = inputs
    .map((input) => ({ path: input.path, sha256: input.sha256 }))
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return sha256(JSON.stringify(normalized))
}

/** `{path, sha256}[]` -> `{ [path]: sha256 }`, the shape the evidence file records. */
export function inputHashMap(inputs) {
  const map = {}
  for (const input of inputs) map[input.path] = input.sha256
  return map
}

/** Hash a list of `{ path, absolute }` entries into the `{path, sha256}` list the row carries. */
export function hashInputs(entries) {
  return entries.map((entry) => ({ path: entry.path, sha256: hashFile(entry.absolute) }))
}

/** Rows out of an evidence object, an array, or nothing. One reader for all three call shapes. */
function rowsOf(value) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  return Array.isArray(value.rows) ? value.rows : []
}

/**
 * Statuses a previous human answer may be carried onto — the HUMAN LANE.
 *
 * `passed` and `failed` are deliberately absent, and this is the one place the rule is wider than
 * "a performed row stays performed": a row the harness MEASURED tonight keeps its measurement. A
 * signature from a previous run painted over a fresh `failed` would be a green nobody earned, and
 * the whole reason these rows are bound to hashes is that a stale answer must never outrank a
 * current one. So a measurement outranks a signature, and a signature outranks nothing but the
 * absence of one.
 */
const CARRYABLE = new Set(['not-run', 'unperformed'])

/**
 * Carry a previous run's human answers into this run's rows.
 *
 * The only status that carries is `performed`, and it carries only onto a row in {@link CARRYABLE}:
 * it survives with its original `performedAt` and `performedBy` while the row's `rowHash` is
 * unchanged, and reopens as `unperformed` the moment the hash moves — with a reason naming both
 * hashes, so the reader can see WHICH tree the answer was given against rather than being told to
 * take it on faith.
 *
 * Everything else is left exactly as the caller computed it. A row that was `unperformed` before
 * stays whatever this run made it, and a row the previous run did not carry at all is new and
 * passes through untouched.
 *
 * Returns a NEW array of new objects. Neither argument is mutated: `previous` is usually a parsed
 * evidence file the caller may still want to report on.
 */
export function carryForward(previous, current) {
  const before = new Map(rowsOf(previous).map((row) => [row.row, row]))
  const carried = []
  for (const row of rowsOf(current)) {
    const prior = before.get(row.row)
    if (prior === undefined || prior.status !== 'performed' || !CARRYABLE.has(row.status)) {
      carried.push({ ...row })
      continue
    }
    if (prior.rowHash === row.rowHash) {
      carried.push({
        ...row,
        status: 'performed',
        reason: prior.reason ?? row.reason,
        ...(prior.performedAt === undefined ? {} : { performedAt: prior.performedAt }),
        ...(prior.performedBy === undefined ? {} : { performedBy: prior.performedBy }),
      })
      continue
    }
    const reopened =
      `reopened: performed against rowHash ${prior.rowHash}` +
      `${prior.performedAt === undefined ? '' : ` on ${prior.performedAt}`}, ` +
      `and this run's inputs hash to ${row.rowHash}`
    carried.push({
      ...row,
      status: 'unperformed',
      reason: row.reason ? `${reopened}; ${row.reason}` : reopened,
    })
  }
  return carried
}
