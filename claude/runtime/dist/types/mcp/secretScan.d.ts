export interface SecretPattern {
    id: string;
    description: string;
    pattern: RegExp;
}
export interface SecretFinding {
    patternId: string;
    varName?: string;
    maskedValue: string;
}
export interface SecretDetectionResult {
    findings: SecretFinding[];
    clean: boolean;
}
export declare const SECRET_PATTERNS: readonly SecretPattern[];
export declare function maskValue(value: string): string;
export declare function scanValueForSecrets(name: string, value: string): SecretFinding[];
export declare function detectSecrets(vars: Record<string, string>): SecretDetectionResult;
export declare function formatSecretFindings(result: SecretDetectionResult): string;
