import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One whole-tree leak-gate run per test file process, shared by every case that reads it.
 *
 * `test/ci/leakGate.test.ts` asserted four properties of the gate's output and spawned the gate
 * once per property, and `test/docsPages.test.ts` spawned it a fifth time: five scans of the same
 * tree, each the costliest step of its case. The gate's answer cannot change between two cases of
 * one file, because no case writes into the tree it scans, so every case now reads one result.
 *
 * The memo lives in module scope and nowhere else. Vitest gives each test file its own module
 * graph, so a full suite still runs the gate once per file that reads it (twice today), and a
 * file written into the tree between two suite runs is always scanned. A cache on disk, or one
 * shared across processes, would hide exactly that file.
 *
 * Lane discipline (`test/support/support.test.ts`): this module imports nothing from `src/` or
 * `scripts/`. The gate runs across a process boundary, as it does in CI.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GATE = join(REPO_ROOT, "scripts", "leak-gate.mjs");

/**
 * Wall-clock budget for one whole-repository gate run, derived rather than inherited.
 *
 * Every case that reads the gate may be the one that spawns it (the first to run, or the only
 * one a filtered run selects), so each is bounded by the gate's cost — and the suite-wide default
 * (20s in `vitest.config.ts`, sized for a CLI spawn) is not that number. It read as one until the
 * gate's wall time doubled and the failure that reached CI was a TIMEOUT: a red with no cost in
 * it, on the floor and LTS legs only, saying nothing about what got slower or by how much.
 *
 * The basis, so the next person can re-derive it instead of guessing:
 *   local wall time   16s   — `time node scripts/leak-gate.mjs`, three runs, 15.81-16.13s over
 *                             5,561 files, node start included. It was 3.3s over 852 files when
 *                             this budget was first derived; the tree grew because every run
 *                             export publishes each attempt's output under `evals/runs/<run>/calls/`,
 *                             and the gate reads all of them — by design, so nothing is excluded.
 *   CI ratio          2x    — the runner class is about half this machine's speed
 *   margin            4x    — a shared runner with a cold file cache, not a second budget
 *   = 16 x 2 x 4 ≈ 128s, rounded up to 180s
 *
 * So a CI leg twice as slow as expected still REPORTS the gate's true cost, and only a gate that
 * has become roughly eleven times its local wall time trips this — where a timeout is the
 * finding. The 30s this replaced was derived against a tree six times smaller, and on the floor
 * and Windows legs of 4b2d8d9 it turned the gate's growth into a timeout that named no cost.
 */
export const GATE_RUN_TIMEOUT_MS = 180_000;

/** What one gate run returned: its exit status (-1 when it never exited) and both streams. */
export interface LeakGateResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

let memo: LeakGateResult | undefined;
let spawns = 0;

/**
 * The gate's result over the repository as it stands. The first call spawns
 * `node scripts/leak-gate.mjs` at the repository root; every later call in this process returns
 * the same frozen object.
 */
export function runLeakGateOnce(): LeakGateResult {
  if (memo !== undefined) return memo;
  spawns += 1;
  memo = leakGateResultOf(spawnSync(process.execPath, [GATE], { cwd: REPO_ROOT, encoding: "utf-8" }));
  return memo;
}

/**
 * One spawn's outcome as the frozen shared result. A spawn that never ran (or overflowed its
 * buffer) has no exit status, and one killed by a signal (an out-of-memory kill, a cancelled step)
 * has neither a status nor an error: the error or the signal is the only account of why, so it
 * rides in stderr rather than vanishing behind `exit -1`.
 */
export function leakGateResultOf(
  result: Pick<SpawnSyncReturns<string>, "status" | "signal" | "stdout" | "stderr"> & { readonly error?: Error },
): LeakGateResult {
  const error = result.error === undefined ? "" : String(result.error);
  const signal = result.signal === null ? "" : `killed by ${result.signal}`;
  return Object.freeze({
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${error}${signal}`,
  });
}

/** How many times this process has spawned the gate — the memo's own proof. */
export function leakGateSpawnCount(): number {
  return spawns;
}

/**
 * Test-only: replace the shared result (or clear it with `undefined`) and return the one it
 * replaced, so a case proving that a failing gate fails its readers can restore the real result.
 * Setting a result spawns nothing and does not move `leakGateSpawnCount()`.
 */
export function setLeakGateResultForTest(result: LeakGateResult | undefined): LeakGateResult | undefined {
  const previous = memo;
  memo = result === undefined ? undefined : Object.freeze({ ...result });
  return previous;
}

/**
 * The empty string for a passing run, otherwise its exit status and both streams — the one
 * message a reader asserts empty, so a red names what the gate printed.
 */
export function leakGateFailureDetail(result: LeakGateResult): string {
  return result.status === 0 ? "" : `exit ${String(result.status)}\n${result.stdout}${result.stderr}`;
}
