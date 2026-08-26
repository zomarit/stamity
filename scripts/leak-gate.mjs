#!/usr/bin/env node
// Repository leak gate: reserved names, and credential shapes.
//
// Two rule families, one traversal. The reserved-name family fails if a RESERVED name reaches the
// published tree — the names this project was built or considered under before the rename, and the
// predecessor project whose name is legal only inside the migration-detection module that has to
// spell it to find the old tree. A retired name in a public repository is a SECOND name for one
// product: it is what a reader searches for, what an issue gets filed against and what a fork
// keeps, and none of it resolves to anything. The per-rule allowlists below are the only places
// any of these names is legal, and each prints the files it dropped on every run. The secret-shape
// family fails if a credential shape lands in a tracked file — the tree had no secret detection of
// any kind, no scan lane, no push-protection assertion, while the walk a shape pass needs was
// already running here every push.
//
// Usage: node scripts/leak-gate.mjs [--root <dir>] [--include-build]
//   --root           scan a tree other than this script's repository (the extracted publish
//                    artifact, in `scripts/tarball-smoke.mjs`).
//   --include-build  scan the build and vendor directories too. Those are skipped by default
//                    because they are regenerated noise; in a PACKED artifact they are the
//                    payload, and an escape in source reassembles to a plain name there.
//
// Every reserved token is assembled from fragments at runtime, so this file never contains one
// literally and is scanned by its own rules like any other file — the gate has no self-exemption.
//
// Nothing is exempted by CONTENT, and nothing is exempted by FILE TYPE. Two earlier designs tried
// one each and both shipped a silent bypass. A NUL sniff over the first 8 KB dropped the whole
// file, so a one-byte prepend took anything out of the scan. A closed list of "binary" EXTENSIONS
// replaced it, so a plain-ASCII file named `*.png`, a readable name inside real image metadata, and
// a reserved name in a binary-extension FILENAME all passed unread — the extension is chosen by
// whoever adds the file and says nothing about what its bytes are. Both were one mistake in two
// costumes: deciding not to look, from a proxy for what the bytes say.
//
// So this gate never decides not to look. Every listed path is scanned by NAME, and every listed
// file is scanned by CONTENT, through the same views whatever the bytes are. Symlinks are opened
// with `lstat`/`readlink` and their stored TARGET STRING is scanned rather than followed: that
// string IS the blob git keeps, and following it read a dangling link through to ENOENT and filed
// the leak under "vanished mid-scan".
//
// ENCODINGS ACTUALLY COVERED (the header used to claim a file was scanned when a whole encoding
// was unreadable): latin1 over every byte; utf8 whenever the bytes are valid UTF-8 carrying
// anything above ASCII; utf16le and utf16be whenever a BOM or a NUL-alternation pattern says the
// file is UTF-16. latin1 is byte-per-character, so the ASCII tokens below survive it whatever the
// real encoding is and every reported offset is a true byte offset. A UTF-16 file is invisible to
// latin1 — the interleaved NULs break every token — which is how a file rendering as the plain
// name passed while being reported as scanned.
//
// NORMALIZATION. Each view is scanned raw AND through a normalizing pass, because a name that
// RENDERS as the reserved word is the leak, whatever bytes spell it: zero-width and soft-hyphen
// insertions, C0 controls, fullwidth and other NFKC-equivalent forms, Cyrillic and Greek
// homoglyphs, HTML entities, and percent-escapes all reduce to the same string. The pass carries
// an index map, so a hit found through it still reports the byte offset in the file, and findings
// are deduped by (rule, file, byte offset) so a plain ASCII hit is not reported once per view.
//
// What remains are exemptions by PATH — the build/vendor prefixes and the per-rule allowlists —
// and every one of them is printed with the files it dropped, on a PASS and on a FAIL alike,
// because the run a maintainer reads closely is the failing one.
//
// Exit codes: 0 clean, 1 violations found, 2 gate could not run.

import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf('--root')
const ROOT = resolve(
  rootFlag === -1 ? fileURLToPath(new URL('..', import.meta.url)) : (argv[rootFlag + 1] ?? '.'),
)
const INCLUDE_BUILD = argv.includes('--include-build')

/**
 * Build and vendor directories, matched as ROOT-RELATIVE PREFIXES.
 *
 * Anchoring is the point. Matching the name against any path SEGMENT at any depth silently
 * dropped `src/dist/...`, `test/fixtures/coverage/...`, and `packs/ops/node_modules/...` —
 * tracked source under a directory that merely shares a name with a build output.
 */
const SKIP_PREFIXES = ['.git/', 'node_modules/', 'dist/', 'coverage/']
const MAX_REPORTED_HITS = 50
const MAX_REPORTED_SKIPS = 25
const EXCERPT_LENGTH = 120
const SNIFF_BYTES = 64 * 1024

/**
 * Container magics whose payload is compressed or otherwise not laid out as text, matched against
 * the first bytes. A match only labels the file in the census — its bytes are scanned through the
 * same views either way — so a wrong guess costs a word in a report, never a missed name.
 */
const BINARY_SIGNATURES = [
  '\x89PNG', 'GIF8', '\xff\xd8\xff', 'RIFF', '%PDF',
  'PK\x03\x04', '\x1f\x8b', 'BZh', '\xfd7zXZ', '\x28\xb5\x2f\xfd',
  'wOFF', 'wOF2', '\x00asm', '\x7fELF', '\xca\xfe\xba\xbe', '\xcf\xfa\xed\xfe',
  'OggS', 'fLaC', '\x1aE\xdf\xa3',
]

/** Census label only — never a reason to skip, and never a reason to read fewer views. */
function looksBinary(bytes) {
  const sample = bytes.subarray(0, SNIFF_BYTES)
  if (sample.length === 0) return false
  const head = sample.toString('latin1', 0, Math.min(sample.length, 8))
  if (BINARY_SIGNATURES.some((signature) => head.startsWith(signature))) return true
  if (utf16Encodings(bytes).length > 0) return false

  let nonText = 0
  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue
    if (byte <= 0x1f || byte === 0x7f) nonText += 1
  }
  return nonText / sample.length > 0.02
}

// ── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Which UTF-16 encodings these bytes plausibly are, by BOM first and by NUL alternation second.
 *
 * The alternation test is what catches a BOM-less file, which is the one an evader writes: ASCII
 * text in UTF-16 puts a NUL beside every character, on odd byte offsets for LE and even for BE.
 * A wrong guess costs one extra decode of mojibake that matches nothing.
 */
function utf16Encodings(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return ['utf16le']
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return ['utf16be']
  const sample = bytes.subarray(0, Math.min(bytes.length, SNIFF_BYTES))
  if (sample.length < 4) return []

  let evenNul = 0
  let oddNul = 0
  const pairs = Math.floor(sample.length / 2)
  for (let index = 0; index < pairs * 2; index += 1) {
    if (sample[index] !== 0x00) continue
    if (index % 2 === 0) evenNul += 1
    else oddNul += 1
  }
  const found = []
  if (oddNul / pairs > 0.6 && evenNul / pairs < 0.1) found.push('utf16le')
  if (evenNul / pairs > 0.6 && oddNul / pairs < 0.1) found.push('utf16be')
  return found
}

/** Big-endian UTF-16 has no Node decoder; swapping the pairs turns it into one that does. */
function swapPairs(bytes) {
  const swapped = Buffer.from(bytes.subarray(0, bytes.length - (bytes.length % 2)))
  swapped.swap16()
  return swapped
}

/** UTF-8 decode with a character-index → byte-offset map, or `null` when the bytes are not UTF-8. */
function utf8View(bytes) {
  // Pure ASCII decodes identically to latin1, so a second view of it would find only duplicates.
  if (!bytes.some((byte) => byte >= 0x80)) return null
  const text = bytes.toString('utf8')
  // Round-trip equality is the exact validity test: an invalid sequence decodes to U+FFFD and
  // re-encodes to different bytes, so a mis-decoded file is dropped instead of scanned as noise.
  if (!Buffer.from(text, 'utf8').equals(bytes)) return null

  const offsets = Array.from({ length: text.length })
  let byte = 0
  for (let index = 0; index < text.length; index += 1) {
    offsets[index] = byte
    const code = text.codePointAt(index)
    if (code === undefined) continue
    byte += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (code >= 0x10000) {
      // A surrogate pair is two string units over one character's bytes.
      offsets[index + 1] = offsets[index]
      index += 1
    }
  }
  return { label: 'utf8', text, byteAt: (index) => offsets[index] ?? index }
}

/**
 * The readings of one file's bytes, each with a map from character index back to BYTE offset.
 *
 * latin1 always: it is byte-per-character, so it reads every file, it cannot fail, and an offset
 * out of it is an offset in the file. UTF-8 is added whenever the bytes are valid UTF-8 carrying
 * anything above ASCII — latin1 shreds a multi-byte character into separate bytes, so a
 * zero-width joiner, a Cyrillic homoglyph and a fullwidth letter are all invisible to it, and
 * those are the evasions the normalizing pass exists to fold. UTF-16 readings are added when a
 * BOM or a NUL alternation says so.
 *
 * `rawOnly` marks a reading whose normalized twin would only produce duplicates: when a file is
 * UTF-16, its latin1 reading is mojibake by construction, and stripping the interleaved NULs out
 * of that mojibake reconstructs the same match the UTF-16 reading already found — at an offset
 * one byte away, so dedupe by offset cannot catch it.
 */
export function decodeCandidates(bytes) {
  const wide = utf16Encodings(bytes)
  const views = [
    { label: 'latin1', text: bytes.toString('latin1'), byteAt: (index) => index, rawOnly: wide.length > 0 },
  ]
  const utf8 = utf8View(bytes)
  if (utf8 !== null) views.push(utf8)
  for (const encoding of wide) {
    const hasBom = bytes.length >= 2 && (bytes[0] === 0xff || bytes[0] === 0xfe) && (bytes[1] === 0xfe || bytes[1] === 0xff)
    const body = hasBom ? bytes.subarray(2) : bytes
    const decoded = (encoding === 'utf16le' ? body : swapPairs(body)).toString('utf16le')
    const base = hasBom ? 2 : 0
    views.push({ label: encoding, text: decoded, byteAt: (index) => base + index * 2 })
  }
  return views
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Characters that render as nothing and split a word without changing what it reads as. */
const INVISIBLE = new Set([
  0x00ad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff,
])

/**
 * Homoglyph folds NFKC does not perform, because the characters are genuinely distinct letters in
 * their own scripts. Latin is the target: a name spelled with a Cyrillic `е` renders identically
 * and is a leak by every measure that matters.
 */
const CONFUSABLES = new Map(
  Object.entries({
    а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ѕ: 's', һ: 'h', і: 'i', ј: 'j', к: 'k', ӏ: 'l',
    м: 'm', н: 'h', о: 'o', р: 'p', ԛ: 'q', г: 'r', т: 't', и: 'u', ѵ: 'v', ѡ: 'w', х: 'x', у: 'y',
    α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ο: 'o', ρ: 'p', ς: 's', τ: 't', υ: 'u', ν: 'v', χ: 'x',
    ﬁ: 'fi', ﬂ: 'fl', ł: 'l', ø: 'o', ı: 'i',
  }),
)

const HTML_ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/giy
const PERCENT_ESCAPE = /%[0-9a-f]{2}/giy

const NAMED_ENTITIES = new Map(
  Object.entries({
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    shy: '­', zwj: '‍', zwnj: '‌',
  }),
)

/** The character an HTML entity body denotes, or `null` when it denotes nothing readable. */
function entityCharacter(body) {
  const numeric =
    body.startsWith('#x') || body.startsWith('#X')
      ? Number.parseInt(body.slice(2), 16)
      : body.startsWith('#')
        ? Number.parseInt(body.slice(1), 10)
        : Number.NaN
  if (Number.isNaN(numeric)) return NAMED_ENTITIES.get(body.toLowerCase()) ?? null
  // Above the Unicode maximum, or a surrogate half: not a character, so not a decode.
  if (numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) return null
  return String.fromCodePoint(numeric)
}

/** One entity or percent-escape starting at `index`, as `{ text, length }`, or `null`. */
function decodeEscapeAt(text, index) {
  HTML_ENTITY.lastIndex = index
  const entity = HTML_ENTITY.exec(text)
  if (entity !== null) {
    const decoded = entityCharacter(entity[1])
    if (decoded !== null) return { text: decoded, length: entity[0].length }
  }
  PERCENT_ESCAPE.lastIndex = index
  const escape = PERCENT_ESCAPE.exec(text)
  if (escape !== null) {
    return { text: String.fromCharCode(Number.parseInt(escape[0].slice(1), 16)), length: 3 }
  }
  return null
}

/**
 * `text` reduced to what it RENDERS as, with `map[i]` naming the source index every normalized
 * character came from.
 *
 * Order matters: escapes decode first (so `&#116;` becomes a letter that later steps can fold),
 * then invisibles drop, then NFKC folds compatibility forms, then the confusable table folds the
 * homoglyphs NFKC deliberately leaves alone. NFKC is applied per character so the index map stays
 * exact; that is weaker than whole-string NFKC on decomposed sequences and strictly stronger than
 * the nothing that was here before.
 */
export function normalizeWithMap(text) {
  const chars = []
  const map = []
  for (let index = 0; index < text.length; ) {
    const escape = decodeEscapeAt(text, index)
    const source = escape === null ? text[index] : escape.text
    const consumed = escape === null ? 1 : escape.length

    for (const char of source) {
      const code = char.codePointAt(0)
      if (INVISIBLE.has(code)) continue
      if (code <= 0x1f || code === 0x7f) continue
      const folded = CONFUSABLES.get(char) ?? char.normalize('NFKC').toLowerCase()
      for (const out of folded) {
        chars.push(out)
        map.push(index)
      }
    }
    index += consumed
  }
  return { text: chars.join(''), map }
}

// ── Rules ────────────────────────────────────────────────────────────────────

/**
 * Repo-relative paths allowed to mention the predecessor project name.
 *
 * Two source directories plus the bundled JS: the guided migration-detection module needs the
 * literal state-directory and marker strings to find them, and its tests need them to build
 * fixtures. Everywhere else the name is a build failure — downstream code consumes the detection
 * module's `PredecessorState` record instead of re-spelling the name. The migration doc joins this
 * list when it lands.
 *
 * The three bundled JS files are on the list because `--include-build` scans the packed artifact,
 * where the migration module is bundled into the entry/chunk JS — the same legitimate markers, one
 * build step downstream of src/migration/. The exemption is only for THIS rule
 * (predecessor-project): the candidate-name and dev-prefix rules keep `allow: []`, so those
 * reserved names can never hide in the bundle, and any predecessor marker outside the migration
 * module would still be caught at its source (src/ is scanned; only src/migration/ is exempt).
 * These are the flat bundled JS only — dist/content and dist/packs stay scanned. Exact paths (not
 * a `dist/*.js` glob) on purpose: the invariant-8 suite mirrors this list with an exact/prefix
 * matcher and rejects globs, and a future chunk under a new name should fail loudly (add it) rather
 * than be swept in silently.
 *
 * Entry forms: exact path, directory prefix (trailing '/'), or glob ('*' within a path segment,
 * '**' across segments) — but see the exact-paths note above before adding a glob.
 */
const PREDECESSOR_ALLOWLIST = ['src/migration/', 'test/migration/', 'dist/cli.js', 'dist/index.js', 'dist/src.js']

/**
 * The two files that DEFINE credential shapes, and therefore carry example ones.
 *
 * A shape scanner cannot scan its own corpus of shapes without reporting every one of them. The
 * exemption is by PATH and is printed with the files it dropped, which is the only exemption form
 * this gate has ever allowed — no file is exempt for what its bytes say or what it is called. In
 * particular there is no in-file opt-out marker and there will not be one: a comment that turns
 * the scanner off is an exemption by CONTENT, which is the mistake this gate was rebuilt twice to
 * stop making, and it is writable by whoever is committing the credential.
 */
const SECRET_SCANNER_SOURCES = ['src/mcp/secretScan.ts', 'test/mcp/secretScan.test.ts']

/**
 * Suites carrying a deliberate canary of one specific shape, exempt from THAT shape only.
 *
 * Per rule rather than per file, so a suite that legitimately holds an example connection string
 * is still scanned for every other credential shape. Each entry is a reviewed decision about one
 * known constant — AWS's own documented example key id, a `u:p@h` placeholder, an OpenSSH header
 * over the literal text `PRIVATE-KEY-MATERIAL` — and each prints on every run.
 */
const SHAPE_FIXTURES = {
  'aws-access-key-id': ['test/cli/commands/validate.test.ts'],
  'credentialed-connection-string': ['test/mcp/env.test.ts'],
  'pem-private-key': ['test/merge/bakEscape.test.ts', 'test/merge/writeEscape.test.ts'],
}

/**
 * Reserved names, assembled from fragments at run time; `allow` is the per-rule path exemption.
 *
 * Two names the product was NOT shipped under and one it was renamed FROM, plus the predecessor
 * project. `retired-name` is the name this repository carried through its build and shed at
 * the rename: it is spelled nowhere in the shipped tree, and `allow: []` is what keeps it that
 * way when a merge, a revert or a stale branch tries to bring one occurrence back. The names the
 * product IS published under are never rules here — a gate that banned its own name would ban
 * every file.
 */
const NAME_RULES = [
  { id: 'candidate-name-a', parts: ['tess', 'ity'], allow: [] },
  { id: 'candidate-name-b', parts: ['apris', 'ity'], allow: [] },
  { id: 'predecessor-dev-prefix', parts: ['h4t', 'cher'], allow: [] },
  { id: 'predecessor-project', parts: ['hat', 'ch3r'], allow: PREDECESSOR_ALLOWLIST },
  { id: 'retired-name', parts: ['nes', 'tor'], allow: [] },
].map((rule) => ({ id: rule.id, source: rule.parts.join(''), flags: 'gi', allow: rule.allow }))

/**
 * Credential shapes, mirroring the high-confidence half of `src/mcp/secretScan.ts`
 * (`SECRET_PATTERNS`) — every id here exists there, asserted by `test/ci/leakGate.test.ts`
 * so the two cannot drift.
 *
 * Mirrored rather than imported: this gate runs against an arbitrary `--root`, including an
 * extracted publish tarball that has no `src/` at all, so a gate that imported the engine would
 * be a gate that could not run where it is needed most.
 *
 * The context-gated and prose-shaped patterns are deliberately left out — `high-entropy-string`
 * flags every commit SHA, and the inline `password:`/`api_key:` assignment patterns flag every
 * document that discusses one. A scanner whose hits are usually wrong is a scanner people learn
 * to wave through.
 */
const SECRET_RULES = [
  { id: 'aws-access-key-id', source: '(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])', flags: 'g' },
  { id: 'github-token', source: '\\bgh[pousr]_[A-Za-z0-9]{36}\\b', flags: 'g' },
  { id: 'github-fine-grained-token', source: '\\bgithub_pat_[A-Za-z0-9_]{82}\\b', flags: 'g' },
  { id: 'gitlab-access-token', source: '\\bglpat-[A-Za-z0-9_-]{20,}\\b', flags: 'g' },
  { id: 'slack-token', source: '\\bxox[abporas]-[A-Za-z0-9-]{10,}\\b', flags: 'g' },
  { id: 'stripe-api-key', source: '\\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\\b', flags: 'g' },
  { id: 'sk-prefixed-api-key', source: '\\bsk-(?:[A-Za-z0-9]{1,12}-)?[A-Za-z0-9_-]{20,}\\b', flags: 'g' },
  { id: 'pem-private-key', source: '-----BEGIN (?:[A-Z0-9]+ ){0,3}PRIVATE KEY-----', flags: 'g' },
  { id: 'linear-api-key', source: '\\blin_api_[A-Za-z0-9]{40,}\\b', flags: 'g' },
  { id: 'sentry-auth-token', source: '\\bsntrys_[A-Za-z0-9]{40,}\\b', flags: 'g' },
  { id: 'credentialed-connection-string', source: '\\b(?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis|amqps?)://[^:@/\\s]+:[^@/\\s]+@', flags: 'gi' },
].map((rule) => secretRule(rule.id, rule.source, rule.flags))

/** One credential rule, exempt from the scanner's own corpus plus this shape's known canaries. */
function secretRule(id, source, flags) {
  return { id, source, flags, allow: [...SECRET_SCANNER_SOURCES, ...(SHAPE_FIXTURES[id] ?? [])] }
}

/** Every rule, each carrying its own compiled matcher and its own path exemptions. */
export const RULES = [...NAME_RULES, ...SECRET_RULES].map((rule) => ({
  id: rule.id,
  pattern: new RegExp(rule.source, rule.flags),
  // The normalized view lower-cases as it folds, so a case-sensitive rule keeps its meaning
  // there only if it is matched case-sensitively against a lower-cased string — which would
  // change what it means. Credential shapes are case-sensitive by construction, so they run on
  // the raw views only; reserved names are case-insensitive already and run on both.
  normalizable: rule.flags.includes('i'),
  allow: rule.allow.map(toMatcher),
}))

function toMatcher(glob) {
  if (glob.endsWith('/')) return (file) => file === glob.slice(0, -1) || file.startsWith(glob)
  const source = glob.replace(/\*\*|\*|[.+?^${}()|[\]\\]/g, (token) => {
    if (token === '**') return '.*'
    if (token === '*') return '[^/]*'
    return `\\${token}`
  })
  const re = new RegExp(`^${source}$`)
  return (file) => re.test(file)
}

function toPosix(file) {
  return sep === '/' ? file : file.split(sep).join('/')
}

/** Root-relative prefix match: `src/dist/x` is source, `dist/x` is build output. */
function isSkipped(file) {
  if (INCLUDE_BUILD) return false
  return SKIP_PREFIXES.some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix))
}

/** Tracked + untracked-but-not-ignored files, so the working tree is covered before it is staged. */
function listFromGit() {
  try {
    const stdout = execFileSync(
      'git',
      ['-C', ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return stdout.split(' ').filter(Boolean)
  } catch {
    return null
  }
}

/**
 * The same set git would list, walked off disk. Symlinks are listed and never descended into: git
 * lists them as blobs holding their target string, and dropping them here is what let the two
 * listings disagree about whether a symlink is a file this gate has to look at.
 */
function listFromDisk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name)
    const rel = toPosix(relative(ROOT, absolute))
    if (entry.isSymbolicLink()) {
      acc.push(rel)
    } else if (entry.isDirectory()) {
      // Descending into .git or node_modules costs minutes and finds nothing tracked; the path
      // itself is still listed and still name-scanned by the caller.
      if (!isSkipped(`${rel}/`)) listFromDisk(absolute, acc)
      else acc.push(rel)
    } else {
      acc.push(rel)
    }
  }
  return acc
}

// ── Scanning ─────────────────────────────────────────────────────────────────

function collect(rule, text) {
  rule.pattern.lastIndex = 0
  const found = []
  let match
  while ((match = rule.pattern.exec(text)) !== null) {
    found.push({ rule: rule.id, index: match.index, match: match[0] })
    // A zero-length match would spin forever; every rule here matches at least one character,
    // and this keeps that from being a silent assumption.
    if (match[0].length === 0) rule.pattern.lastIndex += 1
  }
  return found
}

function excerpt(text) {
  return text.replace(/[\s\p{C}]/gu, ' ').trim().slice(0, EXCERPT_LENGTH)
}

/** `1`-based line and column of `offset` inside a byte-per-character view. */
function lineColumn(text, offset) {
  let line = 1
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1
  }
  const start = text.lastIndexOf('\n', offset - 1) + 1
  return { line, column: offset - start + 1 }
}

/**
 * Scan one file's bytes through every view and report the census label.
 *
 * Findings are keyed by (rule, file, byte offset) so a plain ASCII hit found by the latin1 view
 * and again by its normalized twin is one finding, reported at the offset an operator can seek to.
 */
function scanContent(file, bytes, rules, hits, seen) {
  const views = decodeCandidates(bytes)
  const scannable = [
    ...views.map((view) => ({ ...view, normalized: false })),
    ...views
      .filter((view) => view.rawOnly !== true)
      .map((view) => {
        const { text, map } = normalizeWithMap(view.text)
        return {
          label: `${view.label}, normalized`,
          text,
          normalized: true,
          byteAt: (index) => view.byteAt(map[index] ?? index),
        }
      }),
  ]

  for (const view of scannable) {
    for (const rule of rules) {
      if (view.normalized && !rule.normalizable) continue
      for (const hit of collect(rule, view.text)) {
        const offset = view.byteAt(hit.index)
        const key = `${rule.id} ${file} ${offset}`
        if (seen.has(key)) continue
        seen.add(key)
        const where =
          view.label === 'latin1'
            ? (({ line, column }) => `${file}:${line}:${column}`)(lineColumn(view.text, offset))
            : `${file} (${view.label}, byte ${offset})`
        hits.push({
          file,
          rule: rule.id,
          match: hit.match,
          where,
          excerpt: excerpt(view.text.slice(Math.max(0, hit.index - 20), hit.index + 100)),
        })
      }
    }
  }
  return looksBinary(bytes) ? 'binary' : 'text'
}

function run() {
  const listed = [...new Set(listFromGit() ?? listFromDisk(ROOT, []))].toSorted()
  const hits = []
  const seen = new Set()
  const census = { text: 0, binary: 0, symlink: 0 }
  const skipped = {
    'build or vendor directory': [],
    'not a regular file': [],
    'vanished mid-scan': [],
  }
  /** Per-rule content drops, so an exemption that fires on one rule is not invisible. */
  const ruleDrops = new Map(RULES.map((rule) => [rule.id, []]))

  for (const file of listed) {
    // Per-rule, not all-or-nothing. The old census only recorded a file when EVERY rule was
    // exempt, so the one exemption that exists — two directories, one rule — never printed a
    // line and the branch that would have printed it was unreachable.
    const rules = RULES.filter((rule) => {
      if (!rule.allow.some((allowed) => allowed(file))) return true
      ruleDrops.get(rule.id).push(file)
      return false
    })

    // A name is readable out of a path whatever the bytes are, so the path is scanned before
    // anything can route the file elsewhere — the step the old skip's `continue` jumped over.
    for (const rule of rules) {
      for (const hit of collect(rule, file)) {
        hits.push({ file, rule: rule.id, match: hit.match, where: `${file} (path)` })
      }
    }

    if (rules.length === 0) continue

    if (isSkipped(file)) {
      skipped['build or vendor directory'].push(file)
      continue
    }

    const absolute = join(ROOT, file)
    let stats
    try {
      stats = lstatSync(absolute)
    } catch (error) {
      if (error.code === 'ENOENT') {
        skipped['vanished mid-scan'].push(file)
        continue
      }
      throw error
    }

    if (stats.isSymbolicLink()) {
      // A symlink's content, in git's model, is the target STRING. Following it would scan some
      // other file — or nothing, for a dangling link — and would pull content from outside this
      // repository into a scan of this repository.
      let target
      try {
        target = readlinkSync(absolute)
      } catch (error) {
        if (error.code === 'ENOENT') {
          skipped['vanished mid-scan'].push(file)
          continue
        }
        throw error
      }
      for (const rule of rules) {
        for (const hit of collect(rule, target)) {
          hits.push({
            file,
            rule: rule.id,
            match: hit.match,
            where: `${file} (symlink target)`,
            excerpt: excerpt(target),
          })
        }
      }
      census.symlink += 1
      continue
    }

    if (!stats.isFile()) {
      skipped['not a regular file'].push(file)
      continue
    }

    let bytes
    try {
      bytes = readFileSync(absolute)
    } catch (error) {
      if (error.code === 'ENOENT') {
        skipped['vanished mid-scan'].push(file)
        continue
      }
      throw error
    }
    census[scanContent(file, bytes, rules, hits, seen)] += 1
  }

  // Every path whose CONTENT was not read is named, not counted, and it is named on the FAILING
  // run as well: an exemption nobody can see is an exemption nobody reviews, and the run a
  // maintainer reads closely is the one that just failed.
  const total = census.text + census.binary + census.symlink
  const shape = Object.entries(census)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`)
  // Named, not implied. The header used to report every file as scanned while a whole encoding
  // was unreadable, so the run states exactly which readings it performed.
  const encodings = 'latin1, utf8, utf16le/utf16be when detected, each raw and normalized'
  const censusLine =
    `leak-gate: scanned ${total} file(s) [${shape.length > 0 ? shape.join(', ') : 'none'}] ` +
    `for ${RULES.length} rule(s) over ${encodings}`

  const exemptions = []
  for (const [reason, list] of Object.entries(skipped)) {
    if (list.length > 0) exemptions.push([reason, list])
  }
  for (const [ruleId, list] of ruleDrops) {
    if (list.length > 0) exemptions.push([`rule ${ruleId} allowlisted`, list])
  }

  const report = hits.length > 0 ? console.error : console.log
  report(censusLine)
  for (const [reason, list] of exemptions) {
    const shown = list.slice(0, MAX_REPORTED_SKIPS)
    const rest = list.length > shown.length ? `, ... ${list.length - shown.length} more` : ''
    report(`  not scanned (${reason}): ${shown.join(', ')}${rest}`)
  }

  if (hits.length > 0) {
    const affected = new Set(hits.map((hit) => hit.file)).size
    console.error(`leak-gate: FAIL - ${hits.length} hit(s) in ${affected} file(s)`)
    for (const hit of hits.slice(0, MAX_REPORTED_HITS)) {
      console.error(`  ${hit.where}  [${hit.rule}] ${hit.match}${hit.excerpt ? `  ${hit.excerpt}` : ''}`)
    }
    if (hits.length > MAX_REPORTED_HITS) console.error(`  ... ${hits.length - MAX_REPORTED_HITS} more`)
    console.error('  A reserved-name hit: rename the occurrence, or add its path to PREDECESSOR_ALLOWLIST')
    console.error('  in scripts/leak-gate.mjs if it is the migration-detection module that')
    console.error('  legitimately needs the literal marker.')
    console.error('  A credential-shape hit: rotate the credential FIRST — it is in the working tree and')
    console.error('  may already be in history — then remove it and re-run.')
    return 1
  }

  console.log(`leak-gate: PASS - 0 hits for ${RULES.length} rule(s) across ${total} file(s)`)
  return 0
}

// Run only when executed, never when imported. `decodeCandidates` and `normalizeWithMap` are
// exported so their behaviour can be asserted directly rather than inferred from an exit code;
// importing them must not run a repository scan as a side effect.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run()
  } catch (error) {
    console.error(`leak-gate: ERROR - ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
