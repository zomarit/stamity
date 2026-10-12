export declare const STATE_SUBDIRS: readonly string[];
export declare const STATE_KEEP_FILE = ".gitkeep";
export declare function stateKeepPaths(): string[];
export declare function ensureStateScaffold(rootDir: string, opts?: {
    dryRun?: boolean;
}): Promise<string[]>;
