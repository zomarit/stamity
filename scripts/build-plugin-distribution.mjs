#!/usr/bin/env node
// Build the DISTRIBUTION ROOT: the one tree a release publishes, and the only thing a
// consuming organization has to mirror.
//
// What lands in `--out`, and why each piece is in the same tree rather than four:
//
//   <out>/<client>/                 the four plugin roots, built by
//                                   `generate-plugin-packages.mjs` from this corpus.
//   <out>/apm.yml, <out>/.apm/      the same corpus as an APM package, built by
//                                   `generate-apm-package.mjs --out-dir <out>`. An
//                                   organization mirrors ONE tree per version and points both
//                                   its APM engine (`apm install <owner>/<repo>#plugins/v<v>`,
//                                   which Renovate's native `apm` manager bumps) and its four
//                                   plugin catalogs at the same tag. Two trees would be two
//                                   things to keep in step; this is one.
//   <out>/.claude-plugin/…          the four marketplace catalogs, each in its vendor's shape
//   <out>/.cursor-plugin/…          and each carrying the source its configuration names.
//   <out>/.github/plugin/…          `scripts/plugins/catalogs.mjs` holds every schema fact.
//   <out>/.agents/plugins/…
//   <out>/stamity-plugin-<client>-<version>.zip   one archive per root, deterministic.
//   <out>/…zip.sha256               `<hex>  <name>`, the line `sha256sum -c` reads.
//   <out>/release.json              the machine-readable manifest, validated before it is
//                                   written (`scripts/plugins/releaseManifest.mjs`).
//   <out>/README.md                 install, pin, update and rollback per client, the APM
//                                   install spec, and the two bounds a mirror has to know.
//
// PROVENANCE IS AN INPUT, NEVER A CLOCK READ. `--source-commit` and `--source-commit-date`
// default to this checkout's HEAD, and everything downstream — the roots' capability files, the
// archives' entry timestamps, `release.json` — is stamped from those two values alone. That is
// what makes two builds of one commit produce identical bytes, which is the property the
// release's digest check and its attestations rest on.
//
// `--distribution-commit` is the one fact this build cannot know: the commit the tree lands on
// once it is pushed to the distribution branch. Absent, `release.json` carries
// `distribution.commit: null` — explicitly "not yet known" rather than a missing key — and the
// catalogs pin by TAG. Given, the manifest carries it and each git-backed catalog entry gains a
// `sha` beside its `ref`, which is how the release job re-renders the copy it attaches as an
// asset (see REQ-PLUGIN-012).
//
// Exit codes: 0 the distribution was built, 1 a step failed (and `--out` is removed with whatever
//            that step had already written), 2 bad arguments.
// Usage: node scripts/build-plugin-distribution.mjs --out <dir> --runtime <dir>
//        [--source-commit <sha>] [--source-commit-date <iso>] [--distribution-commit <sha>]
//        [--version <semver>] [--client <csv>]

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DISTRIBUTION_CLIENTS, resolveDistributionIdentity } from './distribution-identity.mjs'
import { isMain } from './native-typescript.mjs'
import { buildCatalogIdentity, CATALOG_PATHS, releaseTag, renderCatalog } from './plugins/catalogs.mjs'
import { buildReleaseManifest, validateReleaseManifest } from './plugins/releaseManifest.mjs'
import { PLUGIN_VERSION } from './plugins/version.mjs'
import { buildZip } from './plugins/zip.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const USAGE =
  'Usage: node scripts/build-plugin-distribution.mjs --out <dir> --runtime <dir> ' +
  '[--source-commit <sha>] [--source-commit-date <iso>] [--distribution-commit <sha>] ' +
  '[--version <semver>] [--client <csv>]'

const COMMIT_SHA = /^[0-9a-f]{40}$/

/** The release manifest's own file name, and the two APM locations it points at. */
const RELEASE_MANIFEST = 'release.json'
const APM_MANIFEST = 'apm.yml'
const APM_PRIMITIVES = '.apm'

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  return 2
}

/** 2-space JSON with a trailing newline: the shape every generated document in this tree takes. */
function jsonDocument(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseArguments(argv) {
  let out = null
  let runtime = null
  let sourceCommit = null
  let sourceCommitDate = null
  let distributionCommit = null
  let version = null
  let clients = null

  /** Every flag this CLI takes carries exactly one value; none is a bare switch. */
  const sinks = {
    '--out': (value) => {
      out = value
    },
    '--runtime': (value) => {
      runtime = value
    },
    '--source-commit': (value) => {
      sourceCommit = value
    },
    '--source-commit-date': (value) => {
      sourceCommitDate = value
    },
    '--distribution-commit': (value) => {
      distributionCommit = value
    },
    '--version': (value) => {
      version = value
    },
    '--client': (value) => {
      clients = value
    },
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const sink = Object.hasOwn(sinks, arg) ? sinks[arg] : null
    if (sink === null) return { code: usage(`Unknown argument: ${arg}`) }
    i += 1
    if (i >= argv.length) return { code: usage(`${arg} needs a value.`) }
    sink(argv[i])
  }

  if (out === null) return { code: usage('--out is required.') }
  if (runtime === null) {
    return { code: usage('--runtime is required: every plugin root bundles the runtime that runs its setup.') }
  }
  if (sourceCommit !== null && !COMMIT_SHA.test(sourceCommit)) {
    return { code: usage('--source-commit must be a 40-character lowercase hex commit sha.') }
  }
  if (sourceCommitDate !== null && Number.isNaN(Date.parse(sourceCommitDate))) {
    return { code: usage('--source-commit-date must be an ISO 8601 timestamp.') }
  }
  if (distributionCommit !== null && !COMMIT_SHA.test(distributionCommit)) {
    return { code: usage('--distribution-commit must be a 40-character lowercase hex commit sha.') }
  }
  // The generator's own pattern, so a value this script admits is one the generator admits: the
  // builder used to accept `+build` and forward it, and the refusal came back from the child with
  // the child's usage text and exit 1 (M-4).
  if (version !== null && !PLUGIN_VERSION.test(version)) {
    return { code: usage('--version must be a semantic version with no build metadata, for example 1.9.0.') }
  }

  const selected =
    clients === null
      ? [...DISTRIBUTION_CLIENTS]
      : clients
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '')
  if (selected.length === 0) return { code: usage('--client needs at least one client.') }
  for (const client of selected) {
    if (!DISTRIBUTION_CLIENTS.includes(client)) {
      return { code: usage(`--client ${client} is not one of ${DISTRIBUTION_CLIENTS.join(', ')}.`) }
    }
  }

  const outDir = resolve(out)
  const runtimeDir = resolve(runtime)
  if (!existsSync(runtimeDir) || !statSync(runtimeDir).isDirectory()) {
    return { code: usage(`--runtime ${runtimeDir} is not a directory. Build one with scripts/build-plugin-runtime.mjs.`) }
  }
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    // A distribution root is published whole. Building into a directory that already holds
    // something would mix two releases' archives and leave the older one's catalogs in place,
    // and no consumer reading the tree could tell which release it had.
    return { code: usage(`--out ${outDir} already holds files; give an empty or nonexistent directory.`) }
  }

  return {
    outDir,
    runtimeDir,
    sourceCommit,
    sourceCommitDate,
    distributionCommit,
    version,
    clients: DISTRIBUTION_CLIENTS.filter((client) => selected.includes(client)),
  }
}

/** A git fact of this checkout, or `null` when this is not one (a fixture, an unpacked tarball). */
function gitFact(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (result.status !== 0 || typeof result.stdout !== 'string') return null
  const value = result.stdout.trim()
  return value === '' ? null : value
}

/** Run one sibling generator with this interpreter, and fail loudly with its own output. */
function runGenerator(script, args) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error !== undefined && result.error !== null) throw result.error
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(
      `${script} exited ${String(result.status ?? 'on a signal')}${output === '' ? '' : `:\n${output}`}`,
    )
  }
  return result.stdout ?? ''
}

/** Every regular file under `dir`, as POSIX-relative paths, sorted. */
function treeFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel)
      return entry.isFile() ? [rel] : []
    })
}

function writeDocument(path, contents) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

/**
 * The per-client install, pin, update and rollback routes, quoted from the vendor pages the
 * B2 spikes read on 2026-09-20 and kept in the same words as each root's own README. A command
 * a vendor does not document is named as absent rather than invented: Cursor has no documented
 * plugin install, update or rollback subcommand at all, so its section is the dashboard route
 * and the mirror branch, which is what an operator actually does there.
 */
function clientRoutes(slug, tag, branch) {
  return {
    claude: {
      title: 'Claude Code',
      install: [`claude plugin marketplace add ${slug}#${branch}`, 'claude plugin install stamity@stamity --scope project'],
      pin: [`claude plugin marketplace add ${slug}#${tag}`],
      update: ['claude plugin update stamity'],
      rollback: [`claude plugin marketplace add ${slug}#plugins/v<previous>`, 'claude plugin install stamity@stamity --scope project'],
      note:
        'A `rollback` subcommand appears in slash form on one vendor page and is absent from the CLI ' +
        'reference, so this page does not promise it: re-adding the marketplace at the previous tag ' +
        'and reinstalling is the route that is documented on both.',
    },
    cursor: {
      title: 'Cursor',
      install: [
        '# Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace, pointed at your',
        '# mirror of this tree. For a local trial of this root with no marketplace at all:',
        'agent --plugin-dir ./cursor',
      ],
      pin: [`git push <mirror> ${tag}^{commit}:refs/heads/${branch}`],
      update: ['# the re-index runs at most once every 10 minutes, batching rapid pushes'],
      rollback: [`git push --force <mirror> plugins/v<previous>^{commit}:refs/heads/${branch}`],
      note:
        'Cursor documents no plugin install, update, rollback or uninstall subcommand. A team ' +
        'marketplace is added through Dashboard → Plugins & MCPs → Team Marketplaces → Add ' +
        'Marketplace, and it tracks a repository branch — so the version an organization serves is ' +
        'whichever commit its mirror branch points at, and pinning and rolling back are branch moves. ' +
        'The command above is the local trial of this root without a marketplace.',
    },
    copilot: {
      title: 'GitHub Copilot CLI',
      install: [
        'npm install -g @github/copilot',
        `copilot plugin marketplace add ${slug}#${branch}`,
        'copilot plugin install stamity@stamity',
      ],
      pin: [`copilot plugin marketplace add ${slug}#${tag}`],
      update: ['copilot plugin update stamity'],
      rollback: ['copilot plugin uninstall stamity', `copilot plugin marketplace add ${slug}#plugins/v<previous>`, 'copilot plugin install stamity@stamity'],
      note:
        'Installed plugins are cached: a local plugin has to be reinstalled to pick up a change, and ' +
        '`COPILOT_AUTO_UPDATE=false` turns off the CLI\'s own updates.',
    },
    codex: {
      title: 'Codex',
      install: [`codex plugin marketplace add ${slug} --ref ${branch}`, 'codex plugin add stamity@stamity'],
      pin: [`codex plugin marketplace add ${slug} --ref ${tag}`],
      update: ['codex plugin marketplace upgrade'],
      rollback: ['codex plugin remove stamity', `codex plugin marketplace add ${slug} --ref plugins/v<previous>`],
      note:
        'An entry in a marketplace file installs nothing on its own — the two commands above are both ' +
        'needed. Plugin hooks additionally need `features.hooks = true`, project trust, and a per-hook ' +
        'trust review before any of them runs.',
    },
  }
}

/** One shell block, the shape every route below is printed as. */
function block(lines) {
  return ['```sh', ...lines, '```'].join('\n')
}

/** `<out>/README.md` — what a person who just mirrored this tree needs to read. */
function renderReadme({ identity, version, sourceCommit, sourceCommitDate, tag, clients, packages }) {
  const routes = clientRoutes(identity.slug, tag, identity.distribution.branch)
  const sections = clients.map((client) => {
    const route = routes[client]
    return [
      `## ${route.title}`,
      '',
      `Root: \`${client}/\` · archive: \`${packages[client].archive}\` (\`${packages[client].archive}.sha256\`) · catalog: \`${CATALOG_PATHS[client]}\``,
      '',
      '### Install',
      '',
      block(route.install),
      '',
      '### Pin',
      '',
      block(route.pin),
      '',
      '### Update',
      '',
      block(route.update),
      '',
      '### Roll back',
      '',
      block(route.rollback),
      '',
      route.note,
    ].join('\n')
  })

  return `# stamity ${version} — plugin distribution

Built from ${identity.repository} at commit ${sourceCommit} (${sourceCommitDate}).

This tree is FOUR things at once, and they describe one corpus at one version:

- four plugin roots, \`${clients.join('/`, `')}/\`, one per client;
- a complete APM package — \`${APM_MANIFEST}\` plus \`${APM_PRIMITIVES}/\` at this root;
- four marketplace catalogs, one per client, each in its own vendor's shape;
- one archive plus one \`.sha256\` per root, and \`${RELEASE_MANIFEST}\` describing all of it.

Verify before you install anything:

\`\`\`sh
sha256sum -c stamity-plugin-<client>-${version}.zip.sha256
\`\`\`

## APM

\`\`\`sh
apm install ${identity.slug}#${tag}
\`\`\`

The install spec is also in \`${RELEASE_MANIFEST}\` as \`apm.installSpec\`. Renovate's native \`apm\`
manager bumps it, and \`renovate/plugins.json\` in the source repository bumps the \`ref\` field of
the catalogs below through its regex manager.

${sections.join('\n\n')}

## Two bounds a mirror has to know

1. **\`git-subdir\` sources are https-only.** \`scripts/distribution-identity.mjs\` calls the kind
   host-neutral and it is — any host, not any protocol. An \`ssh://\` or \`git@\` remote is refused
   when the configuration is resolved, so a mirror has to expose an https URL (a read token in
   the URL is refused too: authentication belongs to the fetching client, never to a published
   catalog).
2. **A tag is the only pin a catalog carries by itself.** The catalogs here name \`${tag}\`, and
   \`${RELEASE_MANIFEST}\`'s \`distribution.commit\` is \`null\` until the tree is pushed, after which the
   release's own copy of the manifest carries the commit and each git-backed catalog entry gains
   a \`sha\` beside its \`ref\`.

## The private mirror route

An organization that cannot fetch from the public repository mirrors this tree instead of
re-deriving it:

\`\`\`sh
git init dist && cd dist && git switch --orphan plugin-dist
cp -R <this tree>/. . && git add -A && git commit -m 'plugins: v${version}'
git tag ${tag}
git push <your remote> plugin-dist ${tag}
\`\`\`

Then point \`stamity.distribution.sources.<client>\` in your fork's \`package.json\` at that remote
and rebuild the catalogs: every \`source\` object above is projected from that block, so nothing
else in the tree changes. \`docs/enterprise-forks.md\` in the source repository carries the fork
layer this assumes.
`
}

/**
 * Arguments first, then the build — and a failed build takes its own partial tree with it.
 *
 * `parseArguments` has already refused an `--out` that holds anything, so every file under it is
 * this run's: removing the directory cannot destroy a previous release, and leaving it would make
 * the RETRY impossible, because that same emptiness check would refuse the second attempt with
 * "already holds files" while the operator looks at a tree no step of this build finished. The
 * directory is removed rather than emptied; "empty or absent" is one state to a caller.
 */
function main(argv) {
  const parsed = parseArguments(argv)
  if (parsed.code !== undefined) return parsed.code
  try {
    return build(parsed)
  } catch (error) {
    rmSync(parsed.outDir, { recursive: true, force: true })
    throw error
  }
}

function build(parsed) {
  const { outDir, runtimeDir, distributionCommit, clients } = parsed

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const identity = buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg))
  const version = parsed.version ?? pkg.version

  // Provenance is resolved HERE and forwarded, rather than left to each generator's own git
  // read: the roots, the archives' timestamps and the manifest must all name one commit, and a
  // second reader of HEAD is a second chance to disagree.
  const sourceCommit = parsed.sourceCommit ?? gitFact(['rev-parse', 'HEAD'])
  const sourceCommitDate = parsed.sourceCommitDate ?? gitFact(['show', '-s', '--format=%cI', 'HEAD'])
  if (sourceCommit === null || !COMMIT_SHA.test(sourceCommit)) {
    throw new Error(
      'The source commit could not be read from this checkout, and every archive and manifest here ' +
        'names it. Pass --source-commit <40-hex-sha>.',
    )
  }
  if (sourceCommitDate === null || Number.isNaN(Date.parse(sourceCommitDate))) {
    throw new Error(
      'The source commit date could not be read from this checkout, and it is the timestamp every ' +
        'archive entry carries. Pass --source-commit-date <ISO 8601 timestamp>.',
    )
  }

  const runtimeManifestPath = join(runtimeDir, 'RUNTIME.json')
  if (!existsSync(runtimeManifestPath)) {
    throw new Error(
      `--runtime ${runtimeDir} carries no RUNTIME.json, so release.json could not state which runtime ` +
        'these roots bundle. Build one with scripts/build-plugin-runtime.mjs.',
    )
  }
  const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'))

  mkdirSync(outDir, { recursive: true })

  // ── the roots, and the APM package they sit beside ───────────────
  console.log(`build-plugin-distribution: building ${String(clients.length)} root(s) in ${outDir}`)
  runGenerator('generate-plugin-packages.mjs', [
    '--out-dir',
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
  ])
  runGenerator('generate-apm-package.mjs', ['--out-dir', outDir])

  // ── one archive per root ─────────────────────────────────────────
  const tag = releaseTag(identity, version)
  const mtime = new Date(sourceCommitDate)
  const packages = {}
  for (const client of clients) {
    const rootDir = join(outDir, client)
    const entries = treeFiles(rootDir).map((relPath) => ({
      // Entries are stored under the client directory, so an extraction reproduces the root by
      // name rather than spilling its files into the reader's working directory.
      path: `${client}/${relPath}`,
      bytes: readFileSync(join(rootDir, relPath)),
    }))
    if (entries.length === 0) throw new Error(`${client}: the generated root is empty; nothing to archive.`)
    const archive = `stamity-plugin-${client}-${version}.zip`
    const bytes = buildZip(entries, { mtime })
    writeFileSync(join(outDir, archive), bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    // The two-space separator is not cosmetic: it is what `sha256sum -c` parses as a binary-mode
    // line, and a single space makes the file unreadable to it.
    writeFileSync(join(outDir, `${archive}.sha256`), `${sha256}  ${archive}\n`)

    const capability = JSON.parse(readFileSync(join(rootDir, 'stamity-plugin.json'), 'utf8'))
    packages[client] = {
      client,
      path: client,
      archive,
      sha256,
      bytes: bytes.length,
      clientFloor: capability.clientFloor.version,
    }
    console.log(`build-plugin-distribution: ${archive} — ${String(entries.length)} file(s), ${String(bytes.length)} byte(s)`)
  }

  // ── the catalogs ─────────────────────────────────────────────────
  // Rendered AFTER the archives, because an `archive` source names the digest of the file that
  // was just written; a catalog rendered first could only have guessed it.
  const catalogs = {}
  for (const client of clients) {
    const catalog = renderCatalog(client, identity, version, sourceCommit, {
      distributionCommit: distributionCommit ?? undefined,
      archives: packages,
    })
    writeDocument(join(outDir, ...CATALOG_PATHS[client].split('/')), jsonDocument(catalog))
    catalogs[client] = CATALOG_PATHS[client]
  }

  // ── the manifest ─────────────────────────────────────────────────
  const manifest = buildReleaseManifest({
    version,
    sourceCommit,
    sourceCommitDate,
    distribution: { branch: identity.distribution.branch, tag, commit: distributionCommit },
    runtime: {
      package: runtimeManifest.package,
      version: runtimeManifest.version,
      nodeFloor: runtimeManifest.nodeFloor,
      tarballSha256: runtimeManifest.tarballSha256,
    },
    packages: clients.map((client) => packages[client]),
    catalogs,
    apm: { manifest: APM_MANIFEST, primitives: APM_PRIMITIVES, installSpec: `${identity.slug}#${tag}` },
  })
  const defects = validateReleaseManifest(manifest)
  if (defects.length > 0) {
    // Refused before the write: a published manifest that fails its own schema is worse than a
    // failed build, because a consumer reads it as authoritative.
    throw new Error(
      `release.json would not validate against its own schema:\n${defects.map((defect) => `  - ${defect}`).join('\n')}`,
    )
  }
  writeFileSync(join(outDir, RELEASE_MANIFEST), jsonDocument(manifest))

  writeFileSync(
    join(outDir, 'README.md'),
    renderReadme({ identity, version, sourceCommit, sourceCommitDate, tag, clients, packages }),
  )

  console.log(
    `build-plugin-distribution: PASS - ${identity.name}@${version} at ${tag}, ` +
      `${String(clients.length)} root(s), APM package and ${String(clients.length)} catalog(s) in ${outDir}`,
  )
  return 0
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`build-plugin-distribution: FAIL - ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
