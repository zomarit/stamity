# Style contract — Package 14 docs rewrite

Researched 2026-09-16 by the block-1 researcher (primary sources read that day; the sources section says which claims are direct and which are the contract's own numbers). The predecessor project's name is respelled `<predecessor>` here because this file lives under `.stamity/`, which the leak gate scans. Decision 6 of the kickoff approves or amends this page.

# Part C — the style contract (paste-ready, ~100 lines)

## Style contract: stamity docs rewrite
*Basis for every writer. Read once before touching a page. 1.8.0 corpus, 2026-09-16.*

### 1. Who the pages are for
**The operator** — a developer who runs `npx @zomarit/stamity init` in their own repository and wants a working setup and one proven change, fast; task pages owe them a command, its output, and nothing they didn't ask for.
**The reviewer** — a contributor or security reviewer reading GOVERNANCE, SECURITY, CONTRIBUTING or security-mapping to decide whether to trust or contribute to the project; explanation and reference pages owe them precision and citations, never persuasion.

### 2. Page kinds and their order
README — mixed: tutorial (Install and first run) + reference (Map) + explanation (How it works). Split stays; trim per §3/§6.
getting-started.md — tutorial. working-with-stamity.md — explanation (page-map) + how-to (walkthrough), split by section. customization.md — how-to + reference, split by section. troubleshooting.md — reference (rows) + how-to (remedies). workspaces.md — explanation + reference, split by section. migration.md — how-to. security-mapping.md — reference. packs-and-trust.md — how-to + reference, split by section. enterprise-forks.md — how-to, badly overloaded with explanation; sections should separate "do this" from "why this exists." doctrine.md — explanation. SECURITY.md — reference (control table) + explanation (what it doesn't defend). CONTRIBUTING.md — how-to (the loop) + reference (gate table), split by section. GOVERNANCE.md — explanation.
Sidebar groups, slugs and URLs stay as they are (session amendment: the researcher's draft moved pages across groups and listed root pages the sidebar does not carry). Within the Guides group the order becomes daily-use first: customization, troubleshooting, workspaces, packs-and-trust, enterprise-forks, security-mapping. Start here stays getting-started, working-with-stamity, doctrine. The README map lists the guides in the same order.

### 3. What every page starts with
Sentence 1: what the page is for, and who reads it. Sentence 2: what the reader has at the end (how-to) or the question it answers (explanation). Then, on a task page, the first command and its output — before any qualification. No history, no defence, no test-suite name, before that first task.

### 4. Voice
Second person, present tense, active. "You" for the reader, "stamity" (lowercase, always — CONTRIBUTING.md:176) for the product, "the maintainer" not "we" (this is a one-person project — GOVERNANCE.md:17). No marketing adjectives, no hedges ("largely," "roughly" only with a measured number attached).
Before: "Init reads the repository, decides what it can, asks what it cannot, and writes the setup plus a manifest every later command works from." (getting-started.md:47-48)
After: "Init reads your repository. It writes a setup and a manifest. Later commands read that manifest."

### 5. Sentences and paragraphs
One idea per sentence, average under 20 words, hard ceiling 30. One point per paragraph, 3-5 sentences. Rewrite every parenthetical and em-dash aside as its own sentence. Use a list for 3+ parallel items. Use a table only when every row shares the same columns.
Before (SECURITY.md:74-76, one cell): "A pin is only as good as the catalog that issued it, and nothing here attests the catalog." — fine. Contrast the row above it in the same table, one sentence spanning the whole gate chain with three parenthetical asides — split into three sentences.

### 6. Examples before explanation
A task page shows the command and its real output first, explains after. An explanation page opens with the concrete case, not the abstraction. Every code block is runnable as printed, or states exactly what to replace (`<name>`, `<tag>`).

### 7. One task per page, one question per page
Do not split pages in this rewrite. An overlong page becomes sections that are each one task, with its own heading naming that task, so a reader jumps straight to it without reading the page in order.

### 8. Terms and their one spelling
| Term | Meaning | Use | Retire |
|---|---|---|---|
| stamity | the product | lowercase always | Stamity mid-sentence |
| touchpoint | one of the nine `/st-` slash commands an agent runs | "touchpoint"; "slash command" when the invocation form matters; the charter's own line "Nine commands cover the SDLC" is canonical and may be quoted | bare "command" with no qualifier |
| verb | one of the nine CLI verbs (`init`, `sync`, `check`, `validate`, `add`, `config`, `workspace`, `worktree`, `clean`) plus the two plumbing verbs `learn` and `handoff` | "verb" (as getting-started.md:164 already does); README's pinned heading `## Commands` stays and its body says "nine verbs" | "command" for CLI verbs |
| corpus | `content/` + `packs/` source | "corpus" | "content" alone |
| gate | a pass/fail check | name which one: "verification gate," "save gate," "leak gate" | bare "gate" with no qualifier |
| override / overlay | full replacement / patch in `.stamity/overrides/` | as defined in customization.md | interchanging the two |
| fork layer | `fork/` inside a forked package | "fork layer" | "fork" alone for the directory |
| hand page / generated page | authored vs. rendered docs | as doctrine.md uses | "static page" |
| the predecessor project | <predecessor> | name only on migration.md | elsewhere, "the predecessor project" |
Inconsistency found: README.md:60 heading "Commands" names the nine verbs; getting-started.md:164 calls the same set "The nine verbs." Standardize on "verb."

### 9. Links and code
Repo-relative links only. Link text is the page title or the thing named — never "here." One absolute-URL family allowed: `https://github.com/zomarit/stamity/...`. Inline code for every path, flag, command, file. No bare domains, no email addresses.

### 10. What must not change
The currency header and re-open-trigger comments at the top of each page (`test/docsPages.test.ts` asserts them); `title:` frontmatter equal to the H1; migration.md's slug (`/docs/migration-from-<predecessor>`) and title; every CLI verb and flag as `docs/cli-reference.md` spells it; README's `npx @zomarit/stamity init` install line; corpus counts (`test/docsPages.test.ts`); SECURITY's `file::symbol` addresses; security-mapping's surface count and catalogue pins; doctrine's bound quantities and its deferral paragraph.

### 11. Writer's checklist
1. Does sentence 1 name the page's purpose and reader?
2. Does sentence 2 name the outcome or the question?
3. Is a runnable command shown before any explanation?
4. Is every sentence under 30 words?
5. Is every parenthetical rewritten as a sentence?
6. Does every heading name a task or a question, not a label?
7. Is every "gate," "command," "corpus" term disambiguated per §8?
8. Is every link repo-relative with real link text?
9. Are the currency header and re-open trigger still intact and accurate?
10. Would an operator or a reviewer — the one this page is for — finish it with the thing they came for?

### 12. Sources
See Part A below for the full citation list with URLs, access dates and supporting sentences.

---

# Part B — repository evidence

## Top six readability defects

| # | Defect | Evidence (path:line) |
|---|---|---|
| 1 | Sentences over 40 words | README.md:30-33 ("`init` reads the repository, asks what it cannot infer, and writes the setup plus a manifest that `sync`, `check`, `config`, `workspace`, `clean` and `add` work from…" — one sentence, ~60 words); SECURITY.md:80 (the "Any text author / prompt injection" row is a single ~120-word sentence); docs/enterprise-forks.md:16-20 (opening paragraph is one ~90-word sentence) |
| 2 | Implementation-history narration on user pages | CONTRIBUTING.md:72-76 ("It used to sit below the DEV TOOLCHAIN floor… and the raise past both closed that gap"); docs/customization.md:93-96 ("before it was single-sourced, the save path and `validate` ran overlapping-but-different checks, and an artifact could land through one surface and be reported by the other") |
| 3 | Defensive asides / parentheticals | docs/packs-and-trust.md:61-65 (nested parenthetical inside the "catalog-pinned" tier explanation); docs/getting-started.md:14-18 (six-clause parenthetical describing the fifteen-minute walkthrough); SECURITY.md:149-156 ("Publishing this package" paragraph, three nested asides) |
| 4 | Test-suite / engineering-record talk on user pages | docs/getting-started.md:20-24 (CI lane names — `tarball-smoke`, `apm-install` — on the page a first-time operator reads); GOVERNANCE.md:86-88 (`test/content/invariantsVersion.test.ts` named on the general governance page) |
| 5 | Nested subordinate clauses | docs/customization.md:20-26 (single sentence: "content/ is framework territory — shipped and regenerated, so an edit there is erased by the next update — which is why neither shape of customization touches a bundled file"); docs/enterprise-forks.md throughout, e.g. lines 636-644 (`prepare`/`publish` job description) |
| 6 | Headings that are labels, not tasks | working-with-stamity.md:14 "The nine"; working-with-stamity.md:32 "The spine"; docs/packs-and-trust.md:50 "The trust ladder"; SECURITY.md:233 "Known gaps"; CONTRIBUTING.md:160 "The leak gate" |

## What a page starts with vs. what it should start with

| Page | Starts with today (path:line) | Should start with |
|---|---|---|
| README.md | banner image + HTML comments, then one two-sentence intro (README.md:1-22) | keep banner (§10 constraint), but the two-sentence intro is already close — trim the compound clause listing all four clients into a follow-on sentence |
| getting-started.md | "From nothing to one proven change" then a long CI-proof sentence (getting-started.md:14-24) | purpose + outcome sentence, then straight to "Before you start" — CI-lane detail moves to CONTRIBUTING.md |
| CONTRIBUTING.md | "Pull requests are welcome" then governance detail on 0-required-approvals (CONTRIBUTING.md:14-23) before "The loop" (line 31) | purpose sentence, then the loop's two commands immediately — governance rationale moves after |
| customization.md | topic sentence (customization.md:15-17), then three paragraphs of override-vs-corpus philosophy before the "Where an override lives" table (line 50) | purpose + outcome, then the table, philosophy after |
| docs/enterprise-forks.md | one 90-word explanatory sentence about what git doesn't give you (enterprise-forks.md:16-20) | purpose + outcome ("what you'll have after this page"), then the first command block |

---

# Part A — primary source notes

1. **Diátaxis** (diataxis.fr, accessed 2026-09-16). The compass page states the four kinds arrayed on two axes — "acquisition of skill" vs. "application of skill," "informs action" vs. "informs cognition" — mapping tutorial (action+acquisition), how-to (action+application), reference (cognition+application), explanation (cognition+acquisition). *Basis: direct* (fetched page text), but the exact sentence forbidding mixing kinds on one page was not located in the fetched excerpt — *unverified* for that specific claim; used as the standard basis for §2/§7 regardless, since the four-kind taxonomy itself is directly confirmed.

2. **Google developer documentation style guide** (developers.google.com/style, accessed 2026-09-16). "Use active voice (in which the grammatical subject of the sentence is the person or thing performing the action)"; "Make clear who's performing the action"; "Put code-related text in code font." Supports §4 (active voice), §9 (code formatting). *Basis: direct.*

3. **Microsoft Writing Style Guide, top-10-tips** (learn.microsoft.com/style-guide, accessed 2026-09-16). "Get to the point fast. Lead with what's most important. Front-load keywords for scanning." "Write like you speak. Read your text aloud." Supports §3 (front-loading) and §4 (voice). *Basis: direct.*

4. **plainlanguage.gov / digital.gov guides** (accessed 2026-09-16, redirected to digital.gov/guides/plain-language). "Plain language — content that is clear and easy to understand — is critical to helping the public make sense of their obligations and benefits." The detailed short-sentence/one-idea guidance lives one level deeper and was not retrieved directly. *Basis: unverified* for the specific sentence-length and heading-as-question rules; §5's numeric ceilings (20/30 words) are drawn from general plain-language practice rather than a quoted federal sentence, and are stated here as this contract's own number, not a cited one.

5. **GOV.UK content design guidance** (gov.uk/guidance/content-design, accessed 2026-09-16). The specific "Writing for GOV.UK" URL returned 404 after redirect; not retrieved. *Basis: unverified* — no direct claim taken from this source; §1 and §3's "start with the user need" framing is drawn from general familiarity with GOV.UK doctrine, not a quoted sentence, and should be treated as unverified until re-fetched.

6. **Write the Docs guide** (writethedocs.org/guide, accessed 2026-09-16). "Documentation is 'a part of the product.'" Supports the general posture behind §1 and §6. *Basis: direct* for the quoted phrase; the README-specific guidance was not present in the fetched page — *unverified* for that part.

7. **The Good Docs Project templates** (thegooddocsproject.dev/template, accessed 2026-09-16). How-to: "A how-to is a concise set of numbered steps to do one task with the product." README: "README files include information users need to know about your project, including how users can engage with the project and get started." Supports §3 and §7 (one task per page). *Basis: direct.*

8. **The Art of README** (github.com/hackergrrl/art-of-readme, accessed 2026-09-16): fetch returned 404, not retrieved. *Basis: unverified* — §3's README-specific opening rule relies instead on The Good Docs Project's README template (source 7) and direct inspection of stamity's own README.

9. **Exemplar docs sets** — Django (docs.djangoproject.com, accessed 2026-09-16): "Everything you need to know about Django," followed by Tutorials → Topic guides → Reference guides → How-to guides, in that stated order, each with its own one-sentence definition. Supports §2's ordering rationale. *Basis: direct.* Stripe (docs.stripe.com, accessed 2026-09-16): opens with a one-line orientation followed immediately by task-shaped entry points ("Accept online payments," "Sell subscriptions") before any product reference list. Supports §3 and §6 (task before explanation). *Basis: direct*, though the fetched page rendered in German by locale; English wording not independently confirmed — treat the exact English opening sentence as *unverified*, the structural ordering as *direct*.

10. **Google Software Engineering book, ch.10** (abseil.io/resources/swe-book, accessed 2026-09-16). "Write to your audience, in the voice and style that they expect." "Documents without owners become stale and difficult to maintain." Supports §1 (know your audience) and §10 (ownership/currency, already enforced in this repo via the currency-header convention). *Basis: direct.*

**Repository sources** (all accessed 2026-09-16, at the 1.8.0 release cut): README.md, SECURITY.md, CONTRIBUTING.md, GOVERNANCE.md, docs/getting-started.md, docs/working-with-stamity.md, docs/customization.md, docs/troubleshooting.md, docs/workspaces.md, docs/migration.md, docs/security-mapping.md, docs/packs-and-trust.md, docs/enterprise-forks.md, docs/doctrine.md, content/charter/stamity-charter.md, docs/cli-reference.md (header only, lines 1-80). *Basis: direct* for every path:line claim above.

**Unanswerable / not probed**: docs/measurements.md, docs/configuration.md, docs/reference/, CODE_OF_CONDUCT.md, and the full docs/cli-reference.md body were not read — brief scoped Part B to the fourteen named hand pages plus README and charter, and cli-reference.md's canonical verb/flag names, per the brief; measurements.md and configuration.md are generated pages outside the fourteen. The smallest input to close this: a follow-up read of those four files if the glossary needs their vocabulary too.