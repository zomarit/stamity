import { describe, expect, it } from "vitest";
import {
  CONTENT_PREFIX,
  ENGINE_CONTENT_PREFIXES,
  INVOCABLE_CONTENT_PREFIX,
  MANAGED_BLOCK_VARIANTS,
  STATE_DIR,
  canHostManagedBlock,
  carriesEngineContentPrefix,
  contentPrefixFor,
  getMarkersForPath,
  parseMarkerVersion,
  stampMarkerVersion,
  stripEngineContentPrefix,
  type ManagedBlockMarkers,
} from "../../src/types/markers.ts";

// The 3-element shape is itself asserted in the first test below.
const [HTML, HASH, SLASH] = MANAGED_BLOCK_VARIANTS as readonly [
  ManagedBlockMarkers,
  ManagedBlockMarkers,
  ManagedBlockMarkers,
];

describe("MANAGED_BLOCK_VARIANTS", () => {
  it("lists exactly the 3 variants with HTML first (read-side scan order is a contract)", () => {
    expect(MANAGED_BLOCK_VARIANTS).toHaveLength(3);
    expect(HTML).toEqual({ start: "<!-- STAMITY:BEGIN -->", end: "<!-- STAMITY:END -->" });
    expect(HASH).toEqual({ start: "# STAMITY:BEGIN", end: "# STAMITY:END" });
    expect(SLASH).toEqual({ start: "// STAMITY:BEGIN", end: "// STAMITY:END" });
  });

  it("keeps every pair internally consistent", () => {
    for (const variant of MANAGED_BLOCK_VARIANTS) {
      expect(variant.start).toContain("STAMITY:BEGIN");
      expect(variant.end).toContain("STAMITY:END");
    }
  });
});

describe("getMarkersForPath", () => {
  it("returns the correct variant for .md, .yaml, .mjs, .ts, and extensionless paths", () => {
    expect(getMarkersForPath("docs/setup.md")).toEqual(HTML);
    expect(getMarkersForPath(".github/workflows/agent-setup.yaml")).toEqual(HASH);
    expect(getMarkersForPath("hooks/allowlist.mjs")).toEqual(SLASH);
    expect(getMarkersForPath("src/generated.ts")).toEqual(SLASH);
    expect(getMarkersForPath("Makefile")).toEqual(HTML);
  });

  it("covers the full extension map", () => {
    expect(getMarkersForPath("a.yml")).toEqual(HASH);
    expect(getMarkersForPath("a.toml")).toEqual(HASH);
    expect(getMarkersForPath("a.js")).toEqual(SLASH);
    expect(getMarkersForPath("a.jsonc")).toEqual(SLASH);
    // Plain JSON is never wrapped; the lookup stays total for read-side callers
    // and answers the default variant, and `canHostManagedBlock` below is the
    // refusal the write side asks for.
    expect(getMarkersForPath("a.json")).toEqual(HTML);
  });

  it("matches extensions case-insensitively", () => {
    expect(getMarkersForPath("PIPELINE.YAML")).toEqual(HASH);
    expect(getMarkersForPath("script.MJS")).toEqual(SLASH);
  });

  it("returns the html variant for '' and undefined", () => {
    expect(getMarkersForPath("")).toEqual(HTML);
    expect(getMarkersForPath(undefined)).toEqual(HTML);
    expect(getMarkersForPath()).toEqual(HTML);
  });

  it("does not mistake a longer extension for a mapped one", () => {
    // .mts is not in the map: falls through to the html default.
    expect(getMarkersForPath("a.mts")).toEqual(HTML);
  });
});

describe("canHostManagedBlock", () => {
  it("refuses plain JSON — the one shipped format with no comment syntax", () => {
    // The paths the engine actually emits as JSON: a wrapped one is a parse
    // error for the client that reads it, not a cosmetic mismatch.
    expect(canHostManagedBlock(".claude/settings.json")).toBe(false);
    expect(canHostManagedBlock(".mcp.json")).toBe(false);
    expect(canHostManagedBlock(".vscode/mcp.json")).toBe(false);
  });

  it("matches the extension case-insensitively, like the variant lookup", () => {
    expect(canHostManagedBlock("Settings.JSON")).toBe(false);
  });

  it("accepts every format a marker variant exists for", () => {
    for (const path of [
      "AGENTS.md",
      "docs/setup.md",
      ".github/workflows/agent-setup.yaml",
      "config.yml",
      ".codex/config.toml",
      "hooks/allowlist.mjs",
      "src/generated.ts",
      "tsconfig.jsonc",
    ]) {
      expect(canHostManagedBlock(path), path).toBe(true);
    }
  });

  it("accepts an unmapped or extensionless path — HTML markers are plain text", () => {
    expect(canHostManagedBlock("Makefile")).toBe(true);
    expect(canHostManagedBlock("a.mts")).toBe(true);
    expect(canHostManagedBlock("")).toBe(true);
  });

  it("does not mistake a longer extension for the refused one", () => {
    // `.jsonc` ends in neither `.json`'s bytes nor its semantics.
    expect(canHostManagedBlock("a.jsonc")).toBe(true);
    expect(canHostManagedBlock("release.json.md")).toBe(true);
  });
});

describe("stampMarkerVersion / parseMarkerVersion", () => {
  it("round-trips a version through all 3 variants", () => {
    for (const variant of MANAGED_BLOCK_VARIANTS) {
      const stamped = stampMarkerVersion(variant.start, "1.2.3");
      expect(parseMarkerVersion(stamped)).toBe("1.2.3");
    }
  });

  it("stamps the documented shape per variant", () => {
    expect(stampMarkerVersion(HTML.start, "1.2.3")).toBe("<!-- STAMITY:BEGIN v1.2.3 -->");
    expect(stampMarkerVersion(HASH.start, "1.2.3")).toBe("# STAMITY:BEGIN v1.2.3");
    expect(stampMarkerVersion(SLASH.start, "1.2.3")).toBe("// STAMITY:BEGIN v1.2.3");
  });

  it("returns null on bare start and end markers of every variant", () => {
    for (const variant of MANAGED_BLOCK_VARIANTS) {
      expect(parseMarkerVersion(variant.start)).toBeNull();
      expect(parseMarkerVersion(variant.end)).toBeNull();
    }
  });

  it("never reads the html comment close as a version token", () => {
    expect(parseMarkerVersion("<!-- STAMITY:BEGIN -->")).toBeNull();
    // Tolerance: a stamp missing the space before the close still parses.
    expect(parseMarkerVersion("<!-- STAMITY:BEGIN v1.2.3-->")).toBe("1.2.3");
  });

  it("parses a marker mid-text, not only at line start", () => {
    expect(parseMarkerVersion("prefix <!-- STAMITY:BEGIN v2.0.1 --> suffix")).toBe("2.0.1");
    expect(parseMarkerVersion("    # STAMITY:BEGIN v3.4.5")).toBe("3.4.5");
    expect(parseMarkerVersion("\t// STAMITY:BEGIN v0.0.1")).toBe("0.0.1");
  });

  it("returns non-semver tokens raw — the staleness compare downstream decides", () => {
    // Leading 'v' is stamp grammar and is stripped; the remainder passes
    // through unvalidated.
    expect(parseMarkerVersion("# STAMITY:BEGIN v1.2")).toBe("1.2");
    expect(parseMarkerVersion("# STAMITY:BEGIN dev")).toBe("dev");
    expect(parseMarkerVersion("<!-- STAMITY:BEGIN dev -->")).toBe("dev");
  });

  it("returns null on lines without a BEGIN marker", () => {
    expect(parseMarkerVersion("")).toBeNull();
    expect(parseMarkerVersion("plain text v1.2.3")).toBeNull();
    expect(parseMarkerVersion("<!-- STAMITY:END v1.2.3 -->")).toBeNull();
  });

  it("keeps a stamped html marker a well-formed comment", () => {
    const stamped = stampMarkerVersion(HTML.start, "9.9.9");
    expect(stamped.startsWith("<!--")).toBe(true);
    expect(stamped.endsWith(" -->")).toBe(true);
  });
});

describe("state constants", () => {
  it("pins the state dir and both content prefixes", () => {
    expect(STATE_DIR).toBe(".stamity");
    expect(CONTENT_PREFIX).toBe("stamity-");
    expect(INVOCABLE_CONTENT_PREFIX).toBe("st-");
  });

  // The ownership gate and the reserved-id gate both read this list, and both
  // are wrong if it shrinks: a prefix dropped here is a file the engine can no
  // longer claim to have written, which the reclaim sweep then leaves on disk
  // forever. Order is asserted only to keep the refusal message's wording
  // stable.
  it("carries every prefix the engine mints filenames under", () => {
    expect(ENGINE_CONTENT_PREFIXES).toEqual([CONTENT_PREFIX, INVOCABLE_CONTENT_PREFIX]);
  });

  // The two prefixes must not prefix each other, or stripping one could eat
  // part of the other's slug.
  it("keeps the two prefixes mutually non-prefixing", () => {
    expect(CONTENT_PREFIX.startsWith(INVOCABLE_CONTENT_PREFIX)).toBe(false);
    expect(INVOCABLE_CONTENT_PREFIX.startsWith(CONTENT_PREFIX)).toBe(false);
  });
});

describe("contentPrefixFor", () => {
  // The split's whole point: the surfaces an operator TYPES take the short
  // prefix, and the ones only machines read keep the long one. A rename of the
  // latter is an unreclaimable-orphan bug in every already-installed repo.
  it("gives the invocable classes the short prefix", () => {
    expect(contentPrefixFor({ type: "command" })).toBe(INVOCABLE_CONTENT_PREFIX);
    expect(contentPrefixFor({ type: "skill" })).toBe(INVOCABLE_CONTENT_PREFIX);
  });

  it("keeps agents and rules on the long prefix", () => {
    expect(contentPrefixFor({ type: "agent" })).toBe(CONTENT_PREFIX);
    expect(contentPrefixFor({ type: "rule" })).toBe(CONTENT_PREFIX);
  });

  // A pack's filenames are hashed into a signed `pack.json` this engine does
  // not re-sign, so provenance outranks class: a pack command stays
  // `stamity-release`, and the mixed surface that produces is deliberate.
  it("keeps a pack-supplied artifact on the long prefix whatever its class", () => {
    const supplied = { pack: "@acme/ops" };
    expect(contentPrefixFor({ type: "command", provenance: supplied })).toBe(CONTENT_PREFIX);
    expect(contentPrefixFor({ type: "skill", provenance: supplied })).toBe(CONTENT_PREFIX);
  });
});

describe("engine prefix recognition", () => {
  it("recognises both spellings and nothing else", () => {
    expect(carriesEngineContentPrefix("stamity-implementer")).toBe(true);
    expect(carriesEngineContentPrefix("st-work")).toBe(true);
    expect(carriesEngineContentPrefix("review-gate")).toBe(false);
    expect(carriesEngineContentPrefix("standup-notes")).toBe(false);
  });

  it("strips whichever prefix is present, and only the prefix", () => {
    expect(stripEngineContentPrefix("stamity-spec-author")).toBe("spec-author");
    expect(stripEngineContentPrefix("st-pr-resolve")).toBe("pr-resolve");
    // Not a prefix, however much it looks like one at a glance.
    expect(stripEngineContentPrefix("standup-notes")).toBe("standup-notes");
    expect(stripEngineContentPrefix("review-gate")).toBe("review-gate");
  });
});
