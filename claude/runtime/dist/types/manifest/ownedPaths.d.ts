export interface OwnedPathBound {
    readonly version: number;
    readonly exact: readonly string[];
    readonly charterFileName: string;
    readonly contentRoots: readonly string[];
    readonly stateRoots: readonly string[];
    readonly packRoot: string;
    readonly importTargets: readonly string[];
}
export declare const IMPORT_TARGET: Readonly<{
    agentsMd: "AGENTS.md";
    agentMd: "AGENT.md";
    claudeMd: "CLAUDE.md";
    copilotInstructions: ".github/copilot-instructions.md";
}>;
export declare const OWNED_PATHS: OwnedPathBound;
export type OwnedPathKind = "exact" | "charter" | "content" | "state" | "pack";
export interface OwnedPathRow {
    readonly path: string;
    readonly adapter: string;
    readonly artifactType: string;
}
export declare function packDirName(packId: string): string;
export declare function ownedPathKind(row: OwnedPathRow): OwnedPathKind | null;
export declare function ownedFolderOf(path: string): string | null;
export declare function ownedPathDefect(row: OwnedPathRow): string | null;
export declare function carriesEngineMintedPrefix(name: string): boolean;
export declare function hasEngineMintedName(path: string): boolean;
export declare function needsByteProof(path: string): boolean;
export declare function isEngineCharterDocument(text: string): boolean;
export declare function bytesShowEngineOutput(path: string, text: string): boolean;
