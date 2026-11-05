import type { SpawnSyncReturns } from "node:child_process";

/**
 * The limit on one sync child that reads stdin: a hook, a guard or a runner. A sync child blocks the
 * worker, so vitest's case budget cannot fire: only the call's own `timeout` ends a hung child, and
 * on 2026-11-05 one hung for 31 minutes.
 *
 * It bounds a hang, not a speed. On POSIX 15 s sits under the 20 s case budget. On win32 every file
 * using this runs in the `parallel` project, whose 120 s budget was set because a starved runner took
 * one child past 20 s (`vitest.config.ts`), so 60 s lets a healthy child ride out that stall and still
 * ends a hang well inside the case. `test/ci/testScheduling.test.ts` holds both values to their budgets.
 */
export function childTimeout(platform: NodeJS.Platform = process.platform): number {
  return platform === "win32" ? 60_000 : 15_000;
}

export const CHILD_TIMEOUT_MS = childTimeout();

/**
 * For a wrapper that reports `status ?? -1`: a child stopped by its limit has no status, and would
 * fail its case as a bare `-1` with empty stderr. This names the limit instead. Only that error
 * throws: a child that ran but left its input unread reports EPIPE beside a status of its own.
 */
export function throwOnChildTimeout(result: SpawnSyncReturns<string>): void {
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") throw result.error;
}
