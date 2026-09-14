import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The spec-status gate: every document under `docs/specs/` reads a status from
 * one declared vocabulary, and a spec a shipped plan named may not still read
 * `design` (REQ-PROVE-016).
 *
 * Why this is a test and not a review habit: nothing in this repository READS a
 * spec's `status:` field — no emitter, no CLI verb, no site build — so the field
 * is documentation for a human, and documentation with no reader drifts.
 * `implementation-finish.md` reached the 1.7.0 release still reading `draft`,
 * and two designs that shipped in 1.1.0 kept reading `design` through six
 * releases. A reader who trusts the header therefore learns the wrong thing
 * about the tree, and no gate contradicts them. This one does.
 *
 * Shipping is derived, never typed: a plan's head carries a `stamp:` commit, and
 * a plan whose stamp is an ancestor of the newest release tag is a plan that
 * shipped. That keeps the gate a derivation rather than one more hand-kept pin
 * of the kind `.stamity/learnings/surface-pins-are-literals-that-drift.md`
 * records — nobody bumps a list here when a release is cut.
 *
 * The checks are PURE FUNCTIONS over text plus two injected git predicates, and
 * the tree is one caller among several: the fixture cases at the bottom drive
 * the same functions with hand-built plans and statuses, so a green run proves
 * the gate can fail as well as that the tree passes. Paths are displayed POSIX
 * (git's own spelling) and composed with `node:path` for the read, so the suite
 * holds on Windows.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const SPECS_DIR = "docs/specs";
const PLANS_DIR = "docs/plans";

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

/** The value of a frontmatter field, or null where the head carries none. */
const frontmatterField = (text: string, field: string): string | null => {
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
const stampCommit = (planText: string): string | null => {
  const stamp = frontmatterField(planText, "stamp");
  if (stamp === null) return null;
  const commit = stamp.split(/\s+/)[0] ?? "";
  return /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
};

/** The vocabulary problem with one spec's status, or null where it reads clean. */
const statusProblem = (specPath: string, specText: string): string | null => {
  const status = frontmatterField(specText, "status");
  if (status === null) return `${specPath} carries no frontmatter \`status\` (one of ${VOCABULARY_PROSE})`;
  if (STATUS_VOCABULARY.test(status)) return null;
  return `${specPath} reads status \`${status}\`, outside the vocabulary ${VOCABULARY_PROSE}`;
};

/** Every spec one plan names, deduplicated, in the order a reader meets them. */
const specsNamedBy = (planText: string): readonly string[] => [...new Set(planText.match(SPEC_REFERENCE) ?? [])];

/** The newest release tag by semver, or null where the list carries none. */
const newestReleaseTag = (tags: readonly string[]): string | null => {
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
type Shipping = "shipped" | "unshipped" | "unknown";

interface PlanHead {
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

/**
 * The gate's core derivation, pure over its inputs: for each plan that shipped
 * under `tag`, every spec it names that still reads `design` is a problem.
 *
 * `statusOf` returns null for a spec file that does not exist — those belong to
 * the dangling-reference check below, which reports them once and asks git
 * nothing, so a shallow clone still catches a mistyped spec path.
 */
const shippedDesignScan = (
  plans: readonly PlanHead[],
  statusOf: (spec: string) => string | null,
  tag: string,
  shippingOf: (stamp: string) => Shipping,
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
      if (statusOf(spec) === "design") {
        problems.push(`${spec} shipped with ${tag} through ${plan} and still reads design`);
      }
    }
  }
  return { problems, skipped };
};

/** One line per plan reference that names a spec file the tree does not carry. */
const danglingProblems = (plans: readonly PlanHead[], exists: (spec: string) => boolean): readonly string[] =>
  plans.flatMap(({ plan, specs }) =>
    specs.filter((spec) => !exists(spec)).map((spec) => `${plan} names ${spec}, which is not in the tree`),
  );

/** Every `.md` file in one repo-relative directory, as `<dir>/<name>` POSIX paths. */
const documentsIn = (dir: string): readonly string[] =>
  readdirSync(join(REPO_ROOT, ...dir.split("/")))
    .filter((name) => name.endsWith(".md"))
    .toSorted()
    .map((name) => `${dir}/${name}`);

const readDocument = (posixPath: string): string => readFileSync(join(REPO_ROOT, ...posixPath.split("/")), "utf8");

/** git, run read-only against this checkout. A null stdout means it could not answer. */
const gitStdout = (args: readonly string[]): string | null => {
  const run = spawnSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
  if (run.error !== undefined || run.status !== 0) return null;
  return run.stdout ?? "";
};

/** git's exit code, or null where the binary could not be run at all. */
const gitExitCode = (args: readonly string[]): number | null => {
  const run = spawnSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true });
  if (run.error !== undefined) return null;
  return run.status;
};

/**
 * Where a stamp sits relative to a tag: one existence question, then two
 * ancestry questions.
 *
 * The second one is what keeps `unshipped` honest. A stamp can name a commit
 * this checkout still has an object for while no ref reaches it — the plan was
 * merged under a rewritten commit, so the stamp points at the pre-rewrite one
 * (`docs/plans/001` and `docs/plans/002` both do). Reading that as "has not
 * shipped yet" would let every spec such a plan shipped walk past this gate in
 * silence, so a commit reachable from neither the release nor HEAD is reported
 * as undecidable instead — the same answer a shallow clone gets, and for the
 * same reason: nothing here can place it in the history.
 */
const shippingUnder =
  (tag: string) =>
  (stamp: string): Shipping => {
    if (gitExitCode(["cat-file", "-e", `${stamp}^{commit}`]) !== 0) return "unknown";
    if (gitExitCode(["merge-base", "--is-ancestor", stamp, tag]) === 0) return "shipped";
    return gitExitCode(["merge-base", "--is-ancestor", stamp, "HEAD"]) === 0 ? "unshipped" : "unknown";
  };

const SPEC_PATHS = documentsIn(SPECS_DIR);
const PLAN_PATHS = documentsIn(PLANS_DIR);

const SPEC_STATUS = new Map(SPEC_PATHS.map((spec) => [spec, frontmatterField(readDocument(spec), "status")]));

const PLAN_HEADS: readonly PlanHead[] = PLAN_PATHS.map((plan) => {
  const text = readDocument(plan);
  return { plan, stamp: stampCommit(text), specs: specsNamedBy(text) };
});

const TAG_LIST = gitStdout(["tag", "--list", "v*"]);
const NEWEST_TAG = TAG_LIST === null ? null : newestReleaseTag(TAG_LIST.split("\n"));

/** Why the ancestry half cannot run here, or null where it can. */
const ANCESTRY_SKIP_REASON =
  TAG_LIST === null
    ? "git could not list tags in this checkout (no git binary, or not a repository), so no release anchors the check"
    : NEWEST_TAG === null
      ? "this checkout carries no `v<major>.<minor>.<patch>` tag (a tagless or shallow clone), so no release anchors the check"
      : null;

if (ANCESTRY_SKIP_REASON !== null) {
  console.info(`spec-status gate — the shipped-spec check is skipped: ${ANCESTRY_SKIP_REASON}`);
}

describe("spec statuses", () => {
  it("finds the specs and the plans that name them", () => {
    expect(SPEC_PATHS.length).toBeGreaterThan(1);
    expect(PLAN_HEADS.filter((head) => head.specs.length > 0).length).toBeGreaterThan(1);
  });

  it("holds every spec's status to the declared vocabulary", () => {
    const problems = SPEC_PATHS.map((spec) => statusProblem(spec, readDocument(spec))).filter(
      (problem): problem is string => problem !== null,
    );
    expect(problems).toEqual([]);
  });

  it("names no spec file the tree does not carry", () => {
    const specs = new Set(SPEC_PATHS);
    expect(danglingProblems(PLAN_HEADS, (spec) => specs.has(spec))).toEqual([]);
  });

  it.skipIf(NEWEST_TAG === null)("leaves no spec reading `design` that a released plan shipped", () => {
    const tag = NEWEST_TAG ?? "";
    const scan = shippedDesignScan(PLAN_HEADS, (spec) => SPEC_STATUS.get(spec) ?? null, tag, shippingUnder(tag));
    for (const reason of scan.skipped) {
      console.info(`spec-status gate — undecided plan against ${tag}: ${reason}`);
    }
    expect(scan.problems).toEqual([]);
  });
});

/** A minimal spec document carrying one status, for the fixture cases below. */
const head = (status: string): string => `---\nid: demo\nstatus: ${status}\n---\n\n# Demo\n`;

/**
 * The three shipping answers a fixture needs, keyed by stamp: one plan that
 * shipped, one that has not, and one whose commit this checkout cannot place.
 */
const fixtureShipping = (stamp: string): Shipping =>
  stamp === "aaaaaaa" ? "shipped" : stamp === "bbbbbbb" ? "unshipped" : "unknown";

describe("fixtures — the gate fails where it must", () => {
  it("(a) refuses a status outside the vocabulary and admits the three that are in it", () => {
    expect(statusProblem("docs/specs/demo.md", head("draft"))).toContain(
      "reads status `draft`, outside the vocabulary",
    );
    expect(statusProblem("docs/specs/demo.md", head("design"))).toBeNull();
    expect(statusProblem("docs/specs/demo.md", head("shipped"))).toBeNull();
    expect(statusProblem("docs/specs/demo.md", head("shipped-with-1.7.0"))).toBeNull();
    // A version that is not three numbers is not a release this repository cut.
    expect(statusProblem("docs/specs/demo.md", head("shipped-with-1.7"))).toContain("outside the vocabulary");
    expect(statusProblem("docs/specs/demo.md", head("shipped with 1.7.0"))).toContain("outside the vocabulary");
    // A head with no status, and a document with no head at all.
    expect(statusProblem("docs/specs/demo.md", "---\nid: demo\n---\n")).toContain("carries no frontmatter");
    expect(statusProblem("docs/specs/demo.md", "# Demo\n")).toContain("carries no frontmatter");
    // A `status:` line BELOW the head is prose, not frontmatter.
    expect(statusProblem("docs/specs/demo.md", "---\nid: demo\n---\nstatus: shipped\n")).toContain(
      "carries no frontmatter",
    );
  });

  it("(b) reads the specs a plan names from its head and its body, once each", () => {
    const plan = [
      "---",
      "id: demo",
      "stamp: 0123abc 2026-09-14",
      "reads: [AGENTS.md, docs/specs/alpha.md, docs/specs/beta.md]",
      "depends_on: [docs/specs/beta.md]",
      "---",
      "",
      "The body names `docs/specs/gamma.md` too, and CHANGELOG.md, which is not a spec.",
      "Prose that names `beta.md` bare is not a reference this gate resolves.",
    ].join("\n");
    expect(specsNamedBy(plan)).toEqual(["docs/specs/alpha.md", "docs/specs/beta.md", "docs/specs/gamma.md"]);
    expect(specsNamedBy("a plan that names none")).toEqual([]);
    expect(stampCommit(plan)).toBe("0123abc");
    expect(stampCommit("---\nid: demo\n---\n")).toBeNull();
    expect(stampCommit("---\nid: demo\nstamp: pending 2026-09-14\n---\n")).toBeNull();
  });

  it("(c) picks the newest release tag by version, not by string order", () => {
    expect(newestReleaseTag(["v1.7.0", "v1.10.0", "v1.9.3", "v2.0.0"])).toBe("v2.0.0");
    expect(newestReleaseTag(["v1.9.0", "v1.10.0"])).toBe("v1.10.0");
    expect(newestReleaseTag(["v1.1.0", "v1.1.10", "v1.1.9"])).toBe("v1.1.10");
    // Prereleases and non-release tags are not releases.
    expect(newestReleaseTag(["v1.7.0", "v1.8.0-rc.1", "nightly"])).toBe("v1.7.0");
    expect(newestReleaseTag(["nightly", "v1.8.0-rc.1"])).toBeNull();
    expect(newestReleaseTag([])).toBeNull();
  });

  it("(d) flags a `design` spec a shipped plan named, and leaves the rest alone", () => {
    const plans: readonly PlanHead[] = [
      { plan: "docs/plans/010-shipped.md", stamp: "aaaaaaa", specs: ["docs/specs/alpha.md", "docs/specs/beta.md"] },
      { plan: "docs/plans/011-open.md", stamp: "bbbbbbb", specs: ["docs/specs/gamma.md"] },
      { plan: "docs/plans/012-rewritten.md", stamp: "ccccccc", specs: ["docs/specs/delta.md"] },
      { plan: "docs/plans/013-no-specs.md", stamp: null, specs: [] },
    ];
    const statuses = new Map([
      ["docs/specs/alpha.md", "design"],
      ["docs/specs/beta.md", "shipped-with-1.1.0"],
      ["docs/specs/gamma.md", "design"],
      ["docs/specs/delta.md", "design"],
    ]);
    const scan = shippedDesignScan(plans, (spec) => statuses.get(spec) ?? null, "v1.7.0", fixtureShipping);
    // Only alpha: beta already reads a release, gamma's plan has not shipped,
    // and delta's plan is undecidable rather than clean.
    expect(scan.problems).toEqual([
      "docs/specs/alpha.md shipped with v1.7.0 through docs/plans/010-shipped.md and still reads design",
    ]);
    expect(scan.skipped).toEqual([
      "docs/plans/012-rewritten.md: commit ccccccc is reachable from neither v1.7.0 nor HEAD in this checkout " +
        "(shallow history, or a stamp whose commit was rewritten), so its shipping is undecidable",
    ]);

    // Restamping the flagged spec is what clears it, and nothing else moves.
    const restamped = new Map(statuses).set("docs/specs/alpha.md", "shipped-with-1.7.0");
    expect(shippedDesignScan(plans, (spec) => restamped.get(spec) ?? null, "v1.7.0", fixtureShipping).problems).toEqual(
      [],
    );
  });

  it("(e) reports a plan with no stamp rather than treating it as unshipped", () => {
    const plans: readonly PlanHead[] = [
      { plan: "docs/plans/014-unstamped.md", stamp: null, specs: ["docs/specs/alpha.md"] },
    ];
    const scan = shippedDesignScan(
      plans,
      () => "design",
      "v1.7.0",
      () => "shipped",
    );
    expect(scan.problems).toEqual([]);
    expect(scan.skipped).toEqual([
      "docs/plans/014-unstamped.md: its head carries no `stamp:` commit, so nothing dates it against v1.7.0",
    ]);
  });

  it("(f) reports a named spec that does not exist as a dangling reference, git or no git", () => {
    const plans: readonly PlanHead[] = [
      { plan: "docs/plans/015-typo.md", stamp: null, specs: ["docs/specs/alpha.md", "docs/specs/typo.md"] },
      { plan: "docs/plans/016-clean.md", stamp: "aaaaaaa", specs: ["docs/specs/alpha.md"] },
    ];
    expect(danglingProblems(plans, (spec) => spec === "docs/specs/alpha.md")).toEqual([
      "docs/plans/015-typo.md names docs/specs/typo.md, which is not in the tree",
    ]);
    expect(danglingProblems(plans, () => true)).toEqual([]);
    // A dangling spec is not also counted as a `design` spec by the shipped scan.
    const scan = shippedDesignScan(
      plans,
      (spec) => (spec === "docs/specs/alpha.md" ? "shipped" : null),
      "v1.7.0",
      () => "shipped",
    );
    expect(scan.problems).toEqual([]);
  });
});
