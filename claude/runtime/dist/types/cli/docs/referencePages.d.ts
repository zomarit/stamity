import { type McpServerMeta } from "../../mcp/catalog.ts";
import { type ContentClass } from "../../types/content.ts";
export declare const REGENERATE_COMMAND = "node scripts/generate-docs.mjs";
export declare function generatedBanner(): string;
export declare function frontmatterBlock(title: string): string;
export interface ReferencePageSpec {
    readonly path: string;
    readonly title: string;
    readonly covers: ContentClass | "packs" | "mcp";
    readonly blurb: string;
    readonly intro: string;
}
export declare const REFERENCE_PAGES: readonly ReferencePageSpec[];
export declare function renderMcpPageFrom(servers: Readonly<Record<string, McpServerMeta>>, verifiedOn: string, spec?: ReferencePageSpec): string;
export interface ReferenceInputs {
    readonly contentRoot?: string;
    readonly packsRoot?: string;
}
export declare function renderReferencePages(inputs?: ReferenceInputs): Promise<ReadonlyMap<string, string>>;
