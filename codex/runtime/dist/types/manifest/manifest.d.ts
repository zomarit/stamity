import { type ContentSelection } from "../types/content.ts";
import { type CommunicationStyle, type MaturityTier, type Platform, type Tool } from "../types/core.ts";
import type { DetectedSummary } from "../types/detect.ts";
import { type GatesConfig, type ImportDecision, type InstallMode, type LearningsConfig, type ManifestMigration, type McpConfig, type PluginConfig, type PluginOwnedClass, type RuleDelivery, type SetupManifest } from "../types/manifest.ts";
export declare function manifestPath(rootDir: string): string;
export declare const MANIFEST_REPO_PATH = ".stamity/manifest.json";
export declare const MANIFEST_MIGRATIONS: readonly ManifestMigration[];
export declare function migrateManifest(raw: Record<string, unknown>): Record<string, unknown>;
export interface CreateManifestOptions {
    tools: Tool[];
    platform?: Platform;
    selection: ContentSelection;
    maturityTier?: MaturityTier;
    mcp?: McpConfig;
    detected?: DetectedSummary;
    importChoice?: readonly ImportDecision[];
    now?: Date;
    generatorVersion: string;
}
export declare function createManifest(options: CreateManifestOptions): SetupManifest;
export declare function collectManifestErrors(data: unknown): string[];
export declare function validateManifest(data: unknown): data is SetupManifest;
export declare function readManifest(rootDir: string): Promise<SetupManifest | null>;
export declare function writeManifest(rootDir: string, manifest: SetupManifest, opts?: {
    now?: Date;
}): Promise<void>;
export interface PreservedManifestFields {
    selection?: ContentSelection;
    mcp?: McpConfig;
    maturityTier?: MaturityTier;
    communicationStyle?: CommunicationStyle;
    learnings?: LearningsConfig;
    toolOptions?: SetupManifest["toolOptions"];
    plugin?: PluginConfig;
    gates?: GatesConfig;
}
export declare function extractPreservedManifestFields(manifest: SetupManifest): PreservedManifestFields;
export declare function applyPreservedManifestFields(fresh: SetupManifest, preserved: PreservedManifestFields): SetupManifest;
export declare function readMaturityTier(manifest: SetupManifest | null | undefined): MaturityTier;
export declare function readRuleDelivery(manifest: SetupManifest | null | undefined): RuleDelivery;
export declare function readInstallMode(manifest: SetupManifest | null | undefined): InstallMode;
export declare function pluginOwnedClasses(manifest: SetupManifest | null | undefined, tool: Tool): ReadonlySet<PluginOwnedClass>;
export declare function readGates(manifest: SetupManifest | null | undefined): GatesConfig;
export declare function maturityDirective(tier: MaturityTier): string;
export declare function readCommunicationStyle(manifest: SetupManifest | null | undefined): CommunicationStyle;
export declare function readReviewCap(manifest: SetupManifest | null | undefined): number;
export declare function communicationStyleDirective(style: CommunicationStyle): string;
