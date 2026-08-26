/**
 * Engine error contract. Zero-import leaf: every module throws `EngineError`
 * with an explicit `ErrorCode`, and that CODE is the classification callers
 * branch on.
 *
 * The exit status is not the classification. The CLI collapses every failure to
 * process status 1 and carries the kind in the error document's
 * `error.code` field, so a CI script reads a stable string rather than counting
 * numbers. An earlier design translated each code into a BSD sysexits number
 * (64/65/69/70/73/74/75); that translation was retired, and the map outlived
 * it as exported public API plus a nine-row column in the user-facing CLI
 * reference — telling CI authors to branch on statuses the binary never
 * returns. Both are gone; what remains is the one field that is real.
 *
 * {@link EngineError.exitCode} survives for a narrower job than it once had,
 * and it is now WIRED to that job rather than merely described as having it.
 * It is the process status this failure should produce: 1 by default, and the
 * one other value a throw site may set is `0`, which declares a non-failure
 * ending — a clean user cancel. `src/cli/kit/program.ts` reads exactly that
 * case and ends the run at status 0 with a success envelope naming the
 * cancellation, so the field is a live seam with a live reader rather than a
 * class member documented as consulted by a funnel that ignored it. It is
 * still not a classification channel: no value here selects a failure KIND,
 * which is what `code` is for, and the retired sysexits numbers stay retired.
 *
 * {@link EngineError.why} and {@link EngineError.next} are the optional second
 * and third lines of the user-facing failure document. The published error
 * schema promises them (`src/cli/docs/cliReference.ts`), and before they
 * existed here the promise was only keepable by a `CliFailure` thrown at the
 * CLI edge — every engine failure, which is nearly all of them, arrived with a
 * message and nothing else. A throw site that knows the cause and the next step
 * says so here; one that does not omits both, and the document then carries the
 * two keys it can actually fill. Optional rather than mandatory because a
 * fabricated `next` is worse than an absent one.
 */

/** Structured error codes for programmatic handling (CI scripts, JSON output). */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIG_ERROR"
  | "ADAPTER_ERROR"
  | "UNKNOWN_ERROR"
  | "INTEGRITY_ERROR"
  | "FS_ERROR"
  | "CLEAN_ERROR"
  | "NETWORK_ERROR"
  | "LOCK_TIMEOUT";

/** Process status for an ordinary failure. See the module header. */
const FAILURE_EXIT_CODE = 1;

/**
 * Typed engine error. `code` is mandatory at every throw site so no failure
 * ships unclassified; `exitCode` is the process status, 1 unless a throw site
 * explicitly overrides it (0 for a clean user cancel — the one ending that is
 * not a failure).
 *
 * `why` and `next` are the optional cause and next-step lines of the failure
 * document. They are set only when the throw site actually knows them; an
 * absent field leaves no own property behind, for the same reason `cause` does
 * not, so the funnel renders and serializes only the lines that exist.
 *
 * A `cause` is forwarded to the native `Error` options only when defined, so
 * an absent cause leaves no own `cause: undefined` property behind —
 * serializers walking the cause chain see only real links. `cause` is not
 * re-declared as a class field on purpose: a declared field would initialize
 * after `super()` and wipe the value the `Error` constructor set.
 */
export class EngineError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  /**
   * Why it failed, when the throw site knows. Absent rather than invented.
   *
   * `declare` for the same reason `cause` is not re-declared: a real class
   * field is DEFINED on every instance under `useDefineForClassFields`, so an
   * omitted `why` would still be an own property holding `undefined` — which
   * `Object.hasOwn` reports as a line this failure carries and `JSON.stringify`
   * drops silently, leaving two surfaces disagreeing about whether it exists.
   * The constructor assigns it only when there is one.
   */
  declare readonly why?: string;
  /** What the operator should do next, when the throw site knows. */
  declare readonly next?: string;

  constructor(
    message: string,
    opts: {
      code: ErrorCode;
      exitCode?: number;
      cause?: unknown;
      // `| undefined` on the OPTIONS, not on the fields: a throw site composing
      // its document from values it may or may not have (`why: maybeCause`)
      // must not have to build the object conditionally, and the constructor
      // already drops an undefined rather than defining the property.
      why?: string | undefined;
      next?: string | undefined;
    },
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.code = opts.code;
    this.exitCode = opts.exitCode ?? FAILURE_EXIT_CODE;
    // Assigned only when present: `this.why = undefined` would create an own
    // property that serializers emit as `"why": null` and `Object.hasOwn`
    // reports as a field this failure carries.
    if (opts.why !== undefined) this.why = opts.why;
    if (opts.next !== undefined) this.next = opts.next;
    this.name = "EngineError";
  }
}
