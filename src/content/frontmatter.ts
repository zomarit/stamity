import { stringify as stringifyYaml } from "yaml";
import { isPlainObject, parseYamlStrict, requireStringArray } from "../config/parse.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Frontmatter is engine-core: every content artifact is a `---`-fenced YAML
 * head over a markdown body, and this module owns both directions. Reading is
 * shape-agnostic on purpose — the parser hands back the raw map and the body,
 * and each consumer validates the fields it actually reads through the
 * `require*` helpers in `../config/parse.ts`. That keeps one parser instead of
 * the predecessor's several (an adapter-owned YAML parser plus per-command
 * regex line-scanners that disagreed on empty and malformed values).
 *
 * Errors are `VALIDATION_ERROR` (exit 64), not the `CONFIG_ERROR` (65) the
 * config layer raises: a broken frontmatter block is a defect in repo content,
 * and the operator's next step is to fix that artifact rather than a config
 * document.
 */

/** A markdown document split into its frontmatter map and its body. */
export interface ParsedFrontmatter {
  /** Parsed YAML head; empty when the document has no frontmatter block. */
  frontmatter: Record<string, unknown>;
  /** Everything after the closing fence; the whole document when there is no block. */
  body: string;
  /** True when a fenced block was present, including an empty one. */
  hadFrontmatter: boolean;
}

/**
 * Fence grammar, anchored to the start of the document:
 *
 * - Both fence lines tolerate trailing spaces/tabs (`---   `), which editors and
 *   markdown formatters leave behind and which must not silently demote a file
 *   to "no frontmatter" — that failure mode loses the id, type and tags of an
 *   artifact with no signal at all.
 * - The block group carries its own trailing newline inside an optional group,
 *   so the closing fence is always at the start of a line (a mid-line `---`
 *   never terminates the block) AND an empty block (`---` directly followed by
 *   `---`) still matches.
 * - `\r?\n` throughout accepts CRLF documents; the body is captured verbatim,
 *   with whatever line endings it had.
 * - The body group runs to the end of the document, so a `---` further down the
 *   markdown (a horizontal rule, a fenced example) is body text and is never
 *   re-split.
 */
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/;

/** UTF-8 byte-order mark, stripped before the anchored fence match. */
const BOM = 0xfe_ff;

/** Frontmatter key restricting which target tools an artifact ships to. */
const TOOLS_FIELD = "tools";

/**
 * Keys emitted first by {@link composeFrontmatter}, in this order, when present.
 * These four are the identity head every content class declares; leading with
 * them keeps generated and rewritten artifacts visually uniform no matter how
 * the caller assembled the map. Every other key follows in the map's own order,
 * so a parse→compose round-trip leaves hand-authored extras where the author
 * put them.
 */
const LEAD_KEYS = ["id", "type", "description", "tags"] as const;

/**
 * Split a markdown document into frontmatter and body.
 *
 * A document with no fenced block is not an error: `hadFrontmatter` is false and
 * the whole document comes back as the body, which is what lets callers treat
 * "not an artifact" as a skip rather than a failure. A leading BOM is stripped
 * first — the fence match is anchored at byte 0, so a BOM written by a Windows
 * editor would otherwise hide the block — and the stripped form is what flows
 * on, so the mark cannot leak into a body that gets copied into output.
 *
 * Throws `VALIDATION_ERROR` naming `source` when the block is present but is not
 * a valid YAML map (syntax error, or a root that is a list or scalar).
 */
export function parseFrontmatter(raw: string, source: string): ParsedFrontmatter {
  const text = raw.charCodeAt(0) === BOM ? raw.slice(1) : raw;
  const match = FRONTMATTER_PATTERN.exec(text);
  if (match === null) return { frontmatter: {}, body: text, hadFrontmatter: false };

  const [, block = "", body = ""] = match;
  return { frontmatter: parseFrontmatterBlock(block, source), body, hadFrontmatter: true };
}

/**
 * Parse the YAML head through the strict config ingress — which settles the
 * root-must-be-a-map question and guards alias expansion — then re-code its
 * failure as a content defect. The config layer's message already names the
 * source and the fix, so it is carried through verbatim rather than re-worded.
 *
 * Exported because a frontmatter head is not always fenced: an overlay's
 * `.customize.yaml` IS the block, with no document around it to split (the
 * overlay layer in `./catalog.ts`). Reading it through this function rather
 * than through a second call to the config parser keeps ONE re-coding of a
 * YAML failure into a content defect — two of them would eventually disagree
 * about what a malformed head costs, which is the divergence the single-gate
 * rule exists to prevent.
 */
export function parseFrontmatterBlock(block: string, source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parseYamlStrict(block, `${source} frontmatter`);
  } catch (cause) {
    throw new EngineError(cause instanceof Error ? cause.message : String(cause), {
      code: "VALIDATION_ERROR",
      cause,
    });
  }
  // parseYamlStrict guarantees a map (an empty document yields `{}`); the guard
  // narrows the `unknown` return without a cast.
  return isPlainObject(parsed) ? parsed : {};
}

/**
 * Render a frontmatter map and a body back into a document.
 *
 * Deterministic for a given map: {@link LEAD_KEYS} first, remaining keys in map
 * order, `undefined` values dropped, no line folding (a long `description` stays
 * on one line, so re-emitting an artifact produces no reflow diff). Fences are
 * written LF-only; the body is passed through byte-for-byte, including its own
 * line endings and any blank line the caller wants after the fence. That exactness
 * is what makes parse→compose→parse an identity on both halves.
 *
 * An empty map composes to a bare `---\n---\n` head rather than a YAML `{}`, so
 * the result reads back as an empty block instead of a map literal.
 */
export function composeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const ordered = orderedEntries(frontmatter);
  if (ordered.length === 0) return `---\n---\n${body}`;
  // A Map input keeps insertion order for every key shape — a plain object would
  // hoist integer-like keys ("2" before "id") and silently reorder the head.
  const yaml = stringifyYaml(new Map(ordered), { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}

/** Own, defined entries with {@link LEAD_KEYS} hoisted to the front in declaration order. */
function orderedEntries(frontmatter: Record<string, unknown>): [string, unknown][] {
  const remaining = new Map(
    Object.entries(frontmatter).filter(([, value]) => value !== undefined),
  );
  const ordered: [string, unknown][] = [];
  for (const key of LEAD_KEYS) {
    if (!remaining.has(key)) continue;
    ordered.push([key, remaining.get(key)]);
    remaining.delete(key);
  }
  ordered.push(...remaining);
  return ordered;
}

/**
 * Read the optional `tools:` restriction from a raw document.
 *
 * `undefined` — the key is absent — means the artifact ships to every tool, and
 * that is the shape canonical content carries; an explicit list restricts it to
 * those tools, and an explicit empty list restricts it to none. Names are
 * validated against the closed {@link TOOLS} set here rather than downstream, so
 * a typo fails at the artifact that declares it instead of quietly emitting the
 * artifact everywhere.
 *
 * `source` labels the messages; it defaults to a generic label for callers that
 * hold only the raw text, and every reader with a path should pass it.
 */
export function extractToolsFrontmatter(raw: string, source = "frontmatter"): Tool[] | undefined {
  const parsed = parseFrontmatter(raw, source);
  const declared = requireStringArray(parsed.frontmatter, TOOLS_FIELD, {
    source,
    optional: true,
  });
  if (declared === undefined) return undefined;

  // Every offending name in one message: an operator fixing a rejected artifact
  // should need one pass, not one round-trip per typo.
  const unknown = declared.filter((name) => !isTool(name));
  if (unknown.length > 0) {
    const noun = unknown.length === 1 ? "tool" : "tools";
    throw new EngineError(
      `${source}: unknown ${noun} ${unknown.map((name) => JSON.stringify(name)).join(", ")} ` +
        `in \`${TOOLS_FIELD}\`. Valid tools: ${TOOLS.join(", ")}.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  // Deduplicated, first occurrence wins: the value is consumed as a membership
  // test, and a repeated name must not change emission counts.
  return [...new Set(declared.filter(isTool))];
}

function isTool(name: string): name is Tool {
  return VALID_TOOLS.has(name);
}

/**
 * Read one frontmatter field. Non-own keys read as absent, so a prototype member
 * (`constructor`, `toString`) can never be mistaken for a declared value —
 * frontmatter comes from files the engine does not author.
 */
export function frontmatterField(parsed: ParsedFrontmatter, field: string): unknown {
  return Object.hasOwn(parsed.frontmatter, field) ? parsed.frontmatter[field] : undefined;
}
