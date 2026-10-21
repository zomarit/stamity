import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundledPacksRoot, curatedPacks, listBundledPackIds } from "../../src/pack/curated.ts";
import {
  describeRetiredPack,
  lookupRetiredPack,
  RETIRED_PACKS,
  retiredSuccessorPacks,
  type RetiredPack,
} from "../../src/pack/retired.ts";

/**
 * The retired-names map (REQ-PACK-002). The shipped map is empty until a
 * release retires a pack, so every property is proved twice: over the real
 * map, and over a made-up one passed in, which shows the check finds what it
 * looks for and does not pass on an empty list alone.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A made-up retired pack with each kind of part: to a pack, to the core, dropped. */
const GONE: RetiredPack = {
  id: "gone",
  lastShippedIn: "1.16.0",
  pins: ["a".repeat(64)],
  parts: [
    { part: "st-ship", movedTo: { pack: "production", name: "st-ship" } },
    { part: "st-look", movedTo: { pack: "frontend", name: "st-look" }, note: "renamed in place" },
    { part: "st-keep", movedTo: { name: "st-keep" } },
    { part: "st-old", movedTo: null, note: "superseded by st-debug" },
    { part: "st-also", movedTo: { pack: "production", name: "st-also" } },
  ],
};

/** Each `movedTo.pack` of `map` that is not a catalog id, as `<id>: <pack>`. */
function successorsOutsideCatalog(
  map: readonly RetiredPack[],
  catalogIds: readonly string[],
): string[] {
  return map.flatMap((entry) =>
    retiredSuccessorPacks(entry)
      .filter((pack) => !catalogIds.includes(pack))
      .map((pack) => `${entry.id}: ${pack}`),
  );
}

/** Each id of `map` that a catalog id or a packs-folder directory reuses. */
function reusedIds(
  map: readonly RetiredPack[],
  catalogIds: readonly string[],
  packDirs: readonly string[],
): string[] {
  return map
    .map((entry) => entry.id)
    .filter((id) => catalogIds.includes(id) || packDirs.includes(id));
}

describe("describeRetiredPack", () => {
  it("names the release and where each part went, a drop with its note", () => {
    expect(describeRetiredPack(GONE)).toBe(
      'pack "gone" was retired after 1.16.0: st-ship → production st-ship; ' +
        "st-look → frontend st-look (renamed in place); st-keep → core st-keep; " +
        "st-old → dropped (superseded by st-debug); st-also → production st-also",
    );
  });

  it("reads a drop with no note as dropped alone", () => {
    const bare: RetiredPack = { ...GONE, parts: [{ part: "st-old", movedTo: null }] };
    expect(describeRetiredPack(bare)).toBe('pack "gone" was retired after 1.16.0: st-old → dropped');
  });
});

describe("retiredSuccessorPacks", () => {
  it("lists each successor pack once, in part order, leaving out the core and drops", () => {
    expect(retiredSuccessorPacks(GONE)).toEqual(["production", "frontend"]);
  });
});

describe("lookupRetiredPack", () => {
  it("finds an id in a map passed in, and only that exact id", () => {
    expect(lookupRetiredPack("gone", [GONE])).toBe(GONE);
    expect(lookupRetiredPack("gone@1.16.0", [GONE])).toBeUndefined();
    expect(lookupRetiredPack("@acme/gone", [GONE])).toBeUndefined();
    expect(lookupRetiredPack("ops", [GONE])).toBeUndefined();
  });

  it("reads the shipped map by default", () => {
    for (const entry of RETIRED_PACKS) expect(lookupRetiredPack(entry.id)).toBe(entry);
    expect(lookupRetiredPack("gone")).toBeUndefined();
  });
});

describe("the shipped map", () => {
  const catalogIds = curatedPacks().map((entry) => entry.id);
  const packsRoot = bundledPacksRoot();
  const packDirs = packsRoot === null ? [] : listBundledPackIds(packsRoot);

  it("reads the packs folder the catalog reads, so the checks below are not vacuous", () => {
    expect(packsRoot).toBe(join(REPO_ROOT, "packs"));
    expect(catalogIds.length).toBeGreaterThan(0);
    expect(packDirs).toEqual([...catalogIds].toSorted());
  });

  it("points every successor at a catalog id", () => {
    expect(successorsOutsideCatalog([GONE], ["production"])).toEqual(["gone: frontend"]);
    expect(successorsOutsideCatalog(RETIRED_PACKS, catalogIds)).toEqual([]);
  });

  it("never reuses a retired id as a catalog id or a packs-folder directory", () => {
    const reused = catalogIds[0] ?? "";
    expect(reusedIds([GONE, { ...GONE, id: reused }], catalogIds, packDirs)).toEqual([reused]);
    expect(reusedIds(RETIRED_PACKS, catalogIds, packDirs)).toEqual([]);
    for (const entry of RETIRED_PACKS) {
      expect(existsSync(join(REPO_ROOT, "packs", entry.id)), `packs/${entry.id} exists`).toBe(false);
    }
  });

  it("is frozen, so no reader can add a name at run time", () => {
    expect(Object.isFrozen(RETIRED_PACKS)).toBe(true);
  });
});
