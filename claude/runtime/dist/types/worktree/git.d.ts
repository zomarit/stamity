import type { GitPathClass } from "./policy.ts";
export interface GitInvocation {
    readonly args: readonly string[];
    readonly cwd: string;
    readonly stdin?: string;
    readonly timeoutMs?: number;
}
export interface GitOutcome {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}
export type WorktreeGitRunner = (invocation: GitInvocation) => Promise<GitOutcome>;
export declare const GIT_FETCH_TIMEOUT_MS = 60000;
export declare const runGit: WorktreeGitRunner;
export declare function checkWorktreeNameShape(name: string): string | null;
export declare function assertWorktreeName(run: WorktreeGitRunner, repoRoot: string, name: string): Promise<void>;
export declare function worktreePathFor(farmDir: string, name: string): string;
export interface WorktreeInventoryEntry {
    readonly path: string;
    readonly branch: string | null;
    readonly head: string | null;
    readonly bare: boolean;
    readonly detached: boolean;
    readonly locked: boolean;
    readonly lockReason: string | null;
    readonly prunable: boolean;
    readonly prunableReason: string | null;
}
export declare function parseWorktreeList(output: string): WorktreeInventoryEntry[];
export declare function shortBranchName(ref: string): string;
export declare function listWorktrees(run: WorktreeGitRunner, repoRoot: string): Promise<WorktreeInventoryEntry[]>;
export declare function readStashCount(run: WorktreeGitRunner, repoRoot: string): Promise<number>;
export interface WorktreeDirtyCounts {
    readonly modified: number;
    readonly untracked: number;
}
export declare function isDirty(counts: WorktreeDirtyCounts): boolean;
export declare function readDirtyCounts(run: WorktreeGitRunner, worktreePath: string): Promise<WorktreeDirtyCounts>;
export declare function classifyRepoPaths(run: WorktreeGitRunner, repoRoot: string, relPaths: readonly string[]): Promise<Map<string, GitPathClass>>;
export declare function localBranchExists(run: WorktreeGitRunner, repoRoot: string, branch: string): Promise<boolean>;
export declare function remoteBranchExists(run: WorktreeGitRunner, repoRoot: string, branch: string): Promise<boolean>;
export declare function hasOriginRemote(run: WorktreeGitRunner, repoRoot: string): Promise<boolean>;
export type FetchOutcome = "fetched" | "missing-ref";
export declare function classifyFetchFailure(stderr: string): FetchOutcome | "transport";
export declare function fetchBranch(run: WorktreeGitRunner, repoRoot: string, branch: string): Promise<FetchOutcome>;
export declare function resolveGitCommonDir(run: WorktreeGitRunner, cwd: string): Promise<string>;
export declare function resolveWorktreeGitDir(run: WorktreeGitRunner, worktreePath: string): Promise<string>;
export declare function resolveSha(run: WorktreeGitRunner, cwd: string, rev?: string): Promise<string>;
export type BranchPlanKind = "attach" | "track" | "create";
export interface WorktreeAddRequest {
    readonly path: string;
    readonly branch: string;
    readonly kind: BranchPlanKind;
}
export declare function addWorktree(run: WorktreeGitRunner, repoRoot: string, request: WorktreeAddRequest): Promise<void>;
export declare function removeWorktree(run: WorktreeGitRunner, repoRoot: string, worktreePath: string, force: boolean): Promise<void>;
export declare function pruneWorktrees(run: WorktreeGitRunner, repoRoot: string): Promise<void>;
