import type { HookInterchange } from "./model.ts";
import type { Tool } from "../types/core.ts";
export declare const PORTABLE_RUNNER_FILE = "stamity-portable-hook.mjs";
export declare const ROOT_VARIABLE_PATH: RegExp;
export declare function portableHookCommand(tool: Tool, row: HookInterchange): string;
export declare function buildPortableHookRunner(tool: Tool): string;
