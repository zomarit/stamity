import { type Tool } from "../types/core.ts";
export interface ParsedFrontmatter {
    frontmatter: Record<string, unknown>;
    body: string;
    hadFrontmatter: boolean;
}
export declare function parseFrontmatter(raw: string, source: string): ParsedFrontmatter;
export declare function parseFrontmatterBlock(block: string, source: string): Record<string, unknown>;
export declare function composeFrontmatter(frontmatter: Record<string, unknown>, body: string): string;
export declare function extractToolsFrontmatter(raw: string, source?: string): Tool[] | undefined;
export declare function frontmatterField(parsed: ParsedFrontmatter, field: string): unknown;
