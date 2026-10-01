import type { CoOwnedReduction, MergeResult } from "../types/content.ts";
export type McpJsonParseResult = {
    ok: true;
    doc: Record<string, unknown>;
    servers: Record<string, unknown>;
    maps: readonly string[];
} | {
    ok: false;
    error: string;
};
export declare function parseMcpJsonDocument(raw: string): McpJsonParseResult;
export declare function describeValue(value: unknown): string;
export declare function readFailure(cause: unknown, path: string, document?: string): unknown;
export declare function predictMcpMergeRefusal(filePath: string): Promise<string | null>;
export interface FilterMcpResult {
    content: string;
    removed: string[];
    preservedUserServers: string[];
    unparseable?: string;
}
export declare function filterMcpServers(raw: string, managedIds: ReadonlySet<string>, selectedIds: ReadonlySet<string>): FilterMcpResult;
export declare function filterMcpJsonOnDisk(filePath: string, managedIds: ReadonlySet<string>, selectedIds: ReadonlySet<string>): Promise<FilterMcpResult | null>;
export declare function reduceMcpDocumentToUserContent(raw: string, managedIds: ReadonlySet<string>): CoOwnedReduction;
export declare function materializeUserMcpJson(filePath: string, emitted: string, managedIds: ReadonlySet<string>): Promise<McpMergeResult>;
export interface McpMergeResult extends MergeResult {
    writtenContent: string | null;
}
export declare function planUserMcpJson(filePath: string, emitted: string, managedIds: ReadonlySet<string>, existingRaw: string | null): {
    result: MergeResult;
    content: string | null;
};
export declare function jsonDocument(value: unknown): string;
export declare function readTextOrNull(path: string, document?: string): Promise<string | null>;
