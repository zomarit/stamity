import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The spec-status gate's rules (REQ-PROVE-016): the status vocabulary, the plan-head reads, the
 * newest release tag, and the shipped-spec derivation, as PURE FUNCTIONS over text plus two injected
 * git predicates. Two callers drive them: the records suite over the committed plans and specs
 * (`test/records/specStatus.test.ts`, `npm run test:records`) and the fixture cases over hand-built
 * plans and statuses (`test/authoring/specStatusRules.test.ts`, `npm test`), so a green run proves
 * the gate can fail as well as that the tree passes.
 *
 * Moved from `test/records/specStatus.test.ts` (2026-10-14, unit r1-records-suite, REQ-PROVE-025)
 * so the fixture cases run without the records on disk; no rule, message or verdict changed. The
 * two readers at the bottom take the root they read under, so each caller names its own tree.
 */

/**
 * The status vocabulary. `design` is a document whose requirements have not
 * shipped; `shipped` is the unversioned legacy spelling the older designs
 * carry; `shipped-with-<major>.<minor>.<patch>` names the release that landed
 * it. `draft` is deliberately absent — it says nothing a reader can place
 * against the tree, which is how one survived a release.
 */
const STATUS_VOCABULARY = /^(design|shipped|shipped-with-\d+\.\d+\.\d+)$/;

const VOCABULARY_PROSE = "design | shipped | shipped-with-<major>.<minor>.<patch>";

/** A release tag: exactly `v<major>.<minor>.<patch>`, so a prerelease is not one. */
const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * A spec named the way a plan names one: the repo-relative path. The bare
 * backticked filename some plan prose uses (`` `worktree-lane.md` ``) is NOT a
 * reference for this gate's purposes — resolving bare names would leave the
 * dangling-reference check below unable to tell a mistyped spec from an
 * ordinary word ending in `.md`, and the path form is what every plan head
 * writes.
 */
const SPEC_REFERENCE = /docs\/specs\/[A-Za-z0-9._-]+\.md/g;

/**
 * A requirement id: `REQ-<AREA>-<nnn>`, the area spelled the way
 * `content/skills/st-verify/scripts/spec-plan-coverage.mjs` reads it.
 */
const REQUIREMENT_ID = "REQ-[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)*-\\d{3,}";

/**
 * A line that defines a requirement rather than mentions one: a `###`–`######`
 * heading or a `- **REQ-…` bullet, the two definition forms the coverage script
 * reads. A spec's prose that cites another spec's id defines nothing here.
 */
const REQUIREMENT_DEFINITION = new RegExp(`^(?:#{3,6}\\s+|[-*]\\s+\\*\\*)(${REQUIREMENT_ID})`);

/** Every requirement id cited anywhere in a text. */
const REQUIREMENT_CITATION = new RegExp(REQUIREMENT_ID, "g");

/** The requirement ids a spec defines, deduplicated, in document order. */
export const requirementIdsOf = (specText: string): readonly string[] => [
  ...new Set(
    specText.split("\n").flatMap((line) => {
      const match = REQUIREMENT_DEFINITION.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    }),
  ),
];

/** Every requirement id one text cites, deduplicated. */
export const requirementIdsCitedIn = (text: string): readonly string[] => [...new Set(text.match(REQUIREMENT_CITATION) ?? [])];

/** The value of a frontmatter field, or null where the head carries none. */
export const frontmatterField = (text: string, field: string): string | null => {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const pattern = new RegExp(`^${field}:\\s*(\\S.*?)\\s*$`);
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") return null;
    const match = pattern.exec(line);
    if (match !== null) return match[1] ?? null;
  }
  return null;
};

/** The commit a plan's `stamp: <commit> <date>` names, or null where it has none. */
export const stampCommit = (planText: string): string | null => {
  const stamp = frontmatterField(planText, "stamp");
  if (stamp === null) return null;
  const commit = stamp.split(/\s+/)[0] ?? "";
  return /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
};

/** The vocabulary problem with one spec's status, or null where it reads clean. */
export const statusProblem = (specPath: string, specText: string): string | null => {
  const status = frontmatterField(specText, "status");
  if (status === null) return `${specPath} carries no frontmatter \`status\` (one of ${VOCABULARY_PROSE})`;
  if (STATUS_VOCABULARY.test(status)) return null;
  return `${specPath} reads status \`${status}\`, outside the vocabulary ${VOCABULARY_PROSE}`;
};

/** Every spec one plan names, deduplicated, in the order a reader meets them. */
export const specsNamedBy = (planText: string): readonly string[] => [...new Set(planText.match(SPEC_REFERENCE) ?? [])];

/** The newest release tag by semver, or null where the list carries none. */
export const newestReleaseTag = (tags: readonly string[]): string | null => {
  const releases = tags
    .map((tag) => ({ tag: tag.trim(), parts: RELEASE_TAG.exec(tag.trim()) }))
    .filter((entry): entry is { tag: string; parts: RegExpExecArray } => entry.parts !== null)
    .map(({ tag, parts }) => ({ tag, key: [Number(parts[1]), Number(parts[2]), Number(parts[3])] as const }));
  if (releases.length === 0) return null;
  // Descending by (major, minor, patch) — a lexicographic sort would rank
  // v1.9.0 above v1.10.0, which is the whole reason this is parsed.
  const ordered = releases.toSorted((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2]);
  return ordered[0]?.tag ?? null;
};

/** Where a plan's stamp sits against a tag: shipped under it, not yet, or not in this checkout. */
export type Shipping = "shipped" | "unshipped" | "unknown";

export interface PlanHead {
  /** The plan's repo-relative POSIX path. */
  readonly plan: string;
  /** The commit its head stamps, or null where it stamps none. */
  readonly stamp: string | null;
  /** The specs it names, by repo-relative POSIX path. */
  readonly specs: readonly string[];
}

interface ShippedScan {
  /** One line per spec that shipped and still reads `design`. */
  readonly problems: readonly string[];
  /** One line per plan the scan could not decide, each naming why. */
  readonly skipped: readonly string[];
}

/** What the tree says about a spec's requirements: the ids it defines, and who cites each. */
export interface Citations {
  /** The requirement ids one spec defines; empty where it defines none. */
  readonly idsOf: (spec: string) => readonly string[];
  /** The first file under `test/` citing one id, or null where none does. */
  readonly citedBy: (id: string) => string | null;
}

/** No ids known for any spec: every `design` spec a shipped plan named is flagged. */
const NO_CITATIONS: Citations = { idsOf: () => [], citedBy: () => null };

/**
 * The gate's core derivation, pure over its inputs: for each plan that shipped
 * under `tag`, every spec it names that still reads `design` is a problem —
 * unless the spec defines requirement ids and no test cites any of them, which
 * is a spec the plan wrote ahead of the release that builds it.
 *
 * `statusOf` returns null for a spec file that does not exist — those belong to
 * the dangling-reference check below, which reports them once and asks git
 * nothing, so a shallow clone still catches a mistyped spec path.
 */
export const shippedDesignScan = (
  plans: readonly PlanHead[],
  statusOf: (spec: string) => string | null,
  tag: string,
  shippingOf: (stamp: string) => Shipping,
  citations: Citations = NO_CITATIONS,
): ShippedScan => {
  const problems: string[] = [];
  const skipped: string[] = [];

  for (const { plan, stamp, specs } of plans) {
    if (specs.length === 0) continue;
    if (stamp === null) {
      skipped.push(`${plan}: its head carries no \`stamp:\` commit, so nothing dates it against ${tag}`);
      continue;
    }
    const shipping = shippingOf(stamp);
    if (shipping === "unknown") {
      skipped.push(
        `${plan}: commit ${stamp} is reachable from neither ${tag} nor HEAD in this checkout ` +
          `(shallow history, or a stamp whose commit was rewritten), so its shipping is undecidable`,
      );
      continue;
    }
    if (shipping === "unshipped") continue;
    for (const spec of specs) {
      if (statusOf(spec) !== "design") continue;
      const problem = `${spec} shipped with ${tag} through ${plan} and still reads design`;
      const ids = citations.idsOf(spec);
      if (ids.length === 0) {
        problems.push(problem);
        continue;
      }
      for (const id of ids) {
        const file = citations.citedBy(id);
        if (file === null) continue;
        problems.push(`${problem} (${file} cites ${id})`);
        break;
      }
    }
  }
  return { problems, skipped };
};

/** One line per plan reference that names a spec file the tree does not carry. */
export const danglingProblems = (plans: readonly PlanHead[], exists: (spec: string) => boolean): readonly string[] =>
  plans.flatMap(({ plan, specs }) =>
    specs.filter((spec) => !exists(spec)).map((spec) => `${plan} names ${spec}, which is not in the tree`),
  );

/** Every `.md` file in one directory under `root`, as `<dir>/<name>` POSIX paths. */
export const documentsUnder = (root: string, dir: string): readonly string[] =>
  readdirSync(join(root, ...dir.split("/")))
    .filter((name) => name.endsWith(".md"))
    .toSorted()
    .map((name) => `${dir}/${name}`);

/** One document under `root`, by its POSIX path. */
export const readDocumentUnder = (root: string, posixPath: string): string =>
  readFileSync(join(root, ...posixPath.split("/")), "utf8");
