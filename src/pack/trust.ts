import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { EngineError } from "../types/errors.ts";
import { assertSafePackRelPath, type PackManifest, type PackSigning } from "./manifest.ts";

/**
 * Trust ladder: tier resolution and the method-specific verification seam.
 *
 * `manifest.ts` verifies what a pack IS — schema, per-file digests, deny-scan,
 * lifecycle ban. This module resolves what a pack's content is WORTH trusting:
 * which rung of the four-tier ladder the evidence actually supports, and
 * nothing higher. Two principles govern every path here:
 *
 *   - **Pinned-or-refuse.** A catalog pin names one immutable aggregate
 *     content SHA. Content that hashes to anything else is refused, never
 *     downgraded — a mismatch means the pack is not the thing that was pinned.
 *   - **Claims are not evidence.** A signing declaration raises the CLAIMED
 *     tier only; the claim holds only when its detached bundle verifies. This
 *     build ships no Sigstore verifier ({@link notYetArmedSigstoreVerifier}),
 *     so every publisher-signed claim is refused with the way out named,
 *     rather than waved through on declaration alone.
 *
 * Pure functions throughout; the one I/O surface is
 * {@link readSigstoreBundle}, which loads a declared bundle from disk.
 */

/**
 * The four trust tiers, ascending. Each rung names who did the work:
 *
 *   - `pinned-unsigned` — the floor. Only the manifest's own integrity map
 *     anchors the content; installing requires `--allow-untrusted`.
 *   - `scanned` — a catalog ran its checks over this exact content SHA.
 *   - `publisher-signed` — the author signed the aggregate content SHA with a
 *     detached Sigstore bundle, and the bundle verified.
 *   - `curator-verified` — a catalog curator reviewed this exact content SHA.
 */
export const TRUST_TIERS = [
  "pinned-unsigned",
  "scanned",
  "publisher-signed",
  "curator-verified",
] as const;

export type TrustTier = (typeof TRUST_TIERS)[number];

/** Rank of a tier on the ladder: 0 (floor) to 3 (curator-verified). */
export function trustTierRank(tier: TrustTier): number {
  return TRUST_TIERS.indexOf(tier);
}

/**
 * Signing methods the ladder can name. `sigstore` — detached Sigstore bundle
 * signed over the aggregate content SHA — is the one shipping method; the list
 * exists so a second method is an addition here, not a loosened check
 * somewhere else. A method outside this list never resolves as
 * publisher-signed.
 */
export const SIGNING_METHODS: readonly string[] = ["sigstore"];

/**
 * The signing declaration as the trust layer reads it: the manifest shape plus
 * the pack-relative path of the detached Sigstore bundle. The manifest schema
 * itself does not accept `bundlePath` yet — it joins `pack.json` when the
 * verifier is armed — so this type is the seam's forward declaration.
 */
export interface TrustSigning extends PackSigning {
  /** Pack-relative path to the detached Sigstore bundle JSON at the pack root. */
  bundlePath?: string;
}

/**
 * One catalog entry's pin: the immutable aggregate content SHA it was issued
 * for, and the tier the catalog grants that exact content.
 */
export interface CatalogPin {
  /** Aggregate content SHA-256 (hex) per {@link computeAggregateContentSha}. */
  sha256: string;
  tier: TrustTier;
}

export interface ResolvedTrust {
  tier: TrustTier;
  /** One sentence naming the evidence the tier rests on. */
  basis: string;
}

export interface SigstoreVerdict {
  verified: boolean;
  reason: string;
  /**
   * Set when the verifier could not EVALUATE the claim at all — no armed
   * implementation behind the seam — as opposed to evaluating it and finding
   * it false.
   *
   * The distinction is load-bearing, and conflating the two is what made a
   * pack that declares signing strictly worse off than one that declares
   * nothing: an unevaluable claim used to sink a pack whose catalog pin
   * already verified its exact content. A FAILED verification is never
   * waivable by anything ({@link verifyPublisherSignedClaim}); an UNEVALUABLE
   * one yields to an independent trust basis, and only to that.
   */
  unarmed?: boolean;
}

/**
 * Method-specific verification seam. `verify` judges one detached bundle
 * against the aggregate content SHA it must be signed over, optionally
 * requiring the declared signer identity. Implementations report a verdict;
 * translating a refusal into an install-stopping error is the caller's job
 * ({@link verifyPublisherSignedClaim}).
 */
export interface SigstoreVerifier {
  verify(bundleBytes: Uint8Array, aggregateSha: string, signer?: string): Promise<SigstoreVerdict>;
}

/**
 * The verifier this build ships: it cannot evaluate a publisher-signed claim,
 * because no Sigstore implementation is armed behind the seam, and an
 * unverifiable claim is never assumed true.
 *
 * It reports `unarmed`, so the caller can tell "this build could not check"
 * from "this build checked and the signature is wrong". The reason names the
 * one way forward that exists — a catalog-pinned source — and deliberately
 * does NOT name `--allow-untrusted`: that flag waives the ABSENCE of a trust
 * basis, so it has no effect on a declared claim and recommending it sent
 * operators to a flag that changes nothing.
 *
 * That correction asked for exactly one edit to this string — drop the flag
 * that does not apply. The opening clause is therefore kept verbatim from
 * before it: it is the phrase operators and downstream assertions match on, and
 * rewording it would have broken a consumer contract no finding asked to move.
 */
export const notYetArmedSigstoreVerifier: SigstoreVerifier = {
  verify: () =>
    Promise.resolve({
      verified: false,
      unarmed: true,
      reason:
        "this build cannot verify Sigstore bundles yet — no armed Sigstore verifier sits behind the seam — " +
        "so the publisher-signed claim is refused rather than assumed. " +
        "Install from a catalog-pinned source — a verified pin is an independent trust basis this gate honours.",
    }),
};

// ── Aggregate content SHA ──────────────────────────────────────

/**
 * Frame one field for the aggregate serialization: its UTF-8 byte length, a
 * colon, then the bytes. A reader consumes the decimal length, then exactly
 * that many bytes — so the field ends where its length says it ends, whatever
 * the field itself contains. This is what makes the serialization injective;
 * see {@link computeAggregateContentSha}.
 */
function frameField(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

/**
 * The pinned-or-refuse pin target: one SHA-256 naming the pack's entire
 * content set. Computed over the canonical serialization of the integrity map
 * — entries sorted by path, each contributing its path and lower-cased digest
 * — so the result depends only on what the map says, never on key insertion
 * order or digest casing. An empty map (a content-free pack) serializes to the
 * empty string and is just as pinnable.
 *
 * The serialization is **injective**: distinct maps hash to distinct values,
 * which is the property "pinned-or-refuse" rests on — a pin must name exactly
 * one content set. Injectivity comes from length-framing every field
 * ({@link frameField}), not from a delimiter. A delimiter-only form
 * (`<path>\n<digest>\n` per entry) is NOT injective, because a POSIX filename
 * may contain a newline and digests are fixed-width: the honest two-entry map
 *
 *     { "agents/x.md": D1, "agents/y.md": D2 }
 *
 * and the forged one-entry map
 *
 *     { "agents/x.md\nD1\nagents/y.md": D2 }
 *
 * serialize to the same bytes. A pack built to the second map ships one
 * oddly-named file, silently drops `agents/x.md`'s content, passes per-file
 * integrity verification against its own manifest, and inherits the catalog pin
 * issued for the first — a pin that no longer names a unique content set.
 * Length prefixes make entry boundaries unforgeable, so no key can absorb the
 * fields that follow it. The pack-path vocabulary additionally refuses control
 * characters in declared paths (`assertSafePackRelPath` in `./permissions.ts`),
 * which is defence in depth over this, not the load-bearing guard: this
 * function is safe for any map, including one that never passed manifest
 * ingress.
 */
export function computeAggregateContentSha(integrity: Record<string, string>): string {
  const entries = Object.entries(integrity).toSorted(([a], [b]) => (a < b ? -1 : 1));
  const hash = createHash("sha256");
  for (const [relPath, digest] of entries) {
    hash.update(frameField(relPath) + frameField(digest.toLowerCase()), "utf8");
  }
  return hash.digest("hex");
}

// ── Tier resolution ────────────────────────────────────────────

function assertKnownSigningMethod(method: string): void {
  if (!SIGNING_METHODS.includes(method)) {
    throw new EngineError(
      `Unknown signing method ${JSON.stringify(method)} (known: ${SIGNING_METHODS.join(", ")}). ` +
        `An unknown method never passes as publisher-signed; fix the pack's \`signing.method\` or drop the declaration.`,
      { code: "VALIDATION_ERROR" },
    );
  }
}

const shortSha = (sha: string): string => `${sha.slice(0, 12)}…`;

/**
 * Resolve the tier a pack's evidence supports.
 *
 * Order of authority:
 *
 *   1. A signing declaration with an unknown method is refused outright — an
 *      unrecognized claim must not fall through to a lower rung as if it were
 *      merely absent.
 *   2. A catalog pin is verified pinned-or-refuse: the aggregate content SHA
 *      must equal `pin.sha256` or the pack is refused with both digests named.
 *   3. A verified pin grants its tier when that tier is catalog-issued
 *      (`curator-verified`, `scanned`) — those rungs name catalog work, so
 *      only a catalog entry can grant them. A pin cannot grant
 *      `publisher-signed`: that rung is signature-backed, so it resolves from
 *      the manifest's own declaration and falls to the floor without one.
 *   4. A known signing declaration resolves the CLAIMED tier
 *      `publisher-signed`; the claim still stands or falls with bundle
 *      verification ({@link verifyPublisherSignedClaim}). With a pin also
 *      present, both must hold — the pin was already verified in step 2.
 *   5. No pin, no signing: `pinned-unsigned`, the floor.
 */
export function resolveTrustTier(manifest: PackManifest, pin?: CatalogPin): ResolvedTrust {
  const signing = manifest.signing;
  if (signing !== undefined) assertKnownSigningMethod(signing.method);

  const aggregateSha = computeAggregateContentSha(manifest.integrity);

  if (pin !== undefined) {
    if (aggregateSha !== pin.sha256.toLowerCase()) {
      throw new EngineError(
        `Pack "${manifest.name}" does not match its catalog pin: pinned aggregate content SHA ${pin.sha256}, ` +
          `computed ${aggregateSha}. Pinned-or-refuse — this content is not what the catalog entry names; ` +
          `re-obtain the pack or point at the catalog entry for this version.`,
        { code: "INTEGRITY_ERROR" },
      );
    }
    if (pin.tier === "curator-verified" || pin.tier === "scanned") {
      return {
        tier: pin.tier,
        basis:
          `catalog pin verified: aggregate content SHA ${shortSha(aggregateSha)} matches and the catalog grants "${pin.tier}"` +
          (signing === undefined
            ? ""
            : `; the declared "${signing.method}" signature claim must still verify against its bundle`),
      };
    }
  }

  if (signing !== undefined) {
    return {
      tier: "publisher-signed",
      basis:
        `signing.method "${signing.method}" claims publisher-signed over aggregate content SHA ${shortSha(aggregateSha)}; ` +
        `the claim holds only when the detached bundle verifies` +
        (pin === undefined ? "" : ` (catalog pin SHA verified; its "${pin.tier}" grant adds no higher rung)`),
    };
  }

  return {
    tier: "pinned-unsigned",
    basis:
      (pin === undefined
        ? "no catalog pin and no signing declaration"
        : `catalog pin SHA verified but grants "${pin.tier}", and no signing is declared`) +
      "; only the manifest integrity map anchors this content, so installing requires --allow-untrusted",
  };
}

// ── Sigstore bundle I/O + claim verification ───────────────────

/**
 * Read a declared detached Sigstore bundle from the pack. The path is held to
 * the same containment rules as every other pack-relative path, and a declared
 * bundle that is missing is an integrity refusal — the pack does not match its
 * own signing declaration — not a bare filesystem error.
 */
export async function readSigstoreBundle(packRoot: string, bundlePath: string): Promise<Buffer> {
  assertSafePackRelPath(bundlePath, "`signing.bundlePath`");
  const root = resolve(packRoot);
  const absPath = resolve(root, bundlePath);
  if (absPath !== root && !absPath.startsWith(root + sep)) {
    throw new EngineError(
      `Unsafe pack path in \`signing.bundlePath\`: ${JSON.stringify(bundlePath)} resolves outside ${root}.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  try {
    return await readFile(absPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new EngineError(
        `Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)} but the pack ships no such file. ` +
          `The pack does not match its signing declaration; re-obtain it from the author.`,
        { code: "INTEGRITY_ERROR", cause },
      );
    }
    const code = (cause as NodeJS.ErrnoException).code;
    throw new EngineError(
      `Cannot read Sigstore bundle ${absPath}: ${code ?? (cause instanceof Error ? cause.message : String(cause))}.`,
      { code: "FS_ERROR", cause },
    );
  }
}

/** Tiers only a catalog entry can grant — the rungs that name catalog work. */
const CATALOG_GRANTED_TIERS: ReadonlySet<TrustTier> = new Set<TrustTier>([
  "scanned",
  "curator-verified",
]);

/**
 * Verify a manifest's publisher-signed claim through the seam. No signing
 * declaration means no claim — `"n/a"`, nothing waived. A claim is judged
 * fail-closed at every step: unknown method, missing `bundlePath`, missing
 * bundle file, and a verifier that CHECKED and refused each stop the install;
 * only an armed verifier returning `verified: true` passes.
 *
 * `opts.catalogPinTier` is the one thing that can stand in for a claim this
 * build cannot evaluate, and it stands in for nothing else. When the
 * verdict is {@link SigstoreVerdict.unarmed} — no implementation behind the
 * seam, so the claim was never judged — and a catalog pin already verified
 * this pack's exact aggregate content SHA at a catalog-granted tier, the pin
 * IS the trust basis and the gate reports `"n/a"`. Without that pin the claim
 * still refuses.
 *
 * The order matters because the alternative was perverse: a pinned pack that
 * ALSO declared signing was refused where the same pinned pack declaring
 * nothing installed, so declaring a signature made a pack strictly worse off.
 * A verdict that is not `unarmed` is a real verification failure and is never
 * substituted for — a wrong signature over pinned content means the two
 * pieces of evidence disagree, which is a refusal on its own.
 */
export async function verifyPublisherSignedClaim(
  manifest: PackManifest,
  packRoot: string,
  verifier: SigstoreVerifier,
  opts: { catalogPinTier?: TrustTier } = {},
): Promise<"pass" | "n/a"> {
  const signing = manifest.signing;
  if (signing === undefined) return "n/a";
  assertKnownSigningMethod(signing.method);

  // The manifest schema does not carry `bundlePath` until the seam is armed;
  // the widening read is the forward declaration's one consumption point.
  const bundlePath = (signing as TrustSigning).bundlePath;
  if (bundlePath === undefined) {
    throw new EngineError(
      `Pack "${manifest.name}" declares signing.method "${signing.method}" but no \`bundlePath\`. ` +
        `A publisher-signed claim without its detached bundle cannot be verified, so it is refused.`,
      { code: "INTEGRITY_ERROR" },
    );
  }

  const bundleBytes = await readSigstoreBundle(packRoot, bundlePath);
  const aggregateSha = computeAggregateContentSha(manifest.integrity);
  const verdict = await verifier.verify(bundleBytes, aggregateSha, signing.signer);
  if (verdict.verified) return "pass";

  const pinTier = opts.catalogPinTier;
  if (verdict.unarmed === true && pinTier !== undefined && CATALOG_GRANTED_TIERS.has(pinTier)) {
    // Unevaluable, not false — and the pin already named these exact bytes.
    return "n/a";
  }
  throw new EngineError(`Pack "${manifest.name}" publisher-signed claim refused: ${verdict.reason}`, {
    code: "INTEGRITY_ERROR",
  });
}
