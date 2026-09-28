import type { GitRunner } from "../../workspace/git.ts";
export interface WorkingTreeStatus {
    available: boolean;
    dirty: boolean;
    changedCount: number;
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
export declare function parseShortlogContributors(output: string): number;
export declare function readHistoryFacts(cwd: string, runner?: GitRunner): HistoryFacts | null;
