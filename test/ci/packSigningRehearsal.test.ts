import { createHash, generateKeyPairSync, sign, verify as verifySignature } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import type { Bundle } from "sigstore";
import { signPack } from "../../src/pack/sign.ts";
import { verifySigstoreBundle, type SigstoreVerifyFn } from "../../src/pack/sigstoreVerifier.ts";
import { sigstoreSignedPayload } from "../../src/pack/trust.ts";
import { readPackManifest, enumeratePackContent, verifyIntegrityMap } from "../../src/pack/manifest.ts";
import { useTempDir } from "../support/tempDir.ts";
// @ts-expect-error — native ESM rehearsal script intentionally has no declarations.
import { signingContext, prepareFixtures, verify, RULE, UPDATED_RULE } from "../../scripts/pack-signing-rehearsal.mjs";

const getDir = useTempDir("pack-signing-rehearsal");
const workflowText = readFileSync(fileURLToPath(new URL("../../.github/workflows/pack-signing-rehearsal.yml", import.meta.url)), "utf8");
interface Step { name: string; uses?: string; run?: string; with?: Record<string, unknown> }
const workflow = parse(workflowText) as { on: { push: { branches: string[] } }; jobs: Record<string, {
  permissions: Record<string, string>; if: string; steps: Step[]; environment?: string;
}> };
const env = {
  SIGNING_SOURCE_SHA: "2".repeat(40), GITHUB_SHA: "3".repeat(40), GITHUB_REPOSITORY: "zomarit/stamity",
  GITHUB_REF: "refs/heads/feat/package-10-finish-implementation",
  GITHUB_WORKFLOW_REF: "zomarit/stamity/.github/workflows/pack-signing-rehearsal.yml@refs/heads/feat/package-10-finish-implementation",
  GITHUB_RUN_ID: "1234", GITHUB_RUN_ATTEMPT: "1",
};
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("nonpublishing remote signing rehearsal", () => {
  it("refuses mismatched repository, ref and unresolved source identity", () => {
    expect(signingContext(env).sourceSha).toBe(env.SIGNING_SOURCE_SHA);
    expect(signingContext(env).executionSha).toBe(env.GITHUB_SHA);
    for (const key of ["SIGNING_SOURCE_SHA", "GITHUB_SHA", "GITHUB_REPOSITORY", "GITHUB_REF", "GITHUB_WORKFLOW_REF"]) {
      expect(() => signingContext({ ...env, [key]: "untrusted" })).toThrow();
    }
  });

  it("prepares two valid immutable unsigned revisions and refuses to overwrite a prior attempt", async () => {
    const root = join(getDir().dir, "rehearsal");
    await prepareFixtures(root, signingContext(env));
    await Promise.all(["revision1", "revision2"].map(async (revision) => {
      const pack = join(root, "packs", revision);
      const manifest = await readPackManifest(pack);
      await expect(verifyIntegrityMap(pack, manifest, await enumeratePackContent(pack))).resolves.toBe("pass");
      expect(manifest.signing?.signer).toBe(signingContext(env).signer);
      expect(existsSync(join(pack, "pack.sigstore.json"))).toBe(false);
    }));
    await expect(prepareFixtures(root, signingContext(env))).rejects.toThrow();
  });

  it("runs actual install/update and every negative using local cryptography with only the remote trust service substituted", async () => {
    const root = join(getDir().dir, "rehearsal");
    const context = signingContext(env);
    await prepareFixtures(root, context);
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const signFn = async (payload: Buffer): Promise<Bundle> => ({
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: { publicKey: { hint: "offline-rehearsal-witness" }, certificate: undefined,
        x509CertificateChain: undefined, tlogEntries: [], timestampVerificationData: undefined },
      dsseEnvelope: undefined,
      messageSignature: { messageDigest: { algorithm: "SHA2_256", digest: Buffer.from(digest(payload), "hex").toString("base64") },
        signature: sign("sha256", payload, privateKey).toString("base64") },
    });
    const verifyFn: SigstoreVerifyFn = async (bundle, payload) => {
      if (!bundle.messageSignature || !verifySignature("sha256", payload, publicKey, Buffer.from(bundle.messageSignature.signature, "base64"))) {
        throw new Error("Invalid local cryptographic witness");
      }
      return { identity: { subjectAlternativeName: `https://github.com/${env.GITHUB_WORKFLOW_REF}`,
        extensions: { issuer: "https://token.actions.githubusercontent.com" } } };
    };
    const results = await Promise.all(["revision1", "revision2"].map(async (revision) => {
      const pack = join(root, "packs", revision);
      const result = await signPack(pack, { signFn, verifyFn });
      return Object.assign({ revision }, result, { bundleSha256: digest(await readFile(join(pack, result.bundlePath))) });
    }));
    await writeFile(join(root, "signing.json"), JSON.stringify({ ...context, complete: true, results }));
    await verify(root, context, { sigstoreVerifier: {
      verify: (bytes: Buffer, sha: string, signer?: string) => verifySigstoreBundle(bytes, sigstoreSignedPayload(sha), {
        ...(signer === undefined ? {} : { signer }), verifyFn,
      }),
    } });
    const receipt = JSON.parse(await readFile(join(root, "verification.json"), "utf8"));
    expect(receipt.passed).toBe(true);
    expect(receipt.results.filter((row: { refused?: boolean }) => row.refused)).toHaveLength(5);
    expect(receipt.results.filter((row: { installed?: boolean }) => row.installed)).toHaveLength(2);
    expect(await readFile(join(root, "packs/revision1/rules/example.md"), "utf8")).toBe(RULE);
    expect(await readFile(join(root, "packs/revision2/rules/example.md"), "utf8")).toBe(UPDATED_RULE);
  });

  it("isolates OIDC to the signing job with no publication or deployment capability", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["prepare", "sign", "verify"]);
    expect(workflow.on.push.branches).toEqual(["feat/package-10-finish-implementation"]);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(job.permissions).toEqual(name === "sign" ? { contents: "read", "id-token": "write" } : { contents: "read" });
      expect(job.environment).toBeUndefined();
      expect(job.if).toContain("github.repository == 'zomarit/stamity'");
      expect(job.if).toContain("github.event.repository.private");
      for (const step of job.steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      expect(job.steps.find((step) => step.name === "Bound runner egress")?.with?.["egress-policy"]).toBe("block");
    }
    expect(workflowText).not.toMatch(/npm publish|gh release|secrets\.|environment:|pull_request_target/);
    expect(workflow.jobs.sign!.steps.filter((step) => step.uses?.startsWith("actions/checkout"))).toHaveLength(0);
    expect(workflow.jobs.sign!.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/npm ci|npm install/);
  });
});
