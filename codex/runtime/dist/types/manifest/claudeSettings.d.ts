import type { CoOwnedReducer, CoOwnedReduction } from "../types/content.ts";
import type { CoOwnership } from "../types/manifest.ts";
import { type CoOwnedJsonSpec, type CoOwnedMergeResult, type CoOwnedOwnership, type CoOwnedPlan, type CoOwnedPrediction, type MemberSpec } from "./coOwnedJson.ts";
export declare const ENGINE_PERMISSION_ROWS: readonly string[];
export declare function isEngineHookGroup(element: unknown): boolean;
export declare function claudeSettingsSpec(extraMembers?: readonly MemberSpec[]): CoOwnedJsonSpec;
export type SettingsOwnership = CoOwnedOwnership;
export type SettingsPlan = CoOwnedPlan;
export type SettingsMergePrediction = CoOwnedPrediction;
export type SettingsMergeResult = CoOwnedMergeResult;
export declare function planClaudeSettings(filePath: string, emitted: string, existingRaw: string | null, ownership: SettingsOwnership): SettingsPlan;
export declare function predictClaudeSettingsMerge(filePath: string, emitted: string, ownership: SettingsOwnership): Promise<SettingsMergePrediction>;
export declare function materializeClaudeSettings(filePath: string, emitted: string, ownership: SettingsOwnership): Promise<SettingsMergeResult>;
export interface SettingsReduceOptions {
    record: CoOwnership | null;
    legacy: boolean;
    deleteWhenEngineOnly: boolean;
    rendered?: unknown;
}
export declare function reduceClaudeSettingsToForeignContent(raw: string, opts: SettingsReduceOptions): CoOwnedReduction;
export declare function claudeSettingsReclaimReducer(opts: SettingsReduceOptions): CoOwnedReducer;
