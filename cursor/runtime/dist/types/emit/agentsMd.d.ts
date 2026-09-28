import type { PackageEntry } from "../types/detect.ts";
import type { SetupManifest } from "../types/manifest.ts";
import type { Tool } from "../types/core.ts";
import { type VerificationGateSet } from "./substitution.ts";
export declare const AGENTS_MD_FILE = "AGENTS.md";
export interface AgentsMdEmissionContext {
    manifest: SetupManifest;
    facts: {
        monorepoPackages: readonly PackageEntry[];
    };
    contentRoot?: string;
}
export interface RenderedAgentsMd {
    content: string;
    byteLength: number;
    lineCount: number;
}
export interface NestedAgentsMdTarget {
    outputPath: string;
    content: string;
}
export interface AgentsMdPlan {
    root: RenderedAgentsMd;
    nestedFor(tool: Tool): NestedAgentsMdTarget[];
}
export declare function renderAgentsMd(ctx: AgentsMdEmissionContext): Promise<AgentsMdPlan>;
export declare function verificationGatesFromManifest(manifest: SetupManifest): VerificationGateSet;
