import { type ChangeClass } from "./classify.ts";
export interface TestInputEntry {
    glob: string;
    tests: readonly string[] | "all";
}
export interface TestSource {
    test: string;
    reads: readonly string[];
}
export interface TestSelectionInput {
    paths: readonly string[];
    class: ChangeClass;
    map?: readonly TestInputEntry[];
    testSources?: readonly TestSource[];
}
export interface TestSelection {
    full: boolean;
    files: string[];
    reason: string;
}
export interface RefusedLiteral {
    refused: string;
    error: string;
}
export declare function isTestSource(path: string, testGlobs: readonly string[]): boolean;
export declare function extractReadPaths(testSource: string, tracked: ReadonlySet<string>): string[] | RefusedLiteral;
export declare function selectTests(input: TestSelectionInput): TestSelection;
