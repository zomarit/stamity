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
// A person may also sign a row off WITHOUT walking it, and the file says so: `accepted-unwalked`,
// never rounded up to `performed`. Every row this harness writes is a release-QA row (every id
// starts with `H`), and a release row needs a walk or a fresh acceptance — so an acceptance holds
// for the run that recorded it and never carries into the next one, whatever its hash.
//
// Pure functions over plain data: no clock, no filesystem beyond `hashFile`, no process state. The
// suite (`test/qa/bind.test.ts`) is the contract.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * The six statuses a row can carry. `performed`/`accepted-unwalked`/`unperformed` are the human
 * half; `performed` is this harness's spelling of "walked", kept so older evidence files still read.
 */
export const ROW_STATUSES = ['passed', 'failed', 'not-run', 'performed', 'accepted-unwalked', 'unperformed']

/** The two statuses only a person's recorded answer can give a row. */
export const HUMAN_ANSWERS = new Set(['performed', 'accepted-unwalked'])

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

/** The fixed tail of the reason an acceptance reopens with; {@link withoutReopenedReason} cuts on it. */
const ACCEPTANCE_REOPEN_TAIL =
  'does not carry to a new run — every harness row is a release-QA row; walk it or accept it again'

/**
 * A reason with the `reopened: …` prefix {@link carryForward} put in front of it removed, leaving the
 * harness's own reason (or `''` when there was none). A fresh answer answers the reopen, so the reopen
 * text — "walk it or accept it again" — must not sit beside the answer and then carry on every later
 * run. A reason carryForward did not write passes through unchanged.
 */
function withoutReopenedReason(reason) {
  if (typeof reason !== 'string' || !reason.startsWith('reopened: ')) return reason
  const acceptance = reason.indexOf(ACCEPTANCE_REOPEN_TAIL)
  let end
  if (acceptance !== -1) {
    end = acceptance + ACCEPTANCE_REOPEN_TAIL.length
  } else {
    const moved = /, and this run's inputs hash to [^;\s]+/.exec(reason)
    if (moved === null) return reason
    end = moved.index + moved[0].length
  }
  const rest = reason.slice(end)
  return rest.startsWith('; ') ? rest.slice(2) : rest
}

/**
 * Carry a previous run's human answers into this run's rows.
 *
 * The only status that carries is `performed`, and it carries only onto a row in {@link CARRYABLE}:
 * it survives with its original `performedAt` and `performedBy` while the row's `rowHash` is
 * unchanged, and reopens as `unperformed` the moment the hash moves — with a reason naming both
 * hashes, so the reader can see WHICH tree the answer was given against rather than being told to
 * take it on faith.
 *
 * An `accepted-unwalked` prior never carries. Every harness row is a release-QA row, and a release
 * row needs a walk or a fresh acceptance, so the row reopens as `unperformed` even on an equal hash,
 * with a reason naming the acceptance it had — and, when the hash moved, both hashes as well. The
 * exception keys on the STATUS, never on the row id's letter.
 *
 * Every row the performed branch restores is marked `carried: true`, and the form prints the carry
 * suffix beside that mark only: a row a person walked this run is not a carry, and a
 * reopened or measured row carries no signature at all. {@link recordHumanAnswers} drops the mark
 * from every row it answers.
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
    if (prior === undefined || !HUMAN_ANSWERS.has(prior.status) || !CARRYABLE.has(row.status)) {
      carried.push({ ...row })
      continue
    }
    const accepted = prior.status === 'accepted-unwalked'
    const answeredOn = accepted ? prior.acceptedAt : prior.performedAt
    const on = answeredOn === undefined ? '' : ` on ${answeredOn}`
    if (prior.rowHash === row.rowHash && !accepted) {
      carried.push({
        ...row,
        status: 'performed',
        reason: prior.reason ?? row.reason,
        ...(prior.performedAt === undefined ? {} : { performedAt: prior.performedAt }),
        ...(prior.performedBy === undefined ? {} : { performedBy: prior.performedBy }),
        carried: true,
      })
      continue
    }
    const reopened =
      prior.rowHash === row.rowHash
        ? `reopened: accepted-unwalked${on}${prior.acceptedBy === undefined ? '' : ` by ${prior.acceptedBy}`} ` +
          ACCEPTANCE_REOPEN_TAIL
        : `reopened: ${prior.status} against rowHash ${prior.rowHash}${on}, ` +
          `and this run's inputs hash to ${row.rowHash}`
    carried.push({
      ...row,
      status: 'unperformed',
      reason: row.reason ? `${reopened}; ${row.reason}` : reopened,
    })
  }
  return carried
}

/** A `YYYY-MM-DD` string that names a real calendar day. */
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Record this run's human answers onto its rows.
 *
 * `walked` ids become `performed` with `performedAt: on` and `performedBy: by`; `accepted` ids
 * become `accepted-unwalked` with `acceptedAt: on` and `acceptedBy: by`. A row the harness MEASURED
 * (`passed` or `failed`) takes no human answer: a signature must never sit on top of a measurement,
 * in either direction. With no answers the rows pass through unchanged and `by` is not needed.
 *
 * Every refusal throws before any row is written, so a bad answer leaves nothing half-recorded.
 * Returns a NEW array of new objects; `rows` is not mutated.
 */
export function recordHumanAnswers(rows, { walked = [], accepted = [], by, on } = {}) {
  const current = rowsOf(rows)
  const walkedIds = new Set(walked)
  const acceptedIds = new Set(accepted)
  const answering = walkedIds.size > 0 || acceptedIds.size > 0
  // A given --by or --on is checked even when no row is answered, so a mistyped flag is refused
  // rather than silently ignored.
  if (by !== undefined && !answering && (typeof by !== 'string' || by.trim() === '')) {
    throw new Error('--by names nobody; give a name or leave the flag out')
  }
  if (on !== undefined && !isCalendarDate(on)) throw new Error(`--on ${on} is not a YYYY-MM-DD date`)
  if (answering) {
    if (typeof by !== 'string' || by.trim() === '') {
      throw new Error('--by is required when --walked or --accept-unwalked is given')
    }
    if (!isCalendarDate(on)) throw new Error(`--on ${on} is not a YYYY-MM-DD date`)
    for (const id of walkedIds) {
      if (acceptedIds.has(id)) throw new Error(`row ${id} is named by both --walked and --accept-unwalked`)
    }
    const byId = new Map(current.map((row) => [row.row, row]))
    for (const id of [...walkedIds, ...acceptedIds]) {
      const row = byId.get(id)
      if (row === undefined) throw new Error(`row ${id} is not in this evidence file`)
      if (row.status === 'passed' || row.status === 'failed') {
        throw new Error(`row ${id} was measured ${row.status} by the harness; a measured row takes no human answer`)
      }
    }
  }
  const answered = []
  for (const row of current) {
    const copy = { ...row }
    // A new answer replaces the old one whole: a walk drops a stale acceptance's date and name, and
    // an acceptance drops a stale walk's, so no row carries two signatures that disagree. It also
    // answers a reopen, so the reopen text leaves the reason and only the harness's own reason stays.
    // A fresh answer is this run's, not a carry, so the `carried` mark leaves with the old signature.
    if (walkedIds.has(row.row) || acceptedIds.has(row.row)) {
      copy.reason = withoutReopenedReason(copy.reason)
      delete copy.carried
    }
    if (walkedIds.has(row.row)) {
      delete copy.acceptedAt
      delete copy.acceptedBy
      Object.assign(copy, { status: 'performed', performedAt: on, performedBy: by })
    } else if (acceptedIds.has(row.row)) {
      delete copy.performedAt
      delete copy.performedBy
      Object.assign(copy, { status: 'accepted-unwalked', acceptedAt: on, acceptedBy: by })
    }
    answered.push(copy)
  }
  return answered
}
