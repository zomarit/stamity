import { EngineError } from "../types/errors.ts";

/**
 * The pinned CLI call: how an emitted body, a hook hint or a remedy runs this
 * package — `npx -y <package>@<version> <verb>`.
 *
 * Both halves of the pin are load-bearing. A bare `stamity <verb>` resolves
 * only where a global install put the binary on PATH, which the documented
 * `npx` setup never does, so a body telling an agent to run it fails on the
 * first call. An unpinned `npx <package>` (or `@latest`) runs whatever the
 * registry serves today, so a body generated at one version would drive
 * another — the flags, the ledger grammar and the state layout it assumes can
 * all have moved. The version pinned is the one the setup was generated with.
 * `-y` is there because an agent's shell cannot answer npx's install prompt.
 *
 * A package with no npm channel renders `npx --no` in place of `-y` (see
 * {@link CliCallOptions}): npm then runs a copy the project already has
 * installed at that version and refuses to fetch one.
 *
 * A wave-1 kernel with no inputs but its arguments: the emission layer renders
 * the `${STAMITY:CLI}` token through {@link pinnedCliPrefix}, and the CLI's own
 * remedy text through {@link pinnedCliCall}, so both spell the call one way.
 * The only import is the error type, as for the other shared leaves.
 */

/**
 * The canonical build's published name — the package an emission names when
 * its context carries no other. A literal twin of the kit's
 * `CANONICAL_PACKAGE_NAME` (`src/cli/kit/packageName.ts`), held equal by
 * `test/shared/cliCall.test.ts`: the kit sits thirteen waves above this module
 * and cannot be imported from it. A fork that renamed its package passes its
 * own name in the emission context instead.
 */
export const DEFAULT_CLI_PACKAGE_NAME = "@zomarit/stamity";

/**
 * A runnable npm package name: an optional `@scope/` and a name, lower-case,
 * each part opening on a letter or digit. Stricter than the registry's legacy
 * grammar on purpose — the name is written into a shell command in every
 * emitted body, where a leading `-` would read as an npx flag and whitespace
 * or a metacharacter would split or extend the command.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * A semver-shaped version: `MAJOR.MINOR.PATCH`, no leading zeros, an optional
 * prerelease and optional build metadata. `latest`, a range and an empty
 * string all fail it, which is the point — each renders an unpinned call.
 */
const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * How the pinned call may obtain the package. Optional everywhere, and its
 * absence is the canonical case, so every caller that names none renders the
 * `npx -y` call it always did.
 */
export interface CliCallOptions {
  /**
   * Whether the package has an npm channel — a registry that serves it. `true`
   * or absent: `npx -y`, which fetches the pinned version when the project has
   * none. `false`: `npx --no`, which runs a copy already installed in the
   * project and refuses to fetch one. A fork that never publishes (private, no
   * `publishConfig.registry`) has a name nobody holds on the public registry,
   * and a `-y` call would install whatever a third party published there under
   * it; `--no` fails closed instead (`docs/enterprise-forks.md`).
   */
  readonly npmChannel?: boolean;
  /**
   * The registry that serves the package's scope (a fork's
   * `publishConfig.registry`); absent: npm's configuration decides. npx finds a
   * scope's registry only in that configuration, so on a machine without the
   * scope mapping a bare call asks the default registry, where anyone may hold
   * the name. Named, the call carries `--@<scope>:registry=<url>` ahead of the
   * spec ({@link scopeRegistryArg}).
   */
  readonly registry?: string;
}

/**
 * The registry URLs a call may name: plain https, a host, an optional port from
 * 1 to 65535 written without a leading zero (a larger one is no URL at all, and
 * a call naming it fetches nothing) and an optional path of unreserved
 * characters. No userinfo, query, fragment, `%`,
 * `$`, quote, backtick, space or `^`: the value enters sh, cmd, PowerShell,
 * JavaScript strings and JSON, so refusing beats escaping it for four dialects.
 * Restated in `scripts/plugins/tokens.mjs`, held equal by
 * `test/ci/pluginModules.test.ts`.
 */
export const REGISTRY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\/[A-Za-z0-9._~/-]*)?$/;

/**
 * `--@<scope>:registry=<url>` — npm's per-scope registry setting as one argv
 * word — or `""` when `registry` is absent. It must precede the package spec:
 * npx hands everything after the spec to the package.
 *
 * Only a scoped name can carry it. `--registry=<url>` would send every
 * dependency to the fork's registry too, where npm then fails with a 404.
 * Throws `VALIDATION_ERROR` for an unscoped name with a registry, and for a URL
 * outside {@link REGISTRY_URL}; the message names the rule, never the value,
 * which may carry credentials.
 */
export function scopeRegistryArg(packageName: string, registry: string | undefined): string {
  if (registry === undefined) return "";
  const scope = /^(@[^/]+)\//.exec(packageName)?.[1];
  if (scope === undefined) {
    throw new EngineError(
      "Cannot render the pinned CLI call: an unscoped package cannot name a scope registry; " +
        "--registry would send every dependency there.",
      { code: "VALIDATION_ERROR" },
    );
  }
  if (!REGISTRY_URL.test(registry)) {
    throw new EngineError(
      `Cannot render the pinned CLI call: the registry named for ${scope} is not a plain https URL, ` +
        "so it is not written into a command.",
      { code: "VALIDATION_ERROR" },
    );
  }
  return `--${scope}:registry=${registry}`;
}

/**
 * The npx flag an {@link CliCallOptions} selects. `--no` is npx's shorthand
 * for `--no-yes`. npx's argument scan takes the package as that flag's value,
 * so a flag between the package and the first plain word goes to npm, not to
 * the package (`npx --no <pkg>@<v> --version` prints npm's own version). Every
 * call here puts a verb right after the package, and a verb never opens with `-`.
 */
function npxFlag(opts: CliCallOptions): string {
  return opts.npmChannel === false ? "--no" : "-y";
}

/**
 * `npx -y <packageName>@<version>` — the pinned call without a verb, which is
 * what the `${STAMITY:CLI}` token renders to so a body can write
 * `${STAMITY:CLI} <verb>` in prose. `npx --no …` for a package with no npm
 * channel, and `npx -y --@<scope>:registry=<url> …` for a package whose scope
 * names its registry ({@link CliCallOptions}); without one the string is what
 * it always was.
 *
 * Throws `VALIDATION_ERROR` on an empty or unrunnable package name, on a
 * version that is not semver-shaped — rendering either would emit a call that
 * fails, or one that silently runs a different version — and on a registry
 * {@link scopeRegistryArg} refuses.
 */
export function pinnedCliPrefix(
  packageName: string,
  version: string,
  opts: CliCallOptions = {},
): string {
  if (!PACKAGE_NAME.test(packageName)) {
    throw new EngineError(
      `Cannot render the pinned CLI call: ${JSON.stringify(packageName)} is not a runnable npm package name.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  if (!SEMVER.test(version)) {
    throw new EngineError(
      `Cannot render the pinned CLI call: version ${JSON.stringify(version)} is not semver-shaped, ` +
        "and an unpinned call would run whatever version the registry serves.",
      { code: "VALIDATION_ERROR" },
    );
  }
  const words = ["npx", npxFlag(opts), scopeRegistryArg(packageName, opts.registry), `${packageName}@${version}`];
  return words.filter((word) => word !== "").join(" ");
}

/**
 * `npx -y <packageName>@<version> <verb>`. `verb` is the whole tail, so a
 * multi-word call passes as one argument — `pinnedCliCall(name, v, "learn capture")`.
 * Throws as {@link pinnedCliPrefix} does.
 */
export function pinnedCliCall(
  packageName: string,
  version: string,
  verb: string,
  opts: CliCallOptions = {},
): string {
  return `${pinnedCliPrefix(packageName, version, opts)} ${verb}`;
}

/**
 * The CLI call as a hint a person or an agent reads:
 * `` `stamity <verb>` where the CLI is installed, else `npx -y <package>@<version> <verb>` ``.
 *
 * For prose inside generated files — hook messages, guard refusals, the notes a
 * client configuration document carries — where the reader may well have the
 * binary on PATH, and the short form is what they would type. The pinned call
 * rides beside it, so the hint still runs on the documented `npx` setup, which
 * installs no binary. The bare verb is admitted in generated text only inside
 * this sentence. Throws as {@link pinnedCliPrefix} does.
 *
 * The backticks are part of the sentence. A caller that embeds it where a
 * backtick is shell syntax (a double-quoted `node -e` program, say) takes
 * {@link pinnedCliCall} instead.
 */
export function cliCallHint(
  packageName: string,
  version: string,
  verb: string,
  opts: CliCallOptions = {},
): string {
  return `\`stamity ${verb}\` where the CLI is installed, else \`${pinnedCliCall(packageName, version, verb, opts)}\``;
}
