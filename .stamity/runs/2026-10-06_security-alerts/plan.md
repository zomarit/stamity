# In-flow plan — the docs site's four other fixable alerts

Run `2026-10-06_security-alerts`. Base `57c89f8a` (`main`, after Dependabot #79–#83) on branch
`fix/website-security-alerts`.

Facts the unit rests on (from `npm ls` in `website/` and the alerts' advisories, 2026-10-06):

| Alert | Package | Vulnerable range | First fixed | Installed, and by whom |
|---|---|---|---|---|
| #28 | tinypool | < 2.1.2 | 2.1.2 | 1.1.1, by `@docusaurus/core@3.10.2` |
| #29 | tinypool | <= 2.1.0 | 2.1.1 | (as above) |
| #30 | postcss-selector-parser | < 7.1.6 | 7.1.6 | 7.1.5 (css-loader, postcss-preset-env and others) and 6.1.4 (cssnano 6 presets) |
| #34 | katex | >= 0.11.0, < 0.18.2 | 0.18.2 | 0.16.47, by `mermaid@11.17.2` (via `@docusaurus/theme-mermaid@3.10.2`) |

- The docs site is `website/` (`private: true`). It is built by CI's "Docs site" workflow and by the QA harness; it is
  not part of the npm package.
- Each fixed version is a major step for at least one consumer: tinypool 1 → 2, postcss-selector-parser 6 → 7 for the
  cssnano 6 presets, katex 0.16 → 0.18 under caret rules. So Dependabot opened no PR.

## Units

### u1-website-alerts

| Cell | Value |
|---|---|
| `concern` | The docs site's lockfile carries no version inside alerts #28, #29, #30 and #34, and the site still builds |
| `requirements` | none in the specs (the docs site's dependencies) |
| `files` | `website/package.json`, `website/package-lock.json` |
| `change` | In order of preference: (1) upgrade the parent packages to versions that already depend on fixed versions, staying within Docusaurus 3; (2) an npm `overrides` entry in `website/package.json`, scoped to the consumer where possible, when the fixed version is compatible with how that consumer calls it (read the consumer's call sites and the package's changelog); (3) if neither works without breaking the build or the rendered site, leave that alert, and report it with the exact blocker and the options. No downgrade of any other package, and no new top-level dependency. |
| `testCriteria` | **Given** the changed lockfile, **then** `npm ls tinypool postcss-selector-parser katex --all` in `website/` shows only fixed versions. **And** `npm ci` and `npm run build` in `website/` succeed. **And** `npm audit` in `website/` no longer lists #28, #29, #30 or #34. **And** the root's docs tests pass. |
| `edgeCases` | Mermaid diagrams and KaTeX math must still render; check the built HTML of a page that uses them, if any page does. The cssnano presets run at build time on every CSS file, so an incompatible postcss-selector-parser shows as a build failure or as changed CSS output; compare the built CSS before and after. tinypool runs Docusaurus's build workers. |
| `verify` | in `website/`: `npm ci`, `npm run build`, `npm audit`; then at the root: `npx vitest run test/docsPages.test.ts test/cli/docs`, `npm run lint` |
| `spec delta` | none expected |
