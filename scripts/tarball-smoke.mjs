#!/usr/bin/env node
// Tarball smoke: pack this repo the way `npm publish` would, install the resulting .tgz into a
// throwaway project, and run the first command a user runs.
//
// Why this exists as its own gate. Every other check in CI runs FROM the repository, where
// `resolveBundledContentRoot()` finds `<packageRoot>/content` — the source checkout — and the
// corpus resolves whether or not the build stages anything. The published package contains only
// what `files` lets through, so the same code path there probes `<packageRoot>/dist/content` and
// finds nothing if staging is missing. That failure mode is invisible to a repo-run suite and
// visible to every user on their very first command (`init` exits CONFIG_ERROR). The only check
// that can see it is one that goes through the tarball.
//
// It is also the only place the leak gate can see the ARTIFACT. In the repository `dist/`
// is a skipped build directory, and `dist/` is the entire published package — so the bundler's
// output was the one tree nothing scanned. That matters beyond tidiness: an escaped or split
// spelling in source (a string concatenation, a `t` escape) reassembles to the plain name
// once the bundler has folded the constants, so source can be clean while the artifact is not.
// The gate is copied in beside the extracted package and run with `--include-build`, which turns
// the build-directory exemption off for exactly the tree where the build IS the payload.
//
// Exit codes: 0 the packed artifact is usable, 1 it is not, 2 the smoke could not run.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const GATE = join(ROOT, 'scripts', 'leak-gate.mjs')

/** Content classes and packs the installed artifact must be able to serve. */
const REQUIRED_CONTENT_DIRS = ['agents', 'skills', 'rules', 'commands', 'charter']
const REQUIRED_PACK_DIRS = ['ops', 'product-audit', 'scaffold']

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function fail(message, detail) {
  console.error(`tarball-smoke: FAIL - ${message}`)
  if (detail) console.error(detail.trim().split('\n').map((line) => `  ${line}`).join('\n'))
  return 1
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'stamity-tarball-smoke-'))
  try {
    // 1. Pack. `npm pack` honours `files`, `.npmignore`, and the publish-time filters, so the
    //    tarball here is byte-for-byte what a publish would upload.
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], { cwd: ROOT }))
    const filename = packed[0]?.filename
    if (typeof filename !== 'string') return fail('npm pack produced no filename')
    const tarball = join(work, filename)

    // 2. Install into a project that is NOT this repository, so nothing resolves through the
    //    source checkout by accident — the mistake that would make this gate agree with itself.
    const project = join(work, 'consumer')
    run('mkdir', ['-p', project])
    writeFileSync(join(project, 'package.json'), `${JSON.stringify({ name: 'consumer', private: true, version: '0.0.0' }, null, 2)}\n`)
    // `--ignore-scripts` explicitly: npm reads the project config from the CWD's `.npmrc`, and
    // this install's CWD is a throwaway directory that has none, so the repository's
    // `ignore-scripts=true` does not reach it.
    run('npm', ['install', '--no-audit', '--no-fund', '--silent', '--ignore-scripts', tarball], { cwd: project })

    // 3. The corpus has to be INSIDE the installed package, not merely inside the repo.
    //    The package name is SCOPED, so npm lays it down under the scope directory — resolving
    //    the unscoped path here would find nothing and report the staging failure this gate
    //    exists to catch, on every run, whether or not staging is broken.
    const installed = join(project, 'node_modules', '@zomarit', 'stamity')
    const missing = [
      ...REQUIRED_CONTENT_DIRS.filter((dir) => !existsSync(join(installed, 'dist', 'content', dir))),
      ...REQUIRED_PACK_DIRS.filter((dir) => !existsSync(join(installed, 'dist', 'packs', dir))),
    ]
    if (missing.length > 0) {
      return fail(
        `the packed tarball is missing ${missing.length} bundled director(y|ies): ${missing.join(', ')}`,
        `Staged content lives under dist/ (tsdown.config.mjs "copy"); package.json "files" only ships dist.\n` +
          `Present under dist/: ${readdirSync(join(installed, 'dist')).join(', ')}`,
      )
    }

    // 4. The reserved-name and credential gate over the ARTIFACT, not the repository. The gate
    //    derives its own root from its location, so it is copied in beside the extracted package;
    //    `--include-build` turns off the build-directory exemption, which is what made the
    //    published tree invisible to it in the first place. The release path runs this same
    //    script before it packs the shipped tarball (.github/workflows/release.yml, the
    //    `gates` job), so the artifact a consumer installs is gated by the check below.
    mkdirSync(join(installed, 'scripts'), { recursive: true })
    copyFileSync(GATE, join(installed, 'scripts', 'leak-gate.mjs'))
    try {
      run('node', [join(installed, 'scripts', 'leak-gate.mjs'), '--include-build'], {
        cwd: installed,
      })
    } catch (error) {
      return fail(
        'the packed artifact carries a reserved name or a credential shape',
        `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
      )
    } finally {
      rmSync(join(installed, 'scripts'), { recursive: true, force: true })
    }

    // 5. The first command a user runs, in a repo that is not this one.
    const target = join(work, 'target-repo')
    run('mkdir', ['-p', target])
    writeFileSync(join(target, 'package.json'), `${JSON.stringify({ name: 'target', private: true, version: '0.0.0' }, null, 2)}\n`)
    const bin = join(installed, 'dist', 'cli.js')
    try {
      run('node', [bin, 'init', '-y'], { cwd: target })
    } catch (error) {
      return fail('`init -y` failed against the installed package', `${error.stdout ?? ''}\n${error.stderr ?? ''}`)
    }
    try {
      run('node', [bin, 'check'], { cwd: target })
    } catch (error) {
      return fail('`check` failed on the tree `init` just produced', `${error.stdout ?? ''}\n${error.stderr ?? ''}`)
    }

    console.log(
      `tarball-smoke: PASS - ${filename} installs, carries ${REQUIRED_CONTENT_DIRS.length} content ` +
        `class(es) and ${REQUIRED_PACK_DIRS.length} pack(s) under dist/, passes the leak gate ` +
        `over the packed tree, and completes init + check`,
    )
    return 0
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`tarball-smoke: ERROR - ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
