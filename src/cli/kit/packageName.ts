import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinnedCliCall, scopeRegistryArg } from "../../shared/cliCall.ts";
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
 *
 * Exported for one reader, a test: the wave-1 kernel `src/shared/cliCall.ts`
 * keeps a literal twin (`DEFAULT_CLI_PACKAGE_NAME`) it cannot import from here,
 * and `test/shared/cliCall.test.ts` holds the two equal.
 */
export const CANONICAL_PACKAGE_NAME = "@zomarit/stamity";

/** Fallback facts: unnamed and private, so the update notice stays silent. */
const UNKNOWN_PACKAGE_FACTS = { name: "", version: "", isPrivate: true, registry: null } as const;

/** What {@link resolveOwnPackageFacts} answers. */
export interface OwnPackageFacts {
  name: string;
  version: string;
  isPrivate: boolean;
  /**
   * `publishConfig.registry` as a non-empty string, else `null`. A fork made
   * with `scripts/fork-identity.mjs --registry` publishes there, so it is the
   * registry the update notice asks about that fork's name — never the public
   * one, where the fork's scope may be anybody's.
   */
  registry: string | null;
}

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
export function resolveOwnPackageFacts(): OwnPackageFacts {
  return factsOf(readOwnManifest());
}

/** {@link resolveOwnPackageFacts} over a manifest already read. */
function factsOf(parsed: Record<string, unknown> | null): OwnPackageFacts {
  if (parsed === null) return UNKNOWN_PACKAGE_FACTS;
  const { name, version, private: isPrivate, publishConfig } = parsed;
  const registry =
    typeof publishConfig === "object" && publishConfig !== null
      ? (publishConfig as Record<string, unknown>)["registry"]
      : undefined;
  return {
    name: typeof name === "string" ? name : "",
    version: typeof version === "string" ? version : "",
    // `private` is a boolean in the npm schema, but the string form appears in
    // hand-edited manifests; both mean "do not publish", so both suppress.
    isPrivate: isPrivate === true || isPrivate === "true",
    registry: typeof registry === "string" && registry !== "" ? registry : null,
  };
}

/** What a pinned call needs to know about this installation, from one read. */
interface OwnCallIdentity {
  name: string;
  npmChannel: boolean;
  /** The registry the call names for the package's scope; `null`: npm's configuration decides. */
  registry: string | null;
}

/**
 * Memoized because every remedy line asks again: the answer cannot change
 * inside one process (the manifest being read is the running package's own),
 * and the read is a directory walk plus a parse. The name, the npm-channel
 * decision and the registry come from ONE read, so the call can never name one
 * manifest's package with another manifest's channel or registry.
 */
let cachedIdentity: OwnCallIdentity | null = null;

function ownCallIdentity(): OwnCallIdentity {
  if (cachedIdentity === null) {
    const { name, isPrivate, registry } = factsOf(readOwnManifest());
    cachedIdentity =
      // The empty name is the unnamed sentinel above, and the only path to the
      // canonical fallback: a manifest that WAS read answers with its own name,
      // renamed or not. The canonical package is published, so it has a channel.
      name === ""
        ? { name: CANONICAL_PACKAGE_NAME, npmChannel: true, registry: null }
        : registry === null
          ? { name, npmChannel: !isPrivate, registry: null }
          : writableRegistry(name, registry)
            ? { name, npmChannel: true, registry }
            : // Fail closed (REQ-PLUGIN-048): a registry the call cannot write — not a
              // plain https URL, or named for an unscoped package — is never rendered,
              // and a bare `-y` call would ask the default registry for the name.
              // `npx --no` runs an installed copy and fetches nothing.
              { name, npmChannel: false, registry: null };
  }
  return cachedIdentity;
}

/** Whether {@link scopeRegistryArg} renders `registry` for `name`, rather than refusing it. */
function writableRegistry(name: string, registry: string): boolean {
  try {
    scopeRegistryArg(name, registry);
    return true;
  } catch {
    return false;
  }
}

/**
 * The package name `npx` resolves for this installation — the fork's scope in a
 * renamed private copy, the canonical name here.
 */
export function packageName(): string {
  return ownCallIdentity().name;
}

/**
 * Whether this installation's package has an npm channel — a registry that
 * serves it under {@link packageName}.
 *
 * `false` for exactly the registry-less fork `docs/enterprise-forks.md`
 * describes: a manifest that is `private` (the boolean, or the hand-edited
 * string {@link resolveOwnPackageFacts} also reads) and names no
 * `publishConfig.registry`. Its name is a public, predictable scope nobody
 * publishes, so a `npx -y` call would install whatever a third party put on
 * the public registry under it. Every pinned call then renders `npx --no`,
 * which runs a copy the project already has installed and refuses to fetch one
 * (`../../shared/cliCall.ts`). The canonical build, a fork made with
 * `--registry`, and the failed-self-read fallback (the canonical name) all
 * answer `true` and keep `npx -y`. A `publishConfig.registry` the call cannot
 * write ({@link npmRegistry}) answers `false` as well: the bare `-y` call would
 * ask the default registry for the fork's name.
 */
export function hasNpmChannel(): boolean {
  return ownCallIdentity().npmChannel;
}

/**
 * The registry every pinned call names for this installation's scope: a fork's
 * `publishConfig.registry` (`scripts/fork-identity.mjs --registry`), so a
 * machine without the scope mapping takes the fork's package from the fork's
 * registry rather than whatever the default one serves under the name
 * (REQ-PLUGIN-048). `null` for the canonical build and a registry-less fork, and
 * for a registry the call cannot write, which also costs the fork its channel
 * ({@link hasNpmChannel} false, so the call renders `npx --no`).
 */
export function npmRegistry(): string | null {
  return ownCallIdentity().registry;
}

/**
 * The `npmRegistry` an emission context carries, for `planSync` and
 * `applyInit`: the caller's own when it names one; else this installation's
 * ({@link npmRegistry}) when the caller left the package name to this
 * installation too; else none. A caller that pins the name (a fixture rendering
 * checkout-independent bytes) pins the registry beside it, so a pinned name
 * never meets the registry of whatever checkout runs it — the one-read rule of
 * {@link ownCallIdentity}, applied to a pinned name.
 */
export function registryOption(opts: {
  readonly packageName?: string;
  readonly npmRegistry?: string;
}): { npmRegistry?: string } {
  const registry = opts.npmRegistry ?? (opts.packageName === undefined ? npmRegistry() : null);
  return registry === null ? {} : { npmRegistry: registry };
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

/** Memoized like {@link cachedName}: the running package's version cannot change mid-process. */
let cachedVersion: string | null = null;

/**
 * A runnable invocation of this package, pinned to the running version:
 * `npx -y <own name>@<own version> <verb>` (`../../shared/cliCall.ts`, the one
 * spelling the emitted bodies and hook hints use too); `npx --no …` when the
 * package has no npm channel ({@link hasNpmChannel}); with the scope's
 * registry ahead of the spec when the fork names one ({@link npmRegistry}).
 *
 * Pinned because a remedy names flags and state this version understands; an
 * unpinned `npx <name>` runs whatever the registry serves today. `-y` because
 * the reader is as often an agent's shell, which cannot answer npx's prompt.
 *
 * `verb` is the whole tail, so a multi-word remedy passes as one argument —
 * `packageCommand("config mcp add <id>")`.
 *
 * With no pinnable version — the self-read found none, or one that is not
 * semver-shaped — the remedy keeps the unpinned `npx <name> <verb>`. A remedy
 * prints on an error path, and a rendering failure there would replace the
 * operator's real diagnosis; an unpinned call is the lesser defect. A package
 * with no npm channel keeps `--no` there too (`npx --no <name> <verb>`), so
 * the unpinned remedy still never fetches a copy.
 */
export function packageCommand(verb: string): string {
  cachedVersion ??= resolveOwnPackageFacts().version;
  return packageCommandAt(cachedVersion, verb);
}

/**
 * {@link packageCommand} pinned to `version` instead of the running one: the
 * remedy that asks for another release (`check --expect-version`) runs that
 * release. The name, the channel and the registry come from the same one read
 * {@link packageCommand} takes, so the two remedies never differ for one
 * installation — a registry fork's call names its registry here too
 * (REQ-PLUGIN-048). An empty or unpinnable `version` takes the same unpinned
 * fallback.
 */
export function packageCommandAt(version: string, verb: string): string {
  const { name, npmChannel, registry } = ownCallIdentity();
  const opts = { npmChannel, ...(registry === null ? {} : { registry }) };
  if (version !== "") {
    try {
      return pinnedCliCall(name, version, verb, opts);
    } catch {
      // Unpinnable (see packageCommand): fall through to the unpinned form.
    }
  }
  // The registry was proven writable when the identity was read, so the
  // argument renders here without throwing.
  const words = ["npx", npmChannel ? "" : "--no", scopeRegistryArg(name, opts.registry), name, verb];
  return words.filter((word) => word !== "").join(" ");
}
