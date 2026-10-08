import type { CliContext, CommandResult } from "../../kit/program.ts";
export declare function runPolicy(ctx: CliContext, rootDir: string, action: string | undefined, pattern: string | undefined, force: boolean): Promise<CommandResult>;
