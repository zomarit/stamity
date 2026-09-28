import { type Tool } from "../types/core.ts";
import { type PackSuppliedServer } from "./catalog.ts";
export interface EnvVar {
    name: string;
    server: string;
    comment: string;
    url: string;
}
export type EnvMcpShell = "posix" | "powershell" | "git-bash" | "auto" | "all";
export interface EnsureResult {
    path: string;
    created: boolean;
    addedVars: string[];
    preservedVars: string[];
}
export interface EnvValueReport {
    name: string;
    set: boolean;
    masked: string;
    secretPatternIds: string[];
}
export declare const ENV_MCP_FILE = ".env.mcp";
export declare const REQUIRED_GITIGNORE_ENTRIES: readonly string[];
export declare function collectRequiredEnvVars(serverIds: readonly string[], packServers?: readonly PackSuppliedServer[]): EnvVar[];
export declare function getSourceEnvMcpCommand(shell?: EnvMcpShell): string;
export declare function getSourceEnvMcpDisclaimer(shell: EnvMcpShell, tools: readonly Tool[]): string;
export declare function generateEnvMcpContent(vars: readonly EnvVar[], existing?: Record<string, string>): string;
export declare function parseEnvFile(content: string): Record<string, string>;
export declare function reportEnvValues(values: Record<string, string>): EnvValueReport[];
export declare function hardenEnvMcpMode(path: string): Promise<boolean>;
export declare function ensureGitignoreEntry(rootDir: string): Promise<void>;
export declare function ensureEnvMcp(rootDir: string, serverIds: readonly string[], packServers?: readonly PackSuppliedServer[]): Promise<EnsureResult>;
