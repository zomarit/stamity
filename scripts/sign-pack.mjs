#!/usr/bin/env node
import { prepareNativeTypescriptCli } from './native-typescript.mjs'

if (prepareNativeTypescriptCli(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0].startsWith('--')) {
    console.error('Usage: node scripts/sign-pack.mjs <pack-directory>')
    process.exitCode = args[0] === '--help' && args.length === 1 ? 0 : 2
  } else {
    try {
      const { signPack } = await import('../src/pack/sign.ts')
      const result = await signPack(args[0])
      console.log(`Signed and verified ${result.bundlePath}; aggregate SHA-256 ${result.aggregateSha}`)
    } catch {
      // Never echo provider errors or command arguments: either may contain a
      // credential. Library validation can be inspected locally without logs.
      console.error('sign-pack: failed; check pack integrity, signer, bundle path and authorized Sigstore access. No successful signing is claimed.')
      process.exitCode = 1
    }
  }
}
