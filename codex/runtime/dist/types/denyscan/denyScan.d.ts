export interface DenyPattern {
    id: string;
    pattern: RegExp;
    severity: "block" | "warn";
    description: string;
}
export interface DenyHit {
    patternId: string;
    index: number;
    snippet: string;
    matchLength: number;
    severity: "block" | "warn";
}
export interface SanitizationResult {
    sanitized: string;
    removed: {
        patternId: string;
        count: number;
    }[];
    modified: boolean;
}
export declare const INVISIBLE_SMUGGLING_CHARS: RegExp;
export declare function foldConfusables(text: string): string;
export declare function joinMaskedWords(text: string): string;
export declare function normalizeForDenyScan(text: string): string;
export declare const CONTENT_DENY_PATTERNS: readonly DenyPattern[];
export declare const INJECTION_PATTERNS: readonly DenyPattern[];
export declare const NO_HONEST_SHAPE_INJECTION_ROWS: ReadonlySet<string>;
export declare const LEARNINGS_INJECTION_PATTERNS: readonly DenyPattern[];
export declare const MCP_POISONING_PATTERNS: readonly DenyPattern[];
export declare const ANTI_SLOP_WORDLIST: readonly string[];
export declare function byIndexThenId(a: DenyHit, b: DenyHit): number;
export declare function scanForDeniedPatterns(content: string, patterns?: readonly DenyPattern[]): DenyHit[];
export declare function scanNormalized(content: string, patterns?: readonly DenyPattern[]): DenyHit[];
export declare function sanitizeContent(content: string, patterns?: readonly DenyPattern[]): SanitizationResult;
export declare function scanAntiSlop(content: string): DenyHit[];
