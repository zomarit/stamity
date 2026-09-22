import { type Tool } from "../types/core.ts";
import { type PluginOwnedClass } from "../types/manifest.ts";
export declare const CAPABILITY_FILE = "stamity-plugin.json";
export declare const CAPABILITY_SCHEMA_VERSION = 1;
export declare const PLUGIN_CAPABILITY_CLASSES: readonly PluginCapabilityClass[];
export type PluginCapabilityClass = PluginOwnedClass | "mcp";
export type CapabilityClassStatus = "carried" | "repository-owned" | "unsupported";
export interface PluginCapabilityClassEntry {
    status: CapabilityClassStatus;
    count?: number;
    reason?: string;
}
export interface PluginClientFloor {
    version: string;
    citation?: {
        url: string;
        accessDate: string;
    };
    reason?: string;
}
export interface PluginRuntimeLocation {
    path: string;
    locator: string;
    companion: {
        package: string;
        compatible: string;
    };
}
export interface PluginCapabilityFile {
    schemaVersion: 1;
    client: Tool;
    version: string;
    sourceCommit: string;
    invocation: Record<string, string>;
    clientFloor: PluginClientFloor;
    prerequisites: {
        node: string;
        git: "optional" | "required";
        [client: string]: string;
    };
    classes: Record<PluginCapabilityClass, PluginCapabilityClassEntry>;
    runtime: PluginRuntimeLocation;
    distribution?: {
        note: string;
    };
}
export declare function readCapabilityFile(pluginRoot: string): Promise<PluginCapabilityFile>;
export declare function carriedClasses(file: PluginCapabilityFile): PluginOwnedClass[];
export declare const CARRIABLE_CLASSES: Readonly<Record<Tool, readonly PluginOwnedClass[]>>;
export declare function uncarriableClasses(file: PluginCapabilityFile): PluginOwnedClass[];
export declare function invocationForms(file: PluginCapabilityFile): Record<string, string>;
export declare const PLUGIN_ROOT_VARIABLES: readonly ["CLAUDE_PLUGIN_ROOT", "CURSOR_PLUGIN_ROOT", "PLUGIN_ROOT", "COPILOT_PLUGIN_ROOT"];
export declare function resolvePluginRoot(opts: {
    flag?: string;
    env: Readonly<Record<string, string | undefined>>;
}): string | null;
