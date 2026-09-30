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
 * channel ({@link CliCallOptions}).
 *
 * Throws `VALIDATION_ERROR` on an empty or unrunnable package name, and on a
 * version that is not semver-shaped: rendering either would emit a call that
 * fails, or one that silently runs a different version.
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
  return `npx ${npxFlag(opts)} ${packageName}@${version}`;
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
