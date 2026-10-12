import { type Handoff } from "./schema.ts";
export declare const MAX_HANDOFF_BODY_BYTES = 51200;
export declare const MAX_HANDOFF_FILE_BYTES = 61440;
export declare const MAX_ACTIVE_HANDOFFS_PER_REPO = 25;
export declare const HANDOFF_DEFAULT_EXPIRY_DAYS = 30;
export declare const MAX_SUMMARY_LENGTH = 200;
export declare const REQUIRED_BODY_SECTIONS: readonly string[];
export declare const HANDOFF_ID_PATTERN: RegExp;
export interface HandoffValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface HandoffsDirectoryResult {
    valid: Handoff[];
    invalid: {
        file: string;
        errors: string[];
    }[];
    activeCount: number;
    overActiveCap: boolean;
}
export declare function computeHandoffIntegrity(summary: string, body: string): string;
export declare function verifyHandoffIntegrity(handoff: Handoff): boolean;
export declare function generateHandoffId(slug: string, now?: Date): string;
export declare function isHandoffExpired(handoff: Handoff, now?: Date): boolean;
export declare function detectGitRefDrift(handoff: Handoff, currentRef: string | null): string | null;
export declare function validateHandoffContent(raw: string, filePath: string): HandoffValidationResult;
export declare function validateHandoffsDirectory(dir: string): Promise<HandoffsDirectoryResult>;
