import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ENGINE_JSON_STYLE,
  canonicalJson,
  jsonStyleOf,
  memberHash,
  memberHashes,
  memberPointer,
  parseMemberPointer,
  proveMember,
  readMember,
  removeOwnedMembers,
  serialiseJson,
} from "../../src/manifest/jsonMembers.ts";
import { EngineError } from "../../src/types/errors.ts";
import type { CoOwnership } from "../../src/types/manifest.ts";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("memberPointer / parseMemberPointer", () => {
  it("escapes ~ before / (RFC 6901) and parses the result back to the same segments", () => {
    expect(memberPointer(["a/b~c"])).toBe("/a~1b~0c");
    expect(parseMemberPointer("/a~1b~0c")).toEqual(["a/b~c"]);
    // `~01` must decode to `~1`, not to `/`: the escape order is the point.
    expect(memberPointer(["~1"])).toBe("/~01");
    expect(parseMemberPointer("/~01")).toEqual(["~1"]);
  });

  it("builds and parses a depth-2 pointer", () => {
    expect(memberPointer(["permissions", "allow"])).toBe("/permissions/allow");
    expect(parseMemberPointer("/hooks/Pre~1Tool")).toEqual(["hooks", "Pre/Tool"]);
  });

  it("takes an empty reference token, which RFC 6901 allows, and parses what memberPointer builds for it", () => {
    // An owner's `{"hooks":{"":[]}}` names the event `""`: its pointer must parse.
    expect(memberPointer(["hooks", ""])).toBe("/hooks/");
    expect(parseMemberPointer("/hooks/")).toEqual(["hooks", ""]);
    expect(parseMemberPointer("/")).toEqual([""]);
    expect(parseMemberPointer("//b")).toEqual(["", "b"]);
    expect(parseMemberPointer("//")).toEqual(["", ""]);
  });

  // TEST CHANGE, justified: review/33 — RFC 6901 allows an empty reference
  // token, so "/" and "//b" are pointers (to the key "" and to "b" under it);
  // they moved to the case above. A depth past 2 and a bad escape still refuse.
  it.each(["", "permissions", "/a/b/c", "/a//", "///", "/a~2", "/a~"])(
    "refuses %j as a member pointer, naming it",
    (pointer) => {
      let caught: unknown = null;
      try {
        parseMemberPointer(pointer);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EngineError);
      expect((caught as EngineError).code).toBe("VALIDATION_ERROR");
      expect((caught as EngineError).message).toBe(
        `\`${pointer}\` is not a member pointer of depth 1 or 2 (RFC 6901)`,
      );
    },
  );
});

describe("canonicalJson / memberHash", () => {
  it("sorts every object's keys by code unit, nested too, and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }, 1], "10": 0, "9": 0 })).toBe(
      '{"10":0,"9":0,"a":[{"c":3,"d":2},1],"b":1}',
    );
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(null)).toBe("null");
  });

  it("hashes key order away: the same value spelled two ways has one hash", () => {
    expect(memberHash({ b: 1, a: 2 })).toBe(memberHash({ a: 2, b: 1 }));
    expect(memberHash({ b: 1, a: 2 })).toBe(sha('{"a":2,"b":1}'));
    expect(memberHash({ a: 2 })).not.toBe(memberHash({ a: 3 }));
    expect(memberHash([1, 2])).not.toBe(memberHash([2, 1]));
  });

  it("keeps an own __proto__ key in the canonical text instead of dropping it", () => {
    const value = JSON.parse('{"__proto__":{"x":1},"a":1}') as unknown;
    expect(canonicalJson(value)).toBe('{"__proto__":{"x":1},"a":1}');
  });
});

describe("readMember / memberHashes / proveMember", () => {
  const doc = JSON.parse(
    '{"permissions":{"allow":["Read"],"deny":["Bash(rm -rf:*)"]},"model":"opus","list":[1]}',
  ) as Record<string, unknown>;

  it("reads own members at depth 1 and 2, and nothing through a missing or non-object parent", () => {
    expect(readMember(doc, "/model")).toBe("opus");
    expect(readMember(doc, "/permissions/deny")).toEqual(["Bash(rm -rf:*)"]);
    expect(readMember(doc, "/permissions/ask")).toBeUndefined();
    expect(readMember(doc, "/model/x")).toBeUndefined();
    expect(readMember(doc, "/list/0")).toBeUndefined();
    expect(readMember(doc, "/absent/x")).toBeUndefined();
    // Own properties only: nothing is read off the prototype chain.
    expect(readMember(doc, "/toString")).toBeUndefined();
    expect(readMember(doc, "/permissions/hasOwnProperty")).toBeUndefined();
  });

  it("hashes each present member and leaves an absent one out", () => {
    expect(memberHashes(doc, ["/model", "/permissions/deny", "/permissions/ask"])).toEqual({
      "/model": sha('"opus"'),
      "/permissions/deny": sha('["Bash(rm -rf:*)"]'),
    });
  });

  it("proves a member against the record: absent, proven, edited, unrecorded", () => {
    const record: CoOwnership = {
      members: { "/model": memberHash("opus"), "/permissions/deny": memberHash(["other"]) },
    };
    expect(proveMember(doc, "/permissions/ask", record)).toBe("absent");
    expect(proveMember(doc, "/model", record)).toBe("proven");
    expect(proveMember(doc, "/permissions/deny", record)).toBe("edited");
    expect(proveMember(doc, "/list", record)).toBe("unrecorded");
    expect(proveMember(doc, "/model", null)).toBe("unrecorded");
  });
});

describe("removeOwnedMembers", () => {
  it("removes the owned members present, reports them, and proves them against the record", () => {
    const doc = JSON.parse('{"a":1,"o":{"x":1,"y":2},"z":3}') as Record<string, unknown>;
    const record: CoOwnership = { members: { "/a": memberHash(1), "/o/x": memberHash(1) } };

    const out = removeOwnedMembers(doc, ["/a", "/o/x", "/missing", "/o/missing"], record);

    expect(out.doc).toEqual({ o: { y: 2 }, z: 3 });
    expect(Object.keys(out.doc)).toEqual(["o", "z"]);
    expect(out.removed).toEqual(["/a", "/o/x"]);
    expect(out.proven).toBe(true);
    // The input is not mutated.
    expect(doc).toEqual({ a: 1, o: { x: 1, y: 2 }, z: 3 });
  });

  it("is unproven when a removed member is edited or unrecorded", () => {
    const doc = { a: 2, b: 1 };
    expect(removeOwnedMembers(doc, ["/a"], { members: { "/a": memberHash(1) } }).proven).toBe(false);
    expect(removeOwnedMembers(doc, ["/b"], null).proven).toBe(false);
  });

  it("removes nothing and claims nothing when no owned member is present", () => {
    const out = removeOwnedMembers({ a: 1 }, ["/b"], null);
    expect(out).toEqual({ doc: { a: 1 }, removed: [], proven: true });
  });
});

describe("jsonStyleOf / serialiseJson — the style round trip (S15)", () => {
  const STYLED: readonly (readonly [string, string])[] = [
    ["two-space with a final newline", '{\n  "model": "opus",\n  "env": {\n    "A": "1"\n  }\n}\n'],
    ["four-space without a final newline", '{\n    "model": "opus",\n    "list": [\n        1,\n        2\n    ]\n}'],
    ["tab-indented", '{\n\t"model": "opus",\n\t"env": {\n\t\t"A": "1"\n\t}\n}\n'],
    ["one line", '{"model":"opus","env":{"A":"1"}}\n'],
    ["one line without a final newline", '{"model":"opus"}'],
    ["CRLF", '{\r\n  "model": "opus",\r\n  "env": {\r\n    "A": "1"\r\n  }\r\n}\r\n'],
    ["CRLF four-space without a final newline", '{\r\n    "model": "opus"\r\n}'],
    ["twelve-space (past JSON.stringify's ten-character cap)", '{\n            "a": [\n                        1\n            ]\n}\n'],
    ["an empty object", "{}\n"],
    ["a top-level array of objects", '[\n  {\n    "a": 1\n  }\n]\n'],
  ];

  it.each(STYLED)("comes back byte-identical: %s", (_name, text) => {
    expect(serialiseJson(JSON.parse(text) as unknown, jsonStyleOf(text))).toBe(text);
  });

  it("reads each property of the style", () => {
    expect(jsonStyleOf('{\n    "a": 1\n}')).toEqual({ indent: "    ", eol: "\n", finalNewline: false });
    expect(jsonStyleOf('{\n\t"a": 1\n}\n')).toEqual({ indent: "\t", eol: "\n", finalNewline: true });
    expect(jsonStyleOf('{"a":1}\n')).toEqual({ indent: "", eol: "\n", finalNewline: true });
    expect(jsonStyleOf('{\r\n  "a": 1\r\n}\r\n')).toEqual({ indent: "  ", eol: "\r\n", finalNewline: true });
    // A line break with no indented line after it: the engine's indent.
    expect(jsonStyleOf('{"a":\n1}')).toEqual({ indent: "  ", eol: "\n", finalNewline: false });
    // A blank line is not the indent.
    expect(jsonStyleOf('{\n   \n  "a": 1\n}\n').indent).toBe("  ");
  });

  it("ignores a leading byte-order mark when it reads the style", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(jsonStyleOf(`${bom}{\n    "a": 1\n}`)).toEqual({ indent: "    ", eol: "\n", finalNewline: false });
    expect(jsonStyleOf(`${bom}{"a":1}`)).toEqual({ indent: "", eol: "\n", finalNewline: false });
  });

  it("writes a mixed-ending document wholly in CRLF", () => {
    const text = '{\r\n  "a": 1,\n  "b": 2\n}\n';
    expect(serialiseJson(JSON.parse(text) as unknown, jsonStyleOf(text))).toBe('{\r\n  "a": 1,\r\n  "b": 2\r\n}\r\n');
  });

  it("is the engine's own document style for ENGINE_JSON_STYLE", () => {
    const value = { permissions: { allow: ["Read"] } };
    expect(serialiseJson(value, ENGINE_JSON_STYLE)).toBe(`${JSON.stringify(value, null, 2)}\n`);
  });

  it("never re-indents a tab inside a string value", () => {
    const value = { a: "x\ty", b: ["\tz"] };
    const text = serialiseJson(value, { indent: "    ", eol: "\n", finalNewline: true });
    expect(JSON.parse(text)).toEqual(value);
    expect(text).toBe('{\n    "a": "x\\ty",\n    "b": [\n        "\\tz"\n    ]\n}\n');
  });

  // The residue S15 names: a style JSON.stringify cannot write comes back with
  // the same keys and values, not the same bytes. Each case pins that it is
  // content-equal AND that it is not byte-identical, so a future serialiser
  // that starts keeping one of them shows up here as a pin to move.
  const RESIDUE: readonly (readonly [string, string])[] = [
    ["aligned colons", '{\n  "a"  : 1,\n  "bb" : 2\n}\n'],
    ["an inline array inside an indented object", '{\n  "allow": ["Read", "Grep"]\n}\n'],
    ["a one-line object with spaces", '{ "a": 1 }\n'],
    ["a number spelled 1.0", '{\n  "a": 1.0\n}\n'],
    ["an escaped non-ASCII character", '{\n  "a": "caf\\u00e9"\n}\n'],
    ["two trailing newlines", '{\n  "a": 1\n}\n\n'],
  ];

  it.each(RESIDUE)("comes back content-equal but not byte-identical: %s", (_name, text) => {
    const out = serialiseJson(JSON.parse(text) as unknown, jsonStyleOf(text));
    expect(JSON.parse(out)).toEqual(JSON.parse(text));
    expect(out).not.toBe(text);
  });

  it("re-orders integer-like keys first (the object model's order), content-equal", () => {
    const text = '{\n  "b": 1,\n  "1": 2\n}\n';
    const out = serialiseJson(JSON.parse(text) as unknown, jsonStyleOf(text));
    expect(out).toBe('{\n  "1": 2,\n  "b": 1\n}\n');
  });

  it("lets a RangeError past the stack propagate for the planner to classify", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20_000; i += 1) deep = [deep];
    expect(() => serialiseJson(deep, ENGINE_JSON_STYLE)).toThrow(RangeError);
  });
});
