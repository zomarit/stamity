import type { CatalogItem } from "./catalog.ts";
import { type Tool } from "../types/core.ts";
import type { RuleDelivery } from "../types/manifest.ts";
export declare const SHARED_SKILLS_TREE_READERS: ReadonlySet<Tool>;
export declare const RULE_SKILL_DIR_PREFIX = "stamity-";
export interface RuleDeliveryInput {
    id: string;
    globScoped: boolean;
    critical: boolean;
    floorTagged: boolean;
    anchored: boolean;
    tools?: readonly Tool[];
}
export declare const NO_DEMOTED_RULES: Readonly<Record<Tool, ReadonlySet<string>>>;
export declare function demotedRuleIds(tool: Tool, rules: readonly RuleDeliveryInput[], mode: RuleDelivery, sharedTreeReaders?: ReadonlySet<Tool>): ReadonlySet<string>;
export declare function ruleDeliveryInputOf(item: CatalogItem): RuleDeliveryInput;
export declare function declaredRuleGlobs(item: CatalogItem): string[];
export declare function ruleAnchor(globs: readonly string[]): string | null;
