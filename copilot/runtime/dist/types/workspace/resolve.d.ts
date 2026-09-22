import { type ContentClass, type ContentSelection } from "../types/content.ts";
import type { MaturityTier, Tool } from "../types/core.ts";
import type { McpConfig } from "../types/manifest.ts";
import { type WorkspaceManifest } from "./model.ts";
export interface ResolvedRepoConfig {
    repoPath: string;
    tools: Tool[];
    selection: ContentSelection;
    maturityTier?: MaturityTier;
    mcp?: McpConfig;
    lockedApplied: string[];
}
export declare function resolveRepoConfig(manifest: WorkspaceManifest, repoPath: string): ResolvedRepoConfig;
export declare function buildSelectionFromIds(ids: Partial<Record<ContentClass, string[]>>): ContentSelection;
