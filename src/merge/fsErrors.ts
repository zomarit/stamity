import { dirname } from "node:path";
import { EngineError } from "../types/errors.ts";

/**
 * Write-side filesystem errno → actionable-message table. A raw Node errno
 * message names the syscall; each entry here is a complete sentence naming the
 * cause and the operator's next step. Notable pairings: Linux quota mounts
 * raise EDQUOT (not ENOSPC) when a user quota is exhausted, so "free disk
 * space" advice would mislead there; ENOENT on a write path means the parent
 * directory vanished (the atomic writer creates parents up front, so this only
 * survives a mid-operation removal).
 */
const FS_ERRNO_MESSAGE: Record<string, (filePath: string) => string> = {
  ENOSPC: (p) => `Not enough disk space to write ${p}. Free up space and re-run the command.`,
  EACCES: (p) =>
    `Permission denied writing ${p}. Check file/directory permissions and confirm the current user has write access.`,
  EDQUOT: (p) =>
    `Filesystem quota exceeded writing ${p}. Free space under your quota or ask an admin to raise it, then re-run.`,
  EROFS: (p) =>
    `Read-only filesystem at ${p}. The mount may be in recovery/snapshot mode — remount read-write and re-run.`,
  EFBIG: (p) =>
    `File too large for the filesystem at ${p}. Move ${dirname(p)} to a filesystem that supports larger files (ext4/APFS/NTFS instead of FAT32).`,
  EMFILE: (p) =>
    `Too many open files writing ${p}. Raise the file-descriptor limit (\`ulimit -n\`) or close other tools holding descriptors, then re-run.`,
  ENFILE: (p) =>
    `System-wide open-file limit reached writing ${p}. Close other processes or raise the system fd limit, then re-run.`,
  EIO: (p) =>
    `Low-level I/O error writing ${p}. The disk may be failing — check kernel logs (dmesg / Console.app) and consider running fsck.`,
  ENOENT: (p) =>
    `Cannot write ${p}: the parent directory ${dirname(p)} does not exist (or a path component was removed mid-operation). Create it with \`mkdir -p ${dirname(p)}\` and re-run the command.`,
};

/**
 * Map a write-side filesystem error to an actionable `FS_ERROR`
 * {@link EngineError}, or return `null` when the errno is not in the table —
 * callers re-throw the original error so unrecognised failures surface
 * unchanged. The original error rides along as `cause`.
 *
 * `filePath` is the path the failed operation was creating or writing (the
 * write target for the temp+rename writer and the parent-directory mkdir, the
 * backup destination for a backup copy), so the message names the file the
 * operator can act on.
 */
export function mapFsErrno(err: unknown, filePath: string): EngineError | null {
  const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
  const messageFor = typeof code === "string" ? FS_ERRNO_MESSAGE[code] : undefined;
  return messageFor === undefined
    ? null
    : new EngineError(messageFor(filePath), { code: "FS_ERROR", cause: err });
}
