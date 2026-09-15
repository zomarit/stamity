import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { INVARIANTS_VERSION_TOKEN, type CharterInvariants } from "../emit/substitution.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { RULE_DELIVERY_DEFAULT, type RuleDelivery } from "../types/manifest.ts";
import { resolveBundledContentRoot } from "./contentRoot.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { demotedRuleIds, type RuleDeliveryInput } from "./ruleDelivery.ts";

/**
 * Charter loader — the one reader for the single `load: always` artifact.
 *
 * The charter is deliberately not a catalog content class: `CONTENT_CLASSES`
 * is the closed set the class-directory walk indexes, and the charter is one
 * fixed file with one fixed identity, not a roster that grows. It lives at
 * {@link CHARTER_RELATIVE_PATH} under the same bundled content root the
 * catalog reads, and emission (the adapter layer) consumes it through this
 * module rather than re-deriving the path.
 *
 * Two gates live here because they are properties of the charter itself, not
 * of any one consumer:
 *
 * - **Presence.** A corpus without its charter cannot emit a setup — the
 *   always-on slice would be empty. That is a corpus defect (`VALIDATION_ERROR`,
 *   exit 64), distinct from the content root failing to resolve at all
 *   (`CONFIG_ERROR` from the probe).
 * - **The charter's own budget.** {@link CHARTER_MAX_LINES} binds this physical
 *   file — frontmatter spends budget too, because the cap models what a session
 *   loads, not what a section contains. It binds the TEMPLATE and nothing else:
 *   the charter is not the whole always-on slice on any client, which is what
 *   {@link composeAlwaysOnLoad} and {@link ALWAYS_ON_BUDGET_LINES} measure.
 *
 * Frontmatter *shape* (load class, obsolete_when, tags) is the corpus test
 * suite's contract, shared with every other artifact; this loader stays thin
 * and hands the parsed map to the caller.
 *
 * Reads are per-call, never cached — unlike the content-root probe, which pins
 * one directory for the process. The template is data that changes underneath
 * a long-lived process legitimately (a package update, an editor mid-authoring,
 * a test mutating its fixture), and one stale always-on slice would silently
 * shape every emission after it.
 */

/** Where the charter template lives, POSIX-relative to the content root. */
export const CHARTER_RELATIVE_PATH = "charter/stamity-charter.md";

/**
 * Hard cap on the charter TEMPLATE's physical file lines.
 *
 * Not the always-on budget: this cap binds one file, and what a client actually
 * loads unconditionally is charter PLUS every rule that client has no way to
 * attach conditionally. {@link composeAlwaysOnLoad} computes that composite and
 * {@link ALWAYS_ON_BUDGET_LINES} bounds it per client.
 */
export const CHARTER_MAX_LINES = 150;

// ── The composite always-on slice ────────────────────────────────

/**
 * Clients whose RULE LAYER pulls a description-scoped rule (no globs) on
 * relevance rather than loading it every session.
 *
 * Cursor's apply-intelligently mode reads the rule `description` and pulls the
 * body in when the conversation matches (cursor.com/docs/context/rules,
 * accessed 2026-08-13), so a glob-less rule costs that client nothing until it
 * is relevant. It is still the only client with that primitive IN ITS RULE
 * LAYER, and that is what this set says.
 *
 * It is no longer the only client that defers such a rule, which is a
 * different sentence. Under the `on-demand` delivery mode claude and copilot
 * reach the same place through the skills layer instead: the rule is projected
 * as `.agents/skills/stamity-<id>/SKILL.md` and its body is loaded when the
 * description matches. So this set answers "can the client's rule layer defer
 * it", `../content/ruleDelivery.ts` answers "does this run defer it", and
 * {@link composeAlwaysOnLoad} reads both — the second one first, because a
 * demoted rule is not in the always-on slice on any client whatever its rule
 * layer can do.
 */
export const DESCRIPTION_PULL_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["cursor"]);

/**
 * Clients with no per-rule attach mechanism, which therefore carry every rule
 * they still receive as a rule in their always-on slice.
 *
 * Codex reads one `AGENTS.md`; the adapter down-converts the rule set into an
 * appendix on that file, so every rule it receives that way is unconditional
 * for codex and — because the root `AGENTS.md` is SHARED — the appendix is
 * paid by every co-selected client too. {@link ALWAYS_ON_SHARED_BYTES_WITH_CODEX}
 * is that cross-client cost in bytes.
 *
 * Under `on-demand` the set it receives that way is no longer the whole
 * corpus: `demotedRuleIds` leaves codex the rules that have to be in front of
 * the model unconditionally — `critical`, floor-tagged, or anchored to a
 * nested `AGENTS.md` — and projects the rest as skills. This set is unchanged
 * by that, because what it states is still true: whatever codex receives as a
 * rule, it loads every session.
 */
export const RULE_APPENDIX_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["codex"]);

/**
 * One rule, as the always-on computation reads it off the emission plan.
 *
 * The four delivery facts are {@link RuleDeliveryInput}'s, shared with the
 * predicate that decides demotion rather than restated here: this measurement
 * and the emission have to agree about which rules a client carries, and two
 * copies of the rule for that would be two chances to disagree — a slice
 * measured heavier than it is, or lighter, and the lighter one is the ratchet
 * silently passing a load nobody paid down.
 */
export interface AlwaysOnRule extends RuleDeliveryInput {
  /** Physical file lines, `wc -l` semantics — the same accounting as {@link CHARTER_MAX_LINES}. */
  lineCount: number;
}

/**
 * The always-on inputs, taken from the emission plan rather than a hand-kept
 * list: the rules a run emits are the rules a run loads, so a rule added,
 * dropped, or re-scoped moves this number without anything here being edited.
 */
export interface AlwaysOnPlan {
  /** Physical lines of the charter template ({@link CharterTemplate.lineCount}). */
  charterLines: number;
  /** Every rule the plan emits. Order is irrelevant; the result is a sum. */
  rules: readonly AlwaysOnRule[];
}

/**
 * Per-client ceiling on the composite always-on slice, in physical lines.
 *
 * These are RATCHET ceilings pinned at today's measured load, not a doctrine
 * target: what the ≤150-line budget should count — charter only, charter plus
 * unconditional rules, hook stdout as well — is an open sizing question, and
 * pinning a target before it is settled would either bless the current cost or
 * fail the build on a number nobody has ratified. What is settled is the
 * direction: the slice may shrink, never grow unnoticed. Every value below is
 * therefore a today-measurement, and lowering one as the slice shrinks is the
 * only edit this table should ever take.
 *
 * Read them against {@link CHARTER_MAX_LINES}, and read them under a DELIVERY
 * MODE, because that is what the numbers below now depend on:
 *
 * - Under `on-demand`, the shipped default since 2026-09-15, cursor, claude
 *   and copilot all pay the charter alone — cursor because its rule layer
 *   defers a glob-less rule natively, the other two because the same rules are
 *   projected as skills instead. Codex pays the charter plus the three rules
 *   it must keep unconditionally (`injection-screening`, `secrets`,
 *   `security-patterns`); the other nine are skills.
 * - Under `always-on`, still selectable per repo, the old shape holds: cursor
 *   the charter alone, claude and copilot plus every glob-less rule, codex
 *   plus the entire rule set — an order of magnitude over the template's cap.
 *
 * The ceilings are pinned to the DEFAULT mode, which is the load a repo
 * actually gets. A repo that selects `always-on` opts back into the larger
 * slice knowingly; this table does not describe that repo and does not try to.
 */
export const ALWAYS_ON_BUDGET_LINES: Readonly<Record<Tool, number>> = {
  // 97 -> 93 on 2026-09-12: the run-19 corpus repairs paid for their new charter
  // sentences by rewrapping the touchpoint index and the conditional layer, so
  // this client — which pays the charter alone — measures four lines lighter.
  // 93 -> 92 on 2026-09-12: the run-20 repairs rewrapped the opening and repo-facts
  // paragraphs to the same width and spent one of the two lines on invariant 1.
  // 92 -> 95 on 2026-09-15, and UP, which this table otherwise never goes. Five
  // lines land: three frontmatter keys (invariants_version/_ratified/_amended),
  // the `Invariants version` line under the heading, and the ai-evals floor line
  // in the conditional layer. Two are paid back by rewrapping the touchpoint
  // index and the conditional layer at the file's own widest line — same words,
  // fewer lines — and the remaining three are the frontmatter, which the
  // accounting counts because a session loads the whole file. The alternative
  // was to reword an invariant to buy the lines, which is the one edit the
  // block's hash pin exists to make deliberate. Net +3 on every client below.
  // DEVIATION, recorded rather than fixed: the touchpoint index and conditional
  // layer rewraps above ran to the file's own widest EXISTING line, not to the
  // plan's ≤100-char bound — several conditional-layer lines sit at ~103-117
  // chars (`content/charter/stamity-charter.md`, "## Conditional layer"). A
  // rewrap to 100 would renumber every line after it, and eval-cases-v6 pins
  // exact line numbers against this file's charter copy — so the width
  // violation stays rather than moving a fixture nobody asked to move. Revisit
  // together with the next line-count-changing edit to this section, not alone.
  // Held at 95 on 2026-09-15 under the `on-demand` flip: this client demotes
  // nothing — its own rule layer already defers a glob-less rule — so the
  // delivery change moves no line here. It is the control for the three below:
  // they now measure the same number for a different reason.
  cursor: 95,
  // 240 -> 236 on 2026-09-12: same four charter lines. These two clients pay the
  // charter plus the two glob-less rules, and neither of those grew a line.
  // Held at 236 on 2026-09-12: the run-20 charter saving funds ai-evals' net +1,
  // so the measured load is unchanged.
  // 236 -> 239 on 2026-09-15: the charter's net +3 above, unchanged rules.
  // 239 -> 95 on 2026-09-15, the same day, on the `on-demand` flip: the two
  // glob-less rules (`question-protocol` 74 lines, `ai-evals` 70) are projected
  // as `.agents/skills/stamity-<id>/SKILL.md` instead of loaded every session,
  // and they were the whole of what these clients paid beside the charter. What
  // remains is the charter alone — 239 - 144 = 95. Reclaimed, not deleted: the
  // bodies still reach the model, through a description the client matches.
  claude: 95,
  copilot: 95,
  // 1065 -> 1063 on 2026-09-10: Package 10 removes repeated security-reporting
  // prose while preserving the rule floors and repaired behavior. This client
  // loads the whole rule set, so its measured reduction tightens the ratchet.
  // Held at 1063 on 2026-09-12: the charter's -4 exactly funds the run-19 rule
  // repairs (+2 api-versioning, +1 testing, +1 injection-screening), so the
  // measured load is unchanged and the ratchet has nothing to give back. Held
  // again for run 20: every rule repair was paid inside its own file by an
  // identical-words rewrap, and the charter's -1 funds ai-evals' +1.
  // 1063 -> 1066 on 2026-09-15: the charter's net +3, same as above. This client
  // pays the whole rule set beside it, and no rule moved.
  // 1066 -> 407 on 2026-09-15, the same day, on the `on-demand` flip, and this
  // is the reclaim the whole option was for. Codex keeps only the rules that
  // have to be unconditional — `injection-screening` (109 lines, floor:security),
  // `secrets` (101, precedence: critical) and `security-patterns` (102,
  // floor:security) — so the slice is 95 + 312 = 407. The other nine rules are
  // projected as skills; the appendix, which used to drop eight rules to fit
  // 32 KiB, now drops none.
  codex: 407,
};

/**
 * Bytes of the SHARED root `AGENTS.md` when codex is among the selected tools —
 * the cross-client cost of selecting it.
 *
 * Selecting codex does not add a codex file: it rewrites the file every other
 * selected client already reads, so a claude+codex repo hands claude the codex
 * rules appendix too. Against {@link ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX} that
 * is ≈6.0x the always-on bytes every co-selected client pays — a today-measured
 * figure like the ceilings above, not a target.
 *
 * **A tripwire AND a published figure**, which are two different jobs.
 *
 * The tripwire: the corpus suite re-reads both numbers off the cross-client
 * emission golden (`test/emit/__snapshots__/crossClientGoldens.test.ts.snap`)
 * and fails when the two diverge, so the cost cannot move without a maintainer
 * editing this line and meeting the number. A golden refresh that moves the
 * cost is a two-line edit here plus a regeneration of the page below.
 *
 * The disclosure: `src/emit/capabilityMatrix.ts` renders both figures under
 * `## Always-on cost by client` on `docs/capability-matrix.md`, the page a
 * reader consults when choosing a client, with the sentence saying what
 * co-selecting codex costs the clients already there. DELIVERED, not open — the
 * corpus suite asserts the page carries both numbers and that heading, so the
 * day a regeneration drops them this paragraph cannot quietly stay false. That
 * is the failure an earlier wording of this comment had twice: first claiming a
 * disclosure that did not exist, then claiming its absence after it did.
 */
// 29_071 -> 29_935 across the run-19 and run-20 repairs on 2026-09-12: both add
// missing obligations to the charter and to the rules, so the charter and the
// rule appendix both grow in bytes. The line ratchets above came DOWN with the
// same edits — the charter gave back five lines to pay for its own sentences and
// for ai-evals — but this disclosure is measured bytes, not a cap, so it follows
// the golden up.
// 29_935 -> 30_123 on 2026-09-15: the invariants version line and the ai-evals
// floor line, +188 bytes of charter in a file whose rule appendix did not move.
// 30_123 -> 24_904 on 2026-09-15, the same day, on the `on-demand` flip. The
// appendix now carries three rules instead of the four that fitted, and the
// nine it no longer carries are projected as skills — so this is a real 5_219
// bytes off what every co-selected client reads, not bytes moved to another
// always-on file. The ratio against the figure below falls from ≈5.8x to ≈4.8x.
export const ALWAYS_ON_SHARED_BYTES_WITH_CODEX = 24_904;

/**
 * Bytes of the same shared file when codex is NOT selected — the charter alone.
 * Same tripwire, and the same delivered disclosure, as
 * {@link ALWAYS_ON_SHARED_BYTES_WITH_CODEX}.
 */
// 4_614 -> 5_004 on 2026-09-12: the charter's own +390 across the two repairs —
// invariant 1's refusal of a subset, a lighter pass, a deferral or a closing
// summary, and invariant 7's restated violation. The rule edits land in the
// appendix, which is exactly what this figure leaves out.
// 5_004 -> 5_192 on 2026-09-15: the invariants version line and the ai-evals
// floor line — the same +188, which is the whole of the change on this figure
// because nothing but the charter feeds it.
// Held at 5_192 on 2026-09-15 through the `on-demand` flip, and deliberately so:
// this file is the charter alone, delivery moves rules and not the charter, so a
// movement here would have meant the flip reached something it had no business
// reaching. Re-measured off the refreshed golden, unchanged.
export const ALWAYS_ON_SHARED_BYTES_WITHOUT_CODEX = 5_192;

/**
 * The composite always-on line count one client pays for a plan under a
 * delivery mode: the charter, plus every rule the client still receives as a
 * rule and cannot attach conditionally.
 *
 * Two filters, in this order, because the second only makes sense over what
 * survives the first:
 *
 * 1. **Delivery.** `demotedRuleIds(tool, rules, mode)` removes the rules this
 *    client does not receive as rule text at all — they are projected as
 *    skills. Under `always-on` it removes nothing and the rest of this function
 *    is the pre-option behaviour exactly.
 * 2. **Attachment**, over what is left:
 *    - {@link DESCRIPTION_PULL_TOOLS} pay the charter alone.
 *    - Clients without that primitive add every description-scoped (glob-less)
 *      rule, which has no attach trigger and so loads every session.
 *    - {@link RULE_APPENDIX_TOOLS} add EVERY remaining rule, glob-scoped
 *      included, because the client has no per-rule mechanism and the adapter
 *      folds the set into the always-on document.
 *
 * The demotion filter is READ from `ruleDelivery.ts`, never re-derived: the
 * adapters skip exactly these ids and the projection emits exactly these
 * skills, so a second predicate here would let the measurement and the
 * emission disagree — and the disagreement that matters is the silent one,
 * a slice measured lighter than what the client actually loads.
 *
 * The appendix figure is an upper bound: that client caps its single document
 * at 32 KiB and the adapter drops the tail of the rule set to fit. Counting the
 * dropped rules is deliberate — a rule silently dropped is a floor that stopped
 * binding, which is a loss to report, not a budget saving to bank. Under
 * `on-demand` on the shipped corpus the shaper drops nothing, because what
 * reaches the appendix is three floor-class rules.
 *
 * `mode` defaults to {@link RULE_DELIVERY_DEFAULT} so a caller measuring "what
 * a repo gets" needs no argument, and a caller measuring a specific manifest
 * passes that manifest's value.
 */
export function composeAlwaysOnLoad(
  tool: Tool,
  plan: AlwaysOnPlan,
  mode: RuleDelivery = RULE_DELIVERY_DEFAULT,
): number {
  const demoted = demotedRuleIds(tool, plan.rules, mode);
  const unconditional = plan.rules.filter((rule) => {
    if (demoted.has(rule.id)) return false;
    if (RULE_APPENDIX_TOOLS.has(tool)) return true;
    if (DESCRIPTION_PULL_TOOLS.has(tool)) return false;
    return !rule.globScoped;
  });
  return unconditional.reduce((total, rule) => total + rule.lineCount, plan.charterLines);
}

/** The loaded charter template, split and measured. */
export interface CharterTemplate {
  /** Parsed frontmatter map; field validation is the corpus contract's job. */
  frontmatter: Record<string, unknown>;
  /**
   * The three invariants-version keys, read typed and validated here rather
   * than left in {@link frontmatter} as `unknown`. They are the exception to
   * this loader's "shape is the corpus suite's contract" rule because emission
   * RESOLVES them: `${STAMITY:INVARIANTS_VERSION}` renders into every client's
   * always-on file, so a missing or malformed key would ship a leaked template
   * variable — or a wrong version stamped on the floors themselves — to every
   * generated repo. Refusing at load is the only place that cannot be skipped.
   *
   * `null` only for a template that declares NO version and carries no token
   * to render one — a charter that never entered the versioning scheme. The
   * moment either appears, all three keys are required: a body that asks for a
   * version it cannot get is the failure this refuses, and a head that names a
   * version nothing renders is the same defect from the other side.
   */
  invariants: CharterInvariants | null;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Physical line count of the whole file, frontmatter included (`wc -l` semantics). */
  lineCount: number;
  /** {@link CHARTER_RELATIVE_PATH}, echoed so consumers carry one path spelling. */
  relativePath: string;
}

/**
 * Read and gate the charter template.
 *
 * `contentRoot` defaults to the bundled corpus root; tests and tooling pass an
 * explicit directory. Throws `VALIDATION_ERROR` when the file is absent or over
 * {@link CHARTER_MAX_LINES}, `VALIDATION_ERROR` from the frontmatter parser when
 * the YAML head is malformed, and `FS_ERROR` for any other read failure.
 */
export async function readCharterTemplate(contentRoot?: string): Promise<CharterTemplate> {
  const root = contentRoot ?? resolveBundledContentRoot();
  const filePath = join(root, CHARTER_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissing(error)) {
      throw new EngineError(
        `Charter template not found at ${filePath}. The charter is the single always-on ` +
          `artifact; a corpus without it cannot emit a setup. Reinstall the package, or ` +
          `restore ${CHARTER_RELATIVE_PATH} under the content root.`,
        { code: "VALIDATION_ERROR", cause: error },
      );
    }
    throw new EngineError(`Cannot read the charter template at ${filePath}: ${messageOf(error)}`, {
      code: "FS_ERROR",
      cause: error,
    });
  }

  const lineCount = countLines(raw);
  if (lineCount > CHARTER_MAX_LINES) {
    throw new EngineError(
      `Charter template ${filePath} is ${lineCount} lines; the always-on budget caps it at ` +
        `${CHARTER_MAX_LINES} physical lines, frontmatter included. Cut content or demote it ` +
        `to the conditional layer (rules/skills).`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const parsed = parseFrontmatter(raw, filePath);
  return {
    frontmatter: parsed.frontmatter,
    invariants: readInvariants(parsed.frontmatter, parsed.body, filePath),
    body: parsed.body,
    lineCount,
    relativePath: CHARTER_RELATIVE_PATH,
  };
}

/** The frontmatter keys that carry the invariants version; all three or none. */
const INVARIANTS_KEYS = [
  "invariants_version",
  "invariants_ratified",
  "invariants_amended",
] as const;

/** `MAJOR.MINOR.PATCH`, digits only — the shape `GOVERNANCE.md` bumps. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

/** ISO calendar date, `YYYY-MM-DD`; ordering below is plain string comparison. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the three invariants keys off the frontmatter, refusing anything the
 * emitted line could not honestly carry.
 *
 * The keys are required of a charter that PARTICIPATES in versioning — one
 * whose body carries {@link INVARIANTS_VERSION_TOKEN}, or whose head names any
 * one of the three keys. A template with neither predates the scheme and loads
 * unversioned; there is nothing for it to render and nothing to be wrong. What
 * that rules out is the only dangerous pair: a body asking for a version its
 * head does not declare, which would emit a raw template variable into every
 * client's always-on file.
 *
 * Every rejection names the KEY, not just the file: the charter is one file
 * with ten head fields, and "malformed frontmatter" sends the reader looking
 * at all of them. The date comparison is lexical, which is exact for a
 * zero-padded ISO calendar date and needs no date parsing — an `amended`
 * earlier than `ratified` is a transcription slip, and it would publish an
 * amendment history that runs backwards.
 */
function readInvariants(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string,
): CharterInvariants | null {
  const declared = INVARIANTS_KEYS.some((key) => Object.hasOwn(frontmatter, key));
  if (!declared && !body.includes(INVARIANTS_VERSION_TOKEN)) return null;

  const version = requireField(frontmatter, "invariants_version", SEMVER_PATTERN, filePath);
  const ratified = requireField(frontmatter, "invariants_ratified", ISO_DATE_PATTERN, filePath);
  const amended = requireField(frontmatter, "invariants_amended", ISO_DATE_PATTERN, filePath);
  if (amended < ratified) {
    throw new EngineError(
      `Charter template ${filePath}: invariants_amended (${amended}) is earlier than ` +
        `invariants_ratified (${ratified}). An amendment cannot predate the ratification it ` +
        `amends; fix whichever date is wrong.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return { version, ratified, amended };
}

/** One frontmatter field as a string matching `pattern`, or a named refusal. */
function requireField(
  frontmatter: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  filePath: string,
): string {
  const value = Object.hasOwn(frontmatter, key) ? frontmatter[key] : undefined;
  if (value === undefined) {
    throw new EngineError(
      `Charter template ${filePath} declares no \`${key}\`. The invariants version is rendered ` +
        `into every client's always-on file, so the key is required; add it to the frontmatter ` +
        `and record the amendment in docs/doctrine.md.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  // A bare `1.0` version or an unquoted date can reach here as a number or a
  // Date depending on the YAML scalar. `String(number)` can still match the
  // pattern (a version IS digits), but `String(Date)` never matches the ISO
  // `YYYY-MM-DD` regex below — `Date`'s own string form ("Mon Sep 15 2026...")
  // is nothing like it. So the coercion does not let an unquoted date PASS;
  // what it buys is the refusal message below reading the value a human wrote
  // ("2026-09-15") instead of `[object Date]`, which `typeof value ===
  // "string"` alone would have produced.
  const text = typeof value === "string" ? value : String(value);
  if (!pattern.test(text)) {
    throw new EngineError(
      `Charter template ${filePath}: \`${key}\` is \`${text}\`, which does not match ` +
        `${pattern.source}. Fix the frontmatter value.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return text;
}

/**
 * Physical lines, `wc -l` style: a trailing newline terminates the last line
 * rather than opening an empty one, and a final line without a newline still
 * counts. Empty file → 0.
 */
function countLines(raw: string): number {
  if (raw === "") return 0;
  const lines = raw.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

/**
 * Absence in every form the path can meet it: no entry, or a path segment that
 * is not a directory. Anything else — permissions, I/O — is a real failure.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
