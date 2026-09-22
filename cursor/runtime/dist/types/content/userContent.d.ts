import { type ContentClass } from "../types/content.ts";
export type UserArtifactType = ContentClass;
export interface UserContentArtifact {
    type: UserArtifactType;
    id: string;
    filePath: string;
    frontmatter: Record<string, unknown>;
    body: string;
    frontmatterText?: string;
}
export declare const LEAN_LINE_THRESHOLDS: Record<UserArtifactType, number>;
export interface SaveResult {
    saved: boolean;
    path?: string;
    errors: string[];
    warnings: string[];
}
export interface ContentBodyViolation {
    kind: "anti-slop" | "lean-lines" | "missing-field" | "missing-lifecycle-field" | "filename-mismatch" | "deny-pattern";
    detail: string;
    severity: "warning" | "error";
}
export interface UserArtifactCheckInput {
    readonly type: UserArtifactType;
    readonly id: string;
    readonly filePath: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
    readonly body: string;
    readonly frontmatterText?: string;
    readonly fileSlug?: string;
}
export interface UserArtifactCheck {
    readonly errors: readonly ContentBodyViolation[];
    readonly warnings: readonly ContentBodyViolation[];
}
export declare function userContentRoot(rootDir: string): string;
export declare const CLASS_LAYOUT: Record<UserArtifactType, {
    dir: string;
    layout: "file" | "directory";
}>;
export declare const SKILL_FILE = "SKILL.md";
export declare function saveUserContent(rootDir: string, type: UserArtifactType, id: string, content: string): Promise<SaveResult>;
export declare function discoverUserContent(rootDir: string): Promise<UserContentArtifact[]>;
export interface SkippedUserEntry {
    type: UserArtifactType;
    filePath: string;
    reason: string;
}
export declare function discoverSkippedUserEntries(rootDir: string): Promise<SkippedUserEntry[]>;
export interface UserContentOverlay {
    type: UserArtifactType;
    slug: string;
    frontmatterPath?: string;
    bodyPath?: string;
    bodyLength?: number;
}
export declare function discoverUserOverlays(rootDir: string): Promise<UserContentOverlay[]>;
export declare function discoverOverlaysUnder(root: string): Promise<UserContentOverlay[]>;
export interface UserSkillOverlayCarrierExtra {
    slug: string;
    filePath: string;
    count: number;
}
export declare function discoverSkillOverlayCarrierExtras(rootDir: string): Promise<UserSkillOverlayCarrierExtra[]>;
export interface UserSkillSupportFinding {
    filePath: string;
    severity: "error";
    detail: string;
}
export interface UserSkillSupportScan {
    readonly findings: UserSkillSupportFinding[];
    readonly skipped: SkippedUserEntry[];
    readonly inspected: number;
}
export declare function scanUserSkillSupportFiles(rootDir: string): Promise<UserSkillSupportScan>;
export declare function checkUserArtifact(input: UserArtifactCheckInput): Promise<UserArtifactCheck>;
export declare function validateUserArtifact(artifact: UserContentArtifact): Promise<ContentBodyViolation[]>;
export declare function validateContentBody(body: string, type: UserArtifactType): Promise<ContentBodyViolation[]>;
