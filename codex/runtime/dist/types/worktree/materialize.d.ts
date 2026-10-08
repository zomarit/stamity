import { type WorktreeReceiptEntry } from "./receipt.ts";
export type MaterializeStrategy = "copy" | "symlink";
export type MaterializeOutcome = "materialized" | "skipped" | "absent" | "failed" | "withheld";
export interface MaterializeRequest {
    readonly relPath: string;
    readonly strategy: MaterializeStrategy;
    readonly secret: boolean;
}
export interface MaterializeOptions {
    readonly sourceRoot: string;
    readonly worktreeRoot: string;
    readonly platform?: NodeJS.Platform;
    readonly symlinkImpl?: (target: string, destination: string) => Promise<void>;
    readonly isSkipped?: (relPath: string) => boolean;
    readonly isKnownCredential?: (relPath: string) => boolean;
    readonly secretsGranted?: boolean;
}
export interface MaterializeResult {
    readonly relPath: string;
    readonly requested: MaterializeStrategy;
    readonly strategy: MaterializeStrategy;
    readonly outcome: MaterializeOutcome;
    readonly reason?: string;
    readonly mode?: string;
    readonly sha256?: string;
    readonly fallbackFrom?: "symlink";
    readonly errno?: string;
    readonly secretModeApplied?: boolean;
}
export declare function materializeEntries(requests: readonly MaterializeRequest[], opts: MaterializeOptions): Promise<MaterializeResult[]>;
export declare function materializeEntry(request: MaterializeRequest, opts: MaterializeOptions): Promise<MaterializeResult>;
export declare function receiptEntryFor(result: MaterializeResult): WorktreeReceiptEntry | null;
