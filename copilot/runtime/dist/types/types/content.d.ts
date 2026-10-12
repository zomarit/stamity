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
    sourceRefusal?: SourceRefusal;
}
export interface SourceRefusal {
    kind: "linked-source" | "deny-scan";
    message: string;
}
export interface EmissionPlan {
    outputs: AdapterOutput[];
    warnings: string[];
    packReach?: PackReach[];
}
export interface PackReach {
    packId: string;
    artifacts: PackArtifactReach[];
}
export interface PackArtifactReach {
    kind: ContentClass | "hooks" | "mcp-server";
    id: string;
    reachedBy: Tool[];
    dropped: PackArtifactDrop[];
}
type PackArtifactDrop = {
    reason: "plugin-owned";
    tool: Tool;
    cls: ContentClass | "hooks";
} | {
    reason: "declares no selected client";
    declared: Tool[];
} | {
    reason: "not selected";
};
export declare function outputOwners(output: AdapterOutput): EmissionOwner[];
export interface MergeResult {
    path: string;
    action: "created" | "updated" | "skipped" | "unchanged";
    warning?: string;
    notice?: string;
}
export type CoOwnedReduction = ({
    kind: "engine-only";
    detail: string;
} & CoOwnedReductionProof) | ({
    kind: "reduced";
    content: string;
    detail: string;
} & CoOwnedReductionProof) | {
    kind: "untouched";
    refused: boolean;
    detail: string;
};
interface CoOwnedReductionProof {
    proven?: boolean;
    mustBackUp?: true;
}
export type CoOwnedReducer = (content: string) => CoOwnedReduction;
export {};
