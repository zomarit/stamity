import {existsSync, readdirSync} from 'node:fs';
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
 * 2. THE MIGRATION PAGE IS MATCHED BY PREFIX, NOT NAMED. `scripts/leak-gate.mjs` treats the
 *    predecessor project's name as a reserved token and allows it on an exact list of paths —
 *    the migration-detection module, its tests, and the migration page itself. This file is not
 *    on that list, and putting it there would widen an exemption that exists to hold one name to
 *    the few places that cannot work without it. The gate assembles its own reserved tokens from
 *    fragments for the same reason, and this is the same move: match the stable prefix, and let
 *    the file on disk supply the rest of its name. `migration` is the prefix rather than the
 *    whole filename for the same reason: it matches the page whether it is `migration.md` or
 *    carries the predecessor's name in its own, and this file needs to know neither.
 */
const SITE_DIR = typeof __dirname === 'string' ? __dirname : process.cwd();
const DOCS_DIR = resolve(SITE_DIR, '..', 'docs');
const MIGRATION_ID_PREFIX = 'migration';

/** Ids named exactly, filtered to what exists — with the drop reported rather than swallowed. */
function present(ids: readonly string[]): string[] {
  return ids.filter((id) => {
    if (existsSync(join(DOCS_DIR, `${id}.md`))) return true;
    console.warn(`[sidebars] docs/${id}.md is not on disk — dropped from the sidebar`);
    return false;
  });
}

/** Ids matched by a stable filename prefix, sorted so the emitted order is deterministic. */
function matching(prefix: string): string[] {
  return readdirSync(DOCS_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
}

const categories = [
  {
    label: 'Start here',
    items: [...present(['getting-started']), ...matching(MIGRATION_ID_PREFIX)],
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
    ]),
  },
  {
    label: 'Guides',
    items: present(['packs-and-trust', 'troubleshooting']),
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
