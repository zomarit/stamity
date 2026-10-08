export type TagFacet = "capability" | "context" | "floor" | "language";
export declare function isContextTag(tag: string): boolean;
export declare function isFloorTag(tag: string): boolean;
export declare function isLanguageTag(tag: string): boolean;
export declare function facetOf(tag: string): TagFacet;
export declare function languageOf(tag: string): string | null;
export declare function primaryTag(tags: readonly string[]): string | null;
export interface Tagged {
    tags: readonly string[];
}
export declare function tagsByFacet(tags: readonly string[]): Record<TagFacet, string[]>;
export declare function filterByLanguages<T extends Tagged>(items: readonly T[], languages: readonly string[]): T[];
