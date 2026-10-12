import { type SpecialistTrigger } from "../roster/triggers.ts";
export type ChangeClass = "records" | "docs" | "tests" | "config" | "product" | "public-contract" | "security-sensitive";
export declare const CLASS_ORDER: readonly ChangeClass[];
export type Check = "scan" | "tests-selected" | "lint" | "typecheck" | "gates-all" | "review-once" | "review" | "dependency-audit";
export declare const CLASS_CHECKS: Readonly<Record<ChangeClass, readonly Check[]>>;
export declare const CODE_EXTENSIONS: readonly string[];
export declare const BUILT_IN_TEST_GLOBS: readonly string[];
interface LineRule {
    id: string;
    pattern: RegExp;
    rationale: string;
}
export declare const SECURITY_LINE_RULES: readonly LineRule[];
export interface Hunk {
    path: string;
    added: readonly {
        line: number;
        text: string;
    }[];
    removed: readonly string[];
    context: readonly string[];
    head?: string;
}
export declare function hasCodeExtension(path: string): boolean;
export declare function lineRulesCover(path: string, source: PathSource, firstLine: string | undefined): boolean;
export interface ClassRule {
    class: ChangeClass;
    paths: readonly string[];
    rationale: string;
    foldCase?: boolean;
    origin?: "class-file";
}
export declare const CLASS_FILE = ".stamity/change-classes.json";
export declare const BUILT_IN_RULES: readonly ClassRule[];
export declare function matchGlob(path: string, glob: string, options?: {
    literal?: boolean;
    foldCase?: boolean;
}): boolean;
export declare function outsideSecurityRule(path: string, source?: PathSource, triggers?: readonly SpecialistTrigger[]): string | undefined;
interface PathClass {
    path: string;
    class: ChangeClass;
    rule: string;
}
export type PathSource = "git" | "listed";
export type BaseState = "given" | "absent" | "unresolved";
export interface ClassifyInput {
    paths: readonly string[];
    renames?: readonly {
        from: string;
        to: string;
    }[];
    base: BaseState;
    source?: PathSource;
    hunks?: readonly Hunk[];
    unscanned?: readonly string[];
    unscannedCode?: readonly string[];
    lockfiles?: readonly Lockfile[];
}
export interface Lockfile {
    path: string;
    base: string | null;
    head: string;
    staged: "same" | "differs" | "unread";
    baseFailure?: string;
}
export interface ClassifyResult {
    class: ChangeClass;
    byPath: PathClass[];
    checks: Check[];
    lenses: string[];
    reason: string;
}
export declare function classifyChange(input: ClassifyInput, rules?: readonly ClassRule[], triggers?: readonly SpecialistTrigger[]): ClassifyResult;
export declare const AUDIT_FIRST_REASON = "lockfile-only bump: dependency audit first";
export declare function keepSecurityLens(result: ClassifyResult): ClassifyResult;
export interface TestInput {
    glob: string;
    tests: string[] | "all";
}
export type ClassFileParse = {
    ok: true;
    rules: ClassRule[];
    testGlobs: string[];
    testInputs: TestInput[];
} | {
    ok: false;
    errors: string[];
    raising: ClassRule[];
};
export declare function globCostError(glob: string): string | undefined;
export declare function testEntryError(entry: string): string | undefined;
export declare function parseClassFile(text: string): ClassFileParse;
export declare function mergeRules(builtIn: readonly ClassRule[], extension: readonly ClassRule[]): ClassRule[];
export {};
