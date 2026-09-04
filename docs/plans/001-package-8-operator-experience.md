---
id: package-8-operator-experience
intent: feature
stamp: 4607a76 2026-09-04
reads: [src/cli/kit/banner.ts, website/static/img/wordmark.svg, test/cli/banner.test.ts, website/src/pages/index.tsx, website/src/css/custom.css, website/docusaurus.config.ts, website/sidebars.ts, website/package.json, src/cli/kit/prompts.ts, src/cli/kit/terminal.ts, src/cli/kit/program.ts, src/cli/commands/init.ts, src/cli/commands/config.ts, src/cli/commands/workspace.ts, src/cli/commands/clean.ts, src/cli/commands/worktree.ts, test/cli/prompts.test.ts, test/cli/kit.test.ts, docs/working-with-stamity.md, docs/getting-started.md, docs/doctrine.md, README.md, src/cli/docs/llmsIndex.ts, llms.txt, test/docsPages.test.ts, test/ci/docsRoster.test.ts, test/ci/docsSite.test.ts, content/charter/stamity-charter.md, content/commands/st-spec.md, content/commands/st-ask.md, content/commands/st-debug.md, content/commands/st-quick.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/commands/st-work.md, content/commands/st-board.md, content/commands/st-plan.md, test/corpus/commands/lightTrio.test.ts, test/corpus/commands/spec.test.ts, test/corpus/commands/feedbackPair.test.ts, test/corpus/commands/work.test.ts, test/emit/crossClientGoldens.test.ts, test/corpus/emissionGoldens.test.ts, evals/SET-v3.md, evals/rubric-v3.md, evals/cases-v3, .stamity/learnings]
---

# Package 8 — operator experience

## Context

Six items, four from the maintainer's own observations and two carried from the last package's
register sweep by name: the docs landing page's copy affordance and button icons, the CLI
wordmark's `a` that reads as an `o`, the raw-mode menus' design language, the
`working-with-stamity` page's depth and sidebar position, one home for the verb gloss, and the
recommended-next-step line on the six touchpoints that do not carry one. None is a spec clause;
each ships or carries a decision row saying why not. Out of scope: the merge, the release, the
review package that runs last, any change to what the charter says, and the after-Enter answer
echo the menus could gain (a byte-changing improvement recorded as a follow-up, not smuggled in).

**Decisions taken by declared default in an unattended run, each reversible by one change.**
The reading taken is stated beside the reading dropped, so the audit trail is the line.

- *Page length.* `working-with-stamity` is written to ≤150 physical lines, the budget the
  maintainer stated; the hand-page test binds that figure to README alone, so the page is held
  to it by this plan and by its own re-open trigger rather than by a new assertion. Dropped: a
  new guide line-cap test (a claim about one page, not the bucket).
- *Diagram technology.* Mermaid fences, with `@docusaurus/theme-mermaid@3.10.2` added to the
  site's own dependencies (112 packages, zero packages with install scripts, zero net-new
  advisories — measured in a scratch resolution; the one declared peer is optional). GitHub
  renders the same fences natively and an agent reading the page reads the routing as text.
  Dropped: ASCII boxes (unreadable at nine labelled nodes on a phone) and a committed SVG (the
  one artifact nobody can review in a diff).
- *Sidebar order.* `getting-started` → `working-with-stamity` → `doctrine`, all in "Start
  here". The doctrine page already defers the operational question to the workflow page, and a
  reader who just installed asks "what do I open now" before "why does this exist". Dropped:
  the reverse order, which would make doctrine's forward reference a backward jump.
- *The GitHub button's icon.* The octicon `mark-github-16`, unmodified, `currentColor`
  (near-black on the secondary chip in both modes, 14.24:1), which is the first permitted use
  GitHub's own logo page lists — linking to GitHub — in secondary placement under the product's
  own mark. Dropped: the neutral `repo-16` glyph, kept as the zero-trademark substitute.
- *The menus' colour.* An `accent` palette token (the brand violet with the banner's own degrade
  ladder) on non-text UI only — the active marker and a checked box — with the question bold
  and the hint dim; every frame under the identity palette is byte-identical to today. Dropped:
  new glyphs (`❯`, `◉`), which move 52 test literals and gamble on font support, and painting
  label text, which fails 4.5:1 on a black background.
- *One home for the touchpoint gloss.* The charter's `## Touchpoints` index is the home in a
  consumer repository — it cannot link and cannot grow (the always-on ratchet pins the charter
  at its measured 97 lines) — so the workflow page's table becomes a mirror held equal to it by
  a test. Dropped: rendering the index from command frontmatter at emission, which would make
  the template measure one line where the emitted file carries twenty and would grow the
  charter past its ratchet.
- *One home for the verb gloss.* `docs/cli-reference.md` (generated from the program) is the
  home; README's `## Commands` and getting-started's `## The nine verbs` keep the bare verb list
  the tests pin and link the gloss instead of restating it. Getting-started keeps only guidance
  that is about two verbs together, and names the three `worktree` subcommands with a link to
  their one home rather than narrating them a third time.
- *Eval scope.* The corpus edit re-runs the affected slice — every case whose `source:` names an
  edited file, 18 cases at three samples — under `SET-v3` at the pinned judge with calibration
  first; the artifact reports the slice case by case against the per-case bar and states that
  the set's four declared metrics are not reported from a slice. The six new closing lines are
  six claims with no golden case of their own; the case is `SET-v4`'s, recorded as not done.

## Spec delta

None. `docs/specs/` carries three design documents (overlay layers, the workspace surface, the
worktree lane) whose requirement ids none of these units implements; every unit below states
`spec carries no ids`. The workflow page narrates the worktree lane the third document designs
and changes no requirement of it.

## Units

### U1 · `wordmark-a` — the mark re-derived from the SVG

| Field | Content |
|---|---|
| `id` | `wordmark-a` |
| `requirements` | spec carries no ids |
| `files` | `src/cli/kit/banner.ts`, `test/cli/banner.test.ts` |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/banner.test.ts test/cli/notice test/cli/surface.e2e.test.ts` |

**Interfaces.** The `WORDMARK` grid is replaced by the faithful raster of
`website/static/img/wordmark.svg` at 62 columns × 14 rows — the widest width that stays inside
the 64-column budget after the two-space indent — produced by 16×16 supersampled coverage
thresholded at 50%, then the three hand adjustments the banner comment already names (the `i`
keeps its square dot with one pixel of air, both `t`s keep the slab crossbar and the foot that
kicks right, the `y` keeps the tail that hooks back left). At this width the 23.2-unit stem is
three columns, the `a` is a round bowl against a straight stem, the `m` has its two arches and
the `y` its U — the roundness the mark actually draws, which the two-column grid could not
carry and which is why its box-shaped `a` read as `o`. The grid, exactly:

```
"           ###                             ###  ###",
"           ###                             ###  ###",
"           +++                                  ###",
"  ####### ++++++   #########   #### ####   ### ###### ###  ###",
" ######## ++++++  ##########  ###########  ### ###### ###  ###",
"###        +++   ####  ##### ### ##### ### ###  ###   ###  ###",
"#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
"#########  ###   ###    #### ###  ###  ### ###  ###   ###  ###",
"      ###  ###   ####  ##### ###  ###  ### ###  ###   ########",
"########   #####  ########## ###  ###  ### ###  #####  #######",
"#######     ####   ######### ###  ###  ### ###   ####   ######",
"                                                         #####",
"                                                         ####",
"                                                         ###",
```

The accent stays the first `t`'s whole crossbar — `+++` on rows 2 and 5, `++++++` on rows 3
and 4 — so the coloured cell run per text row becomes six cells (`▄███▄▄`, `▀███▀▀`): arm,
stem, stem, stem, arm, arm. No cell mixes accent and ink. `BANNER_COLUMNS` becomes 62 and
`BANNER_ROWS` stays 7. The header comment's proportions paragraph is rewritten to state the
derivation (width, sampling, threshold, the three adjustments) so the grid is reproducible
from the mark rather than eyeballed, and to say why 47 columns could not carry the `a`.

**testCriteria.**
- GIVEN `renderWordmark()` WHEN rendered plain THEN the inline snapshot equals the 62-column
  art, its character set is exactly `{" ", "▀", "▄", "█"}`, and no row carries trailing
  whitespace.
- GIVEN the indent `"  "` WHEN every line is measured THEN each is ≤64 characters and
  `BANNER_COLUMNS` ≤ 64 (the existing budget test passes unchanged).
- GIVEN `accent: "truecolor"` WHEN the coloured runs are extracted THEN they equal
  `["▄███▄▄", "▀███▀▀"]` — the updated assertion carries a `TEST CHANGE, justified:` comment
  naming the three-column stem.
- GIVEN any accent WHEN escapes are stripped THEN the bytes equal the plain rendering (existing
  test, unchanged).

**edgeCases.** A terminal narrower than 64 columns wraps the mark's longest rows; that is the
declared budget's own edge and is unchanged by this unit (the budget test pins 64).

### U2 · `landing-icons` — the copy affordance and the two button icons

| Field | Content |
|---|---|
| `id` | `landing-icons` |
| `requirements` | spec carries no ids |
| `files` | `website/src/pages/index.tsx`, `website/src/css/custom.css` |
| `depends_on` | none |
| `verify` | `cd website && npm run typecheck && npm run build` |

**Interfaces.** Two page-owned changes and no theme fork.

1. The theme's copy button is made visible at rest by one declaration on the page's own class,
   reaching specificity (0,4,1) because the theme's block-hover rule
   `:global(.theme-code-block:hover) .buttonGroup button { opacity: 0.4 }` is (0,3,1) and the
   theme's modules are emitted after `custom.css`:

   ```css
   .landing .landing__install.theme-code-block button.clean-btn { opacity: 1; }
   ```

   `theme-code-block` and `clean-btn` are the two global, non-hashed names the theme exposes on
   exactly these elements. No colour is set: at full opacity the theme's own pair is 10.79:1
   light and 13.36:1 dark. If a future theme renames either class the block reverts to today's
   behaviour, never to a broken page. The file header's "no theme selector named here" sentence
   gains a second carve-out written like the first.
2. The two links gain inline SVG icons the page owns, each `aria-hidden="true"`,
   `fill="currentColor"`, `viewBox="0 0 16 16"`, both Primer octicons (MIT; attribution in a
   comment beside the paths): `arrow-right-16` trailing on "Start here" at `1.1em` with a
   `translateX(0.15em)` hover that reads `--ifm-transition-fast` (0ms under reduced motion);
   `mark-github-16` leading on "GitHub" at `1em`, never animated, resized or recoloured. The
   links carry `landing__link` plus `landing__link--start` / `landing__link--repo`; new rules
   under `.landing__links` make each an `inline-flex` row with `gap: 0.5em`,
   `align-items: center`, and `flex: none` on the svg so nothing shrinks when the labels wrap
   at 375px. `.button` itself is never styled.

   Path data, verbatim — arrow:
   `M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z`
   mark:
   `M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656`

The comment above the `CodeBlock` in `index.tsx` ("the reason is the copy button") gains its
second half: the button is now visible at rest, and why that took a four-class selector.

**testCriteria.**
- GIVEN the built site WHEN the landing route is read headless in both colour schemes THEN the
  computed `opacity` of `.landing__install button.clean-btn` at rest is `"1"`, and still `"1"`
  while the block is hovered.
- GIVEN the landing route WHEN screenshotted at 1280px and 375px in both schemes THEN the
  "Start here" button shows a trailing arrow, the "GitHub" button a leading mark, the copy
  control is visible without hovering, and at 375px the two buttons wrap with neither icon
  shrunk — the before/after pairs attach to the proof block.
- GIVEN `cd website && npm run typecheck` WHEN run THEN it exits 0 (nothing in the root gates
  type-checks `index.tsx`; this is the only gate that does).
- GIVEN `cd website && npm run build` WHEN run THEN it exits 0 with no broken link.

**edgeCases.** `prefers-reduced-motion: reduce` — the arrow's hover offset collapses to an
instant 2px move because its transition reads `--ifm-transition-fast`, which Infima sets to
0ms under that media query; no page media query is needed. Keyboard focus: the UA
`:focus-visible` ring is intact on both links and on the copy button (nothing in Infima or the
theme sets `outline: none`).

### U3 · `menu-design` — the design language on the raw-mode controls

| Field | Content |
|---|---|
| `id` | `menu-design` |
| `requirements` | spec carries no ids |
| `files` | `src/cli/kit/terminal.ts`, `src/cli/kit/banner.ts`, `src/cli/kit/prompts.ts`, `src/cli/kit/program.ts`, `src/cli/commands/init.ts`, `src/cli/commands/config.ts`, `src/cli/commands/workspace.ts`, `src/cli/commands/clean.ts`, `src/cli/commands/worktree.ts`, `test/cli/prompts.test.ts`, `test/cli/kit.test.ts` |
| `depends_on` | `wordmark-a` (both edit `banner.ts`; this unit only moves its accent table) |
| `verify` | `npx vitest run test/cli test/architecture/boundaries.test.ts` |

**Interfaces.** The design language the rest of the CLI carries, applied to the two menus and
the typed fallbacks, with behaviour byte-identical: every string the suite pins renders
unchanged under the identity palette, and the coloured path adds escapes and nothing else.

```ts
// src/cli/kit/terminal.ts — the brand accent joins the palette; the SGR table moves here
export type AccentDepth = "truecolor" | "ansi256" | "ansi16" | "none";
export const ACCENT_SGR: Readonly<Record<Exclude<AccentDepth, "none">, string>>; // moved from banner.ts
export const ACCENT_RESET = "[39m";                                        // moved from banner.ts
export function resolveAccentDepth(opts: { colorEnabled: boolean; env: Readonly<Record<string, string | undefined>> }): AccentDepth; // was resolveBannerAccent
export interface Palette {
  bold(s: string): string; dim(s: string): string; red(s: string): string;
  green(s: string): string; yellow(s: string): string; cyan(s: string): string;
  /** Brand violet #6B24FF at the depth this terminal can take; identity at "none". */
  accent(s: string): string;
}
export function makePalette(enabled: boolean, accent: AccentDepth = "none"): Palette;
// src/cli/kit/banner.ts keeps its public surface: `export type BannerAccent = AccentDepth`
// and `export { resolveAccentDepth as resolveBannerAccent }`, because test/cli/banner.test.ts
// imports both from banner.ts; the grid and renderer are untouched by this unit.
// src/cli/kit/prompts.ts
export interface PromptGate {
  interactive: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** The already-resolved palette, injected for the same reason `env` is; absent → identity. */
  readonly palette?: Palette;
}
export function promptGate(opts: { stdinIsTTY: boolean; yes: boolean; json: boolean; env?: ...; palette?: Palette }): PromptGate;
// The spread is conditional: an omitted palette leaves NO key, because the suite asserts
// toEqual({ interactive: true }) on a bare gate.
```

`program.ts` builds the palette with the accent depth beside the colour decision it already
makes (`makePalette(colorEnabled, resolveAccentDepth({ colorEnabled, env }))`); the six
`promptGate` call sites (`init.ts`, `config.ts`, `workspace.ts`, `clean.ts`, two in
`worktree.ts`) each gain `palette: ctx.palette`. Inside `prompts.ts` one module constant
`IDENTITY_PALETTE = makePalette(false)` is the fallback, resolved once per call as
`gate.palette ?? IDENTITY_PALETTE`. `renderMenu` takes the palette and paints AFTER measuring:
the width clamp runs on plain text and the token is applied to the clamped string, the rule
`check.ts` states as "pad before painting".

Element by element — arrow menu: question line `bold`; hint line `dim`; the active marker `>`
`accent` as its own one-column run; inactive marker (a space) unpainted; labels unpainted (they
are manifest-derived text, and #6B24FF fails 4.5:1 on black); the settled frame after Enter
unchanged (no new bytes). Checkbox menu: as above, plus `[x]` `accent` and `[ ]` unpainted,
marker and box as two independent runs. EOF disclosure lines (`no answer — keeping the
default …`, all three prompt kinds, `confirm` and `textInput` included so the file is not
half-painted) `dim` with the surrounding newlines outside the run. Typed fallback: question
`bold`; numbered rows, the `Choose …` prompt line and its bracket unpainted (readline redraws
that line and five assertions pin it); the re-ask line (`not a valid choice: …`) `yellow`
(a correction the operator acts on, the register `panel.ts` spends yellow on); the give-up and
EOF disclosures `dim`. The colour is redundant by construction — the glyph and the `x` carry
the state — which is what lets a 2.2:1 ansi16 rung lose decoration and nothing else; the
comment above `renderMenu` states that reasoning, replacing the "NO COLOR IS WRITTEN"
paragraph with why colour is now written and what it may never touch.

**testCriteria.**
- GIVEN the whole existing `test/cli` suite WHEN run with no assertion edited THEN it passes —
  every menu-byte assertion runs under an identity palette (`{ interactive: true }` gates,
  `NO_COLOR` or non-TTY harnesses), including the exact escape-count assertion `1 + 3 + 1`.
- GIVEN `selectOne` and `selectMany` frames rendered under a truecolor palette WHEN escapes are
  stripped THEN they equal the identity frame with its escapes stripped, AND the coloured frame
  contains `[38;2;107;36;255m`, AND the escape count difference equals exactly two per
  painted token (question, hint, marker, plus one per checked box).
- GIVEN the typed path under the identity palette WHEN the transcript is read THEN it contains
  no `` at all.
- GIVEN the 20-column clamp case under a truecolor palette WHEN the active row is stripped THEN
  it still ends in exactly 18 `x` (paint after measure).
- GIVEN `makePalette(false)` THEN `accent` is the identity; GIVEN `makePalette(true, "truecolor")`
  THEN `accent("x")` is `[38;2;107;36;255mx[39m`; GIVEN `makePalette(true)` with no
  depth THEN `accent` is the identity (an untouched caller gets the old behaviour).
- GIVEN `promptGate({...})` without `palette` THEN the returned object has no `palette` key.
- GIVEN `test/architecture/boundaries.test.ts` THEN it passes: no new file under `src/`, and
  the new `prompts.ts → terminal.ts` edge is a same-unit edge.

**edgeCases.** A caller that builds a `PromptGate` literal by hand (`worktree.ts`'s dry-run
`{ interactive: false }`) carries no palette and falls to identity. A terminal whose `TERM` is
`dumb` takes the typed path, whose only painted lines (question, re-ask, disclosures) are SGR
the whole CLI already writes there. `ansi16`'s magenta is theme-defined: no contrast figure is
claimed for it, and the state never depends on it.

### U4 · `working-with-page` — the page, the diagrams, the sidebar

| Field | Content |
|---|---|
| `id` | `working-with-page` |
| `requirements` | spec carries no ids |
| `files` | `docs/working-with-stamity.md`, `website/docusaurus.config.ts`, `website/sidebars.ts`, `website/package.json`, `website/package-lock.json` |
| `depends_on` | none |
| `verify` | `cd website && npm ci --ignore-scripts && npm run build && cd .. && npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/ci/docsSite.test.ts` |

**Interfaces.** Site: `npm install --save-exact @docusaurus/theme-mermaid@3.10.2` in
`website/` (dependencies, pinned exact like every `@docusaurus/*` there); in the config,
`mermaid: true` inside the existing `markdown` block beside `format: 'detect'`, a new
top-level `themes: ['@docusaurus/theme-mermaid']`, and `mermaid: {theme: {light: 'neutral',
dark: 'dark'}}` inside `themeConfig` — required, not cosmetic, because the site's default mode
is dark and mermaid's default theme is a light-ground one. The single-line `exclude` list is
not reflowed (two suites read it off that line). Sidebar: `'Start here'` becomes
`present(['getting-started', 'working-with-stamity', 'doctrine'])` and the Guides group loses
the `'working-with-stamity'` line (four items remain, so the empty-category filter is
unaffected). The site build is the proof: the local gates never build the site.

Page: rewritten to ≤150 physical lines, every one of its current factual claims kept (the
research census lists 96, all landing in a named section) and every link kept
(`getting-started.md`, `capability-matrix.md`, `cli-reference.md`, `packs-and-trust.md`,
`troubleshooting.md`, all resolving from `docs/`). Sections in order: head (frontmatter,
currency `verified against the tree at commit 4607a76`, a re-open trigger of at most four
lines — the six-line head window the test reads — naming `content/charter/stamity-charter.md`
as the touchpoint index's owner and adding "the site stops rendering mermaid fences"); intro;
`## The nine` (the table with its "Its job" column equal to the charter's one-liners
character for character, minus the terminal period — the `/st-spec` cell regains its clause
after the semicolon and the `/st-plan` cell its parentheses — plus the client-surface note);
`## The spine` — a mermaid `flowchart LR` showing intent (`/st-spec`) → plan (`/st-plan`) →
execution (`/st-work`) → the gates fork (`done` / `Not done: one line per open gap`), with
`/st-ask` entering at intent, `/st-debug`, `/st-board` and the two feedback touchpoints
entering at plan, and `/st-quick` joining at the gate; `## Picking the entry point` — a
mermaid `flowchart TD` decision tree routing all nine in the order the cheapest exit fires
first (question? → ask; feedback on delivered work? → pr-resolve / rework; a backlog? → board;
wrong with no known cause? → debug; no written definition of done? → spec; small, obvious,
five files or fewer? → quick; a human reads the plan first? → plan, else work), followed by
the prose a box cannot carry (quick's full threshold list and the no-size-floor security row;
debug's observe-never-fix boundary and why; the plan-versus-work lifetime difference);
`## One change, walked through` (the same five steps, tighter, then the on-disk paragraph and
the two-line contrast); `## No green, no done`; `## Two changes at once` (one `sh` fence with
`setup`, `list`, `cleanup`, then three tables — what each command does, what travels and what
does not, the three consent gates — and the closing prose: a branch is never deleted, plain
`git worktree add` shows as unmanaged, gates run per tree, invariant 6); `## Where to go next`.
Both diagram sources parse under mermaid 11.17.2 (`flowchart-v2`); node labels use `<br/>`
for line breaks and quote every `/st-…` id.

**testCriteria.**
- GIVEN the rewritten page WHEN `wc -l` runs THEN ≤150; GIVEN the head WHEN the first six lines
  after frontmatter are read THEN they carry the currency header, `Re-open when:` and the
  literal `test/docsPages.test.ts`.
- GIVEN the table WHEN each `/st-…` row's second cell is compared to the charter's bullet for
  that id (whitespace-normalised, terminal period dropped) THEN all nine are equal and in the
  charter's order (U5's test pins this; this unit makes it true).
- GIVEN `cd website && npm run build` THEN exit 0, and the built
  `docs/working-with-stamity/index.html` contains no `language-mermaid` code block (the fences
  rendered as diagrams).
- GIVEN the built page read headless in both schemes THEN both diagrams render as SVG, and the
  screenshots attach to the proof block.
- GIVEN the sidebar WHEN the roster gate and the site test run THEN both pass, and the stripped
  sidebar source still names no migration page.

**edgeCases.** A reader on GitHub sees the same fences drawn natively; a site built with the
theme absent shows the fence as a plain code block rather than failing, which is the graceful
half and why the page can be reviewed before the dependency lands. A future `npm audit` change
in the mermaid subtree is the site toolchain's, already tracked under the maintainer's
Dependabot lanes.

### U5 · `docs-pins-and-one-home` — every pin the move touches, and the two glosses' homes

| Field | Content |
|---|---|
| `id` | `docs-pins-and-one-home` |
| `requirements` | spec carries no ids |
| `files` | `src/cli/docs/llmsIndex.ts`, `llms.txt`, `README.md`, `docs/getting-started.md`, `test/docsPages.test.ts` |
| `depends_on` | `working-with-page` (the mirror test reads the rewritten table) |
| `verify` | `node scripts/generate-docs.mjs && git diff --stat && npx vitest run test/docsPages.test.ts test/cli/docs test/ci/docsRoster.test.ts` |

**Interfaces.** Pins: the `docs/working-with-stamity.md` entry in `LLMS_INDEX_SECTIONS`'s
Guides section moves to second, directly after getting-started (`llms.txt` is regenerated,
never hand-edited — a test byte-compares it); README's Map row for the page moves above the
doctrine row; `GUIDES` in `test/docsPages.test.ts` becomes `[GETTING_STARTED,
WORKING_WITH_STAMITY, DOCTRINE, MIGRATION, CUSTOMIZATION, WORKSPACES, PACKS_AND_TRUST,
TROUBLESHOOTING]` (its comment's two positional claims — customization fourth, workspaces
fifth — stay true). README `## Commands` becomes the seven-line form: the nine verbs in
backticks and `learn`/`handoff` named (all pinned), and one sentence sending the gloss to
`docs/cli-reference.md` because that page renders from the program. README lands at 143
lines. Getting-started `## The nine verbs` keeps the bare list, sends the gloss to the CLI
reference, and keeps three bullets that are about two verbs together, not any one verb's job:
run `sync` after any `config` change; `worktree` is three subcommands (`setup`, `list`,
`cleanup`) with a link to `working-with-stamity.md` as their one home; `workspace` has a
guide of its own. The `learn`/`handoff` gating paragraph stays — it exists nowhere else. No
`file.md#anchor` link anywhere (the link resolver does not strip fragments). Currency headers
on README and getting-started move to `commit 4607a76`.

The mirror test, inside `describe("the guides")`: parse the charter's `## Touchpoints` bullets
(`- \`/st-x\` — one-liner`, continuation lines joined) into `id → one-liner`; parse the page's
table rows (`| \`/st-x\` | job | …`); assert the charter's id set equals the catalog's command
roster (the vacuity guard, via `loadCorpusIndex`), the page's row order equals the charter's,
and each job cell equals the charter's one-liner whitespace-normalised and without its
terminal period. The suite's docstring "Four guides have no bespoke case here yet" becomes
three, under a `TEST CHANGE, justified (strictly stronger):` comment naming the two cells that
had already drifted.

**testCriteria.**
- GIVEN `node scripts/generate-docs.mjs` WHEN run THEN only `llms.txt` changes and the
  working-with entry sits second under `## Guides`.
- GIVEN README WHEN read THEN ≤150 lines, each of the nine verbs and `learn`/`handoff` in
  backticks, a link to `docs/cli-reference.md` in `## Commands`, and the working-with Map row
  above the doctrine row.
- GIVEN getting-started WHEN read THEN each of the nine verbs in backticks, `.stamity/`
  present, no per-verb job sentence that restates a `docs/cli-reference.md` cell, and links to
  `cli-reference.md`, `working-with-stamity.md`, `workspaces.md` resolving from `docs/`.
- GIVEN the mirror test WHEN the page's `/st-plan` cell is altered by one character THEN the
  test fails naming the page (red-check, recorded in the ledger).
- GIVEN the whole `test/docsPages.test.ts` and `test/ci/docsRoster.test.ts` THEN green.

**edgeCases.** A tenth touchpoint: the catalog roster grows, the charter's index must grow
(and meets the always-on ratchet first), then the mirror's order assertion fails until the page
grows its row — catalog → charter → budget decision → page, in that order.

### U6a · `next-step-light-trio` — the line on `/st-ask`, `/st-debug`, `/st-quick`

| Field | Content |
|---|---|
| `id` | `next-step-light-trio` |
| `requirements` | spec carries no ids |
| `files` | `content/commands/st-ask.md`, `content/commands/st-debug.md`, `content/commands/st-quick.md`, `test/corpus/commands/lightTrio.test.ts` |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/lightTrio.test.ts test/corpus/invariants.test.ts test/evals` |

**Interfaces.** Each insertion goes at the tail of its file, after the last line any eval case
sources, so no `source:` locator moves. Each is ≤5 lines, in the file's own voice, derived from
the run's own state and never a fixed menu, with the "nothing outstanding" clause, matching the
three lines that exist (`st-work`'s proof-block bullet, `st-board`'s `next`, `st-plan`'s
`Next step`).

`st-ask.md` — a blank line then, after the final line of the file (`…Naming the destination is
the whole handoff — this command does not start it.`):

```
Close on one recommended next step, derived from this run's own state and not from the
ladder above: a Blocked row makes what unblocks it the step, a Contradiction makes resolving
it the step, and a low-confidence claim makes the evidence that would raise it the step. The
ladder names the destination once state has chosen; with nothing outstanding, the line says so.
```

(No digit followed by "lines" anywhere in the body — the light-trio suite bans `\d+\s*lines`
over the whole of ask; and no fifth Output block, the four are pinned by name.)

`st-debug.md` — a blank line then, after the final escalation-table row:

```
The closing report ends on one recommended next step, derived from this run's own state and not
from the table above: a regression clause with no test makes writing it the step; instrumentation
held under a capture-later agreement makes the strip at the window's end the step; a surviving
hypothesis makes its discriminating observation the step. None of those, and the line says so.
```

`st-quick.md` — a blank line then, after the final escalation-table row:

```
The report closes on one recommended next step, derived from this batch's own state and not from
the table above: a refused or deferred item makes carrying that list to `/st-work` the step; an
item reported `saved` makes the `stamity sync` run that publishes it the step; a pre-existing
failure left alone makes naming it the step. A batch with none of those says so in the line.
```

Tests, following `work.test.ts`'s pattern for `st-work`'s line: one case per command asserting
the derivation phrase (`derived from this run's own state` / `this batch's own state`), the
"not … a fixed menu / the table above / the ladder above" clause, and at least one named
state per line.

**testCriteria.**
- GIVEN each edited file WHEN its corpus suite runs THEN the body line cap (250) holds, every
  `/st-<id>` mention resolves, ask's four Output blocks are still exactly four, and the new
  case for each command passes.
- GIVEN `test/evals/locators.test.ts` THEN green with no case file edited (every sourced range
  lies before the insertion).
- GIVEN the three new lines WHEN removed one at a time THEN the corresponding new test fails
  (red-check, recorded in the ledger).

**edgeCases.** `st-debug.md` has no `## Return contract` section; the paragraph attaches to the
tail of `## Escalation` rather than minting a heading (a heading would cost two more lines and
nothing pins or forbids it — the paragraph is the smaller change).

### U6b · `next-step-spec-rework-pr` — the line on `/st-spec`, `/st-rework`, `/st-pr-resolve`

| Field | Content |
|---|---|
| `id` | `next-step-spec-rework-pr` |
| `requirements` | spec carries no ids |
| `files` | `content/commands/st-spec.md`, `content/commands/st-rework.md`, `content/commands/st-pr-resolve.md`, `test/corpus/commands/spec.test.ts`, `test/corpus/commands/feedbackPair.test.ts` |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/spec.test.ts test/corpus/commands/feedbackPair.test.ts test/corpus/invariants.test.ts test/evals` |

**Interfaces.** `st-spec.md` — a bullet joining the `## Return contract` list, inserted
directly after `- Not done: each gap the run left open — or \`none\`.` (no heading is added;
the spec suite pins the section skeleton with `## Return contract` as the last named section):

```
- Next step — derived from this run's own state, never a fixed menu: an open
  `[NEEDS CLARIFICATION]` marker makes resolving it the step, since a marked
  spec is not handed to `/st-work`; an unconfirmed T2 or T3 proposal makes that
  confirmation the step; a census gap makes the criterion it named the step. A
  run that closed with none of those says so in the same line.
```

`st-rework.md` — a blank line then a paragraph after the `## 6. Plan handoff` close paragraph
(the one ending `inbox rows added.`):

```
Close also on one recommended next step, derived from this run's own state and not from a fixed
menu: a standing `[NEEDS CLARIFICATION]` marker makes resolving it the step, since it is what
blocks handoff; a plan persisted on `stop` makes running it through `/st-work` the step; DEFER
rows alone make board triage of the inbox the step. None of those, and the line says so.
```

`st-pr-resolve.md` — a blank line then a paragraph at the end of `## Close`, after the sentence
`…This command writes no other platform state.` (so the fourth-write-back sentence stays the
section's own):

```
The block closes on one recommended next step, derived from this run's own state and not from a
fixed menu: a thread whose reply failed makes re-posting it the step; a `NEEDS_CLARIFICATION`
row makes the reviewer's answer the step; an unspent round under the attempt cap with fresh
comments makes the next round the step. A run that closed with none of those says so in the line.
```

Tests as in U6a, one per command, in the suites that already own these files.

**testCriteria.**
- GIVEN the spec suite THEN the skeleton subsequence still ends on `## Return contract`, the
  cap (500) holds, no minted URL or vendor token, and the new case passes; GIVEN the
  feedback-pair suite THEN both caps (400) hold, pr-resolve's five egress guards and its
  fourth-channel sentence still pass, and the two new cases pass.
- GIVEN `test/evals/locators.test.ts` THEN green with no case file edited.
- GIVEN each new line removed THEN its test fails (red-check, recorded).

**edgeCases.** The auto-decline that cannot name a commit is already routed into pr-resolve's
phase-3 table, so it is a triage row, not a close-state, and is deliberately not one of the
three branches.

### U6c · `corpus-sync-and-goldens` — the emitted copies, the snapshot, both ledgers

| Field | Content |
|---|---|
| `id` | `corpus-sync-and-goldens` |
| `requirements` | spec carries no ids |
| `files` | `.claude/commands/st-{ask,debug,quick,spec,rework,pr-resolve}.md`, `.apm/prompts/st-{ask,debug,quick,spec,rework,pr-resolve}.prompt.md`, `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/emit/crossClientGoldens.test.ts`, `test/corpus/emissionGoldens.test.ts`, `test/corpus/commands/work.test.ts` |
| `depends_on` | `next-step-light-trio`, `next-step-spec-rework-pr` |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && node scripts/generate-apm-package.mjs --check && node dist/cli.js check && npx vitest run test/emit test/corpus/emissionGoldens.test.ts test/corpus/commands/work.test.ts` |

**Interfaces.** The regeneration order the learnings record: build, dogfood sync (twelve
emitted copies and the manifest's `contentHash` rows move — every moved file is explained by
the six corpus edits, and `st-work`, `st-board`, `st-plan` rows must not move), the APM
projection, then `npx vitest run test/emit/crossClientGoldens.test.ts -u` only after reading
the diff as a file review: six digest rows move per dialect that carries commands (claude,
copilot prompts, cursor skills) plus the manifest hash rows in the residue documents; nothing
else. Then the ledger row in BOTH golden test files, newest first, in the shape the previous
rows use: date, the item, CHANGED — the six command bodies with old → new byte figures —
and what did NOT move (the charter, every generated page, every hook script, every other
corpus body). The corpus ledger's row says this suite holds none of the six bodies and the
bytes are itemised in the sibling. `work.test.ts`'s comment "Every closing contract was
surveyed and none carried one" is corrected to name the nine that now do.

**testCriteria.**
- GIVEN `node dist/cli.js check` at the root THEN "all green — nothing to do".
- GIVEN `git status` after the sync THEN the moved set is exactly the twelve emitted copies,
  the manifest, and the snapshot — no file the corpus edits do not explain.
- GIVEN both ledgers THEN each carries the dated row, and the snapshot's `st-work`, `st-board`
  and `st-plan` rows are byte-identical to before.

**edgeCases.** `docs/reference/commands.md` renders frontmatter only and does not change;
`node scripts/generate-docs.mjs` is expected to be a no-op here and the run says so.

### U7 · `eval-run-4` — the affected slice under `SET-v3`

| Field | Content |
|---|---|
| `id` | `eval-run-4` |
| `requirements` | spec carries no ids |
| `files` | `evals/runs/2026-09-04-run-4/RESULTS.md`, `evals/runs/2026-09-04-run-4/samples.jsonl` |
| `depends_on` | `corpus-sync-and-goldens` (the corpus is committed at the sha the run pins) |
| `verify` | `npx vitest run test/evals && git status --porcelain evals/` (empty before the run starts) |

**Interfaces.** The runner skill's protocol over the affected slice: the 18 cases whose
`source:` names one of the six edited files (13 golden, 4 guardrail, 1 benign twin; 7 carry
`floor: true`), three samples each, model under test `claude-opus-5`, judge `claude-fable-5-1`,
loaders byte-checked length-for-length against a manifest computed from the files, calibration
over all five fixtures with labels withheld before any score, the brief handed in unedited
with only the attestation request on a trailing line the harness strips, every judge call
redone on an off-id attestation, an uncited binding verdict, or a verdict that does not follow
its own binding group. `RESULTS.md` in `SET-v3`'s nine-section shape, stating it is a slice
run (trigger 1), the slice denominators, the per-case verdicts beside run 3's for the same
cases (the instrument moved in exactly one way: the harness's appended no-tools line is gone),
the advisory ledger, calibration, and a `Not done` naming the six lines' missing golden cases
for `SET-v4`. `samples.jsonl` carries every transcript, verdict and cited span in run 3's
record shape.

**testCriteria.**
- GIVEN the run WHEN it completes THEN every scenario attests `claude-opus-5[1m]`, every judge
  call `claude-fable-5-1`, calibration 5/5, and no ungraded sample is counted anywhere.
- GIVEN the artifact THEN `RESULTS.md` names the set version, the sha, the versioned inputs as
  attested, run counts with reruns, calibration, the per-case table with the deciding
  criterion, and each metric beside its threshold with the slice caveat.

**edgeCases.** A harness interruption resumes from the workflow journal and re-runs only the
calls that produced no verdict; nothing from an interrupted state is scored.

## Risks

- **Warning — the site is proven only by its own build.** No root gate type-checks
  `index.tsx` or builds the site. Mitigation: U2 and U4 run `npm run typecheck` and `npm run
  build` in `website/` locally, and the docs-site CI run on the push is read before the head is
  trusted.
- **Warning — the 62-column mark meets the budget exactly.** `BANNER_COLUMNS` 62 plus the
  indent is 64, the cap. Mitigation: the budget test pins it; the design-quality lens reads the
  rendered mark; a narrower candidate (47 columns, round-cornered) is recorded in the research
  as the fallback.
- **Warning — a golden refresh absorbs mistakes silently.** Mitigation: the snapshot diff is
  read as a file review before `-u`, and the three untouched commands' rows are asserted
  unchanged.
- **Warning — the mirror test and the page rewrite share a truth.** If U4 lands a cell one
  character off, U5's test fails on the page. Mitigation: U5 depends on U4 and its red-check
  proves the direction.
- **Minor — mermaid adds 112 packages to the site's lockfile.** Bounded to `website/`, no
  install scripts, no net-new advisory; the published package and the root install never reach
  it.
- **Minor — the six new lines have no golden case.** Recorded for `SET-v4`; the affected-slice
  run measures that the surrounding claims still hold.

## Open questions

None. Every reading taken by default is stated in Context with the reading dropped.

## Design review amendments (2026-09-04, before the build)

The design-quality lens ran over U1–U4 at the verdict id before any of them was built, and
three of its findings change the designs above. They bind the builders; the units' text stands
as the record of what was proposed.

- **U1.** Candidate B is approved as the mark. Two amendments: the header comment states the
  derivation as it actually happened — per-letter rasters in their own boxes at 62 columns
  (the SVG's inter-letter gaps are sub-column at every width the budget allows, so a
  whole-mark raster fuses letters), one blank column inserted by hand between letters, the
  `a`'s right mass widened to four columns and the `m` narrowed to thirteen with three equal
  legs (two cleanups of raster phase noise inside the `a`, rows 8 and 10 mirrored to rows 5
  and 3), plus the three named adjustments, and the anisotropy stated (7.9 units per column
  against 9.3 per pixel row, so stems are three cells wide and crossbars two rows tall) so
  nobody corrects it. And `bannerBlock` gains an optional `columns` fact and returns the
  empty string when the terminal is narrower than the mark plus its indent — the same
  stay-out-rather-than-print-broken rule it applies to pipes — pinned by one test
  (63 → nothing, 64 → the mark, absent → the mark); U3 wires the fact at the one call site.
- **U3.** Critical: the brand violet fails 3:1 as a state indicator on dark grounds
  (3.32:1 on black, 2.25:1 on a Dracula ground) and the degrade ladder makes it worse. The
  menu's accent is therefore a ground-independent tint of the brand hue — truecolor
  `#8A52FF` (the token set's own `--ifm-color-primary-lightest`; 4.7:1 on black, 4.4:1 on
  white), 256-colour index 99, and no colour at all at 16-colour depth, where the value is
  theme-defined and may not carry state. The banner keeps its own `#6B24FF` ladder: its
  accent is decorative and the ink carries the mark. Two tables in `terminal.ts`, one
  reason stated at `renderMenu`. The disclosure lines stay theme ink, not dim — a
  default-applied line is a decision record the question protocol requires visible. The
  worktree list's cyan star and the menu's accent marker are two current-row markers on
  purpose (one marks a fact about the tree, the other a cursor the operator moves), and the
  `renderMenu` comment says so.
- **U4.** Critical, measured: the two diagrams as specified render their labels at 6.5 px and
  9.3 px in the 700 px doc column and under 5 px on a phone, because mermaid scales the SVG
  to its container. The page keeps one diagram — the spine, in the minimal top-to-bottom
  shape that renders at 16 px in the column and 9.5 px at 375 px, carrying `accTitle` and
  `accDescr` — and the entry-point decision tree becomes a first-match table ("the first row
  that fits wins", nine rows, cheapest exit first). Critical, routing: `/st-ask` feeds the
  plan, not the intent; `/st-debug`, `/st-board`, `/st-rework` and `/st-pr-resolve` hand to
  `/st-work`, not to `/st-plan`; `/st-quick` joins at the gate. The spec row reads "the
  definition of done spans more than this one change". Mermaid's own dark palette is a
  recorded gap (per-mode theme variables are not expressible in the theme's config), named
  in the unit's not-done.
- **U2.** Approved. The header carve-out names both global classes and the one property set;
  the copy control's copied state is not announced to assistive technology (a theme
  behaviour CSS cannot reach) and is named as not done.
