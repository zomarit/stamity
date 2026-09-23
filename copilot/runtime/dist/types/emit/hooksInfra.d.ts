import type { HookInterchange } from "../hooks/model.ts";
import { type ReadHooksResult } from "../hooks/userHooks.ts";
import { type GrantableToolCategory } from "../roster/agentPolicies.ts";
import { type Tool } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";
import { GENERATED_DIR, HOOKS_GENERATED_DIR } from "../types/markers.ts";
export { GENERATED_DIR, HOOKS_GENERATED_DIR };
export declare const AGENT_TOOL_POLICIES_PATH = ".stamity/generated/agent-tool-policies.json";
export interface PlannedHookScript {
    path: string;
    content: string;
    tool: Tool;
}
export interface PlannedPolicyDocument {
    path: string;
    content: string;
    owners: readonly Tool[];
}
export interface CoreHooksPlan {
    scripts: PlannedHookScript[];
    policyDocument: PlannedPolicyDocument;
    interchangeFor(tool: Tool): HookInterchange[];
    warnings: string[];
}
export interface PackAgentDeclaration {
    readonly runtimeId: string;
    readonly packId: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
    readonly declaredTools: readonly GrantableToolCategory[];
}
export interface HooksPlanContext {
    rootDir: string;
    manifest: Pick<SetupManifest, "tools" | "hooks">;
    packHooks?: ReadHooksResult;
    packAgents?: readonly PackAgentDeclaration[];
    hookScriptsRoot?: string;
    pluginOwnedHooks?: readonly Tool[];
}
export declare function planHooksInfra(ctx: HooksPlanContext): Promise<CoreHooksPlan>;
