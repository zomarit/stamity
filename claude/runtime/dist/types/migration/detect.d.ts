export declare const PREDECESSOR_CONTENT_PREFIX: string;
export interface PredecessorMarkerVariant {
    readonly id: "html" | "hash" | "slash";
    readonly begin: RegExp;
    readonly end: RegExp;
}
export declare const PREDECESSOR_MARKER_VARIANTS: readonly PredecessorMarkerVariant[];
export declare const PREDECESSOR_MARKED_FILE_CANDIDATES: readonly string[];
export interface PredecessorState {
    stateDirPath: string | null;
    manifestPath: string | null;
    manifestRaw: Record<string, unknown> | null;
    learningsDir: string | null;
    learningsCount: number;
    envMcpPath: string | null;
    overridesDir: string | null;
    markedFiles: string[];
    packagesWithState: string[];
}
export declare function detectPredecessorState(rootDir: string): Promise<PredecessorState | null>;
export declare function hasPredecessorMarker(content: string): boolean;
