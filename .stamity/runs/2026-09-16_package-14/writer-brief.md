# Writer brief — Package 14 page rewrite (common to every page writer)

You rewrite ONE hand-written documentation page of stamity in your own git worktree. The maintainer's
instruction: "rewrite docs to be as easy worded and comprehensive as possible". Every rule below is
binding; the page-specific notes in your dispatch message come on top of it.

## Read first, in this order
1. `style-contract.md` beside this file — the approved style contract (decision 6). Apply every section
   and run its writer's checklist before you return.
2. `contract-census.md` beside this file — find your page's census table, the shared-artifact table,
   the overlap rows that name your page, and the traps. Every pin listed for your page is binding.
3. Your page as it is today, in full. Then every source the census names for your page's derived
   facts (the code, the generated reference pages, the charter). The page describes the tree you are
   standing in; the tree is the truth, the old page is not.

## What "rewrite" means here
- Plain words, short sentences, one idea per sentence, the reader addressed as "you", the product as
  "stamity". A reader who knows nothing about this project's history must be able to follow the page.
- Comprehensive: every fact, command, path, flag, table row and warning the old page carries survives
  unless it is false today or it belongs on another page the census assigns it to (then link there).
  Cut narration about how a thing came to be, defensive asides, and engineering-record talk (test
  names, review rounds, run numbers) unless the page's own reader needs it. Keep exact spellings of
  every CLI verb, flag, path and slash command as the generated CLI reference and the charter spell
  them.
- Re-attest every claim. As you carry a claim over, check it against the tree (open the code, run the
  command where it is harmless — `node dist/cli.js --help` and read-only verbs are fine in a scratch
  directory, never `init`/`sync` at the repository root). A claim you cannot verify is rewritten so it
  no longer claims, or cut. List every claim you corrected (before → after → the source that decided).
- Headings name tasks or questions. The page opens with the two sentences the contract prescribes, and
  they must stand alone: the editor derives the `llms.txt` description and the README map row from
  them.
- Established URLs, slugs and the frontmatter `title:` do not move; the H1 equals the title.

## The stamp (the currency header) — exact text
Replace the first comment line with exactly:
`<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->`
(`e79dcf0` is the 1.8.0 release commit; `src/`, `content/`, `docs/` and the root pages are byte-identical
between it and the branch point, so it names the tree you verify against.) The migration page is the one
exception: it keeps its `the 1.8.0 release cut (2026-09-15)` form — its dispatch note says so.
Keep the second comment: it must still begin `Re-open when:` and still name `test/docsPages.test.ts`;
you may rephrase its conditions, and you must make them true for the rewritten page. Both comments
must sit within the first six lines after the frontmatter.

## Files you may and may not touch
- May: your page. For `docs/working-with-stamity.md` only: `website/src/css/custom.css` if the spine
  heading is renamed (the selector must move in the same commit).
- May not: any other page; `test/**` (if a pin must move — a line budget, a literal — do NOT edit the
  test; return with the page otherwise green and name the pin, its file:line, the value you need and
  why); `src/cli/docs/llmsIndex.ts`, `llms.txt`, `website/sidebars.ts` (the editor owns them);
  anything under `content/` or `evals/`; the README map (the README writer owns it); the private
  checkout is never named anywhere.
- Never write the predecessor project's name on any page but `docs/migration.md` — the leak gate fails
  the suite on it; say "the predecessor project".

## Gates before you return (in your worktree)
- If `node_modules` is absent: `ln -s /Users/denismasatovic/Projects/zomarit/stamity/node_modules node_modules`
  (do not run `npm ci`). If `dist/` is absent and you need the CLI: `npm run build`.
- `npm run test -- test/docsPages.test.ts test/ci/docsSite.test.ts test/ci/docsRoster.test.ts test/ci/workflow.test.ts test/content/invariantsVersion.test.ts test/cli/docs/llmsIndex.test.ts`
- `node scripts/leak-gate.mjs`
- `npm run lint` (markdown is not linted, but run it anyway; it must stay green).
- Read every failure. A failure caused by a pin you may not edit is reported, not silenced; any other
  failure you fix on the page.

## Commit
One commit on a branch `package-14/<page-slug>` (the slug is in your dispatch note), title
`docs(<page-slug>): rewrite under the Package 14 style contract`, a body that names the page kind, the
claims corrected and any pin that must move; end with exactly these two trailer lines:
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Signed-off-by: Denis Masatovic <masatovic.denis@gmail.com>
Do not push. Do not touch other branches.

## Return this report (structured, short)
1. Commit sha; branch; line count before → after.
2. The page's opening two sentences, verbatim (the editor derives the index description and the map row).
3. Claims re-attested: a count; claims corrected: before → after → source (path:line).
4. Pins kept (a list of the census pins you honoured); pins that must move: file:line · needed value · reason.
5. Cross-page notes: a fact you moved out of your page (to which page), or a fact your page now needs
   from another page.
6. Gate results, verbatim for any failure. Checklist result (ten items).
7. `Not done:` anything left, or "none".
