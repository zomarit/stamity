import type { PredecessorDefaults } from "../../../migration/carry.ts";
import type { MergeResult } from "../../../types/content.ts";
import { type ImportDecision, type PluginConfig } from "../../../types/manifest.ts";
import { type InitDecisions } from "./plan.ts";
export interface InitApplyOptions {
    rootDir: string;
    decisions: InitDecisions;
    defaults?: PredecessorDefaults;
    importChoice?: readonly ImportDecision[];
    plugin?: PluginConfig;
    engineVersion: string;
    dryRun: boolean;
    force: boolean;
    now?: Date;
}
export interface InitApplyReport {
    manifestPath: string;
    createdDirs: string[];
    wrote: MergeResult[];
    warnings: string[];
    ledgerCount: number;
    gitignoreEnsured: boolean;
    dryRun: boolean;
}
export declare function applyInit(opts: InitApplyOptions): Promise<InitApplyReport>;
