import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  danglingProblems,
  documentsUnder,
  frontmatterField,
  newestReleaseTag,
  readDocumentUnder,
  requirementIdsCitedIn,
  requirementIdsOf,
  shippedDesignScan,
  specsNamedBy,
  stampCommit,
  type Citations,
  type PlanHead,
  type Shipping,
} from "../support/specStatusRules.ts";

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
 * A plan can be written, and stamped, a release or more before its spec's
 * requirements are built: plan 015 named `docs/specs/board-writes.md` at its
 * stamp, and the release after it shipped none of that spec. Restamping such a
 * spec would be false, so a `design` spec a shipped plan named is flagged only
 * when a file under `test/` cites one of the requirement ids the spec itself
 * defines — the `REQ-<AREA>-<nnn>` join key plan units, deltas and test names
 * share. A spec that defines no id keeps the old rule and is flagged. This is
 * still derived from the tree, never typed into a list.
 *
 * The checks are PURE FUNCTIONS over text plus two injected git predicates,
 * kept in `test/support/specStatusRules.ts`, and the tree is one caller among
 * several: the fixture cases in `test/authoring/specStatusRules.test.ts` drive
 * the same functions with hand-built plans and statuses, so a green run proves
 * the gate can fail as well as that the tree passes. Paths are displayed POSIX
 * (git's own spelling) and composed with `node:path` for the read, so the suite
 * holds on Windows.
 *
 * This file reads the plans under `docs/plans/`, which are records, so it is part
 * of the records suite (`npm run test:records`, `vitest.records.config.ts`) and
 * `npm test` does not run it (2026-10-14, unit r1-records-suite, REQ-PROVE-025).
 * The vocabulary case, over `docs/specs/` alone, moved to the fixture file.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const SPECS_DIR = "docs/specs";
const PLANS_DIR = "docs/plans";

/** The tree a citation is read from: a test names the requirement it proves. */
const TESTS_DIR = "test";

/** Every `.md` file in one repo-relative directory, as `<dir>/<name>` POSIX paths. */
const documentsIn = (dir: string): readonly string[] => documentsUnder(REPO_ROOT, dir);

const readDocument = (posixPath: string): string => readDocumentUnder(REPO_ROOT, posixPath);

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

/**
 * The tree's citations: each spec's own ids, and the first file under `test/`
 * (sorted, POSIX) citing each id. Read only when the shipped-spec check runs.
 */
const treeCitations = (): Citations => {
  const firstCiter = new Map<string, string>();
  const files = readdirSync(join(REPO_ROOT, TESTS_DIR), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
  for (const file of files) {
    const display = relative(REPO_ROOT, file).replaceAll("\\", "/");
    for (const id of requirementIdsCitedIn(readFileSync(file, "utf8"))) {
      if (!firstCiter.has(id)) firstCiter.set(id, display);
    }
  }
  return {
    idsOf: (spec) => requirementIdsOf(readDocument(spec)),
    citedBy: (id) => firstCiter.get(id) ?? null,
  };
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

  it("names no spec file the tree does not carry", () => {
    const specs = new Set(SPEC_PATHS);
    expect(danglingProblems(PLAN_HEADS, (spec) => specs.has(spec))).toEqual([]);
  });

  it.skipIf(NEWEST_TAG === null)("leaves no spec reading `design` that a released plan shipped", () => {
    const tag = NEWEST_TAG ?? "";
    const scan = shippedDesignScan(
      PLAN_HEADS,
      (spec) => SPEC_STATUS.get(spec) ?? null,
      tag,
      shippingUnder(tag),
      treeCitations(),
    );
    for (const reason of scan.skipped) {
      console.info(`spec-status gate — undecided plan against ${tag}: ${reason}`);
    }
    expect(scan.problems).toEqual([]);
  });
});
