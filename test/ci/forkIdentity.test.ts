import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { canonical, canonicalOnly } from "../support/identity.ts";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * The renamed private downstream, proved rather than promised.
 *
 * `docs/enterprise-forks.md` tells a downstream to rename the package to its own scope,
 * set `stamity.publisher`, repoint `repository.url`, set `private: true` and then run
 * this repository's own gate. The audit (FORK-3) found that gate red on a fork through
 * no fault of the fork's, and the regenerated marketplace advertising an npm package the
 * fork never publishes. Both are behaviours of the renamed tree, so both are checked
 * against a renamed tree here.
 *
 * Two groups:
 *
 *   the marketplace source   fast, always on. The generator runs twice over one
 *                            downstream checkout — once private, once not — so the two
 *                            source forms are proven against each other rather than one
 *                            of them being asserted alone.
 *   the inherited gate       opt-in. A whole second checkout running a second vitest over
 *                            the eighteen identity-sensitive suites; the reason it is not
 *                            on by default is on the group itself.
 *
 * A third group comes first, because it is the cheapest: the CLI and CI suites are read as
 * text and held to deriving the name, the owner and the owner/repository route rather than
 * spelling them. Of the three it is the only one that reads the suites on every CI run (no
 * workflow sets the inherited gate's opt-in), so it is the one that has to catch a new
 * canonical literal; the opt-in witness only confirms what it lets through.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The scope a downstream renames into here. Never this repository's own owner. */
const FORK_OWNER = "acme";
const FORK_REPO = "stamity-private";

const workspaces: string[] = [];
afterAll(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  workspaces.push(dir);
  return dir;
}

/** The identity edits `docs/enterprise-forks.md` prescribes, applied to one manifest. */
function renameToPrivateFork(root: string, options: { private: boolean }): void {
  const path = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const url = `https://github.com/${FORK_OWNER}/${FORK_REPO}`;
  pkg["name"] = `@${FORK_OWNER}/stamity`;
  pkg["stamity"] = { ...((pkg["stamity"] ?? {}) as Record<string, unknown>), publisher: FORK_OWNER };
  pkg["repository"] = { type: "git", url: `git+${url}.git` };
  pkg["homepage"] = url;
  pkg["bugs"] = { url: `${url}/issues` };
  delete pkg["publishConfig"];
  if (options.private) pkg["private"] = true;
  else delete pkg["private"];
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * The other two files that carry the identity as DATA rather than deriving it: the
 * Renovate presets. `docs/enterprise-forks.md` names them in the same identity step, and
 * `test/ci/releaseManifest.test.ts` derives its expectation from `package.json`, so this
 * mirrors the guide rather than working around the test.
 */
function repointPresets(root: string): void {
  const rewrite = (relPath: string, from: string, to: string): void => {
    const path = join(root, relPath);
    const text = readFileSync(path, "utf8");
    expect(text, `${relPath} no longer carries ${from}`).toContain(from);
    writeFileSync(path, text.replaceAll(from, to));
  };
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    repository: { url: string };
  };
  const slug = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(pkg.repository.url)?.[1] ?? "";
  rewrite("renovate/plugins.json", "zomarit/stamity", slug);
  rewrite("renovate/companion.json", "@zomarit/stamity", pkg.name);
}

/** Every `.ts` file under one directory, as repository-relative POSIX paths. */
function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    found.push(relative(REPO_ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"));
  }
  return found.toSorted();
}

const marketplaceEntry = (root: string): Record<string, unknown> => {
  const catalog = JSON.parse(
    readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"),
  ) as { plugins: Record<string, unknown>[] };
  return catalog.plugins[0] as Record<string, unknown>;
};

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
      "test/cli/kit/packageName.test.ts": { name: 3, why: "proves the unnamed-manifest fallback" },
      // A renamed pseudo package root, asserting the canonical name does NOT leak into
      // its remedies. The literal is the thing that must be absent.
      "test/cli/commands/check.test.ts": { name: 1, why: "asserts the canonical fallback stays out of a renamed run" },
      // The registry-probe fixtures: a synthetic manifest and the percent-encoded name the
      // registry is asked for, neither read from this checkout.
      "test/cli/notice/updateNotice.test.ts": { name: 2, why: "pins the registry probe's encoded package name" },
      // ── test/ci: stub runtimes and synthetic plugin documents ──
      // Each is a `--runtime` stub or a capability/release document the suite writes itself;
      // the product copies the stub's name through, so the assertion compares the fixture to
      // the fixture and a fork's own name never enters it.
      "test/ci/pluginDistribution.test.ts": { name: 3, why: "the stub runtime's package.json and RUNTIME.json, and the runtime block read back from it" },
      "test/ci/pluginLifecycle.test.ts": { name: 2, why: "the stub runtime's package.json and RUNTIME.json" },
      "test/ci/pluginPackages.test.ts": { name: 1, why: "the stub runtime's package.json" },
      "test/ci/pluginPackages.claude.test.ts": { name: 1, why: "the stub runtime's package.json" },
      "test/ci/pluginPackages.codex.test.ts": { name: 1, why: "the stub runtime's package.json" },
      "test/ci/pluginPackages.copilot.test.ts": { name: 1, owner: 2, why: "the stub runtime's package.json, and a schema-refusal author fixture" },
      "test/ci/pluginPackages.cursor.test.ts": { name: 1, why: "the stub runtime's package.json" },
      "test/ci/pluginRoute.test.ts": { name: 2, why: "the stub runtime's package.json and RUNTIME.json" },
      "test/ci/pluginModules.test.ts": { name: 3, why: "synthetic capability documents naming a companion package" },
      "test/ci/pluginLocate.test.ts": { name: 1, why: "the companion name the locate fixtures install under" },
      "test/ci/releaseManifest.test.ts": { name: 1, why: "a synthetic release manifest's runtime block" },
      // ── test/ci: the resolver fed a synthetic manifest ──
      // `pkg()` builds a manifest from a constant, never from this checkout, and the absent
      // `stamity.publisher` default IS the canonical owner in production.
      "test/ci/distributionIdentity.test.ts": { route: 2, owner: 3, why: "a synthetic manifest's repository and the absent-publisher default" },
      // ── test/ci: GitHub context and committed workflow text ──
      // The canonical repository guard the workflows carry, and the Actions context fed to
      // it. A committed file's text a rename does not touch; the fork guide leaves workflow
      // customization, and the tests that pin it, to the fork.
      "test/ci/workflow.test.ts": { route: 13, why: "the workflows' canonical repository guard and the contexts evaluated against it" },
      "test/ci/packSigningRehearsal.test.ts": { route: 4, why: "the rehearsal workflow's repository guard and its Actions environment fixture" },
      // ── test/ci: synthetic records ──
      "test/ci/apmInstall.test.ts": { route: 1, why: "a synthetic apm.lock.yaml written into the suite's own consumer" },
      "test/ci/evidenceSummary.test.ts": { route: 2, why: "a synthetic evidence pointer's source and archive URL" },
      "test/ci/repoHygiene.test.ts": { route: 2, why: "a synthetic evidence manifest's source and archive URL" },
      // ── this file ──
      // The Renovate presets carry the canonical route and name as DATA the guide tells a fork
      // to rewrite, so the rewrite names what it replaces; the rest is the canonical-gated case
      // below, which asserts the canonical identity itself.
      "test/ci/forkIdentity.test.ts": { name: 2, route: 1, owner: 1, why: "the preset rewrite's source values and the canonical-gated self-check" },
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
      expect(canonical()).toEqual({
        canonical: true,
        name: "@zomarit/stamity",
        publisher: "zomarit",
        private: false,
      });
    },
  );
});

describe("a private fork's regenerated marketplace", () => {
  it("names a git source it can serve, and an npm source only when it publishes one", () => {
    const root = workspace("stamity-fork-marketplace-");
    downstreamCheckout(root);
    const generate = (): void => {
      execFileSync(process.execPath, [join(root, "scripts/generate-plugin-manifests.mjs")], {
        cwd: root,
        encoding: "utf-8",
      });
    };

    renameToPrivateFork(root, { private: true });
    generate();
    const entry = marketplaceEntry(root);

    expect(entry["source"]).toEqual({ source: "github", repo: `${FORK_OWNER}/${FORK_REPO}` });
    // `private: true` makes `npm publish` refuse, so the package name must not appear as
    // a fetch channel anywhere in the catalog — not in this entry, and not in a second
    // source a later field could grow.
    expect(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8")).not.toContain(
      '"source": "npm"',
    );
    // A github source resolves component paths against the repository checkout, where
    // `dist/` does not exist at all: it is built, and `.gitignore`d. Non-degenerate: the
    // corpus fixture carries several agents, and every one is checkout-rooted.
    const agents = entry["agents"] as string[];
    expect(agents.length).toBeGreaterThan(1);
    for (const path of agents) expect(path, "an agent path").toMatch(/^\.\/content\//);
    expect(entry["skills"]).toMatch(/^\.\/content\//);

    // The control, on the same tree: drop `private` and the published channel comes back,
    // tarball prefix and all. Without it, "github when private" could be "github always".
    renameToPrivateFork(root, { private: false });
    generate();
    const published = marketplaceEntry(root);

    expect(published["source"]).toEqual({
      source: "npm",
      package: `@${FORK_OWNER}/stamity`,
      version: (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version,
    });
    expect(published["skills"]).toMatch(/^\.\/dist\/content\//);
  });
});

/**
 * The whole identity-sensitive gate, inside a renamed private copy of this checkout.
 *
 * OPT-IN (`STAMITY_FORK_SUITE=1`). Not for its wall time — measured at about 25 seconds on
 * a warm POSIX machine, 2026-09-19 — but for what it does to get there: it copies the whole
 * working tree and starts a second vitest inside the first, over eighteen suites. A nested
 * runner is charged differently by the coverage leg and by the Windows leg, and neither is
 * a cost the default gate should carry for a property the group above already proves in
 * under a second. This group is the end-to-end witness a reviewer or a release run asks
 * for on demand; the manual run of record for the unit that introduced it ran the FULL
 * suite in such a copy (33 failures before, 0 after).
 */
const FORK_SUITE = process.env["STAMITY_FORK_SUITE"] === "1";

/** The suites the audit's renamed-copy run found identity-sensitive, every one of them. */
const IDENTITY_SUITES = [
  "test/ci/apmDownstream.test.ts",
  "test/ci/apmPackage.test.ts",
  "test/ci/changelogLinks.test.ts",
  "test/ci/distributionIdentity.test.ts",
  "test/ci/pluginDistribution.test.ts",
  "test/ci/pluginManifests.test.ts",
  "test/ci/pluginPackages.claude.test.ts",
  "test/ci/releaseManifest.test.ts",
  "test/cli/binMap.test.ts",
  "test/cli/commands/add.test.ts",
  "test/cli/commands/check.test.ts",
  "test/cli/commands/clean.test.ts",
  "test/cli/commands/learn.test.ts",
  "test/cli/commands/sync.test.ts",
  "test/cli/commands/syncEngine.test.ts",
  "test/cli/flows.e2e.test.ts",
  "test/cli/notice/updateNotice.test.ts",
  "test/cli/surface.e2e.test.ts",
];

describe.skipIf(!FORK_SUITE)(
  "the inherited gate in a renamed private checkout (set STAMITY_FORK_SUITE=1 to run; ~25s)",
  () => {
    it("passes every suite that reads this package's identity", () => {
      const root = workspace("stamity-fork-suite-");
      // Cached AND untracked-not-ignored, the same list `scripts/leak-gate.mjs` builds: a
      // copy of the committed tree alone would run the suite without the working-tree file
      // that changed it, which is the one thing this case exists to exercise.
      const tracked = execFileSync(
        "git",
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        { cwd: REPO_ROOT, encoding: "utf-8" },
      )
        .split("\0")
        .filter((entry) => entry !== "" && entry !== "node_modules");
      expect(tracked.length, "no tracked file was listed").toBeGreaterThan(100);
      for (const relPath of tracked) {
        const destination = join(root, relPath);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(join(REPO_ROOT, relPath), destination);
      }
      // Never installed: the copy borrows the real dependency tree, exactly as the
      // downstream fixture does.
      symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "junction");

      renameToPrivateFork(root, { private: true });
      repointPresets(root);
      // The guide's own regenerate step. A downstream that skips it commits a tree whose
      // generated files still name the upstream owner, and its gate says so.
      for (const script of ["generate-plugin-manifests.mjs", "generate-apm-package.mjs"]) {
        const generated = spawnSync(process.execPath, [join(root, "scripts", script)], {
          cwd: root,
          encoding: "utf-8",
        });
        expect(generated.status, `${script}\n${generated.stderr}`).toBe(0);
      }

      const result = spawnSync(
        process.execPath,
        [join(REPO_ROOT, "node_modules/vitest/vitest.mjs"), "run", ...IDENTITY_SUITES],
        { cwd: root, encoding: "utf-8", env: { ...process.env, STAMITY_FORK_SUITE: "0" } },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    }, 600_000);
  },
);
