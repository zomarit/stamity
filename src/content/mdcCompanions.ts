/**
 * Cursor `.mdc` companions: the generated twin every rule gets so Cursor can
 * decide when to load it.
 *
 * A rule is authored once as markdown with a portable `scope:` declaration.
 * Cursor reads a different vocabulary — `alwaysApply` and `globs` — so the
 * companion is a mechanical projection of the source rule, never a second
 * source of truth: the frontmatter is derived, and the body is copied
 * byte-for-byte. That byte-identity is the property that makes the companion
 * regenerable and drift-checkable; a companion whose body has drifted from its
 * `.md` is a defect, not a customization.
 *
 * The scope transform, complete:
 *
 * | `scope`           | `globs`   | emitted                                  |
 * |-------------------|-----------|------------------------------------------|
 * | `always`          | any       | `VALIDATION_ERROR` — refused by name     |
 * | `agent-requested` | none      | `alwaysApply: false`                     |
 * | `conditional`     | declared  | `globs: [...]` + `alwaysApply: false`    |
 * | `conditional`     | none      | `alwaysApply: false` (deprecated; warns) |
 * | absent            | none      | `alwaysApply: false`                     |
 * | absent            | declared  | `globs: [...]` + `alwaysApply: false` (warns) |
 * | `agent-requested` | declared  | `VALIDATION_ERROR` — contradiction       |
 *
 * `alwaysApply: true` is never emitted. The always-on layer is the charter, so
 * a rule declaring `scope: always` is refused by name — the same refusal, in
 * the same words, that the production Cursor emission makes
 * (`../adapters/cursor.ts`). The local `always` arm this file used to carry
 * emitted `alwaysApply: true` instead, which made it a second transform
 * sanctioning the one shape the doctrine abolishes, and the corpus suites that
 * gate rules through this module were therefore gating them against the wrong
 * contract.
 *
 * What holds the two generators to one contract, stated exactly: a test, not a
 * shared call. The shipped emission decides in its own local arms
 * (`buildMdcRule`) and does not import {@link resolveRuleActivation}, or
 * anything else from this file. What pins them is a case that builds one rule
 * through each and asserts the refusals come back byte-identical — for
 * `scope: always` and for the scope/globs contradiction alike
 * (`test/content/mdcCompanions.test.ts`). Drift is caught by that assertion
 * rather than made unreachable by construction, which is a weaker guarantee and
 * is named here as one. Routing the emission through this module would make it
 * the stronger kind; rewrite this paragraph if that happens.
 *
 * `always` stays in {@link RULE_SCOPES} deliberately. Dropping it would report
 * an always-scoped rule as an unknown-scope typo; keeping it lets the refusal
 * name what the author asked for and where that content belongs.
 *
 * `agent-requested` is Cursor's apply-intelligently mode: description-driven,
 * no globs, so the agent pulls the rule in when the conversation is relevant
 * (cursor.com/docs/context/rules, accessed 2026-08-13). The two warned rows are
 * tolerated on READ and never emitted by authoring: a rule that declares globs
 * without a scope, or a glob-less `conditional`, still produces a working
 * companion rather than failing a whole run over a frontmatter shape.
 *
 * A declared scope that contradicts declared globs is the other hard failure.
 * It cannot be resolved by guessing: honouring the scope silently drops the
 * paths the author scoped, and honouring the globs silently auto-attaches a
 * rule its author declared description-driven. Both fail invisibly — the rule
 * simply never fires where it was meant to.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { requireEnum, requireString } from "../config/parse.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import type { CatalogItem } from "./catalog.ts";
import { parseFrontmatter } from "./frontmatter.ts";

/** One planned companion file. Pure data — nothing is written until a caller says so. */
export interface MdcCompanion {
  /** Absolute path of the `.md` rule the companion projects. */
  sourcePath: string;
  /** Absolute path of the `.mdc` file to write. */
  outputPath: string;
  /** Full companion text: derived frontmatter over the source body. */
  content: string;
}

/** Shared options for the companion builders. */
export interface CompanionOptions {
  /**
   * Sink for tolerated-but-deprecated frontmatter shapes. Absent means the
   * notices are dropped — a companion is still produced either way, so a
   * caller with nowhere to surface them is not forced to collect them.
   */
  warnings?: string[] | undefined;
}

/** Options for the single-artifact transform. */
export interface CompanionFrontmatterOptions extends CompanionOptions {
  /** Label prefixed to messages — a path or artifact name. */
  source?: string | undefined;
}

/**
 * Accepted `scope:` values. Anything else is a typo and is rejected, not
 * guessed. `always` is accepted by the PARSER and refused by
 * {@link resolveRuleActivation} — see the transform table above.
 */
const RULE_SCOPES = ["always", "agent-requested", "conditional"] as const;

/** A declared rule scope. */
export type RuleScope = (typeof RULE_SCOPES)[number];

const DESCRIPTION_FIELD = "description";
const SCOPE_FIELD = "scope";
const GLOBS_FIELD = "globs";

const MD_EXTENSION = ".md";
const MDC_EXTENSION = ".mdc";

/** Concurrent reads and writes; matches the catalog walk's read concurrency. */
const IO_CONCURRENCY = 8;

/**
 * Project one rule's frontmatter into a Cursor `.mdc` frontmatter block
 * (fenced, no trailing newline) per the transform table above.
 *
 * Only the three keys Cursor reads are emitted. Everything else the source
 * declares — `id`, `tags`, `precedence` — is engine vocabulary consumed before
 * emission (ordering, filtering, ownership) and would be inert noise in a
 * companion.
 *
 * Throws `VALIDATION_ERROR` for an unknown `scope`, a malformed `globs`, or a
 * scope that contradicts declared globs.
 */
export function cursorCompanionFrontmatter(
  mdFrontmatter: Record<string, unknown>,
  options: CompanionFrontmatterOptions = {},
): string {
  const source = options.source ?? "rule frontmatter";
  const description =
    requireString(mdFrontmatter, DESCRIPTION_FIELD, { source, optional: true }) ?? "";
  const scope = requireEnum(mdFrontmatter, SCOPE_FIELD, RULE_SCOPES, { source, optional: true });
  const globs = readGlobs(mdFrontmatter, source);

  const lines = [
    `${DESCRIPTION_FIELD}: ${descriptionScalar(description)}`,
    ...activationLines(scope, globs, source, options.warnings),
  ];
  return `---\n${lines.join("\n")}\n---`;
}

/**
 * Plan the companion for every rule in `rules`. Pure and synchronous: it names
 * paths without reading or writing any of them, so a caller can diff a planned
 * companion against what is on disk before deciding to write.
 *
 * Non-rule artifacts yield no companion, so an unfiltered catalog listing can
 * be passed straight in.
 */
export function planMdcCompanions(
  rules: readonly CatalogItem[],
  options: CompanionOptions = {},
): MdcCompanion[] {
  return rules
    .filter((item) => item.type === "rule")
    .map((rule) => ({
      sourcePath: rule.filePath,
      outputPath: companionPathFor(rule.filePath),
      content: companionContent(rule.frontmatter, rule.body, {
        source: rule.relativePath,
        warnings: options.warnings,
      }),
    }));
}

/**
 * Regenerate the companions for a directory of `.md` rules and return the paths
 * written, in directory order.
 *
 * Companions are generated artifacts: an existing `.mdc` is overwritten
 * wholesale, edits included. Hand-editing one is editing a build output — the
 * change belongs in the `.md` beside it, which is also the only file a
 * regeneration preserves.
 *
 * Each write goes through the atomic temp+rename writer, so an interrupted run
 * leaves either the previous companion or the new one, never a half-written
 * file that Cursor would parse as a rule with no activation. A missing
 * directory is not a failure — a target with no rules has no companions.
 * Documents without a frontmatter block are skipped: those are READMEs and
 * notes, not rules.
 */
export async function generateMdcCompanions(
  rulesDir: string,
  options: CompanionOptions = {},
): Promise<string[]> {
  const entries = await listMarkdown(rulesDir);
  const sources = await pLimit(IO_CONCURRENCY).map(entries, async (entry) => {
    const sourcePath = join(rulesDir, entry);
    const raw = await readFile(sourcePath, "utf8").catch(nullOnMissing);
    return raw === null ? null : { entry, sourcePath, raw };
  });

  // Every companion is composed before the first write: a rejected frontmatter
  // shape fails the run with nothing written, rather than half the directory
  // regenerated beside a half that is still stale.
  const companions: MdcCompanion[] = sources.flatMap((source) => {
    if (source === null) return [];
    const parsed = parseFrontmatter(source.raw, source.entry);
    if (!parsed.hadFrontmatter) return [];
    return [
      {
        sourcePath: source.sourcePath,
        outputPath: companionPathFor(source.sourcePath),
        content: companionContent(parsed.frontmatter, parsed.body, {
          source: source.entry,
          warnings: options.warnings,
        }),
      },
    ];
  });

  await pLimit(IO_CONCURRENCY).map(companions, (companion) =>
    atomicWriteFile(companion.outputPath, companion.content),
  );
  return companions.map((companion) => companion.outputPath);
}

/** Derived frontmatter over the untouched source body. */
function companionContent(
  frontmatter: Record<string, unknown>,
  body: string,
  options: CompanionFrontmatterOptions,
): string {
  return `${cursorCompanionFrontmatter(frontmatter, options)}\n${body}`;
}

/** The `.mdc` path beside a `.md` source. */
function companionPathFor(mdPath: string): string {
  const stem = mdPath.endsWith(MD_EXTENSION) ? mdPath.slice(0, -MD_EXTENSION.length) : mdPath;
  return `${stem}${MDC_EXTENSION}`;
}

/**
 * How a rule attaches, once its declared scope and globs have been reconciled.
 * Client-neutral by design, so a renderer can be added beside the existing one
 * without a second decision: the verdict carries no dialect and rendering is
 * the caller's. This module renders it as a JSON `globs` array; the production
 * Cursor emission's unquoted comma-separated list is rendered from that
 * emission's own local arms, not from this type — the neutrality is available
 * to it, not yet taken up.
 */
export type RuleActivation =
  /** Description-driven: the client decides when to pull the rule in. */
  | { readonly kind: "description-driven" }
  /** Auto-attach on paths. `globs` is non-empty, trimmed and de-duplicated. */
  | { readonly kind: "glob-attached"; readonly globs: readonly string[] };

/**
 * This module's one activation decision: every companion built here — single
 * artifact, planned, or regenerated — reaches its verdict through this
 * function rather than through a branch per builder. Rendering is the caller's.
 *
 * Scope of that claim is this file. The production Cursor emission is NOT a
 * caller: `../adapters/cursor.ts::buildMdcRule` carries its own arms and
 * imports nothing from here. Exported so a test can drive the verdict directly
 * and assert this module's refusals byte-equal against that emission's — that
 * assertion is what keeps the two from drifting into two contracts, and it is
 * the only thing that does.
 *
 * Throws `VALIDATION_ERROR` for `scope: always` (no client emission is
 * always-applied — that layer is the charter) and for a scope that contradicts
 * declared globs. Tolerated-but-deprecated shapes push a line onto `warnings`
 * and still resolve.
 */
export function resolveRuleActivation(
  scope: RuleScope | undefined,
  globs: readonly string[],
  source: string,
  warnings?: string[] | undefined,
): RuleActivation {
  if (scope === "always") {
    // Verbatim the production emission's refusal (`../adapters/cursor.ts`):
    // one shape, one verdict, one sentence an author can act on.
    throw new EngineError(
      `${source} declares \`${SCOPE_FIELD}: always\`, which this client would emit as an ` +
        `always-applied rule. Rules attach on globs; content that must bind every ` +
        `session belongs in the AGENTS.md charter. Give the rule \`${SCOPE_FIELD}: conditional\` ` +
        `with \`${GLOBS_FIELD}\`, or \`${SCOPE_FIELD}: agent-requested\`, or move it into the charter.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  if (scope === "agent-requested" && globs.length > 0) {
    throw new EngineError(
      `${source} declares \`${SCOPE_FIELD}: agent-requested\` and \`${GLOBS_FIELD}\`, which name two ` +
        `different activation modes: description-driven, and auto-attach on those paths. ` +
        `Declare \`${SCOPE_FIELD}: conditional\` to attach on the globs, or drop the \`${GLOBS_FIELD}\` line ` +
        `to keep the rule description-driven.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  if (globs.length === 0) {
    if (scope === "conditional") {
      warnings?.push(
        `${source}: \`${SCOPE_FIELD}: conditional\` without \`${GLOBS_FIELD}\` is the ` +
          `deprecated glob-less form; emitted as description-driven ` +
          `(\`alwaysApply: false\`). Declare \`${SCOPE_FIELD}: agent-requested\`.`,
      );
    }
    return { kind: "description-driven" };
  }

  if (scope === undefined) {
    warnings?.push(
      `${source}: \`${GLOBS_FIELD}\` declared without a \`${SCOPE_FIELD}\`; read as ` +
        `\`${SCOPE_FIELD}: conditional\`. Declare the scope.`,
    );
  }
  return { kind: "glob-attached", globs };
}

/**
 * The activation half of the block: `alwaysApply`, plus `globs` when
 * auto-attached. Renders {@link resolveRuleActivation}'s verdict; it decides
 * nothing itself, which is what keeps this module from holding a second
 * decision point beside the one above.
 */
function activationLines(
  scope: RuleScope | undefined,
  globs: readonly string[],
  source: string,
  warnings: string[] | undefined,
): string[] {
  const activation = resolveRuleActivation(scope, globs, source, warnings);
  if (activation.kind === "description-driven") return ["alwaysApply: false"];
  const rendered = activation.globs.map((glob) => JSON.stringify(glob)).join(", ");
  return [`${GLOBS_FIELD}: [${rendered}]`, "alwaysApply: false"];
}

/**
 * Declared globs as a de-duplicated list, from either authoring shape: a YAML
 * list, or the comma-separated string a one-line frontmatter uses. An empty
 * value (`globs:`) reads as absent, which is how the deprecated glob-less
 * conditional reaches its branch.
 */
function readGlobs(frontmatter: Record<string, unknown>, source: string): string[] {
  const value = Object.hasOwn(frontmatter, GLOBS_FIELD) ? frontmatter[GLOBS_FIELD] : undefined;
  if (value === undefined || value === null) return [];

  if (typeof value === "string") return dedupe(value.split(","));
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return dedupe(value);
  }
  throw new EngineError(
    `${source}: \`${GLOBS_FIELD}\` must be a list of glob strings or one comma-separated ` +
      `string (got ${describeGlobs(value)}).`,
    { code: "VALIDATION_ERROR" },
  );
}

/** Trimmed, non-empty, first occurrence wins — a repeated glob must not double-attach. */
function dedupe(globs: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const glob of globs) {
    const value = glob.trim();
    if (value !== "") seen.add(value);
  }
  return [...seen];
}

function describeGlobs(value: unknown): string {
  if (Array.isArray(value)) return "an array with a non-string entry";
  return value === null ? "null" : typeof value;
}

/**
 * Render a description as a single-line frontmatter scalar that cannot escape
 * its own line.
 *
 * A line break is the injection vector: a description carrying one would append
 * whatever follows as a frontmatter key, and `alwaysApply: true` smuggled that
 * way turns an opt-in rule into an always-on one. Runs of line breaks collapse
 * to a single space first; a value that would then corrupt the plain-scalar
 * parse — an interior quote or backslash, a `: ` mapping indicator, a ` #`
 * comment introducer, or a leading YAML indicator — is emitted JSON-quoted,
 * which is a valid YAML double-quoted scalar. Well-formed one-line descriptions
 * pass through unquoted and unchanged.
 */
function descriptionScalar(description: string): string {
  const singleLine = description.replace(/\s*[\r\n]+\s*/g, " ").trim();
  if (singleLine === "") return singleLine;
  const needsQuoting =
    /["\\]/.test(singleLine) ||
    // `: ` (or a trailing `:`) reads as a mapping indicator inside a plain scalar.
    /:(\s|$)/.test(singleLine) ||
    // ` #` opens a YAML comment, silently truncating the description.
    /\s#/.test(singleLine) ||
    // Leading c-indicators cannot open a plain scalar (YAML 1.2 §7.3.3); `-`, `?`
    // and `:` only when whitespace follows.
    /^(?:[,[\]{}#&*!|>'%@`]|[-?:](?:\s|$))/.test(singleLine);
  return needsQuoting ? JSON.stringify(singleLine) : singleLine;
}

/** `.md` entries in codepoint order, or none when the directory is absent. */
async function listMarkdown(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MD_EXTENSION))
    .map((entry) => entry.name)
    .toSorted();
}

/** A source file that vanished between the listing and the read is not a failure. */
function nullOnMissing(error: unknown): null {
  if (isMissing(error)) return null;
  throw error;
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}
