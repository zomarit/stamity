import type { Bundle } from "sigstore";
import { type SigstoreVerifyFn } from "./sigstoreVerifier.ts";
export interface SignPackOptions {
    signFn?: (payload: Buffer) => Promise<Bundle>;
    verifyFn?: SigstoreVerifyFn;
}
export declare function signPack(packRoot: string, options?: SignPackOptions): Promise<{
    bundlePath: string;
    aggregateSha: string;
}>;
