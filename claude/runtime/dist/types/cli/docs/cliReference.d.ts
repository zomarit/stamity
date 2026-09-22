import type { CommandModule } from "../kit/program.ts";
export declare const CLI_REFERENCE_DOC_PATH = "docs/cli-reference.md";
export interface GlobalFlag {
    readonly flags: string;
    readonly scope: "program" | "every command" | "mutating commands";
    readonly description: string;
}
export declare const GLOBAL_FLAGS: readonly GlobalFlag[];
export interface ExitStatus {
    readonly status: number;
    readonly meaning: string;
}
export declare const EXIT_STATUSES: readonly ExitStatus[];
interface ArgFacts {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
    readonly choices: readonly string[];
}
interface FlagFacts {
    readonly flags: string;
    readonly description: string;
    readonly defaultValue: unknown;
    readonly required: boolean;
    readonly choices: readonly string[];
}
export interface CommandFacts {
    readonly name: string;
    readonly summary: string;
    readonly hidden: boolean;
    readonly mutating: boolean;
    readonly args: readonly ArgFacts[];
    readonly flags: readonly FlagFacts[];
}
export declare function introspectCommand(module: CommandModule): CommandFacts;
export declare function renderCliReferenceFrom(commands: readonly CommandModule[]): string;
export declare function renderCliReference(): string;
export {};
