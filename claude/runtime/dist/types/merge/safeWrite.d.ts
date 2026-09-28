import type { MergeResult } from "../types/content.ts";
export type MergeAction = MergeResult["action"];
export interface SafeWriteFileOptions {
    managedContent?: string;
    appendIfNoBlock?: boolean;
    force?: boolean;
    backup?: boolean;
    skipIfUnchanged?: boolean;
    version?: string;
    ledgerPaths?: ReadonlySet<string>;
    ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
    boundaryDir?: string;
}
export interface PreservedContentRefusal {
    kind: "shared-name" | "deny-scan";
    message: string;
}
export declare function predictPreservedContentRefusal(filePath: string): Promise<PreservedContentRefusal | null>;
export declare function predictDenyRefusal(filePath: string): Promise<string | null>;
export declare function predictMergeAction(existingContent: string | null, incoming: string, options?: SafeWriteFileOptions, filePath?: string): MergeAction;
export declare function toLedgerKey(filePath: string): string;
export declare function displayPath(filePath: string, boundaryDir: string | undefined): string;
export declare function isManagedPath(filePath: string, ledgerPaths?: ReadonlySet<string>, existingContent?: string | null): boolean;
export declare function ledgerPathSet(rootDir: string, paths: readonly string[]): ReadonlySet<string>;
export interface LedgerHashRow {
    path: string;
    contentHash?: string;
}
export declare function ledgerHashIndex(rootDir: string, rows: readonly LedgerHashRow[]): ReadonlyMap<string, ReadonlySet<string>>;
export declare function hasLedgerDrift(filePath: string, existingContent: string, ledgerHashes: ReadonlyMap<string, ReadonlySet<string>> | undefined): boolean;
export declare function readPrefixFrontmatterField(content: string, field: string): string | null;
export declare function backupBeforeOverwrite(filePath: string, existingContent: string, operation: string, boundaryDir?: string): Promise<string>;
export declare function safeWriteFile(filePath: string, content: string, options?: SafeWriteFileOptions): Promise<MergeResult>;
