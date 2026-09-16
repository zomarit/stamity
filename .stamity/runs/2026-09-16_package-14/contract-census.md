# Contract census — before the Package 14 fan-out

Read-only census of 2026-09-16 (invariant 6): every test pin, generated-index entry, cross-page overlap and shared contract a page rewrite could break, with path:line evidence. The predecessor project's name is respelled `<predecessor>` here because this file lives under `.stamity/`, which the leak gate scans. Page-side line numbers deep inside the guide bodies are approximate; the pin inventory is read from the tests themselves.

# Contract Census — Fourteen Hand Pages + README Before Parallel Rewrite

Evidence gathered from: `/Users/denismasatovic/Projects/zomarit/stamity/test/docsPages.test.ts` (read in full, 1669 lines), `test/ci/docsSite.test.ts`, `test/ci/docsRoster.test.ts`, `test/ci/workflow.test.ts` (GOVERNANCE/CONTRIBUTING sections), `test/content/invariantsVersion.test.ts`, `test/cli/docs/llmsIndex.test.ts`, `test/cli/docs/measurements.test.ts`, `src/cli/docs/llmsIndex.ts`, `website/sidebars.ts`, `website/docusaurus.config.ts`, `website/src/pages/index.tsx`, `scripts/leak-gate.mjs`, `content/charter/stamity-charter.md`, `.github/release-controls-checklist.md`, `README.md` (full), plus header/title greps over all fourteen pages and `docs/`. No file was edited.

---

## A. Per-page census table

### README.md (157/157 lines — zero headroom)

| Pin | Literal it holds | Class | Today's line |
|---|---|---|---|
| `test/docsPages.test.ts:289,309` `CURRENCY_HEADER`/`RELEASE_CUT_DATE` | `<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.8.0 release cut (2026-09-15). -->` | KEEP VERBATIM (regex-shaped; date/version move together with the cut) | README.md:1 |
| `:534-535` re-open trigger | `Re-open when: …` + literal substring `test/docsPages.test.ts` | KEEP THE FACT, MAY REPHRASE (must retain the literal path substring) | README.md:2-5 |
| `:649-660` opening shape | H1 `# stamity` at a fixed offset, blank line after it, next line is the pitch (must NOT start with `>`), pitch must contain `zomarit`, page must contain `npx @zomarit/stamity init` | KEEP VERBATIM (shape) / KEEP THE FACT (wording) | README.md:18-22, INSTALL_COMMAND at :27 |
| `:667-686` banner | Two `src=`/`srcset=` attrs resolving on disk; `<source … prefers-color-scheme: dark … srcset="`; `<img … alt="stamity"` | KEEP VERBATIM (markup shape and both file paths) | README.md:11-16 |
| `:690` `README_MAX_LINES=157` | Total line count ≤ 157 | HARD BUDGET — zero headroom today | whole file |
| `:702-739` command surface | `## Commands` section containing a `` `v1` · `v2` … `` list matching literally `["init","sync","check","validate","add","config","workspace","worktree","clean"]`, in that order; must contain literal `"nine verbs"`; must contain `` `learn` `` and `` `handoff` `` | KEEP VERBATIM (the verb list and order; hand-duplicated against `src/cli.ts` and against `docs/getting-started.md`'s own copy — see D) | README.md:62-66 |
| `:744-763` `README_LINK_TARGETS` | Every literal target in the const (content/, packs/, docs/capability-matrix.md, docs/cli-reference.md, docs/configuration.md, docs/measurements.md, docs/reference/, llms.txt, SECURITY.md, CONTRIBUTING.md, GOVERNANCE.md, CODE_OF_CONDUCT.md, all nine `MAPPED_GUIDES` — every guide but migration) must all appear as `[…](target)` | KEEP VERBATIM (link targets; not prose) | README.md:96-121 (Map table) + inline links elsewhere |
| `:767-788` corpus row | `CORPUS_ROW` regex against the `content/` map row; each `N noun` pair matched by `COUNTED_NOUN` must equal `corpusCounts()` (catalog walk) — currently `1 charter, 9 commands, 10 agents, 8 skills, 12 rules` | DERIVED — regenerate mentally per rewrite (numbers move if the corpus moves; wording free) | README.md:98 |
| `:790-799` hook-script cite | Must contain literal `src/hooks/scripts.ts`; `content/hooks/` must NOT exist | KEEP VERBATIM (path) | README.md:123-125, path in :128-129 area is elsewhere but cite is at :123-125 |
| `:801-812` Codex prose | Must match `/Codex has no\s+repository-level command home/` while `docs/capability-matrix.md`'s `### \`codex\`` `command-surface` row starts with `none` | KEEP VERBATIM (regex-anchored phrase) | README.md:55-56 |
| `:1414-1424` "the guides" | Must contain literal string `` the managed block in `CLAUDE.md` `` (shared with getting-started.md and working-with-stamity.md) | KEEP VERBATIM (exact phrase) | README.md:146 |
| `:1269-1290` reachability | README must link every `MAPPED_GUIDES` page (`](path)`) and must NOT link `docs/migration.md` | KEEP VERBATIM (presence/absence) | README.md Map table rows 113-121; migration deliberately absent |
| `llmsIndex.test.ts:141-149` | Every repo-relative link in README must resolve on disk | KEEP VERBATIM (no broken links) | whole file |
| README Map row wording vs `llms.txt`/sidebar/page-opening | See §C below | MOVE WITH THE PAGE (owner: the guide's own opening sentence; README map row derives) | README.md:96-121 |

### SECURITY.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header/re-open trigger (same shape as README) | `<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.8.0 release cut (2026-09-15). -->` + `Re-open when:` naming `test/docsPages.test.ts` and `.github/workflows/release.yml` | KEEP VERBATIM / KEEP THE FACT | SECURITY.md:1-4 |
| `:864-880` disclosure | Must contain `ADVISORY_URL` = `https://github.com/zomarit/stamity/security/advisories/new`; match `/private vulnerability reporting/i`; match `/[Dd]o not\s+open a public issue/`; match `/CVE/`; `## Supported versions` heading; row matching `\|\s*\`1\.x\`\s*\|\s*Yes` | KEEP VERBATIM (URL, table row shape) / KEEP THE FACT (surrounding prose) | SECURITY.md:15 section, table near :39 |
| `:883-940` `file::symbol` pointers | ≥10 backticked `src/…` spans; NONE may end `:\d+` (no line numbers); each `file::symbol` must resolve — file exists, symbol declared in it; the "## What the engine defends today" table's cited symbols must each have a call-graph reference somewhere under `src/` (via `referencesTo`) | KEEP VERBATIM (every `file::symbol` span, character for character) — this is the highest-risk pin on the whole census: a rewrite that reformats a code span, even cosmetically, breaks the regex `` `([^`]+)` `` extraction | SECURITY.md, table under `## What the engine defends today` (:67) through `## Network and data handling` (:88) |
| `:942-963` `checkToolAccess` disclosure | If nothing under `src/` calls `checkToolAccess` (declared in `src/tools/allowlist.ts`): page must NOT match `/[Ee]nforced in-process/`, and `checkToolAccess` mention must appear AFTER `## What it does not defend` heading. If something DOES call it: page must NOT match `/no production caller/` | KEEP VERBATIM conditional — writer must re-check the call graph before touching this sentence | inside `## What it does not defend` (:158) |
| `:965-976` install routes | Must match `/node_modules/`, `/local directory/i`, `/bundled first-party packs/i`, `/fetched over the network/i`; must match `/org trust policy[\s\S]{0,80}narrows them/i` (≤80 chars between phrases) | KEEP VERBATIM (the 80-char proximity is a hard trap — see D) | SECURITY.md, `## Network and data handling` region |
| `:978-987` hook caveat | Must contain literal `.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json`, `.stamity/generated/hooks/`; must match `/MCP server definition[\s\S]{0,20}likewise becomes a launcher/i` (≤20 chars proximity — even tighter trap) | KEEP VERBATIM | same region |
| `:989-1009` obligations ledger | Must match `/standards mapping/i`; must contain literal `](docs/security-mapping.md)`; must NOT match `/re-run a threat-model pass/i` | KEEP VERBATIM (link) / negative constraint (must not reintroduce retired phrase) | near :214 (`## Standards mapping`) |
| `:1011-1034` unwired controls | `guardInput`, `validateAgentOutput`, `hashToolManifest`, `detectToolManifestDrift` must each be mentioned AFTER `## What it does not defend`; must contain literal `MAX_USER_CONTENT_LENGTH`; must match `/250 000-byte ceiling/` | KEEP VERBATIM (symbol names, ordering relative to heading, the exact byte-ceiling phrase) | :158 onward |
| `:1036-1042` coverage words | Must match `/trust ladder/i`, `/deny-scan/i`, `/allowlist/i`, `/atomic rename/i`, `/does not defend/i` | KEEP THE FACT, MAY REPHRASE (case-insensitive, single-word matches) | throughout |
| Release checklist reserved sentence | `.github/release-controls-checklist.md:147-153` pins the EXACT sentence now required in the "Publishing this package" section (`Each of those is now in force: the \`npm-publish\` environment requires a reviewer before a publish runs, the \`v*\` tag ruleset governs release-tag creation, update and deletion, and the registry's trusted-publisher entry is configured, so published versions authenticate over OIDC and carry npm provenance rather than a stored token. Every step that depends on one says so where it depends on it.`) | KEEP VERBATIM — external document (the release checklist) also holds this sentence; any change must be reconciled in both places, per the checklist's own note at line 157-159 | SECURITY.md `## Publishing this package` (:127), sentence at :152-153 |
| `docs/security-mapping.md` cite | Currency-header `Re-open when:` line (SECURITY.md:4) itself names `.github/workflows/release.yml` and "the mapping" as re-open conditions | KEEP THE FACT | SECURITY.md:2-4 |

### CONTRIBUTING.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header (same shape) | 1.8.0 / 2026-09-15 | KEEP VERBATIM/FACT | CONTRIBUTING.md:1-2 |
| `:1155-1176` posture | Match `/[Pp]ull requests are welcome/`; contain literal `0 required approvals`; match `/CI/`; contain literal `/st-pr-resolve` (built from `COMMAND_PREFIX="st-"`, NOT from `PRODUCT`); contain literal `git commit -s`; match `/DCO/`, `/[Cc]onventional-commit/`; must NOT match `/external contributions are not accepted/i` | KEEP VERBATIM (the approval count and the command name) | CONTRIBUTING.md:18 (`0 required approvals`) |
| `:1178-1184` dev loop | Contain `npm run check`; match `/virtual-filesystem unit tests/i`, `/golden files/i`, `/child-process end-to-end/i`, `/property tests/i` | KEEP THE FACT, MAY REPHRASE (case-insensitive) | `## Test lanes` :83 |
| `:1186-1195` regeneration table | Must literally contain all four commands: `node scripts/generate-capability-matrix.mjs`, `node scripts/generate-docs.mjs`, `node scripts/generate-pack-manifests.mjs`, `node dist/cli.js sync` | KEEP VERBATIM (exact command strings — parsed by substring, not by column position, but each string must appear once literally) | `## Regenerating derived files` :138 |
| `:1197-1205` leak gate | Match `/Leak gate/`; contain `npm run gate`; contain `scripts/leak-gate.mjs`; match `/reserved/i` | KEEP VERBATIM (script path and npm alias) | `## The leak gate` :160 |
| `workflow.test.ts:738-757` | Must contain literal `all-pr-checks`, `pr-checks.yml`, `all-ci-checks`; must contain `` checked by the `pr-checks` workflow ``; must NOT contain `Both are checked in CI` | KEEP VERBATIM (context names — cross-checked against `.github/workflows/pr-checks.yml` job names) | :51, :60 region |
| README cross-reference | README's "Map" paragraph (README.md:127-135) names the same four generators CONTRIBUTING's regeneration table owns | MOVE WITH THE PAGE — CONTRIBUTING owns the table; README only names the split exists ("CONTRIBUTING.md's regeneration table is the one home for that split", README.md:132) | see §C |

### GOVERNANCE.md (not in `HAND_PAGES`/`PAGES`, but still pinned)

| Pin | Literal | Class | Line |
|---|---|---|---|
| `docsPages.test.ts:83-96` | GOVERNANCE is deliberately excluded from `PAGES` — **no currency-header/re-open-trigger/line-budget assertion applies to it from `test/docsPages.test.ts`**, but it carries the same `HAND-WRITTEN PAGE` banner anyway (GOVERNANCE.md:1-2) as an unenforced convention | Not gated by `docsPages.test.ts`, but keep the banner shape for consistency (no test enforces it — a writer who drops it breaks no gate but breaks the pattern every other hand page follows) | GOVERNANCE.md:1-2 |
| `workflow.test.ts:738-749` | Must contain literal `all-pr-checks`, `pr-checks.yml`, `all-ci-checks` (same three strings CONTRIBUTING is held to) | KEEP VERBATIM | GOVERNANCE.md:56 region (`all-pr-checks` mentioned :56), `all-ci-checks` at :41 |
| README link existence | README must link `GOVERNANCE.md` (in `README_LINK_TARGETS`) — existence only, no content pin from that test | MOVE WITH THE PAGE (owner: README map row, existence-only) | README.md:111 |
| `llmsIndex.ts:132-137` | Fixed `llms.txt` description: *"who decides, the two required checks a change passes to land, and what the private layer holds."* | MOVE WITH THE PAGE (owner: llmsIndex.ts entry — must be updated together with any rewrite that changes what GOVERNANCE says about check count/holdings) | `src/cli/docs/llmsIndex.ts:132-137` |
| `leak-gate.mjs` | GOVERNANCE is NOT on `PREDECESSOR_ALLOWLIST` (line 454) — it may not name the predecessor project at all, unlike migration.md | Hard constraint | scripts/leak-gate.mjs:454 |

### docs/security-mapping.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | docs/security-mapping.md:5 |
| `docsPages.test.ts:1102-1104` | Every `src/…` backticked span held to `assertSymbolAddressesResolve`, minimum **20** distinct symbol addresses, none with `:line` suffix | KEEP VERBATIM (every code span) — HIGHEST density of any page: ≥20 `file::symbol` pins | throughout `## The surfaces` |
| `:1106-1115` | `## The surfaces` section must contain exactly **7** `###` sub-headings, each non-empty; must contain a top-level `## Gaps` heading | HARD STRUCTURE — a rewrite that merges/splits surfaces breaks this | section boundaries |
| `:1117-1149` catalogue ids | Must literally contain every one of: `ASI01`-`ASI10`, `LLM01`-`LLM10`, `A01`-`A10` (30 ids total, generated via `decade()`), plus subcategories `GOVERN 1.1`, `GOVERN 1.6`, `MAP 1.1`, `MEASURE 2.7`, `MANAGE 2.1`, `MANAGE 3.1`, `MANAGE 3.2`; plus every edition string: `2025-12-09`, `OWASP Top 10 for LLM Applications 2025`, `OWASP Top 10:2021`, `NIST AI 100-1`, `NIST AI 600-1`, `2024-04-15`, `2025-05-22`; plus literal `read on 2026-09-14` | KEEP VERBATIM (all 30 ids + 7 edition strings + the read-date stamp — this is the single densest literal-preservation page in the set) | throughout |
| SECURITY.md link-back | SECURITY.md:1006 (`](docs/security-mapping.md)`) points here | MOVE WITH THE PAGE if filename/route changes | cross-page |

### docs/packs-and-trust.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1589-1594` | Must contain every literal string in `TRUST_TIERS` (`src/pack/trust.ts`) — the trust-tier rung names | KEEP VERBATIM (each tier name, sourced from the module — DO NOT rephrase a tier name even in prose) | throughout |
| `:1596-1623` | If the only declared `SigstoreVerifier` is `notYetArmedSigstoreVerifier`: page must match `/not armed/i`. Once a real verifier is declared, page must NOT match `/not armed/i` | KEEP VERBATIM — conditional on `src/pack/trust.ts` state at rewrite time; writer must check this before touching the "not armed" sentence | wherever it appears |

### docs/enterprise-forks.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1345-1377` | Every verb in `scripts/upstream.mjs`'s `export const VERBS` array (≥7 verbs) must appear as `` `verb` ``; every exit-1 outcome key in `OUTCOMES` (only the ones mapped to `1`, not `0`) must appear as `` `outcome` `` | KEEP VERBATIM (each backticked verb/outcome token) | throughout |
| CONTRIBUTING cross-reference (from brief) | Cites CONTRIBUTING's regeneration table by its re-open trigger | Verify at rewrite time; not independently regex-pinned in `docsPages.test.ts`, but named in the brief's overlap list — treat as KEEP THE FACT | — |

### docs/workspaces.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1317-1343` | Every subcommand in `src/cli/commands/workspace.ts`'s `SUBCOMMANDS` const (currently 3) must appear TWICE: as `` workspace <sub> `` and as `` stamity workspace <sub> ``; page's own count sentence must read `"three subcommands"` (or the numeral form if the count changes) | KEEP VERBATIM (both phrasings, per subcommand) | throughout |

### docs/troubleshooting.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1625-1655` | `## What \`check\` prints` section must contain one `` | `probe-id` | `` row per probe id read out of `src/cli/commands/check.ts` (≥9 today), set-equal both ways, bounded by `## Common failures` heading | KEEP VERBATIM (heading names `## What \`check\` prints` and `## Common failures` are structural anchors — renaming either breaks the section-slice) | headings + table |
| `:1657-1668` | Must contain literal `https://github.com/zomarit/stamity/issues`; must contain `ADVISORY_URL`; must match `/do not open a public issue/i` | KEEP VERBATIM (both URLs) | throughout |

### docs/customization.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1292-1315` | Two tables restated from `src/content/userContent.ts`: `CLASS_LAYOUT` (4 classes) → each row `` `.stamity/overrides/<dir>/<id>/SKILL_FILE or <id>.md>` `` exact path form; `LEAN_LINE_THRESHOLDS` (4 classes) → each row must read exactly `` | klass | limit | `` (COLUMN-POSITION-PARSED — this is the "parses a table by column position" trap named in the brief) | wherever the two tables sit |

### docs/getting-started.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1379-1412` | Contains `INSTALL_COMMAND`; contains ALL nine verbs as `` `verb` `` (same list as README, second hand-kept copy — see trap D); contains literal `.stamity/`; contains literal `checkbox menu`; contains all three literal phrases `arrow keys`, `space toggles`, `enter confirms` | KEEP VERBATIM (nine backticked verbs + four exact UI-hint phrases) | throughout |
| `:1414-1424` | Must contain `` the managed block in `CLAUDE.md` `` (shared with README and working-with-stamity — three-way pin, see §C) | KEEP VERBATIM | — |

### docs/working-with-stamity.md (150/150 lines — zero headroom)

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `:1465-1467` `MAX_LINES=150` | ≤150 total lines | HARD BUDGET — zero headroom today (declared by `docs/plans/001-package-8-operator-experience.md:24` + `:335`) | whole file |
| `:1414-1424` | `` the managed block in `CLAUDE.md` `` literal | KEEP VERBATIM | — |
| `:1433-1463` touchpoint table | Table rows (`\| \`/st-x\` \| job \| …`) must exactly mirror `content/charter/stamity-charter.md`'s `## Touchpoints` bullet list, ID-for-ID, ORDER-for-order, one-liner-for-one-liner (via `oneLine()` normalization — trailing period and whitespace insignificant, everything else must match exactly). IDs are also cross-checked against the catalog's own command roster (must equal exactly, both sorted) | KEEP VERBATIM — HIGH RISK: this is a **mirror, not a paraphrase**; rewriting the charter's touchpoint index requires this table to move in the same change, and vice versa | table in the body |
| `:1487-1499` spine/CLS pin | A `## <Heading>` immediately followed by a blank line then ` ```mermaid ` fence (regex: `/^## (.+)\n\n\`\`\`mermaid$/m`); the heading text, lower-cased and slugified (non-alnum → `-`), must appear in `website/src/css/custom.css` as `h2#<slug>:has(+ p)::after` | KEEP VERBATIM the heading TEXT (renaming it silently breaks a CSS selector with no build error — see trap D) AND KEEP VERBATIM the structural adjacency (heading, blank line, fence — no paragraph may land between them) | the "spine" heading + its mermaid fence |
| mermaid fence content | `website/docusaurus.config.ts:274-280` explicitly forbids adding `classDef` to this fence (2 spare lines "budgeted" and unspent) — not independently gated by a test, but documented as a hard constraint | KEEP THE FACT (no `classDef`) | mermaid fence body |
| README/getting-started three-way pin | Same `` the managed block in `CLAUDE.md` `` string, see above | KEEP VERBATIM | — |

### docs/doctrine.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Currency header | 1.8.0/2026-09-15 | KEEP VERBATIM/FACT | :5 |
| `test/content/invariantsVersion.test.ts:119-141` | `## Amendments` section must exist; must contain a row starting `` | <version> | `` for the CURRENT `invariants_version` in `content/charter/stamity-charter.md` frontmatter (currently `1.0.0`); table must have >2 rows (non-degenerate) | KEEP VERBATIM the table structure and the pipe-leading row format; APPEND-ONLY in content (a version bump anywhere in the charter requires a NEW row here, in the SAME change, per the test's error message) | `## Amendments` section, whichever line it sits on today |
| No bespoke `docsPages.test.ts` case | Per the suite's own header comment (:1233-1240), doctrine.md has "no bespoke case… because its claim cannot be reached [elsewhere]" — it's held only to the bucket-wide contract (currency header, links, leak gate, H1=title) plus the amendments-table pin above | Lower direct-pin density than its neighbours, but the amendments table is still a hard external contract | — |

### docs/migration.md

| Pin | Literal | Class | Line |
|---|---|---|---|
| Frontmatter | `slug: /migration-from-<predecessor>` (assembled from fragments in the test, literal in the file) AND `title: Migrating from <predecessor>` — BOTH pinned by `docsSite.test.ts:101-117` | KEEP VERBATIM — this is the one published URL the predecessor's own sunset material links to; changing the slug breaks an external, uncorrectable promise | docs/migration.md:2-3 |
| No currency-header assertion issue | Same header format (1.8.0/2026-09-15) at line 5, gated by `docsPages.test.ts` like the other guides | KEEP VERBATIM/FACT | :5 |
| **Exempt from H1=title check** | `docsPages.test.ts:564-612` explicitly excludes migration.md from the H1/frontmatter-title equality check (it's off the sidebar) | Not gated the same way — writer has more freedom on H1 wording, but NOT on the frontmatter `title:` (pinned above) | — |
| **Exempt from README map** | `MAPPED_GUIDES` filters migration out; README must NOT link it (`docsPages.test.ts:1286-1289`); `llms.txt` MUST index it (`:1276-1277`) | Reachability inversion — writer must NOT add a README row | — |
| Predecessor name carve-out | Only page (besides its own test/source files) legally allowed to contain the predecessor token; MUST still contain it (`docsPages.test.ts:1243-1266` asserts the token is present, not just permitted) | KEEP THE FACT — page must keep naming the predecessor, in some form | throughout |
| `leak-gate.mjs:454` | `docs/migration.md` is the ONLY entry under `docs/` in `PREDECESSOR_ALLOWLIST` | Hard external constraint — same one, doubly enforced (docsPages.test.ts AND leak-gate.mjs both check this) | scripts/leak-gate.mjs:454 |
| `:1501-1508` | Must contain `INSTALL_COMMAND`; must contain literal `npx <predecessor> clean` | KEEP VERBATIM | throughout |
| `:1510-1527` | Must match `/--purge/` (warn about it) SOMEWHERE, but NO fenced code block may contain `--purge` anywhere | KEEP VERBATIM — hard negative constraint on every ` ``` ` block | fenced blocks |
| `:1546-1587` sectioned pins | `## Path B` section must contain literal `hatch.json`. `## Your last step` section must: contain `npx <predecessor> clean`; contain literal `` without `--purge` ``; contain no occurrence of that clean command followed within 40 chars by `--purge`; contain `.env.mcp`, and its index must be LESS than the clean command's index (backup named BEFORE the uninstall, ordered) | KEEP VERBATIM — heading names `## Path B` and `## Your last step` are structural section anchors; the ORDER of `.env.mcp` vs the clean command inside that section is load-bearing, not just presence | those two sections |

---

## B. Shared artifacts and their single writer

| Artifact | Path | What changes if a page's title / opening sentence / section set changes |
|---|---|---|
| `llms.txt` (generated) + its source | `src/cli/docs/llmsIndex.ts:107-279` (`LLMS_INDEX_SECTIONS`) | Byte-compared against `llms.txt` (`llmsIndex.test.ts:85-89`). A page's **title** field (`:113,120,...`) and **description** field are hand-typed one-liners independent of the page's own text — a rewrite that changes a page's opening claim must update the matching `IndexEntry.description` here, then regenerate with `node scripts/generate-docs.mjs --page llms` (or `--page all`). No test cross-checks the description's *content* against the page body — only presence, path-resolution, and non-emptiness. **Single writer: this file + the generator run.** |
| `website/sidebars.ts` | `website/sidebars.ts:50-81` | Sidebar **labels are hardcoded group headers** (`'Guides'`, `'Start here'`, etc.), not per-page titles — Docusaurus reads the page's own frontmatter `title:` for the label text in the sidebar tree. So a page's title change does NOT require an edit here UNLESS the page's **slug/filename** changes (the `present()` ids are bare filenames, e.g. `'customization'`) or a page moves between the four groups. `docsPages.test.ts:598-611` cross-checks that every `MAPPED_GUIDES` slug is listed here and migration's is not. **Single writer: this file**, but coupled to each page's frontmatter `title:` (see next row). |
| Each guide's own `title:` frontmatter | `docs/*.md` line 2 (line 3 for migration.md, which also carries `slug:`) | `docsPages.test.ts:564-596`: title MUST equal the page's own H1 exactly. **This is the actual single point of truth for the page's displayed name** — sidebar and browser tab both read it. A rewrite changing the H1 must change `title:` in the same edit, and vice versa. |
| `test/docsPages.test.ts` pins | the whole file | This is not itself an "artifact" any writer edits, but it is the **verifier of record** for 12 of the 14 pages (all but GOVERNANCE and, partially, doctrine). No writer should edit this file — a failing assertion here means the page text needs to change, not the test. |
| README map rows | README.md:96-121 | See landing-page and llms.txt rows — README's row text is currently the LONGEST-form summary of the three (map row / llms.txt description / sidebar label / page's-own-opening). The brief's own recommendation (adopted here): **the page's own opening sentence is the source of truth; the README map row and the llms.txt description both derive from it and should be re-checked, not independently rewritten**, on every page rewrite. |
| Landing page | `website/src/pages/index.tsx` | Deliberately carries almost NO page-specific content — no page titles, no page links except `/docs/getting-started` and the GitHub repo URL (lines 187, 196). Title/tagline come from `docusaurus.config.ts:74-76`, not from any hand page. **A rewrite of any of the fourteen pages requires zero changes here**, with one exception: if `docs/getting-started.md`'s ROUTE (not title) ever moved, line 187's `to="/docs/getting-started"` would need updating. |
| `docs/doctrine.md` amendments table | `docs/doctrine.md`, `## Amendments` section | Written FROM `content/charter/stamity-charter.md`'s frontmatter (`invariants_version`, `invariants_ratified`, `invariants_amended`) — see `test/content/invariantsVersion.test.ts:119-141`. **This table is not the doctrine writer's free content**; a version bump anywhere else in the corpus obligates a row here. The doctrine writer should NOT alter existing rows, only append if a version bump happens to land during the rewrite window (unlikely, but the constraint is APPEND-ONLY per the test's own comment at `test/content/invariantsVersion.test.ts:40-41`). |
| `content/charter/stamity-charter.md` touchpoint index | `content/charter/stamity-charter.md:66-80` | This is the **producer**; `docs/working-with-stamity.md`'s touchpoint table is the **mirror** (`docsPages.test.ts:1433-1463`). Neither the working-with-stamity writer nor any charter editor should change one without the other in the same change — but note the charter file itself is NOT one of the fourteen pages up for rewrite (it's corpus source, not a hand doc page), so in this batch it is effectively a **read-only external constraint** the working-with-stamity writer must match, not touch. |

---

## C. Overlap table

| Pair | A's text (path:lines) | B's text (path:lines) | Recommendation |
|---|---|---|---|
| README "Install and first run" vs getting-started.md | README.md:24-46 (install line, prerequisites, network paths, APM route) | docs/getting-started.md — pinned to also carry `INSTALL_COMMAND`, checkbox-menu hints (`docsPages.test.ts:1379-1412`) | **getting-started.md keeps the full walkthrough** (prerequisites, menu mechanics, per-client detail); **README keeps only the one-line install + a link**. README's paragraph at :30-42 is already denser than a "just link it" README should be — this is a candidate to trim toward getting-started during the rewrite, provided the nine-verb/manifest/network-path facts pinned by `docsPages.test.ts` survive somewhere reachable. |
| README "Commands" vs getting-started verb list vs cli-reference.md | README.md:62-66 (nine-verb `·` list) | docs/getting-started.md (same nine verbs, `docsPages.test.ts:1389-1401`) + `docs/cli-reference.md` (generated, not in scope) | **Both README and getting-started are independently pinned hand-copies of the same list from `src/cli.ts`** — this is a known, deliberate duplication (`docsPages.test.ts:693-701` calls it out explicitly as "the SECOND hand-maintained copy"). No single-owner fix is possible within this census (both are separately regex-gated); each writer must independently keep their copy in the declared order. Flag to the operator: this is a standing landmine for future verb additions, not something the rewrite can fix without editing the test. |
| README "How it works" vs doctrine.md vs working-with-stamity.md opening | README.md:48-58 | docs/doctrine.md (root question/four pillars) / docs/working-with-stamity.md opening | No test cross-checks these three narratively — only the `` managed block in `CLAUDE.md` `` phrase is shared verbatim across README, getting-started, and working-with-stamity (`docsPages.test.ts:1414-1424`). **Recommendation: doctrine.md owns the conceptual "why"; working-with-stamity.md owns the "how to use the nine touchpoints"; README's "How it works" stays a compressed pointer to both** — no verbatim overlap to preserve beyond the CLAUDE.md phrase. |
| working-with-stamity.md touchpoint table vs charter's touchpoint index vs `content/commands/*` | docs/working-with-stamity.md table | `content/charter/stamity-charter.md:72-80` | **Charter is the single producer** (per its own doc comment and `docsPages.test.ts:1426-1463`); working-with-stamity.md MIRRORS it exactly, one-liner for one-liner, same order. Writer must diff the charter's current touchpoint bullets against the table before touching either. |
| SECURITY.md controls table vs security-mapping.md rows vs packs-and-trust.md (ladder, signing) | SECURITY.md `## What the engine defends today` (~:67-88) | docs/security-mapping.md `## The surfaces` (7 headings) + docs/packs-and-trust.md (TRUST_TIERS, "not armed" sentence) | **security-mapping.md is the crosswalk owner** (SECURITY.md links to it rather than restating it: SECURITY.md:1006). **packs-and-trust.md owns the trust-ladder and signing-arming state** (the "not armed" sentence is conditionally pinned there, not in SECURITY.md). SECURITY.md's own table is the narrowest and most tightly call-graph-verified of the three — it should stay authoritative for "what runs today," while the other two elaborate/crosswalk. |
| CONTRIBUTING.md regeneration table vs README "Map" paragraph vs enterprise-forks.md | CONTRIBUTING.md `## Regenerating derived files` (:138) | README.md:127-135 ("Eight rows above are marked Generated…") | **CONTRIBUTING owns the regeneration table** (README.md:132 explicitly says so: "CONTRIBUTING.md's regeneration table is the one home for that split"). enterprise-forks.md is said by the brief to cite CONTRIBUTING's table by its re-open trigger — this reference is NOT independently regex-pinned in `docsPages.test.ts`; the enterprise-forks writer should verify the citation still resolves but is not blocked by a hard gate. |
| GOVERNANCE.md landing rules vs CONTRIBUTING's required contexts | GOVERNANCE.md (`all-ci-checks` :41, `all-pr-checks` :56) | CONTRIBUTING.md (`all-ci-checks`/`all-pr-checks`, :51-60) | Both are **independently pinned to the same three literal strings** (`all-pr-checks`, `all-ci-checks`, `pr-checks.yml`) by `test/ci/workflow.test.ts:738-757`. No single owner declared by the test; **recommend GOVERNANCE own the authoritative statement of "what gates a merge," CONTRIBUTING link/restate briefly** — but both writers must independently keep the three literal strings, since the gate checks both files separately. |
| doctrine.md "Current" pillar vs the hand-bucket definition in `docsPages.test.ts` | docs/doctrine.md (pillar prose, not located by line in this pass) | `test/docsPages.test.ts:1-71` (the file's own header comment defines what makes a page "hand-written": currency header + re-open trigger +, for SECURITY, the two-half symbol check) | Not literal-string pinned — the doctrine writer should ensure the page's description of "why pages are hand-verified" doesn't drift from the test file's own stated rationale, but no regex enforces this; it's a narrative-consistency risk only, flagged for reviewer attention rather than blocked. |

---

## D. Traps (things a writer would not expect)

1. **README and docs/working-with-stamity.md have exactly zero line-budget headroom today** (157/157 and 150/150). Any added sentence forces a removal elsewhere in the SAME change, or the gate at `docsPages.test.ts:690` / `:1466` fails. The test file's own comments (:180-201) document the last three times this budget moved and exactly what paid for it — a precedent worth reading before asking for more lines.

2. **`docs/working-with-stamity.md`'s "spine" heading is load-bearing for a CSS selector nothing else in the tree references.** Renaming the `## <Heading>` immediately above the mermaid fence, or inserting a paragraph between the heading and the fence, produces **no test failure and no build error** — it silently reverts a Cumulative-Layout-Shift fix (measured 0.26–0.57 CLS) or creates a permanent ~767px empty gap. (`docsPages.test.ts:1469-1499`, selector lives in `website/src/css/custom.css`.) This is the single most dangerous silent trap in the whole batch.

3. **`SECURITY.md` has two ultra-tight proximity regexes**: `/org trust policy[\s\S]{0,80}narrows them/i` (80-char window) and `/MCP server definition[\s\S]{0,20}likewise becomes a launcher/i` (20-char window). A rewrite that reorders or expands the sentence between those two phrases — even preserving both phrases — can push them more than 80/20 characters apart and fail silently-looking-fine prose.

4. **SECURITY.md's `file::symbol` addresses are parsed by regex over ALL backticked spans starting with `src/`, with a hard ban on any span ending `:\d+`.** A writer who "helpfully" adds a line-number citation for precision (`src/tools/allowlist.ts:42`) fails the gate (`docsPages.test.ts:893-897`). The gate also requires the symbol be *declared* (not merely mentioned) in the file, and for the control table specifically, requires something under `src/` to *reference* it outside its own declaration — an address that's accurate but for a function nothing calls must be moved below `## What it does not defend` or the claim of "enforced" removed.

5. **`docs/customization.md`'s two tables are parsed by exact row format**, `` | klass | limit | `` for one table and a specific `.stamity/overrides/<dir>/<tail>` string for the other (`docsPages.test.ts:1298-1311`) — reformatting the table (e.g., adding a description column, reordering columns) breaks extraction even if all the facts are still present.

6. **`docs/migration.md`'s `.env.mcp` backup mention must appear textually BEFORE the `npx <predecessor> clean` mention inside the `## Your last step` section** — this is an ORDER constraint, not a presence constraint (`docsPages.test.ts:1581-1586`). A rewrite that reflows the paragraph and happens to mention the clean command first (e.g., in a summary sentence) before circling back to "but first, back up `.env.mcp`" fails even though both facts are present.

7. **The migration guide's fenced code blocks are individually scanned for `--purge`** — the warning prose may mention the flag freely, but if ANY ` ``` ` block anywhere on the page contains the substring `--purge`, the gate fails, even inside a comment or an "avoid this" example block (`docsPages.test.ts:1522-1526`).

8. **`docs/migration.md`'s frontmatter `title:` is exempt from the H1-equality check** that every other guide is held to — but its `slug:` and `title:` are BOTH pinned verbatim by a *different* test (`test/ci/docsSite.test.ts:101-117`), assembled from string fragments to dodge the leak-gate's own scan of that test file. A writer who "fixes" the H1 to read more naturally and assumes the frontmatter title should match it (as on every other guide) will silently desync from what every other guide's pattern taught them.

9. **The `<!-- HAND-WRITTEN PAGE` currency-header comment must fall within the first six lines *after frontmatter is stripped*** (`docsPages.test.ts:527-536`, `afterFrontmatter()` at :364-377). For root pages (README, SECURITY, CONTRIBUTING — no frontmatter) that's lines 1-6 absolute. For the ten guides (2-4 lines of `---\ntitle: …\n---\n` frontmatter), the header can legally sit at line 5 or 6 file-absolute, but must be within 6 lines of the FIRST NON-FRONTMATTER LINE. Migration.md, with 3 frontmatter lines (`slug` + `title`), has one line less headroom before line 6 than its neighbors.

10. **README's `## Commands` verb-list assertion changed from nine independent `toContain` checks to one exact-array equality including ORDER** (`docsPages.test.ts:715-727`, flagged "TEST CHANGE, justified"). A rewrite that lists the verbs in a different but still-complete order (e.g., alphabetized) fails, even though every individual verb is present.

11. **`docs/doctrine.md`'s amendments table is APPEND-ONLY and externally driven** — a rewrite that "cleans up" an old row's wording, even to fix a typo, breaks `test/content/invariantsVersion.test.ts`'s expectation that the ROW CONTENT for the CURRENT version hashes-match nothing there (the table isn't hashed, but the *charter's* invariants block is — see next trap) — actually the safer statement: the doctrine writer should treat every row before the current version as **frozen historical record**, not editable prose.

12. **The charter's `## Invariants` section is content-hashed** (`test/content/invariantsVersion.test.ts:43-45`, one SHA-256 pin per `invariants_version`) — this is NOT one of the fourteen pages, but doctrine.md's amendments table is graded against it, so a doctrine rewrite that reformats the amendments table in a way that breaks the `\| <version> \|`-prefix row match (e.g., switching to a different table library's row syntax) fails independent of the hash itself.

13. **GOVERNANCE.md is the one "hand-written-looking" page with NO `docsPages.test.ts` coverage at all** for currency header, line budget, or leak-adjacent checks — it is covered only by the narrower `test/ci/workflow.test.ts` string checks and by README's link-existence check. A writer might assume GOVERNANCE is held to the same rigor as the fourteen pages in the bucket; it is not, which means fewer automated catches for that page specifically (more reviewer burden, not less risk).

14. **Sidebar labels are group-level, not per-page** — `website/sidebars.ts:50-81` groups are `'Start here'`, `'Reference'`, `'Content corpus'`, `'Guides'`, static strings unrelated to any single page's title. A writer expecting to find "their" page's display name in `sidebars.ts` and edit it there will find nothing to edit — the actual display name is the page's own `title:` frontmatter (trap: two writers changing sibling pages' titles never touch this shared file, so no merge collision here despite it looking like a shared resource).

15. **Mermaid fence in working-with-stamity.md may not gain a `classDef`** — not gated by a test, but explicitly reserved-against in `website/docusaurus.config.ts:274-280` ("those two lines stay unspent"). No CI catches a violation; it's a silent visual regression (the decision diamond rendering indistinguishable from rectangles) that only a rendered-diff check (outside this census's scope) would show.

---

## Unanswerable / not fully verified within this pass

- **Exact line-by-line content of `docs/enterprise-forks.md`'s CONTRIBUTING-table citation** ("cites CONTRIBUTING's regeneration table by its re-open trigger," per the brief) was not located with a specific line number — grepped for cross-reference but not confirmed against the live file body (I read the test pins for this page, not its full prose). **Probe:** `Read docs/enterprise-forks.md` in full and grep for `CONTRIBUTING` or `re-open`. Smallest unblocking input: one targeted read of that file (~300 lines), not attempted here to preserve budget for full test-suite coverage, which the brief weighted more heavily ("Read these in full").
- **Exact current text of `docs/doctrine.md`'s "Current" pillar paragraph** vs the hand-bucket definition prose in `docsPages.test.ts`'s header comment — confirmed the test file's rationale (lines 1-71) but did not read doctrine.md's body to compare wording. Basis: `unverified` for narrative consistency between the two; the structural pins (amendments table, currency header) are `direct`.
- **`docs/getting-started.md`, `docs/customization.md`, `docs/troubleshooting.md`, `docs/workspaces.md`, `docs/enterprise-forks.md`, `docs/packs-and-trust.md`, `docs/security-mapping.md`, `docs/doctrine.md`, `docs/migration.md` full bodies were NOT read line-by-line** in this pass — all pins for them come from the test file's assertions (which quote or closely paraphrase the exact strings required) plus header/frontmatter greps. Confidence on their PIN INVENTORY is **direct** (read from the test source itself, which is authoritative for what's checked). Confidence on **"the line on the page today"** for pins not covered by my header/title greps is **inferred** (I located section headings and constant literals via the test file and know they must exist somewhere in the page, but did not locate every exact line number for content deep inside the nine unread guide bodies). A writer opening their assigned page should treat this census's page-side line numbers as approximate for anything beyond frontmatter/header/H1, and exact for everything sourced from `docsPages.test.ts` grep hits shown above.

**All claims above carry `path:line` from the sources read.** No file was edited during this census.