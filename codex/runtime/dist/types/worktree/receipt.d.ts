export declare const WORKTREE_RECEIPT_VERSION = 1;
export declare const WORKTREE_RECEIPT_SUBDIR = "stamity";
export declare const WORKTREE_RECEIPT_FILENAME = "worktree-receipt.json";
export type ReceiptStrategy = "copy" | "symlink";
export interface WorktreeReceiptEntry {
    readonly path: string;
    readonly strategy: ReceiptStrategy;
    readonly mode?: string;
    readonly sha256?: string;
}
export interface WorktreeReceiptTarget {
    readonly path: string;
    readonly branch: string;
    readonly head: string;
}
export interface WorktreeReceipt {
    readonly version: number;
    readonly createdAt: string;
    readonly engineVersion: string;
    readonly worktree: WorktreeReceiptTarget;
    readonly entries: readonly WorktreeReceiptEntry[];
}
export interface WorktreeReceiptDroppedRow {
    readonly index: number;
    readonly reason: string;
}
export interface WorktreeReceiptRead {
    readonly receipt: WorktreeReceipt | null;
    readonly unreadable: string | null;
    readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
}
export declare function worktreeReceiptPath(gitDir: string): string;
export declare function createWorktreeReceipt(fields: Omit<WorktreeReceipt, "version">): WorktreeReceipt;
export declare function sha256Hex(bytes: string | Uint8Array): string;
export declare function digestFile(absPath: string): Promise<string | null>;
export declare function writeWorktreeReceipt(gitDir: string, receipt: WorktreeReceipt): Promise<string>;
export declare function readWorktreeReceipt(gitDir: string): Promise<WorktreeReceiptRead>;
export type EntryKind = "absent" | "file" | "symlink" | "directory" | "other";
export interface EntryState {
    readonly kind: EntryKind;
    readonly sha256: string | null;
}
export type ReceiptEntryDisposition = "remove" | "keep" | "absent";
export type ReceiptEntryReason = "digest-match" | "diverged" | "not-present" | "still-a-symlink" | "replaced" | "no-digest";
export interface ReceiptEntryVerdict {
    readonly disposition: ReceiptEntryDisposition;
    readonly reason: ReceiptEntryReason;
}
export declare function classifyReceiptEntry(entry: WorktreeReceiptEntry, state: EntryState): ReceiptEntryVerdict;
export declare function inspectEntryState(absPath: string): Promise<EntryState>;
