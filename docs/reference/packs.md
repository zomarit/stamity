---
title: Packs
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Packs

A pack is content installed on top of the corpus behind the trust ladder. Packs ship across several classes at once, so they get one inventory rather than a row on each class page. Authored in `packs/`; each entry below is read from that pack's `pack.json` and its class directories.

**Updating a pack means adding it again.** There is no auto-update path for any pack source — not for the first-party packs below, and not for a source your organization allowlisted — and nothing checks for a newer version in the background. Re-running the install line for a pack you already have re-runs every trust gate on the new content and replaces what it landed, so re-add is the update, and it is also the only way to pick up a change.

1 pack.

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
