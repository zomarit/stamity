import type { FailureLogEntry } from "../resilience/failureLog.ts";
import { type ToolCategory, type ToolCategoryMap } from "./categories.ts";
export type AgentPolicySource = {
    readonly kind: "core";
} | {
    readonly kind: "pack";
    readonly packId: string;
};
export interface AgentToolPolicy {
    agentId: string;
    allow: readonly ToolCategory[];
    denyTools?: readonly string[];
    rationale: string;
    source?: AgentPolicySource;
}
export interface ToolAccessResult {
    allowed: boolean;
    category: ToolCategory | null;
    reason: string;
}
export type AllowlistDenialReason = "unknown-agent" | "category-denied" | "tool-denied" | "reserved-category";
export interface AllowlistDenialEvent {
    agentId: string;
    tool: string;
    reason: AllowlistDenialReason;
}
export type AllowlistDenialListener = (event: AllowlistDenialEvent) => void;
export declare const ALLOWLIST_FAILURE_PHASE = "tool-allowlist";
export declare const AGENT_TOOL_POLICIES_SCHEMA = "stamity/agent-tool-policies/v1";
export declare const AGENT_TOOL_POLICIES_FILE = "agent-tool-policies.json";
export declare function onAllowlistDenial(listener: AllowlistDenialListener): () => void;
export declare function getAgentToolPolicy(roster: readonly AgentToolPolicy[], agentId: string): AgentToolPolicy | undefined;
export declare function checkToolAccess(roster: readonly AgentToolPolicy[], agentId: string, tool: string, toolCategoryMap: ToolCategoryMap): ToolAccessResult;
export declare function validateToolPolicies(roster: readonly AgentToolPolicy[]): string[];
export declare function buildAgentToolPoliciesJson(roster: readonly AgentToolPolicy[]): string;
export declare function deriveUserAgentPolicy(base: AgentToolPolicy, userAdditions: readonly ToolCategory[]): AgentToolPolicy;
export declare function toFailureLogEntry(event: AllowlistDenialEvent, at?: Date): FailureLogEntry;
