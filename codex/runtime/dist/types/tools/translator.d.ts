import { type Tool } from "../types/core.ts";
import { type ToolCategory } from "./categories.ts";
export declare function toClaudeToolsFrontmatter(categories: readonly ToolCategory[]): string;
export declare function toCopilotToolsFrontmatter(categories: readonly ToolCategory[]): string;
export declare function toCodexToolsFrontmatter(categories: readonly ToolCategory[]): string;
export declare function toCursorReadonlyFrontmatter(categories: readonly ToolCategory[]): boolean | null;
export interface AdapterAllowlistCoverage {
    readonly tool: Tool;
    readonly mechanism: string;
    readonly strength: "hard" | "soft" | "none";
    readonly provisional?: boolean;
}
export declare const ADAPTER_ALLOWLIST_COVERAGE: readonly AdapterAllowlistCoverage[];
export declare function buildAllowlistCoverageTable(): string;
export interface AskUserToolEntry {
    readonly tool: Tool;
    readonly toolName: string | null;
    readonly note: string;
}
export declare function getAskUserToolEntry(tool: Tool): AskUserToolEntry;
export declare const PLATFORM_TOOL_MARKER = "<!-- STAMITY:PLATFORM-TOOL -->";
export declare function buildAskUserPlatformTable(): string;
export declare function substituteCanonicalPlatformMarker(content: string, tool: Tool): string;
