import { type ErrorCode } from "../../types/errors.ts";
import type { Palette } from "./terminal.ts";
export interface FailureDoc {
    code: ErrorCode | "USAGE" | "FAILURE";
    message: string;
    why?: string;
    next?: string;
}
export declare class CliFailure extends Error {
    readonly doc: FailureDoc;
    constructor(doc: FailureDoc);
}
export declare function successEnvelope(command: string, version: string, payload: Record<string, unknown>): Record<string, unknown>;
export declare function failureEnvelope(command: string, version: string, failure: FailureDoc): Record<string, unknown>;
export declare function failureFromError(err: unknown): FailureDoc;
export declare function renderFailureHuman(failure: FailureDoc, palette: Palette): string;
