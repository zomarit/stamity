import type { CoOwnedReduction } from "../types/content.ts";
import type { CoOwnership } from "../types/manifest.ts";
import { type CoOwnedOwnership, type CoOwnedPlan } from "./coOwnedJson.ts";
export type CodexTableRendering = (name: string) => string | null;
export declare function describeCodexHooksOff(shown: string, raw: string | null): string | null;
export declare function planCodexConfigToml(filePath: string, emitted: string, existingRaw: string | null, ownership: CoOwnedOwnership, render: CodexTableRendering, selected: readonly string[]): CoOwnedPlan;
export declare function reduceCodexConfigToml(raw: string, opts: {
    record: CoOwnership | null;
    legacy: boolean;
    selected: readonly string[];
    render: CodexTableRendering;
    deleteWhenEngineOnly: boolean;
}): CoOwnedReduction;
