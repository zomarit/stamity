import type { Tool } from "../types/core.ts";
export declare const CANONICAL_HOOK_EVENTS: readonly ["session_start", "pre_tool_use", "post_tool_use", "user_prompt_submit", "stop", "session_end"];
export type CanonicalHookEvent = (typeof CANONICAL_HOOK_EVENTS)[number];
export declare const CLAUDE_EVENT_NAMES: Record<CanonicalHookEvent, string>;
export declare function isCanonicalHookEvent(v: string): v is CanonicalHookEvent;
export type HookFailMode = "fail-closed" | "fail-open" | "opt-in-fail-closed";
export interface ClientHookGuarantee {
    tool: Tool;
    failMode: HookFailMode;
    blockingExitCode: number | null;
    notes: string;
}
export declare const CLIENT_HOOK_GUARANTEES: readonly ClientHookGuarantee[];
export interface ClientExtensionEvent {
    readonly tool: Tool;
    readonly event: string;
    readonly portable: false;
    readonly note: string;
    readonly citation: {
        url: string;
        accessDate: string;
    };
}
export declare const CLIENT_EXTENSION_EVENTS: readonly ClientExtensionEvent[];
export interface HookInterchange {
    event: CanonicalHookEvent;
    matcher?: string;
    command: readonly string[];
    timeoutMs?: number;
}
