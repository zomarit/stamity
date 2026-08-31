import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATALOG_PINS } from "../../src/pack/catalogPins.ts";
import {
  CURATED_PACKS,
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

const FIRST_PARTY_IDS = ["ops", "product-audit", "scaffold"] as const;

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
  it("every curated pack's per-file digests match disk and its aggregate matches CATALOG_PINS", async () => {
    await Promise.all(
      CURATED_PACKS.map(async (entry) => {
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

  it("CATALOG_PINS covers exactly the bundled catalog ids", () => {
    const bundled = CURATED_PACKS.filter((entry) => entry.source.kind === "bundled")
      .map((entry) => entry.id)
      .toSorted();
    expect(Object.keys(CATALOG_PINS).toSorted()).toEqual(bundled);
    expect(bundled).toEqual([...FIRST_PARTY_IDS]);
  });

  it("aggregate recompute over a tampered staged pack differs from its pin", async () => {
    const { packsDir } = await stagePacks(getTemp());
    const root = join(packsDir, "ops");
    await tamperFile(join(root, "commands", "st-release.md"));

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
    expect(computeAggregateContentSha(manifest.integrity)).toBe(pinOf("ops"));
    expect(computeAggregateContentSha(recomputed)).not.toBe(pinOf("ops"));
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

  it("the validated catalog is frozen", () => {
    expect(Object.isFrozen(CURATED_PACKS)).toBe(true);
    for (const entry of CURATED_PACKS) expect(Object.isFrozen(entry)).toBe(true);
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
});

// ── Format self-check ──────────────────────────────────────────

const SHA_A = "a".repeat(64);

function bundledEntry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id,
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
    const entry: CatalogEntry = {
      id: "@acme/audit",
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

  it("a tampered staged pack fails --check with an integrity refusal naming the pack", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const seeded = runGenerator(["--packs-dir", packsDir, "--pins", pinsPath]);
    expect(seeded.status, seeded.output).toBe(0);

    await tamperFile(join(packsDir, "ops", "commands", "st-release.md"));
    const run = runGenerator(["--check", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("ops");
    expect(run.output).toMatch(/integrity/i);
  });

  it("a hand-edited pins module fails --check naming the pack and the regeneration command", async () => {
    const { packsDir, pinsPath } = await stagePacks(getTemp());
    const seeded = runGenerator(["--packs-dir", packsDir, "--pins", pinsPath]);
    expect(seeded.status, seeded.output).toBe(0);

    const pins = await readFile(pinsPath, "utf8");
    await writeFile(pinsPath, pins.replace(pinOf("ops"), "0".repeat(64)), "utf8");

    const run = runGenerator(["--check", "--packs-dir", packsDir, "--pins", pinsPath]);
    expect(run.status).toBe(1);
    expect(run.output).toContain('"ops"');
    expect(run.output).toContain("generate-pack-manifests");
  });

  it("--packs-dir without an explicit --pins is a usage error (staged runs cannot touch repo pins)", () => {
    const run = runGenerator(["--packs-dir", "somewhere"]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("--pins");
  });
});
