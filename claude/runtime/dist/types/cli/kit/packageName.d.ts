export declare function resolveOwnPackageFacts(): {
    name: string;
    version: string;
    isPrivate: boolean;
};
export declare function packageName(): string;
export declare function repositorySlug(): string | null;
export declare function packageCommand(verb: string): string;
