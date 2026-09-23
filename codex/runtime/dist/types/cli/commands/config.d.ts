import type { CommandModule } from "../kit/program.ts";
import { type PackSuppliedServer } from "../../mcp/catalog.ts";
import { type SetupManifest } from "../../types/manifest.ts";
export interface ConfigApplyContext {
    readonly packServers: readonly PackSuppliedServer[];
}
export interface ConfigKeySpec {
    readonly key: string;
    readonly hint: string;
    readonly needsPackSupply?: boolean;
    readonly choices?: readonly string[];
    readonly multiple?: boolean;
    readonly read: (manifest: SetupManifest) => string | null;
    readonly resolve: (manifest: SetupManifest) => string;
    readonly apply: (draft: SetupManifest, raw: string, context: ConfigApplyContext) => void;
}
export declare const KEY_SPECS: readonly ConfigKeySpec[];
export declare const CONFIG_KEYS: readonly string[];
export interface ConfigValue {
    value: string | null;
    isDefault: boolean;
    resolved: string;
}
export declare function getConfigValue(manifest: SetupManifest, key: string): ConfigValue;
export declare function setConfigValue(manifest: SetupManifest, key: string, raw: string, context?: ConfigApplyContext): SetupManifest;
export declare const configCommand: CommandModule;
