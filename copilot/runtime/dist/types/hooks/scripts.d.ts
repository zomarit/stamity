import { type ToolCategory } from "../tools/categories.ts";
import type { Tool } from "../types/core.ts";
import { type CanonicalHookEvent, type HookFailMode } from "./model.ts";
export declare const REVIEW_GATE_FILE = "stamity-review-gate.mjs";
export interface GeneratedHookScript {
    fileName: string;
    content: string;
    event: CanonicalHookEvent;
}
export declare const MAX_POLICY_FILE_BYTES = 262144;
export declare const DEFAULT_MAX_INDEX_LINES = 20;
export declare const REVIEW_GATE_STATE_FILE: string;
export declare const MAX_REVIEW_GATE_STATE_BYTES: number;
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
}
export declare function buildPreToolUseGuardScript(opts: GuardScriptOptions): string;
export declare function unionToolCategoryMap(): Record<string, ToolCategory>;
export declare function buildConfigTamperNoticeScript(): string;
export interface ReviewGateScriptOptions {
    statePath: string;
    maxIterations: number;
    failMode: HookFailMode;
    layout?: HookScriptLayout;
}
export declare function buildReviewGateScript(opts: ReviewGateScriptOptions): string;
export declare function planCoreHookScripts(policiesJsonPath: string, tool: Tool): GeneratedHookScript[];
