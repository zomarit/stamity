import { type AccentDepth } from "./terminal.ts";
export type BannerAccent = AccentDepth;
export { resolveAccentDepth as resolveBannerAccent } from "./terminal.ts";
export declare const ACCENT = "+";
export declare const WORDMARK: readonly string[];
export declare const BANNER_ROWS: number;
export declare const BANNER_COLUMNS: number;
export declare function renderWordmark(opts?: {
    accent?: BannerAccent;
    indent?: string;
}): string;
export declare function bannerBlock(opts: {
    stdoutIsTTY: boolean;
    machineReadable: boolean;
    env: Readonly<Record<string, string | undefined>>;
    noColorFlag?: boolean;
    indent?: string;
    columns?: number;
}): string;
