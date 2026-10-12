export declare const WORKTREE_POLICY_FILE = ".stamity/worktree.json";
export declare const WORKTREE_POLICY_VERSION = 1;
export declare const WORKTREE_FARM_DIR_NAME = ".stamity-worktrees";
export type WorktreeStrategy = "copy" | "symlink" | "skip";
export type WorktreePolicyList = "entries" | "overrides";
export interface WorktreePolicyRule {
    readonly path: string;
    readonly strategy: WorktreeStrategy;
    readonly secret: boolean;
    readonly reason?: string;
    readonly list: WorktreePolicyList;
}
export interface WorktreePolicy {
    readonly version: number;
    readonly farmDir?: string;
    readonly entries: readonly WorktreePolicyRule[];
    readonly overrides: readonly WorktreePolicyRule[];
    readonly source: string;
    readonly builtIn: boolean;
}
export type GitPathClass = "tracked" | "ignored" | "untracked";
export declare const BUILT_IN_POLICY_SOURCE = "<built-in worktree defaults>";
export declare const DEFAULT_WORKTREE_RULES: readonly WorktreePolicyRule[];
export declare function builtInWorktreePolicy(): WorktreePolicy;
export declare function isKnownCredentialPath(relPath: string): boolean;
export declare function readWorktreePolicy(repoRoot: string): Promise<WorktreePolicy>;
export declare function parseWorktreePolicy(text: string, filePath: string): WorktreePolicy;
export declare function policyRules(policy: WorktreePolicy): readonly WorktreePolicyRule[];
export declare function matchPolicyRule(policy: WorktreePolicy, relPath: string): WorktreePolicyRule | null;
export declare function resolveStrategy(policy: WorktreePolicy, relPath: string): WorktreeStrategy;
export declare function materializationRules(policy: WorktreePolicy): readonly WorktreePolicyRule[];
export declare function assertRulesAdmissible(policy: WorktreePolicy, classify: (relPath: string) => GitPathClass): void;
export declare function resolveFarmDir(policy: WorktreePolicy, repoRoot: string): string;
