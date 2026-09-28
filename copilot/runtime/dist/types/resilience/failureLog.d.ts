export interface FailureLogEntry {
    timestamp: string;
    phase: string;
    agentId?: string;
    errorType: string;
    message: string;
    context?: Record<string, unknown>;
}
export interface FailureLogParse {
    entries: FailureLogEntry[];
    skipped: number;
}
export interface WriteFailureLogResult {
    path: string;
    rotated: boolean;
}
export declare const FAILURE_LOG_FILE = "failure-log.jsonl";
export declare const DEFAULT_MAX_LOG_SIZE = 524288;
export declare const MIN_RETAINED_ENTRIES = 10;
export declare const FAILURE_LOG_MAX_BYTES_ENV = "STAMITY_FAILURE_LOG_MAX_BYTES";
export declare function getMaxLogSize(): number;
export declare function createFailureLogEntry(phase: string, error: unknown, extra?: Partial<FailureLogEntry>): FailureLogEntry;
export declare function formatLogEntry(entry: FailureLogEntry): string;
export declare function parseFailureLog(content: string): FailureLogEntry[];
export declare function parseFailureLogDetailed(content: string): FailureLogParse;
export declare function shouldRotateLog(content: string): boolean;
export declare function rotateLog(content: string): string;
export declare function appendAuditLine(path: string, text: string, opts?: {
    boundaryDir?: string;
}): Promise<void>;
export declare function writeFailureLog(stateDir: string, entry: FailureLogEntry): Promise<WriteFailureLogResult>;
