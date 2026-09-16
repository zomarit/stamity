# Editor brief — Package 14 cross-page pass (one writer for voice, terms, index and map)

You are the single editor after the fourteen page writers have merged. You own, in this pass and no
one else: `src/cli/docs/llmsIndex.ts` (and the regenerated `llms.txt`), `website/sidebars.ts`, the
README map rows' wording and order (the README writer wrote them; you reconcile them), and the
cross-page voice and terms of every rewritten page. Read `style-contract.md`, `contract-census.md`
and `writer-brief.md` beside this file first, then the fourteen writers' reports the dispatcher
hands you.

## Tasks, in order
1. **Glossary pass.** For every term in the contract's glossary, grep all fifteen pages for the
   retired spellings and fix them; where a page uses two words for one thing, pick the glossary's.
   Add a short `## Glossary` to `docs/getting-started.md`? NO — the glossary lives once, as a section
   at the end of `docs/working-with-stamity.md` only if its 150-line budget allows; otherwise as
   `docs/glossary.md`? NO — no new page in this package. Put it at the end of `docs/getting-started.md`
   under `## Words this documentation uses`, ten to fifteen rows, one line each.
2. **Voice pass.** Read every rewritten page start to finish as its reader. Apply the contract's
   checklist. Fix sentences over 30 words, parentheticals, label headings, "we", hedges, marketing
   words. Do not restate facts; do not move pinned literals (the census).
3. **Openings.** Each page's first two sentences must stand alone. From them derive: the `llms.txt`
   entry description in `src/cli/docs/llmsIndex.ts` (one line, same facts), and the README map row
   (one line). Regenerate `llms.txt` with `node scripts/generate-docs.mjs --page llms` and confirm the
   byte-compare test passes.
4. **Order.** `website/sidebars.ts`: the Guides group becomes daily-use first — customization,
   troubleshooting, workspaces, packs-and-trust, enterprise-forks, security-mapping; Start here stays.
   The README map lists the guides in the same order. The `GUIDES` array in `test/docsPages.test.ts`
   is a lookup, not the sidebar order — leave it.
5. **Cross-links.** Every page links its neighbours by title; a fact that moved pages in the rewrite
   (the writers' reports list them) is linked from where it left. No dangling reference to a section
   that no longer exists (grep every `#anchor` link against the headings).
6. **Stamps.** Every page but `docs/migration.md` carries the commit-form stamp from the writer brief;
   migration keeps the cut form; every re-open trigger names `test/docsPages.test.ts` and is true.
7. **Gates.** `npm run test -- test/docsPages.test.ts test/ci/docsSite.test.ts test/ci/docsRoster.test.ts test/ci/workflow.test.ts test/content/invariantsVersion.test.ts test/cli/docs`,
   `node scripts/leak-gate.mjs`, `npm run lint`, `npm run typecheck`; then the site:
   `cd website && npm run typecheck && npm run build` (read `website/package.json` for the exact
   scripts; `onBrokenLinks: 'throw'` means a broken doc link fails the build — fix it on the page).

## Report
Commit sha(s) on the package branch (you work on the integrated branch, not a worktree); the glossary
rows; every index description and map row as written; the sidebar order; the pages whose voice you
changed and how many sentences; gate results verbatim for any failure; `Not done:`.
