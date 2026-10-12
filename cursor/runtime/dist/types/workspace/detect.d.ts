export declare const DEFAULT_MAX_DEPTH = 4;
export interface DetectedRepo {
    path: string;
    name: string;
    hasGit: boolean;
    hasManifest: boolean;
}
export type WorkspaceRole = "workspace-root" | "workspace-member" | "standalone";
export interface WorkspaceContext {
    role: WorkspaceRole;
    workspaceRoot: string | null;
    manifestPath: string | null;
}
export declare function detectSubRepos(rootDir: string, opts?: {
    maxDepth?: number;
}): Promise<DetectedRepo[]>;
export declare function detectWorkspaceContext(dir: string): Promise<WorkspaceContext>;
export declare function shouldSuggestWorkspace(dir: string): Promise<boolean>;
export declare function isWorkspaceRoot(dir: string): Promise<boolean>;
