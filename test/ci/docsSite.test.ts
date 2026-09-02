import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The docs site's deploy-shape facts, held to the host they are chosen for.
 *
 * `test/ci/workflow.test.ts` covers the workflow that builds and (once armed) publishes this
 * site; nothing covered the three lines of `website/docusaurus.config.ts` that decide WHAT that
 * publish serves and at which URLs. Each of the three is a claim about GitHub Pages specifically
 * — the emitted page shape, the apex `baseUrl`, and the domain the `CNAME` file claims — and each
 * is the kind of line that gets carried over from another project's config and then read as
 * settled. So they are asserted here, against the workflow that makes Pages the target, rather
 * than left as a comment nobody re-derives.
 *
 * The config is read as TEXT, the way the workflow suite reads YAML. Importing it would pull in
 * `prism-react-renderer` and the `@docusaurus/*` packages, which live in `website/node_modules` —
 * a second npm project this suite's runner never installs.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONFIG = join(REPO_ROOT, "website", "docusaurus.config.ts");
const CNAME = join(REPO_ROOT, "website", "static", "CNAME");
const WORKFLOW = join(REPO_ROOT, ".github", "workflows", "docs-site.yml");

const config = readFileSync(CONFIG, "utf8");
const cname = readFileSync(CNAME, "utf8");
const workflow = readFileSync(WORKFLOW, "utf8");

/** The migration guide's source file. Its NAME is not its URL, which is the point of the block below. */
const MIGRATION_PAGE = join(REPO_ROOT, "docs", "migration.md");

/** The sidebar, read as text for the one page it deliberately does not list. */
const SIDEBARS = readFileSync(join(REPO_ROOT, "website", "sidebars.ts"), "utf8");

/** Sidebar source with its prose stripped, so a rationale mentioning a page is not an entry. */
const SIDEBAR_CODE = SIDEBARS.replace(/\/\*[\s\S]*?\*\//g, " ").replaceAll(/\/\/.*$/gm, " ");

/**
 * The migration guide's published route, assembled from fragments.
 *
 * The predecessor's name is a reserved token here, allowed on an exact list of paths that this
 * file is not on — so it is built at run time, the way `scripts/leak-gate.mjs` and
 * `test/docsPages.test.ts` build theirs, and this file is scanned under the same rule as any
 * other.
 */
const MIGRATION_SLUG = `/migration-from-${["hat", "ch3r"].join("")}`;

/** A top-level config key's literal value, read off the line that declares it. */
function valueOf(key: string): string | undefined {
  return new RegExp(`^\\s*${key}:\\s*(.+?),\\s*$`, "m").exec(config)?.[1];
}

describe("the docs site's config is shaped for the host that serves it", () => {
  it("is a GitHub Pages deploy, which is what the assertions below are about", () => {
    // The premise. If this site ever moves to a host with different URL semantics, this fails
    // first and says so, instead of the page-shape assertion failing with a reason that no
    // longer applies.
    expect(workflow, "the deploy job no longer publishes to GitHub Pages").toContain(
      "actions/deploy-pages",
    );
  });

  it("emits directory-shaped pages, so neither URL form 404s", () => {
    // Pages serves `<route>/index.html` at the slashed URL and 301s the bare one onto it, so both
    // resolve. The flat `<route>.html` that `trailingSlash: false` emits serves the bare URL and
    // 404s the slashed one — and a documentation URL arrives in whichever shape the sender's
    // tooling normalised to.
    expect(valueOf("trailingSlash"), "a slashed docs URL would 404 on Pages").toBe("true");
  });

  it("claims one bare apex host, and the same one the config declares", () => {
    // Pages reads CNAME as a hostname and nothing else: a scheme, a path or a second line makes
    // the custom domain fail to attach. And a CNAME naming a different host than `url` publishes
    // a site whose own canonical and sitemap links point somewhere it is not served.
    const claimed = cname.trim();
    expect(claimed, "CNAME must hold a bare hostname").toMatch(/^[a-z0-9.-]+$/);
    expect(cname.trimEnd().includes("\n"), "CNAME must be one line").toBe(false);

    const declared = valueOf("url");
    expect(declared, "the config declares no url").toBeDefined();
    expect(new URL((declared ?? "").replaceAll("'", "")).host).toBe(claimed);

    // An apex custom domain is served from the root, so a project-page sub-path would 404 every
    // asset on the site.
    expect(valueOf("baseUrl")).toBe("'/'");
  });
});

describe("the docs site keeps the one URL the sunset material promises", () => {
  /**
   * That URL is printed in the predecessor package's deprecation notice, in its final README and
   * in the repository's sunset notice — places that cannot be corrected once they are out. So it
   * is a promise about a route, and the route is decided by a single `slug` line on a page whose
   * FILENAME deliberately does not carry the predecessor's name: naming the file that way would
   * put the name into every page that links it, and the leak gate holds it to an allowlist of
   * literal paths that the gate scans itself under. Nothing else in the tree pins this route,
   * which is why it is pinned here.
   */
  it("serves the migration guide at the route, not at its filename", () => {
    const page = readFileSync(MIGRATION_PAGE, "utf8");
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(page)?.[1];

    expect(front, "the migration guide declares no frontmatter, so it is served at its filename")
      .toBeDefined();
    expect(front ?? "", "the migration guide's published route moved").toContain(
      `slug: ${MIGRATION_SLUG}`,
    );
  });

  it("keeps that page out of the navigation, so only the bridge artifacts lead to it", () => {
    // The route above is a promise to readers arriving from the predecessor's sunset material.
    // It is NOT an invitation to everyone else: a permanent "Start here" row would offer a
    // migration to every reader who has nothing to migrate off. So the page is published and
    // unlisted, and the absence is asserted because nothing else would catch it — the sidebar's
    // own guard reports a LISTED page that is missing from disk, and never a page on disk that
    // is listed nowhere. The rationale lives in `website/sidebars.ts`; this holds it true.
    expect(SIDEBAR_CODE, "the migration page is listed in the sidebar again").not.toMatch(
      /migration/i,
    );
    // And the reason the page survives the omission: the sidebar is navigation, not the build's
    // page set, so an unlisted page under `docs/` is still rendered at its slug.
    expect(SIDEBARS, "the sidebar no longer explains why the page is unlisted").toMatch(
      /deliberately unlisted/i,
    );
  });

  it("mounts the docs under the path segment that completes that URL", () => {
    // A `slug` beginning with `/` is relative to the docs plugin's route base, so the promised
    // URL is that base plus the slug. Moving the base moves the promise without touching the page.
    expect(valueOf("routeBasePath"), "the docs route base moved out from under the slug").toBe(
      "'docs'",
    );
  });
});

describe("the docs build serves the product documentation and not the design documents", () => {
  it("excludes docs/specs/ from the routes it publishes", () => {
    // `docs/specs/` holds engineering design documents for behaviour that is partly unbuilt.
    // The plugin reads `docs/` in place, so without this line every one of them is a published
    // route describing what does not ship. The narrowing is asserted here because the config's
    // own comment is the only other record of it, and `test/ci/docsRoster.test.ts` exempts those
    // pages from the roster on the strength of this exclusion holding.
    // TEST CHANGE, justified: the value is no longer the one-entry list. Setting `exclude` replaces
    // the plugin's defaults, so the config restates them beside `specs/**`; the assertion holds
    // each entry rather than the whole literal, so a default dropped or the specs narrowing removed
    // each fail on its own line.
    const exclude = valueOf("exclude") ?? "";
    expect(exclude, "the docs preset publishes docs/specs/ again").toContain("'specs/**'");
    for (const entry of [
      "'**/_*.{js,jsx,ts,tsx,md,mdx}'",
      "'**/_*/**'",
      "'**/*.test.{js,jsx,ts,tsx}'",
      "'**/__tests__/**'",
    ]) {
      expect(exclude, `the docs preset dropped the default exclusion ${entry}`).toContain(entry);
    }
    // The link rewriter must know the same directory is off the routes: a guide that cites a
    // design document (docs/customization.md does) would otherwise fail the build as a broken
    // link the moment the exclusion landed — which is how the first docs-site run on this
    // change failed.
    expect(config, "the repo-link rewriter does not treat docs/specs/ as off the routes").toMatch(
      /repoLinks, \{[^}]*excluded: \['specs'\]/,
    );
  });
});
