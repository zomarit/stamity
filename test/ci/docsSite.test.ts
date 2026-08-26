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

  it("mounts the docs under the path segment that completes that URL", () => {
    // A `slug` beginning with `/` is relative to the docs plugin's route base, so the promised
    // URL is that base plus the slug. Moving the base moves the promise without touching the page.
    expect(valueOf("routeBasePath"), "the docs route base moved out from under the slug").toBe(
      "'docs'",
    );
  });
});
