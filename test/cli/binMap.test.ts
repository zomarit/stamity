import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The published `bin` map, pinned — the one contract in package.json that no
 * test in this repository could previously see.
 *
 * Two names, two entries: `stamity` is the long name and resolves to the built
 * CLI; `st` is the short alias added with the `st-` command rename, and since
 * REQ-FLOW-049 it resolves to its own small entry, which prints one deprecation
 * line and then runs that same CLI. The alias goes at 2.0.0. That much a reader
 * sees in package.json. What a reader does NOT see is why
 * the long key cannot be dropped once the short one exists: npm resolves a bare
 * `npx <package>` to the bin whose KEY EQUALS THE UNSCOPED PACKAGE NAME, and a
 * package whose bin map has no such key makes `npx @zomarit/stamity init`
 * ambiguous rather than convenient. That line is the first command in
 * README.md, in docs/getting-started.md, in every migration page and in the
 * release notes, so the key name is what keeps the documented install working —
 * not the path it points at.
 *
 * Nothing else in the suite would notice its loss. `test/smoke.test.ts` pins the
 * one key's VALUE, `scripts/tarball-smoke.mjs` runs `dist/cli.js` by path, and
 * every CLI test drives the source through the TypeScript loader; all of them
 * stay green while the install line a user copies stops resolving. Hence a file
 * whose whole subject is the map's shape.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

interface PackageJson {
  readonly name: string;
  readonly bin: Record<string, string>;
  readonly files: readonly string[];
}

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as PackageJson;

/** `@zomarit/stamity` -> `stamity`: the name npm matches a bin key against. */
const UNSCOPED_NAME = pkg.name.replace(/^@[^/]+\//, "");

/** The short alias the `st-` command surface is named after. */
const SHORT_NAME = "st";

/** The built entry the long name resolves to. */
const CLI_ENTRY = "./dist/cli.js";

/** The built entry the short alias resolves to: a deprecation line, then the CLI above. */
const ALIAS_ENTRY = "./dist/st.js";

describe("package.json bin map", () => {
  it("declares a map rather than a single string, so a second name can exist at all", () => {
    // npm accepts `"bin": "./dist/cli.js"`, which installs ONE command named
    // after the package. Collapsing back to that shape removes the alias
    // without removing anything a reader would recognise as the alias.
    expect(typeof pkg.bin, "bin is not an object: a second command name has nowhere to live").toBe(
      "object",
    );
    expect(pkg.bin).not.toBeNull();
    expect(Array.isArray(pkg.bin)).toBe(false);
  });

  it("installs exactly the long name and the short alias", () => {
    expect(Object.keys(pkg.bin)).toEqual([UNSCOPED_NAME, SHORT_NAME]);
  });

  // TEST CHANGE, justified (plan 022 file 2, b10-shrinkwrap-st, REQ-FLOW-049): `st` gets its own
  // entry, which says once on stderr that the alias goes at 2.0.0 and then runs the same CLI, so the
  // two names no longer point at one file. `stamity` still resolves to the built CLI.
  it("resolves the long name to the built CLI and the alias to its own deprecation entry", () => {
    expect(pkg.bin).toEqual({ [UNSCOPED_NAME]: CLI_ENTRY, [SHORT_NAME]: ALIAS_ENTRY });
  });

  it("keeps a bin key equal to the unscoped package name, which is what `npx <package>` runs", () => {
    // The property, not the spelling: derived from `name` so that renaming the
    // package without renaming this key fails here instead of at a user's
    // first `npx`.
    expect(UNSCOPED_NAME).toBe("stamity");
    expect(
      Object.keys(pkg.bin),
      `npx ${pkg.name} has no bin named ${UNSCOPED_NAME}, so the documented install line stops resolving`,
    ).toContain(UNSCOPED_NAME);
  });

  it("targets a directory the published tarball actually ships", () => {
    // `files` is an allowlist: a bin pointing outside it installs as a symlink
    // to a path npm never unpacked, and the failure surfaces on a user's
    // machine rather than in this repository.
    // TEST CHANGE, justified (plan 022 file 2, b10-shrinkwrap-st, REQ-FLOW-049): both entries are
    // checked now that the alias has its own.
    for (const entry of [CLI_ENTRY, ALIAS_ENTRY]) {
      const [top] = entry.replace(/^\.\//, "").split("/");
      expect(pkg.files, `bin targets ${entry}, which \`files\` does not ship`).toContain(top);
    }
  });

  // ADDED by plan 022 file 2, b10-shrinkwrap-st (REQ-FLOW-049): npm packs a shrinkwrap only when
  // `files` names it, so the release pack's production npm-shrinkwrap.json would be left out without it.
  it("ships the release pack's npm-shrinkwrap.json beside dist", () => {
    expect(pkg.files).toEqual(["dist", "npm-shrinkwrap.json"]);
  });

  // ADDED by plan 022 file 2, b10-shrinkwrap-st (REQ-FLOW-049): the release shrinkwrap is the lock's
  // production rows, root row included, so a stale bin there ships in every tarball, and the next
  // `npm install` here rewrites it in an unrelated diff. npm writes the lock's paths without `./`.
  it("matches package-lock.json's root row bin to package.json's", () => {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf-8")) as {
      readonly packages: Record<string, { readonly bin?: Record<string, string> }>;
    };
    const expected = Object.fromEntries(Object.entries(pkg.bin).map(([name, entry]) => [name, entry.replace(/^\.\//, "")]));
    expect(lock.packages[""]?.bin).toEqual(expected);
  });
});
