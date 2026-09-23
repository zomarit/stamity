import { type ResolvedLearningsCaps } from "./validation.ts";
export declare const DEFAULT_MAX_TOTAL_LEARNINGS_BYTES = 65536;
export interface PersistLearningOptions {
    rootDir: string;
    fileName: string;
    content: string;
    caps?: ResolvedLearningsCaps;
    now?: Date;
}
export interface LearningPersistResult {
    written: boolean;
    path?: string;
    errors: string[];
    sanitized: boolean;
}
export declare function persistLearning(opts: PersistLearningOptions): Promise<LearningPersistResult>;
export interface LoadedLearning {
    fileName: string;
    frontmatter: Record<string, unknown>;
    body: string;
    integrityOk: true;
}
export type LoaderSkipReason = "invalid-frontmatter" | "integrity-mismatch" | "injection-detected" | "over-size" | "expired-review";
export interface LoaderSkip {
    fileName: string;
    reason: LoaderSkipReason;
    detail: string;
}
export interface LoaderResult {
    learnings: LoadedLearning[];
    skips: LoaderSkip[];
    totalBytes: number;
}
export interface LoadValidatedLearningsOptions {
    rootDir: string;
    maxTotalBytes?: number;
    now?: Date;
}
export declare function loadValidatedLearnings(opts: LoadValidatedLearningsOptions): Promise<LoaderResult>;
export declare function formatLearningsIndex(result: LoaderResult): string;
