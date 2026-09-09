import type * as FsPromises from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { useTempDir } from "../support/tempDir.ts";

/**
 * What the candidate scan does when the PROCESS runs out of file handles, and
 * how many it asks for in the first place.
 *
 * Its own file because it is the one case in this module that cannot be staged
 * on a real filesystem: EMFILE is a property of the process, not of the tree,
 * so the only honest way to produce one is to make `node:fs/promises` answer
 * with it. The rest of `detect`'s suite runs against real temp directories and
 * must not inherit this mock.
 */

const control = vi.hoisted(() => ({
  /** Absolute directory whose `readdir` answers EMFILE, or `null` for none. */
  exhaustAt: null as string | null,
  /** `stat` calls in flight right now, and the high-water mark across the run. */
  inFlight: 0,
  peak: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readdir: async (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) => {
      if (control.exhaustAt !== null && String(path) === control.exhaustAt) {
        const error = new Error("EMFILE: too many open files, scandir") as NodeJS.ErrnoException;
        error.code = "EMFILE";
        throw error;
      }
      return (actual.readdir as (...args: unknown[]) => Promise<unknown>)(path, ...rest);
    },
    stat: async (...args: Parameters<typeof actual.stat>) => {
      control.inFlight += 1;
      control.peak = Math.max(control.peak, control.inFlight);
      try {
        return await actual.stat(...args);
      } finally {
        control.inFlight -= 1;
      }
    },
  };
});

const { detectSubRepos } = await import("../../src/workspace/detect.ts");

const getRoot = useTempDir("workspace-detect-exhaustion");

const gitRepo = (path: string): Record<string, string> => ({
  [`${path}/.git/HEAD`]: "ref: main\n",
});

describe("detectSubRepos under descriptor exhaustion", () => {
  it("fails loudly on EMFILE rather than reporting a shorter candidate list", async () => {
    const root = getRoot();
    await root.seedFiles({
      "team/api/.git/HEAD": "ref: main\n",
      "team/web/.git/HEAD": "ref: main\n",
      ...gitRepo("solo"),
    });

    // Baseline: with descriptors to spare, the walk finds all three.
    control.exhaustAt = null;
    expect((await detectSubRepos(root.dir)).map((repo) => repo.path)).toEqual([
      "solo",
      "team/api",
      "team/web",
    ]);

    // And with the second level unreadable for want of a handle, the run does
    // NOT come back with `solo` alone and a straight face. EMFILE is not "no
    // repository here" — it is "this directory was never read".
    control.exhaustAt = join(root.dir, "team");
    await expect(detectSubRepos(root.dir)).rejects.toMatchObject({ code: "EMFILE" });
    control.exhaustAt = null;
  });

  it("bounds how many probes it has in flight, so a wide root cannot cause one", async () => {
    const root = getRoot();
    // Sixty entries at one level: under the old unbounded `Promise.all` every
    // one of them was probed at once, which is the shape that reaches EMFILE.
    const seed: Record<string, string> = {};
    for (let index = 0; index < 60; index += 1) {
      seed[`repo-${String(index).padStart(2, "0")}/.git/HEAD`] = "ref: main\n";
    }
    await root.seedFiles(seed);

    control.peak = 0;
    expect(await detectSubRepos(root.dir)).toHaveLength(60);
    expect(control.peak, "the walk probed the whole level at once").toBeLessThanOrEqual(32);
    expect(control.peak, "no probe ran at all — the counter is not wired").toBeGreaterThan(0);
  });
});
