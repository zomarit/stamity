#!/usr/bin/env node
// A nonpublishing witness for the existing production signing/install APIs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareNativeTypescriptCli } from './native-typescript.mjs'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
export const PACK_NAME = 'signing-rehearsal'
export const RULE = '---\nid: signing-rehearsal\ntype: rule\ndescription: "Harmless signing verification fixture"\nglobs: ["src/**"]\n---\nUse descriptive local variable names.\n'
export const UPDATED_RULE = `${RULE}\nPrefer explicit return types at module boundaries.\n`
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

// [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] probe state and print filters: fixed names, integers and
// allowlisted identifier codes only; no error message, body, URL or header text is ever stored or printed.
const PROBE_TAG = '[STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal]'
const PROBE_HOSTS = new Map([['fulcio.sigstore.dev', 'fulcio'], ['rekor.sigstore.dev', 'rekor'], ['tuf-repo-cdn.sigstore.dev', 'tuf']])
const PROBE_ATTEMPT = /^(?:GET|POST|PUT|PATCH|DELETE) https:\/\/([a-z0-9.-]+)(?:[/?]\S*)? attempt (\d{1,3}) failed with (.*)$/s
const probe = { revision: undefined, stage: undefined, startedAt: undefined, attempts: [], provider: undefined }
const safeCode = (v) => {
  if (v === undefined || v === null) return '-'
  return typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(v) ? v : 'unprintable'
}
const safeStatus = (v) => (Number.isInteger(v) && v >= 100 && v <= 599 ? v : '-')
const hostLabel = (host) => PROBE_HOSTS.get(host) ?? 'other'
const providerFacts = (error) => ({
  code: safeCode(error?.code), causeCode: safeCode(error?.cause?.code),
  causeStatus: safeStatus(error?.cause?.statusCode ?? error?.statusCode),
})
const probeAttempts = () => (probe.attempts.length === 0 ? 'none'
  : probe.attempts.map(({ host, attempt, outcome, atMs }) => `${host}:${attempt}:${outcome}@${atMs}`).join(','))
const probeElapsed = () => (probe.startedAt === undefined ? '-' : Math.round(performance.now() - probe.startedAt))
const probeLog = (level, ...args) => {
  if (level !== 'http' || args[0] !== 'fetch' || typeof args[1] !== 'string') return
  const m = PROBE_ATTEMPT.exec(args[1])
  if (m === null) return
  probe.attempts.push({ host: hostLabel(m[1]), attempt: Number(m[2]), outcome: /^\d{3}$/.test(m[3]) ? m[3] : 'network',
    atMs: probe.startedAt === undefined ? 0 : Math.round(performance.now() - probe.startedAt) })
}

/**
 * The rehearsal signs the commit it runs on, so its proof witnesses the code that ships.
 * SIGNING_SOURCE_SHA remains readable for a run that must witness an earlier reviewed commit;
 * the workflow sets no such pin, and the workflow test refuses any pin that main cannot reach.
 */
export function signingContext(env) {
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  const sourceSha = env.SIGNING_SOURCE_SHA ?? env.GITHUB_SHA
  assert.match(sourceSha, /^[a-f0-9]{40}$/)
  assert.equal(env.GITHUB_REPOSITORY, 'zomarit/stamity')
  assert.equal(env.GITHUB_REF, 'refs/heads/main')
  assert.equal(env.GITHUB_WORKFLOW_REF,
    'zomarit/stamity/.github/workflows/pack-signing-rehearsal.yml@refs/heads/main')
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/)
  return {
    sourceSha, executionSha: env.GITHUB_SHA,
    workflowRef: env.GITHUB_WORKFLOW_REF, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    signer: `https://token.actions.githubusercontent.com https://github.com/${env.GITHUB_WORKFLOW_REF}`,
  }
}

export async function prepareFixtures(root, context) {
  await mkdir(root, { recursive: false })
  await Promise.all([['revision1', '1.0.0', RULE], ['revision2', '1.0.1', UPDATED_RULE]].map(async ([revision, version, body]) => {
    const pack = join(root, 'packs', revision)
    await mkdir(join(pack, 'rules'), { recursive: true })
    await writeFile(join(pack, 'rules/example.md'), body)
    await json(join(pack, 'pack.json'), {
      name: PACK_NAME, version, integrity: { 'rules/example.md': sha256(body) },
      signing: { method: 'sigstore', signer: context.signer, bundlePath: 'pack.sigstore.json' },
    })
  }))
  await json(join(root, 'context.json'), context)
}

async function prepare(root, context) {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SOURCE, encoding: 'utf8' }).trim(), context.sourceSha)
  await prepareFixtures(root, context)
  const paths = execFileSync('git', ['ls-files', '-z', 'src', 'content', 'package.json', 'package-lock.json',
    'scripts/sign-pack.mjs', 'scripts/native-typescript.mjs'], { cwd: SOURCE, encoding: 'utf8' }).split('\0').filter(Boolean)
  const inputs = await Promise.all(paths.map(async (path) => ({ path, sha256: sha256(await readFile(join(SOURCE, path))) })))
  inputs.push({ path: 'scripts/pack-signing-rehearsal.mjs', sha256: sha256(await readFile(fileURLToPath(import.meta.url))) })
  await json(join(root, 'inputs.json'), { ...context, inputs })
}

async function sign(root, context) {
  // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] stage marker
  probe.stage = 'context'
  assert.deepEqual(await readJson(join(root, 'context.json')), context)
  // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] stage marker
  probe.stage = 'import'
  const { signPack } = await import('../src/pack/sign.ts')
  // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] real-client wrappers: each loads the same sigstore function
  // signPack and verifySigstoreBundle load by default, calls it with unchanged arguments, records the stage and the
  // allowlisted error codes, and rethrows the same error unchanged.
  const signFn = async (payload) => {
    probe.stage = 'sign-call'
    const { sign: realSign } = await import('sigstore')
    try {
      const bundle = await realSign(payload)
      probe.stage = 'after-sign-call'
      return bundle
    } catch (error) {
      probe.provider = providerFacts(error)
      throw error
    }
  }
  const verifyFn = async (bundle, payload, options) => {
    probe.stage = 'verify-call'
    const { verify: realVerify } = await import('sigstore')
    try {
      const signer = await realVerify(bundle, payload, options)
      probe.stage = 'after-verify'
      return signer
    } catch (error) {
      probe.provider = providerFacts(error)
      throw error
    }
  }
  // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] failed-attempt listener, removed in the finally below
  process.on('log', probeLog)
  try {
    const results = []
    /* oxlint-disable no-await-in-loop -- Persist each completed signing result before starting the next external signing operation. */
    for (const revision of ['revision1', 'revision2']) {
      // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] per-revision reset
      Object.assign(probe, { revision, stage: 'sign-pack', startedAt: performance.now(), attempts: [], provider: undefined })
      const pack = join(root, 'packs', revision)
      // No substitute signing service, verifier, identity token or trust root.
      // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] signFn and verifyFn call the real client with unchanged arguments.
      const result = await signPack(pack, { signFn, verifyFn })
      // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] stage marker
      probe.stage = 'bundle-digest'
      results.push({ revision, ...result, bundleSha256: sha256(await readFile(join(pack, result.bundlePath))) })
      // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] stage marker
      probe.stage = 'signing-record'
      await json(join(root, 'signing.json'), { ...context, complete: results.length === 2, results })
      // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] per-revision success line
      console.error(`${PROBE_TAG} scripts/pack-signing-rehearsal.mjs:145 sign-revision-ok sign ${revision} ok elapsedMs=${probeElapsed()} attempts=${probeAttempts()}`)
    }
    /* oxlint-enable no-await-in-loop */
    // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] stage marker
    probe.stage = 'final-compare'
    assert.notEqual(results[0].aggregateSha, results[1].aggregateSha)
  } finally {
    // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] listener removal
    process.off('log', probeLog)
  }
}

/** Uses the actual planning API; never applies a negative plan. */
export async function negativeControls(root, project, planPackInstall, options = {}) {
  const negatives = [
    ['changed-bytes', 'revision1', async (pack) => writeFile(join(pack, 'rules/example.md'), UPDATED_RULE), /failed integrity verification/],
    ['changed-payload', 'revision1', async (pack) => {
      await writeFile(join(pack, 'rules/example.md'), UPDATED_RULE)
      const manifest = await readJson(join(pack, 'pack.json'))
      manifest.integrity['rules/example.md'] = sha256(UPDATED_RULE)
      await json(join(pack, 'pack.json'), manifest)
    }, /publisher-signed claim refused/],
    ['wrong-identity', 'revision1', async (pack) => {
      const manifest = await readJson(join(pack, 'pack.json'))
      manifest.signing.signer += '-wrong-identity'
      await json(join(pack, 'pack.json'), manifest)
    }, /publisher-signed claim refused/],
    ['malformed-bundle', 'revision1', async (pack) => writeFile(join(pack, 'pack.sigstore.json'), '{}\n'), /publisher-signed claim refused/],
    ['stale-update-signature', 'revision2', async (pack) =>
      cp(join(root, 'packs/revision1/pack.sigstore.json'), join(pack, 'pack.sigstore.json')), /publisher-signed claim refused/],
  ]
  return Promise.all(negatives.map(async ([name, revision, mutate, message]) => {
    const pack = join(root, 'negatives', name)
    await cp(join(root, 'packs', revision), pack, { recursive: true, errorOnExist: true, force: false })
    await mutate(pack)
    await assert.rejects(() => planPackInstall(project, pack, options), message)
    return { name, refused: true }
  }))
}

export async function verify(root, context, options = {}) {
  assert.deepEqual(await readJson(join(root, 'context.json')), context)
  const signing = await readJson(join(root, 'signing.json'))
  assert.equal(signing.complete, true)
  assert.equal(signing.results.length, 2)
  await Promise.all(signing.results.map(async (result) => {
    assert.match(result.revision, /^revision[12]$/)
    assert.equal(result.bundleSha256, sha256(await readFile(join(root, 'packs', result.revision, 'pack.sigstore.json'))))
  }))
  const { planPackInstall, applyPackInstall } = await import('../src/pack/install.ts')
  const { createManifest, writeManifest } = await import('../src/manifest/manifest.ts')
  const project = join(root, 'consumer')
  await mkdir(project)
  const setup = createManifest({ tools: ['claude'], generatorVersion: '1.8.0', now: new Date(0),
    selection: { items: { agent: [], skill: [], rule: [], command: [] } } })
  let installed = setup
  const results = []
  /* oxlint-disable no-await-in-loop -- Update must consume the installed first revision, after its negative controls preserve that state. */
  for (const [revision, expectedVersion, body] of [['revision1', '1.0.0', RULE], ['revision2', '1.0.1', UPDATED_RULE]]) {
    const pack = join(root, 'packs', revision)
    const plan = await planPackInstall(project, pack, options)
    assert.equal(plan.trustTier, 'publisher-signed')
    const applied = await applyPackInstall(project, plan, installed)
    assert.equal(applied.result.installed, true)
    installed = applied.manifest
    await writeManifest(project, installed)
    assert.equal(await readFile(join(project, '.stamity/packs', PACK_NAME, 'rules/example.md'), 'utf8'), body)
    assert.equal((await readJson(join(project, '.stamity/packs', PACK_NAME, 'receipt.json'))).version, expectedVersion)
    results.push({ revision, version: expectedVersion, trustTier: plan.trustTier, installed: true, bodySha256: sha256(body) })
    if (revision === 'revision1') {
      results.push(...await negativeControls(root, project, planPackInstall, options))
      assert.equal(await readFile(join(project, '.stamity/packs', PACK_NAME, 'rules/example.md'), 'utf8'), RULE)
    }
  }
  /* oxlint-enable no-await-in-loop */
  await json(join(root, 'verification.json'), { ...context, passed: true, results })
}

if (prepareNativeTypescriptCli(import.meta.url, { label: 'signing rehearsal' })) {
  try {
    assert.equal(process.argv.length, 3)
    const context = signingContext(process.env)
    const root = resolve(SOURCE, 'rehearsal')
    const action = { prepare, sign, verify }[process.argv[2]]
    assert.equal(typeof action, 'function')
    await action(root, context)
    console.log(`pack-signing-rehearsal: ${process.argv[2]} passed`)
  } catch (error) {
    // [STAMITY-DEBUG 2026-10-21_debug-signing-rehearsal] failure line: closed-list names, integers, allowlisted codes
    const probeAction = ['prepare', 'sign', 'verify'].includes(process.argv[2]) ? process.argv[2] : 'unknown'
    const probeStage = probeAction === 'sign' ? (probe.stage ?? '-') : probeAction
    const facts = probe.provider ?? { code: '-', causeCode: '-', causeStatus: '-' }
    console.error(`${PROBE_TAG} scripts/pack-signing-rehearsal.mjs:237 rehearsal-failed ${probeAction} failed revision=${probe.revision ?? '-'} stage=${probeStage} elapsedMs=${probeElapsed()} code=${facts.code} causeCode=${facts.causeCode} causeStatus=${facts.causeStatus} repoCode=${safeCode(error?.code)} attempts=${probeAttempts()}`)
    // Provider exception text may carry tokens; preserve only nonsecret receipts.
    console.error('pack-signing-rehearsal: failed; inspect the retained nonsecret inputs and stage receipts.')
    process.exitCode = 1
  }
}
