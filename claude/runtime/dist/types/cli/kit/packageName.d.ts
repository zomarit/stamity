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
export declare function npmRegistry(): string | null;
export declare function registryOption(opts: {
    readonly packageName?: string;
    readonly npmRegistry?: string;
}): {
    npmRegistry?: string;
};
export declare function repositorySlug(): string | null;
export declare function packageCommand(verb: string): string;
export declare function packageCommandAt(version: string, verb: string): string;
