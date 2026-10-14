# Run record — Batch C CLI UX (handoff 2026-08-31_triage-decisions_410bf)

- Run id: 2026-08-31_batch-c-cli-ux
- Flow: /st-work, DEEP intensity (novelty: first first-party raw-mode/keypress code in the
  repo; operator floor: Windows terminal behavior must be covered). Operator marathon
  green light stands.
- Scope: decision 5 (raw-mode arrow-select + checkbox multi-select extending
  src/cli/kit/prompts.ts, zero new dependencies, non-TTY falls back to typed prompts) and
  decision 6 (init prompts become menus with tool choice as checkbox multi-select; bare
  `stamity config` gains a navigable picker; all flag/arg paths stay scriptable; the
  prompt-budget contract comment at config.ts:69-71 amended to name both surfaces).
- Baseline: public-main@772a446.
- Research: session researcher brief (prompt kit, terminal kit, init sites, config KEY_SPECS,
  harness capabilities, scriptability contract) + orchestrator spike: emitKeypressEvents on a
  PassThrough emits named keys (up/down/space/return/ctrl+c); PassThrough lacks setRawMode —
  capability guard required and doubles as the fallback trigger.
- Design decisions (recorded before build):
  - selectOne gains the interactive arrow path internally (existing callers upgrade); NEW
    selectMany carries the checkbox surface with a typed comma fallback; both keep the
    promptGate contract exactly (non-interactive/json/yes → declared defaults, zero render).
  - Raw path requires: gate.interactive AND input TTY AND output TTY AND setRawMode function;
    anything less takes the typed path. Windows posture: readline's keypress normalization is
    the shared path (ConPTY normalizes arrows); the capability guard covers legacy consoles;
    real-Windows verification recorded as a residual (no Windows CI exists).
  - Known hazard, named up front: the kit's persistent readline session shares stdin; a raw
    interaction's Enter would also enqueue a phantom line into the session queue, corrupting
    the NEXT typed prompt — the interactive layer must quiesce/drain, with a regression test.
  - Bare `config` picker is single-shot (pick key → pick/enter value → apply through
    setConfigValue → normal set output) — the minimal honest reading of "navigable picker";
    non-interactive bare `config` keeps runList byte-identical (scriptable path untouched).
  - Rendering through makePalette only (color rules respected); cursor hide/show and
    setRawMode(false) restored in finally; ctrl+c parity with the readline SIGINT path
    (CliFailure FAILURE "aborted").

## Units

| Unit | Concern | Files | Status |
|---|---|---|---|
| C1 | interactive kit core: selectOne raw path + selectMany + harness support + keypress tests | ~4 | dispatched |
| C2 | init wiring: tool choice → selectMany; menus for migrate/import via upgraded selectOne | ~2 | pending (after C1) |
| C3 | config picker + contract-comment amendment | ~2-3 | pending (after C1) |
| C4 | docs truth pass: regenerate cli-reference/configuration if help text moved; verify getting-started claims still hold | ~2-3 | pending (after C2+C3) |

Phase 3 serial (shared-tree isolation rule). Deep tier: specialist pass at Prove (security on
the stdin surface, design-quality on the rendered terminal UI) + whole-diff frontier review at
Prove-final.

## Proof block

Gate results (dedicated runners, class-1): pre-fix authoritative 5748 green; post-round-1-fix
5759 green; final 5764 green + TERM=dumb prompts-suite probe 67/67 green (ambient-leakage
disproof). All lint/typecheck passes clean throughout.

Review loop (cap 4, exited by approval):
| Round | Source | Verdict | Findings |
|---|---|---|---|
| Prove pass | frontier whole-diff (0.85) + security (3W/1M) + design-quality (1C/4W/2M) | needs-fixes | terminal-state/quiesce/gate-floors/extraction PROVEN clean; 1 Critical (silent default substitution) + geometry/injection family + accept-race + stale-write TOCTOU |
| Fix round 1 | same fixer | 8/8 fixed | suite +11; SM4 verification item resolved benign |
| Round 2 | reviewer (0.82) | needs-fixes | 5/8 verified; TERM citation false (provenance: design lens → orchestrator ledger → fixer), ambient-TERM test hazard, second sink open, EOF silent-default residue |
| Fix round 3 | same fixer | 4/4 fixed | env threaded through PromptGate from Runtime.env; runList sanitized; EOF discloses in both selectors (orchestrator-recorded decision); suite +5 |
| Round 4 (cap) | reviewer (0.86) | APPROVE | all verified; one carried non-blocking Warning deferred (prove/32), one Minor |

Decisions trace additions:
- Orchestrator decision (round 3): EOF after any attempt discloses "keeping the default(s)";
  an explicit blank remains bracket-consented silence — the question protocol's "a run that
  applied a default names it in its output" distinguishes nobody-answered from user-chose.
- Provenance recorded: the false banner-precedent framing for the TERM read originated in the
  design lens finding, was carried into ledger row prove/11 by the orchestrator, and
  implemented in good faith by the fixer; round 2 caught it, round 3 shipped the honest
  injection.
- Carried Warning prove/32 (typed-fallback/textInput sinks) deferred at the cap on the
  round-4 reviewer's own non-blocking judgment; named follow-up recorded.

QA checkpoint: user-facing CLI surface. Auto-proven: all keypress/frame/fallback/gate-floor
behavior (67 prompt-kit cases + init/config suites + TERM=dumb probe + red-first inventory).
Human rows (real-TTY residue the harness cannot reach): run `stamity init` and bare
`stamity config` in a real terminal and eyeball the menus; real-Windows terminal verification
(no Windows CI) — both recorded as open residuals under the operator's marathon sign-off
authority. Shippable: YES per that authority, residuals named.

Side effects: no dependency changes (byte-verified vs baseline). No new learning (the
TERM-provenance lesson is recorded here and in the ledger; it is session-process, not
repo-mechanism). Spec deltas held in unit returns (docs/specs/ absent). PR emission: no
platform; local commit only. Ledger: 33 rows, 0 open at run exit.
Recommended next step: Batch D lanes; first kit follow-up unit carries prove/32.
