import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonical, canonicalOnly } from "../support/identity.ts";

/**
 * The renamed private downstream, proved rather than promised.
 *
 * `docs/enterprise-forks.md` tells a downstream to rename the package to its own scope,
 * set `stamity.publisher`, repoint `repository.url`, set `private: true` and then run
 * this repository's own gate. The audit (FORK-3) found that gate red on a fork through
 * no fault of the fork's, a behaviour of the renamed tree, so it is checked against a
 * renamed tree.
 *
 * One group here, the spelling census, always on and the cheapest: the CLI and CI suites are
 * read as text and held to deriving the name, the owner and the owner/repository route rather
 * than spelling them, so a new canonical literal is caught before any renamed tree runs.
 *
 * The renamed tree itself runs in CI: `ci.yml`'s `fork-probe` job (`scripts/ci/fork-probe.mjs`,
 * REQ-PLUGIN-033) copies this checkout, renames the copy with `scripts/fork-identity.mjs`, gives
 * it a `-fork.1` version and runs every step of `npm run check` in it, on every pull request.
 *
 * TEST CHANGE, justified (plan 020 d1, REQ-PLUGIN-028): a third group, "a private fork's
 * regenerated marketplace", ran `scripts/generate-plugin-manifests.mjs` over a renamed tree and
 * read the plugin catalog's source. The plugin route and that generator are deleted in 1.15.0,
 * and `scripts/fork-identity.mjs` no longer regenerates any plugin surface, so the group went with
 * them; no fork-identity behaviour it proved is left.
 *
 * TEST CHANGE, justified (REQ-FORK-011, plan 022 file 2, unit b1-fork-ci-job): the opt-in
 * "inherited gate" group (`STAMITY_FORK_SUITE=1`) and its list of fifteen identity-sensitive
 * suites are retired. They ran those suites in a renamed copy only when someone set the variable,
 * and no workflow did; the `fork-probe` job runs the WHOLE suite in a renamed copy on every pull
 * request, so the group only confirmed a subset of what that job proves.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every `.ts` file under one directory, as repository-relative POSIX paths. */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    found.push(relative(REPO_ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"));
  }
  return found.toSorted();
}

/**
 * The canonical identity's four spellings, each a value a renamed fork derives differently:
 * the package NAME (`name`), the `<owner>/<repository>` ROUTE a marketplace add, an install
 * spec or a github.com URL carries (`repository.url`), the OWNER or publisher as a whole
 * quoted string (`stamity.publisher`), and the owner's github.com URL the catalogs emit as
 * `owner.url`. The route excludes a leading `@` so the name is not counted twice, and the
 * owner URL excludes a following `/stamity` so a repository URL is counted once, as a route;
 * any other continuation (a closing quote, a slash, a `${…}` repository) still counts.
 * Written as patterns with an escaped separator, so this file does not match its own table.
 */
const CANONICAL_SPELLINGS = {
  name: /@zomarit\/stamity/g,
  route: /(?<!@)zomarit\/stamity/g,
  owner: /(["'`])zomarit\1/g,
  ownerUrl: /github\.com\/zomarit(?![\w-])(?!\/stamity)/g,
} as const;

type Spelling = keyof typeof CANONICAL_SPELLINGS;
type SpellingCounts = Partial<Record<Spelling, number>>;

/**
 * A suite's code with the prose taken out: block comments, line comments (not the `//` of a
 * URL, which is a value) and test titles. All three may name the canonical identity as prose,
 * and none of them is an assertion a fork can fail.
 *
 * A block comment is taken only where it opens a line: a `/*` anywhere else in these suites is
 * a glob inside a string (`"**\/*.md"`, `"@acme/*"`, `"plugins/*.zip"`), and stripping from
 * there to the next `*\/` hid whole stretches of real code from the count. A future inline
 * comment the anchor misses is left in as code, which can only make this check louder.
 */
function codeOf(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8")
    .replaceAll(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replaceAll(/(?<!:)\/\/[^\n]*/g, "")
    .replaceAll(/\b(?:it|test|describe)(?:\.\w+)*\(\s*(["'])(?:\\.|(?!\1).)*\1/g, "");
}

/** How many times each canonical spelling occurs in one suite's code; absent when none. */
function spellingsIn(relPath: string): SpellingCounts {
  const code = codeOf(relPath);
  const counts: SpellingCounts = {};
  for (const [spelling, pattern] of Object.entries(CANONICAL_SPELLINGS) as [Spelling, RegExp][]) {
    const found = code.match(pattern)?.length ?? 0;
    if (found > 0) counts[spelling] = found;
  }
  return counts;
}

describe("the identity the CLI and CI suites assert against", () => {
  it("is read from the manifest, not spelled as the canonical package, owner or route", () => {
    // `docs/enterprise-forks.md` tells a downstream that its rename needs no test edit. That
    // claim is true only while every assertion about THIS checkout's identity derives it, so
    // the tree is held to it here rather than the page being trusted. The CI suites are walked
    // as well as the CLI ones: the plugin distribution suites shipped in 1.9.0 spelled the
    // owner and the route as literals, a renamed fork's gate went red on them, and
    // this check — then CLI-only and name-only — had nothing to say.
    const files = [...walk(join(REPO_ROOT, "test/cli")), ...walk(join(REPO_ROOT, "test/ci"))];
    expect(files.filter((relPath) => relPath.startsWith("test/cli/")).length, "no CLI suite was walked").toBeGreaterThan(10);
    expect(files.filter((relPath) => relPath.startsWith("test/ci/")).length, "no CI suite was walked").toBeGreaterThan(10);
    const found = Object.fromEntries(
      files.map((relPath) => [relPath, spellingsIn(relPath)] as const).filter(([, counts]) => Object.keys(counts).length > 0),
    );
    // The exceptions, each stating the canonical identity on purpose, pinned by COUNT per
    // spelling rather than by file: a file already on this list that grows one more literal
    // fails here too, until somebody writes down why. What every entry has in common is that
    // the literal is not this checkout's identity — it is a synthetic fixture the suite builds
    // its own input from, a committed file's text the rename does not touch, or a case gated
    // on `canonical()` — so a renamed fork passes each of them unedited.
    const deliberate: Record<string, SpellingCounts & { readonly why: string }> = {
      // ── test/cli ──
      // The FALLBACK the production helper uses when the self-read finds no manifest at
      // all: there is no other name it could give, so the literal IS the subject.
      // TEST CHANGE (sw26-engine-cli-call-form fix round 1): was `name: 3`. The unit's fork
      // emission case (75e18e5e) added two literals the census never moved: the canonical name
      // must be ABSENT from a renamed fork's init and sync output, true in every checkout.
      "test/cli/kit/packageName.test.ts": {
        name: 5,
        why: "proves the unnamed-manifest fallback, and that a renamed fork's emission never names the canonical package",
      },
      // A renamed pseudo package root, asserting the canonical name does NOT leak into
      // its remedies. The literal is the thing that must be absent.
      "test/cli/commands/check.test.ts": { name: 1, why: "asserts the canonical fallback stays out of a renamed run" },
      // The registry-probe fixtures: a synthetic manifest and the percent-encoded name the
      // registry is asked for, neither read from this checkout.
      "test/cli/notice/updateNotice.test.ts": { name: 2, why: "pins the registry probe's encoded package name" },
      // TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): the eleven entries for the
      // plugin route's stub runtimes and synthetic plugin documents (`pluginDistribution`,
      // `pluginLifecycle`, the five `pluginPackages` suites, `pluginRoute`, `pluginModules`,
      // `pluginLocate`) and `releaseManifest` left with their files, deleted with the route in
      // 1.15.0. No literal moved into another file.
      // ── test/ci: the resolver fed a synthetic manifest ──
      // `pkg()` builds a manifest from a constant, never from this checkout, and the absent
      // `stamity.publisher` default IS the canonical owner in production.
      // TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): was `route: 2, owner: 3`.
      // The suite was rewritten for the resolver's publisher half; it names the default owner once,
      // as a constant, and builds its synthetic repository from that constant, not as a route.
      "test/ci/distributionIdentity.test.ts": { owner: 1, why: "the absent-publisher default, from which the synthetic manifest's repository is built" },
      // ── test/ci: GitHub context and committed workflow text ──
      // The canonical repository guard the workflows carry, and the Actions context fed to
      // it. A committed file's text a rename does not touch; the fork guide leaves workflow
      // customization, and the tests that pin it, to the fork.
      // TEST CHANGE (plan 014 file 1, unit f3-nightly-canonical-guard): was `route: 13`. The
      // nightly guard's case adds three literals: the guard string the three jobs must carry,
      // and the canonical repository in two context rows it is evaluated against. Committed
      // workflow text again, so a renamed fork passes the case unedited.
      // TEST CHANGE (run 2026-10-13_records-branch, unit r5-ci-records-job): was `route: 16`. One
      // literal joins, the constant naming ci.yml's canonical records-job guard and the repository
      // its aggregator compares `$REPO` against; committed workflow text, unedited by a rename.
      // TEST CHANGE (plan 020 file 1, unit d5-scripts-trees, re-counting unit d3-ci-qa's edit): was
      // `route: 17`. Two literals left with the APM and plugin route cases: the APM route smoke's
      // canonical `--source` and the plugin distribution push's repository constant.
      "test/ci/workflow.test.ts": { route: 15, why: "the workflows' canonical repository guard and the contexts evaluated against it" },
      "test/ci/packSigningRehearsal.test.ts": { route: 4, why: "the rehearsal workflow's repository guard and its Actions environment fixture" },
      // ADDED by plan 010, unit e1-fork-release-workflow: the fork release workflow refuses the
      // canonical repository and the canonical package name, and its suite runs those guards
      // with the two values they refuse. Committed workflow text, which a fork's rename leaves
      // alone, so the suite passes unedited on a renamed checkout.
      "test/ci/forkReleaseWorkflow.test.ts": { name: 1, route: 1, why: "the fork release workflow's canonical repository and package refusals" },
      // ── test/ci: synthetic records ──
      // TEST CHANGE (plan 020 file 1, unit d5-scripts-trees): `test/ci/apmInstall.test.ts`'s entry
      // (`route: 1`, a synthetic apm.lock.yaml) left with the file, deleted with the APM route.
      "test/ci/evidenceSummary.test.ts": { route: 2, why: "a synthetic evidence pointer's source and archive URL" },
      "test/ci/repoHygiene.test.ts": { route: 2, why: "a synthetic evidence manifest's source and archive URL" },
      // ── this file ──
      // The canonical-gated case below, which asserts the canonical identity itself.
      // TEST CHANGE, justified (plan 010, unit docs-guides): this entry was `name: 2, route: 1,
      // owner: 1`. The two dropped literals were the source values of this file's own hand-kept
      // preset rewrite, which the opt-in group no longer carries: it runs
      // `scripts/fork-identity.mjs`, which reads the preset's current value instead of naming it.
      // The count moved because the literals left the file, not because the check was relaxed.
      "test/ci/forkIdentity.test.ts": { name: 1, owner: 1, why: "the canonical-gated self-check" },
    };
    for (const [relPath, entry] of Object.entries(deliberate)) {
      expect(entry.why.trim(), `${relPath} carries no written reason`).not.toBe("");
    }
    const pinned = Object.fromEntries(
      Object.entries(deliberate).map(([relPath, { why: _why, ...counts }]) => [relPath, counts]),
    );
    expect(
      found,
      "a canonical spelling count changed: derive the value from test/support/identity.ts, or " +
        "pin the literal in `deliberate` above with the reason it is not this checkout's identity",
    ).toEqual(pinned);
  });

  // Canonical-only by construction: it asserts the canonical identity itself. Skipped
  // rather than relaxed on a renamed copy, with the reason in the title vitest prints.
  it.skipIf(!canonical().canonical)(
    canonicalOnly("answers `canonical` for this checkout, so no gate is skipped here"),
    () => {
      // The other half of the same contract: the helper must not be so cautious that the
      // canonical tree reads as a fork and quietly stops checking things.
      // TEST CHANGE (sw26-engine-cli-call-form fix round 1): `version` joined the record
      // in 75e18e5e without this assertion moving, and `npmChannel` joins it now. The
      // version is not what this case asserts, so it is matched by type.
      expect(canonical()).toEqual({
        canonical: true,
        name: "@zomarit/stamity",
        version: expect.any(String),
        publisher: "zomarit",
        private: false,
        npmChannel: true,
      });
    },
  );
});
