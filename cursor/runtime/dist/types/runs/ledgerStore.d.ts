import { EngineError } from "../types/errors.ts";
import { type BlockProblem, type Closure, type ClosureStatus, type Finding, type FindingSeverity } from "./blocks.ts";
export interface LedgerRow {
    readonly id: string;
    readonly phase: string;
    readonly source: string;
    readonly severity: string;
    readonly evidence: string;
    readonly state: string;
    readonly rationale: string;
    readonly retired?: string;
    readonly report?: string;
    readonly decision_needed?: true;
}
export interface ParsedLedger {
    readonly lines: readonly string[];
    readonly eol: "\n" | "\r\n";
    readonly rows: ReadonlyMap<number, LedgerRow>;
    readonly unreadable: readonly number[];
}
export declare function parseLedgerText(text: string): ParsedLedger;
export declare const LEDGER_SLUG_PATTERN: RegExp;
export declare function runDir(rootDir: string, runId: string): string;
export declare function requireRunDir(rootDir: string, runId: string): Promise<string>;
export declare function ensureReportsIgnore(rootDir: string, runId: string): Promise<void>;
export interface ResolvedReport {
    readonly absolute: string;
    readonly relative: string;
    readonly text: string;
}
export declare function resolveReportPath(rootDir: string, runId: string, given: string): Promise<ResolvedReport>;
export declare function nextRowNumber(rows: Iterable<{
    readonly id: string;
}>, runId: string, phase: string): number;
export interface AppendedRow {
    readonly ledgerId: string;
    readonly severity: FindingSeverity;
    readonly localId: string;
    readonly decisionNeeded: boolean;
}
export interface AppendResult {
    readonly ledger: string;
    readonly rows: readonly AppendedRow[];
    readonly unreadableLines: readonly number[];
    readonly tagsStripped: readonly string[];
}
export declare function appendFindings(req: {
    readonly rootDir: string;
    readonly runId: string;
    readonly phase: string;
    readonly source: string;
    readonly findings: readonly Finding[];
    readonly report: string | null;
    readonly dryRun: boolean;
}): Promise<AppendResult>;
export declare function qualifyLedgerId(runId: string, given: string): {
    readonly id: string;
    readonly foreignRun: string | null;
};
export declare const CLOSURE_TARGET: Readonly<Record<ClosureStatus, "fixed" | "rejected" | "open">>;
export type ManualState = "fixed" | "rejected" | "deferred";
export interface CloseChange {
    readonly ledgerId: string;
    readonly from: string;
    readonly to: string;
    readonly status: ClosureStatus | null;
    readonly unchanged: boolean;
}
export interface CloseResult {
    readonly ledger: string;
    readonly changes: readonly CloseChange[];
    readonly unreadableLines: readonly number[];
    readonly tagsStripped: readonly string[];
}
export declare class ClosuresRefused extends EngineError {
    readonly problems: readonly BlockProblem[];
    constructor(report: string, problems: readonly BlockProblem[]);
}
export declare function applyClosures(req: {
    readonly rootDir: string;
    readonly runId: string;
    readonly closures: readonly Closure[];
    readonly handedIds: readonly string[];
    readonly report: string;
    readonly dryRun: boolean;
}): Promise<CloseResult>;
export declare function closeRow(req: {
    readonly rootDir: string;
    readonly runId: string;
    readonly ledgerId: string;
    readonly state: ManualState;
    readonly rationale: string;
    readonly dryRun: boolean;
}): Promise<CloseResult>;
