import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PRIVATE_TMP_PREFIX } from "./globalSetup.ts";

/**
 * A cleanup that returns before the removal: the tree is renamed into `<private temp root>/.trash/`
 * and the run's global teardown removes it with the root, after the last test and outside any hook
 * timeout. For the `afterAll` hooks whose trees are large enough that removing them in place
 * outlasted the 20s hook timeout under concurrent load (see `./globalSetup.ts`).
 *
 * A rename is one metadata operation on the same volume, and every tree a suite made under
 * `tmpdir()` is on the private root's volume. When `root` is not a private root (the file runs
 * under a config without one) or the rename is refused (a handle still open on Windows, another
 * volume), the tree is removed in place, as before. A missing tree is already clean.
 */
export function lazyCleanup(dir: string, root: string = tmpdir()): void {
  if (!existsSync(dir)) return;
  if (basename(root).startsWith(PRIVATE_TMP_PREFIX)) {
    const trash = join(root, ".trash");
    try {
      mkdirSync(trash, { recursive: true });
      renameSync(dir, join(trash, randomUUID()));
      return;
    } catch {
      // Refused: fall through to the in-place removal below, which is the old behaviour.
    }
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
