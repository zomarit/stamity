import { type CatalogItem } from "../content/catalog.ts";
import { type CoreEmissionPlan, type EmissionContext, type ResiduePlanner } from "../emit/planner.ts";
import { type ResolvedAgentGrant } from "../roster/agentGrants.ts";
import { type EffortMap, type ModelPinMap } from "../roster/modelLadder.ts";
export declare const CODEX_HOOKS_FILE = ".codex/hooks.json";
export declare const CODEX_CONFIG_FILE = ".codex/config.toml";
export declare const CODEX_AGENTS_DIR = ".codex/agents";
export declare const CODEX_COMMANDS_DIR: string | null;
export declare const CODEX_AGENTS_MD_BUDGET_BYTES = 32768;
export declare const CODEX_SKILLS_LIST_BUDGET_CHARS = 8000;
export declare const codexResiduePlanner: ResiduePlanner;
export declare function skillsListCharacters(skills: readonly {
    path: string;
    content: string;
}[]): number;
export declare function buildHooksJson(core: CoreEmissionPlan, hookScriptsRoot?: string): string;
interface ModelOptions {
    pins?: ModelPinMap;
    efforts?: EffortMap;
}
export declare function buildAgentToml(item: CatalogItem, grant: ResolvedAgentGrant, body?: string, opts?: ModelOptions): string;
export declare function composeConfigToml(core: CoreEmissionPlan, ctx: EmissionContext): string;
export interface DownConvertedRules {
    nested: {
        path: string;
        content: string;
    }[];
    rootReplacement: string | null;
    dropped: string[];
}
export declare function downConvertRules(items: readonly CatalogItem[], coreRoot: string, coreNestedPaths?: readonly string[], onDemandIds?: ReadonlySet<string>): DownConvertedRules;
export {};
