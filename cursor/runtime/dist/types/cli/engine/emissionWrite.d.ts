import type { EmittedArtifact } from "../../manifest/ledger.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import type { SafeWriteFileOptions } from "../../merge/safeWrite.ts";
import { type AdapterOutput, type CoOwnedReducer, type MergeResult } from "../../types/content.ts";
import type { SetupManifest } from "../../types/manifest.ts";
export declare function sha256(content: string): string;
export declare function readIfExists(filePath: string): Promise<string | null>;
export declare function outputWriteOptions(managedBody: string | null, engineVersion: string, force: boolean, rootDir: string, ledgerPaths?: ReadonlySet<string>, ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>): SafeWriteFileOptions;
export declare function ledgerRowsForOutput(output: AdapterOutput, written: string | null, managedBody: string | null, engineVersion: string): EmittedArtifact[];
export interface McpMergePrediction {
    result: MergeResult;
    refusal: string | null;
}
export declare function predictMcpDocumentMerge(absPath: string, relPath: string, emitted: string, selectedServers: readonly string[], packServers: readonly PackSuppliedServer[]): Promise<McpMergePrediction>;
export declare function installedPackServers(rootDir: string, manifest: SetupManifest): Promise<PackSuppliedServer[]>;
export declare function coOwnedReclaimReducers(manifest: SetupManifest, packServers?: readonly PackSuppliedServer[]): Map<string, CoOwnedReducer>;
