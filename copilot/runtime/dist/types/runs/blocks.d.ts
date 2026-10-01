export type FindingSeverity = "Critical" | "Warning" | "Minor";
export interface Finding {
    readonly id: string;
    readonly severity: FindingSeverity;
    readonly locator: string;
    readonly summary: string;
    readonly decisionNeeded: boolean;
    readonly security: boolean;
    readonly line: number;
}
export interface BlockProblem {
    readonly line: number;
    readonly message: string;
}
export type BlockParse<T> = {
    readonly ok: true;
    readonly items: readonly T[];
} | {
    readonly ok: false;
    readonly problems: readonly BlockProblem[];
};
export declare const FINDING_TEXT_MAX = 300;
export declare function cutReportText(text: string): string;
export declare function quoteReportText(value: unknown): string;
export declare function printableText(text: string): string;
export declare function parseFindingsBlock(text: string): BlockParse<Finding>;
export type ClosureStatus = "fixed" | "not-fixed" | "regressed" | "rejection-upheld" | "rejection-overturned";
export interface Closure {
    readonly ledgerId: string;
    readonly status: ClosureStatus;
    readonly rationale: string | null;
    readonly line: number;
}
export declare function parseClosuresBlock(text: string): BlockParse<Closure>;
