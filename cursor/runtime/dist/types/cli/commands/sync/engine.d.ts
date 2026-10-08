import { type ReclaimCandidate } from "../../../manifest/ledger.ts";
import type { PackSuppliedServer } from "../../../mcp/catalog.ts";
import { type ReclaimReport } from "../../../merge/reclaim.ts";
import { type AdapterOutput, type MergeResult } from "../../../types/content.ts";
import { type ImportDecision, type LedgerEntry, type SetupManifest } from "../../../types/manifest.ts";
import { type CoOwnedDocumentLane } from "../../engine/emissionWrite.ts";
import { type WorkingTreeStatus } from "../../engine/gitStatus.ts";
import type { GitRunner } from "../../../workspace/git.ts";
type CollisionKind = "unmanaged-name" | "deny-scan" | "shared-name" | "linked-source" | "import-decision" | "co-owned-shape";
export interface SyncPlanEntry {
    path: string;
    action: "create" | "update" | "unchanged" | "collision";
    adapter: string;
    artifactId: string;
    collisionKind?: CollisionKind;
    refusedAtSource?: true;
    rejected?: string;
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
export declare function planOutputEntries(rootDir: string, outputs: readonly AdapterOutput[], engineVersion: string, ledgerPaths?: ReadonlySet<string>, mcpServers?: readonly string[], packServers?: readonly PackSuppliedServer[], coOwned?: {
    lanes: ReadonlyMap<string, CoOwnedDocumentLane>;
    ledger: readonly LedgerEntry[];
}, importDecisions?: readonly ImportDecision[]): Promise<SyncPlanEntry[]>;
export declare function planSync(rootDir: string, engineVersion: string, opts?: {
    runner?: GitRunner;
    packageName?: string;
    npmChannel?: boolean;
    npmRegistry?: string;
}): Promise<SyncPlan>;
export interface SyncApplyReport {
    wrote: MergeResult[];
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    refused: string[];
    gitignoreAdded?: string[];
    reclaimed: ReclaimReport | null;
    manifestPath: string;
    dryRun: boolean;
    manifest: SetupManifest | null;
}
export declare function previewReclaim(rootDir: string, plan: SyncPlan, now?: Date): Promise<ReclaimReport | null>;
export declare function refusalRemedyLines(plan: SyncPlan, refused: readonly string[]): string[];
export declare function applySync(rootDir: string, plan: SyncPlan, opts: {
    engineVersion: string;
    force: boolean;
    dryRun: boolean;
    now?: Date;
}): Promise<SyncApplyReport>;
export {};
