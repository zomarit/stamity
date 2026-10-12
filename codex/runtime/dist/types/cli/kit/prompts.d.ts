import { type Palette } from "./terminal.ts";
export interface PromptIo {
    input: NodeJS.ReadableStream;
    output: NodeJS.WritableStream;
}
export interface PromptGate {
    interactive: boolean;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly palette?: Palette;
}
export declare function promptGate(opts: {
    stdinIsTTY: boolean;
    yes: boolean;
    json: boolean;
    env?: Readonly<Record<string, string | undefined>>;
    palette?: Palette;
}): PromptGate;
export declare function closePrompts(io: PromptIo): void;
export declare function confirm(gate: PromptGate, io: PromptIo, q: {
    question: string;
    defaultYes: boolean;
}): Promise<boolean>;
export declare function selectOne<T extends string>(gate: PromptGate, io: PromptIo, q: {
    question: string;
    choices: readonly {
        value: T;
        label: string;
    }[];
    defaultValue: T;
}): Promise<T>;
export declare function selectMany<T>(gate: PromptGate, io: PromptIo, q: {
    question: string;
    choices: readonly {
        value: T;
        label: string;
    }[];
    defaultValues: readonly T[];
}): Promise<T[]>;
export declare function textInput(gate: PromptGate, io: PromptIo, q: {
    question: string;
    defaultValue: string;
}): Promise<string>;
export declare function sanitizeLabel(label: string): string;
