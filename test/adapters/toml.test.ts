import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  serializeTomlDocument,
  tomlBasicString,
  tomlMultilineBasicString,
  type TomlValue,
} from "../../src/adapters/toml.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * The narrow TOML writer behind the codex adapter's subagent files and its
 * composed `config.toml`.
 *
 * Two things must hold: the bytes are a deterministic function of the input
 * (a drift check compares regenerated output against disk), and a value
 * survives the round trip through a real parse — which is why this file
 * carries a small reader for the emitted subset rather than asserting escapes
 * by eye. Property coverage runs the reader over strings built from the
 * characters that actually break TOML: quotes, backslashes, newlines, control
 * characters, and an astral code point.
 */

// ── A reader for the emitted subset ──────────────────────────────

interface ParsedToml {
  /** Top-level key block. */
  root: Record<string, TomlValue>;
  /** Named tables, keyed by their header with quoting removed. */
  tables: Record<string, Record<string, TomlValue>>;
}

const HORIZONTAL = new Set([" ", "\t"]);
const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

/**
 * Parses comments, `[table]` headers, bare/quoted keys, basic and multi-line
 * basic strings, numbers and booleans — exactly what the writer emits, and
 * nothing more (no arrays, inline tables, or literal strings).
 */
/**
 * A fresh key/value bag with NO prototype.
 *
 * TOML keys are data, and `__proto__` is a legal bare key. Assigning it onto a
 * plain object literal mutates the prototype instead of creating an entry, so
 * the key would silently disappear and the reader would report a round-trip
 * failure the writer did not cause — which is exactly what the key property
 * below (fast-check seeds `fc.string` with poisoning strings) hit.
 */
function bag(): Record<string, TomlValue> {
  return Object.create(null) as Record<string, TomlValue>;
}

function parseToml(text: string): ParsedToml {
  const root: Record<string, TomlValue> = bag();
  const tables: Record<string, Record<string, TomlValue>> = Object.create(null) as Record<
    string,
    Record<string, TomlValue>
  >;
  let current = root;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;
    if (WHITESPACE.has(char)) {
      i += 1;
      continue;
    }
    if (char === "#") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (char === "[") {
      const end = text.indexOf("]", i);
      if (end === -1) throw new Error(`unterminated table header at ${i}`);
      current = bag();
      tables[readHeader(text.slice(i + 1, end))] = current;
      i = end + 1;
      continue;
    }

    const key = readKey(text, i);
    i = key.next;
    while (HORIZONTAL.has(text[i] ?? "")) i += 1;
    if (text[i] !== "=") throw new Error(`expected "=" after key "${key.value}" at ${i}`);
    i += 1;
    while (HORIZONTAL.has(text[i] ?? "")) i += 1;

    const value = readValue(text, i);
    current[key.value] = value.value;
    i = value.next;
  }

  return { root, tables };
}

/** `a."b c"` → `a.b c`: quoting is spelling, not identity. */
function readHeader(header: string): string {
  return header
    .split(".")
    .map((segment) => (segment.startsWith('"') ? readValue(segment, 0).value : segment))
    .join(".");
}

function readKey(text: string, start: number): { value: string; next: number } {
  if (text[start] === '"') {
    const parsed = readValue(text, start);
    return { value: String(parsed.value), next: parsed.next };
  }
  let i = start;
  while (i < text.length && /[A-Za-z0-9_-]/.test(text[i]!)) i += 1;
  if (i === start) throw new Error(`expected a key at ${start}`);
  return { value: text.slice(start, i), next: i };
}

function readValue(text: string, start: number): { value: TomlValue; next: number } {
  if (text.startsWith('"""', start)) return readMultiline(text, start);
  if (text[start] === '"') return readBasic(text, start);
  if (text.startsWith("true", start)) return { value: true, next: start + 4 };
  if (text.startsWith("false", start)) return { value: false, next: start + 5 };

  let i = start;
  while (i < text.length && !WHITESPACE.has(text[i]!) && text[i] !== "#") i += 1;
  const raw = text.slice(start, i);
  const parsed = Number(raw);
  if (raw === "" || Number.isNaN(parsed)) throw new Error(`unreadable value ${JSON.stringify(raw)}`);
  return { value: parsed, next: i };
}

function readBasic(text: string, start: number): { value: string; next: number } {
  let out = "";
  let i = start + 1;
  while (i < text.length) {
    const char = text[i]!;
    if (char === "\\") {
      const escape = readEscape(text, i);
      out += escape.value;
      i = escape.next;
      continue;
    }
    if (char === '"') return { value: out, next: i + 1 };
    if (char === "\n") throw new Error(`raw newline inside a basic string at ${i}`);
    out += char;
    i += 1;
  }
  throw new Error("unterminated basic string");
}

function readMultiline(text: string, start: number): { value: string; next: number } {
  let i = start + 3;
  // TOML trims a newline immediately after the opening delimiter; the writer
  // always emits one, so a value that begins with a newline still round-trips.
  if (text[i] === "\r") i += 1;
  if (text[i] === "\n") i += 1;

  let out = "";
  while (i < text.length) {
    if (text[i] === "\\") {
      const escape = readEscape(text, i);
      out += escape.value;
      i = escape.next;
      continue;
    }
    if (text.startsWith('"""', i)) return { value: out, next: i + 3 };
    out += text[i]!;
    i += 1;
  }
  throw new Error("unterminated multi-line string");
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

function readEscape(text: string, start: number): { value: string; next: number } {
  const code = text[start + 1] ?? "";
  const simple = SIMPLE_ESCAPES[code];
  if (simple !== undefined) return { value: simple, next: start + 2 };
  if (code === "u") {
    const hex = text.slice(start + 2, start + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`malformed \\u escape at ${start}`);
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), next: start + 6 };
  }
  throw new Error(`unknown escape \\${code} at ${start}`);
}

// ── Helpers ──────────────────────────────────────────────────────

const oneValue = (key: string, value: TomlValue): string =>
  serializeTomlDocument({ tables: [{ header: null, entries: [[key, value]] }] });

const roundTrip = (value: TomlValue): TomlValue => parseToml(oneValue("k", value)).root.k!;

const throwsValidation = (run: () => unknown): EngineError => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EngineError);
  const error = caught as EngineError;
  expect(error.code).toBe("VALIDATION_ERROR");
  return error;
};

// ── Document shape ───────────────────────────────────────────────

describe("serializeTomlDocument — document shape", () => {
  it("emits comments, then tables, keys in insertion order, with one trailing newline", () => {
    const toml = serializeTomlDocument({
      comments: ["generated file", "", "do not edit"],
      tables: [
        {
          header: null,
          entries: [
            ["name", "stamity-reviewer"],
            ["enabled", true],
            ["weight", 3],
          ],
        },
        { header: "mcp_servers.github", entries: [["command", "npx"]] },
      ],
    });

    expect(toml).toBe(
      [
        "# generated file",
        "#",
        "# do not edit",
        "",
        'name = "stamity-reviewer"',
        "enabled = true",
        "weight = 3",
        "",
        "[mcp_servers.github]",
        'command = "npx"',
        "",
      ].join("\n"),
    );
    // Key order is emission order, never sorted: the writer preserves what the
    // caller decided the file should read like.
    expect(Object.keys(parseToml(toml).root)).toEqual(["name", "enabled", "weight"]);
  });

  it("is deterministic: two runs over one input are byte-identical", () => {
    const doc = {
      comments: ["header"],
      tables: [
        { header: null, entries: [["a", "1"] as [string, TomlValue]] },
        { header: "t", entries: [["b", 2] as [string, TomlValue]] },
      ],
    };
    expect(serializeTomlDocument(doc)).toBe(serializeTomlDocument(doc));
  });

  it("renders an empty document as the empty string and an empty table as its header alone", () => {
    expect(serializeTomlDocument({ tables: [] })).toBe("");
    expect(serializeTomlDocument({ tables: [{ header: null, entries: [] }] })).toBe("");
    expect(serializeTomlDocument({ tables: [{ header: "mcp_servers", entries: [] }] })).toBe(
      "[mcp_servers]\n",
    );
  });

  it("quotes header segments and keys that are not bare tokens", () => {
    const toml = serializeTomlDocument({
      tables: [{ header: "servers.my server", entries: [["a key", 1]] }],
    });
    expect(toml).toBe(['[servers."my server"]', '"a key" = 1', ""].join("\n"));
    expect(parseToml(toml).tables["servers.my server"]).toEqual({ "a key": 1 });
  });
});

// ── Values and escaping ──────────────────────────────────────────

describe("value rendering", () => {
  it("renders booleans and finite numbers in TOML's own grammar", () => {
    expect(oneValue("k", true)).toContain("k = true");
    expect(oneValue("k", false)).toContain("k = false");
    expect(oneValue("k", 42)).toContain("k = 42");
    expect(oneValue("k", -1.5)).toContain("k = -1.5");
    expect(roundTrip(42)).toBe(42);
    expect(roundTrip(-1.5)).toBe(-1.5);
    expect(roundTrip(true)).toBe(true);
  });

  it("escapes quotes, backslashes and control characters in a single-line string", () => {
    expect(tomlBasicString('say "hi"')).toBe('"say \\"hi\\""');
    expect(tomlBasicString("tab\there")).toBe('"tab\\there"');
    expect(tomlBasicString("bell\u0007")).toBe('"bell\\u0007"');
    expect(tomlBasicString("del\u007f")).toBe('"del\\u007f"');
  });

  it("escapes a Windows path's backslashes so the parsed value is the original path", () => {
    const windowsPath = "C:\\Users\\dev\\repo\\.codex\\config.toml";
    expect(tomlBasicString(windowsPath)).toBe(
      '"C:\\\\Users\\\\dev\\\\repo\\\\.codex\\\\config.toml"',
    );
    expect(roundTrip(windowsPath)).toBe(windowsPath);
  });

  it("switches to a multi-line string when the value carries a newline", () => {
    const body = "# Title\n\nParagraph.\n";
    const toml = oneValue("developer_instructions", body);
    expect(toml).toContain('developer_instructions = """\n# Title');
    // Newlines survive as newlines — the file stays readable, not escaped prose.
    expect(toml).not.toContain("\\n");
    expect(roundTrip(body)).toBe(body);
  });

  it("escapes only the quote runs that would close a multi-line string", () => {
    // A lone quote and a pair are legal inside the delimiters; three would end
    // the string, and a run touching the end would fuse with the delimiter.
    expect(tomlMultilineBasicString('a "b" c\n')).toBe('"""\na "b" c\n"""');
    expect(tomlMultilineBasicString('x """ y\n')).toBe('"""\nx \\"\\"\\" y\n"""');
    expect(tomlMultilineBasicString('ends with "')).toBe('"""\nends with \\""""');
    expect(roundTrip('x """ y\nends "')).toBe('x """ y\nends "');
  });

  it("keeps a leading newline, which TOML's delimiter rule would otherwise eat", () => {
    expect(roundTrip("\nleading")).toBe("\nleading");
    expect(roundTrip("\n\n\ntrailing\n\n")).toBe("\n\n\ntrailing\n\n");
  });

  it("round-trips strings built from the characters that break TOML", () => {
    const unit = fc.constantFrom(
      "a",
      " ",
      '"',
      '"""',
      "\\",
      "\n",
      "\t",
      "\r",
      "\u0000",
      "\u001f",
      "\u007f",
      "€",
      "𝄞",
      "#",
      "=",
      "[",
    );
    fc.assert(
      fc.property(fc.array(unit, { maxLength: 40 }), (parts) => {
        const value = parts.join("");
        expect(roundTrip(value)).toBe(value);
      }),
      { numRuns: 400 },
    );
  });

  it("treats `__proto__` as an ordinary bare key, in key and value position alike", () => {
    // Pinned rather than left to the property below to rediscover: `__proto__`
    // matches TOML's bare-key grammar, so the writer must emit it unquoted and
    // unescaped like any other name. It is called out because a consumer that
    // reads this file into a plain JS object silently loses the entry.
    expect(oneValue("__proto__", "v")).toBe('__proto__ = "v"\n');
    expect(Object.keys(parseToml(oneValue("__proto__", "v")).root)).toEqual(["__proto__"]);
    expect(roundTrip("__proto__")).toBe("__proto__");
  });

  it("round-trips arbitrary text as a key as well as a value", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 24 }), (key) => {
        // An empty key is legal in TOML only as a quoted empty string, which the
        // writer emits and the reader accepts.
        const parsed = parseToml(oneValue(key, "v")).root;
        expect(Object.keys(parsed)).toEqual([key]);
      }),
      { numRuns: 200 },
    );
  });
});

// ── Structural refusals ──────────────────────────────────────────

describe("structural refusals", () => {
  it("refuses a top-level block emitted after a table, which TOML would silently nest", () => {
    const error = throwsValidation(() =>
      serializeTomlDocument({
        tables: [
          { header: "agent", entries: [["a", 1]] },
          { header: null, entries: [["name", "x"]] },
        ],
      }),
    );
    expect(error.message).toContain("agent");
    expect(error.message).toContain("before the first header");
  });

  it("refuses a repeated table header and a repeated key", () => {
    expect(
      throwsValidation(() =>
        serializeTomlDocument({
          tables: [
            { header: "t", entries: [] },
            { header: "t", entries: [["a", 1]] },
          ],
        }),
      ).message,
    ).toContain("defined twice");

    expect(
      throwsValidation(() =>
        serializeTomlDocument({
          tables: [
            {
              header: null,
              entries: [
                ["a", 1],
                ["a", 2],
              ],
            },
          ],
        }),
      ).message,
    ).toContain('key "a" is emitted twice');
  });

  it("refuses a blank header and a non-finite number, naming what to fix", () => {
    expect(
      throwsValidation(() => serializeTomlDocument({ tables: [{ header: "  ", entries: [] }] }))
        .message,
    ).toContain("header is empty");

    const error = throwsValidation(() =>
      serializeTomlDocument({ tables: [{ header: null, entries: [["ratio", Number.NaN]] }] }),
    );
    expect(error.message).toContain('"ratio"');
    expect(error.message).toContain("non-finite");
  });
});
