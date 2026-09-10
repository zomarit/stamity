import { lstat, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Bundle } from "sigstore";
import { atomicWriteFile, assertWriteTargetContained } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import { enumeratePackContent, PACK_CONTENT_CLASSES, PACK_MANIFEST_FILE, readPackManifest, verifyIntegrityMap, type PackManifest } from "./manifest.ts";
import { verifySigstoreBundle, type SigstoreVerifyFn } from "./sigstoreVerifier.ts";
import { computeAggregateContentSha, MAX_SIGSTORE_BUNDLE_BYTES, sigstoreSignedPayload } from "./trust.ts";

export interface SignPackOptions {
  /** Offline fixtures replace the external identity service, never the payload. */
  signFn?: (payload: Buffer) => Promise<Bundle>;
  verifyFn?: SigstoreVerifyFn;
}

/** Cross-platform reservations are independent of the author's current filesystem. */
function foldedPath(path: string): string {
  return path.normalize("NFC").toLowerCase();
}

/**
 * The bundle is output, never an alias of an input. Containment alone does not
 * establish this: an in-pack directory symlink can point back to pack.json,
 * and case-insensitive filesystems can give one file several path spellings.
 * Check again after an interactive signing flow, before the atomic writer pins
 * its destination parent and performs its own containment/race checks.
 */
async function assertBundleDestination(root: string, manifest: PackManifest, bundlePath: string): Promise<string> {
  const segments = bundlePath.split("/");
  const reserved = new Set([PACK_MANIFEST_FILE, ...Object.keys(manifest.integrity)].map(foldedPath));
  const folded = foldedPath(bundlePath);
  if (segments.some((segment) => segment === "" || segment === "." || segment.includes(":") || /[ .]$/.test(segment)) ||
    reserved.has(folded) || PACK_CONTENT_CLASSES.some((name) => folded === name || folded.startsWith(`${name}/`))) {
    throw new EngineError("The detached bundle must use an unambiguous path outside the manifest, content classes and integrity map.", {
      code: "VALIDATION_ERROR",
    });
  }
  const target = resolve(root, bundlePath);
  await assertWriteTargetContained(target, root);
  const paths = segments.map((_, index) => join(root, ...segments.slice(0, index + 1)));
  const entries = await Promise.all(paths.map(async (path) => {
    try {
      return await lstat(path, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }));
  if (entries.some((entry, index) => entry !== undefined &&
    (entry.isSymbolicLink() || (index < entries.length - 1 && !entry.isDirectory())))) {
    throw new EngineError("The detached bundle path must not contain symlinks or non-directory ancestors.", {
      code: "INTEGRITY_ERROR",
    });
  }
  const existing = entries.at(-1);
  if (existing !== undefined) {
    if (!existing.isFile() || existing.nlink > 1n) {
      throw new EngineError("The detached bundle target must be a regular, unshared file; symlinks are refused.", {
        code: "INTEGRITY_ERROR",
      });
    }
    // Filesystem identity catches aliases whose spelling rules are not captured
    // by portable case folding, including provider-specific filename aliases.
    // stat follows input links just as the manifest/integrity readers do.
    const protectedFiles = await Promise.all([PACK_MANIFEST_FILE, ...Object.keys(manifest.integrity)]
      .map((path) => stat(join(root, path), { bigint: true })));
    if (protectedFiles.some((entry) => entry.dev === existing.dev && entry.ino === existing.ino)) {
      throw new EngineError("The detached bundle target aliases a protected pack input.", { code: "INTEGRITY_ERROR" });
    }
  }
  return target;
}

/** Sign the existing manifest payload and publish only a locally verified bundle. */
export async function signPack(packRoot: string, options: SignPackOptions = {}): Promise<{
  bundlePath: string;
  aggregateSha: string;
}> {
  const root = await realpath(resolve(packRoot));
  const manifest = await readPackManifest(root);
  const signing = manifest.signing;
  if (signing?.method !== "sigstore" || signing.signer === undefined || signing.bundlePath === undefined) {
    throw new EngineError("Author signing requires signing.method sigstore, signer and bundlePath in pack.json.", {
      code: "VALIDATION_ERROR",
    });
  }
  const target = await assertBundleDestination(root, manifest, signing.bundlePath);
  const files = await enumeratePackContent(root);
  await verifyIntegrityMap(root, manifest, files);
  const aggregateSha = computeAggregateContentSha(manifest.integrity);
  const payload = sigstoreSignedPayload(aggregateSha);
  let bundle: Bundle;
  try {
    const sign = options.signFn ?? (await import("sigstore")).sign;
    bundle = await sign(payload);
  } catch {
    // Provider failures can include identity tokens or request bodies. Do not
    // attach the cause or copy provider text into logs, artifacts or exceptions.
    throw new EngineError("Signing failed. Check the authorized OIDC identity and Sigstore network access; no bundle was written.", {
      code: "INTEGRITY_ERROR",
    });
  }
  const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`);
  if (bytes.length > MAX_SIGSTORE_BUNDLE_BYTES) {
    throw new EngineError("The signing provider returned a bundle over the accepted size limit.", { code: "INTEGRITY_ERROR" });
  }
  const verdict = await verifySigstoreBundle(bytes, payload, {
    signer: signing.signer,
    ...(options.verifyFn === undefined ? {} : { verifyFn: options.verifyFn }),
  });
  if (!verdict.verified) {
    throw new EngineError("The produced bundle did not verify against the manifest's exact signer and payload; no bundle was written.", {
      code: "INTEGRITY_ERROR",
    });
  }
  // An interactive identity flow can take time. Refuse concurrent source or
  // manifest edits before replacing the old bundle with a now-stale signature.
  const current = await readPackManifest(root);
  if (JSON.stringify(current) !== JSON.stringify(manifest)) {
    throw new EngineError("The pack manifest changed while signing; sign the current inputs again.", { code: "INTEGRITY_ERROR" });
  }
  await verifyIntegrityMap(root, current, await enumeratePackContent(root));
  await assertBundleDestination(root, current, signing.bundlePath);
  await atomicWriteFile(target, bytes.toString("utf8"), { boundaryDir: root });
  return { bundlePath: signing.bundlePath, aggregateSha };
}
