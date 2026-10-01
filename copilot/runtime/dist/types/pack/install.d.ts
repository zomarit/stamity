import type { ReclaimCandidate } from "../manifest/ledger.ts";
import type { GrantableToolCategory } from "../roster/agentPolicies.ts";
import { type LedgerEntry, type SetupManifest } from "../types/manifest.ts";
import { type PackContentClass, type PackManifest, type ResolvedPackSource } from "./manifest.ts";
import { type OrgPolicyDecision } from "./orgPolicy.ts";
import { type CatalogPin, type SigstoreVerifier, type TrustTier } from "./trust.ts";
export interface PackWriteSetEntry {
    relPath: string;
    targetPath: string;
    contentClass: PackContentClass;
    contentHash: string;
    sizeBytes: number;
}
export interface PackAgentGrant {
    relPath: string;
    runtimeId: string;
    allow: readonly GrantableToolCategory[];
    rationale: string;
}
export interface PackInstallPlan {
    manifest: PackManifest;
    source: ResolvedPackSource;
    spec: string;
    writeSet: PackWriteSetEntry[];
    agentGrants?: PackAgentGrant[];
    collisions: string[];
    checks: Record<string, "pass" | "n/a">;
    trustTier: TrustTier;
    tierBasis: string;
    policy: OrgPolicyDecision;
    tokensByPath: Record<string, number>;
    totalTokens: number;
}
export interface PackApplyResult {
    installed: boolean;
    written: string[];
    ledgerEntries: LedgerEntry[];
    errors: string[];
    receiptPath: string | null;
}
export interface PlanPackInstallOptions {
    allowUntrusted?: boolean;
    catalogPin?: CatalogPin;
    sigstoreVerifier?: SigstoreVerifier;
}
export declare function packLedgerRelPath(packId: string): string;
export declare function planPackInstall(projectRoot: string, spec: string, opts?: PlanPackInstallOptions): Promise<PackInstallPlan>;
export declare function applyPackInstall(projectRoot: string, plan: PackInstallPlan, manifest: SetupManifest, opts?: {
    engineVersion?: string;
    now?: Date;
}): Promise<{
    result: PackApplyResult;
    manifest: SetupManifest;
}>;
export declare function planPackRemoval(manifest: SetupManifest, packId: string): ReclaimCandidate[];
