import type { ContentIndex } from "../../../content/catalog.ts";
import { type ContentSelection } from "../../../types/content.ts";
import { type MaturityTier, type Platform, type Tool } from "../../../types/core.ts";
import type { DetectedSummary, PackageEntry, RepoInfo } from "../../../types/detect.ts";
import { type DetectedRepo, type WorkspaceRole } from "../../../workspace/detect.ts";
import { type HistoryFacts } from "../../engine/gitStatus.ts";
export interface InitOverrides {
    tools?: Tool[];
    maturityTier?: MaturityTier;
    platform?: Platform;
}
export interface InitDecisions {
    tools: Tool[];
    toolsSource: "flag" | "detected" | "default";
    detectedTools: Tool[];
    greenfield: boolean;
    monorepoPackages: PackageEntry[];
    maturityTier: MaturityTier;
    maturitySource: "flag" | "git-history" | "default";
    platform?: Platform;
    existingConfigPaths: string[];
    detected: DetectedSummary;
    repoInfo: RepoInfo;
    workspaceCandidates: DetectedRepo[];
    workspaceSource: WorkspaceRole;
}
export declare function workspaceOfferArmed(decisions: InitDecisions): boolean;
export declare function buildInitDecisions(rootDir: string, overrides: InitOverrides, deps?: {
    history?: HistoryFacts | null;
    skipWorkspaceProbe?: boolean;
}): Promise<InitDecisions>;
export declare function fullCoreSelection(index: ContentIndex): ContentSelection;
