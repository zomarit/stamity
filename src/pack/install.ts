import { createHash } from "node:crypto";
import { lstat, readFile, rm, rmdir } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import pLimit from "p-limit";
import { applyCommandPrefix, slugOf, typeIdKey } from "../content/catalog.ts";
import { parseFrontmatter } from "../content/frontmatter.ts";
import { CONTENT_CLASSES, type ContentClass } from "../types/content.ts";
import { estimateTokens } from "../guard/tokenEstimate.ts";
import { readHookDefinitions } from "../hooks/userHooks.ts";
import type { ReclaimCandidate } from "../manifest/ledger.ts";
import { readManifest } from "../manifest/manifest.ts";
import { safeWriteFile } from "../merge/safeWrite.ts";
import { grantableFootprint, resolveAgentGrant } from "../roster/agentGrants.ts";
import type { GrantableToolCategory } from "../roster/agentPolicies.ts";
import { EngineError } from "../types/errors.ts";
import {
  packOwner,
  type LedgerEntry,
  type PackOwner,
  type SetupManifest,
} from "../types/manifest.ts";
import { CONTENT_PREFIX } from "../types/markers.ts";
import {
  checkDeclaredTools,
  checkFootprint,
  checkLifecycleScripts,
  checkMcpServerDefinitions,
  checkRuleActivation,
  enumeratePackContent,
  packNameMatchesSource,
  readPackManifest,
  resolvePackSource,
  scanPackBodies,
  verifyIntegrityMap,
  verifySigningDeclaration,
  type PackContentClass,
  type PackContentFile,
  type PackManifest,
  type PackSourceKind,
  type ResolvedPackSource,
} from "./manifest.ts";
import {
  evaluatePackSource,
  loadOrgPolicy,
  ORG_POLICY_REL_PATH,
  type OrgPolicyDecision,
} from "./orgPolicy.ts";
import { checkAgentCapabilities, checkPermissions } from "./permissions.ts";
import {
  buildReceipt,
  packDirRelPath,
  receiptRelPath,
  serializeReceipt,
  RECEIPT_FILE,
} from "./receipt.ts";
import {
  armedSigstoreVerifier,
  resolveTrustTier,
  settleSignatureClause,
  verifyPublisherSignedClaim,
  type CatalogPin,
  type PublisherSignedOutcome,
  type SigstoreVerifier,
  type TrustTier,
} from "./trust.ts";

/**
 * Pack install: the write half over the trust gates in `./manifest.ts`.
 *
 * Two stages, split so a preview and the run it previews are the same
 * computation. {@link planPackInstall} runs every gate and derives the write
 * set without touching the working tree; {@link applyPackInstall} is the only
 * stage that writes. A plan is plain data, so a dry-run surface prints exactly
 * what an apply would do.
 *
 * Content installs under `.stamity/packs/<pack>/…` — one flat directory per
 * pack, mirroring the pack's own class layout — and every written path is
 * recorded in the manifest's ownership ledger. That is the whole of the
 * uninstall story: {@link planPackRemoval} turns a pack's ledger rows back into
 * reclaim candidates for the sweep, so no per-pack bookkeeping file exists to
 * drift out of sync with the filesystem. The one file the apply adds beyond
 * the write set — the install receipt (`./receipt.ts`) — rides the same
 * ledger, so uninstall reclaims it with everything else.
 *
 * Every content class rides that one path, `mcp_servers` included: the write
 * set is derived from the enumeration, so a class admitted at ingress
 * (`./manifest.ts` → `PACK_CONTENT_CLASSES`) is recorded, receipted, hashed and
 * reclaimed by the same code as the five beside it, with no per-class branch to
 * forget. A server definition is a JSON payload the MCP substrate reads, never a
 * body to render, and nothing here treats a content file as prose — the classes
 * differ in what reads them back, not in how they are installed.
 *
 * **Ownership attribution.** A pack owns its rows outright: `adapter` is
 * `pack:<pack id>` (`packOwner`), which no tool id can equal, so the two ledger
 * functions that rebuild and reclaim adapter output leave pack rows alone
 * (`../manifest/ledger.ts`). `artifactType` is `"infra"` — pack files are
 * engine-installed, not engine-generated, content — and `artifactId` namespaces
 * the pack's own path (`<pack>/<pack-relative path>`) so a row reads without
 * the manifest around it.
 *
 * **The uninstall contract with the sweep.** A pack file keeps the pack's
 * basename and its own bytes: no engine-minted name, no managed block. What
 * proves engine authorship to the reclaim sweep is the row's `contentHash`
 * against the bytes at a path inside `.stamity/` (`../merge/reclaim.ts` gate 2c).
 * The invariant that makes that work is enforced at write time below: the bytes
 * this module lands are exactly the bytes it hashes into the row. Break it and
 * uninstall silently stops deleting.
 *
 * Failure vocabulary: a refused install (a collision, a path another owner
 * claims) comes back as `installed: false` with reasons in `errors`, because
 * the caller asked a question the plan already answered. A pack that changed
 * on disk between plan and apply throws `INTEGRITY_ERROR` after rolling the
 * partial write back — that one is not a decision, it is a broken assumption.
 */

/*
 * Writes run one file at a time on purpose: rollback replays exactly the
 * prefix that landed, in reverse, and the directory prune walks a parent chain
 * whose next step depends on the previous removal. `Promise.all()` is wrong at
 * every write loop in this module.
 */
/* oxlint-disable no-await-in-loop */

/** Concurrent pack-body reads for the token estimate, bounded like the gates'. */
const READ_CONCURRENCY = 8;

// ── Plan / apply shapes ────────────────────────────────────────

export interface PackWriteSetEntry {
  /** Pack-relative POSIX path of the source file (e.g. `agents/reviewer.md`). */
  relPath: string;
  /** Repo-relative POSIX path it installs to, inside the pack's own directory. */
  targetPath: string;
  contentClass: PackContentClass;
  /** SHA-256 of the source bytes, taken from the integrity map the gates verified. */
  contentHash: string;
  /** Size on disk, from the same enumeration the footprint gate measured. */
  sizeBytes: number;
}

/**
 * One pack agent's grant, as a row of {@link PackInstallPlan.agentGrants}.
 *
 * The categories here are the grant the agent will ACTUALLY hold once
 * installed: the intersection `../roster/agentGrants.ts` computes between the
 * agent's own `capabilities:` and the pack's declared footprint, which is the
 * same computation the emitted policy document runs. Recording the pack's raw
 * declaration instead would overstate what a row confers, and recording
 * nothing would leave the plan silent about privilege it is about to install.
 *
 * NO CLI SURFACE RENDERS THESE ROWS. `../cli/commands/add.ts` prints the
 * pack's DECLARED `permissions.toolFootprint` (`renderScope`) and its
 * `AddPayload` omits the field, so tests are the only readers today. That is
 * a missing disclosure, not a privilege leak: the footprint that IS printed
 * bounds every grant this pack can confer, and a row the shipped roster
 * answers is the setup's own standing policy, which a pack file cannot widen.
 */
export interface PackAgentGrant {
  /** Pack-relative POSIX path of the agent file the grant was read from. */
  relPath: string;
  /** Runtime (prefixed) agent id — the id both enforcement points match on. */
  runtimeId: string;
  /** Categories the agent will hold, in canonical order. Empty means nothing. */
  allow: readonly GrantableToolCategory[];
  /** One line in operator-readable prose: the grant, and why it is that size. */
  rationale: string;
}

export interface PackInstallPlan {
  /** The pack's own validated `pack.json` — not the project manifest. */
  manifest: PackManifest;
  source: ResolvedPackSource;
  /** The operator's original source spec, recorded for receipt provenance. */
  spec: string;
  /** Every file the install would write, in enumeration order. */
  writeSet: PackWriteSetEntry[];
  /**
   * Per-agent grants this install would confer, one row per `agents/*.md` file
   * in write-set order. Empty for a pack that ships no agent class.
   *
   * Optional so the field stays ADDITIVE to the pre-grant plan shape — the
   * same compatibility rule the policy-document row extension follows — and
   * plan literals from before the grants lane (receipt-builder fixtures)
   * remain valid. {@link planPackInstall} always populates it.
   */
  agentGrants?: PackAgentGrant[];
  /** Reasons this install may not proceed; a non-empty list refuses the apply. */
  collisions: string[];
  /** Gate name -> outcome, in run order. `"n/a"` marks a waived or absent gate. */
  checks: Record<string, "pass" | "n/a">;
  /** Resolved trust tier (`./trust.ts` ladder). */
  trustTier: TrustTier;
  /**
   * Human-readable basis for the tier (catalog pin / signature / waiver), as
   * every operator-facing surface states it: the `add` trust row, the `--json`
   * payload, and the persisted install receipt all read this one string.
   *
   * For a pack whose declared signature VERIFIED, it names the identity and the
   * issuer the certificate was pinned on rather than the pending-claim clause
   * the ladder composes before the gate runs (`./trust.ts` →
   * `settleSignatureClause`). That substitution is the point: the tier says
   * `publisher-signed`, and an operator installing on that word needs the
   * answer to "signed by whom" at install time, not a sentence saying the
   * signature has yet to be checked.
   */
  tierBasis: string;
  /** Org policy outcome; always `allow` on a returned plan — a deny throws. */
  policy: OrgPolicyDecision;
  /** Estimated context tokens per installed file, keyed by target path. */
  tokensByPath: Record<string, number>;
  /** Sum of {@link tokensByPath} — the pack's context cost. */
  totalTokens: number;
}

export interface PackApplyResult {
  installed: boolean;
  /** Repo-relative paths this install materialized, 1:1 with {@link ledgerEntries}. */
  written: string[];
  /** Ownership rows for the written paths, ready to persist with the manifest. */
  ledgerEntries: LedgerEntry[];
  /** Why the install was refused; empty on success. */
  errors: string[];
  /** Repo-relative path of the written install receipt; `null` when refused. */
  receiptPath: string | null;
}

/** Options accepted by {@link planPackInstall}. */
export interface PlanPackInstallOptions {
  /** Operator waiver for a pack with no trust basis at all (tier pinned-unsigned). */
  allowUntrusted?: boolean;
  /** Catalog pin for the spec, when the source came out of a curated catalog. */
  catalogPin?: CatalogPin;
  /**
   * Signature verifier seam. Defaults to `./trust.ts` →
   * `armedSigstoreVerifier`, the official Sigstore client — unconditionally,
   * with no environment sniff and no fallback: a build that cannot load the
   * client REFUSES a declared claim rather than downgrading to a verdict a
   * catalog pin could waive.
   */
  sigstoreVerifier?: SigstoreVerifier;
}

// ── Identity ───────────────────────────────────────────────────

/**
 * The repo-relative POSIX directory a pack's content installs into, and the
 * prefix every one of its ledger rows sits under. Delegates to
 * `./receipt.ts::packDirRelPath`, the single home of the id -> directory
 * mapping (scoped ids flatten to one segment; malformed ids are refused, not
 * sanitized) — kept as this module's export because the install/uninstall
 * surfaces read it from here.
 */
export function packLedgerRelPath(packId: string): string {
  return packDirRelPath(packId);
}

/** Ledger artifact id for one pack file: the pack id namespaces its own content. */
function packArtifactId(packId: string, relPath: string): string {
  return `${packId}/${relPath}`;
}

/** Pack class directory -> the content class the catalog registers it under. */
const CLASS_OF_PACK_DIR: Readonly<Record<string, ContentClass>> = {
  agents: "agent",
  skills: "skill",
  rules: "rule",
  commands: "command",
};

/** The one file extension the content walk reads as an artifact. */
const ARTIFACT_EXTENSION = ".md";

/** The readable file inside a skill directory (`../content/catalog.ts` → `SKILL_FILE`). */
const SKILL_FILE = "SKILL.md";

/**
 * The type-qualified catalog identity a pack file would introduce, or `null`
 * when the file is not an artifact at all.
 *
 * Derived by the CATALOG's rule, not a rule of its own — `../content/catalog.ts`
 * → {@link slugOf} for the filename half, the declared frontmatter `id:`
 * winning over it, and {@link applyCommandPrefix} for commands — because the
 * two vocabularies not intersecting is precisely why the collision gate below
 * could never fire. The predecessor took the basename stem:
 * every corpus id is bare (`reviewer`) while every shipped pack file is
 * prefixed (`stamity-reviewer.md`), so the two sets were disjoint by
 * construction, and every pack SKILL reduced to the literal string `SKILL`
 * because a skill's readable file is always `SKILL.md`.
 *
 * `declaredId` is the file's own frontmatter `id:` when it has one. It is
 * passed in rather than read here so the gate does one bounded read pass over
 * the pack ({@link readPackArtifacts}) instead of one per question asked.
 */
function catalogIdOf(relPath: string, declaredId?: string): string | null {
  const segments = relPath.split("/");
  const type = CLASS_OF_PACK_DIR[segments[0] ?? ""];
  if (type === undefined) return null;

  const declared = declaredId?.trim();
  let slug: string;
  if (type === "skill") {
    // Only `skills/<dir>/SKILL.md` is an artifact; a support file under it is not.
    if (segments.length !== 3 || segments[2] !== SKILL_FILE) return null;
    slug = slugOf(segments[1] as string);
  } else {
    if (segments.length !== 2) return null;
    const name = segments[1] as string;
    if (extname(name).toLowerCase() !== ARTIFACT_EXTENSION) return null;
    slug = slugOf(name.slice(0, -ARTIFACT_EXTENSION.length));
  }

  const bareId = declared === undefined || declared === "" ? slug : declared;
  return typeIdKey(type, applyCommandPrefix(bareId, type));
}

/**
 * True when `entry` is one of this pack's rows. Identity is the row's owner and
 * nothing else — deliberately not "sits under the pack's directory", so a row
 * pointing into the pack's tree under some other owner reads as the collision
 * it is and gets refused instead of silently replaced.
 */
function isOwnedByPack(entry: LedgerEntry, owner: PackOwner): boolean {
  return entry.adapter === owner;
}

/** Fresh ledger row carrying exactly the schema's fields, absent optionals omitted. */
function cloneEntry(entry: LedgerEntry): LedgerEntry {
  return {
    path: entry.path,
    adapter: entry.adapter,
    artifactId: entry.artifactId,
    artifactType: entry.artifactType,
    ...(entry.contentHash !== undefined ? { contentHash: entry.contentHash } : {}),
    ...(entry.stampedVersion !== undefined ? { stampedVersion: entry.stampedVersion } : {}),
  };
}

// ── Filesystem helpers ─────────────────────────────────────────

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Absolute path for a repo-relative POSIX path. */
function underRoot(rootDir: string, relPath: string): string {
  return join(rootDir, ...relPath.split("/"));
}

/** True when anything exists at `path`, a dangling symlink included. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw new EngineError(`Cannot stat ${path}: ${describeError(cause)}.`, {
      code: "FS_ERROR",
      cause,
    });
  }
}

/** File content, or `null` when it does not exist. Other errnos propagate. */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    return null;
  }
}

// ── Plan ───────────────────────────────────────────────────────

/** The digest the verified integrity map holds for `relPath`. */
function verifiedDigest(manifest: PackManifest, relPath: string): string {
  const digest = manifest.integrity[relPath];
  if (digest === undefined) {
    // Unreachable through verifyIntegrityMap, which refuses any content file
    // missing from the map; kept so the invariant is enforced where it is used.
    throw new EngineError(
      `Pack "${manifest.name}" enumerates ${relPath} but its integrity map does not list it.`,
      { code: "INTEGRITY_ERROR" },
    );
  }
  return digest;
}

/**
 * The identity the org policy judges, and the refusal that keeps it honest.
 *
 * The policy answers a question about the SOURCE — may this place supply packs
 * to this repo — so it must be evaluated on the name the source resolved
 * through, not on the name the pack gives itself. Keyed on `pack.json`'s
 * `name`, an allowlist of `@acme/*` denied an honest `@acme/ops` whose manifest
 * spelled its name differently, and the identity a rule was written against
 * was one the pack controlled.
 *
 * A directory spec supplies no name at all, so a local pack is still judged by
 * its declared name — there is nothing else — and the `local-path` kind token
 * is what a policy uses to reach it as a class.
 *
 * For an npm package the two names must AGREE, and a disagreement refuses.
 * Otherwise the identity fix would only move the problem: a pack resolved from
 * `@acme/ops` that declares itself `@evil/thing` would be policy-checked as
 * `@acme/ops` and then installed, ledgered and receipted under `@evil/thing`,
 * so every later surface — the ledger owner, `clean --pack`, the receipt —
 * would name a pack the policy never saw. The flattened directory spelling is
 * the one accepted variation ({@link packNameMatchesSource}).
 */
function resolveSourceIdentity(
  packManifest: PackManifest,
  source: ResolvedPackSource,
): string {
  const sourceName = source.sourceName;
  if (sourceName === undefined) return packManifest.name;
  if (!packNameMatchesSource(packManifest.name, sourceName)) {
    throw new EngineError(
      `Pack package "${sourceName}" declares itself ${JSON.stringify(packManifest.name)} in its ` +
        `${"pack.json"}. The org trust policy and every ownership record downstream key on one ` +
        `identity, so a package that installs under a different name than the one it was ` +
        `resolved from is refused rather than reconciled. Re-obtain the pack from a source ` +
        `whose package name matches its manifest.`,
      { code: "INTEGRITY_ERROR" },
    );
  }
  return sourceName;
}

/**
 * The kind the org policy judges this install as.
 *
 * A catalog install resolves to a directory inside the engine package, so the
 * resolver honestly reports `local-path` — and that conflated the SHA-pinned
 * curated catalog with any directory on the machine. The pin is what
 * distinguishes them, and the pin is verified one layer up, so the promotion
 * happens here.
 *
 * The trigger is the resolved TIER, not the presence of a pin argument, because
 * only a verified catalog pin can produce a catalog-granted rung: `./trust.ts`
 * refuses a pin whose aggregate content SHA disagrees, and the two rungs below
 * (`publisher-signed`, `pinned-unsigned`) are not catalog-issued. So the
 * promotion happens exactly when a catalog vouched for these exact bytes, and
 * never on a claim.
 */
function policySourceKind(source: ResolvedPackSource, tier: TrustTier): PackSourceKind {
  if (tier === "curator-verified" || tier === "scanned") return "catalog-pinned";
  return source.kind;
}

/**
 * Org trust-policy gate: the policy decides whether this SOURCE may supply
 * packs at all. A malformed policy has already thrown `CONFIG_ERROR` in the
 * loader — fail-closed, never "ignore the policy and proceed" — and a deny
 * names the rule so the operator can find it in the policy file rather than
 * argue with the refusal.
 */
function applyOrgPolicy(
  identity: string,
  sourceKind: PackSourceKind,
  policy: Awaited<ReturnType<typeof loadOrgPolicy>>,
): OrgPolicyDecision {
  const decision = evaluatePackSource(policy, identity, sourceKind);
  if (decision.decision === "deny") {
    const rule =
      decision.matchedRule === undefined ? "" : ` (matched rule: ${JSON.stringify(decision.matchedRule)})`;
    throw new EngineError(
      `Pack "${identity}" is denied by the org trust policy${rule}. ` +
        `The policy at ${ORG_POLICY_REL_PATH} decides which pack sources this repo accepts; ` +
        `installing it requires a policy change, not a flag.`,
      { code: "INTEGRITY_ERROR" },
    );
  }
  return decision;
}

/**
 * Tier-aware signing gate. Returns the gate row AND, for a verified claim, the
 * verifier's own account of what it proved — see
 * {@link PackInstallPlan.tierBasis} for where that lands.
 *
 * A declared signature is checked, never waived: the claim routes through
 * `./trust.ts::verifyPublisherSignedClaim` (bundle read + injected verifier
 * against the aggregate content SHA), and a claim the verifier CHECKED and
 * refused stops the pack even under `allowUntrusted` — a waiver is for the
 * ABSENCE of a trust basis, not for a failed check.
 *
 * The pin is handed to that call rather than consulted after it, and that
 * ordering is the fix. While no armed verifier shipped, every declared claim
 * came back unverifiable and refused the install — which ran BEFORE the catalog
 * pin's tier was honoured and made a pack that declares signing strictly worse
 * off than the same pack declaring nothing. A verified pin at a catalog-granted
 * tier satisfies trust for an UNEVALUABLE claim (and for nothing else); a claim
 * that was evaluated and failed still refuses. The default verifier is armed
 * now, so the unevaluable case reaches here only through an injected verifier
 * that reports it — the ordering stays because the rule does.
 *
 * Without a declaration, a pin whose tier already carries trust (`scanned` /
 * `curator-verified`) is the trust basis; only a pack with neither — tier
 * `pinned-unsigned` — falls through to the original declaration gate and its
 * explicit operator waiver.
 *
 * This gate runs BEFORE `enumeratePackContent`, deliberately: a pack whose
 * signature does not hold is refused before a byte of its content is walked.
 * The declared bundle is the one pack file that read touches outside the walk,
 * so it does not inherit the walk's symlink refusal or its footprint bound —
 * `./trust.ts` → `readSigstoreBundle` applies both to the bundle itself, which
 * is why the ordering is a fail-closed choice rather than a containment gap.
 */
async function runSigningGate(
  packRoot: string,
  manifest: PackManifest,
  tier: TrustTier,
  opts: PlanPackInstallOptions,
): Promise<PublisherSignedOutcome> {
  if (manifest.signing !== undefined) {
    return await verifyPublisherSignedClaim(
      manifest,
      packRoot,
      opts.sigstoreVerifier ?? armedSigstoreVerifier,
      // Only a pin the ladder already VERIFIED reaches here as a granted tier
      // (`./trust.ts` → `resolveTrustTier` refuses a mismatch outright), so
      // passing it is passing verified evidence, not a claim.
      opts.catalogPin === undefined ? {} : { catalogPinTier: tier },
    );
  }
  if (tier === "scanned" || tier === "curator-verified") {
    // The catalog pin is the trust basis; there is no declaration to verify.
    return { outcome: "n/a" };
  }
  // No declaration to verify, so no identity to report: the waiver path yields
  // the gate row alone, and the tier basis stays the one the ladder resolved.
  return { outcome: verifySigningDeclaration(manifest, opts.allowUntrusted === true) };
}

/**
 * Estimated context tokens per content file, keyed by pack-relative path.
 * Bounded reads; the estimate is the shared character heuristic
 * (`../guard/tokenEstimate.ts`), so the number the plan reports is the number
 * every other engine surface would compute for the same bytes.
 */
async function estimateContentTokens(
  files: readonly PackContentFile[],
): Promise<Map<string, number>> {
  const estimates = await pLimit(READ_CONCURRENCY).map(files, async (file) => {
    try {
      return [file.relPath, estimateTokens(await readFile(file.absPath, "utf8"))] as const;
    } catch (cause) {
      throw new EngineError(`Cannot read pack file ${file.absPath}: ${describeError(cause)}.`, {
        code: "FS_ERROR",
        cause,
      });
    }
  });
  return new Map(estimates);
}

// ── Agent grants ───────────────────────────────────────────────

/** The class directory whose files carry a grant; `capabilities:` elsewhere grants nothing. */
const AGENT_CLASS: PackContentClass = "agents";

/** One pack artifact file, read once and used by every question the plan asks of it. */
interface PackArtifactFile {
  readonly relPath: string;
  readonly contentClass: PackContentClass;
  /** Type-qualified catalog identity, or `null` when the file is not an artifact. */
  readonly catalogKey: string | null;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** One pack agent file, as both the capability gate and the grant rows take it. */
interface PackAgentFile {
  readonly relPath: string;
  readonly runtimeId: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/**
 * The runtime (prefixed) id a pack agent is enforced under.
 *
 * Corpus frontmatter ids are bare and the catalog strips the filename prefix
 * before registering an artifact (`../content/catalog.ts` → `slugOf`), so the
 * runtime namespace the guard governs is always the prefixed form.
 *
 * Derived from the CATALOG id — declared `id:` winning over the filename slug
 * — which is the id both enforcement points key on: the emitted agent file
 * (`../adapters/claude.ts` → `emittedId`) and the policy row the guard matches
 * (`./projection.ts` → `runtimeAgentId(item.id)`). Reading the filename stem
 * instead made the two lanes disagree for any pack whose filename and declared
 * id differ: `agents/stamity-reviewer.md` under `id: acme-probe` PLANNED as
 * `stamity-reviewer` — an id the shipped roster answers with `read` alone — and
 * EMITTED as `stamity-acme-probe`, granted the intersection of its own
 * `capabilities:` with the pack footprint. The preview and the grant differed
 * by up to three categories, and the plan's rationale string said the opposite
 * of what would happen.
 */
function runtimeAgentId(catalogKey: string): string {
  const bare = catalogKey.slice(catalogKey.indexOf(":") + 1);
  return bare.startsWith(CONTENT_PREFIX) ? bare : `${CONTENT_PREFIX}${bare}`;
}

/**
 * Parse the frontmatter of every artifact-shaped file in the pack, bounded like
 * the other gates' reads. A malformed block throws `VALIDATION_ERROR` naming
 * the file — the same refusal a corpus artifact would earn, and the right one
 * here: a file whose head cannot be read is a file whose identity and grant
 * cannot be judged, and installing it would be installing an unreviewed
 * privilege under an unknown name.
 *
 * One pass covers both questions the plan asks of a body — which catalog id it
 * would claim, and which capabilities it declares — because both answers come
 * from the same head and reading it twice is how the two derivations drift.
 */
async function readPackArtifacts(
  files: readonly PackContentFile[],
): Promise<PackArtifactFile[]> {
  const artifacts = files.filter(
    (file) => CLASS_OF_PACK_DIR[file.contentClass] !== undefined && file.relPath.endsWith(ARTIFACT_EXTENSION),
  );
  return pLimit(READ_CONCURRENCY).map(artifacts, async (file) => {
    let raw: string;
    try {
      raw = await readFile(file.absPath, "utf8");
    } catch (cause) {
      throw new EngineError(`Cannot read pack file ${file.absPath}: ${describeError(cause)}.`, {
        code: "FS_ERROR",
        cause,
      });
    }
    const parsed = parseFrontmatter(raw, file.relPath);
    // No frontmatter block is not an artifact, exactly as the content walk
    // reads it: a README under a class directory claims no id.
    const declared = parsed.hadFrontmatter ? parsed.frontmatter["id"] : undefined;
    return {
      relPath: file.relPath,
      contentClass: file.contentClass,
      catalogKey: parsed.hadFrontmatter
        ? catalogIdOf(file.relPath, typeof declared === "string" ? declared : undefined)
        : null,
      frontmatter: parsed.frontmatter,
    };
  });
}

/** The agent-class subset, carrying the runtime id both enforcement points use. */
function packAgentsOf(artifacts: readonly PackArtifactFile[]): PackAgentFile[] {
  return artifacts
    .filter((file) => file.contentClass === AGENT_CLASS && file.catalogKey !== null)
    .map((file) => ({
      relPath: file.relPath,
      runtimeId: runtimeAgentId(file.catalogKey as string),
      frontmatter: file.frontmatter,
    }));
}

/**
 * The pack's declared footprint, narrowed to the categories a grant can name.
 *
 * The narrowing itself lives in `../roster/agentGrants.ts` beside the resolver
 * it bounds, so the plan rows below, the receipt that persists the footprint and
 * the emission surfaces that read it back cannot disagree about what a
 * disclosure means. This wrapper is the manifest-shaped call.
 */
function declaredFootprint(manifest: PackManifest): GrantableToolCategory[] {
  return grantableFootprint(manifest.permissions?.toolFootprint);
}

/**
 * The grant each pack agent will hold once installed, as plan rows.
 *
 * Runs AFTER {@link checkAgentCapabilities} has passed, so nothing here is a
 * gate: an agent asking for more than its pack disclosed has already refused
 * the install, and what is left to do is record what the install confers.
 * The resolver is the same one the policy-document planner calls on the same
 * inputs (`../emit/hooksInfra.ts`), and the emission composer does hand it the
 * installed-pack agents (`../emit/planner.ts` → `packAgents`, declarations
 * built by `../pack/projection.ts` through the same `grantableFootprint`
 * narrowing {@link declaredFootprint} applies here). So for an agent whose
 * filename stem and declared `id:` agree, the GRANT a row here carries is the
 * one the production-emitted document confers, by construction rather than by
 * two implementations happening to match.
 *
 * Two limits on that agreement are deliberate:
 *
 * - **Rows are not one-per-line.** This returns a row per pack agent; the
 *   document skips a row for an agent whose id the shipped roster already
 *   answers and for one that resolves to no categories
 *   (`../emit/hooksInfra.ts` → `composePackPolicyRows`). The effective grant
 *   still matches in both cases — the roster row already carries the first,
 *   and an absent row denies exactly like an empty one — so a skipped row is
 *   never privilege beyond what these rows state.
 * - **The document is not rewritten by this install.** This reads the pack
 *   about to be installed; the document is rebuilt by an emission run reading
 *   installed packs from disk. The row an accepted plan implies therefore
 *   appears at the next emission, not during the install itself.
 *
 * The third divergence is CLOSED. Both lanes now derive the runtime id from
 * the catalog id — declared `id:` winning over the filename slug
 * ({@link runtimeAgentId}, mirroring `./projection.ts` →
 * `runtimeAgentId(item.id)`) — so a pack shipping `agents/stamity-reviewer.md`
 * under `id: acme-probe` plans and emits as `stamity-acme-probe`, with the same
 * allow set on both sides. Reading the filename stem here was how the preview
 * and the grant came apart by up to three categories while the rationale
 * string asserted the opposite.
 */
function describeAgentGrants(
  agents: readonly PackAgentFile[],
  manifest: PackManifest,
): PackAgentGrant[] {
  const declaredTools = declaredFootprint(manifest);
  return agents.map((agent) => {
    const grant = resolveAgentGrant({
      runtimeId: agent.runtimeId,
      frontmatter: agent.frontmatter,
      declaredTools,
    });
    const held = grant.allow.length > 0 ? grant.allow.join(", ") : "nothing";
    const basis =
      grant.source === "roster"
        ? `this setup's own agent policy answers the id, so the pack's file cannot widen or narrow it`
        : `bounded by the pack's declared tool footprint (${declaredTools.length > 0 ? declaredTools.join(", ") : "the pack declares none"})`;
    return {
      relPath: agent.relPath,
      runtimeId: agent.runtimeId,
      allow: grant.allow,
      rationale: `may use ${held} — ${basis}.`,
    };
  });
}

/**
 * Every reason this install may not proceed, in write-set order:
 *
 * - the target path is already claimed in the ledger by another owner;
 * - the content id the file would introduce is already owned by another row,
 *   so installing it would shadow an artifact the project already has;
 * - something exists at the target that no ledger row of this pack owns —
 *   a stray file the apply would otherwise overwrite.
 *
 * A prior install of the SAME pack is none of these: its rows own the paths,
 * which is what makes an upgrade an overwrite rather than a refusal.
 */
async function collectCollisions(
  rootDir: string,
  packId: string,
  writeSet: readonly PackWriteSetEntry[],
  ledger: readonly LedgerEntry[],
  artifacts: readonly PackArtifactFile[],
): Promise<string[]> {
  const owner = packOwner(packId);
  const foreign = ledger.filter((entry) => !isOwnedByPack(entry, owner));
  const claimedPaths = new Map(foreign.map((entry) => [entry.path, entry]));
  const claimedIds = claimedCatalogIds(foreign);
  const plannedIds = new Map(
    artifacts
      .filter((artifact) => artifact.catalogKey !== null)
      .map((artifact) => [artifact.relPath, artifact.catalogKey as string]),
  );
  const ownedPaths = new Set(
    ledger.filter((entry) => isOwnedByPack(entry, owner)).map((entry) => entry.path),
  );

  const strays = await Promise.all(
    writeSet.map(async (entry) =>
      ownedPaths.has(entry.targetPath)
        ? false
        : await pathExists(underRoot(rootDir, entry.targetPath)),
    ),
  );

  const collisions = new Set<string>();
  for (const [index, entry] of writeSet.entries()) {
    const pathOwner = claimedPaths.get(entry.targetPath);
    if (pathOwner !== undefined) {
      collisions.add(
        `${entry.targetPath}: the ledger already assigns this path to ${pathOwner.artifactId}`,
      );
    }
    const catalogKey = plannedIds.get(entry.relPath);
    const idOwner = catalogKey === undefined ? undefined : claimedIds.get(catalogKey);
    if (catalogKey !== undefined && idOwner !== undefined) {
      const [type = "", id = ""] = splitKey(catalogKey);
      collisions.add(
        `${entry.relPath}: ${type} id "${id}" is already owned by ${idOwner.artifactId} at ` +
          `${idOwner.path}; installing it would shadow content this repo already has`,
      );
    }
    if (strays[index] === true) {
      collisions.add(
        `${entry.targetPath}: a file already exists there that pack "${packId}" does not own`,
      );
    }
  }
  return [...collisions];
}

/** A `type:id` key split back into its two halves. */
function splitKey(key: string): [string, string] {
  const colon = key.indexOf(":");
  return [key.slice(0, colon), key.slice(colon + 1)];
}

/**
 * Every catalog identity the ledger's foreign rows already claim, keyed the way
 * {@link catalogIdOf} keys a pack file's.
 *
 * Two row shapes contribute, and they carry the id differently:
 *
 * - **Adapter-emitted content.** `artifactType` IS the content class and
 *   `artifactId` IS the bare catalog id (`{ artifactId: "reviewer",
 *   artifactType: "agent" }`), so the key is a direct join. These are the rows
 *   the predecessor could never match: it compared them against a PREFIXED
 *   filename stem, and no corpus row is spelled that way.
 * - **Another installed pack's content.** Those rows are `artifactType:
 *   "infra"` with `artifactId: "<pack id>/<pack-relative path>"`, so the id is
 *   re-derived from the path. The declared `id:` inside that pack's file is not
 *   read — it is another pack's bytes, and reading them to answer this question
 *   would put an unbounded read behind every install. The filename slug is what
 *   the vast majority of packs declare anyway, and the content walk refuses the
 *   remainder on contact (`../content/catalog.ts`), so the residue is a
 *   refusal one step later rather than a silent shadow.
 */
function claimedCatalogIds(foreign: readonly LedgerEntry[]): Map<string, LedgerEntry> {
  const claimed = new Map<string, LedgerEntry>();
  for (const entry of foreign) {
    if ((CONTENT_CLASSES as readonly string[]).includes(entry.artifactType)) {
      claimed.set(typeIdKey(entry.artifactType as ContentClass, entry.artifactId), entry);
      continue;
    }
    const slash = entry.artifactId.indexOf("/");
    if (slash === -1) continue;
    const key = catalogIdOf(entry.artifactId.slice(slash + 1));
    if (key !== null) claimed.set(key, entry);
  }
  return claimed;
}

// ── Hook ingress ───────────────────────────────────────────────

/** The class directory whose files are hook definitions. */
const HOOK_CLASS_PREFIX = "hooks/";

/**
 * `hooks/<file>` — the pack-relative name, restated from the reader's
 * repo-relative one.
 *
 * {@link readHookDefinitions} reports `file` relative to the REPO root
 * (`../hooks/userHooks.ts` → `repoRelative`), which is the right anchor at
 * emission, when the pack already sits under `.stamity/packs/…`. At ingress the
 * pack is still at its source path — a staged directory or a `node_modules`
 * entry — so the same file would be named `../../tmp/staged/hooks/hooks.json`
 * in a refusal and `hooks/hooks.json` in the write set, the receipt and every
 * `mcpServers` refusal beside it. The reader lists ONE directory
 * non-recursively and skips anything that is not a file, so the last segment is
 * the whole of the name.
 */
function packRelHookPath(reported: string): string {
  const segments = reported.split("/");
  return `${HOOK_CLASS_PREFIX}${segments[segments.length - 1] as string}`;
}

/**
 * Ingress gate over a pack's hook definitions — the second execution-bearing
 * class, held to the gate its sibling already had.
 *
 * The two classes were gated asymmetrically. `mcp_servers/*.json` moved to
 * install ingress as the `mcpServers` gate (`./manifest.ts` →
 * {@link checkMcpServerDefinitions}); `hooks/*.json` did not follow, so
 * a pack hook carrying an inline-code launcher installed at exit 0 with an
 * all-pass gate table and a receipt, and was dropped — silently, from the
 * operator's seat — only when `sync` read it at emission. Both classes name a
 * command the operator's client RUNS as the operator, so both clear the same
 * bar at the same moment: while the operator is still deciding.
 *
 * Same reader as the emission lane, deliberately: `./projection.ts` →
 * `packHookDefinitions` calls this exact function, so the refusal vocabulary an
 * operator reads here is the one the wiring would have used, and the centre of
 * both is the fails-closed launcher allow-list (`../shared/launcherAllowlist.ts`
 * → `checkLauncherArgv`) — allowed launcher, no inline-code flag, exactly one
 * repo-contained script that exists.
 *
 * The two verdicts cannot disagree, which is what makes refusing safe rather
 * than merely earlier. The script a hook names is never pack-supplied: no pack
 * content class admits an executable extension (`./manifest.ts` →
 * `CLASS_CONTENT_EXTENSIONS`; the `hooks` class itself takes
 * `.json`/`.yaml`/`.yml` — "hook definitions, never scripts"), so the file the
 * allow-list probes is repo-committed at both moments and `rootDir` is the same
 * anchor at both. A hook naming a script the repo has not committed yet is
 * refused rather than installed-and-dropped; the operator commits the script
 * and re-runs, which is the fail-closed direction.
 *
 * `"n/a"` covers both shapes of "this gate read nothing": a pack with no
 * `hooks/` class, and one whose `hooks/` class holds only the `.yaml`/`.yml`
 * forms the reader does not parse. Reporting `pass` for either is exactly the
 * over-claim the `mcpServers` gate's own `"n/a"` exists to avoid — a row
 * asserting coverage the install never had.
 */
async function checkHookDefinitions(
  manifest: PackManifest,
  files: readonly PackContentFile[],
  packRoot: string,
  rootDir: string,
): Promise<"pass" | "n/a"> {
  const declared = files.filter((file) => file.relPath.startsWith(HOOK_CLASS_PREFIX));
  if (declared.length === 0) return "n/a";

  const { hooks, errors } = await readHookDefinitions(join(packRoot, "hooks"), rootDir);
  if (errors.length > 0) {
    const list = errors
      .map((error) => `  - ${packRelHookPath(error.file)} [${error.code}] ${error.message}`)
      .join("\n");
    throw new EngineError(
      `Pack "${manifest.name}" declares hook command(s) this repo will not run:\n${list}\n` +
        `An accepted hook lands in your client's own settings file and runs on every matching ` +
        `tool call, as you — so a defective definition is refused while you are still deciding, ` +
        `rather than installed under an all-pass gate table and dropped at the next sync. Fix ` +
        `the definition, or commit the repo script it names, and re-run.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return hooks.length === 0 ? "n/a" : "pass";
}

/**
 * Run every trust gate, then derive the write set and its collisions. Writes
 * nothing — this is the whole of a dry run.
 *
 * The gate chain is ordered cheapest-refusal-first and any gate throwing aborts
 * planning: manifest -> trust tier -> org policy -> signing -> lifecycle
 * scripts -> integrity map -> body scan -> MCP server definitions -> hook
 * definitions -> footprint -> declared tools -> rule activation -> permissions
 * -> agent capabilities.
 * The policy FILE is loaded first of all, so a malformed one fail-closes the
 * whole install path before any per-pack verification spends a read; the tier
 * resolves before the policy is applied because it costs no read (it hashes
 * the manifest's own integrity map) and because a verified catalog pin is what
 * distinguishes a curated install from any other directory on the machine,
 * which is a distinction the policy grammar makes (`./orgPolicy.ts`). An
 * org-denied source is still refused before a single content byte is read.
 *
 * The trust tier itself (`./trust.ts`): a catalog pin is verified against the
 * aggregate content SHA (pinned-or-refuse), a declared signature is verified
 * through the injected verifier, and only a pack with no trust basis at all
 * still requires the `allowUntrusted` waiver.
 *
 * `mcpServers` and `hooks` run as a pair immediately after the body scan, and
 * neither is an optional extra: they are the two classes whose files name a
 * command something RUNS as the operator, so they are the two the chain reads
 * as code. A server definition becomes a launcher the operator's editor starts,
 * so it clears the curated catalog's own bar — exact pin against an exact
 * package name, no shell and no inline-code launcher, no literal credential, a
 * blast-radius statement — at ingress. A hook definition becomes an entry in
 * the client's own settings file that fires on every matching tool call, so it
 * clears the fails-closed launcher allow-list ({@link checkHookDefinitions}).
 * Each used to run only at emission, which meant a defective definition
 * installed with an all-pass gate table and then broke every later `sync` and
 * `check` (the MCP half) or was silently dropped from the wiring while
 * the install still reported clean (the hook half). Their adjacency is the
 * point: an operator reading the gate table sees one answer for the whole
 * execution surface, not one gated class beside one ungated one.
 *
 * The agent-capability gate runs LAST because it is the only one that needs a
 * body read per agent file, and because every cheaper refusal above it means
 * those reads never happen. It is the ingress half of pack-agent grants: an
 * agent declaring a capability outside its pack's disclosed footprint refuses
 * the pack by name here, before a byte lands, rather than being quietly narrowed
 * at emission to a grant wider than the footprint the pack declared. Its
 * passing result is what {@link PackInstallPlan.agentGrants} then records, one
 * row per agent — plan data no CLI surface renders yet ({@link PackAgentGrant}).
 *
 * The project manifest is read to establish ownership; a manifest that cannot
 * be read is a planning failure rather than a shrug, since installing without
 * it would write files nothing owns.
 */
export async function planPackInstall(
  projectRoot: string,
  spec: string,
  opts: PlanPackInstallOptions = {},
): Promise<PackInstallPlan> {
  const rootDir = resolve(projectRoot);
  const source = await resolvePackSource(rootDir, spec);
  const packManifest = await readPackManifest(source.packRoot);

  const checks: Record<string, "pass" | "n/a"> = { manifest: "pass" };

  // Loaded first, so a malformed policy fail-closes the whole path before any
  // per-pack verification runs. The tier resolves next and costs no read — it
  // hashes the manifest's own integrity map — which is what lets the policy be
  // evaluated on the source kind the pin decides.
  const orgPolicy = await loadOrgPolicy(rootDir);
  const { tier, basis } = resolveTrustTier(packManifest, opts.catalogPin);
  checks.trustTier = "pass";

  const identity = resolveSourceIdentity(packManifest, source);
  const policy = applyOrgPolicy(identity, policySourceKind(source, tier), orgPolicy);
  checks.orgPolicy = orgPolicy === null ? "n/a" : "pass";

  // The gate returns the VERDICT, not just its row: a verified publisher-signed
  // claim carries the identity and issuer the certificate was pinned on, which
  // is what `tierBasis` then states in place of the clause the ladder wrote
  // before any verification had run.
  const signature = await runSigningGate(source.packRoot, packManifest, tier, opts);
  checks.signing = signature.outcome;

  checks.lifecycleScripts = await checkLifecycleScripts(source.packRoot);
  const files = await enumeratePackContent(source.packRoot);
  checks.integrityMap = await verifyIntegrityMap(source.packRoot, packManifest, files);
  checks.bodyScan = await scanPackBodies(files);
  checks.mcpServers = await checkMcpServerDefinitions(packManifest, files);
  checks.hooks = await checkHookDefinitions(packManifest, files, source.packRoot, rootDir);
  checks.footprint = checkFootprint(packManifest, files);
  checks.declaredTools = await checkDeclaredTools(packManifest, files);
  checks.ruleActivation = await checkRuleActivation(packManifest, files);
  checks.permissions = checkPermissions(packManifest, files);
  const artifacts = await readPackArtifacts(files);
  const agents = packAgentsOf(artifacts);
  checks.agentCapabilities = checkAgentCapabilities(agents, packManifest.permissions);

  const packRelPath = packLedgerRelPath(packManifest.name);
  const writeSet: PackWriteSetEntry[] = files.map((file) => ({
    relPath: file.relPath,
    targetPath: `${packRelPath}/${file.relPath}`,
    contentClass: file.contentClass,
    contentHash: verifiedDigest(packManifest, file.relPath),
    sizeBytes: file.sizeBytes,
  }));

  const tokensByRelPath = await estimateContentTokens(files);
  const tokensByPath: Record<string, number> = {};
  let totalTokens = 0;
  for (const entry of writeSet) {
    const tokens = tokensByRelPath.get(entry.relPath) ?? 0;
    tokensByPath[entry.targetPath] = tokens;
    totalTokens += tokens;
  }

  const projectManifest = await readManifest(rootDir);
  const collisions = await collectCollisions(
    rootDir,
    packManifest.name,
    writeSet,
    projectManifest?.ledger ?? [],
    artifacts,
  );

  return {
    manifest: packManifest,
    source,
    spec,
    writeSet,
    agentGrants: describeAgentGrants(agents, packManifest),
    collisions,
    checks,
    trustTier: tier,
    tierBasis:
      signature.verifiedBasis === undefined
        ? basis
        : settleSignatureClause(basis, signature.verifiedBasis),
    policy,
    tokensByPath,
    totalTokens,
  };
}

// ── Apply ──────────────────────────────────────────────────────

/** One materialized file and what stood at its path beforehand. */
interface WrittenFile {
  targetAbs: string;
  prior: string | null;
}

/**
 * Undo a partial apply: restore overwritten bytes, delete created files, then
 * remove the directories the apply created, so a failed install leaves no
 * half-populated class directory behind.
 *
 * Best effort per path, deliberately: the caller is already throwing the reason
 * the apply failed, and a restore that itself fails must report the leftover
 * path without replacing that reason.
 */
async function rollback(
  written: readonly WrittenFile[],
  packRootAbs: string,
  rootDir: string,
): Promise<void> {
  for (const record of written.toReversed()) {
    try {
      if (record.prior === null) {
        await rm(record.targetAbs, { force: true });
      } else {
        // Same boundary the forward write carried: a restore is a write to the
        // same target, and one that judged containment by a different rule
        // could refuse to undo bytes the apply was allowed to land.
        await safeWriteFile(record.targetAbs, record.prior, {
          force: true,
          backup: false,
          skipIfUnchanged: false,
          boundaryDir: rootDir,
        });
      }
    } catch (cause) {
      console.error(
        `Pack install rollback could not restore ${record.targetAbs}: ${describeError(cause)}`,
      );
    }
  }
  await pruneEmptyDirs(
    written.filter((record) => record.prior === null).map((record) => dirname(record.targetAbs)),
    packRootAbs,
  );
}

/**
 * Remove now-empty directories from each starting point up to and including the
 * pack root, never above it. A non-empty directory ends that climb — `rmdir`
 * refusing is the signal, so no separate emptiness probe can disagree with it.
 */
async function pruneEmptyDirs(dirs: readonly string[], packRootAbs: string): Promise<void> {
  const deepestFirst = [...new Set(dirs)].toSorted((a, b) => b.length - a.length);
  for (const start of deepestFirst) {
    let dir = start;
    while (dir === packRootAbs || dir.startsWith(`${packRootAbs}${sep}`)) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  }
}

/**
 * Target paths another owner claims in the manifest handed to apply. The plan
 * asked the same question of the manifest ON DISK; this asks it of the object
 * the caller actually passed, which may have moved on since.
 */
function foreignClaims(manifest: SetupManifest, plan: PackInstallPlan, owner: PackOwner): string[] {
  const targets = new Set(plan.writeSet.map((entry) => entry.targetPath));
  return manifest.ledger
    .filter((entry) => targets.has(entry.path) && !isOwnedByPack(entry, owner))
    .map((entry) => `${entry.path}: the ledger already assigns this path to ${entry.artifactId}`);
}

/**
 * The bytes to write for a pack file whose source hashed to `contentHash`, or a
 * throw when writing them would not reproduce that hash.
 *
 * The writer takes text, so content that does not survive a UTF-8 round trip
 * would land as replacement characters — a file whose bytes no longer match the
 * row recorded for it, which the reclaim sweep reads as user-edited and refuses
 * to remove. Pack content classes are text by gate (`./manifest.ts` restricts
 * them to text extensions), so this is a corrupt or mislabelled file, and
 * refusing it is what keeps "recorded hash == bytes on disk" true for every row
 * this module writes.
 */
function decodeForWrite(bytes: Buffer, packId: string, relPath: string): string {
  const text = bytes.toString("utf8");
  if (Buffer.compare(Buffer.from(text, "utf8"), bytes) !== 0) {
    throw new EngineError(
      `Pack "${packId}" ships ${relPath} as text but its bytes are not valid UTF-8, so installing ` +
        `it would change them. Nothing was installed; re-encode the file as UTF-8 and re-publish ` +
        `the pack.`,
      { code: "INTEGRITY_ERROR" },
    );
  }
  return text;
}

/**
 * Materialize a plan, write its install receipt, and fold the ownership rows
 * into `manifest`.
 *
 * Every source file is re-hashed against the digest the plan verified, so a
 * pack that changed on disk between the two stages aborts with
 * `INTEGRITY_ERROR` instead of installing bytes nobody checked. Writes go
 * through the atomic writer one file at a time and the whole batch rolls back
 * on any failure — the receipt included: it is written last, inside the same
 * rollback scope, so a failed apply leaves neither content nor a receipt
 * claiming the content installed. A re-install is the update path — the caller
 * re-plans (re-running every gate and hash), and the apply overwrites the
 * previous receipt and replaces the pack's ledger rows rather than appending.
 *
 * `opts.engineVersion` and `opts.now` feed the receipt; they default to the
 * project manifest's `generatedBy` and the wall clock, so surfaces that carry
 * a version and an injected clock pass their own and everything else stays
 * honest without them.
 *
 * The returned manifest is a copy — the caller's object is never mutated — with
 * this pack's previous rows replaced rather than appended, so re-installing is
 * idempotent. Persisting it is the caller's step (`writeManifest`), which keeps
 * the ledger and the files in one transaction the caller controls.
 */
export async function applyPackInstall(
  projectRoot: string,
  plan: PackInstallPlan,
  manifest: SetupManifest,
  opts: { engineVersion?: string; now?: Date } = {},
): Promise<{ result: PackApplyResult; manifest: SetupManifest }> {
  const rootDir = resolve(projectRoot);
  const packId = plan.manifest.name;
  const packRelPath = packLedgerRelPath(packId);
  const owner = packOwner(packId);

  const errors = [...plan.collisions, ...foreignClaims(manifest, plan, owner)];
  if (errors.length > 0) {
    return {
      result: { installed: false, written: [], ledgerEntries: [], errors, receiptPath: null },
      manifest: structuredClone(manifest),
    };
  }

  const receipt = buildReceipt(
    plan,
    opts.now ?? new Date(),
    opts.engineVersion ?? manifest.generatedBy,
  );
  const receiptText = serializeReceipt(receipt);
  const receiptTarget = receiptRelPath(packId);

  const written: WrittenFile[] = [];
  try {
    for (const entry of plan.writeSet) {
      const sourceAbs = underRoot(plan.source.packRoot, entry.relPath);
      const bytes = await readFile(sourceAbs);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== entry.contentHash) {
        throw new EngineError(
          `Pack "${packId}" changed on disk after it was checked: ${entry.relPath} now hashes to ` +
            `${actual.slice(0, 12)}…, not the verified ${entry.contentHash.slice(0, 12)}…. ` +
            `Nothing was installed; re-run the install to re-check the pack.`,
          { code: "INTEGRITY_ERROR" },
        );
      }
      const text = decodeForWrite(bytes, packId, entry.relPath);
      const targetAbs = underRoot(rootDir, entry.targetPath);
      const prior = await readIfExists(targetAbs);
      // Force without a backup: the plan refused every target this pack does not
      // own, so the only bytes this can replace are a previous install's — which
      // the pack itself is the source of truth for. `boundaryDir` is the project
      // root every target path was joined onto: pack content lands in this tree
      // or the write is refused, whatever a link on the way there points at.
      await safeWriteFile(targetAbs, text, { force: true, backup: false, boundaryDir: rootDir });
      written.push({ targetAbs, prior });
    }

    // Receipt last, after every content byte landed: the receipt asserts the
    // install happened, so it must never exist without the content it records.
    // Same rollback scope — its own failure unwinds the content writes, and a
    // prior install's receipt is restored like any other overwritten byte.
    const receiptAbs = underRoot(rootDir, receiptTarget);
    const priorReceipt = await readIfExists(receiptAbs);
    await safeWriteFile(receiptAbs, receiptText, {
      force: true,
      backup: false,
      skipIfUnchanged: false,
      boundaryDir: rootDir,
    });
    written.push({ targetAbs: receiptAbs, prior: priorReceipt });
  } catch (cause) {
    await rollback(written, underRoot(rootDir, packRelPath), rootDir);
    throw cause;
  }

  const ledgerEntries: LedgerEntry[] = [
    ...plan.writeSet.map(
      (entry): LedgerEntry => ({
        path: entry.targetPath,
        adapter: owner,
        artifactId: packArtifactId(packId, entry.relPath),
        artifactType: "infra",
        contentHash: entry.contentHash,
      }),
    ),
    {
      // The receipt's row is what makes `clean --pack` reclaim it: the hash is
      // over the exact bytes written above, per the sweep's ownership contract.
      path: receiptTarget,
      adapter: owner,
      artifactId: packArtifactId(packId, RECEIPT_FILE),
      artifactType: "infra",
      contentHash: createHash("sha256").update(receiptText, "utf8").digest("hex"),
    },
  ];
  const ledger = [
    ...manifest.ledger.filter((entry) => !isOwnedByPack(entry, owner)),
    ...ledgerEntries,
  ]
    .map(cloneEntry)
    .toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    result: {
      installed: true,
      written: ledgerEntries.map((entry) => entry.path),
      ledgerEntries,
      errors: [],
      receiptPath: receiptTarget,
    },
    manifest: { ...structuredClone(manifest), ledger },
  };
}

// ── Removal ────────────────────────────────────────────────────

/**
 * The pack's ledger rows as reclaim candidates — uninstall in full, the
 * install receipt included (it is one of the pack's rows). Dropping the rows
 * and sweeping the candidates are the same event, which is why no per-pack
 * record needs deleting alongside them.
 *
 * Each candidate carries the row's `contentHash`, which is what the sweep
 * checks the bytes against before unlinking (`../merge/reclaim.ts` gate 2c):
 * an untouched pack file is deleted, one the operator edited is reported and
 * kept. The caller drops the same rows from the manifest.
 *
 * `"deselected"` is the reason on every row: the operator removed the pack, the
 * files stopped being emitted, and no rename or dropped adapter is involved.
 */
export function planPackRemoval(manifest: SetupManifest, packId: string): ReclaimCandidate[] {
  // Validate through the shared id gate so a malformed id is refused here too.
  packLedgerRelPath(packId);
  const owner = packOwner(packId);
  return manifest.ledger
    .filter((entry) => isOwnedByPack(entry, owner))
    .map((entry) => ({ entry: cloneEntry(entry), reason: "deselected" }));
}
