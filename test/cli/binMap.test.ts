import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The published `bin` map, pinned — the one contract in package.json that no
 * test in this repository could previously see.
 *
 * Two names, one entry point: `stamity` is the long name and `st` is the short
 * alias added with the `st-` command rename, and both resolve to the built CLI.
 * That much a reader sees in package.json. What a reader does NOT see is why
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

/** The built entry both names resolve to. */
const CLI_ENTRY = "./dist/cli.js";

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

  it("resolves every installed name to the same built CLI entry", () => {
    const entries = Object.entries(pkg.bin);
    expect(entries.length, "the bin map is empty, so this case would assert nothing").toBe(2);
    for (const [name, target] of entries) expect(target, name).toBe(CLI_ENTRY);
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
    const [top] = CLI_ENTRY.replace(/^\.\//, "").split("/");
    expect(pkg.files, `bin targets ${CLI_ENTRY}, which \`files\` does not ship`).toContain(top);
  });
});
