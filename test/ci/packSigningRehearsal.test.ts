import { spawnSync } from "node:child_process";
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
import { evaluateWorkflowExpression } from "./workflowExpression.ts";
// @ts-expect-error — native ESM rehearsal script intentionally has no declarations.
import { signingContext, prepareFixtures, verify, RULE, UPDATED_RULE } from "../../scripts/pack-signing-rehearsal.mjs";

const getDir = useTempDir("pack-signing-rehearsal");
const workflowText = readFileSync(fileURLToPath(new URL("../../.github/workflows/pack-signing-rehearsal.yml", import.meta.url)), "utf8");
interface Step { name: string; uses?: string; run?: string; with?: Record<string, unknown> }
const workflow = parse(workflowText) as { on: { push: { branches: string[]; paths: string[] } }; jobs: Record<string, {
  permissions: Record<string, string>; if: string; steps: Step[]; environment?: string;
}> };
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args: string[]) => spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
const env = {
  SIGNING_SOURCE_SHA: "2".repeat(40), GITHUB_SHA: "3".repeat(40), GITHUB_REPOSITORY: "zomarit/stamity",
  GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "zomarit/stamity/.github/workflows/pack-signing-rehearsal.yml@refs/heads/main",
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
    expect(workflow.on.push.branches).toEqual(["main"]);
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

  // W2: the workflow pins no SIGNING_SOURCE_SHA, so the fallback to GITHUB_SHA is the
  // branch every real run takes; only the pinned branch above was covered.
  it("falls back to the execution commit when no source is pinned, and refuses an unusable one", () => {
    const { SIGNING_SOURCE_SHA: _pinned, ...live } = env;
    expect(signingContext(live).sourceSha).toBe(live.GITHUB_SHA);
    expect(signingContext(live).executionSha).toBe(live.GITHUB_SHA);
    expect(() => signingContext({ ...live, GITHUB_SHA: "untrusted" })).toThrow();
  });
});

/**
 * The source the rehearsal signs, read out of the workflow rather than trusted.
 *
 * The rehearsal exists to witness the code that ships, so what it checks out is the claim. A
 * pinned `SIGNING_SOURCE_SHA` used to hold it on a commit that sits on no branch: the proof kept
 * passing while the signing code moved underneath it, and GitHub may prune a dangling commit at
 * any time. The workflow now signs `github.sha` and pins nothing. An override stays readable in
 * the script for a run that must witness an earlier reviewed commit, and these gates are what it
 * would have to survive.
 */
const pinnedSourceShas = (text: string): string[] =>
  [...text.matchAll(/SIGNING_SOURCE_SHA:\s*([a-f0-9]{40})/g)].map((match) => match[1] ?? "");

/** Non-zero covers both answers that disqualify a pin: reachable-but-not-an-ancestor, and unknown. */
const mainCanReach = (sha: string): boolean =>
  git("merge-base", "--is-ancestor", sha, "origin/main").status === 0;

/**
 * Ancestry needs git and a local `origin/main`. A shallow or ref-filtered checkout has neither,
 * and an unanswerable question is a skip rather than a failure — the assertion above it, that the
 * workflow pins nothing at all, runs everywhere and is the one that holds at HEAD.
 */
const ancestryProbe = git("rev-list", "-n", "2", "origin/main");
const ancestryShas = ancestryProbe.status === 0 ? ancestryProbe.stdout.trim().split("\n") : [];
const reachableSha = ancestryShas.at(-1) ?? "";

/** The subset of the Actions path-filter syntax this workflow uses: a literal or a trailing `**`. */
const filterMatches = (pattern: string, path: string): boolean =>
  pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path;

const runShape = (over: { repository?: string; private?: unknown; ref?: string } = {}) => ({
  github: {
    repository: over.repository ?? "zomarit/stamity",
    ref: over.ref ?? "refs/heads/main",
    event: { repository: { private: "private" in over ? over.private : false } },
  },
});

describe("the rehearsal signs the code that ships", () => {
  it("checks the signing source out at this run's commit and pins no frozen source", () => {
    const checkouts = workflow.jobs.prepare!.steps.filter((step) =>
      step.uses?.startsWith("actions/checkout"),
    );
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]!.with).toMatchObject({
      ref: "${{ github.sha }}",
      path: "source",
      "persist-credentials": false,
    });
    expect(pinnedSourceShas(workflowText)).toEqual([]);
    expect(workflowText).not.toContain("env.SIGNING_SOURCE_SHA");
    // The second checkout existed only to copy the reviewed script over the frozen source.
    expect(workflowText).not.toContain("runner/");
    expect(
      workflow.jobs.prepare!.steps.find((step) => step.name === "Prepare bounded signing inputs")?.run,
    ).toContain("node source/scripts/pack-signing-rehearsal.mjs prepare");
  });

  it.skipIf(reachableSha === "")(
    "refuses a source pin main cannot reach and accepts one it can",
    () => {
      // skipped where git or the local `origin/main` ref is unavailable; see ancestryProbe.
      // The sha this unit removed. It sits on no branch, so the check answers false whether the
      // object is still in the clone or was pruned.
      const dangling = "237c6ad915c01f47040e03fb94141c4ab86ffb0f";
      expect(pinnedSourceShas(`env:\n  SIGNING_SOURCE_SHA: ${dangling}\n`)).toEqual([dangling]);
      expect(mainCanReach(dangling)).toBe(false);
      expect(mainCanReach(reachableSha)).toBe(true);
      for (const pin of pinnedSourceShas(workflowText)) {
        expect(mainCanReach(pin), `${pin} is pinned as the signing source, and main cannot reach it`).toBe(true);
      }
    },
  );

  it("re-runs on every input it signs, and on no prose", () => {
    const paths = workflow.on.push.paths;
    for (const changed of [
      "src/pack/sign.ts",
      "src/merge/atomicWrite.ts",
      "package-lock.json",
      "scripts/pack-signing-rehearsal.mjs",
      ".github/workflows/pack-signing-rehearsal.yml",
      "test/ci/packSigningRehearsal.test.ts",
    ]) {
      expect(
        paths.some((pattern) => filterMatches(pattern, changed)),
        `a change to ${changed} leaves the signing proof unrepeated`,
      ).toBe(true);
    }
    for (const unchanged of ["docs/packs-and-trust.md", "SECURITY.md", "website/sidebars.ts"]) {
      expect(
        paths.some((pattern) => filterMatches(pattern, unchanged)),
        `${unchanged} re-runs a live signing job for a prose edit`,
      ).toBe(false);
    }
  });

  it("evaluates every job's condition over repository, privacy and ref", () => {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      const message = (shape: string) => `${name} on ${shape}`;
      expect(evaluateWorkflowExpression(job.if, runShape()), message("the canonical public main")).toBe(true);
      // GitHub sends the flag as a boolean; a webhook that stringifies it means the same thing.
      expect(evaluateWorkflowExpression(job.if, runShape({ private: "false" })), message("a stringified flag")).toBe(true);
      expect(evaluateWorkflowExpression(job.if, runShape({ repository: "afork/stamity" })), message("a fork")).toBe(false);
      expect(evaluateWorkflowExpression(job.if, runShape({ private: true })), message("a private repository")).toBe(false);
      // An absent flag renders as the empty string, which is not 'false'. Fail closed.
      expect(evaluateWorkflowExpression(job.if, runShape({ private: null })), message("an absent privacy flag")).toBe(false);
      expect(evaluateWorkflowExpression(job.if, runShape({ ref: "refs/heads/candidate" })), message("another branch")).toBe(false);
      expect(evaluateWorkflowExpression(job.if, runShape({ ref: "refs/tags/v1.8.0" })), message("a tag")).toBe(false);
    }
  });
});

describe("scripts/sign-pack.mjs failure reporting", () => {
  const signPackCli = (packPath: string) =>
    spawnSync(process.execPath, [join(REPO_ROOT, "scripts/sign-pack.mjs"), packPath], { encoding: "utf8" });
  const GENERIC = "failed; check pack integrity, signer, bundle path and authorized Sigstore access";

  it("prints the engine's own refusal when the integrity map does not match the content", async () => {
    // No signing service is reached or substituted: signPack verifies the integrity map before
    // it asks for a signature, so the real script refuses offline.
    const root = join(getDir().dir, "cli-integrity");
    await prepareFixtures(root, signingContext(env));
    const pack = join(root, "packs", "revision1");
    await writeFile(join(pack, "rules/example.md"), UPDATED_RULE);

    const result = signPackCli(pack);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("INTEGRITY_ERROR");
    expect(result.stderr).toContain("failed integrity verification");
    expect(result.stderr).toContain("rules/example.md");
    expect(result.stderr).toContain("No successful signing is claimed.");
    expect(result.stderr, "a typed refusal still hides behind the generic line").not.toContain(GENERIC);
  });

  it("keeps the generic line for a failure that is not the engine's own", () => {
    // An untyped failure may come from the signing provider, whose text can carry an identity
    // token or a request body. Nothing but the fixed line is printed for it.
    const missing = join(getDir().dir, "no-such-pack");
    const result = signPackCli(missing);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(GENERIC);
    expect(result.stderr, "an untyped failure echoed its own text").not.toContain("ENOENT");
    expect(result.stderr).not.toContain(missing);
  });
});

const page = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

describe("what the pages promise about signing", () => {
  it("tells an author where an identity comes from, because the client has no interactive flow", () => {
    // Read out of the installed client rather than asserted from memory: these are the only two
    // identity sources it offers, so a page naming a third, or none, misdirects an author.
    const text = page("docs/packs-and-trust.md");
    expect(text).toContain("`id-token: write`");
    expect(text).toContain("SIGSTORE_ID_TOKEN");
    expect(text, "the page still promises signing without an identity").not.toContain(
      "No token argument, stored signing key or credential file is needed.",
    );
  });

  it("names the rehearsal's public outputs where the control is claimed", () => {
    const text = page("SECURITY.md");
    expect(text).toContain("transparency log");
    expect(text).toContain("signed fixture packs as run artifacts");
  });
});
