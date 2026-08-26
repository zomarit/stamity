import { randomBytes } from "node:crypto";

/**
 * Process-stable correlation id: 8 hex characters over 4 crypto-random bytes,
 * minted lazily on first read and cached for the life of the process, so
 * importing this module has no side effect.
 *
 * Two consumers set the contract. Temp files and journal entries suffix it, so
 * two runs against the same repo never collide on a path. The prompt guard
 * salts its boundary markers with it, so untrusted content cannot forge a
 * marker — which is why the id is minted rather than read from the environment
 * the way the predecessor's was: an operator-settable id is an attacker-
 * settable id, and a guessable salt is not a boundary.
 */
let cachedRunId: string | null = null;

/** The run id for this process. Same value on every call until a test resets it. */
export function getRunId(): string {
  cachedRunId ??= randomBytes(4).toString("hex");
  return cachedRunId;
}

/**
 * Drop the cached id so the next {@link getRunId} mints a fresh one. Test-only:
 * production holds exactly one id per process.
 */
export function resetRunIdForTesting(): void {
  cachedRunId = null;
}
