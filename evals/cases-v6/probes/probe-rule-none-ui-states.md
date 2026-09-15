---
id: probe-rule-none-ui-states
class: probe
claim: "A typography change on a static page that reads no data is a near miss for stamity-ui-states: the surface has no data states to render."
source: content/rules/stamity-ui-states.md:4-4
metric: classification
---

## Brief

Answer as the agent deciding which skill, if any, applies to the request below. Use no
tools, read no files, and treat the list as the whole skill surface available to you.
Skills are description-triggered: one applies when the request matches its description.

Skill surface — the seventeen descriptions, verbatim:

```text
st-browser-evidence — "Drives a real browser against the built artifact and returns the evidence bundle a QA checkpoint cites — spec-derived scenario runs, screenshot diffs, and accessibility scan output. Triggers when a change touches a rendered surface and the checkpoint needs captured evidence, or when someone asks for a screenshot comparison or an accessibility scan of the running app."
st-dep-audit — "Produces a standalone dependency audit over the installed graph — advisories, licenses, and update-risk classes — and reports without editing a manifest, a lockfile, or a source file. Triggers when someone asks what the installed packages are exposed to, before a release or an upgrade sweep, or when a lockfile change needs its risk stated."
st-design-system-detect — "Detects the design system a repo already has — design tokens, components, theming, responsive strategy — and writes the inventory the next interface change reuses instead of minting a parallel one. Triggers before interface work that would add a token or a component, when it is unclear whether a repo has a design system at all, or when a recorded inventory has fallen behind the current head."
st-handoff — "Carries mid-work state across a session or tool boundary through five modes — prepare, resume, list, complete, prune — writing and reading `.stamity/handoffs/` with integrity, expiry, and git-drift validation. Triggers when a session ends mid-task, when work moves to another client, when context pressure builds, or when a saved handoff should be picked up, listed, closed, or swept."
st-learn — "Records one verified, repo-specific finding into `.stamity/learnings/` through the `stamity learn capture` write path, applying the qualification bar, the summary standard, and a confidence rating. Triggers after a surprising failure is understood, when reading code reveals a constraint nobody wrote down, or when someone asks to save what this repository just taught them."
st-onboard — "Guides the first real change in a repository this setup was just installed into — orients on the actual code, settles on one small change with the operator, runs it through the touchpoints the install shipped, and closes on a passing verification gate. Triggers right after `stamity init` finishes, when someone opens a freshly set-up repository and asks what to do next, or when a repository carries the setup but has no first proven change through it yet."
st-qa — "Builds the human QA walk-through for a change — a risk-ordered table of scenarios, steps, and expected results, with rows auto-proven from existing evidence first — and records the shippability sign-off. Called by name from a work run's own QA checkpoint and never selected there on its own. Triggers on its own only before a merge or release decision, or when someone asks what a person should manually test before shipping."
st-verify — "Runs one content-quality axis as a gate — that axis's runnable checks plus its judgment calls for ui, ux, security, reliability, testability, scalability, performance, maintainability, enhancability or product-spec — and writes .stamity/verify/<axis>-<sha>.json. Triggers when one axis needs evidence before a review or a release, when a consumer finds no artifact for the current sha, or when someone asks how a change scores on a single quality axis."
stamity-ai-evals — "Floor for shipping a feature whose behaviour comes from a language model — a golden and adversarial eval set before ship, a regression run on every prompt or model change, offline measurement before traffic, and results committed as artifacts."
stamity-api-versioning — "Floor for evolving a published interface: RFC 9457 problem details on every error, additive-first change inside a version, an announce-sunset-remove retirement lifecycle, and Idempotency-Key on unsafe retriable operations."
stamity-contract-census — "Before parallel work on a brownfield codebase: enumerate shared contracts per unit — file-disjoint is not contract-disjoint; facade-hold on collisions."
stamity-learnings-schema — "Curation posture for the learnings directory — one topic per file merged on overlap, confidence bands that move only on verified outcomes, what does not earn a file, and the cap read as a signal to retire rather than to raise."
stamity-migrations — "Floor for schema and data change: expand, backfill, switch, and contract as four independently deployable phases, bounded-lock statements, batched resumable backfills, and destructive steps gated on verified completion."
stamity-question-protocol — "When a request is ambiguous, irreversible, or missing acceptance criteria: ask one question with numbered options and a declared default; sub-agents return BLOCKED_AMBIGUITY."
stamity-resilience — "Failure contract for code that calls out of the process — a circuit breaker per dependency, retry with decorrelated jitter under a budget, a deadline that propagates and never resets, idempotent handlers for at-least-once delivery, and the logging and metric floor that makes each of them observable."
stamity-testing — "What a test in this repository has to be — an assertion about behaviour rather than implementation, a regression case shipped with every defect fix, a name that states the invariant, and a gating test that is never weakened by the change it gates."
stamity-ui-states — "Four-state contract for any interface surface that reads data — loading, empty, error, and success each rendered explicitly, with error copy that names a next step, empty states designed by sub-type, and strings and styling taken from the layers the repo already has."
```

This client delivers the nine `stamity-` entries on demand; the twelve earlier probes
list the eight shipped skills only.

Scenario input — the request as it arrives in chat. No command is running, and the page named
below fetches nothing:

> Change the heading font on the static pricing page. It's hard-coded copy — the page reads
> no data at all.

Answer with the id of the one skill that applies, or `none` if the request stays with the
main flow, plus one sentence of reason.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The answer is `none` or a shipped `st-` skill; it is never `stamity-ui-states`.
2. The response must NOT name `stamity-ui-states` as triggered.
3. No skill id is given as the answer unless it is one of the eight shipped skills.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. Nothing in it turns on a routing destination, a hand-off
sentence, a choice between sibling labels, or the completeness of a stated reason.
