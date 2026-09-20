import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as PackageNameApi from "../../../src/cli/kit/packageName.ts";
import {
  packageCommand,
  packageName,
  repositorySlug,
  resolveOwnPackageFacts,
} from "../../../src/cli/kit/packageName.ts";
import type * as PathsApi from "../../../src/shared/paths.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The fork-identity seam: every remedy the CLI prints names the package the
 * reader must run, and a downstream that followed `docs/enterprise-forks.md`
 * renamed it. Two lanes here:
 *
 * - the canonical lane runs against the REAL checkout and asserts the rendered
 *   command against `package.json`'s own `name` — never a literal, because a
 *   literal is exactly the pin that makes a renamed downstream red on its
 *   recommended gate (audit FORK-3);
 * - the renamed lane runs the real reader against a pseudo package root on
 *   disk, so the rename is proved end to end: a real manifest is read, a real
 *   name comes back, and the real renderer prints it.
 *
 * The one seam that is stubbed is where the walk-up STARTS. `resolveOwnPackageFacts`
 * anchors on `import.meta.url` — this module's own location inside the checkout —
 * which no test can relocate in-process, and anchoring on the cwd instead would
 * be the bug (the cwd is the user's repository, never the package being named).
 * So `findPackageRoot` is mocked to answer with the fixture root, and everything
 * after it — the manifest read, the JSON parse, the sentinel, the fallback and
 * the rendering — runs for real.
 */

const getFixture = useTempDir("stamity-package-name");

const KIT_MODULE = "../../../src/cli/kit/packageName.ts";
const PATHS_MODULE = "../../../src/shared/paths.ts";

afterEach(() => {
  vi.doUnmock(PATHS_MODULE);
  vi.resetModules();
});

/** Loads a fresh copy of the kit whose self-read resolves to `root`. */
async function loadKitRootedAt(root: string): Promise<typeof PackageNameApi> {
  vi.resetModules();
  vi.doMock(PATHS_MODULE, async (importOriginal) => {
    const actual = await importOriginal<typeof PathsApi>();
    return { ...actual, findPackageRoot: (): string => root };
  });
  return await import(KIT_MODULE);
}

async function ownPackageManifest(): Promise<{ name: string; version: string }> {
  const raw = await readFile(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8");
  return JSON.parse(raw) as { name: string; version: string };
}

describe("packageCommand — the canonical checkout", () => {
  it("names the package this checkout publishes under, read from its own manifest", async () => {
    const own = await ownPackageManifest();

    expect(packageName()).toBe(own.name);
    expect(packageCommand("init")).toBe(`npx ${own.name} init`);
    expect(resolveOwnPackageFacts()).toMatchObject({ name: own.name, version: own.version });
  });

  it("passes a multi-word remedy through as one tail", async () => {
    const own = await ownPackageManifest();

    expect(packageCommand("config mcp add <id>")).toBe(`npx ${own.name} config mcp add <id>`);
    expect(packageCommand("clean --pack <id>")).toBe(`npx ${own.name} clean --pack <id>`);
  });

  it("does not use the `st` bin alias — npx resolves a package name", () => {
    expect(packageCommand("sync").startsWith("npx ")).toBe(true);
    expect(packageCommand("sync")).not.toContain("npx st ");
  });
});

describe("packageCommand — a renamed private downstream", () => {
  it("renders the fork's own scope in the remedy", async () => {
    const fixture = getFixture();
    // Exactly what the guide's bootstrap block leaves behind: a renamed scope,
    // the publisher key, and `private: true`.
    await fixture.seedFiles({
      "package.json": `${JSON.stringify(
        {
          name: "@acme/stamity",
          version: "1.8.0",
          private: true,
          stamity: { publisher: "acme" },
        },
        null,
        2,
      )}\n`,
    });

    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.resolveOwnPackageFacts()).toEqual({
      name: "@acme/stamity",
      version: "1.8.0",
      isPrivate: true,
    });
    expect(kit.packageName()).toBe("@acme/stamity");
    expect(kit.packageCommand("init")).toBe("npx @acme/stamity init");
    expect(kit.packageCommand("sync")).toBe("npx @acme/stamity sync");
  });

  it("reads `private` in its hand-edited string form, and drops a non-string version", async () => {
    const fixture = getFixture();
    // `private: "true"` is the hand-edited spelling npm still honours; the
    // numeric version is the malformed-field case, which must not propagate a
    // non-string into a version comparison.
    await fixture.seedFiles({
      "package.json": `${JSON.stringify({ name: "@acme/stamity", version: 18, private: "true" })}\n`,
    });

    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.resolveOwnPackageFacts()).toEqual({
      name: "@acme/stamity",
      version: "",
      isPrivate: true,
    });
    expect(kit.packageCommand("init")).toBe("npx @acme/stamity init");
  });
});

describe("packageCommand — the unnamed sentinel", () => {
  it("falls back to the canonical name when the manifest carries no name", async () => {
    const fixture = getFixture();
    await fixture.seedFiles({ "package.json": `${JSON.stringify({ version: "1.8.0" })}\n` });

    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.resolveOwnPackageFacts()).toEqual({ name: "", version: "1.8.0", isPrivate: false });
    // The fallback is a canonical-source constant, not a pin on the running
    // manifest: a fork inherits this source unchanged, and a fork whose manifest
    // WAS read never reaches this branch.
    expect(kit.packageCommand("init")).toBe("npx @zomarit/stamity init");
  });

  it("falls back when the manifest is unreadable, and reports private so the notice stays silent", async () => {
    const fixture = getFixture();
    // No package.json at the fixture root at all: the read throws, which is the
    // same path a malformed manifest or a failed root walk takes.
    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.resolveOwnPackageFacts()).toEqual({ name: "", version: "", isPrivate: true });
    expect(kit.packageCommand("sync")).toBe("npx @zomarit/stamity sync");
  });

  it("falls back when the manifest parses to something that is not an object", async () => {
    const fixture = getFixture();
    await fixture.seedFiles({ "package.json": "null\n" });

    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.resolveOwnPackageFacts()).toEqual({ name: "", version: "", isPrivate: true });
    expect(kit.packageName()).toBe("@zomarit/stamity");
  });
});

/**
 * The repository slug — `owner/repo` — is the SECOND identity a remedy has to
 * be able to name, and it is not derivable from the package name: this package
 * publishes as `@zomarit/stamity` and its plugin distribution installs as
 * `zomarit/stamity#plugins/v<version>`, which share no substring at all. The
 * derivation mirrors `scripts/distribution-identity.mjs` so a dependency line
 * written by the release job is recognised by the CLI that shipped in it.
 */
describe("repositorySlug", () => {
  it("names this checkout's own owner/repo, derived from its manifest rather than typed", async () => {
    const raw = await readFile(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8");
    const manifest = JSON.parse(raw) as { repository?: { url?: string } };
    const expected = (manifest.repository?.url ?? "")
      .replace(/^git\+/, "")
      .replace(/\.git$/, "")
      .replace("https://github.com/", "");

    expect(repositorySlug()).toBe(expected);
  });

  it("normalizes the `git+https://....git` spelling npm writes into a bare owner/repo", async () => {
    const fixture = getFixture();
    await fixture.seedFiles({
      "package.json": `${JSON.stringify({
        name: "@acme/stamity",
        repository: { type: "git", url: "git+https://github.com/acme/stamity-fork.git" },
      })}\n`,
    });

    const kit = await loadKitRootedAt(fixture.dir);

    expect(kit.repositorySlug()).toBe("acme/stamity-fork");
  });

  // Three shapes that carry no derivable slug: another forge, the string
  // shorthand `scripts/distribution-identity.mjs` does not read, and nothing.
  // One case each, because the reader is memoized per module load and a loop
  // would have to re-mock the module seam inside its own body.
  it.each([
    ["another forge", { url: "https://gitlab.com/acme/stamity" }],
    ["the owner/repo shorthand", "acme/stamity"],
    ["no repository field at all", undefined],
  ])(
    "answers null for %s, rather than inventing a slug",
    async (_label, repository) => {
      const fixture = getFixture();
      await fixture.seedFiles({
        "package.json": `${JSON.stringify({ name: "@acme/stamity", repository })}\n`,
      });

      const kit = await loadKitRootedAt(fixture.dir);

      expect(kit.repositorySlug()).toBeNull();
    },
  );
});
