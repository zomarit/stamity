---
id: probe-none-proven-repo-what-next
class: probe
claim: "In a repository whose setup is long proven, a general what-next question triggers no skill: st-onboard covers the first proven change only."
source: content/skills/st-onboard/SKILL.md:4
metric: classification
---

## Brief

Answer as the agent deciding which skill, if any, applies to the request below. Use no
tools, read no files, and treat the list as the whole skill surface available to you.
Skills are description-triggered: one applies when the request matches its description.

Skill surface — the eight descriptions, verbatim:

```text
st-browser-evidence — "Drives a real browser against the built artifact and returns the evidence bundle a QA checkpoint cites — spec-derived scenario runs, screenshot diffs, and accessibility scan output. Triggers when a change touches a rendered surface and the checkpoint needs captured evidence, or when someone asks for a screenshot comparison or an accessibility scan of the running app."
st-dep-audit — "Produces a standalone dependency audit over the installed graph — advisories, licenses, and update-risk classes — and reports without editing a manifest, a lockfile, or a source file. Triggers when someone asks what the installed packages are exposed to, before a release or an upgrade sweep, or when a lockfile change needs its risk stated."
st-design-system-detect — "Detects the design system a repo already has — design tokens, components, theming, responsive strategy — and writes the inventory the next interface change reuses instead of minting a parallel one. Triggers before interface work that would add a token or a component, when it is unclear whether a repo has a design system at all, or when a recorded inventory has fallen behind the current head."
st-handoff — "Carries mid-work state across a session or tool boundary through five modes — prepare, resume, list, complete, prune — writing and reading `.stamity/handoffs/` with integrity, expiry, and git-drift validation. Triggers when a session ends mid-task, when work moves to another client, when context pressure builds, or when a saved handoff should be picked up, listed, closed, or swept."
st-learn — "Records one verified, repo-specific finding into `.stamity/learnings/` through the `stamity learn capture` write path, applying the qualification bar, the summary standard, and a confidence rating. Triggers after a surprising failure is understood, when reading code reveals a constraint nobody wrote down, or when someone asks to save what this repository just taught them."
st-onboard — "Guides the first real change in a repository this setup was just installed into — orients on the actual code, settles on one small change with the operator, runs it through the touchpoints the install shipped, and closes on a passing verification gate. Triggers right after `stamity init` finishes, when someone opens a freshly set-up repository and asks what to do next, or when a repository carries the setup but has no first proven change through it yet."
st-qa — "Builds the human QA walk-through for a change — a risk-ordered table of scenarios, steps, and expected results, with rows auto-proven from existing evidence first — and records the shippability sign-off. Called by name from a work run's own QA checkpoint and never selected there on its own. Triggers on its own only before a merge or release decision, or when someone asks what a person should manually test before shipping."
st-verify — "Runs one content-quality axis as a gate — that axis's runnable checks plus its judgment calls for ui, ux, security, reliability, testability, scalability, performance, maintainability, enhancability or product-spec — and writes .stamity/verify/<axis>-<sha>.json. Triggers when one axis needs evidence before a review or a release, when a consumer finds no artifact for the current sha, or when someone asks how a change scores on a single quality axis."
```

Scenario state — given to you as fact. This is the known-hard adjacency:

> This repository has carried the setup for eight months. Dozens of changes have gone
> through the touchpoints and closed on green gates. There is no install in progress and
> no unproven setup.

Scenario input — the request as it arrives, with no command running:

> What should we work on next?

Answer with the id of the one skill that applies, or `none` if the request stays with the
main flow, plus one sentence of reason.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The answer is `none`: no skill is selected by description here.
2. The response must NOT name `st-onboard` as triggered.
3. No skill id is given as the answer; a response naming any skill as applicable fails this
   case.

### Advisory criteria — recorded, never scored into the verdict

1. The stated reason distinguishes this repository from an unproven install — the
   onboarding walk covers the first proven change, and this repository has many. The
   classification is what this case measures and is binding above; how completely the
   reason is stated is recorded here.
