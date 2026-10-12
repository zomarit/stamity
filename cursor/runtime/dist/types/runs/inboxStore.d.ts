export declare const INBOX_PATH = ".stamity/inbox.md";
export declare const INBOX_SEVERITIES: readonly ["Critical", "Warning", "Minor", "Info"];
export declare const ALWAYS_SHOW_TAGS: readonly ["critical-deferred", "decision-waiting"];
export declare const SCHEDULE_RULE_HEADING = "## Rows under the schedule rule";
export interface InboxRow {
    readonly line: number;
    readonly severity: string;
    readonly location: string;
    readonly description: string;
    readonly source: string;
    readonly ref: string | null;
    readonly tag: string | null;
    readonly by: string | null;
    readonly when: string | null;
    readonly files: readonly string[];
    readonly deferredOn: string | null;
    readonly rationale: string | null;
    readonly belowRule: boolean;
}
export interface InboxProblem {
    readonly line: number;
    readonly message: string;
}
export type MatchedBy = "path" | "ref" | "plan" | "area" | "due" | "always" | "all";
export interface InboxQuery {
    readonly paths: readonly string[];
    readonly plan?: string;
    readonly area?: readonly string[];
    readonly due?: string;
}
export interface InboxMatch {
    readonly row: InboxRow;
    readonly matchedBy: MatchedBy;
}
export declare function parseInbox(text: string): {
    rows: InboxRow[];
    problems: InboxProblem[];
};
export declare function locationPaths(location: string): string[];
export declare function matchInbox(rows: readonly InboxRow[], query: InboxQuery): {
    matched: InboxMatch[];
    unmatched: number;
    triggers: number;
};
