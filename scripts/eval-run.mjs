import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './native-typescript.mjs'
import { EvalBlocked } from './eval/instrument.mjs'
import { runEvaluation } from './eval/run.mjs'

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Manual full eval: node scripts/eval-run.mjs --run-id YYYY-MM-DD-run-N --profile codex-astra --trigger release [--capacity 4]')
    console.log('Requires committed inputs and OPENAI_API_KEY. Default profile stays claude; this transport blocks unsupported profiles without fallback. No calls occur on import.')
    return 0
  }
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    if (!['--run-id', '--profile', '--trigger', '--capacity'].includes(key) || !args[i + 1] || key in options) throw new EvalBlocked('invalid-cli-arguments')
    options[key] = args[i + 1]
  }
  const result = await runEvaluation({ root: resolve(fileURLToPath(new URL('../', import.meta.url))),
    runId: options['--run-id'], profileName: options['--profile'], trigger: options['--trigger'],
    capacity: options['--capacity'] === undefined ? 4 : Number(options['--capacity']), apiKey: process.env.OPENAI_API_KEY })
  console.log(`${result.summary.status}: ${result.directory}/RESULTS.md`)
  return result.exitCode
}

if (isMain(import.meta.url)) {
  try { process.exitCode = await main() }
  catch (error) {
    console.error(`Not done: ${error instanceof EvalBlocked ? error.code : 'runner-io-or-input-failure'}`)
    process.exitCode = 1
  }
}
