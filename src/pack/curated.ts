import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "../shared/paths.ts";
import { EngineError } from "../types/errors.ts";
import { CATALOG_PINS } from "./catalogPins.ts";
import type { CatalogPin } from "./trust.ts";

/**
 * The curated launch catalog: a lean, checked-in list of packs the
 * `add` path can resolve by bare id. Every entry is pinned — its aggregate
 * content SHA lives in the generated `./catalogPins.ts` — so a catalog install
 * is pinned-or-refuse from the first byte: content that hashes to anything
 * else is refused, never downgraded. The catalog IS the launch trust surface;
 * a review-based marketplace is deliberately deferred, and the `scanned` tier
 * a pin may grant is the scanning hook that extends this list before one
 * exists.
 *
 * The list is format-verified at module load ({@link validateCatalogFormat}):
 * a malformed seed, a hand-edited pin, or a pins/seed mismatch throws on
 * import instead of resolving installs against a catalog that lies.
 */

/** Where a catalog entry's bytes come from. `npm` is the format-verified
 *  forward slot for entries whose packs the operator installs via their own
 *  package manager; no seed entry uses it yet. */
type CatalogSource = { kind: "bundled" } | { kind: "npm"; package: string };

export interface CatalogEntry {
  id: string;
  description: string;
  source: CatalogSource;
  /** The immutable aggregate content SHA this entry names, and the tier the catalog grants it. */
  pin: CatalogPin;
  /** True when no curator reviewed the content; `add` prints {@link CatalogEntry.disclaimer} verbatim. */
  notAudited: boolean;
  /** One-sentence audit-status statement; the blunt caution for not-audited entries. */
  disclaimer: string;
}

/** npm-style id: optional `@scope/`, lower-case, no path characters. */
const CATALOG_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** A bundled id doubles as a directory name under `packs/`: one safe segment. */
const BUNDLED_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** The rungs only a catalog entry can grant (`./trust.ts` tier resolution):
 *  `publisher-signed` is signature-backed and `pinned-unsigned` is the
 *  pinless floor, so a pin claiming either would be inert. */
const CATALOG_GRANTABLE_TIERS: ReadonlySet<string> = new Set(["scanned", "curator-verified"]);

/**
 * Format-verify a catalog against its pins. Returns the entries frozen;
 * throws `CONFIG_ERROR` listing every defect — a broken catalog is broken
 * engine data (regenerate the pins or fix the seed), not operator input.
 *
 * Exported for tests; production code consumes the already-validated
 * {@link CURATED_PACKS}.
 */
export function validateCatalogFormat(
  entries: readonly CatalogEntry[],
  pins: Readonly<Record<string, string>>,
): readonly CatalogEntry[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const label = `entry ${JSON.stringify(entry.id)}`;
    if (!CATALOG_ID_PATTERN.test(entry.id)) {
      problems.push(`${label}: id must be a lower-case package name (optionally @scope/name)`);
    }
    if (seen.has(entry.id)) problems.push(`duplicate catalog id ${JSON.stringify(entry.id)}`);
    seen.add(entry.id);

    if (entry.description.trim() === "") problems.push(`${label}: description must not be empty`);
    if (entry.disclaimer.trim() === "") {
      problems.push(`${label}: disclaimer must state the entry's audit status`);
    }
    if (!CATALOG_GRANTABLE_TIERS.has(entry.pin.tier)) {
      problems.push(
        `${label}: pin tier "${entry.pin.tier}" is not catalog-grantable ` +
          `(${[...CATALOG_GRANTABLE_TIERS].join(", ")})`,
      );
    }
    if (!SHA256_HEX_PATTERN.test(entry.pin.sha256)) {
      problems.push(
        `${label}: pin sha256 must be a 64-character lower-case hex digest — ` +
          `run node scripts/generate-pack-manifests.mjs`,
      );
    }

    if (entry.source.kind === "bundled") {
      if (!BUNDLED_ID_PATTERN.test(entry.id)) {
        problems.push(`${label}: a bundled id must be a plain directory name (no scope, no slash)`);
      }
      const pinned = pins[entry.id];
      if (pinned === undefined) {
        problems.push(
          `${label}: no pin in catalogPins.ts — run node scripts/generate-pack-manifests.mjs`,
        );
      } else if (pinned !== entry.pin.sha256) {
        problems.push(
          `${label}: pin ${entry.pin.sha256.slice(0, 12)}… disagrees with catalogPins.ts ` +
            `${pinned.slice(0, 12)}… — run node scripts/generate-pack-manifests.mjs`,
        );
      }
    } else if (!CATALOG_ID_PATTERN.test(entry.source.package)) {
      problems.push(`${label}: npm source package must be a lower-case package name`);
    }
  }

  for (const id of Object.keys(pins)) {
    if (!entries.some((entry) => entry.source.kind === "bundled" && entry.id === id)) {
      problems.push(`pin ${JSON.stringify(id)} has no catalog entry`);
    }
  }

  if (problems.length > 0) {
    throw new EngineError(
      `Curated catalog failed its format self-check:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
      { code: "CONFIG_ERROR" },
    );
  }
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

const FIRST_PARTY_DISCLAIMER =
  "First-party pack: authored, reviewed and pinned in this package at tier curator-verified.";

function firstParty(id: string, description: string): CatalogEntry {
  return {
    id,
    description,
    source: { kind: "bundled" },
    // A missing pin leaves an empty sha256 for the load-time self-check to
    // refuse with the generator named, rather than an undefined to crash on.
    pin: { sha256: CATALOG_PINS[id] ?? "", tier: "curator-verified" },
    notAudited: false,
    disclaimer: FIRST_PARTY_DISCLAIMER,
  };
}

/**
 * The launch seed: the three first-party packs, bundled with this package and
 * pinned at `curator-verified`. Descriptions mirror each pack's own manifest
 * identity line.
 */
export const CURATED_PACKS: readonly CatalogEntry[] = validateCatalogFormat(
  [
    firstParty(
      "ops",
      "Operate in production — cut releases fail-closed, run incidents to blameless post-mortems.",
    ),
    firstParty(
      "product-audit",
      "Point-in-time whole-product assessment — proposes an epic set and writes a report; assesses, never modifies.",
    ),
    firstParty(
      "scaffold",
      "Greenfield generators built to the repo's quality floor — the implementer writes, a specialist lens gates, and a failed gate buys exactly one regeneration.",
    ),
  ],
  CATALOG_PINS,
);

/**
 * Resolve a catalog entry by id — or, for npm-sourced entries, by the package
 * name the operator would install. `undefined` is the miss answer on purpose:
 * an unknown id falls through to the ordinary local-path / npm resolution in
 * the `add` path rather than erroring here.
 */
export function lookupCatalogEntry(idOrName: string): CatalogEntry | undefined {
  return (
    CURATED_PACKS.find((entry) => entry.id === idOrName) ??
    CURATED_PACKS.find(
      (entry) => entry.source.kind === "npm" && entry.source.package === idOrName,
    )
  );
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    // An unreadable candidate (EACCES) or a broken symlink is not a usable
    // pack root; treat it as absent rather than failing the probe.
    return false;
  }
}

/**
 * Locate a bundled pack's source directory inside the installed package. Same
 * two-layout probe as the content root (`../content/contentRoot.ts`), in the
 * same order:
 *
 *   1. `<packageRoot>/packs/<id>` — a source checkout, no build step needed.
 *   2. `<packageRoot>/dist/packs/<id>` — what a built package would stage.
 *
 * Source-checkout first is deliberate: when both exist, an edited pack is what
 * should install — and then fail its pin, which is the honest outcome for
 * edited first-party bytes. Throws `CONFIG_ERROR` naming both probed layouts
 * when neither exists (a broken install), and `VALIDATION_ERROR` for an id
 * that is not a plain directory name.
 */
export function resolveBundledPackRoot(id: string): string {
  if (!BUNDLED_ID_PATTERN.test(id)) {
    throw new EngineError(
      `Invalid bundled pack id ${JSON.stringify(id)}: expected a plain lower-case directory name.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const probed = [join(packageRoot, "packs", id), join(packageRoot, "dist", "packs", id)];
  const found = probed.find(isDirectory);
  if (found === undefined) {
    throw new EngineError(
      `Bundled pack "${id}" not found under ${packageRoot}. Probed ${probed.join(" and ")}. ` +
        `Reinstall the package, or run the build in a source checkout to stage packs under dist/packs/.`,
      { code: "CONFIG_ERROR" },
    );
  }
  return found;
}
