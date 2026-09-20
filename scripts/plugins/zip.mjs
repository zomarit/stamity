// A deterministic ZIP writer, in one file, with no dependency outside `node:zlib`.
//
// WHY THIS EXISTS. The distribution builder publishes one archive per client root, and a
// consumer verifies it against the `sha256` in `release.json`. That digest is only worth
// reading if the same tree always produces the same bytes, so every source of variation an
// ordinary zipper carries has to go: the entry order (a directory read's order differs by
// filesystem), the modification times (the clock), the external file attributes (the umask),
// the archive comment, the "version made by" host byte. Each is fixed below. Adding a zip
// dependency would have moved that guarantee into somebody else's release notes.
//
// THE SUBSET THIS WRITES, in full — anything outside it is refused rather than approximated:
//
//   entries       regular files only. No directory entries (a reader creates the parents it
//                 needs), no symlinks, no empty-directory preservation.
//   order         entries are sorted by their UTF-8 path bytes and written in that order, in
//                 the central directory too.
//   compression   method 8 (raw deflate, `node:zlib`) when it is smaller than the input, and
//                 method 0 (stored) otherwise — including for an empty file, which deflate
//                 would grow. The choice is a pure function of the bytes.
//   timestamps    one caller-supplied instant for every entry, written as the MS-DOS date and
//                 time pair in UTC. Nothing reads the clock. No extended-timestamp extra
//                 field is emitted: it would carry the same instant in a second encoding and
//                 is one more thing to keep identical.
//   attributes    "version made by" 3.20 (UNIX, zip 2.0) with external attributes `0o100644`
//                 for every entry: a fixed, readable, non-executable regular file. A root's
//                 executable bits are not part of what it ships — the locator and the CLI are
//                 run through `node`, never executed directly.
//   flags         bit 11 (UTF-8 names) set on every entry, so a non-ASCII path is read the
//                 same way by every extractor. No data descriptors (sizes are known before
//                 the local header is written), no encryption.
//   limits        NO zip64. More than 65,535 entries, an entry or an archive at or above
//                 4 GiB, or a path longer than 65,535 bytes is refused by name. A plugin root
//                 is ~500 files and ~12 MiB, so the limit is a guard rail rather than a
//                 ceiling anyone approaches.
//
// DETERMINISM, STATED HONESTLY. Two runs of one Node build over one input produce identical
// bytes — that is what the builder's `--check`-shaped proof and the suite's "two builds, one
// sha256" case assert. Across Node versions the DEFLATE stream is zlib's to define: a zlib
// release that changed its match-finding would re-compress the same file differently, and the
// archive's digest would move with it. That is why `release.json` carries the digest of the
// archive the release actually built and attested, rather than a digest anybody is expected to
// re-derive from the tree on another machine. Stored entries would be reproducible across zlib
// versions; the four roots carry a bundled runtime each, and paying ~4x the download for that
// property was not the trade this distribution makes.

import { deflateRawSync } from 'node:zlib'

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

/** zip 2.0: the version that understands deflate. */
const VERSION_NEEDED = 20
/** UNIX (3) in the high byte, zip 2.0 in the low byte. */
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED
/** Bit 11: the path and comment are UTF-8. */
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0
const METHOD_DEFLATE = 8
/** `0o100644` — a regular, group- and world-readable, non-executable file — in the high word. */
// `>>> 0` is load-bearing: `0o100644 << 16` overflows a SIGNED 32-bit shift into a negative
// number, which `writeUInt32LE` refuses outright.
const EXTERNAL_ATTRIBUTES = (0o100644 << 16) >>> 0

const MAX_ENTRIES = 0xffff
const MAX_UINT32 = 0xffffffff
const MAX_NAME_BYTES = 0xffff

/** The earliest instant the MS-DOS date encoding can carry. */
const DOS_EPOCH_YEAR = 1980

/**
 * CRC-32 (IEEE 802.3, the polynomial every zip reader checks against), computed here rather
 * than imported: `node:zlib`'s own `crc32` arrived in Node 20.15 as an unflagged addition but
 * this file is also read by people vendoring it into an older toolchain, and 40 lines of table
 * lookup is cheaper than a version gate on a build step.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

/** The CRC-32 of a buffer, as an unsigned 32-bit number. */
export function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * One instant as the MS-DOS `(date, time)` pair, in UTC. Seconds have two-second resolution in
 * this encoding — the low bit is not representable — so an odd second is rounded DOWN rather
 * than up: rounding up can carry into the next minute, hour and day, and a date that moves is
 * worse than a second that is one off.
 */
export function dosDateTime(instant) {
  const at = instant instanceof Date ? instant : new Date(instant)
  const ms = at.getTime()
  if (Number.isNaN(ms)) {
    throw new Error('zip: the entry timestamp is not a readable date; pass the source commit date.')
  }
  const year = at.getUTCFullYear()
  if (year < DOS_EPOCH_YEAR || year > DOS_EPOCH_YEAR + 127) {
    throw new Error(
      `zip: ${at.toISOString()} is outside the MS-DOS date range (${String(DOS_EPOCH_YEAR)}–2107) this writer encodes.`,
    )
  }
  const date = ((year - DOS_EPOCH_YEAR) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate()
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)
  return { date, time }
}

/** A path this writer is willing to put in an archive somebody will extract onto a disk. */
function requireEntryPath(path) {
  if (typeof path !== 'string' || path === '') {
    throw new Error('zip: every entry needs a non-empty path.')
  }
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new Error(`zip: ${path} is absolute; an archive entry is always relative to its root.`)
  }
  if (path.includes('\\')) {
    throw new Error(`zip: ${path} carries a backslash; zip paths use forward slashes on every platform.`)
  }
  if (path.split('/').includes('..')) {
    throw new Error(`zip: ${path} climbs out of the archive root with a \`..\` segment.`)
  }
  const bytes = Buffer.from(path, 'utf8')
  if (bytes.length > MAX_NAME_BYTES) {
    throw new Error(`zip: the path ${path.slice(0, 40)}… is longer than the ${String(MAX_NAME_BYTES)}-byte field.`)
  }
  return bytes
}

/** Stored or deflated, whichever is smaller; the comparison is on the bytes alone. */
function compress(bytes) {
  if (bytes.length === 0) return { method: METHOD_STORE, body: bytes }
  const deflated = deflateRawSync(bytes, { level: 9 })
  return deflated.length < bytes.length
    ? { method: METHOD_DEFLATE, body: deflated }
    : { method: METHOD_STORE, body: bytes }
}

/**
 * Build one archive.
 *
 * @param entries `{ path, bytes }` pairs; order here does not matter, the writer sorts them.
 * @param mtime   the one instant every entry is stamped with — the source commit date, so an
 *                archive's timestamps describe the code in it rather than the machine.
 * @returns the archive as a Buffer.
 */
export function buildZip(entries, { mtime }) {
  const list = [...entries].toSorted((left, right) => {
    const a = Buffer.from(String(left.path), 'utf8')
    const b = Buffer.from(String(right.path), 'utf8')
    return Buffer.compare(a, b)
  })
  if (list.length > MAX_ENTRIES) {
    throw new Error(
      `zip: ${String(list.length)} entries is past the ${String(MAX_ENTRIES)} this writer supports; zip64 is not implemented.`,
    )
  }
  const { date, time } = dosDateTime(mtime)

  const seen = new Set()
  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of list) {
    const nameBytes = requireEntryPath(entry.path)
    const key = nameBytes.toString('utf8')
    if (seen.has(key)) throw new Error(`zip: ${key} appears twice; an archive holds one entry per path.`)
    seen.add(key)

    const bytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes ?? '')
    if (bytes.length >= MAX_UINT32) {
      throw new Error(`zip: ${key} is at or above 4 GiB; zip64 is not implemented.`)
    }
    const { method, body } = compress(bytes)
    const crc = crc32(bytes)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0)
    local.writeUInt16LE(VERSION_NEEDED, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(bytes.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0)
    central.writeUInt16LE(VERSION_MADE_BY, 4)
    central.writeUInt16LE(VERSION_NEEDED, 6)
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(bytes.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // file comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38)
    central.writeUInt32LE(offset, 42)

    locals.push(local, nameBytes, body)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + body.length
    if (offset >= MAX_UINT32) {
      throw new Error('zip: the archive passed 4 GiB; zip64 is not implemented.')
    }
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // the disk the central directory starts on
  end.writeUInt16LE(list.length, 8)
  end.writeUInt16LE(list.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // no archive comment

  return Buffer.concat([...locals, directory, end])
}
