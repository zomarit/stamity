import { type CharterInvariants } from "../emit/substitution.ts";
import type { Tool } from "../types/core.ts";
import { type RuleDelivery } from "../types/manifest.ts";
import { type RuleDeliveryInput } from "./ruleDelivery.ts";
export declare const CHARTER_RELATIVE_PATH = "charter/stamity-charter.md";
export declare const CHARTER_MAX_LINES = 150;
export declare const DESCRIPTION_PULL_TOOLS: ReadonlySet<Tool>;
export declare const RULE_APPENDIX_TOOLS: ReadonlySet<Tool>;
export interface AlwaysOnRule extends RuleDeliveryInput {
    lineCount: number;
}
export interface AlwaysOnPlan {
    charterLines: number;
    rules: readonly AlwaysOnRule[];
}
export declare const ALWAYS_ON_BUDGET_LINES: Readonly<Record<Tool, number>>;
export declare const ALWAYS_ON_SHARED_BYTES_WITH_CODEX = 24952;
export declare const ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX = 5192;
export declare function composeAlwaysOnLoad(tool: Tool, plan: AlwaysOnPlan, mode?: RuleDelivery): number;
export interface CharterTemplate {
    frontmatter: Record<string, unknown>;
    invariants: CharterInvariants | null;
    body: string;
    lineCount: number;
    relativePath: string;
}
export declare function readCharterTemplate(contentRoot?: string): Promise<CharterTemplate>;
