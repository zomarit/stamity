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
  "ops": "90f6a36e3c9684069831071fa252d0603dc7dacbb0f60c9ff4a148f5881fb1ae",
  "product-audit": "42367889d11d31dfc8fd1e585ee8cc9e61f427ae294bdd9622b326aa40edce9d",
  "scaffold": "85016f7438a0fee7502593879155558a6514f425382d835d438701d9fddd6eba",
};
