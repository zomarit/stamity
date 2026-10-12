export declare const SCHEDULE_RULE_FROM = "2026-10-10";
export declare const VAGUE_TRIGGERS: readonly ["later", "someday", "eventually", "tbd", "hygiene batch"];
export declare const FILLER_WORDS: readonly ["a", "an", "the", "on", "in", "at", "for", "to", "of", "or", "and", "maybe", "perhaps", "probably", "some", "point", "time", "day", "much", "bit", "not", "yet", "until", "till", "then", "now", "just"];
export type Due = {
    readonly by: string;
} | {
    readonly when: string;
};
export type Place = {
    kind: "plan";
    path: string;
    anchor: string;
} | {
    kind: "board";
    item: string;
} | {
    kind: "handoff";
    path: string;
};
export type Disposition = {
    kind: "fixed";
    ref: string;
} | {
    kind: "cut";
    reason: string;
} | {
    kind: "scheduled";
    place: Place;
    due: Due;
};
export declare function isIsoDate(text: string): boolean;
export declare function vagueTrigger(trigger: string): string | null;
export declare function dayTrigger(trigger: string): boolean;
export declare function parseDisposition(text: string): {
    ok: true;
    value: Disposition;
} | {
    ok: false;
    problem: string;
};
