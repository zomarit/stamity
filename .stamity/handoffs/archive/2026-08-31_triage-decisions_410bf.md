---
id: 2026-08-31_triage-decisions_410bf
status: archived
created: 2026-08-31T10:02:28Z
expires: 2026-09-30T10:02:28Z
summary: All 20 triage decisions executed 2026-08-31 to 09-01 (Batches A-E, 11 commits, suite 5707 to 6162 green). Residuals operator-only: decision 16 arming (checklist ready), decision 18 (deferred).
fromTool: claude
gitRef: public-main@0982f6c
integrity: sha256:dcb86636b90a1353cd83e386c953d03f7efa775cb513023239df523b8becae1d
---

## Problem

A read-only audit session (2026-08-31) researched the repo across site, docs, CLI, engine, and
project posture, surfaced ~20 findings, and the operator triaged every one via the question
protocol. Execution was deliberately deferred to a fresh session; this handoff is the locked
decision record plus execution brief. No product file was changed in the deciding session.

## Decisions

Website / brand:
1. Sidebar slug labels — fix via docs generator + frontmatter titles (not sidebars.ts labels):
   fixes every consumer of docs/. Root cause: leading HTML comment before each H1 defeats
   Docusaurus title extraction; no frontmatter titles exist. 11 pages affected. Evidence:
   website/sidebars.ts:50-73; docs/getting-started.md:1-7. Generated pages fix goes through
   the generator, never hand-edits.
2. Favicon light/dark — embed a prefers-color-scheme media query inside favicon.svg, dark
   palette from existing mark-dark.svg. Safari caveat accepted. Evidence:
   website/docusaurus.config.ts:47; website/static/img/.
3. Landing install command copy button — route the raw pre/code block through @theme/CodeBlock,
   re-apply .landing__install styling. Evidence: website/src/pages/index.tsx:23-25;
   website/src/css/custom.css:260-264.
4. CLI banner art — widen the violet #6B24FF accent to span the full t-crossbar per
   website/static/img/wordmark.svg; keep post-init placement (recorded rationale stands).
   Update snapshot test. Evidence: src/cli/kit/banner.ts:74-89; test/cli/banner.test.ts:48-75.

CLI UX:
5. Interactivity — hand-rolled raw-mode arrow-select + checkbox multi-select extending
   src/cli/kit/prompts.ts; zero new dependencies (supply-chain posture). Non-TTY falls back to
   current typed prompts. Windows terminal behavior must be covered.
6. Scope — init prompts become menus (tool choice = checkbox multi-select, replacing the typed
   comma list) AND bare `stamity config` gains a navigable picker; all flag/arg paths stay
   scriptable. Amend the recorded "prompt budget belongs to init" contract
   (src/cli/commands/config.ts:69-71) to name both interactive surfaces.

Docs:
7. Reference naming — generator applies contentPrefixFor so headings show invoked names
   (/st-work, st-verify, stamity-creator); internal cmd- catalog id appears nowhere
   reader-facing. Evidence: src/cli/docs/referencePages.ts:227 (renders raw id, contradicting
   its own prose at :153-156); mapping at src/types/markers.ts:227-231.
8. SDLC docs — one hand-written "Working with stamity" lifecycle guide narrating the nine
   touchpoints as a workflow with a worked example; getting-started's "Where to go next" hands
   off to it. Include the manual parallel-branch path via plain git worktree until decision 15
   ships.
9. Feature docs — both undocumented shipped features get pages + README mention:
   multi-repo workspaces (workspace.json, detection, sync cascade; src/workspace/*) and the
   customization lane (.stamity/overrides, creator agent, save gates, shadowing, and the
   skill-emission caveat until decision 11 lands).
10. Doc riders (3 accepted, 1 declined): fix getting-started.md:59-63 ".agents for every
    client" overstatement (claude-only repos get none; gate at src/emit/planner.ts:446-469);
    add commit/ignore guidance for generated trees (.agents/, .claude/, .stamity/); surface
    the learn-CLI security rationale (src/learnings/validation.ts:20-25) and the .agents
    projection explanation in docs. Declined: migration.md frontmatter-title rider.

Engine:
11. Skill-override emission gap — IMPLEMENT: user skills under .stamity/overrides emit to
    clients so shadowing is real, not index-only. Evidence: OVERRIDE_EMITTING_CLASSES at
    src/cli/engine/emission.ts:105-109; projection reads corpus only
    (src/emit/skillsProjection.ts).
12. Overlay layers (.customize.yaml/.customize.md, documented layers 2-3, read by nothing) —
    IMPLEMENT NOW (operator overrode the drop-the-promise recommendation). Field-level
    patch-a-builtin; merge semantics to be designed in its own spec. Evidence:
    src/content/userContent.ts:71-75; src/content/catalog.ts:53-58.
13. Malformed override during sync — stays fail-closed (throws, sync stops, check reports
    "drift: not evaluated"); improve the error to name the exact file and field. Evidence:
    src/content/catalog.ts:696-703,757.
14. Workspace surface — IMPLEMENT (operator overrode the earlier docs-only choice later the
    same day): the shipped multi-repo engine gets a usable door as its own Batch D lane.
    Candidate surface for the spec: guided workspace.json creation wired into init where
    detection already suggests adoption (shouldSuggestWorkspace ≥2 repos,
    src/workspace/detect.ts:213-217) plus a `stamity workspace` verb (member status/sync);
    exact shape decided by /st-spec. The decision-9 workspaces docs page documents whatever
    this lane ships.

Project:
15. Worktree support — MUST IMPLEMENT a managed parallel-branch lane (operator: "important to
    scale development seamlessly; like in the predecessor project, just even more polished" —
    predecessor name redacted from this file: the leak gate reserves it to an exact path
    allowlist and scans this tree, `.stamity/` included). Scope sketch: worktree lifecycle per
    unit of work (create/teardown), per-worktree state handling, cross-session coordination.
    Reference repo located (2026-08-31): exact path and feature inventory recorded in
    operator-session memory (`stamity-worktree-reference-repo`) — src/worktree/ module; verbs
    `worktree-setup <path>` / `worktree-cleanup <path>`; `.worktreeinclude` isolation file;
    worktree-receipt JSON receipts kept out of git status via a .git/info/exclude managed
    block; existing-branch attach with --use-existing/--track and a 64/74/75 exit-code
    contract; cross-process proper-lockfile locking. Note: the predecessor's DEV repo contains
    NO worktree code — use the public repo the memory names.
16. Release platform controls (npm-publish env reviewer, v* tag ruleset, registry
    trusted-publisher entry; SECURITY.md:119-123 "not in force") — arm at next release window.
    Operator-clicked platform settings; execution session prepares the exact checklist and
    flips SECURITY.md wording once armed.
17. CHANGELOG.md — start it and wire the existing extraction hook in
    .github/workflows/release.yml:293-295. No public roadmap page.
18. Eval harness (nightly headless lane armed-not-enabled) — DEFERRED entirely, per operator.

Process:
19. Lock vehicle — this handoff.
20. Execution order — quick wins first, then docs pass, then CLI UX, then the four engine
    lanes (11, 12, 14, 15) each through /st-spec → /st-plan → /st-work as needed.

## Work Done

Research and triage only; zero product files changed. All findings above carry their evidence
paths inline. Session also answered as working-as-designed (no action): stamity learn as a
hidden gated CLI verb, .agents/skills emission gating per client, banner post-init placement,
predecessor overrides deliberately not auto-migrated ("reported, never mapped",
docs/migration.md:169-182).

## Work Remaining

EXECUTED IN FULL 2026-08-31 → 2026-09-01, committed to public-main (11 commits, 0982f6c..HEAD).
Every agent-executable decision is landed and gate-verified; the two residuals below are the
operator-only items the handoff itself flagged. Batch-by-batch:

- Batch A (decisions 1, 2, 3, 4, 7, 10a, 13) — 37bd456. Quick lane + /st-work; the
  migration-title question resolved to its declared default (decline stands, reversible).
- Batch B (decisions 8, 9-lifecycle-guide, riders 10b/10c) — 772a446. The "Working with
  stamity" guide; four review rounds. (Decision 9's two feature pages moved to their coupled
  engine lanes by recorded sequencing — customization to D11, workspaces to D14.)
- Batch C (decisions 5, 6) — 5aacecd. Raw-mode arrow/checkbox menus; four review rounds
  hardening the terminal/credential/TOCTOU surface.
- Batch D specs — ce0b6c7 (overlays, workspace, worktree; 50 REQs).
- Batch D lane 11 (skill-override emission + decision-9 customization page) — 424ce62.
- Batch D lane 12 (overlay layers) — 0b84e3b. Four review rounds; a silent-wrong Critical
  (patched skills shipped the unpatched body) caught by review.
- Batch D lane 14 (workspace surface + decision-9 workspaces page) — f5a451b.
- Batch D lane 15 (managed worktree lane) — e79570c. Frontier + security lenses; a policy
  that could author away its own credential gate, and a receipt that could delete the main
  tree's secrets, both closed.
- Batch E (decisions 16-checklist, 17) — be21daa. CHANGELOG + fail-closed release extraction;
  the decision-16 checklist prepared.

Suite grew 5707 → 6162 tests, green at every commit. Every batch carries its full audit trail
under .stamity/runs/. Two learnings captured this session (dogfood-sync, surface-pins) plus
the leak-gate one.

## Blockers

Only the two the handoff always reserved for the operator:
- Decision 16 — PLATFORM ARMING. The checklist is prepared (.github/release-controls-checklist.md);
  arming the npm-publish reviewer, the v* tag ruleset, and the npm trusted-publisher entry needs
  GitHub/npm access an agent does not have. The SECURITY.md "not in force" → "in force" flip is
  drafted in the checklist and reserved for after the operator confirms arming.
- Decision 18 — eval harness: DEFERRED entirely by the operator at triage. Untouched by design.

## Next Steps

Operator-only, none agent-closable:
1. Walk the Batch A QA rows if desired (copy button, dark favicon, terminal banner) — all
   otherwise auto-proven; the run records carry the checkpoints.
2. Arm the three release controls per .github/release-controls-checklist.md, then make the
   drafted SECURITY.md wording flip (re-reading test/docsPages.test.ts's "Publishing this
   package" assertion, as the checklist notes).
3. Push public-main when ready (this session committed locally only; nothing was pushed).
4. Decision 18 (eval harness) remains deferred until the operator un-defers it.

## Build & Test Status

| Gate | Result | Note |
|---|---|---|
| Lint (npm run lint) | pass (exit 0) | oxlint + eslint, final run at be21daa (2026-09-01) |
| Typecheck (npm run typecheck) | pass (exit 0) | tsc --noEmit |
| Tests (npm run test) | pass (exit 0) | 168 files, 6162 passed, 1 skipped (Windows-only release proof) |
| Leak gate (npm run gate) | pass (0 hits) | 592 files, predecessor rule active |

Final state verified by dedicated runners at each lane commit; a caution for later sessions:
the leak gate scans .stamity/ state files (see
.stamity/learnings/leak-gate-scans-stamity-state-files.md).

## File Manifest

| Path | State | Last action |
|---|---|---|
| .stamity/review-gate.json | untracked | session artifact of the deciding session; not part of this work |
| .stamity/handoffs/2026-08-31_triage-decisions_410bf.md | new | this handoff |

No tracked file was modified.
