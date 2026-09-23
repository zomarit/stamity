import type { Framework, RepoInfo } from "../types/detect.ts";
export type StackSupportTier = "full" | "partial" | "none";
export interface StackSupport {
    tier: StackSupportTier;
    notes: string;
}
export declare const STACK_GUIDANCE_INVENTORY: ReadonlySet<string>;
export interface StackSupportTables {
    readonly frameworks: Record<Framework, StackSupport>;
    readonly languages: Record<string, StackSupport>;
}
export declare function deriveStackSupport(inventory: ReadonlySet<string>): StackSupportTables;
export declare const FRAMEWORK_SUPPORT: Record<Framework, StackSupport>;
export declare const LANGUAGE_SUPPORT: Record<string, StackSupport>;
export declare function classifyFramework(framework: Framework): StackSupport;
export declare function classifyLanguage(language: string): StackSupport;
export interface UnsupportedStack {
    name: string;
    kind: "framework" | "language";
    support: StackSupport;
}
export declare function classifyStacksAgainst(info: RepoInfo, tables: StackSupportTables): UnsupportedStack[];
export declare function classifyDetectedStacks(info: RepoInfo): UnsupportedStack[];
export interface StackSuggestion {
    readonly name: string;
    readonly kind: "framework" | "language";
    readonly tier: StackSupportTier;
    readonly action: string;
    readonly packId?: string;
}
export declare function suggestStackPacks(info: RepoInfo, catalog?: ReadonlyMap<string, string>): StackSuggestion[];
