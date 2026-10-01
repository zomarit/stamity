import { type DenyPattern } from "../denyscan/denyScan.ts";
import { type ToolCategory } from "../tools/categories.ts";
import type { Tool } from "../types/core.ts";
import { type CanonicalHookEvent, type HookFailMode } from "./model.ts";
export declare const REVIEW_GATE_FILE = "stamity-review-gate.mjs";
export declare const HOOK_SCRIPT_BUDGETS: Readonly<Record<string, {
    readonly bytes: number;
    readonly lines: number;
}>>;
export interface GeneratedHookScript {
    fileName: string;
    content: string;
    event: CanonicalHookEvent;
}
export declare const MAX_POLICY_FILE_BYTES = 262144;
export declare const DEFAULT_MAX_INDEX_LINES = 20;
export { REVIEW_GATE_STATE_FILE } from "../types/markers.ts";
export declare const MAX_REVIEW_GATE_STATE_BYTES: number;
export declare const SESSION_START_SCREEN: readonly DenyPattern[];
export declare const SESSION_START_SCREEN_PATTERN_IDS: readonly string[];
export type HookScriptLayout = "generated" | "container";
export interface SessionStartScriptOptions {
    stateDir?: string;
    maxIndexLines?: number;
    layout?: HookScriptLayout;
}
export declare function buildSessionStartScript(opts?: SessionStartScriptOptions): string;
export declare const IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS: ReadonlySet<Tool>;
export interface GuardScriptOptions {
    policiesJsonPath: string;
    failMode: HookFailMode;
    identityBearing?: boolean;
    layout?: HookScriptLayout;
}
export declare function buildPreToolUseGuardScript(opts: GuardScriptOptions): string;
export declare function unionToolCategoryMap(): Record<string, ToolCategory>;
export declare function buildConfigTamperNoticeScript(opts: {
    checkCall: string;
}): string;
export interface ReviewGateScriptOptions {
    statePath: string;
    maxIterations: number;
    failMode: HookFailMode;
    layout?: HookScriptLayout;
}
export declare function buildReviewGateScript(opts: ReviewGateScriptOptions): string;
export declare function planCoreHookScripts(policiesJsonPath: string, tool: Tool, opts: {
    packageName: string;
    version: string;
    npmChannel?: boolean;
}): GeneratedHookScript[];
