import { type DenyHit } from "../denyscan/denyScan.ts";
export declare const MAX_PHASE_INPUT_LENGTH = 500000;
export declare const MAX_AGENT_OUTPUT_LENGTH = 1000000;
export declare const MAX_USER_CONTENT_LENGTH = 250000;
export interface BoundaryMarkers {
    readonly open: string;
    readonly close: string;
}
export declare function generateBoundaryMarkers(label: string): BoundaryMarkers;
export declare function wrapWithBoundary(content: string, label: string): {
    wrapped: string;
    markers: BoundaryMarkers;
};
export declare function extractBoundedContent(wrapped: string, markers: BoundaryMarkers): string | null;
export interface GuardResult {
    ok: boolean;
    content: string;
    violations: DenyHit[];
}
export declare function guardInput(content: string, opts?: {
    maxLength?: number;
}): GuardResult;
export interface OutputValidationResult {
    ok: boolean;
    errors: string[];
}
export declare function validateAgentOutput(output: string, opts?: {
    maxLength?: number;
    requiredMarkers?: string[];
}): OutputValidationResult;
