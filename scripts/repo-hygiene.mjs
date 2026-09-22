#!/usr/bin/env node
// Offline Git-index policy. Runtime files are always checked, including git add -f.
// --base rejects new raw evidence and growth above the size budget. Existing large files
// may stay unchanged or shrink; historical payload paths are grandfathered.
// New archive pointers are checked from staged bytes, never an unstaged working-tree replacement.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const MAX_FILE_BYTES = 1024 * 1024
// Exact repository-relative paths only. An exception needs its reviewable reason here,
// never a broad extension exemption or an automatically raised size ceiling.
const LARGE_FILE_EXCEPTIONS = new Map([
  // Two entries, one retention window. Each is an eval run's public summary: 102 coverage cases at
  // three samples each, carrying the cited span of every binding verdict, which the NEXT run's
  // incremental composition reads from the retention commit of the run it composes with — run 31
  // read run 30's that way (composition.priorSummaryCommit 68b57ef), and run 32 reads run 31's.
  // That is why run 31's entry stays when the run of record moves to run 32: run 32 composes with
  // run 31, so both summaries are load-bearing until the 1.9.0 close, whose archive step compacts
  // both. Run 30's summary is the worked precedent — it landed at 3418596 bytes in 68b57ef
  // (2026-09-15) before this gate existed and the archive step at the 1.8.0 close compacted it to
  // 112695 bytes (05cb4ef). Verify: git cat-file -s 68b57ef:evals/runs/2026-09-15-run-30/summary.json
  //
  // An entry may precede its artifact: the map is consulted only for paths Git reports as changed
  // (the `has` below), never iterated and never stat'd, so an entry for a path not yet in the tree
  // is inert rather than a false pass. Run 32's summary is expected under the path named here; if
  // the run lands under another id, this entry buys nothing and the gate refuses the real file.
  ['evals/runs/2026-09-21-run-31/summary.json', 'prior complete run summary that run 32 composes with, retained until the 1.9.0 close archives both'],
  ['evals/runs/2026-09-22-run-32/summary.json', '1.9.0 release run summary, retained until the release-close archive step compacts it'],
])
const FIXTURE = /^(?:test|tests)\/fixtures\//
const RAW_NAME = /^(?:calls|samples|requests|responses|receipts|transcripts|provider[-_](?:requests|responses))\.(?:json|jsonl)$/
const RUNNER_PAYLOAD = /^(?:[^/]*-attempt-[^/]*|sample-[^/]*|isolation-[^/]*)\.json$/
const PAYLOAD = /(?:^|\/)(?:calls|captures)\/|\.(?:input|output)\.txt$|\.(?:tar(?:\.gz)?|tgz|zip|zst)$/
const PID = /(?:^|\/)[^/]+\.pid(?:\.lock)?(?:\/|$)/
const paths = output => output.split('\0').filter(Boolean)
const relative = path => typeof path === 'string' && path.length > 0 &&
  !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '')

function runtime(path, kind) {
  if (FIXTURE.test(path)) return false
  return /(?:^|\/)(?:node_modules|__pycache__|\.venv|\.pytest_cache|\.cache)\//.test(path) ||
    /^(?:dist|coverage|website\/(?:build|\.docusaurus))\//.test(path) ||
    /^\.claude\/(?:worktrees\/|settings\.local\.json$)/.test(path) ||
    /^\.stamity\/(?:upstream-work\/|_(?:scratch|runtime)\/|review-gate\.json(?:$|\.lock(?:\/|$)|\.tmp-))/.test(path) ||
    PID.test(path) ||
    (kind === 'governance' && (
      /^runs\/(?:[^/]+\/)*app-server-schema\//.test(path) ||
      /^(?:runs\/.*\/_(?:scratch|runtime)\/|runs\/.*\/claude-run\/run[^/]*\/(?:lock(?:\/|$)|detached\.log$))/.test(path)))
}

function rawEvidence(path, kind) {
  const publicRun = path.startsWith('evals/runs/')
  const privateRun = kind === 'governance' && path.startsWith('runs/')
  if (!publicRun && !privateRun) return false
  const name = path.split('/').at(-1)
  if (PAYLOAD.test(path) || RAW_NAME.test(name) || RUNNER_PAYLOAD.test(name)) return true
  return privateRun && (
    /\/claude-run\/run[^/]*\/(?:state\.json|(?:stdout|stdin)\.jsonl|(?:task|transcript|ambient|system)\.txt)$/.test(path) ||
    /\/driver\/(?:raw\/|(?:state|input-snapshot)\.json$|(?:[^/]+\/)*[^/]+\.state-before\.json$)/.test(path) ||
    /\/preflight\/(?:[^/]+\/)*(?:before-files\/|coverage-tests\.json$)/.test(path) ||
    /^runs\/[^/]+\/(?:closeout\/)?[^/]+\.journal\.jsonl$/.test(path) ||
    /^runs\/[^/]+\/eval-run-[^/]+\.json$/.test(path) ||
    /\/(?:a11y(?:-final)?|screenshots)\/(?:axe[^/]*\.json|[^/]+\.png)$/.test(path))
}

function validManifest(value) {
  const source = value?.source, archive = value?.archive
  if (value?.schemaVersion !== 1 || value.format !== 'tar.gz' ||
      !/^[\w.-]+\/[\w.-]+$/.test(source?.repository ?? '') ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source?.commit ?? '') ||
      !['git', 'working-tree'].includes(source?.capture) ||
      !Array.isArray(source?.paths) || source.paths.length === 0 || !source.paths.every(relative) ||
      !/^[\w.-]+\.tar\.gz$/.test(archive?.file ?? '') ||
      !/^[a-f0-9]{64}$/.test(archive?.sha256 ?? '') ||
      !Number.isSafeInteger(archive?.bytes) || archive.bytes <= 0 ||
      !Number.isSafeInteger(value.files) || value.files <= 0 ||
      !Number.isSafeInteger(value.payloadBytes) || value.payloadBytes < 0) return false
  try {
    const url = new URL(archive.url)
    const prefix = `/${source.repository}/releases/download/`
    const tail = url.pathname.slice(prefix.length).split('/')
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname.startsWith(prefix) &&
      tail.length === 2 && tail[0].length > 0 && decodeURIComponent(tail[1]) === archive.file
  } catch {
    // Invalid URLs are a manifest finding; never interpolate untrusted manifest contents.
    return false
  }
}

function main(args) {
  const options = { repo: process.cwd(), base: null, kind: null }
  for (let i = 0; i < args.length; i++) {
    const key = args[i]?.slice(2)
    if (!['repo', 'base', 'kind'].includes(key) || !args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('usage: node scripts/repo-hygiene.mjs [--repo PATH] [--base REF] [--kind public|governance]')
    options[key] = args[++i]
  }
  if (options.kind !== null && !['public', 'governance'].includes(options.kind)) throw new Error('invalid repository kind')
  const git = (...argv) => execFileSync('git', ['-C', resolve(options.repo), ...argv], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  })
  const entries = new Map(paths(git('ls-files', '--stage', '-z')).map(row => {
    const tab = row.indexOf('\t'), [mode, oid, stage] = row.slice(0, tab).split(' ')
    if (stage !== '0') throw new Error('unmerged index; resolve conflicts before checking hygiene')
    return [row.slice(tab + 1), { mode, oid }]
  }))
  const kind = options.kind ?? (entries.has('CONSTITUTION.md') && entries.has('EVIDENCE.md') ? 'governance' : 'public')
  const findings = []
  for (const path of entries.keys()) if (runtime(path, kind)) findings.push([path, 'tracked runtime/dependency/cache file'])
  let additions = []
  if (options.base !== null) {
    const base = git('rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`).trim()
    additions = paths(git('diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=A', base, '--'))
    for (const path of additions) {
      if (rawEvidence(path, kind)) findings.push([path, 'raw eval payload; publish a Release archive and commit ARCHIVE.json plus compact records'])
    }
    const addedPaths = new Set(additions)
    const changed = paths(git('diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=AMT', base, '--'))
    for (const path of changed) {
      const entry = entries.get(path)
      if (entry?.mode === '160000') continue // Gitlinks reference commits; they contain no blob to size.
      const bytes = Number(git('cat-file', '-s', entry.oid).trim())
      if (bytes <= MAX_FILE_BYTES || LARGE_FILE_EXCEPTIONS.has(path)) continue
      const before = addedPaths.has(path) ? 0 : Number(git('cat-file', '-s', `${base}:${path}`).trim())
      if (bytes > before)
        findings.push([path, `file grew from ${before} to ${bytes} bytes; budget is ${MAX_FILE_BYTES}, requires an exact-path exception with a reason`])
    }
    for (const path of changed.filter(candidate => /(?:^|\/)ARCHIVE\.json$/.test(candidate))) {
      const entry = entries.get(path)
      let valid
      try {
        valid = entry.mode === '100644' && validManifest(JSON.parse(git('cat-file', 'blob', entry.oid)))
      } catch {
        // Malformed or unreadable staged JSON is a finding, not an ignored parse failure.
        valid = false
      }
      if (!valid) findings.push([path, 'invalid archive manifest; requires source identity, hash, counts and a GitHub Release asset URL'])
    }
  }
  for (const [path, reason] of findings) console.error(`repo-hygiene: ${JSON.stringify(path)}: ${reason}`)
  console.log(`repo-hygiene: ${findings.length ? 'FAIL' : 'PASS'} — ${entries.size} tracked files; ${additions.length} additions checked${options.base === null ? '; raw-evidence/size checks need --base' : ''}`)
  return findings.length ? 1 : 0
}

try { process.exitCode = main(process.argv.slice(2)) }
catch (error) {
  // Git errors can quote arbitrary file contents; keep the diagnostic at the operation boundary.
  console.error(`repo-hygiene: could not inspect repository: ${error.status === undefined ? error.message : 'Git command failed; verify repository, base ref and index'}`)
  process.exitCode = 2
}
