import type { Tool } from "../types/core.ts";
import type { PackageEntry } from "../types/detect.ts";
export declare function emitsPerPackage(tool: Tool): boolean;
export interface PerPackageOutput {
    packagePath: string;
    outputPath: string;
}
export declare function planPerPackageOutputs(packages: readonly PackageEntry[], tool: Tool, fileName: string): PerPackageOutput[];
