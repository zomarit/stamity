import { homedir } from "node:os";
import { join } from "node:path";
import type { Bundle, VerifyOptions } from "sigstore";
import { parseSignerPin, SIGNER_GRAMMAR, type SignerPin } from "./manifest.ts";
import type { SigstoreVerdict } from "./trust.ts";

/**
 * The armed implementation behind the trust ladder's signature seam
 * (`./trust.ts` → {@link SigstoreVerifier}). One job: judge a detached Sigstore
 * bundle against the bytes it must be signed over, and return a verdict.
 *
 * **What a `verified: true` verdict means.** The official `sigstore` client
 * checked, against a trust root fetched over TUF: that the bundle's signature
 * covers exactly the payload handed in (`./trust.ts` →
 * `sigstoreSignedPayload`, the length-framed aggregate content SHA), that the
 * signing certificate chains to a Fulcio root in that trust root, that the
 * signature appears on at least one transparency log and the certificate on at
 * least one certificate-transparency log (the client's defaults, left at 1 each
 * — raising either rejects bundles from a single-log deployment), and that the
 * certificate carries exactly the identity and issuer the pack's
 * `signing.signer` declares. There is no unpinned pass: a bundle with no
 * declared signer is refused here, because a verification that pins nobody
 * would be satisfied by any Fulcio identity and would still resolve the pack
 * to `publisher-signed`.
 *
 * **What it does not mean.** Nothing about AUTHORIZATION: that an identity
 * signed these bytes is not evidence that the identity was entitled to publish
 * this pack. The pin is the pack's own declaration, so a pack that names its
 * own attacker as signer verifies. The tier says who signed, and the operator
 * decides whether that answer is the right one. Nor does it say anything about
 * the pack's CONTENT beyond the aggregate SHA — per-file digests are
 * `./manifest.ts`'s job, and the deny-scan is its own gate.
 *
 * **Refuse, never throw.** The seam's contract is a verdict, so every failure
 * — malformed bundle, unusable signer declaration, unreachable TUF mirror,
 * a rejected signature, a missing dependency — returns `verified: false` with
 * the reason. A throw escaping here would reach `verifyPublisherSignedClaim` as
 * an unclassified error rather than the INTEGRITY_ERROR refusal it renders.
 *
 * **`unarmed` is never set here.** That flag means "no implementation could
 * evaluate this claim", and it is waivable by a verified catalog pin
 * (`./trust.ts` → {@link verifyPublisherSignedClaim}). Everything this module
 * returns is an evaluation, including the dependency-missing case: a build
 * whose `sigstore` install is broken has not established that the claim is
 * unevaluable-in-principle, and downgrading it to a pin-waivable verdict would
 * turn "delete node_modules/sigstore" into a way to switch signature checking
 * off. `./trust.ts` → `notYetArmedSigstoreVerifier` remains the honest unarmed
 * stand-in, and it is now reached only by deliberate injection.
 *
 * **Egress.** The `sigstore` module is loaded lazily, inside
 * {@link verifySigstoreBundle}, and only after the local checks pass. A run
 * that verifies nothing — `init`, `sync`, `check`, and every `add` of a pack
 * that declares no signature — never loads the client and never contacts
 * anything. A run that does verify contacts the Sigstore TUF mirror
 * (`https://tuf-repo-cdn.sigstore.dev`) to refresh the trust root, and the
 * transparency-log proofs travel inside the bundle rather than being fetched.
 * Its metadata cache is a stamity-owned directory under the user's cache root
 * ({@link sigstoreCachePath}), never the repository being installed into.
 */

/**
 * Media-type prefix shared by every Sigstore bundle version
 * (`@sigstore/bundle` → `BUNDLE_V01_MEDIA_TYPE` … `BUNDLE_V03_MEDIA_TYPE`).
 * The prefix rather than the four exact strings: this check exists to refuse
 * payloads that are not bundles at all before any network call, and matching
 * the family keeps a v0.4 bundle a job for the library's own switch — which
 * still runs — rather than a refusal this file has to be edited to lift.
 */
const BUNDLE_MEDIA_TYPE_PREFIX = "application/vnd.dev.sigstore.bundle";

/** Cache directory name under the platform cache root. */
const CACHE_DIR_SEGMENTS = ["stamity", "sigstore-tuf"] as const;

/**
 * The certificate facts a verdict is pinned on, as `@sigstore/verify` returns
 * them. Declared here rather than imported because the client's `Signer` type
 * is not on the `sigstore` package's public surface, and this seam needs only
 * these two fields.
 */
export interface SigstoreCertificateIdentity {
  /** The certificate's subject alternative name — an email address or a URI. */
  subjectAlternativeName?: string | undefined;
  /** OIDC issuer extension (OID 1.3.6.1.4.1.57264.1.1). */
  extensions?: { issuer?: string | undefined } | undefined;
}

/** The verified signer a successful client call returns. */
export interface SigstoreSigner {
  identity?: SigstoreCertificateIdentity | undefined;
}

/**
 * The one client function this module calls, as a type — the injection seam the
 * tests drive so payload framing, identity pinning and error mapping are
 * asserted without a network round-trip. It throws on any verification failure;
 * mapping that throw to a verdict is {@link verifySigstoreBundle}'s job.
 */
export type SigstoreVerifyFn = (
  bundle: Bundle,
  payload: Buffer,
  options: VerifyOptions,
) => Promise<SigstoreSigner>;

/**
 * Where the TUF trust-root cache lives: a stamity-owned directory under the
 * platform's cache root, so a verification never writes into the repository
 * being installed into and never shares state with another tool's client.
 *
 * The ambient facts are parameters with live defaults rather than direct reads,
 * which is the shape `../composition/root.ts` names for a module that consults
 * the process: every branch is reachable in a test on any host.
 */
export function sigstoreCachePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  switch (platform) {
    case "win32":
      return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), ...CACHE_DIR_SEGMENTS);
    case "darwin":
      return join(home, "Library", "Caches", ...CACHE_DIR_SEGMENTS);
    default:
      return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), ...CACHE_DIR_SEGMENTS);
  }
}

/** A refusal verdict. `unarmed` is deliberately absent — see the module header. */
const refuse = (reason: string): SigstoreVerdict => ({ verified: false, reason });

/**
 * Longest attacker-influenced fragment a verdict carries. A refusal is read by
 * a human, so the detail is worth quoting — but only as much of it as says what
 * went wrong.
 */
const MAX_CAUSE_LENGTH = 200;

/** Everything outside printable US-ASCII, which is all a verdict ever needs. */
const NOT_PRINTABLE_ASCII = /[^\x20-\x7E]/g;

/**
 * One attacker-influenced fragment, made safe to print.
 *
 * The bytes in a refusal reason are the pack author's: V8's `JSON.parse`
 * message quotes the first bytes of the input verbatim, so a bundle file
 * beginning with an escape sequence would otherwise repaint the operator's
 * terminal from inside the refusal the CLI prints. Every character outside
 * printable ASCII becomes `?` — that covers C0 and DEL, and it also covers the
 * bidirectional and invisible characters that reorder a line without a single
 * control byte in it — and the result is capped, because a megabyte of quoted
 * bundle is a scrolled-away refusal.
 */
function sanitizeForVerdict(text: string): string {
  const printable = text.replace(NOT_PRINTABLE_ASCII, "?");
  return printable.length <= MAX_CAUSE_LENGTH
    ? printable
    : `${printable.slice(0, MAX_CAUSE_LENGTH)}… (truncated)`;
}

/** `Error.message` when there is one, otherwise the value's own spelling. */
function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    // The client's errors carry a machine-readable `code` (TUF_*, TLOG_*,
    // CERTIFICATE_ERROR, UNTRUSTED_SIGNER_ERROR …). Naming it is what lets an
    // operator tell a network failure from a rejected signature, which the
    // message alone often does not.
    const code = (cause as { code?: unknown }).code;
    const message = sanitizeForVerdict(cause.message);
    return typeof code === "string" && code !== ""
      ? `${sanitizeForVerdict(code)}: ${message}`
      : message;
  }
  return sanitizeForVerdict(String(cause));
}

/**
 * Escape every regular-expression metacharacter and anchor both ends.
 *
 * `@sigstore/verify` matches the declared identity against the certificate's
 * SAN as a REGULAR EXPRESSION (`policy.ts` → `verifySubjectAlternativeName`),
 * so an address passed raw is a pattern rather than a value: `a@b.com` matches
 * `xa@b.comio` and pins nothing. Anchoring and escaping closes that, and
 * {@link identityMismatch} re-compares the returned identity for exact string
 * equality afterwards, so the pin never rests on this transformation alone.
 */
function anchoredPattern(value: string): string {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}$`;
}

/** RFC 3986 scheme prefix — what separates a URI identity from an email one. */
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Every identity key removed.
 *
 * Needed because the client reads `certificateIdentityEmail ||
 * certificateIdentityURI` (`sigstore/config.ts` →
 * `createVerificationPolicy`): a caller-supplied EMAIL left in place would
 * shadow a URI pin set beside it, and the verification would run against the
 * caller's identity rather than the pack's declared one. Stripping all three
 * makes the declared pin the only thing that can be in force.
 */
function withoutIdentityPins(options: VerifyOptions): VerifyOptions {
  const stripped = { ...options };
  delete stripped.certificateIssuer;
  delete stripped.certificateIdentityEmail;
  delete stripped.certificateIdentityURI;
  return stripped;
}

/** Client options for one verification: defaults, then overrides, then the pin. */
function verifyOptionsFor(pin: SignerPin, overrides: VerifyOptions): VerifyOptions {
  const base: VerifyOptions = { tufCachePath: sigstoreCachePath(), ...overrides };
  const pattern = anchoredPattern(pin.identity);
  return {
    // The pin goes on LAST and alone: a declared signer is a security control,
    // so nothing an override carries may weaken or replace it.
    ...withoutIdentityPins(base),
    certificateIssuer: pin.issuer,
    // Both option names land on the same policy field
    // (`sigstore/config.ts` → `createVerificationPolicy`), so this choice is
    // about the name a reader sees, not about what is checked. Discriminated on
    // the URI SCHEME rather than on an at-sign: the identities a CI signer
    // carries contain one — `…/release.yml@refs/tags/v1` is the standard GitHub
    // Actions SAN — and an at-sign test filed every one of them as an email.
    ...(URI_SCHEME.test(pin.identity)
      ? { certificateIdentityURI: pattern }
      : { certificateIdentityEmail: pattern }),
  };
}

/**
 * The pin re-checked against what the certificate actually carried, by exact
 * string equality — the half of identity pinning that does not depend on a
 * regular expression being written correctly. Returns the mismatch, or `null`
 * when the certificate is the declared signer.
 */
function identityMismatch(pin: SignerPin, signer: SigstoreSigner): string | null {
  const san = signer.identity?.subjectAlternativeName;
  const issuer = signer.identity?.extensions?.issuer;
  if (san !== pin.identity) {
    return `certificate identity ${JSON.stringify(san ?? null)} is not the declared ${JSON.stringify(pin.identity)}`;
  }
  if (issuer !== pin.issuer) {
    return `certificate issuer ${JSON.stringify(issuer ?? null)} is not the declared ${JSON.stringify(pin.issuer)}`;
  }
  return null;
}

/**
 * The bundle as JSON, or the reason it is not one.
 *
 * The media-type check duplicates nothing: `@sigstore/bundle` switches on the
 * same field and would refuse the same payloads. Doing it here is what keeps a
 * file that is not a bundle at all from costing a TUF round-trip before it is
 * refused — `createVerifier` fetches the trust root BEFORE the bundle is
 * deserialized (`sigstore/sigstore.ts` → `verify`), so without this check the
 * cheapest possible refusal is the one that needs the network.
 */
function parseBundle(bundleBytes: Uint8Array): { bundle: Bundle } | { reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bundleBytes).toString("utf8"));
  } catch (cause) {
    return { reason: `the detached bundle is not valid JSON (${describeError(cause)})` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { reason: "the detached bundle is not a JSON object" };
  }
  const mediaType = (parsed as { mediaType?: unknown }).mediaType;
  if (typeof mediaType !== "string" || !mediaType.startsWith(BUNDLE_MEDIA_TYPE_PREFIX)) {
    return {
      reason:
        `the detached bundle declares mediaType ${JSON.stringify(mediaType ?? null)}, ` +
        `which is not a Sigstore bundle (${BUNDLE_MEDIA_TYPE_PREFIX}…)`,
    };
  }
  // Cast, not trust: every field below `mediaType` is validated by
  // `@sigstore/bundle` when the client deserializes it, and a bundle that fails
  // that validation reaches the catch below as a refusal like any other.
  return { bundle: parsed as Bundle };
}

/** Loads the official client's `verify`. Failure is the caller's to map. */
async function loadSigstoreVerify(): Promise<SigstoreVerifyFn> {
  const { verify } = await import("sigstore");
  return (bundle, payload, options) => verify(bundle, payload, options);
}

export interface VerifySigstoreBundleOptions {
  /**
   * The pack's `signing.signer` declaration. Optional in the TYPE and required
   * in the BEHAVIOUR: `./manifest.ts` refuses a `sigstore` claim that omits it,
   * so a pack read from disk always carries one, and a caller that reaches this
   * seam without one is refused here rather than verified unpinned.
   */
  signer?: string;
  /** The client call, injectable so the suite drives every branch offline. */
  verifyFn?: SigstoreVerifyFn;
  /** Client options merged over the defaults — the TUF seam the suite redirects. */
  verifyOptions?: VerifyOptions;
}

/**
 * Verify one detached bundle over `payload`, and report a verdict.
 *
 * Order is deliberate and every step before the client call is local: bundle
 * shape, then the signer declaration — present, and parseable into a pin —
 * then the dependency, then the verification, then the identity re-check. A
 * pack that fails any of the first three is refused without contacting
 * anything.
 */
export async function verifySigstoreBundle(
  bundleBytes: Uint8Array,
  payload: Buffer,
  opts: VerifySigstoreBundleOptions = {},
): Promise<SigstoreVerdict> {
  const parsed = parseBundle(bundleBytes);
  if ("reason" in parsed) return refuse(parsed.reason);

  // No pin, no pass. An unpinned verification hands the client an empty
  // identity policy, which ANY Fulcio certificate satisfies — so a pack that
  // declared `{method: "sigstore", bundlePath}` and nothing else would reach
  // `publisher-signed` on a signature from anyone with a GitHub or Google
  // account, with no waiver in the command line to show for it. `./manifest.ts`
  // refuses such a declaration at ingress; this is the same refusal one layer
  // down, for every caller of the seam.
  if (opts.signer === undefined) {
    return refuse(
      "the pack declares a Sigstore signature but no `signing.signer`, so nothing pins WHO signed " +
        `it and any Sigstore identity would satisfy the claim. ${SIGNER_GRAMMAR} ` +
        "An unpinned claim is refused, never verified as publisher-signed.",
    );
  }
  const pin = parseSignerPin(opts.signer);
  if (pin === null) {
    return refuse(
      `the pack declares signer ${JSON.stringify(sanitizeForVerdict(opts.signer))}, which names no verifiable identity. ` +
        `${SIGNER_GRAMMAR} A signer that cannot be pinned is refused rather than ignored.`,
    );
  }

  let verifyFn = opts.verifyFn;
  if (verifyFn === undefined) {
    try {
      verifyFn = await loadSigstoreVerify();
    } catch (cause) {
      return refuse(
        `the Sigstore client could not be loaded (${describeError(cause)}), so the signature was never checked. ` +
          `Reinstall this package's dependencies; a missing verifier is a refusal, not a pass.`,
      );
    }
  }

  let signer: SigstoreSigner;
  try {
    signer = await verifyFn(parsed.bundle, payload, verifyOptionsFor(pin, opts.verifyOptions ?? {}));
  } catch (cause) {
    return refuse(`the detached bundle did not verify — ${describeError(cause)}`);
  }

  const mismatch = identityMismatch(pin, signer);
  if (mismatch !== null) return refuse(`the detached bundle verified, but ${mismatch}`);
  return {
    verified: true,
    // Sanitized like every refusal reason: the pin is the PACK's text, and a
    // verdict is a string an operator's terminal renders whether the verdict
    // passed or failed.
    reason: `bundle verified: signed by ${sanitizeForVerdict(pin.identity)} via ${sanitizeForVerdict(pin.issuer)}`,
  };
}
