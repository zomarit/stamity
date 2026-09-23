import type { ContentClass } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { type LedgerEntry } from "../types/manifest.ts";
export interface EmittedArtifact {
    path: string;
    adapter: Tool;
    artifactId: string;
    artifactType: ContentClass | "infra";
    contentHash?: string;
    stampedVersion?: string;
}
export declare function toLedgerEntries(emitted: readonly EmittedArtifact[]): LedgerEntry[];
export declare function replaceAdapterEntries(ledger: readonly LedgerEntry[], adapter: Tool, entries: readonly LedgerEntry[]): LedgerEntry[];
export declare function ledgerUnionPaths(ledger: readonly LedgerEntry[]): ReadonlySet<string>;
export declare function trustedInfraPaths(ledger: readonly LedgerEntry[]): Set<string>;
export interface LedgerDiff {
    added: LedgerEntry[];
    removed: LedgerEntry[];
    retained: LedgerEntry[];
}
export declare function diffLedgers(prev: readonly LedgerEntry[], next: readonly LedgerEntry[]): LedgerDiff;
export interface ReclaimCandidate {
    entry: LedgerEntry;
    reason: "deselected" | "adapter-removed" | "path-renamed";
}
export declare function computeReclaimCandidates(ledger: readonly LedgerEntry[], currentEmission: ReadonlySet<string>, activeAdapters: ReadonlySet<Tool>): ReclaimCandidate[];
export declare function assertLedgerContainment(ledger: readonly LedgerEntry[], rootDir: string): void;
export declare function ownersOfPath(ledger: readonly LedgerEntry[], path: string): LedgerEntry[];
