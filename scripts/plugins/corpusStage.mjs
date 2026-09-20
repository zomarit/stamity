// The corpus a plugin build plans over: the canonical tree with every emission token already
// resolved, laid down in a temp directory the caller disposes.
//
// Why a copy rather than a substitution pass at render time: the planner reads the corpus from
// disk through the ordinary content-index route, and the plugin build is the one caller that
// must not leave a token standing anywhere in its output. Staging first makes that a property
// of the INPUT — the planner sees a corpus in which no token exists, so no later render step
// can reintroduce one, and the refusal happens once, at the file that carries the token, with
// the file name in the message.
//
// Two copy disciplines, and the split is the point. A `.md` under a content CLASS (`agents/`,
// `commands/`, `rules/`, `skills/`, companions included) is a BODY: it is read as text,
// substituted, and refused when a token survives. Everything else — the charter, a skill's
// `references/`, `scripts/` and `assets/` files, an agent's `openai.yaml` — is OPAQUE: it is
// read as a Buffer and written back unchanged, never utf8-decoded, because a byte that is not
// valid UTF-8 must survive the trip and a companion's bytes are what the consuming client runs.
// The charter's own `${STAMITY:INVARIANTS_VERSION}` rides through untouched for exactly this
// reason, and never trips the refusal: `content/charter/**` is repository-owned, dropped by the
// layout, and never a plugin body.
//
// Refusals are structural, not cosmetic. A name holding `..` or a backslash would escape its
// own directory once a client unpacks the root on some other platform; a symlink would resolve
// against the consumer's disk rather than the package. Both are refused by name before a byte
// is written, on every platform, whether or not the running one can express the name.

// The walk below is ORDERED on purpose, so `no-await-in-loop` is off for this file. Each entry
// is refused, read and written before the next is looked at: a refusal names the first offending
// path in corpus order rather than whichever member of a parallel batch happened to reject first,
// and a directory exists before its children are staged into it.
/* oxlint-disable no-await-in-loop */

import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The class directories whose `.md` files are plugin bodies. `charter/` is absent by design. */
const BODY_CLASSES = new Set(['agents', 'commands', 'rules', 'skills'])

/** A body is a `.md` file under a content class; everything else is copied opaquely. */
function isBody(relative) {
  if (!relative.endsWith('.md')) return false
  return BODY_CLASSES.has(relative.split('/')[0])
}

/** Entry order fixed by name, so two stagings of one corpus walk it identically. */
function byName(left, right) {
  if (left.name === right.name) return 0
  return left.name < right.name ? -1 : 1
}

/** A presence probe, not an assertion: a fork layer that is not there is not an error. */
async function isDirectory(path) {
  const info = await stat(path).catch(() => null)
  return info !== null && info.isDirectory()
}

function refuseName(name, named) {
  if (name.includes('\\')) {
    throw new Error(
      `${named}: a backslash in a corpus path is refused — it reads as a directory separator once a client unpacks the root`,
    )
  }
  if (name.includes('..')) {
    throw new Error(`${named}: a ".." in a corpus path is refused — a file may not point outside its own directory`)
  }
}

async function stageDirectory(sourceDir, targetDir, relative, label, tokens) {
  const entries = (await readdir(sourceDir, { withFileTypes: true })).toSorted(byName)
  for (const entry of entries) {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`
    const named = `${label}/${rel}`
    refuseName(entry.name, named)
    if (entry.isSymbolicLink()) {
      throw new Error(
        `${named}: a symlink is refused — a plugin root carries regular files only, and a link would resolve against the consumer's disk`,
      )
    }
    const from = join(sourceDir, entry.name)
    const to = join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true })
      await stageDirectory(from, to, rel, label, tokens)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`${named}: is neither a regular file nor a directory — a plugin root carries regular files only`)
    }
    if (!isBody(rel)) {
      await writeFile(to, await readFile(from))
      continue
    }
    const { text, unresolved } = tokens.substitute(await readFile(from, 'utf8'))
    if (unresolved.length > 0) {
      throw new Error(
        `${named}: ${unresolved.join(', ')} ${unresolved.length === 1 ? 'is' : 'are'} not resolvable in a plugin body — a plugin is built once for every repository, so a token here would reach the agent as a broken variable`,
      )
    }
    await writeFile(to, text, 'utf8')
  }
}

async function stageLayer(sourceRoot, targetRoot, label, tokens) {
  await mkdir(targetRoot, { recursive: true })
  await stageDirectory(sourceRoot, targetRoot, '', label, tokens)
}

/**
 * Copy `contentRoot` (and `forkRoot` when it exists) into a fresh temp tree, substituting every
 * plugin body on the way.
 *
 * Returns the staged roots and the `dispose()` that removes them; the caller owns the lifetime.
 * A refusal removes the partial tree before it throws, so a failed build leaves nothing behind.
 * An absent fork layer yields no `forkRoot` key; an EMPTY one yields an empty staged directory,
 * because "the fork layer adds nothing" and "there is no fork layer" are different inputs to the
 * planner and neither is a fault.
 */
export async function stageSubstitutedCorpus({ contentRoot, forkRoot, tokens } = {}) {
  if (typeof contentRoot !== 'string' || contentRoot === '') {
    throw new Error('stageSubstitutedCorpus: contentRoot must be the path of the canonical content directory')
  }
  if (tokens === null || typeof tokens !== 'object' || typeof tokens.substitute !== 'function') {
    throw new Error('stageSubstitutedCorpus: tokens must expose substitute(body) — pass scripts/plugins/tokens.mjs')
  }
  const temp = await mkdtemp(join(tmpdir(), 'stamity-plugin-corpus-'))
  const dispose = async () => {
    await rm(temp, { recursive: true, force: true })
  }
  try {
    const root = join(temp, 'content')
    await stageLayer(contentRoot, root, 'content', tokens)
    const wantsFork = typeof forkRoot === 'string' && forkRoot !== '' && (await isDirectory(forkRoot))
    if (!wantsFork) return { root, dispose }
    const stagedFork = join(temp, 'fork')
    await stageLayer(forkRoot, stagedFork, 'fork', tokens)
    return { root, forkRoot: stagedFork, dispose }
  } catch (error) {
    // The temp tree is this function's own; a refusal hands the caller a message, not a
    // half-written corpus it never asked for and has no handle to remove.
    await dispose()
    throw error
  }
}
