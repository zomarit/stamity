import { describe, expect, it } from "vitest";
import {
  extractCustomContent,
  extractManagedBlock,
  getStampedVersion,
  hasManagedBlock,
  insertManagedBlock,
  isHealableManagedPrefix,
  isManagedBlockStale,
  splitAfterManagedBlock,
  splitAtManagedBlock,
  wouldChangeMarkerVariant,
  wrapInManagedBlock,
} from "../../src/merge/managedBlocks.ts";
import { EngineError } from "../../src/types/errors.ts";
import {
  MANAGED_BLOCK_VARIANTS,
  stampMarkerVersion,
  type ManagedBlockMarkers,
} from "../../src/types/markers.ts";

const [HTML, HASH, SLASH] = MANAGED_BLOCK_VARIANTS as readonly [
  ManagedBlockMarkers,
  ManagedBlockMarkers,
  ManagedBlockMarkers,
];

/** One representative path per marker variant. */
const VARIANT_PATHS: readonly [string, ManagedBlockMarkers][] = [
  ["docs/setup.md", HTML],
  [".github/workflows/agents.yaml", HASH],
  ["hooks/gate.mjs", SLASH],
];

describe("wrapInManagedBlock / extractManagedBlock", () => {
  const body = "line one\n\n  indented line\nline three";

  it("round-trips byte-exact for all 3 marker variants", () => {
    for (const [path, markers] of VARIANT_PATHS) {
      const wrapped = wrapInManagedBlock(body, path);
      expect(wrapped).toBe(`${markers.start}\n${body}\n${markers.end}\n`);
      expect(extractManagedBlock(wrapped, path)).toBe(body);
    }
  });

  it("round-trips byte-exact with a version stamp, for all 3 variants", () => {
    for (const [path, markers] of VARIANT_PATHS) {
      const wrapped = wrapInManagedBlock(body, path, "1.2.3");
      expect(wrapped).toBe(`${stampMarkerVersion(markers.start, "1.2.3")}\n${body}\n${markers.end}\n`);
      expect(extractManagedBlock(wrapped, path)).toBe(body);
      expect(hasManagedBlock(wrapped, path)).toBe(true);
    }
  });

  it("defaults to the html variant without a path", () => {
    expect(wrapInManagedBlock(body)).toBe(`${HTML.start}\n${body}\n${HTML.end}\n`);
    expect(extractManagedBlock(wrapInManagedBlock(body))).toBe(body);
  });

  it("trims managed content symmetrically on wrap and extract", () => {
    // Boundary whitespace (including first-line leading spaces) is trimmed;
    // interior indentation survives.
    const wrapped = wrapInManagedBlock(`\n\n  ${body}  \n`, "a.md");
    expect(wrapped).toBe(`${HTML.start}\n${body}\n${HTML.end}\n`);
    expect(extractManagedBlock(wrapped, "a.md")).toBe(body);
  });

  it("empty managed content still emits both markers and extracts as ''", () => {
    for (const [path, markers] of VARIANT_PATHS) {
      const wrapped = wrapInManagedBlock("", path);
      expect(wrapped).toBe(`${markers.start}\n\n${markers.end}\n`);
      expect(extractManagedBlock(wrapped, path)).toBe("");
    }
  });

  it("extractManagedBlock returns null when no block exists", () => {
    expect(extractManagedBlock("just prose\n")).toBeNull();
    expect(extractManagedBlock("", "a.md")).toBeNull();
  });

  it("does not detect a mixed-variant pair (html BEGIN with hash END)", () => {
    const mixed = `${HTML.start}\nbody\n${HASH.end}\n`;
    expect(hasManagedBlock(mixed)).toBe(false);
    expect(extractManagedBlock(mixed)).toBeNull();
  });

  it("detects indented markers (lines are trimmed before comparison)", () => {
    const indented = `  ${HTML.start}\nbody\n\t${HTML.end}\n`;
    expect(extractManagedBlock(indented, "a.md")).toBe("body");
  });
});

describe("line anchoring", () => {
  it("a marker token quoted mid-line is not a boundary", () => {
    const content = [
      `${HTML.start}`,
      `docs may mention ${HTML.end} inline without ending the block`,
      "more managed content",
      `${HTML.end}`,
      "",
    ].join("\n");
    expect(extractManagedBlock(content, "a.md")).toBe(
      `docs may mention ${HTML.end} inline without ending the block\nmore managed content`,
    );
  });

  it("prefers the path's own variant when the body quotes the other variant whole-line", () => {
    // A yaml file whose managed body documents the html tokens on their own
    // lines: path preference must read the hash block, not the html pair.
    const content = [
      "user: top",
      `${HASH.start}`,
      `${HTML.start}`,
      `${HTML.end}`,
      `${HASH.end}`,
      "user: bottom",
      "",
    ].join("\n");
    expect(extractManagedBlock(content, "wf.yaml")).toBe(`${HTML.start}\n${HTML.end}`);
    expect(extractManagedBlock(content, "wf.md")).toBe("");
    // Without a path, declared variant order wins (html first).
    expect(extractManagedBlock(content)).toBe("");
  });
});

describe("fence awareness (markdown hosts)", () => {
  const fencedEnd = ["```md", `${HTML.end}`, "```"].join("\n");

  it("a ``` fence containing a whole-line END token does not terminate the block", () => {
    const bodyWithExample = `intro\n${fencedEnd}\noutro`;
    const wrapped = wrapInManagedBlock(bodyWithExample, "a.md");
    expect(extractManagedBlock(wrapped, "a.md")).toBe(bodyWithExample);

    const merged = insertManagedBlock(wrapped, "replaced", "a.md");
    expect(merged).toBe(`${HTML.start}\nreplaced\n${HTML.end}\n`);
  });

  it("a ``` fence containing a whole-line BEGIN token does not open a block", () => {
    const doc = ["```", `${HTML.start}`, `${HTML.end}`, "```", ""].join("\n");
    expect(hasManagedBlock(doc, "a.md")).toBe(false);
    expect(extractCustomContent(doc, "a.md")).toBe(doc);
  });

  it("tilde fences shield too, and a closing fence must be at least as long", () => {
    const doc = [
      "~~~~",
      `${HTML.start}`,
      "~~~", // shorter: does not close
      `${HTML.end}`,
      "~~~~",
      "",
    ].join("\n");
    expect(hasManagedBlock(doc, "a.md")).toBe(false);
  });

  it("an unterminated fence voids the shield entirely (fail toward finding real markers)", () => {
    const doc = ["```", `${HTML.start}`, "body", `${HTML.end}`, ""].join("\n");
    expect(hasManagedBlock(doc, "a.md")).toBe(true);
    expect(extractManagedBlock(doc, "a.md")).toBe("body");
  });

  it("non-markdown hosts get no fence shield", () => {
    // In a yaml file a fenced-looking region is just content; the whole-line
    // token inside it is a real boundary there.
    const doc = ["```", `${HASH.start}`, "body", `${HASH.end}`, "```", ""].join("\n");
    expect(hasManagedBlock(doc, "wf.yaml")).toBe(true);
    expect(hasManagedBlock(doc, "wf.md")).toBe(false);
  });
});

describe("insertManagedBlock", () => {
  const existing = [
    "user intro",
    "",
    `${HTML.start}`,
    "old managed",
    `${HTML.end}`,
    "",
    "user outro",
    "",
  ].join("\n");

  it("replaces the block and preserves user bytes above and below raw", () => {
    const result = insertManagedBlock(existing, "new managed", "a.md");
    expect(result).toBe(
      ["user intro", "", `${HTML.start}`, "new managed", `${HTML.end}`, "", "user outro", ""].join(
        "\n",
      ),
    );
  });

  it("is byte-stable when merging identical content twice", () => {
    const once = insertManagedBlock(existing, "same body", "a.md");
    expect(insertManagedBlock(once, "same body", "a.md")).toBe(once);
  });

  it("appends the final newline exactly once when missing", () => {
    const noTrailing = `${HTML.start}\nold\n${HTML.end}`;
    const result = insertManagedBlock(noTrailing, "new", "a.md");
    expect(result).toBe(`${HTML.start}\nnew\n${HTML.end}\n`);
    expect(insertManagedBlock(result, "new", "a.md")).toBe(result);
  });

  it("stamps the given version into the BEGIN marker", () => {
    const result = insertManagedBlock(existing, "body", "a.md", "2.0.0");
    expect(result).toContain(`${stampMarkerVersion(HTML.start, "2.0.0")}\nbody`);
    expect(getStampedVersion(result, "a.md")).toBe("2.0.0");
  });

  it("re-stamps an already-stamped block on merge", () => {
    const stamped = wrapInManagedBlock("body", "a.md", "1.0.0");
    const result = insertManagedBlock(stamped, "body", "a.md", "2.0.0");
    expect(getStampedVersion(result, "a.md")).toBe("2.0.0");
    expect(result).not.toContain("1.0.0");
    expect(result.split(HTML.end)).toHaveLength(2);
  });

  it("emits a bare marker when no version is given, even over a stamped block", () => {
    const stamped = wrapInManagedBlock("body", "a.md", "1.0.0");
    const result = insertManagedBlock(stamped, "body", "a.md");
    expect(getStampedVersion(result, "a.md")).toBeNull();
  });

  it("auto-repairs the marker variant to match the path", () => {
    const htmlInYaml = `# user line\n${HTML.start}\nold\n${HTML.end}\n`;
    expect(wouldChangeMarkerVariant(htmlInYaml, "wf.yaml")).toBe(true);
    const result = insertManagedBlock(htmlInYaml, "new", "wf.yaml");
    expect(result).toBe(`# user line\n${HASH.start}\nnew\n${HASH.end}\n`);
  });

  it("throws VALIDATION_ERROR when markers are missing", () => {
    let thrown: unknown;
    try {
      insertManagedBlock("no markers here\n", "body", "a.md");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    const engineErr = thrown as EngineError;
    expect(engineErr.code).toBe("VALIDATION_ERROR");
    expect(engineErr.message).toContain("a.md");
    expect(engineErr.message).toContain("STAMITY:BEGIN");
  });

  it("throws VALIDATION_ERROR on a duplicate BEGIN marker, bare or stamped", () => {
    const dupBare = `${HTML.start}\nbody\n${HTML.end}\n${HTML.start}\n`;
    expect(() => insertManagedBlock(dupBare, "x", "a.md")).toThrowError(/STAMITY:BEGIN markers/);
    // A stamped duplicate counts too: stamped lines are BEGIN markers.
    const dupStamped = `${stampMarkerVersion(HTML.start, "1.0.0")}\nbody\n${HTML.end}\n${HTML.start}\n${HTML.end}\n`;
    expect(() => insertManagedBlock(dupStamped, "x", "a.md")).toThrowError(/STAMITY:BEGIN markers/);
  });

  it("throws VALIDATION_ERROR on a duplicate END marker", () => {
    const dup = `${HTML.start}\nbody\n${HTML.end}\ntail\n${HTML.end}\n`;
    expect(() => insertManagedBlock(dup, "x", "a.md")).toThrowError(/STAMITY:END markers/);
  });

  it("does not count a fenced whole-line marker as a duplicate on markdown hosts", () => {
    const doc = [
      `${HTML.start}`,
      "body",
      `${HTML.end}`,
      "",
      "```",
      `${HTML.end}`,
      "```",
      "",
    ].join("\n");
    const result = insertManagedBlock(doc, "next", "a.md");
    expect(result).toContain("next");
    expect(result).toContain("```");
  });
});

describe("two managed blocks in one file (corruption)", () => {
  const twoBlocks = [
    `${HTML.start}`,
    "first",
    `${HTML.end}`,
    "between",
    `${HTML.start}`,
    "second",
    `${HTML.end}`,
    "",
  ].join("\n");

  it("extract takes the first block", () => {
    expect(extractManagedBlock(twoBlocks, "a.md")).toBe("first");
    expect(getStampedVersion(twoBlocks, "a.md")).toBeNull();
  });

  it("the merge path flags it instead of guessing", () => {
    expect(() => insertManagedBlock(twoBlocks, "x", "a.md")).toThrowError(EngineError);
  });

  it("wouldChangeMarkerVariant flags duplicated wrong-variant blocks against the path", () => {
    expect(wouldChangeMarkerVariant(twoBlocks, "wf.yaml")).toBe(true);
    expect(wouldChangeMarkerVariant(twoBlocks, "a.md")).toBe(false);
  });
});

describe("BEGIN without END (truncated block)", () => {
  const truncated = `user prefix\n${HTML.start}\npartial managed content`;

  it("never detects as a block", () => {
    expect(hasManagedBlock(truncated, "a.md")).toBe(false);
    expect(extractManagedBlock(truncated, "a.md")).toBeNull();
    expect(splitAtManagedBlock(truncated, "a.md")).toBeNull();
    expect(splitAfterManagedBlock(truncated, "a.md")).toBeNull();
  });

  it("isHealableManagedPrefix is true for a bare or stamped unterminated BEGIN", () => {
    expect(isHealableManagedPrefix(truncated)).toBe(true);
    expect(isHealableManagedPrefix(`${stampMarkerVersion(HASH.start, "1.2.3")}\n`)).toBe(true);
    expect(isHealableManagedPrefix(`${SLASH.start}`)).toBe(true);
  });

  it("isHealableManagedPrefix is false without an unterminated BEGIN", () => {
    expect(isHealableManagedPrefix("")).toBe(false);
    expect(isHealableManagedPrefix("   \n\t\n")).toBe(false);
    expect(isHealableManagedPrefix("plain user prose\n")).toBe(false);
    expect(isHealableManagedPrefix(`${HTML.end}\n`)).toBe(false);
    expect(isHealableManagedPrefix(wrapInManagedBlock("body", "a.md"))).toBe(false);
    expect(isHealableManagedPrefix(wrapInManagedBlock("body", "a.md", "1.0.0"))).toBe(false);
  });

  it("isHealableManagedPrefix ignores a BEGIN quoted inside a terminated fence", () => {
    expect(isHealableManagedPrefix(["```", `${HTML.start}`, "```", ""].join("\n"))).toBe(false);
  });
});

describe("splitAtManagedBlock", () => {
  it("reassembles before + block + after byte-exact", () => {
    const content = `intro\n${wrapInManagedBlock("body", "a.md", "1.2.3")}outro\n`;
    const split = splitAtManagedBlock(content, "a.md");
    expect(split).not.toBeNull();
    const { before, block, after } = split as NonNullable<typeof split>;
    expect(before).toBe("intro\n");
    expect(block).toBe(`${stampMarkerVersion(HTML.start, "1.2.3")}\nbody\n${HTML.end}`);
    expect(after).toBe("\noutro\n");
    expect(before + block + after).toBe(content);
  });

  it("keeps indentation of an indented BEGIN line in `before`", () => {
    const content = `  ${HTML.start}\nbody\n${HTML.end}\n`;
    const split = splitAtManagedBlock(content, "a.md");
    expect(split?.before).toBe("  ");
    expect(split?.block).toBe(`${HTML.start}\nbody\n${HTML.end}`);
  });

  it("returns null when no block is detected", () => {
    expect(splitAtManagedBlock("prose only\n", "a.md")).toBeNull();
  });
});

describe("splitAfterManagedBlock", () => {
  it("splits into prefix-through-END and the preserved rest", () => {
    const content = `intro\n${wrapInManagedBlock("body", "a.md")}user suffix\n`;
    const split = splitAfterManagedBlock(content, "a.md");
    expect(split).not.toBeNull();
    const { prefix, rest } = split as NonNullable<typeof split>;
    expect(prefix.endsWith(HTML.end)).toBe(true);
    expect(rest).toBe("\nuser suffix\n");
    expect(prefix + rest).toBe(content);
  });

  it("returns null when no block is detected", () => {
    expect(splitAfterManagedBlock("prose only\n", "a.md")).toBeNull();
  });
});

describe("extractCustomContent", () => {
  it("joins trimmed content above and below the block with a blank line", () => {
    const content = `above\n\n${wrapInManagedBlock("managed", "a.md")}\nbelow\n`;
    expect(extractCustomContent(content, "a.md")).toBe("above\n\nbelow");
  });

  it("returns only the populated side", () => {
    expect(extractCustomContent(`above\n${wrapInManagedBlock("m", "a.md")}`, "a.md")).toBe("above");
    expect(extractCustomContent(`${wrapInManagedBlock("m", "a.md")}below\n`, "a.md")).toBe("below");
    expect(extractCustomContent(wrapInManagedBlock("m", "a.md"), "a.md")).toBe("");
  });

  it("returns content unchanged when no block is detected", () => {
    const prose = `notes mentioning ${HTML.start} mid-line\n`;
    expect(extractCustomContent(prose, "a.md")).toBe(prose);
  });
});

describe("CRLF files", () => {
  const crlf = [
    "user top",
    `${HTML.start}`,
    "old body",
    `${HTML.end}`,
    "user bottom",
    "",
  ].join("\r\n");

  it("detects and extracts through CRLF line endings", () => {
    expect(hasManagedBlock(crlf, "a.md")).toBe(true);
    expect(extractManagedBlock(crlf, "a.md")).toBe("old body");
  });

  it("merge preserves CRLF byte-exact outside the block", () => {
    const result = insertManagedBlock(crlf, "new body", "a.md");
    expect(result).toBe(
      `user top\r\n${HTML.start}\nnew body\n${HTML.end}\r\nuser bottom\r\n`,
    );
  });

  it("three-way split reassembles CRLF content byte-exact", () => {
    const split = splitAtManagedBlock(crlf, "a.md");
    expect(split).not.toBeNull();
    const { before, block, after } = split as NonNullable<typeof split>;
    expect(before + block + after).toBe(crlf);
    expect(after.startsWith("\r\n")).toBe(true);
  });
});

describe("wouldChangeMarkerVariant", () => {
  it("detects hash markers in a markdown path (and the reverse)", () => {
    const hashInMd = `${HASH.start}\nbody\n${HASH.end}\n`;
    expect(wouldChangeMarkerVariant(hashInMd, "a.md")).toBe(true);
    expect(wouldChangeMarkerVariant(hashInMd, "wf.yaml")).toBe(false);
    const htmlInYaml = `${HTML.start}\nbody\n${HTML.end}\n`;
    expect(wouldChangeMarkerVariant(htmlInYaml, "wf.yaml")).toBe(true);
    expect(wouldChangeMarkerVariant(htmlInYaml, "a.md")).toBe(false);
  });

  it("is false without a block, and unaffected by a version stamp alone", () => {
    expect(wouldChangeMarkerVariant("prose\n", "a.md")).toBe(false);
    expect(wouldChangeMarkerVariant(wrapInManagedBlock("b", "a.md", "1.0.0"), "a.md")).toBe(false);
  });

  it("treats a missing path as the html default", () => {
    expect(wouldChangeMarkerVariant(`${HASH.start}\nb\n${HASH.end}\n`)).toBe(true);
    expect(wouldChangeMarkerVariant(`${HTML.start}\nb\n${HTML.end}\n`)).toBe(false);
  });
});

describe("getStampedVersion", () => {
  it("returns the stamp for every variant and null when bare or absent", () => {
    for (const [path] of VARIANT_PATHS) {
      expect(getStampedVersion(wrapInManagedBlock("b", path, "3.4.5"), path)).toBe("3.4.5");
      expect(getStampedVersion(wrapInManagedBlock("b", path), path)).toBeNull();
    }
    expect(getStampedVersion("no block\n", "a.md")).toBeNull();
  });

  it("returns non-semver stamps raw (staleness judges them, not this reader)", () => {
    const stamped = `${stampMarkerVersion(HTML.start, "dev")}\nb\n${HTML.end}\n`;
    expect(getStampedVersion(stamped, "a.md")).toBe("dev");
  });
});

describe("isManagedBlockStale (only-when-stale contract)", () => {
  it("bare marker -> stale", () => {
    expect(isManagedBlockStale(wrapInManagedBlock("b", "a.md"), "1.2.3", "a.md")).toBe(true);
  });

  it("same version -> not stale, for every variant", () => {
    for (const [path] of VARIANT_PATHS) {
      expect(isManagedBlockStale(wrapInManagedBlock("b", path, "1.2.3"), "1.2.3", path)).toBe(
        false,
      );
    }
  });

  it("differing version -> stale (either direction)", () => {
    const v1 = wrapInManagedBlock("b", "a.md", "1.2.3");
    expect(isManagedBlockStale(v1, "1.2.4", "a.md")).toBe(true);
    expect(isManagedBlockStale(v1, "0.9.0", "a.md")).toBe(true);
    expect(isManagedBlockStale(v1, "1.2.3-beta.1", "a.md")).toBe(true);
  });

  it("compares by semver value, not string identity", () => {
    // Leading v normalizes away; build metadata is semver-equal.
    expect(isManagedBlockStale(wrapInManagedBlock("b", "a.md", "1.2.3"), "v1.2.3", "a.md")).toBe(
      false,
    );
    expect(
      isManagedBlockStale(wrapInManagedBlock("b", "a.md", "1.2.3+build.7"), "1.2.3", "a.md"),
    ).toBe(false);
  });

  it("malformed stamp -> stale (fail toward refresh)", () => {
    expect(isManagedBlockStale(wrapInManagedBlock("b", "a.md", "dev"), "1.2.3", "a.md")).toBe(true);
    expect(isManagedBlockStale(wrapInManagedBlock("b", "a.md", "1.2"), "1.2.3", "a.md")).toBe(true);
  });

  it("malformed current version -> stale (fail toward refresh)", () => {
    expect(
      isManagedBlockStale(wrapInManagedBlock("b", "a.md", "1.2.3"), "not-a-version", "a.md"),
    ).toBe(true);
  });

  it("no detectable block -> stale (nothing on disk is current)", () => {
    expect(isManagedBlockStale("prose only\n", "1.2.3", "a.md")).toBe(true);
    expect(isManagedBlockStale("", "1.2.3", "a.md")).toBe(true);
  });
});
