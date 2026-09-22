import { type AgentPolicyRow, type GrantableToolCategory } from "./agentPolicies.ts";
export type GrantSource = "roster" | "frontmatter" | "none";
export interface ResolvedAgentGrant {
    readonly runtimeId: string;
    readonly allow: readonly GrantableToolCategory[];
    readonly source: GrantSource;
    readonly diagnostics: readonly string[];
}
export interface ResolveAgentGrantInput {
    readonly runtimeId: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
    readonly roster?: readonly AgentPolicyRow[];
    readonly declaredTools?: readonly GrantableToolCategory[];
}
export declare const NEVER_DERIVABLE_CATEGORIES: ReadonlySet<GrantableToolCategory>;
export declare function grantableFootprint(declared: readonly string[] | undefined): GrantableToolCategory[];
export declare function parseCapabilities(frontmatter: Readonly<Record<string, unknown>>): GrantableToolCategory[];
export declare function resolveAgentGrant(input: ResolveAgentGrantInput): ResolvedAgentGrant;
