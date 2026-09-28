export declare const GRANTABLE_TOOL_CATEGORIES: readonly ["read", "edit", "execute", "network", "spawn", "planning"];
export type GrantableToolCategory = (typeof GRANTABLE_TOOL_CATEGORIES)[number];
export interface AgentPolicyRow {
    readonly agentId: string;
    readonly allow: readonly GrantableToolCategory[];
    readonly denyTools?: readonly string[];
    readonly writePaths?: readonly string[];
    readonly rationale: string;
}
export declare function verdictReportWritePaths(role: "reviewer" | "security" | "performance" | "design-quality"): readonly string[];
export declare function isWritePathPattern(value: unknown): value is string;
export declare const AGENT_POLICY_ROSTER: readonly AgentPolicyRow[];
export declare const RUNTIME_AGENT_IDS: readonly string[];
