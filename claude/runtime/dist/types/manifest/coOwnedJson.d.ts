import type { CoOwnedReduction, MergeResult } from "../types/content.ts";
import type { CoOwnership } from "../types/manifest.ts";
import { type MemberPointer } from "./jsonMembers.ts";
export interface ElementSpec {
    pointer: string;
    recognise(element: unknown): boolean;
    inBound(element: unknown): boolean;
    outsideBound: "backup" | "foreign";
}
export interface MemberSpec {
    pointer: MemberPointer;
    foreign: "collide" | "yield";
    structural?: true;
    known?: (value: unknown) => boolean;
}
export interface CoOwnedJsonSpec {
    noun: string;
    elements: readonly ElementSpec[];
    members: readonly MemberSpec[];
    personalHint?: string;
    earlier?: (rendering: Record<string, unknown>) => unknown;
}
export interface CoOwnedOwnership {
    owned: boolean;
    legacy: boolean;
    record: CoOwnership | null;
    ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
    boundaryDir?: string;
}
export interface CoOwnedPlan {
    result: MergeResult;
    content: string | null;
    backup: string | null;
    collision: string | null;
    record: CoOwnership | null;
}
export interface CoOwnedPrediction {
    result: MergeResult;
    collision: {
        kind: "shared-name" | "co-owned-shape";
        detail: string;
    } | null;
    after?: string | null;
}
export interface CoOwnedMergeResult extends MergeResult {
    writtenContent: string | null;
    writtenRecord: CoOwnership | null;
}
export declare function commandRunsStateScript(command: string): boolean;
export declare function executedScript(command: string): string | null;
export declare function argvExecutedScript(argv: readonly unknown[]): string | null;
export declare function isPackScriptPath(path: string): boolean;
export declare function printableName(name: string): string;
export declare function planCoOwnedJson(filePath: string, emitted: string, existingRaw: string | null, spec: CoOwnedJsonSpec, ownership: CoOwnedOwnership): CoOwnedPlan;
export declare function refuseLinkedCoOwnedTarget(filePath: string): Promise<void>;
export declare function predictCoOwnedMerge(filePath: string, plan: (existingRaw: string | null) => CoOwnedPlan, noun: string): Promise<CoOwnedPrediction>;
export declare function materializeCoOwned(filePath: string, plan: (existingRaw: string | null) => CoOwnedPlan, ownership: Pick<CoOwnedOwnership, "boundaryDir">, noun: string): Promise<CoOwnedMergeResult>;
export declare function reduceCoOwnedJson(raw: string, spec: CoOwnedJsonSpec, opts: {
    record: CoOwnership | null;
    legacy: boolean;
    deleteWhenEngineOnly: boolean;
    rendered?: unknown;
}): CoOwnedReduction;
