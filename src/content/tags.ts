/**
 * Tag kernel: facet classification and language filtering.
 *
 * Tags are plain strings in artifact frontmatter, and their facet is carried
 * by a prefix rather than by a registry. That keeps the kernel free of the tag
 * vocabulary itself — which values exist is content-corpus subject matter and
 * ships with the corpus; this module only classifies and filters.
 *
 *   `ctx:*`   context   — the project or team shape an artifact fits
 *   `floor:*` floor     — non-negotiable inclusion markers
 *   `lang:*`  language  — the project language an artifact addresses
 *   (bare)    capability — what the artifact does; the default facet
 *
 * Prefixes match case-sensitively (they are literal authoring tokens). The
 * VALUE behind a prefix is normalised — trimmed and lower-cased — so
 * `lang:Python` and `lang:python` are one language. A prefix carrying an empty
 * value (`lang:`) still classifies by facet but yields no value: `languageOf`
 * returns null and language filtering treats the item as untagged. Failing
 * open that way keeps a typo from silently hiding content.
 *
 * Zero-import kernel module.
 */

/** The facet a tag belongs to. Closed set; `capability` is the default. */
export type TagFacet = "capability" | "context" | "floor" | "language";

const CONTEXT_PREFIX = "ctx:";
const FLOOR_PREFIX = "floor:";
const LANGUAGE_PREFIX = "lang:";

/** True for `ctx:*` tags — technical-compatibility statements, not classifications. */
export function isContextTag(tag: string): boolean {
  return tag.startsWith(CONTEXT_PREFIX);
}

/** True for `floor:*` tags — inclusion markers that content reduction must not drop. */
export function isFloorTag(tag: string): boolean {
  return tag.startsWith(FLOOR_PREFIX);
}

/**
 * True for `lang:*` tags. Prefix-shaped only: `lang:` passes here but resolves
 * to no language — use {@link languageOf} when the value matters.
 */
export function isLanguageTag(tag: string): boolean {
  return tag.startsWith(LANGUAGE_PREFIX);
}

/** The tag's facet. Anything without a known prefix is a capability tag. */
export function facetOf(tag: string): TagFacet {
  if (isContextTag(tag)) return "context";
  if (isFloorTag(tag)) return "floor";
  if (isLanguageTag(tag)) return "language";
  return "capability";
}

/**
 * The normalised language behind a `lang:*` tag (`lang:Python` → `"python"`),
 * or null for a non-language tag and for an empty value (`lang:`, `lang:   `).
 */
export function languageOf(tag: string): string | null {
  if (!isLanguageTag(tag)) return null;
  const value = tag.slice(LANGUAGE_PREFIX.length).trim().toLowerCase();
  return value.length > 0 ? value : null;
}

/**
 * The artifact's primary classification: its first capability tag, else its
 * first tag of any facet, else null. Callers group by this, so tag order in
 * frontmatter is load-bearing rather than cosmetic.
 */
export function primaryTag(tags: readonly string[]): string | null {
  const capability = tags.find((tag) => facetOf(tag) === "capability");
  return capability ?? tags[0] ?? null;
}

/** Anything carrying classification tags — the minimum a filter needs. */
export interface Tagged {
  tags: readonly string[];
}

/** The tags split by facet, input order preserved; every facet key is present. */
export function tagsByFacet(tags: readonly string[]): Record<TagFacet, string[]> {
  const grouped: Record<TagFacet, string[]> = {
    capability: [],
    context: [],
    floor: [],
    language: [],
  };
  for (const tag of tags) grouped[facetOf(tag)].push(tag);
  return grouped;
}

function normaliseLanguages(languages: readonly string[]): Set<string> {
  const wanted = new Set<string>();
  for (const language of languages) {
    const value = language.trim().toLowerCase();
    if (value.length > 0) wanted.add(value);
  }
  return wanted;
}

/**
 * Keep the items that apply to a project speaking `languages`:
 *
 * 1. An item with no resolvable `lang:*` tag is language-agnostic and passes.
 * 2. An item with language tags passes when any of them matches.
 *
 * Fails open — an empty (or entirely blank) `languages` list means detection
 * produced no signal, and an unrecognised repo language must not hide content,
 * so every item passes instead of every language-tagged item being dropped.
 *
 * Matching is case-insensitive on both sides. Input order is preserved, the
 * input is never mutated, and the result is always a fresh array.
 */
export function filterByLanguages<T extends Tagged>(
  items: readonly T[],
  languages: readonly string[],
): T[] {
  const wanted = normaliseLanguages(languages);
  if (wanted.size === 0) return [...items];

  return items.filter((item) => {
    let hasLanguage = false;
    for (const tag of item.tags) {
      const language = languageOf(tag);
      if (language === null) continue;
      if (wanted.has(language)) return true;
      hasLanguage = true;
    }
    return !hasLanguage;
  });
}
