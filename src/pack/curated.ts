import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStrict } from "../config/parse.ts";
import { findPackageRoot } from "../shared/paths.ts";
import { EngineError } from "../types/errors.ts";
import { CATALOG_PINS } from "./catalogPins.ts";
import { PACK_MANIFEST_FILE, validatePackManifest, type PackManifest } from "./manifest.ts";
import { computeAggregateContentSha, type CatalogPin } from "./trust.ts";

/**
 * The curated launch catalog: the packs the `add` path can resolve by bare id.
 * Every entry is pinned — its aggregate content SHA lives in the generated
 * `./catalogPins.ts` — so a catalog install is pinned-or-refuse from the first
 * byte: content that hashes to anything else is refused, never downgraded. The
 * catalog IS the launch trust surface; a review-based marketplace is
 * deliberately deferred, and the `scanned` tier a pin may grant is the scanning
 * hook that extends this list before one exists.
 *
 * The list is DERIVED from the bundled packs folder ({@link deriveCatalog}):
 * every `packs/<id>/` holding a `pack.json` named `<id>`, with a description
 * and a pin that equals its integrity map's aggregate, is an entry. A fork adds
 * a pack by adding the folder and regenerating the pins — no code edit. The
 * read happens on first use ({@link curatedPacks}), never at import, and a
 * folder that breaks any of those rules fails that read with every defect
 * listed, instead of resolving installs against a catalog that lies.
 */

/** Where a catalog entry's bytes come from. `npm` is the format-verified
 *  forward slot for entries whose packs the operator installs via their own
 *  package manager; no derived entry uses it yet. */
type CatalogSource = { kind: "bundled" } | { kind: "npm"; package: string };

export interface CatalogEntry {
  id: string;
  /** The pack's manifest `version`; for a bundled pack, the release that shipped it. */
  version: string;
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

/** The generator every pin defect points at. */
const REGENERATE_PINS = "run node scripts/generate-pack-manifests.mjs";

/** The rungs only a catalog entry can grant (`./trust.ts` tier resolution):
 *  `publisher-signed` is signature-backed and `pinned-unsigned` is the
 *  pinless floor, so a pin claiming either would be inert. */
const CATALOG_GRANTABLE_TIERS: ReadonlySet<string> = new Set(["scanned", "curator-verified"]);

/**
 * Format-verify a catalog against its pins. Returns the entries frozen;
 * throws `CONFIG_ERROR` listing every defect — a broken catalog is broken
 * engine data (regenerate the pins or fix the pack), not operator input.
 *
 * Exported for tests; production code consumes {@link curatedPacks}, whose
 * derivation ends in this check.
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
        `${label}: pin sha256 must be a 64-character lower-case hex digest — ${REGENERATE_PINS}`,
      );
    }

    if (entry.source.kind === "bundled") {
      if (!BUNDLED_ID_PATTERN.test(entry.id)) {
        problems.push(`${label}: a bundled id must be a plain directory name (no scope, no slash)`);
      }
      const pinned = pins[entry.id];
      if (pinned === undefined) {
        problems.push(`${label}: no pin in catalogPins.ts — ${REGENERATE_PINS}`);
      } else if (pinned !== entry.pin.sha256) {
        problems.push(
          `${label}: pin ${entry.pin.sha256.slice(0, 12)}… disagrees with catalogPins.ts ` +
            `${pinned.slice(0, 12)}… — ${REGENERATE_PINS}`,
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

  if (problems.length > 0) throw catalogError(problems);
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

function catalogError(problems: readonly string[]): EngineError {
  return new EngineError(
    `Curated catalog failed its format self-check:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    { code: "CONFIG_ERROR" },
  );
}

const FIRST_PARTY_DISCLAIMER =
  "First-party pack: authored, reviewed and pinned in this package at tier curator-verified.";

function isDirectory(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    // An unreadable candidate (EACCES) or a broken symlink is not a usable
    // pack root; treat it as absent rather than failing the probe.
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
  } catch {
    return false;
  }
}

/** `<packageRoot>/packs` then `<packageRoot>/dist/packs`, in probe order. */
function packsRootCandidates(): readonly [string, string] {
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  return [join(packageRoot, "packs"), join(packageRoot, "dist", "packs")];
}

/**
 * Locate the bundled packs folder inside the installed package. Same
 * two-layout probe as the content root (`../content/contentRoot.ts`), in the
 * same order:
 *
 *   1. `<packageRoot>/packs` — a source checkout, no build step needed.
 *   2. `<packageRoot>/dist/packs` — what a built package stages.
 *
 * Source-checkout first is deliberate: when both exist, an edited pack is what
 * should install — and then fail its pin, which is the honest outcome for
 * edited first-party bytes — and a stale `dist/packs/<id>` left by an older
 * build is never consulted. `null` when neither exists: a package with no
 * bundled packs has an empty catalog, not a broken one.
 */
export function bundledPacksRoot(): string | null {
  return packsRootCandidates().find(isDirectory) ?? null;
}

/**
 * The pack ids under `packsRoot`: every directory holding a `pack.json`,
 * sorted. A plain file beside them (a README) is not a pack and is ignored; a
 * directory with no `pack.json` refuses with `CONFIG_ERROR` naming the path it
 * expected, since a folder in the packs root that is not a pack is a defect
 * every reader of the root would otherwise disagree about. A symbolic link
 * refuses the same way, naming it: its `Dirent` is not a directory, so it would
 * otherwise drop out of the catalog with nothing said while
 * {@link resolveBundledPackRoot} followed it.
 */
export function listBundledPackIds(packsRoot: string): string[] {
  let entries;
  try {
    entries = readdirSync(packsRoot, { withFileTypes: true });
  } catch (cause) {
    throw new EngineError(`Cannot read the packs directory ${packsRoot}.`, {
      code: "CONFIG_ERROR",
      cause,
    });
  }
  const links = entries
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => join(packsRoot, entry.name))
    .toSorted();
  if (links.length > 0) {
    throw new EngineError(
      `The packs folder reads real directories only, and ${String(links.length)} ` +
        `${links.length === 1 ? "entry is a symbolic link" : "entries are symbolic links"}: ` +
        `${links.join(", ")}. Replace the link with the pack folder itself or move it out of ${packsRoot}.`,
      { code: "CONFIG_ERROR" },
    );
  }
  const ids = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  const missing = ids
    .map((id) => join(packsRoot, id, PACK_MANIFEST_FILE))
    .filter((manifestPath) => !isFile(manifestPath));
  if (missing.length > 0) {
    throw new EngineError(
      `Every directory in the packs folder is a pack, and ${String(missing.length)} hold no ` +
        `${PACK_MANIFEST_FILE}: expected ${missing.join(", ")}. Add the manifest or move the ` +
        `directory out of ${packsRoot}.`,
      { code: "CONFIG_ERROR" },
    );
  }
  return ids;
}

/** One pack folder's manifest, or the reason it could not be read. */
function readBundledManifest(manifestPath: string): PackManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (cause) {
    throw new EngineError(`Cannot read ${manifestPath}.`, { code: "CONFIG_ERROR", cause });
  }
  return validatePackManifest(parseJsonStrict(raw, manifestPath));
}

/**
 * Derive the catalog from a packs folder and the generated pins. Every pack
 * directory becomes a first-party bundled entry at `curator-verified`; the
 * rules a folder must meet, each defect listed in ONE `CONFIG_ERROR`:
 *
 * - its `pack.json` reads and validates, and its `name` equals the directory
 *   (the pins are keyed by the directory id);
 * - it declares a non-blank `description`;
 * - `pins` holds an entry for it, and that entry equals
 *   `computeAggregateContentSha` of its integrity map — a pack whose map was
 *   widened or edited after the pins were generated is refused here, before
 *   any install trusts it;
 * - no pin names a directory that is not there.
 *
 * Reads the folder synchronously and nothing else: the root and the pins are
 * parameters, so a test derives a catalog from a made-up folder. A `null` root
 * yields an empty catalog.
 */
export function deriveCatalog(
  packsRoot: string | null,
  pins: Readonly<Record<string, string>>,
): readonly CatalogEntry[] {
  if (packsRoot === null) return Object.freeze([]);
  const ids = listBundledPackIds(packsRoot);
  const problems: string[] = [];
  const entries: CatalogEntry[] = [];

  for (const id of ids) {
    const label = `packs/${id}`;
    if (!BUNDLED_ID_PATTERN.test(id)) {
      problems.push(`${label}: a pack directory name must be a plain lower-case id`);
      continue;
    }
    let manifest: PackManifest;
    try {
      manifest = readBundledManifest(join(packsRoot, id, PACK_MANIFEST_FILE));
    } catch (error) {
      problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const before = problems.length;
    if (manifest.name !== id) {
      problems.push(
        `${label}: ${PACK_MANIFEST_FILE} \`name\` ${JSON.stringify(manifest.name)} must equal ` +
          `the directory name — catalog pins are keyed by the directory id`,
      );
    }
    const description = manifest.description?.trim() ?? "";
    if (description === "") {
      problems.push(`${label}: ${PACK_MANIFEST_FILE} declares no \`description\``);
    }
    const pinned = pins[id];
    const aggregate = computeAggregateContentSha(manifest.integrity);
    if (pinned === undefined) {
      problems.push(`${label}: no pin in catalogPins.ts — ${REGENERATE_PINS}`);
    } else if (pinned !== aggregate) {
      problems.push(
        `${label}: pin ${pinned.slice(0, 12)}… is stale — the integrity map aggregates to ` +
          `${aggregate.slice(0, 12)}… — ${REGENERATE_PINS}`,
      );
    }
    if (problems.length > before || pinned === undefined) continue;
    entries.push({
      id,
      version: manifest.version,
      description,
      source: { kind: "bundled" },
      pin: { sha256: pinned, tier: "curator-verified" },
      notAudited: false,
      disclaimer: FIRST_PARTY_DISCLAIMER,
    });
  }

  for (const id of Object.keys(pins)) {
    if (!ids.includes(id)) {
      problems.push(`pin ${JSON.stringify(id)} names no directory under ${packsRoot}`);
    }
  }

  if (problems.length > 0) throw catalogError(problems);
  return validateCatalogFormat(entries, pins);
}

/** The packs root the catalog read, memoized so the catalog and the resolver never disagree. */
let rootMemo: { readonly value: string | null } | undefined;

function bundledRootOnce(): string | null {
  rootMemo ??= { value: bundledPacksRoot() };
  return rootMemo.value;
}

let catalog: readonly CatalogEntry[] | null = null;

/**
 * The bundled catalog: {@link deriveCatalog} over {@link bundledPacksRoot} and
 * the generated pins, read on first use and memoized for the process. Throws
 * the derivation's `CONFIG_ERROR` on a broken packs folder, every time it is
 * asked — a catalog that failed its check never half-resolves.
 */
export function curatedPacks(): readonly CatalogEntry[] {
  catalog ??= deriveCatalog(bundledRootOnce(), CATALOG_PINS);
  return catalog;
}

/**
 * Resolve a catalog entry by id — or, for npm-sourced entries, by the package
 * name the operator would install. `undefined` is the miss answer on purpose:
 * an unknown id falls through to the ordinary local-path / npm resolution in
 * the `add` path rather than erroring here.
 */
export function lookupCatalogEntry(idOrName: string): CatalogEntry | undefined {
  const entries = curatedPacks();
  return (
    entries.find((entry) => entry.id === idOrName) ??
    entries.find((entry) => entry.source.kind === "npm" && entry.source.package === idOrName)
  );
}

/**
 * Locate a bundled pack's source directory: `<root>/<id>` under the one root
 * {@link curatedPacks} reads ({@link bundledPacksRoot}). The other layout is
 * never probed per id, so a stale `dist/packs/<id>` in a source checkout can
 * not resolve. Throws `CONFIG_ERROR` naming both layouts when the pack is not
 * there (a broken install), and `VALIDATION_ERROR` for an id that is not a
 * plain directory name.
 */
export function resolveBundledPackRoot(id: string): string {
  if (!BUNDLED_ID_PATTERN.test(id)) {
    throw new EngineError(
      `Invalid bundled pack id ${JSON.stringify(id)}: expected a plain lower-case directory name.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  const root = bundledRootOnce();
  if (root !== null && isDirectory(join(root, id))) return join(root, id);
  const [source, built] = packsRootCandidates().map((candidate) => join(candidate, id)) as [
    string,
    string,
  ];
  const probed =
    root === null
      ? `Neither ${source} nor ${built} exists: the package holds no packs folder.`
      : `Probed ${join(root, id)}; ${join(root, id) === source ? built : source} is not ` +
        `consulted while ${root} is the packs folder, so a stale copy never resolves.`;
  throw new EngineError(
    `Bundled pack "${id}" not found. ${probed} Reinstall the package, or run the build in a ` +
      `source checkout to stage packs under dist/packs/.`,
    { code: "CONFIG_ERROR" },
  );
}
