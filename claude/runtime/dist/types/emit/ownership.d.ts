import type { EmissionOwner } from "../types/content.ts";
import { type Tool } from "../types/core.ts";
import { type PluginOwnedClass, type SetupManifest } from "../types/manifest.ts";
export declare function isPluginOwned(manifest: SetupManifest | null | undefined, tool: Tool, cls: PluginOwnedClass): boolean;
export declare function sharedProjectionOwners(manifest: SetupManifest | null | undefined, readers: readonly Tool[]): Tool[];
export interface PluginOwnedClasses {
    tool: Tool;
    classes: PluginOwnedClass[];
}
export declare function pluginOwnedSummary(manifest: SetupManifest | null | undefined): PluginOwnedClasses[];
export declare function withoutPluginOwnedRows<Row extends {
    path: string;
    owner: EmissionOwner;
}>(manifest: SetupManifest | null | undefined, tool: Tool, rows: readonly Row[], hookInfraArtifactIds: ReadonlySet<string>, exemptPaths?: ReadonlySet<string>): Row[];
