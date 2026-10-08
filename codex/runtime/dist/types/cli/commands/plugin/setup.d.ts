import { type PluginCapabilityFile } from "../../../plugins/capabilityFile.ts";
import { type Tool } from "../../../types/core.ts";
import type { PluginConfig } from "../../../types/manifest.ts";
import { type InitApplyReport } from "../init/apply.ts";
import { type InitDecisions } from "../init/plan.ts";
export interface PluginSetupRoot {
    tool: Tool;
    root: string;
    file: PluginCapabilityFile;
}
export interface PluginSetupInput {
    rootDir: string;
    roots: readonly PluginSetupRoot[];
    engineVersion: string;
    dryRun: boolean;
    now: Date;
}
export interface PluginSetupPlan {
    decisions: InitDecisions;
    plugin: PluginConfig;
}
export declare function planPluginSetup(input: PluginSetupInput): Promise<PluginSetupPlan>;
export declare function applyPluginSetup(input: PluginSetupInput): Promise<InitApplyReport>;
