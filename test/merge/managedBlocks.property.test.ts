import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  extractCustomContent,
  extractManagedBlock,
  getStampedVersion,
  insertManagedBlock,
  isManagedBlockStale,
  wrapInManagedBlock,
} from "../../src/merge/managedBlocks.ts";
import { getMarkersForPath, stampMarkerVersion } from "../../src/types/markers.ts";

// Fixed seed: the suite must be deterministic run-to-run (CI contract).
const FC_PARAMS = { seed: 20260813, numRuns: 200 } as const;

/**
 * User text for the properties: arbitrary unicode minus marker tokens and
 * fence-opening lines. Marker collisions and fence interactions each flip
 * documented behaviors (duplicate refusal, fence shield) and are pinned
 * deterministically in managedBlocks.test.ts; the property space excludes
 * them so every generated case exercises the preserve-user-bytes contract.
 */
const isSafeText = (s: string): boolean =>
  !s.includes("STAMITY") && !s.split("\n").some((line) => /^(`{3,}|~{3,})/.test(line.trim()));

const text = fc.string({ unit: "binary", maxLength: 120 });
const userText = text.filter(isSafeText);

const versionArb = fc
  .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
const maybeVersion = fc.option(versionArb, { nil: undefined });

/** One representative path per marker variant, plus the no-path default. */
const pathArb = fc.constantFrom<string | undefined>(
  "notes.md",
  "pipeline.yaml",
  "hook.mjs",
  undefined,
);

describe("wrap -> extract round-trip properties", () => {
  it("recovers the trimmed body and the exact stamp for any body/path/version", () => {
    fc.assert(
      fc.property(userText, pathArb, maybeVersion, (body, path, version) => {
        const wrapped = wrapInManagedBlock(body, path, version);
        expect(extractManagedBlock(wrapped, path)).toBe(body.trim());
        expect(getStampedVersion(wrapped, path)).toBe(version ?? null);
        if (version !== undefined) {
          expect(isManagedBlockStale(wrapped, version, path)).toBe(false);
        }
      }),
      FC_PARAMS,
    );
  });

  it("staleness mirrors semver inequality of the generated version pair", () => {
    fc.assert(
      fc.property(userText, pathArb, versionArb, versionArb, (body, path, stamped, current) => {
        const wrapped = wrapInManagedBlock(body, path, stamped);
        expect(isManagedBlockStale(wrapped, current, path)).toBe(stamped !== current);
      }),
      FC_PARAMS,
    );
  });
});

describe("insertManagedBlock user-content preservation properties", () => {
  it("preserves prefix/suffix byte-exact and extractCustomContent recovers them", () => {
    fc.assert(
      fc.property(
        userText,
        userText,
        userText,
        userText,
        pathArb,
        maybeVersion,
        maybeVersion,
        (prefix, suffix, bodyA, bodyB, path, versionA, versionB) => {
          // Markers must sit on their own lines to be markers at all, so the
          // constructed file joins the parts with explicit newlines.
          const existing = `${prefix}\n${wrapInManagedBlock(bodyA, path, versionA)}${suffix}`;
          const result = insertManagedBlock(existing, bodyB, path, versionB);

          const markers = getMarkersForPath(path);
          const begin =
            versionB === undefined ? markers.start : stampMarkerVersion(markers.start, versionB);
          const rebuilt = `${prefix}\n${begin}\n${bodyB.trim()}\n${markers.end}\n${suffix}`;
          expect(result).toBe(rebuilt.endsWith("\n") ? rebuilt : `${rebuilt}\n`);

          expect(extractManagedBlock(result, path)).toBe(bodyB.trim());
          expect(getStampedVersion(result, path)).toBe(versionB ?? null);

          const custom = [prefix.trim(), suffix.trim()]
            .filter((part) => part !== "")
            .join("\n\n");
          expect(extractCustomContent(result, path)).toBe(custom);

          // A second identical merge is byte-stable (idempotent sync).
          expect(insertManagedBlock(result, bodyB, path, versionB)).toBe(result);
        },
      ),
      FC_PARAMS,
    );
  });
});
