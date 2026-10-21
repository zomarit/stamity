/**
 * GENERATED FILE — do not edit by hand.
 *
 * Aggregate content SHA-256 pins for the bundled first-party packs: one pin
 * per pack id, computed by `computeAggregateContentSha` (./trust.ts) over the
 * sorted `pack.json` integrity map. The curated catalog (./curated.ts) grants
 * its trust tiers against these exact digests — pinned-or-refuse — and the
 * pins-in-sync suite (test/pack/curated.test.ts) fails on any drift between
 * this module, the pack manifests, and the bytes on disk.
 *
 * Regenerate:  node scripts/generate-pack-manifests.mjs
 * Verify only: node scripts/generate-pack-manifests.mjs --check
 */
export const CATALOG_PINS: Record<string, string> = {
  "frontend": "269b7c363588aaf5ecac11d542ffecf84cb4e454fdebf9b4b422006610bbbf02",
  "production": "ca6e3331b131ac1ffb6e4bee1e6f5cb3eaf63f75f7a43e9d64a21cbbf3e41b4a",
};
