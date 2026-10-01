import { type HookInterchange } from "../hooks/model.ts";
import { type CatalogItem } from "../content/catalog.ts";
import { type PackageManagerInfo } from "../detect/packageManager.ts";
import type { AdapterDialectFacts, ResiduePlanner } from "../emit/planner.ts";
import { type ResolvedAgentGrant } from "../roster/agentGrants.ts";
import { type ModelPinMap } from "../roster/modelLadder.ts";
import type { AdapterOutput } from "../types/content.ts";
export declare const COPILOT_HOOKS_PATH = ".github/hooks/stamity.json";
export declare const COPILOT_PROMPTS_DIR = ".github/prompts";
export declare const COPILOT_SETUP_STEPS_PATH = ".github/workflows/copilot-setup-steps.yml";
export declare const COPILOT_AGENT_PROMPT_CAP = 30000;
export declare const COPILOT_DIALECT_FACTS: AdapterDialectFacts;
export declare const copilotResiduePlanner: ResiduePlanner;
export declare function buildInstructionsFile(item: CatalogItem, render: (raw: string) => string): AdapterOutput;
export declare function buildAgentFile(item: CatalogItem, grant: ResolvedAgentGrant, render: (raw: string) => string, pins?: ModelPinMap): AdapterOutput;
export declare function buildPromptFile(item: CatalogItem, render: (raw: string) => string, pins?: ModelPinMap): AdapterOutput;
export declare function buildSetupSteps(packageManager: PackageManagerInfo, languages: readonly string[], pins: SetupStepsPins): string;
export interface ActionPin {
    readonly ref: string;
    readonly comment: string | null;
    readonly source: string;
}
export interface SetupStepsPins {
    readonly node: {
        readonly version: string;
        readonly source: string;
    } | null;
    readonly checkout: ActionPin | null;
    readonly setupNode: ActionPin | null;
}
export declare const NO_SETUP_STEPS_PINS: SetupStepsPins;
export declare function readSetupStepsPins(rootDir: string): Promise<SetupStepsPins>;
export declare function engineRangeFloor(range: string): string | null;
export declare function buildCopilotHooksJson(rows: readonly HookInterchange[]): string;
