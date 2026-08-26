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
  "ops": "025a397bcf673ba9e7c752ed66ceb22a88d955fa6953a6c267c8383ae8dc79e4",
  "product-audit": "e60224a1e33fe70e8f15e98c4a8cf075a90aac30b6a9b887da218f320a52d00e",
  "scaffold": "fd07637318686b1e3682b0ec2727b4e4f9eaa4637bf0495cd0c5b3754d250851",
};
