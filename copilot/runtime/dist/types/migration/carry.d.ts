import { type CommunicationStyle, type MaturityTier, type Tool } from "../types/core.ts";
import { type PredecessorState } from "./detect.ts";
export interface PredecessorDefaults {
    tools?: Tool[];
    maturityTier?: MaturityTier;
    communicationStyle?: CommunicationStyle;
    mcpServers?: string[];
}
export declare function mapPredecessorDefaults(manifestRaw: Record<string, unknown> | null): PredecessorDefaults;
export interface BlockStripResult {
    path: string;
    action: "stripped" | "deleted" | "unchanged";
}
export declare function stripPredecessorBlocks(rootDir: string, markedFiles: readonly string[], opts?: {
    dryRun?: boolean;
}): Promise<BlockStripResult[]>;
export interface CarryReport {
    learningsCarried: number;
    learningsSkipped: number;
    envMcpCarried: boolean;
    overridesPresent: boolean;
    strips: BlockStripResult[];
    dryRun: boolean;
}
export declare function carryPredecessorAssets(rootDir: string, state: PredecessorState, opts: {
    dryRun: boolean;
    now?: Date;
}): Promise<CarryReport>;
