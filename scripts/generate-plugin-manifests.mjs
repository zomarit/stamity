#!/usr/bin/env node
// Rewrite every plugin/marketplace manifest this repository publishes, from
// package.json and the content catalog.
//
// Usage: node scripts/generate-plugin-manifests.mjs [--check] [--out-dir <dir>]
//        --check    compare the rendered bytes against the committed files and
//                   exit 1 with a drift summary instead of writing anything.
//        --out-dir  redirect every read-back and every write under that
//                   directory, keeping the repo-relative layout; tests use it to
//                   prove determinism and to seed drift without touching the
//                   committed manifests.
//
// WHAT THIS CLOSES. A plugin surface is a second copy of facts package.json
// already holds — name, version, description, keywords, license, repository —
// and a third copy of where the corpus lives. Hand-maintained, they drift
// silently and in the direction that matters least to whoever edits them: the
// predecessor project shipped a `.claude-plugin/plugin.json` at version 2.8.6
// beside a `marketplace.json` at 2.6.0, and a marketplace entry advertising
// "53 skills" beside a plugin manifest advertising 55. Nothing failed. Every
// byte below is projected from package.json or from the catalog walk, and CI
// re-renders and byte-diffs them, so the drift class ends rather than being
// watched for.
//
// FOUR SURFACES, THREE SCHEMAS. Each is emitted only where a PRIMARY source
// documents the field; nothing here is inferred from another vendor's shape.
//
//   .claude-plugin/plugin.json      Claude Code plugin manifest.
//     Schema: https://code.claude.com/docs/en/plugins-reference (accessed
//     2026-08-26) and https://www.schemastore.org/claude-code-plugin-manifest.json
//     (accessed 2026-08-26, $id json.schemastore.org/...). `name` is the only
//     required field; component paths must start with `./` and are relative to
//     the plugin root, which for a git-source install is this checkout.
//
//   AGENTS ARE FILES, NOT A DIRECTORY. The three component fields are not
//     interchangeable and the sources are explicit about it: `skills` is
//     "skill directories containing <name>/SKILL.md", `commands` is "flat .md
//     skill files OR directories", and `agents` is "custom agent files"
//     (plugins-reference) / "custom paths to agent files" (plugin-marketplaces),
//     whose every documented example is a `.md` path. The schemastore schema
//     this manifest names in its own `$schema` settles it: an `agents` string —
//     alone or inside the array — must match BOTH `^\./.*` and `.*\.md$`, so a
//     directory value makes the file fail the schema it declares. Both Claude
//     surfaces therefore carry the agent FILE LIST, projected from the catalog
//     walk so it cannot drift from the corpus. Cursor keeps the directory form,
//     which its own reference documents ("paths to agent files/directories").
//
//   .claude-plugin/marketplace.json Claude Code marketplace manifest.
//     Schema: https://code.claude.com/docs/en/plugin-marketplaces (accessed
//     2026-08-26). Required: `name`, `owner`, `plugins[]`; each entry requires
//     `name` and `source`. NO `$schema` is emitted: the sibling schemastore URL
//     the predecessor used for the marketplace file
//     (https://json.schemastore.org/claude-code-plugin-marketplace.json)
//     returns 404 (checked 2026-08-26), and a `$schema` pointing at nothing is
//     a validation claim that cannot be honoured.
//
//   .cursor-plugin/plugin.json      Cursor plugin manifest.
//     Schema: https://cursor.com/docs/reference/plugins (accessed 2026-08-26).
//     `name` required; `rules`, `agents`, `skills`, `commands` are component
//     path fields. Cursor is the ONLY one of the three that can address rules.
//
//   plugin.json                     Agent Plugins 1.0.0 container manifest.
//     Schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json and
//     https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md
//     (both accessed 2026-08-26). Required: `$schema` (a const) and `name`;
//     `additionalProperties: false`. It sits at the REPOSITORY ROOT rather than
//     under a dotted directory because that is where the spec puts it — the
//     manifest identifies the plugin root, and the plugin root is the tree.
//
// THE ONE GAP, STATED IN FULL. Agent Plugins 1.0.0 has no component-path
// fields at all: the layout is fixed at `skills/` and `mcp.json` under the
// plugin root. This repository authors its corpus under `content/`, so a
// conforming client reading the root manifest finds identity and no
// components. The manifest therefore carries the corpus location in
// `extensions`, the spec's own reverse-domain escape hatch, keyed to the
// repository's GitHub namespace — legible to a reader, ignored by a generic
// client, and NOT a claim that any client resolves it. Closing the gap for
// real means staging a portable `skills/` tree at the root, which is a
// packaging decision this generator does not get to make.
//
// TWO SMALLER GAPS. Neither Claude surface can address rules (no `rules` field
// in either schema), so the corpus's rules reach Claude Code through `init` and
// `sync`, not through the plugin. And `content/charter/` is not a plugin
// component class anywhere, so the charter is absent from all four manifests.
//
// TWO TREES, TWO COMPONENT PATHS. The git checkout keeps the corpus at
// `content/`; the published npm tarball keeps it at `dist/content/`, because
// `package.json`'s `files` allowlist ships `dist` alone. The marketplace entry
// resolves an npm source against the PACKAGE root, so its component paths carry
// the `dist/` prefix while the two checkout-rooted manifests do not. That is
// one fact about two trees, not a contradiction; `scripts/tarball-smoke.mjs` is
// what proves the tarball half, and test/ci/pluginManifests.test.ts pins the
// relationship between the two.
//
// The catalog reader is TypeScript and there is no build step here on purpose —
// a generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward; on the
// repo's declared floor (22.12) the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the flag
// rather than asking a maintainer to remember it. The re-exec must happen
// before the reader is loaded, which is why the imports below are dynamic.
//
// Exit codes: 0 ok, 1 render/write failure or drift under --check, 2 bad arguments.

import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const USAGE = 'Usage: node scripts/generate-plugin-manifests.mjs [--check] [--out-dir <dir>]'

if (!process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with
  // the flag on would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${process.version}) cannot strip TypeScript types, so the content ` +
        'catalog cannot be loaded. Run the generator on Node >=22.12.',
    )
    process.exit(1)
  }
  const child = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      SELF,
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
  // A signalled child has no status; 1 is the honest "did not complete".
  process.exit(child.status ?? 1)
}

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
let check = false
let outDir = null
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--check') {
    check = true
  } else if (arg === '--out-dir') {
    i += 1
    if (i >= args.length) usage('--out-dir needs a path.')
    outDir = args[i]
  } else {
    usage(`Unknown argument: ${arg}`)
  }
}

// ── Pinned publisher facts ───────────────────────────────────────
//
// The display name, pinned rather than read. package.json's `author` now holds
// the same name, and that is precisely why this constant is not derived from
// it: `author` is a free-text npm field, so reading it would let one edit there
// silently rename the publisher on all four plugin surfaces at once. Pinned
// here, the name is cross-checked against the repository owner slug below, so a
// repository move — or a drifted pin — fails the run instead of shipping a
// publisher nobody chose.

const PUBLISHER = 'Zomarit'

/** Reverse-domain namespace for the Agent Plugins `extensions` key. */
const EXTENSION_HOST = 'com.github'

// ── package.json projection ──────────────────────────────────────

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

function requirePkg(field, value, predicate) {
  if (!predicate(value)) {
    fail(
      `package.json declares no usable \`${field}\`, so every plugin surface would carry an ` +
        'empty or absent value for it. Fix package.json and re-run.',
    )
  }
  return value
}

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

const packageName = requirePkg('name', pkg.name, nonEmptyString)
const version = requirePkg('version', pkg.version, nonEmptyString)
const description = requirePkg('description', pkg.description, nonEmptyString)
const license = requirePkg('license', pkg.license, nonEmptyString)
const keywords = requirePkg(
  'keywords',
  pkg.keywords,
  (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmptyString),
)
const repositoryUrl = requirePkg('repository.url', pkg.repository?.url, nonEmptyString)
const homepageUrl = requirePkg('homepage', pkg.homepage, nonEmptyString)

/** `git+https://github.com/owner/repo.git` -> `https://github.com/owner/repo`. */
const repository = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '')

const ownerMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(repository)
if (ownerMatch === null) {
  fail(
    `package.json \`repository.url\` normalises to ${repository}, which is not a ` +
      'https://github.com/<owner>/<repo> URL. The plugin surfaces derive the homepage, the ' +
      'marketplace owner and the extension namespace from it — teach this generator the new ' +
      'host before moving the repository.',
  )
}
const [, ownerSlug] = ownerMatch

if (ownerSlug.toLowerCase() !== PUBLISHER.toLowerCase()) {
  fail(
    `The pinned publisher ${JSON.stringify(PUBLISHER)} does not match the repository owner ` +
      `${JSON.stringify(ownerSlug)} in ${repository}. One of the two moved; reconcile them here ` +
      'rather than letting the manifests name a publisher that owns nothing.',
  )
}

/** The plugin id, on every surface. All three schemas want kebab-case with no scope. */
const pluginName = packageName.replace(/^@[^/]+\//, '')

// Every schema constrains the id, and the Agent Plugins pattern is the strictest of the three
// (1-64 chars, lowercase alphanumeric with `.`/`-` inside, no `--` or `..`), so satisfying it
// satisfies Claude's and Cursor's kebab-case rules too.
const AGENT_PLUGINS_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/
if (!AGENT_PLUGINS_NAME.test(pluginName) || pluginName.length > 64) {
  fail(
    `The plugin id ${JSON.stringify(pluginName)}, derived from package.json \`name\`, does not ` +
      'satisfy the Agent Plugins 1.0.0 name pattern that all three schemas accept.',
  )
}

/**
 * The homepage every surface carries: package.json's own `homepage`, with any
 * `#fragment` removed.
 *
 * Projected rather than restated. It used to be assigned `repository`, which
 * was a second copy of a fact package.json already holds — the drift class this
 * file exists to end — and it already disagreed with it (`#readme`). The
 * fragment goes because it addresses a section of a README, which is npm's
 * convention for that field and not what a plugin surface means by a homepage;
 * the day this field is repointed at the site, all four manifests follow.
 */
const homepage = homepageUrl.replace(/#.*$/, '')
const author = { name: PUBLISHER }

// ── Corpus projection ────────────────────────────────────────────

const { buildContentIndex } = await import('../src/content/catalog.ts')
const { resolveBundledContentRoot } = await import('../src/content/contentRoot.ts')
const { CONTENT_CLASSES } = await import('../src/types/content.ts')
const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')

/** Repo-relative POSIX path, so a Windows run emits the same bytes as a POSIX one. */
function repoRelative(absPath) {
  return relative(ROOT, absPath).split(sep).join('/')
}

const contentRoot = resolveBundledContentRoot()
const contentDir = repoRelative(contentRoot)
if (contentDir === '' || contentDir.startsWith('..')) {
  fail(
    `The corpus resolved to ${contentRoot}, which is outside ${ROOT}. The manifests declare ` +
      'component paths relative to the plugin root, so a corpus outside the tree has no ' +
      'addressable path. Run the generator from a source checkout.',
  )
}

const index = await buildContentIndex()

/**
 * Class -> its directory under the corpus root, read off the paths the walk
 * actually produced rather than pluralised here. A class the walk found nothing
 * for FAILS the run: a manifest declaring `./content/skills/` when no skill
 * indexes is a path that resolves to nothing, which is exactly the claim these
 * files exist to stop making.
 */
function corpusDirectories() {
  const dirs = new Map()
  const counts = new Map()
  const files = new Map()
  for (const item of index.items) {
    // Corpus artifacts only. A pack root or an override tree can join the walk
    // in other callers; neither ships inside this plugin.
    if ((item.origin ?? 'corpus') !== 'corpus') continue
    const dir = item.relativePath.split('/')[0]
    const seen = dirs.get(item.type)
    if (seen === undefined) dirs.set(item.type, dir)
    else if (seen !== dir) {
      fail(
        `The corpus indexes ${item.type} artifacts under two directories (${seen} and ${dir}). ` +
          'A component path can only name one of them; give the class a single home.',
      )
    }
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
    const forType = files.get(item.type)
    if (forType === undefined) files.set(item.type, [item.relativePath])
    else forType.push(item.relativePath)
  }
  const missing = CONTENT_CLASSES.filter((type) => !dirs.has(type))
  if (missing.length > 0) {
    fail(
      `The corpus under ${contentRoot} indexes no ${missing.join(', ')} artifacts, so the ` +
        'plugin manifests would declare component paths that resolve to nothing. Run the ' +
        'generator from a source checkout with the corpus intact.',
    )
  }
  // Sorted here rather than trusted from the walk: key order is part of the
  // output bytes and `--check` byte-diffs them, so a directory read that comes
  // back in a different order on another filesystem must not read as drift.
  for (const paths of files.values()) paths.sort()
  return { dirs, counts, files }
}

const { dirs: classDirs, counts: classCounts, files: classFiles } = corpusDirectories()

/** `./content/skills/` — a component path rooted at the git checkout. */
function checkoutPath(contentClass) {
  return `./${contentDir}/${classDirs.get(contentClass)}/`
}

/**
 * `./dist/content/skills/` — the same class inside the published tarball.
 *
 * `package.json`'s `files` allowlist ships `dist` alone, and the build stages
 * the corpus under `dist/content` (the second candidate in
 * `src/content/contentRoot.ts`, and the layout `scripts/tarball-smoke.mjs`
 * proves on every floor-leg run). An npm marketplace source resolves component
 * paths against the package root, so this prefix is what makes the entry true
 * of the tree a user actually installs.
 */
const TARBALL_ROOT = 'dist'

function tarballPath(contentClass) {
  return `./${TARBALL_ROOT}/${contentDir}/${classDirs.get(contentClass)}/`
}

/**
 * `['./content/agents/reviewer.md', …]` — every artifact of one class, as the
 * file paths the Claude schemas require for `agents`.
 *
 * `prefix` is what separates the two trees: `''` for the checkout-rooted
 * manifest, `dist/` for the marketplace entry that resolves against the npm
 * package root. One walk feeds both, so the two lists cannot name different
 * artifacts.
 */
function checkoutFiles(contentClass, prefix = '') {
  const paths = classFiles.get(contentClass) ?? []
  return paths.map((relativePath) => `./${prefix}${contentDir}/${relativePath}`)
}

// ── Manifests ────────────────────────────────────────────────────
//
// Every object below is written in the order it is read: identity first,
// component paths last, and component paths in content-class order. Key order
// is part of the output bytes, so it is fixed here rather than left to a sort
// that a schema change could reshuffle.

/** Claude Code: agents, commands and skills. No `rules` field exists in the schema. */
const claudePlugin = {
  $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
  name: pluginName,
  version,
  description,
  author,
  homepage,
  repository,
  license,
  keywords,
  // Files, not a directory — see AGENTS ARE FILES in this file's header.
  agents: checkoutFiles('agent'),
  commands: checkoutPath('command'),
  skills: checkoutPath('skill'),
}

/**
 * The marketplace entry, on the npm source form.
 *
 * npm rather than github because npm is this package's published channel and
 * the source form the schema documents for it — the tarball is what trusted
 * publishing signs and what a user already installs. The tarball carries no
 * `.claude-plugin/plugin.json` (the `files` allowlist ships `dist` alone), so
 * this entry is the plugin's whole definition there, which is why it repeats
 * the identity fields rather than leaning on a manifest that will not be
 * present.
 */
const marketplace = {
  name: pluginName,
  owner: { name: PUBLISHER, url: `https://github.com/${ownerSlug}` },
  description,
  version,
  plugins: [
    {
      name: pluginName,
      source: { source: 'npm', package: packageName, version },
      description,
      version,
      author,
      homepage,
      repository,
      license,
      keywords,
      agents: checkoutFiles('agent', `${TARBALL_ROOT}/`),
      commands: tarballPath('command'),
      skills: tarballPath('skill'),
    },
  ],
}

/** Cursor: the only surface of the three that can address the corpus's rules. */
const cursorPlugin = {
  name: pluginName,
  version,
  description,
  author,
  homepage,
  repository,
  license,
  keywords,
  agents: checkoutPath('agent'),
  commands: checkoutPath('command'),
  rules: checkoutPath('rule'),
  skills: checkoutPath('skill'),
}

/**
 * Agent Plugins 1.0.0. `additionalProperties: false`, so identity is all the
 * schema admits; `extensions` is the spec's own namespaced escape hatch and is
 * where the corpus location goes. See the gap paragraph in this file's header —
 * no client is claimed to read this key.
 */
const agentPlugin = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: pluginName,
  version,
  description,
  author,
  homepage,
  repository,
  license,
  keywords,
  extensions: {
    [`${EXTENSION_HOST}.${ownerSlug}.${pluginName}`]: { contentRoot: `./${contentDir}` },
  },
}

/** Repo-relative path -> manifest bytes, in emission order. */
const MANIFESTS = new Map([
  ['.claude-plugin/plugin.json', claudePlugin],
  ['.claude-plugin/marketplace.json', marketplace],
  ['.cursor-plugin/plugin.json', cursorPlugin],
  ['plugin.json', agentPlugin],
])

/** Two-space JSON with a trailing newline — the shape every JSON file here uses. */
function serialise(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

const rendered = [...MANIFESTS].map(([relPath, manifest]) => [relPath, serialise(manifest)])

// ── Write / check ────────────────────────────────────────────────

const base = outDir === null ? ROOT : resolve(outDir)

/** First line that differs, as a one-line summary a reader can act on. */
function firstDifference(expected, actual) {
  const want = expected.split('\n')
  const have = actual.split('\n')
  for (let i = 0; i < Math.max(want.length, have.length); i += 1) {
    if (want[i] !== have[i]) {
      const line = String(i + 1)
      return `line ${line}: committed ${JSON.stringify(have[i] ?? '<end of file>')}, ` +
        `regenerated ${JSON.stringify(want[i] ?? '<end of file>')}`
    }
  }
  return 'files differ in trailing bytes only'
}

if (check) {
  // Independent reads, so they run together and every drifted manifest is
  // reported in one run rather than one per invocation.
  const compared = await Promise.all(
    rendered.map(async ([relPath, bytes]) => {
      try {
        const committed = await readFile(resolve(base, relPath), 'utf8')
        return committed === bytes ? null : `${relPath}: ${firstDifference(bytes, committed)}`
      } catch (err) {
        return `${relPath}: not readable (${err.code ?? err.message})`
      }
    }),
  )
  const drift = compared.filter((line) => line !== null)
  if (drift.length > 0) {
    fail(
      `Plugin manifests out of sync:\n${drift.map((line) => `  - ${line}`).join('\n')}\n` +
        'Regenerate: node scripts/generate-plugin-manifests.mjs',
    )
  }
  const summary = CONTENT_CLASSES.map((type) => `${String(classCounts.get(type))} ${type}`).join(
    ', ',
  )
  console.log(
    `Verified ${String(rendered.length)} plugin manifest(s) at ${pluginName}@${version} ` +
      `(${summary}).`,
  )
} else {
  try {
    // Distinct paths, so the writes are independent; each still takes its own
    // lock and lands through temp+rename.
    await Promise.all(
      rendered.map(([relPath, bytes]) => atomicWriteFile(resolve(base, relPath), bytes)),
    )
  } catch (err) {
    // An EngineError already carries an operator-readable message; a stack
    // trace would bury it.
    fail(err instanceof Error ? err.message : String(err))
  }
  for (const [relPath] of rendered) console.log(`Wrote ${resolve(base, relPath)}`)
}
