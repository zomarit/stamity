import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frontmatterField, parseFrontmatter } from "../../src/content/frontmatter.ts";
import {
  validateLearningContent,
  verifyLearningIntegrity,
} from "../../src/learnings/validation.ts";

/**
 * This repository's own learnings corpus, held to the trust fields the engine only
 * advises about.
 *
 * `checkTrustFields` warns rather than errors on a missing `reviewBy` or
 * `validatedAgainst`, because a validator that hard-failed on them would refuse every
 * learning written before the fields existed. That default is right for an arbitrary
 * consumer repository and wrong here: a warning nothing reads is how all five of these
 * files ended up with no review horizon at all, which left the staleness branch the
 * shipped rule promises unable to ever fire in the tree that ships it. A repo-level
 * test is where the stricter policy belongs — it binds this corpus without changing
 * what the engine demands of anyone else's.
 *
 * Staleness itself stays a warning: a passed `reviewBy` means re-verify the finding,
 * not that the file is invalid, so this test does not go red on a calendar boundary.
 */

const LEARNINGS_DIR = fileURLToPath(new URL("../../.stamity/learnings/", import.meta.url));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read synchronously at module load: vitest registers cases before any hook runs. */
const FILES = readdirSync(LEARNINGS_DIR)
  .filter((name) => name.endsWith(".md"))
  .toSorted();

describe("this repository's learnings corpus", () => {
  // Vacuity guard: every assertion below hangs off `it.each`, so an empty or
  // mis-resolved directory would report five green files' worth of nothing.
  it("has the five learnings the charter tells agents to read", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(FILES)("%s passes the engine's own gates and carries both trust fields", (name) => {
    const raw = readFileSync(join(LEARNINGS_DIR, name), "utf8");

    const result = validateLearningContent(name, raw);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    // The advisory this test exists to make unreachable here.
    expect(result.warnings.filter((w) => /no `(reviewBy|validatedAgainst)`/.test(w))).toEqual([]);

    const parsed = parseFrontmatter(raw, name);
    const date = frontmatterField(parsed, "date");
    const reviewBy = frontmatterField(parsed, "reviewBy");
    const validatedAgainst = frontmatterField(parsed, "validatedAgainst");

    expect(typeof reviewBy).toBe("string");
    expect(reviewBy).toMatch(ISO_DATE);
    // Both are ISO calendar dates, so a string compare IS the chronological one.
    expect(String(reviewBy) > String(date)).toBe(true);

    expect(typeof validatedAgainst).toBe("string");
    expect(String(validatedAgainst).trim()).not.toBe("");

    // Adding the two fields must not have moved the digest: it covers the trimmed
    // body only, and the frontmatter carries it.
    expect(verifyLearningIntegrity(frontmatterField(parsed, "integrity"), parsed.body)).toBe(true);
  });
});
