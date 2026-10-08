import { type EffortLevel, type ModelClass, type Tool } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";
export interface ModelLadderRow {
    readonly modelClass: ModelClass;
    readonly roles: readonly string[];
    readonly defaultEffort: EffortLevel;
    readonly rationale: string;
}
export declare const MODEL_LADDER: readonly ModelLadderRow[];
export declare function isModelClass(value: unknown): value is ModelClass;
type EffortCarrier = "key" | "model-suffix" | null;
export declare const EFFORT_PLACEHOLDER = "{effort}";
export interface ClientModelProjection {
    readonly tool: Tool;
    readonly modelKey: string | null;
    readonly effortCarrier: EffortCarrier;
    readonly effortKey: string | null;
    readonly effortTemplate: string | null;
    readonly acceptsConcreteIds: boolean;
    readonly aliases: Readonly<Partial<Record<ModelClass, string>>>;
    readonly effortScale: readonly EffortLevel[];
    readonly effortScaleNote: string | null;
    readonly effortScaleCitation: {
        url: string;
        accessDate: string;
    } | null;
    readonly citation: {
        url: string;
        accessDate: string;
    };
}
export declare const CLIENT_MODEL_PROJECTION: Readonly<Record<Tool, ClientModelProjection>>;
export type ModelPinMap = Readonly<Partial<Record<ModelClass, string>>>;
export type EffortMap = Readonly<Partial<Record<ModelClass, EffortLevel>>>;
export declare function nearestExpressibleEffort(level: EffortLevel, tool: Tool): EffortLevel | undefined;
export declare function resolveModelValue(modelClass: string, tool: Tool, pins?: ModelPinMap, efforts?: EffortMap): string | undefined;
export declare function resolveEffortValue(modelClass: string, tool: Tool, efforts?: EffortMap): string | undefined;
export declare function effortDisclosures(manifest: SetupManifest): string[];
export {};
