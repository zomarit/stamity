import type { ReclaimCandidate } from "../manifest/ledger.ts";
import type { CoOwnedReducer } from "../types/content.ts";
export interface ReclaimActionEntry {
    path: string;
    candidateReason: ReclaimCandidate["reason"];
    action: "deleted" | "managed-block-stripped" | "co-owned-reduced" | "skipped-user-content" | "skipped-unsafe-path" | "skipped-missing" | "dry-run";
    detail: string;
}
export interface ReclaimOptions {
    rootDir: string;
    consent: boolean;
    trustedExactPaths?: ReadonlySet<string>;
    coOwnedPaths?: ReadonlyMap<string, CoOwnedReducer>;
    now?: Date;
}
export interface ReclaimReport {
    entries: ReclaimActionEntry[];
    consent: boolean;
    deletedCount: number;
    strippedCount: number;
    skippedCount: number;
}
export declare function sweepReclaimCandidates(candidates: readonly ReclaimCandidate[], opts: ReclaimOptions): Promise<ReclaimReport>;
export declare function formatReclaimReport(report: ReclaimReport): string;
