export interface ManagedBlockMarkers {
    readonly start: string;
    readonly end: string;
}
export declare const MANAGED_BLOCK_VARIANTS: readonly ManagedBlockMarkers[];
export declare function canHostManagedBlock(filePath: string): boolean;
export declare function getMarkersForPath(filePath?: string): ManagedBlockMarkers;
export declare function stampMarkerVersion(startMarker: string, version: string): string;
export declare function parseMarkerVersion(line: string): string | null;
export declare const STATE_DIR = ".stamity";
export declare const GENERATED_DIR = ".stamity/generated";
export declare const HOOKS_GENERATED_DIR = ".stamity/generated/hooks";
export declare const CONTENT_PREFIX = "stamity-";
export declare const INVOCABLE_CONTENT_PREFIX = "st-";
export declare const ENGINE_CONTENT_PREFIXES: readonly string[];
export interface ContentPrefixSubject {
    readonly type: string;
}
export declare function contentPrefixFor(artifact: ContentPrefixSubject): string;
export declare function carriesEngineContentPrefix(name: string): boolean;
export declare function stripEngineContentPrefix(name: string): string;
