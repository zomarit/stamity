#!/usr/bin/env node
// The enterprise upstream lane: take an upstream release into a fork of this repository through
// an isolated update branch, and say what happened in words a reviewer can act on.
//
// A fork changes things — a rule's prose, a default under `src/`, a generated tree — and then
// wants the next upstream release without losing that work. Git alone gives it a merge and a
// list of conflicted paths. This lane adds the three answers the spec asks for
// (`docs/specs/enterprise-upstream-lane.md`): which upstream release is REALLY in the branch, an
// integration attempt that cannot damage the branch it integrates into, and a report that names
// what happened. It is a plain script rather than a CLI verb because it has to run in a tree
// that is mid-merge, where `src/` may not compile and `dist/` may be stale; like
// `scripts/leak-gate.mjs` it uses Node built-ins and the `git` binary and imports nothing from
// `src/`.
//
// Usage: node scripts/upstream.mjs <verb> [options]        (or: npm run upstream -- <verb> ...)
//
//   status      derive the integrated release, the target release, the candidates, the
//               divergence and the affected paths from history; merge nothing.
//   preview     perform the merge in a throwaway detached worktree, report conflicts, the diff
//               stat, the release notes and the affected paths, then abort it and remove the
//               worktree. The operator's tree, index, stash list and branches are byte-identical
//               before and after.
//   integrate   create `stamity-upstream/<tag>` from the target branch head, check it out under
//               `.stamity/upstream-work/<tag>/`, merge the release there, regenerate, run the
//               fork's gates, write the record and commit — or leave the merge in progress and
//               report every conflict.
//   continue    finish an in-progress merge after the human resolved the non-generated
//               conflicts: regenerate, stage the generated paths, refuse any leftover marker,
//               run the gates, write the record, commit.
//   validate    re-run the gates on an existing update branch and commit a fresh record
//               (`upstream lane: gates re-run for <tag>`), so a branch fixed by hand can turn
//               from `validation-failed` to `integrated` without rewriting history.
//   abort       abort the in-progress merge, remove the update worktree, and delete the update
//               branch only when it carries no commit beyond the target head it was cut from.
//   help        print this usage.
//
//   --json             one JSON document on stdout and nothing else there; progress goes to stderr
//   --config <path>    read the configuration from <path> instead of `.stamity/upstream.json`
//   --release <tag>    select a release explicitly (status, preview, integrate; also names the
//                      update branch for continue, validate and abort when several exist)
//   --prerelease       admit tags carrying a prerelease suffix when picking the newest release
//   --offline          skip the fetch and read what the last fetch brought
//   --no-gates         do not run the gates; the record then says `skipped`, which never counts
//                      as integrated
//   --recreate         with integrate: delete a stale update branch that carries nothing but the
//                      lane's own merge commit, and start over
//   --branch <name>    take <name> as the target branch instead of the configured one, for every
//                      verb: `status` against the update branch itself, or `integrate` from a
//                      runner checkout whose branch carries another name
//
// The regenerate commands and the gates are the fork's own, read from the MERGED tree: `integrate`,
// `continue` and `validate` run them through the shell with the caller's environment, so a release
// is reviewed before those verbs run on a workstation holding credentials, or they run in CI, where
// the prepare job holds none. The report says so on the first run of either per invocation.
//
// Invariants, quoted from the spec; every verb below is written against them.
//   1. The target branch is never written. The lane reads the fork's integration branch and
//      writes only an update branch, in its own worktree.
//   2. History is the marker. A release is "integrated" only when its upstream commit is an
//      ancestor of the target branch AND no integration record for it says the gates failed or
//      were skipped. Ancestry with no record at all counts: records are evidence that may be
//      deleted (REQ-UPSTREAM-010), and a fork's history from before the lane carries none.
//   3. No conflict marker is ever committed. `continue` refuses while any unmerged index entry
//      or any `<<<<<<<`/`=======`/`>>>>>>>` marker line remains in a tracked file.
//   4. No blanket side preference. The lane never runs `merge -X ours`, `-X theirs`,
//      `checkout --ours/--theirs` over the conflict set, `reset --hard`, a force push, or a file
//      copy that hides a conflict. Generated paths are regenerated from their sources.
//   5. Both sides' work survives. Every commit reachable from the target branch and from the
//      upstream release stays reachable from the update branch's merge commit.
//   6. Idempotent by construction. Running any verb twice with the same inputs produces the
//      same outcome and no second copy of any artifact.
//   7. Nothing leaves the machine. No network call other than `git fetch` of the configured
//      upstream.
//
// Exit codes follow the CLI's three-status contract (`docs/cli-reference.md`, "Exit statuses"):
//   0  up-to-date, update-available, integrated (and aborted, help)
//   1  validation-failed, conflict, conflict-pending, update-branch-stale, regenerate-failed,
//      ancestry-missing, ancestry-lost — a result the caller must act on, with a full report
//   2  not-a-fork (no `.stamity/upstream.json`), a usage or configuration error, git missing or
//      older than 2.24 (the floor is `--end-of-options`, which guards every revision a record
//      supplies), a remote of the configured name with a different URL, a failed fetch
//
// THE JSON DOCUMENT (`--json`). One object, the same shape for every verb and every outcome, so a
// consumer — the opt-in GitHub workflow is the first — branches on `outcome` and reads the rest:
//   tool "stamity-upstream-lane", version 1, verb, outcome, exitCode,
//   config        the resolved configuration with defaults applied, plus `path` it was read from
//   upstream      { url, remote, branch, defaultBranchHead }
//   integrated    { tag, commit, record } — the highest release in the target's ancestry whose
//                 record agrees (absent counts as agreeing: the record is evidence, never
//                 authority) — or null
//   integratedReleases  every release in the target's ancestry, oldest first, each with its
//                 record and `verified` (record absent, passed or none)
//   unverified    ancestry present, record says failed or skipped — never counted as integrated
//   target        { tag, commit, date, isPrerelease } — the selected release — or null
//   candidates    [{ tag, commit, date }] every release newer than the integrated one, in order
//   skipped       the candidate tags the target's single merge covers besides the target itself
//   divergence    { behindRelease, aheadOfRelease, upstreamAheadOfRelease }
//   affected      { overlaps, watched, shadowed, renamed } — the drift rows of REQ-UPSTREAM-008
//   conflicts     [{ path, kind, generated, deletedBy?, renamedFrom?, renamedTo?, resolvedBy?,
//                 regenerated? }] kind is one of content, modify/delete, rename/delete, add/add,
//                 other; `regenerated: false` marks a generated path that regeneration left
//                 untouched, which stays unmerged for the human
//   gates         [{ name, run, status, exitCode, durationMs, outputTail }] status is one of
//                 passed, failed, skipped
//   regenerate    [{ run, status, exitCode, durationMs, outputTail }]
//   unlistedGenerated  [{ path, change }] tracked paths the regenerate commands rewrote that no
//                 `generatedPaths` glob covers — outcome `regenerate-failed`, nothing committed
//   branch        the update branch name or null;  worktree  its absolute path or null
//   mergeCommit   the merge commit's sha or null;  record  the record's repository path or null
//   lostRecords   [{ path, tag, commit }] the records whose release the history lacks — the
//                 diagnosis `status` reports as `ancestry-lost`; `preview` and `integrate` carry
//                 the rows and proceed for the selected release
//   releaseNotes  the `## [<version>]` section of upstream's CHANGELOG.md at the release, or null
//   diffStat      the merged diff stat (preview), or null
//   report        the markdown report, as one string;  messages  human guidance, one per line
// Outside `--json`, the markdown report is what stdout carries.
//
// Two additions to the spec's outcome vocabulary, both for verbs the spec leaves unnamed:
// `aborted` (abort, exit 0 — also when there was nothing to abort, so a second run is a no-op)
// and `help`. `status` reports `validation-failed` when the selected release is an ancestor of
// the target but its record says the gates failed or were skipped: the release is in history and
// still not integrated (invariant 2), and neither `up-to-date` nor `update-available` is true.
//
// Design decisions the spec leaves to the implementation, so nobody re-derives them:
//   - The target branch head is read from the local branch named in the configuration, then
//     from `refs/remotes/origin/<branch>`; when neither exists the run exits 2 naming both.
//   - `rerere` is enabled per command (`-c rerere.enabled=true` on the merge and on the merge
//     commit), never persisted: a linked worktree shares the repository configuration, and a
//     `git config` write there would have changed the operator's repository for good. The
//     recorded preimages and resolutions still land in the shared `rr-cache` of the repository,
//     which is the point — the next merge of the same conflict replays them.
//   - Gates and regenerate commands run through the platform shell with the update worktree as
//     cwd, output captured, the last lines kept in the report. `--no-gates` records `skipped`.
//   - Regeneration is measured, not trusted. Every conflicted generated path's content is
//     fingerprinted at merge time (kept in the lane state) and a path is staged only once its
//     content differs from that fingerprint — regeneration produced it, this run or an earlier
//     one; a path regeneration left as git left it stays unmerged for the human, since staging
//     it would have preferred a side (a binary conflict carries "ours" in the worktree). Tracked
//     paths outside `generatedPaths` are fingerprinted before and after regeneration, and one
//     regeneration rewrote fails the run: the gates would test what the commit lacks.
//   - The upstream URL is echoed without its userinfo (`user:password@`) in every document,
//     message and log line; git itself receives the URL as configured.
//   - `validate` commits a new record on every run: a validation is an event, and the record
//     commit is its evidence, so a second run is a second record rather than a no-op.
//   - Git runs through `execFile`-style spawning with no shell, real paths are composed with
//     `node:path`, and gitignore-style globs (`*`, `**`, `?`, a leading `/` anchor, a `/`
//     directory suffix) are compiled to regular expressions here rather than through a
//     platform matcher, so the same list means the same thing on every host.
//   - A marker scan covers the files the merge touched (`git diff --name-only HEAD` in the
//     update worktree plus every path git reported conflicted). A bare `=======` line counts
//     only beside a `<<<<<<<`, `>>>>>>>` or `|||||||` line in the same file: alone it is a
//     Markdown setext underline, and refusing forever on one would block a fork with no way out.
//   - A merge whose only conflicts are generated paths needs no human: `integrate` finishes it
//     the way `continue` would, since "every non-generated conflict is resolved" already holds.
//   - Commits use the repository's identity; when git cannot determine one (a CI runner with no
//     `user.*`), a placeholder identity on the reserved `.invalid` domain is used and the report
//     says so. The merge itself takes the same fallback: `git merge` resolves the committer
//     identity before it touches a file, `--no-commit` notwithstanding, so a runner with no
//     identity failed at the merge and never reached the commit that carried the fallback — the
//     first dispatch on GitHub Actions found it. Hooks are bypassed (`--no-verify`): the fork's
//     gates are its declared ones.
//   - Lane state for an in-progress merge (the release, the head the branch was cut from, the
//     conflicts with their kinds) lives in the update worktree's own git directory, so
//     `continue` can name what the human resolved without re-deriving it.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOOL = 'stamity-upstream-lane'
export const DOCUMENT_VERSION = 1
export const CONFIG_RELATIVE_PATH = '.stamity/upstream.json'
export const RECORD_DIRECTORY = '.stamity/upstream/integrations'
export const WORK_DIRECTORY = '.stamity/upstream-work'
export const REF_NAMESPACE = 'refs/stamity-upstream'
export const BRANCH_PREFIX = 'stamity-upstream/'
export const GIT_FLOOR = [2, 24]
export const VERBS = ['status', 'preview', 'integrate', 'continue', 'validate', 'abort', 'help']

/** Outcome -> exit status. The spec's vocabulary plus `aborted` and `help` (see the header). */
export const OUTCOMES = Object.freeze({
  'up-to-date': 0,
  'update-available': 0,
  integrated: 0,
  aborted: 0,
  help: 0,
  'validation-failed': 1,
  conflict: 1,
  'conflict-pending': 1,
  'update-branch-stale': 1,
  'regenerate-failed': 1,
  'ancestry-missing': 1,
  'ancestry-lost': 1,
  'not-a-fork': 2,
  error: 2,
})

export function exitCodeFor(outcome) {
  const code = OUTCOMES[outcome]
  if (code === undefined) throw new Error(`unknown outcome ${JSON.stringify(outcome)}`)
  return code
}

const NO_GATES_NOTICE = 'no gates configured — a clean merge proves nothing about behaviour'
const STATE_FILE = 'stamity-upstream-lane.json'
const OUTPUT_TAIL_LINES = 40
const MAX_BUFFER = 256 * 1024 * 1024
const FALLBACK_IDENTITY = { name: 'Stamity upstream lane', email: 'upstream-lane@stamity.invalid' }
const TRUST_NOTICE =
  '`integrate`, `continue` and `validate` run the merged tree\'s regenerate commands and gates with the caller\'s environment: ' +
  'review the release before running them on a workstation holding credentials, or run them in CI, where the prepare job holds none'
/** A full SHA-1 or SHA-256 object id — the only shape a record may supply as a revision. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/** A failure the lane classifies: `outcome` and `exitCode` travel with the message. */
export class LaneError extends Error {
  constructor(message, { outcome = 'error', exitCode } = {}) {
    super(message)
    this.name = 'LaneError'
    this.outcome = outcome
    this.exitCode = exitCode ?? exitCodeFor(outcome)
  }
}

// ---------------------------------------------------------------------------------------------
// Configuration (REQ-UPSTREAM-001)

export const CONFIG_DEFAULTS = Object.freeze({
  remote: 'upstream',
  branch: 'main',
  releases: Object.freeze({ pattern: 'v*', prerelease: false }),
  gates: Object.freeze([]),
  regenerate: Object.freeze([]),
  generatedPaths: Object.freeze([]),
  watch: Object.freeze([]),
  shadows: Object.freeze({}),
})

const CONFIG_KEYS = ['version', 'upstream', 'remote', 'branch', 'releases', 'gates', 'regenerate', 'generatedPaths', 'watch', 'shadows']
const RELEASES_KEYS = ['pattern', 'prerelease']
const GATE_KEYS = ['name', 'run']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function configError(path, detail) {
  return new LaneError(`${path}: ${detail}`)
}

function requireString(path, key, value, { allowMissing = false } = {}) {
  if (value === undefined && allowMissing) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw configError(path, `${JSON.stringify(key)} must be a non-empty string`)
  }
  return value
}

function requireStringList(path, key, value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw configError(path, `${JSON.stringify(key)} must be an array of non-empty strings`)
  }
  return [...value]
}

function rejectUnknownKeys(path, label, object, allowed) {
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw configError(
      path,
      `unknown key(s) ${unknown.map((key) => JSON.stringify(key)).join(', ')} in ${label}; the keys are ${allowed.join(', ')}`,
    )
  }
}

/**
 * Parses and validates `.stamity/upstream.json`. `upstream` is required; every other key takes
 * the spec's default. An unknown key, a non-object, or a `version` other than 1 is a config
 * error (exit 2). `version` is not among the defaulted keys, so it has to be present and be 1.
 */
export function parseConfig(text, path = CONFIG_RELATIVE_PATH) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw configError(path, `not valid JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  if (!isPlainObject(raw)) throw configError(path, 'the top level must be a JSON object')
  rejectUnknownKeys(path, 'the configuration', raw, CONFIG_KEYS)
  if (raw.version !== 1) {
    throw configError(path, `"version" must be the number 1 (found ${raw.version === undefined ? 'no version' : JSON.stringify(raw.version)})`)
  }
  const upstream = requireString(path, 'upstream', raw.upstream)
  const remote = requireString(path, 'remote', raw.remote, { allowMissing: true }) ?? CONFIG_DEFAULTS.remote
  if (/[\s/]/.test(remote)) throw configError(path, '"remote" must be a plain remote name with no whitespace or slash')
  const branch = requireString(path, 'branch', raw.branch, { allowMissing: true }) ?? CONFIG_DEFAULTS.branch

  let releases = { ...CONFIG_DEFAULTS.releases }
  if (raw.releases !== undefined) {
    if (!isPlainObject(raw.releases)) throw configError(path, '"releases" must be an object')
    rejectUnknownKeys(path, '"releases"', raw.releases, RELEASES_KEYS)
    const pattern = requireString(path, 'releases.pattern', raw.releases.pattern, { allowMissing: true })
    if (raw.releases.prerelease !== undefined && typeof raw.releases.prerelease !== 'boolean') {
      throw configError(path, '"releases.prerelease" must be a boolean')
    }
    releases = {
      pattern: pattern ?? CONFIG_DEFAULTS.releases.pattern,
      prerelease: raw.releases.prerelease ?? CONFIG_DEFAULTS.releases.prerelease,
    }
  }

  const gates = []
  if (raw.gates !== undefined) {
    if (!Array.isArray(raw.gates)) throw configError(path, '"gates" must be an array of { name, run } objects')
    raw.gates.forEach((gate, index) => {
      if (!isPlainObject(gate)) throw configError(path, `"gates[${index}]" must be an object with "name" and "run"`)
      rejectUnknownKeys(path, `"gates[${index}]"`, gate, GATE_KEYS)
      gates.push({
        name: requireString(path, `gates[${index}].name`, gate.name),
        run: requireString(path, `gates[${index}].run`, gate.run),
      })
    })
  }

  const shadows = {}
  if (raw.shadows !== undefined) {
    if (!isPlainObject(raw.shadows)) throw configError(path, '"shadows" must be an object mapping a fork path to an upstream path')
    for (const [forkPath, upstreamPath] of Object.entries(raw.shadows)) {
      if (forkPath.trim() === '' || typeof upstreamPath !== 'string' || upstreamPath.trim() === '') {
        throw configError(path, `"shadows" entry ${JSON.stringify(forkPath)} must map a non-empty fork path to a non-empty upstream path`)
      }
      shadows[forkPath] = upstreamPath
    }
  }

  return {
    path,
    version: 1,
    upstream,
    remote,
    branch,
    releases,
    gates,
    regenerate: requireStringList(path, 'regenerate', raw.regenerate),
    generatedPaths: requireStringList(path, 'generatedPaths', raw.generatedPaths),
    watch: requireStringList(path, 'watch', raw.watch),
    shadows,
  }
}

// ---------------------------------------------------------------------------------------------
// Release tags: semantic-version order over the names matching the pattern

const VERSION_SHAPE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/**
 * Parses one tag name against the release pattern. The version is what the pattern's wildcard
 * span covers — for `v*` everything after the `v` — and it must be a semantic version; a tag
 * that does not match the pattern or does not parse is not a release (null).
 */
export function parseReleaseTag(tag, pattern = 'v*') {
  let core = tag
  const first = pattern.indexOf('*')
  if (first !== -1) {
    const prefix = pattern.slice(0, first)
    const suffix = pattern.slice(pattern.lastIndexOf('*') + 1)
    if (tag.length < prefix.length + suffix.length || !tag.startsWith(prefix) || !tag.endsWith(suffix)) return null
    core = tag.slice(prefix.length, tag.length - suffix.length)
  } else if (tag !== pattern) {
    return null
  }
  const match = VERSION_SHAPE.exec(core)
  if (match === null) return null
  const [, major, minor, patch, prerelease] = match
  return {
    tag,
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? null : prerelease.split('.'),
    version: `${major}.${minor}.${patch}${prerelease === undefined ? '' : `-${prerelease}`}`,
  }
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) return Number(left) - Number(right)
  if (leftNumeric) return -1
  if (rightNumeric) return 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Semantic-version precedence (semver 2.0.0 §11) over two parsed releases. */
export function compareReleases(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  if (left.prerelease === null && right.prerelease === null) return 0
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  const length = Math.min(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const order = compareIdentifiers(left.prerelease[index], right.prerelease[index])
    if (order !== 0) return order
  }
  return left.prerelease.length - right.prerelease.length
}

/** The releases among `tags`, ascending; prerelease tags only when `prerelease` is true. */
export function selectReleases(tags, { pattern = 'v*', prerelease = false } = {}) {
  return tags
    .map((tag) => parseReleaseTag(tag, pattern))
    .filter((release) => release !== null && (prerelease || release.prerelease === null))
    .toSorted(compareReleases)
}

/**
 * Why a tag name cannot become the lane's branch, ref or directory — or null when it can. A tag
 * reaches argv as `stamity-upstream/<tag>` and `refs/stamity-upstream/tags/<tag>`, and the disk
 * as `.stamity/upstream-work/<tag>/`, so a leading `-`, a control character, whitespace, or a
 * `.`/`..` segment is refused here, before any of those; `git check-ref-format` covers the rest.
 */
export function checkTagShape(tag) {
  if (typeof tag !== 'string' || tag === '') return 'it is empty'
  if (tag.startsWith('-')) return 'it starts with "-", which a command would read as an option'
  for (const char of tag) {
    const code = char.codePointAt(0)
    if (code < 0x20 || code === 0x7f || /\s/.test(char)) return 'it contains a control character or whitespace'
  }
  if (tag.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'it contains an empty, "." or ".." path segment'
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// gitignore-style globs over POSIX paths

const REGEXP_SPECIALS = new Set(['.', '+', '^', '$', '(', ')', '{', '}', '[', ']', '|', '\\'])

/**
 * Compiles one gitignore-style glob: `*` matches within a segment, `**` across segments, `?`
 * one character, a leading `/` anchors to the root — and so does any `/` that is not the last
 * character, as in gitignore — and a trailing `/` names a directory. A pattern that matches a
 * directory matches everything under it, which is also gitignore's rule.
 */
export function globToRegExp(glob) {
  let pattern = glob.trim()
  let anchored = false
  if (pattern.startsWith('/')) {
    anchored = true
    pattern = pattern.slice(1)
  }
  let directoryOnly = false
  if (pattern.endsWith('/')) {
    directoryOnly = true
    pattern = pattern.slice(0, -1)
  }
  if (pattern.includes('/')) anchored = true
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else if (REGEXP_SPECIALS.has(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  const head = anchored ? '^' : '^(?:.*/)?'
  const tail = directoryOnly ? '(?:/.+)$' : '(?:/.*)?$'
  return new RegExp(`${head}${source}${tail}`)
}

const GLOB_CACHE = new Map()

function compiledGlob(glob) {
  let compiled = GLOB_CACHE.get(glob)
  if (compiled === undefined) {
    compiled = globToRegExp(glob)
    GLOB_CACHE.set(glob, compiled)
  }
  return compiled
}

/** True when the POSIX `path` matches any of the gitignore-style `globs`. */
export function matchesAnyGlob(path, globs) {
  return globs.some((glob) => compiledGlob(glob).test(path))
}

// ---------------------------------------------------------------------------------------------
// Conflicts: `git status --porcelain=v2 -z` and the merge's own CONFLICT lines

function splitFields(record, count) {
  const fields = []
  let rest = record
  for (let index = 0; index < count; index += 1) {
    const space = rest.indexOf(' ')
    if (space === -1) return null
    fields.push(rest.slice(0, space))
    rest = rest.slice(space + 1)
  }
  fields.push(rest)
  return fields
}

/**
 * Parses `git status --porcelain=v2 -z --untracked-files=all` into entries:
 * `{ kind: 'changed' | 'renamed' | 'unmerged' | 'untracked' | 'ignored', xy, path, from }`.
 */
export function parsePorcelainStatus(text) {
  const entries = []
  const records = text.split('\0')
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === '') continue
    const type = record[0]
    if (type === '1') {
      const fields = splitFields(record, 8)
      if (fields !== null) entries.push({ kind: 'changed', xy: fields[1], path: fields[8] })
    } else if (type === '2') {
      const fields = splitFields(record, 9)
      index += 1
      if (fields !== null) entries.push({ kind: 'renamed', xy: fields[1], path: fields[9], from: records[index] ?? '' })
    } else if (type === 'u') {
      const fields = splitFields(record, 10)
      if (fields !== null) entries.push({ kind: 'unmerged', xy: fields[1], path: fields[10] })
    } else if (type === '?') {
      entries.push({ kind: 'untracked', xy: '??', path: record.slice(2) })
    } else if (type === '!') {
      entries.push({ kind: 'ignored', xy: '!!', path: record.slice(2) })
    }
  }
  return entries
}

const UNMERGED_KINDS = {
  UU: { kind: 'content' },
  AA: { kind: 'add/add' },
  UD: { kind: 'modify/delete', deletedBy: 'upstream' },
  DU: { kind: 'modify/delete', deletedBy: 'fork' },
  DD: { kind: 'other', detail: 'deleted on both sides' },
  AU: { kind: 'other', detail: 'added by the fork, unmerged' },
  UA: { kind: 'other', detail: 'added by upstream, unmerged' },
}

/** The merge names the fork's side `HEAD` and the upstream side by its commit id. */
function sideOf(name) {
  return name === 'HEAD' ? 'fork' : 'upstream'
}

/**
 * Reads the `CONFLICT (<kind>): ...` lines a merge prints (with `LC_ALL=C`) into a map keyed by
 * path. The merge names the upstream side by its commit id and the fork by `HEAD`, which is how
 * `deletedBy` is derived.
 */
export function parseMergeOutput(text) {
  const kindsByPath = new Map()
  for (const line of text.split(/\r?\n/)) {
    const match = /^CONFLICT \(([^)]+)\): (.*)$/.exec(line)
    if (match === null) continue
    const [, kind, detail] = match
    if (kind === 'content' || kind === 'add/add') {
      const target = /^Merge conflict in (.+)$/.exec(detail)
      if (target !== null) kindsByPath.set(target[1], { kind, detail: line })
    } else if (kind === 'modify/delete') {
      const target = /^(.+?) deleted in (\S+) and modified in (\S+)\./.exec(detail)
      if (target !== null) kindsByPath.set(target[1], { kind, deletedBy: sideOf(target[2]), detail: line })
    } else if (kind === 'rename/delete') {
      const target = /^(.+?) renamed to (.+?) in (\S+), but deleted in (\S+)\./.exec(detail)
      if (target !== null) {
        const entry = { kind, renamedFrom: target[1], renamedTo: target[2], deletedBy: sideOf(target[4]), detail: line }
        kindsByPath.set(target[2], entry)
        kindsByPath.set(target[1], entry)
      }
    } else {
      const paths = [...detail.matchAll(/(?:^|\s)([^\s,]+\/[^\s,]+)/g)].map((found) => found[1])
      for (const path of paths) kindsByPath.set(path, { kind: 'other', detail: line })
    }
  }
  return kindsByPath
}

/**
 * Classifies every unmerged index entry: kind from the merge's own CONFLICT line when it named
 * the path (the only source that can tell rename/delete from modify/delete), else from the
 * porcelain XY code; `generated` when the path matches `generatedPaths`.
 */
export function classifyConflicts(porcelainText, mergeOutput, generatedPaths = []) {
  const kinds = parseMergeOutput(mergeOutput)
  const conflicts = []
  for (const entry of parsePorcelainStatus(porcelainText)) {
    if (entry.kind !== 'unmerged') continue
    const fromIndex = UNMERGED_KINDS[entry.xy] ?? { kind: 'other', detail: `unmerged (${entry.xy})` }
    const fromMerge = kinds.get(entry.path)
    const conflict = {
      path: entry.path,
      kind: fromMerge?.kind ?? fromIndex.kind,
      generated: matchesAnyGlob(entry.path, generatedPaths),
    }
    const deletedBy = fromMerge?.deletedBy ?? fromIndex.deletedBy
    if (deletedBy !== undefined) conflict.deletedBy = deletedBy
    if (fromMerge?.renamedFrom !== undefined) conflict.renamedFrom = fromMerge.renamedFrom
    if (fromMerge?.renamedTo !== undefined) conflict.renamedTo = fromMerge.renamedTo
    const detail = fromMerge?.detail ?? fromIndex.detail
    if (detail !== undefined) conflict.detail = detail
    conflicts.push(conflict)
  }
  return conflicts.toSorted(byPath)
}

// ---------------------------------------------------------------------------------------------
// Conflict markers (invariant 3)

const MARKER_LINE = /^(<{7}|={7}|>{7}|\|{7})(?: |$)/

/**
 * The conflict-marker lines of a text, git's own rule: seven identical `<`, `=`, `>` or `|`
 * characters at the start of a line, followed by a space or the end of the line. A bare
 * `=======` counts only beside one of the other three in the same file — alone it is a Markdown
 * setext underline, not a marker (see the header).
 */
export function findConflictMarkers(text) {
  const found = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = MARKER_LINE.exec(lines[index])
    if (match !== null) found.push({ line: index + 1, marker: match[1] })
  }
  return found.some((entry) => entry.marker !== '=======') ? found : []
}

export function hasConflictMarkers(text) {
  return findConflictMarkers(text).length > 0
}

// ---------------------------------------------------------------------------------------------
// Release notes: the CHANGELOG section, extracted the way release.yml's awk extracts it

/**
 * The body of the `## [<version>]` section of a Keep-a-Changelog file, or null when the heading
 * is missing or the body is whitespace. Link-reference lines (`[x]: url`) and the blanks between
 * them are HELD rather than stopped on: a real line after them flushes the buffer, and a buffer
 * still held at the end of the section — the trailing footer — is discarded. This is the rule
 * `.github/workflows/release.yml`'s "Compose release notes" step applies.
 */
export function extractReleaseNotes(changelog, version) {
  const target = `## [${version}]`
  const out = []
  let held = []
  let printing = false
  let found = false
  for (const line of changelog.split(/\r?\n/)) {
    if (line.startsWith('## [')) {
      if (line.startsWith(target)) {
        printing = true
        found = true
        continue
      }
      if (printing) printing = false
    }
    if (!printing) continue
    if (/^\[[^\][]+\]:[ \t]/.test(line)) {
      held.push(line)
      continue
    }
    if (held.length > 0 && /^[ \t]*$/.test(line)) {
      held.push(line)
      continue
    }
    out.push(...held)
    held = []
    out.push(line)
  }
  if (!found) return null
  // The awk keeps the blank line under the heading and the workflow's heredoc absorbs it; here
  // the body is trimmed of leading and trailing blank lines so it embeds cleanly anywhere.
  const body = out.join('\n').replace(/^\n+/, '').replace(/\s+$/, '')
  return body.trim() === '' ? null : body
}

// ---------------------------------------------------------------------------------------------
// Shadows (REQ-UPSTREAM-008): the automatic override -> corpus pairs

/**
 * The automatic shadow pairs a fork's `.stamity/overrides/` tree implies:
 * `.stamity/overrides/<class>/<id>.md` and `<id>.customize.{yaml,md}` shadow
 * `content/<class>/<id>.md`; `.stamity/overrides/skills/<id>/SKILL.md` shadows
 * `content/skills/<id>/SKILL.md`. Paths are POSIX and repository-relative.
 */
export function deriveShadowPairs(paths) {
  const pairs = {}
  for (const path of paths) {
    if (!path.startsWith('.stamity/overrides/')) continue
    const segments = path.slice('.stamity/overrides/'.length).split('/')
    const [klass, ...rest] = segments
    if (klass === undefined || klass === '') continue
    if (klass === 'skills' && rest.length === 2 && rest[1] === 'SKILL.md') {
      pairs[path] = `content/skills/${rest[0]}/SKILL.md`
      continue
    }
    if (rest.length !== 1) continue
    const name = rest[0]
    const id = name.endsWith('.customize.yaml')
      ? name.slice(0, -'.customize.yaml'.length)
      : name.endsWith('.customize.md')
        ? name.slice(0, -'.customize.md'.length)
        : name.endsWith('.md')
          ? name.slice(0, -'.md'.length)
          : null
    if (id === null || id === '') continue
    pairs[path] = `content/${klass}/${id}.md`
  }
  return pairs
}

// ---------------------------------------------------------------------------------------------
// The integration record (REQ-UPSTREAM-010)

/** The record's gate verdict from the gate results and the flags. */
export function gatesVerdict(results, { skipped = false } = {}) {
  if (results.length === 0) return 'none'
  if (skipped) return 'skipped'
  return results.some((result) => result.status === 'failed') ? 'failed' : 'passed'
}

export function buildRecord(input) {
  return {
    tool: TOOL,
    version: DOCUMENT_VERSION,
    release: input.release,
    releaseCommit: input.releaseCommit,
    mergeBase: input.mergeBase,
    targetBranch: input.targetBranch,
    targetHead: input.targetHead,
    covers: input.covers ?? [input.release],
    gates: input.gates,
    gateResults: (input.gateResults ?? []).map((result) => ({
      name: result.name,
      run: result.run,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    })),
    regenerate: (input.regenerate ?? []).map((result) => ({
      run: result.run,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    })),
    conflicts: input.conflicts ?? [],
    affected: input.affected ?? { overlaps: [], watched: [], shadowed: [], renamed: [] },
    createdAt: input.createdAt,
  }
}

// ---------------------------------------------------------------------------------------------
// git

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function createGit() {
  const env = { ...process.env, LC_ALL: 'C' }
  return function git(args, { cwd = process.cwd(), check = true } = {}) {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true })
    if (result.error !== undefined) {
      if (result.error.code === 'ENOENT') {
        throw new LaneError(`git was not found on PATH — install git ${GIT_FLOOR.join('.')} or newer`)
      }
      throw new LaneError(`git ${args[0]} could not be started: ${describeError(result.error)}`)
    }
    if (check && result.status !== 0) {
      const detail = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim()
      throw new LaneError(`git ${args.join(' ')} failed (exit ${result.status})${detail === '' ? '' : `: ${detail}`}`)
    }
    return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
  }
}

function checkGitVersion(git) {
  const match = /git version (\d+)\.(\d+)/.exec(git(['--version']).stdout)
  if (match === null) throw new LaneError('could not read the git version from `git --version`')
  const [major, minor] = [Number(match[1]), Number(match[2])]
  const [floorMajor, floorMinor] = GIT_FLOOR
  if (major < floorMajor || (major === floorMajor && minor < floorMinor)) {
    throw new LaneError(`git ${major}.${minor} is older than the lane's floor ${floorMajor}.${floorMinor}`)
  }
}

// The three revision readers take `--end-of-options` (git 2.24) so that a revision a record or a
// state file supplied — an object id it claims — can never be read as an option.
function revParse(git, cwd, ref) {
  const result = git(['rev-parse', '-q', '--verify', '--end-of-options', `${ref}^{commit}`], { cwd, check: false })
  return result.status === 0 ? result.stdout.trim() : null
}

function isAncestor(git, cwd, ancestor, descendant) {
  const result = git(['merge-base', '--is-ancestor', '--end-of-options', ancestor, descendant], { cwd, check: false })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new LaneError(`git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${result.stderr.trim()}`)
}

function countCommits(git, cwd, ...revisions) {
  return Number(git(['rev-list', '--count', '--end-of-options', ...revisions], { cwd }).stdout.trim())
}

function showFile(git, cwd, commit, path) {
  const result = git(['show', `${commit}:${path}`], { cwd, check: false })
  return result.status === 0 ? result.stdout : null
}

function shortSha(sha) {
  return sha === null || sha === undefined ? '(none)' : sha.slice(0, 7)
}

function log(message) {
  process.stderr.write(`upstream: ${message}\n`)
}

// ---------------------------------------------------------------------------------------------
// Repository context

/**
 * The repository root the run works in: the current worktree's top level, except from inside
 * one of the lane's own update worktrees — recognised by its `.stamity/upstream-work/` path or
 * its `stamity-upstream/` branch — where the root is the worktree that created it (the path
 * above the marker directory), falling back to the main worktree. A linked worktree of the fork
 * is therefore its own root, and `continue` works from inside the update worktree.
 */
function openRepository(options) {
  const git = createGit()
  checkGitVersion(git)
  const cwd = process.cwd()
  const top = git(['rev-parse', '--show-toplevel'], { cwd, check: false })
  if (top.status !== 0) {
    throw new LaneError(`${cwd} is not inside a git working tree: ${top.stderr.trim()}`)
  }
  const gitDir = resolve(cwd, git(['rev-parse', '--git-common-dir'], { cwd }).stdout.trim())
  const current = git(['symbolic-ref', '-q', '--short', 'HEAD'], { cwd, check: false })
  const currentBranch = current.status === 0 ? current.stdout.trim() : null
  let root = resolve(top.stdout.trim())
  const marker = `${sep}${WORK_DIRECTORY.split('/').join(sep)}${sep}`
  const nested = root.indexOf(marker)
  if (nested !== -1) root = root.slice(0, nested)
  else if (currentBranch !== null && currentBranch.startsWith(BRANCH_PREFIX)) {
    if (basename(gitDir) !== '.git') throw new LaneError(`the lane needs a working tree; ${gitDir} looks like a bare repository`)
    root = dirname(gitDir)
  }
  return { git, root, gitDir, cwd, currentBranch, options }
}

function loadConfig(context) {
  const explicit = context.options.config
  const path = explicit === undefined ? join(context.root, '.stamity', 'upstream.json') : resolve(context.cwd, explicit)
  if (!existsSync(path)) {
    if (explicit !== undefined) throw new LaneError(`configuration file ${path} does not exist`)
    throw new LaneError(
      `no ${CONFIG_RELATIVE_PATH} at ${context.root} — this repository declares no upstream, so it is not a fork. ` +
        'A fork creates that file with at least {"version": 1, "upstream": "<git url>"}.',
      { outcome: 'not-a-fork' },
    )
  }
  return parseConfig(readFileSync(path, 'utf8'), path)
}

function resolveTarget(context, config) {
  const branch = context.options.branch ?? config.branch
  const candidates = [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]
  for (const ref of candidates) {
    const head = revParse(context.git, context.root, ref)
    if (head !== null) return { branch, ref, head }
  }
  throw new LaneError(
    `target branch ${JSON.stringify(branch)} not found: neither ${candidates[0]} nor ${candidates[1]} exists — ` +
      'check "branch" in the configuration, or fetch the branch first',
  )
}

function normalizeUrl(url) {
  return url.trim().replace(/\/+$/, '').replace(/\.git$/, '')
}

const URL_USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)([^/]*)@/i

/**
 * The URL without its userinfo — `https://user:token@host/x` becomes `https://host/x` — which is
 * the only form a document, a message or a log line carries. An scp-like `git@host:x` has no
 * `://` and is left alone: its user is not a secret. Git itself receives the URL as configured.
 */
export function redactUrl(url) {
  return url.replace(URL_USERINFO, '$1')
}

/** Git's own output with the configured URL's `userinfo@` removed wherever it echoed it. */
function redactText(text, url) {
  const match = URL_USERINFO.exec(url)
  if (match === null || match[2] === '') return text
  return text.split(`${match[2]}@`).join('')
}

function ensureRemote(context, config) {
  const { git, root } = context
  const current = git(['remote', 'get-url', config.remote], { cwd: root, check: false })
  if (current.status !== 0) {
    git(['remote', 'add', config.remote, config.upstream], { cwd: root })
    return { url: config.upstream, created: true }
  }
  const existing = current.stdout.trim()
  if (normalizeUrl(existing) !== normalizeUrl(config.upstream)) {
    throw new LaneError(
      `remote ${JSON.stringify(config.remote)} points at ${redactUrl(existing)} and the configuration names ${redactUrl(config.upstream)}; ` +
        'the lane does not repoint a remote — change one of them',
    )
  }
  return { url: existing, created: false }
}

function fetchUpstream(context, config) {
  const { git, root } = context
  log(`fetching release tags from ${config.remote} (${redactUrl(config.upstream)})`)
  const tags = git(
    ['fetch', '--no-tags', '--prune', '--quiet', config.remote, `+refs/tags/*:${REF_NAMESPACE}/tags/*`],
    { cwd: root, check: false },
  )
  if (tags.status !== 0) {
    throw new LaneError(`fetch from ${config.remote} (${redactUrl(config.upstream)}) failed: ${redactText(tags.stderr.trim(), config.upstream)}`)
  }
  const head = git(
    ['fetch', '--no-tags', '--quiet', config.remote, `+refs/heads/${config.branch}:${REF_NAMESPACE}/heads/${config.branch}`],
    { cwd: root, check: false },
  )
  return head.status === 0
    ? []
    : [`upstream has no branch ${JSON.stringify(config.branch)} (${redactText(head.stderr.trim(), config.upstream)}); the release tags were fetched, the default-branch comparison is unavailable`]
}

function listUpstreamTags(context) {
  const { git, root } = context
  const prefix = `${REF_NAMESPACE}/tags/`
  const format = '%(refname)%00%(objecttype)%00%(objectname)%00%(*objectname)%00%(*objecttype)%00%(creatordate:iso-strict)'
  const output = git(['for-each-ref', `--format=${format}`, prefix], { cwd: root }).stdout
  const tags = []
  const messages = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [refname, type, objectname, peeled, peeledType, date] = line.split('\0')
    const tag = refname.slice(prefix.length)
    const refused = checkTagShape(tag)
    if (refused !== null) {
      messages.push(`tag ${JSON.stringify(tag)} was ignored: ${refused}`)
      continue
    }
    let commit = objectname
    if (type === 'tag') commit = peeledType === 'commit' ? peeled : revParse(git, root, refname)
    else if (type !== 'commit') commit = null
    if (commit === null) {
      messages.push(`tag ${tag} does not point at a commit and was ignored`)
      continue
    }
    tags.push({ tag, ref: refname, commit, date })
  }
  return { tags, messages }
}

// ---------------------------------------------------------------------------------------------
// Derived state (REQ-UPSTREAM-003, -004, -008)

/**
 * The integration records under `RECORD_DIRECTORY` at `head`, keyed by release. Every entry that
 * is not a well-formed record — not `.json`, unreadable, not JSON, not an object, or without a
 * `releaseCommit` that is an object id — is reported by path and left out, never skipped
 * silently: the record is evidence, and evidence that cannot be read is worth a line.
 */
function readRecords(context, head) {
  const { git, root } = context
  const listing = git(['ls-tree', '-r', '-z', '--name-only', head, '--', `${RECORD_DIRECTORY}/`], { cwd: root, check: false })
  const records = new Map()
  const messages = []
  if (listing.status !== 0) return { records, messages }
  for (const path of listing.stdout.split('\0')) {
    if (path === '') continue
    if (!path.endsWith('.json')) {
      messages.push(`${path} under ${RECORD_DIRECTORY}/ is not a .json record and was ignored`)
      continue
    }
    const text = showFile(git, root, head, path)
    if (text === null) {
      messages.push(`record ${path} could not be read at ${shortSha(head)} and was ignored`)
      continue
    }
    let record
    try {
      record = JSON.parse(text)
    } catch (error) {
      messages.push(`record ${path} is not valid JSON and was ignored (${describeError(error)})`)
      continue
    }
    if (!isPlainObject(record) || typeof record.releaseCommit !== 'string' || !OBJECT_ID.test(record.releaseCommit)) {
      messages.push(`record ${path} does not name its release commit as a full object id in "releaseCommit" and was ignored`)
      continue
    }
    const tag = typeof record.release === 'string' ? record.release : path.slice(RECORD_DIRECTORY.length + 1, -'.json'.length)
    records.set(tag, { path, record })
  }
  return { records, messages }
}

function parseNameStatus(text) {
  const changes = new Map()
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index]
    if (status === '' || status === undefined) continue
    const code = status[0]
    if (code === 'R' || code === 'C') {
      const from = tokens[index + 1] ?? ''
      const to = tokens[index + 2] ?? ''
      index += 2
      changes.set(to, { status: code === 'R' ? 'renamed' : 'copied', from, to })
      if (code === 'R') changes.set(from, { status: 'renamed-away', from, to })
    } else {
      const path = tokens[index + 1] ?? ''
      index += 1
      changes.set(path, { status: code === 'D' ? 'deleted' : code === 'A' ? 'added' : 'modified', from: null, to: path })
    }
  }
  return changes
}

function parseNumstat(text) {
  const lines = new Map()
  const tokens = text.split('\0')
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '' || token === undefined) continue
    const [added, removed, path] = token.split('\t')
    const counts = { added: added === '-' ? null : Number(added), removed: removed === '-' ? null : Number(removed) }
    if (path === '' || path === undefined) {
      const from = tokens[index + 1] ?? ''
      const to = tokens[index + 2] ?? ''
      index += 2
      lines.set(to, counts)
      lines.set(from, counts)
    } else {
      lines.set(path, counts)
    }
  }
  return lines
}

/** Row order for the affected lists: by the row's path, whichever field carries it. */
function byPath(left, right) {
  const leftKey = left.path ?? left.forkPath ?? left.from
  const rightKey = right.path ?? right.forkPath ?? right.from
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

function computeAffected(context, config, base, targetHead, releaseCommit, releaseTag) {
  const { git, root } = context
  const upstream = parseNameStatus(git(['diff', '--name-status', '-M', '-z', base, releaseCommit], { cwd: root }).stdout)
  const upstreamLines = parseNumstat(git(['diff', '--numstat', '-M', '-z', base, releaseCommit], { cwd: root }).stdout)
  const fork = parseNameStatus(git(['diff', '--name-status', '-M', '-z', base, targetHead], { cwd: root }).stdout)
  const linesOf = (path) => upstreamLines.get(path) ?? { added: null, removed: null }

  const overlaps = []
  for (const [path, change] of upstream) {
    if (fork.has(path)) overlaps.push({ path, upstreamChange: change.status, upstreamLines: linesOf(path) })
  }

  const watched = []
  for (const [path, change] of upstream) {
    if (matchesAnyGlob(path, config.watch)) watched.push({ path, upstreamChange: change.status, upstreamLines: linesOf(path) })
  }

  const forkTree = git(['ls-tree', '-r', '--name-only', targetHead, '--', '.stamity/overrides/'], { cwd: root, check: false })
  const automatic = forkTree.status === 0 ? deriveShadowPairs(forkTree.stdout.split('\n').filter((line) => line !== '')) : {}
  const pairs = { ...automatic, ...config.shadows }
  const shadowed = []
  for (const [forkPath, upstreamPath] of Object.entries(pairs)) {
    const change = upstream.get(upstreamPath)
    if (change === undefined) continue
    const row = { forkPath, upstreamPath, release: releaseTag, upstreamLines: linesOf(upstreamPath) }
    if (change.status === 'deleted') row.change = 'deleted'
    else if (change.status === 'renamed-away') {
      row.change = 'renamed'
      row.renamedTo = change.to
    } else row.change = 'modified'
    shadowed.push(row)
  }

  const renamed = []
  for (const [path, change] of upstream) {
    if (change.status !== 'renamed') continue
    renamed.push({ from: change.from, to: path, forkChanged: fork.has(change.from), upstreamLines: linesOf(path) })
  }

  return { overlaps: overlaps.toSorted(byPath), watched: watched.toSorted(byPath), shadowed: shadowed.toSorted(byPath), renamed: renamed.toSorted(byPath) }
}

function selectTarget(context, config, releases, allTags) {
  const explicit = context.options.release
  if (explicit !== undefined) {
    assertTagShape(context, explicit)
    const fetched = allTags.find((entry) => entry.tag === explicit)
    if (fetched === undefined) {
      throw new LaneError(`release ${JSON.stringify(explicit)} is not among the tags fetched from ${config.remote}`)
    }
    const parsed = parseReleaseTag(explicit, config.releases.pattern)
    if (parsed === null) {
      throw new LaneError(`release ${JSON.stringify(explicit)} is not a release tag under the pattern ${JSON.stringify(config.releases.pattern)}`)
    }
    return { ...parsed, commit: fetched.commit, date: fetched.date }
  }
  const newest = releases.at(-1)
  if (newest === undefined) {
    throw new LaneError(`no release tag matching ${JSON.stringify(config.releases.pattern)} was fetched from ${config.remote}`)
  }
  return newest
}

function deriveState(context, config, target) {
  const { git, root } = context
  const listing = listUpstreamTags(context)
  const messages = [...listing.messages]
  const admitPrerelease = context.options.prerelease || config.releases.prerelease
  const fetchedByTag = new Map(listing.tags.map((entry) => [entry.tag, entry]))
  const releases = selectReleases(listing.tags.map((entry) => entry.tag), { pattern: config.releases.pattern, prerelease: admitPrerelease })
  for (const release of releases) {
    const fetched = fetchedByTag.get(release.tag)
    release.commit = fetched.commit
    release.date = fetched.date
  }
  const selected = selectTarget(context, config, releases, listing.tags)

  const merged = git(['for-each-ref', '--merged', target.head, '--format=%(refname)', `${REF_NAMESPACE}/tags/`], { cwd: root }).stdout
  const ancestorTags = new Set(merged.split('\n').filter((line) => line !== '').map((line) => line.slice(`${REF_NAMESPACE}/tags/`.length)))

  const { records, messages: recordMessages } = readRecords(context, target.head)
  messages.push(...recordMessages)
  const lostRecords = []
  for (const [tag, { path, record }] of records) {
    if (revParse(git, root, record.releaseCommit) === null || !isAncestor(git, root, record.releaseCommit, target.head)) {
      lostRecords.push({ path, tag, commit: record.releaseCommit })
    }
  }

  // A record speaks for every release its merge covered: the skipped releases arrived in the
  // same merge commit, under the same gates, so its verdict is theirs too.
  const recordFor = new Map(records)
  for (const [tag, entry] of records) {
    for (const covered of Array.isArray(entry.record.covers) ? entry.record.covers : []) {
      if (covered !== tag && !records.has(covered)) recordFor.set(covered, { ...entry, coveredBy: tag })
    }
  }
  const known = new Map(releases.map((release) => [release.tag, release]))
  if (!known.has(selected.tag)) known.set(selected.tag, selected)
  const integratedReleases = [...known.values()]
    .filter((release) => ancestorTags.has(release.tag))
    .toSorted(compareReleases)
    .map((release) => {
      const entry = recordFor.get(release.tag)
      const gates = entry === undefined ? null : entry.record.gates ?? null
      return {
        tag: release.tag,
        commit: release.commit,
        record: entry === undefined ? null : entry.record,
        recordPath: entry === undefined ? null : entry.path,
        coveredBy: entry?.coveredBy ?? null,
        gates,
        verified: gates === null || gates === 'passed' || gates === 'none',
      }
    })
  const verified = integratedReleases.filter((release) => release.verified)
  const integrated = verified.at(-1) ?? null
  const unverified = integratedReleases.filter((release) => !release.verified)

  const integratedRelease = integrated === null ? null : known.get(integrated.tag)
  const candidates = releases.filter((release) => integratedRelease === null || compareReleases(release, integratedRelease) > 0)
  // A release the single merge covers is one the selected commit CONTAINS, not merely one that
  // sorts below it: a maintenance release cut on a side branch after a newer one (v1.1.1 after
  // v1.2.0) is older by version and still not in v1.2.0's ancestry.
  const skipped = candidates
    .filter((release) => compareReleases(release, selected) < 0 && isAncestor(git, root, release.commit, selected.commit))
    .map((release) => release.tag)

  const upstreamHead = revParse(git, root, `${REF_NAMESPACE}/heads/${config.branch}`)
  // `outcome` is the diagnosis `status` reports; `releaseOutcome` is the selected release's own
  // standing, which `preview` and `integrate` act on. They differ in exactly one case: a lost
  // record (`ancestry-lost`) is reported by `status` and carried — not obeyed — by the other two,
  // since the re-merge is what repairs it (REQ-UPSTREAM-004).
  const state = {
    releases,
    selected,
    ancestorTags,
    integrated,
    integratedReleases,
    unverified,
    candidates,
    skipped,
    lostRecords,
    upstreamHead,
    mergeBase: null,
    divergence: null,
    affected: null,
    messages,
    outcome: null,
    releaseOutcome: null,
  }

  const mergeBase = git(['merge-base', target.head, selected.commit], { cwd: root, check: false })
  if (mergeBase.status !== 0) {
    state.outcome = 'ancestry-missing'
    state.releaseOutcome = 'ancestry-missing'
    return state
  }
  state.mergeBase = mergeBase.stdout.trim()
  state.divergence = {
    aheadOfRelease: countCommits(git, root, `${selected.commit}..${target.head}`),
    behindRelease: countCommits(git, root, `${target.head}..${selected.commit}`),
    upstreamAheadOfRelease: upstreamHead === null ? null : countCommits(git, root, `${selected.commit}..${upstreamHead}`),
  }
  state.affected = computeAffected(context, config, state.mergeBase, target.head, selected.commit, selected.tag)

  if (ancestorTags.has(selected.tag)) {
    state.releaseOutcome = unverified.some((release) => release.tag === selected.tag) ? 'validation-failed' : 'up-to-date'
  } else state.releaseOutcome = 'update-available'
  state.outcome = lostRecords.length > 0 ? 'ancestry-lost' : state.releaseOutcome
  return state
}

// ---------------------------------------------------------------------------------------------
// The update branch and its worktree (REQ-UPSTREAM-006, -012)

function branchNameFor(tag) {
  return `${BRANCH_PREFIX}${tag}`
}

/** Refuses (exit 2) a `--release` value that cannot be the lane's branch, ref or directory. */
function assertTagShape(context, tag) {
  const refused = checkTagShape(tag)
  if (refused !== null) throw new LaneError(`release ${JSON.stringify(tag)} is refused: ${refused}`)
  const check = context.git(['check-ref-format', '--branch', branchNameFor(tag)], { cwd: context.root, check: false })
  if (check.status !== 0) {
    throw new LaneError(`release ${JSON.stringify(tag)} is refused: ${branchNameFor(tag)} is not a valid branch name (git check-ref-format)`)
  }
}

function worktreePathFor(root, tag) {
  return join(root, ...WORK_DIRECTORY.split('/'), ...tag.split('/'))
}

function listWorktrees(context) {
  const output = context.git(['worktree', 'list', '--porcelain'], { cwd: context.root }).stdout
  const worktrees = []
  let current = null
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: null, branch: null }
      worktrees.push(current)
    } else if (current !== null && line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length)
    else if (current !== null && line.startsWith('branch ')) current.branch = line.slice('branch '.length)
  }
  return worktrees
}

function mergeInProgress(git, worktree) {
  return git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: worktree, check: false }).status === 0
}

function worktreeGitDir(git, worktree) {
  return git(['rev-parse', '--absolute-git-dir'], { cwd: worktree }).stdout.trim()
}

function readLaneState(git, worktree) {
  const path = join(worktreeGitDir(git, worktree), STATE_FILE)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    log(`lane state at ${path} is unreadable and will be rebuilt (${describeError(error)})`)
    return null
  }
}

function writeLaneState(git, worktree, state) {
  writeFileSync(join(worktreeGitDir(git, worktree), STATE_FILE), `${JSON.stringify(state, null, 2)}\n`)
}

function clearLaneState(git, worktree) {
  rmSync(join(worktreeGitDir(git, worktree), STATE_FILE), { force: true })
}

/** Everything known about the update branch for `tag`: the branch, its worktree, its state. */
function locateUpdateBranch(context, tag) {
  const { git, root } = context
  const branch = branchNameFor(tag)
  const head = revParse(git, root, `refs/heads/${branch}`)
  const listed = listWorktrees(context).find((entry) => entry.branch === `refs/heads/${branch}`)
  let worktree = null
  if (listed !== undefined && existsSync(listed.path)) {
    // git prints worktree paths with forward slashes on every platform; the document carries
    // the platform's own spelling, the same one a fresh `worktree add` was given.
    const path = resolve(listed.path)
    worktree = { path, inProgress: mergeInProgress(git, path) }
  }
  return { branch, head, worktree }
}

function isLaneMergeCommit(git, root, sha, tag) {
  const body = git(['log', '-1', '--format=%B', sha], { cwd: root }).stdout
  return body.includes(`Stamity-Upstream-Release: ${tag}`)
}

function findLaneMergeCommit(git, root, branchHead, targetHead, tag) {
  const listing = git(['rev-list', branchHead, `^${targetHead}`], { cwd: root, check: false })
  if (listing.status !== 0) return null
  for (const sha of listing.stdout.split('\n').filter((line) => line !== '')) {
    if (isLaneMergeCommit(git, root, sha, tag)) return sha
  }
  return null
}

function readBranchRecord(context, branchHead, tag) {
  const text = showFile(context.git, context.root, branchHead, `${RECORD_DIRECTORY}/${tag}.json`)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    // An unreadable record on the branch is reported through the outcome below: no record means
    // no claim, which `validate` repairs by writing a fresh one.
    return null
  }
}

function outcomeFromRecord(record, config) {
  if (record === null) return config.gates.length === 0 ? 'integrated' : 'validation-failed'
  return record.gates === 'passed' || record.gates === 'none' ? 'integrated' : 'validation-failed'
}

/** The tag the human means for continue/validate/abort: --release, the cwd's branch, or the only one. */
function resolveLaneTag(context) {
  if (context.options.release !== undefined) {
    assertTagShape(context, context.options.release)
    return context.options.release
  }
  if (context.currentBranch !== null && context.currentBranch.startsWith(BRANCH_PREFIX)) {
    return context.currentBranch.slice(BRANCH_PREFIX.length)
  }
  const branches = context.git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${BRANCH_PREFIX}`], { cwd: context.root })
    .stdout.split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(BRANCH_PREFIX.length))
  if (branches.length === 1) return branches[0]
  if (branches.length === 0) {
    throw new LaneError(`no update branch exists (none under refs/heads/${BRANCH_PREFIX}); run \`integrate\` first`)
  }
  throw new LaneError(`several update branches exist (${branches.join(', ')}); pass --release <tag> to name one`)
}

function releaseFromTag(context, config, tag) {
  const listing = listUpstreamTags(context)
  const fetched = listing.tags.find((entry) => entry.tag === tag)
  if (fetched === undefined) {
    throw new LaneError(`release ${JSON.stringify(tag)} is not among the fetched upstream tags; run \`status\` to fetch, or pass --release`)
  }
  const parsed = parseReleaseTag(tag, config.releases.pattern) ?? { tag, version: null, prerelease: null }
  return { ...parsed, commit: fetched.commit, date: fetched.date }
}

// ---------------------------------------------------------------------------------------------
// Commands run through the shell: gates and regeneration (REQ-UPSTREAM-007, -009)

function outputTail(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
  return lines.slice(-OUTPUT_TAIL_LINES).join('\n')
}

function runShellCommand(command, { cwd, env }) {
  const started = Date.now()
  const result = spawnSync(command, { shell: true, cwd, env, encoding: 'utf8', maxBuffer: MAX_BUFFER, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const durationMs = Date.now() - started
  let exitCode = result.status
  let output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error !== undefined) {
    exitCode = 127
    output += `\n${describeError(result.error)}`
  } else if (exitCode === null) {
    exitCode = 128
    output += `\nterminated by signal ${result.signal ?? '(unknown)'}`
  }
  return { exitCode, durationMs, outputTail: outputTail(output), status: exitCode === 0 ? 'passed' : 'failed' }
}

function commandEnv(session) {
  return {
    ...process.env,
    STAMITY_UPSTREAM_RELEASE: session.release.tag,
    STAMITY_UPSTREAM_COMMIT: session.release.commit,
    STAMITY_UPSTREAM_TARGET: session.target.branch,
    STAMITY_UPSTREAM_WORKTREE: session.worktree,
  }
}

function runGates(context, config, session) {
  if (config.gates.length === 0) return []
  if (context.options.noGates) {
    return config.gates.map((gate) => ({ name: gate.name, run: gate.run, status: 'skipped', exitCode: null, durationMs: 0, outputTail: '' }))
  }
  const results = []
  const env = commandEnv(session)
  for (const gate of config.gates) {
    log(`running gate ${JSON.stringify(gate.name)}: ${gate.run}`)
    const result = runShellCommand(gate.run, { cwd: session.worktree, env })
    results.push({ name: gate.name, run: gate.run, ...result })
    if (result.exitCode !== 0) break
  }
  return results
}

function runRegenerate(context, config, session) {
  const results = []
  const env = commandEnv(session)
  for (const run of config.regenerate) {
    log(`regenerating: ${run}`)
    const result = runShellCommand(run, { cwd: session.worktree, env })
    results.push({ run, ...result })
    if (result.exitCode !== 0) break
  }
  return results
}

function absolutePathIn(worktree, path) {
  return join(worktree, ...path.split('/'))
}

/** A sha256 of the file's bytes, or null when no regular file is there: content, not identity. */
function fingerprintFile(absolute) {
  let stat
  try {
    stat = statSync(absolute)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  return createHash('sha256').update(readFileSync(absolute)).digest('hex')
}

function fingerprintPaths(worktree, paths) {
  return new Map(paths.map((path) => [path, fingerprintFile(absolutePathIn(worktree, path))]))
}

/** The tracked paths whose working-tree content differs from the index, unmerged ones included. */
function dirtyTrackedPaths(git, worktree) {
  const output = git(['diff', '--name-only', '-z'], { cwd: worktree }).stdout
  return [...new Set(output.split('\0').filter((path) => path !== ''))].toSorted()
}

/** Fingerprints of the dirty tracked paths no `generatedPaths` glob covers. */
function fingerprintOutsideGenerated(git, worktree, generatedPaths) {
  return fingerprintPaths(
    worktree,
    dirtyTrackedPaths(git, worktree).filter((path) => !matchesAnyGlob(path, generatedPaths)),
  )
}

/** The paths `after` carries that `before` did not, or whose content moved: what a run rewrote. */
function rewrittenBetween(before, after) {
  const rows = []
  for (const [path, print] of after) {
    if (before.has(path) && before.get(path) === print) continue
    rows.push({ path, change: print === null ? 'deleted' : 'modified' })
  }
  return rows
}

/**
 * Stages every generated path the status names, except the ones in `skip` — the conflicted
 * generated paths regeneration left as the merge left them, which stay unmerged for the human
 * rather than being staged as the side git happened to leave in the worktree.
 */
function stageGeneratedPaths(git, worktree, generatedPaths, skip = new Set()) {
  if (generatedPaths.length === 0) return []
  const status = git(['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: worktree }).stdout
  const paths = []
  for (const entry of parsePorcelainStatus(status)) {
    if (matchesAnyGlob(entry.path, generatedPaths) && !skip.has(entry.path)) paths.push(entry.path)
    if (entry.kind === 'renamed' && matchesAnyGlob(entry.from, generatedPaths) && !skip.has(entry.from)) paths.push(entry.from)
  }
  // A path the generator removed — or the merge already deleted — has nothing left for `add`
  // to match; its index entry (unmerged or not) is dropped instead, which is the deletion.
  const present = paths.filter((path) => existsSync(join(worktree, ...path.split('/'))))
  const missing = paths.filter((path) => !existsSync(join(worktree, ...path.split('/'))))
  for (let index = 0; index < present.length; index += 100) {
    git(['add', '-A', '--', ...present.slice(index, index + 100)], { cwd: worktree })
  }
  for (let index = 0; index < missing.length; index += 100) {
    git(['rm', '--quiet', '--cached', '--ignore-unmatch', '--', ...missing.slice(index, index + 100)], { cwd: worktree })
  }
  return paths
}

function unmergedPaths(git, worktree) {
  const output = git(['ls-files', '-u', '-z'], { cwd: worktree }).stdout
  const paths = new Set()
  for (const record of output.split('\0')) {
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab !== -1) paths.add(record.slice(tab + 1))
  }
  return [...paths].toSorted()
}

function touchedPaths(git, worktree, extra) {
  const output = git(['diff', '--name-only', '-z', 'HEAD'], { cwd: worktree }).stdout
  const paths = new Set(output.split('\0').filter((path) => path !== ''))
  for (const path of extra) paths.add(path)
  return [...paths].toSorted()
}

function scanMarkers(worktree, paths) {
  const hits = []
  for (const path of paths) {
    const absolute = join(worktree, ...path.split('/'))
    if (!existsSync(absolute)) continue
    const bytes = readFileSync(absolute)
    if (bytes.includes(0)) continue
    const markers = findConflictMarkers(bytes.toString('utf8'))
    if (markers.length > 0) hits.push({ path, lines: markers.map((marker) => marker.line) })
  }
  return hits
}

function identityArguments(git, worktree) {
  const probe = git(['var', 'GIT_COMMITTER_IDENT'], { cwd: worktree, check: false })
  if (probe.status === 0) return { args: [], fallback: false }
  return { args: ['-c', `user.name=${FALLBACK_IDENTITY.name}`, '-c', `user.email=${FALLBACK_IDENTITY.email}`], fallback: true }
}

/** Commits the index; `rerere` records the resolution of the merge being committed (see the header). */
function commitInWorktree(git, worktree, message, { rerere = false } = {}) {
  const identity = identityArguments(git, worktree)
  const rerereArgs = rerere ? ['-c', 'rerere.enabled=true'] : []
  git([...identity.args, ...rerereArgs, 'commit', '--quiet', '--no-verify', '-m', message], { cwd: worktree })
  return { sha: git(['rev-parse', 'HEAD'], { cwd: worktree }).stdout.trim(), fallbackIdentity: identity.fallback }
}

function trailers(session, verdict) {
  return [
    `Stamity-Upstream-Release: ${session.release.tag}`,
    `Stamity-Upstream-Commit: ${session.release.commit}`,
    `Stamity-Upstream-Gates: ${verdict}`,
  ].join('\n')
}

function recordRelativePath(tag) {
  return `${RECORD_DIRECTORY}/${tag}.json`
}

function writeRecordFile(git, worktree, tag, record) {
  const recordPath = recordRelativePath(tag)
  const absolute = absolutePathIn(worktree, recordPath)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`)
  git(['add', '--', recordPath], { cwd: worktree })
  return recordPath
}

// ---------------------------------------------------------------------------------------------
// The report and the document

function createDocument(verb) {
  return {
    tool: TOOL,
    version: DOCUMENT_VERSION,
    verb,
    outcome: null,
    exitCode: null,
    config: null,
    upstream: null,
    integrated: null,
    integratedReleases: [],
    unverified: [],
    target: null,
    candidates: [],
    skipped: [],
    divergence: null,
    affected: null,
    conflicts: [],
    gates: [],
    regenerate: [],
    unlistedGenerated: [],
    branch: null,
    worktree: null,
    mergeCommit: null,
    record: null,
    lostRecords: [],
    releaseNotes: null,
    diffStat: null,
    report: '',
    messages: [],
  }
}

function toCandidate(release) {
  return { tag: release.tag, commit: release.commit, date: release.date }
}

function fillStateInto(doc, state, config) {
  doc.integrated =
    state.integrated === null
      ? null
      : { tag: state.integrated.tag, commit: state.integrated.commit, record: state.integrated.record }
  doc.integratedReleases = state.integratedReleases.map((release) => ({
    tag: release.tag,
    commit: release.commit,
    record: release.record,
    recordPath: release.recordPath,
    coveredBy: release.coveredBy,
    verified: release.verified,
  }))
  doc.unverified = state.unverified.map((release) => ({ tag: release.tag, commit: release.commit, gates: release.gates, record: release.record }))
  doc.target = {
    tag: state.selected.tag,
    commit: state.selected.commit,
    date: state.selected.date,
    isPrerelease: state.selected.prerelease !== null && state.selected.prerelease !== undefined,
  }
  doc.candidates = state.candidates.map(toCandidate)
  doc.skipped = state.skipped
  doc.divergence = state.divergence
  doc.affected = state.affected
  doc.lostRecords = state.lostRecords
  doc.messages.push(...state.messages)
  if (config.gates.length === 0) doc.messages.push(NO_GATES_NOTICE)
}

function linesLabel(lines) {
  if (lines === null || lines === undefined || lines.added === null) return 'binary'
  return `+${lines.added}/−${lines.removed} lines`
}

function renderAffected(doc, lines) {
  const affected = doc.affected
  if (affected === null) return
  const conflicted = new Set(doc.conflicts.map((conflict) => conflict.path))
  const rows = []
  for (const row of affected.overlaps) {
    if (conflicted.has(row.path)) continue
    rows.push(`- \`${row.path}\` — changed on both sides (${linesLabel(row.upstreamLines)} upstream): merged cleanly on both sides' edits; semantic review needed`)
  }
  for (const row of affected.watched) {
    rows.push(`- \`${row.path}\` — watched path ${row.upstreamChange} in ${doc.target?.tag ?? 'the release'} (${linesLabel(row.upstreamLines)})`)
  }
  for (const row of affected.shadowed) {
    if (row.change === 'modified') {
      rows.push(`- the default behind \`${row.forkPath}\` changed in ${row.release} (${linesLabel(row.upstreamLines)}); the override still applies and hides the change — review it`)
    } else {
      const target = row.change === 'renamed' ? ` (renamed to \`${row.renamedTo}\`)` : ''
      rows.push(`- \`${row.forkPath}\` is orphaned: its upstream default \`${row.upstreamPath}\` was ${row.change} in ${row.release}${target} — review it`)
    }
  }
  for (const row of affected.renamed) {
    rows.push(`- \`${row.from}\` was renamed to \`${row.to}\` upstream${row.forkChanged ? '; the fork changed the old path, and git carries that edit into the new one when it can' : ''}`)
  }
  lines.push('## Affected paths', '')
  lines.push(...(rows.length > 0 ? rows : ['- none: the release touches no path the fork changed, watches or shadows']))
  lines.push('')
}

/** The markdown report for a document. Pure: it reads the document and returns one string. */
export function renderReport(doc) {
  const lines = [`# Upstream lane — ${doc.verb}: ${doc.outcome ?? 'error'}`, '']
  if (doc.config !== null) {
    lines.push(`Upstream ${doc.config.upstream} (remote \`${doc.config.remote}\`), target branch \`${doc.config.branch}\`, configuration \`${doc.config.path}\`.`, '')
  }
  if (doc.target !== null || doc.integrated !== null) {
    lines.push('## Releases', '')
    if (doc.integrated !== null) {
      const record = doc.integrated.record === null ? 'no record' : `record: gates ${doc.integrated.record.gates}`
      lines.push(`- Integrated: ${doc.integrated.tag} (${shortSha(doc.integrated.commit)}; ${record})`)
    } else lines.push('- Integrated: none of the fetched releases is in the target branch\'s ancestry with an agreeing record')
    for (const release of doc.unverified) {
      lines.push(`- In history but NOT integrated: ${release.tag} (${shortSha(release.commit)}) — its record says the gates ${release.gates}`)
    }
    if (doc.target !== null) {
      lines.push(`- Target: ${doc.target.tag} (${shortSha(doc.target.commit)}, ${doc.target.date ?? 'no date'}${doc.target.isPrerelease ? ', prerelease' : ''})`)
    }
    if (doc.candidates.length > 0) lines.push(`- Candidates newer than the integrated release: ${doc.candidates.map((release) => release.tag).join(', ')}`)
    if (doc.skipped.length > 0) lines.push(`- Covered by this single merge besides the target: ${doc.skipped.join(', ')}`)
    if (doc.divergence !== null) {
      const upstreamAhead = doc.divergence.upstreamAheadOfRelease === null ? 'unknown' : String(doc.divergence.upstreamAheadOfRelease)
      lines.push(`- Divergence: ${doc.divergence.aheadOfRelease} commit(s) on the target not in the release; ${doc.divergence.behindRelease} commit(s) in the release not on the target; upstream's default branch is ${upstreamAhead} commit(s) ahead of the release`)
    }
    lines.push('')
  }
  if (doc.lostRecords.length > 0) {
    lines.push('## Records whose release the history lacks', '')
    for (const lost of doc.lostRecords) lines.push(`- \`${lost.path}\` claims ${lost.tag} at ${lost.commit}, which is not an ancestor of the target branch`)
    lines.push('')
  }
  renderAffected(doc, lines)
  if (doc.conflicts.length > 0) {
    lines.push('## Conflicts', '')
    for (const conflict of doc.conflicts) {
      const bits = [conflict.kind]
      if (conflict.deletedBy !== undefined) bits.push(`deleted by ${conflict.deletedBy}`)
      if (conflict.renamedFrom !== undefined) bits.push(`renamed from \`${conflict.renamedFrom}\``)
      if (conflict.renamedTo !== undefined && conflict.renamedTo !== conflict.path) bits.push(`renamed to \`${conflict.renamedTo}\``)
      if (conflict.generated) {
        bits.push(
          conflict.regenerated === false
            ? 'generated, but regeneration did not produce it: resolve it by hand and `git add` it, or fix the regenerate list'
            : 'generated: regenerated on `continue`, no hand edit needed',
        )
      }
      if (conflict.resolvedBy !== undefined) bits.push(`resolved by ${conflict.resolvedBy}`)
      lines.push(`- \`${conflict.path}\` — ${bits.join('; ')}`)
    }
    lines.push('')
  }
  if (doc.regenerate.length > 0 || doc.unlistedGenerated.length > 0) {
    lines.push('## Regeneration', '')
    for (const step of doc.regenerate) lines.push(`- \`${step.run}\` — ${step.status} (exit ${step.exitCode}, ${step.durationMs} ms)`)
    for (const row of doc.unlistedGenerated) {
      lines.push(`- \`${row.path}\` — ${row.change} by regeneration, and no generatedPaths glob covers it: add it to generatedPaths`)
    }
    const failed = doc.regenerate.find((step) => step.status === 'failed')
    if (failed !== undefined && failed.outputTail !== '') lines.push('', '```', failed.outputTail, '```')
    lines.push('')
  }
  if (doc.gates.length > 0) {
    lines.push('## Gates', '', '| Gate | Command | Status | Exit | Duration |', '| --- | --- | --- | --- | --- |')
    for (const gate of doc.gates) {
      lines.push(`| ${gate.name} | \`${gate.run}\` | ${gate.status} | ${gate.exitCode ?? '—'} | ${gate.durationMs} ms |`)
    }
    const failed = doc.gates.find((gate) => gate.status === 'failed')
    if (failed !== undefined && failed.outputTail !== '') lines.push('', `Output of \`${failed.name}\` (last lines):`, '', '```', failed.outputTail, '```')
    lines.push('')
  }
  if (doc.branch !== null || doc.mergeCommit !== null) {
    lines.push('## Update branch', '')
    if (doc.branch !== null) lines.push(`- Branch: \`${doc.branch}\``)
    if (doc.worktree !== null) lines.push(`- Worktree: \`${doc.worktree}\``)
    if (doc.mergeCommit !== null) lines.push(`- Merge commit: ${doc.mergeCommit}`)
    if (doc.record !== null) lines.push(`- Record: \`${doc.record}\``)
    lines.push('')
  }
  if (doc.diffStat !== null && doc.diffStat !== '') lines.push('## Diff stat', '', '```', doc.diffStat.replace(/\s+$/, ''), '```', '')
  if (doc.releaseNotes !== null) lines.push(`## Release notes for ${doc.target?.tag ?? 'the release'}`, '', doc.releaseNotes, '')
  if (doc.messages.length > 0) {
    lines.push('## Notes', '')
    for (const message of doc.messages) lines.push(`- ${message}`)
    lines.push('')
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

const ANCESTRY_MISSING_TEXT = [
  'The target branch and the selected release share no merge base. A fork gets here in two ways: a tree imported without its history, or a repository started from a tarball.',
  'Recovery: re-create the fork from a clone that carries the upstream history and graft the local commits on top; or, when the tree really was taken at a known upstream commit, replay the local changes as one commit onto that commit. The lane never runs `--allow-unrelated-histories`.',
]

function ancestryLostText(lost) {
  return [
    `The integration record ${lost.path} claims release ${lost.tag} at ${lost.commit}, and that commit is not an ancestor of the target branch. The usual cause is a squash or rebase landing of an earlier update branch.`,
    `Recovery: land update branches by merge commit (allow merge commits on the integration branch, or keep a dedicated integration branch that does). For the release already lost, run \`integrate --release ${lost.tag}\` again: \`preview\` and \`integrate\` proceed under this diagnosis, and only \`status\` keeps reporting ancestry-lost until the history is repaired. Git re-merges the release, previously resolved conflicts may reappear, \`git rerere\` (the lane runs its merges and merge commits under it) replays recorded resolutions when it can, and the record written in the new merge commit supersedes the stale one at the same path once that branch lands by merge commit.`,
    `When ${lost.tag} truly is not wanted, delete or correct ${lost.path} on the target branch instead: the diagnosis clears with the record.`,
  ]
}

function validationFailedText(state, target) {
  const branch = branchNameFor(state.selected.tag)
  const gates = state.unverified.find((release) => release.tag === state.selected.tag)?.gates
  return (
    `${state.selected.tag} is in ${target.branch}'s history and its record says the gates ${gates}, so it is not integrated: ` +
    `run \`validate --release ${state.selected.tag}\` on the update branch ${branch} to re-run them and commit a passing record, then land that commit; ` +
    `when the branch is gone, re-create it from the target head first (\`git branch ${branch} ${target.branch}\`)`
  )
}

function conflictText(worktree, conflicts) {
  const human = conflicts.filter((conflict) => !conflict.generated)
  const generated = conflicts.filter((conflict) => conflict.generated)
  const messages = []
  if (human.length > 0) {
    messages.push(`To finish: in ${worktree}, edit each conflicted path (${human.map((conflict) => conflict.path).join(', ')}), \`git add <path>\` it, then run \`node scripts/upstream.mjs continue\`.`)
  }
  if (generated.length > 0) {
    messages.push(`${generated.length} conflicted path(s) are generated (${generated.map((conflict) => conflict.path).join(', ')}): \`continue\` regenerates them from their sources; do not edit them by hand.`)
  }
  messages.push('Both sides of every conflicted path are in the index stages: `git show :2:<path>` is the fork\'s version, `git show :3:<path>` is upstream\'s.')
  return messages
}

// ---------------------------------------------------------------------------------------------
// Verbs

function prepare(context, doc, { fetch = true } = {}) {
  const config = loadConfig(context)
  // The document's copy of the configuration is what the report and the workflow's pull-request
  // body carry, so the URL's userinfo stops here; git reads `config` itself, unredacted.
  doc.config = { ...config, upstream: redactUrl(config.upstream) }
  const target = resolveTarget(context, config)
  const remote = ensureRemote(context, config)
  if (remote.created) doc.messages.push(`remote ${JSON.stringify(config.remote)} was created with ${redactUrl(config.upstream)}`)
  if (fetch && !context.options.offline) doc.messages.push(...fetchUpstream(context, config))
  else if (fetch) {
    const anything = context.git(['for-each-ref', '--count=1', `${REF_NAMESPACE}/tags/`], { cwd: context.root }).stdout.trim()
    if (anything === '') throw new LaneError(`--offline, and nothing was fetched from ${config.remote} yet; run once without --offline`)
  }
  doc.upstream = {
    url: redactUrl(remote.url),
    remote: config.remote,
    branch: config.branch,
    defaultBranchHead: revParse(context.git, context.root, `${REF_NAMESPACE}/heads/${config.branch}`),
  }
  return { config, target }
}

function runStatus(context, doc) {
  const { config, target } = prepare(context, doc)
  const state = deriveState(context, config, target)
  fillStateInto(doc, state, config)
  doc.outcome = state.outcome
  if (state.outcome === 'ancestry-missing') doc.messages.push(...ANCESTRY_MISSING_TEXT)
  if (state.outcome === 'ancestry-lost') for (const lost of state.lostRecords) doc.messages.push(...ancestryLostText(lost))
  if (state.outcome === 'validation-failed') doc.messages.push(validationFailedText(state, target))
  if (state.outcome === 'update-available') doc.messages.push(`run \`preview --release ${state.selected.tag}\` to see the merge, or \`integrate --release ${state.selected.tag}\` to prepare the update branch`)
  return doc
}

function readReleaseNotes(context, release) {
  if (release.version === null || release.version === undefined) return null
  const changelog = showFile(context.git, context.root, release.commit, 'CHANGELOG.md')
  return changelog === null ? null : extractReleaseNotes(changelog, release.version)
}

function runPreview(context, doc) {
  const { config, target } = prepare(context, doc)
  const state = deriveState(context, config, target)
  fillStateInto(doc, state, config)
  // A lost record is carried, not obeyed: the rows and the recovery text travel with the preview.
  for (const lost of state.lostRecords) doc.messages.push(...ancestryLostText(lost))
  if (state.releaseOutcome !== 'update-available') {
    doc.outcome = state.releaseOutcome
    if (state.releaseOutcome === 'ancestry-missing') doc.messages.push(...ANCESTRY_MISSING_TEXT)
    doc.messages.push('no merge was attempted')
    return doc
  }
  doc.releaseNotes = readReleaseNotes(context, state.selected)
  const { git, root } = context
  const scratch = mkdtempSync(join(tmpdir(), 'stamity-upstream-preview-'))
  let added = false
  try {
    log(`previewing the merge of ${state.selected.tag} in a throwaway worktree`)
    git(['worktree', 'add', '--quiet', '--detach', scratch, target.head], { cwd: root })
    added = true
    const merge = git([...identityArguments(git, scratch).args, 'merge', '--no-ff', '--no-commit', state.selected.commit], { cwd: scratch, check: false })
    if (merge.status > 1) throw new LaneError(`the preview merge could not run: ${merge.stderr.trim()}`)
    const status = git(['status', '--porcelain=v2', '-z'], { cwd: scratch }).stdout
    doc.conflicts = classifyConflicts(status, `${merge.stdout}\n${merge.stderr}`, config.generatedPaths)
    doc.diffStat = git(['diff', '--stat=100', 'HEAD'], { cwd: scratch, check: false }).stdout
    git(['merge', '--abort'], { cwd: scratch, check: false })
  } finally {
    if (added) git(['worktree', 'remove', '--force', scratch], { cwd: root, check: false })
    rmSync(scratch, { recursive: true, force: true })
    git(['worktree', 'prune'], { cwd: root, check: false })
  }
  if (doc.conflicts.length > 0) {
    doc.outcome = 'conflict'
    doc.messages.push(`the merge of ${state.selected.tag} conflicts on ${doc.conflicts.length} path(s); \`integrate\` prepares the update worktree where they are resolved`)
  } else {
    doc.outcome = 'update-available'
    doc.messages.push(`the merge of ${state.selected.tag} is clean; \`integrate --release ${state.selected.tag}\` prepares the update branch`)
  }
  doc.messages.push('the throwaway worktree was removed; the operator\'s tree, index, stash list and branches were not touched')
  return doc
}

/**
 * Regenerate, stage the generated paths, refuse leftovers, run the gates, write the record,
 * commit. Shared by `integrate` (clean merge, or a merge whose only conflicts are generated) and
 * `continue`. The merge stays in progress on every refusal, so the next verb sees it.
 */
function finishMerge(context, config, doc, session) {
  const { git } = context
  const worktree = session.worktree
  doc.branch = session.branch
  doc.worktree = worktree

  // What regeneration is measured against (see the header): each generated conflict's content
  // as the merge left it — persisted at merge time, or read now for a merge the lane did not
  // start — its content as this run begins, which paths are still unmerged, and the tracked
  // paths outside `generatedPaths` that already differ from the index.
  const generatedConflicts = session.state.conflicts.filter((conflict) => conflict.generated)
  const generatedConflictPaths = generatedConflicts.map((conflict) => conflict.path)
  const mergeTime = session.state.conflictedBlobs ?? {}
  const asMerged = new Map(
    generatedConflictPaths.map((path) => [path, Object.hasOwn(mergeTime, path) ? mergeTime[path] : fingerprintFile(absolutePathIn(worktree, path))]),
  )
  const atStart = fingerprintPaths(worktree, generatedConflictPaths)
  const unmergedBefore = new Set(unmergedPaths(git, worktree))
  const outsideBefore = fingerprintOutsideGenerated(git, worktree, config.generatedPaths)

  if (config.regenerate.length > 0 || (config.gates.length > 0 && context.options.noGates !== true)) doc.messages.push(TRUST_NOTICE)
  doc.regenerate = runRegenerate(context, config, session)
  if (doc.regenerate.some((step) => step.status === 'failed')) {
    writeLaneState(git, worktree, session.state)
    doc.outcome = 'regenerate-failed'
    doc.messages.push(`a regenerate command failed in ${worktree}; the merge is still in progress there — fix the cause, then run \`continue\``)
    return doc
  }
  doc.unlistedGenerated = rewrittenBetween(outsideBefore, fingerprintOutsideGenerated(git, worktree, config.generatedPaths))
  if (doc.unlistedGenerated.length > 0) {
    writeLaneState(git, worktree, session.state)
    doc.outcome = 'regenerate-failed'
    for (const row of doc.unlistedGenerated) {
      doc.messages.push(
        `regeneration ${row.change} \`${row.path}\`, a tracked path no generatedPaths glob covers: the gates would test it and the merge commit would not contain it — add it to generatedPaths, then run \`continue\``,
      )
    }
    doc.messages.push(`nothing was staged or committed; the merge is still in progress in ${worktree}`)
    return doc
  }

  const afterRun = fingerprintPaths(worktree, generatedConflictPaths)
  const untouched = new Set(generatedConflictPaths.filter((path) => unmergedBefore.has(path) && afterRun.get(path) === asMerged.get(path)))
  stageGeneratedPaths(git, worktree, config.generatedPaths, untouched)

  const conflictedPaths = session.state.conflicts.map((conflict) => conflict.path)
  const unmerged = unmergedPaths(git, worktree)
  const markers = scanMarkers(worktree, touchedPaths(git, worktree, conflictedPaths))
  if (unmerged.length > 0 || markers.length > 0) {
    writeLaneState(git, worktree, session.state)
    doc.conflicts = session.state.conflicts.map((conflict) => (untouched.has(conflict.path) ? { ...conflict, regenerated: false } : conflict))
    doc.outcome = 'conflict'
    for (const path of unmerged) {
      doc.messages.push(
        matchesAnyGlob(path, config.generatedPaths)
          ? `${path} is still unmerged after regeneration: the regenerate commands did not produce it, so either the generatedPaths list or the regenerate list is wrong — fix the list, or resolve it by hand and \`git add\` it, then run \`continue\``
          : `${path} is still unmerged: resolve it and \`git add\` it, then run \`continue\``,
      )
    }
    for (const hit of markers) {
      doc.messages.push(
        matchesAnyGlob(hit.path, config.generatedPaths)
          ? `${hit.path} still carries a conflict marker after regeneration (line ${hit.lines.join(', ')}): a defect in the generatedPaths list, not something to commit`
          : `${hit.path} still carries a conflict marker (line ${hit.lines.join(', ')}); remove it, \`git add\` the file, then run \`continue\``,
      )
    }
    doc.messages.push('nothing was committed')
    return doc
  }

  doc.gates = runGates(context, config, session)
  const verdict = gatesVerdict(doc.gates, { skipped: context.options.noGates === true })
  // Who resolved a generated conflict: regeneration when it rewrote the path this run, or when
  // the path was still unmerged as this run began (its content had moved since the merge, which
  // is what got it staged); the human when they had staged it and regeneration left it alone.
  const conflicts = session.state.conflicts.map((conflict) => ({
    ...conflict,
    resolvedBy:
      conflict.generated && (unmergedBefore.has(conflict.path) || afterRun.get(conflict.path) !== atStart.get(conflict.path))
        ? 'regeneration'
        : 'human',
  }))
  const record = buildRecord({
    release: session.release.tag,
    releaseCommit: session.release.commit,
    mergeBase: session.state.mergeBase,
    targetBranch: session.target.branch,
    targetHead: session.state.targetHead,
    covers: [...session.state.skipped, session.release.tag],
    gates: verdict,
    gateResults: doc.gates,
    regenerate: doc.regenerate,
    conflicts,
    affected: session.state.affected,
    createdAt: new Date().toISOString(),
  })
  doc.record = writeRecordFile(git, worktree, session.release.tag, record)
  doc.conflicts = conflicts
  const message = `Merge upstream release ${session.release.tag} into ${session.target.branch}\n\n${trailers(session, verdict)}\n`
  const committed = commitInWorktree(git, worktree, message, { rerere: true })
  if (committed.fallbackIdentity) doc.messages.push(`no git identity was configured; the merge commit uses ${FALLBACK_IDENTITY.name} <${FALLBACK_IDENTITY.email}>`)
  doc.mergeCommit = committed.sha
  clearLaneState(git, worktree)
  if (verdict === 'passed' || verdict === 'none') {
    doc.outcome = 'integrated'
    doc.messages.push(`${session.release.tag} is merged on ${session.branch} at ${committed.sha}; land it with a merge commit so the release stays in the history`)
  } else {
    doc.outcome = 'validation-failed'
    doc.messages.push(
      verdict === 'skipped'
        ? `the gates were skipped (--no-gates); the record says so and \`status\` will not count ${session.release.tag} as integrated until \`validate\` runs them`
        : `a gate failed on ${session.branch}; the merge commit ${committed.sha} carries \`Stamity-Upstream-Gates: failed\` — fix the branch, then run \`validate --release ${session.release.tag}\``,
    )
  }
  return doc
}

function startMerge(context, config, doc, session) {
  const { git } = context
  const worktree = session.worktree
  doc.branch = session.branch
  doc.worktree = worktree
  log(`merging ${session.release.tag} (${shortSha(session.release.commit)}) on ${session.branch}`)
  const merge = git(
    [...identityArguments(git, worktree).args, '-c', 'rerere.enabled=true', 'merge', '--no-ff', '--no-commit', session.release.commit],
    { cwd: worktree, check: false },
  )
  if (merge.status > 1) throw new LaneError(`git merge failed in ${worktree}: ${merge.stderr.trim()}`)
  const status = git(['status', '--porcelain=v2', '-z'], { cwd: worktree }).stdout
  const conflicts = classifyConflicts(status, `${merge.stdout}\n${merge.stderr}`, config.generatedPaths)
  session.state.conflicts = conflicts
  // Each generated conflict's content as the merge left it: what `continue` measures regeneration
  // against, however many runs later (see the header).
  session.state.conflictedBlobs = Object.fromEntries(
    conflicts.filter((conflict) => conflict.generated).map((conflict) => [conflict.path, fingerprintFile(absolutePathIn(worktree, conflict.path))]),
  )
  writeLaneState(git, worktree, session.state)
  if (conflicts.some((conflict) => !conflict.generated)) {
    doc.conflicts = conflicts
    doc.outcome = 'conflict'
    doc.messages.push(...conflictText(worktree, conflicts))
    doc.messages.push('the target branch and the operator\'s worktree were not touched; nothing was committed')
    return doc
  }
  if (conflicts.length > 0) {
    doc.messages.push(`every conflicted path is generated (${conflicts.map((conflict) => conflict.path).join(', ')}); regenerating instead of asking a human`)
  }
  return finishMerge(context, config, doc, session)
}

function runIntegrate(context, doc) {
  const { config, target } = prepare(context, doc)
  const state = deriveState(context, config, target)
  fillStateInto(doc, state, config)
  // A lost record is carried, not obeyed: the re-merge below is what repairs it (REQ-UPSTREAM-004).
  for (const lost of state.lostRecords) doc.messages.push(...ancestryLostText(lost))
  if (state.releaseOutcome !== 'update-available') {
    doc.outcome = state.releaseOutcome
    if (state.releaseOutcome === 'ancestry-missing') doc.messages.push(...ANCESTRY_MISSING_TEXT)
    if (state.releaseOutcome === 'up-to-date') doc.messages.push(`${state.selected.tag} is already in the target branch's history; nothing to integrate`)
    if (state.releaseOutcome === 'validation-failed') doc.messages.push(validationFailedText(state, target))
    doc.messages.push('no update branch was created')
    return doc
  }
  const { git, root } = context
  const release = state.selected
  const located = locateUpdateBranch(context, release.tag)
  doc.branch = located.branch
  doc.releaseNotes = readReleaseNotes(context, release)

  if (located.head !== null) {
    doc.worktree = located.worktree === null ? null : located.worktree.path
    const descends = isAncestor(git, root, target.head, located.head)
    if (located.worktree !== null && located.worktree.inProgress) {
      const status = git(['status', '--porcelain=v2', '-z'], { cwd: located.worktree.path }).stdout
      const persisted = readLaneState(git, located.worktree.path)
      const current = classifyConflicts(status, '', config.generatedPaths)
      // The kinds the merge itself reported were persisted; the status alone cannot tell a
      // rename/delete from a modify/delete, so the persisted kind wins where one exists.
      const kinds = new Map((persisted?.conflicts ?? []).map((conflict) => [conflict.path, conflict]))
      doc.conflicts = []
      for (const conflict of current) {
        const persistedConflict = kinds.get(conflict.path)
        doc.conflicts.push(persistedConflict === undefined ? conflict : Object.assign({}, persistedConflict, conflict, { kind: persistedConflict.kind }))
      }
      if (descends) {
        doc.outcome = 'conflict-pending'
        doc.messages.push(`the update branch ${located.branch} already holds an in-progress merge in ${located.worktree.path}; nothing was redone`)
        doc.messages.push(...(doc.conflicts.length > 0 ? conflictText(located.worktree.path, doc.conflicts) : ['no path is unmerged there; run `continue` to regenerate, run the gates and commit']))
      } else {
        doc.outcome = 'update-branch-stale'
        doc.messages.push(`the target branch ${target.branch} moved since ${located.branch} was cut, and a merge is in progress in ${located.worktree.path}; run \`abort\` to discard it and \`integrate\` again, or finish it with \`continue\` and merge ${target.branch} into the branch by hand`)
      }
      return doc
    }
    if (descends && isAncestor(git, root, release.commit, located.head)) {
      const record = readBranchRecord(context, located.head, release.tag)
      doc.outcome = outcomeFromRecord(record, config)
      doc.mergeCommit = findLaneMergeCommit(git, root, located.head, target.head, release.tag)
      doc.record = record === null ? null : recordRelativePath(release.tag)
      doc.gates = record === null ? [] : record.gateResults ?? []
      doc.conflicts = record === null ? [] : record.conflicts ?? []
      doc.messages.push(`the update branch ${located.branch} already carries ${release.tag}; nothing was redone`)
      if (record === null && config.gates.length > 0) doc.messages.push('the branch carries no record, so the gates are unproven; run `validate` to run them and write one')
      if (doc.outcome === 'validation-failed' && record !== null) doc.messages.push(`the record on the branch says the gates ${record.gates}; fix the branch, then run \`validate --release ${release.tag}\``)
      return doc
    }
    const extra = git(['rev-list', located.head, `^${target.head}`, `^${release.commit}`], { cwd: root }).stdout.split('\n').filter((line) => line !== '')
    const laneOnly = extra.every((sha) => isLaneMergeCommit(git, root, sha, release.tag))
    if (descends && extra.length === 0) {
      doc.messages.push(`the update branch ${located.branch} existed at the target head with nothing on it; reusing it`)
    } else if (context.options.recreate && laneOnly) {
      if (located.worktree !== null) git(['worktree', 'remove', '--force', located.worktree.path], { cwd: root })
      git(['worktree', 'prune'], { cwd: root, check: false })
      git(['branch', '-D', located.branch], { cwd: root })
      doc.messages.push(`--recreate: the stale update branch ${located.branch} carried nothing but the lane's own merge commit and was deleted`)
      located.head = null
      located.worktree = null
    } else {
      doc.outcome = 'update-branch-stale'
      doc.worktree = located.worktree === null ? null : located.worktree.path
      doc.messages.push(`the target branch ${target.branch} moved to ${shortSha(target.head)} since ${located.branch} was cut`)
      doc.messages.push(
        laneOnly
          ? `remedy: \`integrate --release ${release.tag} --recreate\` deletes the branch, which carries nothing but the lane's own merge commit, and starts over`
          : `the branch carries commits of its own (${extra.filter((sha) => !isLaneMergeCommit(git, root, sha, release.tag)).map(shortSha).join(', ')}), so the lane will not delete it; merge ${target.branch} into it by hand inside its worktree (\`git merge ${target.branch}\`), then run \`validate --release ${release.tag}\``,
      )
      if (context.options.recreate && !laneOnly) doc.messages.push('--recreate was refused: a branch with human commits is never deleted by the lane')
      return doc
    }
  }

  let worktreePath = located.worktree === null ? worktreePathFor(root, release.tag) : located.worktree.path
  if (located.head === null) {
    git(['branch', located.branch, target.head], { cwd: root })
  }
  if (located.worktree === null) {
    worktreePath = worktreePathFor(root, release.tag)
    if (existsSync(worktreePath) && readdirSync(worktreePath).length > 0) {
      throw new LaneError(`${worktreePath} exists and is not empty, and no worktree is registered there; move it away, or run \`git worktree prune\` if it is a leftover`)
    }
    mkdirSync(dirname(worktreePath), { recursive: true })
    git(['worktree', 'add', '--quiet', worktreePath, located.branch], { cwd: root })
  }

  const session = {
    release,
    target,
    branch: located.branch,
    worktree: worktreePath,
    state: {
      tool: TOOL,
      version: DOCUMENT_VERSION,
      tag: release.tag,
      releaseCommit: release.commit,
      targetBranch: target.branch,
      targetHead: target.head,
      mergeBase: state.mergeBase,
      skipped: state.skipped,
      affected: state.affected,
      conflicts: [],
      startedAt: new Date().toISOString(),
    },
  }
  return startMerge(context, config, doc, session)
}

function runContinue(context, doc) {
  const { config, target } = prepare(context, doc, { fetch: false })
  const tag = resolveLaneTag(context)
  const located = locateUpdateBranch(context, tag)
  doc.branch = located.branch
  if (located.head === null) throw new LaneError(`no update branch ${located.branch} exists; run \`integrate --release ${tag}\` first`)
  if (located.worktree === null) throw new LaneError(`the update branch ${located.branch} has no worktree; run \`integrate --release ${tag}\` to re-create it`)
  doc.worktree = located.worktree.path
  if (!located.worktree.inProgress) throw new LaneError(`no merge is in progress in ${located.worktree.path}; nothing to continue`)

  const { git } = context
  const persisted = readLaneState(git, located.worktree.path)
  const mergeHead = git(['rev-parse', 'MERGE_HEAD'], { cwd: located.worktree.path }).stdout.trim()
  const release = releaseFromTag(context, config, tag)
  if (release.commit !== mergeHead) {
    doc.messages.push(`the merge in progress is of ${shortSha(mergeHead)}, and the fetched tag ${tag} points at ${shortSha(release.commit)}; the record names the commit being merged`)
    release.commit = mergeHead
  }
  const head = git(['rev-parse', 'HEAD'], { cwd: located.worktree.path }).stdout.trim()
  const state = persisted ?? {
    tool: TOOL,
    version: DOCUMENT_VERSION,
    tag,
    releaseCommit: mergeHead,
    targetBranch: target.branch,
    targetHead: head,
    mergeBase: git(['merge-base', head, mergeHead], { cwd: located.worktree.path, check: false }).stdout.trim() || null,
    skipped: [],
    affected: null,
    conflicts: [],
    startedAt: null,
  }
  if (persisted === null) doc.messages.push('no lane state was found for this merge; the record will list the conflicts git still reports and nothing else')
  doc.target = { tag, commit: release.commit, date: release.date ?? null, isPrerelease: release.prerelease !== null && release.prerelease !== undefined }
  doc.skipped = state.skipped ?? []
  doc.affected = state.affected ?? null
  if (config.gates.length === 0) doc.messages.push(NO_GATES_NOTICE)

  const unmerged = unmergedPaths(git, located.worktree.path).filter((path) => !matchesAnyGlob(path, config.generatedPaths))
  if (unmerged.length > 0) {
    doc.conflicts = state.conflicts
    doc.outcome = 'conflict'
    doc.messages.push(`${unmerged.length} path(s) are still unmerged: ${unmerged.join(', ')} — resolve and \`git add\` each, then run \`continue\` again`)
    doc.messages.push('nothing was committed')
    return doc
  }
  const session = { release, target: { branch: state.targetBranch ?? target.branch }, branch: located.branch, worktree: located.worktree.path, state }
  return finishMerge(context, config, doc, session)
}

function runValidate(context, doc) {
  const { config, target } = prepare(context, doc, { fetch: false })
  const tag = resolveLaneTag(context)
  const located = locateUpdateBranch(context, tag)
  doc.branch = located.branch
  if (located.head === null) throw new LaneError(`no update branch ${located.branch} exists; run \`integrate --release ${tag}\` first`)
  const { git, root } = context
  if (located.worktree === null) {
    const path = worktreePathFor(root, tag)
    if (existsSync(path) && readdirSync(path).length > 0) {
      throw new LaneError(`${path} exists and is not empty, and no worktree is registered there; move it away, or run \`git worktree prune\``)
    }
    mkdirSync(dirname(path), { recursive: true })
    git(['worktree', 'add', '--quiet', path, located.branch], { cwd: root })
    located.worktree = { path, inProgress: false }
    doc.messages.push(`the update worktree was re-created at ${path}`)
  }
  doc.worktree = located.worktree.path
  if (located.worktree.inProgress) throw new LaneError(`a merge is in progress in ${located.worktree.path}; finish it with \`continue\` or discard it with \`abort\` before validating`)
  const dirty = parsePorcelainStatus(git(['status', '--porcelain=v2', '-z'], { cwd: located.worktree.path }).stdout).filter((entry) => entry.kind !== 'untracked')
  if (dirty.length > 0) {
    throw new LaneError(`${located.worktree.path} has uncommitted changes (${dirty.map((entry) => entry.path).join(', ')}); commit them first so the record describes a commit`)
  }
  const release = releaseFromTag(context, config, tag)
  doc.target = { tag, commit: release.commit, date: release.date ?? null, isPrerelease: release.prerelease !== null && release.prerelease !== undefined }
  const existing = readBranchRecord(context, located.head, tag)
  if (existing !== null && typeof existing.releaseCommit === 'string') release.commit = existing.releaseCommit
  if (config.gates.length === 0) doc.messages.push(NO_GATES_NOTICE)

  const session = { release, target: { branch: existing?.targetBranch ?? target.branch }, branch: located.branch, worktree: located.worktree.path }
  if (config.gates.length > 0 && context.options.noGates !== true) doc.messages.push(TRUST_NOTICE)
  doc.gates = runGates(context, config, session)
  const verdict = gatesVerdict(doc.gates, { skipped: context.options.noGates === true })
  const record = {
    ...(existing ?? buildRecord({
      release: tag,
      releaseCommit: release.commit,
      mergeBase: null,
      targetBranch: target.branch,
      targetHead: null,
      gates: verdict,
      createdAt: new Date().toISOString(),
    })),
    gates: verdict,
    gateResults: doc.gates.map((gate) => ({ name: gate.name, run: gate.run, status: gate.status, exitCode: gate.exitCode, durationMs: gate.durationMs })),
    validatedAt: new Date().toISOString(),
    validatedHead: located.head,
  }
  doc.record = writeRecordFile(git, located.worktree.path, tag, record)
  const committed = commitInWorktree(git, located.worktree.path, `upstream lane: gates re-run for ${tag}\n\n${trailers(session, verdict)}\n`)
  if (committed.fallbackIdentity) doc.messages.push(`no git identity was configured; the record commit uses ${FALLBACK_IDENTITY.name} <${FALLBACK_IDENTITY.email}>`)
  doc.mergeCommit = findLaneMergeCommit(git, root, located.head, target.head, tag)
  doc.outcome = verdict === 'passed' || verdict === 'none' ? 'integrated' : 'validation-failed'
  doc.messages.push(`record commit ${committed.sha} on ${located.branch} says the gates ${verdict}`)
  return doc
}

function runAbort(context, doc) {
  const { config, target } = prepare(context, doc, { fetch: false })
  const tag = resolveLaneTagOrNull(context)
  doc.outcome = 'aborted'
  if (tag === null) {
    doc.messages.push('no update branch exists; nothing to abort')
    return doc
  }
  const { git, root } = context
  const located = locateUpdateBranch(context, tag)
  doc.branch = located.branch
  if (located.head === null && located.worktree === null) {
    doc.messages.push(`no update branch ${located.branch} exists; nothing to abort`)
    return doc
  }
  if (located.worktree !== null && isInsideDirectory(context.cwd, located.worktree.path)) {
    throw new LaneError(
      `the current directory ${context.cwd} is inside the update worktree ${located.worktree.path}, which abort removes — leave the directory first`,
    )
  }
  let cutPoint = null
  if (located.worktree !== null) {
    doc.worktree = located.worktree.path
    cutPoint = readLaneState(git, located.worktree.path)?.targetHead ?? null
    if (located.worktree.inProgress) {
      git(['merge', '--abort'], { cwd: located.worktree.path })
      doc.messages.push(`the in-progress merge in ${located.worktree.path} was aborted`)
    }
    git(['worktree', 'remove', '--force', located.worktree.path], { cwd: root })
    doc.messages.push(`the worktree ${located.worktree.path} was removed`)
  }
  git(['worktree', 'prune'], { cwd: root, check: false })
  if (located.head !== null) {
    if (cutPoint === null || revParse(git, root, cutPoint) === null) {
      const base = git(['merge-base', located.head, target.head], { cwd: root, check: false })
      cutPoint = base.status === 0 ? base.stdout.trim() : target.head
    }
    const beyond = countCommits(git, root, located.head, `^${cutPoint}`)
    if (beyond === 0) {
      git(['branch', '-D', located.branch], { cwd: root })
      doc.messages.push(`the update branch ${located.branch} carried no commit beyond ${shortSha(cutPoint)} and was deleted`)
    } else {
      doc.messages.push(`the update branch ${located.branch} carries ${beyond} commit(s) beyond ${shortSha(cutPoint)} and was kept; delete it by hand if that is intended`)
    }
  }
  doc.messages.push(`the target branch ${config.branch} was not touched`)
  return doc
}

/** A path in the form two paths are compared in: resolved, and case-folded where the platform is. */
function comparablePath(value) {
  return process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value)
}

/** True when `path` is `directory` or lies under it, by the platform's own path rules. */
function isInsideDirectory(path, directory) {
  const between = relative(comparablePath(directory), comparablePath(path))
  return between === '' || (!isAbsolute(between) && between.split(sep)[0] !== '..')
}

function resolveLaneTagOrNull(context) {
  if (context.options.release !== undefined) {
    assertTagShape(context, context.options.release)
    return context.options.release
  }
  if (context.currentBranch !== null && context.currentBranch.startsWith(BRANCH_PREFIX)) return context.currentBranch.slice(BRANCH_PREFIX.length)
  const branches = context.git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${BRANCH_PREFIX}`], { cwd: context.root })
    .stdout.split('\n')
    .filter((line) => line !== '')
  if (branches.length === 0) return null
  if (branches.length === 1) return branches[0].slice(BRANCH_PREFIX.length)
  throw new LaneError(`several update branches exist (${branches.map((branch) => branch.slice(BRANCH_PREFIX.length)).join(', ')}); pass --release <tag> to name one`)
}

export const USAGE = `stamity upstream lane — take an upstream release into this fork through an isolated update branch

usage: node scripts/upstream.mjs <verb> [--json] [--config <path>] [--release <tag>] [--prerelease]
                                        [--offline] [--no-gates] [--recreate] [--branch <name>]

verbs
  status     which release is integrated, which is next, what diverged, what the release touches
  preview    merge in a throwaway worktree, report, abort; touches nothing the operator owns
  integrate  prepare stamity-upstream/<tag> under .stamity/upstream-work/<tag>/: merge,
             regenerate, run the gates, write the record, commit — or report the conflicts
  continue   finish the in-progress merge after the conflicts are resolved and staged
  validate   re-run the gates on an existing update branch and commit a fresh record
  abort      abort the in-progress merge, remove the worktree, delete an untouched branch
  help       this text

--branch <name> takes <name> as the target branch instead of the configured one, for every verb:
status against the update branch itself, or integrate from a runner checkout whose branch
carries another name.

integrate, continue and validate run the merged tree's regenerate commands and gates with the
caller's environment: review the release before running them on a workstation holding
credentials, or run them in CI, where the prepare job holds none.

exit status: 0 up-to-date | update-available | integrated; 1 a result to act on (conflict,
validation-failed, update-branch-stale, ancestry-missing, ...); 2 usage, configuration or
environment problem (no .stamity/upstream.json means: not a fork)
`

const FLAGS_WITH_VALUE = new Set(['--config', '--release', '--branch'])
const BOOLEAN_FLAGS = new Set(['--json', '--prerelease', '--offline', '--no-gates', '--recreate'])

export function parseArguments(argv) {
  const options = { json: false, prerelease: false, offline: false, noGates: false, recreate: false }
  let verb = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (FLAGS_WITH_VALUE.has(argument)) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new LaneError(`${argument} needs a value`)
      options[argument.slice(2)] = value
      index += 1
    } else if (argument.startsWith('--') && argument.includes('=') && FLAGS_WITH_VALUE.has(argument.slice(0, argument.indexOf('=')))) {
      const at = argument.indexOf('=')
      options[argument.slice(2, at)] = argument.slice(at + 1)
    } else if (BOOLEAN_FLAGS.has(argument)) {
      options[argument === '--no-gates' ? 'noGates' : argument.slice(2)] = true
    } else if (argument.startsWith('-')) {
      throw new LaneError(`unknown option ${argument}\n${USAGE}`)
    } else if (verb === null) {
      verb = argument
    } else {
      throw new LaneError(`unexpected argument ${JSON.stringify(argument)}\n${USAGE}`)
    }
  }
  if (verb === null) throw new LaneError(`a verb is required\n${USAGE}`)
  if (!VERBS.includes(verb)) throw new LaneError(`unknown verb ${JSON.stringify(verb)}\n${USAGE}`)
  return { verb, options }
}

const RUNNERS = {
  status: runStatus,
  preview: runPreview,
  integrate: runIntegrate,
  continue: runContinue,
  validate: runValidate,
  abort: runAbort,
}

/** Runs one invocation and returns the finished document; never throws for a classified failure. */
export function main(argv) {
  let parsed
  try {
    parsed = parseArguments(argv)
  } catch (error) {
    const doc = createDocument(null)
    doc.outcome = 'error'
    doc.exitCode = 2
    doc.messages.push(describeError(error))
    doc.report = renderReport(doc)
    return doc
  }
  const doc = createDocument(parsed.verb)
  if (parsed.verb === 'help') {
    doc.outcome = 'help'
    doc.exitCode = 0
    doc.report = USAGE
    return doc
  }
  try {
    const context = openRepository(parsed.options)
    RUNNERS[parsed.verb](context, doc)
    doc.exitCode = exitCodeFor(doc.outcome)
  } catch (error) {
    // The failure goes FIRST: `messages[0]` is what a consumer shows, whatever was noted before.
    if (error instanceof LaneError) {
      doc.outcome = error.outcome
      doc.exitCode = error.exitCode
      doc.messages.unshift(error.message)
    } else {
      doc.outcome = 'error'
      doc.exitCode = 2
      doc.messages.unshift(`unexpected failure: ${error instanceof Error && error.stack ? error.stack : String(error)}`)
    }
  }
  doc.report = renderReport(doc)
  return doc
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const doc = main(argv)
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  } else {
    process.stdout.write(doc.report)
    if (doc.exitCode === 2) process.stderr.write(`upstream: ${doc.outcome} - ${doc.messages[0] ?? 'failed'}\n`)
  }
  process.exitCode = doc.exitCode
}
