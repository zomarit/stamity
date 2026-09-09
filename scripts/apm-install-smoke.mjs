#!/usr/bin/env node
// APM install smoke: install this repository's APM package into a throwaway consumer, then read
// the consumer's tree and prove what actually landed — primitive by primitive, target by target.
//
// WHAT IT PROVES, AND WHY AN EXIT CODE IS NOT IT. The failure this gate exists for EXITED 0. An
// `apm install` that routes past the APM package reports success, writes a lockfile, and deploys
// nothing; a check that read the status would have been green through the whole outage. So the
// evidence here is the deployed tree: every expected primitive id at the path its target deploys
// to, each deployed body carrying the first `# ` heading of the source primitive it came from, no
// supported class sitting at zero, and a lockfile that types the package `apm_package` rather
// than `agent_plugin`.
//
// THE ROUTING HISTORY, IN THREE SENTENCES. APM classifies a package by a first-match cascade, and
// through 0.29.0 a root `plugin.json` carrying the Agent Plugins schema — which this repository
// ships as one of its published channels — outranked `apm.yml` + `.apm/`, so this tree typed as
// an Agent Plugin and deployed zero APM primitives while reporting success (microsoft/apm#2735,
// opened 2026-08-31 from this repository's own observations). PR #2776, merged 2026-09-03, moved
// an ELIGIBLE `apm.yml` — one with `.apm/` beside it, or one declaring dependencies — to the head
// of the cascade, so a repository carrying both surfaces routes to APM without stripping either.
// That fix shipped in apm 0.29.1, which is the minimum client this route is tested against; the
// current stable 0.30.0 carries the same detection code, and both were verified on 2026-09-09.
//
// WHERE EACH CLASS LANDS, PER TARGET. `<id>` is the `.apm/` primitive stem, and a skill's id is
// its directory name:
//
//   target   agent                          command                    rule                                       skill
//   claude   .claude/agents/<id>.md         .claude/commands/<id>.md   .claude/rules/<id>.md                      .claude/skills/<id>/SKILL.md
//   copilot  .github/agents/<id>.agent.md   .github/prompts/<id>.prompt.md  .github/instructions/<id>.instructions.md  .agents/skills/<id>/SKILL.md
//   cursor   .cursor/agents/<id>.md         .cursor/commands/<id>.md   .cursor/rules/<id>.mdc                     .agents/skills/<id>/SKILL.md
//   codex    .codex/agents/<id>.toml        — none —                   — none —                                   .agents/skills/<id>/SKILL.md
//
// CODEX'S TWO BLANKS ARE APM'S DESIGN, NOT THIS PACKAGE'S DEFECT, AND THE CHECK MUST NOT REPORT
// THEM AS ONE. APM's codex profile carries no command class at all, and it folds instructions into
// `AGENTS.md` through a separate `apm compile` rather than deploying a per-rule file — the install
// says so on its own last line. A smoke that demanded codex commands or codex rules would print a
// red about a target that never promised them, and the next reader would learn to ignore it. Codex
// is therefore held to the two classes it does deploy, agents and skills. Its agents are TOML, not
// Markdown: the whole primitive body arrives as one escaped `developer_instructions` string, so the
// strongest assertions that are actually true there are the id in the filename, a `name = "<id>"`
// key, and the source heading inside that string — which is what this script checks.
//
// WHY THE DECLARATIVE LOCAL FORM IS THE FIXTURE ROUTE. The imperative `apm install <path>` is still
// refused for this tree by design — the local-bundle route inspects `plugin.json` before anything
// else — and a `file://` spec is rejected outright, so the one local route that reaches the APM
// package is a consumer `apm.yml` naming the source as a dependency path. That is what this script
// writes, and it is the same resolver, deployer and lockfile writer a consumer reaches through
// `owner/repo`. Running it against a CLEAN EXPORT of the checkout is what makes the gate useful
// before a tag exists: the export is built from `git ls-files --cached --others
// --exclude-standard`, so uncommitted work counts and ignored output does not. That filter is
// load-bearing rather than tidy — a local-path install copies the directory VERBATIM, so an export
// that dragged `node_modules/` and `dist/` along would copy them into the consumer too.
//
// `--expect-failure` inverts the verdict, and it is a gate in its own right: run against a client
// from before the fix, a passing verification would mean this check cannot see the outage it was
// written for. CI runs that leg on 0.29.0 on every push.
//
// Exit codes: 0 verified (or, under --expect-failure, correctly detected a failure),
//             1 verification failed, 2 the smoke could not run.

import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const ROOT = resolve(SELF, '..', '..')
const USAGE =
  'Usage: node scripts/apm-install-smoke.mjs [--apm <path>] [--source <dir | owner/repo[#ref]>]\n' +
  '       [--targets claude,copilot,cursor,codex] [--work <dir>] [--expect-failure] [--keep] [--json]'

/** The four content classes, in the order a report reads best. */
export const PRIMITIVE_CLASSES = ['agent', 'prompt', 'instruction', 'skill']

/** Class -> where the SOURCE primitive lives under `.apm/`, and the suffix that names its id. */
const APM_SOURCE = {
  agent: { dir: 'agents', suffix: '.agent.md' },
  prompt: { dir: 'prompts', suffix: '.prompt.md' },
  instruction: { dir: 'instructions', suffix: '.instructions.md' },
  // A skill's id is its DIRECTORY name; `SKILL.md` is the file inside it.
  skill: { dir: 'skills', suffix: null },
}

/**
 * Target -> class -> the consumer-relative path that class deploys to, as observed from apm
 * 0.30.0 on 2026-09-09. A class ABSENT from a target's entry is a class that target does not
 * carry, and the verification skips it rather than reporting a zero.
 */
export const TARGET_LAYOUT = {
  claude: {
    agent: (id) => `.claude/agents/${id}.md`,
    prompt: (id) => `.claude/commands/${id}.md`,
    instruction: (id) => `.claude/rules/${id}.md`,
    skill: (id) => `.claude/skills/${id}/SKILL.md`,
  },
  copilot: {
    agent: (id) => `.github/agents/${id}.agent.md`,
    prompt: (id) => `.github/prompts/${id}.prompt.md`,
    instruction: (id) => `.github/instructions/${id}.instructions.md`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
  cursor: {
    agent: (id) => `.cursor/agents/${id}.md`,
    prompt: (id) => `.cursor/commands/${id}.md`,
    instruction: (id) => `.cursor/rules/${id}.mdc`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
  codex: {
    agent: (id) => `.codex/agents/${id}.toml`,
    skill: (id) => `.agents/skills/${id}/SKILL.md`,
  },
}

export const DEFAULT_TARGETS = ['claude', 'copilot', 'cursor', 'codex']

/** The consumer-side lockfile `apm install` writes, and the file this gate reads its type from. */
const LOCKFILE = 'apm.lock.yaml'

/** How many problems the human summary prints before it stops repeating itself. */
const PROBLEMS_SHOWN = 12

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    // A missing path is not a directory. Nothing else about the failure matters here, and the
    // callers all report the absence in their own words.
    return false
  }
}

/** The body of a primitive: everything after a leading `---` frontmatter block, if it has one. */
function bodyOf(text) {
  const lines = text.split('\n')
  if (lines[0] !== '---') return text
  const close = lines.indexOf('---', 1)
  return close === -1 ? text : lines.slice(close + 1).join('\n')
}

/**
 * The first `# ` heading line of a primitive body — this file's content WITNESS.
 *
 * A path check alone proves a file exists at a name, which is exactly what a target-shaped empty
 * scaffold also proves. The heading is the cheapest thing that is true of THIS primitive and of
 * no other, it survives every target's frontmatter translation unchanged, and it survives TOML
 * string escaping too, so one witness covers all four targets.
 */
function headingOf(file) {
  for (const line of bodyOf(readFileSync(file, 'utf8')).split('\n')) {
    if (line.startsWith('# ') && line.trim().length > 2) return line.trim()
  }
  throw new Error(
    `${file} carries no \`# \` heading, so this smoke has no content witness for it. Every ` +
      'primitive body opens with one; add the heading, or teach readExpectedPrimitives a ' +
      'different witness for this class.',
  )
}

/** How a witness has to be spelled to be found inside a TOML basic string. */
function tomlEscape(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/**
 * The primitive ids the source package promises, with one content witness each.
 *
 * Read from the `.apm/` tree rather than from the corpus under `content/`: `.apm/` is what APM
 * discovers and deploys, and reading the corpus instead would let a generator that dropped a
 * primitive still pass — the expectation would have been dropped with it.
 */
export function readExpectedPrimitives(sourceDir) {
  const apmDir = join(sourceDir, '.apm')
  if (!isDirectory(apmDir)) {
    throw new Error(
      `No .apm/ tree under ${sourceDir}. An APM package is \`apm.yml\` PLUS \`.apm/\`; without ` +
        'the tree there is nothing to deploy and nothing to expect.',
    )
  }
  const expected = {}
  for (const contentClass of PRIMITIVE_CLASSES) {
    const { dir, suffix } = APM_SOURCE[contentClass]
    const classDir = join(apmDir, dir)
    if (!isDirectory(classDir)) {
      throw new Error(`${join('.apm', dir)} is missing from ${sourceDir}: the package ships no ${contentClass}.`)
    }
    const rows = []
    for (const name of readdirSync(classDir).toSorted()) {
      const entry = join(classDir, name)
      if (suffix === null) {
        if (!isDirectory(entry)) continue
        const file = join(entry, 'SKILL.md')
        if (!existsSync(file)) {
          throw new Error(`${join('.apm', dir, name)} has no SKILL.md, so APM has no skill to deploy under that id.`)
        }
        rows.push({ id: name, witness: headingOf(file) })
        continue
      }
      if (!name.endsWith(suffix) || isDirectory(entry)) continue
      rows.push({ id: name.slice(0, -suffix.length), witness: headingOf(entry) })
    }
    if (rows.length === 0) {
      throw new Error(
        `${join('.apm', dir)} holds no ${contentClass}. An empty expectation set passes every ` +
          'per-id check vacuously, so it is refused here rather than reported as a clean run.',
      )
    }
    expected[contentClass] = rows
  }
  return expected
}

/**
 * The dependency rows of an `apm.lock.yaml`, read line-wise rather than with a YAML library.
 *
 * This script imports Node built-ins only — it has to run beside an extracted package with no
 * toolchain — and what it needs from the lockfile is three fields with a fixed, generated shape:
 * a top-level `dependencies:` block, one `- ` row per dependency at column 0, two-space keys
 * inside it, and a `deployed_files:` sequence. Anything more general would be a YAML parser
 * nobody asked this file to own. A shape change upstream surfaces as an absent `package_type`,
 * which fails loudly rather than reading as agreement.
 */
export function readLockDependencies(text) {
  const rows = []
  let inDependencies = false
  let row = null
  let inDeployed = false
  for (const line of text.split('\n')) {
    if (/^[A-Za-z_]/.test(line)) {
      inDependencies = line.startsWith('dependencies:')
      inDeployed = false
      if (row !== null) rows.push(row)
      row = null
      continue
    }
    if (!inDependencies) continue
    if (line.startsWith('- ')) {
      if (row !== null) rows.push(row)
      row = { name: null, repoUrl: null, packageType: null, resolvedCommit: null, resolvedRef: null, deployedFiles: [] }
      inDeployed = false
      applyLockField(row, line.slice(2))
      continue
    }
    if (row === null) continue
    if (inDeployed) {
      const item = /^ {2}- (.*)$/.exec(line)
      if (item !== null) {
        row.deployedFiles.push((item[1] ?? '').trim())
        continue
      }
      inDeployed = false
    }
    const field = /^ {2}([A-Za-z_]+):[ \t]*(.*)$/.exec(line)
    if (field === null) continue
    if (field[1] === 'deployed_files') {
      inDeployed = true
      continue
    }
    applyLockField(row, line.trim())
  }
  if (row !== null) rows.push(row)
  return rows
}

function applyLockField(row, text) {
  const field = /^([A-Za-z_]+):[ \t]*(.*)$/.exec(text)
  if (field === null) return
  const value = (field[2] ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (field[1] === 'name') row.name = value
  else if (field[1] === 'repo_url') row.repoUrl = value
  else if (field[1] === 'package_type') row.packageType = value
  else if (field[1] === 'resolved_commit') row.resolvedCommit = value
  else if (field[1] === 'resolved_ref') row.resolvedRef = value
}

/**
 * Read a finished consumer and decide whether the package actually deployed.
 *
 * Pure over the filesystem: it spawns nothing and knows nothing about how the consumer got that
 * way, which is what lets the suite exercise it over synthetic trees without an apm binary
 * anywhere near the run.
 */
export function verifyDeployment(consumerDir, expectations, targets) {
  const problems = []
  const counts = {}

  const lockPath = join(consumerDir, LOCKFILE)
  const lockfile = { present: existsSync(lockPath), rows: [] }
  if (!lockfile.present) {
    problems.push(`${LOCKFILE} is absent: apm recorded no dependency at all, so nothing was resolved.`)
  } else {
    lockfile.rows = readLockDependencies(readFileSync(lockPath, 'utf8'))
    if (lockfile.rows.length === 0) {
      problems.push(`${LOCKFILE} records no dependency row, so the consumer's apm.yml resolved to nothing.`)
    }
    for (const row of lockfile.rows) {
      const label = row.name ?? row.repoUrl ?? '<unnamed>'
      if (row.packageType !== 'apm_package') {
        const observed = row.packageType ?? '<absent>'
        const diagnosis =
          observed === 'agent_plugin'
            ? ' — this is the pre-0.29.1 cascade failure: the plugin surfaces at the repository root outranked apm.yml, and no APM primitive is deployed'
            : ' — the type-detection cascade routed past the APM package'
        problems.push(`${LOCKFILE}: dependency \`${label}\` is typed \`${observed}\`, not \`apm_package\`${diagnosis}.`)
      }
      if (row.deployedFiles.length === 0) {
        problems.push(
          `${LOCKFILE}: dependency \`${label}\` records no \`deployed_files\` — the install reported a result and wrote no primitive.`,
        )
      }
    }
  }

  for (const target of targets) {
    const layout = TARGET_LAYOUT[target]
    if (layout === undefined) {
      problems.push(
        `unknown target \`${target}\`: this smoke knows ${Object.keys(TARGET_LAYOUT).join(', ')}. ` +
          'Add its deployment paths to TARGET_LAYOUT before asking for it.',
      )
      continue
    }
    counts[target] = {}
    for (const contentClass of PRIMITIVE_CLASSES) {
      const pathFor = layout[contentClass]
      // A class the target does not carry. Codex is the live case: no commands, and instructions
      // reach AGENTS.md through `apm compile` rather than as per-rule files.
      if (pathFor === undefined) continue
      const rows = expectations[contentClass] ?? []
      counts[target][contentClass] = 0
      if (rows.length === 0) {
        problems.push(
          `${target}/${contentClass}: the expectation set is empty, so this class would pass without a single file. Read the source's .apm/ tree again.`,
        )
        continue
      }
      let found = 0
      for (const { id, witness } of rows) {
        const relPath = pathFor(id)
        const file = join(consumerDir, ...relPath.split('/'))
        if (!existsSync(file)) {
          problems.push(`${target}/${contentClass}: \`${id}\` is missing — nothing at ${relPath}`)
          continue
        }
        const deployed = readFileSync(file, 'utf8')
        const isCodexAgent = target === 'codex' && contentClass === 'agent'
        const needle = isCodexAgent ? tomlEscape(witness) : witness
        if (!deployed.includes(needle)) {
          problems.push(
            `${target}/${contentClass}: \`${id}\` at ${relPath} does not carry its source heading \`${witness}\` — a file of that name exists, but it is not this primitive`,
          )
          continue
        }
        if (isCodexAgent && !deployed.includes(`name = "${id}"`)) {
          problems.push(
            `${target}/${contentClass}: \`${id}\` at ${relPath} declares no \`name = "${id}"\` key — codex addresses an agent by that key, so a file without it deploys under no id`,
          )
          continue
        }
        found += 1
      }
      counts[target][contentClass] = found
      if (found === 0) {
        problems.push(
          `${target}/${contentClass}: 0 of ${rows.length} deployed — the target supports this class and none of it landed`,
        )
      }
    }
  }

  return { ok: problems.length === 0, problems, counts, lockfile }
}

/** Every tracked-or-untracked-but-not-ignored file of `sourceDir`, copied into `destDir`. */
function exportTree(sourceDir, destDir) {
  let listing
  try {
    listing = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: sourceDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    throw new Error(
      `Could not list ${sourceDir} with git (${error instanceof Error ? error.message : String(error)}). ` +
        "A clean export needs git's own ignore rules: a local-path install copies the directory " +
        'verbatim, so a plain recursive copy would carry node_modules/ and dist/ into the consumer.',
      { cause: error },
    )
  }
  const made = new Set()
  let copied = 0
  for (const relPath of listing.split('\0')) {
    if (relPath === '') continue
    const from = join(sourceDir, ...relPath.split('/'))
    // `git ls-files` also names a submodule (a directory) and a cached-but-deleted path (nothing
    // on disk). Neither is a byte to copy.
    if (!existsSync(from) || !statSync(from).isFile()) continue
    const to = join(destDir, ...relPath.split('/'))
    const dir = dirname(to)
    if (!made.has(dir)) {
      mkdirSync(dir, { recursive: true })
      made.add(dir)
    }
    copyFileSync(from, to)
    copied += 1
  }
  if (copied === 0) {
    throw new Error(`${sourceDir} exported zero files. A source with nothing in it cannot prove a deployment.`)
  }
  return copied
}

/** `owner/repo` or `owner/repo#ref` — the git spec APM resolves without a local tree. */
function looksLikeGitSpec(spec) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[^\s]+)?$/.test(spec) && !isDirectory(spec)
}

/** The vendored copy of whatever apm actually resolved, under the consumer's `apm_modules/`. */
function vendoredSource(consumerDir) {
  const modules = join(consumerDir, 'apm_modules')
  if (!isDirectory(modules)) return null
  for (const owner of readdirSync(modules).toSorted()) {
    const ownerDir = join(modules, owner)
    if (!isDirectory(ownerDir)) continue
    for (const repo of readdirSync(ownerDir).toSorted()) {
      const candidate = join(ownerDir, repo)
      if (isDirectory(join(candidate, '.apm'))) return candidate
    }
  }
  return null
}

function usage(problem) {
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = {
    apm: process.env['STAMITY_APM_BIN'] ?? 'apm',
    source: null,
    targets: [...DEFAULT_TARGETS],
    work: null,
    expectFailure: false,
    keep: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apm' || arg === '--source' || arg === '--work' || arg === '--targets') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) usage(`${arg} needs a value.`)
      i += 1
      if (arg === '--apm') options.apm = value
      else if (arg === '--source') options.source = value
      else if (arg === '--work') options.work = value
      else options.targets = value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
    } else if (arg === '--expect-failure') options.expectFailure = true
    else if (arg === '--keep') options.keep = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE)
      process.exit(0)
    } else usage(`Unrecognised argument: ${arg}`)
  }
  if (options.targets.length === 0) usage('--targets resolved to an empty list.')
  return options
}

function main(argv) {
  const options = parseArgs(argv)
  const say = (line) => {
    if (!options.json) console.log(line)
  }
  // Under --json, stdout carries the JSON document and NOTHING else — a verdict line printed
  // beside it would make the output two documents and unparseable. The verdict still has to be
  // readable, so it goes to stderr there rather than being dropped.
  const verdict = (line) => {
    if (options.json) console.error(line)
    else console.log(line)
  }

  const version = spawnSync(options.apm, ['--version'], { encoding: 'utf8', timeout: 60_000 })
  if (version.error !== undefined || version.status !== 0) {
    console.error(
      `apm-install-smoke: ERROR - cannot run \`${options.apm}\`: ${version.error?.message ?? `exit ${version.status}`}. ` +
        'Pass --apm <path> or set STAMITY_APM_BIN to an apm-cli >= 0.29.1.',
    )
    return 2
  }
  const apmVersion = (version.stdout ?? '').trim().split('\n').at(-1) ?? ''

  const provided = options.work !== null
  const work = provided ? resolve(options.work) : mkdtempSync(join(tmpdir(), 'stamity-apm-smoke-'))
  mkdirSync(work, { recursive: true })
  const consumer = join(work, 'consumer')

  try {
    const requested = options.source ?? ROOT
    const remote = looksLikeGitSpec(requested)
    let dependency = requested
    if (!remote) {
      const sourceDir = resolve(requested)
      if (!isDirectory(sourceDir)) {
        console.error(`apm-install-smoke: ERROR - --source ${requested} is neither a directory nor an owner/repo[#ref] spec.`)
        return 2
      }
      const exported = join(work, 'source')
      mkdirSync(exported, { recursive: true })
      const copied = exportTree(sourceDir, exported)
      say(`apm-install-smoke: exported ${copied} files from ${sourceDir}`)
      dependency = exported
    }

    // `git init` so apm's own `.gitignore` write for `apm_modules/` has a repository to land in,
    // and so the consumer looks to apm exactly like a real project rather than a loose directory.
    mkdirSync(consumer, { recursive: true })
    execFileSync('git', ['init', '--quiet', consumer], { stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(
      join(consumer, 'apm.yml'),
      `name: consumer\nversion: 0.0.0\ndependencies:\n  apm:\n    - ${dependency}\n`,
    )

    const started = Date.now()
    const install = spawnSync(options.apm, ['install', '--target', options.targets.join(',')], {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 900_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    const durationMs = Date.now() - started
    if (install.error !== undefined) {
      console.error(`apm-install-smoke: ERROR - \`${options.apm} install\` could not run: ${install.error.message}`)
      return 2
    }

    // Expectations come from the tree APM ACTUALLY SAW. For a local source that is the export;
    // for a git spec it is the vendored copy apm cloned, which is the only local witness of what
    // the ref carried. The boundary that follows from it, stated rather than left to be
    // discovered: this smoke asks whether the resolver DELIVERS what the source's `.apm/`
    // promises, not whether that `.apm/` matches the corpus. The second question belongs to
    // `generate-apm-package.mjs --check` and `test/ci/apmPackage.test.ts`, which byte-diff the
    // projection — and neither of those can answer this one.
    const expectationSource = remote ? vendoredSource(consumer) : dependency
    if (expectationSource === null) {
      console.error(
        `apm-install-smoke: ERROR - ${requested} vendored no tree carrying \`.apm/\` under apm_modules/, ` +
          'so there is nothing to read expectations from. Install output follows.\n' +
          `${install.stdout ?? ''}\n${install.stderr ?? ''}`,
      )
      return 2
    }
    const expectations = readExpectedPrimitives(expectationSource)

    const result = verifyDeployment(consumer, expectations, options.targets)
    const problems = [...result.problems]
    if (install.status !== 0) {
      problems.unshift(
        `\`apm install\` exited ${install.status ?? '<signalled>'}:\n${(install.stderr ?? '').trim() || (install.stdout ?? '').trim()}`,
      )
    }
    const ok = problems.length === 0

    const report = {
      ok,
      expectFailure: options.expectFailure,
      apm: options.apm,
      apmVersion,
      source: requested,
      route: remote ? 'git' : 'local-declarative',
      targets: options.targets,
      expected: Object.fromEntries(PRIMITIVE_CLASSES.map((c) => [c, (expectations[c] ?? []).length])),
      counts: result.counts,
      lockfile: {
        present: result.lockfile.present,
        packageTypes: result.lockfile.rows.map((row) => row.packageType),
        resolvedCommit: result.lockfile.rows[0]?.resolvedCommit ?? null,
        resolvedRef: result.lockfile.rows[0]?.resolvedRef ?? null,
        deployedFiles: result.lockfile.rows.reduce((total, row) => total + row.deployedFiles.length, 0),
      },
      installStatus: install.status,
      durationMs,
      problems,
    }

    if (options.json) console.log(JSON.stringify(report, null, 2))
    else {
      say(`apm-install-smoke: ${apmVersion} installed ${requested} (${report.route}) in ${durationMs} ms`)
      for (const target of options.targets) {
        const perClass = result.counts[target] ?? {}
        const shown = Object.keys(perClass)
          .toSorted()
          .map((contentClass) => `${contentClass} ${perClass[contentClass]}/${(expectations[contentClass] ?? []).length}`)
          .join(', ')
        const note = target === 'codex' ? '  (no command or rule class: the APM codex profile carries neither)' : ''
        say(`  ${target.padEnd(8)} ${shown}${note}`)
      }
      // Capped. A client from before the fix produces one problem per id per target — 151 of them
      // on this corpus — and a wall of identical lines buries the two that name the cause. The
      // whole list is always in `--json`.
      for (const problem of problems.slice(0, PROBLEMS_SHOWN)) say(`  ! ${problem}`)
      if (problems.length > PROBLEMS_SHOWN) {
        say(`  ! ... and ${problems.length - PROBLEMS_SHOWN} more (run with --json for the whole list)`)
      }
    }

    if (options.expectFailure) {
      if (ok) {
        console.error(
          `apm-install-smoke: FAIL - --expect-failure, but ${apmVersion} deployed everything this package promises. ` +
            'This client does not reproduce the routing failure, so running it as the regression witness proves nothing. ' +
            'Point the witness leg at a client from before apm 0.29.1.',
        )
        return 1
      }
      verdict(
        `apm-install-smoke: PASS (expected failure) - ${apmVersion} did not deploy this package, and the check saw it: ` +
          `${problems.length} problem(s), first: ${problems[0]}`,
      )
      return 0
    }

    if (!ok) {
      console.error(`apm-install-smoke: FAIL - ${problems.length} problem(s) against ${apmVersion}; see the list above.`)
      return 1
    }

    const total = Object.values(result.counts).reduce(
      (sum, perClass) => sum + Object.values(perClass).reduce((inner, n) => inner + n, 0),
      0,
    )
    verdict(
      `apm-install-smoke: PASS - ${apmVersion} deployed ${total} primitive(s) across ` +
        `${options.targets.length} target(s) from ${requested}, every id present with its source heading, ` +
        `lockfile typed apm_package with ${report.lockfile.deployedFiles} deployed file(s).`,
    )
    return 0
  } finally {
    if (options.keep) console.error(`apm-install-smoke: kept ${work}`)
    // A --work directory the caller named is THEIRS, and may hold more than this run put in it,
    // so only the two subdirectories this run creates are removed. A temp directory this run
    // made goes whole.
    else if (provided) {
      rmSync(join(work, 'source'), { recursive: true, force: true })
      rmSync(consumer, { recursive: true, force: true })
    } else rmSync(work, { recursive: true, force: true })
  }
}

// Executed directly: run the smoke. Imported: the two pure halves above are the suite's subject,
// and importing must not install anything.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === SELF) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (error) {
    console.error(`apm-install-smoke: ERROR - ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
