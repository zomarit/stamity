export declare const DEFAULT_MAX_ATTEMPTS = 3;
export declare const DEFAULT_INITIAL_DELAY_MS = 200;
export declare const DEFAULT_MAX_DELAY_MS = 5000;
export declare const DEFAULT_BACKOFF_FACTOR = 2;
export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    jitter?: boolean;
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
}
export declare function defaultShouldRetry(err: unknown, _attempt: number): boolean;
export declare function computeBackoffDelay(attempt: number, opts?: RetryOptions): number;
export declare function applyJitter(delayMs: number, random?: () => number): number;
export declare function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, opts?: RetryOptions): Promise<T>;
