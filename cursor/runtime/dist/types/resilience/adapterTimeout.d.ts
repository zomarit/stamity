export declare const DEFAULT_ADAPTER_TIMEOUT_MS = 180000;
export declare const MIN_ADAPTER_TIMEOUT_MS = 5000;
export declare const MAX_ADAPTER_TIMEOUT_MS = 900000;
export interface AdapterTimeoutConfig {
    timeoutMs?: number;
    retryAttempts?: number;
}
export interface TimedGenerationResult<T> {
    result: T;
    elapsedMs: number;
}
export declare class AdapterTimeoutError extends Error {
    readonly adapter: string;
    readonly timeoutMs: number;
    constructor(adapter: string, timeoutMs: number);
}
export declare function clampAdapterTimeout(timeoutMs: number): number;
export declare function generateWithTimeout<T>(adapter: string, fn: (signal: AbortSignal) => Promise<T>, config?: AdapterTimeoutConfig): Promise<TimedGenerationResult<T>>;
export declare function throwIfSignalAborted(signal: AbortSignal | undefined): void;
