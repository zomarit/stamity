import { type Tool } from "../types/core.ts";
import { type Handoff, type HandoffStatus } from "./schema.ts";
export declare const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;
export interface HandoffIndex {
    active: {
        id: string;
        summary: string;
        expires: string;
        fromTool?: Tool;
    }[];
    count: number;
}
export interface ListHandoffsFilter {
    status?: HandoffStatus;
    toTool?: Tool;
}
export interface WriteHandoffOptions {
    rootDir: string;
    slug: string;
    body: string;
    summary: string;
    fromTool?: Tool;
    toTool?: Tool;
    gitRef?: string;
    now?: Date;
}
export interface PruneResult {
    archivedExpired: string[];
    deleted: string[];
}
export declare function writeHandoff(opts: WriteHandoffOptions): Promise<{
    id: string;
    path: string;
}>;
export declare function readHandoff(rootDir: string, id: string): Promise<Handoff | null>;
export declare function listHandoffs(rootDir: string, filter?: ListHandoffsFilter): Promise<Handoff[]>;
export declare function buildHandoffIndex(rootDir: string, opts?: {
    now?: Date;
}): Promise<HandoffIndex>;
export declare function archiveHandoff(rootDir: string, id: string): Promise<void>;
export declare function pruneHandoffs(rootDir: string, opts?: {
    now?: Date;
    retentionDays?: number;
}): Promise<PruneResult>;
