import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { link, mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Bundle } from "sigstore";
import { signPack } from "../../src/pack/sign.ts";
import { createManifest, writeManifest } from "../../src/manifest/manifest.ts";
import { applyPackInstall, planPackInstall } from "../../src/pack/install.ts";
import { verifySigstoreBundle, type SigstoreVerifyFn } from "../../src/pack/sigstoreVerifier.ts";
import { sigstoreSignedPayload, type SigstoreVerifier } from "../../src/pack/trust.ts";
import { useTempDir } from "../support/tempDir.ts";

const getDir = useTempDir("pack-author-signing");
const ISSUER = "https://issuer.example.test";
const IDENTITY = "author@example.test";
const PIN = `${ISSUER} ${IDENTITY}`;
const BODY = '---\nid: signed-example\ntype: rule\ndescription: "Example naming rule"\nglobs: ["src/**"]\n---\nUse descriptive local variable names.\n';
const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

async function seed(bundlePath = "pack.sigstore.json", body = BODY) {
  const root = getDir().dir;
  const pack = join(root, "pack");
  const project = join(root, "project");
  await mkdir(join(pack, "rules"), { recursive: true });
  await mkdir(project, { recursive: true });
  const manifest = {
    name: "author-example", version: "1.0.0", integrity: { "rules/example.md": digest(body) },
    signing: { method: "sigstore", signer: PIN, bundlePath },
  };
  await writeFile(join(pack, "pack.json"), JSON.stringify(manifest));
  await writeFile(join(pack, "rules/example.md"), body);
  return { pack, project, manifest };
}

function cryptoFixture() {
  // The external Fulcio/OIDC/TUF/transparency services require an authorized
  // live identity. This offline fixture substitutes that boundary and uses
  // real ephemeral cryptography, the production payload, identity comparison,
  // integrity checks and install/update writers. It proves no public PKI trust.
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const signFn = vi.fn(async (payload: Buffer): Promise<Bundle> => ({
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: { publicKey: { hint: "ephemeral-local-fixture" },
      certificate: undefined, x509CertificateChain: undefined,
      tlogEntries: [], timestampVerificationData: undefined },
    dsseEnvelope: undefined,
    messageSignature: {
      messageDigest: { algorithm: "SHA2_256", digest: Buffer.from(digest(payload), "hex").toString("base64") },
      signature: sign("sha256", payload, privateKey).toString("base64"),
    },
  }));
  const verifyFn: SigstoreVerifyFn = async (bundle, payload) => {
    if (bundle.messageSignature === undefined ||
      !verify("sha256", payload, publicKey, Buffer.from(bundle.messageSignature.signature, "base64"))) {
      throw new Error("Cryptographic signature mismatch");
    }
    return { identity: { subjectAlternativeName: IDENTITY, extensions: { issuer: ISSUER } } };
  };
  const verifier: SigstoreVerifier = {
    verify: (bytes, aggregateSha, signer) => verifySigstoreBundle(bytes, sigstoreSignedPayload(aggregateSha), {
      ...(signer === undefined ? {} : { signer }), verifyFn,
    }),
  };
  return { signFn, verifyFn, verifier };
}

describe("pack author signing", () => {
  it("signs, verifies, installs and updates exact content with a fresh signature", async () => {
    const { pack, project, manifest } = await seed();
    const fixture = cryptoFixture();
    const signed = await signPack(pack, fixture);
    const plan = await planPackInstall(project, pack, { sigstoreVerifier: fixture.verifier });
    const setup = createManifest({ tools: ["claude"], generatorVersion: "1.6.0", now: new Date(0),
      selection: { items: { agent: [], skill: [], rule: [], command: [] } } });
    const installed = await applyPackInstall(project, plan, setup);
    expect(installed.result.installed).toBe(true);
    await writeManifest(project, installed.manifest);
    expect(plan.trustTier).toBe("publisher-signed");
    expect(plan.tierBasis).toContain(signed.aggregateSha.slice(0, 12));
    const changed = `${BODY}\nPrefer explicit return types at module boundaries.\n`;
    await writeFile(join(pack, "rules/example.md"), changed);
    manifest.version = "1.0.1";
    manifest.integrity["rules/example.md"] = digest(changed);
    await writeFile(join(pack, "pack.json"), JSON.stringify(manifest));
    await expect(planPackInstall(project, pack, { sigstoreVerifier: fixture.verifier })).rejects.toThrow("publisher-signed claim refused");
    const updatedSignature = await signPack(pack, fixture);
    expect(updatedSignature.aggregateSha).not.toBe(signed.aggregateSha);
    const updatedPlan = await planPackInstall(project, pack, { sigstoreVerifier: fixture.verifier });
    const updated = await applyPackInstall(project, updatedPlan, installed.manifest);
    expect(updated.result.installed).toBe(true);
    expect(await readFile(join(project, ".stamity/packs/author-example/rules/example.md"), "utf8")).toBe(changed);
    expect(await readFile(join(pack, signed.bundlePath), "utf8")).not.toContain("PRIVATE KEY");
  });

  it("refuses changed bytes before any signing service call", async () => {
    const { pack } = await seed(); const fixture = cryptoFixture();
    await writeFile(join(pack, "rules/example.md"), "changed");
    await expect(signPack(pack, fixture)).rejects.toThrow("failed integrity verification");
    expect(fixture.signFn).not.toHaveBeenCalled();
  });

  it("refuses a valid signature from the wrong identity without replacing the old bundle", async () => {
    const { pack, manifest } = await seed(); const fixture = cryptoFixture();
    await signPack(pack, fixture);
    const old = await readFile(join(pack, manifest.signing.bundlePath));
    manifest.signing.signer = `${ISSUER} another@example.test`;
    await writeFile(join(pack, "pack.json"), JSON.stringify(manifest));
    await expect(signPack(pack, fixture)).rejects.toThrow("exact signer and payload");
    expect(await readFile(join(pack, manifest.signing.bundlePath))).toEqual(old);
  });

  it("refuses malformed provider bundles", async () => {
    const { pack } = await seed();
    await expect(signPack(pack, { signFn: async () => ({} as Bundle) })).rejects.toThrow("did not verify");
    await expect(readFile(join(pack, "pack.sigstore.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["../outside.json", "/outside.json", "pack.json", "rules/new.json"])("refuses unsafe bundle destination %s before signing", async (path) => {
    const { pack } = await seed(path); const fixture = cryptoFixture();
    await expect(signPack(pack, fixture)).rejects.toThrow();
    expect(fixture.signFn).not.toHaveBeenCalled();
  });

  it.each(["PACK.JSON", "./pack.json", "pack.json.", "pack.json ", "RULES/example.md", "Rules/new.json"])(
    "refuses portable manifest/content alias %s before signing and preserves source bytes", async (path) => {
      const { pack } = await seed(path); const fixture = cryptoFixture();
      const originalManifest = await readFile(join(pack, "pack.json"));
      await expect(signPack(pack, fixture)).rejects.toThrow();
      expect(fixture.signFn).not.toHaveBeenCalled();
      expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
      expect(await readFile(join(pack, "rules/example.md"), "utf8")).toBe(BODY);
    },
  );

  it("refuses a case alias of root integrity metadata before signing", async () => {
    const { pack, manifest } = await seed("README.MD"); const fixture = cryptoFixture();
    await writeFile(join(pack, "readme.md"), "Protected metadata");
    const updated = { ...manifest, integrity: { ...manifest.integrity, "readme.md": digest("Protected metadata") } };
    await writeFile(join(pack, "pack.json"), JSON.stringify(updated));
    const originalManifest = await readFile(join(pack, "pack.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow();
    expect(fixture.signFn).not.toHaveBeenCalled();
    expect(await readFile(join(pack, "readme.md"), "utf8")).toBe("Protected metadata");
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
  });

  it.skipIf(process.platform === "win32")("refuses a bundle ancestor symlink back to the manifest before signing", async () => {
    const { pack } = await seed("signatures/pack.json"); const fixture = cryptoFixture();
    await symlink(".", join(pack, "signatures"));
    const originalManifest = await readFile(join(pack, "pack.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow();
    expect(fixture.signFn).not.toHaveBeenCalled();
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
    expect(await readFile(join(pack, "rules/example.md"), "utf8")).toBe(BODY);
  });

  it.skipIf(process.platform === "win32")("refuses a bundle ancestor redirected into content before signing", async () => {
    const { pack } = await seed("signatures/example.md"); const fixture = cryptoFixture();
    await symlink("rules", join(pack, "signatures"));
    const originalManifest = await readFile(join(pack, "pack.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow();
    expect(fixture.signFn).not.toHaveBeenCalled();
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
    expect(await readFile(join(pack, "rules/example.md"), "utf8")).toBe(BODY);
  });

  it("refuses a hardlinked bundle alias without changing manifest bytes", async () => {
    const { pack } = await seed(); const fixture = cryptoFixture();
    const originalManifest = await readFile(join(pack, "pack.json"));
    await link(join(pack, "pack.json"), join(pack, "pack.sigstore.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow();
    expect(fixture.signFn).not.toHaveBeenCalled();
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
  });

  it.skipIf(process.platform === "win32")("refuses filesystem-identical integrity input through a different link spelling", async () => {
    const { pack, manifest } = await seed(); const fixture = cryptoFixture();
    await writeFile(join(pack, "pack.sigstore.json"), "Protected metadata");
    await symlink("pack.sigstore.json", join(pack, "readme.md"));
    const updated = { ...manifest, integrity: { ...manifest.integrity, "readme.md": digest("Protected metadata") } };
    await writeFile(join(pack, "pack.json"), JSON.stringify(updated));
    const originalManifest = await readFile(join(pack, "pack.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow("aliases a protected pack input");
    expect(fixture.signFn).not.toHaveBeenCalled();
    expect(await readFile(join(pack, "pack.sigstore.json"), "utf8")).toBe("Protected metadata");
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
  });

  it("signs and verifies a detached bundle in an ordinary nested directory", async () => {
    const { pack, project } = await seed("signatures/pack.json"); const fixture = cryptoFixture();
    const originalManifest = await readFile(join(pack, "pack.json"));
    await signPack(pack, fixture);
    expect(fixture.signFn).toHaveBeenCalledOnce();
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
    expect((await planPackInstall(project, pack, { sigstoreVerifier: fixture.verifier })).trustTier).toBe("publisher-signed");
  });

  it.skipIf(process.platform === "win32")("refuses a previously real bundle ancestor replaced during signing", async () => {
    const { pack } = await seed("signatures/pack.json"); const fixture = cryptoFixture();
    await mkdir(join(pack, "signatures"));
    const originalManifest = await readFile(join(pack, "pack.json"));
    const signFn = async (payload: Buffer) => {
      const bundle = await fixture.signFn(payload);
      await rename(join(pack, "signatures"), join(pack, "original-signatures"));
      await symlink(".", join(pack, "signatures"));
      return bundle;
    };
    await expect(signPack(pack, { ...fixture, signFn })).rejects.toThrow();
    expect(fixture.signFn).toHaveBeenCalledOnce();
    expect(await readFile(join(pack, "pack.json"))).toEqual(originalManifest);
    expect(await readFile(join(pack, "rules/example.md"), "utf8")).toBe(BODY);
  });

  it.skipIf(process.platform === "win32")("refuses a symlinked bundle target before signing", async () => {
    const { pack } = await seed(); const fixture = cryptoFixture();
    await symlink(join(pack, "missing"), join(pack, "pack.sigstore.json"));
    await expect(signPack(pack, fixture)).rejects.toThrow("symlinks");
    expect(fixture.signFn).not.toHaveBeenCalled();
  });

  it("withholds provider failure text from the returned error", async () => {
    const { pack } = await seed();
    const providerDetail = "private identity-provider diagnostic";
    const error = await signPack(pack, { signFn: async () => { throw new Error(providerDetail); } }).catch((cause: unknown) => cause);
    expect(String(error)).not.toContain(providerDetail);
    expect(String(error)).toContain("Signing failed");
    expect(error).not.toHaveProperty("cause");
  });

  it("refuses content changed during signing without writing a stale bundle", async () => {
    const { pack } = await seed(); const fixture = cryptoFixture();
    const signFn = async (payload: Buffer) => {
      const bundle = await fixture.signFn(payload);
      await writeFile(join(pack, "rules/example.md"), "changed while signing");
      return bundle;
    };
    await expect(signPack(pack, { ...fixture, signFn })).rejects.toThrow("failed integrity verification");
    await expect(readFile(join(pack, "pack.sigstore.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
