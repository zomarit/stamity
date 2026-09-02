import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * The one sidebar, grouped by what a reader came for.
 *
 * Two properties this file is built around, both of them consequences of the docs living in the
 * repository rather than here.
 *
 * 1. IDS ARE READ OFF DISK, NOT ONLY WRITTEN DOWN. Every id below is checked against
 *    `../docs` before it is emitted, and a page that is not there is dropped with a named
 *    warning instead of failing the build. The site and the pages are written and reviewed
 *    separately, so a build that dies on the first missing page would make the site
 *    un-buildable for as long as any page is outstanding — while a page that silently
 *    disappears from the navigation is exactly what the warning is for.
 *
 * 2. THE MIGRATION PAGE IS DELIBERATELY UNLISTED. `docs/migration.md` is built and published —
 *    it keeps the route the predecessor's sunset material promises, and `test/ci/docsSite.test.ts`
 *    pins that route — but no entry below points at it, and that omission is the decision, not an
 *    oversight. The people who need that page arrive on it from the predecessor's own bridge
 *    artifacts: its deprecation notice, its final README, its sunset note. Everyone who arrives
 *    here instead has no predecessor setup to move off, and a permanent "Start here" row would
 *    sell every one of them a migration they do not need. Property 1 is why this has to be
 *    written down at all — it reports a LISTED page that is missing from disk, and nothing
 *    reports a page on disk that is listed nowhere, so this note is the only record that the
 *    page is absent on purpose.
 *
 *    If it is ever re-listed, it is matched by a filename prefix rather than named outright.
 *    `scripts/leak-gate.mjs` treats the predecessor project's name as a reserved token and allows
 *    it on an exact list of paths — the migration-detection module, its tests, and the migration
 *    page itself. This file is not on that list, and putting it there would widen an exemption
 *    that exists to hold one name to the few places that cannot work without it. The gate
 *    assembles its own reserved tokens from fragments for the same reason: match the stable
 *    prefix, and let the file on disk supply the rest of its name, whether that is `migration.md`
 *    or a filename carrying the predecessor's own.
 */
const SITE_DIR = typeof __dirname === 'string' ? __dirname : process.cwd();
const DOCS_DIR = resolve(SITE_DIR, '..', 'docs');

/** Ids named exactly, filtered to what exists — with the drop reported rather than swallowed. */
function present(ids: readonly string[]): string[] {
  return ids.filter((id) => {
    if (existsSync(join(DOCS_DIR, `${id}.md`))) return true;
    console.warn(`[sidebars] docs/${id}.md is not on disk — dropped from the sidebar`);
    return false;
  });
}

const categories = [
  {
    label: 'Start here',
    items: present(['getting-started', 'doctrine']),
  },
  {
    label: 'Reference',
    items: present(['cli-reference', 'configuration', 'capability-matrix']),
  },
  {
    label: 'Content corpus',
    items: present([
      'reference/agents',
      'reference/skills',
      'reference/rules',
      'reference/commands',
      'reference/packs',
      'reference/mcp-servers',
    ]),
  },
  {
    label: 'Guides',
    items: present([
      'working-with-stamity',
      'customization',
      'workspaces',
      'packs-and-trust',
      'troubleshooting',
    ]),
  },
];

const sidebars: SidebarsConfig = {
  docsSidebar: categories
    // An empty category is a build error in Docusaurus, and an empty category is what a group
    // whose pages are all still outstanding produces. Dropping it keeps property 1 above true
    // for whole groups as well as single pages.
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      type: 'category' as const,
      label: category.label,
      collapsed: false,
      items: category.items,
    })),
};

export default sidebars;
