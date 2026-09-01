import { CliFailure } from "../../kit/output.ts";
import type { CliContext, CommandResult } from "../../kit/program.ts";
import { EngineError } from "../../../types/errors.ts";
import type { OrgTrustPolicy } from "../../../pack/orgPolicy.ts";
import { NEXT_DRY_RUN_LINE, NEXT_SYNC_LINE, requireSetupManifest } from "./mcp.ts";

/**
 * The org-trust-policy touchpoint of `stamity config` — `config policy list |
 * init | allow <pattern> | deny <pattern> | remove <pattern>`. There is no
 * standalone `policy` command: which pack sources a repository accepts is
 * configuration, so it folds in here beside `config mcp`.
 *
 * **Why a writer exists at all.** `.stamity/policy.json` was a read-only
 * artifact: `../../../pack/install.ts` gates every install on it and
 * `../../../pack/projection.ts` gates every projection on it, two shipped
 * refusals tell the operator to change it — and nothing in the product created
 * or checked one. The only way to adopt the artifact was to hand-author JSON
 * against a grammar published in prose, and the loader is FAIL-CLOSED: one
 * typo — `op*`, a stray slash, `version: "1"` — refuses every pack install in
 * the repository until somebody finds it. So the surface an operator most
 * needed a validating writer for was the one surface that had none.
 *
 * **Every write is validated twice, and the first one is here.** A pattern is
 * put through `orgPolicyPatternDefect` — the loader's OWN check, published for
 * exactly this — before anything is read for a rewrite, so a refusal costs no
 * write and the existing policy is untouched. `writeOrgPolicy` then re-parses
 * the document it is about to serialize. The redundancy is deliberate: this
 * layer owns the message an operator can act on (what was wrong with the
 * pattern they typed, and the grammar), and the writer owns the guarantee that
 * no bytes this product produces can be bytes the loader refuses.
 *
 * **A defective policy already on disk refuses every action but one.** Reading
 * it throws, and that throw is not caught to proceed — it is re-raised with the
 * next step the engine's own error cannot carry, because the operator is now
 * inside the failure the artifact exists to produce. `policy init --force` is
 * the one action that does not need the current document to be readable, which
 * makes it the documented way back out.
 *
 * **Mode changes are announced, because they are the whole semantic.** The
 * `allow` key's PRESENCE is the mode switch, not its contents: with one absent,
 * everything the deny list misses installs; with one present, everything it
 * misses is refused. So the first `allow` entry narrows the repository to that
 * one pattern, and removing the last one widens it back to everything — two
 * one-word commands with repository-wide blast radius, and both say so on the
 * line they do it. Removing the last `allow` entry drops the KEY rather than
 * leaving `allow: []`, which the evaluator reads as "allowlist mode, nothing
 * allowed" — an empty list denies every pack, which is the opposite of what
 * removing your last restriction means.
 *
 * Engine access rule for this file, as in `./mcp.ts`: everything reaches the
 * engine through `ctx.engine`, the typed composition root. No policy behaviour
 * is re-implemented — the grammar, the evaluator's mode rules and the write
 * path all live in `../../../pack/orgPolicy.ts`, and this file composes a
 * document and hands it over.
 */

/** The five actions, in the order `--help` and the refusals name them. */
const ACTIONS = ["list", "init", "allow", "deny", "remove"] as const;

/** The two pattern lists, spelled as the document's own keys. */
type PolicyList = "allow" | "deny";

/** A list rendered for display; an absent or empty one reads as a word. */
function renderPatterns(patterns: readonly string[] | undefined): string {
  return patterns === undefined || patterns.length === 0 ? "none" : patterns.join(", ");
}

/**
 * What the current document means for the next install, in one line.
 *
 * Read off the `allow` key's presence rather than restated as a rule, because
 * presence IS the mode in `../../../pack/orgPolicy.ts::evaluatePackSource` and a
 * second spelling of that here is a second answer waiting to drift from it.
 */
function describeMode(policy: OrgTrustPolicy | null): string {
  if (policy === null) return "none — no policy file, so every pack source installs";
  if (policy.packs.allow === undefined) {
    return "denylist — every source that matches no deny entry installs";
  }
  return "allowlist — every source that matches no allow entry is REFUSED";
}

/** What the policy on disk is, including the third state a `null` cannot carry. */
type PolicyRead =
  | { kind: "absent" }
  | { kind: "valid"; policy: OrgTrustPolicy }
  | { kind: "invalid"; error: EngineError };

/**
 * Read the policy without deciding what a defect means.
 *
 * `loadOrgPolicy` collapses "no file" to `null` and raises everything else, and
 * the three actions that rewrite the document want that raise while `init
 * --force` — the repair path — wants to know a broken file is THERE without
 * being stopped by it. Splitting the read from the reaction is what lets one
 * engine call serve both.
 */
async function readPolicy(ctx: CliContext, rootDir: string): Promise<PolicyRead> {
  try {
    const policy = await ctx.engine.pack.orgPolicy.loadOrgPolicy(rootDir);
    return policy === null ? { kind: "absent" } : { kind: "valid", policy };
  } catch (error) {
    if (error instanceof EngineError) return { kind: "invalid", error };
    throw error;
  }
}

/**
 * The engine's defect message, re-raised with the step it cannot name.
 *
 * `policyError` in the engine states the defect and the consequence — every
 * install refused until the file is fixed — and stops there, because at that
 * layer there is no command to recommend. There is one now, and an operator
 * staring at a fail-closed repository is exactly who needs it.
 */
function invalidPolicy(ctx: CliContext, rootDir: string, error: EngineError): CliFailure {
  return new CliFailure({
    code: error.code,
    message: error.message,
    why: `the policy is fail-closed: ${ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir)} exists and does not read as the documented shape, so no pack installs and no denied pack projects`,
    next: "edit the file to fix the defect above, or run stamity config policy init --force to replace it with an empty policy",
  });
}

/** The current document, or the fail-closed refusal every rewrite inherits. */
async function requirePolicy(
  ctx: CliContext,
  rootDir: string,
): Promise<OrgTrustPolicy | null> {
  const read = await readPolicy(ctx, rootDir);
  if (read.kind === "invalid") throw invalidPolicy(ctx, rootDir, read.error);
  return read.kind === "absent" ? null : read.policy;
}

/**
 * Refuse a pattern the loader would refuse, before anything is read or written.
 *
 * The check is the engine's own, so the set this admits and the set
 * `loadOrgPolicy` admits are the same set by construction. What this layer adds
 * is the message: the defect in the operator's own pattern, and the grammar
 * they can write instead.
 */
function assertPattern(ctx: CliContext, action: string, pattern: string): void {
  const defect = ctx.engine.pack.orgPolicy.orgPolicyPatternDefect(pattern);
  if (defect === null) return;
  throw new CliFailure({
    code: "VALIDATION_ERROR",
    message: `${JSON.stringify(pattern)} is not a valid policy pattern`,
    // The engine's defect sentences open on a verb ("uses …", "is not …"), so
    // they read as the tail of this clause exactly as they read as the tail of
    // the loader's.
    why: `the pattern ${defect}`,
    next: `${ctx.engine.pack.orgPolicy.ORG_POLICY_PATTERN_GRAMMAR} Run stamity config policy ${action} with one of those.`,
  });
}

/** The document with `pattern` appended to `list`; inputs are never mutated. */
function withPattern(
  policy: OrgTrustPolicy | null,
  list: PolicyList,
  pattern: string,
): OrgTrustPolicy {
  const packs = policy === null ? {} : structuredClone(policy.packs);
  return { version: 1, packs: { ...packs, [list]: [...(packs[list] ?? []), pattern] } };
}

/**
 * The document with every occurrence of `pattern` gone from both lists.
 *
 * A list emptied by the removal loses its KEY, which is the half of this that
 * is not bookkeeping: `allow: []` is a valid document meaning "allowlist mode,
 * nothing passes", so leaving one behind would turn "I removed my last rule"
 * into "I denied every pack in the repository".
 */
function withoutPattern(policy: OrgTrustPolicy, pattern: string): OrgTrustPolicy {
  const packs: OrgTrustPolicy["packs"] = {};
  for (const list of ["allow", "deny"] as const) {
    const current = policy.packs[list];
    if (current === undefined) continue;
    const kept = current.filter((entry) => entry !== pattern);
    if (kept.length > 0) packs[list] = kept;
  }
  return { version: 1, packs };
}

/** Which lists hold `pattern` right now. */
function listsHolding(policy: OrgTrustPolicy, pattern: string): PolicyList[] {
  return (["allow", "deny"] as const).filter((list) =>
    (policy.packs[list] ?? []).includes(pattern),
  );
}

/** The two-row view of a document: what is allowed, what is denied. */
function renderLists(ctx: CliContext, policy: OrgTrustPolicy): void {
  // The keys are code-owned and the entries passed the grammar at load, whose
  // alphabet is `[a-z0-9._-]` plus `@`, `/` and `*` — so nothing printable here
  // can carry a control byte, and no flattening pass is owed.
  ctx.io.out(`  allow  ${renderPatterns(policy.packs.allow)}\n`);
  ctx.io.out(`  deny   ${renderPatterns(policy.packs.deny)}\n`);
}

/** The document as it would land, printed where nothing is written. */
function renderDocument(ctx: CliContext, policy: OrgTrustPolicy): void {
  for (const line of ctx.engine.pack.orgPolicy.serializeOrgPolicy(policy).trimEnd().split("\n")) {
    ctx.io.out(`  ${ctx.palette.dim(line)}\n`);
  }
}

/** The JSON payload's view of a document — `null` when there is no policy. */
function payload(policy: OrgTrustPolicy | null): Record<string, unknown> {
  return {
    policy,
    mode: policy === null ? "none" : policy.packs.allow === undefined ? "denylist" : "allowlist",
    allow: policy?.packs.allow ?? null,
    deny: policy?.packs.deny ?? null,
  };
}

/**
 * `config policy list` — the standing policy, the mode it puts the repo in, and
 * the two rule lists.
 *
 * A read, so a defective file is reported through the same fail-closed refusal
 * every write path takes rather than rendered as a partial document. "Here is
 * what I could parse of a policy that is currently refusing every install" is
 * the one answer this surface must never give.
 */
async function runPolicyList(ctx: CliContext, rootDir: string): Promise<CommandResult> {
  await requireSetupManifest(ctx, rootDir);
  const path = ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir);
  const policy = await requirePolicy(ctx, rootDir);

  ctx.io.out(`${path}\n`);
  ctx.io.out(`mode: ${describeMode(policy)}\n`);
  if (policy === null) {
    ctx.io.out(
      `${ctx.palette.dim("next: run stamity config policy init to start one, or config policy deny <pattern> to write the first rule")}\n`,
    );
  } else {
    renderLists(ctx, policy);
    ctx.io.out(
      `${ctx.palette.dim("next: run stamity config policy allow|deny|remove <pattern> to change one rule")}\n`,
    );
  }

  return { exitCode: 0, json: { path, exists: policy !== null, ...payload(policy) } };
}

/**
 * `config policy init` — write the empty document.
 *
 * Creating is unattended; REPLACING needs `--force`, the `workspace init`
 * asymmetry: an operator who typed the verb asked for the artifact, and the
 * empty document restricts nothing, so nothing is destroyed by creating one. An
 * existing policy is a rule set somebody wrote, and `--force` is the only thing
 * that discards it — including the defective one, which is the sole action that
 * does not first require the current file to parse.
 */
async function runPolicyInit(
  ctx: CliContext,
  rootDir: string,
  force: boolean,
): Promise<CommandResult> {
  await requireSetupManifest(ctx, rootDir);
  const path = ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir);
  const read = await readPolicy(ctx, rootDir);

  if (read.kind !== "absent" && !force) {
    throw new CliFailure({
      code: "CONFIG_ERROR",
      message: `a policy already exists at ${path}`,
      why:
        read.kind === "valid"
          ? `it is a valid policy — ${describeMode(read.policy)}`
          : `it does not parse, so every pack install is already refused: ${read.error.message}`,
      next:
        "run stamity config policy list to read it, config policy allow|deny <pattern> to change one rule, " +
        "or config policy init --force to replace it with an empty policy",
    });
  }

  const policy = ctx.engine.pack.orgPolicy.emptyOrgPolicy();
  const replacing = read.kind !== "absent";

  if (ctx.dryRun) {
    ctx.io.out(`would ${replacing ? "replace" : "create"} ${path}\n`);
    renderDocument(ctx, policy);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return {
      exitCode: 0,
      json: { path, created: false, replaced: false, dryRun: true, ...payload(policy) },
    };
  }

  await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, policy);
  ctx.io.out(`${replacing ? "replaced" : "created"} ${path}\n`);
  renderDocument(ctx, policy);
  ctx.io.out(
    `  ${ctx.palette.dim("an empty policy restricts nothing — every pack source still installs")}\n`,
  );
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);
  return {
    exitCode: 0,
    json: { path, created: !replacing, replaced: replacing, ...payload(policy) },
  };
}

/**
 * The consequence line for a write that changes which mode the repo is in.
 *
 * Printed only on the transition, and only for the transition that happened —
 * an operator adding their second `allow` entry is not narrowing anything, and
 * a line that fired on every write would be scrolled past by the time it
 * mattered.
 */
function modeShift(before: OrgTrustPolicy | null, after: OrgTrustPolicy | null): string | null {
  const wasAllowlist = before !== null && before.packs.allow !== undefined;
  const isAllowlist = after !== null && after.packs.allow !== undefined;
  if (wasAllowlist === isAllowlist) return null;
  return isAllowlist
    ? "this repo is now in ALLOWLIST mode — every pack source that matches no allow entry is refused, including ones already installed, which stop projecting on the next sync"
    : "this repo is back in DENYLIST mode — every pack source that matches no deny entry installs again";
}

/**
 * `config policy allow <pattern>` / `config policy deny <pattern>` — append one
 * rule, creating the document if the repo has none.
 *
 * Idempotent, the `config mcp add` precedent: a pattern already on the list is
 * reported and nothing is written. Duplicates would be legal — the evaluator
 * takes the first match — but a second identical entry is a rule that can never
 * decide anything, and writing one would make the file harder to read for no
 * change in behaviour.
 */
async function runPolicyAdd(
  ctx: CliContext,
  rootDir: string,
  list: PolicyList,
  pattern: string,
): Promise<CommandResult> {
  await requireSetupManifest(ctx, rootDir);
  // Before the read: a pattern that cannot be written should cost no file
  // access and, above all, must not reach the writer with a half-built
  // document in hand.
  assertPattern(ctx, list, pattern);

  const path = ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir);
  const before = await requirePolicy(ctx, rootDir);

  if (before !== null && (before.packs[list] ?? []).includes(pattern)) {
    ctx.io.out(`${JSON.stringify(pattern)} is already in packs.${list} — nothing to add.\n`);
    return { exitCode: 0, json: { path, pattern, list, changed: false, ...payload(before) } };
  }

  const after = withPattern(before, list, pattern);
  const shift = modeShift(before, after);
  const diff = `packs.${list}: ${renderPatterns(before?.packs[list])} ${ctx.palette.cyan("->")} ${renderPatterns(after.packs[list])}`;

  if (ctx.dryRun) {
    ctx.io.out(`would add ${ctx.palette.bold(pattern)} to packs.${list}\n`);
    ctx.io.out(`  ${diff}\n`);
    if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
    renderDocument(ctx, after);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return {
      exitCode: 0,
      json: { path, pattern, list, changed: false, dryRun: true, ...payload(after) },
    };
  }

  await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, after);
  ctx.io.out(`added ${ctx.palette.bold(pattern)} to packs.${list}\n`);
  ctx.io.out(`  ${diff}\n`);
  if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);
  return { exitCode: 0, json: { path, pattern, list, changed: true, ...payload(after) } };
}

/**
 * `config policy remove <pattern>` — drop one rule from wherever it sits.
 *
 * Both lists, because the command's argument is a rule and the same rule text
 * in both lists is one rule the evaluator already collapses: deny wins, so the
 * allow copy can never decide anything. Asking an operator which list to remove
 * it from would be asking them to name a distinction the evaluator does not
 * make — and the output says which lists it actually came out of.
 *
 * A pattern that is on neither list is a refusal rather than a silent success:
 * "removed" printed over a policy that still denies what the operator meant to
 * stop denying is the one wrong answer here.
 */
async function runPolicyRemove(
  ctx: CliContext,
  rootDir: string,
  pattern: string,
): Promise<CommandResult> {
  await requireSetupManifest(ctx, rootDir);
  const path = ctx.engine.pack.orgPolicy.orgPolicyPath(rootDir);
  const before = await requirePolicy(ctx, rootDir);

  // Membership is judged against the persisted document, never against the
  // grammar: a pattern this engine would no longer accept can still be sitting
  // in a file an older one wrote, and removing it is exactly the repair.
  const holding = before === null ? [] : listsHolding(before, pattern);
  if (before === null || holding.length === 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${JSON.stringify(pattern)} is not in the org trust policy`,
      why:
        before === null
          ? `there is no policy at ${path}`
          : `allow: ${renderPatterns(before.packs.allow)}; deny: ${renderPatterns(before.packs.deny)}`,
      next:
        before === null
          ? "run stamity config policy init to start one"
          : "run stamity config policy list to see the current rules",
    });
  }

  const after = withoutPattern(before, pattern);
  const shift = modeShift(before, after);
  const from = holding.map((list) => `packs.${list}`).join(" and ");

  if (ctx.dryRun) {
    ctx.io.out(`would remove ${ctx.palette.bold(pattern)} from ${from}\n`);
    if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
    renderDocument(ctx, after);
    ctx.io.out(`${NEXT_DRY_RUN_LINE}\n`);
    return {
      exitCode: 0,
      json: { path, pattern, lists: holding, changed: false, dryRun: true, ...payload(after) },
    };
  }

  await ctx.engine.pack.orgPolicy.writeOrgPolicy(rootDir, after);
  ctx.io.out(`removed ${ctx.palette.bold(pattern)} from ${from}\n`);
  renderLists(ctx, after);
  if (shift !== null) ctx.io.out(`  ${ctx.palette.yellow(shift)}\n`);
  ctx.io.out(`${NEXT_SYNC_LINE}\n`);
  return { exitCode: 0, json: { path, pattern, lists: holding, changed: true, ...payload(after) } };
}

/**
 * Dispatch `config policy <action> [pattern]` — this module's whole export.
 *
 * A bare `config policy` is `list`, the `config mcp` shape: the action that
 * names nothing reads rather than writes.
 *
 * The dispatch sits HERE rather than in the parent, which is the one place this
 * file diverges from `./mcp.ts`. The action set, the pattern requirement and the
 * grammar the missing-pattern refusal quotes are all facts of this surface, so
 * keeping them beside the actions leaves the parent with one line per
 * sub-surface and no second copy of a vocabulary to keep in step. The five
 * runners stay module-private for the same reason: `config policy` has exactly
 * one entry, and an exported runner with no caller outside this file is dead
 * surface.
 */
export async function runPolicy(
  ctx: CliContext,
  rootDir: string,
  action: string | undefined,
  pattern: string | undefined,
  force: boolean,
): Promise<CommandResult> {
  if (action === undefined || action === "list") return runPolicyList(ctx, rootDir);
  if (action === "init") return runPolicyInit(ctx, rootDir, force);

  if (action !== "allow" && action !== "deny" && action !== "remove") {
    throw new CliFailure({
      code: "USAGE",
      message: `unknown policy action ${JSON.stringify(action)}`,
      why: `config policy takes one of ${ACTIONS.length} actions`,
      next: `use one of: ${ACTIONS.join(", ")}`,
    });
  }
  if (pattern === undefined) {
    throw new CliFailure({
      code: "USAGE",
      message: `config policy ${action} needs a pattern`,
      why: "a rule is added or dropped by the pattern text itself",
      next: `run stamity config policy ${action} <pattern> — ${ctx.engine.pack.orgPolicy.ORG_POLICY_PATTERN_GRAMMAR}`,
    });
  }
  if (action === "remove") return runPolicyRemove(ctx, rootDir, pattern);
  return runPolicyAdd(ctx, rootDir, action, pattern);
}
