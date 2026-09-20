import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPackageRoot } from "../../shared/paths.ts";

/**
 * Who this installation IS, and how a user re-invokes it.
 *
 * Every remedy string the CLI prints ("run: npx … init", "npx … sync rewrites
 * them now") names a package that has to exist on a registry the reader can
 * reach. A downstream that followed `docs/enterprise-forks.md` renamed the
 * package to its own scope and set `private: true`, so a hardcoded canonical
 * name in those strings sends its operators at a package their npx cannot
 * install — and at the wrong product besides. The name is therefore read from
 * the running package's own `package.json`, exactly as the update notice reads
 * the version it compares.
 *
 * The self-read walks up from THIS module's directory rather than the process
 * cwd, so it answers identically from a `src` checkout, from the published
 * `dist` bundle, and from a copy vendored inside another repository — the cwd
 * is the user's repo, which is never the package being named.
 *
 * Deliberately not the `st` bin alias: `npx` resolves a PACKAGE name, and `st`
 * is only the shorthand that exists once the package is installed.
 */

/** The module's own directory — the start of the self-read's walk up. */
const OWN_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The canonical build's published name. It is used for exactly one case: the
 * unnamed sentinel below, reached when the self-read failed (no package root,
 * unreadable or malformed `package.json`, a manifest with no `name`). A remedy
 * has to name something runnable, and the only name we can assert without a
 * manifest is the one this source tree ships under; a fork that renamed its
 * manifest is, by definition, not in the failed-self-read case.
 */
const CANONICAL_PACKAGE_NAME = "@zomarit/stamity";

/** Fallback facts: unnamed and private, so the update notice stays silent. */
const UNKNOWN_PACKAGE_FACTS = { name: "", version: "", isPrivate: true } as const;

/**
 * This package's own `package.json`, parsed, or `null` when there is nothing
 * to read one from — no package root, an unreadable or malformed manifest, or a
 * document whose root is not an object.
 *
 * One read behind both self-describing answers below, so a manifest that
 * answers the name cannot fail to answer the slug and vice versa.
 */
function readOwnManifest(): Record<string, unknown> | null {
  try {
    const root = findPackageRoot(OWN_DIR);
    const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read this package's own name/version/private flag by walking up from this
 * module's directory, so a caller self-describes identically from a `src`
 * checkout and from the published `dist` layout.
 *
 * Any failure — no package root, unreadable or malformed `package.json` — falls
 * back to a private-marked record with an empty name. For the update notice
 * that routes into its unpublishable-manifest no-op; for {@link packageName}
 * it selects {@link CANONICAL_PACKAGE_NAME}. Failing toward silence is the only
 * safe direction for a self-read that decorates other output.
 */
export function resolveOwnPackageFacts(): { name: string; version: string; isPrivate: boolean } {
  const parsed = readOwnManifest();
  if (parsed === null) return UNKNOWN_PACKAGE_FACTS;
  const { name, version, private: isPrivate } = parsed;
  return {
    name: typeof name === "string" ? name : "",
    version: typeof version === "string" ? version : "",
    // `private` is a boolean in the npm schema, but the string form appears in
    // hand-edited manifests; both mean "do not publish", so both suppress.
    isPrivate: isPrivate === true || isPrivate === "true",
  };
}

/**
 * Memoized because every remedy line asks again: the answer cannot change
 * inside one process (the manifest being read is the running package's own),
 * and the read is a directory walk plus a parse.
 */
let cachedName: string | null = null;

/**
 * The package name `npx` resolves for this installation — the fork's scope in a
 * renamed private copy, the canonical name here.
 */
export function packageName(): string {
  if (cachedName === null) {
    const { name } = resolveOwnPackageFacts();
    // The empty name is the unnamed sentinel above, and the only path to the
    // canonical fallback: a manifest that WAS read answers with its own name,
    // renamed or not.
    cachedName = name === "" ? CANONICAL_PACKAGE_NAME : name;
  }
  return cachedName;
}

/**
 * The repository this installation was built from, as `<owner>/<repo>`.
 *
 * A SECOND identity, and not derivable from the first. `packageName()` answers
 * the registry name (`@zomarit/stamity`); the plugin distribution this release
 * publishes is addressed by the repository slug instead — an APM dependency on
 * it reads `zomarit/stamity#plugins/v<version>` and a marketplace is added with
 * `<slug>#<ref>`. The two share no substring, so a surface that matches one
 * while the operator wrote the other sees nothing.
 *
 * Derived exactly as `scripts/distribution-identity.mjs` derives it, because
 * the string being recognised is the one that generator wrote: `repository.url`
 * with npm's `git+` prefix and `.git` suffix removed, then required to be a
 * bare `https://github.com/<owner>/<repo>`. `null` for anything else — another
 * forge, the `"owner/repo"` shorthand that generator does not read, a manifest
 * that names no repository — because a guessed slug would match a dependency
 * line belonging to somebody else.
 */
const GITHUB_REPOSITORY_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/;

/** `undefined` until computed; `null` is the answer "this manifest names none". */
let cachedSlug: string | null | undefined;

export function repositorySlug(): string | null {
  if (cachedSlug === undefined) {
    const repository = readOwnManifest()?.["repository"];
    const url =
      typeof repository === "object" && repository !== null
        ? (repository as Record<string, unknown>)["url"]
        : undefined;
    const normalized =
      typeof url === "string" ? url.replace(/^git\+/, "").replace(/\.git$/, "") : "";
    const match = GITHUB_REPOSITORY_URL.exec(normalized);
    cachedSlug = match === null ? null : `${match[1]}/${match[2]}`;
  }
  return cachedSlug;
}

/**
 * A runnable invocation of this package: `npx <own name> <verb>`.
 *
 * `verb` is the whole tail, so a multi-word remedy passes as one argument —
 * `packageCommand("config mcp add <id>")`.
 */
export function packageCommand(verb: string): string {
  return `npx ${packageName()} ${verb}`;
}
