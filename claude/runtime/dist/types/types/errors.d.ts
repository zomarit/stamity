export type ErrorCode = "VALIDATION_ERROR" | "CONFIG_ERROR" | "ADAPTER_ERROR" | "UNKNOWN_ERROR" | "INTEGRITY_ERROR" | "FS_ERROR" | "CLEAN_ERROR" | "NETWORK_ERROR" | "LOCK_TIMEOUT";
export declare class EngineError extends Error {
    readonly code: ErrorCode;
    readonly exitCode: number;
    readonly why?: string;
    readonly next?: string;
    constructor(message: string, opts: {
        code: ErrorCode;
        exitCode?: number;
        cause?: unknown;
        why?: string | undefined;
        next?: string | undefined;
    });
}
