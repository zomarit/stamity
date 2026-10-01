import type { EngineRegistry } from "../../../index.ts";
import { type Tool } from "../../../types/core.ts";
import type { InstallMode, PluginClientRecord, PluginOwnedClass } from "../../../types/manifest.ts";
import { type DuplicateFinding } from "./probe.ts";
interface PluginStatusRuntime {
    kind: "companion" | "bundled" | "none";
    path: string | null;
    version: string | null;
    message: string | null;
}
interface PluginStatusClient {
    tool: Tool;
    recorded: PluginClientRecord | null;
    rootFound: boolean;
    rootVersion: string | null;
    clientFloor: string;
    selected: boolean;
}
interface PluginStatusUnconfigured {
    fact: string;
    command: string;
}
export interface PluginStatusReport {
    installMode: InstallMode;
    runtime: PluginStatusRuntime;
    node: {
        version: string;
        floor: string | null;
        ok: boolean;
    };
    clients: PluginStatusClient[];
    compatibility: {
        state: "compatible" | "mismatch" | "not-applicable";
        pluginVersion: string | null;
        manifestVersion: string | null;
    };
    duplicates: {
        tool: Tool;
        class: PluginOwnedClass;
        source: DuplicateFinding["source"];
        files: number;
        paths: string[];
        remedy: string;
    }[];
    coexistence: boolean;
    setup: {
        needed: boolean;
        unconfigured: PluginStatusUnconfigured[];
    };
}
export interface PluginStatusOptions {
    pluginRoot?: string;
    env: Readonly<Record<string, string | undefined>>;
    nodeVersion: string;
    clients?: readonly Tool[];
}
export declare function buildPluginStatus(rootDir: string, engine: EngineRegistry, opts: PluginStatusOptions): Promise<PluginStatusReport>;
export {};
