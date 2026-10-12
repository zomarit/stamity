import { type ConfigKeySpec } from "../commands/config.ts";
import { type SetupManifest } from "../../types/manifest.ts";
export declare const CONFIG_REFERENCE_DOC_PATH = "docs/configuration.md";
export declare function cell(value: string): string;
export declare function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[];
export declare function code(value: string): string;
export declare const UNSET_PROBE: SetupManifest;
export declare function renderConfigReferenceFrom(specs: readonly ConfigKeySpec[]): string;
export declare function renderConfigReference(): string;
