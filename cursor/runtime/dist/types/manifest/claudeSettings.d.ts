import type { CoOwnedReducer, CoOwnedReduction, MergeResult } from "../types/content.ts";
export interface SettingsOwnership {
    owned: boolean;
    force: boolean;
    ownedKeys?: readonly string[];
    ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
    boundaryDir?: string;
}
export interface SettingsPlan {
    result: MergeResult;
    content: string | null;
    backup: string | null;
    collision: string | null;
}
export declare function planClaudeSettings(filePath: string, emitted: string, existingRaw: string | null, ownership: SettingsOwnership): SettingsPlan;
export interface SettingsMergePrediction {
    result: MergeResult;
    collision: {
        kind: "shared-name" | "unmanaged-name";
        detail: string;
    } | null;
}
export declare function predictClaudeSettingsMerge(filePath: string, emitted: string, ownership: SettingsOwnership): Promise<SettingsMergePrediction>;
export interface SettingsMergeResult extends MergeResult {
    writtenContent: string | null;
}
export declare function materializeClaudeSettings(filePath: string, emitted: string, ownership: SettingsOwnership): Promise<SettingsMergeResult>;
export declare function reduceClaudeSettingsToForeignContent(raw: string, ownedKeys: readonly string[]): CoOwnedReduction;
export declare function claudeSettingsReclaimReducer(ownedKeys: readonly string[]): CoOwnedReducer;
