export declare const MEASUREMENTS_DOC_PATH = "docs/measurements.md";
export declare const MEASUREMENTS_REGENERATE_COMMAND = "node scripts/generate-docs.mjs --page measurements";
export declare const RUNS_DIR = ".stamity/runs";
export declare const SNAPSHOT_DIR = "evals/measurements";
export declare const SNAPSHOT_REFRESH_COMMAND = "node scripts/merge-ready-rate.mjs --write";
export declare const REACH_SNAPSHOT_PATH = "evals/reach/npm-downloads-2026-09-14.json";
export declare const RUN_OF_RECORD_PATH = "evals/runs/2026-10-08-run-43/RESULTS.md";
export declare const RUN_OF_RECORD_RELEASE = "1.12.0";
export interface RunOfRecordException {
    readonly run: string;
    readonly text: string;
}
export declare const RUN_OF_RECORD_EXCEPTION: RunOfRecordException | null;
export declare function runOfRecordVerdict(results: string, exception: RunOfRecordException | null, run?: string): readonly string[];
export declare function priorCompleteRun(results: string): string | null;
interface RemeasuredCase {
    readonly id: string;
    readonly why: string | null;
}
export interface Composition {
    readonly prior: string;
    readonly remeasured: readonly RemeasuredCase[];
    readonly carried: number;
}
export declare function compositionOf(results: string): Composition | null;
export declare function runStatus(results: string): string;
export interface FailingCases {
    readonly kind: "floor" | "guardrail";
    readonly ids: readonly string[];
}
export declare function failingCases(results: string): readonly FailingCases[];
export declare function unmetMetrics(results: string): readonly string[];
export declare function thresholdMiss(results: string, metric: string): string;
export declare const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
export declare const MERGE_READY_RULE: string;
export declare const DEFAULT_CONFIDENCE_GATE = 0.8;
export declare const MERGE_EVIDENCE_NONE = "none in committed artifacts";
export interface ExcludedRun {
    readonly run: string;
    readonly reason: string;
}
export interface DenominatedRun extends ExcludedRun {
    readonly mergeEvidence: string;
}
export interface VerifiedRun {
    readonly run: string;
    readonly mergeEvidence: string;
}
export interface MergeReadyReport {
    readonly generated: string;
    readonly rule: string;
    readonly denominator: readonly DenominatedRun[];
    readonly numerator: readonly VerifiedRun[];
    readonly excluded: readonly ExcludedRun[];
    readonly rate: {
        readonly n: number;
        readonly d: number;
        readonly value: number;
    };
    readonly computedFrom: {
        readonly records: number;
        readonly newestRecordDate: string;
        readonly changelogHead: string;
    };
}
export declare function computeMergeReadyRate(root?: string): MergeReadyReport;
export interface MeasurementSnapshot {
    readonly path: string;
    readonly report: MergeReadyReport;
}
export declare function readMeasurementSnapshot(root?: string): MeasurementSnapshot;
export declare function writeMeasurementSnapshot(root: string, date: string): string;
export interface ReachPoint {
    readonly downloads: number;
    readonly start: string;
    readonly end: string;
}
export interface ReachSnapshot {
    readonly accessed: string;
    readonly label: string;
    readonly source: string;
    readonly lastWeek: ReachPoint;
    readonly lastMonth: ReachPoint;
    readonly daily: {
        readonly start: string;
        readonly end: string;
        readonly downloads: readonly {
            readonly day: string;
            readonly downloads: number;
        }[];
    };
}
export declare function readReachSnapshot(root?: string): ReachSnapshot;
export declare function measurementMethod(root: string, runOfRecord: string, results: string): readonly string[];
export declare function renderMeasurements(root?: string, exception?: RunOfRecordException | null): string;
export {};
