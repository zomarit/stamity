import { type BranchPlanKind, type WorktreeGitRunner } from "./git.ts";
import { type MaterializeStrategy } from "./materialize.ts";
import { type GitPathClass, type WorktreePolicy } from "./policy.ts";
export type ConsentAnswer = "granted" | "declined" | "unanswered" | "not-required";
export declare function isGranted(answer: ConsentAnswer): boolean;
export interface WorktreeSetupConsent {
    readonly attach: ConsentAnswer;
    readonly track: ConsentAnswer;
    readonly secrets: ConsentAnswer;
}
export declare const UNANSWERED_CONSENT: WorktreeSetupConsent;
export interface BranchPlan {
    readonly kind: BranchPlanKind;
    readonly branch: string;
    readonly reason: string;
    readonly remoteConsulted: boolean;
    readonly checkedOutAt: string | null;
}
export interface PlannedEntry {
    readonly path: string;
    readonly strategy: MaterializeStrategy;
    readonly secret: boolean;
    readonly reason: string | null;
}
export interface PlannedConsentGate {
    readonly gate: "attach" | "track" | "secrets";
    readonly answer: ConsentAnswer;
    readonly effect: "proceed" | "refuse" | "skip" | "create-instead";
}
export interface WorktreeSetupPlan {
    readonly name: string;
    readonly farmDir: string;
    readonly worktreePath: string;
    readonly policySource: string;
    readonly policy: WorktreePolicy;
    readonly entries: readonly PlannedEntry[];
    readonly branchPlan: BranchPlan;
    readonly gates: readonly PlannedConsentGate[];
}
export interface WorktreeSetupPlanOptions {
    readonly repoRoot: string;
    readonly name: string;
    readonly consent?: WorktreeSetupConsent;
    readonly fetch?: boolean;
    readonly run?: WorktreeGitRunner;
    readonly policy?: WorktreePolicy;
}
export type SetupPresence = "present" | "absent" | "unreadable";
export interface WorktreeEntryReport {
    readonly path: string;
    readonly requested: MaterializeStrategy;
    readonly strategy: MaterializeStrategy;
    readonly outcome: "materialized" | "skipped" | "absent" | "failed" | "withheld";
    readonly reason: string | null;
    readonly mode: string | null;
    readonly errno: string | null;
    readonly fallbackFrom: "symlink" | null;
}
export interface WorktreeErrorDocument {
    readonly code: "FS_ERROR";
    readonly message: string;
    readonly next: string;
}
export interface WorktreeSetupResult {
    readonly status: "complete" | "partial";
    readonly worktree: {
        readonly path: string;
        readonly branch: string;
        readonly head: string;
    };
    readonly branchPlan: BranchPlanKind;
    readonly entries: readonly WorktreeEntryReport[];
    readonly notices: readonly string[];
    readonly setup: SetupPresence;
    readonly receiptPath: string | null;
    readonly error: WorktreeErrorDocument | null;
}
export interface WorktreeSetupOptions extends WorktreeSetupPlanOptions {
    readonly engineVersion: string;
    readonly now?: () => Date;
    readonly rerun?: string;
}
export declare function resolveBranchPlan(run: WorktreeGitRunner, repoRoot: string, branch: string, opts: {
    readonly fetch: boolean;
}): Promise<BranchPlan>;
export declare function planWorktreeSetup(opts: WorktreeSetupPlanOptions): Promise<WorktreeSetupPlan>;
export declare function applySetupConsent(plan: WorktreeSetupPlan, consent: WorktreeSetupConsent, rerun: string): BranchPlan;
export declare const WORKTREE_LOCK_SUBDIR: string;
export declare function worktreeLockPath(gitCommonDir: string, name: string): string;
export declare function runWorktreeSetup(opts: WorktreeSetupOptions): Promise<WorktreeSetupResult>;
export declare function probeSetupPresence(worktreePath: string): Promise<SetupPresence>;
export type { GitPathClass };
