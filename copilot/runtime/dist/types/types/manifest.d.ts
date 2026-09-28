import type { CommunicationStyle, EffortLevel, ImportMode, MaturityTier, ModelClass, Platform, Tool } from "./core.ts";
import type { ContentClass, ContentSelection } from "./content.ts";
import type { DetectedSummary } from "./detect.ts";
export declare const MANIFEST_FILE = "manifest.json";
export declare const MANIFEST_VERSION = "1.0.0";
export interface ManifestMigration {
    fromVersion: string;
    migrate(raw: Record<string, unknown>): Record<string, unknown>;
}
export declare const PACK_OWNER_PREFIX = "pack:";
export type PackOwner = `${typeof PACK_OWNER_PREFIX}${string}`;
export type LedgerOwner = Tool | PackOwner;
export declare function packOwner(packId: string): PackOwner;
export declare function isPackOwner(owner: LedgerOwner): owner is PackOwner;
export interface LedgerEntry {
    path: string;
    adapter: LedgerOwner;
    artifactId: string;
    artifactType: ContentClass | "infra";
    contentHash?: string;
    stampedVersion?: string;
}
export interface McpConfig {
    servers: string[];
    protocolVersion?: string;
}
export interface LearningsConfig {
    maxCount?: number;
}
export interface HooksConfig {
    userHooksDir?: string;
}
export interface ModelConfig {
    pins?: Partial<Record<ModelClass, string>>;
    effort?: Partial<Record<ModelClass, EffortLevel>>;
    reviewCap?: number;
}
export interface ImportDecision {
    path: string;
    mode: ImportMode;
}
export type RuleDelivery = "always-on" | "on-demand";
export declare const RULE_DELIVERIES: readonly RuleDelivery[];
export declare const RULE_DELIVERY_DEFAULT: RuleDelivery;
export type InstallMode = "generated" | "plugin-backed";
export declare const INSTALL_MODES: readonly InstallMode[];
export declare const INSTALL_MODE_DEFAULT: InstallMode;
export type PluginOwnedClass = ContentClass | "hooks";
export declare const PLUGIN_OWNED_CLASSES: readonly PluginOwnedClass[];
export interface PluginClientRecord {
    version: string;
    classes: readonly PluginOwnedClass[];
}
export interface PluginConfig {
    mode: InstallMode;
    clients?: Partial<Record<Tool, PluginClientRecord>>;
}
export interface GatesConfig {
    test?: string;
    lint?: string;
    typecheck?: string;
    all?: string;
}
export interface ToolOptions {
    [key: string]: unknown;
}
export interface SetupManifest {
    version: string;
    generatedBy: string;
    createdAt: string;
    updatedAt: string;
    tools: Tool[];
    platform?: Platform;
    maturityTier?: MaturityTier;
    ruleDelivery?: RuleDelivery;
    communicationStyle?: CommunicationStyle;
    selection: ContentSelection;
    ledger: LedgerEntry[];
    mcp?: McpConfig;
    learnings?: LearningsConfig;
    hooks?: HooksConfig;
    models?: ModelConfig;
    plugin?: PluginConfig;
    gates?: GatesConfig;
    importChoice?: readonly ImportDecision[];
    toolOptions?: Partial<Record<Tool, ToolOptions>>;
    detected?: DetectedSummary;
}
