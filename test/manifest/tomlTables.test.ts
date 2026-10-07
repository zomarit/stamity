import { describe, expect, it } from "vitest";
import { normaliseSegment, segmentTomlTables, tomlTableName, type TomlSegment } from "../../src/manifest/tomlTables.ts";

/**
 * `segmentTomlTables` cuts a TOML document into its root and tables without
 * re-serialising a byte (REQ-FLOW-037). Every case checks the two properties
 * the per-table ownership of `.codex/config.toml` stands on: the texts
 * concatenate to the input exactly, and a `[` hidden inside a string or an
 * open value is never read as a header.
 */

/** A backslash, spelled so no typed escape sequence reaches this file. */
const BS = "\\";

function segmentsOf(raw: string): TomlSegment[] {
  const cut = segmentTomlTables(raw);
  if (!cut.ok) throw new Error(`refused at line ${cut.line}: ${cut.reason}`);
  expect(cut.segments.map((segment) => segment.text).join("")).toBe(raw);
  return cut.segments;
}

const keys = (segments: readonly TomlSegment[]): (string[] | null)[] => segments.map((segment) => (segment.key === null ? null : [...segment.key]));

function refusal(raw: string): { line: number; reason: string } {
  const cut = segmentTomlTables(raw);
  if (cut.ok) throw new Error("expected a refusal");
  return { line: cut.line, reason: cut.reason };
}

describe("segmentTomlTables — the cut", () => {
  it("puts everything before the first table in the root, and the root is always first", () => {
    const segments = segmentsOf('model = "o3"\n\n[a]\nx = 1\n[b]\ny = 2\n');
    expect(keys(segments)).toEqual([null, ["a"], ["b"]]);
    expect(segments.map((segment) => segment.text)).toEqual(['model = "o3"\n\n', "[a]\nx = 1\n", "[b]\ny = 2\n"]);
  });

  it("returns one empty root for empty input and the whole text as root when there is no table", () => {
    expect(segmentsOf("")).toEqual([{ key: null, arrayTable: false, text: "" }]);
    expect(segmentsOf("# only a comment\nk = 1")).toEqual([{ key: null, arrayTable: false, text: "# only a comment\nk = 1" }]);
  });

  it("starts a table at its leading block: comment lines above the header, blank lines between them, none above the first", () => {
    const raw = "k = 1\n\n\n# about b\n\n# more\n\n[b]\nv = 2\n";
    const segments = segmentsOf(raw);
    expect(segments[0]?.text).toBe("k = 1\n\n\n");
    expect(segments[1]?.text).toBe("# about b\n\n# more\n\n[b]\nv = 2\n");
  });

  it("stops a leading block at a data line, so the comment below a value stays in its own table", () => {
    const segments = segmentsOf("[a]\nx = 1\n# about b\n[b]\n");
    expect(segments.map((segment) => segment.text)).toEqual(["", "[a]\nx = 1\n", "# about b\n[b]\n"]);
  });

  it("reads a multi-line basic string holding [x] at a line start as data, escapes and all", () => {
    const raw = `[a]\ns = """\n[x]\nline with ${BS}""" inside ${BS}${BS}\n"""\n[b]\n`;
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("closes a multi-line basic string on a run of up to five quotes, and a line-ending backslash keeps it open", () => {
    const raw = `[a]\ns = """x${BS}\n[not]\n"""""\n[b]\n`;
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("reads a multi-line literal string holding [y] as data, a backslash in it being no escape", () => {
    const raw = `[a]\np = '''\n[y]\nC:${BS}path${BS}'''\n[b]\nq = ''''''\n`;
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("reads an array spanning lines, with [1, 2] alone on a line, as one value", () => {
    const raw = "[a]\nmatrix = [\n[1, 2],\n  [3, 4], # a comment [5]\n]\n[b]\n";
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("reads an inline table spanning lines as one value", () => {
    const raw = "[a]\nt = { x = [\n1], y = { z = 2 },\n}\n[b]\n";
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("does not read a # inside a string as a comment, nor a quote inside a comment as a string", () => {
    const raw = `[a]\nurl = "http://x/#[frag]"\nlit = '#[x]'\ne = "q${BS}"#"\n# it's "open\n[b]\n`;
    expect(keys(segmentsOf(raw))).toEqual([null, ["a"], ["b"]]);
  });

  it("reads [[array.of.tables]] as an array table", () => {
    const segments = segmentsOf("[[array.of.tables]]\nx = 1\n[[array.of.tables]]\nx = 2\n");
    expect(segments.slice(1).map((segment) => [segment.key, segment.arrayTable])).toEqual([
      [["array", "of", "tables"], true],
      [["array", "of", "tables"], true],
    ]);
  });

  it('parses quoted keys as written: [mcp_servers."a.b"], literal keys, dots with spaces, and an empty quoted key', () => {
    const segments = segmentsOf(`[mcp_servers."a.b"]\n[ x . 'y.z' . "" ]\n`);
    expect(keys(segments)).toEqual([null, ["mcp_servers", "a.b"], ["x", "y.z", ""]]);
  });

  it("decodes the escapes of a quoted header key", () => {
    const raw = `["caf${BS}u00e9" . "${BS}U0001F600" . "t${BS}t${BS}"q"]\n`;
    expect(keys(segmentsOf(raw))).toEqual([null, ["café", String.fromCodePoint(0x1f600), 't\t"q']]);
  });

  it("takes a header with a trailing comment", () => {
    const segments = segmentsOf("[features] # the flag\nhooks = true\n");
    expect(segments[1]?.key).toEqual(["features"]);
  });

  it("keeps a CRLF text byte for byte and cuts it at the same lines", () => {
    const raw = 'model = "o3"\r\n\r\n# team\r\n[mcp_servers.team]\r\ncommand = "team-mcp"\r\nargs = []\r\n';
    const segments = segmentsOf(raw);
    expect(segments.map((segment) => segment.text)).toEqual(['model = "o3"\r\n\r\n', '# team\r\n[mcp_servers.team]\r\ncommand = "team-mcp"\r\nargs = []\r\n']);
  });

  it("reads a header after a leading byte-order mark", () => {
    const bom = String.fromCharCode(0xfeff);
    const segments = segmentsOf(`${bom}[a]\nx = 1\n`);
    expect(keys(segments)).toEqual([null, ["a"]]);
    expect(segments[0]?.text).toBe("");
    expect(segments[1]?.text.startsWith(bom)).toBe(true);
  });

  it("indents a header and still reads it", () => {
    expect(keys(segmentsOf("  \t[a]\n"))).toEqual([null, ["a"]]);
  });
});

describe("segmentTomlTables — what it refuses, naming the line", () => {
  const cases: [string, string, number, RegExp][] = [
    ["an unterminated basic string", 'a = 1\nb = "open\n', 2, /basic string opened on this line is not closed/u],
    ["an unterminated literal string", "a = 'open\n", 1, /literal string opened on this line is not closed/u],
    ["a basic string whose last character is an escape", `a = "x${BS}`, 1, /basic string/u],
    ["an unterminated multi-line basic string", 'x = 1\ns = """\nmore\n', 2, /multi-line basic string opened on this line is not closed/u],
    ["an unterminated multi-line literal string", "s = '''\n", 1, /multi-line literal string/u],
    ["a run of six quotes", 's = """x""""""\n', 1, /run of 6 quotes/u],
    ["an unclosed array", "a = [\n1,\n", 1, /an array opened on this line is not closed/u],
    ["an unclosed inline table", "\nt = {\n", 2, /an inline table opened on this line is not closed/u],
    ["a closer that matches nothing", "a = 1]\n", 1, /closes nothing/u],
    ["a mismatched closer", "a = [1}\n", 1, /closes nothing/u],
    ["a header that does not close", "[a\n", 1, /does not close with `\]`/u],
    ["an array header closed by one bracket", "[[a]\n", 1, /does not close with `\]\]`/u],
    ["text after a header", "[a] b = 1\n", 1, /text follows the closing bracket/u],
    ["an empty header", "[]\n", 1, /key is empty/u],
    ["a header key with a character a bare key cannot hold", "[a b]\n", 1, /does not close/u],
    ["an unclosed quoted header key", '["a]\n', 1, /quoted key is not closed/u],
    ["an unclosed literal header key", "['a]\n", 1, /quoted key is not closed/u],
    ["an escape TOML does not define", `["a${BS}x41"]\n`, 1, /escape TOML does not define/u],
    ["a short unicode escape", `["a${BS}u12"]\n`, 1, /escape TOML does not define/u],
    ["a surrogate escape", `["${BS}uD800"]\n`, 1, /escape TOML does not define/u],
    ["an escape past the last code point", `["${BS}U00110000"]\n`, 1, /escape TOML does not define/u],
    ["a backslash closing the key", `["${BS}`, 1, /escape TOML does not define/u],
  ];
  for (const [name, raw, line, reason] of cases) {
    it(name, () => {
      const result = refusal(raw);
      expect(result.line).toBe(line);
      expect(result.reason).toMatch(reason);
    });
  }
});

describe("segmentTomlTables — the key each line assigns", () => {
  function keyLines(raw: string): [string[], string[], number][] {
    const cut = segmentTomlTables(raw);
    if (!cut.ok) throw new Error(`refused at line ${cut.line}: ${cut.reason}`);
    return cut.keys.map((entry) => [[...entry.table], [...entry.key], entry.line]);
  }

  it("reads dotted and quoted keys with the table they sit in and their line", () => {
    expect(keyLines(`a.b = 1\n"c.d" . 'e' = { x = 1 }\n  [t]\nk = [\n  1,\n]\n[[arr]]\nm = 2\n`)).toEqual([
      [[], ["a", "b"], 1],
      [[], ["c.d", "e"], 2],
      [["t"], ["k"], 4],
      [["arr"], ["m"], 8],
    ]);
  });

  it("reads no key from a line inside a string or an open value, nor from a line that is no key = value", () => {
    expect(keyLines('s = """\nx = 1\n"""\nt = [\ny = 2,\n]\nstray words\nz 1\n= 3\n')).toEqual([
      [[], ["s"], 1],
      [[], ["t"], 4],
    ]);
  });
});

describe("tomlTableName", () => {
  it("writes bare segments bare and quotes the rest as src/adapters/toml.ts does", () => {
    expect(tomlTableName(["mcp_servers", "github"])).toBe("mcp_servers.github");
    expect(tomlTableName(["mcp_servers", "a.b"])).toBe('mcp_servers."a.b"');
    expect(tomlTableName(["x", 'q"t'])).toBe(`x."q${BS}"t"`);
  });
});

describe("normaliseSegment", () => {
  it("folds CRLF, drops trailing blank lines and the final break, and ends a non-empty text in one newline", () => {
    expect(normaliseSegment("[a]\r\nx = 1\r\n\r\n  \r\n")).toBe("[a]\nx = 1\n");
    expect(normaliseSegment("[a]\nx = 1")).toBe("[a]\nx = 1\n");
    expect(normaliseSegment("\n\n")).toBe("");
    expect(normaliseSegment("")).toBe("");
  });
});
