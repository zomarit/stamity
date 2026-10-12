import { type CoOwnedJsonSpec } from "./coOwnedJson.ts";
export declare const CURSOR_HOOK_EVENTS: readonly string[];
export interface CursorHookDefect {
    pointer: string;
    reason: "unknown-event" | "no-command" | "no-prompt" | "unknown-type";
}
export declare function cursorHookDefects(doc: unknown): CursorHookDefect[];
export declare function describeCursorHookDefects(shown: string, raw: string | null): string | null;
export interface CursorHooksSpecOptions {
    guardPaths: readonly string[];
}
export declare function cursorHooksSpec(opts: CursorHooksSpecOptions): CoOwnedJsonSpec;
export declare function isKnownCodexHooksDescription(value: unknown): boolean;
export declare function isKnownCodexHooksStamity(value: unknown): boolean;
export declare function codexHooksSpec(): CoOwnedJsonSpec;
export interface DirectHookRow {
    event: string;
    matcher?: string;
    command: readonly string[];
    timeoutMs?: number;
}
export declare function directHookRendering(client: "cursor" | "codex", rows: readonly DirectHookRow[]): {
    hooks: Record<string, unknown[]>;
};
export declare function referencedHookScripts(text: string): Set<string>;
export declare function hookScriptReader(guardPaths: readonly string[]): {
    isHookScript(path: string): boolean;
    runs(text: string, path: string): boolean;
};
