export type FailureType = "transient" | "substantive" | "unknown";
export declare function classifyFailure(error: unknown): FailureType;
