import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { findPackageRoot } from "../../shared/paths.ts";
import { STATE_DIR } from "../../types/markers.ts";

/**
 * The startup update notice: async, cached, silent-fail, opt-out-able, and
 * explicitly NOT a self-updater. There is no `update` command and nothing
 * here rewrites an install — the banner names the one supported upgrade path,
 * `npx <name>@latest sync`, because a newer CLI does nothing for the user's repo
 * until the managed blocks regenerate.
 *
 * Zero new dependencies: global `fetch` plus one JSON stamp file. `semver` is
 * already the engine's version comparator, so the guard reuses it rather than
 * hand-rolling a compare.
 *
 * {@link checkForUpdateNotice} is a decision chain; each step short-circuits to
 * `null`:
 *
 *  1. **Env opt-outs.** `STAMITY_NO_UPDATE_CHECK=1` (ours), plus the two
 *     ecosystem-wide switches `NO_UPDATE_NOTIFIER` and `CI` on any non-empty
 *     value.
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
 *     answer is valid semver strictly above the running version. A registry
 *     that answers with an equal or lower version must never produce a
 *     downgrade prompt or an equal-version nag — not a hypothetical: the
 *     `latest` dist-tag for this name currently sits BEHIND the shipped
 *     version, and that pairing must stay silent.
 *
 * The module never prints and never throws: the caller fires it un-awaited at
 * startup, where a rejection would surface as a fatal unhandled rejection, and
 * decides placement (stderr, after the command, only when stderr is a TTY).
 */

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

/** The stamp file inside {@link noticeCacheDir}. */
const CACHE_FILE_NAME = "update-check.json";

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
  /** `package.json` `private: true` — the unpublishable-manifest no-op (step 2). */
  isPrivate: boolean;
  /** Environment to read opt-outs from. Injected, never `process.env` directly. */
  env: Readonly<Record<string, string | undefined>>;
  /** Directory holding the stamp file; created on demand. See {@link noticeCacheDir}. */
  cacheDir: string;
  /** Registry origin. Defaults to {@link DEFAULT_REGISTRY_BASE_URL}. */
  registryBaseUrl?: string;
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
    const cachePath = join(opts.cacheDir, CACHE_FILE_NAME);

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
 * Read this package's own name/version/private flag by walking up from this
 * module's directory, so the notice self-describes identically from a `src`
 * checkout and from the published `dist` layout.
 *
 * Any failure — no package root, unreadable or malformed `package.json` — falls
 * back to a private-marked record, which routes the caller into the step-2
 * no-op. Failing toward silence is the only safe direction for a feature that
 * exists to print one advisory line.
 */
export function resolveOwnPackageFacts(): { name: string; version: string; isPrivate: boolean } {
  try {
    const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return UNKNOWN_PACKAGE_FACTS;
    const { name, version, private: isPrivate } = parsed as Record<string, unknown>;
    return {
      name: typeof name === "string" ? name : "",
      version: typeof version === "string" ? version : "",
      // `private` is a boolean in the npm schema, but the string form appears in
      // hand-edited manifests; both mean "do not publish", so both suppress.
      isPrivate: isPrivate === true || isPrivate === "true",
    };
  } catch {
    return UNKNOWN_PACKAGE_FACTS;
  }
}

/** Fallback facts: unnamed and private, so the notice stays silent. */
const UNKNOWN_PACKAGE_FACTS = { name: "", version: "", isPrivate: true } as const;

/**
 * `STAMITY_NO_UPDATE_CHECK` matches exactly `1` (our documented switch); the two
 * ecosystem variables suppress on any non-empty value, because that is how the
 * tools that set them use them — CI runners export `CI=true`, not `CI=1`.
 */
function isOptedOut(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env.STAMITY_NO_UPDATE_CHECK === "1") return true;
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
 * publisher chose to hand `npx <name>@latest`, so a prerelease sitting on that
 * tag is exactly what the user would install.
 *
 * Plain text, no palette — the caller may be writing to a non-TTY stream and
 * owns all styling decisions.
 */
function buildBanner(opts: UpdateNoticeOptions, latest: string | null): string | null {
  if (latest === null) return null;
  if (semver.valid(latest) === null || semver.valid(opts.currentVersion) === null) return null;
  if (!semver.gt(latest, opts.currentVersion)) return null;
  return `Update available: ${opts.currentVersion} -> ${latest}. Run: npx ${opts.packageName}@latest sync`;
}
