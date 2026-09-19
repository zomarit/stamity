#!/usr/bin/env node
import { prepareNativeTypescriptCli } from './native-typescript.mjs'

if (prepareNativeTypescriptCli(import.meta.url, { label: 'signing script' })) {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0].startsWith('--')) {
    console.error('Usage: node scripts/sign-pack.mjs <pack-directory>')
    process.exitCode = args[0] === '--help' && args.length === 1 ? 0 : 2
  } else {
    try {
      const { signPack } = await import('../src/pack/sign.ts')
      const result = await signPack(args[0])
      console.log(`Signed and verified ${result.bundlePath}; aggregate SHA-256 ${result.aggregateSha}`)
    } catch (error) {
      // An EngineError is this repository's own refusal. Its message is written for a reader,
      // names no provider text and carries no credential, so printing it tells an author which
      // gate refused. Every other error may come from the signing provider, whose message can
      // contain an identity token or a request body: those keep the generic line.
      const { EngineError } = await import('../src/types/errors.ts')
      console.error(error instanceof EngineError
        ? `sign-pack: ${error.code}: ${error.message} No successful signing is claimed.`
        : 'sign-pack: failed; check pack integrity, signer, bundle path and authorized Sigstore access. No successful signing is claimed.')
      process.exitCode = 1
    }
  }
}
