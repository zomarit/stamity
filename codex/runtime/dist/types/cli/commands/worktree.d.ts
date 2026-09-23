import type { CommandModule } from "../kit/program.ts";
import { type WorktreeCleanupResult } from "../../worktree/cleanup.ts";
export interface PartialCleanupErrorDocument {
    readonly message: string;
    readonly next: string;
}
export declare function partialCleanupErrorDocument(result: WorktreeCleanupResult, rerun: string): PartialCleanupErrorDocument;
export declare const worktreeCommand: CommandModule;
