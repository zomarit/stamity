import type { CatalogPin } from "./trust.ts";
type CatalogSource = {
    kind: "bundled";
} | {
    kind: "npm";
    package: string;
};
export interface CatalogEntry {
    id: string;
    description: string;
    source: CatalogSource;
    pin: CatalogPin;
    notAudited: boolean;
    disclaimer: string;
}
export declare function validateCatalogFormat(entries: readonly CatalogEntry[], pins: Readonly<Record<string, string>>): readonly CatalogEntry[];
export declare const CURATED_PACKS: readonly CatalogEntry[];
export declare function lookupCatalogEntry(idOrName: string): CatalogEntry | undefined;
export declare function resolveBundledPackRoot(id: string): string;
export {};
