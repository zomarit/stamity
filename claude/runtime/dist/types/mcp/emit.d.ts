import type { CoOwnedReducer } from "../types/content.ts";
import { type Tool } from "../types/core.ts";
import { type PackSuppliedServer } from "./catalog.ts";
export type McpDialect = "claude-json" | "cursor-json" | "vscode-json" | "copilot-env" | "codex-toml";
type RenderMode = "emit" | "probe";
export interface McpEmission {
    dialect: McpDialect;
    path: string;
    content: string;
}
export interface McpRenderOptions {
    protocolVersion?: string;
    packServers?: readonly PackSuppliedServer[];
}
export declare const MERGED_MCP_JSON_PATHS: ReadonlySet<string>;
export declare function engineOwnedServerIds(path: string, selectedIds: readonly string[], existingRaw: string | null, packServers?: readonly PackSuppliedServer[]): Set<string>;
export declare function mcpReclaimReducers(packServers?: readonly PackSuppliedServer[]): Map<string, CoOwnedReducer>;
export declare function envPlaceholder(dialect: McpDialect, varName: string): string;
export declare function emitClaudeMcpJson(serverIds: readonly string[], opts?: McpRenderOptions, mode?: RenderMode): string;
export declare function emitCursorMcpJson(serverIds: readonly string[], opts?: McpRenderOptions, mode?: RenderMode): string;
export declare function emitVsCodeServersJson(serverIds: readonly string[], opts?: McpRenderOptions, mode?: RenderMode): string;
export declare function emitCopilotMcpEnv(serverIds: readonly string[], opts?: McpRenderOptions, mode?: RenderMode): {
    name: string;
    value: string;
}[];
export declare function emitCodexToml(serverIds: readonly string[], opts?: McpRenderOptions, mode?: RenderMode): string;
export declare function planMcpEmissions(serverIds: readonly string[], tools: readonly Tool[], opts?: McpRenderOptions): McpEmission[];
export {};
