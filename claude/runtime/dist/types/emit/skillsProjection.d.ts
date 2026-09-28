import { type CatalogFs, type CatalogItem, type ContentOrigin, type ContentRoots } from "../content/catalog.ts";
import type { ContentClass } from "../types/content.ts";
import { type Tool } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";
export declare const SKILLS_PROJECTION_DIR = ".agents/skills";
export declare const NATIVE_SKILL_DIRS: Readonly<Partial<Record<Tool, string>>>;
export interface ProjectedFile {
    path: string;
    content: string;
    artifactId: string;
    artifactType: ContentClass | "infra";
    origin?: ContentOrigin;
}
export interface ProjectedSkillFile extends ProjectedFile {
    artifactPath: string;
}
export interface SkillsEmissionContext {
    manifest: SetupManifest;
    engineVersion: string;
}
export interface ProjectSkillsOptions {
    contentRoot?: string | ContentRoots;
    fs?: CatalogFs;
    ruleItems?: readonly CatalogItem[];
    demotedRules?: Readonly<Record<Tool, ReadonlySet<string>>>;
}
export declare function projectSkills(ctx: SkillsEmissionContext, options?: ProjectSkillsOptions): Promise<ProjectedSkillFile[]>;
export declare function retargetProjection<Row extends ProjectedFile>(rows: readonly Row[], dir: string): Row[];
export declare function nativeSkillRows<Row extends ProjectedFile>(rows: readonly Row[], tool: Tool, demotedRules?: Readonly<Record<Tool, ReadonlySet<string>>>): Row[];
export declare function toSpecFrontmatter(raw: string, skillDir: string, source: string): string;
