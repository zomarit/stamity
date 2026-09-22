import { type CatalogItem, type PackContentRoot } from "../content/catalog.ts";
import type { PackAgentDeclaration } from "../emit/hooksInfra.ts";
import { type ProjectedFile } from "../emit/skillsProjection.ts";
import { type ReadHooksResult } from "../hooks/userHooks.ts";
import { type PackSuppliedServer } from "../mcp/catalog.ts";
import { type SetupManifest } from "../types/manifest.ts";
export interface InstalledPack {
    id: string;
    root: string;
    classesPresent: string[];
    declaredTools: readonly string[];
}
export declare function discoverInstalledPacks(rootDir: string, manifest: SetupManifest): Promise<InstalledPack[]>;
export interface InstalledPackDiscovery {
    packs: InstalledPack[];
    denied: {
        id: string;
        matchedRule?: string;
    }[];
}
export declare function discoverInstalledPacksWithPolicy(rootDir: string, manifest: SetupManifest): Promise<InstalledPackDiscovery>;
export declare function describeDeniedPacks(denied: readonly {
    id: string;
    matchedRule?: string;
}[]): string[];
export declare function packContentRoots(packs: readonly InstalledPack[]): PackContentRoot[];
export interface ResolvedPackContent {
    packs: InstalledPack[];
    packRoots: PackContentRoot[];
    items: CatalogItem[];
    skillRows: ProjectedFile[];
    agents: PackAgentDeclaration[];
    mcpServers: PackSuppliedServer[];
    policyWarnings?: string[];
}
export declare function resolveInstalledPackContent(rootDir: string, manifest: SetupManifest, corpusRoot?: string): Promise<ResolvedPackContent>;
export declare function selectionWithInstalledPacks(manifest: SetupManifest, packItems: readonly CatalogItem[]): SetupManifest;
export declare function packHookDefinitions(packs: readonly InstalledPack[], rootDir: string): Promise<ReadHooksResult>;
export declare function packMcpServers(packs: readonly InstalledPack[], rootDir: string): Promise<PackSuppliedServer[]>;
