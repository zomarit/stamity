import type { Tool } from "../types/core.ts";
export type HandoffStatus = "active" | "in-progress" | "completed" | "archived" | "expired";
export declare const HANDOFF_STATUSES: readonly HandoffStatus[];
export declare const VALID_STATUS_TRANSITIONS: Record<HandoffStatus, readonly HandoffStatus[]>;
export declare function isValidStatusTransition(from: HandoffStatus, to: HandoffStatus): boolean;
export declare function isHandoffStatus(value: unknown): value is HandoffStatus;
export interface HandoffFrontmatter {
    id: string;
    status: HandoffStatus;
    created: string;
    expires: string;
    summary: string;
    fromTool?: Tool;
    toTool?: Tool;
    gitRef?: string;
    integrity: string;
}
export interface Handoff {
    frontmatter: HandoffFrontmatter;
    body: string;
    filePath: string;
}
