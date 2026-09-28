import type { CliContext, CommandResult } from "../../kit/program.ts";
import type { SetupManifest } from "../../../types/manifest.ts";
export declare const NEXT_SYNC_LINE = "next: run stamity sync to apply";
export declare const NEXT_DRY_RUN_LINE = "next: re-run without --dry-run to apply, then run stamity sync";
export declare function requireSetupManifest(ctx: CliContext, rootDir: string): Promise<SetupManifest>;
export declare function runMcpList(ctx: CliContext, rootDir: string): Promise<CommandResult>;
export declare function runMcpAdd(ctx: CliContext, rootDir: string, id: string): Promise<CommandResult>;
export declare function runMcpRemove(ctx: CliContext, rootDir: string, id: string): Promise<CommandResult>;
