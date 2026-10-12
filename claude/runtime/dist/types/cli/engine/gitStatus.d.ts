import type { GitRunner } from "../../workspace/git.ts";
export interface WorkingTreeStatus {
    available: boolean;
    dirty: boolean;
    changedCount: number;
    reason?: "bare-layout";
}
export interface HistoryFacts {
    commitCount: number;
    contributorCount: number;
}
export declare function parsePorcelainStatus(output: string): {
    dirty: boolean;
    changedCount: number;
};
export declare function readWorkingTreeStatus(cwd: string, runner?: GitRunner): WorkingTreeStatus;
export declare function keptFromGit(error: unknown): boolean;
export declare function parseShortlogContributors(output: string): number;
export declare function readHistoryFacts(cwd: string, runner?: GitRunner): HistoryFacts | null;
export interface GitCheckRunnerOptions {
    timeoutMs?: number;
    maxBuffer?: number;
}
export declare function gitCheckRunner(options?: GitCheckRunnerOptions): GitRunner;
