import { createFsFromVolume, Volume } from "memfs";
import type * as nodeFsPromises from "node:fs/promises";

/**
 * In-memory filesystem for the pure readers and generators (catalog walks, frontmatter parsing,
 * emission planning). Nothing here touches disk. Tests that depend on real filesystem semantics
 * — locking, rename atomicity, fsync — use the temp-directory lane in `./tempDir.ts`.
 */

type FsPromisesApi = typeof nodeFsPromises;

/** Volume root. Keys passed to `seed` and returned by `snapshot` are relative to it. */
const ROOT = "/repo";

export interface VirtualVolume {
  /** Promise-based fs API over the volume, shaped for the fs seams the engine modules accept. */
  readonly fs: FsPromisesApi;
  /** Absolute posix path of the volume root. */
  readonly root: string;
  /** Adds files keyed by root-relative path, creating parent directories. Merges, never resets. */
  seed(files: Record<string, string>): void;
  /** Every file in the volume as root-relative path -> content; empty directories are omitted. */
  snapshot(): Record<string, string>;
}

export function makeVolume(files?: Record<string, string>): VirtualVolume {
  const volume = new Volume();
  volume.mkdirSync(ROOT, { recursive: true });

  const seed = (entries: Record<string, string>): void => {
    const contained = Object.entries(entries).map(
      ([key, content]) => [containedKey(key), content] as const,
    );
    volume.fromJSON(Object.fromEntries(contained), ROOT);
  };

  if (files !== undefined) seed(files);

  return {
    // memfs types its promises API structurally against node's; the cast hands callers the node
    // shape they declare their seams with.
    fs: createFsFromVolume(volume).promises as unknown as FsPromisesApi,
    root: ROOT,
    seed,
    snapshot: () => {
      const json = volume.toJSON(ROOT, {}, true);
      const contents: Record<string, string> = {};
      for (const [key, content] of Object.entries(json)) {
        if (typeof content === "string") contents[key] = content;
      }
      return contents;
    },
  };
}

function containedKey(key: string): string {
  const segments = key
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");

  if (key.startsWith("/") || segments.length === 0 || segments.includes("..")) {
    throw new Error(
      `seed(): ${JSON.stringify(key)} must be a relative path inside the volume root, without ".." segments`,
    );
  }
  return segments.join("/");
}
