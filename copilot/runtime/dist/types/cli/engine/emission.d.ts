import { type ContentRoots } from "../../content/catalog.ts";
import type { AdapterOutput, ContentClass, EmissionPlan } from "../../types/content.ts";
import type { PackageEntry } from "../../types/detect.ts";
import type { SetupManifest } from "../../types/manifest.ts";
export declare const OVERRIDE_EMITTING_CLASSES: readonly ContentClass[];
export interface EmissionFacts {
    monorepoPackages: readonly PackageEntry[];
    hookScriptsRoot?: string;
}
export interface EmissionContext {
    rootDir: string;
    manifest: SetupManifest;
    engineVersion: string;
    facts: EmissionFacts;
    contentRoot?: string | ContentRoots;
}
export interface EmissionPlanner {
    readonly id: string;
    plan(ctx: EmissionContext): Promise<AdapterOutput[]>;
    planWithWarnings(ctx: EmissionContext): Promise<EmissionPlan>;
}
export declare const noopEmissionPlanner: EmissionPlanner;
export declare function getEmissionPlanner(): EmissionPlanner;
