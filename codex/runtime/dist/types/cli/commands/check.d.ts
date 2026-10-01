import type { App, EngineRegistry } from "../../index.ts";
import { type SetupManifest } from "../../types/manifest.ts";
import type { CommandModule } from "../kit/program.ts";
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
}
export declare function checkNodeVersion(nodeVersion: string, range: string | null): DoctorCheck;
export declare function checkClaudeHookShell(manifest: SetupManifest | null, host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
}): DoctorCheck;
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
export declare const checkCommand: CommandModule;
export {};
