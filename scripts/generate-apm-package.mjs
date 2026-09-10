#!/usr/bin/env node
// Rewrite the APM package surface this repository publishes — the root
// `apm.yml` and the whole `.apm/` primitive tree — from package.json and the
// content catalog.
//
// Usage: node scripts/generate-apm-package.mjs [--check] [--out-dir <dir>]
//        --check    compare the rendered bytes against the committed files and
//                   exit 1 with a drift summary instead of writing anything.
//                   An UNEXPECTED file under `.apm/` is drift too: the file set
//                   varies with the corpus, so a retired artifact would
//                   otherwise leave an orphan primitive nothing regenerates.
//        --out-dir  redirect every read-back and every write under that
//                   directory, keeping the repo-relative layout; tests use it to
//                   prove determinism and to seed drift without touching the
//                   committed package.
//
// WHAT THIS IS. APM (Agent Package Manager, github.com/microsoft/apm) resolves
// a package from a git remote: a repository carrying `apm.yml` at its root and
// a `.apm/` tree of primitives is installable as-is. This generator is the
// FIFTH published surface beside the four in `generate-plugin-manifests.mjs`,
// and it exists on the same terms: every byte is projected from package.json or
// from the catalog walk, and CI re-renders and byte-diffs it, so the surface
// cannot drift from the corpus it claims to ship.
//
// It differs from the other four in one structural way. A plugin manifest
// POINTS at `content/`; an APM package COPIES the corpus into `.apm/`, because
// `apm.yml` without `.apm/` is a hard validation error ("Not a valid APM
// package: <name> has apm.yml but is missing the required .apm/ directory" —
// src/apm_cli/models/validation.py, apm 0.29.0, read 2026-08-31) and because
// APM addresses primitives by their location in that tree, not by a component
// path a manifest declares. The copy is generated, never hand-edited: the
// authored sources remain `content/` and the downstream's optional `fork/`.
//
// FOUR CLASSES, FOUR HOMES. Each mapping is documented by APM's own producer
// reference (docs/src/content/docs/producer/author-primitives/, apm 0.29.0):
//
//   rule    -> .apm/instructions/<id>.instructions.md   glob-scoped guidance
//   skill   -> .apm/skills/<id>/SKILL.md                the DIRECTORY is the id
//   command -> .apm/prompts/<id>.prompt.md              basename becomes /<id>
//   agent   -> .apm/agents/<id>.agent.md                a callable persona
//
// `<id>` is the EMITTED id — bundled skills keep their directory, new fork
// skills keep their bare directory, commands take `st-` and other classes take
// `stamity-`, following the catalog/CLI identity contract. An APM consumer
// therefore types the same `/st-work` and names the
// same `stamity-reviewer` as a consumer who installed through any other
// channel; a projection that re-derived its own spelling would be a fifth
// vocabulary for the same corpus.
//
// FRONTMATTER IS TRANSLATED, NOT COPIED. Canonical content carries the
// engine's authoring vocabulary (`id`, `type`, `tags`, `load`, `obsolete_when`,
// `capabilities`, `model_class`, …). APM preserves a documented key set per
// class and DROPS the rest at compile time, surfacing each drop as a consumer-
// facing diagnostic, so shipping the authoring head verbatim would hand every
// consumer a wall of warnings about keys that were never theirs to read. Each
// class is emitted with the keys its own reference documents and nothing else:
//
//   instructions  applyTo, description   (both required for an instruction)
//   skills        name, description      (`name` MUST equal the directory name)
//   prompts       description
//   agents        name, description
//
// Four documented keys are deliberately ABSENT, each because this repository
// has no verified value for it rather than because APM lacks the field:
// `model` on a prompt or an agent is an operator's pin, and the other client
// surfaces emit it only when one exists; `tools` on an agent is APM's own tool
// vocabulary, which is not this engine's capability vocabulary and would be a
// guessed restriction; `allowed-tools` and `input` on a prompt are the same
// case. A guessed restriction reads to a consumer as a restriction that is
// really there.
//
// BODIES ARE PROJECTED VERBATIM, `${STAMITY:*}` TOKENS INCLUDED. Those tokens
// resolve against the CONSUMER's repository — its linter, its test framework,
// its verification gates — and this generator has no consumer manifest to
// resolve them from. Substituting them here would bake one repository's facts
// into every consumer's copy, which is the one thing "never invent a value"
// rules out; the four plugin surfaces ship the same unresolved corpus for the
// same reason. APM's own body template syntax is `${input:name}`, a different
// namespace, so nothing here collides with its compiler.
//
// WHAT apm.yml CARRIES, AND WHAT IT REFUSES TO. `name` and `version` are the
// only REQUIRED fields (manifest-v0.1.schema.json:7 and the working-draft
// reference, apm 0.29.0). `description`, `author` and `license` are plain
// optional strings read verbatim by the parser. Everything below is emitted;
// everything not listed is omitted, and the omissions are the interesting half:
//
//   homepage, repository, keywords    NOT top-level apm.yml fields. They exist
//     only inside a `marketplace:` block's `packages[]` entries, appear in no
//     schema property list and in no prose field section, and are read nowhere
//     in APM's source outside `marketplace/`. APM's own CONCEPT page lists them
//     as top-level optional metadata and is wrong — the normative schema, the
//     working-draft reference and the parser all disagree with it. Emitting
//     them would put three unrecognised keys in the manifest: tolerated by
//     `additionalProperties: true`, meaningful to no resolver, and a claim this
//     generator would be making up.
//
//   targets                           Omitting it means AUTO-DETECT, not
//     "none": the parser returns an empty list and the caller falls through to
//     filesystem-signal detection, so a consumer gets output for the harnesses
//     they actually have. Declaring it would be authoritative and would DROP
//     every unlisted harness. It is also the one live moving part of the
//     schema — the slug set is derived from a capability catalog that gains and
//     reclassifies entries between minors, and the `all` literal is on an
//     announced path to becoming a hard parse error — so an omitted field is
//     the only spelling a value-space change cannot invalidate.
//
//   $schema                           A versioned contract exists and is
//     parsed: the single accepted value selects OpenAPM v0.1 and any other
//     value fails closed. Pinning it would trade "whatever the current CLI
//     does" for a fail-closed versioned negotiation, which is the strongest
//     stability guarantee available — and it would also bind this package to
//     v0.1's `registries` shape rather than the working draft's. That is a
//     trade-off with a real cost on both sides, so it is a decision to be
//     taken deliberately and recorded, not one this generator makes by
//     defaulting. Absent, the manifest loads under the working-draft contract.
//
//   includes                          `includes: auto` records explicit consent
//     to publish local content, and omitting it is legacy implicit consent that
//     makes `apm audit` emit an `includes-consent` advisory. The advisory is
//     the honest state here: consent to publish is a maintainer's declaration
//     about this repository, not a fact this generator can project from
//     package.json, and a generator that declares consent on a maintainer's
//     behalf has invented the one value that matters. Adding `includes: auto`
//     below is a one-line, deliberate edit whenever that declaration is made.
//
//   type: hybrid                      Emitted, VALIDATED, and it still controls
//     NOTHING. Re-read at apm 0.30.0 on 2026-09-09, which changed half of that
//     sentence: the field is now parsed into a four-value enum — `instructions`,
//     `skill`, `hybrid`, `prompts` — and any other value is a hard parse error
//     (`models/apm_package.py:544-554`, `models/validation.py:37-51`), so the
//     spelling below is checked rather than merely tolerated. What has NOT
//     changed is that nothing reads the parsed value: the routing its own
//     docstring describes runs through `get_effective_type`, which derives the
//     content type from the DETECTED package type and never consults the
//     manifest's declaration (`integration/skill_package_routing.py:10-21`).
//     `hybrid` is emitted because it is the value that will be true of this
//     package when the field becomes live — both instructions compilation and
//     skill installation — and it is described here as inert so nobody reads it
//     as a switch.
//
// THE CHARTER GAP, STATED IN FULL — the same gap the plugin generator
// discloses, arriving here for a different reason. `content/charter/` is not a
// plugin component class anywhere, so the charter is absent from all four
// plugin manifests. APM does have a home that would fit it (`.apm/context/`,
// or an instruction with no `applyTo`, which folds unconditionally into the
// compiled `AGENTS.md`), and the charter is still absent — because the settled
// scope of this surface is the four existing content classes, and `context` is
// a fifth. A consumer installing this package therefore receives the commands,
// agents, skills and rules, and reaches the charter through `init` and `sync`
// as every other client does.
//
// THREE MORE OUT OF SCOPE, NAMED RATHER THAN SILENT. `.apm/hooks/` — hook
// scripts are infra-owned configuration here, not corpus content, and APM's
// hook file format was not read. `.apm/context/` — the charter gap above.
// `apm.lock.yaml` — a consumer-side pin of resolved dependencies, produced by
// `apm install` in the consuming repository; this package declares no
// dependencies, so it has nothing to lock. A fourth, `.apm/chatmodes/`, is
// named only to close it: the directory and the `.chatmode.md` format were
// REMOVED from APM in 0.23.0 and `.agent.md` under `.apm/agents/` is the
// replacement, which is the mapping above.
//
// DISTRIBUTION TAKES NO PUBLISH STEP. Git remotes are APM's default resolver
// and are documented by APM as explicitly "not a registry"; the REST package-
// registry protocol that exists is experimental, opt-in behind
// `apm experimental enable registries`, and carries no hosted public endpoint —
// every registry URL in APM's docs is a placeholder the consumer supplies
// themselves. A tagged public repository is installable as it stands.
//
// HISTORY — the type-detection cascade, and how it closed. This surface spent
// three weeks correct and unreachable, and the record is kept here because the
// shape of that failure is the reason this file is gated the way it is.
//
// WHAT WAS OBSERVED. APM classifies a package by a first-match-wins cascade,
// and through 0.29.0 two plugin steps sat ahead of the APM package itself
// (`src/apm_cli/models/validation.py::detect_package_type`, apm 0.29.0):
//
//   1. AGENT_PLUGIN       root `plugin.json` carrying the Agent Plugins schema
//   2. MARKETPLACE_PLUGIN a `plugin.json` OR a `.claude-plugin/` directory
//   …
//   6. APM_PACKAGE        `apm.yml` with `.apm/` — where this surface lives
//
// The repository root carries BOTH gates: `plugin.json` (Agent Plugins 1.0.0)
// and `.claude-plugin/`. The three-way experiment, run against copies of this
// tree with apm 0.29.0 on 2026-08-31:
//
//   - whole tree as published  -> AGENT_PLUGIN. `apm install <path>` is refused
//     outright ("cannot be installed through the imperative local-bundle
//     route"); the declarative form installs natively for the `copilot` target
//     ONLY, and registers the plugin with Copilot rather than deploying a
//     single `.apm/` primitive. Every other target is declined by name.
//   - minus root `plugin.json`  -> MARKETPLACE_PLUGIN, refused: APM accepts a
//     schema-bearing `plugin.json` only with the Agent Plugins `$schema`, and
//     `.claude-plugin/plugin.json` names the schemastore one.
//   - minus both               -> APM_PACKAGE, and it works end to end:
//     10 agents, 9 commands, 12 rules and 8 skills deployed under the emitted
//     ids, with each rule's `applyTo` translated into the target's own glob
//     vocabulary.
//
// The failure mode worth remembering is not the refusal — it is the arm that
// SUCCEEDED. The declarative install exited 0, wrote a lockfile, and deployed
// nothing, so every check that read a status code was green throughout.
//
// THE FIX. Reported as microsoft/apm#2735 from those observations; closed by
// PR #2776, merged 2026-09-03, which moved an ELIGIBLE `apm.yml` to the HEAD of
// the cascade — eligible meaning `.apm/` sits beside it, or the manifest
// declares at least one dependency. A metadata-only manifest still lets the
// plugin signals win, which is how a repository that wants the plugin layout
// keeps it. The fix shipped in apm 0.29.1 (2026-09-06).
//
// THE CURRENT STATE, verified 2026-09-09 against 0.29.1 and 0.30.0. The git
// route deploys this package from the published tree AS IT STANDS, both plugin
// surfaces present and nothing stripped: `apm install zomarit/stamity` and
// `apm install zomarit/stamity#<tag>` each deploy 10 agents, 9 commands,
// 12 rules and 8 skills per target, and the lockfile types the dependency
// `apm_package`. The imperative LOCAL route (`apm install <path>`) is still
// refused by design — the local-bundle route inspects `plugin.json` first — and
// a `file://` spec is rejected outright, so the local form that reaches this
// package is the declarative one: a consumer `apm.yml` naming the directory as
// a dependency. That is the fixture route CI uses, because it needs no tag.
//
// 0.29.1 is therefore the MINIMUM tested client and 0.30.0 the current one. No
// key in `apm.yml` can declare a client floor — the manifest schema has none,
// and `apm_version` exists only in the lockfile as the version that wrote it —
// so the floor is a tested claim or it is nothing.
//
// WHICH IS WHY THE ROUTE IS NOW A GATE. `scripts/apm-install-smoke.mjs` builds
// a real consumer, installs this package into it, and verifies the DEPLOYED
// TREE — every primitive id at its target's path, each carrying its source
// heading, no supported class at zero, and the lockfile's `package_type`. CI
// runs it on 0.29.1 and 0.30.0, and once more on 0.29.0 with `--expect-failure`
// so the check must keep being able to see the original outage; the release
// gates run it against the canonical remote at the shipping commit. The
// projection below is what that gate installs, and a change here that breaks
// the route now fails a check rather than a consumer.
//
// The catalog reader is TypeScript and there is no build step here on purpose —
// a generator that needs `npm run build` first goes stale the moment someone
// skips the build. Node strips the types itself from v22.18 onward, which every
// Node the declared floor (>=22.22.2) admits does; the re-exec below is a
// tolerance for a HOST Node under that floor — unsupported, but a state a
// contributor's machine can be in — where the same capability sits behind
// --experimental-strip-types, so this script re-execs itself once with the flag
// rather than asking a maintainer to remember it. The re-exec must happen
// before the reader is loaded, which is why the imports below are dynamic.
//
// Exit codes: 0 ok, 1 render/write failure or drift under --check, 2 bad arguments.

import { spawnSync } from 'node:child_process'
import { readFile, readdir, rm, rmdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDistributionIdentity } from './distribution-identity.mjs'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const USAGE = 'Usage: node scripts/generate-apm-package.mjs [--check] [--out-dir <dir>]'

if (!process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with
  // the flag on would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${process.version}) cannot strip TypeScript types, so the content ` +
        'catalog cannot be loaded. Run the generator on Node >=22.22.2.',
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

// Publisher identity is resolved from package.json by the shared validator below.

/** Repo-root manifest, and the root of the generated primitive tree. */
const APM_MANIFEST = 'apm.yml'
const APM_DIR = '.apm'

/**
 * Content class -> its `.apm/` subdirectory. The four homes from this file's
 * header, stated once as data so the projection and the check read the same
 * table.
 */
const APM_SUBDIR = {
  rule: 'instructions',
  skill: 'skills',
  command: 'prompts',
  agent: 'agents',
}

/** Content class -> the double extension APM discovers a primitive by. */
const APM_SUFFIX = {
  rule: '.instructions.md',
  command: '.prompt.md',
  agent: '.agent.md',
}

/** The one required file in a skill directory; the rest is projected verbatim. */
const SKILL_FILE = 'SKILL.md'

/**
 * `applyTo` for a rule that declares no globs.
 *
 * An instruction's `applyTo` is required, and the value that states "every
 * file" is the same `**` the Copilot instructions surface emits for a rule with
 * no glob scope (`../src/adapters/copilot.ts`). APM's other spelling for an
 * unconditional rule is to OMIT `applyTo` entirely, which folds the body into
 * the compiled `AGENTS.md` instead of a per-file rule directory — a different
 * deployment, not a different scope. The explicit `**` is chosen because it
 * satisfies the field's required-ness rather than testing how a parser treats
 * an absent required key, and because it keeps every rule in this package
 * deployed the same way.
 */
const APPLY_TO_EVERY_FILE = '**'

/** How a multi-glob `applyTo` is spelled: one comma-separated string. */
const APPLY_TO_SEPARATOR = ','

// ── package.json projection ──────────────────────────────────────

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

function requirePkg(field, value, predicate) {
  if (!predicate(value)) {
    fail(
      `package.json declares no usable \`${field}\`, so the APM manifest would carry an empty ` +
        'or absent value for it. Fix package.json and re-run.',
    )
  }
  return value
}

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

const packageName = requirePkg('name', pkg.name, nonEmptyString)
const version = requirePkg('version', pkg.version, nonEmptyString)
const description = requirePkg('description', pkg.description, nonEmptyString)
const license = requirePkg('license', pkg.license, nonEmptyString)

let identity
try {
  identity = resolveDistributionIdentity(pkg)
} catch (err) {
  fail(err.message)
}
const { publisher: PUBLISHER } = identity

/** The package id, unscoped — the same id every other published surface carries. */
const packageId = packageName.replace(/^@[^/]+\//, '')

// ── Corpus projection ────────────────────────────────────────────

const { assertSafePath, buildContentIndex, COMMAND_ID_PREFIX, replacedClaimantOf, typeIdKey } = await import('../src/content/catalog.ts')
const { composeFrontmatter } = await import('../src/content/frontmatter.ts')
const { contentPrefixFor } = await import('../src/types/markers.ts')
const { CONTENT_CLASSES } = await import('../src/types/content.ts')
const { atomicWriteFile } = await import('../src/merge/atomicWrite.ts')
const { stringify: stringifyYaml } = await import('yaml')

const index = await buildContentIndex()

// A reported collision is not an exportable package, even when duplicate bodies
// happen to agree. Refuse before rendering or writing any generated output.
if (index.collisions.length > 0) {
  fail('APM content identity collisions:\n' + index.collisions.map((row) =>
    `  - ${row.kind}: ${row.key} (${row.paths.join(', ')})`).join('\n'))
}

/** Package-authored winners only; consumer packs and overrides are not inputs. */
const items = index.items.filter((item) =>
  ['corpus', 'fork'].includes(item.origin ?? 'corpus') &&
  index.byKey.get(typeIdKey(item.type, item.id)) === item,
)

const missingClasses = CONTENT_CLASSES.filter((type) => !items.some((item) => item.type === type))
if (missingClasses.length > 0) {
  fail(
    `The corpus indexes no ${missingClasses.join(', ')} artifacts, so the APM package would ship ` +
      'a primitive directory that is empty or absent. Run the generator from a source checkout ' +
      'with the corpus intact.',
  )
}

/**
 * Skills inherit the replaced bundled directory or keep their own directory.
 * Other emitted filename stems use the artifact's id with the catalog's command
 * namespacing removed and the filename prefix its class earns restored.
 * `../src/types/markers.ts` owns which prefix that is, so an APM consumer types
 * the same command name and addresses the same agent as every other client.
 */
function emittedId(item) {
  if (item.type === 'skill') {
    const source = replacedClaimantOf(index, item) ?? item
    const id = posix.basename(posix.dirname(source.relativePath))
    assertSafePath(id, `skill ${JSON.stringify(item.id)} identity`)
    return id
  }
  const bare =
    item.type === 'command' && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id
  const prefix = contentPrefixFor(item)
  const emitted = bare.startsWith(prefix) ? bare : `${prefix}${bare}`
  // The id reaches a path, so a separator or a traversal segment in it would
  // write outside the primitive tree. The catalog already refuses both; this is
  // the cheap restatement at the point where the string becomes a path.
  if (emitted === '' || emitted.includes('/') || emitted.includes('\\') || emitted.includes('..')) {
    fail(`The artifact id ${JSON.stringify(item.id)} does not spell a single path segment.`)
  }
  return emitted
}

/**
 * The rule's glob scope as one `applyTo` value: the declared globs, trimmed and
 * deduplicated in declaration order, comma-joined; `**` when it declares none.
 * The same derivation the Copilot instructions surface uses, because the two
 * formats share the field and a second reading of the same frontmatter is how
 * two surfaces come to disagree about one rule's scope.
 */
function applyToOf(item) {
  const declared = item.frontmatter['globs']
  const raw =
    typeof declared === 'string'
      ? declared.split(',')
      : Array.isArray(declared)
        ? declared.filter((entry) => typeof entry === 'string')
        : []
  const globs = new Set()
  for (const glob of raw) {
    const value = glob.trim()
    if (value !== '') globs.add(value)
  }
  return globs.size === 0 ? APPLY_TO_EVERY_FILE : [...globs].join(APPLY_TO_SEPARATOR)
}

/**
 * One primitive document: the translated head over the artifact's body.
 *
 * `composeFrontmatter` is the corpus's own composer, so the head is YAML the
 * same writer produced everywhere else — a description carrying `: ` or a glob
 * carrying `*` is quoted by the serialiser rather than by a rule spelled here.
 * The body is passed through byte-for-byte, blank line after the fence
 * included, which is what makes the projection a copy rather than a re-render.
 */
function primitive(head, item) {
  return composeFrontmatter(head, item.body)
}

/**
 * The head for one artifact, per the four-class table in this file's header.
 * Ordered as `composeFrontmatter` emits it (`description` leads); key order is
 * part of the output bytes and `--check` byte-diffs them, so it is settled by
 * one composer rather than per class here.
 */
function headFor(item, id) {
  switch (item.type) {
    case 'rule':
      return { description: item.description, applyTo: applyToOf(item) }
    case 'skill':
    case 'agent':
      // A skill's `name` MUST equal its directory name or APM refuses the
      // package naming both; the directory is the identity and the frontmatter
      // restates it. An agent's `name` defaults to the filename stem, and the
      // stem is this same id, so stating it is a restatement there too.
      return { name: id, description: item.description }
    default:
      return { description: item.description }
  }
}

/** Repo-relative POSIX path, so a Windows run emits the same bytes as a POSIX one. */
function repoRelative(absPath) {
  return relative(ROOT, absPath).split(sep).join('/')
}

/**
 * Every regular file under `dir`, as POSIX paths relative to it, depth-first
 * with codepoint-ordered siblings so the walk is identical on every platform.
 * A skill ships its `references/` subtree, and those files are progressive-
 * disclosure material the skill's own body links by path — projecting the
 * `SKILL.md` alone would ship a document whose links resolve to nothing.
 */
async function walkRegularFiles(dir, prefix) {
  const entries = (await readdir(dir, { withFileTypes: true })).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) return walkRegularFiles(join(dir, entry.name), relPath)
      return entry.isFile() ? [relPath] : []
    }),
  )
  return nested.flat()
}

/** Every file this package ships, as repo-relative POSIX path -> bytes. */
async function renderPackage() {
  const rendered = new Map()
  const portablePaths = new Set()

  const add = (relPath, bytes) => {
    assertSafePath(relPath, 'APM projection')
    // The package must also install on case-insensitive Windows/macOS volumes.
    const portablePath = relPath.toLowerCase()
    if (portablePaths.has(portablePath)) {
      fail(
        `Two content artifacts project onto ${relPath}. A primitive path is an identity in an ` +
          'APM package, so the second would silently replace the first.',
      )
    }
    portablePaths.add(portablePath)
    rendered.set(relPath, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8'))
  }

  await Promise.all(
    items.map(async (item) => {
      const id = emittedId(item)
      const dir = posix.join(APM_DIR, APM_SUBDIR[item.type])

      if (item.type !== 'skill') {
        add(posix.join(dir, `${id}${APM_SUFFIX[item.type]}`), primitive(headFor(item, id), item))
        return
      }

      // Identity follows the replaced bundled skill; companion files always
      // come from the winning skill's own source directory.
      const sourceRoot = resolve(item.filePath, '..')
      const files = (await walkRegularFiles(sourceRoot, '')).filter((path) =>
        !['SKILL.customize.md', 'SKILL.customize.yaml'].includes(path),
      )
      if (!files.includes(SKILL_FILE)) {
        fail(`Skill ${JSON.stringify(item.id)} has no ${SKILL_FILE} at ${repoRelative(sourceRoot)}.`)
      }
      // Independent reads over one skill's own tree, so they run together.
      const projected = await Promise.all(
        files.map(async (relPath) => {
          // Validate before join can normalize anything and before reading a
          // companion. A POSIX filename containing a backslash is unsafe on Windows.
          assertSafePath(relPath, `skill ${JSON.stringify(item.id)} companion`)
          return [
            posix.join(dir, id, relPath),
            relPath === SKILL_FILE
              ? primitive(headFor(item, id), item)
              : await readFile(join(sourceRoot, ...relPath.split('/'))),
          ]
        }),
      )
      for (const [target, bytes] of projected) add(target, bytes)
    }),
  )

  // ── The manifest ─────────────────────────────────────────────
  //
  // Written in the order it is read: identity first, then the optional strings
  // the parser takes verbatim, then the reserved `type`. Every field this
  // repository can verify and no field it cannot — see WHAT apm.yml CARRIES in
  // this file's header for each omission and the evidence behind it.
  const manifest = new Map([
    ['name', packageId],
    ['version', version],
    ['description', description],
    ['author', PUBLISHER],
    ['license', license],
    ['type', 'hybrid'],
  ])
  add(APM_MANIFEST, `${stringifyYaml(manifest, { lineWidth: 0 })}`)

  // Sorted here rather than trusted from the walk: the emission order is part
  // of the drift report a reader acts on, and a directory read that comes back
  // in a different order on another filesystem must not reshuffle it.
  return new Map([...rendered].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

const rendered = await renderPackage()

// ── Write / check ────────────────────────────────────────────────

const base = outDir === null ? ROOT : resolve(outDir)

/** Every file currently under `<base>/.apm`, as repo-relative POSIX paths. */
async function committedTree() {
  try {
    const files = await walkRegularFiles(join(base, APM_DIR), '')
    return files.map((relPath) => posix.join(APM_DIR, relPath))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/**
 * Remove every directory under `<base>/.apm` that holds nothing, deepest
 * first. A retired skill leaves its directory behind when its files go, and an
 * empty `st-<id>/` in a skills tree is a skill APM discovers as broken —
 * `SKILL.md` is the one required file — rather than a skill that is simply
 * gone. Returns the directories it removed, repo-relative.
 */
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
      const line = String(i + 1)
      return (
        `line ${line}: committed ${JSON.stringify(have[i] ?? '<end of file>')}, ` +
        `regenerated ${JSON.stringify(want[i] ?? '<end of file>')}`
      )
    }
  }
  return 'files differ in bytes (including binary content)'
}

if (check) {
  // Independent reads, so they run together and every drifted file is reported
  // in one run rather than one per invocation.
  const compared = await Promise.all(
    [...rendered].map(async ([relPath, bytes]) => {
      try {
        const committed = await readFile(resolve(base, relPath))
        return committed.equals(bytes) ? null : `${relPath}: ${firstDifference(bytes, committed)}`
      } catch (err) {
        return `${relPath}: not readable (${err.code ?? err.message})`
      }
    }),
  )
  const drift = compared.filter((line) => line !== null)
  // An unexpected primitive is drift of the other sign: the file set follows
  // the corpus, so a retired artifact leaves a file that regeneration would
  // never rewrite and no byte-diff over the rendered set would ever read.
  for (const relPath of await committedTree()) {
    if (!rendered.has(relPath)) drift.push(`${relPath}: not a primitive this corpus projects`)
  }
  if (drift.length > 0) {
    fail(
      `APM package out of sync:\n${drift.toSorted().map((line) => `  - ${line}`).join('\n')}\n` +
        'Regenerate: node scripts/generate-apm-package.mjs',
    )
  }
  const summary = CONTENT_CLASSES.map(
    (type) => `${String(items.filter((item) => item.type === type).length)} ${type}`,
  ).join(', ')
  console.log(
    `Verified the APM package at ${packageId}@${version} — ${String(rendered.size)} file(s) ` +
      `(${summary}).`,
  )
} else {
  // Stale primitives go FIRST, so a rename lands as one file rather than as the
  // new one beside the old.
  const stale = (await committedTree()).filter((relPath) => !rendered.has(relPath))
  let emptied = []
  try {
    // Distinct paths, so the unlinks are independent; the directory sweep runs
    // after all of them, because a directory is empty only once its last file
    // has gone.
    await Promise.all(stale.map((relPath) => rm(resolve(base, relPath))))
    emptied = await pruneEmptyDirectories(join(base, APM_DIR), APM_DIR)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
  try {
    // Distinct paths, so the writes are independent; each still takes its own
    // lock and lands through temp+rename.
    await Promise.all(
      [...rendered].map(([relPath, bytes]) => atomicWriteFile(resolve(base, relPath), bytes)),
    )
  } catch (err) {
    // An EngineError already carries an operator-readable message; a stack
    // trace would bury it.
    fail(err instanceof Error ? err.message : String(err))
  }
  for (const relPath of [...stale, ...emptied]) console.log(`Removed ${resolve(base, relPath)}`)
  console.log(`Wrote ${String(rendered.size)} file(s) under ${base}`)
}
