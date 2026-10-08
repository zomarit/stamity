export interface PackPermissions {
    toolFootprint?: string[];
    touchedPaths?: string[];
}
export declare function assertSafePackRelPath(relPath: string, context: string): void;
export declare function readPermissions(raw: Record<string, unknown>): PackPermissions | undefined;
export declare function checkPermissions(manifest: {
    readonly permissions?: PackPermissions | undefined;
}, _files: readonly unknown[]): "pass" | "n/a";
export declare function checkAgentCapabilities(files: readonly {
    relPath: string;
    frontmatter: Readonly<Record<string, unknown>>;
}[], permissions: PackPermissions | undefined): "pass";
