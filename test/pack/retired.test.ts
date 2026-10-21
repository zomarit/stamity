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
 * The retired-names map (REQ-PACK-002). Every property is proved twice: over
 * the real map, and over a made-up one passed in, which shows the check finds
 * what it looks for and does not pass on the real map alone.
 *
 * TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u13-retired-map, REQ-PACK-002,
 * REQ-PACK-023): the header said the shipped map is empty until a release retires a
 * pack; it now holds `ops`, `product-audit` and `scaffold`, and the cases at the end
 * pin their parts, their notes, their pins and their successors' artifacts.
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

/**
 * Every file each retired pack's 1.16.0 `pack.json` listed in its integrity map,
 * frozen: the last release that shipped them, and the parts the map must cover.
 */
const SHIPPED_1_16_0: Readonly<Record<string, readonly string[]>> = {
  ops: [
    "agents/stamity-devops.md",
    "agents/stamity-incident-responder.md",
    "commands/st-incident-response.md",
    "commands/st-release.md",
    "skills/st-ci-pipeline/SKILL.md",
    "skills/st-containerize/SKILL.md",
    "skills/st-gh-agentic-workflows/SKILL.md",
    "skills/st-incident-runbook/SKILL.md",
    "skills/st-release-runbook/SKILL.md",
  ],
  "product-audit": [
    "commands/st-benchmark.md",
    "commands/st-product-audit.md",
    "rules/stamity-epic-audit-frame.md",
    "skills/st-perf-audit/SKILL.md",
  ],
  scaffold: [
    "commands/st-auth-scaffold.md",
    "commands/st-design-system-create.md",
    "commands/st-slo-scaffold.md",
  ],
};

/** A shipped file as the map names its part: a command as `/<name>`, anything else by its id. */
function partOf(rel: string): string {
  const [kind = "", name = ""] = rel.split("/");
  if (kind === "commands") return `/${name.replace(/\.md$/u, "")}`;
  return name.replace(/\.md$/u, "");
}

/**
 * Where an artifact named as the map names it lives under `root` (a pack's
 * folder, or the corpus for a move into the core): `/<name>` a command, any
 * other name a skill, an agent or a rule.
 */
function artifactPaths(root: string, name: string): string[] {
  return name.startsWith("/")
    ? [join(root, "commands", `${name.slice(1)}.md`)]
    : [join(root, "skills", name, "SKILL.md"), join(root, "agents", `${name}.md`), join(root, "rules", `${name}.md`)];
}

/** Each moved part of `map` whose `movedTo.name` its destination does not ship, as `<id>: <part> → <name>`. */
function unresolvedMoves(map: readonly RetiredPack[]): string[] {
  return map.flatMap((entry) =>
    entry.parts.flatMap(({ part, movedTo }) => {
      if (movedTo === null) return [];
      const root = movedTo.pack === undefined ? join(REPO_ROOT, "content") : join(REPO_ROOT, "packs", movedTo.pack);
      return artifactPaths(root, movedTo.name).some((path) => existsSync(path))
        ? []
        : [`${entry.id}: ${part} → ${movedTo.name}`];
    }),
  );
}

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

  it("retires ops, product-audit and scaffold, each last shipped in 1.16.0", () => {
    expect(RETIRED_PACKS.map((entry) => entry.id)).toEqual(["ops", "product-audit", "scaffold"]);
    for (const entry of RETIRED_PACKS) expect(entry.lastShippedIn, entry.id).toBe("1.16.0");
  });

  it("maps every part its 1.16.0 manifest listed, once each", () => {
    for (const entry of RETIRED_PACKS) {
      const shipped = (SHIPPED_1_16_0[entry.id] ?? []).map(partOf).toSorted();
      expect(shipped.length, entry.id).toBeGreaterThan(0);
      expect(entry.parts.map(({ part }) => part).toSorted(), entry.id).toEqual(shipped);
    }
  });

  it("gives every dropped part a note saying why", () => {
    const bare = RETIRED_PACKS.flatMap((entry) =>
      entry.parts.filter(({ movedTo, note }) => movedTo === null && (note ?? "").trim() === ""),
    );
    expect(RETIRED_PACKS.some((entry) => entry.parts.some(({ movedTo }) => movedTo === null))).toBe(true);
    expect(bare).toEqual([]);
  });

  it("names each part's new home by an artifact its successor ships", () => {
    const mistyped: RetiredPack = {
      ...GONE,
      parts: [
        { part: "/st-release", movedTo: { pack: "production", name: "st-relase" } },
        { part: "st-release-runbook", movedTo: { pack: "production", name: "/st-release" } },
        { part: "st-incident-runbook", movedTo: { pack: "production", name: "st-incident" } },
      ],
    };
    expect(unresolvedMoves([mistyped])).toEqual([
      "gone: /st-release → st-relase",
      "gone: st-release-runbook → /st-release",
    ]);
    expect(RETIRED_PACKS.some((entry) => entry.parts.some(({ movedTo }) => movedTo !== null))).toBe(true);
    expect(unresolvedMoves(RETIRED_PACKS)).toEqual([]);
  });

  it("pins each id's first-party copies by full, distinct aggregate SHAs", () => {
    for (const entry of RETIRED_PACKS) {
      expect(entry.pins.length, entry.id).toBeGreaterThan(0);
      expect(new Set(entry.pins).size, entry.id).toBe(entry.pins.length);
      for (const pin of entry.pins) expect(pin, entry.id).toMatch(/^[0-9a-f]{64}$/u);
    }
  });
});
