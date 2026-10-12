import type { CommandModule } from "../kit/program.ts";
import type { WorkingTreeStatus } from "../engine/gitStatus.ts";
import { type SyncApplyReport, type SyncPlan } from "./sync/engine.ts";
export declare const NEXT_AFTER_WRITE_LINE = "next: git diff to review, stamity check to verify";
export declare const NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE: string;
export declare const NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE: string;
export declare function dirtyTreeWarning(dirty: WorkingTreeStatus): string | null;
export declare function syncClosingLines(plan: SyncPlan, report: SyncApplyReport): string[];
export declare const syncCommand: CommandModule;
