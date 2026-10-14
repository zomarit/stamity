# Editor notes — the fourteen writers' cross-page findings (Package 14)

## docs/workspaces.md (267be3f → 46c30fe) 229→347 lines
- Opening: "This page is for you if you run stamity in more than one repository and want one policy for all of them. It answers what a workspace is, how to create one, and what reaches each repository when you push that policy down."
- Index description at src/cli/docs/llmsIndex.ts:186-190 still accurate; re-check the README map row against the new opening.
- Five claims corrected (lockedContent semantics; status rows print declared group names; absent vs empty defaults.tools; `validate` reads workspace.json — the one workspace-aware ordinary verb; --json sync document has root and dryRun).

## docs/doctrine.md (9d75304 → fe13810) 171→205 lines
- Opening: "This page is the reasoning behind everything stamity ships, for the operator or reviewer deciding whether one more rule, skill, command or page is worth its cost. It answers one question: why does this tool ship what it ships, and how does something get removed again?"
- Index description at llmsIndex.ts:165-169 still true. Three corrections (run 30; the always-on split: three of four clients pay the charter alone, codex the charter plus unconditional rules; the "eight rules dropped" claim removed — 0 dropped today). Doctrine now defers every always-on figure to the capability matrix's "## Always-on cost by client" heading and the `stamity config set ruleDelivery always-on` spelling.

## GOVERNANCE.md (198d86d → c840823) 121→182 lines
- Opening: "This page is for a contributor or a reviewer who wants to know who runs stamity and how a change gets in. It answers four questions: who decides, the two required checks a change passes to land, what the private layer holds, and what happens if the maintainer stops."
- OVERLAP: docs/security-mapping.md:28-31 quotes GOVERNANCE's Article 50 clause verbatim ("because it is not an AI system placed on the market: it generates configuration text for AI coding clients and runs no model of its own") — preserved byte-for-byte in GOVERNANCE; check the security-mapping rewrite kept it or re-quoted the new wording.
- Index description at llmsIndex.ts:132-137 still true; the opener adds a fourth question (continuity) the editor may reflect. Heading "## Invariants versioning" kept as a prefix because test/content/invariantsVersion.test.ts:115 names that section. Four corrections (all-ci-checks also needs the apm-install lane; leak gate's three rule families; the hygiene scan on the LTS leg; a release dispatch defaults to a dry run).

## docs/migration.md (ab2d156 → cherry-picked) 282→377 lines — keeps the release-cut stamp
- Opening: "This page is for you if <predecessor> set up your repository and you want to move it to stamity. By the end, stamity is running, your learnings and MCP credentials have come across, and you have removed <predecessor> yourself."
- Stays off the README map, stays in llms.txt; derive the index description from the two sentences (the index may not name the predecessor — llmsIndex.ts is not on the leak-gate allowlist; keep "the predecessor setup").
- Dropped: the meta paragraph on why the file is docs/migration.md while the route carries the predecessor's name (contributor fact; CONTRIBUTING's leak-gate note is the only possible home, phrased as "the predecessor project").
- Five corrections (gitignore only if not already covered; README.md and INDEX.md excluded as generated files; the reinit offer stated conditionally; "six surfaces" dropped; the full `migrate: skip` line with `stamity init --force --migrate full`).

## docs/security-mapping.md (b7110cb → cherry-picked) 205→276 lines
- Opening: "This page maps the controls stamity runs to the OWASP agentic, LLM and web lists, the NSA/CISA and partner joint guidance, and the NIST AI RMF. A security reviewer reads it to learn which catalogue item each control answers, what that control still leaves open, and which items nothing here answers at all."
- FOR SECURITY.md: SECURITY.md:215-216 says the mapping crosswalks "four external catalogues" then lists five families — reconcile (the mapping page now names them without a count).
- Index description and README map row ("seven surfaces, their residuals, and the gaps") still true.
- The id-collision note exists on both SECURITY.md:225-229 and the mapping page (short form there).

## docs/getting-started.md (3cb79bb → cherry-picked) 272→333 lines
- Opening: "This page walks you through setting stamity up in your own repository for the first time. At the end you have a working setup on disk, a manifest you can commit, and one real change proved by a passing verification gate."
- Moved out: the CI lane names (tarball-smoke, apm-install) → CONTRIBUTING; the page points at measurements.md's first-run proof.
- Seven corrections (no config key for the update notice — three env vars; `.codex/config.toml` in the MCP documents; `.stamity/evidence/` row; the two conditional init prompts; `ctrl-c cancels`; `--force` and `--tools <csv>`).
- README CONTRADICTION (README writer told directly): README says "Copilot takes no hook configuration" — false at 1.8.0; the adapter emits `.github/hooks/stamity.json` (src/adapters/copilot.ts:73, capability matrix).
- Writer-trailer note: pages were written at claude-opus-5; the commit trailer names the orchestrating model — record it at the close.

## docs/customization.md (605c20c → cherry-picked) 293→370 lines
- Opening: "This page shows you how to make stamity's agents, rules, commands and skills say what your repository needs, without editing a file stamity ships. By the end you can replace a shipped artifact with your own, patch one without copying it, check both with `stamity validate`, and remove either again."
- Index description / README row still true; the page now has patching, removal and the fork layer as task sections — the one-liners could pick them up.
- Seven corrections (three save-path-only checks; any scope outside conditional/agent-requested refused; delivery recomputed from the override's frontmatter; revalidated 2026-09-10; `agents/openai.yaml` claim removed; redaction mechanism; `key: null` removal).
- CARRIED (content/ is out of scope this package): `content/agents/stamity-creator.md` says a skill override "is projected under the directory name it was saved as"; the code projects under the REPLACED skill's directory and spec name (`src/emit/skillsProjection.ts:249-270`). Corpus text is stale → next case pass (moves a measured input).

## docs/troubleshooting.md (2a91f23 → cherry-picked) 161→226 lines
- Opening: "Read this page when a stamity run fails, or when `check` prints a row you do not recognise. You leave with the meaning of that row or that error code, the command that fixes it, and the place to report what nothing here fixes."
- Moved out: the nine-row error-code table → lives only in docs/cli-reference.md (generated); its CLEAN_ERROR row was wrong — being fixed in the generator template (src/cli/docs/cliReference.ts:120) by a separate unit.
- llms.txt description says "every doctor row"; page and README row now say "`check` row" — align the index entry.
- Four corrections; three additions (INTEGRITY_ERROR on drift-only in --json; the `collision` entry; the three Codex hook steps from the learning).

## docs/working-with-stamity.md (a77f8ca → cherry-picked) 150→150 lines (zero headroom) + website/src/css/custom.css
- Opening: "This page is for you once stamity is installed and you have real work to do. It answers three questions: which of the nine touchpoints to open, what that one may do, and what is on disk when it stops."
- Spine heading renamed `## The spine` → `## How the nine fit together`; CSS selector moved in the same commit (`h2#how-the-nine-fit-together:has(+ p)::after`). Mermaid fence byte-identical.
- Index description and README row read "which one to open, what each writes, and how to run two changes at once" — re-derive from the opening ("what that one may do, and what is on disk when it stops").
- BATCH PIN: only docs/migration.md now holds the release-cut date; RELEASE_CUT_DATE assertion depends on it. Do not move migration's stamp.
- Three corrections (st-quick's five refusal rows named as the table spells them; the refusal names the row and value; worktree list's ahead/behind relative to upstream).

## CONTRIBUTING.md (b96bead → cherry-picked) 232→293 lines
- Opening: "This page is for a contributor making a change to stamity. When you finish it you can run the gate CI runs, regenerate the files you must not hand-edit, and open a pull request the two required checks accept."
- Took in the CI lane names from getting-started (`## What CI proves`). Dropped its internal `#commits` anchor (nothing links to it).
- Six corrections (docs/plans, docs/specs paths; typecheck covers root configs; all-ci-checks needs apm-install; --check on all three manifest generators; the hygiene step named; evals/ row).
- Re-derive the index description and README row from the opening.

## docs/packs-and-trust.md (f7fd70d → cherry-picked) 348→423 lines
- Opening: "A pack is content you install on top of the corpus, and this page is for the operator installing one and the author publishing one. By the end you can install a pack, read the trust tier it resolved to, sign a pack of your own, set an org policy, and remove a pack again."
- Armed case holds (src/pack/trust.ts:185 declares armedSigstoreVerifier); the page says "The check is armed."
- Four corrections (live-signing proof closed per SECURITY.md:260; signer grammar = issuer URL + email/URI; 5 MiB + 500-file footprint; lowercase stamity). Five facts added from live runs (source kind is the resolver's — local-path installs of a catalog pack are judged catalog-pinned at policy time).
- Re-derive the index description ("how to remove one") and README row ("what `add` refuses") from the opening; both still true.

## SECURITY.md (1503814 → cherry-picked) 271→284 lines
- Opening: "This page is for a security reviewer deciding whether to trust stamity, and for anyone who found a vulnerability in it. It states what the engine defends today, what it does not defend, and where to send a report."
- "four external catalogues" dropped here; the mapping page's rewrite also dropped it — verify no page still says "four" (grep).
- Headings renamed: `## Reporting` → `## How to report a vulnerability`; `## Known gaps` → `## What is still open` (no anchor links to either, checked repo-wide).
- Pack-signing row states the rehearsal artifacts are archived under `.stamity/runs/2026-09-14_package-11/evidence/`.
- Two corrections (the count; the outside-repository paths as a list with the workspace cascade separate).

## README.md (f124a46 → cherry-picked) 157→157 lines (zero headroom)
- Opening: "stamity, by zomarit, is an ESM-only TypeScript CLI that generates agentic coding setups from one canonical source, for Claude Code, Cursor, GitHub Copilot and Codex. Run one command and you get a charter, commands, agents, skills, rules, hooks and MCP wiring, shaped for the client that reads it."
- Proof section added (merge-ready 5 of 7 / 0.714; run 30's four figures; 590 downloads the week ending 2026-09-11, labelled a proxy; real use unmeasured, no telemetry).
- Copilot hook claim corrected: "Hook wiring reaches all four clients. A command surface reaches three of them: Codex has no repository-level command home…".
- Moved out to getting-started: prerequisites, init's questions, the APM route (`apm install zomarit/stamity --target claude`, 0.29.1 floor now only at docs/getting-started.md:86,95); generators table → CONTRIBUTING.
- Map guide rows reordered (getting-started, working-with-stamity, doctrine, customization, troubleshooting, workspaces, packs-and-trust, enterprise-forks, security-mapping) — reconcile each one-liner with the guide's opening; the sidebar order must match (editor task 4).
- Headings renamed: `## Map` → `## Where everything lives`, `## Tests` → `## What the tests cover`, `## Dogfooding` → `## Why stamity runs on itself` (in-page anchor moved).
- FOR SECURITY.md: its hook-caveat sentence names `.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json` and omits Copilot's `.github/hooks/stamity.json` (src/adapters/copilot.ts:73). The three literals are pinned by presence (test/docsPages.test.ts:978-987), so ADDING the fourth path does not break the pin — but keep `An MCP server definition likewise becomes a launcher` on one line (20-char proximity regex) and change nothing else in that sentence.

## docs/enterprise-forks.md (49c2a01 → cherry-picked) 781→873 lines
- Opening: "This page is for the engineer who keeps a fork of stamity and has to take the next upstream release without losing the fork's own changes. When you finish it you can configure the upstream lane, run it, act on what it reports, land the result, and move your customizations into a layer upstream never writes."
- Index description at llmsIndex.ts:193-197 is stale in one place: the page's tasks now include the fork layer — name it.
- Nine corrections (config path `.stamity/upstream.json`; `--no-gates`; exit-2 rows `not-a-fork`/`error`; the trust notice; `clean --pack <id>`; `dry_run` publishes nothing; the lane-spec link made repo-relative; lowercase stamity; one spelling each).
- Dead self-anchor `#authoring-in-the-fork-layer` removed with its paragraph.

## Whole-set notes for the editor
- Every page but migration carries the commit-form stamp; migration alone holds the release-cut date the suite needs — leave it.
- The nine-verb list is hand-pinned on both README and getting-started; both are in src/cli.ts order.
- Pages were written at claude-opus-5; the commit trailers name the orchestrating model. Not the editor's to change.
- content/agents/stamity-creator.md's stale sentence (skill override projection dir) is carried to the next case pass — NOT edited in this package.
