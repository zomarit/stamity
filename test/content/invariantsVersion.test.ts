import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCharterTemplate } from "../../src/content/charter.ts";
import type { CharterInvariants } from "../../src/emit/substitution.ts";

/**
 * The invariants block is gated by hash, not by prose review.
 *
 * The seven floors are the one piece of shipped content that every flow cites
 * and no gate could otherwise notice moving: a reworded invariant is a valid
 * markdown file, inside the line budget, with every other corpus assertion
 * still green. So the block gets a content hash keyed by the version that
 * ratified it. Editing the text WITHOUT bumping `invariants_version` fails
 * here; editing it WITH a bump fails until the new version is added to the
 * table below and recorded on the doctrine page's amendments table — which is
 * the point, because the hash is a forcing function for the record, not a lock
 * on the text.
 *
 * What the hash covers, and why: the `## Invariants` section with the rendered
 * version line removed, trailing whitespace trimmed per line. Dropping the
 * version line keeps the pin from being self-referential — a bump would
 * otherwise change the hash by changing the line that names the bump — and
 * trimming keeps an invisible whitespace edit from reading as an amendment.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CORPUS_ROOT = resolve(REPO_ROOT, "content");
const DOCTRINE = resolve(REPO_ROOT, "docs", "doctrine.md");

/**
 * The ONE pinned literal in this file: version -> hash of the block that
 * version ratified. Everything else is derived from the charter at run time, on
 * purpose — see `.stamity/learnings/surface-pins-are-literals-that-drift.md`:
 * a hand-kept literal that nothing recomputes drifts silently green, so this
 * suite keeps exactly one and computes the rest.
 *
 * A row is APPENDED on a bump; a row is never edited in place, because the old
 * pair is the record of what the previous version's text actually was.
 */
const INVARIANTS_HASHES: Record<string, string> = {
  "1.0.0": "d762083b862050223660b80daa0342bcc4969b0612a2071e3947cd717159e6c7",
  // Appended 2026-09-27 (plan 010 D5): invariant 2 now says exactly one question and no second
  // request in the same turn. The 1.0.0 row above stays as the record of the ratified text.
  "1.1.0": "d1662371a3ae872c70a3896bad89584edb25d409944905b376da47162bfce009",
  // Appended 2026-10-09 (plan 019 file 2, unit p3a-charter-invariant-4; S5 as amended): invariant 4
  // now says done means the gates the change's class names exit 0, all of them if the class is
  // unclear. The `Not done:` line is unchanged. The 1.1.0 row above stays as the record.
  // TEST CHANGE, justified (2026-10-09, plan 019 file 2, the p3 fix round, `review/111`): an
  // in-version text fix, b5b57885… -> efbef859…. Invariant 4's first line now takes the class from
  // `gate classify` and runs all gates when it did not run, so a class a session assigns itself
  // never narrows them. No release or tag carries the earlier 1.2.0 text (it landed in 51667e43 on
  // the same unreleased branch), so no repository ran it and this row moves instead of a 1.2.1.
  "1.2.0": "efbef8592774130142de7f98bc237a7fa8829ce257474649dab22cd5f30664fa",
};

/** The rendered version line, template form and emitted form alike. */
const VERSION_LINE = /^Invariants version .*$/m;

/**
 * The `## Invariants` section of a charter body: heading included, up to the
 * next `## ` heading or the end of the document.
 */
export function invariantsBlock(body: string): string {
  const start = body.indexOf("## Invariants");
  if (start < 0) throw new Error("the charter body carries no `## Invariants` heading");
  const rest = body.slice(start + "## Invariants".length);
  const end = rest.search(/^## /m);
  return `## Invariants${end < 0 ? rest : rest.slice(0, end)}`;
}

/**
 * The shipped charter, read with its version proven present.
 *
 * The loader returns `null` for a template that predates versioning — no keys,
 * no token. The shipped one is versioned, so `null` here means both the keys
 * and the rendered line have left the template, which is the loudest failure
 * this suite has and is reported as such rather than skipped past.
 */
async function shippedCharter(): Promise<{ body: string; invariants: CharterInvariants }> {
  const charter = await readCharterTemplate(CORPUS_ROOT);
  const { invariants } = charter;
  if (invariants === null) {
    throw new Error(
      "content/charter/stamity-charter.md declares no invariants version: the three " +
        "`invariants_*` frontmatter keys and the `${STAMITY:INVARIANTS_VERSION}` line are both " +
        "gone, so nothing states which version of the floors this corpus ships.",
    );
  }
  return { body: charter.body, invariants };
}

/** The hashed normal form: version line dropped, trailing whitespace trimmed per line. */
export function invariantsDigest(body: string): string {
  const normalised = invariantsBlock(body)
    .replace(VERSION_LINE, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

describe("charter invariants version", () => {
  it("hashes the invariants block to the version that ratified it", async () => {
    const charter = await shippedCharter();
    const { version } = charter.invariants;
    const pinned = INVARIANTS_HASHES[version];
    const measured = invariantsDigest(charter.body);

    expect(
      pinned,
      `invariants_version ${version} has no row in INVARIANTS_HASHES. A bump lands with its ` +
        `hash: add "${version}": "${measured}" here, and a \`| ${version} |\` row to the ` +
        `amendments table in docs/doctrine.md.`,
    ).toBeTypeOf("string");

    expect(
      measured,
      `the invariants block no longer hashes to what version ${version} ratified.\n` +
        `  ratified: ${pinned ?? "(no row)"}\n` +
        `  measured: ${measured}\n` +
        `An invariant's text moved. Bump invariants_version in ` +
        `content/charter/stamity-charter.md, add the new version and hash above, and record the ` +
        `amendment as a row in the amendments table in docs/doctrine.md (GOVERNANCE.md § ` +
        `Invariants versioning states the MAJOR/MINOR/PATCH rules).`,
    ).toBe(pinned);
  });

  it("records the current version as a row in the doctrine amendments table", async () => {
    const [charter, doctrine] = await Promise.all([shippedCharter(), readFile(DOCTRINE, "utf8")]);
    const { version } = charter.invariants;

    const heading = doctrine.indexOf("## Amendments");
    expect(heading, "docs/doctrine.md carries no `## Amendments` section").toBeGreaterThanOrEqual(
      0,
    );

    const rows = doctrine
      .slice(heading)
      .split("\n")
      .filter((line) => line.startsWith("| "));
    expect(
      rows.some((row) => row.startsWith(`| ${version} |`)),
      `the amendments table in docs/doctrine.md has no row beginning \`| ${version} |\`. Every ` +
        `version the charter declares is recorded there with its date, the invariants it moved, ` +
        `its class, and its sync impact.`,
    ).toBe(true);

    // Non-degenerate: the table is a table, not one row that happens to match.
    expect(rows.length).toBeGreaterThan(2);
  });

  it("never dates an amendment before the ratification it amends", async () => {
    const { invariants } = await shippedCharter();

    // ISO-8601 sorts lexicographically, which is why the loader validates the shape.
    expect(invariants.amended >= invariants.ratified).toBe(true);
    expect(invariants.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("fixture: a reworded invariant changes the digest, a reflowed blank line does not", async () => {
    const { body } = await shippedCharter();
    const baseline = invariantsDigest(body);

    // One word, inside one invariant — the smallest edit the gate has to catch.
    const reworded = body.replace("Floors, not defaults", "Floors, not defaults at all");
    expect(reworded).not.toBe(body);
    expect(invariantsDigest(reworded)).not.toBe(baseline);

    // Trailing whitespace an editor might add is not an amendment.
    const padded = body.replace(
      "   Anything less ships with a `Not done:` list naming each open gap.",
      "   Anything less ships with a `Not done:` list naming each open gap.   ",
    );
    expect(padded).not.toBe(body);
    expect(invariantsDigest(padded)).toBe(baseline);

    // A change OUTSIDE the block does not move the digest: the pin is scoped.
    const elsewhere = body.replace("## Touchpoints", "## Touchpoints (index)");
    expect(elsewhere).not.toBe(body);
    expect(invariantsDigest(elsewhere)).toBe(baseline);
  });
});
