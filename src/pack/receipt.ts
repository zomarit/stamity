import { grantableFootprint } from "../roster/agentGrants.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import { PACK_SOURCE_KINDS, type PackContentClass, type PackSourceKind } from "./manifest.ts";
import type { EvaluatedSourceKind } from "./orgPolicy.ts";
import type { TrustTier } from "./trust.ts";

/**
 * Install receipt: the engine-generated record `applyPackInstall` writes into
 * the installed pack's own directory (`.stamity/packs/<pack>/receipt.json`).
 *
 * The receipt answers, from the repo alone, what an install log would have:
 * where the pack came from, which trust tier it resolved to and on what basis,
 * which gates ran, what the org policy decided, and the exact file inventory
 * with verified hashes and context cost. It is provenance the operator can
 * read after the fact and the surface `stamity add` prints its closing lines
 * from.
 *
 * Two properties keep it honest:
 *
 * - **Engine-generated, never pack-supplied.** The receipt is written by the
 *   engine after the gates passed, so it is deliberately NOT in the pack's
 *   integrity map — a pack shipping its own `receipt.json` would be claiming
 *   a verification it never went through (the file would land under a content
 *   class and fail enumeration anyway; the receipt sits at the pack root).
 * - **Ledger-owned like any other installed byte.** The apply half records a
 *   ledger row for it (owner `pack:<id>`, hash of the receipt bytes), so
 *   `clean --pack` reclaims the receipt through the same sweep as the content
 *   it describes, and an operator-edited receipt is kept as salvage rather
 *   than deleted.
 *
 * This module is the pack-install leaf: pure builders plus the install-location
 * identity, importing nothing from `./install.ts` — not even a type — so both
 * the installer and the CLI surfaces can reach it without an import cycle
 * (`./install.ts` imports this file, never the reverse). {@link buildReceipt}
 * therefore states its own input shape ({@link PackReceiptInput}) rather than
 * naming the installer's plan type.
 */

/** Receipt filename at the installed pack's root. */
export const RECEIPT_FILE = "receipt.json";

/** Directory under the state dir that holds installed pack content. */
const PACKS_DIR = "packs";

/**
 * Accepted pack id: an npm package name, optionally scoped, lower-case, with
 * no path metacharacters — the same shape `pack.json` validates `name` against.
 * Re-stated here rather than shared because this gate answers a different
 * question: whether the id maps to exactly one safe directory segment.
 */
const PACK_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Refuse an id that is not a plain package name, before it reaches a path. */
function assertPackId(packId: string): void {
  if (PACK_ID_PATTERN.test(packId)) return;
  throw new EngineError(
    `Invalid pack id ${JSON.stringify(packId)}. A pack id is a lower-case package name ` +
      `(optionally @scope/name) with no path separators, so it maps to exactly one directory ` +
      `under ${STATE_DIR}/${PACKS_DIR}/.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * The repo-relative POSIX directory a pack installs into. A scoped id flattens
 * to one segment (`@acme/ops` -> `acme__ops`) so the packs directory stays one
 * level deep; an id that is not a plain package name is refused rather than
 * sanitized. Single source of the mapping — `./install.ts::packLedgerRelPath`
 * is a re-export-shaped delegation to this function.
 */
export function packDirRelPath(packId: string): string {
  assertPackId(packId);
  return `${STATE_DIR}/${PACKS_DIR}/${packId.replace("@", "").replace("/", "__")}`;
}

/** Repo-relative path of the receipt an install of `packId` writes. */
export function receiptRelPath(packId: string): string {
  return `${packDirRelPath(packId)}/${RECEIPT_FILE}`;
}

// ── Judged source kind ─────────────────────────────────────────

/** The tiers only a verified catalog pin grants (`./trust.ts`). */
export const CATALOG_TIERS: ReadonlySet<string> = new Set(["curator-verified", "scanned"]);

/**
 * The kind the org policy judges an install as: the one definition `add`, the
 * receipt and projection all reach.
 *
 * A catalog install resolves to a directory inside the engine package, so the
 * resolver honestly reports `local-path` — and that conflated the SHA-pinned
 * curated catalog with any directory on the machine. The pin is what
 * distinguishes them, and the pin is verified one layer up, so the promotion
 * happens here.
 *
 * The trigger is the resolved TIER, not the presence of a pin argument, because
 * only a verified catalog pin can produce a catalog-granted rung: `./trust.ts`
 * refuses a pin whose aggregate content SHA disagrees, and the two rungs below
 * (`publisher-signed`, `pinned-unsigned`) are not catalog-issued. So the
 * promotion happens exactly when a catalog vouched for these exact bytes, and
 * never on a claim.
 */
export function judgedSourceKind(kind: PackSourceKind, tier: string): PackSourceKind {
  return CATALOG_TIERS.has(tier) ? "catalog-pinned" : kind;
}

/**
 * The judged kind a receipt stands for, in either form a release has written:
 * the judged kind itself, or (before 1.18.0) the resolved kind beside a catalog
 * tier. No receipt is rewritten to migrate it: its bytes are what its ledger
 * row hashes.
 *
 * Call it only on a receipt whose bytes matched their ledger row
 * (`./projection.ts::readVerifiedReceipt`), because the tier it reads is
 * otherwise a claim. For the same reason a recorded catalog kind beside any
 * other tier is `"unknown"`, not the catalog kind, and so is a kind no release
 * records.
 */
export function recordedSourceKind(receipt: unknown): EvaluatedSourceKind {
  if (typeof receipt !== "object" || receipt === null) return "unknown";
  const { source, trustTier } = receipt as { source?: unknown; trustTier?: unknown };
  const kind =
    typeof source === "object" && source !== null ? (source as { kind?: unknown }).kind : undefined;
  if (!(PACK_SOURCE_KINDS as readonly unknown[]).includes(kind)) return "unknown";
  const tier = typeof trustTier === "string" ? trustTier : "";
  const judged = judgedSourceKind(kind as PackSourceKind, tier);
  return judged === "catalog-pinned" && !CATALOG_TIERS.has(tier) ? "unknown" : judged;
}

// ── Receipt shape ──────────────────────────────────────────────

/** One installed file: where it landed, what it is, and what it costs. */
export interface PackReceiptFile {
  /** Repo-relative installed path (the write set's target path). */
  path: string;
  class: PackContentClass;
  /** SHA-256 of the installed bytes, from the verified integrity map. */
  sha256: string;
  bytes: number;
  /** Estimated context tokens (`../guard/tokenEstimate.ts` heuristic). */
  tokens: number;
}

/** The persisted receipt document. */
export interface PackReceipt {
  packId: string;
  /** The pack's own version, from its validated `pack.json`. */
  version: string;
  /**
   * Where the pack came from: the source kind the org policy judged
   * ({@link judgedSourceKind}) + the operator's spec. A receipt written before
   * 1.18.0 holds the resolved kind instead, so a reader goes through
   * {@link recordedSourceKind} and never compares this field directly.
   */
  source: { kind: PackSourceKind; spec: string };
  trustTier: TrustTier;
  /**
   * Human-readable basis for the tier, copied from the plan
   * (`./install.ts` → {@link PackInstallPlan.tierBasis}). For a verified
   * publisher-signed pack it names WHO signed and which issuer vouched for
   * them, so the receipt is a provenance record of the identity the install
   * actually rested on rather than of a claim that was still open.
   */
  tierBasis: string;
  /** Gate name -> outcome, exactly as the plan ran them. */
  checks: Record<string, "pass" | "n/a">;
  /** Org trust-policy outcome; always `allow` in a receipt (a deny never installs). */
  policy: { decision: "allow" | "deny"; matchedRule?: string };
  /**
   * The pack's disclosed tool footprint, narrowed to the categories a grant
   * can actually name — the install-time ceiling every later grant resolution
   * is bounded by.
   *
   * It is recorded HERE because `pack.json` is not part of the install write
   * set: the enumerated content classes plus this receipt are the only bytes
   * that land, so without this field the footprint the operator accepted is
   * unreadable after the install and every pack agent resolves to the
   * deny-by-default empty grant — an install that is inert on arrival, which
   * is the failure the live-emission invariant exists to rule out.
   * Absent (a receipt written before this field existed, or a pack that
   * disclosed nothing) reads as "declares none", so the fallback stays
   * deny-by-default rather than unbounded.
   */
  permissions?: { toolFootprint: string[] };
  /** Installed file inventory, 1:1 with the write set in write order. */
  files: PackReceiptFile[];
  contextCost: { totalTokens: number };
  engineVersion: string;
  /** ISO-8601 install timestamp. */
  installedAt: string;
}

/**
 * Exactly what {@link buildReceipt} reads off an install plan — the leaf's half
 * of the contract with `./install.ts`, stated here so the dependency runs one
 * way only. `PackInstallPlan` satisfies it structurally, so the installer keeps
 * passing its plan unchanged; a field renamed or dropped up there still fails
 * compilation, at the call site instead of at this import.
 */
interface PackReceiptInput {
  /** The pack's own validated `pack.json`. */
  manifest: {
    name: string;
    version: string;
    /** The disclosed footprint, as validated; narrowed on the way into the receipt. */
    permissions?: { toolFootprint?: readonly string[] };
  };
  /** The kind the org policy judged this install as ({@link judgedSourceKind}). */
  judgedKind: PackSourceKind;
  /** The operator's original source spec. */
  spec: string;
  writeSet: readonly {
    targetPath: string;
    contentClass: PackContentClass;
    contentHash: string;
    sizeBytes: number;
  }[];
  checks: Record<string, "pass" | "n/a">;
  trustTier: TrustTier;
  tierBasis: string;
  policy: { decision: "allow" | "deny"; matchedRule?: string };
  tokensByPath: Record<string, number>;
  totalTokens: number;
}

/**
 * Build the receipt for a plan that is about to be applied. Pure over the plan
 * plus the two inputs the plan cannot carry — the clock and the engine version
 * — so a fixed clock makes re-installs byte-reproducible.
 */
export function buildReceipt(
  plan: PackReceiptInput,
  clockNow: Date,
  engineVersion: string,
): PackReceipt {
  const toolFootprint = grantableFootprint(plan.manifest.permissions?.toolFootprint);
  return {
    packId: plan.manifest.name,
    version: plan.manifest.version,
    source: { kind: plan.judgedKind, spec: plan.spec },
    trustTier: plan.trustTier,
    tierBasis: plan.tierBasis,
    checks: { ...plan.checks },
    policy: {
      decision: plan.policy.decision,
      ...(plan.policy.matchedRule === undefined ? {} : { matchedRule: plan.policy.matchedRule }),
    },
    // Key absent, never present-and-empty, when the pack disclosed nothing a
    // grant can name: a receipt written before this field existed and a pack
    // that declares no footprint must read the same way — as no ceiling at all.
    ...(toolFootprint.length === 0 ? {} : { permissions: { toolFootprint } }),
    files: plan.writeSet.map((entry) => ({
      path: entry.targetPath,
      class: entry.contentClass,
      sha256: entry.contentHash,
      bytes: entry.sizeBytes,
      // The plan keys token estimates by target path; a missing key reads as 0
      // rather than throwing, since the receipt records, never gates.
      tokens: plan.tokensByPath[entry.targetPath] ?? 0,
    })),
    contextCost: { totalTokens: plan.totalTokens },
    engineVersion,
    installedAt: clockNow.toISOString(),
  };
}

/**
 * The exact bytes a receipt persists as. One definition, so the ledger row's
 * `contentHash` and the file on disk can never disagree: the installer hashes
 * this string and writes this string.
 */
export function serializeReceipt(receipt: PackReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}
