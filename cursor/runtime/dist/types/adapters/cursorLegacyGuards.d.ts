export declare const CURSOR_1_11_0_VERSION = "1.11.0";
export declare const CURSOR_1_11_0_RUNTIME_AGENT_IDS: readonly string[];
export declare const CURSOR_1_11_0_GUARD_ENTRIES: ReadonlyMap<string, {
    readonly event: string;
    readonly entry: unknown;
}>;
export interface CursorGuardSetup {
    readonly agentIds: readonly string[];
    readonly packageName: string;
    readonly npmChannel?: boolean;
}
export declare function render1110CursorGuards(setup: CursorGuardSetup): ReadonlyMap<string, string>;
