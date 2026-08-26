#!/usr/bin/env node
// Supply-chain currency probe: dependency advisories, published advisories against the pinned
// MCP catalog rows, and the deprecation and staleness of those pins.
//
// A pin is an immutability guarantee, and that is exactly why it cannot be a currency guarantee.
// npm forbids republishing a version with different bytes, so `@upstash/context7-mcp@2.1.1` will
// be the same code forever — including on the day an advisory lands against it, or the day the
// package is deprecated, or the day the row's launcher is renamed. Nothing in the catalog can
// learn any of that on its own, so the duty has to be an active one that runs on a schedule.
//
// The catalog rows are NOT declared dependencies — nothing in package.json mentions them, and
// `npm audit` therefore reports on none of them. `npm audit` alone was the whole of this probe,
// which meant the advisory gate over the nine curated servers did not exist: a published CVE
// against a pinned server was invisible here forever. The OSV query below is that gate. OSV
// aggregates GHSA and the npm advisory feed, takes an exact `name@version`, needs no API key,
// and answers in one batched POST.
//
// Advisory by design, not blocking. A published CVE against a pinned server is information the
// maintainer must act on with judgement (bump the pin, drop the row, document the exposure); it
// is not a reason to fail a push to `main`. Every finding is ALSO emitted as a workflow warning
// annotation and appended to the step summary, because a finding that lives only in a raw log
// nobody opens is a probe that reports to itself.
//
// Exit codes: 0 probe completed (findings printed, if any), 2 the probe could not run.

// The catalog is TypeScript and there is no build step here on purpose — a probe that needs
// `npm run build` first goes stale the moment someone skips the build. Node strips the types
// itself from v22.18 onward; on the repo's declared floor (22.12) the same capability sits
// behind --experimental-strip-types, so this script re-execs itself once with the flag rather
// than dying at the catalog import and reporting the breakage as "the probe could not run".
// CI hid that by pinning this job to a newer Node, which is exactly the shape of gap the probe
// exists to find in other people's dependencies.
//
// Three sibling generators carry this same preamble. Extracting it to a shared scripts/ module
// is the right shape and is deferred here: those three files belong to another change in flight,
// and duplicating the block is preferable to a half-migrated pair of spellings.
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)

// True only when this file is the process entrypoint (run as a CLI), false when imported. Both
// the native-strip re-exec below and the main() invocation at the bottom are CLI-only concerns:
// a test that imports `osvQueryBatch` on a Node without native type-stripping (the 22.12 CI floor)
// must NOT trigger the re-exec, which would call process.exit inside the vitest worker. vitest
// transforms TypeScript itself, so the import needs no re-exec regardless of the host Node.
const IS_MAIN = process.argv[1] !== undefined && resolve(process.argv[1]) === SELF

if (IS_MAIN && !process.features.typescript) {
  // Re-exec once, never twice: a Node build that still cannot strip types with the flag on
  // would otherwise respawn itself forever.
  if (process.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `advisory-check: ERROR - this Node build (${process.version}) cannot strip TypeScript ` +
        'types, so the MCP catalog cannot be loaded. Run the probe on Node >=22.12.',
    )
    process.exit(2)
  }
  const child = spawnSync(
    process.execPath,
    // The caller's own execArgv is forwarded: a flag someone passed deliberately (`--import`,
    // an inspector) must survive the re-exec, or the re-exec silently changes what runs.
    [
      ...process.execArgv,
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      SELF,
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
  // A signalled child has no status; 2 is the honest "did not complete".
  process.exit(child.status ?? 2)
}

// The registry probes below run one at a time on purpose: this is a courtesy
// scan against a public registry, and fanning ten concurrent requests at it to
// save two seconds in a weekly job is the wrong trade. The advisory lookup is
// the exception and is deliberately ONE batched request for every row at once.
/* oxlint-disable no-await-in-loop */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const REGISTRY_TIMEOUT_MS = 15_000

/** Age past which the catalog's sweep date is reported as stale. */
const CATALOG_MAX_AGE_DAYS = 90

/**
 * Age past which a single row's pin is reported as unreviewed. Shorter than the sweep window:
 * confirming the row set is still the right set is a cheaper act than re-reading nine upstream
 * versions, and the whole point of splitting the two dates is that the cheap one cannot vouch
 * for the expensive one.
 */
const PIN_MAX_AGE_DAYS = 60

async function loadCatalog() {
  const catalog = await import('../src/mcp/catalog.ts')
  return {
    servers: catalog.CURATED_MCP_SERVERS,
    verifiedOn: catalog.CATALOG_VERIFIED_ON,
    pinnedPackageSpec: catalog.pinnedPackageSpec,
  }
}

function npmAudit() {
  try {
    const stdout = execFileSync('npm', ['audit', '--json', '--audit-level=low'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return JSON.parse(stdout)
  } catch (error) {
    // `npm audit` exits non-zero WHEN IT FINDS SOMETHING, which is the case this probe exists to
    // report — the JSON is on stdout either way, so a parse failure is the only real error.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      try {
        return JSON.parse(error.stdout)
      } catch {
        /* fall through to the null answer below */
      }
    }
    return null
  }
}

/** Registry metadata for one exact `name@version`, or `null` when it cannot be read. */
async function packument(name) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json, application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Published advisories against each `{ name, version }`, keyed `name@version`.
 *
 * One batched POST to OSV, which aggregates GHSA and the npm feed and needs no credential. The
 * failure answer is `null`, NEVER an empty result: a lookup that could not run and a lookup that
 * found nothing are the same shape on the wire and opposite facts on the ground, and reporting
 * the first as the second is how a supply-chain gate goes quietly green while it is broken.
 */
export async function osvQueryBatch(specs) {
  if (specs.length === 0) return {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
  try {
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        queries: specs.map((spec) => ({
          package: { name: spec.name, ecosystem: 'npm' },
          version: spec.version,
        })),
      }),
    })
    if (!response.ok) return null
    const body = await response.json()
    // Results align with `queries` by INDEX; a row with no advisory comes back as `{}`.
    if (!Array.isArray(body?.results) || body.results.length !== specs.length) return null
    const bySpec = {}
    for (const [index, spec] of specs.entries()) {
      const vulns = body.results[index]?.vulns
      bySpec[`${spec.name}@${spec.version}`] = Array.isArray(vulns)
        ? vulns.map((vuln) => String(vuln?.id ?? 'unknown')).filter(Boolean)
        : []
    }
    return bySpec
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function daysSince(isoDate) {
  const then = Date.parse(isoDate)
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/**
 * Surface `findings` where a maintainer actually looks: one `::warning` annotation each (the
 * run list, the checks tab, the job summary panel) plus a Markdown block in the step summary.
 * Outside Actions both are no-ops, so a local run is unchanged.
 *
 * Exit status stays 0 by design — the lane is advisory. Annotations are how a non-blocking lane
 * reports without blocking; writing to the log alone is how it reports to nobody.
 */
function annotate(findings) {
  for (const finding of findings) {
    // Annotation text is one line: a literal newline would end the command.
    console.log(`::warning title=Supply-chain currency::${String(finding).replaceAll('\n', ' ')}`)
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (typeof summaryPath !== 'string' || summaryPath === '') return
  const body =
    findings.length === 0
      ? '### Supply-chain currency\n\nNo findings.\n'
      : `### Supply-chain currency — ${findings.length} finding(s)\n\n` +
        `${findings.map((finding) => `- ${finding}`).join('\n')}\n\n` +
        'Advisory only: this lane does not block. Act by bumping a pin, dropping a row, or ' +
        'recording the exposure; then move that row\'s `pinReviewedOn`.\n'
  try {
    appendFileSync(summaryPath, body)
  } catch (error) {
    // A summary that cannot be written must not take the probe down with it.
    console.log(`advisory-check: step summary not written (${error.message})`)
  }
}

async function main() {
  const findings = []
  const { servers, verifiedOn, pinnedPackageSpec } = await loadCatalog()

  // ── 1. Declared dependencies ───────────────────────────────────────────────
  const audit = npmAudit()
  if (audit === null) {
    findings.push('npm audit could not be read — dependency advisories were NOT checked this run')
  } else {
    const totals = audit.metadata?.vulnerabilities ?? {}
    const count = Object.entries(totals)
      .filter(([severity]) => severity !== 'info' && severity !== 'total')
      .reduce((sum, [, n]) => sum + (typeof n === 'number' ? n : 0), 0)
    if (count > 0) {
      const breakdown = Object.entries(totals)
        .filter(([severity, n]) => severity !== 'total' && typeof n === 'number' && n > 0)
        .map(([severity, n]) => `${n} ${severity}`)
        .join(', ')
      findings.push(`npm audit reports ${count} advisory(ies) against declared dependencies: ${breakdown}`)
    }
  }

  // ── 2. Advisories against the exact-pinned MCP catalog ─────────────────────
  // Which rows have a registry identity is the CATALOG's answer, read from its exported
  // launcher helper. The heuristic this replaces — "an argument contains an @" — matched a
  // scoped package name and a URL and would have quietly widened or narrowed with the args.
  const fetchRows = Object.values(servers).filter((meta) => pinnedPackageSpec(meta) !== undefined)
  const specs = fetchRows.map((meta) => ({
    id: meta.id,
    name: meta.packageNameLock,
    version: meta.pinnedVersion,
  }))

  const advisories = await osvQueryBatch(specs)
  if (advisories === null) {
    findings.push(
      `the OSV advisory lookup failed for all ${specs.length} pinned MCP package(s) — ` +
        'published advisories against the catalog were NOT checked this run',
    )
  } else {
    for (const spec of specs) {
      const ids = advisories[`${spec.name}@${spec.version}`] ?? []
      if (ids.length > 0) {
        findings.push(
          `${spec.id}: ${ids.length} published advisory(ies) against ` +
            `${spec.name}@${spec.version} — ${ids.join(', ')} (osv.dev/vulnerability/${ids[0]})`,
        )
      }
    }
  }

  // ── 3. Deprecation and staleness of those pins ─────────────────────────────
  // Host-installed launchers are the operator's binary and have nothing here to probe.
  let probed = 0
  for (const meta of fetchRows) {
    const doc = await packument(meta.packageNameLock)
    if (doc === null) {
      findings.push(`${meta.id}: registry metadata for ${meta.packageNameLock} could not be read — pin currency NOT checked`)
      continue
    }
    probed += 1

    const pinned = doc.versions?.[meta.pinnedVersion]
    if (pinned === undefined) {
      findings.push(`${meta.id}: pinned ${meta.packageNameLock}@${meta.pinnedVersion} is no longer published`)
      continue
    }
    if (pinned.deprecated !== undefined) {
      findings.push(`${meta.id}: ${meta.packageNameLock}@${meta.pinnedVersion} is DEPRECATED upstream — "${String(pinned.deprecated).slice(0, 160)}"`)
    }
    const latest = doc['dist-tags']?.latest
    if (typeof latest === 'string' && latest !== meta.pinnedVersion) {
      findings.push(`${meta.id}: pinned at ${meta.pinnedVersion}, latest is ${latest} — review the diff before bumping`)
    }
  }

  // ── 4. The two dates ───────────────────────────────────────────────────────
  // Per row first: a fresh sweep must not be able to imply a fresh pin, which is the whole
  // reason the one constant became two fields.
  for (const meta of Object.values(servers)) {
    if (typeof meta.pinReviewedOn !== 'string' || meta.pinReviewedOn === '') {
      findings.push(`${meta.id}: no pinReviewedOn — this pin has never been recorded as read off upstream`)
      continue
    }
    const pinAge = daysSince(meta.pinReviewedOn)
    if (pinAge === null) {
      findings.push(`${meta.id}: pinReviewedOn is not a readable date (${meta.pinReviewedOn})`)
    } else if (pinAge > PIN_MAX_AGE_DAYS) {
      findings.push(
        `${meta.id}: pin last read off upstream ${pinAge} days ago (${meta.pinReviewedOn}), ` +
          `over the ${PIN_MAX_AGE_DAYS}-day window — re-read the version and move the row's date`,
      )
    }
  }

  const age = daysSince(verifiedOn)
  if (age === null) {
    findings.push(`CATALOG_VERIFIED_ON is not a readable date (${verifiedOn})`)
  } else if (age > CATALOG_MAX_AGE_DAYS) {
    findings.push(`the catalog row set was last swept ${age} days ago (${verifiedOn}), over the ${CATALOG_MAX_AGE_DAYS}-day window — walk the rows and move the date`)
  }

  annotate(findings)

  if (findings.length === 0) {
    console.log(
      `advisory-check: CLEAN - 0 findings across declared dependencies and ${probed} pinned MCP ` +
        `package(s), ${specs.length} of which were queried for published advisories; row set ` +
        `swept ${age} day(s) ago`,
    )
    return 0
  }

  console.log(`advisory-check: ${findings.length} finding(s) — advisory only, this gate does not block`)
  for (const finding of findings) console.log(`  - ${finding}`)
  console.log("  Act by bumping a pin, dropping a row, or recording the exposure; then move that row's pinReviewedOn.")
  return 0
}

// Run only when executed, never when imported. `osvQueryBatch` is exported so its failure
// answers can be asserted directly — importing it must not fire a registry sweep as a side
// effect, and the distinction between "found nothing" and "could not look" is the one property
// of this probe that a source read cannot verify.
if (IS_MAIN) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`advisory-check: ERROR - ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
