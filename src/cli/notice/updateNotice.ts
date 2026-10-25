import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import semver from "semver";
import { isSemverShaped, pinnedCliCall } from "../../shared/cliCall.ts";
import { MANIFEST_FILE } from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { readRegularFile } from "../engine/autonomyGate.ts";
import type { OwnPackageFacts } from "../kit/packageName.ts";

/**
 * The startup update notice: async, cached, silent-fail, opt-out-able, and
 * explicitly NOT a self-updater. Nothing here rewrites an install — the banner
 * names the move, `upgrade` run by the newer release
 * (`npx -y <name>@<newer version> upgrade --to <newer version>`, REQ-FLOW-048),
 * which runs that release's sync and moves the repository's `package.json` pin,
 * because a newer CLI does nothing for the user's repo until the managed blocks
 * regenerate. A release older than {@link FIRST_UPGRADE_RELEASE} has no
 * `upgrade` verb, so a move to one names its `sync`. It names the exact
 * version, never `@latest`, and says how to stay on the pinned one, since a
 * setup pinned to its version is a choice.
 *
 * It asks only where its banner can show ({@link shouldProbeNotice}): stderr
 * is a terminal and the run is not `--json`. It compares the registry with the
 * version the repository pins ({@link readRepositoryPin}), not only with the
 * running one, so an `npx` run of a newer release in a repository pinned to an
 * older one still names the move.
 *
 * Zero new dependencies: global `fetch` plus one JSON stamp file. `semver` is
 * already the engine's version comparator, so the guard reuses it rather than
 * hand-rolling a compare.
 *
 * {@link checkForUpdateNotice} is a decision chain; each step short-circuits to
 * `null`:
 *
 *  1. **Env opt-outs.** `STAMITY_NO_UPDATE_CHECK` set to `1`, `true` or `yes`
 *     (ours, trimmed, any case), plus the two ecosystem-wide switches
 *     `NO_UPDATE_NOTIFIER` and `CI` on any non-empty value.
 *  2. **`isPrivate` — the unpublishable-manifest no-op.** `package.json`
 *     `private: true` forbids publishing, so no registry entry can exist and
 *     probing for one is guaranteed-useless traffic. This package does not set
 *     the flag; the step is reached by a fork or vendored copy that does, and by
 *     the unreadable-manifest fallback in {@link resolveOwnPackageFacts}, which
 *     reports private so a failed self-read stays silent instead of probing a
 *     name it could not confirm. Returns before ANY filesystem or network IO.
 *  3. **Fresh cache.** A stamp younger than `ttlMs` answers without a network
 *     call — including a stamp that recorded a failure, so a broken network is
 *     probed once a day, not once a run.
 *  4. **Live probe.** `GET {registryBaseUrl}/{packageName}/latest`, bounded by
 *     `AbortSignal.timeout`. Any failure — DNS, non-2xx, malformed body, abort
 *     — is `null`, and a stamp is written regardless.
 *  5. **Strictly-greater guard.** A banner appears only when the registry
 *     answer is valid semver strictly above the repository's pin (else the
 *     running version). A registry
 *     that answers with an equal or lower version must never produce a
 *     downgrade prompt or an equal-version nag — not a hypothetical: the
 *     `latest` dist-tag for this name currently sits BEHIND the shipped
 *     version, and that pairing must stay silent.
 *
 * The module never prints and never throws: the caller fires it un-awaited at
 * startup, where a rejection would surface as a fatal unhandled rejection, and
 * decides placement (stderr, after the command, only when stderr is a TTY).
 */

/**
 * The package self-read lives in the CLI kit, because the remedy strings the
 * commands print name the same package this notice names, and the kit sits
 * below both. Re-exported here so this module stays the one import site for
 * everything the startup notice needs — `src/cli.ts` reads the facts from here
 * and hands them straight back in {@link UpdateNoticeOptions}.
 */
export { resolveOwnPackageFacts } from "../kit/packageName.ts";

/** Trust window for a probe answer: one day, matching the ecosystem default. */
export const DEFAULT_NOTICE_TTL_MS: number = 24 * 60 * 60 * 1000;

/**
 * Hard cap on the live probe. Short on purpose: the probe races the command it
 * decorates, and an unreachable registry must never be something the user can
 * feel. Missing the window costs nothing — the answer is a banner.
 */
export const DEFAULT_NOTICE_TIMEOUT_MS: number = 1_500;

/** Public npm registry. Overridable so private registries and tests can retarget. */
export const DEFAULT_REGISTRY_BASE_URL: string = "https://registry.npmjs.org";

/**
 * The stamp file inside {@link noticeCacheDir}, keyed by package name with `/`
 * and `@` read as `-` (`@zomarit/stamity` -> `update-check--zomarit-stamity.json`),
 * so a fork and the canonical build on one machine never answer each other's
 * probe (REQ-FLOW-048).
 */
function cacheFileName(packageName: string): string {
  return `update-check-${packageName.replace(/[/@]/g, "-")}.json`;
}

/**
 * The first release with the `upgrade` verb. A move to an older release names
 * that release's `sync`, the update path it shipped with: its CLI answers
 * `upgrade` with "unknown command".
 */
const FIRST_UPGRADE_RELEASE = "1.17.0";

/**
 * The verb a move to `target` runs: `upgrade --to <target>` from
 * {@link FIRST_UPGRADE_RELEASE} on, else `sync`. `target` is semver-valid.
 * The compare reads the release's major.minor.patch alone, so a prerelease of
 * 1.17.0 or later (a fork's `1.17.0-fork.1` included), which semver orders
 * below its release, gets the `upgrade` form its CLI carries.
 */
export function moveVerb(target: string): string {
  const release = semver.coerce(target) ?? target;
  return semver.gte(release, FIRST_UPGRADE_RELEASE) ? `upgrade --to ${target}` : "sync";
}

/**
 * Cache namespace under the user's cache root, derived from the state-directory
 * constant (`.stamity` -> `stamity`) so the product token keeps exactly one
 * physical home: renaming the state directory carries the cache namespace with
 * it, and no second literal can drift out of step.
 */
const CACHE_NAMESPACE = STATE_DIR.startsWith(".") ? STATE_DIR.slice(1) : STATE_DIR;

export interface UpdateNoticeOptions {
  /** Registry package name; also what the banner tells the user to run. */
  packageName: string;
  /** Version currently running, from the package's own `package.json`. */
  currentVersion: string;
  /**
   * The version the repository pins ({@link readRepositoryPin}), which the
   * banner compares with and names as the one to stay on. Absent or `null`:
   * the running version.
   */
  repositoryPin?: string | null;
  /** `package.json` `private: true` — the unpublishable-manifest no-op (step 2). */
  isPrivate: boolean;
  /** Environment to read opt-outs from. Injected, never `process.env` directly. */
  env: Readonly<Record<string, string | undefined>>;
  /** Directory holding the stamp file; created on demand. See {@link noticeCacheDir}. */
  cacheDir: string;
  /** Registry origin. Defaults to {@link DEFAULT_REGISTRY_BASE_URL}. */
  registryBaseUrl?: string;
  /**
   * The registry the move command names for the package's scope
   * (`CliCallOptions.registry` in `../../shared/cliCall.ts`): a `--registry`
   * fork's own, so the banner's call fetches the fork's build where the probe
   * found it. Absent: the command names none. {@link registryBaseUrl} stays the
   * probe's seam.
   */
  packageRegistry?: string;
  /** Fetch seam. Defaults to global `fetch`; tests pass a stub. */
  fetchImpl?: typeof fetch;
  /** Cache trust window. Defaults to {@link DEFAULT_NOTICE_TTL_MS}. */
  ttlMs?: number;
  /** Probe deadline. Defaults to {@link DEFAULT_NOTICE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Clock seam for freshness math. Defaults to the real clock. */
  now?: () => Date;
}

/** What the stamp file holds. `latest: null` records a probe that failed. */
interface CacheStamp {
  checkedAt: string;
  latest: string | null;
}

/**
 * The startup options for this running package, from ONE manifest read: the
 * name the banner names and the registry it asks come from the same facts.
 *
 * A manifest naming `publishConfig.registry` — a fork made with
 * `scripts/fork-identity.mjs --registry` — is probed at that registry and never
 * at {@link DEFAULT_REGISTRY_BASE_URL}: the fork's scope on the public registry
 * may be held by anybody, and a banner built from that answer would hand every
 * operator a third party's version as the CLI's own move command. The probe
 * sends no credentials, so a registry that needs them answers non-2xx and the
 * notice stays silent (step 4). The canonical build names no registry and keeps
 * the default; a package with no npm channel is `private` and stops at step 2.
 */
export function noticeOptionsFromFacts(
  facts: OwnPackageFacts,
  env: Readonly<Record<string, string | undefined>>,
  cacheDir: string,
  repositoryPin: string | null = null,
): UpdateNoticeOptions {
  return {
    packageName: facts.name,
    currentVersion: facts.version,
    repositoryPin,
    isPrivate: facts.isPrivate,
    env,
    cacheDir,
    ...(facts.registry === null ? {} : { registryBaseUrl: facts.registry, packageRegistry: facts.registry }),
  };
}

/**
 * Resolve the update banner for this run, or `null` when there is nothing to
 * say. Never throws, never prints, never rejects.
 */
export async function checkForUpdateNotice(opts: UpdateNoticeOptions): Promise<string | null> {
  try {
    // (1) Opt-outs, before anything else — an opted-out run must be indistinguishable
    // from a run of a build that has no notice at all.
    if (isOptedOut(opts.env)) return null;

    // (2) The unpublishable-manifest no-op, ahead of every filesystem and network
    // touch: a manifest that forbids publishing has no registry entry to ask
    // about, and a manifest we failed to read reports private for the same reason.
    if (opts.isPrivate) return null;

    const ttlMs = opts.ttlMs ?? DEFAULT_NOTICE_TTL_MS;
    const now = opts.now?.() ?? new Date();
    const cachePath = join(opts.cacheDir, cacheFileName(opts.packageName));

    // (3) A stamp inside the trust window answers offline.
    const cached = await readCache(cachePath);
    if (cached !== null && isFresh(cached.checkedAt, now, ttlMs)) {
      return buildBanner(opts, cached.latest);
    }

    // (4) Live probe. Failure is an answer of `null`, not an exception.
    const latest = await probeRegistry(opts);

    // (5) The guard runs BEFORE the cache write, so a read-only cache directory
    // still gets its banner — the stamp is an optimization, never a precondition.
    const banner = buildBanner(opts, latest);
    await writeCache(cachePath, { checkedAt: now.toISOString(), latest });
    return banner;
  } catch {
    // Last-resort net. The caller fires this un-awaited at startup, so a
    // rejection escaping here would become an unhandled rejection and take down
    // a command that otherwise succeeded. A missing banner is the correct
    // failure mode for a cosmetic feature.
    return null;
  }
}

/**
 * Where the stamp lives: `$XDG_CACHE_HOME/stamity` when that variable is set to
 * a non-empty value, else `<home>/.cache/stamity`. An empty string is treated as
 * unset — the XDG spec calls an empty value invalid, and honoring it literally
 * would put the cache at the filesystem root.
 *
 * The cache root is used rather than a config root on purpose: everything here
 * is regenerable, and deleting it costs one extra registry call.
 */
export function noticeCacheDir(
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
): string {
  const xdg = env.XDG_CACHE_HOME;
  const base = xdg !== undefined && xdg !== "" ? xdg : join(homeDir, ".cache");
  return join(base, CACHE_NAMESPACE);
}

/**
 * `STAMITY_NO_UPDATE_CHECK` matches `1`, `true` or `yes`, trimmed and in any
 * case (our documented switch, REQ-FLOW-048), so `0` and `false` leave the
 * notice on; the two ecosystem variables suppress on any non-empty value,
 * because that is how the tools that set them use them — CI runners export
 * `CI=true`, not `CI=1`.
 */
function isOptedOut(env: Readonly<Record<string, string | undefined>>): boolean {
  const ours = (env.STAMITY_NO_UPDATE_CHECK ?? "").trim().toLowerCase();
  if (ours === "1" || ours === "true" || ours === "yes") return true;
  if ((env.NO_UPDATE_NOTIFIER ?? "") !== "") return true;
  return (env.CI ?? "") !== "";
}

/**
 * Freshness by elapsed time since the stamp. Two behaviours fall out of the
 * subtraction and are both deliberate:
 *
 *  - **Clock skew.** A `checkedAt` in the future yields a negative delta, which
 *    reads as fresh. The alternative — treating it as stale — turns a skewed
 *    clock into a probe on every single run, which is the worse failure.
 *  - **Garbage timestamps.** An unparseable `checkedAt` yields `NaN`, and every
 *    `NaN` comparison is false, so the stamp reads as stale and gets rewritten.
 */
function isFresh(checkedAt: string, now: Date, ttlMs: number): boolean {
  return now.getTime() - Date.parse(checkedAt) < ttlMs;
}

/** The stamp on disk, or `null` when it is absent, unreadable, or not the shape we wrote. */
async function readCache(cachePath: string): Promise<CacheStamp | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { checkedAt, latest } = parsed as Record<string, unknown>;
    if (typeof checkedAt !== "string") return null;
    return { checkedAt, latest: typeof latest === "string" ? latest : null };
  } catch {
    // A missing, truncated, or half-written stamp is simply "no answer yet";
    // the probe below rewrites it.
    return null;
  }
}

/**
 * Best-effort stamp write. Swallows everything: an unwritable cache directory
 * (read-only home, a file where the directory should be, EACCES) costs an extra
 * probe next run and nothing else. No atomic-write machinery here on purpose —
 * a torn stamp fails JSON parsing and is treated as absent.
 */
async function writeCache(cachePath: string, stamp: CacheStamp): Promise<void> {
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(stamp)}\n`, "utf8");
  } catch {
    // Intentional: the answer is already computed, and the cache is an optimization.
  }
}

/**
 * Ask the registry for the `latest` dist-tag. Returns the raw version string,
 * or `null` for every failure mode there is.
 *
 * `AbortSignal.timeout` is the deadline: its timer does not hold the event loop
 * open, which matters because this probe is fired un-awaited and must never
 * delay process exit.
 */
async function probeRegistry(opts: UpdateNoticeOptions): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const base = (opts.registryBaseUrl ?? DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, "");
  // Whole-name encoding is the registry's documented form for scoped packages
  // (`@scope/name` -> `%40scope%2Fname`); it is a no-op for unscoped names.
  const url = `${base}/${encodeURIComponent(opts.packageName)}/latest`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_NOTICE_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const { version } = body as Record<string, unknown>;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * The banner, or `null` when the registry answer is not strictly newer.
 *
 * Both operands are validated before the compare, not just `latest`: `semver.gt`
 * throws on an invalid operand, and a development build carrying a non-semver
 * version would otherwise turn a cosmetic check into an exception. Invalid
 * either way means no banner — the guard fails closed.
 *
 * No prerelease filtering: whatever the `latest` dist-tag points at is what the
 * publisher chose to hand an unpinned install, so a prerelease sitting on that
 * tag is exactly the version the banner names.
 *
 * The compare runs against the repository's pin when one was read
 * ({@link UpdateNoticeOptions.repositoryPin}), else the running version, and
 * that version is the one the banner names to stay on.
 *
 * The move command is the pinned call (`../../shared/cliCall.ts`), the one
 * spelling every other remedy uses: `npx -y <name>@<latest> upgrade --to <latest>`
 * ({@link moveVerb}; `sync` for a release older than {@link FIRST_UPGRADE_RELEASE}),
 * ending `--allow-major` when the majors differ, because `upgrade` refuses a
 * major move without it, with a
 * `--registry` fork's `--@<scope>:registry=<url>` ahead of the spec. A registry
 * the call refuses to write throws, and the net below turns it into no banner. `-y`
 * because the reader may be an agent's shell, and the exact version because an
 * `@latest` advice runs whatever the registry serves on the day it is typed.
 * The `npx --no` form of a package with no npm channel never renders here: such
 * a package is `private`, and step 2 returned before any registry probe.
 * A package name the pinned call refuses throws, and the caller's net turns
 * that into no banner — the fail-closed direction for a cosmetic line.
 *
 * Plain text, no palette — the caller may be writing to a non-TTY stream and
 * owns all styling decisions.
 */
function buildBanner(opts: UpdateNoticeOptions, latest: string | null): string | null {
  if (latest === null) return null;
  // The normalized spelling goes into the command and the version line alike:
  // `semver.valid` admits a leading `v` or `=` that the pinned call's own shape
  // check refuses, and the two halves of one sentence name one version.
  const target = semver.valid(latest);
  const from = opts.repositoryPin ?? opts.currentVersion;
  if (target === null || semver.valid(from) === null) return null;
  if (!semver.gt(target, from)) return null;
  const callOpts = opts.packageRegistry === undefined ? {} : { registry: opts.packageRegistry };
  const verb = moveVerb(target);
  const major = verb !== "sync" && semver.major(target) !== semver.major(from) ? " --allow-major" : "";
  return (
    `Update available: ${from} -> ${target}. ` +
    `To move: ${pinnedCliCall(opts.packageName, target, `${verb}${major}`, callOpts)}. ` +
    `To stay on ${from}, do nothing.`
  );
}

/**
 * Whether the startup probe should run at all (REQ-FLOW-048): only where its
 * banner can show — stderr is a terminal — and never on a `--json` run, whose
 * reader is a program. A run that cannot show the banner sends no request and
 * writes no stamp. `argv` is the command line after the program name; a token
 * after a bare `--` is an operand, not the flag.
 */
export function shouldProbeNotice(i: { stderrIsTTY: boolean; argv: readonly string[] }): boolean {
  if (!i.stderrIsTTY) return false;
  const operands = i.argv.indexOf("--");
  return !(operands === -1 ? i.argv : i.argv.slice(0, operands)).includes("--json");
}

/** What the startup notice is started from: the process's own facts, which `src/cli.ts` hands in as they stand. */
export interface StartupNoticeInput {
  /** The command line after the program name. */
  argv: readonly string[];
  /** `process.stderr.isTTY === true`. */
  stderrIsTTY: boolean;
  /** The directory the command runs in, whose pin the banner compares with. */
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  facts: OwnPackageFacts;
  /** {@link noticeCacheDir} of `env` and the user's home. */
  cacheDir: string;
}

/**
 * The startup notice as `src/cli.ts` starts it: `null` with no probe and no
 * read when {@link shouldProbeNotice} says the banner cannot show, else
 * {@link checkForUpdateNotice} over the options of `facts`, `env` and
 * `cacheDir`, with the pin {@link readRepositoryPin} reads at `cwd`. Never
 * rejects. `check` is the seam a test records the options through.
 */
export function startupNotice(
  input: StartupNoticeInput,
  check: (opts: UpdateNoticeOptions) => Promise<string | null> = checkForUpdateNotice,
): Promise<string | null> {
  if (!shouldProbeNotice(input)) return Promise.resolve(null);
  return readRepositoryPin(input.cwd, input.facts.name)
    .then((pin) => check(noticeOptionsFromFacts(input.facts, input.env, input.cacheDir, pin)))
    .catch(() => null);
}

/**
 * A `package.json` dependency spec read as a pin: an exact version, or a
 * `^` or `~` range over one, split into its operator and version. `null` for
 * every other spec (`latest`, a tag, a path, a git URL, a wider range), which
 * names no one version.
 */
export function pinSpecOf(spec: unknown): { operator: "" | "^" | "~"; version: string } | null {
  if (typeof spec !== "string") return null;
  const operator = spec.startsWith("^") || spec.startsWith("~") ? (spec[0] as "^" | "~") : "";
  const version = spec.slice(operator.length);
  return isSemverShaped(version) ? { operator, version } : null;
}

/**
 * The most either pin source is read up to. A `package.json` or a setup
 * manifest past it is a source that names nothing, so a planted file cannot
 * make every run read without bound.
 */
const PIN_SOURCE_MAX_BYTES = 1024 * 1024;

/**
 * The version the repository at `cwd` pins for `name`: its root
 * `package.json`'s `devDependencies` entry, then its `dependencies` entry
 * (each read through {@link pinSpecOf}), then the setup manifest's
 * `generatedBy`; `null` when none names a version. Never throws: an unreadable
 * or malformed file is a source that names nothing. Each file is read only
 * when it is a regular file no bigger than {@link PIN_SOURCE_MAX_BYTES}
 * (`readRegularFile`, the loosen gate's reader): a link, a device or an
 * oversized file is a source that names nothing, since the read runs on every
 * command started from a terminal, before the command itself.
 */
export async function readRepositoryPin(cwd: string, name: string): Promise<string | null> {
  const pkg = await readJsonObject(join(cwd, "package.json"));
  for (const field of ["devDependencies", "dependencies"] as const) {
    const section = pkg?.[field];
    if (typeof section !== "object" || section === null) continue;
    const pin = pinSpecOf((section as Record<string, unknown>)[name]);
    if (pin !== null) return pin.version;
  }
  const generatedBy = (await readJsonObject(join(cwd, STATE_DIR, MANIFEST_FILE)))?.["generatedBy"];
  return typeof generatedBy === "string" && isSemverShaped(generatedBy) ? generatedBy : null;
}

/** The JSON object at `path`, or `null` when it is absent, not a regular file, oversized, unreadable, malformed or not an object. */
async function readJsonObject(path: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await readRegularFile(path, PIN_SOURCE_MAX_BYTES);
    if (typeof text !== "string") return null;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
