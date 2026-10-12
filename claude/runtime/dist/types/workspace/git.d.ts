import type { Platform } from "../types/core.ts";
export interface RepoGitIdentity {
    remoteUrl: string | null;
    defaultBranch: string | null;
    platform: Platform | null;
}
export type GitRunner = (args: readonly string[], cwd: string) => string;
export declare function parseGitRemote(url: string): {
    host: string;
    owner: string;
    repo: string;
} | null;
export declare function parseGitDefaultBranch(symbolicRefOutput: string): string | null;
export declare function detectPlatformFromRemote(remoteUrl: string): Platform | null;
export declare function detectRepoGitIdentity(cwd: string, runner?: GitRunner): RepoGitIdentity;
