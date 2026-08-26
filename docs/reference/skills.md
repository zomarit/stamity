<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Skills

A skill is a procedure an agent runs when the work calls for it. Its `description` is the trigger a client matches against the task at hand — it is the only part always in context, so it carries the whole activation claim. Authored in `content/skills/<id>/SKILL.md`.

8 skills.

### `browser-evidence`

Drives a real browser against the built artifact and returns the evidence bundle a QA checkpoint cites — spec-derived scenario runs, screenshot diffs, and accessibility scan output. Triggers when a change touches a rendered surface and the checkpoint needs captured evidence, or when someone asks for a screenshot comparison or an accessibility scan of the running app.

- **Tags:** `review`
- **Load:** `on-demand`
- **Obsolete when:** clients natively capture browser-run QA evidence bundles

### `dep-audit`

Produces a standalone dependency audit over the installed graph — advisories, licenses, and update-risk classes — and reports without editing a manifest, a lockfile, or a source file. Triggers when someone asks what the installed packages are exposed to, before a release or an upgrade sweep, or when a lockfile change needs its risk stated.

- **Tags:** `maintenance`, `devops`
- **Load:** `on-demand`
- **Obsolete when:** dependency risk reporting is fully covered by native tooling

### `design-system-detect`

Detects the design system a repo already has — design tokens, components, theming, responsive strategy — and writes the inventory the next interface change reuses instead of minting a parallel one. Triggers before interface work that would add a token or a component, when it is unclear whether a repo has a design system at all, or when a recorded inventory has fallen behind the current head.

- **Tags:** `maintenance`
- **Load:** `on-demand`
- **Obsolete when:** design-system inventory is a client-native detection

### `handoff`

Carries mid-work state across a session or tool boundary through five modes — prepare, resume, list, complete, prune — writing and reading `.stamity/handoffs/` with integrity, expiry, and git-drift validation. Triggers when a session ends mid-task, when work moves to another client, when context pressure builds, or when a saved handoff should be picked up, listed, closed, or swept.

- **Tags:** `orchestration`
- **Load:** `on-demand`
- **Obsolete when:** clients exchange durable session state across vendors through a shared standard, making an in-repo handoff file redundant

### `learn`

Records one verified, repo-specific finding into `.stamity/learnings/` through the `stamity learn capture` write path, applying the qualification bar, the summary standard, and a confidence rating. Triggers after a surprising failure is understood, when reading code reveals a constraint nobody wrote down, or when someone asks to save what this repository just taught them.

- **Tags:** `maintenance`
- **Load:** `on-demand`
- **Obsolete when:** clients carry durable, repo-scoped, cross-vendor memory that a later session reads without an in-repo file

### `onboard`

Guides the first real change in a repository this setup was just installed into — orients on the actual code, settles on one small change with the operator, runs it through the touchpoints the install shipped, and closes on a passing verification gate. Triggers right after `stamity init` finishes, when someone opens a freshly set-up repository and asks what to do next, or when a repository carries the setup but has no first proven change through it yet.

- **Tags:** `planning`
- **Load:** `on-demand`
- **Obsolete when:** clients walk a newcomer through a proven change on their own code at session start, leaving no guided first run to script

### `qa`

Builds the human QA walk-through for a change — a risk-ordered table of scenarios, steps, and expected results, with rows auto-proven from existing evidence first — and records the shippability sign-off. Triggers at the closing checkpoint of a work run, before a merge or release decision, or when someone asks what a person should manually test before shipping.

- **Tags:** `review`
- **Load:** `on-demand`
- **Obsolete when:** automated evidence covers observable behavior end to end, leaving no judgment a person adds by walking the change

### `verify`

Runs one content-quality axis as a gate — that axis's runnable checks plus its judgment calls for ui, ux, security, reliability, testability, scalability, performance, maintainability, enhancability or product-spec — and writes .stamity/verify/<axis>-<sha>.json. Triggers when one axis needs evidence before a review or a release, when a consumer finds no artifact for the current sha, or when someone asks how a change scores on a single quality axis.

- **Tags:** `review`
- **Load:** `on-demand`
- **Obsolete when:** per-axis quality gating with machine-readable results is client-native
