#!/usr/bin/env node
// The QA harness: measures the nine form rows it can measure, binds all nine to the bytes they
// were measured against, and writes one evidence file.
//
// WHAT THIS REPLACES. Nine rows of a manual walk-through have been carried to two releases reading
// UNPERFORMED, which is honest and useless: nobody could tell which of them had gone stale and
// which had simply never been done. Five of the nine are mechanical — a keyboard walk over a built
// page, an accessibility tree read, a hook that either fires or does not — and a mechanical check a
// person performs once a release is a check nobody performs. The other four are the same kind of
// mechanical, on clients this machine cannot drive; they stay human, and they now carry the hash of
// what a signature would be a signature ON.
//
// WHAT IT NEVER DOES. Invent a pass. A page missing from the build is `failed` with its path. A
// client binary that is absent is `not-run` with the reason. A browser that was never installed is
// `not-run` with the command that installs it. A table whose cells cannot take focus records
// `not-applicable` and says why, because a page with no grid contract cannot keep or break one.
// Every status in the evidence file came from something that ran.
//
// WHAT IT BUILDS. Nothing. The caller builds the site (`cd website && npm run build`) and the CLI
// (`npm run build`); this script reads both. That split keeps the harness honest about staleness —
// it hashes what is on disk and reports it, rather than regenerating inputs until they agree.
//
// Usage:
//   node scripts/qa/run.mjs [--site website/build] [--sha <sha>] [--out <path>]
//                           [--fixtures <dir>] [--clients claude,codex,cursor,copilot]
//                           [--skip-hooks] [--skip-browser]

import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { carryForward, hashFile, inputHashMap, rowHash } from './bind.mjs'
import { QA_ROWS } from './form.mjs'
import { exitDescription, runHookClients } from './hook-runs.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(SELF, '..', '..', '..')

/**
 * `absolute` as a path relative to `REPO_ROOT`, in POSIX form.
 *
 * The evidence file's `inputHashes` keys are this label, never the raw path the caller supplied —
 * a `--site` (or any other) argument passed as an ABSOLUTE path (the common shape when an
 * orchestrator resolves paths before invoking this script) would otherwise land verbatim in a
 * committed evidence file, carrying the operator's home directory or the repo's own absolute
 * checkout path into it. `relative()` plus a POSIX-separator normalization is the same fix S-4
 * applied to the skip-reason strings: the fact the label names ("this page, this input") survives,
 * the checkout location it was measured from does not.
 */
export function repoRelativeLabel(absolute) {
  return relative(REPO_ROOT, absolute).replaceAll('\\', '/')
}

/**
 * The pages under test, as site routes paired with the file the build writes for each.
 *
 * Eight, chosen for what each one contributes rather than for coverage: the home page (the only
 * hand-built React surface), two prose guides, the trust page (the densest link set), the
 * capability matrix (the only wide table, and the only page with a grid contract to check), and
 * the three pages the 1.8.0 release added or restructured — the security mapping (the widest
 * hand-written tables, every header cell scoped by the rehype plugin), the measurements page
 * (rendered from a snapshot) and the doctrine page (the amendments table) — so a release's own
 * new pages never ship measured by nobody.
 */
export const PAGES = [
  { route: '/', file: 'index.html' },
  { route: '/docs/getting-started', file: 'docs/getting-started/index.html' },
  { route: '/docs/customization', file: 'docs/customization/index.html' },
  { route: '/docs/packs-and-trust', file: 'docs/packs-and-trust/index.html' },
  { route: '/docs/capability-matrix', file: 'docs/capability-matrix/index.html' },
  { route: '/docs/security-mapping', file: 'docs/security-mapping/index.html' },
  { route: '/docs/measurements', file: 'docs/measurements/index.html' },
  { route: '/docs/doctrine', file: 'docs/doctrine/index.html' },
]

/** Where the browser lane's dependencies live: the docs site owns them, not the published package. */
const SITE_PACKAGE = join(REPO_ROOT, 'website', 'package.json')

/** What to tell an operator whose browser binary is missing. Printed, never worked around. */
const BROWSER_INSTALL_HINT = 'cd website && npx playwright install chromium'

/**
 * Is `candidate` outside `root`?
 *
 * M5: on Windows, `relative()` between two paths on different drives returns an ABSOLUTE path
 * (e.g. `D:\fixtures` relative to `C:\repo`), not a `..`-prefixed one — checking only
 * `startsWith('..')` reads that cross-drive path as "inside the repository" and lets it straight
 * through a refusal meant to keep a fixture tree out from under the leak gate's walk.
 */
export function isOutsideRoot(root, candidate) {
  const rel = relative(root, candidate)
  return rel.startsWith('..') || isAbsolute(rel)
}

/**
 * Refuse a `--site` whose resolved directory has no relative path under `root` at all (N-6).
 *
 * {@link repoRelativeLabel} computes `relative(REPO_ROOT, absolute)`, which itself returns an
 * ABSOLUTE path when no relative path exists — a `--site` on another Windows drive, or any root
 * genuinely disjoint from the repository. `isOutsideRoot`'s `..`-prefix check alone misses that
 * shape (M5's own finding, reused here), so a `--site` outside the repository could still land an
 * absolute path straight into a committed evidence file's `inputHashes` keys, the exact leak this
 * module's own `repoRelativeLabel` doc comment says never happens. The refusal fires before any
 * row is measured — an evidence file half-built against a site this harness was about to refuse is
 * worse than no file at all. `root` is a parameter (not `REPO_ROOT` read directly) so a test can
 * drive it against a fake root without touching this checkout's own paths.
 */
export function assertSiteWithinRoot(root, siteDir) {
  if (isOutsideRoot(root, siteDir)) {
    throw new Error(
      `--site ${siteDir} is not under the repository root (${root}); the --site directory must ` +
        'live inside the repository so its evidence-file labels stay repo-relative.',
    )
  }
}

/**
 * Fixture files whose bytes decide what a hook row measures.
 *
 * Selected rather than swept, and the selection is the point. A whole-tree hash would fold in
 * `.stamity/manifest.json`, which carries an `updatedAt` written at fixture-build time — every run
 * would produce a new hash, every human row would reopen on every run, and the carry-forward
 * mechanism would be noise. What is hashed instead is everything that decides the client's hook
 * behaviour: the client's own hook configuration, the generated hook scripts it points at, and the
 * QA instrument with its declaration.
 */
const HOOK_INPUT_PATTERNS = {
  claude: ['.claude/settings.json'],
  codex: ['.codex/hooks.json'],
  cursor: ['.cursor/hooks.json'],
  copilot: ['.github/hooks/stamity.json'],
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

/** The usage banner, so `--help` answers rather than sending the reader to the file. */
export const USAGE =
  'Usage: node scripts/qa/run.mjs [--site website/build] [--sha <sha>] [--out <path>]\n' +
  '                               [--fixtures <dir>] [--clients claude,codex,cursor,copilot]\n' +
  '                               [--skip-hooks] [--skip-browser]'

/** `--flag value` and `--flag` over argv. Deliberately small: this script takes seven options. */
export function parseArgs(argv) {
  const options = { clients: ['claude', 'codex', 'cursor', 'copilot'], skipHooks: false, skipBrowser: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--site') { options.site = next; i += 1 }
    else if (arg === '--sha') { options.sha = next; i += 1 }
    else if (arg === '--out') { options.out = next; i += 1 }
    else if (arg === '--fixtures') { options.fixtures = next; i += 1 }
    else if (arg === '--clients') { options.clients = (next ?? '').split(',').filter((c) => c !== ''); i += 1 }
    else if (arg === '--skip-hooks') options.skipHooks = true
    else if (arg === '--skip-browser') options.skipBrowser = true
    else throw new Error(`Unknown option ${arg}.\n${USAGE}`)
  }
  return options
}

/**
 * Serve the built site over loopback.
 *
 * A `file://` load would be a different page: the build emits root-absolute asset URLs, so its CSS,
 * its theme script and its fonts would all 404 and the keyboard journey would measure an unstyled
 * document with no focus rings in it and call the result a finding. An ephemeral port on 127.0.0.1
 * is the smallest thing that serves the real page.
 */
export function serveSite(siteDir) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    let target = join(siteDir, decodeURIComponent(url.pathname))
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html')
    if (!existsSync(target)) {
      // Docusaurus writes `<route>/index.html`; a request for the bare route lands here first.
      const withIndex = join(siteDir, decodeURIComponent(url.pathname), 'index.html')
      if (existsSync(withIndex)) target = withIndex
    }
    if (!existsSync(target) || statSync(target).isDirectory()) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end(`not built: ${url.pathname}`)
      return
    }
    response.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' })
    createReadStream(target).pipe(response)
  })
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

/** Load the browser lane out of the docs site's own `node_modules`, or say why it could not. */
export async function loadBrowserLane() {
  const require = createRequire(SITE_PACKAGE)
  let playwrightPath
  let axePath
  try {
    playwrightPath = require.resolve('playwright')
    axePath = require.resolve('@axe-core/playwright')
  } catch {
    // S-4: `error.message` from a failed `require.resolve` carries the absolute
    // resolution paths it searched, which is the evidence file leaking the
    // operator's home directory (or the repo's own absolute path) into a
    // committed artifact. The evidence names the fact — a package is missing —
    // and the fix, never the path the resolver walked.
    return {
      available: false,
      reason:
        "the browser lane's packages are not installed in website/. " +
        'Run `cd website && npm ci` and `' + BROWSER_INSTALL_HINT + '`.',
    }
  }
  // Both packages ship CommonJS, so a dynamic import hands back a namespace whose real exports sit
  // under `default` — reading `.chromium` off the namespace itself is how the first run of this
  // harness reported "no browser binary" against a browser that was installed.
  const playwrightModule = await import(pathToFileURL(playwrightPath).href)
  const playwright = playwrightModule.default ?? playwrightModule
  const axeModule = await import(pathToFileURL(axePath).href)
  const AxeBuilder = axeModule.AxeBuilder ?? axeModule.default?.default ?? axeModule.default
  const versions = {
    playwright: JSON.parse(readFileSync(require.resolve('playwright/package.json'), 'utf8')).version,
    axe: JSON.parse(readFileSync(require.resolve('axe-core/package.json'), 'utf8')).version,
  }
  return { available: true, playwright, AxeBuilder, versions }
}

/**
 * Hash `{ label, absolute }` entries, reporting a missing one rather than skipping it.
 *
 * The LABEL is what the evidence file records and what the hash is taken over, so it has to be
 * stable across runs; the ABSOLUTE path is native (`node:path`, never a `/` literal) because it is
 * a real filesystem path and this repository has already paid for that distinction once on Windows
 * (`.stamity/learnings/the-local-test-gate-is-weaker-than-ci.md`).
 */
function hashEntries(entries) {
  const inputs = []
  const missing = []
  for (const entry of entries) {
    if (!existsSync(entry.absolute)) {
      missing.push(entry.label)
      continue
    }
    inputs.push({ path: entry.label, sha256: hashFile(entry.absolute) })
  }
  return { inputs, missing }
}

/**
 * Hash the fixture files that decide a hook row, under fixture-relative labels.
 *
 * The label is `fixture/<path within the fixture>` — never the fixture's own absolute directory,
 * which lives under the OS temp directory (`scripts/qa/fixtures.mjs`) and carries the operator's
 * home directory on most machines. Each hook row (`H1a`–`H1d`) owns its own `inputHashes` map, so
 * dropping the per-client qualifier this label used to carry (`fixture(${client})/…`) does not
 * collide two rows' keys — it only drops information the row id already carries.
 *
 * Exported (N-2) so a test can drive the label directly against a fake fixture directory: every
 * H1 case in this file's own suite passes `--skip-hooks`, which leaves `inputHashes` empty and
 * lets the assertion loop that checks label shape skip every H1 row silently — this export is
 * what closes that gap without wiring a real client binary into the suite.
 */
export function hashFixtureInputs(client, fixtureDir) {
  if (fixtureDir === undefined) return { inputs: [], missing: [] }
  const relatives = [
    ...(HOOK_INPUT_PATTERNS[client] ?? []),
    'qa-hooks/decision.mjs',
    'qa-hooks/decision.json',
  ]
  let generated
  try {
    generated = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--cached'], {
      cwd: fixtureDir,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((path) => path.startsWith(`.stamity/generated/hooks/${client}/`))
  } catch {
    // A fixture that is not a readable repository still hashes its client config and instrument;
    // the generated scripts are then absent from the row's inputs, which the reason records.
    generated = []
  }
  const inputs = []
  const missing = []
  for (const entry of [...relatives, ...generated]) {
    const absolute = join(fixtureDir, entry)
    if (!existsSync(absolute)) {
      missing.push(entry)
      continue
    }
    inputs.push({ path: `fixture/${entry}`, sha256: hashFile(absolute) })
  }
  return { inputs, missing }
}

/** Assemble one evidence row out of a status, a reason and an input list. */
function buildRow({ id, status, reason, inputs }) {
  return {
    row: id,
    automated: status === 'passed' || status === 'failed',
    status,
    reason,
    inputHashes: inputHashMap(inputs),
    rowHash: rowHash(inputs),
  }
}

/** Every keyboard result for one width/theme pair folded into that pair's row. */
function keyboardRowFor({ definition, results, pageInputs, skipped }) {
  if (skipped !== undefined) {
    return buildRow({ id: definition.id, status: 'not-run', reason: skipped, inputs: pageInputs })
  }
  const mine = results.filter((row) => row.width === definition.width && row.theme === definition.theme)
  if (mine.length === 0) {
    return buildRow({
      id: definition.id,
      status: 'not-run',
      reason: `the browser lane produced no result for ${definition.width}px ${definition.theme}`,
      inputs: pageInputs,
    })
  }
  // The theme the page actually rendered as leads the reason, because a row that measured `light`
  // twice under two theme labels would read exactly like a row that measured both.
  const applied = [...new Set(mine.map((row) => row.themeApplied ?? 'unknown'))].join('/')
  const failed = mine.filter((row) => row.status === 'fail')
  if (failed.length > 0) {
    return buildRow({
      id: definition.id,
      status: 'failed',
      reason: `data-theme ${applied} || ${failed.map((row) => `${row.page}: ${row.reason}`).join(' || ')}`,
      inputs: pageInputs,
    })
  }
  return buildRow({
    id: definition.id,
    status: 'passed',
    reason: `data-theme ${applied} || ${mine.map((row) => `${row.page}: ${row.reason}`).join(' || ')}`,
    inputs: pageInputs,
  })
}

/** The accessibility row: one status over every page, with the scanner's counts carried in. */
function a11yRowFor({ results, pageInputs, skipped }) {
  if (skipped !== undefined) {
    return buildRow({ id: 'H2', status: 'not-run', reason: skipped, inputs: pageInputs })
  }
  const failed = results.filter((row) => row.status === 'fail')
  const scannerLine = results
    .map((row) =>
      row.scanner?.ran === true
        ? `${row.page}: ${row.scanner.violations} violation(s)${row.scanner.ids.length === 0 ? '' : ` [${row.scanner.ids.join(' ')}]`}`
        : `${row.page}: scanner did not run (${row.scanner?.reason ?? 'no reason recorded'})`,
    )
    .join(' || ')
  if (failed.length > 0) {
    return buildRow({
      id: 'H2',
      status: 'failed',
      reason: `${failed.map((row) => `${row.page}: ${row.reason}`).join(' || ')} || scanner: ${scannerLine}`,
      inputs: pageInputs,
    })
  }
  return buildRow({
    id: 'H2',
    status: 'passed',
    reason: `${results.map((row) => `${row.page}: ${row.reason}`).join(' || ')} || scanner: ${scannerLine}`,
    inputs: pageInputs,
  })
}

/** Read the previous evidence file at `out`, if one is there. Absent is normal on a first run. */
function previousEvidence(out) {
  if (!existsSync(out)) return null
  try {
    return JSON.parse(readFileSync(out, 'utf8'))
  } catch (error) {
    // A corrupt previous file loses its carried signatures rather than blocking the run; the rows
    // reopen, which is the safe direction.
    process.stderr.write(`[qa] previous evidence at ${out} is unreadable (${error.message}); rows reopen\n`)
    return null
  }
}

/** The harness run. Returns the evidence object it wrote. */
export async function main(argv) {
  const options = parseArgs(argv)
  if (options.help === true) {
    process.stdout.write(`${USAGE}\n`)
    return null
  }
  const siteDir = resolve(REPO_ROOT, options.site ?? 'website/build')
  assertSiteWithinRoot(REPO_ROOT, siteDir)
  const sha = options.sha ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  const out = resolve(REPO_ROOT, options.out ?? `.stamity/evidence/qa-${sha.slice(0, 7)}.json`)

  // Page inputs first: the H2 and H3 rows are bound to the built pages whether or not the browser
  // lane runs, so a skipped run still records WHAT it skipped measuring. The label is ALWAYS
  // repo-root-relative (`repoRelativeLabel`), never the `--site` argument's own spelling — that
  // argument is free to be absolute, and the evidence file's keys must not be.
  const pageHashes = hashEntries(
    PAGES.map((page) => {
      const absolute = join(siteDir, ...page.file.split('/'))
      return { label: repoRelativeLabel(absolute), absolute }
    }),
  )
  const missingPages = pageHashes.missing

  let harness = { name: 'playwright', version: null, browser: null, scanner: 'axe-core', scannerVersion: null }
  let keyboardResults = []
  let a11yResults = []
  let browserSkipReason
  if (options.skipBrowser) {
    browserSkipReason = 'the browser lane was skipped (--skip-browser)'
  } else {
    const lane = await loadBrowserLane()
    if (!lane.available) {
      browserSkipReason = lane.reason
    } else {
      harness = { ...harness, version: lane.versions.playwright, scannerVersion: lane.versions.axe }
      let browser
      try {
        browser = await lane.playwright.chromium.launch()
      } catch {
        // S-4: playwright's launch error carries the absolute path it looked
        // for the browser binary under (an operator home directory in the
        // common case). The evidence file states the fact and the fix, not
        // the path.
        browserSkipReason = `no browser binary. Run \`${BROWSER_INSTALL_HINT}\`.`
      }
      if (browser !== undefined) {
        harness.browser = browser.version()
        const { server, baseUrl } = await serveSite(siteDir)
        try {
          const { runKeyboardJourneys } = await import('./keyboard-journeys.mjs')
          const { runA11yTree } = await import('./a11y-tree.mjs')
          const routes = PAGES.map((page) => page.route)
          keyboardResults = await runKeyboardJourneys({ browser, baseUrl, pages: routes })
          a11yResults = await runA11yTree({
            browser,
            baseUrl,
            pages: routes,
            axeBuilder: (page) => new lane.AxeBuilder({ page }),
          })
        } finally {
          await browser.close()
          server.close()
        }
      }
    }
  }

  // A fixture tree inside this repository would be walked by every later leak-gate run — the gate
  // lists untracked-but-not-ignored files, and a fixture carries whole emitted client trees. The
  // refusal is here rather than in a comment because the flag makes the mistake one keystroke away.
  const fixturesDir = options.fixtures === undefined ? undefined : resolve(REPO_ROOT, options.fixtures)
  if (fixturesDir !== undefined && !isOutsideRoot(REPO_ROOT, fixturesDir)) {
    throw new Error(
      `--fixtures ${fixturesDir} is inside this repository. Fixtures are disposable client trees; ` +
        'keeping them under the repo leaves untracked files that every later gate run has to scan. ' +
        'Point it at a path under the OS temp directory, or omit it.',
    )
  }
  const hookResults = options.skipHooks
    ? []
    : runHookClients({
        clients: options.clients,
        repoRoot: REPO_ROOT,
        ...(fixturesDir === undefined ? {} : { fixturesDir }),
      })

  const rows = []
  for (const definition of QA_ROWS) {
    if (definition.lane === 'hooks') {
      const result = hookResults.find((row) => row.client === definition.client)
      const { inputs, missing } = hashFixtureInputs(definition.client, result?.fixture)
      if (options.skipHooks) {
        rows.push(buildRow({ id: definition.id, status: 'not-run', reason: 'the hook lane was skipped (--skip-hooks)', inputs }))
        continue
      }
      if (result === undefined) {
        rows.push(
          buildRow({
            id: definition.id,
            status: 'not-run',
            reason: `client "${definition.client}" was not in --clients`,
            inputs,
          }),
        )
        continue
      }
      const missingNote = missing.length === 0 ? '' : ` (fixture inputs absent: ${missing.join(', ')})`
      // The client's own version string leads the reason: a hook result is a property of the PAIR
      // — this engine's emitted wiring and that client build — so a row read a release later
      // without it cannot tell whether the client moved or the wiring did.
      const versionNote = result.binaryVersion === undefined ? '' : `${result.binary} ${result.binaryVersion}; `
      rows.push(
        buildRow({
          id: definition.id,
          status: result.status,
          reason: `${versionNote}${result.command === undefined ? '' : `${result.command} → ${exitDescription({ status: result.exitCode, signal: result.signal })}; `}${result.reason}${missingNote}`,
          inputs,
        }),
      )
      continue
    }

    const pageInputs = pageHashes.inputs
    const missingNote =
      missingPages.length === 0
        ? undefined
        : `pages missing from the build: ${missingPages.join(', ')}`
    if (missingNote !== undefined) {
      rows.push(buildRow({ id: definition.id, status: 'failed', reason: missingNote, inputs: pageInputs }))
      continue
    }
    if (definition.lane === 'a11y') {
      rows.push(a11yRowFor({ results: a11yResults, pageInputs, skipped: browserSkipReason }))
      continue
    }
    rows.push(keyboardRowFor({ definition, results: keyboardResults, pageInputs, skipped: browserSkipReason }))
  }

  const evidence = {
    sha,
    timestamp: new Date().toISOString(),
    harness,
    rows: carryForward(previousEvidence(out), rows),
  }

  mkdirSync(resolve(out, '..'), { recursive: true })
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

  process.stdout.write(`[qa] evidence written to ${out}\n`)
  for (const row of evidence.rows) {
    process.stdout.write(`  ${row.row.padEnd(4)} ${row.status.padEnd(12)} ${row.reason}\n`)
  }
  return evidence
}

if (process.argv[1] === SELF) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[qa] the harness could not complete: ${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
