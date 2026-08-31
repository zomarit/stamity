---
id: 2026-08-31_triage-decisions_410bf
status: in-progress
created: 2026-08-31T10:02:28Z
expires: 2026-09-30T10:02:28Z
summary: Locked triage decisions for 20 findings. Batch A executed 2026-08-31 (gates green, review approved; QA sign-off + migration-title re-decision with operator). Next: docs pass, CLI UX, 4 engine lanes.
fromTool: claude
gitRef: public-main@0982f6c
integrity: sha256:d91acedd0448ce3390743ed38cc5ac0f8d29654d6373e29e42ce0a20e2150e96
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

Batch A executed 2026-08-31 (uncommitted on public-main): /st-quick batch (decisions 2, 10a)
plus /st-work run 2026-08-31_batch-a-remainder (decisions 1, 3, 4, 7, 13) — gates green at
5709 passed, review approved round 2 (high/0.86); full record and findings ledger under
.stamity/runs/2026-08-31_batch-a-remainder/. Open on Batch A: the human QA sign-off, and the
design-lens finding that docs/migration.md's document title/og:title emits as "migration"
(operator declined the title rider; the lens argues title is orthogonal to the declined
sidebar row — operator re-decision pending, ledger row prove/13). Riders 10b and 10c moved
to Batch B; note getting-started's "Where state lives" already says "Commit it", shrinking
10b to naming the per-client trees.

Remaining batches:
- Batch B (docs pass): decisions 8, 9, riders 10b/10c.
- Batch C (CLI UX): decisions 5, 6.
- Batch D (engine lanes, each own spec/plan): 11 skill-override emission; 12 overlay layers;
  14 workspace surface; 15 worktree lane (reference repo in operator-session memory).
- Batch E (operator + release): 16 controls checklist at next release window; 17 CHANGELOG
  bootstrap.

## Blockers

- Decision 16 needs the operator's GitHub/npm platform access; agents can only prepare the
  checklist.
- Otherwise: none. (Former blocker on decision 15 is resolved — the reference repo is
  recorded in operator-session memory; see decision 15.)

## Next Steps

1. Operator: sign the Batch A QA checkpoint (walk-through in run record) and answer the
   migration-title question (ledger prove/13); commit Batch A when satisfied.
2. Batch B docs pass via /st-work (spec-author lane), updating getting-started handoffs;
   carries riders 10b/10c and the reference-page intro prose gap (ledger prove/22).
3. Batch C via /st-plan → /st-work; amend the config.ts prompt-budget contract text.
4. Batch D: run /st-spec for each lane; for 15, study the reference repo recorded in
   operator-session memory before drafting.
5. Batch E: generate the release-controls checklist for the operator; bootstrap CHANGELOG.md.

## Build & Test Status

| Gate | Result | Note |
|---|---|---|
| Lint (npm run lint) | pass (exit 0) | oxlint + eslint, post-Batch-A authoritative run 2026-08-31 |
| Typecheck (npm run typecheck) | pass (exit 0) | tsc --noEmit |
| Tests (npm run test) | pass (exit 0) | 162 files, 5709 passed, 1 skipped — +2 over baseline (title pin, override regression case) |

Post-Batch-A state verified by a dedicated runner; a caution for later sessions: the leak
gate scans .stamity/ state files (see .stamity/learnings/leak-gate-scans-stamity-state-files.md).

## File Manifest

| Path | State | Last action |
|---|---|---|
| .stamity/review-gate.json | untracked | session artifact of the deciding session; not part of this work |
| .stamity/handoffs/2026-08-31_triage-decisions_410bf.md | new | this handoff |

No tracked file was modified.
