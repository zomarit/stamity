import { type HookInterchange } from "./model.ts";
export type HookParseErrorCode = "INVALID_JSON" | "UNREADABLE_FILE" | "UNKNOWN_EVENT" | "SHELL_FORM_COMMAND" | "NETWORK_FETCH" | "LAUNCHER_NOT_ALLOWED" | "INLINE_CODE_FLAG" | "NO_SCRIPT_ARGUMENT" | "MISSING_SCRIPT" | "UNSAFE_PATH";
export interface HookParseError {
    file: string;
    code: HookParseErrorCode;
    message: string;
}
export interface UserHookDefinition extends HookInterchange {
    sourceFile: string;
}
export interface ReadHooksResult {
    hooks: UserHookDefinition[];
    errors: HookParseError[];
}
export declare function readHookDefinitions(hooksDir: string, rootDir?: string): Promise<ReadHooksResult>;
