/**
 * Deny-scan single source of truth.
 *
 * Every deny/injection pattern, the content sanitizer, and the anti-slop
 * wordlist live in this one module. All downstream gates — safe-write deny
 * refusal, the prompt guard, user-content gentle gates, learnings/handoff
 * hard gates, pack body scans, MCP description scans — import from here.
 * A second pattern list anywhere in the repo is a defect, and so is a second
 * normalizer: the pre-scan primitives a gate applies to untrusted text —
 * {@link INVISIBLE_SMUGGLING_CHARS} for split keywords, {@link foldConfusables}
 * for lookalike letters, {@link joinMaskedWords} for masked ones — ship from
 * here for the same reason. A gate holding its own copy answers a question this
 * module already answers, and the two answers drift apart in exactly one
 * direction: the private copy stays narrow.
 *
 * A gate does not compose those primitives itself either. {@link scanNormalized}
 * is the one entry point every deny surface calls: it scans the raw text and its
 * {@link normalizeForDenyScan} copy as a union, in the order that composition
 * has to run. The alternative was nine gates each deciding how much
 * normalization to apply, which produced exactly what that predicts — three
 * surfaces folding, six not, and one payload refused as a content override and
 * accepted as a learning, a handoff and an MCP description.
 *
 * Pattern vocabulary draws on OWASP LLM01 (prompt injection), Unicode
 * UTS #39 (default-ignorable format characters, confusables), and the 2025
 * MCP tool-poisoning disclosures (instructions hidden in server-declared
 * metadata). Regexes avoid the `u` flag so the surrogate-pair classes share
 * one flag dialect with every other pattern, and so `hooks/scripts.ts` can
 * re-compile a `.source` into a generated script without changing its meaning.
 *
 * Where a pattern names a Unicode character property, its ranges are derived
 * from that property in full and cross-checked against the runtime's own data
 * by the test suite. A hand-picked subset of a property is the failure this
 * module is built to avoid: a normalizing gate that misses a character does
 * not merely under-report, it passes the payload with no finding at all.
 *
 * No stored pattern carries the `g` flag; scanners add it on a fresh clone
 * per call, so `lastIndex` state never leaks between calls.
 */

/** One deny pattern: stable id (plain slug) for finding attribution. */
export interface DenyPattern {
  id: string;
  pattern: RegExp;
  severity: "block" | "warn";
  description: string;
}

/** One scan finding, attributable via patternId and locatable via index. */
export interface DenyHit {
  patternId: string;
  index: number;
  /**
   * The REPORTABLE form of the match — safe to print into a terminal, a CI log,
   * or an agent transcript.
   *
   * For a `warn` hit it is the matched text, capped at {@link SNIPPET_MAX}: an
   * advisory exists to show the author the phrase to rewrite, and warn-severity
   * patterns (filler wording, invisible characters) carry no secret.
   *
   * For a `block` hit it is a MASK — `[redacted N chars]`. A block hit refuses
   * the content, and the refusal is printed; echoing the span back would
   * publish exactly what the scan caught. That is not hypothetical: the
   * `inline-secret-assignment` pattern matches `API_KEY = "…"`, so quoting the
   * match reprints the credential into every log that records the refusal, and
   * an injection payload quoted into a transcript is put back in front of a
   * model. Attribution survives without it — `patternId` says what matched,
   * `index` and {@link DenyHit.matchLength} say where and how much.
   */
  snippet: string;
  /** Length of the matched span in code units, always exact and never masked. */
  matchLength: number;
  severity: "block" | "warn";
}

export interface SanitizationResult {
  sanitized: string;
  /**
   * What was taken out: invisible characters stripped, plus the spans of
   * block-severity patterns replaced by the redaction marker. Advisory (`warn`)
   * rows never appear here — {@link sanitizeContent} reports them through
   * {@link scanForDeniedPatterns} instead of removing them, so this list stays
   * an account of what the content lost.
   */
  removed: { patternId: string; count: number }[];
  modified: boolean;
}

/**
 * Inclusive code-point range, `[first, last]`.
 *
 * The three tables below are a machine-derived enumeration of three Unicode
 * properties, pinned in source rather than probed at load time (a full `\p{…}`
 * sweep of the code space costs ~40ms on every import). They are not
 * hand-curated: `denyScan.test.ts` re-derives each from the runtime's own
 * property data and fails on any code point a table misses, so a Unicode
 * update widens them here instead of silently opening a hole.
 */
type CodePointRange = readonly [first: number, last: number];

/**
 * Unicode `Default_Ignorable_Code_Point` — every code point a conforming
 * renderer draws as nothing and a tokenizer discards. This is the whole
 * property, not the six-range slice a hand-list settles into: it carries CGJ
 * U+034F, the Hangul and halfwidth fillers U+115F/U+1160/U+3164/U+FFA0, the
 * Khmer inherent vowels, all of U+2060-U+206F, the variation selectors
 * U+FE00-U+FE0F, and plane 14 in full. Bidi controls sit inside it (U+061C,
 * U+200E-U+200F, U+202A-U+202E, U+2066-U+2069), so they need no separate row.
 */
const DEFAULT_IGNORABLE_RANGES: readonly CodePointRange[] = [
  [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c], [0x115f, 0x1160],
  [0x17b4, 0x17b5], [0x180b, 0x180f], [0x200b, 0x200f], [0x202a, 0x202e],
  [0x2060, 0x206f], [0x3164, 0x3164], [0xfe00, 0xfe0f], [0xfeff, 0xfeff],
  [0xffa0, 0xffa0], [0xfff0, 0xfff8], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

/**
 * General_Category=Cf (format) code points that are NOT default-ignorable: the
 * Arabic and Kaithi prefixed format controls, the interlinear annotation marks,
 * and the Egyptian hieroglyph format controls. Invisible in the operative sense
 * — they carry no glyph of their own — so they split a keyword exactly as a
 * zero-width space does and belong in the same normalization.
 */
const FORMAT_ONLY_RANGES: readonly CodePointRange[] = [
  [0x0600, 0x0605], [0x06dd, 0x06dd], [0x070f, 0x070f], [0x0890, 0x0891],
  [0x08e2, 0x08e2], [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
];

/**
 * Unicode `Nonspacing_Mark` (General_Category=Mn) — every mark that renders on
 * the preceding glyph with no advance width of its own. The whole property, not
 * the Combining Diacritical Marks block that reproduces the reported payload:
 * a mark from any script stacks on a Latin letter, so `ig<U+0653>nore` (Arabic)
 * and `ig<U+0591>nore` (Hebrew) hide the keyword exactly as `ig<U+0307>nore`
 * does. One block covers 112 of the 2059 code points, which prices the
 * substitute at one code point.
 *
 * Mn alone. Spacing (Mc) and enclosing (Me) marks take advance width, so they
 * change the word a reader sees instead of hiding inside it — they break the
 * literal without preserving the appearance, which is the half of the evasion
 * that makes it work.
 */
const NONSPACING_MARK_RANGES: readonly CodePointRange[] = [
  [0x0300, 0x036f], [0x0483, 0x0487], [0x0591, 0x05bd], [0x05bf, 0x05bf], [0x05c1, 0x05c2],
  [0x05c4, 0x05c5], [0x05c7, 0x05c7], [0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670],
  [0x06d6, 0x06dc], [0x06df, 0x06e4], [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x0711, 0x0711],
  [0x0730, 0x074a], [0x07a6, 0x07b0], [0x07eb, 0x07f3], [0x07fd, 0x07fd], [0x0816, 0x0819],
  [0x081b, 0x0823], [0x0825, 0x0827], [0x0829, 0x082d], [0x0859, 0x085b], [0x0897, 0x089f],
  [0x08ca, 0x08e1], [0x08e3, 0x0902], [0x093a, 0x093a], [0x093c, 0x093c], [0x0941, 0x0948],
  [0x094d, 0x094d], [0x0951, 0x0957], [0x0962, 0x0963], [0x0981, 0x0981], [0x09bc, 0x09bc],
  [0x09c1, 0x09c4], [0x09cd, 0x09cd], [0x09e2, 0x09e3], [0x09fe, 0x09fe], [0x0a01, 0x0a02],
  [0x0a3c, 0x0a3c], [0x0a41, 0x0a42], [0x0a47, 0x0a48], [0x0a4b, 0x0a4d], [0x0a51, 0x0a51],
  [0x0a70, 0x0a71], [0x0a75, 0x0a75], [0x0a81, 0x0a82], [0x0abc, 0x0abc], [0x0ac1, 0x0ac5],
  [0x0ac7, 0x0ac8], [0x0acd, 0x0acd], [0x0ae2, 0x0ae3], [0x0afa, 0x0aff], [0x0b01, 0x0b01],
  [0x0b3c, 0x0b3c], [0x0b3f, 0x0b3f], [0x0b41, 0x0b44], [0x0b4d, 0x0b4d], [0x0b55, 0x0b56],
  [0x0b62, 0x0b63], [0x0b82, 0x0b82], [0x0bc0, 0x0bc0], [0x0bcd, 0x0bcd], [0x0c00, 0x0c00],
  [0x0c04, 0x0c04], [0x0c3c, 0x0c3c], [0x0c3e, 0x0c40], [0x0c46, 0x0c48], [0x0c4a, 0x0c4d],
  [0x0c55, 0x0c56], [0x0c62, 0x0c63], [0x0c81, 0x0c81], [0x0cbc, 0x0cbc], [0x0cbf, 0x0cbf],
  [0x0cc6, 0x0cc6], [0x0ccc, 0x0ccd], [0x0ce2, 0x0ce3], [0x0d00, 0x0d01], [0x0d3b, 0x0d3c],
  [0x0d41, 0x0d44], [0x0d4d, 0x0d4d], [0x0d62, 0x0d63], [0x0d81, 0x0d81], [0x0dca, 0x0dca],
  [0x0dd2, 0x0dd4], [0x0dd6, 0x0dd6], [0x0e31, 0x0e31], [0x0e34, 0x0e3a], [0x0e47, 0x0e4e],
  [0x0eb1, 0x0eb1], [0x0eb4, 0x0ebc], [0x0ec8, 0x0ece], [0x0f18, 0x0f19], [0x0f35, 0x0f35],
  [0x0f37, 0x0f37], [0x0f39, 0x0f39], [0x0f71, 0x0f7e], [0x0f80, 0x0f84], [0x0f86, 0x0f87],
  [0x0f8d, 0x0f97], [0x0f99, 0x0fbc], [0x0fc6, 0x0fc6], [0x102d, 0x1030], [0x1032, 0x1037],
  [0x1039, 0x103a], [0x103d, 0x103e], [0x1058, 0x1059], [0x105e, 0x1060], [0x1071, 0x1074],
  [0x1082, 0x1082], [0x1085, 0x1086], [0x108d, 0x108d], [0x109d, 0x109d], [0x135d, 0x135f],
  [0x1712, 0x1714], [0x1732, 0x1733], [0x1752, 0x1753], [0x1772, 0x1773], [0x17b4, 0x17b5],
  [0x17b7, 0x17bd], [0x17c6, 0x17c6], [0x17c9, 0x17d3], [0x17dd, 0x17dd], [0x180b, 0x180d],
  [0x180f, 0x180f], [0x1885, 0x1886], [0x18a9, 0x18a9], [0x1920, 0x1922], [0x1927, 0x1928],
  [0x1932, 0x1932], [0x1939, 0x193b], [0x1a17, 0x1a18], [0x1a1b, 0x1a1b], [0x1a56, 0x1a56],
  [0x1a58, 0x1a5e], [0x1a60, 0x1a60], [0x1a62, 0x1a62], [0x1a65, 0x1a6c], [0x1a73, 0x1a7c],
  [0x1a7f, 0x1a7f], [0x1ab0, 0x1abd], [0x1abf, 0x1add], [0x1ae0, 0x1aeb], [0x1b00, 0x1b03],
  [0x1b34, 0x1b34], [0x1b36, 0x1b3a], [0x1b3c, 0x1b3c], [0x1b42, 0x1b42], [0x1b6b, 0x1b73],
  [0x1b80, 0x1b81], [0x1ba2, 0x1ba5], [0x1ba8, 0x1ba9], [0x1bab, 0x1bad], [0x1be6, 0x1be6],
  [0x1be8, 0x1be9], [0x1bed, 0x1bed], [0x1bef, 0x1bf1], [0x1c2c, 0x1c33], [0x1c36, 0x1c37],
  [0x1cd0, 0x1cd2], [0x1cd4, 0x1ce0], [0x1ce2, 0x1ce8], [0x1ced, 0x1ced], [0x1cf4, 0x1cf4],
  [0x1cf8, 0x1cf9], [0x1dc0, 0x1dff], [0x20d0, 0x20dc], [0x20e1, 0x20e1], [0x20e5, 0x20f0],
  [0x2cef, 0x2cf1], [0x2d7f, 0x2d7f], [0x2de0, 0x2dff], [0x302a, 0x302d], [0x3099, 0x309a],
  [0xa66f, 0xa66f], [0xa674, 0xa67d], [0xa69e, 0xa69f], [0xa6f0, 0xa6f1], [0xa802, 0xa802],
  [0xa806, 0xa806], [0xa80b, 0xa80b], [0xa825, 0xa826], [0xa82c, 0xa82c], [0xa8c4, 0xa8c5],
  [0xa8e0, 0xa8f1], [0xa8ff, 0xa8ff], [0xa926, 0xa92d], [0xa947, 0xa951], [0xa980, 0xa982],
  [0xa9b3, 0xa9b3], [0xa9b6, 0xa9b9], [0xa9bc, 0xa9bd], [0xa9e5, 0xa9e5], [0xaa29, 0xaa2e],
  [0xaa31, 0xaa32], [0xaa35, 0xaa36], [0xaa43, 0xaa43], [0xaa4c, 0xaa4c], [0xaa7c, 0xaa7c],
  [0xaab0, 0xaab0], [0xaab2, 0xaab4], [0xaab7, 0xaab8], [0xaabe, 0xaabf], [0xaac1, 0xaac1],
  [0xaaec, 0xaaed], [0xaaf6, 0xaaf6], [0xabe5, 0xabe5], [0xabe8, 0xabe8], [0xabed, 0xabed],
  [0xfb1e, 0xfb1e], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0x101fd, 0x101fd], [0x102e0, 0x102e0],
  [0x10376, 0x1037a], [0x10a01, 0x10a03], [0x10a05, 0x10a06], [0x10a0c, 0x10a0f],
  [0x10a38, 0x10a3a], [0x10a3f, 0x10a3f], [0x10ae5, 0x10ae6], [0x10d24, 0x10d27],
  [0x10d69, 0x10d6d], [0x10eab, 0x10eac], [0x10efa, 0x10eff], [0x10f46, 0x10f50],
  [0x10f82, 0x10f85], [0x11001, 0x11001], [0x11038, 0x11046], [0x11070, 0x11070],
  [0x11073, 0x11074], [0x1107f, 0x11081], [0x110b3, 0x110b6], [0x110b9, 0x110ba],
  [0x110c2, 0x110c2], [0x11100, 0x11102], [0x11127, 0x1112b], [0x1112d, 0x11134],
  [0x11173, 0x11173], [0x11180, 0x11181], [0x111b6, 0x111be], [0x111c9, 0x111cc],
  [0x111cf, 0x111cf], [0x1122f, 0x11231], [0x11234, 0x11234], [0x11236, 0x11237],
  [0x1123e, 0x1123e], [0x11241, 0x11241], [0x112df, 0x112df], [0x112e3, 0x112ea],
  [0x11300, 0x11301], [0x1133b, 0x1133c], [0x11340, 0x11340], [0x11366, 0x1136c],
  [0x11370, 0x11374], [0x113bb, 0x113c0], [0x113ce, 0x113ce], [0x113d0, 0x113d0],
  [0x113d2, 0x113d2], [0x113e1, 0x113e2], [0x11438, 0x1143f], [0x11442, 0x11444],
  [0x11446, 0x11446], [0x1145e, 0x1145e], [0x114b3, 0x114b8], [0x114ba, 0x114ba],
  [0x114bf, 0x114c0], [0x114c2, 0x114c3], [0x115b2, 0x115b5], [0x115bc, 0x115bd],
  [0x115bf, 0x115c0], [0x115dc, 0x115dd], [0x11633, 0x1163a], [0x1163d, 0x1163d],
  [0x1163f, 0x11640], [0x116ab, 0x116ab], [0x116ad, 0x116ad], [0x116b0, 0x116b5],
  [0x116b7, 0x116b7], [0x1171d, 0x1171d], [0x1171f, 0x1171f], [0x11722, 0x11725],
  [0x11727, 0x1172b], [0x1182f, 0x11837], [0x11839, 0x1183a], [0x1193b, 0x1193c],
  [0x1193e, 0x1193e], [0x11943, 0x11943], [0x119d4, 0x119d7], [0x119da, 0x119db],
  [0x119e0, 0x119e0], [0x11a01, 0x11a0a], [0x11a33, 0x11a38], [0x11a3b, 0x11a3e],
  [0x11a47, 0x11a47], [0x11a51, 0x11a56], [0x11a59, 0x11a5b], [0x11a8a, 0x11a96],
  [0x11a98, 0x11a99], [0x11b60, 0x11b60], [0x11b62, 0x11b64], [0x11b66, 0x11b66],
  [0x11c30, 0x11c36], [0x11c38, 0x11c3d], [0x11c3f, 0x11c3f], [0x11c92, 0x11ca7],
  [0x11caa, 0x11cb0], [0x11cb2, 0x11cb3], [0x11cb5, 0x11cb6], [0x11d31, 0x11d36],
  [0x11d3a, 0x11d3a], [0x11d3c, 0x11d3d], [0x11d3f, 0x11d45], [0x11d47, 0x11d47],
  [0x11d90, 0x11d91], [0x11d95, 0x11d95], [0x11d97, 0x11d97], [0x11ef3, 0x11ef4],
  [0x11f00, 0x11f01], [0x11f36, 0x11f3a], [0x11f40, 0x11f40], [0x11f42, 0x11f42],
  [0x11f5a, 0x11f5a], [0x13440, 0x13440], [0x13447, 0x13455], [0x1611e, 0x16129],
  [0x1612d, 0x1612f], [0x16af0, 0x16af4], [0x16b30, 0x16b36], [0x16f4f, 0x16f4f],
  [0x16f8f, 0x16f92], [0x16fe4, 0x16fe4], [0x1bc9d, 0x1bc9e], [0x1cf00, 0x1cf2d],
  [0x1cf30, 0x1cf46], [0x1d167, 0x1d169], [0x1d17b, 0x1d182], [0x1d185, 0x1d18b],
  [0x1d1aa, 0x1d1ad], [0x1d242, 0x1d244], [0x1da00, 0x1da36], [0x1da3b, 0x1da6c],
  [0x1da75, 0x1da75], [0x1da84, 0x1da84], [0x1da9b, 0x1da9f], [0x1daa1, 0x1daaf],
  [0x1e000, 0x1e006], [0x1e008, 0x1e018], [0x1e01b, 0x1e021], [0x1e023, 0x1e024],
  [0x1e026, 0x1e02a], [0x1e08f, 0x1e08f], [0x1e130, 0x1e136], [0x1e2ae, 0x1e2ae],
  [0x1e2ec, 0x1e2ef], [0x1e4ec, 0x1e4ef], [0x1e5ee, 0x1e5ef], [0x1e6e3, 0x1e6e3],
  [0x1e6e6, 0x1e6e6], [0x1e6ee, 0x1e6ef], [0x1e6f5, 0x1e6f5], [0x1e8d0, 0x1e8d6],
  [0x1e944, 0x1e94a], [0xe0100, 0xe01ef],
];

/**
 * The Unicode tag block — the one invisible range the strip class deliberately
 * leaves alone, because {@link INJECTION_PATTERNS}'s `unicode-tag-smuggling`
 * row refuses it at `block` severity. Stripping it would launder that refusal
 * into the `invisible-chars` advisory at every normalize-then-scan gate: the
 * payload would vanish before the block pattern saw it, and a tag-encoded
 * override would report as a warning instead of an error.
 */
const TAG_BLOCK: CodePointRange = [0xe0000, 0xe007f];

/** Merge overlapping and adjacent ranges into an ascending, disjoint list. */
function mergeRanges(ranges: readonly CodePointRange[]): CodePointRange[] {
  const merged: CodePointRange[] = [];
  for (const [first, last] of [...ranges].toSorted((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous !== undefined && first <= previous[1] + 1) {
      merged[merged.length - 1] = [previous[0], Math.max(previous[1], last)];
    } else {
      merged.push([first, last]);
    }
  }
  return merged;
}

/** `ranges` with `[cutFirst, cutLast]` removed, splitting any range it bisects. */
function withoutRange(
  ranges: readonly CodePointRange[],
  [cutFirst, cutLast]: CodePointRange,
): CodePointRange[] {
  const kept: CodePointRange[] = [];
  for (const [first, last] of ranges) {
    if (last < cutFirst || first > cutLast) {
      kept.push([first, last]);
      continue;
    }
    if (first < cutFirst) kept.push([first, cutFirst - 1]);
    if (last > cutLast) kept.push([cutLast + 1, last]);
  }
  return kept;
}

/** `\uXXXX` escape for one UTF-16 code unit — the class never holds a literal glyph. */
function escapeUnit(unit: number): string {
  return `\\u${unit.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** `a` or `a-b`, as the interior of a character class. */
function classMember(first: number, last: number): string {
  return first === last ? escapeUnit(first) : `${escapeUnit(first)}-${escapeUnit(last)}`;
}

const highSurrogate = (cp: number): number => 0xd800 + ((cp - 0x10000) >> 10);
const lowSurrogate = (cp: number): number => 0xdc00 + ((cp - 0x10000) & 0x3ff);

/** One high surrogate and the span of low surrogates that pairs with it. */
interface SurrogateSpan {
  high: number;
  lowFirst: number;
  lowLast: number;
}

/** True when the span takes every low surrogate, so its high side can be range-merged. */
const isFullLow = (span: SurrogateSpan): boolean =>
  span.lowFirst === 0xdc00 && span.lowLast === 0xdfff;

/**
 * A supplementary-plane range as surrogate-pair alternatives.
 *
 * Astral code points cannot sit in a `[…]` class without the `u` flag, and that
 * flag is not available here: `hooks/scripts.ts` re-compiles
 * {@link INVISIBLE_SMUGGLING_CHARS}`.source` as `new RegExp(source, "g")` inside
 * a generated script, where a `\p{…}` or `u`-only source would silently degrade
 * to a literal-character class. Pairs are emitted instead, and runs of high
 * surrogates that take the full low range collapse into one alternative.
 */
function surrogateAlternatives([first, last]: CodePointRange): string[] {
  const spans: SurrogateSpan[] = [];
  for (let cursor = first; cursor <= last; ) {
    const high = highSurrogate(cursor);
    const blockLast = Math.min(last, 0x10000 + ((high - 0xd800 + 1) << 10) - 1);
    spans.push({ high, lowFirst: lowSurrogate(cursor), lowLast: lowSurrogate(blockLast) });
    cursor = blockLast + 1;
  }

  const alternatives: string[] = [];
  for (let index = 0; index < spans.length; ) {
    const span = spans[index]!;
    if (!isFullLow(span)) {
      const low =
        span.lowFirst === span.lowLast
          ? escapeUnit(span.lowFirst)
          : `[${classMember(span.lowFirst, span.lowLast)}]`;
      alternatives.push(`${escapeUnit(span.high)}${low}`);
      index += 1;
      continue;
    }
    let end = index;
    while (
      end + 1 < spans.length &&
      isFullLow(spans[end + 1]!) &&
      spans[end + 1]!.high === spans[end]!.high + 1
    ) {
      end += 1;
    }
    alternatives.push(`[${classMember(span.high, spans[end]!.high)}][${classMember(0xdc00, 0xdfff)}]`);
    index = end + 1;
  }
  return alternatives;
}

/** Regex source matching exactly `ranges`, valid with or without the `u` flag. */
function codePointClassSource(ranges: readonly CodePointRange[]): string {
  const basic: string[] = [];
  const alternatives: string[] = [];
  for (const [first, last] of ranges) {
    if (first <= 0xffff) basic.push(classMember(first, Math.min(last, 0xffff)));
    if (last > 0xffff) alternatives.push(...surrogateAlternatives([Math.max(first, 0x10000), last]));
  }
  if (basic.length > 0) alternatives.unshift(`[${basic.join("")}]`);
  return alternatives.length === 1 ? alternatives[0]! : `(?:${alternatives.join("|")})`;
}

/**
 * Every code point the engine reads as invisible: default-ignorable, or format.
 * Exceeds the strip class by exactly the tag block.
 */
const INVISIBLE_RANGES: readonly CodePointRange[] = mergeRanges([
  ...DEFAULT_IGNORABLE_RANGES,
  ...FORMAT_ONLY_RANGES,
]);

/**
 * Invisible characters used to smuggle keywords past a scan (`ig<ZWSP>nore`):
 * the complete Unicode default-ignorable + format set, less the tag block.
 *
 * Consumers strip this before scanning so a split keyword is scored on its
 * joined form. Deriving it from the properties — rather than from the handful
 * of characters an attack happened to use — is the whole point. An omitted
 * range does not make the gate narrower, it makes it open: the raw-scan
 * detector that would otherwise warn is {@link INVISIBLE_CHAR_SIGNAL}, and a
 * character missing from both sets passes with no error AND no warning, which
 * is a worse outcome than the split it was meant to catch.
 *
 * Carries the `g` flag for whole-string stripping: apply only via
 * `String.prototype.replace` — never call `.test()` on this instance, its
 * `lastIndex` is stateful across calls.
 */
export const INVISIBLE_SMUGGLING_CHARS: RegExp = new RegExp(
  codePointClassSource(withoutRange(INVISIBLE_RANGES, TAG_BLOCK)),
  "g",
);

/**
 * Raw-scan detector for invisible characters, derived from the Unicode
 * properties directly rather than from {@link INVISIBLE_SMUGGLING_CHARS}.
 *
 * The independence is the safety property. When the warn detector is built out
 * of the strip class, one omitted range costs both halves at once — the keyword
 * stays split through normalization AND the character is absent from the
 * detector — so the evasion is completely silent. Derived from the property set
 * instead, this stays a strict superset of what is stripped, so no invisible
 * character can be removed, or survive, without leaving a finding.
 */
const INVISIBLE_CHAR_SIGNAL: RegExp = new RegExp(codePointClassSource(INVISIBLE_RANGES));

/**
 * The override vocabulary the combining-mark row anchors on — the homoglyph
 * row's list.
 *
 * Six words against the ~40 rows of {@link CONTENT_DENY_PATTERNS}, whose
 * vocabulary is far wider (`findings`, `errors`, `exfiltrate`, `bypass`,
 * `credentials`). Both masking rows are therefore partial by construction on TWO
 * axes, not one: the 20-character window noted at
 * `combining-mark-instruction-mask`, and this list. A mask placed in a keyword
 * of a row named nowhere here — `ig<U+0307>nore all findings` — anchors on
 * nothing and these rows stay silent.
 *
 * That is a detection limit, not a coverage hole: {@link joinMaskedWords}
 * answers the general class by rejoining the word, which is vocabulary-free, and
 * the block row the payload was aimed at fires on the joined copy. These rows
 * keep their narrow list on purpose — they report ADJACENCY, which needs a
 * strong anchor to stay advisory-grade on accented prose, and widening them to
 * every deny keyword would warn on ordinary documents without catching anything
 * the joined copy does not already refuse.
 */
const OVERRIDE_KEYWORD_SOURCE = "(?:ignore|system|instructions?|you\\s+are|disregard|override)";

/**
 * A nonspacing mark within 20 characters of an override keyword, in either
 * order — {@link INJECTION_PATTERNS}'s `combining-mark-instruction-mask`.
 *
 * Assembled from {@link NONSPACING_MARK_RANGES} rather than written as a
 * literal class, so the row covers the property in full and the test suite can
 * cross-check it against the runtime's own data. `codePointClassSource` keeps
 * the astral marks (Adlam, Bassa Vah, Duployan) in the `u`-flag-free dialect by
 * emitting surrogate pairs, so the source still recompiles unchanged.
 */
const NONSPACING_MARK_CLASS = codePointClassSource(NONSPACING_MARK_RANGES);
const COMBINING_MARK_MASK: RegExp = new RegExp(
  `${NONSPACING_MARK_CLASS}[\\s\\S]{0,20}${OVERRIDE_KEYWORD_SOURCE}|` +
    `${OVERRIDE_KEYWORD_SOURCE}[\\s\\S]{0,20}${NONSPACING_MARK_CLASS}`,
  "i",
);

/**
 * Latin-confusable code points, grouped by the ASCII letter each impersonates.
 * Numeric code points, never literal glyphs: a pasted Cyrillic "o" is
 * indistinguishable from an ASCII "o" in every code font, so a table of glyphs
 * could not be reviewed in a diff — which is the property the attack exploits.
 *
 * Keyed by IMPERSONATED GLYPH, both cases listed explicitly. The predecessor
 * held lower-case rows only and derived the upper-case half through the Unicode
 * simple case mapping, which is the wrong function for this table: case mapping
 * preserves letter IDENTITY, and this table is about RESEMBLANCE. Greek η
 * resembles `n`, but its upper case Η resembles `H`, not `N`; υ resembles `u`
 * and Υ resembles `Y`; ν resembles `v` and Ν resembles `N`; γ resembles `y`
 * while Γ resembles no ASCII letter at all. The derivation produced six rows
 * pointing at a letter their glyph does not impersonate and left no route from
 * any upper-case Greek letter to Latin `H`, `N` or `Y` — so `STAMITΥ:BEGIN` and
 * the base64 rows, the two case-SENSITIVE patterns in the corpus, folded to
 * nothing. Rows whose upper case impersonates nothing (Γ, Г, Ω) are simply
 * absent rather than mapped to a near-miss.
 *
 * Four script families, and every row is a glyph a reader cannot distinguish
 * from the ASCII letter it is filed under:
 *
 *   - **Cyrillic** and **Greek** — the cross-script core.
 *   - **Armenian** — `հ`/`ո`/`օ`/`ս` are `h`/`n`/`o`/`u` to any reader. The row
 *     this table used to carry saying Armenian was deliberately absent priced
 *     the omission as a guess-surface saving; it was a hole. `joinMaskedWords`
 *     does not stand in for it — that stage DELETES a non-ASCII run, which
 *     rejoins a keyword split by a mark and mangles one whose letter was
 *     SUBSTITUTED (`ig<U+0578>ore` joins to `igore`, not `ignore`).
 *   - **Dotless i and IPA** (U+0131, U+0130, and the IPA Extensions block) —
 *     `ı`, `ɡ`, `ɑ`, `ɛ`, and the small capitals `ɪ ʙ ʜ ʟ ɴ ʀ ʏ`. These are
 *     Latin-script code points, so nothing about them looks foreign in a diff
 *     and no proximity row treats them as suspicious: the
 *     `homoglyph-instruction-mask` row's ranges are Cyrillic, Greek, Armenian,
 *     Cherokee, Georgian and Coptic, none of which contain U+0131.
 *
 * Cherokee, Georgian and Coptic remain fold-absent; the proximity row still
 * covers them whenever a confusable sits within 20 characters of an intact
 * keyword, and a phrase spelled entirely in one of those three is a known gap
 * rather than an unexamined one.
 *
 * Rows are keyed on the POST-NFKC code point, because {@link foldConfusables}
 * normalizes before it maps. The lunate sigma is the case that proves it: a row
 * keyed on U+03F2 is never consulted, since NFKC has already rewritten it to
 * U+03C2, so the row must carry U+03C2 to fire at all. The test suite folds
 * every row and asserts the ASCII letter comes back, which is what turns a dead
 * row from a silent hole into a failure.
 */
const LATIN_CONFUSABLES: Readonly<Record<string, readonly number[]>> = {
  // ── lower case: Cyrillic, Greek, Armenian, dotless-i/IPA ──
  a: [0x0430, 0x03b1, 0x0251],
  // U+042C is the upper-case Cyrillic soft sign, filed here rather than under
  // `B`: its glyph is a lower-case `b`, which is what a reader sees.
  b: [0x0432, 0x044c, 0x042c, 0x03b2],
  // U+03C2 is where a pasted lunate sigma (U+03F2) lands after NFKC, and the
  // only place this row can catch it; the pre-normalization code point the
  // predecessor listed was unreachable.
  c: [0x0441, 0x03c2],
  d: [0x0501, 0x056a],
  e: [0x0435, 0x03b5, 0x025b],
  g: [0x050d, 0x0261, 0x0581],
  h: [0x04bb, 0x0570],
  i: [0x0456, 0x03b9, 0x0131, 0x0269],
  j: [0x0458, 0x03f3, 0x0575],
  k: [0x043a, 0x03ba],
  l: [0x04cf, 0x056c],
  m: [0x043c],
  n: [0x03b7, 0x0578],
  o: [0x043e, 0x03bf, 0x0585],
  p: [0x0440, 0x03c1],
  q: [0x051b, 0x0563, 0x0566],
  r: [0x0433],
  s: [0x0455],
  t: [0x0442, 0x03c4],
  u: [0x03c5, 0x057d],
  v: [0x0475, 0x03bd, 0x028b],
  w: [0x051d, 0x03c9],
  x: [0x0445, 0x03c7],
  y: [0x0443, 0x03b3, 0x0263],
  z: [0x03b6],
  // ── upper case: listed, never case-mapped from the rows above ──
  A: [0x0410, 0x0391],
  B: [0x0412, 0x0392, 0x0299],
  // No capital lunate sigma: NFKC rewrites U+03F9 to Σ, which impersonates no
  // ASCII letter, so the glyph is unrecoverable by the time the map is read.
  C: [0x0421],
  D: [0x0500],
  E: [0x0415, 0x0395],
  G: [0x050c],
  // Cyrillic Н (U+041D) and Greek Η (U+0397) are the two `H` lookalikes the
  // case-mapped table could not reach: Н has no `h`-shaped lower case to derive
  // from, and Η derived from η, which impersonates `n`.
  H: [0x041d, 0x04ba, 0x0397, 0x029c],
  // The palochka U+04C0 and the Turkish dotted İ both render as a bare capital
  // `I`; the derivation filed U+04C0 under `L`, which has a foot it does not.
  I: [0x0406, 0x0399, 0x04c0, 0x0130, 0x026a],
  J: [0x0408, 0x037f],
  K: [0x041a, 0x039a],
  L: [0x053c, 0x029f],
  M: [0x041c, 0x039c],
  N: [0x039d, 0x0274],
  O: [0x041e, 0x039f, 0x0555],
  P: [0x0420, 0x03a1],
  Q: [0x051a],
  R: [0x0280],
  S: [0x0405],
  T: [0x0422, 0x03a4],
  U: [0x054d],
  V: [0x0474],
  W: [0x051c],
  X: [0x0425, 0x03a7],
  Y: [0x0423, 0x04ae, 0x03a5, 0x028f],
  Z: [0x0396],
};

/**
 * Reverse index of {@link LATIN_CONFUSABLES}, keyed by code unit: confusable ->
 * the ASCII letter it impersonates. A flat inversion of the table above and
 * nothing else — no case derivation, because the only correct source for an
 * upper-case row is the glyph, and the glyph is what the table records.
 *
 * Every mapped code point is in the BMP, which is what lets the fold walk code
 * units instead of code points: no surrogate half can collide with a key. The
 * test suite asserts that invariant over the whole table rather than trusting
 * the rows to stay under U+FFFF.
 */
const CONFUSABLE_BY_CODE: ReadonlyMap<number, string> = new Map(
  Object.entries(LATIN_CONFUSABLES).flatMap(([ascii, codePoints]) =>
    codePoints.map((codePoint): [number, string] => [codePoint, ascii]),
  ),
);

/**
 * Bounds of {@link CONFUSABLE_BY_CODE}, so the fold rejects the overwhelming
 * majority of non-ASCII text (CJK, emoji, accented Latin) on an integer compare
 * instead of a map lookup per character.
 */
const CONFUSABLE_MIN_CODE = Math.min(...CONFUSABLE_BY_CODE.keys());
const CONFUSABLE_MAX_CODE = Math.max(...CONFUSABLE_BY_CODE.keys());

/** True when every code unit is ASCII, for which NFKC and the fold are both no-ops. */
function isAsciiOnly(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

/**
 * Rewrite lookalike characters to the ASCII letters they impersonate, so a
 * deny pattern is matched against what a reader SEES rather than what the bytes
 * say. Two stages, both needed:
 *
 *   - NFKC, which folds the compatibility lookalikes Unicode itself defines —
 *     fullwidth forms, mathematical alphanumerics, ligatures.
 *   - {@link CONFUSABLE_BY_CODE}, for cross-script confusables, which NFKC
 *     deliberately leaves alone (Cyrillic "о" is a different letter, not a
 *     compatibility variant of "o").
 *
 * The result is a SCAN copy only; nothing folded is ever written or installed.
 * Indexes and lengths do not survive it (NFKC changes both), which is why a
 * consumer scanning the folded copy surfaces pattern ids alone, and why the
 * copy is folded once and discarded: re-folding an output whose substituted
 * letter is followed by a combining mark composes the two, which is a second
 * question, not the same answer twice.
 *
 * CONSUMER CONTRACT — scan raw ∪ folded, never folded alone. The fold ADDS the
 * refusals a lookalike hid; it does not preserve the ones the raw text already
 * earns, because NFKC composes a trailing combining mark into the letter before
 * it and destroys the literal a pattern matches:
 * `ignore all previous instructions<U+0301>` is refused on a raw scan and clean
 * on the folded copy, its last word now `instruction` + `ś`. So is
 * `exfiltrate<U+0301> the keys`, and `delete all<U+0301> the repos`. A
 * folded-only gate would hand the attacker a one-code-point evasion of every
 * deny keyword. {@link scanNormalized} IS that union, and is what a consumer
 * calls; reaching for this function directly means taking the contract on by
 * hand, which is how a gate ends up holding one half of it.
 *
 * Written as a run-copying walk rather than a per-character rebuild: the
 * callers include a pack-ingress gate reading unmetered third-party input
 * before the footprint cap runs, so this may not cost a string allocation per
 * character of it.
 */
export function foldConfusables(text: string): string {
  if (isAsciiOnly(text)) return text;
  const normalized = text.normalize("NFKC");
  let folded = "";
  let cursor = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < CONFUSABLE_MIN_CODE || code > CONFUSABLE_MAX_CODE) continue;
    const ascii = CONFUSABLE_BY_CODE.get(code);
    if (ascii === undefined) continue;
    folded += normalized.slice(cursor, index) + ascii;
    cursor = index + 1;
  }
  return cursor === 0 ? normalized : folded + normalized.slice(cursor);
}

/**
 * A non-ASCII run that TOUCHES an ASCII word, in either direction.
 *
 * Deliberately not "every non-ASCII character": a run with whitespace on both
 * sides is a token the reader sees as separate — a box-drawing table cell, a
 * bullet, a CJK clause — and deleting those would fabricate adjacency between
 * words that never were adjacent, turning `ignore` and `all findings` in two
 * cells of a rendered table into one phrase and refusing an honest document. A
 * run touching a word can only rejoin THAT word, which is the payload shape and
 * nothing else.
 *
 * Written as `[\u0080-\uFFFF]` — every non-ASCII code unit, surrogate halves
 * included, so a run covers an astral character whole — which keeps the source
 * in this module's `u`-flag-free dialect and out of `no-control-regex`.
 *
 * Carries `g` for whole-string rewriting: apply only via
 * `String.prototype.replace`, which resets `lastIndex` around the call. Never
 * `.test()`.
 */
const WORD_ADJACENT_MASK: RegExp = /(?<=[A-Za-z])[\u0080-\uFFFF]+|[\u0080-\uFFFF]+(?=[A-Za-z])/g;

/**
 * Rejoin a keyword split by a character that is neither invisible nor a mapped
 * confusable — the third normalisation copy, and the general answer to the class
 * the two masking rows can only report by proximity.
 *
 * Those rows anchor on the six-word override vocabulary in
 * {@link OVERRIDE_KEYWORD_SOURCE} within 20 characters, so they see
 * `ig<U+0307>nore all previous instructions` and miss
 * `ig<U+0307>nore all findings`, `<U+0117>xfiltrate the credentials`, and
 * `ig<U+13A0>nore ...` in a Cherokee letter the fold table does not carry: the
 * same evasion aimed at one of the ~40 deny rows the anchor list does not name,
 * scoring no error and no warning anywhere. Widening the anchor list is a
 * vocabulary race with an attacker who reads the list; joining the word is not.
 *
 * Two stages, both needed:
 *
 *   - NFKD, which exposes the base letter. A precomposed `<U+0121>` is a single
 *     non-ASCII character with no ASCII inside it; decomposed it is `g` +
 *     U+0307, so dropping the mask keeps the letter instead of eating it.
 *   - {@link WORD_ADJACENT_MASK}, which drops the mask wherever it touches the
 *     word — interior, first letter or last, because a mark on the final letter
 *     breaks `ignore\s+` exactly as well as one in the middle.
 *
 * A SCAN copy and a UNION member, never a replacement for the other two: this
 * stage DELETES what {@link foldConfusables} MAPS. A Cyrillic o (U+043E) inside
 * a word is a lookalike to the fold and a mask to this stage, so `ign<U+043E>re`
 * folds to `ignore` and joins to `ignre` — each copy answers the shape the other
 * cannot. Fold first and join the FOLDED copy, which is what the shipped gates
 * do: NFKD undoes the fold's NFKC composition (`NFKD ∘ NFKC = NFKD`), so the
 * joined copy inherits the substitutions without the composition damage the
 * fold's own contract warns about.
 *
 * Pure ASCII joins to itself, so honest content pays one pass over code units it
 * already had and no allocation.
 */
export function joinMaskedWords(text: string): string {
  if (isAsciiOnly(text)) return text;
  return text.normalize("NFKD").replace(WORD_ADJACENT_MASK, "");
}

/**
 * The composed scan copy every deny surface reads beside the raw text: fold
 * lookalikes to ASCII, then join what the fold could not map.
 *
 * One entry point rather than two calls at each gate, because the ORDER is a
 * correctness property and re-deriving it per consumer is how three of nine
 * surfaces ended up with no normalization at all. Fold first: `NFKD ∘ NFKC =
 * NFKD`, so the join inherits the fold's substitutions, while joining first
 * would delete the very run the fold was going to map (`ign<U+043E>re` joins to
 * `ignre` and folds to nothing).
 *
 * Applied ONCE per scan, to a copy that is scanned and discarded. Re-normalizing
 * an already-normalized string is a different question, not the same answer
 * twice: the fold's NFKC composes a substituted letter with a following
 * combining mark, so a second pass reads a string the first pass created rather
 * than the text the author wrote.
 *
 * CONSUMER CONTRACT — scan raw ∪ normalized, never normalized alone. See
 * {@link foldConfusables}: NFKC destroys the literal a pattern matches when a
 * combining mark trails a keyword, so `ignore all previous instructions<U+0301>`
 * is refused on the raw text and clean here. {@link scanNormalized} is that
 * union, and is what a gate should call.
 */
export function normalizeForDenyScan(text: string): string {
  return joinMaskedWords(foldConfusables(text));
}

/**
 * Write-path block set: content headed for generated artifacts or agent
 * context is refused outright on a hit. Covers destructive-shell and
 * secret-exfil vocabulary, instruction-override phrasing, and structural
 * authority-escalation (content self-promoting above system/security tier,
 * or binding another agent role to a behavioral imperative).
 */
export const CONTENT_DENY_PATTERNS: readonly DenyPattern[] = [
  { id: "skip-security-review", pattern: /skip\s+(?:security|review|audit)/i, severity: "block", description: "instruction to skip a security, review, or audit step" },
  { id: "ignore-findings", pattern: /ignore\s+(?:all\s+)?(?:findings|errors|warnings|vulnerabilities)/i, severity: "block", description: "instruction to ignore findings, errors, warnings, or vulnerabilities" },
  { id: "disable-security-controls", pattern: /disable\s+(?:security|review|audit|test)/i, severity: "block", description: "instruction to disable security, review, audit, or test controls" },
  { id: "exfiltrate", pattern: /exfiltrate/i, severity: "block", description: "data exfiltration vocabulary" },
  { id: "send-data-external", pattern: /send\s+(?:to|data|code)\s+(?:external|remote|http)/i, severity: "block", description: "sending data or code to an external destination" },
  { id: "bypass-security", pattern: /bypass\s+(?:security|auth|permission|review)/i, severity: "block", description: "bypassing security, auth, permission, or review" },
  { id: "delete-everything", pattern: /delete\s+(?:all|everything|repo)/i, severity: "block", description: "bulk-destructive delete instruction" },
  { id: "never-verify", pattern: /never\s+(?:review|test|check|audit|scan)/i, severity: "block", description: "blanket ban on review, test, check, audit, or scan activity" },
  { id: "override-security", pattern: /override\s+(?:all\s+)?security/i, severity: "block", description: "overriding security controls" },
  { id: "encoded-eval", pattern: /(?:atob|Buffer\.from)\s*\([^)]*(?:eval|exec|require)/i, severity: "block", description: "decode-then-execute chain (atob/Buffer.from into eval/exec/require)" },
  { id: "permission-mutation", pattern: /(?:chmod|chown)\s+[0-7]{3,4}/i, severity: "block", description: "chmod/chown filesystem permission mutation" },
  { id: "inline-secret-assignment", pattern: /(?:api[_-]?key|password|token|secret)\s*[:=]\s*.{8,}/i, severity: "block", description: "inline secret assignment (api key, password, token, secret)" },
  { id: "ignore-previous-instructions", pattern: /ignore\s+(?:all\s+)?previous\s+instructions/i, severity: "block", description: "override of previous instructions" },
  { id: "disregard-previous", pattern: /disregard\s+(?:all\s+)?(?:previous|prior|above)/i, severity: "block", description: "disregard of previous, prior, or above context" },
  { id: "role-reassignment", pattern: /you\s+are\s+now\s+(?:a|an|the)\s/i, severity: "block", description: "role reassignment (you are now ...)" },
  { id: "new-instructions-header", pattern: /new\s+instructions\s*:/i, severity: "block", description: "injected new-instructions header" },
  { id: "system-prompt-header", pattern: /system\s+prompt\s*:/i, severity: "block", description: "injected system-prompt header" },
  { id: "forget-previous", pattern: /forget\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|context)/i, severity: "block", description: "instruction to forget previous instructions, rules, or context" },
  { id: "act-as-jailbroken", pattern: /act\s+as\s+(?:a|an)\s+(?:unrestricted|unfiltered|jailbroken)/i, severity: "block", description: "act-as unrestricted/unfiltered/jailbroken persona" },
  { id: "do-not-follow-previous", pattern: /do\s+not\s+follow\s+(?:any|the|your)\s+(?:previous|prior|above|original)\s/i, severity: "block", description: "instruction to not follow previous or original instructions" },
  { id: "remote-exec-pipe", pattern: /(?:curl|wget|fetch)\s+.*\|\s*(?:bash|sh|eval)/i, severity: "block", description: "remote fetch piped into a shell" },
  { id: "remove-safety-checks", pattern: /remove\s+(?:all\s+)?(?:security|safety)\s+(?:checks|guards|measures)/i, severity: "block", description: "removal of security or safety checks" },
  { id: "execute-untrusted-code", pattern: /(?:execute|run)\s+(?:arbitrary|untrusted|remote)\s+(?:code|commands?)/i, severity: "block", description: "execution of arbitrary, untrusted, or remote code" },
  { id: "phone-home", pattern: /(?:connect|phone)\s+home/i, severity: "block", description: "phone-home behavior" },
  { id: "reverse-shell", pattern: /(?:reverse|bind)\s+shell/i, severity: "block", description: "reverse or bind shell" },
  { id: "upload-exfil", pattern: /(?:upload|exfil)\s+(?:to|data|credentials|keys)/i, severity: "block", description: "upload or exfiltration of data, credentials, or keys" },
  { id: "disable-logging", pattern: /(?:disable|turn\s+off|remove)\s+(?:logging|monitoring|audit)/i, severity: "block", description: "disabling logging, monitoring, or audit" },
  { id: "hardcoded-credentials", pattern: /(?:hardcoded|embedded)\s+(?:credentials?|secrets?|passwords?)/i, severity: "block", description: "hardcoded or embedded credentials" },
  { id: "from-now-on-ignore", pattern: /(?:from\s+now\s+on|going\s+forward),?\s+(?:ignore|disregard|forget)\s/i, severity: "block", description: "temporal override (from now on, ignore/disregard/forget)" },
  { id: "pretend-role", pattern: /pretend\s+(?:you\s+are|to\s+be)\s+(?:a|an|the)\s/i, severity: "block", description: "pretend-to-be persona switch" },
  { id: "reveal-system-prompt", pattern: /(?:reveal|show|display|output)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|rules)/i, severity: "block", description: "request to reveal prompt, instructions, or rules" },
  { id: "jailbreak-mode", pattern: /(?:jailbreak|dan\s+mode|developer\s+mode)/i, severity: "block", description: "jailbreak / DAN mode / developer mode vocabulary" },
  { id: "print-system-prompt", pattern: /(?:output|print|write)\s+(?:the|your)\s+(?:initial|original|system)\s+(?:prompt|instructions)/i, severity: "block", description: "request to print the original or system prompt" },
  // Structural authority escalation: each pattern requires an explicit
  // authority object or agent-role subject, so benign prose ("the dark theme
  // takes precedence over the light theme") does not match.
  { id: "authority-tier-escalation", pattern: /(?:takes?\s+precedence\s+over|overrides?|supersedes?|superc[ei]des?)\s+(?:the\s+|all\s+|any\s+|your\s+)*(?:system|developer|project|framework|security|agent|prior|above|previous)\s+(?:instruction|rule|prompt|polic|setting|requirement|directive|config|context)/i, severity: "block", description: "content claiming precedence over system/developer/security authority" },
  { id: "treat-as-system-authority", pattern: /treat\s+(?:this|that|the\s+following|it|these)\s+(?:as\s+)?(?:a\s+|an\s+)?(?:system|developer|higher[\s-]?(?:tier|priority|authority|trust)|elevated|privileged)\s+(?:instruction|prompt|rule|command|message|directive|authority|tier)/i, severity: "block", description: "re-tiering content as a system or privileged instruction" },
  { id: "role-must-always", pattern: /\b(?:implementer|reviewer|planner|orchestrator|fixer|researcher|loader|the\s+(?:agent|assistant|model|llm|ai|bot|system))\b[^.\n]{0,40}\bmust\s+always\b/i, severity: "block", description: "agent role bound to an unconditional behavioral imperative" },
  // Requires a deny-vocabulary directive after the execution clause, so plain
  // narration ("when the agent runs the build, it reads the env file") stays clean.
  { id: "cross-agent-directive", pattern: /\bwhen\s+(?:the\s+)?(?:implementer|reviewer|planner|orchestrator|fixer|researcher|agent|assistant|model|llm|ai)\b[^.\n]{0,30}\b(?:runs?|reads?|loads?|sees?|processes?|executes?)\b[^.\n]{0,40}\b(?:ignore|skip|disable|bypass|delete|remove|overrides?|exfiltrate|reveal|forget|disregard|never|do\s+not|must\s+always)\b/i, severity: "block", description: "directive keyed to another agent's execution" },
];

/**
 * Prompt-injection set for inter-agent and untrusted-input surfaces:
 * role/template/tool markup, control characters, and the invisible-character
 * smuggling companions (tag-block payloads, base64-encoded overrides,
 * homoglyph masking). Consumers needing the write-path vocabulary as well
 * pass `[...CONTENT_DENY_PATTERNS, ...INJECTION_PATTERNS]`.
 */
export const INJECTION_PATTERNS: readonly DenyPattern[] = [
  { id: "role-colon-injection", pattern: /(?:^|\n)\s*(?:system|assistant|user)\s*:\s*$/im, severity: "block", description: "conversation role header (system/assistant/user colon line)" },
  { id: "chat-template-tokens", pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i, severity: "block", description: "chat template control tokens" },
  // Interior bounded to non-brace chars so a long `{` run cannot backtrack
  // super-linearly (ReDoS) while ERB/Handlebars spans still match.
  //
  // The closing tag carries `(?!%)` so the magrittr pipe `%>%` — R's most common
  // operator, and ordinary prose in any repo that writes R — is not a
  // block-severity hit. Without it `df %>% filter(x)` hard-refused an honest
  // document at the learnings and handoff write gates, and the prompt guard
  // silently rewrote the operator out of its sanitized output, which is the
  // worse half: the caller forwards text the author never wrote. An orphan `%>`
  // with no opening tag still matches, so a template split across a boundary is
  // not laundered by the lookahead.
  { id: "template-injection", pattern: /<%[-=]?\s|%>(?!%)|\{\{[^{}]*\}\}/, severity: "block", description: "template-literal injection (ERB/Handlebars)" },
  { id: "html-comment-role-escalation", pattern: /<!--\s*(?:SYSTEM|ADMIN|ROOT)\s*-->/i, severity: "block", description: "HTML comment role escalation" },
  // oxlint-disable-next-line no-control-regex -- NUL and ESC are the attack payload this pattern detects
  { id: "control-char-injection", pattern: /\x00|\x1b\[/, severity: "block", description: "null byte or ANSI escape sequence injection" },
  { id: "tool-call-injection", pattern: /(?:tool_call|function_call)\s*\(/i, severity: "block", description: "tool/function call invocation attempt" },
  { id: "tool-delimiter-token", pattern: /<\|(?:tool|function|plugin)\|>/i, severity: "block", description: "tool delimiter injection token" },
  // Unicode Tag block U+E0000–U+E007F, written as an explicit surrogate pair
  // so the class matches without the `u` flag. The block has no legitimate
  // use in inter-agent text; any occurrence is treated as smuggling.
  { id: "unicode-tag-smuggling", pattern: /\uDB40[\uDC00-\uDC7F]/, severity: "block", description: "Unicode tag characters U+E0000-U+E007F (invisible payload)" },
  // Raw-scan signal for keyword-splitting smuggling (`ig<ZWSP>nore`): warn,
  // not block, because ZWJ also appears in legitimate emoji sequences. Shares
  // its id with the sanitizer's strip stage, but NOT its character class: this
  // is INVISIBLE_CHAR_SIGNAL, the property-derived superset, so a character the
  // strip class leaves in place (the tag block) or a future property addition
  // still produces a finding rather than a silent pass.
  { id: "invisible-chars", pattern: new RegExp(INVISIBLE_CHAR_SIGNAL.source), severity: "warn", description: "default-ignorable or format character (possible keyword-splitting smuggling)" },
  // Base64 encodings of canonical override phrases (upper- and lower-case
  // seeds), anchored to specific fragments so arbitrary base64 never matches.
  { id: "base64-instruction-override", pattern: /(?:SWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|aWdub3JlIGFsbCBwcmV2aW91cyBpbnN0cnVjdGlvbnM|SWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|aWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw|RGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|ZGlzcmVnYXJkIHByZXZpb3VzIGluc3RydWN0aW9ucw|U3lzdGVtIHByb21wdDo|c3lzdGVtIHByb21wdDo|WW91IGFyZSBub3c|eW91IGFyZSBub3c|Rm9yZ2V0IGFsbCBwcmV2aW91cw|Zm9yZ2V0IGFsbCBwcmV2aW91cw|QWN0IGFzIGFu|YWN0IGFzIGFu)/, severity: "block", description: "base64-encoded instruction-override phrase" },
  // Lower-confidence signal by design: a Latin-confusable script letter next
  // to an override keyword is strong evidence of smuggling, but not proof.
  { id: "homoglyph-instruction-mask", pattern: /[\u0400-\u04FF\u0370-\u03FF\u0530-\u058F\u13A0-\u13FF\u10A0-\u10FF\u2C80-\u2CFF][\s\S]{0,20}(?:ignore|system|instructions?|you\s+are|disregard|override)|(?:ignore|system|instructions?|you\s+are|disregard|override)[\s\S]{0,20}[\u0400-\u04FF\u0370-\u03FF\u0530-\u058F\u13A0-\u13FF\u10A0-\u10FF\u2C80-\u2CFF]/i, severity: "warn", description: "non-ASCII confusable adjacent to an override keyword" },
  // The third character-evasion class. A nonspacing mark is not
  // default-ignorable and not `Cf`, so the strip class leaves it — correctly, it
  // carries the accent in ordinary prose — and NFKC preserves it or welds it
  // onto the letter it masks, so {@link foldConfusables} cannot restore the
  // keyword either. `ig<U+0307>nore all previous instructions` therefore scored
  // clean at every gate. The class is Mn in full
  // ({@link NONSPACING_MARK_RANGES}), not the Latin block the payload happened
  // to use. Detection HERE is proximity-only, on the homoglyph row's shape:
  // masking one keyword leaves the rest of the phrase intact, and an intact
  // keyword within 20 characters of a mark is the anchor — bounded by that
  // window AND by {@link OVERRIDE_KEYWORD_SOURCE}'s six words, which is why the
  // general answer to the class is {@link joinMaskedWords} and this row is the
  // advisory that names it. Warn, not block — accented prose carries these marks legitimately,
  // so a block here would refuse honest content; a surface reading unmetered
  // third-party supply raises the severity at its own gate, the way pack
  // ingress already promotes `homoglyph-instruction-mask`. Warn also means the
  // row never redacts (see {@link sanitizeContent}), which is what lets the
  // class be this wide: a false positive costs an advisory, not a deleted span
  // of someone's prose.
  { id: "combining-mark-instruction-mask", pattern: COMBINING_MARK_MASK, severity: "warn", description: "nonspacing mark adjacent to an override keyword (possible keyword-masking smuggling)" },
  { id: "image-url-exfiltration", pattern: /!\[[^\]]{0,200}\]\(\s*(?:https?:|data:|file:)|<img[^>]+src\s*=\s*["']\s*(?:https?:|data:)/i, severity: "block", description: "markdown/HTML image URL exfiltration attempt" },
  { id: "error-frame-override", pattern: /(?:error|exception|warning|debug|stderr|traceback|panic)[\s:=-]{1,4}[^\n]{0,80}(?:reveal|print|output|dump|show|leak|expose|display)\s+(?:the\s+|your\s+)?(?:system\s+prompt|prompt|instructions?|context|secrets?|tokens?|keys?)/i, severity: "block", description: "error/debug frame wrapping an instruction override" },
];

/**
 * The `block` rows of {@link INJECTION_PATTERNS} that carry no honest-authoring
 * shape, and so refuse rather than advise at every gate reading user-authored
 * text.
 *
 * `unicode-tag-smuggling` is the only one, because it is the only one whose hit
 * IS the payload rather than a shape the payload also takes: the tag block
 * carries an invisible copy of whatever the attacker wants the model to read,
 * and nothing an author writes on purpose lands in plane 14. The rows it is
 * separated from are exactly the ones with an honest shape — a documented
 * `{{token}}`, a quoted `System:` transcript line — which is why a gate that
 * refused the whole set would lose its credibility on the findings that matter.
 *
 * Read it with {@link INVISIBLE_SMUGGLING_CHARS}, which deliberately leaves the
 * tag block in the text so this row can score it. The two halves are one
 * contract, and a gate that keeps only the first inherits them as a hole rather
 * than a defence: the splitter is never removed, so `ig<U+E0041>nore all
 * previous instructions` never rejoins for {@link CONTENT_DENY_PATTERNS}, AND
 * the row that refuses the splitter itself is never consulted. Scanning this
 * set over the RAW text is what closes it — which is why the set lives here,
 * next to the class it is paired with, instead of inside one consumer.
 */
export const NO_HONEST_SHAPE_INJECTION_ROWS: ReadonlySet<string> = new Set([
  "unicode-tag-smuggling",
]);

/**
 * Learnings/handoff-specific vectors. User-authored memory files re-enter
 * agent context on later sessions, so forged instruction headers, config
 * frontmatter, managed-block markers, and cross-agent overrides are hard
 * errors at the write gate.
 */
export const LEARNINGS_INJECTION_PATTERNS: readonly DenyPattern[] = [
  { id: "fake-instruction-header", pattern: /^#{1,2}\s*(?:system\s+prompt|instructions|you\s+are|role)\s*:/im, severity: "block", description: "markdown header impersonating system instructions" },
  // A MODEL-confusion control, not a config-parsing one. Nothing in the engine
  // parses a second `---` block: `content/frontmatter.ts` reads the opening
  // fence and stops, so an embedded block overrides no setting anywhere. What it
  // does is put a fenced head in front of a model that reads the file as
  // context, spelling `protected:`, `scope:` or `model:` in the syntax the
  // engine's own artifacts use — authority borrowed from a shape rather than
  // claimed in a sentence, which is why the row blocks rather than warns.
  //
  // The 2 KB gap is therefore the control's SCOPE, not a compromise inside it: a
  // key that far below the fence no longer reads as that block's head to anyone.
  // It also keeps the lazy scan linear, which matters because this catalog runs
  // over unmetered pack bodies — an unbounded `[\s\S]*?` after an `^---`
  // multiline anchor is quadratic in the number of fences a hostile file can
  // spell. The row was previously described as overriding config, which
  // over-claimed what it defends and made the bound look like a hole in it.
  { id: "frontmatter-config-override", pattern: /^---[ \t]*\n[\s\S]{0,2000}?(?:protected|scope|model)\s*:/m, severity: "block", description: "embedded frontmatter head impersonating engine config (protected/scope/model)" },
  { id: "cross-agent-override", pattern: /(?:override|replace|ignore)\s+(?:agent|rule|skill)\s+/i, severity: "block", description: "override/replace/ignore of another agent, rule, or skill" },
  { id: "managed-block-forgery", pattern: /STAMITY:(?:BEGIN|END)/, severity: "block", description: "forged managed-block marker" },
  // Colon written as \x3a so no literal tool-invocation token appears in source.
  { id: "tool-invocation-markup", pattern: /<(?:tool_use|function_call|antml\x3ainvoke)\b/i, severity: "block", description: "embedded tool-invocation markup" },
];

/**
 * MCP tool-poisoning set: instructions planted in the metadata a server
 * publishes about itself — tool descriptions, launcher arguments — which the
 * model reads as context while the operator sees only a server name in the UI.
 *
 * Distinct from {@link CONTENT_DENY_PATTERNS} in shape, not just in wording.
 * The generic set catches content that argues with the system prompt ("ignore
 * all previous instructions"); a poisoned tool description never argues. It
 * reads as documentation — a precondition to honour, a field to fill, a
 * failure mode to avoid — so it passes the generic set untouched. These
 * patterns match that documentary register instead: concealment directives,
 * "before using this tool" preambles, named credential paths, coercion by
 * threatened failure, and one server's metadata giving orders about another's
 * tools.
 *
 * Advisory by construction. Every row here describes a *shape* that honest
 * prose can also take, so the consuming scan reports and still emits;
 * `failure-coercion` in particular carries `warn` because "the tool will fail
 * if the token is unset" is ordinary documentation. Blocking on this set would
 * teach operators to switch it off.
 */
export const MCP_POISONING_PATTERNS: readonly DenyPattern[] = [
  // Pseudo-tags that many clients render as invisible or inert markup while the
  // model reads the enclosed text as emphasis. No honest description needs one.
  { id: "hidden-instruction-tag", pattern: /<(?:IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET)[\s>]/i, severity: "block", description: "hidden-instruction tag concealing directives from the operator" },
  // The tell of a poisoned description: the user is named as the party to keep
  // in the dark. Requires the concealment verb AND the user as its object.
  { id: "conceal-from-user", pattern: /(?:do\s+not|don['’]t|never)\s+(?:mention|tell|inform|notify|show|display|reveal|report)\s+(?:this|it|the)?\s*(?:to\s+)?(?:the\s+)?user/i, severity: "block", description: "directive to conceal tool behaviour from the user" },
  // A precondition attached to the tool that reads or transmits something —
  // the standard framing for making data access look like setup.
  { id: "tool-preamble-data-access", pattern: /before\s+(?:using|calling|invoking|executing|running)\s+(?:this\s+)?tool[^.]{0,80}?(?:read|access|fetch|load|send|transmit|include)/i, severity: "block", description: "pre-invocation preamble instructing a read or transmit" },
  // Credential and identity paths named as an argument source. The lazy gap
  // excludes `.` so it can never run past the leading dot of the path token.
  { id: "sensitive-path-access", pattern: /(?:read|access|cat|open|load|send|transmit|include)\s+[^.]{0,60}?(?:~\/\.ssh|\/\.ssh\/|id_rsa|\.env\b|\.aws\/credentials|\/etc\/passwd|\/etc\/shadow|\.kube\/config|\.netrc)/i, severity: "block", description: "instruction to read or transmit a credential path" },
  // Cross-server hijack: metadata for one server issuing rules about another's
  // tools, which is never that server's business to describe.
  { id: "cross-tool-hijack", pattern: /when\s+(?:this\s+)?tool\s+is\s+(?:available|loaded|present)[^.]{0,80}?(?:other|another|the\s+\w+)\s+tool\s+(?:must|should|will|has\s+to)/i, severity: "block", description: "metadata binding the behaviour of another server's tools" },
  // Coercion by threatened breakage. Warn-severity: the same sentence shape
  // states a genuine requirement in honest documentation.
  { id: "failure-coercion", pattern: /(?:application|system|agent|tool|call)\s+will\s+(?:crash|fail|error|break|malfunction)\s+(?:if|unless)/i, severity: "warn", description: "coercion framed as a threatened failure" },
  { id: "unnoticed-action", pattern: /(?:without|while)\s+(?:the\s+user|them|anyone)\s+(?:noticing|knowing|seeing|being\s+aware)/i, severity: "block", description: "instruction to act without the user noticing" },
  // Withheld functionality as leverage for a side effect.
  { id: "tool-gated-side-effect", pattern: /tool\s+(?:will\s+not|won['’]t|can\s?not)\s+work\s+(?:unless|until|without)[^.]{0,80}?(?:read|access|send|transmit|include)/i, severity: "block", description: "tool function withheld until a read or transmit is performed" },
];

/**
 * Filler phrases with no measurable content. Substring-matched
 * case-insensitively by {@link scanAntiSlop}; every entry is lowercase.
 */
export const ANTI_SLOP_WORDLIST: readonly string[] = [
  "best possible",
  "best-in-class",
  "world-class",
  "comprehensive and thorough",
  "exhaustive",
  "robust and resilient",
  "high-quality",
  "ensure",
  "properly",
  "correctly",
  "as needed",
  "scalable",
];

const SNIPPET_MAX = 160;
/**
 * Reportable stand-in for a block-severity match. Length only: enough to locate
 * and size the span, not enough to reconstruct it.
 */
function maskedSnippet(length: number): string {
  return `[redacted ${length} chars]`;
}
const REDACTION_MARKER = "[REDACTED]";
const MAX_SANITIZE_PASSES = 20;
/**
 * Growth ceiling for the redaction loop: a multiple of the input length, with a
 * 64 KB floor so small inputs stay redactable. A single pass can legitimately
 * inflate content by up to `REDACTION_MARKER.length` (a set whose shortest match
 * is one character), and the shipped sets reach their fixed point on the next
 * pass because no pattern matches the marker. A set that keeps growing is
 * self-matching — its own marker feeds the following pass — and has no fixed
 * point, so the sanitizer fails closed here instead of running the string up to
 * the V8 length limit, which aborts the process rather than throwing.
 */
const MAX_SANITIZE_GROWTH = 16;
const MIN_SANITIZE_BUDGET = 64 * 1024;
/** patternId reported in {@link SanitizationResult.removed} for stripped invisible characters. */
const INVISIBLE_CHARS_ID = "invisible-chars";

/** Fresh global clone: match iteration never mutates a stored pattern's lastIndex. */
function asGlobal(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

/**
 * Every match of `pattern` in `text`, over a fresh global clone.
 *
 * Zero-length matches (`x*`, `\b`, lookarounds) are yielded once and then
 * stepped past by one code unit — without the step the exec loop never advances.
 * No shipped pattern produces one (all require literal text), but a
 * caller-supplied set can, so the rule lives here once and every consumer
 * inherits it: the scanner reports such a match, the sanitizer has no span to
 * redact and skips it.
 */
function* eachMatch(pattern: RegExp, text: string): Generator<RegExpExecArray> {
  const re = asGlobal(pattern);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    yield match;
    if (match[0].length === 0) re.lastIndex += 1;
  }
}

/**
 * The canonical {@link DenyHit} order — index, then pattern id — and the order
 * {@link scanForDeniedPatterns} promises its callers. Exported so a consumer
 * that merges two scans of the same text re-sorts the union with this
 * comparator instead of restating it.
 */
export function byIndexThenId(a: DenyHit, b: DenyHit): number {
  if (a.index !== b.index) return a.index - b.index;
  if (a.patternId < b.patternId) return -1;
  return a.patternId > b.patternId ? 1 : 0;
}

/**
 * Scan `content` for denied patterns. Pure and deterministic: every match of
 * every pattern is reported, ordered by index then patternId. Defaults to the
 * write-path block set ({@link CONTENT_DENY_PATTERNS}).
 *
 * The scanner does not normalize its input — indexes always refer to the
 * given string. For untrusted input, compose sanitize-then-scan; at raw-scan
 * level the `invisible-chars` warn pattern flags smuggling material.
 */
export function scanForDeniedPatterns(
  content: string,
  patterns: readonly DenyPattern[] = CONTENT_DENY_PATTERNS,
): DenyHit[] {
  const hits: DenyHit[] = [];
  for (const { id, pattern, severity } of patterns) {
    for (const match of eachMatch(pattern, content)) {
      const matched = match[0];
      hits.push({
        patternId: id,
        index: match.index,
        snippet:
          severity === "block" ? maskedSnippet(matched.length) : matched.slice(0, SNIPPET_MAX),
        matchLength: matched.length,
        severity,
      });
    }
  }
  hits.sort(byIndexThenId);
  return hits;
}

/** Dedupe key for a hit: the same row at the same offset, from either copy. */
function hitKey(hit: DenyHit): string {
  return `${hit.patternId}\u0000${hit.index}`;
}

/**
 * Scan `content` and its {@link normalizeForDenyScan} copy as one surface — the
 * union every gate reading untrusted text owes its callers, and the function to
 * call instead of {@link scanForDeniedPatterns} at such a gate.
 *
 * Union, never replacement, in both directions. The normalized copy ADDS the
 * refusals a lookalike or a mask hid; the raw copy KEEPS the ones NFKC would
 * destroy by composing a trailing combining mark into the letter before it. A
 * gate that scanned only one of them hands an attacker a one-code-point evasion
 * of every deny keyword in the corpus — folded-only loses
 * `ignore all previous instructions<U+0301>`, raw-only loses the same phrase
 * spelled with a Cyrillic `о`.
 *
 * Hits are deduped by (patternId, index), so a row that already fired at an
 * offset in the raw pass is not counted a second time from the normalized pass,
 * and the result is ordered by {@link byIndexThenId} like every other scan.
 * Pure-ASCII content normalizes to itself and is scanned exactly once, which is
 * the fast path for the overwhelming majority of real content.
 *
 * Indexes on a hit that only the normalized copy produced refer to THAT copy:
 * NFKC/NFKD change both offsets and lengths. A consumer reporting a location
 * therefore reports it as an attribution aid, not as a slice into the file — and
 * never echoes the span, which is why {@link DenyHit.snippet} masks block rows.
 */
export function scanNormalized(
  content: string,
  patterns: readonly DenyPattern[] = CONTENT_DENY_PATTERNS,
): DenyHit[] {
  const rawHits = scanForDeniedPatterns(content, patterns);
  const normalized = normalizeForDenyScan(content);
  if (normalized === content) return rawHits;

  const seen = new Set(rawHits.map(hitKey));
  const added = scanForDeniedPatterns(normalized, patterns).filter((hit) => !seen.has(hitKey(hit)));
  if (added.length === 0) return rawHits;
  return [...rawHits, ...added].toSorted(byIndexThenId);
}

interface Redaction {
  text: string;
  count: number;
  /** Set when the rewrite passed its budget; `text` is then partial and the caller fails closed. */
  overflowed: boolean;
}

/**
 * Rewrite `input` with every non-empty match of `pattern` replaced by the
 * redaction marker, abandoning the rewrite once the result passes `budget`.
 *
 * Zero-length matches are skipped rather than replaced: a marker inserted at
 * every position multiplies length by `REDACTION_MARKER.length + 1` per pass,
 * which is why this is an exec loop and not `String.prototype.replace`.
 */
function redactMatches(input: string, pattern: RegExp, budget: number): Redaction {
  let out = "";
  let cursor = 0;
  let count = 0;
  for (const match of eachMatch(pattern, input)) {
    if (match[0].length === 0) continue;
    out += input.slice(cursor, match.index) + REDACTION_MARKER;
    cursor = match.index + match[0].length;
    count += 1;
    if (out.length > budget) return { text: "", count, overflowed: true };
  }
  if (count === 0) return { text: input, count: 0, overflowed: false };
  return { text: out + input.slice(cursor), count, overflowed: false };
}

/** True when `pattern` has a non-empty match in `text` — the only kind redaction can neutralize. */
function hasRedactableMatch(pattern: RegExp, text: string): boolean {
  for (const match of eachMatch(pattern, text)) {
    if (match[0].length > 0) return true;
  }
  return false;
}

/**
 * Strip invisible smuggling characters, then neutralize every redactable
 * block-severity span with a redaction marker, iterating to a fixed point so
 * replacement joins cannot resurrect a match. Defaults to
 * {@link INJECTION_PATTERNS}.
 *
 * Severity decides who redacts. A `block` hit refuses the content, so its span
 * IS the payload and removing it is the neutralization. A `warn` hit is
 * advisory, and the shipped warn rows match a WINDOW around ordinary text
 * rather than a payload — `combining-mark-instruction-mask` and
 * `homoglyph-instruction-mask` both span up to 20 characters of carrier plus a
 * keyword. Redacting one deletes prose, not an attack: an NFD-accented sentence
 * ("the instructions in the café guide") would come back with the span between
 * its accent and the keyword gone, and this output is what the prompt guard
 * hands onward and what the learnings gate stores and re-reads. So warn rows
 * are reported by {@link scanForDeniedPatterns} and left in place here.
 *
 * Post-conditions, held for any pattern set: idempotent (a second run is a
 * no-op), and a re-scan of the same set finds no non-empty block-severity
 * match. Zero-length matches are outside the redaction contract — they mark no
 * span to remove, so a pattern that can only match the empty string is inert
 * here (the scanner still reports it) rather than a wipe trigger.
 *
 * A block set with no fixed point fails closed — content dropped, every
 * unresolved id reported in `removed`. Two ways in: still matching after
 * {@link MAX_SANITIZE_PASSES}, or growing past the growth ceiling because the
 * set matches its own redaction marker.
 */
export function sanitizeContent(
  content: string,
  patterns: readonly DenyPattern[] = INJECTION_PATTERNS,
): SanitizationResult {
  const counts = new Map<string, number>();

  // Strip invisibles BEFORE the pattern scan so a keyword split by an
  // invisible codepoint is normalized and cannot slip past detection.
  let sanitized = content.replace(INVISIBLE_SMUGGLING_CHARS, "");
  if (sanitized.length !== content.length) {
    counts.set(INVISIBLE_CHARS_ID, content.length - sanitized.length);
  }

  const budget = Math.max(sanitized.length * MAX_SANITIZE_GROWTH, MIN_SANITIZE_BUDGET);
  let overflowedId: string | undefined;
  // The redaction set, and the set the fail-closed check below judges: an
  // advisory row left in place still matches, and treating that as unresolved
  // would wipe every accented document instead of warning about one.
  const redacting = patterns.filter(({ severity }) => severity === "block");

  for (let pass = 0; pass < MAX_SANITIZE_PASSES && overflowedId === undefined; pass += 1) {
    let changed = false;
    for (const { id, pattern } of redacting) {
      const redaction = redactMatches(sanitized, pattern, budget);
      if (redaction.count === 0) continue;
      counts.set(id, (counts.get(id) ?? 0) + redaction.count);
      changed = true;
      if (redaction.overflowed) {
        overflowedId = id;
        break;
      }
      sanitized = redaction.text;
    }
    if (!changed) break; // full pass with zero matches: fixed point reached
  }

  // Unreachable with the shipped sets — each pass strictly consumes attack
  // material and no pattern matches the marker — but a caller-supplied set
  // gets the same post-conditions: anything the loop could not resolve is
  // dropped rather than returned half-neutralized.
  const unresolved = redacting.filter(
    ({ id, pattern }) => id === overflowedId || hasRedactableMatch(pattern, sanitized),
  );
  if (unresolved.length > 0) {
    for (const { id } of unresolved) counts.set(id, (counts.get(id) ?? 0) + 1);
    sanitized = "";
  }

  return {
    sanitized,
    removed: [...counts.entries()].map(([patternId, count]) => ({ patternId, count })),
    modified: sanitized !== content,
  };
}

/**
 * Report anti-slop wordlist occurrences (case-insensitive substring match)
 * as warn-severity hits with patternId `anti-slop-<phrase-slug>`. The
 * scanner is deliberately context-blind — hits inside code fences are still
 * reported; the caller decides what context excuses.
 */
export function scanAntiSlop(content: string): DenyHit[] {
  const lower = content.toLowerCase();
  const hits: DenyHit[] = [];
  for (const phrase of ANTI_SLOP_WORDLIST) {
    const patternId = `anti-slop-${phrase.replace(/[^a-z0-9]+/g, "-")}`;
    let from = 0;
    for (;;) {
      const index = lower.indexOf(phrase, from);
      if (index === -1) break;
      hits.push({
        patternId,
        index,
        snippet: content.slice(index, index + phrase.length),
        matchLength: phrase.length,
        severity: "warn",
      });
      from = index + 1;
    }
  }
  hits.sort(byIndexThenId);
  return hits;
}
