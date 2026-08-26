import type { ErrorCode } from "../types/errors.ts";

/**
 * Failure classification: is another attempt worth making?
 *
 * - `transient`   — the same call could succeed later (connectivity, contention,
 *                   a disk race under a concurrent run). Retry.
 * - `substantive` — the outcome is settled by the input or the code (validation,
 *                   a permission, a programming error, an explicit cancel). Retry
 *                   only burns wall time and hides the real error.
 * - `unknown`     — nothing matched. Callers treat this as "do not retry": an
 *                   unrecognised failure is not evidence of transience.
 *
 * Classification reads `name`, `code`, and `message` structurally rather than
 * branching on `instanceof`. A `DOMException` — what `AbortController.abort()`
 * rejects with — carries a legacy *numeric* `code`, errors crossing a worker or
 * vm boundary carry a foreign prototype, and some clients throw error-shaped
 * plain objects. Reading the three fields classifies every one of those shapes
 * under the same rules; a non-string `code` simply matches nothing.
 */
export type FailureType = "transient" | "substantive" | "unknown";

/** Cause links walked before giving up. Also bounds a self-referential chain. */
const MAX_CAUSE_DEPTH = 4;

/**
 * Verdicts for the engine's own error codes. Two are transient by definition of
 * their exit code (`EX_TEMPFAIL`); three are settled by their input. The rest —
 * `ADAPTER_ERROR`, `FS_ERROR`, `CLEAN_ERROR`, `UNKNOWN_ERROR` — are deliberately
 * absent: they wrap a cause of either kind, so the verdict comes from walking to
 * that cause rather than from the wrapper.
 */
const ENGINE_CODE_VERDICTS: Record<string, FailureType | undefined> = {
  NETWORK_ERROR: "transient",
  LOCK_TIMEOUT: "transient",
  VALIDATION_ERROR: "substantive",
  CONFIG_ERROR: "substantive",
  INTEGRITY_ERROR: "substantive",
} satisfies Partial<Record<ErrorCode, FailureType>>;

/**
 * Verdicts for libuv/OS error codes.
 *
 * `ENOENT` sits with the transient set: writers here create through temp+rename
 * and hold lock files, so a path that existed a moment ago can vanish under a
 * concurrent run. A genuinely missing input costs at most the remaining attempts
 * before the identical error propagates unchanged.
 *
 * `EPERM` and `EACCES` stay substantive: a permission does not change between
 * attempts, and a retry loop over one only delays the message the operator needs.
 */
const ERRNO_VERDICTS: Record<string, FailureType> = {
  // Connectivity and name resolution.
  ECONNREFUSED: "transient",
  ECONNRESET: "transient",
  ECONNABORTED: "transient",
  ETIMEDOUT: "transient",
  ENOTFOUND: "transient",
  EAI_AGAIN: "transient",
  EHOSTUNREACH: "transient",
  ENETUNREACH: "transient",
  ENETRESET: "transient",
  EPIPE: "transient",
  // Contention and resource exhaustion — the caller ahead of us finishes.
  EBUSY: "transient",
  EAGAIN: "transient",
  EMFILE: "transient",
  ENFILE: "transient",
  ENOENT: "transient",
  // Settled by the filesystem's state, not by timing.
  EACCES: "substantive",
  EPERM: "substantive",
  EROFS: "substantive",
  ENOSPC: "substantive",
  EEXIST: "substantive",
  EISDIR: "substantive",
  ENOTDIR: "substantive",
  ENOTEMPTY: "substantive",
};

/**
 * Built-in error names that mean the program, not the environment, is wrong.
 * `EngineError` is absent on purpose — its verdict comes from its `code`.
 */
const LOGIC_ERROR_NAMES: ReadonlySet<string> = new Set([
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
]);

/**
 * Last-resort message matching for errors that carry their status in prose —
 * HTTP clients that throw `Error("503 Service Unavailable")` and nothing else.
 * Evaluated in order; the first match wins, so the transient rows are listed
 * ahead of the substantive ones they could otherwise overlap with.
 */
const MESSAGE_VERDICTS: ReadonlyArray<readonly [RegExp, FailureType]> = [
  [/\b(429|500|502|503|504)\b/, "transient"],
  [/service unavailable|too many requests|bad gateway|gateway timeout/i, "transient"],
  [/socket hang up|connection (reset|refused)|network (error|failure)/i, "transient"],
  [/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/, "transient"],
  [/timeout|timed out/i, "transient"],
  [/\b(400|401|403|404|409|422)\b/, "substantive"],
  [/unauthorized|forbidden|not found|invalid (token|credential|api.?key)/i, "substantive"],
  [/malformed|missing required|invalid \S*\s?config|schema validation/i, "substantive"],
];

/** Read a string-valued property off an error-shaped value. */
function stringProp(value: object, key: "code" | "name" | "message"): string {
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : "";
}

/** Classify one link of a cause chain, without following it further. */
function verdictFor(value: unknown): FailureType {
  if (typeof value !== "object" || value === null) return "unknown";

  const name = stringProp(value, "name");
  const code = stringProp(value, "code");

  // Cancellation first: an aborted operation must not be retried, and its message
  // ("The operation was aborted") would otherwise reach the timeout row below.
  // A `TimeoutError` — what `AbortSignal.timeout()` rejects with — is left to that
  // row on purpose: an elapsed deadline is a transient condition, a cancel is not.
  if (name === "AbortError" || code === "ABORT_ERR") return "substantive";

  if (LOGIC_ERROR_NAMES.has(name)) return "substantive";

  const byCode = ENGINE_CODE_VERDICTS[code] ?? ERRNO_VERDICTS[code];
  if (byCode !== undefined) return byCode;

  const message = stringProp(value, "message");
  if (message !== "") {
    for (const [pattern, verdict] of MESSAGE_VERDICTS) {
      if (pattern.test(message)) return verdict;
    }
  }

  return "unknown";
}

/**
 * Classify a thrown value, following its `cause` chain until a link yields a
 * verdict. Wrapping an errno in a typed engine error is the norm here, so the
 * chain walk is what keeps a wrapped disk race classifiable at the outer layer.
 * Non-error values — a thrown string, `null`, anything without an error shape —
 * classify `unknown`.
 */
export function classifyFailure(error: unknown): FailureType {
  let cursor: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    const verdict = verdictFor(cursor);
    if (verdict !== "unknown") return verdict;
    if (typeof cursor !== "object" || cursor === null) break;

    const cause = (cursor as { cause?: unknown }).cause;
    if (cause === undefined || cause === cursor) break;
    cursor = cause;
  }

  return "unknown";
}
