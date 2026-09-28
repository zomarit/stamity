import { type ReclaimCandidate } from "../../../manifest/ledger.ts";
import type { PackSuppliedServer } from "../../../mcp/catalog.ts";
import { type ReclaimReport } from "../../../merge/reclaim.ts";
import { type AdapterOutput, type MergeResult } from "../../../types/content.ts";
import type { SetupManifest } from "../../../types/manifest.ts";
import { type WorkingTreeStatus } from "../../engine/gitStatus.ts";
import type { GitRunner } from "../../../workspace/git.ts";
type CollisionKind = "unmanaged-name" | "deny-scan" | "shared-name";
export interface SyncPlanEntry {
    path: string;
    action: "create" | "update" | "unchanged" | "collision";
    adapter: string;
    artifactId: string;
    collisionKind?: CollisionKind;
    detail?: string;
}
export interface SyncPlan {
    manifest: SetupManifest;
    entries: SyncPlanEntry[];
    collisions: string[];
    reclaim: ReclaimCandidate[];
    dirty: WorkingTreeStatus;
    manifestMigrated: boolean;
    plannerId: string;
    outputs: AdapterOutput[];
    warnings?: readonly string[];
}
export declare function planOutputEntries(rootDir: string, outputs: readonly AdapterOutput[], engineVersion: string, ledgerPaths?: ReadonlySet<string>, mcpServers?: readonly string[], packServers?: readonly PackSuppliedServer[], settingsOwnedKeys?: readonly string[]): Promise<SyncPlanEntry[]>;
export declare function planSync(rootDir: string, engineVersion: string, opts?: {
    runner?: GitRunner;
}): Promise<SyncPlan>;
export interface SyncApplyReport {
    wrote: MergeResult[];
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    refused: string[];
    reclaimed: ReclaimReport | null;
    manifestPath: string;
    dryRun: boolean;
    manifest: SetupManifest | null;
}
export declare function applySync(rootDir: string, plan: SyncPlan, opts: {
    engineVersion: string;
    force: boolean;
    dryRun: boolean;
    now?: Date;
}): Promise<SyncApplyReport>;
export {};
