#!/usr/bin/env node
// Build the UPGRADE-AND-ROLLBACK FIXTURE: two distribution trees of this corpus that differ only
// by their version, plus a bare git repository that serves them the way a real mirror does, so a
// client's install, update and rollback routes can be walked end to end without publishing
// anything (REQ-PLUGIN-021, REQ-PLUGIN-013).
//
// What lands in `--out`:
//
//   <out>/<version 1>/        a full distribution root, built by
//   <out>/<version 2>/        `scripts/build-plugin-distribution.mjs` at that version.
//   <out>/remote.git          a BARE repository carrying both trees as ORPHAN commits, tagged
//                             `plugins/v<version>` each, with the distribution branch at the
//                             SECOND commit — the shape `.github/workflows/release.yml`'s
//                             "Push plugin distribution" step publishes, in miniature.
//
// The second version carries ONE extra artifact, the marker skill `st-fixture-marker`, so a walk
// can tell the two versions apart by discovery alone rather than by reading a version string the
// client never shows. It is authored through the FORK LAYER, which is the supported way to add an
// artifact to a build (`docs/enterprise-forks.md`), and the fork layer is read from the checkout
// the generator runs out of (`scripts/generate-plugin-packages.mjs`, `forkRoot: join(ROOT,
// 'fork')`). That is why both builds run out of a COPY of this checkout in a temp directory: a
// `fork/` written into the real tree would be an untracked directory the leak gate walks, and
// would change what every other build in the working tree produces.
//
// Building BOTH versions from ONE copy is the point: the two trees then share their corpus and
// their generator bytes by construction, so every difference between them is either the version
// itself or the marker — which is exactly the property `test/ci/pluginLifecycle.test.ts` asserts
// by diffing the two roots.
//
// PROVENANCE IS AN INPUT, NEVER A CLOCK READ, and the fixture extends that to git: both commits
// are made with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` set to `release.json`'s
// `sourceCommitDate` and a fixed author, which is the release workflow's own rule and is what
// makes a rebuild produce the same two commit shas instead of two new ones.
//
// `--push <git url>` mirrors both tags and the branch to a real remote. It is the only step here
// that leaves the machine, it is never needed to walk a client locally, and it is separate from
// the build for that reason. The push is not forced, so the remote must not already hold the
// distribution branch: a `plugin-dist` that is already there is refused as a non-fast-forward, and
// that refusal is the right answer for a fixture remote — delete the branch there first. The URL
// is printed and, on failure, quoted with its userinfo dropped, because a token travels there.
//
// Exit codes: 0 the fixture was built, 1 a step failed, 2 bad arguments.
// Usage: node scripts/plugin-lifecycle-fixture.mjs --out <dir> --versions <semver>,<semver>
//        [--runtime <dir>] [--client <csv>] [--push <git url>]

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DISTRIBUTION_CLIENTS, resolveDistributionIdentity } from './distribution-identity.mjs'
import { isMain } from './native-typescript.mjs'
import { buildCatalogIdentity, releaseTag } from './plugins/catalogs.mjs'
import { PLUGIN_VERSION } from './plugins/version.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const USAGE =
  'Usage: node scripts/plugin-lifecycle-fixture.mjs --out <dir> --versions <semver>,<semver> ' +
  '[--runtime <dir>] [--client <csv>] [--push <git url>]'

const COMMIT_SHA = /^[0-9a-f]{40}$/

/** The bare repository's name inside `--out`, and the id of the marker the second version adds. */
const REMOTE = 'remote.git'
/**
 * The marker's fork-layer directory name is the BARE slug, with no `st-` prefix: the generator
 * refuses a prefixed fork directory outright — "a fork-layer skill directory carries the engine
 * content prefix, which names the generated corpus, not the fork's own artifact. Save it under
 * the bare spelling ... instead" — because the prefix is what the emission adds, and a bare slug
 * matching a bundled id is how the fork layer REPLACES an artifact rather than adding one. So the
 * authored path is `fork/skills/fixture-marker/`, and what lands in a root is the prefixed form.
 */
const MARKER_SKILL = 'fixture-marker'

/**
 * The marker skill's authored body. The head carries exactly the keys the corpus index requires
 * of a skill — the shape of `content/skills/st-qa/SKILL.md`'s head, with the `st-` prefix living
 * in the DIRECTORY name and the id carrying the bare form, which is that file's own convention.
 */
const MARKER_BODY = `---
id: fixture-marker
type: skill
description: "Marks the second version of the upgrade-and-rollback fixture, so a client's discovery can tell the two fixture versions apart without reading a version string. Never triggers on real work."
tags: [fixture]
load: on-demand
---

# Fixture marker

This skill exists only inside the upgrade-and-rollback fixture built by
\`scripts/plugin-lifecycle-fixture.mjs\`. Its presence means the installed tree is
the SECOND fixture version; its absence means the first.
`

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  return 2
}

function parseArguments(argv) {
  let out = null
  let versions = null
  let runtime = null
  let clients = null
  let push = null

  /** Every flag this CLI takes carries exactly one value; none is a bare switch. */
  const sinks = {
    '--out': (value) => {
      out = value
    },
    '--versions': (value) => {
      versions = value
    },
    '--runtime': (value) => {
      runtime = value
    },
    '--client': (value) => {
      clients = value
    },
    '--push': (value) => {
      push = value
    },
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const sink = Object.hasOwn(sinks, arg) ? sinks[arg] : null
    // Shown without userinfo: every flag consumes the next token, so a flag with no value swallows
    // `--push` and the URL is what arrives here — the one place a token could print before the push
    // arm's own display form.
    if (sink === null) return { code: usage(`Unknown argument: ${pushDisplay(arg).shown}`) }
    i += 1
    if (i >= argv.length) return { code: usage(`${arg} needs a value.`) }
    sink(argv[i])
  }

  if (out === null) return { code: usage('--out is required.') }
  if (versions === null) {
    return { code: usage('--versions is required: the fixture is a PAIR, and the walk upgrades from the first to the second.') }
  }
  const selectedVersions = versions
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (selectedVersions.length !== 2) {
    return { code: usage(`--versions needs exactly two versions; got ${String(selectedVersions.length)}.`) }
  }
  for (const version of selectedVersions) {
    // The generator's own pattern, so a value this script admits is one the builder admits.
    if (!PLUGIN_VERSION.test(version)) {
      return { code: usage(`--versions ${version} is not a semantic version with no build metadata, for example 1.9.0-fixture.1.`) }
    }
  }
  if (selectedVersions[0] === selectedVersions[1]) {
    // Two identical versions would build two identical trees and one commit, and the update leg
    // of every walk would pass without anything having been updated.
    return { code: usage('--versions needs two DIFFERENT versions; the walk updates from the first to the second.') }
  }

  const selectedClients =
    clients === null
      ? [...DISTRIBUTION_CLIENTS]
      : clients
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '')
  if (selectedClients.length === 0) return { code: usage('--client needs at least one client.') }
  for (const client of selectedClients) {
    if (!DISTRIBUTION_CLIENTS.includes(client)) {
      return { code: usage(`--client ${client} is not one of ${DISTRIBUTION_CLIENTS.join(', ')}.`) }
    }
  }

  const outDir = resolve(out)
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    // The same refusal the distribution builder makes, for the same reason: a fixture built over
    // another fixture's trees and tags describes neither pair.
    return { code: usage(`--out ${outDir} already holds files; give an empty or nonexistent directory.`) }
  }

  let runtimeDir = null
  if (runtime !== null) {
    runtimeDir = resolve(runtime)
    if (!existsSync(runtimeDir) || !statSync(runtimeDir).isDirectory()) {
      return { code: usage(`--runtime ${runtimeDir} is not a directory. Build one with scripts/build-plugin-runtime.mjs.`) }
    }
  }

  return {
    outDir,
    versions: selectedVersions,
    runtimeDir,
    push,
    clients: DISTRIBUTION_CLIENTS.filter((client) => selectedClients.includes(client)),
  }
}

/** A git fact of this checkout, or `null` when this is not one (a fixture, an unpacked tarball). */
function gitFact(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0 || typeof result.stdout !== 'string') return null
  const value = result.stdout.trim()
  return value === '' ? null : value
}

/** Run a command, and fail loudly with its own output — the sibling builders' posture. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
  if (result.error !== undefined && result.error !== null) throw result.error
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(
      `${command} ${args.join(' ')} exited ${String(result.status ?? 'on a signal')}${output === '' ? '' : `:\n${output}`}`,
    )
  }
  return result.stdout ?? ''
}

/**
 * A push URL's display form, and a scrub for any line that quoted the URL as given. Userinfo is
 * dropped — `https://x-access-token:<token>@host/o/r.git` is how a token travels in a push URL —
 * and every spelling of it a line could carry is replaced: the URL itself by the display form, the
 * `user:password@` and `user@` runs by nothing (git's credential prompt prints the username
 * DECODED, so both the encoded and the decoded spelling go), and the bare token by a placeholder.
 * The token is the password when there is one, else the username — which is how GitHub takes one
 * over http(s); a transport user on another scheme (`ssh://git@…`) is not a secret, and scrubbing
 * `git` out of a git command line would be worse than the line. A value the URL parser refuses (an
 * scp-style `git@host:o/r.git`, a path) carries no userinfo and is shown as given. Exported for the
 * suite, which drives every spelling without a push.
 */
export function pushDisplay(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    // Not a URL: nothing to drop, and git will say what it makes of the value.
    return { shown: url, scrub: (text) => text }
  }
  const { username, password, protocol } = parsed
  if (username === '' && password === '') return { shown: url, scrub: (text) => text }
  parsed.username = ''
  parsed.password = ''
  const shown = parsed.href
  const spellings = (value) => [...new Set([value, decodedOrSelf(value)])].filter((entry) => entry !== '')
  const userinfo = password === '' ? username : `${username}:${password}`
  const runs = [...spellings(userinfo), ...spellings(username)].map((value) => `${value}@`)
  const bare = password !== '' ? password : /^https?:$/.test(protocol) ? username : ''
  const secrets = spellings(bare)
  return {
    shown,
    scrub: (text) =>
      secrets.reduce(
        (out, secret) => out.replaceAll(secret, '<redacted>'),
        runs.reduce((out, userinfoRun) => out.replaceAll(userinfoRun, ''), text.replaceAll(url, shown)),
      ),
  }
}

/** `value` percent-decoded, or as given when it is not valid percent-encoding. */
function decodedOrSelf(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    // Malformed escapes: the encoded form is the only spelling a line could have carried.
    return value
  }
}

/**
 * Every git invocation here is run with the repository's configuration pinned on the command line
 * rather than inherited: an operator's global `core.autocrlf` or commit signing would otherwise
 * change the bytes committed or the commit object, and the whole point of these two commits is that
 * a rebuild reproduces their shas. The operator's hooks are handled by `--no-verify` on the commit
 * itself rather than by blanking `core.hooksPath`, which is one mechanism instead of two.
 */
const GIT_PINS = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.safecrlf=false',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'tag.gpgsign=false',
  '-c',
  'user.name=fixture',
  '-c',
  'user.email=fixture@example.invalid',
]

function git(args, options = {}) {
  return run('git', [...GIT_PINS, ...args], options)
}

/** Every regular file under `dir`, as POSIX-relative paths, sorted — the builders' own walk. */
function treeFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel)
      return entry.isFile() ? [rel] : []
    })
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The sha-256 of every file in a tree, keyed by POSIX-relative path. */
function treeDigests(dir) {
  const digests = new Map()
  for (const relPath of treeFiles(dir)) digests.set(relPath, sha256(readFileSync(join(dir, relPath))))
  return digests
}

/**
 * A copy of this checkout that a distribution build can run out of, isolated from the working
 * tree: the four directories a build reads, the fork layer when the checkout carries one, the
 * manifest that carries the distribution identity, and `node_modules` as a symlink rather than a
 * copy. The shape is `test/ci/downstreamFixture.ts`'s `downstreamCheckout`, plus the real
 * `content/` tree, which is the corpus every root is planned from.
 */
function checkoutCopy(parent) {
  const root = join(parent, 'checkout')
  mkdirSync(root, { recursive: true })
  // `fork/` when the checkout has one: a fork's own layer is part of what its build carries
  // (REQ-PLUGIN-022), and a copy without it built two trees that dropped it — while the marker,
  // written under the copy's own `fork/skills/` between the builds, still landed and hid the loss.
  for (const path of ['src', 'scripts', 'assets', 'content']) {
    cpSync(join(ROOT, path), join(root, path), { recursive: true })
  }
  const fork = join(ROOT, 'fork')
  if (existsSync(fork)) {
    cpSync(fork, join(root, 'fork'), { recursive: true })
    // Said out loud: a fork layer travels into what `--push` publishes, and the diff summary at
    // the end names only what differs between the two versions, which a shared layer never does.
    console.log(`plugin-lifecycle-fixture: fork layer: ${String(treeFiles(fork).length)} file(s) copied`)
  }
  writeFileSync(join(root, 'package.json'), readFileSync(join(ROOT, 'package.json')))
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'junction')
  return root
}

/**
 * The runtime every root bundles. `--runtime` is the fast path a test takes; without it the
 * fixture builds one the way a release does — from the PACKED tarball, never from the working
 * tree, because `npm pack` is the only thing that knows what `files` publishes. Both the tarball
 * and the runtime land in the temp work directory, never beside the checkout, where an untracked
 * directory would enter the leak gate's own file scan.
 */
function buildRuntime(work) {
  if (!existsSync(join(ROOT, 'dist', 'cli.js'))) {
    console.log('plugin-lifecycle-fixture: no dist/cli.js in this checkout; running npm run build first')
    run('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
  }
  const packDir = join(work, 'pack')
  mkdirSync(packDir, { recursive: true })
  console.log('plugin-lifecycle-fixture: no --runtime given; packing this checkout and building a runtime')
  const packed = run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: ROOT })
  const tarball = join(packDir, JSON.parse(packed)[0].filename)
  const runtimeDir = join(work, 'runtime')
  run(process.execPath, [join(ROOT, 'scripts', 'build-plugin-runtime.mjs'), '--tarball', tarball, '--out', runtimeDir], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  return runtimeDir
}

/** One distribution tree, built from `checkout` at `version`. */
function buildTree({ checkout, outDir, version, runtimeDir, clients, sourceCommit, sourceCommitDate }) {
  run(
    process.execPath,
    [
      join(checkout, 'scripts', 'build-plugin-distribution.mjs'),
      '--out',
      outDir,
      '--runtime',
      runtimeDir,
      '--version',
      version,
      '--source-commit',
      sourceCommit,
      '--source-commit-date',
      sourceCommitDate,
      '--client',
      clients.join(','),
    ],
    { cwd: checkout },
  )
  return outDir
}

/**
 * One tree, committed as an ORPHAN commit into the bare repository and tagged.
 *
 * The work git directory sits in the temp area and the tree is reached through `GIT_WORK_TREE`, so
 * no `.git` ever lands inside a distribution tree — a tree the walk compares file by file, and a
 * tree a client installs. HEAD is pointed at the distribution branch with `symbolic-ref` rather
 * than `checkout --orphan`, which is the same unborn-HEAD state without touching a single file
 * of the tree being committed. Each version gets its OWN work repository, which is what makes
 * the second commit an orphan too rather than a child of the first.
 *
 * `add -A -f`, because a dependency inside the bundled runtime may ship a `.gitignore` of its
 * own and a fixture that quietly lost files would fail a walk for the wrong reason. Both dates
 * come from the release manifest, so this function is idempotent: same tree, same message, same
 * dates, same author — same sha.
 *
 * `setBranch` belongs to the LAST version alone: two orphan commits share no history, so a
 * second branch push would be refused as a non-fast-forward, and the branch is meant to name the
 * newest version anyway — the state a consumer who tracks the branch installs.
 */
function commitTree({ work, tree, bare, tag, branch, version, setBranch, sourceCommit, sourceCommitDate }) {
  const workRepo = join(work, `commit-${version}`)
  git(['init', '-q', workRepo], { cwd: work })
  const env = {
    ...process.env,
    GIT_DIR: join(workRepo, '.git'),
    GIT_WORK_TREE: tree,
    GIT_AUTHOR_DATE: sourceCommitDate,
    GIT_COMMITTER_DATE: sourceCommitDate,
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  }
  const options = { cwd: tree, env }
  git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], options)
  git(['add', '-A', '-f', '.'], options)
  git(['commit', '-q', '--no-verify', '-m', `plugins: v${version} from ${sourceCommit}`], options)
  const commit = git(['rev-parse', 'HEAD'], options).trim()
  git(['tag', tag], options)
  const refs = [`refs/tags/${tag}`, ...(setBranch ? [`HEAD:refs/heads/${branch}`] : [])]
  git(['push', '-q', bare, ...refs], options)
  return commit
}

/** What the two trees disagree about, as the three lists a reader of the summary needs. */
function diffTrees(first, second) {
  const a = treeDigests(first)
  const b = treeDigests(second)
  const added = [...b.keys()].filter((path) => !a.has(path)).toSorted()
  const removed = [...a.keys()].filter((path) => !b.has(path)).toSorted()
  const changed = [...a.keys()].filter((path) => b.has(path) && a.get(path) !== b.get(path)).toSorted()
  return { added, removed, changed, common: a.size - removed.length }
}

function main(argv) {
  const parsed = parseArguments(argv)
  if (parsed.code !== undefined) return parsed.code
  const { outDir, versions, clients, push } = parsed

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const identity = buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg))
  const branch = identity.distribution.branch

  // Resolved HERE and forwarded to both builds, rather than read again per build: the two trees
  // must name ONE source commit, or the diff between them would carry the provenance too.
  const sourceCommit = gitFact(['rev-parse', 'HEAD'])
  const sourceCommitDate = gitFact(['show', '-s', '--format=%cI', 'HEAD'])
  if (sourceCommit === null || !COMMIT_SHA.test(sourceCommit)) {
    throw new Error('The source commit could not be read from this checkout, and both fixture trees name it.')
  }
  if (sourceCommitDate === null || Number.isNaN(Date.parse(sourceCommitDate))) {
    throw new Error('The source commit date could not be read from this checkout, and both fixture commits are dated from it.')
  }

  const work = mkdtempSync(join(tmpdir(), 'stamity-plugin-lifecycle-'))
  try {
    const runtimeDir = parsed.runtimeDir ?? buildRuntime(work)
    const checkout = checkoutCopy(work)
    mkdirSync(outDir, { recursive: true })

    const trees = []
    for (const [index, version] of versions.entries()) {
      if (index === 1) {
        // The one authored difference between the two versions, written into the COPY's fork
        // layer between the two builds so the first version cannot see it.
        const marker = join(checkout, 'fork', 'skills', MARKER_SKILL, 'SKILL.md')
        mkdirSync(dirname(marker), { recursive: true })
        writeFileSync(marker, MARKER_BODY)
        console.log(`plugin-lifecycle-fixture: ${version} adds the marker skill ${MARKER_SKILL}`)
      }
      console.log(`plugin-lifecycle-fixture: building ${version} (${clients.join(', ')})`)
      trees.push(
        buildTree({
          checkout,
          outDir: join(outDir, version),
          version,
          runtimeDir,
          clients,
          sourceCommit,
          sourceCommitDate,
        }),
      )
    }

    const bare = join(outDir, REMOTE)
    git(['init', '-q', '--bare', bare], { cwd: outDir })
    // HEAD points at the distribution branch before anything is pushed, so a plain `git clone` of
    // this repository lands on the newest version instead of warning that the default branch does
    // not exist — which is what a consumer who mirrors the tree actually gets.
    git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: outDir, env: { ...process.env, GIT_DIR: bare } })
    const commits = versions.map((version, index) =>
      commitTree({
        work,
        tree: trees[index],
        bare,
        tag: releaseTag(identity, version),
        branch,
        version,
        setBranch: index === versions.length - 1,
        sourceCommit,
        sourceCommitDate,
      }),
    )

    const diff = diffTrees(trees[0], trees[1])
    for (const [index, version] of versions.entries()) {
      console.log(`plugin-lifecycle-fixture: ${version} tree ${trees[index]} at ${commits[index]} (${releaseTag(identity, version)})`)
    }
    console.log(`plugin-lifecycle-fixture: ${bare} carries both tags and ${branch} at ${commits[1]}`)
    console.log(
      `plugin-lifecycle-fixture: diff ${versions[0]} -> ${versions[1]} — ` +
        `${String(diff.added.length)} added, ${String(diff.removed.length)} removed, ` +
        `${String(diff.changed.length)} changed, ${String(diff.common - diff.changed.length)} identical`,
    )
    for (const path of diff.added) console.log(`plugin-lifecycle-fixture:   + ${path}`)
    for (const path of diff.removed) console.log(`plugin-lifecycle-fixture:   - ${path}`)
    for (const path of diff.changed) console.log(`plugin-lifecycle-fixture:   ~ ${path}`)

    if (push !== null) {
      // The only step that leaves this machine, and it pushes REFS THAT ALREADY EXIST in the
      // bare repository rather than re-deriving anything: what a mirror receives is byte for
      // byte what a local walk just exercised.
      const refs = [...versions.map((version) => `refs/tags/${releaseTag(identity, version)}`), `refs/heads/${branch}`]
      const { shown, scrub } = pushDisplay(push)
      try {
        git(['push', push, ...refs], { cwd: outDir, env: { ...process.env, GIT_DIR: bare } })
      } catch (error) {
        // `run()`'s line quotes its argv, which is the URL as given — the one place a token in its
        // userinfo could reach stderr and a pasted record: git's own "unable to access" line prints
        // the URL without credentials already (measured 2026-09-22). The cause travels with the
        // rethrow, so its message and its stack (which repeats the message) are scrubbed in place.
        const thrown = error instanceof Error ? error : new Error(String(error))
        thrown.message = scrub(thrown.message)
        thrown.stack = scrub(thrown.stack ?? '')
        throw new Error(thrown.message, { cause: error })
      }
      console.log(`plugin-lifecycle-fixture: pushed ${refs.join(' ')} to ${shown}`)
    }

    console.log(
      `plugin-lifecycle-fixture: PASS - ${identity.name} ${versions.join(' -> ')}, ` +
        `${String(clients.length)} root(s) per version, ${REMOTE} at ${commits[1]}`,
    )
    return 0
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`plugin-lifecycle-fixture: FAIL - ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
