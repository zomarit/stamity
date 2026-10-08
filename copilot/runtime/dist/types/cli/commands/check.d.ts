import type { App, EngineRegistry } from "../../index.ts";
import { type Tool } from "../../types/core.ts";
import { type InstallMode, type SetupManifest } from "../../types/manifest.ts";
import type { CommandModule } from "../kit/program.ts";
import type { ReclaimActionEntry, ReclaimProof } from "../../merge/reclaim.ts";
import { type SyncPlanEntry } from "./sync/engine.ts";
export interface DoctorCheck {
    id: string;
    status: "pass" | "warn" | "fail";
    detail: string;
}
export interface DriftReport {
    clean: boolean;
    changes: SyncPlanEntry[];
    missing: string[];
    reclaimPending: number;
    reclaim: ReclaimPreview[];
}
interface ReclaimPreview {
    path: string;
    reason: ReclaimActionEntry["candidateReason"];
    action: "delete" | "strip" | "reduce" | "keep" | "refuse" | "gone";
    proof?: ReclaimProof;
    why?: string;
}
export declare function checkNodeVersion(nodeVersion: string, range: string | null): DoctorCheck;
export declare function checkClaudeHookShell(manifest: SetupManifest | null, host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
}): DoctorCheck;
export declare function reAddArgsOf(packId: string, receipt: unknown): string | null;
export declare function runDoctor(rootDir: string, engine: EngineRegistry, app: App): Promise<DoctorCheck[]>;
export declare function runDriftGate(rootDir: string, engineVersion: string): Promise<DriftReport>;
interface UnresolvedGate {
    readonly kind: string;
    readonly value: string;
}
export interface CharterGateReport {
    readonly notRun: readonly string[];
    readonly unresolved: readonly UnresolvedGate[];
}
export declare function resolveCharterGates(rootDir: string, manifest: SetupManifest, gates: EngineRegistry["detect"]["verificationGates"], host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
}): CharterGateReport;
export interface Expectations {
    version?: string;
    tools?: readonly Tool[];
    mode?: InstallMode;
}
export interface ExpectationReport {
    ok: boolean;
    version?: {
        expected: string;
        running: string;
        generatedBy: string | null;
        ok: boolean;
    };
    tools?: {
        expected: Tool[];
        recorded: Tool[] | null;
        missing: Tool[];
        extra: Tool[];
        ok: boolean;
    };
    mode?: {
        expected: InstallMode;
        recorded: InstallMode | null;
        ok: boolean;
    };
}
export declare function evaluateExpectations(expected: Expectations, manifest: SetupManifest | null, runningVersion: string): ExpectationReport;
export declare const checkCommand: CommandModule;
export {};
