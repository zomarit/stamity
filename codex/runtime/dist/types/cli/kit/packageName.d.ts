export declare const CANONICAL_PACKAGE_NAME = "@zomarit/stamity";
export interface OwnPackageFacts {
    name: string;
    version: string;
    isPrivate: boolean;
    registry: string | null;
}
export declare function resolveOwnPackageFacts(): OwnPackageFacts;
export declare function packageName(): string;
export declare function hasNpmChannel(): boolean;
export declare function repositorySlug(): string | null;
export declare function packageCommand(verb: string): string;
