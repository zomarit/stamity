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
  "ops": "c188457ee57b31e558b4aff46117e0964ea6c7c6f32171bd5af9976e4df7bcf6",
  "product-audit": "8f88211025bffb0cbce73e394f7f5e88b7a71d46ed4c495f1c93eb2f4c1a99c3",
  "scaffold": "0408b91e930020463f4015faa6305490f8b339936ea87f51cd9984a2323dfe3d",
};
