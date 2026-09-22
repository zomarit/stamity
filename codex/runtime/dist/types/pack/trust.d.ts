import { type PackManifest, type PackSigning } from "./manifest.ts";
export declare const TRUST_TIERS: readonly ["pinned-unsigned", "scanned", "publisher-signed", "curator-verified"];
export type TrustTier = (typeof TRUST_TIERS)[number];
export declare function trustTierRank(tier: TrustTier): number;
export declare const SIGNING_METHODS: readonly string[];
export interface TrustSigning extends PackSigning {
    bundlePath?: string;
}
export interface CatalogPin {
    sha256: string;
    tier: TrustTier;
}
export interface ResolvedTrust {
    tier: TrustTier;
    basis: string;
}
export interface SigstoreVerdict {
    verified: boolean;
    reason: string;
    unarmed?: boolean;
}
export interface SigstoreVerifier {
    verify(bundleBytes: Uint8Array, aggregateSha: string, signer?: string): Promise<SigstoreVerdict>;
}
export declare const notYetArmedSigstoreVerifier: SigstoreVerifier;
export declare const armedSigstoreVerifier: SigstoreVerifier;
export declare function computeAggregateContentSha(integrity: Record<string, string>): string;
export declare function sigstoreSignedPayload(aggregateSha: string): Buffer;
export declare function settleSignatureClause(basis: string, verifiedBasis: string): string;
export declare function resolveTrustTier(manifest: PackManifest, pin?: CatalogPin): ResolvedTrust;
export declare const MAX_SIGSTORE_BUNDLE_BYTES: number;
export declare function readSigstoreBundle(packRoot: string, bundlePath: string): Promise<Buffer>;
export interface PublisherSignedOutcome {
    outcome: "pass" | "n/a";
    verifiedBasis?: string;
}
export declare function verifyPublisherSignedClaim(manifest: PackManifest, packRoot: string, verifier: SigstoreVerifier, opts?: {
    catalogPinTier?: TrustTier;
}): Promise<PublisherSignedOutcome>;
