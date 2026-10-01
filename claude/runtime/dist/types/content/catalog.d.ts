import type * as NodeFsPromises from "node:fs/promises";
import { type ContentClass, type RulePrecedence } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import type { SkippedUserEntry } from "./userContent.ts";
export type CatalogFs = Pick<typeof NodeFsPromises, "readdir" | "readFile">;
export type ContentOrigin = "corpus" | "pack" | "fork" | "user";
export type CustomizingOrigin = Extract<ContentOrigin, "fork" | "user">;
export declare function layerRankOf(subject: Pick<CatalogItem, "origin">): number;
export interface CatalogItem {
    type: ContentClass;
    id: string;
    filePath: string;
    relativePath: string;
    description: string;
    tags: string[];
    precedence?: RulePrecedence;
    tools?: Tool[];
    body: string;
    frontmatter: Record<string, unknown>;
    origin?: ContentOrigin;
    provenance?: {
        pack: string;
        declaredTools: readonly string[];
    };
}
export interface PackContentRoot {
    pack: string;
    root: string;
    declaredTools?: readonly string[];
}
export interface ContentRoots {
    root?: string;
    packRoots?: readonly PackContentRoot[];
    forkRoot?: string;
    overrideRoot?: string;
}
export declare function contentRootsOf(contentRoot?: string | ContentRoots): {
    root: string | undefined;
    packRoots: readonly PackContentRoot[];
    forkRoot: string | undefined;
    overrideRoot: string | undefined;
};
export interface ContentCollision {
    key: string;
    paths: string[];
    kind: "duplicate-id" | "filename-mismatch";
}
export interface ContentShadow {
    type: ContentClass;
    id: string;
    winner: CatalogItem;
    shadowed: readonly CatalogItem[];
}
export interface ContentIndex {
    items: CatalogItem[];
    byKey: Map<string, CatalogItem>;
    collisions: ContentCollision[];
    shadows?: readonly ContentShadow[];
    skipped?: readonly SkippedUserEntry[];
}
export interface BuildContentIndexOptions {
    fs?: CatalogFs;
    packRoots?: readonly PackContentRoot[];
}
export declare const COMMAND_ID_PREFIX = "cmd-";
export declare function toPosixDisplayPath(p: string): string;
export declare function assertSafePath(relativePath: string, label: string): void;
export declare function typeIdKey(type: ContentClass, id: string): string;
export declare function applyCommandPrefix(id: string, type: ContentClass): string;
export declare function emittedIdFor(item: Pick<CatalogItem, "id" | "type">): string;
export declare function buildContentIndex(contentRoot?: string | ContentRoots, options?: BuildContentIndexOptions): Promise<ContentIndex>;
export declare function originOf(item: Pick<CatalogItem, "origin">): ContentOrigin;
export declare function replacedClaimantOf(index: ContentIndex, item: Pick<CatalogItem, "type" | "id">): CatalogItem | undefined;
export declare function getAllItemsById(index: ContentIndex, id: string): CatalogItem[];
export declare function resolveArtifactFilePath(index: ContentIndex, type: ContentClass, id: string): string | null;
export declare function slugOf(name: string): string;
