import { type CoOwnedMergeResult, type CoOwnedOwnership, type CoOwnedPrediction } from "../../manifest/coOwnedJson.ts";
import type { EmittedArtifact } from "../../manifest/ledger.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import type { HookScriptReader, ReclaimReport } from "../../merge/reclaim.ts";
import { type SafeWriteFileOptions } from "../../merge/safeWrite.ts";
import { type AdapterOutput, type CoOwnedReducer, type MergeResult } from "../../types/content.ts";
import type { CoOwnership, LedgerEntry, SetupManifest } from "../../types/manifest.ts";
export declare function sha256(content: string): string;
export declare function readIfExists(filePath: string): Promise<string | null>;
export declare function outputWriteOptions(managedBody: string | null, engineVersion: string, force: boolean, rootDir: string, ledgerPaths?: ReadonlySet<string>, ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>): SafeWriteFileOptions;
export declare function ledgerRowsForOutput(output: AdapterOutput, written: string | null, managedBody: string | null, engineVersion: string, coOwned?: CoOwnership): EmittedArtifact[];
export interface McpMergePrediction {
    result: MergeResult;
    refusal: string | null;
}
export declare function predictMcpDocumentMerge(absPath: string, relPath: string, emitted: string, selectedServers: readonly string[], packServers: readonly PackSuppliedServer[]): Promise<McpMergePrediction>;
export declare function installedPackServers(rootDir: string, manifest: SetupManifest): Promise<PackSuppliedServer[]>;
export interface CoOwnedDocumentLane {
    readonly path: string;
    readonly noun: string;
    readonly wiresHooks: boolean;
    predict(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedLanePrediction>;
    materialize(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedMergeResult>;
    reducer(ownership: CoOwnedOwnership, deleteWhenEngineOnly: boolean, rendered?: unknown): CoOwnedReducer;
}
interface CoOwnedLanePrediction extends CoOwnedPrediction {
    rejected?: string;
}
export declare function rowsCarriedThroughSweep(ledger: readonly LedgerEntry[], reclaimed: ReclaimReport | null, coOwned: {
    has(path: string): boolean;
}): LedgerEntry[];
export declare function coOwnedDocumentLanes(manifest: SetupManifest | null, packServers?: readonly PackSuppliedServer[], ledger?: readonly LedgerEntry[]): ReadonlyMap<string, CoOwnedDocumentLane>;
export declare function coOwnedOwnershipOf(ledger: readonly LedgerEntry[], path: string, opts?: {
    boundaryDir?: string;
    ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
}): CoOwnedOwnership & {
    deleteWhenEngineOnly: boolean;
};
export declare function coOwnedRowsCarriedThroughRefusal(ledger: readonly LedgerEntry[], path: string): EmittedArtifact[];
export declare function coOwnedHookDocuments(manifest: SetupManifest, packServers?: readonly PackSuppliedServer[]): ReadonlySet<string>;
export declare function hookScriptRetention(manifest: SetupManifest, packServers?: readonly PackSuppliedServer[]): {
    hookDocuments: ReadonlySet<string>;
    hookScripts: HookScriptReader;
};
export declare function coOwnedReclaimReducers(manifest: SetupManifest, packServers?: readonly PackSuppliedServer[], renderings?: ReadonlyMap<string, unknown>): Map<string, CoOwnedReducer>;
export declare function coOwnedReclaimRenderings(rootDir: string, manifest: SetupManifest): Promise<ReadonlyMap<string, unknown>>;
export {};
