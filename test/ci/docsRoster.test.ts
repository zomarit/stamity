import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LLMS_INDEX_SECTIONS } from "../../src/cli/docs/llmsIndex.ts";

/**
 * The orphan-page roster: every page under `docs/` is reachable from something.
 *
 * The gap this closes is named in `website/sidebars.ts` itself — its `present()` guard reports a
 * page LISTED in the navigation and missing from disk, and nothing reports a page on disk that is
 * listed nowhere. So a page could ship, pass every other suite, be rendered at a route, and be
 * reachable only by typing its URL. That is the failure here: a page nobody navigates to is a page
 * nobody re-reads, and an unread page is the one that goes stale first.
 *
 * A page is reachable three ways, and the third is the interesting one:
 *
 * 1. The sidebar lists it — the human route.
 * 2. `src/cli/docs/llmsIndex.ts` indexes it — the agent route, which carries the whole tree
 *    including pages the navigation deliberately omits.
 * 3. {@link EXEMPTIONS} names it, with the reason written down. An exemption is a decision on the
 *    record, not a suppression: each one states why the page is off both routes, and each is
 *    checked against disk so a page that has since been deleted or renamed cannot leave a
 *    permanent hole behind it.
 *
 * The sidebar is read as TEXT rather than imported, for the reason `test/ci/docsSite.test.ts`
 * gives: importing it would pull in the `@docusaurus/*` packages, which live in a second npm
 * project this runner never installs. The index IS imported, because it is ordinary source in this
 * project and its entries are the roster rather than a rendering of it.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DOCS_DIR = join(REPO_ROOT, "docs");

/** Sidebar source with its prose stripped, so an id named in a rationale is not an entry. */
const SIDEBAR_CODE = readFileSync(join(REPO_ROOT, "website", "sidebars.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replaceAll(/\/\/.*$/gm, " ");

/** One page off both routes, and the reason it is off them. */
interface Exemption {
  /** A repo-relative page path, or a directory path ending in `/` covering everything under it. */
  readonly path: string;
  /** One line. An exemption whose reason cannot be written in one line is a decision, not this. */
  readonly reason: string;
}

const EXEMPTIONS: readonly Exemption[] = [
  {
    path: "docs/migration.md",
    reason:
      "published unlisted by decision — its readers arrive from the predecessor's own sunset " +
      "material; indexed in llms.txt.",
  },
  {
    path: "docs/specs/",
    reason:
      "engineering design documents for partly unbuilt behaviour — excluded from the site " +
      "build by website/docusaurus.config.ts, so they have no route to be reachable from.",
  },
];

/** Least number of pages this gate must have walked to have checked anything. */
const MIN_PAGES = 10;

/** A repo-relative path, POSIX-spelled, so the roster compares the same way on every platform. */
const repoRelative = (absolute: string): string =>
  relative(REPO_ROOT, absolute).replaceAll("\\", "/");

/** Every `.md` under `docs/`, at any depth. */
function markdownUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownUnder(full);
    return entry.name.endsWith(".md") ? [repoRelative(full)] : [];
  });
}

/** The ids the sidebar names, as page paths — a Docusaurus id is `docs/`-relative and bare. */
const sidebarPages: readonly string[] = [...SIDEBAR_CODE.matchAll(/present\(\[([\s\S]*?)\]\)/g)]
  .flatMap((call) => Array.from((call[1] ?? "").matchAll(/'([^']+)'/g)))
  .map((id) => `docs/${id[1] ?? ""}.md`);

/** The paths the agent-native index lists, whether or not they are under `docs/`. */
const indexedPages: ReadonlySet<string> = new Set(
  LLMS_INDEX_SECTIONS.flatMap((section) => section.entries.map((entry) => entry.path)),
);

const exempts = (page: string): boolean =>
  EXEMPTIONS.some((entry) =>
    entry.path.endsWith("/") ? page.startsWith(entry.path) : page === entry.path,
  );

const pages = markdownUnder(DOCS_DIR);

describe("every page under docs/ is reachable from something", () => {
  it("walked enough of the tree to be checking anything", () => {
    // Vacuity guard: a broken walk would pass every assertion below over an empty list.
    expect(pages.length, "the docs walk found almost nothing").toBeGreaterThanOrEqual(MIN_PAGES);
  });

  it("lists, indexes or exempts each one", () => {
    for (const page of pages) {
      const reachable = sidebarPages.includes(page) || indexedPages.has(page) || exempts(page);
      expect(
        reachable,
        `${page} is on disk and reachable from nothing — add it to website/sidebars.ts, to ` +
          `src/cli/docs/llmsIndex.ts, or to EXEMPTIONS in this file with the reason`,
      ).toBe(true);
    }
  });

  it("keeps no roster entry pointing at a page that is gone", () => {
    for (const page of sidebarPages) {
      expect(existsSync(join(REPO_ROOT, page)), `the sidebar lists ${page}, which is gone`).toBe(
        true,
      );
    }
    for (const page of indexedPages) {
      if (!page.startsWith("docs/")) continue;
      expect(existsSync(join(REPO_ROOT, page)), `llms.txt indexes ${page}, which is gone`).toBe(
        true,
      );
    }
  });

  it("keeps no exemption for a page that is gone, and none without a reason", () => {
    // A stale exemption is worse than no gate: it reads as a considered decision and covers a
    // path nothing occupies, so the next page to land there inherits the hole.
    for (const entry of EXEMPTIONS) {
      const covered = entry.path.endsWith("/")
        ? pages.some((page) => page.startsWith(entry.path))
        : pages.includes(entry.path);
      expect(covered, `EXEMPTIONS still carries ${entry.path}, which covers nothing on disk`).toBe(
        true,
      );
      expect(
        entry.reason.trim().length,
        `${entry.path} is exempt for no stated reason`,
      ).toBeGreaterThan(20);
    }
  });
});
