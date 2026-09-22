import { type ClientHookGuarantee } from "../hooks/model.ts";
import { type AdapterAllowlistCoverage } from "../tools/translator.ts";
import { type Tool } from "../types/core.ts";
import { type RuleDelivery } from "../types/manifest.ts";
import type { AdapterDialectFacts } from "./planner.ts";
export declare const CAPABILITY_MATRIX_DOC_PATH = "docs/capability-matrix.md";
export declare const REGENERATE_COMMAND = "node scripts/generate-capability-matrix.mjs";
export interface CapabilityMatrixInputs {
    readonly facts: readonly AdapterDialectFacts[];
    readonly guarantees: readonly ClientHookGuarantee[];
    readonly coverage: readonly AdapterAllowlistCoverage[];
    readonly triggers: readonly RevisitTrigger[];
    readonly alwaysOn: AlwaysOnDisclosure;
    readonly plugins?: readonly PluginContainerFact[];
}
export declare const PLUGIN_CONTAINER_CLASSES: readonly ["agent", "skill", "command", "rule", "hooks", "mcp"];
export type PluginContainerClass = (typeof PLUGIN_CONTAINER_CLASSES)[number];
export interface PluginContainerFact {
    readonly tool: Tool;
    readonly container: string;
    readonly carries: readonly PluginContainerClass[];
    readonly repositoryOwned: readonly PluginContainerClass[];
    readonly invocation: string;
    readonly floor: string;
    readonly rootVariable: string;
    readonly citations: readonly {
        readonly url: string;
        readonly accessDate: string;
    }[];
}
export interface AlwaysOnDisclosure {
    readonly ceilings: Readonly<Record<Tool, number>>;
    readonly charterCap: number;
    readonly sharedBytesWithCodex: number;
    readonly sharedBytesWithoutCodex: number;
    readonly codexDroppedRuleCount: number;
    readonly ruleDelivery: RuleDelivery;
    readonly codexFoldedRuleIds: readonly string[];
    readonly codexRuleSkillCount: number;
    readonly codexSkillsListChars: number;
    readonly codexSkillsListCap: number;
    readonly sharedTreeDuplicateRules: Readonly<Record<Tool, number>>;
}
export interface RevisitTrigger {
    readonly when: string;
    readonly action: string;
    readonly watch: Tool | null;
    readonly status: string;
}
export declare const REVISIT_TRIGGERS: readonly RevisitTrigger[];
export declare const LIVE_CAPABILITY_INPUTS: CapabilityMatrixInputs;
export declare function renderCapabilityMatrixFrom(inputs: CapabilityMatrixInputs): string;
export declare function renderCapabilityMatrix(): string;
