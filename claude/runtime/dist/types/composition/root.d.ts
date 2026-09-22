import * as configParse from "../config/parse.ts";
import * as denyScan from "../denyscan/denyScan.ts";
import * as managedBlocks from "../merge/managedBlocks.ts";
import * as atomicWrite from "../merge/atomicWrite.ts";
import * as safeWrite from "../merge/safeWrite.ts";
import * as reclaim from "../merge/reclaim.ts";
import * as fsErrors from "../merge/fsErrors.ts";
import * as frontmatter from "../content/frontmatter.ts";
import * as contentRoot from "../content/contentRoot.ts";
import * as tags from "../content/tags.ts";
import * as contentCatalog from "../content/catalog.ts";
import * as charter from "../content/charter.ts";
import * as selection from "../content/selection.ts";
import * as ruleDelivery from "../content/ruleDelivery.ts";
import * as mdcCompanions from "../content/mdcCompanions.ts";
import * as userContent from "../content/userContent.ts";
import * as learningsValidation from "../learnings/validation.ts";
import * as learningsStore from "../learnings/store.ts";
import * as handoffSchema from "../handoffs/schema.ts";
import * as handoffValidation from "../handoffs/validation.ts";
import * as handoffStore from "../handoffs/store.ts";
import * as manifestCore from "../manifest/manifest.ts";
import * as ledger from "../manifest/ledger.ts";
import * as mcpFilter from "../manifest/mcpFilter.ts";
import * as claudeSettings from "../manifest/claudeSettings.ts";
import * as mcpCatalog from "../mcp/catalog.ts";
import * as descriptionScan from "../mcp/descriptionScan.ts";
import * as mcpEnv from "../mcp/env.ts";
import * as mcpEmit from "../mcp/emit.ts";
import * as secretScan from "../mcp/secretScan.ts";
import * as packManifest from "../pack/manifest.ts";
import * as packInstall from "../pack/install.ts";
import * as packPermissions from "../pack/permissions.ts";
import * as packTrust from "../pack/trust.ts";
import * as packSign from "../pack/sign.ts";
import * as packSigstoreVerifier from "../pack/sigstoreVerifier.ts";
import * as packOrgPolicy from "../pack/orgPolicy.ts";
import * as packReceipt from "../pack/receipt.ts";
import * as packProjection from "../pack/projection.ts";
import * as packCurated from "../pack/curated.ts";
import * as packCatalogPins from "../pack/catalogPins.ts";
import * as packVerifyInstalled from "../pack/verifyInstalled.ts";
import * as workspaceModel from "../workspace/model.ts";
import * as workspaceGit from "../workspace/git.ts";
import * as workspaceDetect from "../workspace/detect.ts";
import * as workspaceResolve from "../workspace/resolve.ts";
import * as workspaceManifest from "../workspace/manifest.ts";
import * as workspaceSync from "../workspace/sync.ts";
import * as worktreePolicy from "../worktree/policy.ts";
import * as worktreeGit from "../worktree/git.ts";
import * as worktreeReceipt from "../worktree/receipt.ts";
import * as worktreeMaterialize from "../worktree/materialize.ts";
import * as worktreeSetup from "../worktree/setup.ts";
import * as worktreeCleanup from "../worktree/cleanup.ts";
import * as hooksModel from "../hooks/model.ts";
import * as portableRunner from "../hooks/portableRunner.ts";
import * as userHooks from "../hooks/userHooks.ts";
import * as hookScripts from "../hooks/scripts.ts";
import * as toolCategories from "../tools/categories.ts";
import * as allowlist from "../tools/allowlist.ts";
import * as translator from "../tools/translator.ts";
import * as repoAnalyzer from "../detect/repoAnalyzer.ts";
import * as packageManager from "../detect/packageManager.ts";
import * as stackSupport from "../detect/stackSupport.ts";
import * as verificationGates from "../detect/verificationGates.ts";
import * as substitution from "../emit/substitution.ts";
import * as monorepoPlan from "../emit/monorepoPlan.ts";
import * as agentsMd from "../emit/agentsMd.ts";
import * as skillsProjection from "../emit/skillsProjection.ts";
import * as stateScaffold from "../emit/stateScaffold.ts";
import * as hooksInfra from "../emit/hooksInfra.ts";
import * as emitOwnership from "../emit/ownership.ts";
import * as emitPlanner from "../emit/planner.ts";
import * as capabilityMatrix from "../emit/capabilityMatrix.ts";
import * as adapterClaude from "../adapters/claude.ts";
import * as adapterCursor from "../adapters/cursor.ts";
import * as adapterCopilot from "../adapters/copilot.ts";
import * as adapterCodex from "../adapters/codex.ts";
import * as adapterToml from "../adapters/toml.ts";
import * as adapterRegistry from "../adapters/registry.ts";
import * as promptGuard from "../guard/promptGuard.ts";
import * as outputBounds from "../guard/outputBounds.ts";
import * as tokenEstimate from "../guard/tokenEstimate.ts";
import * as retry from "../resilience/retry.ts";
import * as failureClass from "../resilience/failureClass.ts";
import * as failureLog from "../resilience/failureLog.ts";
import * as adapterTimeout from "../resilience/adapterTimeout.ts";
import * as rosterTriggers from "../roster/triggers.ts";
import * as reviewCaps from "../roster/reviewCaps.ts";
import * as agentPolicies from "../roster/agentPolicies.ts";
import * as agentGrants from "../roster/agentGrants.ts";
import * as modelLadder from "../roster/modelLadder.ts";
import * as pluginCapabilityFile from "../plugins/capabilityFile.ts";
export interface EngineRegistry {
    readonly denyscan: typeof denyScan;
    readonly merge: {
        readonly managedBlocks: typeof managedBlocks;
        readonly atomicWrite: typeof atomicWrite;
        readonly safeWrite: typeof safeWrite;
        readonly reclaim: typeof reclaim;
        readonly fsErrors: typeof fsErrors;
    };
    readonly content: {
        readonly frontmatter: typeof frontmatter;
        readonly contentRoot: typeof contentRoot;
        readonly tags: typeof tags;
        readonly catalog: typeof contentCatalog;
        readonly charter: typeof charter;
        readonly selection: typeof selection;
        readonly ruleDelivery: typeof ruleDelivery;
        readonly mdcCompanions: typeof mdcCompanions;
        readonly userContent: typeof userContent;
    };
    readonly learnings: {
        readonly validation: typeof learningsValidation;
        readonly store: typeof learningsStore;
    };
    readonly handoffs: {
        readonly schema: typeof handoffSchema;
        readonly validation: typeof handoffValidation;
        readonly store: typeof handoffStore;
    };
    readonly manifest: {
        readonly manifest: typeof manifestCore;
        readonly ledger: typeof ledger;
        readonly mcpFilter: typeof mcpFilter;
        readonly claudeSettings: typeof claudeSettings;
    };
    readonly mcp: {
        readonly catalog: typeof mcpCatalog;
        readonly descriptionScan: typeof descriptionScan;
        readonly env: typeof mcpEnv;
        readonly emit: typeof mcpEmit;
        readonly secretScan: typeof secretScan;
    };
    readonly pack: {
        readonly manifest: typeof packManifest;
        readonly install: typeof packInstall;
        readonly permissions: typeof packPermissions;
        readonly trust: typeof packTrust;
        readonly sign: typeof packSign;
        readonly sigstoreVerifier: typeof packSigstoreVerifier;
        readonly orgPolicy: typeof packOrgPolicy;
        readonly receipt: typeof packReceipt;
        readonly projection: typeof packProjection;
        readonly curated: typeof packCurated;
        readonly catalogPins: typeof packCatalogPins;
        readonly verifyInstalled: typeof packVerifyInstalled;
    };
    readonly workspace: {
        readonly model: typeof workspaceModel;
        readonly git: typeof workspaceGit;
        readonly detect: typeof workspaceDetect;
        readonly resolve: typeof workspaceResolve;
        readonly manifest: typeof workspaceManifest;
        readonly sync: typeof workspaceSync;
    };
    readonly worktree: {
        readonly policy: typeof worktreePolicy;
        readonly receipt: typeof worktreeReceipt;
        readonly materialize: typeof worktreeMaterialize;
        readonly git: typeof worktreeGit;
        readonly setup: typeof worktreeSetup;
        readonly cleanup: typeof worktreeCleanup;
    };
    readonly hooks: {
        readonly model: typeof hooksModel;
        readonly portableRunner: typeof portableRunner;
        readonly userHooks: typeof userHooks;
        readonly scripts: typeof hookScripts;
    };
    readonly tools: {
        readonly categories: typeof toolCategories;
        readonly allowlist: typeof allowlist;
        readonly translator: typeof translator;
    };
    readonly detect: {
        readonly repoAnalyzer: typeof repoAnalyzer;
        readonly packageManager: typeof packageManager;
        readonly stackSupport: typeof stackSupport;
        readonly verificationGates: typeof verificationGates;
    };
    readonly emit: {
        readonly substitution: typeof substitution;
        readonly monorepoPlan: typeof monorepoPlan;
        readonly agentsMd: typeof agentsMd;
        readonly skillsProjection: typeof skillsProjection;
        readonly stateScaffold: typeof stateScaffold;
        readonly hooksInfra: typeof hooksInfra;
        readonly ownership: typeof emitOwnership;
        readonly planner: typeof emitPlanner;
        readonly capabilityMatrix: typeof capabilityMatrix;
    };
    readonly adapters: {
        readonly claude: typeof adapterClaude;
        readonly cursor: typeof adapterCursor;
        readonly copilot: typeof adapterCopilot;
        readonly codex: typeof adapterCodex;
        readonly toml: typeof adapterToml;
        readonly registry: typeof adapterRegistry;
    };
    readonly guard: {
        readonly promptGuard: typeof promptGuard;
        readonly outputBounds: typeof outputBounds;
        readonly tokenEstimate: typeof tokenEstimate;
    };
    readonly resilience: {
        readonly retry: typeof retry;
        readonly failureClass: typeof failureClass;
        readonly failureLog: typeof failureLog;
        readonly adapterTimeout: typeof adapterTimeout;
    };
    readonly roster: {
        readonly triggers: typeof rosterTriggers;
        readonly reviewCaps: typeof reviewCaps;
        readonly agentPolicies: typeof agentPolicies;
        readonly agentGrants: typeof agentGrants;
        readonly modelLadder: typeof modelLadder;
    };
    readonly plugins: {
        readonly capabilityFile: typeof pluginCapabilityFile;
    };
    readonly config: {
        readonly parse: typeof configParse;
    };
}
export declare function createEngine(): EngineRegistry;
export interface Clock {
    now(): Date;
}
export interface Runtime {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly clock: Clock;
}
export interface AppOptions {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly clock?: Clock;
}
export interface App {
    readonly version: string;
    readonly runtime: Runtime;
}
export declare const VERSION: string;
export declare function createApp(options?: AppOptions): App;
