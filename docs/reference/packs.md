---
title: Packs
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Packs

A pack is content installed on top of the corpus behind the trust ladder. Packs ship across several classes at once, so they get one inventory rather than a row on each class page. Authored in `packs/`; each entry below is read from that pack's `pack.json` and its class directories.

**Updating a pack means adding it again.** There is no auto-update path for any pack source — not for the first-party packs below, and not for a source your organization allowlisted — and nothing checks for a newer version in the background. Re-running the install line for a pack you already have re-runs every trust gate on the new content and replaces what it landed, so re-add is the update, and it is also the only way to pick up a change.

3 packs.

### `ops`

Operate in production — cut releases fail-closed, run incidents to blameless post-mortems.

- **Version:** `0.1.0`
- **Ships:** `agents` (2), `skills` (5), `commands` (2)
- **Install:** `stamity add ops`

### `product-audit`

Point-in-time whole-product assessment — proposes an epic set and writes a report; assesses, never modifies.

- **Version:** `0.1.0`
- **Ships:** `skills` (1), `rules` (1), `commands` (2)
- **Install:** `stamity add product-audit`

### `scaffold`

Greenfield generators built to the repo's quality floor — the implementer writes, a specialist lens gates, and a failed gate buys exactly one regeneration.

- **Version:** `0.1.0`
- **Ships:** `commands` (3)
- **Install:** `stamity add scaffold`
