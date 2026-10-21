---
title: Packs
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Packs

A pack is content installed on top of the corpus behind the trust ladder. Packs ship across several classes at once, so they get one inventory rather than a row on each class page. Authored in `packs/`; each entry below is read from that pack's `pack.json` and its class directories.

**Updating a pack means adding it again.** There is no auto-update path for any pack source — not for the first-party packs below, and not for a source your organization allowlisted — and nothing checks for a newer version in the background. Re-running the install line for a pack you already have re-runs every trust gate on the new content and replaces what it landed, so re-add is the update, and it is also the only way to pick up a change.

2 packs.

## `frontend`

Interface work that reuses the design system a repo already has and captures browser evidence for the accessibility floor.

- **Version:** `1.16.0`
- **Ships:** `skills` (2), `commands` (1)
- **Install:** `stamity add frontend`

Skills:

- `st-browser-evidence` — Drives a real browser against the built app and returns the evidence bundle a QA checkpoint cites. Triggers when a change touches a rendered surface and needs captured evidence, or when someone asks for a screenshot comparison or accessibility scan.
- `st-design-system-detect` — Detects the design system a repo already has — tokens, components, theming — and writes the inventory interface work reuses. Triggers before interface work that would add a token or a component, or when a recorded inventory falls behind the head.

Commands:

- `/st-ui-review` — Reviews a named screen or flow against the design system, the UI states and WCAG 2.2 AA through the design-quality agent and browser evidence, returning findings with path:line and never editing.

## `production`

Take a service to production and keep it there: a readiness review graded apart from its evidence, a release that stops before anything irreversible, and an incident procedure that proposes and never applies.

- **Version:** `1.16.0`
- **Ships:** `skills` (2), `commands` (1)
- **Install:** `stamity add production`

Skills:

- `st-incident` — Investigates a production incident read-only, proposes each mitigation without applying it, and writes the post-incident review with a code root cause. Starts only when invoked by name. Triggers when an incident is open or its review is due.
- `st-release` — Cuts a versioned release or a deploy from main: writes the change record, runs the gates, and stops before each irreversible step until its typed token. Starts only by name. Triggers when someone invokes st-release to ship a version or a deploy.

Commands:

- `/st-production-review` — Reviews one service at one commit for production readiness across security, supply chain and operations, grades the gathered evidence apart from the gatherers, and ends on a Ready line that names where the approval of record lives.
