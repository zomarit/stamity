import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOG_PINS } from "../../src/pack/catalogPins.ts";
import {
  bundledPacksRoot,
  curatedPacks,
  deriveCatalog,
  listBundledPackIds,
  lookupCatalogEntry,
  resolveBundledPackRoot,
  validateCatalogFormat,
  type CatalogEntry,
} from "../../src/pack/curated.ts";
import { PACK_MANIFEST_FILE, readPackManifest } from "../../src/pack/manifest.ts";
import { computeAggregateContentSha } from "../../src/pack/trust.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * The curated catalog, its generated pins, and the generator script that keeps
 * them honest. The pins-in-sync suite here IS the drift gate: any divergence
 * between `CATALOG_PINS`, the pack manifests, and the bytes on disk fails the
 * run pointing at `scripts/generate-pack-manifests.mjs`.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATOR = join(REPO_ROOT, "scripts", "generate-pack-manifests.mjs");
const GENERATOR_HINT = "node scripts/generate-pack-manifests.mjs";

// TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): the catalog is derived
// from the packs folder now (REQ-PACK-001), so the ids are read from it with this test's own
// walk instead of a typed three-id list that a fork's added folder would contradict.
const FIRST_PARTY_IDS: readonly string[] = readdirSync(join(REPO_ROOT, "packs"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(REPO_ROOT, "packs", entry.name, PACK_MANIFEST_FILE)))
  .map((entry) => entry.name)
  .toSorted();

// TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): the staged
// tamper, version and pin cases below read `ops`, which the package retires (REQ-PACK-023);
// they read `frontend`, the first-party pack it keeps, and one of its skills.
const STAGED_PACK = "frontend";
const STAGED_FILE = ["skills", "st-browser-evidence", "SKILL.md"] as const;

const PACKAGE_VERSION =(JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string })
  .version;

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** A pin the suite requires to exist; absence is itself pins drift. */
function pinOf(id: string): string {
  const pin = CATALOG_PINS[id];
  if (pin === undefined) throw new Error(`no CATALOG_PINS entry for "${id}" — run ${GENERATOR_HINT}`);
  return pin;
}

function runGenerator(args: readonly string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [GENERATOR, ...args], { encoding: "utf8" });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const getTemp = useTempDir("pack-curated");

/** Copy the repo's packs/ tree into the temp dir — write mode and tampering run against staged copies only, never the repo tree. */
async function stagePacks(temp: TempDirHandle): Promise<{ packsDir: string; pinsPath: string }> {
  const packsDir = temp.path("packs");
  await cp(join(REPO_ROOT, "packs"), packsDir, { recursive: true });
  return { packsDir, pinsPath: temp.path("catalogPins.ts") };
}

async function tamperFile(absPath: string): Promise<void> {
  await writeFile(absPath, `${await readFile(absPath, "utf8")}\n<!-- tampered -->\n`, "utf8");
}

/** Asserts `run` throws an EngineError of `code` and returns it for message checks. */
function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

// ── Pins-in-sync gate ──────────────────────────────────────────

describe("pins-in-sync gate", () => {
  // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CURATED_PACKS` left the module; the
  // same catalog is `curatedPacks()`, derived on first use from the packs folder (REQ-PACK-001).
  it("every curated pack's per-file digests match disk and its aggregate matches CATALOG_PINS", async () => {
    await Promise.all(
      curatedPacks().map(async (entry) => {
        const root = resolveBundledPackRoot(entry.id);
        const manifest = await readPackManifest(root);

        const digests = await Promise.all(
          Object.entries(manifest.integrity).map(async ([relPath, declared]) => ({
            relPath,
            declared,
            actual: sha256(await readFile(join(root, relPath))),
          })),
        );
        for (const { relPath, declared, actual } of digests) {
          expect(
            actual,
            `packs/${entry.id}/${relPath} drifted from its pack.json digest — run ${GENERATOR_HINT}`,
          ).toBe(declared);
        }

        const aggregate = computeAggregateContentSha(manifest.integrity);
        expect(
          aggregate,
          `pack "${entry.id}" aggregate disagrees with CATALOG_PINS — run ${GENERATOR_HINT}`,
        ).toBe(pinOf(entry.id));
        expect(entry.pin.sha256, `catalog entry "${entry.id}" pin disagrees with CATALOG_PINS`).toBe(
          pinOf(entry.id),
        );
      }),
    );
  });

  // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CURATED_PACKS` left the module; the
  // same catalog is `curatedPacks()`, derived on first use from the packs folder (REQ-PACK-001).
  it("CATALOG_PINS covers exactly the bundled catalog ids", () => {
    const bundled = curatedPacks().filter((entry) => entry.source.kind === "bundled")
      .map((entry) => entry.id)
      .toSorted();
    expect(Object.keys(CATALOG_PINS).toSorted()).toEqual(bundled);
    expect(bundled).toEqual([...FIRST_PARTY_IDS]);
  });

  it("aggregate recompute over a tampered staged pack differs from its pin", async () => {
    const { packsDir } = await stagePacks(getTemp());
    const root = join(packsDir, STAGED_PACK);
    await tamperFile(join(root, ...STAGED_FILE));

    const manifest = await readPackManifest(root);
    const recomputed = Object.fromEntries(
      await Promise.all(
        Object.keys(manifest.integrity).map(async (relPath) => [
          relPath,
          sha256(await readFile(join(root, relPath))),
        ]),
      ),
    ) as Record<string, string>;

    // The declared map still matches the pin — the mismatch below is the
    // tampered bytes, not an incidental difference in the recompute.
    expect(computeAggregateContentSha(manifest.integrity)).toBe(pinOf(STAGED_PACK));
    expect(computeAggregateContentSha(recomputed)).not.toBe(pinOf(STAGED_PACK));
  });
});

// ── Catalog lookup ─────────────────────────────────────────────

describe("lookupCatalogEntry", () => {
  it("resolves each first-party id to a bundled source with a curator-verified pin", () => {
    for (const id of FIRST_PARTY_IDS) {
      const entry = lookupCatalogEntry(id);
      expect(entry, `catalog entry "${id}" missing`).toBeDefined();
      expect(entry?.source).toEqual({ kind: "bundled" });
      expect(entry?.pin.tier).toBe("curator-verified");
      expect(entry?.pin.sha256).toBe(pinOf(id));
      expect(entry?.notAudited).toBe(false);
      expect(entry?.disclaimer).not.toBe("");
    }
  });

  it("returns undefined for an unknown id (the add path's fall-through answer)", () => {
    expect(lookupCatalogEntry("no-such-pack")).toBeUndefined();
    expect(lookupCatalogEntry("")).toBeUndefined();
  });

  // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CURATED_PACKS` left the module; the
  // same catalog is `curatedPacks()`, derived on first use from the packs folder (REQ-PACK-001).
  it("the validated catalog is frozen", () => {
    expect(Object.isFrozen(curatedPacks())).toBe(true);
    for (const entry of curatedPacks()) expect(Object.isFrozen(entry)).toBe(true);
  });
});

// ── Bundled pack root resolution ───────────────────────────────

describe("resolveBundledPackRoot", () => {
  it("resolves each first-party id to a directory holding its manifest", async () => {
    await Promise.all(
      FIRST_PARTY_IDS.map(async (id) => {
        const root = resolveBundledPackRoot(id);
        const manifest = await readPackManifest(root);
        expect(manifest.name).toBe(id);
      }),
    );
  });

  it("a missing bundled pack is CONFIG_ERROR naming both probed layouts", () => {
    const error = expectEngineError(() => resolveBundledPackRoot("no-such-pack"), "CONFIG_ERROR");
    expect(error.message).toContain(join("packs", "no-such-pack"));
    expect(error.message).toContain(join("dist", "packs", "no-such-pack"));
  });

  it("a path-shaped id is refused before any probe", () => {
    expectEngineError(() => resolveBundledPackRoot("../ops"), "VALIDATION_ERROR");
    expectEngineError(() => resolveBundledPackRoot("a/b"), "VALIDATION_ERROR");
  });

  it("resolves under the one root the catalog reads, the source layout first", () => {
    // A source checkout: `<repo>/packs` exists, so it is the root, and a stale
    // `dist/packs/<id>` from an older build is never what resolves.
    expect(bundledPacksRoot()).toBe(join(REPO_ROOT, "packs"));
    for (const id of FIRST_PARTY_IDS) {
      expect(resolveBundledPackRoot(id)).toBe(join(REPO_ROOT, "packs", id));
    }
  });
});

// ── The catalog derived from a packs folder ────────────────────

/** A pack.json for a made-up pack; `fields` overrides or removes (`undefined`) keys. */
function madeUpManifest(name: string, fields: Record<string, unknown> = {}): string {
  const manifest: Record<string, unknown> = {
    name,
    version: "0.0.1",
    description: `The ${name} pack.`,
    integrity: {},
    ...fields,
  };
  for (const [key, value] of Object.entries(manifest)) if (value === undefined) delete manifest[key];
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const COMMAND_BODY = "---\nid: acme\ntype: command\ndescription: Does the acme thing.\n---\n\n# acme\n";

describe("deriveCatalog", () => {
  it("lists a made-up pack folder with a regenerated pin, with no code edit", async () => {
    // What a fork does: add `packs/<id>/`, run the generator, nothing else.
    const temp = getTemp();
    await temp.seedFiles({
      "packs/acme-demo/pack.json": madeUpManifest("acme-demo"),
      "packs/acme-demo/commands/st-acme.md": COMMAND_BODY,
    });
    const packsDir = temp.path("packs");
    const pinsPath = temp.path("catalogPins.ts");
    const generated = runGenerator(["--write", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(generated.status, generated.output).toBe(0);
    const pin = /"acme-demo": "([0-9a-f]{64})"/.exec(await readFile(pinsPath, "utf8"))?.[1];
    expect(pin, "the generator wrote a pin for the folder").toBeDefined();

    const catalog = deriveCatalog(packsDir, { "acme-demo": pin ?? "" });
    expect(catalog.map((entry) => entry.id)).toEqual(["acme-demo"]);
    expect(catalog[0]).toMatchObject({
      // --write set the version to package.json's.
      version: PACKAGE_VERSION,
      description: "The acme-demo pack.",
      source: { kind: "bundled" },
      pin: { sha256: pin, tier: "curator-verified" },
      notAudited: false,
    });
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("refuses a wrong name, a missing description, no pin and a stale pin, all in one error", async () => {
    const temp = getTemp();
    const integrity = { "commands/st-acme.md": sha256(Buffer.from(COMMAND_BODY)) };
    await temp.seedFiles({
      "packs/misnamed/pack.json": madeUpManifest("other-name", { integrity }),
      "packs/misnamed/commands/st-acme.md": COMMAND_BODY,
      "packs/no-description/pack.json": madeUpManifest("no-description", { description: undefined, integrity }),
      "packs/no-description/commands/st-acme.md": COMMAND_BODY,
      "packs/no-pin/pack.json": madeUpManifest("no-pin", { integrity }),
      "packs/no-pin/commands/st-acme.md": COMMAND_BODY,
      "packs/stale-pin/pack.json": madeUpManifest("stale-pin", { integrity }),
      "packs/stale-pin/commands/st-acme.md": COMMAND_BODY,
    });
    const good = computeAggregateContentSha(integrity);
    const pins = { misnamed: good, "no-description": good, "stale-pin": "f".repeat(64) };

    const error = expectEngineError(() => deriveCatalog(temp.path("packs"), pins), "CONFIG_ERROR");
    expect(error.message).toMatch(/packs\/misnamed: .*"other-name" must equal the directory name/);
    expect(error.message).toMatch(/packs\/no-description: .*declares no `description`/);
    expect(error.message).toMatch(/packs\/no-pin: no pin in catalogPins\.ts/);
    expect(error.message).toMatch(/packs\/stale-pin: pin ffffffffffff… is stale/);
    expect(error.message).toContain("generate-pack-manifests");
  });

  it("refuses a pack whose integrity map was widened after its pin was generated", async () => {
    // The pin covers the integrity map: a manifest listing one more file than
    // the map the pin was taken over no longer aggregates to that pin.
    const temp = getTemp();
    const integrity = { "commands/st-acme.md": sha256(Buffer.from(COMMAND_BODY)) };
    const pin = computeAggregateContentSha(integrity);
    const widened = { ...integrity, "commands/st-extra.md": sha256(Buffer.from("extra")) };
    await temp.seedFiles({ "packs/acme/pack.json": madeUpManifest("acme", { integrity: widened }) });

    expect(deriveCatalog(temp.path("packs"), { acme: computeAggregateContentSha(widened) })).toHaveLength(1);
    const error = expectEngineError(() => deriveCatalog(temp.path("packs"), { acme: pin }), "CONFIG_ERROR");
    expect(error.message).toContain("packs/acme: pin");
    expect(error.message).toContain("is stale");
  });

  it("refuses a pin that names no pack folder", async () => {
    const temp = getTemp();
    await temp.seedFiles({ "packs/acme/pack.json": madeUpManifest("acme") });
    const pins = { acme: computeAggregateContentSha({}), ghost: SHA_A };
    const error = expectEngineError(() => deriveCatalog(temp.path("packs"), pins), "CONFIG_ERROR");
    expect(error.message).toContain('pin "ghost" names no directory');
  });

  it("a null root yields an empty catalog", () => {
    expect(deriveCatalog(null, CATALOG_PINS)).toEqual([]);
  });

  it("derives the repository's own catalog from its packs folder", () => {
    expect(curatedPacks().map((entry) => entry.id)).toEqual([...FIRST_PARTY_IDS]);
    expect(deriveCatalog(join(REPO_ROOT, "packs"), CATALOG_PINS)).toEqual(curatedPacks());
  });
});

describe("listBundledPackIds", () => {
  it("lists the directories holding a pack.json, sorted, and ignores a plain file", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "packs/zeta/pack.json": madeUpManifest("zeta"),
      "packs/alpha/pack.json": madeUpManifest("alpha"),
      "packs/README.md": "Not a pack.\n",
    });
    expect(listBundledPackIds(temp.path("packs"))).toEqual(["alpha", "zeta"]);
  });

  it("refuses a directory with no pack.json, naming the path it expected", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "packs/alpha/pack.json": madeUpManifest("alpha"),
      "packs/stray/notes.md": "Not a pack.\n",
    });
    const error = expectEngineError(() => listBundledPackIds(temp.path("packs")), "CONFIG_ERROR");
    expect(error.message).toContain(join(temp.path("packs"), "stray", PACK_MANIFEST_FILE));
    expect(error.message).not.toContain(join("alpha", PACK_MANIFEST_FILE));
  });

  // Plan 018 branch review, M-2: a `Dirent` for a link is not a directory, so a
  // symlinked pack folder dropped out of the catalog with nothing said while
  // `resolveBundledPackRoot` would follow it. The walk refuses it by name.
  it("refuses a symlinked pack folder, naming it, rather than dropping it silently", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "packs/alpha/pack.json": madeUpManifest("alpha"),
      "elsewhere/linked/pack.json": madeUpManifest("linked"),
    });
    symlinkSync(
      temp.path("elsewhere", "linked"),
      temp.path("packs", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const error = expectEngineError(() => listBundledPackIds(temp.path("packs")), "CONFIG_ERROR");
    expect(error.message).toContain(join(temp.path("packs"), "linked"));
    expect(error.message).not.toContain(join(temp.path("packs"), "alpha"));
  });
});

describe("the bundled packs' version", () => {
  it("every source pack.json reads package.json's version", async () => {
    // The build stamps the same value into dist/packs (tsdown.config.mjs);
    // holding the source to it keeps a checkout's install and a built one alike.
    const manifests = await Promise.all(
      FIRST_PARTY_IDS.map(async (id) => ({ id, manifest: await readPackManifest(join(REPO_ROOT, "packs", id)) })),
    );
    for (const { id, manifest } of manifests) {
      expect(manifest.version, `packs/${id}/pack.json — run ${GENERATOR_HINT} --write`).toBe(PACKAGE_VERSION);
      expect(lookupCatalogEntry(id)?.version).toBe(PACKAGE_VERSION);
    }
  });
});

// ── Format self-check ──────────────────────────────────────────

const SHA_A = "a".repeat(64);

// TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `CatalogEntry` gained `version`, so a
// hand-built entry states one; nothing the cases assert reads it.
function bundledEntry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id,
    version: "1.0.0",
    description: "Test pack.",
    source: { kind: "bundled" },
    pin: { sha256: SHA_A, tier: "curator-verified" },
    notAudited: false,
    disclaimer: "Test disclaimer.",
    ...overrides,
  };
}

describe("validateCatalogFormat (module-load self-check)", () => {
  it("a duplicate id fails, naming the id", () => {
    const error = expectEngineError(
      () => validateCatalogFormat([bundledEntry("dup"), bundledEntry("dup")], { dup: SHA_A }),
      "CONFIG_ERROR",
    );
    expect(error.message).toContain('duplicate catalog id "dup"');
  });

  it("an npm-sourced entry shape validates — the format-verified forward slot", () => {
    // TEST CHANGE, justified (2026-10-20_packs-rebuilt/u2-pack-catalog): `version` is a required field now.
    const entry: CatalogEntry = {
      id: "@acme/audit",
      version: "1.0.0",
      description: "Third-party audit pack.",
      source: { kind: "npm", package: "@acme/audit-pack" },
      pin: { sha256: SHA_A, tier: "scanned" },
      notAudited: true,
      disclaimer: "Not audited: format-verified and pinned only; review the preview before installing.",
    };
    const validated = validateCatalogFormat([entry], {});
    expect(validated).toHaveLength(1);
    expect(Object.isFrozen(validated[0])).toBe(true);
  });

  it("a bundled entry whose pin disagrees with catalogPins.ts fails, naming the generator", () => {
    const error = expectEngineError(
      () => validateCatalogFormat([bundledEntry("x")], { x: "b".repeat(64) }),
      "CONFIG_ERROR",
    );
    expect(error.message).toContain("generate-pack-manifests");
  });

  it("a pin with no catalog entry fails", () => {
    const error = expectEngineError(() => validateCatalogFormat([], { ghost: SHA_A }), "CONFIG_ERROR");
    expect(error.message).toContain('pin "ghost" has no catalog entry');
  });

  it("a non-catalog-grantable tier and an empty disclaimer each fail", () => {
    const badTier = expectEngineError(
      () =>
        validateCatalogFormat(
          [bundledEntry("x", { pin: { sha256: SHA_A, tier: "publisher-signed" } })],
          { x: SHA_A },
        ),
      "CONFIG_ERROR",
    );
    expect(badTier.message).toContain("not catalog-grantable");

    const badDisclaimer = expectEngineError(
      () => validateCatalogFormat([bundledEntry("x", { disclaimer: " " })], { x: SHA_A }),
      "CONFIG_ERROR",
    );
    expect(badDisclaimer.message).toContain("audit status");
  });
});

// ── Generator script ───────────────────────────────────────────

describe("generate-pack-manifests.mjs", () => {
  it("--check passes against the repo tree (checked-in pins are current)", () => {
    const run = runGenerator(["--check"]);
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("pins in sync");
  });

  it("write mode against a staged copy is idempotent and agrees with the checked-in pins", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const writeArgs = ["--write", "--packs-dir", packsDir, "--pins", pinsPath];

    const first = runGenerator(writeArgs);
    expect(first.status, first.output).toBe(0);
    const snapshot = async (): Promise<string[]> =>
      Promise.all([
        readFile(pinsPath, "utf8"),
        ...FIRST_PARTY_IDS.map((id) => readFile(join(packsDir, id, PACK_MANIFEST_FILE), "utf8")),
      ]);
    const afterFirst = await snapshot();

    const second = runGenerator(writeArgs);
    expect(second.status, second.output).toBe(0);
    expect(await snapshot()).toEqual(afterFirst);

    // An untampered staged copy regenerates to the same aggregates the repo pins carry.
    const pinsModule = afterFirst[0] ?? "";
    for (const id of FIRST_PARTY_IDS) {
      expect(pinsModule).toContain(`"${id}": "${pinOf(id)}"`);
    }
  });

  it("--write sets each version to package.json's and keeps every other field in its order", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const manifestPath = join(packsDir, STAGED_PACK, PACK_MANIFEST_FILE);
    const source = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    await writeFile(manifestPath, `${JSON.stringify({ ...source, version: "0.0.9" }, null, 2)}\n`, "utf8");

    const run = runGenerator(["--write", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(run.status, run.output).toBe(0);
    const written = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    expect(written["version"]).toBe(PACKAGE_VERSION);
    expect(Object.keys(written)).toEqual(Object.keys(source));
    for (const key of Object.keys(source).filter((field) => field !== "version")) {
      expect(JSON.stringify(written[key]), key).toBe(JSON.stringify(source[key]));
    }
    // No pin moves: the version is outside the integrity map the pin covers.
    expect(await readFile(pinsPath, "utf8")).toContain(`"${STAGED_PACK}": "${pinOf(STAGED_PACK)}"`);
  });

  it("a tampered staged pack fails --check with an integrity refusal naming the pack", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const seeded = runGenerator(["--packs-dir", packsDir, "--pins", pinsPath]);
    expect(seeded.status, seeded.output).toBe(0);

    await tamperFile(join(packsDir, STAGED_PACK, ...STAGED_FILE));
    const run = runGenerator(["--check", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(run.status).toBe(1);
    expect(run.output).toContain(STAGED_PACK);
    expect(run.output).toMatch(/integrity/i);
  });

  it("a hand-edited pins module fails --check naming the pack and the regeneration command", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const seeded = runGenerator(["--packs-dir", packsDir, "--pins", pinsPath]);
    expect(seeded.status, seeded.output).toBe(0);

    const pins = await readFile(pinsPath, "utf8");
    await writeFile(pinsPath, pins.replace(pinOf(STAGED_PACK), "0".repeat(64)), "utf8");

    const run = runGenerator(["--check", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(run.status).toBe(1);
    expect(run.output).toContain(`"${STAGED_PACK}"`);
    expect(run.output).toContain("generate-pack-manifests");
  });

  it("--packs-dir without an explicit --pins is a usage error (staged runs cannot touch repo pins)", () => {
    const run = runGenerator(["--packs-dir", "somewhere"]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("--pins");
  });
});
