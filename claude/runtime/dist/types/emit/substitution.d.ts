import { type MaturityTier } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";
export declare const DETECTION_UNKNOWN = "unknown";
export declare const LINTER_TOKEN = "${STAMITY:LINTER}";
export declare const TEST_FRAMEWORK_TOKEN = "${STAMITY:TEST_FRAMEWORK}";
export declare const CI_PROVIDER_TOKEN = "${STAMITY:CI_PROVIDER}";
export declare const MATURITY_TIER_TOKEN = "${STAMITY:MATURITY_TIER}";
export declare const VERIFY_GATE_TEST_TOKEN = "${STAMITY:VERIFY_GATE_TEST}";
export declare const VERIFY_GATE_LINT_TOKEN = "${STAMITY:VERIFY_GATE_LINT}";
export declare const VERIFY_GATE_TYPECHECK_TOKEN = "${STAMITY:VERIFY_GATE_TYPECHECK}";
export declare const VERIFY_GATE_ALL_TOKEN = "${STAMITY:VERIFY_GATE_ALL}";
export declare const INVARIANTS_VERSION_TOKEN = "${STAMITY:INVARIANTS_VERSION}";
export declare const REPO_SUBSTITUTION_TOKENS: readonly string[];
export interface DetectedRepoContext {
    linters: string[];
    testFrameworks: string[];
    ciProviders: string[];
    maturityTier?: MaturityTier;
}
export interface CharterInvariants {
    version: string;
    ratified: string;
    amended: string;
}
export interface VerificationGateSet {
    test: string;
    lint: string;
    typecheck: string;
    all: string;
}
export declare function renderDetectionList(values: readonly string[] | undefined): string;
export declare function detectionContextFromManifest(manifest: SetupManifest): DetectedRepoContext;
export declare function substituteRepoTokens(content: string, ctx: DetectedRepoContext): string;
export declare function substituteVerificationGateTokens(content: string, gates: VerificationGateSet): string;
export declare function renderInvariantsVersion(invariants: CharterInvariants): string;
export declare function substituteCharterTokens(content: string, invariants: CharterInvariants): string;
