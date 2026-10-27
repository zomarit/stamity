#!/usr/bin/env node
// The cloud container leg for `ci.yml`'s `cloud-container` job (REQ-PROVE-037, REQ-PROVE-039).
// Importing it performs no I/O.
//
//   node scripts/ci/cloud-leg.mjs [--dry-run] [--profile <id>]
//
// The host builds the tree once (`npm ci`, `npm run build`), then the image below runs through
// `docker run` once per cloud profile — Claude Code's, Cursor's and Copilot's — and once more under
// `--network none`. Each run mounts the built tree read-only at `/src`, copies it (its
// `node_modules` linked, never copied) to a writable work folder inside, gives the run a temporary
// `HOME` and cache, or the cloud's own `HOME`, and runs the suite under `test/cloud/`, which needs
// no install, so the offline run works. No Docker socket, no secret and no client account reach a
// container; the host environment is not passed in, only the variables each profile names.
// `STAMITY_CLOUD_PROFILE` tells the suite which profile it runs under (`test/cloud/profiles.test.ts`).
//
// `--dry-run` prints every command the leg would run and runs none. `--profile` runs one profile
// after the build. Exit 0 when the build and every profile run passed; 1 when one failed, every
// profile still run so the log names each; 2 for an argument this script does not know, so a typo
// in the workflow is red. Every command runs from an argv, never a shell string on the host.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The image every profile runs: the full `node:24-bookworm`, not the slim one, which ships no git,
 * pinned by the digest of its multi-platform index, read from Docker Hub on 2026-10-27 at 10:31
 * UTC (the tag pushed 2026-10-22). The pin moved here from the job's `container:` key on 2026-10-18 (plan 021 file 2, unit
 * v12-container-leg), since a job inside `container:` cannot start `docker run --network none`.
 * Re-read it when bumping, and at every release (the release checklist's digest line), and rewrite
 * this date:
 *
 *   curl -sI -H "Authorization: Bearer <token>" \
 *     -H "Accept: application/vnd.oci.image.index.v1+json" \
 *     https://registry-1.docker.io/v2/library/node/manifests/24-bookworm
 *
 * (the `docker-content-digest` header; the token from auth.docker.io's anonymous pull scope).
 */
export const IMAGE = 'node:24-bookworm@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a'

/** Where the built tree is mounted, read-only, inside every run. */
export const SOURCE_MOUNT = '/src'

/** The variable that names the profile a run is under, read by the suite. */
export const PROFILE_VARIABLE = 'STAMITY_CLOUD_PROFILE'

/**
 * The cloud profiles, each a cloud machine's shape as the session start reads it: its marker, its
 * `HOME` (`empty` for a fresh empty folder, else the folder the cloud uses), its working folder
 * (`null` for a fresh one) and the variables it leaves unset. `offline` is Claude Code's profile
 * again with no network at all. The names the session start prints for each live in the suite,
 * not here, so a change to that wording moves one test file.
 */
export const PROFILES = Object.freeze([
  Object.freeze({
    id: 'claude',
    env: Object.freeze({ CLAUDE_CODE_REMOTE: 'true' }),
    home: 'empty',
    workdir: null,
    unset: Object.freeze([]),
    socket: false,
    network: 'default',
  }),
  Object.freeze({
    id: 'cursor',
    // The socket stub: a listener started at this path before the suite runs.
    env: Object.freeze({ CURSOR_AGENT_SOCKET: '/tmp/cursor-agent.sock' }),
    home: 'empty',
    workdir: null,
    unset: Object.freeze([]),
    socket: true,
    network: 'default',
  }),
  Object.freeze({
    id: 'copilot',
    env: Object.freeze({ COPILOT_AGENT_PROMPT: 'cloud leg' }),
    home: '/root',
    workdir: '/workspace',
    unset: Object.freeze(['GITHUB_TOKEN']),
    socket: false,
    network: 'default',
  }),
  Object.freeze({
    id: 'offline',
    env: Object.freeze({ CLAUDE_CODE_REMOTE: 'true' }),
    home: 'empty',
    workdir: null,
    unset: Object.freeze([]),
    socket: false,
    network: 'none',
  }),
])

/** Set in every run: no client account is probed, no update is checked. */
const RUN_ENV = Object.freeze({ STAMITY_NO_CLIENT_PROBE: '1', STAMITY_NO_UPDATE_CHECK: '1' })

/** Entries of the mounted `node_modules` never linked: caches a run writes, which the read-only mount refuses. */
const UNLINKED = Object.freeze(['.cache', '.vite', '.vitest'])

/**
 * The script a run executes under `/bin/sh` inside the container: the copy, the profile's `HOME`,
 * cache and unset variables, the Cursor socket stub where the profile has one, then the suite.
 */
export function innerScript(profile) {
  const lines = ['set -eu']
  lines.push(profile.workdir === null ? 'WORK="$(mktemp -d)"' : `WORK=${profile.workdir}`)
  lines.push(
    'mkdir -p "$WORK"',
    `tar -C ${SOURCE_MOUNT} --exclude=./node_modules -cf - . | tar -C "$WORK" -xf -`,
    'mkdir -p "$WORK/node_modules"',
    `for entry in ${SOURCE_MOUNT}/node_modules/* ${SOURCE_MOUNT}/node_modules/.[!.]*; do`,
    '  [ -e "$entry" ] || continue',
    `  case "\${entry##*/}" in ${UNLINKED.join('|')}) continue ;; esac`,
    '  ln -s "$entry" "$WORK/node_modules/"',
    'done',
    'cd "$WORK"',
  )
  lines.push(profile.home === 'empty' ? 'HOME="$(mktemp -d)"' : `HOME=${profile.home}`, 'export HOME')
  lines.push('XDG_CACHE_HOME="$(mktemp -d)"', 'export XDG_CACHE_HOME')
  for (const name of profile.unset) lines.push(`unset ${name}`)
  if (profile.socket) {
    lines.push(
      `node -e "require('node:net').createServer().listen(process.env.CURSOR_AGENT_SOCKET)" &`,
      'tries=0',
      'while [ ! -S "$CURSOR_AGENT_SOCKET" ]; do',
      '  tries=$((tries + 1))',
      '  [ "$tries" -le 100 ] || { echo "cloud-leg: the socket stub did not listen" >&2; exit 1; }',
      '  sleep 0.1',
      'done',
    )
  }
  lines.push('exec node node_modules/vitest/vitest.mjs run test/cloud')
  return lines.join('\n')
}

/** The `docker run` argument vector for one profile over the built tree at `source`. */
export function dockerArgs(profile, source) {
  const env = { [PROFILE_VARIABLE]: profile.id, ...RUN_ENV, ...profile.env }
  return [
    'run',
    '--rm',
    '--init',
    ...(profile.network === 'none' ? ['--network', 'none'] : []),
    '--security-opt',
    'no-new-privileges',
    '--mount',
    `type=bind,source=${source},target=${SOURCE_MOUNT},readonly`,
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    ...(profile.workdir === null ? [] : ['--workdir', profile.workdir]),
    '--entrypoint',
    '/bin/sh',
    IMAGE,
    '-c',
    innerScript(profile),
  ]
}

/** Every command the leg runs, in order, each `{ label, command, args }`. */
export function legCommands(source, profiles = PROFILES) {
  return [
    { label: 'install', command: 'npm', args: ['ci'] },
    { label: 'build', command: 'npm', args: ['run', 'build'] },
    { label: 'pull', command: 'docker', args: ['pull', '--quiet', IMAGE] },
    ...profiles.map((profile) => ({ label: `profile ${profile.id}`, command: 'docker', args: dockerArgs(profile, source) })),
  ]
}

/** An argument as `sh` would read it back, for the printed commands only. */
function shellQuote(arg) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}

/** The parsed arguments, or `{ error }`. */
export function parseArgs(argv) {
  const parsed = { dryRun: false, profile: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') parsed.dryRun = true
    else if (arg === '--profile') {
      const id = argv[index + 1]
      if (id === undefined || !PROFILES.some((profile) => profile.id === id)) {
        return { error: `--profile takes one of ${PROFILES.map((profile) => profile.id).join(', ')}` }
      }
      parsed.profile = id
      index += 1
    } else return { error: `unknown argument ${JSON.stringify(arg)}` }
  }
  return parsed
}

/** Runs one command with the job's own output, its exit code back; a program that did not start is 127. */
function spawnCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error !== undefined) {
    process.stderr.write(`cloud-leg: ${command} did not start: ${result.error.message}\n`)
    return 127
  }
  return result.status ?? 1
}

const USAGE = 'usage: node scripts/ci/cloud-leg.mjs [--dry-run] [--profile <id>]\n'

/**
 * The leg: `io.exec(command, args, cwd)` returns an exit code, `io.out` and `io.err` take text.
 * The build steps stop the leg at their first failure; every profile runs, and any failed one
 * makes the exit 1.
 */
export function runLeg(argv, io = {}) {
  const exec = io.exec ?? spawnCommand
  const out = io.out ?? ((text) => process.stdout.write(text))
  const err = io.err ?? ((text) => process.stderr.write(text))
  const source = io.source ?? fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]+$/, '')
  const args = parseArgs(argv)
  if ('error' in args) {
    err(`cloud-leg: ${args.error}\n${USAGE}`)
    return 2
  }
  const profiles = args.profile === null ? PROFILES : PROFILES.filter((profile) => profile.id === args.profile)
  const commands = legCommands(source, profiles)
  if (args.dryRun) {
    for (const { label, command, args: commandArgs } of commands) {
      out(`# ${label}\n${[command, ...commandArgs].map(shellQuote).join(' ')}\n`)
    }
    out('Dry run: nothing was run.\n')
    return 0
  }
  const failed = []
  for (const { label, command, args: commandArgs } of commands) {
    out(`cloud-leg: ${label}\n`)
    const code = exec(command, commandArgs, source)
    if (code === 0) continue
    err(`cloud-leg: ${label} failed (exit ${code})\n`)
    if (!label.startsWith('profile ')) return 1
    failed.push(label)
  }
  out(failed.length === 0 ? 'cloud-leg: every profile passed\n' : `cloud-leg: failed: ${failed.join(', ')}\n`)
  return failed.length === 0 ? 0 : 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runLeg(process.argv.slice(2))
}
