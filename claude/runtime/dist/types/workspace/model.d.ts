import type { MaturityTier, Tool } from "../types/core.ts";
import type { ContentClass, ContentSelection } from "../types/content.ts";
import type { ErrorCode } from "../types/errors.ts";
import type { McpConfig } from "../types/manifest.ts";
export declare const WORKSPACE_MANIFEST_FILE = "workspace.json";
export declare const WORKSPACE_MANIFEST_VERSION = "1.0.0";
export interface WorkspaceDefaults {
    tools: Tool[];
    selection?: ContentSelection;
    maturityTier?: MaturityTier;
    mcp?: McpConfig;
}
export interface WorkspaceGroupDelta {
    name: string;
    addItems?: Partial<Record<ContentClass, string[]>>;
    removeItems?: Partial<Record<ContentClass, string[]>>;
    toolOverrides?: Tool[];
}
export interface WorkspaceRepoOverrides {
    tools?: Tool[];
    addItems?: Partial<Record<ContentClass, string[]>>;
    removeItems?: Partial<Record<ContentClass, string[]>>;
}
export interface WorkspaceRepoEntry {
    path: string;
    groups?: string[];
    overrides?: WorkspaceRepoOverrides;
}
export interface WorkspaceManifest {
    version: string;
    defaults: WorkspaceDefaults;
    groups?: WorkspaceGroupDelta[];
    repos: WorkspaceRepoEntry[];
    lockedContent?: string[];
}
export type WorkspaceSyncOutcome = "passed" | "partial" | "failed";
export interface WorkspaceSyncCounts {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
}
export interface WorkspaceRepoSyncError {
    repoPath: string;
    code: ErrorCode;
    message: string;
}
export interface WorkspaceRepoSyncResult {
    repoPath: string;
    ok: boolean;
    error?: WorkspaceRepoSyncError;
}
export interface WorkspaceSyncResult {
    outcome: WorkspaceSyncOutcome;
    counts: WorkspaceSyncCounts;
    repos: WorkspaceRepoSyncResult[];
}
