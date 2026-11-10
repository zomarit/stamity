import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CliContext } from "../kit/program.ts";

/**
 * How the CLI reads whether this session is unattended, from the run records' heads. `learn` and `skill add` both
 * refuse an attended-only act through {@link unattendedSession}; the two verbs sit in one wave as different units, so
 * neither may import the other, and the one reading they share lives here, below both.
 */

/** At most `bytes` of `path`, or `null` where it is absent or is not a regular file: a link is no record. */
export async function headOf(path: string, bytes: number): Promise<string | null> {
  const entry = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return null;
    throw cause;
  });
  if (entry === null || !entry.isFile()) return null;
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(bytes), 0, bytes, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * What makes this session unattended, or `null`, as the shell guard reads it (`unattendedBy`, `../../hooks/scripts.ts`):
 * a run in progress reading `Mode: unattended`, else `STAMITY_UNATTENDED` set with no run in progress reading
 * `Mode: attended`. Never the named run's own `Mode:` alone: an unattended run that closed is the one whose proposal a
 * person walks in the morning, so that line would refuse the very accept `learn accept` exists for. A read that fails
 * refuses, since it leaves the mode unknown. `skill add` reads the session through this one function too.
 */
export async function unattendedSession(ctx: CliContext, rootDir: string): Promise<string | null> {
  const { layout, resumeCard } = ctx.engine.runs;
  const runsDir = join(rootDir, ...layout.RUNS_SEGMENTS);
  try {
    const entries = await readdir(runsDir, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT" || cause.code === "ENOTDIR") return [];
      throw cause;
    });
    const runs = entries.filter((entry) => entry.isDirectory() && layout.isRunId(entry.name)).map((entry) => entry.name);
    const heads = await Promise.all(
      runs.map(async (run) => {
        const record = await headOf(join(runsDir, run, layout.RECORD_FILE), layout.RECORD_HEAD_READ_BYTES);
        return { run, head: record === null ? null : resumeCard.readRecordHead(record) };
      }),
    );
    const running = heads.filter(({ head }) => head?.inProgress === true);
    const held = running.find(({ head }) => head?.mode === "unattended");
    if (held !== undefined) return `${layout.runRelPath(held.run)}/${layout.RECORD_FILE} reads \`Status: in progress\` and \`Mode: unattended\``;
    if (running.some(({ head }) => head?.mode === "attended")) return null;
    return resumeCard.readsUnattended(null, ctx.app.runtime.env["STAMITY_UNATTENDED"])
      ? "STAMITY_UNATTENDED is set and no in-progress run record reads `Mode: attended`"
      : null;
  } catch (cause) {
    return `the run records could not be read (${cause instanceof Error ? cause.message : String(cause)})`;
  }
}
