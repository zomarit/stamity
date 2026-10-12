import type { Bundle, VerifyOptions } from "sigstore";
import type { SigstoreVerdict } from "./trust.ts";
export interface SigstoreCertificateIdentity {
    subjectAlternativeName?: string | undefined;
    extensions?: {
        issuer?: string | undefined;
    } | undefined;
}
export interface SigstoreSigner {
    identity?: SigstoreCertificateIdentity | undefined;
}
export type SigstoreVerifyFn = (bundle: Bundle, payload: Buffer, options: VerifyOptions) => Promise<SigstoreSigner>;
export declare function sigstoreCachePath(env?: Readonly<Record<string, string | undefined>>, platform?: NodeJS.Platform, home?: string): string;
export interface VerifySigstoreBundleOptions {
    signer?: string;
    verifyFn?: SigstoreVerifyFn;
    verifyOptions?: VerifyOptions;
}
export declare function verifySigstoreBundle(bundleBytes: Uint8Array, payload: Buffer, opts?: VerifySigstoreBundleOptions): Promise<SigstoreVerdict>;
