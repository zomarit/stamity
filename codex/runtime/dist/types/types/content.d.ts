import type { Tool } from "./core.ts";
export declare const CONTENT_CLASSES: readonly ["agent", "skill", "rule", "command"];
export type ContentClass = (typeof CONTENT_CLASSES)[number];
export type RulePrecedence = "critical" | "high" | "normal" | "low";
export interface CanonicalFile {
    path: string;
    relativePath: string;
    type: ContentClass;
    id: string;
    frontmatter: Record<string, unknown>;
    body: string;
    tags: string[];
    precedence?: RulePrecedence;
    provenance?: {
        pack: string;
    };
}
export interface ContentSelection {
    items: Record<ContentClass, string[]>;
}
export interface EmissionOwner {
    adapter: Tool;
    artifactId: string;
    artifactType: ContentClass | "infra";
}
export interface AdapterOutput {
    path: string;
    content: string;
    owner: EmissionOwner;
    coOwners?: readonly EmissionOwner[];
    replacesSharedPath?: boolean;
}
export interface EmissionPlan {
    outputs: AdapterOutput[];
    warnings: string[];
}
export declare function outputOwners(output: AdapterOutput): EmissionOwner[];
export interface MergeResult {
    path: string;
    action: "created" | "updated" | "skipped" | "unchanged";
    warning?: string;
    notice?: string;
}
export type CoOwnedReduction = {
    kind: "engine-only";
    detail: string;
} | {
    kind: "reduced";
    content: string;
    detail: string;
} | {
    kind: "untouched";
    detail: string;
};
export type CoOwnedReducer = (content: string) => CoOwnedReduction;
