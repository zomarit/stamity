import type { PackSourceKind } from "./manifest.ts";
export declare const ORG_POLICY_REL_PATH = ".stamity/policy.json";
export interface OrgTrustPolicy {
    version: 1;
    packs: {
        allow?: string[];
        deny?: string[];
    };
}
export interface OrgPolicyDecision {
    decision: "allow" | "deny";
    matchedRule?: string;
}
export declare const ORG_POLICY_PATTERN_GRAMMAR: string;
export declare function loadOrgPolicy(rootDir: string): Promise<OrgTrustPolicy | null>;
export declare function orgPolicyPath(rootDir: string): string;
export declare function orgPolicyPatternDefect(pattern: string): string | null;
export declare function emptyOrgPolicy(): OrgTrustPolicy;
export declare function serializeOrgPolicy(policy: OrgTrustPolicy): string;
export declare function writeOrgPolicy(rootDir: string, policy: OrgTrustPolicy): Promise<void>;
export type EvaluatedSourceKind = PackSourceKind | "unknown";
export declare function evaluatePackSource(policy: OrgTrustPolicy | null, packName: string, sourceKind: EvaluatedSourceKind): OrgPolicyDecision;
