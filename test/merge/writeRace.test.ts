import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import * as realFsPromises from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as AtomicWriteApi from "../../src/merge/atomicWrite.ts";
import type * as ReclaimApi from "../../src/merge/reclaim.ts";
import { atomicWriteFile } from "../../src/merge/atomicWrite.ts";
import type { ReclaimCandidate } from "../../src/manifest/ledger.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * TOCTOU lane: what happens when the filesystem changes BETWEEN a safety check
 * and the syscall that check authorised.
 *
 * A path is a lookup instruction, not a handle on an object. Every gate in
 * `reclaim.ts`, and every containment decision a caller of `atomicWrite.ts`
 * makes, is a statement about the object a path resolved to at one instant; the
 * unlink or the rename happens at a later one. These tests drive a writer into
 * exactly that gap and assert the operation refuses rather than landing
 * somewhere the gate never approved.
 *
 * The race is made deterministic by module-replacing one filesystem call inside
 * the subject's own sequence. A real concurrent writer hits the same window
 * probabilistically (the review measured 48/300 trials on a realistic pack
 * path), and a probabilistic test of a security property is not a test.
 *
 * Real filesystem throughout: symlink resolution and inode identity are kernel
 * properties an in-memory volume does not reproduce.
 */
/* oxlint-disable no-await-in-loop */

const getTempDir = useTempDir("stamity-write-race");

interface Fixture {
  root: string;
  outside: string;
  /** The real directory the recorded path's parent resolves to before the swap. */
  realParent: string;
}

/**
 * `<temp>/repo/.cursor/rules/<name>` inside, `<temp>/outside/<name>` as the victim.
 *
 * TEST CHANGE, justified: REQ-PLUGIN-045 — the recorded file sat under a
 * root-level `pkg/`, a folder no release writes, so gate 1 now refuses it
 * before the race window opens. It sits in a rule folder the engine writes,
 * and its row records the hash of its bytes (below), which an engine-named
 * delete now needs; the race under test is unchanged.
 */
const PARENT = ".cursor/rules";
const ENGINE_BYTES = "engine output\n";

async function seed(name: string, victimBytes: string): Promise<Fixture> {
  const base = getTempDir().dir;
  const root = join(base, "repo");
  const outside = join(base, "outside");
  const realParent = join(root, ".cursor", "rules");
  await mkdir(realParent, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(realParent, name), ENGINE_BYTES, "utf8");
  await writeFile(join(outside, name), victimBytes, "utf8");
  return { root, outside, realParent };
}

/** Replace `repo/.cursor/rules` (a real directory) with a symlink pointing out of the repo. */
async function swapParentForSymlink(fixture: Fixture): Promise<void> {
  await rm(fixture.realParent, { recursive: true, force: true });
  await symlink(fixture.outside, fixture.realParent, "dir");
}

function candidate(path: string): ReclaimCandidate {
  return {
    entry: {
      path,
      adapter: "cursor",
      artifactId: `artifact:${path}`,
      artifactType: "rule",
      // TEST CHANGE, justified: REQ-PLUGIN-045 — see `seed`.
      contentHash: createHash("sha256").update(ENGINE_BYTES).digest("hex"),
    },
    reason: "deselected",
  };
}

/**
 * The running engine's rendering at `path`: the bytes `seed` writes there.
 *
 * TEST CHANGE, justified (2026-10-08, row 560, unit d1a-rendering-proof-core):
 * an engine-named file in a content folder is now deleted only when its bytes
 * are a rendering the running engine produces at the path, not on a recorded
 * hash alone. The races below open after that proof, so each sweep is handed
 * the rendering a real sweep would read; the assertions are unchanged.
 */
function renderedAt(path: string): Map<string, Set<string>> {
  return new Map([[path, new Set([createHash("sha256").update(ENGINE_BYTES).digest("hex")])]]);
}

describe("reclaim sweep — the tree moves between the gate and the unlink", () => {
  it("refuses the delete instead of unlinking whatever the new symlink points at", async () => {
    const name = "stamity-orphan.md";
    const fixture = await seed(name, "a stranger's file\n");

    // The swap lands in the sweep's own window: `planFor` reads the candidate's
    // bytes at gate 4 and the unlink follows, so swapping the parent directory
    // for a symlink right after that read reproduces the concurrent writer.
    let swapped = false;
    vi.resetModules();
    const patched = {
      ...realFsPromises,
      readFile: async (...args: Parameters<typeof realFsPromises.readFile>) => {
        const bytes = await realFsPromises.readFile(...args);
        if (!swapped) {
          swapped = true;
          await swapParentForSymlink(fixture);
        }
        return bytes;
      },
    };
    vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
    const mod: typeof ReclaimApi = await import("../../src/merge/reclaim.ts");

    try {
      const report = await mod.sweepReclaimCandidates([candidate(`${PARENT}/${name}`)], {
        rootDir: fixture.root,
        consent: true,
        renderings: renderedAt(`${PARENT}/${name}`),
      });

      expect(swapped).toBe(true);
      expect(report.deletedCount).toBe(0);
      expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
      expect(report.entries[0]?.detail).toContain("changed under the sweep");
      // The victim is the whole point: still on disk, byte-identical.
      expect(await readFile(join(fixture.outside, name), "utf8")).toBe("a stranger's file\n");
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });

  it("refuses the delete when the recorded file itself becomes a different inode", async () => {
    const name = "stamity-swapped.md";
    const fixture = await seed(name, "unrelated\n");
    const target = join(fixture.realParent, name);

    let swapped = false;
    vi.resetModules();
    const patched = {
      ...realFsPromises,
      readFile: async (...args: Parameters<typeof realFsPromises.readFile>) => {
        const bytes = await realFsPromises.readFile(...args);
        if (!swapped) {
          swapped = true;
          // Same name, different object — the substitution an identity check
          // exists to catch and a path check cannot see.
          const decoy = join(fixture.realParent, "decoy");
          await writeFile(decoy, "attacker bytes\n", "utf8");
          await rename(decoy, target);
        }
        return bytes;
      },
    };
    vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
    const mod: typeof ReclaimApi = await import("../../src/merge/reclaim.ts");

    try {
      const report = await mod.sweepReclaimCandidates([candidate(`${PARENT}/${name}`)], {
        rootDir: fixture.root,
        consent: true,
        renderings: renderedAt(`${PARENT}/${name}`),
      });

      expect(report.deletedCount).toBe(0);
      expect(report.entries[0]?.action).toBe("skipped-unsafe-path");
      expect(await readFile(target, "utf8")).toBe("attacker bytes\n");
    } finally {
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });

  it("still deletes when nothing moves under it", async () => {
    const name = "stamity-quiet.md";
    const fixture = await seed(name, "unrelated\n");

    const { sweepReclaimCandidates } = await import("../../src/merge/reclaim.ts");
    const report = await sweepReclaimCandidates([candidate(`${PARENT}/${name}`)], {
      rootDir: fixture.root,
      consent: true,
      renderings: renderedAt(`${PARENT}/${name}`),
    });

    expect(report.deletedCount).toBe(1);
    // The parent pruned itself once its last file was gone.
    expect(await readdir(fixture.root)).toEqual([]);
  });
});

describe("atomicWriteFile — where the bytes are allowed to land", () => {
  it("refuses a write whose parent directory resolves outside the boundary", async () => {
    const base = getTempDir().dir;
    const root = join(base, "b-repo");
    const outside = join(base, "b-outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(root, "linked"), "dir");

    await expect(
      atomicWriteFile(join(root, "linked", "landed.md"), "payload", { boundaryDir: root }),
    ).rejects.toMatchObject({ code: "FS_ERROR" });

    expect(await readdir(outside)).toEqual([]);
  });

  it("writes normally when the parent is genuinely inside the boundary", async () => {
    const root = join(getTempDir().dir, "b-ok");
    await mkdir(join(root, "nested"), { recursive: true });
    const target = join(root, "nested", "landed.md");

    await atomicWriteFile(target, "payload", { boundaryDir: root });

    expect(await readFile(target, "utf8")).toBe("payload");
  });

  it("aborts the write when the parent directory is swapped mid-flight", async () => {
    const base = getTempDir().dir;
    const root = join(base, "s-repo");
    const outside = join(base, "s-outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });

    // `stat` on the parent runs exactly twice: the pin before the first byte,
    // and the re-read before the rename. Swapping between them is the window.
    let statCalls = 0;
    vi.resetModules();
    const patched = {
      ...realFsPromises,
      stat: async (...args: Parameters<typeof realFsPromises.stat>) => {
        const info = await realFsPromises.stat(...args);
        if (args[0] === root && statCalls++ === 0) {
          await rm(root, { recursive: true, force: true });
          await symlink(outside, root, "dir");
        }
        return info;
      },
    };
    vi.doMock("node:fs/promises", () => ({ ...patched, default: patched }));
    const mod: typeof AtomicWriteApi = await import("../../src/merge/atomicWrite.ts");

    try {
      process.env["STAMITY_LOCK"] = "0";
      await expect(mod.atomicWriteFile(join(root, "landed.md"), "payload")).rejects.toMatchObject({
        code: "FS_ERROR",
      });
      // Nothing published into the directory the symlink redirected to.
      expect(await readdir(outside)).toEqual([]);
    } finally {
      delete process.env["STAMITY_LOCK"];
      vi.doUnmock("node:fs/promises");
      vi.resetModules();
    }
  });
});
