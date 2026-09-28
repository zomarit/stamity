export interface RecordHead {
    readonly status: string | null;
    readonly inProgress: boolean;
    readonly plan: string | null;
    readonly invocation: string | null;
}
export interface ResumeCard {
    readonly runId: string;
    readonly inProgress: boolean;
    readonly lines: readonly string[];
    readonly openRowIds: readonly string[];
    readonly unledgeredReports: readonly string[];
    readonly lanes: readonly string[];
    readonly withheld: string | null;
    readonly listsWithheld: string | null;
    readonly unreadableLedgerLines: number;
    readonly ledgerUnreadable: boolean;
    readonly ledgerTooLarge: boolean;
    readonly notReportNamed: number;
    readonly reportsNotChecked: number;
}
export declare function readRecordHead(text: string): RecordHead;
export declare function findInProgressRun(rootDir: string): string | null;
export declare function renderResumeCard(parts: {
    readonly runId: string;
    readonly plan: string | null;
    readonly invocation: string | null;
    readonly openRowIds: readonly string[];
    readonly unledgeredReports: readonly string[];
    readonly lanes: readonly string[];
    readonly ledgerUnreadable?: boolean;
    readonly notReportNamed?: number;
    readonly ledgerTooLarge?: boolean;
    readonly reportsNotChecked?: number;
}, now: Date): string[];
export declare function screenCard(text: string): string;
export declare function collectResumeCard(opts: {
    readonly rootDir: string;
    readonly runId?: string;
    readonly now: Date;
}): ResumeCard | null;
