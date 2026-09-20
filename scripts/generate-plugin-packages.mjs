// Build the four per-client plugin roots this repository publishes, from its own corpus.
//
// What a root IS: one client's whole stamity surface — its agents, commands, skills, rules and
// hooks, its container manifest, a capability file declaring what it carries and what it does
// not, a README naming the install and rollback route, and a bundled runtime with the locator
// that finds it. `<out>/claude`, `<out>/cursor`, `<out>/copilot`, `<out>/codex`.
//
// Where the content comes from: the SAME planner that writes this engine's repository emission.
// A root is not a second rendering of the corpus — it is the client's own residue planner run
// over a full selection, re-addressed into the container by `plugins/layout.mjs`. That is what
// keeps a published plugin and an `init`-ed repository saying the same thing: one renderer, one
// corpus, two address spaces.
//
// Three things a plugin body must survive that a repository body never has to.
//
//   1. NO REPOSITORY FACTS. A `${STAMITY:*}` token resolves per repository — `npm run test` here,
//      `pytest` next door — and a plugin is built once for every repository there will ever be.
//      `plugins/corpusStage.mjs` resolves each token into a phrase naming the row to read in
//      `AGENTS.md`, and refuses a token it cannot resolve rather than shipping a broken variable.
//   2. NO REPOSITORY PATHS. A hook command in a repository points into `.stamity/generated/`; in
//      an installed plugin that path belongs to someone else's checkout. The planner is given
//      `facts.hookScriptsRoot` — `${CLAUDE_PLUGIN_ROOT}/hooks` and its three siblings — so every
//      hook command it renders is already root-relative before this file sees it.
//   3. NO REPOSITORY OWNERSHIP. The charter, the client entry files, the MCP documents and the
//      `.stamity/` state tree describe ONE repository. They are dropped, per client, with a
//      stated reason that lands in the capability file as `repository-owned`.
//
// Determinism is the contract `--check` enforces: the same corpus, version and commit render the
// same bytes, so a drifted tree is a real change and never a timestamp. Nothing here reads the
// clock — the manifest handed to the planner carries fixed timestamps for that reason alone.
//
// The corpus reader and the planner are TypeScript and there is no build step here on purpose, on
// the reasoning `generate-apm-package.mjs` states in full: a generator that needs `npm run build`
// first goes stale the moment someone skips the build. Node strips the types itself from v22.18
// onward; the bootstrap below re-execs once for a host below that floor, which is why every
// TypeScript import — and `plugins/layout.mjs`, which has one — is dynamic and inside the guard.
//
// Every `await` in a loop below is ORDERED on purpose, so `no-await-in-loop` is off for this
// file. Each client's plan is a whole corpus pass, and a refusal must name the first client that
// hit it rather than whichever of four raced to reject; each root's stale sweep, write and prune
// are three phases of one directory's life and cannot overlap. The independent work inside a
// phase — the per-file reads, comparisons and writes — is already fanned out with `Promise.all`.
/* oxlint-disable no-await-in-loop */
//
// What a walk carries: REAL BYTES. Every tree this file reads — the bundled runtime on the way
// in, an output root on the way out — is walked for regular files, and an entry that is neither
// a regular file nor a directory is refused by name rather than dropped. A symlink is the case
// that matters: `npm ci` writes them, a copy of one resolves against the machine that built the
// runtime, and a walk that skipped them silently would ship a root missing a file and leave
// `--check` unable to see one planted under `<out>`. `node_modules/.bin` is the ONE stated
// exception, skipped by name because `npm ci` fills it with links to files the tree already
// carries; the runtime builder does not prune it, and it is not this generator's file to change.
//
// Exit codes: 0 ok, 1 render/write failure or drift under --check, 2 bad arguments.
// Usage: node scripts/generate-plugin-packages.mjs --out-dir <dir> --runtime <dir> [--client <csv>]
//        [--check] [--source-commit <sha>] [--source-commit-date <iso>] [--version <semver>]

import { prepareNativeTypescriptCli } from './native-typescript.mjs'
import { spawnSync } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDistributionIdentity } from './distribution-identity.mjs'
import { buildCapabilityFile, PLUGIN_CLASSES, validateCapabilityFile } from './plugins/capability.mjs'
import { stageSubstitutedCorpus } from './plugins/corpusStage.mjs'
import { renderSetupCommand } from './plugins/setupCommand.mjs'
import * as tokens from './plugins/tokens.mjs'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const USAGE =
  'Usage: node scripts/generate-plugin-packages.mjs --out-dir <dir> --runtime <dir> ' +
  '[--client <csv>] [--check] [--source-commit <sha>] [--source-commit-date <iso>] [--version <semver>]'

/** The regeneration line every drift report ends with. */
const REGENERATE = 'node scripts/generate-plugin-packages.mjs --out-dir dist/plugins --runtime <dir>'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const COMMIT_SHA = /^[0-9a-f]{40}$/
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/

/** Every plugin root's hook scripts and policy document live here, on every client. */
const HOOKS_DIR = 'hooks'
/** Where the bundled runtime sits inside a root, and the locator's name inside it. */
const RUNTIME_DIR = 'runtime'
const LOCATOR_NAME = 'locate.mjs'

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/** 2-space JSON with a trailing newline: the shape every generated document in this tree takes. */
function jsonDocument(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * The one directory a walk may pass over, named rather than dropped.
 *
 * `npm ci` writes `node_modules/.bin/<name>` as a link to a file the tree already carries, and
 * `scripts/build-plugin-runtime.mjs` prunes nothing there. Nothing is lost by skipping it: the
 * link targets are real files under `node_modules/` and travel on their own, and a `.bin` entry
 * copied as bytes would be a shim resolved against the machine that built the runtime. This is
 * an EXCEPTION and not a rule — everything else that is neither a regular file nor a directory
 * is refused by name below.
 */
const SKIPPED_DIRECTORY = 'node_modules/.bin'

/**
 * Every regular file under `dir`, as sorted root-relative POSIX paths.
 *
 * A walk that drops what it does not recognise is how a root ships missing a file and how
 * `--check` reads a planted entry as absent. Anything that is neither a regular file nor a
 * directory — a symbolic link above all — is a REFUSAL naming the entry: a link copied into a
 * plugin root would resolve against the machine that built it, and skipping it silently would
 * publish a tree nobody can tell from a complete one.
 */
async function walkRegularFiles(dir, prefix) {
  const entries = (await readdir(dir, { withFileTypes: true })).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (relPath === SKIPPED_DIRECTORY || relPath.endsWith(`/${SKIPPED_DIRECTORY}`)) return []
      if (entry.isDirectory()) return walkRegularFiles(join(dir, entry.name), relPath)
      if (entry.isFile()) return [relPath]
      throw new Error(
        `${join(dir, entry.name)} is ${describeEntry(entry)} rather than a regular file. A plugin ` +
          'root carries real bytes only: a link resolves against the machine that built it, and ' +
          `passing over one silently would ship a tree missing ${relPath}. Remove it, or place ` +
          `its contents as real files. (${SKIPPED_DIRECTORY} is the one stated exception.)`,
      )
    }),
  )
  return nested.flat()
}

/** What an unwalkable directory entry IS, so the refusal names the thing rather than the absence. */
function describeEntry(entry) {
  if (entry.isSymbolicLink()) return 'a symbolic link'
  if (entry.isFIFO()) return 'a FIFO'
  if (entry.isSocket()) return 'a socket'
  if (entry.isBlockDevice()) return 'a block device'
  if (entry.isCharacterDevice()) return 'a character device'
  return 'not a regular file'
}

/** Deepest-first sweep of directories holding nothing, so a retired artifact leaves no husk. */
async function pruneEmptyDirectories(dir, relPath) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const removed = (
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => pruneEmptyDirectories(join(dir, entry.name), posix.join(relPath, entry.name))),
    )
  ).flat()
  if ((await readdir(dir)).length === 0) {
    await rmdir(dir)
    removed.push(relPath)
  }
  return removed
}

/** First line that differs, as a one-line summary a reader can act on. */
function firstDifference(expected, actual) {
  const want = expected.toString('utf8').split('\n')
  const have = actual.toString('utf8').split('\n')
  for (let i = 0; i < Math.max(want.length, have.length); i += 1) {
    if (want[i] !== have[i]) {
      return (
        `line ${String(i + 1)}: committed ${JSON.stringify(have[i] ?? '<end of file>')}, ` +
        `regenerated ${JSON.stringify(want[i] ?? '<end of file>')}`
      )
    }
  }
  return 'files differ in bytes (including binary content)'
}

if (prepareNativeTypescriptCli(import.meta.url)) {
  function usage(problem) {
    console.error(`${problem}\n${USAGE}`)
    process.exit(2)
  }

  const { buildClasses, CLIENT_CONTAINERS, LAYOUT_CLIENTS, placeRow } = await import('./plugins/layout.mjs')
  const { composeEmissionPlanner } = await import('../src/emit/planner.ts')
  const { ADAPTER_REGISTRY } = await import('../src/adapters/registry.ts')
  const { buildContentIndex } = await import('../src/content/catalog.ts')
  const { resolveSelection } = await import('../src/content/selection.ts')
  const { MANIFEST_VERSION } = await import('../src/types/manifest.ts')
  const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')

  // ── Arguments ────────────────────────────────────────────────────

  const args = process.argv.slice(2)
  let check = false
  let outDir = null
  let runtimeDir = null
  let clients = null
  let sourceCommit = null
  let sourceCommitDate = null
  let version = null

  function take(i, flag) {
    if (i >= args.length) usage(`${flag} needs a value.`)
    return args[i]
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--check') {
      check = true
    } else if (arg === '--out-dir') {
      i += 1
      outDir = take(i, '--out-dir')
    } else if (arg === '--runtime') {
      i += 1
      runtimeDir = take(i, '--runtime')
    } else if (arg === '--client') {
      i += 1
      clients = take(i, '--client')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '')
    } else if (arg === '--source-commit') {
      i += 1
      sourceCommit = take(i, '--source-commit')
    } else if (arg === '--source-commit-date') {
      i += 1
      sourceCommitDate = take(i, '--source-commit-date')
    } else if (arg === '--version') {
      i += 1
      version = take(i, '--version')
    } else {
      usage(`Unknown argument: ${arg}`)
    }
  }

  if (outDir === null) usage('--out-dir is required.')
  if (runtimeDir === null) usage('--runtime is required: a plugin root bundles the runtime that runs its setup.')

  const selectedClients = clients ?? LAYOUT_CLIENTS
  for (const client of selectedClients) {
    if (!LAYOUT_CLIENTS.includes(client)) {
      usage(`--client ${client} is not one of ${LAYOUT_CLIENTS.join(', ')}.`)
    }
  }
  if (selectedClients.length === 0) usage('--client needs at least one client.')

  if (sourceCommit !== null && !COMMIT_SHA.test(sourceCommit)) {
    usage('--source-commit must be a 40-character lowercase hex commit sha.')
  }
  if (sourceCommitDate !== null && Number.isNaN(Date.parse(sourceCommitDate))) {
    usage('--source-commit-date must be an ISO 8601 timestamp.')
  }
  if (version !== null && !SEMVER.test(version)) {
    usage('--version must be a semantic version, for example 1.9.0.')
  }

  // ── Identity, version, provenance ────────────────────────────────

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

  function requirePkg(field, value, predicate) {
    if (!predicate(value)) {
      fail(
        `package.json declares no usable \`${field}\`, so every plugin root would carry an empty ` +
          'or absent value for it. Fix package.json and re-run.',
      )
    }
    return value
  }

  const packageName = requirePkg('name', pkg.name, nonEmptyString)
  const releaseVersion = version ?? requirePkg('version', pkg.version, nonEmptyString)
  const description = requirePkg('description', pkg.description, nonEmptyString)
  const license = requirePkg('license', pkg.license, nonEmptyString)
  const homepageUrl = requirePkg('homepage', pkg.homepage, nonEmptyString)
  const keywords = requirePkg(
    'keywords',
    pkg.keywords,
    (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmptyString),
  )
  const nodeFloor = requirePkg('engines.node', pkg.engines?.node, nonEmptyString)

  let distributionIdentity
  try {
    distributionIdentity = resolveDistributionIdentity(pkg)
  } catch (err) {
    fail(err.message)
  }
  const { publisher, repository } = distributionIdentity

  /**
   * The plugin id on every surface: the package name with its npm scope removed. Identical to
   * `scripts/generate-plugin-manifests.mjs`'s derivation, so the container manifest a root
   * carries and the one committed at `.claude-plugin/plugin.json` name the same plugin.
   */
  const identity = {
    name: packageName.replace(/^@[^/]+\//, ''),
    description,
    // The `#fragment` goes: it addresses a section of a README, which is npm's convention for
    // this field and not what a plugin surface means by a homepage.
    homepage: homepageUrl.replace(/#.*$/, ''),
    repository,
    license,
    keywords,
    author: { name: publisher },
  }

  /** `owner/repo` — what a marketplace command in a README takes. */
  const slug = repository.replace(/^https:\/\/github\.com\//, '')

  /** A git fact of the checkout, or `null` when this is not one (a fixture, an unpacked tarball). */
  function gitFact(gitArgs) {
    const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' })
    if (result.status !== 0 || typeof result.stdout !== 'string') return null
    const value = result.stdout.trim()
    return value === '' ? null : value
  }

  if (sourceCommit === null) {
    const head = gitFact(['rev-parse', 'HEAD'])
    if (head === null || !COMMIT_SHA.test(head)) {
      fail(
        'The source commit could not be read from this checkout, and a capability file must name ' +
          'the commit its root was built from. Pass --source-commit <40-hex-sha>.',
      )
    }
    sourceCommit = head
  }
  if (sourceCommitDate === null) {
    const committed = gitFact(['show', '-s', '--format=%cI', 'HEAD'])
    if (committed === null || Number.isNaN(Date.parse(committed))) {
      fail(
        'The source commit date could not be read from this checkout. Pass --source-commit-date ' +
          '<ISO 8601 timestamp>.',
      )
    }
    sourceCommitDate = committed
  }

  // ── The bundled runtime ──────────────────────────────────────────

  /**
   * The runtime tree every root carries, read once and shared by all of them.
   *
   * The two required files are what the locator needs to do its job: `package.json` carries the
   * Node floor it refuses below, and `dist/cli.js` is the program it spawns. A directory missing
   * either is not a runtime, and finding that out at a consumer's first command instead of here
   * is the whole failure this refusal exists to prevent.
   */
  async function readRuntime(dir) {
    const base = resolve(dir)
    const info = await stat(base).catch(() => null)
    if (info === null || !info.isDirectory()) {
      fail(`--runtime ${base} is not a directory. Build one with scripts/build-plugin-runtime.mjs.`)
    }
    // `lstat`, not `stat`: `stat` follows a link and would report a symlinked `dist/cli.js` as a
    // present regular file, while the walk below carries real bytes only. The two have to agree
    // about what a file is, or the refusal passes a runtime the copy then drops.
    for (const required of ['package.json', 'dist/cli.js']) {
      const present = await lstat(join(base, ...required.split('/'))).catch(() => null)
      if (present === null || !present.isFile()) {
        fail(
          `--runtime ${base} carries no ${required}, so a root built from it would bundle a runtime ` +
            'the locator cannot run. Build one with scripts/build-plugin-runtime.mjs.',
        )
      }
    }
    const files = new Map()
    for (const relPath of await walkRegularFiles(base, '')) {
      files.set(relPath, await readFile(join(base, relPath)))
    }
    return files
  }

  const runtimeFiles = await readRuntime(runtimeDir)
  const locatorBytes = await readFile(join(ROOT, 'scripts', 'plugins', LOCATOR_NAME))

  // ── The corpus ───────────────────────────────────────────────────

  /**
   * Render every selected root into `Map<client, Map<relativePath, Buffer>>`.
   *
   * Everything is rendered before anything is written, which is what makes a refusal — an
   * unresolved token, a corpus collision, a row with no declared home, a capability file that
   * fails its own validator — leave the output directory exactly as it was.
   *
   * Every refusal inside this function THROWS rather than calling `fail()`. Both print one line
   * and exit 1, but `process.exit` runs no `finally`: a refusal raised between the staging call
   * and the `finally` below would leave the substituted corpus and the plan root on disk with
   * nothing left able to remove them, one pair per refused build. The `.catch(fail)` at the call
   * site prints the message after the unwinding has disposed both.
   */
  async function renderRoots() {
    let staged
    try {
      staged = await stageSubstitutedCorpus({
        contentRoot: join(ROOT, 'content'),
        forkRoot: join(ROOT, 'fork'),
        tokens,
      })
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }

    const planRoot = await mkdtemp(join(tmpdir(), 'stamity-plugin-plan-'))
    try {
      const contentRoot = { root: staged.root, forkRoot: staged.forkRoot }
      const index = await buildContentIndex(contentRoot)
      if (index.collisions.length > 0) {
        // Before any write, by construction: a contested identity means two bodies claim one
        // artifact, and publishing whichever the walk saw first would ship a coin toss.
        throw new Error(
          `Corpus collisions refuse a plugin build:\n${index.collisions
            .map((row) => `  - ${row.key} (${row.kind}): ${row.paths.join(', ')}`)
            .toSorted()
            .join('\n')}\nResolve the contested identities and re-run.`,
        )
      }
      const selection = resolveSelection(index, {})

      const rendered = new Map()
      for (const client of selectedClients) {
        const container = CLIENT_CONTAINERS[client]
        const rootVar = container.ROOT_VARIABLE
        const clientPlanRoot = join(planRoot, client)
        const manifest = {
          version: MANIFEST_VERSION,
          generatedBy: releaseVersion,
          // Pinned, not sampled: two builds of one commit must produce one byte sequence, and a
          // clock reading is the one input that would guarantee they do not.
          createdAt: '1970-01-01T00:00:00.000Z',
          updatedAt: '1970-01-01T00:00:00.000Z',
          tools: [client],
          ruleDelivery: 'on-demand',
          selection,
          ledger: [],
        }
        // Sequential on purpose: each client's plan is a whole corpus pass, and a refusal should
        // name the first client that hit it rather than whichever of four raced to reject.
        const plan = await composeEmissionPlanner({ [client]: ADAPTER_REGISTRY[client] }).planWithWarnings({
          rootDir: clientPlanRoot,
          manifest,
          engineVersion: releaseVersion,
          facts: { monorepoPackages: [], hookScriptsRoot: `\${${rootVar}}/${HOOKS_DIR}` },
          contentRoot,
        })
        for (const warning of plan.warnings) console.error(`${client}: ${warning}`)

        const files = new Map()
        const placements = []
        const add = (relPath, bytes) => {
          if (files.has(relPath)) {
            throw new Error(
              `${client}: two rows both claim ${relPath} inside the plugin root. One path is one ` +
                'file, so a second claimant would silently overwrite the first.',
            )
          }
          files.set(relPath, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8'))
        }

        for (const row of plan.outputs) {
          // `placeRow`'s refusal — a row no container table names — travels as a throw, so the
          // `finally` below disposes the staged corpus and the plan root on the way out.
          const placement = placeRow(client, row)
          if (placement === null) continue
          placements.push(placement)
          add(placement.path, placement.content ?? row.content)
        }

        if (container.SETUP_COMMAND_PATH !== null) {
          const setupPath = container.SETUP_COMMAND_PATH
          placements.push({ path: setupPath, class: 'command' })
          add(setupPath, renderSetupCommand(client, rootVar, container.SETUP_COMMAND_FRONTMATTER ?? {}))
        }

        for (const asset of container.ASSETS) {
          const from = join(ROOT, ...asset.from.split('/'))
          const present = await stat(from).catch(() => null)
          if (present === null || !present.isFile()) {
            throw new Error(
              `The brand asset ${asset.from} is not in the tree, so ${container.MANIFEST_PATH} would ` +
                'declare a logo nothing resolves. Cursor turns a relative logo path into a raw ' +
                'content URL at the published repository and commit, so an asset that is missing — ' +
                'or present but uncommitted — is a 404 on the listing rather than a broken local ' +
                'path. Commit the file at that path, or remove the field from the Cursor manifest.',
            )
          }
          add(asset.to, await readFile(from))
        }

        const agentPaths = placements.filter((placement) => placement.class === 'agent').map((placement) => placement.path)
        add(container.MANIFEST_PATH, jsonDocument(container.buildManifest({ identity, version: releaseVersion, agentPaths })))

        const capability = buildCapabilityFile({
          client,
          version: releaseVersion,
          sourceCommit,
          invocation: container.INVOCATION,
          clientFloor: container.CLIENT_FLOOR,
          prerequisites: { node: nodeFloor, git: 'optional', ...container.PREREQUISITES },
          classes: buildClasses(client, placements, PLUGIN_CLASSES),
          runtime: { companion: { package: packageName, compatible: `^${releaseVersion}` } },
          distribution: container.DISTRIBUTION,
        })
        const defects = validateCapabilityFile(capability)
        if (defects.length > 0) {
          throw new Error(
            `${client}: the capability file this build produced is not valid:\n${defects
              .map((defect) => `  - ${defect}`)
              .join('\n')}`,
          )
        }
        add('stamity-plugin.json', jsonDocument(capability))

        add(
          'README.md',
          container.renderReadme({
            identity,
            version: releaseVersion,
            sourceCommit,
            sourceCommitDate,
            slug,
          }),
        )

        for (const [relPath, bytes] of runtimeFiles) add(`${RUNTIME_DIR}/${relPath}`, bytes)
        // Set rather than added: the locator is this repository's file and wins over anything of
        // the same name a bundled runtime happened to carry.
        files.set(`${RUNTIME_DIR}/${LOCATOR_NAME}`, locatorBytes)

        rendered.set(
          client,
          new Map([...files].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
        )
      }
      return rendered
    } finally {
      await staged.dispose()
      await rm(planRoot, { recursive: true, force: true })
    }
  }

  // An engine refusal already carries an operator-readable message — a corpus with no charter, an
  // unsafe content path — and a stack trace printed over it buries the one line worth reading.
  const rendered = await renderRoots().catch((err) => {
    fail(err instanceof Error ? err.message : String(err))
  })

  // ── Write / check ────────────────────────────────────────────────

  const base = resolve(outDir)

  /** Every file currently under one client's root, as root-relative POSIX paths. */
  async function existingTree(client) {
    try {
      return await walkRegularFiles(join(base, client), '')
    } catch (err) {
      if (err.code === 'ENOENT') return []
      // The walk's own refusal already reads as one operator-facing line, and this call sits at
      // module top level where a rejection would print a stack over it instead.
      fail(err instanceof Error ? err.message : String(err))
      return []
    }
  }

  if (check) {
    const drift = []
    for (const [client, files] of rendered) {
      const compared = await Promise.all(
        [...files].map(async ([relPath, bytes]) => {
          try {
            const committed = await readFile(join(base, client, ...relPath.split('/')))
            return committed.equals(bytes) ? null : `${client}/${relPath}: ${firstDifference(bytes, committed)}`
          } catch (err) {
            return `${client}/${relPath}: not readable (${err.code ?? err.message})`
          }
        }),
      )
      drift.push(...compared.filter((line) => line !== null))
      // Drift of the other sign: a file the corpus no longer projects is one regeneration would
      // never rewrite, so no byte comparison over the rendered set could ever read it.
      for (const relPath of await existingTree(client)) {
        if (!files.has(relPath)) drift.push(`${client}/${relPath}: not a file this corpus projects`)
      }
    }
    if (drift.length > 0) {
      fail(`Plugin roots out of sync:\n${drift.toSorted().map((line) => `  - ${line}`).join('\n')}\nRegenerate: ${REGENERATE}`)
    }
    const total = [...rendered.values()].reduce((sum, files) => sum + files.size, 0)
    console.log(
      `Verified ${String(rendered.size)} plugin root(s) at ${identity.name}@${releaseVersion} — ` +
        `${String(total)} file(s).`,
    )
  } else {
    let written = 0
    for (const [client, files] of rendered) {
      const root = join(base, client)
      const stale = (await existingTree(client)).filter((relPath) => !files.has(relPath))
      try {
        // Stale files go FIRST, so a rename lands as one file rather than as the new one beside
        // the old; the directory sweep runs last, because a directory is empty only once every
        // file that was in it has gone and every file that belongs there has landed.
        await Promise.all(stale.map((relPath) => rm(join(root, ...relPath.split('/')))))
        await Promise.all(
          [...files].map(([relPath, bytes]) => atomicWriteFile(join(root, ...relPath.split('/')), bytes)),
        )
        await pruneEmptyDirectories(root, client)
      } catch (err) {
        // An EngineError already carries an operator-readable message; a stack would bury it.
        fail(err instanceof Error ? err.message : String(err))
      }
      for (const relPath of stale) console.log(`Removed ${join(root, relPath)}`)
      written += files.size
    }
    console.log(`Wrote ${String(written)} file(s) across ${String(rendered.size)} root(s) under ${base}`)
  }
}
