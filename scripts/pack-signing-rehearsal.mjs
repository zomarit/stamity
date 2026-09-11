#!/usr/bin/env node
// A nonpublishing witness for the existing production signing/install APIs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './native-typescript.mjs'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))
export const PACK_NAME = 'signing-rehearsal'
export const RULE = '---\nid: signing-rehearsal\ntype: rule\ndescription: "Harmless signing verification fixture"\nglobs: ["src/**"]\n---\nUse descriptive local variable names.\n'
export const UPDATED_RULE = `${RULE}\nPrefer explicit return types at module boundaries.\n`
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

export function signingContext(env) {
  assert.match(env.SIGNING_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/)
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
  assert.equal(env.GITHUB_REPOSITORY, 'zomarit/stamity')
  assert.equal(env.GITHUB_REF, 'refs/heads/feat/package-10-finish-implementation')
  assert.equal(env.GITHUB_WORKFLOW_REF,
    'zomarit/stamity/.github/workflows/pack-signing-rehearsal.yml@refs/heads/feat/package-10-finish-implementation')
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/)
  return {
    sourceSha: env.SIGNING_SOURCE_SHA, executionSha: env.GITHUB_SHA,
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
  const paths = execFileSync('git', ['ls-files', '-z', 'src', 'package.json', 'package-lock.json',
    'scripts/sign-pack.mjs', 'scripts/native-typescript.mjs'], { cwd: SOURCE, encoding: 'utf8' }).split('\0').filter(Boolean)
  const inputs = await Promise.all(paths.map(async (path) => ({ path, sha256: sha256(await readFile(join(SOURCE, path))) })))
  inputs.push({ path: 'scripts/pack-signing-rehearsal.mjs', sha256: sha256(await readFile(fileURLToPath(import.meta.url))) })
  await json(join(root, 'inputs.json'), { ...context, inputs })
}

async function sign(root, context) {
  assert.deepEqual(await readJson(join(root, 'context.json')), context)
  const { signPack } = await import('../src/pack/sign.ts')
  const results = []
  /* oxlint-disable no-await-in-loop -- Persist each completed signing result before starting the next external signing operation. */
  for (const revision of ['revision1', 'revision2']) {
    const pack = join(root, 'packs', revision)
    // No substitute signing service, verifier, identity token or trust root.
    const result = await signPack(pack)
    results.push({ revision, ...result, bundleSha256: sha256(await readFile(join(pack, result.bundlePath))) })
    await json(join(root, 'signing.json'), { ...context, complete: results.length === 2, results })
  }
  /* oxlint-enable no-await-in-loop */
  assert.notEqual(results[0].aggregateSha, results[1].aggregateSha)
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
  const setup = createManifest({ tools: ['claude'], generatorVersion: '1.7.0', now: new Date(0),
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

if (isMain(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3)
    const context = signingContext(process.env)
    const root = resolve(SOURCE, 'rehearsal')
    const action = { prepare, sign, verify }[process.argv[2]]
    assert.equal(typeof action, 'function')
    await action(root, context)
    console.log(`pack-signing-rehearsal: ${process.argv[2]} passed`)
  } catch {
    // Provider exception text may carry tokens; preserve only nonsecret receipts.
    console.error('pack-signing-rehearsal: failed; inspect the retained nonsecret inputs and stage receipts.')
    process.exitCode = 1
  }
}
