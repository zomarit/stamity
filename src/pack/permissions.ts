import { isAbsolute, normalize } from "node:path";
import { isPlainObject, rejectUnknownFields, requireStringArray } from "../config/parse.ts";
import {
  ALL_TOOL_CATEGORIES,
  FUNCTIONAL_TOOL_CATEGORIES,
  isReservedToolCategory,
  isToolCategory,
} from "../tools/categories.ts";
import { EngineError } from "../types/errors.ts";

/**
 * Pack permission manifest — the pack's own disclosure of what its
 * content needs at runtime. Together with the manifest's `declaredTools` it
 * forms the full declaration: declared tools + tool footprint + declared
 * touched paths.
 *
 * - `toolFootprint` — tool-category ids from the shared taxonomy
 *   (`../tools/categories.ts`): the privilege classes the pack's workflows
 *   exercise, in client-neutral vocabulary.
 * - `touchedPaths` — repo-relative paths (a single trailing `/**` glob
 *   allowed) the pack's workflows may touch once installed.
 *
 * The block is DECLARATIVE. It parses as strictly as the rest of `pack.json`
 * (unknown keys refused, offending values named) and is surfaced in the
 * install preview and the post-install receipt, so the operator reads what the
 * pack claims to need before a byte lands. Enforcement against content stays
 * with the cross-check gates — `checkDeclaredTools` in `./manifest.ts` is the
 * exemplar — while {@link checkPermissions} records presence, not compliance.
 *
 * This module also owns {@link assertSafePackRelPath}, the pack-path refusal
 * vocabulary. It sits here, below `./manifest.ts` (which re-exports it
 * unchanged), so the manifest's integrity keys and this block's `touchedPaths`
 * refuse identical shapes without an import cycle.
 */

/** Message label for the block; the file constant itself lives in `./manifest.ts`. */
const PERMISSIONS_SOURCE = "pack.json `permissions`";

const PERMISSIONS_FIELDS = ["toolFootprint", "touchedPaths"] as const;

/** The one glob form `touchedPaths` supports: everything under a directory. */
const GLOB_SUFFIX = "/**";

export interface PackPermissions {
  /** Tool-category ids (validated against the taxonomy) the pack's workflows exercise. */
  toolFootprint?: string[];
  /** Repo-relative paths, each optionally ending in `/**`, the workflows may touch. */
  touchedPaths?: string[];
}

// ── Path vocabulary ────────────────────────────────────────────

/**
 * First C0 or DEL control character in `value`, as a `U+XXXX` label, or
 * `undefined` when there is none. Written as a code-point scan rather than a
 * regex so the control range is stated in the source instead of hidden in an
 * escape class.
 */
function firstControlChar(value: string): string | undefined {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    }
  }
  return undefined;
}

/**
 * Refuse any declared relative path that could address something outside its
 * root — an absolute path (POSIX, Windows drive, or UNC), a `..` segment, a
 * backslash separator — or that could be read as more than one path: a null
 * byte or any other control character. `context` names the surface the path
 * came from so a refusal points at the offending manifest key, directory
 * entry, or permission declaration. Shared by the manifest gates in
 * `./manifest.ts` (which re-exports it) and by `touchedPaths` here.
 *
 * The control-character refusal is about ambiguity, not traversal. POSIX
 * permits a newline in a filename, and a path that carries one reads as two in
 * every line-oriented surface a pack path reaches — the install preview, the
 * receipt, the ownership ledger — and can impersonate an entry boundary in a
 * serialization that separates fields rather than framing them. It is defence
 * in depth for the pin target in `./trust.ts`, which is injective on its own,
 * and there is no legitimate pack file whose name needs a control character.
 */
export function assertSafePackRelPath(relPath: string, context: string): void {
  const refuse = (why: string): never => {
    throw new EngineError(
      `Unsafe pack path in ${context}: ${JSON.stringify(relPath)} (${why}). ` +
        `Pack-declared paths are plain relative POSIX paths.`,
      { code: "VALIDATION_ERROR" },
    );
  };

  if (relPath === "") refuse("empty path");
  if (relPath.includes("\0")) refuse("null byte");
  const control = firstControlChar(relPath);
  if (control !== undefined) refuse(`control character ${control}`);
  // Judged before the POSIX checks: a Windows-authored path must not be read
  // as one long filename that happens to contain `..`.
  if (relPath.includes("\\")) refuse("backslash separator");
  if (isAbsolute(relPath) || relPath.startsWith("/") || /^[A-Za-z]:/.test(relPath)) {
    refuse("absolute path");
  }
  if (relPath.split("/").includes("..")) refuse("`..` segment");
  // Defence in depth: whatever the segments looked like, the normalised form
  // must not climb out.
  const normalized = normalize(relPath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) refuse("normalises outside the pack root");
}

/**
 * One `touchedPaths` entry: the safe-relative-path vocabulary above, plus the
 * declared glob bound — `*` may appear only as a single trailing `/**`, so a
 * declaration is always a concrete path or "everything under this directory",
 * never a pattern the preview cannot render literally.
 */
function assertTouchedPathDeclaration(entry: string): void {
  const base = entry.endsWith(GLOB_SUFFIX) ? entry.slice(0, -GLOB_SUFFIX.length) : entry;
  if (base.includes("*")) {
    throw new EngineError(
      `\`touchedPaths\` entry ${JSON.stringify(entry)}: glob support is limited to a single trailing "${GLOB_SUFFIX}".`,
      { code: "VALIDATION_ERROR" },
    );
  }
  assertSafePackRelPath(base, "`permissions.touchedPaths`");
}

// ── Block parsing ──────────────────────────────────────────────

/**
 * Read and validate the optional `permissions` block off the manifest root,
 * reporting every defect in one throw. Absent reads as `undefined` (the pack
 * declares nothing); `{}` is a valid, inert declaration. Strict ingress like
 * the rest of `pack.json`: a misspelled key is named and refused rather than
 * dropped, because a disclosure that silently disappears is one the operator
 * believes they read.
 */
export function readPermissions(raw: Record<string, unknown>): PackPermissions | undefined {
  const value = Object.hasOwn(raw, "permissions") ? raw.permissions : undefined;
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new EngineError(
      `${PERMISSIONS_SOURCE}: must be an object with optional \`toolFootprint\` and \`touchedPaths\` arrays.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const problems: string[] = [];
  const attempt = <T>(read: () => T): T | undefined => {
    try {
      return read();
    } catch (cause) {
      problems.push(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  };

  attempt(() => rejectUnknownFields(value, PERMISSIONS_FIELDS, PERMISSIONS_SOURCE));

  const footprint = attempt(() =>
    requireStringArray(value, "toolFootprint", { source: PERMISSIONS_SOURCE, optional: true }),
  );
  if (footprint !== undefined) {
    const unknown = [...new Set(footprint.filter((entry) => !isToolCategory(entry)))];
    if (unknown.length > 0) {
      problems.push(
        `\`toolFootprint\` names unknown tool categor${unknown.length === 1 ? "y" : "ies"} ` +
          `${unknown.map((entry) => JSON.stringify(entry)).join(", ")}. ` +
          `Valid categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`,
      );
    }
  }

  const declaredPaths = attempt(() =>
    requireStringArray(value, "touchedPaths", { source: PERMISSIONS_SOURCE, optional: true }),
  );
  for (const entry of declaredPaths ?? []) {
    attempt(() => assertTouchedPathDeclaration(entry));
  }

  if (problems.length > 0) {
    throw new EngineError(
      `Invalid ${PERMISSIONS_SOURCE}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
      { code: "VALIDATION_ERROR" },
    );
  }

  return {
    ...(footprint === undefined ? {} : { toolFootprint: [...new Set(footprint)] }),
    ...(declaredPaths === undefined ? {} : { touchedPaths: [...new Set(declaredPaths)] }),
  };
}

// ── Plan gate ──────────────────────────────────────────────────

/**
 * Permission-manifest entry for the install plan's checks record: `"pass"`
 * when the pack carries a `permissions` block (already strictly validated at
 * manifest ingress), `"n/a"` when it declares none — mirroring how the signing
 * gate distinguishes "verified" from "waived". Purely declarative: the block
 * discloses runtime workflow surface, not pack file layout, so there is
 * nothing in the shipped files to cross-check it against. `_files` keeps the
 * uniform gate signature and the seam where a future content cross-check
 * would land.
 */
export function checkPermissions(
  manifest: { readonly permissions?: PackPermissions | undefined },
  _files: readonly unknown[],
): "pass" | "n/a" {
  return manifest.permissions === undefined ? "n/a" : "pass";
}

// ── Agent capability gate ──────────────────────────────────────

/** Class directory whose files carry a grant; `capabilities:` anywhere else grants nothing. */
const AGENT_DIR = "agents/";

/** Agent files are markdown; the extension is compared case-insensitively. */
const MARKDOWN_EXTENSION = ".md";

/** The frontmatter key that declares an agent's grant. */
const CAPABILITIES_FIELD = "capabilities";

/** Delegation. Refused on a pack agent outright, never weighed against the footprint. */
const SPAWN_CATEGORY = "spawn";

/**
 * What a pack agent may hold: the functional categories minus delegation.
 * Derived from the taxonomy rather than restated, so a category added there is
 * grantable here without a second edit — and one removed stops being grantable
 * without one either.
 */
const GRANTABLE_AGENT_CATEGORIES: readonly string[] = FUNCTIONAL_TOOL_CATEGORIES.filter(
  (category) => category !== SPAWN_CATEGORY,
);

/** Files under the agent class dir. Path safety belongs to the enumeration gate, not here. */
function isAgentFile(relPath: string): boolean {
  return relPath.startsWith(AGENT_DIR) && relPath.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

/**
 * Cross-check every pack agent's declared `capabilities:` against the pack's
 * own `permissions.toolFootprint`, refusing the pack when an agent asks for
 * more than the pack disclosed.
 *
 * This is the ingress half of pack-agent grants. Emission derives an installed
 * agent's grant from this same frontmatter (`src/roster/agentGrants.ts`),
 * bounded by the same footprint — so without this gate an over-declaring pack
 * would install, and its agents would be quietly narrowed at emission to
 * something no operator ever read. Refusing here means the over-declaration is
 * answered before a byte lands, and the message names the file, the capability,
 * and the footprint it exceeded, which is what the pack author has to change.
 *
 * `spawn` is refused outright rather than measured against the footprint: a
 * spawned agent carries its own grant, so delegation is the one category whose
 * blast radius is not bounded by the tools it names. A reserved category is
 * refused too, for the opposite reason — it grants nothing on any client that
 * exists, so an agent declaring one believes it holds a capability it will
 * never receive.
 *
 * Every defect is reported in one throw, matching `readPermissions` above and
 * `checkDeclaredTools` in `./manifest.ts`: a pack author fixes one refusal per
 * round, not one capability per round. Agents that declare nothing pass, since
 * an absent field is a real (empty) grant rather than an omission; a
 * `capabilities:` key that is present but unreadable is refused, because the
 * silent alternative is an installed agent that can do nothing while its file
 * still reads as shipped.
 *
 * A pack agent whose id collides with a core agent's is not this gate's
 * subject: the roster answers that id at emission and ignores pack frontmatter
 * entirely, so there is nothing here to refuse.
 */
export function checkAgentCapabilities(
  files: readonly { relPath: string; frontmatter: Readonly<Record<string, unknown>> }[],
  permissions: PackPermissions | undefined,
): "pass" {
  const footprint = (permissions?.toolFootprint ?? []).filter((entry) =>
    GRANTABLE_AGENT_CATEGORIES.includes(entry),
  );
  const declared = new Set(footprint);
  const footprintLabel = footprint.length === 0 ? "the pack declares none" : footprint.join(", ");
  // Insertion-ordered and deduplicated: one line per distinct defect, in the
  // order an author reads their own pack.
  const problems = new Set<string>();

  for (const file of files) {
    if (!isAgentFile(file.relPath)) continue;

    let capabilities: string[] | undefined;
    try {
      capabilities = requireStringArray(file.frontmatter, CAPABILITIES_FIELD, {
        source: file.relPath,
        optional: true,
      });
    } catch (cause) {
      problems.add(cause instanceof Error ? cause.message : String(cause));
      continue;
    }

    for (const capability of capabilities ?? []) {
      const quoted = JSON.stringify(capability);
      if (capability === SPAWN_CATEGORY) {
        problems.add(
          `${file.relPath}: \`${SPAWN_CATEGORY}\` is never granted to a pack agent — a spawned ` +
            `agent carries its own grant, so delegation is the one capability the footprint ` +
            `cannot bound. Orchestrate from a command instead.`,
        );
      } else if (!isToolCategory(capability)) {
        problems.add(
          `${file.relPath}: unknown capability ${quoted}. ` +
            `Grantable categories: ${GRANTABLE_AGENT_CATEGORIES.join(", ")}.`,
        );
      } else if (isReservedToolCategory(capability)) {
        problems.add(
          `${file.relPath}: capability ${quoted} is a reserved category that grants nothing on ` +
            `any client today. Name the functional category the agent actually needs.`,
        );
      } else if (!declared.has(capability)) {
        problems.add(
          `${file.relPath}: capability ${quoted} is outside the pack's declared tool footprint ` +
            `(${footprintLabel}). Add it to \`permissions.toolFootprint\` — where the operator ` +
            `reads it before installing — or drop it from the agent.`,
        );
      }
    }
  }

  if (problems.size > 0) {
    throw new EngineError(
      `Pack agent capabilities refused:\n${[...problems].map((problem) => `  - ${problem}`).join("\n")}`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return "pass";
}
