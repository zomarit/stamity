import type { CommandModule } from "../kit/program.ts";
export declare function handoffSlug(title: string): string;
export declare function currentGitRef(cwd: string): string | null;
export declare function recordedBranch(ref: string): string | null;
export declare function resumeDryRunAdvanceLine(id: string, status: string): string;
export declare const handoffCommand: CommandModule;
