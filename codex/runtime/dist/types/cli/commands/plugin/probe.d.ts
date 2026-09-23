import { PLUGIN_ROOT_VARIABLES } from "../../../plugins/capabilityFile.ts";
import { type Tool } from "../../../types/core.ts";
import { type PluginOwnedClass, type SetupManifest } from "../../../types/manifest.ts";
export declare function pluginRootVariable(env: Readonly<Record<string, string | undefined>>): (typeof PLUGIN_ROOT_VARIABLES)[number] | undefined;
type PluginRuntimeOutcome = "resolved" | "refused" | "unreadable" | "timeout";
export interface PluginRuntimeProbe {
    locator: string;
    outcome: PluginRuntimeOutcome;
    kind: "companion" | "bundled" | "none";
    path: string | null;
    version: string | null;
    node: {
        version: string;
        floor: string | null;
        ok: boolean;
    } | null;
    message: string | null;
}
export declare function majorOf(version: string | null | undefined): number | null;
export declare function requiredNodeRange(): Promise<string | null>;
export type NodeFloorVerdict = "satisfies" | "below" | "unparseable";
export declare function judgeNodeFloor(nodeVersion: string, range: string): NodeFloorVerdict;
export declare function nodeFactsFor(nodeVersion: string, floor: string | null): {
    version: string;
    floor: string | null;
    ok: boolean;
};
export declare function engineNodeFacts(nodeVersion: string): Promise<{
    version: string;
    floor: string | null;
    ok: boolean;
}>;
export declare function probePluginRuntime(root: string, options?: {
    timeoutMs?: number;
}): Promise<PluginRuntimeProbe>;
export interface DuplicateFinding {
    tool: Tool;
    cls: PluginOwnedClass;
    source: "ledger" | "apm" | "unmanaged";
    files: number;
    paths: string[];
    remedy: string;
}
export declare const DUPLICATE_PATHS_SHOWN = 3;
export declare function describeDuplicatePaths(paths: readonly string[]): string;
export declare function collectPluginDuplicates(rootDir: string, manifest: SetupManifest | null): Promise<DuplicateFinding[]>;
export {};
