export declare function insertManagedBlock(existingContent: string, managedContent: string, filePath?: string, version?: string): string;
export declare function extractManagedBlock(content: string, filePath?: string): string | null;
export declare function splitAtManagedBlock(content: string, filePath?: string): {
    before: string;
    block: string;
    after: string;
} | null;
export declare function splitAfterManagedBlock(content: string, filePath?: string): {
    prefix: string;
    rest: string;
} | null;
export declare function isHealableManagedPrefix(prefix: string): boolean;
export declare function extractCustomContent(content: string, filePath?: string): string;
export declare function wrapInManagedBlock(content: string, filePath?: string, version?: string): string;
export declare function hasManagedBlock(content: string, filePath?: string): boolean;
export declare function wouldChangeMarkerVariant(existingContent: string, filePath?: string): boolean;
export declare function getStampedVersion(content: string, filePath?: string): string | null;
export declare function isManagedBlockStale(existingContent: string, currentVersion: string, filePath?: string): boolean;
