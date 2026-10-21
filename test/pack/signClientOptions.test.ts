import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { signPack } from "../../src/pack/sign.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The options `signPack` hands the real signing client on its default path (debug run
 * 2026-10-21_debug-signing-rehearsal). `src/pack/sign.ts:94-95` calls `sign(payload)` with no
 * options, so every Fulcio and Rekor request runs at the client's default 5,000 ms timeout with
 * two retries (`node_modules/sigstore/dist/config.js:25-26`, `:104-108`). A Rekor upload slower
 * than 5 s that Rekor still accepts is aborted and resent; the identical resend is answered 409,
 * the sign path does not fetch on conflict (`fetchOnConflict: false`, `config.js:104`), and signing
 * fails with TLOG_CREATE_ENTRY_ERROR (CI run 39606298770: attempts timed out at 5,432 and
 * 11,444 ms, the third answered 409 at 13,502 ms).
 *
 * Its own file, apart from `sign.test.ts`, because the module-level `vi.mock("sigstore")` below
 * must not reach that suite's cases.
 */
const seam = vi.hoisted(() => ({ calls: [] as unknown[][] }));

// A spy-and-refuse stand-in for the signing client: the real one needs an authorized OIDC
// identity and live Fulcio/Rekor endpoints, which a unit test cannot reach. It records the
// arguments `signPack` hands it and rejects, so only the options are under test here.
vi.mock("sigstore", () => ({
  sign: (...args: unknown[]): Promise<never> => {
    seam.calls.push(args);
    return Promise.reject(new Error("captured"));
  },
}));

const getDir = useTempDir("pack-sign-client-options");
const PIN = "https://issuer.example.test author@example.test";
const BODY = '---\nid: signed-example\ntype: rule\ndescription: "Example naming rule"\nglobs: ["src/**"]\n---\nUse descriptive local variable names.\n';
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

async function seed(): Promise<string> {
  const pack = join(getDir().dir, "pack");
  await mkdir(join(pack, "rules"), { recursive: true });
  const manifest = {
    name: "author-example", version: "1.0.0", integrity: { "rules/example.md": digest(BODY) },
    signing: { method: "sigstore", signer: PIN, bundlePath: "pack.sigstore.json" },
  };
  await writeFile(join(pack, "pack.json"), JSON.stringify(manifest));
  await writeFile(join(pack, "rules/example.md"), BODY);
  return pack;
}

describe("pack author signing: the signing client's request options", () => {
  it("hands the signing client a request timeout above its 5 s default, so a slow Rekor upload that lands is not resent into a 409", async () => {
    const pack = await seed();
    await expect(signPack(pack)).rejects.toThrow("Signing failed");
    expect(seam.calls).toHaveLength(1);
    const options = seam.calls[0]?.[1] as { timeout?: unknown } | undefined;
    expect(
      typeof options?.timeout === "number" && options.timeout > 5000,
      "signPack leaves the signing client at its 5 s request timeout: a Rekor upload slower than 5 s that lands is resent and answered 409 (TLOG_CREATE_ENTRY_ERROR), CI run 39606298770",
    ).toBe(true);
  });
});
