import { EngineError, type ErrorCode } from "../../types/errors.ts";
import type { Palette } from "./terminal.ts";

/**
 * The output envelope and failure vocabulary of the CLI funnel.
 *
 * Process exits are 0 success / 1 failure / 2 usage — nothing else. The engine's
 * sysexits map (`EngineError.exitCode`) is deliberately ignored for the process
 * exit; the `ErrorCode` string survives inside the JSON error document instead,
 * so CI branches on `error.code`, never on exotic exit numbers.
 */

export interface FailureDoc {
  /** Engine `ErrorCode`, or `USAGE` (argument parse), or `FAILURE` (everything else). */
  code: ErrorCode | "USAGE" | "FAILURE";
  message: string;
  why?: string;
  next?: string;
}

/**
 * The expected-failure throw for command bodies: carry a ready-to-render
 * what/why/next document to the funnel instead of formatting inline. Always
 * exits 1.
 */
export class CliFailure extends Error {
  readonly doc: FailureDoc;

  constructor(doc: FailureDoc) {
    super(doc.message);
    this.doc = doc;
    this.name = "CliFailure";
  }
}

/** `{ ok: true, command, version, ...payload }` — the one success document per JSON run. */
export function successEnvelope(
  command: string,
  version: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { ok: true, command, version, ...payload };
}

/** `{ ok: false, command, version, error }` — the one error document per failed JSON run. */
export function failureEnvelope(
  command: string,
  version: string,
  failure: FailureDoc,
): Record<string, unknown> {
  return { ok: false, command, version, error: failure };
}

/**
 * Collapse any thrown value to a {@link FailureDoc}: a CliFailure hands over its
 * own doc, an EngineError keeps its code (the exit number is dropped, the code
 * string survives), anything else — including a thrown non-Error — becomes a
 * bare FAILURE with a stringified message.
 */
export function failureFromError(err: unknown): FailureDoc {
  if (err instanceof CliFailure) return err.doc;
  if (err instanceof EngineError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: "FAILURE", message: err.message };
  return { code: "FAILURE", message: String(err) };
}

/**
 * Actionable human rendering, one concern per line:
 *
 *     error: <what failed>
 *       why: <cause, when known>
 *       next: <the user's next step, when known>
 */
export function renderFailureHuman(failure: FailureDoc, palette: Palette): string {
  const lines = [`${palette.red(palette.bold("error:"))} ${failure.message}`];
  if (failure.why !== undefined) lines.push(`  ${palette.dim("why:")} ${failure.why}`);
  if (failure.next !== undefined) lines.push(`  ${palette.dim("next:")} ${failure.next}`);
  return lines.join("\n");
}
