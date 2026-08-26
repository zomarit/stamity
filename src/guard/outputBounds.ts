import { EngineError } from "../types/errors.ts";

/**
 * Output bounding: a deep-bounded copy of a result value, so a summary handed
 * to a human, a JSON envelope, or an agent stays inside the guard's size caps
 * however large the underlying run was.
 *
 * The copy is structural, never in place — the input is treated as immutable
 * and may be frozen. Plain objects and arrays are rebuilt; every other object
 * (Date, Map, class instance) is carried by reference, because rebuilding it
 * from its enumerable keys would silently empty it.
 */

/** Per-call bounds. Every field falls back to the module default. */
export interface CompactOptions {
  /** Array items kept from the head; the remainder collapses to one marker item. */
  maxArrayItems?: number;
  /** Characters kept per string; a truncated string gains a trailing marker. */
  maxStringLength?: number;
  /** Deepest container level retained; the root container is level 1. */
  maxDepth?: number;
}

interface Bounds {
  maxArrayItems: number;
  maxStringLength: number;
  maxDepth: number;
}

const DEFAULT_BOUNDS: Bounds = {
  maxArrayItems: 50,
  maxStringLength: 500,
  maxDepth: 8,
};

/** Prefix of every truncation marker, so a reader can spot a bounded value. */
const TRUNCATION_MARK = "…";

/**
 * First `max` characters of `text`, never splitting a surrogate pair: when the
 * cut would land between a high and a low surrogate the high surrogate is
 * dropped too, so the result is always well-formed UTF-16 and one character
 * shorter than the cap. Grapheme clusters (combining marks, ZWJ emoji) are out
 * of scope — a cut may still land inside one.
 */
export function truncateAt(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const lastKept = text.charCodeAt(max - 1);
  const splitsPair = lastKept >= 0xd800 && lastKept <= 0xdbff;
  return text.slice(0, splitsPair ? max - 1 : max);
}

/**
 * Deep-bounded copy of `value`.
 *
 * Strings are truncated, arrays are head-sliced with a marker item for the
 * remainder, and containers past `maxDepth` are replaced by a marker string.
 * Primitives pass through untouched.
 *
 * Throws {@link EngineError} `VALIDATION_ERROR` on a circular structure: a
 * cycle in a result value is a producer defect, and reporting it beats both a
 * stack overflow (which kills the process) and a silent truncation that would
 * hide the defect. A shared reference that is not an ancestor — the same node
 * reached twice down different branches — is a DAG, not a cycle, and copies
 * once per occurrence.
 */
export function compactOutput<T>(value: T, opts?: CompactOptions): T {
  const bounds: Bounds = {
    maxArrayItems: opts?.maxArrayItems ?? DEFAULT_BOUNDS.maxArrayItems,
    maxStringLength: opts?.maxStringLength ?? DEFAULT_BOUNDS.maxStringLength,
    maxDepth: opts?.maxDepth ?? DEFAULT_BOUNDS.maxDepth,
  };
  return bound(value, 1, bounds, new Set<object>()) as T;
}

/** True for `{}`-shaped objects only: prototype is `Object.prototype` or null. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

/** `ancestors` holds the containers on the current path, so exits pop their entry. */
function bound(value: unknown, depth: number, bounds: Bounds, ancestors: Set<object>): unknown {
  if (typeof value === "string") {
    if (value.length <= bounds.maxStringLength) return value;
    return truncateAt(value, bounds.maxStringLength) + TRUNCATION_MARK;
  }

  if (value === null || typeof value !== "object") return value;
  if (!Array.isArray(value) && !isPlainObject(value)) return value;

  if (ancestors.has(value)) {
    throw new EngineError(
      "cannot bound a circular value: a container references one of its own ancestors",
      { code: "VALIDATION_ERROR" },
    );
  }
  if (depth > bounds.maxDepth) return `${TRUNCATION_MARK} max depth ${bounds.maxDepth}`;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const kept: unknown[] = value
        .slice(0, bounds.maxArrayItems)
        .map((item) => bound(item, depth + 1, bounds, ancestors));
      const omitted = value.length - bounds.maxArrayItems;
      if (omitted > 0) {
        kept.push(`${TRUNCATION_MARK} ${omitted} more ${omitted === 1 ? "item" : "items"}`);
      }
      return kept;
    }

    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = bound(item, depth + 1, bounds, ancestors);
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}
