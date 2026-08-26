import { describe, expect, it } from "vitest";
import { buildContentIndex, originOf } from "../../src/content/catalog.ts";
import { resolveBundledContentRoot } from "../../src/content/contentRoot.ts";
import { buildSelectionAllowlist, classifySelection } from "../../src/content/selection.ts";
import { isFloorTag } from "../../src/content/tags.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The protected floor, over the real shipped corpus.
 *
 * The `floor:*` mechanism was fully built and fully tested and bound NOTHING:
 * no artifact carried a floor tag, so every agent and every security rule was
 * silently deselectable and the `keep-protected-missing` verdict was
 * unreachable. A mechanism with no members is indistinguishable from an absent
 * one, and it fails exactly when someone trims a setup for leanness.
 *
 * These assertions read membership off the corpus rather than restating a list,
 * so the test says what the floor IS — and the pinned sets below make widening
 * or narrowing it a deliberate edit with a visible diff.
 */

const SPINE_AGENTS = ["researcher", "implementer", "reviewer", "fixer", "test-runner"];
const SECURITY_RULES = ["secrets", "security-patterns", "injection-screening"];

async function index() {
  return buildContentIndex(resolveBundledContentRoot());
}

describe("protected floor membership", () => {
  it("binds the five spine agents", async () => {
    const { items } = await index();
    const floored = items
      .filter((item) => item.type === "agent" && item.tags.includes("floor:spine"))
      .map((item) => item.id)
      .toSorted();
    expect(floored).toEqual([...SPINE_AGENTS].toSorted());
  });

  it("binds the security rules whose removal changes what a setup permits", async () => {
    const { items } = await index();
    const floored = items
      .filter((item) => item.type === "rule" && item.tags.includes("floor:security"))
      .map((item) => item.id)
      .toSorted();
    expect(floored).toEqual([...SECURITY_RULES].toSorted());
  });

  it("survives a manifest that selects nothing at all", async () => {
    const { items } = await index();
    // The failure this guards: a hand-edited or truncated manifest that names
    // no ids. Everything unprotected drops; every floor artifact is kept and
    // flagged, which is the signal a caller repairs from.
    const allowlist = buildSelectionAllowlist({
      items: { agent: [], skill: [], rule: [], command: [] },
    });

    const protectedIds = items
      .filter((item) => item.tags.some(isFloorTag))
      .map((item) => ({ id: item.id, verdict: classifySelection(item, allowlist) }));

    expect(protectedIds.length).toBe(SPINE_AGENTS.length + SECURITY_RULES.length);
    for (const row of protectedIds) {
      expect(row.verdict, row.id).toBe("keep-protected-missing");
    }
    const unprotected = items.find((item) => !item.tags.some(isFloorTag));
    expect(classifySelection(unprotected!, allowlist)).toBe("drop");
  });
});

/**
 * The floor under customization. Replacing a floor artifact is the point of an
 * override on one, and the two ways to get it wrong are opposite: drop the
 * floor (the corpus body is gone and nothing holds the id), or double-emit it
 * (both bodies ship, and the repo's edit is silently duplicated by the original
 * it was written to replace).
 *
 * Real corpus, real override tree, real filesystem — the mechanism is the merge
 * of two roots, and a virtual volume cannot exercise the shipped one.
 */
describe("a repo override on a floor artifact", () => {
  const getTemp = useTempDir("floor-override");

  const EMPTY_SELECTION = { items: { agent: [], skill: [], rule: [], command: [] } };

  it("holds the floor with the repo's own artifact instead of reporting it missing", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "overrides/rules/secrets.md":
        "---\nid: secrets\ntype: rule\ndescription: This repo's credential floor.\n" +
        "tags: [implementation]\n---\nOur own credential floor.\n",
    });

    const { items, shadows } = await buildContentIndex({
      root: resolveBundledContentRoot(),
      overrideRoot: temp.path("overrides"),
    });
    const allowlist = buildSelectionAllowlist(EMPTY_SELECTION);

    // Exactly one artifact answers to the id, and it is the repo's.
    const claimants = items.filter((item) => item.type === "rule" && item.id === "secrets");
    expect(claimants).toHaveLength(1);
    expect(originOf(claimants[0]!)).toBe("user");
    // Kept by presence, and NOT flagged as a missing floor: the id is present.
    // The override carries no `floor:*` tag of its own, so a verdict that read
    // the tags alone would have dropped the floor outright.
    expect(claimants.map((item) => classifySelection(item, allowlist))).toEqual(["keep"]);

    // The rest of the floor is untouched, and the replaced artifact is named.
    const flagged = items
      .filter((item) => item.tags.some(isFloorTag))
      .map((item) => classifySelection(item, allowlist));
    expect(flagged).toHaveLength(SPINE_AGENTS.length + SECURITY_RULES.length - 1);
    expect(flagged.every((verdict) => verdict === "keep-protected-missing")).toBe(true);
    expect((shadows ?? []).map((shadow) => [shadow.type, shadow.id])).toEqual([["rule", "secrets"]]);
    expect((shadows ?? [])[0]?.shadowed.map((item) => item.relativePath)).toEqual([
      "rules/stamity-secrets.md",
    ]);
  });
});
