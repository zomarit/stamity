import type { ReclaimCandidate } from "../manifest/ledger.ts";
import type { CoOwnedReducer } from "../types/content.ts";
export interface ReclaimActionEntry {
    path: string;
    candidateReason: ReclaimCandidate["reason"];
    action: "deleted" | "managed-block-stripped" | "co-owned-reduced" | "skipped-user-content" | "skipped-unsafe-path" | "skipped-missing" | "dry-run";
    detail: string;
    wouldBe?: "deleted" | "managed-block-stripped" | "co-owned-reduced";
    proof?: ReclaimProof;
    refused?: true;
}
export type ReclaimProof = "hash" | "block" | "co-owned";
export interface HookScriptReader {
    isHookScript(path: string): boolean;
    runs(text: string, path: string): boolean;
}
export interface ReclaimOptions {
    rootDir: string;
    consent: boolean;
    trustedExactPaths?: ReadonlySet<string>;
    coOwnedPaths?: ReadonlyMap<string, CoOwnedReducer>;
    hookDocuments?: ReadonlySet<string>;
    hookScripts?: HookScriptReader;
    hookDocumentsAfterWrite?: ReadonlyMap<string, string>;
    now?: Date;
}
export interface ReclaimReport {
    entries: ReclaimActionEntry[];
    wiringKept?: {
        path: string;
        scripts: string[];
        unreadable?: true;
    }[];
    consent: boolean;
    deletedCount: number;
    strippedCount: number;
    skippedCount: number;
}
export declare function sweepReclaimCandidates(candidates: readonly ReclaimCandidate[], opts: ReclaimOptions): Promise<ReclaimReport>;
export declare function formatReclaimReport(report: ReclaimReport): string;
