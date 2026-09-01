import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { ENV_MCP_FILE } from "../mcp/env.ts";
import { EngineError } from "../types/errors.ts";

/**
 * `.stamity/worktree.json` — the worktree lane's policy file, and the
 * resolution rule that reads it.
 *
 * The file is absent by default and is never scaffolded: the built-in defaults
 * below are the answer when it does not exist, and a generated file whose
 * contents equal the defaults is a file that drifts from them.
 *
 * Three properties are what this module exists for, and each one is a refusal
 * rather than a resolution:
 *
 *   1. **Literal paths.** A glob metacharacter is refused, naming the
 *      character. Without that, "literal repo-relative path" is aspirational
 *      and a pattern expansion is a place for a strategy to get lost.
 *   2. **Longest-prefix resolution.** Declaration order carries no meaning
 *      anywhere, in either list; two rows claiming one path are refused naming
 *      both. Ordering being semantic is what produced the class of defects
 *      this design closes — there is no second resolution path here to drift
 *      out of lockstep with the first.
 *   3. **Only ignored paths are materialized.** A row naming a path git tracks
 *      is refused (the checkout supplies it); a row naming a path git neither
 *      tracks nor ignores is refused (materializing it would leave the new
 *      worktree dirty at creation).
 *
 * The git facts behind (3) arrive as an INJECTED classifier. This module owns
 * the rule; the `git check-ignore` / `git ls-files` pass that answers it is the
 * orchestration unit's, which keeps every refusal here provable without a
 * subprocess.
 *
 * Every refusal names the policy file's absolute path and the offending field,
 * in the shape the override layer already uses (`../content/catalog.ts`).
 */

/** Policy file location, relative to the repository root. */
export const WORKTREE_POLICY_FILE = ".stamity/worktree.json";

/** The only schema generation this build reads. */
export const WORKTREE_POLICY_VERSION = 1;

/**
 * Default farm directory name, placed beside the repository. The leading dot is
 * load-bearing: the workspace sub-repo scan skips dot-directories at every
 * level, so a farm named this way cannot be mistaken for a workspace member.
 */
export const WORKTREE_FARM_DIR_NAME = ".stamity-worktrees";

/** What the lane does with a path: copy it, link it, or leave it out. */
export type WorktreeStrategy = "copy" | "symlink" | "skip";

/** Which list a rule was declared in. Carried so a refusal can name it. */
export type WorktreePolicyList = "entries" | "overrides";

/**
 * One resolved rule. `secret` is normalized to a boolean at parse time so no
 * consumer has to decide what an absent key means, and `list` is retained
 * because the contested-path refusal has to name where each claimant came from.
 */
export interface WorktreePolicyRule {
  readonly path: string;
  readonly strategy: WorktreeStrategy;
  readonly secret: boolean;
  readonly reason?: string;
  readonly list: WorktreePolicyList;
}

/** The parsed policy: the two declared lists, plus where they were read from. */
export interface WorktreePolicy {
  readonly version: number;
  /** Raw `farmDir` spelling as declared; resolved by {@link resolveFarmDir}. */
  readonly farmDir?: string;
  readonly entries: readonly WorktreePolicyRule[];
  readonly overrides: readonly WorktreePolicyRule[];
  /** Absolute path of the file this policy came from, or the built-in label. */
  readonly source: string;
  /** True when no policy file existed and the built-in defaults are in force. */
  readonly builtIn: boolean;
}

/** How git sees a path. The orchestration unit answers this; this module reads it. */
export type GitPathClass = "tracked" | "ignored" | "untracked";

/** Label used as `source` when no policy file exists. */
export const BUILT_IN_POLICY_SOURCE = "<built-in worktree defaults>";

/**
 * The built-in default rule set: two rows, and everything else is absent by
 * construction because this project commits it.
 *
 * `node_modules` ships as an explicit `skip` rather than as an omission so the
 * operator can see the decision and change it in one edit. It is `skip` rather
 * than `symlink` because a package manager installing inside the new worktree
 * writes THROUGH the link into the main tree's modules — a destructive
 * cross-tree effect on a directory the operator never named.
 */
export const DEFAULT_WORKTREE_RULES: readonly WorktreePolicyRule[] = Object.freeze([
  Object.freeze<WorktreePolicyRule>({
    path: ".env.mcp",
    strategy: "copy",
    secret: true,
    reason: "MCP credentials",
    list: "entries",
  }),
  Object.freeze<WorktreePolicyRule>({
    path: "node_modules",
    strategy: "skip",
    secret: false,
    reason: "install inside the worktree; a symlinked tree is written through",
    list: "entries",
  }),
]);

/** The policy in force when `.stamity/worktree.json` is absent. Not an error. */
export function builtInWorktreePolicy(): WorktreePolicy {
  return {
    version: WORKTREE_POLICY_VERSION,
    entries: DEFAULT_WORKTREE_RULES,
    overrides: [],
    source: BUILT_IN_POLICY_SOURCE,
    builtIn: true,
  };
}

/**
 * Basenames this repository treats as live credentials. A row naming one of
 * these is ALWAYS `secret`, whatever the policy's boolean says: the policy file
 * is untrusted input, and a committed policy that named `.env.mcp` with `secret`
 * omitted or false would otherwise strip the consent gate and the `0600` off a
 * credential file. Secrecy resolves by IDENTITY here — the policy may RAISE it
 * for any path, and may never LOWER it for a known-credential path.
 *
 * `.env.mcp` is the canonical credential name (`src/mcp/env.ts`); the set is the
 * seam a second credential file registers through.
 */
const KNOWN_CREDENTIAL_BASENAMES: ReadonlySet<string> = new Set([normalizeCredentialBasename(ENV_MCP_FILE)]);

/**
 * Case-folds and strips every trailing dot AND space from a basename before
 * the known-credential lookup. A case-insensitive filesystem (macOS APFS
 * default) and a filesystem that drops trailing dots/spaces (Windows) both
 * make a variant spelling — `.ENV.MCP`, `.env.mcp.`, `.env.mcp..`,
 * `.env.mcp ` — address the SAME file on disk as `.env.mcp`, and
 * `git check-ignore` honors `core.ignorecase` too, so an exact-string
 * comparison would let the variant evade the identity check, resolve
 * `secret:false`, and skip the `--copy-secrets` consent gate. Windows strips
 * ALL trailing dots and spaces, not just one of each, so the strip here is a
 * loop rather than a single slice. This only RAISES what counts as the
 * credential's spelling — it never changes which file the identity check is
 * about, and a name reducing to the empty string matches nothing.
 *
 * [secfix NEW-1] Not a general Windows-aliasing defence: this function
 * normalizes the DECLARED string, and an NTFS 8.3 short name (`ENV~1.MCP`)
 * addresses the same file through a spelling this normalizer never sees —
 * name-based matching has no reach into a filesystem-internal alias table.
 * `normalizeRulePath`'s colon refusal closes the alternate-data-stream alias
 * specifically, because that one IS spelled in the declared path; 8.3
 * short-name aliasing is a different, structurally unreachable class.
 */
function normalizeCredentialBasename(name: string): string {
  return name.toLowerCase().replace(/[. ]+$/, "");
}

/**
 * True when `relPath`'s basename is one this repository treats as a
 * credential — exported [secfix A2] so the materializer can elevate a
 * credential found by IDENTITY inside a copied directory (a `copy` row
 * naming a directory that turns out to contain `.env.mcp`), not only a
 * top-level policy row.
 */
export function isKnownCredentialPath(relPath: string): boolean {
  return KNOWN_CREDENTIAL_BASENAMES.has(normalizeCredentialBasename(basename(relPath)));
}

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["version", "farmDir", "entries", "overrides"]);
const RULE_KEYS: ReadonlySet<string> = new Set(["path", "strategy", "secret", "reason"]);
const STRATEGIES: readonly WorktreeStrategy[] = ["copy", "symlink", "skip"];

/**
 * Glob metacharacters, refused one by one so the message can name the character
 * the author typed rather than the class it belongs to.
 */
const GLOB_CHARACTERS: readonly string[] = ["*", "?", "[", "{"];

/**
 * Control characters, written as escapes rather than as literals: a literal one
 * makes this source file binary to every tool that reads it, the leak gate's
 * own walk included.
 */
// oxlint-disable-next-line no-control-regex -- a control character in a declared path IS the defect
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function refuse(message: string, next?: string): never {
  throw new EngineError(message, {
    code: "VALIDATION_ERROR",
    ...(next === undefined ? {} : { next }),
  });
}

/**
 * Reads `<repoRoot>/.stamity/worktree.json`.
 *
 * An absent file is the built-in defaults, not a failure — that is the one
 * behaviour a caller must not have to special-case, because the file is absent
 * in almost every repository. Every other read failure surfaces as an
 * `FS_ERROR` naming the path: a policy file that exists and cannot be read is
 * not the same fact as one that was never written.
 */
export async function readWorktreePolicy(repoRoot: string): Promise<WorktreePolicy> {
  const filePath = join(repoRoot, WORKTREE_POLICY_FILE);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return builtInWorktreePolicy();
    throw new EngineError(`${filePath}: the worktree policy file could not be read.`, {
      code: "FS_ERROR",
      cause: error,
      why: (error as NodeJS.ErrnoException).code,
    });
  }
  return parseWorktreePolicy(text, filePath);
}

/**
 * Parses and validates the policy document. `filePath` is used only for the
 * refusal messages, so a caller holding the bytes from elsewhere can still get
 * a message that names a file an operator can open.
 */
export function parseWorktreePolicy(text: string, filePath: string): WorktreePolicy {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    refuse(
      `${filePath}: the worktree policy file is not valid JSON (${(error as Error).message}).`,
      `Fix the syntax in ${filePath}, or delete the file to fall back to the built-in defaults.`,
    );
  }

  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    refuse(`${filePath}: the worktree policy file must be a JSON object with a \`version\` key.`);
  }
  const record = document as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (TOP_LEVEL_KEYS.has(key)) continue;
    // Refused rather than ignored: an ignored key is indistinguishable from a
    // working one to the author who wrote it, and `entry` for `entries` is the
    // typo this catches.
    refuse(
      `${filePath}: unknown key ${JSON.stringify(key)}. The policy file declares only ` +
        `${[...TOP_LEVEL_KEYS].map((known) => `\`${known}\``).join(", ")}.`,
    );
  }

  const version = record["version"];
  if (version !== WORKTREE_POLICY_VERSION) {
    refuse(
      `${filePath}: \`version\` must be ${WORKTREE_POLICY_VERSION}, not ${JSON.stringify(version)}. ` +
        `This build reads schema generation ${WORKTREE_POLICY_VERSION} only.`,
    );
  }

  let farmDir: string | undefined;
  if (record["farmDir"] !== undefined) {
    const declared = record["farmDir"];
    if (typeof declared !== "string" || declared.trim() === "") {
      refuse(`${filePath}: \`farmDir\` must be a non-empty string path, not ${JSON.stringify(declared)}.`);
    }
    if (declared.includes("\\")) {
      refuse(`${filePath}: \`farmDir\` carries a backslash. Spell the path with \`/\` separators.`);
    }
    farmDir = declared;
  }

  const entries = parseRuleList(record["entries"], "entries", filePath);
  const overrides = parseRuleList(record["overrides"], "overrides", filePath);
  assertNoContestedPath([...entries, ...overrides], filePath);

  return {
    version: WORKTREE_POLICY_VERSION,
    ...(farmDir === undefined ? {} : { farmDir }),
    entries,
    overrides,
    source: filePath,
    builtIn: false,
  };
}

function parseRuleList(
  value: unknown,
  list: WorktreePolicyList,
  filePath: string,
): readonly WorktreePolicyRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    refuse(`${filePath}: \`${list}\` must be an array of { path, strategy } rows.`);
  }
  return value.map((row, index) => parseRule(row, list, index, filePath));
}

function parseRule(
  row: unknown,
  list: WorktreePolicyList,
  index: number,
  filePath: string,
): WorktreePolicyRule {
  const label = `${list}[${index}]`;
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    refuse(`${filePath}: ${label} must be an object with \`path\` and \`strategy\` keys.`);
  }
  const record = row as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (RULE_KEYS.has(key)) continue;
    refuse(
      `${filePath}: ${label} carries the unknown key ${JSON.stringify(key)}. A row declares only ` +
        `${[...RULE_KEYS].map((known) => `\`${known}\``).join(", ")}.`,
    );
  }

  const declaredPath = record["path"];
  if (typeof declaredPath !== "string" || declaredPath.trim() === "") {
    refuse(`${filePath}: ${label} has no \`path\`. Every row names one literal repo-relative path.`);
  }

  const path = normalizeRulePath(declaredPath, label, filePath);

  const strategy = record["strategy"];
  if (typeof strategy !== "string" || !STRATEGIES.includes(strategy as WorktreeStrategy)) {
    refuse(
      `${filePath}: ${label} \`strategy\` must be one of ` +
        `${STRATEGIES.map((known) => `\`${known}\``).join(", ")}, not ${JSON.stringify(strategy)}.`,
    );
  }

  const secret = record["secret"];
  if (secret !== undefined && typeof secret !== "boolean") {
    refuse(`${filePath}: ${label} \`secret\` must be true or false, not ${JSON.stringify(secret)}.`);
  }

  const reason = record["reason"];
  if (reason !== undefined && typeof reason !== "string") {
    refuse(`${filePath}: ${label} \`reason\` must be a string, not ${JSON.stringify(reason)}.`);
  }

  return {
    path,
    strategy: strategy as WorktreeStrategy,
    // Identity beats the boolean: a known-credential path is secret regardless
    // of what the (untrusted) policy declared. The policy may raise secrecy,
    // never lower it for a credential. See {@link KNOWN_CREDENTIAL_BASENAMES}.
    secret: secret === true || isKnownCredentialPath(path),
    ...(typeof reason === "string" ? { reason } : {}),
    list,
  };
}

/**
 * Reduces a declared `path` to its one canonical spelling, refusing everything
 * that is not a literal repo-relative POSIX path.
 *
 * A single trailing slash is stripped rather than refused: `node_modules/` and
 * `node_modules` address one directory, and normalizing them together is what
 * makes the contested-path refusal true of SPELLINGS rather than only of
 * byte-identical strings.
 */
function normalizeRulePath(declared: string, label: string, filePath: string): string {
  if (declared.includes("\\")) {
    refuse(
      `${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries a backslash. ` +
        `Paths are repo-relative POSIX paths — spell them with \`/\`.`,
    );
  }
  // [secfix NEW-1] `.env.mcp::$DATA` names the credential's default NTFS
  // alternate-data-stream alias on Windows — the SAME file's data, addressed
  // through a colon-qualified name the identity check (basename only) never
  // sees, and `git check-ignore` still matches `.env*` and echoes it back
  // admissible. A colon is illegal in a Windows filename regardless of what
  // it names, so refusing it here costs nothing on any platform and closes
  // the whole alias class structurally — no enumeration of stream names, no
  // Windows-only branch.
  if (declared.includes(":")) {
    refuse(
      `${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries a colon. A colon is not a ` +
        `valid character in a filename on Windows — including inside an alternate-data-stream alias ` +
        `such as \`name::$DATA\`, which addresses the SAME file's bytes under a spelling this policy's ` +
        `credential-identity check does not see.`,
    );
  }
  for (const character of GLOB_CHARACTERS) {
    if (!declared.includes(character)) continue;
    refuse(
      `${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries the glob metacharacter ` +
        `\`${character}\`. Paths here are literal: name each file or directory in its own row.`,
    );
  }
  if (CONTROL_CHARACTERS.test(declared)) {
    refuse(`${filePath}: ${label} \`path\` carries a control character.`);
  }
  if (declared.startsWith("/")) {
    refuse(
      `${filePath}: ${label} \`path\` ${JSON.stringify(declared)} is absolute. ` +
        `Paths are relative to the repository root.`,
    );
  }
  const trimmed = declared.endsWith("/") ? declared.slice(0, -1) : declared;
  if (trimmed === "") {
    refuse(`${filePath}: ${label} \`path\` is empty after normalization.`);
  }
  for (const segment of trimmed.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      refuse(
        `${filePath}: ${label} \`path\` ${JSON.stringify(declared)} carries the segment ` +
          `${JSON.stringify(segment)}. Spell the path plainly, relative to the repository root.`,
      );
    }
  }
  return trimmed;
}

/**
 * Two rows claiming one path are a refusal, whichever lists they came from.
 * Resolving them would need an order, and order carrying meaning is the class
 * this design removes.
 */
function assertNoContestedPath(rules: readonly WorktreePolicyRule[], filePath: string): void {
  const seen = new Map<string, WorktreePolicyRule>();
  for (const rule of rules) {
    const previous = seen.get(rule.path);
    if (previous === undefined) {
      seen.set(rule.path, rule);
      continue;
    }
    refuse(
      `${filePath}: the path ${JSON.stringify(rule.path)} is claimed twice — once in \`${previous.list}\` ` +
        `(strategy \`${previous.strategy}\`) and once in \`${rule.list}\` (strategy \`${rule.strategy}\`). ` +
        `Resolution is by longest prefix, never by declaration order, so one path carries one row.`,
      `Delete one of the two rows in ${filePath}, or make one a strict prefix of the other.`,
    );
  }
}

/** Every rule, both lists, in one set. Resolution reads this and nothing else. */
export function policyRules(policy: WorktreePolicy): readonly WorktreePolicyRule[] {
  return [...policy.entries, ...policy.overrides];
}

/**
 * The rule that owns `relPath`, by longest prefix, or null when no rule names
 * it. Matching is on SEGMENT boundaries — `node_modules` owns
 * `node_modules/foo` and never `node_modules_backup`.
 */
export function matchPolicyRule(policy: WorktreePolicy, relPath: string): WorktreePolicyRule | null {
  let best: WorktreePolicyRule | null = null;
  for (const rule of policyRules(policy)) {
    if (relPath !== rule.path && !relPath.startsWith(`${rule.path}/`)) continue;
    if (best === null || rule.path.length > best.path.length) best = rule;
  }
  return best;
}

/**
 * The strategy in force for `relPath`. A path no rule names resolves to `skip`:
 * the policy is a closed set, and nothing outside it is materialized.
 */
export function resolveStrategy(policy: WorktreePolicy, relPath: string): WorktreeStrategy {
  return matchPolicyRule(policy, relPath)?.strategy ?? "skip";
}

/**
 * The rows that write something — everything materialization walks.
 *
 * A `skip` row is excluded, and so is a row whose own path is owned by a deeper
 * rule, so the set is exactly the paths whose longest-prefix answer is
 * themselves.
 */
export function materializationRules(policy: WorktreePolicy): readonly WorktreePolicyRule[] {
  return policyRules(policy).filter(
    (rule) => rule.strategy !== "skip" && matchPolicyRule(policy, rule.path) === rule,
  );
}

/**
 * Refuses any materializing row whose path git tracks, or neither tracks nor
 * ignores. `classify` is injected: it is the `git check-ignore` / `git ls-files`
 * answer, and this module is the rule about it rather than the pass that
 * produces it.
 *
 * Only materializing rows are checked. A `skip` row writes nothing, so it can
 * neither be supplied twice by the checkout nor dirty the new worktree — and
 * refusing one would brick the verb in a repository that commits the very
 * directory the built-in defaults name.
 */
export function assertRulesAdmissible(
  policy: WorktreePolicy,
  classify: (relPath: string) => GitPathClass,
): void {
  for (const rule of materializationRules(policy)) {
    const verdict = classify(rule.path);
    if (verdict === "ignored") continue;
    // A built-in row has no file to edit, so pointing at one would be a next
    // step nobody can take. The way out of a built-in refusal is to write the
    // policy file that overrides it.
    const drop = policy.builtIn
      ? `declare ${WORKTREE_POLICY_FILE} with a \`skip\` row for ${JSON.stringify(rule.path)}, ` +
        `which replaces the built-in defaults`
      : `remove the row from ${policy.source}`;
    if (verdict === "tracked") {
      refuse(
        `${policy.source}: ${rule.list} row ${JSON.stringify(rule.path)} names a path git TRACKS. ` +
          `The checkout already supplies it, so materializing it would write over committed content.`,
        `Either stop tracking ${rule.path}, or ${drop}.`,
      );
    }
    refuse(
      `${policy.source}: ${rule.list} row ${JSON.stringify(rule.path)} names a path git neither ` +
        `tracks nor ignores. Materializing it would leave the new worktree dirty at creation.`,
      `Either add ${rule.path} to .gitignore, or ${drop}.`,
    );
  }
}

/**
 * The farm directory this policy resolves to, absolute.
 *
 * A farm inside the repository is refused naming the resolved path: three
 * separate mechanisms in this tree walk the repository recursively and none of
 * them knows about a second checkout inside it, and keeping the farm out of the
 * repo's own status is what lets this lane ship with no ignore rule and no
 * exclude-block machinery.
 */
export function resolveFarmDir(policy: WorktreePolicy, repoRoot: string): string {
  const root = resolve(repoRoot);
  const parent = dirname(root);
  let farm: string;
  if (policy.farmDir === undefined) {
    farm = join(parent, WORKTREE_FARM_DIR_NAME, basename(root));
  } else {
    // The farm is a sibling-ish location, not an arbitrary one. An absolute
    // `farmDir`, or a relative one that climbs `..` past the repository's own
    // parent directory, would put a managed checkout somewhere the operator
    // never named — a shared-host escape. Both are refused naming the field.
    if (isAbsolute(policy.farmDir)) {
      refuse(
        `${policy.source}: \`farmDir\` ${JSON.stringify(policy.farmDir)} is an absolute path. ` +
          `The farm is a sibling of the repository — name it relative to the repository root.`,
        `Spell \`farmDir\` as a relative path such as \`../worktrees/${basename(root)}\`.`,
      );
    }
    farm = resolve(root, policy.farmDir);
    if (farm !== parent && !farm.startsWith(`${parent}${sep}`)) {
      refuse(
        `${policy.source}: \`farmDir\` resolves to ${farm}, which escapes the repository's parent ` +
          `directory ${parent} via \`..\`. The farm must sit beside the repository, not at an ` +
          `arbitrary location.`,
        `Point \`farmDir\` at a directory under ${parent}.`,
      );
    }
    // [m2] `farmDir: ".."` resolves EXACTLY to `parent` — the repository's own
    // parent directory. That is not an escape (it does not go past `parent`)
    // and it is not inside the repository, so neither guard above or below
    // catches it, but it makes the repository's OWN root a child of "the
    // farm": setup's `mkdir(farm, { mode: 0o700 })` and `chmod(farm, 0o700)`
    // would tighten permissions on the directory holding every sibling of the
    // repository, the repository included.
    if (farm === parent) {
      refuse(
        `${policy.source}: \`farmDir\` resolves to ${farm}, which is the repository's OWN parent ` +
          `directory. The farm must be a directory BESIDE the repository, not the directory that ` +
          `holds it — the repository itself would sit inside the farm.`,
        `Point \`farmDir\` at a new directory under ${parent}, such as \`../worktrees/${basename(root)}\`.`,
      );
    }
  }

  if (farm === root || farm.startsWith(`${root}${sep}`)) {
    refuse(
      `${policy.source}: \`farmDir\` resolves to ${farm}, which is inside the repository at ${root}. ` +
        `Nothing this lane creates lands inside the working tree — a farm there would put a second ` +
        `checkout in front of the repository's own walks and would need an ignore rule to stay out ` +
        `of git status.`,
      `Point \`farmDir\` at a directory outside ${root}.`,
    );
  }
  return farm;
}
