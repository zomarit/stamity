import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isPlainObject, parseJsonStrict, unknownFields } from "../config/parse.ts";
import { atomicWriteFile } from "../merge/atomicWrite.ts";
import { mapFsErrno } from "../merge/fsErrors.ts";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import type { PackSourceKind } from "./manifest.ts";

/**
 * Org trust policy: the artifact an organization checks in at
 * `.stamity/policy.json` to gate which pack sources its repos may install.
 * Consumed by `planPackInstall` as the first gate after the manifest read, so
 * `add` and every future update path inherit it from the one call site —
 * re-install is the update path, so updates are covered.
 *
 * The policy is also consulted at PROJECTION (`./projection.ts` →
 * `discoverInstalledPacks`), which is a separate question with the same
 * answer. Install-time alone left a real gap: a repo that installed a pack and
 * LATER adopted a policy denying it kept projecting that pack's agents, rules,
 * hooks and MCP definitions on every sync while `add` correctly refused new
 * installs of it, and `check` reported all green. A denied pack now projects
 * nothing — its files stay on disk and in the ledger, so `clean --pack <id>`
 * still uninstalls it and re-allowing the source restores it without a
 * re-install.
 *
 * Two rules govern everything here:
 *
 * - **Deny-wins.** A deny match refuses the source no matter what the allow
 *   list says. With an `allow` list present, only allow-matched sources pass
 *   (allowlist mode); without one, everything not denied passes (denylist
 *   mode). No file at all means no policy — installs pass, because the policy
 *   is opt-in.
 * - **Fail-closed.** A policy that exists but cannot be read as exactly the
 *   documented shape throws `CONFIG_ERROR`, and the caller propagates that
 *   throw — refusing every pack install until the file is fixed. A defective
 *   policy is never skipped, defaulted, or partially honored: an org that
 *   wrote a policy meant it, and "could not read it, so allowed everything"
 *   is the one outcome this module exists to prevent.
 *
 * Every load-time defect is `CONFIG_ERROR` — deliberately not the
 * CONFIG/VALIDATION split `../config/parse.ts` documents — because a policy
 * defect has one consequence (all installs refuse) and one operator next step
 * (fix `.stamity/policy.json`), the same collapse `readManifest` applies to
 * the setup manifest.
 */

/** Repo-relative location of the org trust policy artifact. */
export const ORG_POLICY_REL_PATH = `${STATE_DIR}/policy.json`;

/**
 * The parsed `.stamity/policy.json` document.
 *
 * `packs.allow` / `packs.deny` entries share one grammar, validated at load:
 *
 * - `name` / `@scope/name` — exactly that pack id;
 * - `@scope/*` — every pack in the scope (`@scope/x`, never `@scopeother/x`);
 * - `*` — every pack from every source;
 * - `local-path` / `npm-package` / `catalog-pinned` — every install of that
 *   source kind. The three tokens always read as kinds: a pack literally named
 *   `local-path` can only be targeted under a scope.
 *
 * The kind tokens partition installs, and both directions of the
 * `catalog-pinned` split are worth stating because the obvious hardening rule
 * gets one of them wrong:
 *
 * - `local-path` no longer covers a curated-catalog install. The catalog's own
 *   entries resolve to a directory inside the engine package, so before this
 *   token existed the one rule an org would reach for — "deny every pack
 *   installed from a directory on the machine" — also denied the SHA-pinned
 *   catalog the whole trust surface rests on, and allowlisting `local-path`
 *   to get it back permitted every directory on the machine. `deny:
 *   ["local-path"]` now means exactly "no unreviewed directory installs" and
 *   leaves the catalog reachable.
 * - `catalog-pinned` is granted only when the install carried a catalog pin
 *   that VERIFIED against the pack's aggregate content SHA at a
 *   catalog-granted tier (`./trust.ts`). An org that wants nothing but the
 *   catalog writes `allow: ["catalog-pinned"]`; one that distrusts the
 *   curated list writes `deny: ["catalog-pinned"]` and the pack falls to no
 *   other kind — a denied catalog install is denied outright, not re-read as
 *   a local path.
 *
 * Anything else — extra slashes, a slash outside the `@scope/` form, partial
 * wildcards (`op*`), upper case that no pack id can carry — is rejected at
 * load: a rule the evaluator cannot honor must fail the load, not silently
 * match nothing. `packs: {}` is valid and inert.
 */
export interface OrgTrustPolicy {
  version: 1;
  packs: { allow?: string[]; deny?: string[] };
}

/** Verdict for one `(packName, sourceKind)` install source. */
export interface OrgPolicyDecision {
  decision: "allow" | "deny";
  /**
   * The pattern that decided, when one did: the matched deny or allow entry,
   * or the literal `"not in allow list"` for an allowlist-mode miss. Absent
   * when nothing matched (no policy, or denylist mode with no deny hit).
   */
  matchedRule?: string;
}

/** UTF-8 BOM. Editors on Windows add one; `JSON.parse` refuses it. */
const BOM = "\uFEFF";

/** One id segment of a pack name — the vocabulary `pack.json` `name` uses. */
const NAME_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

/** Source-kind tokens; in a pattern list these always mean the kind. */
const KIND_TOKENS: readonly PackSourceKind[] = ["local-path", "npm-package", "catalog-pinned"];

/** Stable `matchedRule` literal for an allowlist-mode miss; the add UX prints it. */
const NOT_IN_ALLOW_LIST = "not in allow list";

const ROOT_FIELDS = ["version", "packs"] as const;
const PACKS_FIELDS = ["allow", "deny"] as const;

/**
 * The whole pattern grammar in one sentence — what a refusal points at.
 *
 * Extracted rather than re-spelled: the load-time refusal below and the writer
 * surface that refuses a pattern BEFORE it reaches the file both have to state
 * it, and two copies of a vocabulary derived from {@link KIND_TOKENS} is
 * exactly the drift that would let one of them go on naming a kind the
 * evaluator dropped.
 */
export const ORG_POLICY_PATTERN_GRAMMAR =
  `Patterns are an exact pack id, "@scope/*", "*", or a source kind ` +
  `(${KIND_TOKENS.join(", ")}).`;

/** Human-readable value class for refusal messages; never dumps a large value. */
function describeValue(value: unknown): string {
  if (value === undefined) return "absent";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

/** Every policy defect: one code, one consequence, one next step. */
function policyError(path: string, defect: string): EngineError {
  return new EngineError(
    `Invalid org trust policy in ${path}: ${defect} ` +
      "All pack installs are refused until the policy file is fixed (fail-closed).",
    { code: "CONFIG_ERROR" },
  );
}

function isKindToken(pattern: string): boolean {
  return (KIND_TOKENS as readonly string[]).includes(pattern);
}

/**
 * Why `pattern` falls outside the documented grammar, or `null` when it is
 * valid. Checked at load so a dead rule can never ship: a deny the evaluator
 * would silently never match is an allow in disguise.
 */
function patternDefect(pattern: string): string | null {
  if (pattern === "*" || isKindToken(pattern)) return null;
  if (pattern.includes("\0")) return "contains a null byte.";
  if (pattern.includes("\\")) {
    return 'contains a backslash; patterns use "/" only in the "@scope/…" form.';
  }
  const segments = pattern.split("/");
  if (segments.length > 2) {
    return 'carries more than the single "@scope/" slash a pack id can have.';
  }
  if (segments.length === 2) {
    const [scope = "", name = ""] = segments;
    if (!scope.startsWith("@") || !NAME_SEGMENT.test(scope.slice(1))) {
      return 'puts "/" outside the "@scope/name" form.';
    }
    if (name !== "*" && !NAME_SEGMENT.test(name)) {
      return name.includes("*")
        ? 'uses "*" outside the two wildcard forms ("*" alone, or "@scope/*").'
        : 'is not "@scope/*" or an exact "@scope/name" pack id.';
    }
    return null;
  }
  if (pattern.includes("*")) {
    return 'uses "*" outside the two wildcard forms ("*" alone, or "@scope/*").';
  }
  if (!NAME_SEGMENT.test(pattern)) {
    return `is not an exact pack id, "@scope/*", "*", or a source kind (${KIND_TOKENS.join(", ")}).`;
  }
  return null;
}

/** Read and grammar-check one pattern list; absent stays absent (mode signal). */
function readPatternList(
  packs: Record<string, unknown>,
  list: (typeof PACKS_FIELDS)[number],
  path: string,
): string[] | undefined {
  const value = Object.hasOwn(packs, list) ? packs[list] : undefined;
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw policyError(path, `\`packs.${list}\` must be an array of patterns (got ${describeValue(value)}).`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw policyError(
        path,
        `packs.${list}[${index}] must be a string pattern (got ${describeValue(entry)}).`,
      );
    }
    const defect = patternDefect(entry);
    if (defect !== null) {
      throw policyError(
        path,
        `packs.${list}[${index}] ${JSON.stringify(entry)} ${defect} ${ORG_POLICY_PATTERN_GRAMMAR}`,
      );
    }
    return entry;
  });
}

function parseOrgPolicy(raw: string, path: string): OrgTrustPolicy {
  // parseJsonStrict already throws CONFIG_ERROR naming the file on a syntax
  // failure or a non-object root, so the assertion is its own narrowing.
  const document = parseJsonStrict(raw.startsWith(BOM) ? raw.slice(BOM.length) : raw, path) as Record<
    string,
    unknown
  >;

  const strayRoot = unknownFields(document, ROOT_FIELDS);
  if (strayRoot.length > 0) {
    throw policyError(
      path,
      `unknown field(s) ${strayRoot.map((key) => JSON.stringify(key)).join(", ")}. ` +
        `Allowed: ${[...ROOT_FIELDS].toSorted().map((key) => JSON.stringify(key)).join(", ")}.`,
    );
  }

  const version = Object.hasOwn(document, "version") ? document.version : undefined;
  if (version !== 1) {
    throw policyError(
      path,
      `\`version\` must be the number 1 (got ${describeValue(version)}); ` +
        "this engine reads only policy version 1.",
    );
  }

  const packs = Object.hasOwn(document, "packs") ? document.packs : undefined;
  if (!isPlainObject(packs)) {
    throw policyError(
      path,
      `\`packs\` must be an object with optional "allow"/"deny" pattern arrays ` +
        `(got ${describeValue(packs)}).`,
    );
  }
  const strayPacks = unknownFields(packs, PACKS_FIELDS);
  if (strayPacks.length > 0) {
    throw policyError(
      path,
      `unknown field(s) under \`packs\`: ${strayPacks.map((key) => JSON.stringify(key)).join(", ")}. ` +
        `Allowed: ${[...PACKS_FIELDS].toSorted().map((key) => JSON.stringify(key)).join(", ")}.`,
    );
  }

  const allow = readPatternList(packs, "allow", path);
  const deny = readPatternList(packs, "deny", path);
  const parsed: OrgTrustPolicy["packs"] = {};
  if (allow !== undefined) parsed.allow = allow;
  if (deny !== undefined) parsed.deny = deny;
  return { version: 1, packs: parsed };
}

/**
 * Read the org trust policy at {@link ORG_POLICY_REL_PATH} under `rootDir`.
 *
 * An absent file — including an absent state dir, or a `.stamity` path that is
 * not a directory — returns `null`: no policy, installs pass. A file that
 * exists but deviates from the documented shape in any way (JSON syntax,
 * non-object root, unknown fields at either level, a version other than the
 * number 1, a non-string or out-of-grammar pattern) throws `CONFIG_ERROR`
 * naming the defect and the file. Callers never catch that to proceed —
 * fail-closed is the entire point of the artifact.
 */
export async function loadOrgPolicy(rootDir: string): Promise<OrgTrustPolicy | null> {
  const path = join(rootDir, ORG_POLICY_REL_PATH);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw (
      mapFsErrno(cause, path) ??
      new EngineError(
        `Cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`,
        { code: "FS_ERROR", cause },
      )
    );
  }
  return parseOrgPolicy(raw, path);
}

/** Absolute path of the org trust policy under `rootDir`. */
export function orgPolicyPath(rootDir: string): string {
  return join(rootDir, ORG_POLICY_REL_PATH);
}

/**
 * Why `pattern` falls outside the documented grammar, or `null` when it is
 * valid.
 *
 * The load-time check itself, published rather than re-implemented. A writer
 * that spelled its own admissibility rule would eventually admit a pattern
 * {@link loadOrgPolicy} refuses — and because the loader is fail-closed, that
 * writer's own output would then refuse every pack install in the repository.
 * One function decides, so the two cannot disagree.
 */
export function orgPolicyPatternDefect(pattern: string): string | null {
  return patternDefect(pattern);
}

/**
 * An empty policy: version 1, no rules. Valid and completely inert — no `allow`
 * list means denylist mode, and an empty deny list denies nothing — so writing
 * one changes what installs and what projects in no way at all. That is what
 * makes it the right starting document: adopting the artifact is not the same
 * act as adopting a restriction.
 */
export function emptyOrgPolicy(): OrgTrustPolicy {
  return { version: 1, packs: {} };
}

/**
 * The policy as bytes: two-space JSON with a trailing newline, the shape
 * `../workspace/manifest.ts` writes its own checked-in artifact in. This file
 * is committed, reviewed and diffed by people, so it is formatted for them.
 */
export function serializeOrgPolicy(policy: OrgTrustPolicy): string {
  return `${JSON.stringify(policy, null, 2)}\n`;
}

/**
 * Write the org trust policy to {@link ORG_POLICY_REL_PATH} under `rootDir`,
 * through the same atomic temp+rename substrate every other engine artifact
 * takes (a missing `.stamity/` is created).
 *
 * **It parses what it is about to write, and refuses on any defect.** The bytes
 * go through {@link loadOrgPolicy}'s own parser first, so nothing this writer
 * produces can be a document that command then refuses to read. That matters
 * more here than anywhere else in the tree: the loader is fail-closed, so a
 * writer that emitted one bad pattern would not corrupt one feature — it would
 * refuse every pack install and stop every denied-pack projection in the
 * repository, with the fix reachable only by hand-editing the file this writer
 * exists to spare an operator. The throw happens BEFORE the temp file is
 * opened, so a refused document leaves the previous policy byte-for-byte
 * intact.
 */
export async function writeOrgPolicy(rootDir: string, policy: OrgTrustPolicy): Promise<void> {
  const path = orgPolicyPath(rootDir);
  const serialized = serializeOrgPolicy(policy);
  parseOrgPolicy(serialized, path);
  await atomicWriteFile(path, serialized);
}

/**
 * A source kind the evaluator can be handed when none is on record.
 *
 * The projection lane reads an installed pack's kind out of its receipt, and a
 * receipt an operator deleted or truncated has no kind to report. `"unknown"`
 * equals no kind token, so kind rules simply do not match it while name, scope
 * and `"*"` rules still do — a deny-everything policy still denies, and a
 * `deny: ["npm-package"]` policy does not silently start denying packs whose
 * provenance nobody can read.
 */
export type EvaluatedSourceKind = PackSourceKind | "unknown";

function patternMatches(pattern: string, packName: string, sourceKind: EvaluatedSourceKind): boolean {
  if (pattern === "*") return true;
  if (isKindToken(pattern)) return pattern === sourceKind;
  if (pattern.startsWith("@") && pattern.endsWith("/*")) {
    const scopePrefix = pattern.slice(0, -1); // "@scope/*" -> "@scope/"
    return packName.startsWith(scopePrefix) && packName.length > scopePrefix.length;
  }
  return packName === pattern;
}

/**
 * Decide whether one pack source may install. Pure; list order decides which
 * rule is reported when several match.
 *
 * Precedence: no policy → allow. A deny match → deny (deny-wins, including a
 * pattern duplicated across both lists). Then, with an `allow` list present,
 * an allow match → allow and anything unmatched → deny with the literal
 * `matchedRule` `"not in allow list"` — so an empty `allow` list denies
 * everything. With no `allow` list, whatever survived the deny list passes.
 */
export function evaluatePackSource(
  policy: OrgTrustPolicy | null,
  packName: string,
  sourceKind: EvaluatedSourceKind,
): OrgPolicyDecision {
  if (policy === null) return { decision: "allow" };

  const { allow, deny } = policy.packs;
  const denied = deny?.find((pattern) => patternMatches(pattern, packName, sourceKind));
  if (denied !== undefined) return { decision: "deny", matchedRule: denied };

  if (allow !== undefined) {
    const allowed = allow.find((pattern) => patternMatches(pattern, packName, sourceKind));
    if (allowed !== undefined) return { decision: "allow", matchedRule: allowed };
    return { decision: "deny", matchedRule: NOT_IN_ALLOW_LIST };
  }
  return { decision: "allow" };
}
