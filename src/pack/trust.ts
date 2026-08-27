import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { EngineError } from "../types/errors.ts";
import {
  assertSafePackRelPath,
  SIGSTORE_SIGNING_METHOD,
  type PackManifest,
  type PackSigning,
} from "./manifest.ts";
import { verifySigstoreBundle } from "./sigstoreVerifier.ts";

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
 *     tier only; the claim holds only when its detached bundle verifies
 *     against {@link sigstoreSignedPayload} — never on declaration alone.
 *     {@link armedSigstoreVerifier} is what does the verifying, and it is the
 *     default every install runs through; {@link notYetArmedSigstoreVerifier}
 *     survives as the honest stand-in a caller may inject deliberately, and
 *     nothing selects it on its own.
 *
 * Pure functions except two: {@link readSigstoreBundle} loads a declared bundle
 * from disk, and {@link armedSigstoreVerifier} reaches the Sigstore TUF mirror
 * for the trust root it verifies against (`./sigstoreVerifier.ts` states the
 * egress and the lazy load that keeps every other command clear of it).
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
export const SIGNING_METHODS: readonly string[] = [SIGSTORE_SIGNING_METHOD];

/**
 * The signing declaration as the trust layer reads it.
 *
 * Once a forward declaration, now an alias that re-states the field this layer
 * consumes: `./manifest.ts` → {@link PackSigning} accepts and path-checks
 * `bundlePath` at ingress, so the widening this type existed to perform has
 * nothing left to widen. Kept as the name the trust surface and its callers
 * spell, rather than churning every signature to say `PackSigning`.
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
 * against the aggregate content SHA it must be signed over, and against the
 * identity the pack's `signing.signer` declares — required, not optional: a
 * `sigstore` claim that pins nobody is refused at ingress (`./manifest.ts`) and
 * refused again here. The parameter is optional in the SIGNATURE only so the
 * armed implementation can refuse a caller that omits it rather than verify
 * against an empty policy. Implementations report a verdict;
 * translating a refusal into an install-stopping error is the caller's job
 * ({@link verifyPublisherSignedClaim}).
 */
export interface SigstoreVerifier {
  verify(bundleBytes: Uint8Array, aggregateSha: string, signer?: string): Promise<SigstoreVerdict>;
}

/**
 * The stand-in for a path with no verifier behind it: it cannot evaluate a
 * publisher-signed claim, and an unverifiable claim is never assumed true.
 *
 * It reports `unarmed`, so the caller can tell "nothing could check this" from
 * "something checked and the signature is wrong". The reason names the one way
 * forward that exists — a catalog-pinned source — and deliberately does NOT
 * name `--allow-untrusted`: that flag waives the ABSENCE of a trust basis, so
 * it has no effect on a declared claim and recommending it sent operators to a
 * flag that changes nothing.
 *
 * **No longer the default.** {@link armedSigstoreVerifier} is what
 * `./install.ts` runs, so nothing selects this verifier on its own — reaching
 * it takes an explicit `sigstoreVerifier` injection. Its opening clause moved
 * with that change and the move is the point: the string used to open "this
 * build cannot verify Sigstore bundles yet", which was the phrase downstream
 * assertions matched on and is now false of the build. A refusal that misstates
 * why it refused is worse than one whose wording drifted, so the claim narrowed
 * to the path it is true of. The fragment "no armed Sigstore verifier" is
 * unchanged, and so is the refusal itself.
 */
export const notYetArmedSigstoreVerifier: SigstoreVerifier = {
  verify: () =>
    Promise.resolve({
      verified: false,
      unarmed: true,
      reason:
        "no armed Sigstore verifier sits behind the seam on this path, " +
        "so the publisher-signed claim is refused rather than assumed. " +
        "Install from a catalog-pinned source — a verified pin is an independent trust basis this gate honours.",
    }),
};

/**
 * The verifier every install runs through: the official `sigstore` client,
 * judging the declared bundle against {@link sigstoreSignedPayload} and against
 * the exact identity the pack's `signing.signer` names. A claim reaching it
 * with no signer is refused, never verified unpinned.
 *
 * A thin binding on purpose. What it adds over `./sigstoreVerifier.ts` is the
 * one thing that belongs to the trust contract rather than to the client: the
 * payload. The seam is handed an aggregate content SHA, and turning that SHA
 * into the bytes a publisher signed is this module's rule, so it is applied
 * here and nowhere else.
 *
 * It never reports `unarmed` — every verdict it returns is an evaluation, so
 * none of them is waivable by a catalog pin. See
 * {@link verifyPublisherSignedClaim} for why that distinction is load-bearing.
 */
export const armedSigstoreVerifier: SigstoreVerifier = {
  verify: (bundleBytes, aggregateSha, signer) =>
    verifySigstoreBundle(
      bundleBytes,
      sigstoreSignedPayload(aggregateSha),
      signer === undefined ? {} : { signer },
    ),
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

/**
 * The exact bytes a pack publisher signs: the aggregate content SHA
 * ({@link computeAggregateContentSha}), lower-cased and length-framed —
 * `64:<hex>` in UTF-8.
 *
 * This function IS the signing contract. A signature verifies only against
 * these bytes, so an author producing a bundle must sign this serialization and
 * not the bare hex; a helper that emits it is a separate piece of work, and
 * until one ships this docblock is the specification an author works from.
 *
 * Length-framed for the same reason the map entries above are, and reusing the
 * same {@link frameField} so there is one framing rule in this module rather
 * than two that can drift. Signing the bare hex would work today — a SHA-256
 * hex string is fixed-width, so nothing can be prefix-confused with it — but it
 * would leave the payload format depending on that width for its unambiguity,
 * and the day a second field joins the payload the framing would have to be
 * retrofitted onto signatures already issued. Lower-cased for the reason the
 * digests are: two spellings of one hash must not be two different payloads.
 */
export function sigstoreSignedPayload(aggregateSha: string): Buffer {
  return Buffer.from(frameField(aggregateSha.toLowerCase()), "utf8");
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
 * The clause a tier basis carries while a declared signature has not been
 * judged yet.
 *
 * {@link resolveTrustTier} runs BEFORE the signature gate — it costs no read,
 * which is what lets the org policy be evaluated on the source kind the pin
 * decides — so every basis it builds for a pack that declares signing ends
 * here, with the claim still open. It is a trailing suffix in both branches on
 * purpose: {@link settleSignatureClause} swaps it for what the verifier
 * actually proved, and a clause buried mid-sentence could not be swapped
 * without rewriting the sentence around it.
 */
const PENDING_SIGNATURE_CLAUSE =
  "; the declared signature claim must still verify against its bundle";

/**
 * The tier basis with its pending-signature clause replaced by the verifier's
 * own account of what it proved.
 *
 * This is how the verified signer reaches the operator. The verdict names the
 * identity and the issuer, that string is built and sanitized in
 * `./sigstoreVerifier.ts`, and until it was carried here it died inside the
 * gate: the install plan recorded `"pass"` and printed a basis that still said
 * the claim "must still verify", so `stamity add` told an operator a signature
 * was pending at the moment it had just been proved, and never told them WHO
 * signed. Everything the tier resolution settled — the aggregate content SHA,
 * a catalog pin standing beside the signature — is kept; only the open clause
 * is replaced.
 *
 * A basis with no pending clause (nothing declared) is returned with the
 * verified account appended, so this is safe to apply to any basis.
 */
export function settleSignatureClause(basis: string, verifiedBasis: string): string {
  const settled = basis.endsWith(PENDING_SIGNATURE_CLAUSE)
    ? basis.slice(0, -PENDING_SIGNATURE_CLAUSE.length)
    : basis;
  return `${settled}; ${verifiedBasis}`;
}

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
          (signing === undefined ? "" : PENDING_SIGNATURE_CLAUSE),
      };
    }
  }

  if (signing !== undefined) {
    return {
      tier: "publisher-signed",
      basis:
        `signing.method "${signing.method}" claims publisher-signed over aggregate content SHA ${shortSha(aggregateSha)}` +
        (pin === undefined ? "" : ` (catalog pin SHA verified; its "${pin.tier}" grant adds no higher rung)`) +
        PENDING_SIGNATURE_CLAUSE,
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
 * Largest detached bundle this gate will read: 1 MiB.
 *
 * A Sigstore bundle is single-digit KB — a certificate, a signature and a
 * transparency-log entry — so the cap is three orders of magnitude of headroom
 * and still bounds what a hostile pack can make the process allocate. It exists
 * because the bundle is the one pack file read OUTSIDE the content walk: that
 * walk bounds the pack footprint (`./manifest.ts`), but it descends only the
 * class directories, and a `bundlePath` sits at the pack root.
 */
export const MAX_SIGSTORE_BUNDLE_BYTES = 1024 * 1024;

/**
 * `O_NOFOLLOW` where the platform has it, 0 where it does not (it is POSIX-only;
 * Windows omits it). Read through an index signature because `@types/node`
 * declares the constant as always present, which is true of the type and not of
 * every host. Where it is 0 the `lstat` refusal below is the whole guard, which
 * is the same guard every platform gets — this flag only closes the window
 * between that check and the open.
 */
const O_NOFOLLOW: number =
  (fsConstants as unknown as Record<string, number | undefined>)["O_NOFOLLOW"] ?? 0;

/**
 * Read a declared detached Sigstore bundle from the pack. The path is held to
 * the same containment rules as every other pack-relative path, and a declared
 * bundle that is missing is an integrity refusal — the pack does not match its
 * own signing declaration — not a bare filesystem error.
 *
 * **Why the guards live here rather than in call order.** This read runs BEFORE
 * `./install.ts` enumerates pack content, and it stays there: refusing a bad
 * signature before reading a byte of the pack's content is the fail-closed
 * order, and moving the call later would not bring the bundle under the walk's
 * guards anyway — the walk descends the content classes, and a `bundlePath` at
 * the pack root is outside all of them. So the two rules the walk applies to
 * every other pack file are applied here directly:
 *
 *   - **Regular files only.** `lstat` first and without following, so a symlink
 *     (which could address any file on the host), a FIFO or a device node is
 *     refused before anything opens it. The order is load-bearing: opening a
 *     FIFO for reading BLOCKS until a writer appears, so a check made after the
 *     open would never run. `O_NOFOLLOW` then closes the window between the
 *     check and the open, and the post-open `fstat` re-checks both facts
 *     against the descriptor actually opened rather than the path.
 *   - **Bounded.** {@link MAX_SIGSTORE_BUNDLE_BYTES}, refused rather than
 *     truncated, so a multi-gigabyte "bundle" is a refusal and not an
 *     out-of-memory crash.
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

  const notRegular = (): EngineError =>
    new EngineError(
      `Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)}, but that path is not a regular file. ` +
        `Symlinks can address files outside the pack, and a pipe or device node has no end; either way the pack does ` +
        `not match its signing declaration.`,
      { code: "INTEGRITY_ERROR" },
    );

  const tooLarge = (size: number): EngineError =>
    new EngineError(
      `Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)} of ${String(size)} bytes, over the ` +
        `${String(MAX_SIGSTORE_BUNDLE_BYTES)}-byte limit. A detached bundle is a few kilobytes; this one is refused unread.`,
      { code: "INTEGRITY_ERROR" },
    );

  let handle: FileHandle | undefined;
  try {
    const link = await lstat(absPath);
    if (!link.isFile()) throw notRegular();
    if (link.size > MAX_SIGSTORE_BUNDLE_BYTES) throw tooLarge(link.size);

    handle = await open(absPath, fsConstants.O_RDONLY | O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile()) throw notRegular();
    if (opened.size > MAX_SIGSTORE_BUNDLE_BYTES) throw tooLarge(opened.size);

    return await handle.readFile();
  } catch (cause) {
    if (cause instanceof EngineError) throw cause;
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new EngineError(
        `Pack signing declares a Sigstore bundle at ${JSON.stringify(bundlePath)} but the pack ships no such file. ` +
          `The pack does not match its signing declaration; re-obtain it from the author.`,
        { code: "INTEGRITY_ERROR", cause },
      );
    }
    // What `O_NOFOLLOW` reports when the path became a symlink between the
    // `lstat` and the open — the same refusal, reached the racy way.
    if (code === "ELOOP" || code === "EMLINK") throw notRegular();
    throw new EngineError(
      `Cannot read Sigstore bundle ${absPath}: ${code ?? (cause instanceof Error ? cause.message : String(cause))}.`,
      { code: "FS_ERROR", cause },
    );
  } finally {
    await handle?.close();
  }
}

/** Tiers only a catalog entry can grant — the rungs that name catalog work. */
const CATALOG_GRANTED_TIERS: ReadonlySet<TrustTier> = new Set<TrustTier>([
  "scanned",
  "curator-verified",
]);

/**
 * What {@link verifyPublisherSignedClaim} reports: the gate row, and — for a
 * claim that verified — the verifier's own account of what it proved.
 */
export interface PublisherSignedOutcome {
  /** The gate row the install plan records: a verified claim, or nothing claimed. */
  outcome: "pass" | "n/a";
  /**
   * The verifier's own account of what it proved — "bundle verified: signed by
   * <identity> via <issuer>", already sanitized for a terminal by
   * `./sigstoreVerifier.ts` — carried verbatim for a claim that PASSED.
   *
   * Absent on `"n/a"`, and that is the honest shape rather than an empty
   * string: `"n/a"` means nothing was proved (no declaration, or a claim
   * nothing could evaluate standing on a catalog pin), so there is no identity
   * to name and no sentence to print.
   */
  verifiedBasis?: string;
}

/**
 * Verify a manifest's publisher-signed claim through the seam. No signing
 * declaration means no claim — `"n/a"`, nothing waived. A claim is judged
 * fail-closed at every step: unknown method, missing `bundlePath`, missing
 * bundle file, and a verifier that CHECKED and refused each stop the install;
 * only an armed verifier returning `verified: true` passes.
 *
 * `opts.catalogPinTier` is the one thing that can stand in for a claim nothing
 * could evaluate, and it stands in for nothing else. Since
 * {@link armedSigstoreVerifier} became the default that is a narrow path — no
 * verdict it returns is `unarmed` — but the rule is unchanged rather than
 * retired, because the seam still accepts an injected verifier that cannot
 * judge. When the verdict is {@link SigstoreVerdict.unarmed} — no
 * implementation behind the seam, so the claim was never judged — and a
 * catalog pin already verified
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
 *
 * **The verdict is returned, not collapsed.** A pass carries
 * {@link PublisherSignedOutcome.verifiedBasis} — the verifier's own sentence
 * naming the identity and the issuer it pinned. This function used to reduce
 * the whole verdict to the string `"pass"`, which is how the one fact an
 * operator is installing ON — who signed this pack — never reached them: the
 * plan printed a trust basis composed before the verification ran. The caller
 * settles it into the plan's basis ({@link settleSignatureClause}).
 */
export async function verifyPublisherSignedClaim(
  manifest: PackManifest,
  packRoot: string,
  verifier: SigstoreVerifier,
  opts: { catalogPinTier?: TrustTier } = {},
): Promise<PublisherSignedOutcome> {
  const signing = manifest.signing;
  if (signing === undefined) return { outcome: "n/a" };
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
  // The reason travels with the pass. It is the verifier's own words about the
  // certificate it pinned, so nothing here re-derives, re-formats or re-sanitizes
  // an identity — this layer would only be a second place for the two to drift.
  if (verdict.verified) return { outcome: "pass", verifiedBasis: verdict.reason };

  const pinTier = opts.catalogPinTier;
  if (verdict.unarmed === true && pinTier !== undefined && CATALOG_GRANTED_TIERS.has(pinTier)) {
    // Unevaluable, not false — and the pin already named these exact bytes.
    return { outcome: "n/a" };
  }
  throw new EngineError(`Pack "${manifest.name}" publisher-signed claim refused: ${verdict.reason}`, {
    code: "INTEGRITY_ERROR",
  });
}
