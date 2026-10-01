import { type ContentClass, type ContentSelection } from "../types/content.ts";
import { type CatalogItem, type ContentIndex } from "./catalog.ts";
export type SelectionVerdict = "keep" | "drop" | "keep-protected-missing";
export type SelectionAllowlist = Partial<Record<ContentClass, ReadonlySet<string>>>;
export interface ResolveSelectionOptions {
    ids?: Partial<Record<ContentClass, string[]>>;
    languages?: string[];
    includeTags?: string[];
    excludeTags?: string[];
}
export declare function buildSelectionAllowlist(selection: ContentSelection): SelectionAllowlist;
export declare function isIdInSelection(allowlist: SelectionAllowlist, type: ContentClass, id: string): boolean;
export declare function classifySelection(item: CatalogItem, allowlist: SelectionAllowlist): SelectionVerdict;
export declare function resolveSelection(index: ContentIndex, opts: ResolveSelectionOptions): ContentSelection;
export declare function countSelectionItems(selection: ContentSelection): number;
export declare function selectionSummary(selection: ContentSelection): string;
export declare function getAllContentIds(selection: ContentSelection): Set<string>;
