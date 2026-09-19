import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The changelog's link-reference footer, held to the headings above it.
 *
 * Keep a Changelog puts every version's compare URL in one footer at the end of the file, and
 * that footer is a hand-maintained literal nothing recomputes: the 1.7.0 and 1.8.0 sections
 * shipped with no definition at all, so both rendered as bare text and `[Unreleased]` claimed a
 * range that spanned two published releases. Nothing was red. This is the gate that would have
 * been.
 *
 * Three properties, and the third is why the footer's SHAPE is asserted and not only its
 * contents. `.github/workflows/release.yml` ("Compose release notes") extracts a version's
 * section with an awk program that starts printing after the matching `## [x.y.z]` heading and
 * stops at the next one, holding link-definition lines in a buffer so a definition written
 * mid-body does not truncate the notes: a buffer still held at the end of the section is
 * discarded as the trailing footer. That discard is correct for a footer that trails the last
 * section and wrong for definitions scattered between sections — those would be dropped out of
 * the published notes silently. So the footer is required to be one contiguous block after the
 * last heading, which is the arrangement the extractor was written for.
 *
 * The repository home is read from `package.json`, not typed here: a downstream fork renames
 * the package and its remote, and a literal would make this gate fail on the rename rather than
 * on the drift it is written for.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const CHANGELOG = "CHANGELOG.md";

/** `## [1.8.0] - 2026-09-15` — a released section. */
const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)] - \d{4}-\d{2}-\d{2}$/;

/** `[1.8.0]: https://…` — one link-reference definition. */
const LINK_DEFINITION = /^\[([^\]]+)]:[ \t]+(\S+)$/;

/** The label every unreleased change accumulates under. */
const UNRELEASED = "Unreleased";

interface Package {
  readonly repository: { readonly url: string };
}

/** `git+https://github.com/owner/repo.git` → `https://github.com/owner/repo`. */
const repositoryHome = (): string => {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
  ) as Package;
  return pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
};

/** The file's lines, CRLF tolerated: a Windows checkout reads the same file. */
const changelogLines = (): string[] =>
  readFileSync(join(REPO_ROOT, CHANGELOG), "utf-8").split(/\r?\n/);

interface Entry {
  readonly label: string;
  readonly line: number;
}

/** Released versions, newest first, in the order the file lists them. */
const headings = (lines: readonly string[]): Entry[] =>
  lines.flatMap((line, index) => {
    const match = VERSION_HEADING.exec(line);
    return match === null ? [] : [{ label: match[1] as string, line: index }];
  });

/** Every link definition, by label, with the line it sits on. */
const definitions = (lines: readonly string[]): Map<string, { url: string; line: number }> => {
  const found = new Map<string, { url: string; line: number }>();
  for (const [index, line] of lines.entries()) {
    const match = LINK_DEFINITION.exec(line);
    if (match !== null) found.set(match[1] as string, { url: match[2] as string, line: index });
  }
  return found;
};

describe("CHANGELOG link references", () => {
  it("defines a link for every released section, and defines no version that has none", () => {
    const lines = changelogLines();
    const released = headings(lines);
    const defined = definitions(lines);

    expect(released.length, `${CHANGELOG} has no \`## [x.y.z]\` sections to check`).toBeGreaterThan(
      0,
    );
    for (const { label } of released) {
      expect(
        defined.has(label),
        `${CHANGELOG} has a \`## [${label}]\` section with no \`[${label}]: …\` definition, so the ` +
          `heading renders as bare text`,
      ).toBe(true);
    }

    const versions = new Set(released.map(({ label }) => label));
    for (const label of defined.keys()) {
      if (label === UNRELEASED) continue;
      expect(
        versions.has(label),
        `${CHANGELOG} defines \`[${label}]\` with no \`## [${label}]\` section above it`,
      ).toBe(true);
    }
  });

  it("chains every compare range to the release below it, and Unreleased to the newest", () => {
    const lines = changelogLines();
    const released = headings(lines);
    const defined = definitions(lines);
    const home = repositoryHome();

    // Newest first, so entry i compares against entry i + 1. The oldest release has nothing
    // below it to compare against and names its tag instead.
    released.forEach(({ label }, index) => {
      const previous = released[index + 1]?.label;
      const expected =
        previous === undefined
          ? `${home}/releases/tag/v${label}`
          : `${home}/compare/v${previous}...v${label}`;
      expect(
        defined.get(label)?.url,
        `${CHANGELOG}: \`[${label}]\` does not compare the release below it`,
      ).toBe(expected);
    });

    const newest = released[0]?.label ?? "";
    expect(
      defined.get(UNRELEASED)?.url,
      `${CHANGELOG}: \`[${UNRELEASED}]\` must compare \`v${newest}...HEAD\`, or it spans releases ` +
        `that have already shipped`,
    ).toBe(`${home}/compare/v${newest}...HEAD`);
  });

  it("keeps the definitions in one trailing block, which is what the release extractor discards", () => {
    // See the file header: the awk program in `.github/workflows/release.yml` holds definition
    // lines in a buffer and discards a buffer still held at the end of a section. A definition
    // between two sections is therefore dropped from the published notes with nothing failing.
    const lines = changelogLines();
    const released = headings(lines);
    const defined = [...definitions(lines).values()].map(({ line }) => line).toSorted((a, b) => a - b);
    const lastHeading = released.at(-1)?.line ?? -1;

    expect(defined.length, `${CHANGELOG} defines no links at all`).toBeGreaterThan(0);
    expect(
      defined[0],
      `${CHANGELOG}: a link definition sits above the last \`## [x.y.z]\` heading, where the ` +
        `release workflow's extractor would drop it from that section's notes`,
    ).toBeGreaterThan(lastHeading);

    const first = defined[0] ?? 0;
    const interleaved = lines
      .slice(first)
      .filter((line) => line.trim() !== "" && LINK_DEFINITION.exec(line) === null);
    expect(
      interleaved,
      `${CHANGELOG}: the footer is not one contiguous block — prose after the first definition ` +
        `is what the extractor's hold buffer flushes back into a section`,
    ).toEqual([]);
  });
});
