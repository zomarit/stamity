import type { Stats } from "node:fs";
export declare function isSharedRegularFile(entry: Stats): boolean;
export declare const LOCK_RETRY_TOTAL_BACKOFF_MS: number;
export declare function disableCrossProcessLocking(): void;
export declare function enableDefaultCrossProcessLocking(): void;
export declare function resetCrossProcessLocking(): void;
export declare function isCrossProcessLockingEnabled(): boolean;
export declare function acquireWriteLock(filePath: string, boundaryDir?: string): Promise<() => Promise<void>>;
export declare function syncParentDirectory(filePath: string): Promise<void>;
export interface DirectoryIdentity {
    dev: number;
    ino: number;
}
export declare function sameDirectoryIdentity(a: DirectoryIdentity, b: DirectoryIdentity): boolean;
export declare function readDirectoryIdentity(dir: string): Promise<DirectoryIdentity>;
export declare function assertWriteTargetContained(filePath: string, boundaryDir?: string): Promise<void>;
export interface AtomicWriteOptions {
    mode?: number;
    boundaryDir?: string;
}
export declare const RENAME_RETRY_CEILING_MS: number;
export declare const RENAME_RETRY_COUNT: number;
export declare function atomicWriteFile(filePath: string, content: string | Uint8Array, opts?: AtomicWriteOptions): Promise<void>;
export declare function atomicWriteFileUnlocked(filePath: string, content: string | Uint8Array, opts?: AtomicWriteOptions): Promise<void>;
export interface OrphanTmpSweepEntry {
    path: string;
    ageMs: number;
    removed: boolean;
}
export declare function sweepOrphanTmpFiles(dir: string, opts?: {
    olderThanMs?: number;
}): Promise<OrphanTmpSweepEntry[]>;
export declare function formatOrphanTmpSweepDiagnostic(entries: readonly OrphanTmpSweepEntry[]): string;
export declare function detectConcurrentWriteRisk(dir: string): Promise<string | null>;
export declare function verifyBackup(filePath: string, bakPath: string, sourceContent: string, operation: string): Promise<void>;
export declare function resolveNonClobberingBakPath(filePath: string): Promise<string>;
