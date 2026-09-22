import type { PackContentClass, PackSourceKind } from "./manifest.ts";
import type { TrustTier } from "./trust.ts";
export declare const RECEIPT_FILE = "receipt.json";
export declare function packDirRelPath(packId: string): string;
export declare function receiptRelPath(packId: string): string;
export interface PackReceiptFile {
    path: string;
    class: PackContentClass;
    sha256: string;
    bytes: number;
    tokens: number;
}
export interface PackReceipt {
    packId: string;
    version: string;
    source: {
        kind: PackSourceKind;
        spec: string;
    };
    trustTier: TrustTier;
    tierBasis: string;
    checks: Record<string, "pass" | "n/a">;
    policy: {
        decision: "allow" | "deny";
        matchedRule?: string;
    };
    permissions?: {
        toolFootprint: string[];
    };
    files: PackReceiptFile[];
    contextCost: {
        totalTokens: number;
    };
    engineVersion: string;
    installedAt: string;
}
interface PackReceiptInput {
    manifest: {
        name: string;
        version: string;
        permissions?: {
            toolFootprint?: readonly string[];
        };
    };
    source: {
        kind: PackSourceKind;
    };
    spec: string;
    writeSet: readonly {
        targetPath: string;
        contentClass: PackContentClass;
        contentHash: string;
        sizeBytes: number;
    }[];
    checks: Record<string, "pass" | "n/a">;
    trustTier: TrustTier;
    tierBasis: string;
    policy: {
        decision: "allow" | "deny";
        matchedRule?: string;
    };
    tokensByPath: Record<string, number>;
    totalTokens: number;
}
export declare function buildReceipt(plan: PackReceiptInput, clockNow: Date, engineVersion: string): PackReceipt;
export declare function serializeReceipt(receipt: PackReceipt): string;
export {};
