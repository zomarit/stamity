import { type ErrorCode } from "../types/errors.ts";
import { type WorkspaceManifest, type WorkspaceRepoEntry, type WorkspaceRepoSyncError, type WorkspaceRepoSyncResult, type WorkspaceSyncCounts, type WorkspaceSyncOutcome, type WorkspaceSyncResult } from "./model.ts";
import { type ResolvedRepoConfig } from "./resolve.ts";
export declare const WORKSPACE_SYNC_JOURNAL_FILE = "workspace-sync-journal.jsonl";
interface JournalLineBase {
    ts: string;
    run: string;
    repo: string;
}
export type WorkspaceSyncJournalEntry = (JournalLineBase & {
    event: "started";
}) | (JournalLineBase & {
    event: "skipped";
    reason: string;
}) | (JournalLineBase & {
    event: "finished";
    status: "ok";
}) | (JournalLineBase & {
    event: "finished";
    status: "failed";
    code: ErrorCode;
    message: string;
});
export type RepoSyncCallback = (repo: WorkspaceRepoEntry, resolved: ResolvedRepoConfig) => Promise<void>;
export interface WorkspaceSyncOptions {
    rootDir: string;
    manifest: WorkspaceManifest;
    syncRepo: RepoSyncCallback;
    concurrency?: number;
    journal?: boolean;
    now?: Date;
}
export interface WorkspaceRepoSyncRow extends WorkspaceRepoSyncResult {
    state: "synced" | "failed" | "skipped";
    skipReason?: string;
}
export interface WorkspaceCascadeResult extends WorkspaceSyncResult {
    repos: WorkspaceRepoSyncRow[];
    journalWarnings: string[];
}
export declare function toRepoSyncError(repoPath: string, err: unknown): WorkspaceRepoSyncError;
export declare function computeWorkspaceSyncOutcome(counts: WorkspaceSyncCounts): WorkspaceSyncOutcome;
export declare function defaultSyncConcurrency(cpuCount?: number): number;
export declare function syncWorkspaceRepos(opts: WorkspaceSyncOptions): Promise<WorkspaceCascadeResult>;
export {};
