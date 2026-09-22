import type { DetectedSummary } from "../types/detect.ts";
import type { GatesConfig } from "../types/manifest.ts";
export interface VerificationGateCommands {
    test: string;
    lint: string;
    typecheck: string;
    all: string;
}
export interface VerificationCommands {
    readonly test?: string;
    readonly lint?: string;
    readonly typecheck?: string;
    readonly all?: string;
}
export declare const DEFAULT_GATE_COMMANDS: VerificationGateCommands;
export type PersistedDetection = Partial<Pick<DetectedSummary, "languages" | "packageManager" | "packageScripts" | "testFrameworks" | "linters">>;
export declare function verificationCommandsFor(detected: PersistedDetection | undefined): VerificationCommands;
export declare function verificationGatesFor(detected: PersistedDetection | undefined, configured?: GatesConfig): VerificationGateCommands;
export declare function unresolvedGate(kind: string): string;
