import type { CatalogItem } from "./catalog.ts";
export interface MdcCompanion {
    sourcePath: string;
    outputPath: string;
    content: string;
}
export interface CompanionOptions {
    warnings?: string[] | undefined;
}
export interface CompanionFrontmatterOptions extends CompanionOptions {
    source?: string | undefined;
}
declare const RULE_SCOPES: readonly ["always", "agent-requested", "conditional"];
export type RuleScope = (typeof RULE_SCOPES)[number];
export declare function cursorCompanionFrontmatter(mdFrontmatter: Record<string, unknown>, options?: CompanionFrontmatterOptions): string;
export declare function planMdcCompanions(rules: readonly CatalogItem[], options?: CompanionOptions): MdcCompanion[];
export declare function generateMdcCompanions(rulesDir: string, options?: CompanionOptions): Promise<string[]>;
export type RuleActivation = {
    readonly kind: "description-driven";
} | {
    readonly kind: "glob-attached";
    readonly globs: readonly string[];
};
export declare function resolveRuleActivation(scope: RuleScope | undefined, globs: readonly string[], source: string, warnings?: string[] | undefined): RuleActivation;
export {};
