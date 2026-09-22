export interface TerminalFacts {
    stdoutIsTTY: boolean;
    stderrIsTTY: boolean;
    stdinIsTTY: boolean;
    stdoutColumns?: number;
}
export declare function detectTerminalFacts(streams?: {
    stdout?: {
        isTTY?: boolean;
        columns?: number;
    };
    stderr?: {
        isTTY?: boolean;
    };
    stdin?: {
        isTTY?: boolean;
    };
}): TerminalFacts;
export declare const DUMB_TERM = "dumb";
export declare function resolveColorEnabled(opts: {
    noColorFlag: boolean;
    env: Readonly<Record<string, string | undefined>>;
    stdoutIsTTY: boolean;
}): boolean;
export type AccentDepth = "truecolor" | "ansi256" | "ansi16" | "none";
export declare const MARK_ACCENT_SGR: Readonly<Record<Exclude<AccentDepth, "none">, string>>;
export declare const ACCENT_RESET = "\u001B[39m";
export declare function resolveAccentDepth(opts: {
    colorEnabled: boolean;
    env: Readonly<Record<string, string | undefined>>;
}): AccentDepth;
export interface Palette {
    bold(s: string): string;
    dim(s: string): string;
    red(s: string): string;
    green(s: string): string;
    yellow(s: string): string;
    cyan(s: string): string;
    accent(s: string): string;
}
export declare function makePalette(enabled: boolean, accent?: AccentDepth): Palette;
export interface Spinner {
    start(text: string): void;
    update(text: string): void;
    stop(finalLine?: string): void;
}
export declare function makeSpinner(opts: {
    enabled: boolean;
    write: (s: string) => void;
}): Spinner;
