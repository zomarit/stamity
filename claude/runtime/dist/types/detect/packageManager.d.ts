export type PackageManagerName = "bun" | "pnpm" | "yarn" | "npm";
export interface PackageManagerInfo {
    name: PackageManagerName;
    lockfile: string | null;
    fromPackageJsonField: boolean;
}
export declare function detectPackageManager(rootDir: string): Promise<PackageManagerInfo>;
