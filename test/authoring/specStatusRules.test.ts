import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  danglingProblems,
  documentsUnder,
  newestReleaseTag,
  readDocumentUnder,
  requirementIdsCitedIn,
  requirementIdsOf,
  shippedDesignScan,
  specsNamedBy,
  stampCommit,
  statusProblem,
  type PlanHead,
  type Shipping,
} from "../support/specStatusRules.ts";

/**
 * The spec-status gate's rules (REQ-PROVE-016) over the specs and over hand-built
 * plans: every document under `docs/specs/` reads a status from one declared
 * vocabulary, and the fixture cases drive the pure functions of
 * `test/support/specStatusRules.ts`, so a green run proves the gate can fail as
 * well as that the tree passes. The checks that read the plans, which are
 * records, are the records suite's (`test/records/specStatus.test.ts`,
 * `npm run test:records`).
 *
 * TEST CHANGE, justified (2026-10-14, unit r1-records-suite, REQ-PROVE-025): every
 * case below moved here from `test/records/specStatus.test.ts` under its own name
 * and describe, its body unchanged, so `npm test` runs them in a checkout that
 * carries no record. The vocabulary case reads `docs/specs/` alone, which stays on
 * `main`.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const SPECS_DIR = "docs/specs";

/** Every `.md` file in one repo-relative directory, as `<dir>/<name>` POSIX paths. */
const documentsIn = (dir: string): readonly string[] => documentsUnder(REPO_ROOT, dir);

const readDocument = (posixPath: string): string => readDocumentUnder(REPO_ROOT, posixPath);

const SPEC_PATHS = documentsIn(SPECS_DIR);

describe("spec statuses", () => {
  it("holds every spec's status to the declared vocabulary", () => {
    const problems = SPEC_PATHS.map((spec) => statusProblem(spec, readDocument(spec))).filter(
      (problem): problem is string => problem !== null,
    );
    expect(problems).toEqual([]);
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

  it("(g) passes a spec a plan wrote ahead of the release until a test cites one of its ids", () => {
    // The fixture ids use the area `DEMO`, which no spec defines: this file is
    // itself under `test/`, so a real id written here would count as a citation.
    const plans: readonly PlanHead[] = [
      { plan: "docs/plans/020-ahead.md", stamp: "aaaaaaa", specs: ["docs/specs/ahead.md", "docs/specs/bare.md"] },
    ];
    const ids = new Map<string, readonly string[]>([
      ["docs/specs/ahead.md", ["REQ-DEMO-001", "REQ-DEMO-002"]],
      ["docs/specs/bare.md", []],
    ]);
    const idsOf = (spec: string): readonly string[] => ids.get(spec) ?? [];

    // Written ahead: no test cites ahead.md's ids, so it is not flagged; bare.md
    // defines no id at all, so it keeps the old rule and is.
    const ahead = shippedDesignScan(plans, () => "design", "v1.12.0", fixtureShipping, {
      idsOf,
      citedBy: () => null,
    });
    expect(ahead.problems).toEqual([
      "docs/specs/bare.md shipped with v1.12.0 through docs/plans/020-ahead.md and still reads design",
    ]);

    // One test citing one of its ids is the shipped behaviour the status must name.
    const cited = shippedDesignScan(plans, () => "design", "v1.12.0", fixtureShipping, {
      idsOf,
      citedBy: (id) => (id === "REQ-DEMO-002" ? "test/demo/ahead.test.ts" : null),
    });
    expect(cited.problems).toEqual([
      "docs/specs/ahead.md shipped with v1.12.0 through docs/plans/020-ahead.md and still reads design " +
        "(test/demo/ahead.test.ts cites REQ-DEMO-002)",
      "docs/specs/bare.md shipped with v1.12.0 through docs/plans/020-ahead.md and still reads design",
    ]);
  });

  it("(h) reads a spec's own ids from its definitions, and a citation from any mention", () => {
    const spec = [
      "---",
      "id: demo",
      "status: design",
      "---",
      "# Demo",
      "",
      "Builds on REQ-OTHER-004, which this spec does not define.",
      "",
      "## Requirements",
      "",
      "### REQ-DEMO-001 — The first",
      "#### REQ-DEMO-002 (MODIFIED)",
      "- **REQ-DEMO-003** — a bullet definition",
      "### REQ-DEMO-001 — repeated",
      "### REQ-DEMO-WIDE-010 — an area with a hyphen",
      "## Not a requirement heading: REQ-DEMO-099",
    ].join("\n");
    expect(requirementIdsOf(spec)).toEqual(["REQ-DEMO-001", "REQ-DEMO-002", "REQ-DEMO-003", "REQ-DEMO-WIDE-010"]);
    expect(requirementIdsOf(head("design"))).toEqual([]);

    const testText = 'it("REQ-DEMO-002: holds", () => {}); // and REQ-DEMO-1234, REQ-DEMO-002 again; REQ-12 is no id';
    expect(requirementIdsCitedIn(testText)).toEqual(["REQ-DEMO-002", "REQ-DEMO-1234"]);
    expect(requirementIdsCitedIn("no ids here")).toEqual([]);
  });
});
