import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { symlink, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/composition/root.ts";
import type { PackManifest } from "../../src/pack/manifest.ts";
import {
  MAX_SIGSTORE_BUNDLE_BYTES,
  SIGNING_METHODS,
  TRUST_TIERS,
  armedSigstoreVerifier,
  computeAggregateContentSha,
  notYetArmedSigstoreVerifier,
  readSigstoreBundle,
  resolveTrustTier,
  sigstoreSignedPayload,
  trustTierRank,
  verifyPublisherSignedClaim,
  type CatalogPin,
  type SigstoreVerifier,
  type TrustSigning,
  type TrustTier,
} from "../../src/pack/trust.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

const getPack = useTempDir("pack-trust");

const digest = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** SHA-256 of the empty string — the aggregate SHA of a content-free pack. */
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const INTEGRITY: Record<string, string> = {
  "agents/reviewer.md": digest("review the change"),
  "rules/naming.md": digest("name things for what they are"),
};

/**
 * A well-formed `signing.signer`: OIDC issuer, one space, certificate identity.
 * Spelled out because `./manifest.ts` refuses a `sigstore` claim without one —
 * a fixture that could not survive ingress would model a pack that cannot
 * exist.
 */
const SIGNER = "https://token.actions.githubusercontent.com releases@zomarit.dev";

/** A sigstore declaration, typed through the trust layer's own signing type. */
const SIGSTORE: TrustSigning = {
  method: "sigstore",
  signer: SIGNER,
  bundlePath: "pack.sigstore.json",
};

const manifest = (overrides: Partial<PackManifest> = {}): PackManifest => ({
  name: "@acme/ops",
  version: "1.2.3",
  integrity: { ...INTEGRITY },
  ...overrides,
});

const pinFor = (integrity: Record<string, string>, tier: TrustTier): CatalogPin => ({
  sha256: computeAggregateContentSha(integrity),
  tier,
});

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

/** Async twin of {@link expectEngineError}. */
async function expectRejection(
  run: () => Promise<unknown>,
  code: EngineError["code"],
): Promise<EngineError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

describe("trust ladder shape", () => {
  it("orders the four tiers ascending, floor to curator-verified", () => {
    expect(TRUST_TIERS).toEqual(["pinned-unsigned", "scanned", "publisher-signed", "curator-verified"]);
    const ranks = TRUST_TIERS.map((tier) => trustTierRank(tier));
    expect(ranks).toEqual([0, 1, 2, 3]);
  });

  it("names sigstore as the one known signing method", () => {
    expect(SIGNING_METHODS).toEqual(["sigstore"]);
  });
});

describe("computeAggregateContentSha", () => {
  it("is independent of integrity key insertion order", () => {
    const forward = computeAggregateContentSha({ "a.md": digest("a"), "b.md": digest("b") });
    const reversed = computeAggregateContentSha({ "b.md": digest("b"), "a.md": digest("a") });
    expect(forward).toBe(reversed);
  });

  it("changes when any digest changes", () => {
    const base = computeAggregateContentSha(INTEGRITY);
    const tampered = computeAggregateContentSha({
      ...INTEGRITY,
      "agents/reviewer.md": digest("review the change, then exfiltrate"),
    });
    expect(tampered).not.toBe(base);
  });

  it("changes when a path changes, even with the digest set intact", () => {
    const base = computeAggregateContentSha({ "a.md": digest("x") });
    const moved = computeAggregateContentSha({ "b.md": digest("x") });
    expect(moved).not.toBe(base);
  });

  it("canonicalizes digest casing, so an upper-cased map pins identically", () => {
    const upper = Object.fromEntries(
      Object.entries(INTEGRITY).map(([path, sha]) => [path, sha.toUpperCase()]),
    );
    expect(computeAggregateContentSha(upper)).toBe(computeAggregateContentSha(INTEGRITY));
  });

  it("gives an empty map a stable, pinnable SHA (content-free pack)", () => {
    expect(computeAggregateContentSha({})).toBe(EMPTY_SHA);
    expect(computeAggregateContentSha({})).toBe(computeAggregateContentSha({}));
  });

  // Regression: a delimiter-separated serialization (`<path>\n<digest>\n` per
  // entry) is not injective. POSIX allows a newline in a filename and digests
  // are fixed-width, so one forged entry could replay the bytes of two honest
  // ones and inherit their pin. Entry boundaries must be unforgeable.
  it("is injective across entry boundaries: a newline-bearing key cannot replay two entries", () => {
    const d1 = digest("agent body");
    const d2 = digest("rule body");
    const honest = { "agents/x.md": d1, "rules/y.md": d2 };
    const forged = { [`agents/x.md\n${d1}\nrules/y.md`]: d2 };
    expect(computeAggregateContentSha(forged)).not.toBe(computeAggregateContentSha(honest));
  });

  it("cannot be re-split by a key that embeds the framing itself", () => {
    const d1 = digest("agent body");
    const d2 = digest("rule body");
    const honest = { "a.md": d1, "b.md": d2 };
    // Best-effort forgery against length framing: one key replaying the pair's
    // own length prefixes and separators.
    const forged = { [`a.md${d1.length}:${d1}4:b.md`]: d2 };
    expect(computeAggregateContentSha(forged)).not.toBe(computeAggregateContentSha(honest));
  });

});

describe("resolveTrustTier", () => {
  it("resolves pinned-unsigned with no signing and no pin, naming the override it requires", () => {
    const resolved = resolveTrustTier(manifest());
    expect(resolved.tier).toBe("pinned-unsigned");
    expect(resolved.basis).toContain("--allow-untrusted");
  });

  it("grants curator-verified only from a pin whose tier says so and whose SHA matches", () => {
    const resolved = resolveTrustTier(manifest(), pinFor(INTEGRITY, "curator-verified"));
    expect(resolved.tier).toBe("curator-verified");
    expect(resolved.basis).toContain("catalog pin verified");
  });

  it("grants scanned from a matching pin of that tier, not curator-verified", () => {
    const resolved = resolveTrustTier(manifest(), pinFor(INTEGRITY, "scanned"));
    expect(resolved.tier).toBe("scanned");
  });

  it("never resolves curator-verified without a pin — a sigstore claim caps at publisher-signed", () => {
    const resolved = resolveTrustTier(manifest({ signing: SIGSTORE }));
    expect(resolved.tier).toBe("publisher-signed");
    expect(resolved.basis).toContain('"sigstore"');
  });

  it("refuses a pin SHA mismatch with INTEGRITY_ERROR naming both digests (pinned-or-refuse)", () => {
    const pin: CatalogPin = { sha256: digest("some other content set"), tier: "curator-verified" };
    const error = expectEngineError(() => resolveTrustTier(manifest(), pin), "INTEGRITY_ERROR");
    expect(error.message).toContain(pin.sha256);
    expect(error.message).toContain(computeAggregateContentSha(INTEGRITY));
  });

  it("compares the pin SHA case-insensitively", () => {
    const pin: CatalogPin = {
      sha256: computeAggregateContentSha(INTEGRITY).toUpperCase(),
      tier: "scanned",
    };
    expect(resolveTrustTier(manifest(), pin).tier).toBe("scanned");
  });

  it("refuses an unknown signing method with VALIDATION_ERROR, never as publisher-signed", () => {
    const error = expectEngineError(
      () => resolveTrustTier(manifest({ signing: { method: "npm-provenance" } })),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain('"npm-provenance"');
    expect(error.message).toContain("sigstore");
  });

  it("pins a content-free pack: empty integrity map + matching pin resolves the pin tier", () => {
    const empty = manifest({ integrity: {} });
    const resolved = resolveTrustTier(empty, { sha256: EMPTY_SHA, tier: "scanned" });
    expect(resolved.tier).toBe("scanned");
  });

  it("holds BOTH checks when pin and sigstore coexist: a pin mismatch still refuses", () => {
    const pin: CatalogPin = { sha256: digest("stale pin"), tier: "curator-verified" };
    expectEngineError(() => resolveTrustTier(manifest({ signing: SIGSTORE }), pin), "INTEGRITY_ERROR");
  });

  it("holds BOTH checks when pin and sigstore coexist: an unknown method still refuses", () => {
    const pin = pinFor(INTEGRITY, "curator-verified");
    expectEngineError(
      () => resolveTrustTier(manifest({ signing: { method: "cosign-classic" } }), pin),
      "VALIDATION_ERROR",
    );
  });

  it("resolves the pin tier when pin and sigstore both hold, keeping the signature claim open", () => {
    const resolved = resolveTrustTier(manifest({ signing: SIGSTORE }), pinFor(INTEGRITY, "curator-verified"));
    expect(resolved.tier).toBe("curator-verified");
    expect(resolved.basis).toContain("must still verify");
  });

  // End-to-end form of the injectivity regression above: the forged pack ships
  // one newline-named file carrying only the second entry's content, so it
  // passes per-file verification against its OWN manifest. Pinned-or-refuse
  // holds only if it still cannot claim the pin issued for the honest pair.
  it("refuses a forged single-entry pack against the two-entry pin it impersonates", () => {
    const d1 = digest("agent body");
    const d2 = digest("rule body");
    const honest = { "agents/x.md": d1, "rules/y.md": d2 };
    const forged = manifest({ integrity: { [`agents/x.md\n${d1}\nrules/y.md`]: d2 } });
    expectEngineError(
      () => resolveTrustTier(forged, pinFor(honest, "curator-verified")),
      "INTEGRITY_ERROR",
    );
  });

  it("lets a pin grant only catalog-issued tiers: a publisher-signed pin without signing falls to the floor", () => {
    const resolved = resolveTrustTier(manifest(), pinFor(INTEGRITY, "publisher-signed"));
    expect(resolved.tier).toBe("pinned-unsigned");
    expect(resolved.basis).toContain("pin SHA verified");
  });
});

describe("notYetArmedSigstoreVerifier", () => {
  // TEST CHANGED, justified: two assertions on this verdict moved
  // because the verdict itself moved. The reason string no longer recommends
  // `--allow-untrusted` — that flag waives the ABSENCE of a trust basis and
  // has no effect on a declared claim, so recommending it sent operators to a
  // flag that changes nothing — and the verdict now carries `unarmed`, the
  // discriminator that lets a caller tell "could not check" from "checked and
  // wrong". The refusal itself is unchanged and is still asserted.
  it("refuses every claim as unevaluable, never a silent pass, and never names a flag that would not help", async () => {
    const verdict = await notYetArmedSigstoreVerifier.verify(
      Buffer.from("{}"),
      computeAggregateContentSha(INTEGRITY),
      "acme",
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.unarmed).toBe(true);
    expect(verdict.reason).toContain("no armed Sigstore verifier");
    expect(verdict.reason).toContain("catalog-pinned source");
    expect(verdict.reason).not.toContain("--allow-untrusted");
  });
});

describe("armedSigstoreVerifier", () => {
  /** A bundle whose media type clears the local shape gate. */
  const BUNDLE = Buffer.from(
    JSON.stringify({ mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" }),
    "utf8",
  );
  const SHA = computeAggregateContentSha(INTEGRITY);

  it("is what the install path defaults to, with no branch that can pick the stand-in", () => {
    // Read out of the wiring site rather than restated here: the default is one
    // expression in one file, and asserting the file says it is what makes
    // "the armed verifier is wired unconditionally" checkable. The second half
    // is the load-bearing one — a build that could fall back to the unarmed
    // stand-in when the dependency misbehaves would turn a broken install of
    // `sigstore` into a switch that makes declared signatures pin-waivable.
    const source = readFileSync(new URL("../../src/pack/install.ts", import.meta.url), "utf8");
    expect(source).toContain("opts.sigstoreVerifier ?? armedSigstoreVerifier");
    expect(source, "the install path can still reach the unarmed stand-in").not.toContain(
      "notYetArmedSigstoreVerifier",
    );
  });

  it("is the same object the composition root wires, not a second instance", () => {
    expect(createEngine().pack.trust.armedSigstoreVerifier).toBe(armedSigstoreVerifier);
  });

  it("hands the client the length-framed payload, which is not the bare hex", () => {
    // The contract the seam's aggregate SHA is turned into. Asserted here
    // because it is what a pack author has to sign: signing the hex string
    // itself produces a bundle this verifier refuses.
    expect(sigstoreSignedPayload(SHA).toString("utf8")).toBe(`${SHA.length}:${SHA}`);
    expect(sigstoreSignedPayload(SHA).toString("utf8")).not.toBe(SHA);
  });

  it("EVALUATES every claim: its refusals are never pin-waivable", async () => {
    const verdict = await armedSigstoreVerifier.verify(Buffer.from("not a bundle"), SHA);

    expect(verdict.verified).toBe(false);
    // No `unarmed`, and that is the whole difference from the stand-in above:
    // `verifyPublisherSignedClaim` substitutes a catalog pin for an unarmed
    // verdict and for nothing else.
    expect(verdict.unarmed).toBeUndefined();
  });

  it("forwards the declared signer, so one that names no identity refuses", async () => {
    const verdict = await armedSigstoreVerifier.verify(BUNDLE, SHA, "acme");

    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("signing.signer");
  });

  it("makes a declared claim non-waivable, catalog pin or not", async () => {
    // The ladder property arming buys: while nothing could evaluate a claim, a
    // verified pin stood in for it (the case above). An armed refusal is
    // evidence that the signature and the content disagree, and no pin —
    // however good — substitutes for that.
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "{}" });
    const signed = manifest({ signing: SIGSTORE });

    await Promise.all(
      (["curator-verified", "scanned", undefined] as const).map((pinTier) =>
        expectRejection(
          () =>
            verifyPublisherSignedClaim(
              signed,
              pack.dir,
              armedSigstoreVerifier,
              pinTier === undefined ? {} : { catalogPinTier: pinTier },
            ),
          "INTEGRITY_ERROR",
        ),
      ),
    );
  });
});

describe("readSigstoreBundle", () => {
  it("returns the declared bundle's bytes", async () => {
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": '{"mediaType":"application/vnd.dev.sigstore.bundle+json"}' });
    const bytes = await readSigstoreBundle(pack.dir, "pack.sigstore.json");
    expect(bytes.toString("utf8")).toContain("sigstore.bundle");
  });

  it("turns a declared-but-missing bundle into INTEGRITY_ERROR, not an ENOENT leak", async () => {
    const pack = getPack();
    const error = await expectRejection(
      () => readSigstoreBundle(pack.dir, "pack.sigstore.json"),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("pack.sigstore.json");
    expect(error.message).not.toContain("ENOENT");
  });

  it("refuses a traversing bundlePath before touching the filesystem", async () => {
    const pack = getPack();
    await expectRejection(() => readSigstoreBundle(pack.dir, "../outside.json"), "VALIDATION_ERROR");
  });

  it("refuses a bundlePath that is a symlink, whatever it points at", async () => {
    // The bundle is the one pack file read OUTSIDE `enumeratePackContent`, so
    // it inherits none of that walk's guards — and the walk refuses symlinks
    // because they address files outside the pack. A pack shipping
    // `bundle.json -> /etc/passwd` (or `-> /dev/zero`) would otherwise be read
    // through, and the ~10 bytes a JSON parse failure quotes back would be that
    // file's. Refused before anything opens it, which also keeps a FIFO from
    // blocking the read forever.
    const pack = getPack();
    await pack.seedFiles({ "real.json": "{}" });
    await symlink(pack.path("real.json"), pack.path("pack.sigstore.json"));

    const error = await expectRejection(
      () => readSigstoreBundle(pack.dir, "pack.sigstore.json"),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("not a regular file");
  });

  it("refuses a bundle over the size cap, naming the limit, without reading it", async () => {
    // A detached bundle is single-digit KB. An unbounded read of a declared
    // path is a pack author's lever on the operator's memory, so the cap is a
    // refusal rather than a truncation: half a bundle is not a bundle.
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "" });
    await writeFile(pack.path("pack.sigstore.json"), Buffer.alloc(MAX_SIGSTORE_BUNDLE_BYTES + 1, 0x61));

    const error = await expectRejection(
      () => readSigstoreBundle(pack.dir, "pack.sigstore.json"),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain(String(MAX_SIGSTORE_BUNDLE_BYTES));
  });

  it("reads a bundle sitting exactly on the cap", async () => {
    // The boundary is inclusive, asserted so a later tightening of the
    // comparison shows up here rather than as a mysterious refusal in the field.
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "" });
    await writeFile(pack.path("pack.sigstore.json"), Buffer.alloc(MAX_SIGSTORE_BUNDLE_BYTES, 0x61));

    const bytes = await readSigstoreBundle(pack.dir, "pack.sigstore.json");
    expect(bytes.byteLength).toBe(MAX_SIGSTORE_BUNDLE_BYTES);
  });
});

describe("verifyPublisherSignedClaim", () => {
  // TEST CHANGED, justified: the gate returns the VERDICT now, not a collapsed
  // string, so the outcome is read off `outcome`. Strengthened rather than
  // re-pointed: `toEqual` pins the WHOLE object, which is what asserts that an
  // "n/a" carries no `verifiedBasis` — nothing was proved here, so naming an
  // identity would be an invention.
  it("reports n/a for a manifest with no signing declaration — nothing claimed, nothing waived", async () => {
    await expect(
      verifyPublisherSignedClaim(manifest(), getPack().dir, notYetArmedSigstoreVerifier),
    ).resolves.toEqual({ outcome: "n/a" });
  });

  // TEST CHANGED, justified: the message assertions follow the
  // verifier's reworded reason (above). The refusal — a declared claim with no
  // catalog pin behind it is refused, not waived — is unchanged.
  it("refuses a sigstore claim through the not-armed verifier with the actionable message", async () => {
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "{}" });
    const error = await expectRejection(
      () =>
        verifyPublisherSignedClaim(manifest({ signing: SIGSTORE }), pack.dir, notYetArmedSigstoreVerifier),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("no armed Sigstore verifier");
    expect(error.message).not.toContain("--allow-untrusted");
  });

  // TEST INVERTED, justified. This case pinned the behaviour the
  // finding is about: a pack that DECLARES signing was strictly worse off than
  // the same pack declaring nothing, because the unevaluable claim refused
  // before the verified catalog pin's tier was honoured. The pin names this
  // pack's exact aggregate content SHA and the ladder already refuses a
  // mismatch outright, so it is independent evidence — and an unevaluable
  // claim yields to it. The case below keeps the other half honest: a claim
  // the verifier CHECKED and found false still refuses through the same pin.
  it("lets a verified catalog pin satisfy trust when the claim is unevaluable", async () => {
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "{}" });
    const signed = manifest({ signing: SIGSTORE });
    const pin = pinFor(INTEGRITY, "curator-verified");
    expect(resolveTrustTier(signed, pin).tier).toBe("curator-verified");

    // Whole-object equality again: a claim NOTHING could evaluate must not
    // report a verified basis, or the pin's stand-in would print as a signature.
    await expect(
      verifyPublisherSignedClaim(signed, pack.dir, notYetArmedSigstoreVerifier, {
        catalogPinTier: "curator-verified",
      }),
    ).resolves.toEqual({ outcome: "n/a" });
    // Without the pin the same claim is still refused — the pin is the only
    // thing that stands in, and only for a claim nothing could evaluate.
    await expectRejection(
      () => verifyPublisherSignedClaim(signed, pack.dir, notYetArmedSigstoreVerifier),
      "INTEGRITY_ERROR",
    );
    // A pin at a tier the catalog cannot grant is not a trust basis either.
    await expectRejection(
      () =>
        verifyPublisherSignedClaim(signed, pack.dir, notYetArmedSigstoreVerifier, {
          catalogPinTier: "pinned-unsigned",
        }),
      "INTEGRITY_ERROR",
    );
  });

  it("refuses a claim an ARMED verifier judged false, pin or no pin", async () => {
    const pack = getPack();
    await pack.seedFiles({ "pack.sigstore.json": "{}" });
    const wrong: SigstoreVerifier = {
      // Armed and negative: `unarmed` is absent, so this is evidence that the
      // signature disagrees with the content rather than an absent check.
      verify: () => Promise.resolve({ verified: false, reason: "signature does not match" }),
    };
    const error = await expectRejection(
      () =>
        verifyPublisherSignedClaim(manifest({ signing: SIGSTORE }), pack.dir, wrong, {
          catalogPinTier: "curator-verified",
        }),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("signature does not match");
  });

  it("refuses a sigstore claim whose declared bundle file is missing with INTEGRITY_ERROR", async () => {
    const error = await expectRejection(
      () =>
        verifyPublisherSignedClaim(manifest({ signing: SIGSTORE }), getPack().dir, notYetArmedSigstoreVerifier),
      "INTEGRITY_ERROR",
    );
    expect(error.message).not.toContain("ENOENT");
  });

  it("refuses a sigstore claim that declares no bundlePath — a claim with nothing to verify", async () => {
    const bundleless: TrustSigning = { method: "sigstore", signer: "acme" };
    const error = await expectRejection(
      () =>
        verifyPublisherSignedClaim(
          manifest({ signing: bundleless }),
          getPack().dir,
          notYetArmedSigstoreVerifier,
        ),
      "INTEGRITY_ERROR",
    );
    expect(error.message).toContain("bundlePath");
  });

  it("refuses an unknown signing method on this path too", async () => {
    await expectRejection(
      () =>
        verifyPublisherSignedClaim(
          manifest({ signing: { method: "npm-provenance" } }),
          getPack().dir,
          notYetArmedSigstoreVerifier,
        ),
      "VALIDATION_ERROR",
    );
  });

  it("passes through an armed verifier, handing it the bundle bytes, aggregate SHA and signer", async () => {
    const pack = getPack();
    const bundleJson = '{"verificationMaterial":{}}';
    await pack.seedFiles({ "pack.sigstore.json": bundleJson });

    const seen: { bytes?: string; sha?: string; signer?: string } = {};
    const armed: SigstoreVerifier = {
      verify: (bundleBytes, aggregateSha, signer) => {
        seen.bytes = Buffer.from(bundleBytes).toString("utf8");
        seen.sha = aggregateSha;
        if (signer !== undefined) seen.signer = signer;
        return Promise.resolve({ verified: true, reason: "bundle verified: signed by nobody" });
      },
    };

    // The verdict's reason rides back with the pass, verbatim: it is the one
    // channel the verified IDENTITY has to the operator, and the gate used to
    // drop it on the floor by collapsing every pass to the string "pass".
    await expect(
      verifyPublisherSignedClaim(manifest({ signing: SIGSTORE }), pack.dir, armed),
    ).resolves.toEqual({ outcome: "pass", verifiedBasis: "bundle verified: signed by nobody" });
    expect(seen.bytes).toBe(bundleJson);
    expect(seen.sha).toBe(computeAggregateContentSha(INTEGRITY));
    expect(seen.signer).toBe(SIGNER);
  });
});
