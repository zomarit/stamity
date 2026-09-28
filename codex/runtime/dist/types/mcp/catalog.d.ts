export declare const CATALOG_VERIFIED_ON = "2026-08-16";
import type { Platform } from "../types/core.ts";
export interface McpEnvRequirement {
    name: string;
    comment: string;
    url: string;
}
export interface McpServerMeta {
    id: string;
    description: string;
    command: string;
    args: readonly string[];
    transport: "stdio" | "http";
    requiresEnv?: readonly McpEnvRequirement[];
    pinnedVersion: string;
    pinReviewedOn?: string;
    packageNameLock: string;
    firstParty: boolean;
    blastRadius: string;
    docsUrl: string;
}
export interface PackSuppliedServer extends McpServerMeta {
    readonly firstParty: false;
    readonly sourcePackId: string;
}
export declare const CURATED_MCP_SERVERS: Record<string, McpServerMeta>;
export declare const PLATFORM_MCP_SERVER: Record<Platform, string>;
export declare function getServerMeta(id: string): McpServerMeta | undefined;
export declare function resolveServerMeta(id: string, packServers?: readonly PackSuppliedServer[]): McpServerMeta | PackSuppliedServer | undefined;
export declare function assertNoCuratedCollision(packServers: readonly PackSuppliedServer[]): void;
export declare function pinnedPackageSpec(meta: Pick<McpServerMeta, "command" | "packageNameLock" | "pinnedVersion">): string | undefined;
export declare function validateServerIds(ids: readonly string[], packServers?: readonly PackSuppliedServer[]): {
    valid: string[];
    unknown: string[];
};
