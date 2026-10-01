import { Command } from "commander";
import type { App, Clock, EngineRegistry } from "../../index.ts";
import { type Palette, type Spinner, type TerminalFacts } from "./terminal.ts";
import { type PromptIo } from "./prompts.ts";
export interface CommandIo {
    out(text: string): void;
    err(text: string): void;
}
export interface CliContext {
    readonly app: App;
    readonly engine: EngineRegistry;
    readonly io: CommandIo;
    readonly promptIo: PromptIo;
    readonly terminal: TerminalFacts;
    readonly palette: Palette;
    readonly colorEnabled: boolean;
    readonly spinner: Spinner;
    readonly json: boolean;
    readonly yes: boolean;
    readonly dryRun: boolean;
}
export interface CommandResult {
    exitCode: 0 | 1;
    json?: Record<string, unknown>;
}
export interface CommandModule {
    readonly name: string;
    readonly summary: string;
    readonly hidden?: boolean;
    readonly mutating: boolean;
    readonly args?: readonly {
        name: string;
        description: string;
        required: boolean;
    }[];
    configure?(cmd: Command): void;
    run(ctx: CliContext, opts: Record<string, unknown>, args: readonly string[]): Promise<CommandResult>;
}
export interface RunCliOptions {
    cwd?: string;
    env?: Readonly<Record<string, string | undefined>>;
    io?: CommandIo;
    promptIo?: PromptIo;
    terminal?: TerminalFacts;
    clock?: Clock;
}
export declare function runCli(argv: readonly string[], commands: readonly CommandModule[], opts?: RunCliOptions): Promise<number>;
