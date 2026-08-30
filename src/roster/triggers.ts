/**
 * Specialist trigger table: which quality specialist a changed file pulls into
 * a review. Zero-import kernel data module.
 *
 * The table carries the three trigger-conditional specialists — security,
 * design-quality, performance — which are the roster the specialist tier is
 * defined by. The mechanism (row shape, lookup, path-match semantics) is engine
 * code; the rows are content, so a roster change stays a data edit rather than
 * a code one.
 *
 * WHO READS IT, exactly — no `src/` module does. The composition root
 * (`src/composition/root.ts`) namespace-imports it the way it imports every
 * module, which is wiring rather than reading: it calls nothing here. The rows
 * are the reference the corpus is held against, and the readers are parity
 * suites:
 *
 * - `test/corpus/agents/specialists.test.ts` — each specialist agent body's
 *   `## Trigger` section against its row, both directions, so neither a pattern
 *   added here nor one left behind in a prompt passes as agreement.
 * - `test/corpus/commands/work.test.ts` — the `/st-work` specialist pass
 *   names every id here and copies none of the patterns.
 * - `test/corpus/rules/security.test.ts` — the security floor's hand-off names
 *   a specialist this table actually carries.
 * - `test/roster/roster.test.ts` — the rows, the matching semantics, and this
 *   list.
 *
 * The header used to claim a validator lane and generated prompt text as
 * consumers. Neither exists: no validator reads the table, and the prompt text
 * is authored, with the suites above as the parity gate that keeps it honest.
 * Emitting those three agent-body tables FROM these rows would retire the
 * hand-maintained copies; until something does, this list is what the claim is
 * worth, and it is asserted rather than promised (`test/roster/roster.test.ts`
 * checks every path named here imports this module).
 *
 * Consumers must still behave on an EMPTY table — trigger nothing — rather than
 * assuming rows exist. Two ways in reach it that way: a caller passing its own
 * table (the `table` parameter every function here takes, which the suites use
 * for fixture rows) and any future roster trimmed back to nothing. A consumer
 * that assumes a match breaks on both.
 */

/** One roster row: the files and topics that pull a specialist into a review. */
export interface SpecialistTrigger {
  /** Specialist agent id. */
  specialist: string;
  /**
   * Path patterns, always authored posix-style. Four accepted forms:
   * - `routes/` — directory-segment glob; matches any path having `routes` as
   *   a path segment (`src/server/routes/auth.ts`, `routes/index.ts`).
   * - `*.tsx` — basename suffix.
   * - `package.json` — exact basename.
   * - `*` — matches every path. This is the one supported spelling for a row
   *   that triggers on any change at all, so an always-on specialist needs no
   *   separate mode flag on the row. Any other pattern that would match
   *   everything (a blank pattern, or one made only of separators) is treated
   *   as malformed and matches nothing instead.
   */
  triggerPaths: readonly string[];
  /** Topics an orchestrator matches against a task description. */
  triggerKeywords: readonly string[];
  /** Why the specialist is triggered; emitted verbatim into generated prompts. */
  rationale: string;
}

/**
 * The shipped roster: one row per trigger-conditional specialist, ids in the
 * runtime (prefixed) namespace so a triggered specialist resolves to the same
 * id the tool-policy guard rules on. A specialist named here with no policy row
 * would be triggered into a spawn the guard answers `NO_POLICY` for — an agent
 * invited in and then allowed nothing — so the two rosters are cross-checked in
 * `test/roster/roster.test.ts`.
 *
 * `*` is deliberately absent. The security row is always-on-MATCH, which scopes
 * it to the authentication, cryptography, input and dependency surfaces below;
 * a `*` row would make it always-on outright, which is a second reviewer rather
 * than a specialist. Rows therefore match by directory segment, basename
 * suffix, and exact basename only.
 */
export const SPECIALIST_TRIGGER_TABLE: readonly SpecialistTrigger[] = [
  {
    specialist: "stamity-security",
    triggerPaths: [
      "auth/",
      "middleware/",
      "crypto/",
      "api/",
      "routes/",
      "handlers/",
      "*.pem",
      "*.key",
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "requirements.txt",
      "go.mod",
      "cargo.toml",
      "gemfile",
    ],
    triggerKeywords: [
      "authentication",
      "authorization",
      "session",
      "permission",
      "encryption",
      "signing",
      "hashing",
      "input validation",
      "injection",
      "deserialization",
      "upload",
      "dependency",
      "advisory",
      "supply chain",
    ],
    rationale:
      "Authentication, cryptography, trust boundaries and the dependency set are where a missed defect is paid for after release rather than in review.",
  },
  {
    specialist: "stamity-design-quality",
    triggerPaths: [
      "components/",
      "pages/",
      "views/",
      "*.tsx",
      "*.jsx",
      "*.vue",
      "*.svelte",
      "*.css",
      "*.scss",
    ],
    triggerKeywords: [
      "component",
      "empty state",
      "error state",
      "loading state",
      "form",
      "design token",
      "contrast",
      "focus",
      "keyboard",
      "navigation",
      "accessibility",
    ],
    rationale:
      "A rendered surface carries success criteria and design-token obligations that need a measured value, not a judgment made from the diff alone.",
  },
  {
    specialist: "stamity-performance",
    triggerPaths: ["queries/", "*.sql", "workers/", "queue/", "jobs/", "cache/", "benchmarks/"],
    triggerKeywords: [
      "n+1",
      "index",
      "pagination",
      "throughput",
      "batch",
      "concurrency",
      "latency",
      "bundle size",
      "cache invalidation",
      "benchmark",
      "budget",
    ],
    rationale:
      "Data access, background work and cache surfaces are where cost per operation moves, and where a declared budget can turn a cost claim into a blocking one.",
  },
];

/**
 * First row matching `specialist`, or `undefined`.
 *
 * First-wins on duplicates: rows are data, and a duplicate specialist id is a
 * data defect {@link duplicateSpecialistIds} reports and the roster suite
 * (`test/roster/roster.test.ts`) fails the shipped table on. This lookup
 * deliberately does not merge or reconcile duplicate rows — that would hide the
 * defect behind plausible behaviour.
 */
export function findSpecialistTrigger(
  specialist: string,
  table: readonly SpecialistTrigger[] = SPECIALIST_TRIGGER_TABLE,
): SpecialistTrigger | undefined {
  return table.find((row) => row.specialist === specialist);
}

/**
 * Specialist ids appearing on more than one row, in first-duplicate order. A
 * shippable table yields `[]`; anything else fails the roster suite.
 */
export function duplicateSpecialistIds(
  table: readonly SpecialistTrigger[] = SPECIALIST_TRIGGER_TABLE,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of table) {
    if (seen.has(row.specialist)) duplicates.add(row.specialist);
    else seen.add(row.specialist);
  }
  return [...duplicates];
}

/** Lower-cased, posix-separated form used by every comparison below. */
function normalize(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function basenameOf(normalizedPath: string): string {
  return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
}

/** The one pattern that deliberately matches every path. */
const MATCH_ALL = "*";

function matchesPattern(normalizedPath: string, pattern: string): boolean {
  const needle = normalize(pattern).trim();
  if (needle === MATCH_ALL) return true;

  // Blank or separator-only patterns are malformed rows. They are rejected
  // outright rather than left to fall through: a bare `/` would otherwise
  // match every absolute path, making a typo look like an always-on row.
  if (needle.replaceAll("/", "") === "") return false;

  // Directory-segment glob: a segment match, never a substring one, so
  // `routes/` does not match `myroutesfile.ts`.
  if (needle.endsWith("/")) {
    return normalizedPath.startsWith(needle) || normalizedPath.includes(`/${needle}`);
  }

  const basename = basenameOf(normalizedPath);
  return needle.startsWith(MATCH_ALL) ? basename.endsWith(needle.slice(1)) : basename === needle;
}

/**
 * Specialists triggered by one changed file, in table order and deduped.
 *
 * The path is normalized to posix separators and lower-cased first, so a
 * Windows-style path triggers exactly the rows its posix twin does and the
 * result never depends on the host platform.
 */
export function specialistsForPath(
  filePath: string,
  table: readonly SpecialistTrigger[] = SPECIALIST_TRIGGER_TABLE,
): string[] {
  const normalized = normalize(filePath);
  if (normalized === "") return [];

  const triggered = new Set<string>();
  for (const row of table) {
    if (row.triggerPaths.some((pattern) => matchesPattern(normalized, pattern))) {
      triggered.add(row.specialist);
    }
  }
  return [...triggered];
}
