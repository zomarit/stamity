export interface McpScanTarget {
    id: string;
    description?: string;
    command?: string;
    args?: readonly string[];
}
export interface McpToolDeclaration {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
export interface ToolManifestDrift {
    serverId: string;
    expectedHash: string;
    actualHash: string;
}
export declare function scanMcpEntry(target: McpScanTarget): string[];
export declare function scanMcpServers(servers: Record<string, McpScanTarget>): Record<string, string[]>;
export declare function hashToolManifest(tools: readonly McpToolDeclaration[]): string;
export declare function detectToolManifestDrift(pinned: Record<string, string>, current: Record<string, string>): ToolManifestDrift[];
