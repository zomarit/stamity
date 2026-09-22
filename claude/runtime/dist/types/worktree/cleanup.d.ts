import { type WorktreeDirtyCounts, type WorktreeGitRunner, type WorktreeInventoryEntry } from "./git.ts";
import { type ReceiptEntryReason, type WorktreeReceipt, type WorktreeReceiptDroppedRow } from "./receipt.ts";
import { type ConsentAnswer } from "./setup.ts";
export type WorktreeClass = "managed" | "managed-orphan" | "other" | "locked" | "prunable";
export interface WorktreeInventoryRow {
    readonly entry: WorktreeInventoryEntry;
    readonly classification: WorktreeClass;
    readonly reason: string | null;
    readonly receipt: WorktreeReceipt | null;
    readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
    readonly gitDir: string | null;
    readonly dirty: WorktreeDirtyCounts | null;
}
export interface WorktreeInventory {
    readonly worktrees: readonly WorktreeInventoryRow[];
    readonly stash: {
        readonly entries: number;
    };
}
export interface CleanupFileReport {
    readonly path: string;
    readonly outcome: "removed" | "kept" | "absent" | "failed";
    readonly reason: ReceiptEntryReason | "failed";
    readonly detail: string | null;
}
export interface CleanupWorktreeReport {
    readonly path: string;
    readonly branch: string | null;
    readonly classification: WorktreeClass;
    readonly files: readonly CleanupFileReport[];
    readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
    readonly removed: boolean;
    readonly branchCommand: string | null;
    readonly skipped: string | null;
    readonly treeFailure: string | null;
}
export interface WorktreeCleanupResult {
    readonly status: "complete" | "partial";
    readonly worktrees: readonly CleanupWorktreeReport[];
    readonly pruned: number;
    readonly notices: readonly string[];
    readonly stash: {
        readonly entries: number;
    };
}
export interface WorktreeCleanupOptions {
    readonly repoRoot: string;
    readonly farmDir: string;
    readonly names?: readonly string[];
    readonly all?: boolean;
    readonly filesOnly?: boolean;
    readonly force?: ConsentAnswer;
    readonly cwd: string;
    readonly run?: WorktreeGitRunner;
    readonly rerun?: string;
}
export interface PathContainmentOps {
    readonly relative: (from: string, to: string) => string;
    readonly resolve: (...paths: string[]) => string;
    readonly sep: string;
    readonly isAbsolute: (path: string) => boolean;
}
export declare function isInside(child: string, parent: string, pathOps?: PathContainmentOps): boolean;
export declare function readWorktreeInventory(opts: {
    readonly repoRoot: string;
    readonly farmDir: string;
    readonly run?: WorktreeGitRunner;
}): Promise<WorktreeInventory>;
export declare function runWorktreeCleanup(opts: WorktreeCleanupOptions): Promise<WorktreeCleanupResult>;
