import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

/**
 * Bounded reads of a regular file, shared by the detection readers and the
 * ready report. Node built-ins only, so every detect module can read through
 * it whatever its depth.
 */

/** The bytes repository detection reads from one root file; a file past it reads as absent. */
export const DETECT_READ_MAX_BYTES = 1_048_576;

/**
 * Up to `maxBytes` from the start of a regular file (a link, a FIFO or a device
 * is refused before it is opened, and re-checked on the handle), `truncated`
 * when more was there; `null` when it is not one or does not read. The buffer
 * is the file's size, at most `maxBytes`, plus the one byte that shows more.
 */
export async function readHead(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean } | null> {
  const opened = await openRegular(path);
  if (opened === null) return null;
  const { handle, size } = opened;
  try {
    const buffer = Buffer.alloc(Math.min(size, maxBytes) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    // A full buffer is one byte past the handle's size or past `maxBytes`: more was there than was read.
    return { text: buffer.toString("utf8", 0, Math.min(filled, maxBytes)), truncated: filled === buffer.length };
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** The last `maxBytes` of a regular file, or `null` as {@link readHead}. */
export async function readTail(path: string, maxBytes: number): Promise<string | null> {
  const opened = await openRegular(path);
  if (opened === null) return null;
  const { handle, size } = opened;
  try {
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    let filled = 0;
    while (filled < buffer.length) {
      // eslint-disable-next-line no-await-in-loop -- one descriptor read in order: each read starts where the last one ended
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, start + filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return buffer.toString("utf8", 0, filled);
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * A read handle on a regular file and the size its own `stat` gave, or `null`.
 * `lstat` first; the open never follows a link and never waits on a FIFO
 * swapped in since, and the handle's `stat` checks the open file again.
 */
async function openRegular(path: string): Promise<{ handle: Awaited<ReturnType<typeof open>>; size: number } | null> {
  try {
    if (!(await lstat(path)).isFile()) return null;
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stats = await handle.stat().catch(() => null);
    if (stats?.isFile() === true) return { handle, size: stats.size };
    await handle.close().catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}
