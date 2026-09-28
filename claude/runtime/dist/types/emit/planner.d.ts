import { type AgentsMdPlan } from "./agentsMd.ts";
import { type CoreHooksPlan } from "./hooksInfra.ts";
import { type ProjectedFile } from "./skillsProjection.ts";
import { type ContentRoots } from "../content/catalog.ts";
import type { PackSuppliedServer } from "../mcp/catalog.ts";
import { type McpDialect, type McpEmission } from "../mcp/emit.ts";
import { type ResolvedPackContent } from "../pack/projection.ts";
import { type AdapterOutput, type EmissionPlan } from "../types/content.ts";
import { type Tool } from "../types/core.ts";
import type { PackageEntry } from "../types/detect.ts";
import { type SetupManifest } from "../types/manifest.ts";
export interface EmissionContext {
    rootDir: string;
    manifest: SetupManifest;
    engineVersion: string;
    facts: {
        monorepoPackages: readonly PackageEntry[];
        hookScriptsRoot?: string;
    };
    contentRoot?: string | ContentRoots;
}
export interface EmissionPlanner {
    readonly id: string;
    plan(ctx: EmissionContext): Promise<AdapterOutput[]>;
    planWithWarnings(ctx: EmissionContext): Promise<EmissionPlan>;
}
export interface CoreEmissionPlan {
    agentsMd: AgentsMdPlan;
    skills: ProjectedFile[];
    demotedRules: Readonly<Record<Tool, ReadonlySet<string>>>;
    hooks: CoreHooksPlan;
    mcpFor(tool: Tool): McpEmission[];
    packMcpServers: readonly PackSuppliedServer[];
}
export interface AdapterDialectFacts {
    tool: Tool;
    ruleShape: string;
    hooksConfigPath: string | null;
    readsAgentsSkillsDir: boolean;
    agentsFormat: string;
    mcpDialect: McpDialect;
    entryFile: string | null;
    caps: {
        name: string;
        value: string;
    }[];
    citations: {
        url: string;
        accessDate: string;
    }[];
}
export interface ResidueEmission {
    outputs: AdapterOutput[];
    warnings?: readonly string[];
}
export interface ResiduePlanner {
    tool: Tool;
    facts: AdapterDialectFacts;
    planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission>;
}
export declare const CHARTER_ARTIFACT_ID = "charter";
export declare const POLICY_DOCUMENT_ARTIFACT_ID = "agent-tool-policies";
export declare function buildCoreEmissionPlan(ctx: EmissionContext, packs?: ResolvedPackContent): Promise<CoreEmissionPlan>;
export declare function composeEmissionPlanner(residues: Partial<Record<Tool, ResiduePlanner>>): EmissionPlanner;
