import {resolve} from 'node:path';
import type * as Preset from '@docusaurus/preset-classic';
import type {Config} from '@docusaurus/types';
import {themes as prismThemes} from 'prism-react-renderer';
import repoLinks from './src/remark/repoLinks';

/**
 * The documentation site.
 *
 * ONE HOME PER SUBJECT. The pages under `../docs` — the generated reference and the hand-written
 * guides — ARE the documentation. This directory renders them and adds nothing: there is no
 * `website/docs`, no copy step, and no second copy of any page to drift from the first. The docs
 * plugin reads the repository's `docs/` directory directly, so a page edited (or regenerated) in
 * the tree is the page the site serves, and `git diff` is the only place a docs change appears.
 *
 * The site is NOT deployed by merging. `stamity.dev` is claimed and serves this site, and
 * `.github/workflows/docs-site.yml` builds on every pull request and push and stops there;
 * publishing takes an armed run — a `workflow_dispatch` that sets `deploy` to true, or a Release
 * run that succeeded on a real `v*` tag push. So `url` below is the address readers are already
 * served at, not a declaration of intent: the canonical and sitemap metadata it feeds point at a
 * live site, and moving it moves where every published page claims to live.
 */
/**
 * This directory, resolved without assuming the working directory.
 *
 * `__dirname` is defined because Docusaurus loads this config as a CommonJS module; the
 * `process.cwd()` fallback covers a loader that does not, and lands on the same path whenever
 * the site is built from its own directory (which every entry point here does).
 */
const SITE_DIR = typeof __dirname === 'string' ? __dirname : process.cwd();
const REPO_ROOT = resolve(SITE_DIR, '..');
const DOCS_DIR = resolve(REPO_ROOT, 'docs');
const REPO_URL = 'https://github.com/zomarit/stamity';

const config: Config = {
  title: 'stamity',
  tagline:
    'Agentic coding setups for Claude Code, Cursor, GitHub Copilot and Codex, from one canonical source.',

  // The brand marks are in `website/static/img/`, and that directory is now the tree's ONLY copy
  // of them: the full mark set is drawn and kept in a brand source outside this repository, which
  // ships only what a build reads — this directory, plus the `assets/logo.svg` the plugin
  // manifests point at. Docusaurus can only serve what is under `static/`, so the copy is
  // structural rather than a choice, and the thing to know is which direction it flows: a mark is
  // re-cut outside and copied here, never edited here. README's banner reads the two wordmarks
  // from this directory too, by repo-relative path. `static/` is served from the site root, so
  // every reference below is `/img/<file>`. That rule governs the product's MARKS and only those:
  // a page-owned decorative glyph — the two Primer octicons `src/pages/index.tsx` inlines — is
  // not one, so it lives as path data in the page that draws it, attributed beside that path, and
  // is never the product's mark wearing another licence.
  favicon: 'img/favicon.svg',

  // The deploy target, claimed and serving. `website/static/CNAME` claims the same host, and
  // test/ci/docsSite.test.ts holds the two together; see the header note for what arms a publish.
  url: 'https://stamity.dev',
  baseUrl: '/',
  organizationName: 'zomarit',
  projectName: 'stamity',
  // Directory-shaped output: `<route>/index.html`, with the site's own links carrying the slash.
  //
  // GitHub Pages is the only host this is aimed at, and it resolves the two shapes differently
  // enough that the choice is a 404. A flat `docs/getting-started.html` — what `false` emits — is
  // served at `/docs/getting-started` and 404s at `/docs/getting-started/`. A
  // `docs/getting-started/index.html` is served at the slashed form and 301s the bare one onto it,
  // so BOTH resolve. A documentation URL gets pasted into issues, chat and other people's sites
  // with whichever shape the sender's tooling normalised to, so the shape that hard-404s on one of
  // them is the wrong one. `true` rather than the default `undefined` because `true` also emits the
  // slash in the site's own links, which makes every internal navigation a direct hit instead of a
  // 301 hop. test/ci/docsSite.test.ts holds this to the deploy target that justifies it.
  trailingSlash: true,

  // A link that resolves to no route is a broken page for every reader, so it fails the build.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    // `detect` parses `.md` as CommonMark and reserves MDX for `.mdx`. This is load-bearing, not
    // a preference: the generated reference pages are rendered from code and carry literal braces
    // (`{{ }}` in emitted templates, `${...}` in shell examples) and literal angle brackets
    // (`<key>`, `<dir>` in usage lines). Under MDX a brace opens a JavaScript expression and an
    // angle bracket opens a JSX tag, so those pages would fail to parse — and the fix would be to
    // escape the generators' output, which would corrupt the repo-local pages to suit the site.
    format: 'detect',
    // A ```mermaid fence becomes a diagram instead of a code block. It is a remark transform,
    // not MDX syntax, so it works under `detect` in a `.md` page — and it is gated on this flag
    // alone: unset, the same fence stays an ordinary code block rather than failing the build.
    mermaid: true,
    hooks: {
      // WARN, not throw, and the reason is specific. Every page in `docs/` is written to be read
      // in the repository first, so its links are repo-relative — `[CONTRIBUTING.md](../CONTRIBUTING.md)`,
      // `[LICENSE](../LICENSE)` and the like. Inside the docs tree those resolve to routes and are
      // checked; the ones pointing UP and OUT of `docs/` (repository root files, `content/`,
      // `packs/`, `scripts/`) have no route to resolve to and never will, because publishing a
      // second copy of the repository is the duplication this architecture exists to avoid. Those
      // are the warnings this setting expects. `onBrokenLinks` above stays `throw`, so a link that
      // does aim at a doc route and misses still fails the build.
      onBrokenMarkdownLinks: 'warn',
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // The repository's docs directory, read in place. The only narrowing is the `exclude`
          // below: a page added anywhere else under `docs/` appears without editing this file.
          path: '../docs',
          // `docs/specs/` holds three engineering design documents for behaviour that is partly
          // unbuilt. They are written for whoever implements the remainder, not for a reader of
          // the product documentation, and a published route would read as a description of what
          // ships. They stay in the tree, under review like any other file, and off the routes.
          // `docs/plans/` is the plan command's output — a run's decomposition, written for the
          // work run that consumes it — and is off the routes for the same reason before the first
          // one lands. `test/ci/docsRoster.test.ts` derives its exemptions from this list, so a
          // directory excluded here is exempt there and the two cannot disagree.
          // Setting `exclude` REPLACES the plugin's default list rather than extending it, so the
          // defaults — partial files and tests — are restated here; without them a future
          // `docs/_draft.md` would publish. Kept on one line because `test/ci/docsSite.test.ts`
          // reads the value off this line.
          exclude: ['specs/**', 'plans/**', '**/_*.{js,jsx,ts,tsx,md,mdx}', '**/_*/**', '**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**'],
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          // No `editUrl` on purpose. Five of these pages are rendered from code and carry a
          // "do not edit by hand" banner; an "Edit this page" button would invite exactly the
          // edit the generators overwrite. Contributions go through the repository.

          // BEFORE Docusaurus's own link resolution, so it never sees a link that points out of
          // the docs tree. See src/remark/repoLinks.ts for what it rewrites and what it
          // deliberately leaves for `onBrokenLinks` to catch.
          beforeDefaultRemarkPlugins: [
            // `excluded` mirrors the `exclude` below: a link into a directory that is off the
            // routes is rewritten to the repository file rather than reported as broken.
            [repoLinks, {docsDir: DOCS_DIR, repoRoot: REPO_ROOT, repoUrl: REPO_URL, excluded: ['specs', 'plans']}],
          ],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  // The only theme this site adds to the preset. It supplies the `mermaid` component the flag
  // above rewrites those fences into; without it the fences compile to a component that does not
  // exist, so the flag and this line move together.
  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    // The card a link to this site unfurls as, in a chat client or a social post. 1280×640, the
    // 2:1 ratio every unfurler crops to, so nothing important is cut. Docusaurus emits it as both
    // `og:image` and `twitter:image` on every page, which is why it is set once here rather than
    // per page. Light only, deliberately: the unfurl has no way to read the reader's theme.
    image: 'img/social-card-dark.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      // The logo REPLACES the title rather than sitting beside it. The wordmark already spells the
      // product, so a `title` here would render the name twice — "stamity stamity" — which is what
      // a text title plus a wordmark logo always does. `alt` carries the name for a reader who
      // never sees the image; `srcDark` swaps in the near-white cut so the ink mark is not
      // invisible on the dark ground.
      logo: {
        alt: 'stamity',
        src: 'img/wordmark.svg',
        srcDark: 'img/wordmark-dark.svg',
        width: 116,
        height: 31,
      },
      items: [
        {type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs'},
        {href: REPO_URL, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      copyright: '© zomarit · MIT',
    },
    // Required, not cosmetic. Mermaid's unset default is a light-ground theme, and this site
    // defaults to dark (`colorMode` above) while still honouring a light preference — so both
    // grounds are reachable on the first paint and a single theme name would be unreadable on
    // one of them. Docusaurus swaps these two by the active color mode.
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
