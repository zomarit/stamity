import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifyOptions } from "sigstore";
import {
  sigstoreCachePath,
  verifySigstoreBundle,
  type SigstoreSigner,
  type SigstoreVerifyFn,
} from "../../src/pack/sigstoreVerifier.ts";
import { computeAggregateContentSha, sigstoreSignedPayload } from "../../src/pack/trust.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The armed verifier, driven three ways.
 *
 * Most cases inject `verifyFn`, which is the seam's whole point: payload
 * framing, identity pinning and error mapping are decisions this module makes
 * BEFORE and AFTER the client call, and asserting them through a double is what
 * keeps them deterministic and offline. The double is never a stand-in for the
 * client being real — the "real client" block below loads `sigstore` itself and
 * makes it refuse.
 *
 * Every refusal is checked for the absence of `unarmed`. That flag is waivable
 * by a catalog pin (`src/pack/trust.ts` → `verifyPublisherSignedClaim`), so a
 * verdict from this module carrying it would convert a failed signature check
 * into an install that proceeds on the pin — the exact conflation the flag was
 * introduced to prevent, facing the other way.
 *
 * A declared signer is REQUIRED, so every case that must reach the client hands
 * one over. That is not scaffolding around a check: an unpinned verification
 * hands the client an empty identity policy, which any Fulcio certificate
 * satisfies, and the pack still resolves `publisher-signed`. The cases that
 * omit the signer are the ones asserting that refusal.
 */

const getCache = useTempDir("sigstore-verifier");

/** A bundle that clears the local shape gate; the double ignores its contents. */
const BUNDLE = {
  mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  verificationMaterial: {},
  messageSignature: { signature: "not-checked-by-the-double" },
};

const bundleBytes = (value: unknown): Buffer =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8");

const AGGREGATE_SHA = computeAggregateContentSha({ "agents/reviewer.md": "ab".repeat(32) });

const ISSUER = "https://token.actions.githubusercontent.com";
const EMAIL_IDENTITY = "releases@zomarit.dev";
const URI_IDENTITY = "https://github.com/zomarit/stamity/.github/workflows/release.yml@refs/tags/v1";

/** A well-formed `signing.signer`, for the cases whose subject is not the pin. */
const PIN = `${ISSUER} ${EMAIL_IDENTITY}`;

/** A signer whose certificate matches the pin exactly. */
const signerFor = (identity: string, issuer: string = ISSUER): SigstoreSigner => ({
  identity: { subjectAlternativeName: identity, extensions: { issuer } },
});

interface Capture {
  calls: number;
  bundle?: unknown;
  payload?: Buffer;
  options?: VerifyOptions;
}

/** A double that records what it was handed and returns `signer`. */
function spy(signer: SigstoreSigner): { verifyFn: SigstoreVerifyFn; seen: Capture } {
  const seen: Capture = { calls: 0 };
  const verifyFn: SigstoreVerifyFn = (bundle, payload, options) => {
    seen.calls += 1;
    seen.bundle = bundle;
    seen.payload = payload;
    seen.options = options;
    return Promise.resolve(signer);
  };
  return { verifyFn, seen };
}

/** A double that throws rather than rejecting — the seam must absorb both. */
const throwsSynchronously: SigstoreVerifyFn = () => {
  throw new Error("synchronous blow-up");
};

/** A double that must never run; every local-refusal case installs it. */
const neverCalled: { verifyFn: SigstoreVerifyFn; seen: Capture } = {
  verifyFn: () => Promise.reject(new Error("the client was called")),
  seen: { calls: 0 },
};

describe("sigstoreSignedPayload", () => {
  it("frames the aggregate SHA by byte length, so the payload names its own end", () => {
    expect(sigstoreSignedPayload(AGGREGATE_SHA).toString("utf8")).toBe(
      `${AGGREGATE_SHA.length}:${AGGREGATE_SHA}`,
    );
  });

  it("canonicalizes digest casing — one hash is never two payloads", () => {
    expect(sigstoreSignedPayload(AGGREGATE_SHA.toUpperCase())).toEqual(
      sigstoreSignedPayload(AGGREGATE_SHA),
    );
  });

  it("gives distinct content sets distinct payloads", () => {
    const other = computeAggregateContentSha({ "rules/naming.md": "cd".repeat(32) });
    expect(sigstoreSignedPayload(other)).not.toEqual(sigstoreSignedPayload(AGGREGATE_SHA));
  });
});

describe("verifySigstoreBundle — payload and options handed to the client", () => {
  it("passes the parsed bundle and the payload bytes through unaltered", async () => {
    const { verifyFn, seen } = spy(signerFor(EMAIL_IDENTITY));
    const payload = sigstoreSignedPayload(AGGREGATE_SHA);

    const verdict = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: `${ISSUER} ${EMAIL_IDENTITY}`,
      verifyFn,
    });

    expect(verdict.verified).toBe(true);
    expect(seen.bundle).toEqual(BUNDLE);
    expect(seen.payload).toEqual(payload);
  });

  it("defaults the TUF cache to the user's cache root, never the working tree", async () => {
    const { verifyFn, seen } = spy(signerFor(EMAIL_IDENTITY));

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${EMAIL_IDENTITY}`,
      verifyFn,
    });

    expect(seen.options?.tufCachePath).toBe(sigstoreCachePath());
    expect(seen.options?.tufCachePath).not.toContain(process.cwd());
  });

  it("lets a caller override the client options, defaults included", async () => {
    const { verifyFn, seen } = spy(signerFor(EMAIL_IDENTITY));
    const cache = getCache().dir;

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${EMAIL_IDENTITY}`,
      verifyFn,
      verifyOptions: { tufCachePath: cache, tlogThreshold: 2 },
    });

    expect(seen.options?.tufCachePath).toBe(cache);
    expect(seen.options?.tlogThreshold).toBe(2);
  });
});

describe("verifySigstoreBundle — identity pinning", () => {
  it("pins an email identity anchored and escaped, with the issuer verbatim", async () => {
    const { verifyFn, seen } = spy(signerFor(EMAIL_IDENTITY));

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${EMAIL_IDENTITY}`,
      verifyFn,
    });

    // `@sigstore/verify` matches the SAN as a REGULAR EXPRESSION, so an
    // unanchored, unescaped address pins nothing: `.` matches any character and
    // a substring match passes. Both halves are asserted here because either
    // one alone leaves the pin porous.
    expect(seen.options?.certificateIdentityEmail).toBe(String.raw`^releases@zomarit\.dev$`);
    expect(seen.options?.certificateIssuer).toBe(ISSUER);
    expect(seen.options?.certificateIdentityURI).toBeUndefined();
  });

  it("pins a URI identity on the URI option, escaping every metacharacter in it", async () => {
    const { verifyFn, seen } = spy(signerFor(URI_IDENTITY));

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${URI_IDENTITY}`,
      verifyFn,
    });

    const pattern = seen.options?.certificateIdentityURI ?? "";
    expect(seen.options?.certificateIdentityEmail).toBeUndefined();
    expect(pattern.startsWith("^")).toBe(true);
    expect(pattern.endsWith("$")).toBe(true);
    // The pattern matches the declared identity and nothing that merely
    // contains it — the substring attack the anchors close.
    expect(new RegExp(pattern).test(URI_IDENTITY)).toBe(true);
    expect(new RegExp(pattern).test(`evil${URI_IDENTITY}`)).toBe(false);
    expect(new RegExp(pattern).test(`${URI_IDENTITY}.attacker.example`)).toBe(false);
  });

  it("escapes so a lookalike the raw address would have matched cannot pass", async () => {
    // `releases@zomarit.dev` as a raw pattern matches `releasesXzomaritYdev`,
    // because both dots and the at-sign land in a regex unescaped.
    const { verifyFn, seen } = spy(signerFor(EMAIL_IDENTITY));

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${EMAIL_IDENTITY}`,
      verifyFn,
    });

    const pattern = seen.options?.certificateIdentityEmail ?? "";
    expect(new RegExp(pattern).test("releases@zomaritXdev")).toBe(false);
    expect(new RegExp(pattern).test(EMAIL_IDENTITY)).toBe(true);
  });

  it("re-compares the returned identity by exact equality, not by the pattern", async () => {
    // The client's own policy check is not the only guard: a certificate that
    // came back with a different SAN is refused here even though the double
    // reported success, so the pin never rests on the regular expression alone.
    const { verifyFn } = spy(signerFor("attacker@example.com"));

    const verdict = await verifySigstoreBundle(
      bundleBytes(BUNDLE),
      sigstoreSignedPayload(AGGREGATE_SHA),
      { signer: `${ISSUER} ${EMAIL_IDENTITY}`, verifyFn },
    );

    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBeUndefined();
    expect(verdict.reason).toContain("attacker@example.com");
    expect(verdict.reason).toContain(EMAIL_IDENTITY);
  });

  it("refuses the right identity under the wrong issuer", async () => {
    const { verifyFn } = spy(signerFor(EMAIL_IDENTITY, "https://accounts.example.com"));

    const verdict = await verifySigstoreBundle(
      bundleBytes(BUNDLE),
      sigstoreSignedPayload(AGGREGATE_SHA),
      { signer: `${ISSUER} ${EMAIL_IDENTITY}`, verifyFn },
    );

    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("certificate issuer");
    expect(verdict.reason).toContain(ISSUER);
  });

  it("refuses a certificate carrying no identity at all against a declared pin", async () => {
    const { verifyFn } = spy({});

    const verdict = await verifySigstoreBundle(
      bundleBytes(BUNDLE),
      sigstoreSignedPayload(AGGREGATE_SHA),
      { signer: `${ISSUER} ${EMAIL_IDENTITY}`, verifyFn },
    );

    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("certificate identity");
  });

  it("lets nothing an override carries weaken the declared pin", async () => {
    // The client reads `certificateIdentityEmail || certificateIdentityURI`, so
    // an override carrying the email key would shadow a URI pin sitting beside
    // it and the run would check the CALLER's identity instead of the pack's.
    const { verifyFn, seen } = spy(signerFor(URI_IDENTITY));

    await verifySigstoreBundle(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: `${ISSUER} ${URI_IDENTITY}`,
      verifyFn,
      verifyOptions: {
        certificateIdentityEmail: "^attacker@example\\.com$",
        certificateIssuer: "https://accounts.example.com",
      },
    });

    expect(seen.options?.certificateIdentityEmail).toBeUndefined();
    expect(seen.options?.certificateIssuer).toBe(ISSUER);
    expect(new RegExp(seen.options?.certificateIdentityURI ?? "").test(URI_IDENTITY)).toBe(true);
  });

  it("refuses a claim that declares no signer, without calling the client", async () => {
    // The rung this closes. The client builds its identity policy from the
    // declared signer alone (`sigstore/config.js` → `createVerificationPolicy`),
    // so with none it checks WHO signed against nothing and any Fulcio
    // certificate passes — and the pack still resolves `publisher-signed`,
    // needing no `--allow-untrusted` on the way. There is no unpinned pass to
    // downgrade to, so the claim is refused.
    const verdict = await verifySigstoreBundle(
      bundleBytes(BUNDLE),
      sigstoreSignedPayload(AGGREGATE_SHA),
      { verifyFn: neverCalled.verifyFn },
    );

    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBeUndefined();
    expect(verdict.reason).toContain("signing.signer");
    expect(verdict.reason).toContain("refused");
  });

  for (const signer of ["acme", "", " ", `${ISSUER}\t${EMAIL_IDENTITY}`, `a b c`]) {
    it(`refuses the unparseable signer ${JSON.stringify(signer)} without calling the client`, async () => {
      // A declared signer nobody can turn into a pin must not verify as though
      // the pack declared none: that would let ANY Fulcio identity satisfy a
      // claim that names one. Refusal, not a silent downgrade to unpinned.
      const verdict = await verifySigstoreBundle(
        bundleBytes(BUNDLE),
        sigstoreSignedPayload(AGGREGATE_SHA),
        { signer, verifyFn: neverCalled.verifyFn },
      );

      expect(verdict.verified).toBe(false);
      expect(verdict.unarmed).toBeUndefined();
      expect(verdict.reason).toContain("signing.signer");
    });
  }
});

describe("verifySigstoreBundle — bundles refused before any client call", () => {
  const payload = sigstoreSignedPayload(AGGREGATE_SHA);

  it("refuses bytes that are not JSON", async () => {
    const verdict = await verifySigstoreBundle(bundleBytes("not json {"), payload, {
      verifyFn: neverCalled.verifyFn,
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("not valid JSON");
  });

  it("refuses JSON that is not an object", async () => {
    await Promise.all(
      ["[]", '"a string"', "42", "null"].map(async (value) => {
        const verdict = await verifySigstoreBundle(bundleBytes(value), payload, {
          verifyFn: neverCalled.verifyFn,
        });
        expect(verdict.verified, `${value} was accepted as a bundle`).toBe(false);
        expect(verdict.reason).toContain("not a JSON object");
      }),
    );
  });

  it("refuses an object that declares no Sigstore media type", async () => {
    await Promise.all(
      [{}, { mediaType: 7 }, { mediaType: "application/json" }].map(async (value) => {
        const verdict = await verifySigstoreBundle(bundleBytes(value), payload, {
          verifyFn: neverCalled.verifyFn,
        });
        expect(verdict.verified, `${JSON.stringify(value)} was accepted`).toBe(false);
        expect(verdict.reason).toContain("mediaType");
      }),
    );
  });

  it("accepts every bundle media type the client itself accepts", async () => {
    // Prefix match rather than four literals, so a v0.4 bundle is the client's
    // switch to refuse rather than this file's — but every SHIPPED version must
    // still clear the gate, which is what these four assert.
    await Promise.all(
      [
        "application/vnd.dev.sigstore.bundle+json;version=0.1",
        "application/vnd.dev.sigstore.bundle+json;version=0.2",
        "application/vnd.dev.sigstore.bundle+json;version=0.3",
        "application/vnd.dev.sigstore.bundle.v0.3+json",
      ].map(async (mediaType) => {
        const { verifyFn } = spy(signerFor(EMAIL_IDENTITY));
        const verdict = await verifySigstoreBundle(bundleBytes({ mediaType }), payload, {
          signer: `${ISSUER} ${EMAIL_IDENTITY}`,
          verifyFn,
        });
        expect(verdict.verified, `${mediaType} was refused locally`).toBe(true);
      }),
    );
  });

  it("never marks a local refusal unarmed — none of them is pin-waivable", async () => {
    await Promise.all(
      ["not json {", "[]", "{}"].map(async (bytes) => {
        const verdict = await verifySigstoreBundle(bundleBytes(bytes), payload, {
          verifyFn: neverCalled.verifyFn,
        });
        expect(verdict.unarmed).toBeUndefined();
      }),
    );
  });
});

describe("verifySigstoreBundle — error mapping", () => {
  const payload = sigstoreSignedPayload(AGGREGATE_SHA);

  it("maps a thrown verification error to a refusal carrying its code and message", async () => {
    const thrown = Object.assign(new Error("signature verification failed"), {
      code: "SIGNATURE_ERROR",
    });
    const verdict = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      verifyFn: () => Promise.reject(thrown),
    });

    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBeUndefined();
    expect(verdict.reason).toContain("SIGNATURE_ERROR");
    expect(verdict.reason).toContain("signature verification failed");
  });

  it("maps a codeless error, and a thrown non-error, without losing the detail", async () => {
    const plain = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      verifyFn: () => Promise.reject(new Error("no code on this one")),
    });
    expect(plain.reason).toContain("no code on this one");

    const nonError = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      // eslint-disable-next-line prefer-promise-reject-errors -- the point of the case
      verifyFn: () => Promise.reject("a bare string"),
    });
    expect(nonError.verified).toBe(false);
    expect(nonError.reason).toContain("a bare string");
  });

  it("never throws out of the seam, whatever the client does", async () => {
    // The seam's contract is a verdict. A throw escaping here would reach
    // `verifyPublisherSignedClaim` as an unclassified error rather than the
    // INTEGRITY_ERROR refusal the install renders.
    const verdict = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      verifyFn: throwsSynchronously,
    });
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("synchronous blow-up");
  });

  it("never forwards a hostile bundle's raw bytes into the reason it prints", async () => {
    // V8's `JSON.parse` message quotes the first bytes of its input verbatim,
    // and the CLI writes an error message to the terminal unfiltered — so a
    // bundle beginning with an escape sequence would repaint the operator's
    // screen from inside the refusal that rejected it. The bytes still have to
    // be describable, so they are mapped to printable ASCII rather than
    // dropped: the reason names what failed without carrying anything the
    // terminal will act on.
    const hostile = Buffer.from("\u001b[2J\u001b[31mEVIL not json", "utf8");

    const verdict = await verifySigstoreBundle(hostile, payload, {
      signer: PIN,
      verifyFn: neverCalled.verifyFn,
    });

    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("not valid JSON");
    // Nothing outside printable ASCII survives — that covers C0 and DEL, and
    // the invisible and bidirectional characters that reorder a line with no
    // control byte in it at all.
    expect(verdict.reason).not.toContain("\u001b");
    expect(verdict.reason).toMatch(/^[\x20-\x7E\u2014\u2026\u201c\u201d`]*$/u);
  });

  it("caps how much of a hostile message it quotes", async () => {
    const verdict = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      verifyFn: () => Promise.reject(new Error("A".repeat(5_000))),
    });

    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("truncated");
    // The reason stays a line an operator reads, not a scrolled-away wall: the
    // quoted fragment is bounded even though the whole reason carries this
    // module's own framing around it.
    expect(verdict.reason.length).toBeLessThan(500);
  });
});

describe("sigstoreCachePath", () => {
  // Joined with the host's own `path.join`, not spelled with literal
  // separators: the function under test uses it too, so the assertion holds on
  // the Windows CI leg as well as on POSIX.
  it("uses the platform cache root, and the environment override where one exists", () => {
    expect(sigstoreCachePath({}, "darwin", "/Users/u")).toBe(
      join("/Users/u", "Library", "Caches", "stamity", "sigstore-tuf"),
    );
    expect(sigstoreCachePath({}, "linux", "/home/u")).toBe(
      join("/home/u", ".cache", "stamity", "sigstore-tuf"),
    );
    expect(sigstoreCachePath({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u")).toBe(
      join("/xdg", "stamity", "sigstore-tuf"),
    );
    expect(sigstoreCachePath({}, "win32", "/home/u")).toBe(
      join("/home/u", "AppData", "Local", "stamity", "sigstore-tuf"),
    );
    expect(sigstoreCachePath({ LOCALAPPDATA: "/local" }, "win32", "/home/u")).toBe(
      join("/local", "stamity", "sigstore-tuf"),
    );
  });

  it("is a fixed directory, not a per-call temp path", () => {
    expect(sigstoreCachePath()).toBe(sigstoreCachePath());
  });
});

describe("the real Sigstore client", () => {
  const payload = sigstoreSignedPayload(AGGREGATE_SHA);

  it("is what the armed path loads, and its refusal comes back as a verdict", async () => {
    // No `verifyFn`: this case loads `sigstore` itself and calls the real
    // `verify`. It stays offline by pointing the TUF mirror at a loopback
    // address, so the client's own failure — not a double's — is what gets
    // mapped, and no packet leaves the host.
    //
    // What it proves: the dependency resolves at run time, the call
    // type-checks against the real signature, and a thrown TUFError becomes a
    // refusal instead of escaping the seam. What it does not prove is that a
    // forged SIGNATURE is rejected — the client fetches its trust root before
    // it ever looks at the bundle, so that half is the opt-in case below.
    //
    // The TUF error code is asserted because it is the evidence: only the real
    // client produces it, so a `verifyFn` accidentally left injected, or a
    // local guard refusing early, would fail here rather than pass quietly.
    const verdict = await verifySigstoreBundle(bundleBytes(BUNDLE), payload, {
      signer: PIN,
      verifyOptions: {
        tufMirrorURL: "http://127.0.0.1:1",
        tufCachePath: getCache().dir,
        retry: 0,
        timeout: 500,
      },
    });

    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBeUndefined();
    expect(verdict.reason).toContain("did not verify");
    expect(verdict.reason).toContain("TUF_");
  });

  // NETWORK CASE, opt-in. The client fetches its trust root over TUF BEFORE it
  // deserializes a bundle (`sigstore/sigstore.ts` → `verify` calls
  // `createVerifier` first), so there is no way to make it reject a forged
  // bundle without reaching `tuf-repo-cdn.sigstore.dev` — the seeded root in
  // `@sigstore/tuf` carries no timestamp metadata, so a cold cache always
  // refreshes. Rather than let one case make the suite depend on the internet,
  // it runs only under STAMITY_SIGSTORE_NETWORK_TEST=1: CI stays
  // offline-deterministic, and a maintainer can prove end to end that the live
  // trust root is fetched and a bundle nobody signed is refused against it.
  //
  // The cache assertion is what separates that from a refusal that never
  // reached the network: the metadata files exist only if the TUF refresh
  // succeeded, so a failure to connect cannot masquerade as a rejected bundle.
  it.runIf(process.env.STAMITY_SIGSTORE_NETWORK_TEST === "1")(
    "refuses a forged bundle against the live Sigstore trust root",
    async () => {
      const forged = {
        mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        verificationMaterial: { certificate: { rawBytes: "bm90LWEtY2VydA==" }, tlogEntries: [] },
        messageSignature: { messageDigest: { algorithm: "SHA2_256", digest: "" }, signature: "" },
      };
      const cache = getCache().dir;

      const verdict = await verifySigstoreBundle(bundleBytes(forged), payload, {
        signer: PIN,
        verifyOptions: { tufCachePath: cache },
      });

      expect(verdict.verified).toBe(false);
      expect(verdict.unarmed).toBeUndefined();
      expect(verdict.reason).toContain("did not verify");
      expect(readdirSync(cache, { recursive: true }).map(String)).toContain(
        join("tuf-repo-cdn.sigstore.dev", "timestamp.json"),
      );
    },
    60_000,
  );
});

describe("a build whose Sigstore dependency will not load", () => {
  afterEach(() => {
    vi.doUnmock("sigstore");
    vi.resetModules();
  });

  it("refuses the claim rather than downgrading it to unevaluable", async () => {
    // The branch that decides what a broken install means. Reporting `unarmed`
    // here would make "delete node_modules/sigstore" a way to turn signature
    // checking off, because an unarmed verdict is waivable by a catalog pin
    // (`src/pack/trust.ts` → `verifyPublisherSignedClaim`). A build that cannot
    // load its verifier has not shown the claim is unevaluable in principle; it
    // has shown it is broken, and a broken gate refuses.
    vi.doMock("sigstore", () => {
      throw new Error("Cannot find module 'sigstore'");
    });
    vi.resetModules();
    const { verifySigstoreBundle: fresh } = await import("../../src/pack/sigstoreVerifier.ts");

    const verdict = await fresh(bundleBytes(BUNDLE), sigstoreSignedPayload(AGGREGATE_SHA), {
      signer: PIN,
    });

    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBeUndefined();
    expect(verdict.reason).toContain("could not be loaded");
    expect(verdict.reason).toContain("not a pass");
  });
});
