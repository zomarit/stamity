export declare const GRANTABLE_TOOL_CATEGORIES: readonly ["read", "edit", "execute", "network", "spawn", "planning"];
export type GrantableToolCategory = (typeof GRANTABLE_TOOL_CATEGORIES)[number];
export interface AgentPolicyRow {
    readonly agentId: string;
    readonly allow: readonly GrantableToolCategory[];
    readonly denyTools?: readonly string[];
    readonly rationale: string;
}
export declare const AGENT_POLICY_ROSTER: readonly AgentPolicyRow[];
export declare const RUNTIME_AGENT_IDS: readonly string[];
