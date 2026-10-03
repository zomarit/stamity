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
  "ops": "3e11beecbb12f97448ce5ef7c2fb55850654c7e369c52231219f43a45a76db20",
  "product-audit": "42367889d11d31dfc8fd1e585ee8cc9e61f427ae294bdd9622b326aa40edce9d",
  "scaffold": "85016f7438a0fee7502593879155558a6514f425382d835d438701d9fddd6eba",
};
