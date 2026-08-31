/**
 * Managed-block markers: single source of truth. Zero-import leaf.
 *
 * Markers must adopt the host file's comment syntax — HTML-style markers
 * inside a YAML or JS file are a parse error in the host tool — so three
 * variants exist and read-side helpers accept any of them.
 *
 * The BEGIN marker optionally carries a version stamp (`v<version>`) written
 * at emission time. The merge layer's staleness predicate rewrites a managed
 * block only when the stamped version differs from the current engine
 * version; a bare (unstamped) BEGIN marker always reads as stale.
 */

/** A start/end marker pair delimiting a managed block in one host comment syntax. */
export interface ManagedBlockMarkers {
  readonly start: string;
  readonly end: string;
}

const HTML_MARKERS: ManagedBlockMarkers = {
  start: "<!-- STAMITY:BEGIN -->",
  end: "<!-- STAMITY:END -->",
};

const HASH_MARKERS: ManagedBlockMarkers = {
  start: "# STAMITY:BEGIN",
  end: "# STAMITY:END",
};

const SLASH_MARKERS: ManagedBlockMarkers = {
  start: "// STAMITY:BEGIN",
  end: "// STAMITY:END",
};

/**
 * Ordered list of marker variants. Read-side functions scan in this order;
 * HTML/Markdown is listed first as the default and most common host. Adding
 * a new variant means appending an entry here — detection needs no other
 * code change.
 */
export const MANAGED_BLOCK_VARIANTS: readonly ManagedBlockMarkers[] = [
  HTML_MARKERS,
  HASH_MARKERS,
  SLASH_MARKERS,
];

const HASH_EXTENSIONS = [".yml", ".yaml", ".toml"] as const;
const SLASH_EXTENSIONS = [".js", ".mjs", ".ts", ".jsonc"] as const;

/**
 * Extensions whose format has no comment syntax at all, so no variant above
 * can be written into one. `.json` is the whole set: a document opening with
 * `<!-- STAMITY:BEGIN -->` is not JSON, and the client reading it fails to
 * parse the file rather than merely ignoring the block.
 *
 * `.jsonc` is deliberately absent — it takes `//` and is listed above.
 */
const COMMENTLESS_EXTENSIONS = [".json"] as const;

/**
 * Whether a managed block may be written into `filePath` at all — false for
 * exactly the {@link COMMENTLESS_EXTENSIONS} formats, true for every other
 * path (including one with no extension, which is text as far as a `#` or
 * HTML marker is concerned).
 *
 * This is the WRITE-side gate, and it exists because {@link getMarkersForPath}
 * is total on purpose: read-side callers scan whatever file they are handed and
 * need an answer for every path, so an unmapped extension gets the HTML variant
 * rather than a refusal. That totality is what left "plain JSON is never
 * wrapped" an assertion nothing checked — the one live wrap site that takes an
 * operator-named path (the emission planner's `supplement` import decision,
 * `../emit/planner.ts`) handed `.json` straight through and the default variant
 * obliged. A caller that is about to WRAP asks this first and refuses by name;
 * a caller that is about to READ does not ask at all.
 */
export function canHostManagedBlock(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return !COMMENTLESS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Choose the marker variant for an output path by extension:
 * - `.yml` / `.yaml` / `.toml` — `#` line-comment markers
 * - `.js` / `.mjs` / `.ts` / `.jsonc` — `//` line-comment markers
 * - everything else (incl. no path, empty path, no extension) — HTML markers
 *
 * No JSON variant exists because JSON has no comments — `.jsonc` supports `//`
 * and takes the slash variant. The lookup itself does not refuse a `.json`
 * path; it answers HTML like any other unmapped extension, which is what keeps
 * it usable on the read side. Refusing is {@link canHostManagedBlock}'s job,
 * asked at the wrap site.
 */
export function getMarkersForPath(filePath?: string): ManagedBlockMarkers {
  if (filePath) {
    const lower = filePath.toLowerCase();
    if (HASH_EXTENSIONS.some((ext) => lower.endsWith(ext))) return HASH_MARKERS;
    if (SLASH_EXTENSIONS.some((ext) => lower.endsWith(ext))) return SLASH_MARKERS;
  }
  return HTML_MARKERS;
}

/**
 * Stamp a version into a bare BEGIN marker: `<!-- STAMITY:BEGIN v1.2.3 -->`,
 * `# STAMITY:BEGIN v1.2.3`, `// STAMITY:BEGIN v1.2.3`. Callers pass the bare
 * variant start marker (from {@link getMarkersForPath}); re-stamping an
 * already-stamped marker is not supported.
 */
export function stampMarkerVersion(startMarker: string, version: string): string {
  if (startMarker.endsWith("-->")) {
    const head = startMarker.slice(0, -"-->".length).trimEnd();
    return `${head} v${version} -->`;
  }
  return `${startMarker.trimEnd()} v${version}`;
}

/**
 * Version-stamp grammar: whitespace after `STAMITY:BEGIN`, then one
 * non-whitespace token. Unanchored on purpose — a marker mid-line (indented,
 * or embedded after other text) still parses, matching the read-side
 * tolerance of the block helpers.
 */
const STAMP_TOKEN_PATTERN = /STAMITY:BEGIN[ \t]+(\S+)/;

/**
 * Extract the stamped version from a line containing a BEGIN marker.
 *
 * Returns `null` for bare/unstamped markers (and for lines without a BEGIN
 * marker). A single leading `v` is stripped from the token — the inverse of
 * {@link stampMarkerVersion}, so stamp→parse round-trips for any version
 * string. The token is NOT validated as semver: `dev` or `1.2` come back
 * raw, and the staleness compare downstream decides what to do with them.
 */
export function parseMarkerVersion(line: string): string | null {
  const token = STAMP_TOKEN_PATTERN.exec(line)?.[1];
  if (token === undefined) return null;
  // Tolerate a missing space before the HTML comment close: `v1.2.3-->`.
  const bare = token.endsWith("-->") ? token.slice(0, -"-->".length) : token;
  if (bare === "") return null;
  return bare.startsWith("v") && bare.length > 1 ? bare.slice(1) : bare;
}

/**
 * The single visible state directory in user repos: manifest, ownership
 * ledger, learnings, handoffs, filtered MCP config, user hooks, overrides.
 */
export const STATE_DIR = ".stamity";

/**
 * Filename prefix on generated content artifacts the operator does not type:
 * agents, rules, hook scripts, carried learnings (`stamity-implementer.md`).
 *
 * Also the engine's ownership marker wherever a name — rather than a recorded
 * hash — is what proves the engine wrote a file. Read that half through
 * {@link ENGINE_CONTENT_PREFIXES} / {@link carriesEngineContentPrefix}, never
 * through this constant alone: since the invocable surfaces moved to
 * {@link INVOCABLE_CONTENT_PREFIX}, a gate comparing against this one value
 * answers `false` for every command and skill the engine itself just minted.
 */
export const CONTENT_PREFIX = "stamity-";

/**
 * Filename prefix on the surfaces an operator INVOKES by name — commands
 * (`/st-work`) and skills (`.agents/skills/st-verify/`).
 *
 * Split out of {@link CONTENT_PREFIX} rather than replacing it, because the two
 * halves answer to different audiences. A command id is typed after a slash a
 * dozen times a day and pays for every character; an agent id, a rule filename
 * and the ownership marker are read by machines and by the merge layer, where a
 * rename is an unreclaimable-orphan bug in every already-installed repo. So the
 * short prefix lands on the typed half only, and the marker half holds still.
 *
 * Origin does not enter into it. An installed pack's commands and skills are
 * typed after a slash exactly like the corpus's, so they take this prefix too:
 * the surface an operator sees is one namespace, not one per supplier. The
 * earlier cut held packs back at {@link CONTENT_PREFIX} only because their
 * filenames are hashed into a signed `pack.json`; the manifests were
 * regenerated with the rename, so the carve-out has nothing left to protect.
 * {@link contentPrefixFor} is the one place the class rule is written down.
 */
export const INVOCABLE_CONTENT_PREFIX = "st-";

/**
 * Every prefix the engine mints filenames under, newest first.
 *
 * The ownership gate in `../merge/reclaim.ts` and the reserved-id gate in
 * `../content/userContent.ts` both answer "did the engine name this?" and must
 * accept the whole set: a repo upgraded across the split holds emissions under
 * both spellings at once, and the sweep that retires the old one has to
 * recognise it. No prefix is ever removed from this list — an entry dropped
 * here is a file the engine can no longer claim, and the sweep leaves it behind
 * forever.
 *
 * The two entries are mutually non-prefixing (`stamity-` does not start with
 * `st-`, and vice versa), so membership tests need no ordering care.
 */
export const ENGINE_CONTENT_PREFIXES: readonly string[] = [
  CONTENT_PREFIX,
  INVOCABLE_CONTENT_PREFIX,
];

/**
 * The subject {@link contentPrefixFor} rules on: a content class, and nothing
 * else. Where the artifact came from is deliberately absent — a corpus command
 * and a pack command are typed the same way, so they are prefixed the same way.
 *
 * Structural on purpose — this module is a zero-import leaf, and a `CatalogItem`
 * or a `CanonicalFile` satisfies it as-is.
 */
export interface ContentPrefixSubject {
  /** Content class (`"command"`, `"skill"`, `"agent"`, `"rule"`). */
  readonly type: string;
}

/**
 * The filename prefix one artifact's emission carries.
 *
 * One rule, one home: every emitter that restores the prefix to a bare
 * frontmatter id calls this, so the typed command, the file on disk, the
 * charter's touchpoint spelling and the ownership gate cannot drift apart by
 * each re-deciding the question locally.
 *
 * Class is the whole of it. The invocable classes take
 * {@link INVOCABLE_CONTENT_PREFIX}, everything else takes
 * {@link CONTENT_PREFIX}, and an installed pack's artifacts answer to the same
 * two lines as the corpus's.
 */
export function contentPrefixFor(artifact: ContentPrefixSubject): string {
  return artifact.type === "command" || artifact.type === "skill"
    ? INVOCABLE_CONTENT_PREFIX
    : CONTENT_PREFIX;
}

/** True when `name` opens with any prefix the engine mints filenames under. */
export function carriesEngineContentPrefix(name: string): boolean {
  return ENGINE_CONTENT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * `name` with its engine filename prefix removed; returned unchanged when it
 * carries none. The prefix is a namespacing convention on the file, never part
 * of the artifact's identity, so this is what turns a filename into an id.
 */
export function stripEngineContentPrefix(name: string): string {
  const prefix = ENGINE_CONTENT_PREFIXES.find((candidate) => name.startsWith(candidate));
  return prefix === undefined ? name : name.slice(prefix.length);
}
