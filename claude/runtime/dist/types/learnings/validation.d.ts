import { type DenyPattern } from "../denyscan/denyScan.ts";
export declare const MAX_LEARNING_FILE_BYTES = 65536;
export declare const DEFAULT_LEARNING_FILE_COUNT = 150;
export declare const MIN_LEARNING_FILE_COUNT = 50;
export declare const MAX_LEARNING_FILE_COUNT: number;
export declare const MAX_LEARNING_SUMMARY_LENGTH = 200;
export declare const LEARNING_CONFIDENCE_LEVELS: readonly ["low", "medium", "high"];
export type LearningConfidence = (typeof LEARNING_CONFIDENCE_LEVELS)[number];
export declare const REQUIRED_LEARNING_SECTIONS: readonly ["Why", "How to apply"];
export interface ResolvedLearningsCaps {
    maxCount: number;
    maxFileBytes: number;
}
export declare function resolveLearningsCaps(configuredMaxCount?: number): ResolvedLearningsCaps;
export declare const LEARNINGS_SCREEN_PATTERNS: readonly DenyPattern[];
export interface LearningValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface LearningContentOptions {
    maxFileBytes?: number;
    now?: Date;
}
export declare function validateLearningContent(fileName: string, raw: string, options?: LearningContentOptions): LearningValidationResult;
export declare function validateLearningFileName(fileName: string): string[];
export interface LearningsSanitizationResult {
    content: string;
    modified: boolean;
    strippedPatternIds: string[];
}
export declare function sanitizeLearningsContent(raw: string): LearningsSanitizationResult;
export declare function computeLearningIntegrity(body: string): string;
export declare function verifyLearningIntegrity(frontmatterHash: unknown, body: string): boolean;
export interface LearningsDirectoryResult {
    valid: string[];
    invalid: {
        file: string;
        errors: string[];
    }[];
    overCap: string[];
}
export declare function validateLearningsDirectory(dir: string, caps: ResolvedLearningsCaps): Promise<LearningsDirectoryResult>;
