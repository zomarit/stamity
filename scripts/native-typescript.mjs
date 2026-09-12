import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One entrypoint check for scripts which also support side-effect-free imports. */
export function isMain(metaUrl, argv = process.argv) {
  if (argv[1] === undefined) return false
  const target = fileURLToPath(metaUrl)
  if (resolve(argv[1]) === target) return true
  try {
    return realpathSync(argv[1]) === realpathSync(target)
  } catch {
    return false
  }
}

/**
 * Prepare a directly invoked TypeScript-consuming script before its dynamic imports.
 * Node >=22.22.2 strips types natively. Older contributor hosts get one attempt
 * with the native flag; imports never spawn, terminate the caller, or load TS.
 * Runtime/spawn injection proves unsupported-host and signalled-child behavior.
 */
export function prepareNativeTypescriptCli(metaUrl, options = {}) {
  const { failureCode = 1, label = 'generator', runtime = process, spawn = spawnSync } = options
  if (!isMain(metaUrl, runtime.argv)) return false
  if (runtime.features.typescript) return true
  if (runtime.execArgv.includes('--experimental-strip-types')) {
    console.error(
      `This Node build (${runtime.version}) cannot strip TypeScript types. ` +
      `Run the ${label} on Node >=22.22.2.`,
    )
    runtime.exit(failureCode)
    return false
  }
  const child = spawn(runtime.execPath, [
    ...runtime.execArgv,
    '--experimental-strip-types',
    '--disable-warning=ExperimentalWarning',
    fileURLToPath(metaUrl),
    ...runtime.argv.slice(2),
  ], { stdio: 'inherit' })
  runtime.exit(child.status ?? failureCode)
  return false
}
