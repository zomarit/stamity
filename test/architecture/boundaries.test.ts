import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Static import-graph architecture gate for src/.
 *
 * The scanner is a pure function over an in-memory { path -> source } map, so its
 * own behaviour is unit-tested on seeded string fixtures; the real tree is loaded
 * once at the fs edge. It asserts, with no new dependencies:
 *
 *   1. the five boundary edges (barrel ban, types leaf, kernel utils, engine
 *      never imports CLI, composition is top) — the same edges the oxlint
 *      no-restricted-imports overrides declare, normalized to this repo's
 *      `.ts`-specifier style, which glob patterns written against `.js`
 *      specifiers cannot see; this test is the authoritative gate, and it is
 *      the only one of the two that models the CLI as a *layer* rather than
 *      the single `src/cli.ts` file the phase-1 globs were written against,
 *   2. wave layering per the embedded plan map (each file imports only
 *      same-unit or earlier-wave files), with a frozen waiver list for
 *      pre-existing drift — the list may only ever shrink,
 *   3. no runtime import cycles (`import type` edges are exempt from the cycle
 *      check but still boundary-checked),
 *   4. completeness: every src file is reachable from an entrypoint, so a module
 *      added to src/ but never wired into the composition root fails here with
 *      the file named,
 *   5. CALL-SITE reachability: the same walk with the composition root's own
 *      outgoing edges removed. Rule 4 is satisfied by registry membership alone
 *      — root.ts namespace-imports every engine module, so wiring a module
 *      makes it reachable whether or not anything calls it, and knip sees the
 *      same import and agrees. This rule strips that one edge set, so a module
 *      whose only consumer is the registry is named rather than certified,
 *   6. the oxlint import bans are LIVE: their groups match this repo's `.ts`
 *      specifiers, their layering deny-lists cover the whole on-disk directory
 *      set, and a seeded violation of each ban is really reported by oxlint.
 *
 * Dynamic `import()` occurrences count as edges everywhere.
 */

// ---------------------------------------------------------------------------
// Scanner (pure)
// ---------------------------------------------------------------------------

interface ImportEdge {
  readonly from: string;
  readonly to: string;
  readonly typeOnly: boolean;
}

type FileMap = ReadonlyMap<string, string>;

interface SpecifierRule {
  readonly pattern: RegExp;
  readonly typeOnly: boolean;
}

/**
 * Line-anchored so specifiers inside comments (`// import x from "y"`, JSDoc
 * `* import ...`) never count; the dynamic-import rule is position-free because
 * `import(` is a syntax form that cannot start a plain prose line unnoticed.
 */
const SPECIFIER_RULES: readonly SpecifierRule[] = [
  { pattern: /^[ \t]*import[ \t]+type[ \t][^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: true },
  {
    pattern: /^[ \t]*import[ \t]+(?!type[ \t])[^"'()]*?from[ \t]*["']([^"']+)["']/gm,
    typeOnly: false,
  },
  { pattern: /^[ \t]*import[ \t]*["']([^"']+)["']/gm, typeOnly: false },
  { pattern: /^[ \t]*export[ \t]+type[ \t][^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: true },
  { pattern: /^[ \t]*export[ \t]+(?:\*|\{)[^"']*?from[ \t]*["']([^"']+)["']/gm, typeOnly: false },
  { pattern: /\bimport[ \t]*\(\s*["']([^"']+)["']\s*\)/g, typeOnly: false },
];

function resolveInternal(from: string, specifier: string): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const joined = path.posix.join(path.posix.dirname(from), specifier);
  return path.posix.normalize(joined);
}

/** Extracts every internal import edge, deduplicated by (from, to, typeOnly). */
function scanImports(files: FileMap): ImportEdge[] {
  const edges = new Map<string, ImportEdge>();
  for (const [from, source] of files) {
    for (const rule of SPECIFIER_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of source.matchAll(rule.pattern)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const to = resolveInternal(from, specifier);
        if (to === null) continue;
        const key = `${from}|${to}|${String(rule.typeOnly)}`;
        if (!edges.has(key)) edges.set(key, { from, to, typeOnly: rule.typeOnly });
      }
    }
  }
  return [...edges.values()];
}

// ---------------------------------------------------------------------------
// Rule 1: the five boundary edges
// ---------------------------------------------------------------------------

/**
 * The two shipped program roots. Rule 5 keys on exactly these: the privilege
 * of importing the composition root belongs to what the package publishes,
 * and nothing else.
 */
const ENTRYPOINTS: readonly string[] = ["src/index.ts", "src/cli.ts"];

/**
 * The docs generator's roots (p6-u03). `scripts/generate-docs.mjs` imports
 * these four renderers directly, and the shipped CLI deliberately never loads
 * them — a reference page has no business costing startup time on
 * `stamity --help`, and the CLI has no reason to hold a markdown renderer.
 *
 * They are roots of a second program, so they belong in the reachability
 * walk (rule 4) and NOT in the rule-5 composition privilege above. Listing
 * them is not a loophole: each is still required to exist, to be
 * import-clean, and to sit in the plan map, and a separate case below asserts
 * the generator actually imports every one — so a renderer that stopped being
 * wired would have to be deleted from this list to pass, which is a visible
 * edit rather than a silent orphan.
 */
const GENERATOR_ENTRYPOINTS: readonly string[] = [
  "src/cli/docs/cliReference.ts",
  "src/cli/docs/configReference.ts",
  "src/cli/docs/referencePages.ts",
  "src/cli/docs/llmsIndex.ts",
];

/** Every root the reachability walk starts from. */
const REACHABILITY_ROOTS: readonly string[] = [...ENTRYPOINTS, ...GENERATOR_ENTRYPOINTS];

const KERNEL_DIRS: readonly string[] = [
  "src/config/",
  "src/shared/",
  "src/denyscan/",
  "src/roster/",
];

/**
 * The CLI layer: the entrypoint plus every module beneath it. Phase 1 had a
 * single `src/cli.ts`, so the two CLI-facing boundary rules below could name
 * that one path; phase 2 split the same layer across `src/cli/**`, and both
 * rules key on this predicate instead of the literal file.
 */
function isCliFile(file: string): boolean {
  return file === "src/cli.ts" || file.startsWith("src/cli/");
}

function checkBoundaries(edges: readonly ImportEdge[]): string[] {
  const violations: string[] = [];
  for (const edge of edges) {
    const { from, to } = edge;
    const toBasename = to.split("/").at(-1) ?? "";

    // (1) Barrel ban: no internal file imports an index barrel. The single
    // exemption is the CLI layer consuming the public entry — the CLI is the
    // package's own first consumer of its API, and routing it through
    // src/index.ts is what keeps that API honest (anything the CLI needs must
    // be exported). Engine files still import concrete files, and no barrel
    // other than the public entry is importable from anywhere, CLI included.
    if (toBasename === "index.ts" && !(isCliFile(from) && to === "src/index.ts")) {
      violations.push(`barrel-ban: ${from} -> ${to} (import the concrete file)`);
    }

    // (2) Types leaf: src/types imports nothing internal outside src/types.
    if (from.startsWith("src/types/") && !to.startsWith("src/types/")) {
      violations.push(`types-leaf: ${from} -> ${to} (src/types imports nothing internal)`);
    }

    // (3) Kernel utils: config/shared/denyscan/roster import only src/types
    // (and their own sibling files).
    const kernelDir = KERNEL_DIRS.find((dir) => from.startsWith(dir));
    if (kernelDir !== undefined && !to.startsWith("src/types/") && !to.startsWith(kernelDir)) {
      violations.push(`kernel: ${from} -> ${to} (kernel utilities may import only src/types)`);
    }

    // (4) The engine never imports the CLI. The direction is what the rule is
    // about, so it fires only on an edge that *leaves* the engine: edges inside
    // the CLI layer (kit -> command -> entry) are that layer's own business and
    // are constrained by the wave map below, not by this rule.
    if (!isCliFile(from) && isCliFile(to)) {
      violations.push(`no-cli: ${from} -> ${to} (the engine never imports the CLI)`);
    }

    // (5) Composition is top: only the entrypoints may import the composition root.
    if (
      to.startsWith("src/composition/") &&
      !ENTRYPOINTS.includes(from) &&
      !from.startsWith("src/composition/")
    ) {
      violations.push(`composition-top: ${from} -> ${to} (only entrypoints import composition)`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Rule 2: wave layering per the phase-1 plan
// ---------------------------------------------------------------------------

interface PlanEntry {
  readonly unit: string;
  readonly wave: number;
}

/**
 * File -> build unit -> wave, embedded from the phase plans (p1-plan.json,
 * p2-plan.json, p3-plan.json, p4-plan.json). The map grows with each phase;
 * only LAYERING_WAIVERS below is a frozen ratchet.
 *
 * One wave axis spans the phases. The engine occupies waves 0-9 and the CLI
 * sits entirely above it at 10-13, so each P2 unit's own wave N is recorded
 * here as global wave 10 + N. That is not bookkeeping — it is the layering
 * claim itself: any CLI module may reach any engine module, and no engine
 * module may reach back (boundary rule 4 enforces the reverse edge).
 *
 * Phase 3 (the content corpus) added no layer above the CLI: it shipped
 * `content/` plus two ENGINE leaves the composition root wires like any other
 * (p3-02's charter loader, p3-17's agent-policy roster). Their rows therefore
 * carry the P3 unit id with the ENGINE wave their dependency depth puts them
 * at, not a phase-derived wave — a phase-derived wave would claim the
 * composition root sits below them, which is the opposite of the real edge
 * direction.
 *
 * Phase 4 (the emission core and the four adapters) is engine too, and it is
 * where the engine grew taller: emitters at 4-5, the plan composer over them
 * at 6, the four residue adapters at 7, the residue registry and the
 * capability-matrix renderer at 8. The composition root imports every one of
 * those, so it moved from wave 7 to 9 with the public entry beside it, and the
 * CLI offset moved from 8+N to 10+N behind it. Only the numbers changed — the
 * claim is the same one phase 2 made.
 *
 * Phase 5 (packs) grew the engine by three more waves, all of them below the
 * plan composer. The pack chain is a straight line — permissions (4) under the
 * manifest reader (5, up from 2, which is what retires the frontmatter waiver
 * it used to need) under the trust ladder and the org policy (6) under the
 * receipt (7) under the installer and the live-emission projection (8) — and
 * the composer imports the projection, because installed pack content joins
 * the emission corpus. So planner 6 -> 9 carries the adapters to 10, the
 * adapter-set readers to 11, composition and the public entry to 12, and the
 * CLI offset from 10+N to 13+N. Same claim, third renumbering.
 */
const PLAN_MAP: Readonly<Record<string, PlanEntry>> = {
  // wave 0
  "src/types/errors.ts": { unit: "p1-01", wave: 0 },
  "src/types/core.ts": { unit: "p1-01", wave: 0 },
  "src/types/markers.ts": { unit: "p1-01", wave: 0 },
  // wave 1
  "src/types/manifest.ts": { unit: "p1-02", wave: 1 },
  "src/types/content.ts": { unit: "p1-02", wave: 1 },
  "src/types/detect.ts": { unit: "p1-02", wave: 1 },
  "src/config/parse.ts": { unit: "p1-03", wave: 1 },
  "src/shared/paths.ts": { unit: "p1-03", wave: 1 },
  "src/shared/runId.ts": { unit: "p1-03", wave: 1 },
  // Zero internal imports (node builtins only), read by the wave-2 hook parser
  // and the wave-5 pack manifest reader — so it sits at its true depth with the
  // other shared leaves rather than at either consumer's wave.
  "src/shared/launcherAllowlist.ts": { unit: "s2d-08", wave: 1 },
  "src/denyscan/denyScan.ts": { unit: "p1-04", wave: 1 },
  "src/mcp/secretScan.ts": { unit: "p1-05", wave: 1 },
  "src/roster/triggers.ts": { unit: "p1-06", wave: 1 },
  "src/roster/reviewCaps.ts": { unit: "p1-06", wave: 1 },
  // Zero-import kernel data (boundary rule 3 holds it there), so it sits with
  // the other roster leaves rather than at its authoring phase.
  "src/roster/agentPolicies.ts": { unit: "p3-17", wave: 1 },
  // Same shape one phase later: a TOML serializer over src/types/errors.ts and
  // nothing else. Placed at its true depth rather than at its unit's adapter
  // wave, so a future non-codex consumer is not forced above wave 10.
  "src/adapters/toml.ts": { unit: "p4-u08", wave: 1 },
  // Generated pin data with zero imports — same reasoning as agentPolicies
  // above: kept at its true depth so a future consumer of the pins is not
  // forced above the catalog reader that ships with it.
  "src/pack/catalogPins.ts": { unit: "p5-curated-catalog", wave: 1 },
  // wave 2
  "src/merge/fsErrors.ts": { unit: "p1-08", wave: 2 },
  "src/merge/managedBlocks.ts": { unit: "p1-08", wave: 2 },
  "src/guard/promptGuard.ts": { unit: "p1-09", wave: 2 },
  "src/guard/outputBounds.ts": { unit: "p1-09", wave: 2 },
  "src/guard/tokenEstimate.ts": { unit: "p1-09", wave: 2 },
  "src/resilience/retry.ts": { unit: "p1-10", wave: 2 },
  "src/resilience/failureClass.ts": { unit: "p1-10", wave: 2 },
  "src/resilience/failureLog.ts": { unit: "p1-11", wave: 2 },
  "src/resilience/adapterTimeout.ts": { unit: "p1-11", wave: 2 },
  "src/content/tags.ts": { unit: "p1-12", wave: 2 },
  "src/content/frontmatter.ts": { unit: "p1-13", wave: 2 },
  "src/content/contentRoot.ts": { unit: "p1-13", wave: 2 },
  "src/hooks/model.ts": { unit: "p1-14", wave: 2 },
  "src/hooks/userHooks.ts": { unit: "p1-14", wave: 2 },
  "src/mcp/catalog.ts": { unit: "p1-15", wave: 2 },
  "src/mcp/descriptionScan.ts": { unit: "p1-15", wave: 2 },
  "src/emit/substitution.ts": { unit: "p1-16", wave: 2 },
  "src/emit/monorepoPlan.ts": { unit: "p1-16", wave: 2 },
  "src/workspace/model.ts": { unit: "p1-17", wave: 2 },
  "src/workspace/git.ts": { unit: "p1-17", wave: 2 },
  "src/detect/repoAnalyzer.ts": { unit: "p1-18", wave: 2 },
  "src/detect/packageManager.ts": { unit: "p1-18", wave: 2 },
  // Zero-import kernel data over src/types/core.ts, same shape as the roster
  // leaves at wave 1 — held here so a future consumer of the ladder is not
  // pinned below the wave-2 detect layer it will be read beside.
  "src/roster/modelLadder.ts": { unit: "s2b-u01", wave: 2 },
  // Re-verifies an installed pack against its receipt; reads src/types and
  // nothing else, so it sits below the pack chain it audits rather than beside
  // the installer, and the CLI check command reaches it from wave 15.
  "src/pack/verifyInstalled.ts": { unit: "s2d-10", wave: 2 },
  "src/learnings/validation.ts": { unit: "p1-20", wave: 2 },
  "src/handoffs/schema.ts": { unit: "p1-21", wave: 2 },
  "src/handoffs/validation.ts": { unit: "p1-21", wave: 2 },
  // wave 3
  "src/detect/stackSupport.ts": { unit: "p1-19", wave: 3 },
  "src/detect/verificationGates.ts": { unit: "p1-19", wave: 3 },
  "src/merge/atomicWrite.ts": { unit: "p1-23", wave: 3 },
  "src/tools/categories.ts": { unit: "p1-24", wave: 3 },
  "src/tools/allowlist.ts": { unit: "p1-24", wave: 3 },
  // Re-cut: s2d-10 rebuilt the catalog and the user-content walk as ONE unit
  // and gave them a shared vocabulary type (`SkippedUserEntry`), so the two
  // files carry that unit id rather than their p1-25/p1-39 authoring ids. This
  // is a plan-map re-plan, not a waiver — the same-unit rule the map already
  // has is what admits the edge, and LAYERING_WAIVERS stays a shrink-only list.
  // The pair keeps its strictness through the type-only assertion below: the
  // edge is erased at compile time, and promoting it to a runtime import fails.
  "src/content/catalog.ts": { unit: "s2d-10", wave: 3 },
  // Corpus reader over the wave-2 content primitives (contentRoot, frontmatter),
  // consumed one layer up — the same position as the catalog beside it.
  "src/content/charter.ts": { unit: "p3-02", wave: 3 },
  "src/mcp/env.ts": { unit: "p1-26", wave: 3 },
  "src/workspace/detect.ts": { unit: "p1-27", wave: 3 },
  "src/workspace/resolve.ts": { unit: "p1-27", wave: 3 },
  // wave 4
  "src/merge/safeWrite.ts": { unit: "p1-28", wave: 4 },
  "src/manifest/manifest.ts": { unit: "p1-29", wave: 4 },
  "src/tools/translator.ts": { unit: "p1-30", wave: 4 },
  "src/content/selection.ts": { unit: "p1-31", wave: 4 },
  "src/content/mdcCompanions.ts": { unit: "p1-31", wave: 4 },
  "src/learnings/store.ts": { unit: "p1-32", wave: 4 },
  "src/handoffs/store.ts": { unit: "p1-33", wave: 4 },
  "src/workspace/manifest.ts": { unit: "p1-34", wave: 4 },
  "src/mcp/emit.ts": { unit: "p1-35", wave: 4 },
  "src/manifest/mcpFilter.ts": { unit: "p1-35", wave: 4 },
  "src/hooks/scripts.ts": { unit: "p1-36", wave: 4 },
  // The charter renderer reads the corpus (wave-3 charter loader) and the
  // wave-2 substitution/monorepo primitives — the bottom of the emission core.
  "src/emit/agentsMd.ts": { unit: "p4-u01", wave: 4 },
  // The permission manifest validates a pack's declared tool footprint against
  // the wave-3 tool categories, which is what puts the whole pack chain above
  // them rather than beside the other wave-2 parsers.
  "src/pack/permissions.ts": { unit: "p5-permission-manifest", wave: 4 },
  // Grant resolution over the wave-1 agent-policy roster, read by the wave-5+
  // emitters that write a tool grant: above the roster it reads, below every
  // consumer of the answer.
  "src/roster/agentGrants.ts": { unit: "s2b-u04", wave: 4 },
  // The worktree lane's engine primitives (WT-U1a). Wave 4 is their true depth
  // and not a phase number: the deepest thing any of them imports is the
  // wave-3 atomic-write substrate (the receipt writes through `atomicWriteFile`
  // with the git dir as its boundary; materialization reuses
  // `assertWriteTargetContained`), and nothing here reads a wave-4 module. They
  // are one unit because they hold one contract between them — the policy
  // resolves a strategy, materialization performs it and reports what it did,
  // and the receipt records that report so cleanup can invert it — so the two
  // edges inside the set (materialize -> receipt for the row shape and the
  // digest) are same-unit rather than a layering claim. Placed at their final
  // depth now, so WT-U1b's git orchestration lands above them as a new row
  // rather than as a re-plan of this one.
  "src/worktree/policy.ts": { unit: "wt-u1a", wave: 4 },
  "src/worktree/receipt.ts": { unit: "wt-u1a", wave: 4 },
  "src/worktree/materialize.ts": { unit: "wt-u1a", wave: 4 },
  // wave 5
  // The worktree lane's git orchestration (WT-U1b), one wave above the
  // primitives it drives. Wave 5 is its true depth: `setup` and `cleanup`
  // consume the wave-4 policy/receipt/materialize set and the wave-3 lock and
  // atomic writer, and nothing here is read by a wave-4 module. One unit,
  // because the three hold one contract between them — `git` owns the single
  // subprocess seam and the pure parsers over git's output, `setup` composes a
  // checkout under the name lock that spans check -> add -> materialize ->
  // receipt, and `cleanup` inverts exactly that receipt — so the edges inside
  // the set (`setup` -> `git`, `cleanup` -> `git`, `cleanup` -> `setup` for
  // the shared lock path and consent vocabulary) are same-unit rather than a
  // layering claim. The CLI verb that calls them is WT-U2's and lands at wave
  // 14 like every other command, which is why nothing here climbs.
  "src/worktree/git.ts": { unit: "wt-u1b", wave: 5 },
  "src/worktree/setup.ts": { unit: "wt-u1b", wave: 5 },
  "src/worktree/cleanup.ts": { unit: "wt-u1b", wave: 5 },
  "src/manifest/ledger.ts": { unit: "p1-37", wave: 5 },
  "src/workspace/sync.ts": { unit: "p1-38", wave: 5 },
  // Authored as p1-39; re-cut into s2d-10 with the catalog above — see there.
  "src/content/userContent.ts": { unit: "s2d-10", wave: 5 },
  // Emission core over the wave-4 selection/translator/hook-script layer.
  "src/emit/skillsProjection.ts": { unit: "p4-u02", wave: 5 },
  // The state-directory scaffold: filesystem plus the marker constants, nothing
  // else — it sits at the depth of the markers it reads (TD-06).
  "src/emit/stateScaffold.ts": { unit: "p4-u02", wave: 2 },
  "src/emit/hooksInfra.ts": { unit: "p4-u03", wave: 5 },
  // The pack manifest reader gained the permission manifest below it in P5, so
  // it left wave 2 for its true depth. Its frontmatter waiver retired with the
  // move: wave-2 frontmatter is now strictly below it.
  "src/pack/manifest.ts": { unit: "p1-22", wave: 5 },
  // wave 6
  "src/merge/reclaim.ts": { unit: "p1-40", wave: 6 },
  // The trust ladder and the org policy both read the validated pack manifest
  // and nothing of each other — siblings, not a chain.
  "src/pack/trust.ts": { unit: "p5-trust-ladder", wave: 6 },
  // Same unit as the ladder, deliberately: the two hold one contract between
  // them. The ladder imports the verifier at runtime and the verifier imports
  // the ladder's verdict type back, and a same-unit pair is how the map says
  // "these two layer against each other" without a waiver. Rule 3 still covers
  // the risk — the type edge is exempt from the cycle check, the runtime edge
  // runs one way, and a runtime import added in the other direction fails there.
  "src/pack/sigstoreVerifier.ts": { unit: "p5-trust-ladder", wave: 6 },
  "src/pack/orgPolicy.ts": { unit: "p5-org-policy", wave: 6 },
  // wave 7 — pack-install leaves over the trust ladder
  "src/pack/receipt.ts": { unit: "p5-install-pipeline", wave: 7 },
  "src/pack/curated.ts": { unit: "p5-curated-catalog", wave: 7 },
  // wave 8 — the installer and the projection that feeds the composer
  "src/pack/install.ts": { unit: "p1-41", wave: 8 },
  "src/pack/projection.ts": { unit: "p5-projection", wave: 8 },
  // wave 9 — the core plan composer: consumes every emitter above plus the
  // pack projection, exposes the residue contract the adapters implement.
  "src/emit/planner.ts": { unit: "p4-u04", wave: 9 },
  // wave 10 — the four residue adapters, one unit each, over the composer
  "src/adapters/claude.ts": { unit: "p4-u05", wave: 10 },
  "src/adapters/cursor.ts": { unit: "p4-u06", wave: 10 },
  "src/adapters/copilot.ts": { unit: "p4-u07", wave: 10 },
  "src/adapters/codex.ts": { unit: "p4-u08", wave: 10 },
  // wave 11 — the two modules that read the whole adapter set
  "src/adapters/registry.ts": { unit: "p4-u09", wave: 11 },
  "src/emit/capabilityMatrix.ts": { unit: "p4-u10", wave: 11 },
  // wave 12 — composition, above every engine module it wires
  "src/composition/root.ts": { unit: "p1-42", wave: 12 },
  "src/index.ts": { unit: "p1-42", wave: 12 },

  // ---- phase 2 (p2-plan.json): the CLI layer, waves 13-16 ----
  // wave 13 (P2 wave 0) — kit, engine bridge, migration detection
  "src/cli/kit/terminal.ts": { unit: "p2-01", wave: 13 },
  "src/cli/kit/output.ts": { unit: "p2-01", wave: 13 },
  "src/cli/kit/prompts.ts": { unit: "p2-01", wave: 13 },
  "src/cli/kit/program.ts": { unit: "p2-01", wave: 13 },
  "src/cli/kit/banner.ts": { unit: "p2-01", wave: 13 },
  "src/cli/engine/emission.ts": { unit: "p2-03", wave: 13 },
  "src/cli/engine/gitStatus.ts": { unit: "p2-03", wave: 13 },
  "src/migration/detect.ts": { unit: "p2-04", wave: 13 },
  "src/migration/carry.ts": { unit: "p2-04", wave: 13 },
  // wave 14 (P2 wave 1) — command engines and the leaf commands
  "src/cli/commands/init/plan.ts": { unit: "p2-05", wave: 14 },
  "src/cli/commands/init/apply.ts": { unit: "p2-05", wave: 14 },
  "src/cli/commands/sync/engine.ts": { unit: "p2-06", wave: 14 },
  "src/cli/commands/sync/report.ts": { unit: "p2-06", wave: 14 },
  "src/cli/commands/validate.ts": { unit: "p2-07", wave: 14 },
  "src/cli/commands/add.ts": { unit: "p2-08", wave: 14 },
  "src/cli/commands/config.ts": { unit: "p2-09", wave: 14 },
  "src/cli/commands/config/mcp.ts": { unit: "p2-09", wave: 14 },
  "src/cli/commands/clean.ts": { unit: "p2-10", wave: 14 },
  "src/cli/commands/learn.ts": { unit: "p2-11", wave: 14 },
  "src/cli/notice/updateNotice.ts": { unit: "p2-12", wave: 14 },
  // The worktree verb (WT-U2), at the leaf-command wave rather than beside
  // `workspace.ts` one above it. Wave 14 is its true depth: everything it calls
  // is engine — the wave-5 setup/cleanup orchestration and the wave-4/3 policy
  // and git modules under them — plus the wave-13 kit, and it imports no
  // wave-14 command engine, which is the only reason `workspace.ts` sits at 15.
  // The row was planned at this depth by WT-U1b, so landing the verb is not a
  // re-plan of the wave map. Its value imports of `src/worktree/setup.ts` and
  // `src/worktree/cleanup.ts` are also what retire those six modules from the
  // registry-only ratchet below: the composition root wired them, and until
  // this file existed nothing called them.
  "src/cli/commands/worktree.ts": { unit: "wt-u2", wave: 14 },
  // wave 15 (P2 wave 2) — commands composed over a wave-14 engine
  "src/cli/commands/init.ts": { unit: "p2-13", wave: 15 },
  "src/cli/commands/init/panel.ts": { unit: "p2-13", wave: 15 },
  "src/cli/commands/sync.ts": { unit: "p2-14", wave: 15 },
  "src/cli/commands/check.ts": { unit: "p2-15", wave: 15 },
  // The workspace verb sits beside `sync.ts` rather than with the wave-14 leaf
  // commands: its cascade subcommand drives the wave-14 emission engine
  // (`./sync/engine.ts`) per member, which is the same reason `sync.ts` is
  // here. Placed at its final depth now so landing the cascade is not a
  // re-plan of the wave map — which is how it landed (W-U3), one file and no
  // new row: a `workspace/` child holding the cascade would have to sit at
  // wave 15 to reach the emission engine, and this file importing a sibling at
  // its own wave under another unit is the violation `checkWaveLayering`
  // names. The module header states the same refusal at the call site.
  "src/cli/commands/workspace.ts": { unit: "w-u1", wave: 15 },
  // wave 16 (P2 wave 3) — program assembly
  "src/cli.ts": { unit: "p2-16", wave: 16 },

  // ---- phase 6 (p6-plan.json): the docs generators, wave 17 ----
  // Above the CLI entry because `cliReference` reads `COMMANDS` off it, which
  // is also what forced the whole family into the CLI layer: boundary rule 4
  // bars `src/emit` from importing `src/cli.ts` or the config key registry, so
  // the renderers live where the data does. One unit, so the chain inside it
  // (referencePages -> configReference -> cliReference -> llmsIndex, each
  // module owning the shared parts it introduces) needs no wave of its own.
  "src/cli/docs/referencePages.ts": { unit: "p6-u03", wave: 17 },
  "src/cli/docs/configReference.ts": { unit: "p6-u03", wave: 17 },
  "src/cli/docs/cliReference.ts": { unit: "p6-u03", wave: 17 },
  "src/cli/docs/llmsIndex.ts": { unit: "p6-u03", wave: 17 },
};

/**
 * Entry stubs outside the plan's unit map. Empty since P2-U16 took ownership of
 * `src/cli.ts`: every file on disk now belongs to a planned unit, so nothing
 * skips the layering check. Kept as the declared escape hatch — a future stub
 * lands here rather than silently widening the map.
 */
const PLAN_MAP_WHITELIST: readonly string[] = [];

/**
 * Frozen waivers for layering drift that shipped before this gate existed: each
 * edge crosses units inside the same wave, or (failureLog) reaches one wave up.
 * Ratchet contract: rows may only be DELETED (when the underlying import goes
 * away); adding a row requires re-planning the wave map, not editing this list.
 */
const LAYERING_WAIVERS: ReadonlyMap<string, string> = new Map([
  [
    "src/resilience/failureLog.ts -> src/merge/atomicWrite.ts",
    "wave-2 failure log persists via the wave-3 atomic-write primitive",
  ],
  [
    "src/learnings/validation.ts -> src/content/frontmatter.ts",
    "wave-2 cross-unit reuse of the frontmatter parser (p1-20 -> p1-13)",
  ],
  [
    "src/handoffs/validation.ts -> src/content/frontmatter.ts",
    "wave-2 cross-unit reuse of the frontmatter parser (p1-21 -> p1-13)",
  ],
  // Retired in P5: src/pack/manifest.ts -> src/content/frontmatter.ts. The
  // manifest reader moved to wave 5 above the permission manifest, which put
  // the wave-2 frontmatter parser strictly below it — the edge stopped being a
  // violation, so the ratchet requires the row gone rather than kept.
  [
    "src/mcp/env.ts -> src/merge/atomicWrite.ts",
    "wave-3 cross-unit use of the atomic-write primitive (p1-26 -> p1-23)",
  ],
  [
    "src/hooks/scripts.ts -> src/tools/translator.ts",
    "wave-4 cross-unit use of the tool-name translator (p1-36 -> p1-30)",
  ],
]);

interface LayeringResult {
  readonly violations: readonly string[];
  readonly unmapped: readonly string[];
}

/** A file may import only same-unit or earlier-wave files, per the plan map. */
function checkWaveLayering(edges: readonly ImportEdge[]): LayeringResult {
  const violations = new Set<string>();
  const unmapped = new Set<string>();
  for (const edge of edges) {
    if (PLAN_MAP_WHITELIST.includes(edge.from)) continue;
    const fromEntry = PLAN_MAP[edge.from];
    const toEntry = PLAN_MAP[edge.to];
    if (fromEntry === undefined) {
      unmapped.add(edge.from);
      continue;
    }
    if (toEntry === undefined) {
      if (!PLAN_MAP_WHITELIST.includes(edge.to)) unmapped.add(edge.to);
      continue;
    }
    if (fromEntry.unit === toEntry.unit) continue;
    if (toEntry.wave < fromEntry.wave) continue;
    violations.add(`${edge.from} -> ${edge.to}`);
  }
  return { violations: [...violations].toSorted(), unmapped: [...unmapped].toSorted() };
}

// ---------------------------------------------------------------------------
// Rule 3: no runtime import cycles
// ---------------------------------------------------------------------------

/** Reports one representative path per runtime cycle; type-only edges are exempt. */
function findRuntimeCycles(edges: readonly ImportEdge[]): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.typeOnly) continue;
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }

  const cycles: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(node: string): void {
    state.set(node, "visiting");
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const nextState = state.get(next);
      if (nextState === "visiting") {
        cycles.push([...stack.slice(stack.indexOf(next)), next].join(" -> "));
      } else if (nextState === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, "done");
  }

  for (const node of [...adjacency.keys()].toSorted()) {
    if (!state.has(node)) visit(node);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Rule 4: completeness — everything reachable from an entrypoint
// ---------------------------------------------------------------------------

/** Files never reached from any program root over any edge kind. */
function findUnreachable(files: FileMap, edges: readonly ImportEdge[]): string[] {
  const visited = new Set(findReachable(files, edges));
  return [...files.keys()].filter((file) => !visited.has(file)).toSorted();
}

/**
 * Files that reach the composition root THROUGH the public entry.
 *
 * Boundary rule 5 keys on the direct edge, so a non-entrypoint that imports
 * `createApp`/`createEngine`/`VERSION` from `src/index.ts` — which re-exports
 * them — holds the composition privilege while every direct-edge check stays
 * green. That is the laundering path, and it is invisible to oxlint too: the
 * specifier it bans — a glob over `composition/` — never appears.
 */
function findCompositionLaunderers(files: FileMap): string[] {
  const named = new Set(["createApp", "createEngine", "VERSION"]);
  const launderers: string[] = [];
  for (const [file, source] of files) {
    if (ENTRYPOINTS.includes(file) || file.startsWith("src/composition/")) continue;
    const pattern = /^[ \t]*import[ \t]+(?!type[ \t])\{([^}]*)\}[ \t]*from[ \t]*["']([^"']+)["']/gm;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[2] ?? "";
      if (resolveInternal(file, specifier) !== "src/index.ts") continue;
      const names = (match[1] ?? "").split(",").map((entry) => entry.trim().split(/\s+as\s+/)[0] ?? "");
      if (names.some((name) => named.has(name))) launderers.push(file);
    }
  }
  return [...new Set(launderers)].toSorted();
}

/**
 * Launderers that exist today. SUBSET semantics, not the exact-set ratchet the
 * layering waivers use: this row's fix is an edit to `src/cli/kit/program.ts`
 * (hand the app and engine down from `src/cli.ts`, which is the entrypoint
 * entitled to build them), and that file and this suite are not written by the
 * same change. Exact equality would turn the repair into a red build for
 * whoever lands it first. A NEW launderer still fails.
 */
const KNOWN_COMPOSITION_LAUNDERERS: ReadonlySet<string> = new Set(["src/cli/kit/program.ts"]);

/** Edges whose target does not exist on disk (broken or extensionless specifier). */
function findBrokenEdges(files: FileMap, edges: readonly ImportEdge[]): string[] {
  return edges
    .filter((edge) => !files.has(edge.to))
    .map((edge) => `${edge.from} -> ${edge.to}`)
    .toSorted();
}

// ---------------------------------------------------------------------------
// Rule 5: call-site reachability — the registry does not count as a caller
// ---------------------------------------------------------------------------

const COMPOSITION_ROOT = "src/composition/root.ts";

/**
 * Modules reachable ONLY through the composition root's namespace imports.
 *
 * Rule 4 walks every edge, and root.ts imports every engine module, so it
 * answers "is this module wired". This walk drops root.ts's outgoing edges and
 * answers the different question "does anything CALL it". A module that
 * survives rule 4 and appears here is registry-wired and production-dead.
 *
 * Test imports are not edges at all here — the scanner only loads `src/` — so a
 * module exercised by a suite and by nothing else lands in this list, which is
 * the correct verdict: a test is not a production call site, and the failure
 * message says so rather than leaving the reader to infer it.
 */
function findRegistryOnlyModules(files: FileMap, edges: readonly ImportEdge[]): string[] {
  const wired = new Set(findReachable(files, edges));
  const called = new Set(findReachable(files, edges.filter((edge) => edge.from !== COMPOSITION_ROOT)));
  return [...wired].filter((file) => !called.has(file)).toSorted();
}

/** Files reached from {@link REACHABILITY_ROOTS} over `edges`. */
function findReachable(files: FileMap, edges: readonly ImportEdge[]): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }

  const visited = new Set<string>();
  const queue = REACHABILITY_ROOTS.filter((entry) => files.has(entry));
  for (const entry of queue) visited.add(entry);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next) && files.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return [...visited].toSorted();
}

/**
 * Modules that are registry-wired with no production call site TODAY.
 *
 * Ratchet, same contract as {@link LAYERING_WAIVERS}: rows may only be DELETED,
 * when the module gains a caller or leaves the tree. Adding a row means a new
 * module was wired into the registry and nothing calls it — wire it to its
 * caller or do not add it, because a registry entry is not a consumer.
 *
 * Per-module wire-or-retire is deliberately NOT this list's job: deciding, one
 * by one, whether the handoff store gets a command or the retry helper gets a
 * call site is design work, and doing it under a build gate would either rush
 * the design or park the gate. The gate lands first so nothing NEW joins the
 * set; the decisions land against a list that can now only shrink.
 */
const REGISTRY_ONLY_MODULES: ReadonlyMap<string, string> = new Map([
  [
    "src/content/mdcCompanions.ts",
    "authoring-time .mdc twin generator; the shipped Cursor emission renders its own (src/adapters/cursor.ts)",
  ],
  ["src/guard/outputBounds.ts", "deep-bounded copy for results crossing a size cap; nothing bounds a result yet"],
  ["src/guard/promptGuard.ts", "trust boundary for content crossing agent context; cited by two validator headers, imported by neither"],
  ["src/handoffs/store.ts", "handoff persistence; no command reads or writes one"],
  ["src/resilience/adapterTimeout.ts", "the one timeout wrapper; the plan composer awaits planners unwrapped"],
  ["src/resilience/failureClass.ts", "transient-vs-substantive classification; only a retry loop would read it"],
  ["src/resilience/retry.ts", "retry with backoff; no engine call site retries"],
  ["src/roster/triggers.ts", "specialist trigger table, consumed as prompt content rather than by engine code"],
  // Retired by the workspace cascade (W-U3): `stamity workspace sync` drives
  // `src/workspace/sync.ts` through the registry, which runs `resolveRepoConfig`
  // per member, reaches `normalizeRepoPathKey` in `src/workspace/manifest.ts`
  // for its duplicate check, and stamps every journal line with
  // `src/shared/runId.ts`. Four rows the lane's own command turned into real
  // call sites, deleted in the direction this ratchet allows.
]);

// ---------------------------------------------------------------------------
// Real-tree loading (the only fs access)
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function loadSourceTree(): FileMap {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.name.endsWith(".ts")) {
        const relative = path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
        files.set(relative, readFileSync(absolute, "utf8"));
      }
    }
  };
  walk(path.join(REPO_ROOT, "src"));
  return files;
}

const realTree = loadSourceTree();
const realEdges = scanImports(realTree);

// ---------------------------------------------------------------------------
// The oxlint import bans, read as data and exercised as a real lint run
// ---------------------------------------------------------------------------

interface RestrictedPattern {
  group: string[];
  message: string;
}

interface OxlintOverride {
  files: string[];
  rules: Record<string, unknown>;
}

const OXLINT_CONFIG_PATH = path.join(REPO_ROOT, ".oxlintrc.json");
const oxlintConfig = JSON.parse(readFileSync(OXLINT_CONFIG_PATH, "utf8")) as {
  overrides: OxlintOverride[];
};

/** The `no-restricted-imports` pattern list for one override, by its `files` key. */
function restrictedPatternsFor(files: string): RestrictedPattern[] {
  const override = oxlintConfig.overrides.find((entry) => entry.files.join(",") === files);
  if (override === undefined) throw new Error(`.oxlintrc.json has no override for ${files}`);
  const rule = override.rules["no-restricted-imports"];
  if (!Array.isArray(rule)) throw new Error(`${files}: no-restricted-imports is not a configured array`);
  const options = rule[1] as { patterns?: RestrictedPattern[] } | undefined;
  return options?.patterns ?? [];
}

/** The one group in an override whose message starts with `prefix`. */
function groupWithMessage(files: string, prefix: string): string[] {
  const pattern = restrictedPatternsFor(files).find((entry) => entry.message.startsWith(prefix));
  if (pattern === undefined) throw new Error(`${files}: no restricted-import group whose message starts "${prefix}"`);
  return pattern.group;
}

/** Immediate subdirectories of `src/`, from disk. */
function srcDirectories(): string[] {
  return readdirSync(path.join(REPO_ROOT, "src"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

/**
 * Run the repo's oxlint against a throwaway tree carrying the repo's own
 * config, so the bans are proven to FIRE rather than merely to be spelled.
 *
 * A temp directory rather than a seeded file under `src/`: a probe file in the
 * real tree would be seen by every other suite in the run (and by anyone else
 * working in the repo) for as long as it existed.
 */
const probeRoot = mkdtempSync(path.join(tmpdir(), "stamity-oxlint-"));
afterAll(() => {
  rmSync(probeRoot, { recursive: true, force: true });
});

/**
 * oxlint's own JS entry, resolved from its package manifest and run through
 * `process.execPath`.
 *
 * NOT `node_modules/.bin/oxlint`. That name is a shell shim, and on Windows the
 * shim is `oxlint.cmd` — a batch file. Since the CVE-2024-27980 fix (Node
 * 18.20.2 / 20.12.2 and every line after) `child_process.spawn` refuses to
 * launch a `.cmd`/`.bat` without `shell: true`, so spawning it fails EINVAL
 * before oxlint ever starts. Handing the batch file to a shell instead would
 * put cmd.exe's own quoting rules between this probe and its argv. The shim's
 * whole body is `node <pkg>/bin/oxlint`, so calling that directly is the same
 * invocation with no interpreter in the middle — one code path on every
 * platform, and no shell.
 */
const OXLINT_ENTRY = ((): string => {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("oxlint/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const relative = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.["oxlint"];
  if (relative === undefined) {
    throw new Error(`${manifestPath} declares no "oxlint" bin entry to run`);
  }
  return path.join(path.dirname(manifestPath), relative);
})();

function lintProbe(seed: Readonly<Record<string, string>>): string {
  rmSync(path.join(probeRoot, "src"), { recursive: true, force: true });
  writeFileSync(path.join(probeRoot, ".oxlintrc.json"), readFileSync(OXLINT_CONFIG_PATH, "utf8"));
  for (const [relative, contents] of Object.entries(seed)) {
    const absolute = path.join(probeRoot, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  // Pin the reporter: oxlint auto-selects `--format=github` under a GitHub Actions runner, and
  // since oxlint 1.79.0 that annotation format drops the per-pattern custom `message` (it survives
  // only in the `default` reporter's `help:` field). Without this the message assertions below pass
  // locally (default reporter) but fail in CI (github reporter). `default` keeps the invocation
  // deterministic across environments; the assertions are unchanged.
  const result = spawnSync(process.execPath, [OXLINT_ENTRY, "--format=default"], {
    cwd: probeRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.error !== undefined) {
    throw new Error(`could not run ${OXLINT_ENTRY}: ${result.error.message}`);
  }
  return `${result.stdout}${result.stderr}`;
}

// ---------------------------------------------------------------------------
// The gate over the real tree
// ---------------------------------------------------------------------------

describe("src import graph", () => {
  it("has no broken internal import specifiers", () => {
    expect(findBrokenEdges(realTree, realEdges)).toEqual([]);
  });

  it("violates none of the five boundary edges", () => {
    expect(checkBoundaries(realEdges)).toEqual([]);
  });

  it("keeps wave layering, with only the frozen waivers outstanding", () => {
    const { violations, unmapped } = checkWaveLayering(realEdges);
    expect(unmapped).toEqual([]);
    const waived = [...LAYERING_WAIVERS.keys()].toSorted();
    // Exact set equality is the ratchet: a new violation fails loudly, and a
    // waiver whose import disappeared must be deleted from the list.
    expect(violations).toEqual(waived);
  });

  it("has no runtime import cycles", () => {
    expect(findRuntimeCycles(realEdges)).toEqual([]);
  });

  /**
   * The one same-unit edge that climbs a wave (catalog wave 3 -> userContent
   * wave 5) is admitted by the plan map's same-unit rule, so this pins the
   * property that makes it harmless: it is a TYPE import, erased before
   * anything runs. Promoting it to a value import inverts a real layer and
   * fails here, which is the strictness the same-unit exemption would
   * otherwise have cost.
   */
  it("keeps the catalog's reference to the user-content vocabulary type-only", () => {
    const edge = realEdges.find(
      (candidate) =>
        candidate.from === "src/content/catalog.ts" && candidate.to === "src/content/userContent.ts",
    );
    expect(edge, "src/content/catalog.ts no longer references src/content/userContent.ts").toBeDefined();
    expect(
      edge?.typeOnly,
      "src/content/catalog.ts -> src/content/userContent.ts is now a RUNTIME import, which " +
        "puts a wave-3 module underneath a wave-5 one. Move the shared vocabulary into " +
        "src/types/, or re-plan both waves.",
    ).toBe(true);
  });

  it("reaches every src file from an entrypoint (nothing unwired)", () => {
    expect(findUnreachable(realTree, realEdges)).toEqual([]);
  });

  it("names every module the registry wires and nothing calls, and adds none", () => {
    const registryOnly = findRegistryOnlyModules(realTree, realEdges);
    const unexpected = registryOnly.filter((file) => !REGISTRY_ONLY_MODULES.has(file));
    const retired = [...REGISTRY_ONLY_MODULES.keys()].filter((file) => !registryOnly.includes(file));

    expect(
      unexpected,
      "wired into src/composition/root.ts with no production call site. The registry is not " +
        "a caller, and neither is a test suite: a module only a test imports is unreachable in " +
        "production. Give it a call site, or retire it — do not add a row to REGISTRY_ONLY_MODULES.",
    ).toEqual([]);
    expect(
      retired,
      "listed in REGISTRY_ONLY_MODULES but now genuinely called (or gone). The list may only " +
        "shrink — delete these rows.",
    ).toEqual([]);
  });

  it("proves the exclusion is the composition root's edges, not a blanket pass", () => {
    // Guard on the guard: a module with a real production call site must NOT be
    // reported, or the whole rule degrades into "everything root.ts imports".
    const registryOnly = findRegistryOnlyModules(realTree, realEdges);
    expect(registryOnly).not.toContain("src/content/catalog.ts");
    expect(registryOnly).not.toContain("src/emit/planner.ts");
    expect(registryOnly.length).toBeGreaterThan(0);
  });

  it("keeps the composition privilege out of the barrel: no NEW launderer", () => {
    const launderers = findCompositionLaunderers(realTree);
    expect(
      launderers.filter((file) => !KNOWN_COMPOSITION_LAUNDERERS.has(file)),
      "imports createApp/createEngine/VERSION from src/index.ts, which re-exports the " +
        "composition root — the direct-edge ban and the oxlint specifier ban both miss it. " +
        "Only the entrypoints build the app; take it as a parameter instead.",
    ).toEqual([]);
  });

  /**
   * The reachability escape hatch, closed from the other side. Declaring a
   * generator root exempts it from needing a CLI import; this asserts the
   * generator really does import it, so the exemption can never shelter a
   * module nothing runs.
   */
  it("wires every declared generator entrypoint into scripts/generate-docs.mjs", () => {
    const script = readFileSync(path.join(REPO_ROOT, "scripts/generate-docs.mjs"), "utf8");
    for (const entry of GENERATOR_ENTRYPOINTS) {
      const specifier = `../${entry}`;
      expect(script.includes(specifier), `generate-docs.mjs does not import ${entry}`).toBe(true);
      expect(realTree.has(entry), `${entry} is not on disk`).toBe(true);
    }
  });

  /** Generator roots stay out of the composition privilege rule 5 grants. */
  it("grants the composition-root import to the shipped entrypoints only", () => {
    for (const entry of GENERATOR_ENTRYPOINTS) {
      expect(ENTRYPOINTS).not.toContain(entry);
    }
    expect(ENTRYPOINTS).toEqual(["src/index.ts", "src/cli.ts"]);
  });

  it("matches the embedded plan map file-for-file", () => {
    const onDisk = [...realTree.keys()].toSorted();
    const planned = [...Object.keys(PLAN_MAP), ...PLAN_MAP_WHITELIST].toSorted();
    expect(onDisk).toEqual(planned);
  });
});

// ---------------------------------------------------------------------------
// Rule 6: the oxlint bans are live, not decorative
// ---------------------------------------------------------------------------

describe("oxlint import bans", () => {
  /**
   * The bug this case exists for: every group was written against `.js`
   * specifiers in a repo that imports with `.ts`, so the barrel ban and the
   * CLI-entry ban matched nothing at all. A group that names only `.js` is
   * inert by construction here.
   */
  it("targets this repo's .ts specifiers in every barrel and CLI group", () => {
    for (const files of [
      "src/**",
      "src/types/**",
      "src/config/**,src/shared/**,src/denyscan/**,src/roster/**",
      "src/composition/**",
    ]) {
      const barrel = groupWithMessage(files, "No internal barrels");
      const cli = groupWithMessage(files, "the engine never imports the CLI");
      expect(barrel, `${files}: barrel ban misses .ts`).toContain("**/index.ts");
      expect(cli, `${files}: CLI-entry ban misses .ts`).toContain("**/cli.ts");
    }
  });

  /**
   * The deny-lists are hand-maintained, and both had drifted two directories
   * behind the tree — so `src/types` and the kernel utilities could import
   * `src/adapters` and `src/migration` while the config claimed neither could
   * import anything internal.
   */
  it("denies every src directory the layering rules exclude, derived from disk", () => {
    // `types` is the leaf everyone may import; `cli` carries its own ban with
    // its own message, so it is excluded here rather than doubly listed.
    const expected = srcDirectories()
      .filter((name) => name !== "types" && name !== "cli")
      .map((name) => `**/${name}/**`)
      .toSorted();

    for (const [files, prefix] of [
      ["src/types/**", "src/types is a leaf"],
      ["src/config/**,src/shared/**,src/denyscan/**,src/roster/**", "wave-1 kernel utilities"],
    ] as const) {
      expect(groupWithMessage(files, prefix).toSorted(), `${files}: deny-list drifted from disk`).toEqual(
        expected,
      );
    }
  });

  it("reports a seeded barrel, CLI, composition, and types-leaf violation on .ts specifiers", () => {
    const output = lintProbe({
      "src/emit/probe.ts": [
        'import { createEngine } from "../index.ts";',
        'import { program } from "../cli.ts";',
        'import { app } from "../composition/root.ts";',
        "export const wired = [createEngine, program, app];",
      ].join("\n"),
      "src/types/probe.ts": ['import { merge } from "../merge/managedBlocks.ts";', "export const m = merge;"].join(
        "\n",
      ),
      "src/roster/probe.ts": [
        'import { claude } from "../adapters/claude.ts";',
        'import { detect } from "../migration/detect.ts";',
        "export const k = [claude, detect];",
      ].join("\n"),
    });

    expect(output).toContain("No internal barrels");
    expect(output).toContain("the engine never imports the CLI");
    expect(output).toContain("only the entrypoints may import the composition root");
    expect(output).toContain("src/types is a leaf");
    expect(output).toContain("../adapters/claude.ts");
    expect(output).toContain("../migration/detect.ts");
  });

  it("leaves the sanctioned edges alone: CLI-internal imports and the public entry", () => {
    const output = lintProbe({
      "src/cli.ts": [
        'import { createApp } from "./index.ts";',
        'import { addCommand } from "./cli/commands/add.ts";',
        'import { createEngine } from "./composition/root.ts";',
        "export const run = [createApp, addCommand, createEngine];",
      ].join("\n"),
      "src/cli/commands/add.ts": [
        'import { fail } from "../kit/output.ts";',
        'import type { App } from "../../index.ts";',
        "export const add = (a: App) => [fail, a];",
      ].join("\n"),
    });

    expect(output).not.toContain("no-restricted-imports");
  });
});

// ---------------------------------------------------------------------------
// Scanner self-tests on seeded fixtures (strings, not real files)
// ---------------------------------------------------------------------------

function fixture(entries: Record<string, string>): FileMap {
  return new Map(Object.entries(entries));
}

describe("scanner on seeded fixtures", () => {
  it("parses single-line, multiline, bare, and re-export forms", () => {
    const files = fixture({
      "src/hooks/scripts.ts": [
        'import { a } from "../types/errors.ts";',
        'import {\n  b,\n  c,\n} from "../types/core.ts";',
        'import "../types/markers.ts";',
        'export { d } from "../hooks/model.ts";',
        'import type { E } from "../types/manifest.ts";',
      ].join("\n"),
    });
    const edges = scanImports(files);
    const targets = edges.map((edge) => `${edge.to}${edge.typeOnly ? " (type)" : ""}`).toSorted();
    expect(targets).toEqual([
      "src/hooks/model.ts",
      "src/types/core.ts",
      "src/types/errors.ts",
      "src/types/manifest.ts (type)",
      "src/types/markers.ts",
    ]);
  });

  it("ignores external and builtin specifiers, and imports inside comments", () => {
    const files = fixture({
      "src/guard/promptGuard.ts": [
        'import path from "node:path";',
        'import { parse } from "yaml";',
        '// import fake from "../cli.ts";',
        ' * import fake from "../composition/root.ts";',
      ].join("\n"),
    });
    expect(scanImports(files)).toEqual([]);
  });

  it("flags a barrel import from an engine file, caught as a seeded violation", () => {
    const files = fixture({
      "src/merge/managedBlocks.ts": 'import { createEngine } from "../index.ts";',
    });
    const violations = checkBoundaries(scanImports(files));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("barrel-ban");
  });

  it("exempts the whole CLI layer consuming the public entry, not just the entry file", () => {
    const files = fixture({
      "src/cli.ts": 'import { createApp } from "./index.ts";',
      "src/cli/kit/program.ts": 'import { createEngine } from "../../index.ts";',
      "src/cli/commands/check.ts": 'import type { App } from "../../index.ts";',
    });
    expect(checkBoundaries(scanImports(files))).toEqual([]);
  });

  it("still bans every barrel but the public entry, the CLI layer included", () => {
    const files = fixture({
      "src/cli/commands/add.ts": 'import { pick } from "../../content/index.ts";',
    });
    const violations = checkBoundaries(scanImports(files));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("barrel-ban: src/cli/commands/add.ts -> src/content/index.ts");
  });

  it("keeps src/types a leaf, even for type-only imports", () => {
    const files = fixture({
      "src/types/core.ts": 'import type { M } from "../merge/managedBlocks.ts";',
      "src/types/manifest.ts": 'import type { T } from "./core.ts";',
    });
    const violations = checkBoundaries(scanImports(files));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("types-leaf: src/types/core.ts");
  });

  it("restricts kernel utilities to src/types and their own directory", () => {
    const files = fixture({
      "src/config/parse.ts": [
        'import { e } from "../types/errors.ts";',
        'import { helper } from "./helper.ts";',
        'import { tag } from "../content/tags.ts";',
      ].join("\n"),
    });
    const violations = checkBoundaries(scanImports(files));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("kernel: src/config/parse.ts -> src/content/tags.ts");
  });

  it("counts dynamic import() as an edge and bans engine imports of the CLI", () => {
    const files = fixture({
      "src/emit/substitution.ts": 'const cli = await import("../cli.ts");',
      "src/merge/safeWrite.ts": 'import { renderFailureHuman } from "../cli/kit/output.ts";',
    });
    const violations = checkBoundaries(scanImports(files));
    expect(violations).toEqual([
      "no-cli: src/emit/substitution.ts -> src/cli.ts (the engine never imports the CLI)",
      "no-cli: src/merge/safeWrite.ts -> src/cli/kit/output.ts (the engine never imports the CLI)",
    ]);
  });

  it("leaves CLI-internal edges to the wave map: no-cli is a direction, not a target", () => {
    const files = fixture({
      "src/cli.ts": 'import { addCommand } from "./cli/commands/add.ts";',
      "src/cli/commands/add.ts": 'import { CliFailure } from "../kit/output.ts";',
      "src/cli/kit/output.ts": 'import type { Palette } from "./terminal.ts";',
    });
    expect(checkBoundaries(scanImports(files))).toEqual([]);
  });

  it("reserves the composition root for the entrypoints", () => {
    const engineImport = 'import { createEngine } from "../composition/root.ts";';
    const violating = checkBoundaries(
      scanImports(fixture({ "src/guard/promptGuard.ts": engineImport })),
    );
    expect(violating).toHaveLength(1);
    expect(violating[0]).toContain("composition-top");

    const allowed = checkBoundaries(
      scanImports(
        fixture({
          "src/index.ts": 'import { createEngine } from "./composition/root.ts";',
          "src/cli.ts": 'import { createEngine } from "./composition/root.ts";',
        }),
      ),
    );
    expect(allowed).toEqual([]);
  });

  it("flags a later-wave import and names files missing from the plan map", () => {
    const files = fixture({
      // wave-0 file reaching into wave 6: layering violation.
      "src/types/errors.ts": 'import { install } from "../pack/install.ts";',
      // File the plan does not know: named, never silently passed.
      "src/wizard/new.ts": 'import { e } from "../types/errors.ts";',
    });
    const { violations, unmapped } = checkWaveLayering(scanImports(files));
    expect(violations).toEqual(["src/types/errors.ts -> src/pack/install.ts"]);
    expect(unmapped).toEqual(["src/wizard/new.ts"]);
  });

  it("reports runtime cycles but exempts type-only backedges", () => {
    const runtimeCycle = fixture({
      "src/hooks/model.ts": 'import { a } from "../hooks/userHooks.ts";',
      "src/hooks/userHooks.ts": 'import { b } from "../hooks/model.ts";',
    });
    expect(findRuntimeCycles(scanImports(runtimeCycle))).toHaveLength(1);

    const typeBackedge = fixture({
      "src/hooks/model.ts": 'import { a } from "../hooks/userHooks.ts";',
      "src/hooks/userHooks.ts": 'import type { B } from "../hooks/model.ts";',
    });
    expect(findRuntimeCycles(scanImports(typeBackedge))).toEqual([]);
  });

  it("names every file unreachable from the entrypoints", () => {
    const files = fixture({
      "src/index.ts": 'import { x } from "./composition/root.ts";',
      "src/composition/root.ts": 'import * as wired from "../merge/managedBlocks.ts";',
      "src/merge/managedBlocks.ts": "",
      "src/merge/orphan.ts": "",
    });
    expect(findUnreachable(files, scanImports(files))).toEqual(["src/merge/orphan.ts"]);
  });

  it("separates registry-wired from called: only the registry-only module is named", () => {
    const files = fixture({
      "src/cli.ts": 'import { called } from "./merge/managedBlocks.ts";',
      "src/index.ts": 'import { x } from "./composition/root.ts";',
      "src/composition/root.ts": [
        'import * as called from "../merge/managedBlocks.ts";',
        'import * as wiredOnly from "../merge/reclaim.ts";',
        "export const registry = { called, wiredOnly };",
      ].join("\n"),
      // Reached only from reclaim.ts, which is itself reached only from the
      // registry: transitively registry-only, and reported as such.
      "src/merge/reclaim.ts": 'import { helper } from "../shared/paths.ts";',
      "src/shared/paths.ts": "",
      "src/merge/managedBlocks.ts": "",
    });
    const edges = scanImports(files);

    // Rule 4 is satisfied — the registry makes everything reachable...
    expect(findUnreachable(files, edges)).toEqual([]);
    // ...and rule 5 is what shows two of those have no caller.
    expect(findRegistryOnlyModules(files, edges)).toEqual([
      "src/merge/reclaim.ts",
      "src/shared/paths.ts",
    ]);
  });

  it("flags a barrel import that names a composition export, and ignores one that does not", () => {
    const launderer = fixture({
      "src/cli/kit/program.ts": 'import { createEngine, renderHelp } from "../../index.ts";',
      "src/cli/commands/check.ts": 'import type { App } from "../../index.ts";',
      "src/cli/commands/add.ts": 'import { CONTENT_CLASSES } from "../../index.ts";',
      // The entrypoint itself holds the privilege by design.
      "src/cli.ts": 'import { createApp } from "./index.ts";',
      "src/index.ts": "",
    });
    expect(findCompositionLaunderers(launderer)).toEqual(["src/cli/kit/program.ts"]);
  });

  it("reports edges whose target file does not exist", () => {
    const files = fixture({
      "src/merge/reclaim.ts": 'import { gone } from "./deleted.ts";',
    });
    expect(findBrokenEdges(files, scanImports(files))).toEqual([
      "src/merge/reclaim.ts -> src/merge/deleted.ts",
    ]);
  });
});
