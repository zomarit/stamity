import { execFileSync } from "node:child_process";
import type { Platform } from "../types/core.ts";

/**
 * Git identity for a repository directory: which remote it points at, what its
 * default branch is, and which platform hosts it.
 *
 * Two rules shape this module. Parsing is pure — every function that
 * interprets git output takes that output as a string, so the whole grammar is
 * unit-testable without a repository on disk. Reading is a single injectable
 * seam ({@link GitRunner}), so the one function that shells out is the only
 * one a test has to replace.
 *
 * Everything here is enrichment, never a precondition: a directory that is not
 * a repository, or a repository with no `origin`, yields nulls rather than an
 * error.
 */

/** What git knows about a repository directory. Every field is independently optional. */
export interface RepoGitIdentity {
  remoteUrl: string | null;
  defaultBranch: string | null;
  platform: Platform | null;
}

/**
 * The one seam onto git: runs `git <args>` in `cwd` and returns stdout.
 * Throws when git fails — a missing binary, a non-zero exit, a directory that
 * is not a repository. Callers treat a throw as "unknown", never as fatal.
 */
export type GitRunner = (args: readonly string[], cwd: string) => string;

/** Anything spelled `<scheme>://` is a URL or nothing — never an scp-like path. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `<scheme>://[user[:pass]@]host[:port]/path` — https, ssh, git. */
const SCHEME_REMOTE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?([^/:]+)(?::\d+)?\/(.*)$/i;

/**
 * scp-like `[user@]host:path`. Git recognises this form only when no slash
 * precedes the colon, which is what keeps a local `./dir:name` path out of it.
 */
const SCP_REMOTE = /^(?:[^/@]+@)?([^/:]+):(.+)$/;

/**
 * Schemeless `host/path`, the form that turns up in CI variables and
 * hand-edited config. The host must carry a dot and a letter-ish TLD so a
 * relative path (`sub/repo`) is not mistaken for one.
 */
const BARE_REMOTE = /^([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:\/(.*))?$/i;

/**
 * A leading all-digit segment in an scp-like path is a port someone wrote by
 * hand (`host:8443/group/repo`): the scp form has no port field, so git itself
 * would read `8443` as the first path segment and fail to clone. Reading it as
 * a port loses nothing real and keeps the namespace intact.
 */
const SCP_PORT_PREFIX = /^\d+\/(.+)$/;

/** Timeout for a single git probe. A hung probe must not stall a cascade over many repos. */
const GIT_PROBE_TIMEOUT_MS = 5_000;

/** Characters git's own `check-ref-format` forbids anywhere in a ref name. */
const REF_FORBIDDEN = ["~", "^", ":", "?", "*", "[", "\\", "..", "@{"];

/**
 * Parse a git remote URL into its host and the owning namespace.
 *
 * The three transport spellings of one repository — `git@host:owner/repo.git`,
 * `https://host/owner/repo`, `ssh://git@host/owner/repo` — normalise to the
 * same triple. Returns `null` for anything without a host and at least two
 * path segments: a local path, a `file://` URL, or an unparseable string.
 */
export function parseGitRemote(url: string): { host: string; owner: string; repo: string } | null {
  const location = splitRemote(url);
  if (location === null) return null;

  const segments = pathSegments(location.path);
  if (segments.length < 2) return null;

  const identity = splitNamespace(platformForHost(location.host), segments);
  if (identity.owner === "" || identity.repo === "") return null;

  return { host: location.host, ...identity };
}

/**
 * Resolve a default branch name out of whatever `origin/HEAD` was read as.
 *
 * Accepts the three shapes the probes produce: the arrow form printed by
 * `git ls-remote --symref` and `git branch -r`
 * (`refs/remotes/origin/HEAD -> origin/main`), the full ref
 * (`refs/remotes/origin/main`), and the short remote-qualified name
 * (`origin/main`). Returns `null` when the output names no branch — an
 * unresolved `HEAD`, an error line, empty output.
 */
export function parseGitDefaultBranch(symbolicRefOutput: string): string | null {
  const line = symbolicRefOutput.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (line === "") return null;

  const arrowAt = line.lastIndexOf("->");
  const target = (arrowAt === -1 ? line : line.slice(arrowAt + 2)).trim();
  const branch = stripRefPrefix(target);

  return isBranchName(branch) ? branch : null;
}

/**
 * Infer the hosting platform from a remote URL.
 *
 * The match is on the HOST alone. Scanning the whole URL misreads a repository
 * whose *name* carries a vendor token — `github.com/acme/gitlab-mirror` is a
 * GitHub repository. Self-hosted installs are covered by matching the vendor
 * as a host label (`gitlab.acme.com`, `github.acme.com`), so an unrelated host
 * that merely contains the word (`mygitlab.com`) does not match.
 *
 * Returns `null` for a host the engine has no platform mapping for, rather
 * than defaulting to one: a wrong platform silently mis-shapes every generated
 * issue and PR reference.
 */
export function detectPlatformFromRemote(remoteUrl: string): Platform | null {
  const location = splitRemote(remoteUrl);
  return location === null ? null : platformForHost(location.host);
}

/**
 * Read git identity for a repository directory.
 *
 * Both probes are best-effort and independently nullable: failures are
 * swallowed by design because the engine's callers enrich a workspace entry
 * with whatever git offers and carry on when it offers nothing. The engine
 * returns data and never writes to a console, so there is no diagnostic
 * channel to route a probe failure into — the null in the returned identity
 * IS the report.
 */
export function detectRepoGitIdentity(cwd: string, runner: GitRunner = execGit): RepoGitIdentity {
  const remoteUrl = probe(runner, ["remote", "get-url", "origin"], cwd);
  const headRef = probe(runner, ["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);

  return {
    remoteUrl,
    defaultBranch: headRef === null ? null : parseGitDefaultBranch(headRef),
    platform: remoteUrl === null ? null : detectPlatformFromRemote(remoteUrl),
  };
}

/** Default seam: synchronous git, stdout captured, stderr discarded, bounded wall time. */
const execGit: GitRunner = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_PROBE_TIMEOUT_MS,
  });

function probe(runner: GitRunner, args: readonly string[], cwd: string): string | null {
  try {
    const output = runner(args, cwd).trim();
    return output === "" ? null : output;
  } catch {
    return null;
  }
}

/** Split a remote URL into a lowercased host and the raw path after it. */
function splitRemote(url: string): { host: string; path: string } | null {
  const trimmed = url.trim();

  // Checked before the scp-like branch, which would otherwise read
  // `file:///srv/repo.git` as the host `file`.
  if (HAS_SCHEME.test(trimmed)) {
    const scheme = SCHEME_REMOTE.exec(trimmed);
    if (scheme === null) return null;
    const [, host = "", path = ""] = scheme;
    return { host: host.toLowerCase(), path };
  }

  const scp = SCP_REMOTE.exec(trimmed);
  if (scp !== null) {
    const [, host = "", path = ""] = scp;
    return { host: host.toLowerCase(), path: SCP_PORT_PREFIX.exec(path)?.[1] ?? path };
  }

  const bare = BARE_REMOTE.exec(trimmed);
  if (bare !== null) {
    const [, host = "", path = ""] = bare;
    return { host: host.toLowerCase(), path };
  }

  return null;
}

/** Path to segments: query/fragment dropped, empties collapsed, `.git` stripped from the last. */
function pathSegments(path: string): string[] {
  const segments = path
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((segment) => segment !== "");

  const last = segments.at(-1);
  if (last !== undefined) segments[segments.length - 1] = stripGitSuffix(last);
  return segments;
}

function stripGitSuffix(segment: string): string {
  return segment.replace(/\.git$/i, "");
}

/**
 * Which segments are the namespace and which is the repository — the one place
 * platform layout matters.
 *
 * - GitHub has no nested namespaces, so the identity is exactly the first two
 *   segments; anything after them came from a pasted web URL and is not part
 *   of it.
 * - Azure DevOps addresses a repository as `org/project/_git/repo` over HTTPS
 *   and `v3/org/project/repo` over SSH; the owner is `org/project` in both.
 * - GitLab-style hosts (and unknown ones) allow arbitrarily nested groups, so
 *   every segment above the repository belongs to the namespace.
 */
function splitNamespace(
  platform: Platform | null,
  segments: readonly string[],
): { owner: string; repo: string } {
  const last = segments.length - 1;
  const repo = segments[last] ?? "";

  if (platform === "github") {
    return { owner: segments[0] ?? "", repo: stripGitSuffix(segments[1] ?? "") };
  }

  if (platform === "azure-devops") {
    const gitAt = segments.indexOf("_git");
    if (gitAt >= 1 && gitAt === last - 1) {
      return { owner: segments.slice(0, gitAt).join("/"), repo };
    }
    if (segments[0] === "v3" && segments.length >= 4) {
      return { owner: segments.slice(1, last).join("/"), repo };
    }
  }

  return { owner: segments.slice(0, last).join("/"), repo };
}

/** Host equals `domain` or is a subdomain of it. */
function underDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Vendor appears as a host label: `gitlab.com`, `gitlab.acme.com`, `git.gitlab.acme.com`. */
function vendorLabel(host: string, vendor: string): boolean {
  return host.startsWith(`${vendor}.`) || host.includes(`.${vendor}.`);
}

function platformForHost(host: string): Platform | null {
  if (underDomain(host, "dev.azure.com") || underDomain(host, "visualstudio.com")) {
    return "azure-devops";
  }
  if (vendorLabel(host, "gitlab")) return "gitlab";
  if (vendorLabel(host, "github")) return "github";
  return null;
}

/**
 * Reduce a ref to a branch name. Full refs lose their `refs/remotes/<remote>/`
 * or `refs/heads/` prefix; a short remote-qualified name loses its first
 * segment only, because a branch name may itself contain slashes
 * (`origin/release/2.x` is the branch `release/2.x`).
 */
function stripRefPrefix(ref: string): string {
  const remote = /^refs\/remotes\/[^/]+\/(.+)$/.exec(ref);
  if (remote !== null) return remote[1] ?? ref;

  const head = /^refs\/heads\/(.+)$/.exec(ref);
  if (head !== null) return head[1] ?? ref;

  const slash = ref.indexOf("/");
  return slash === -1 ? ref : ref.slice(slash + 1);
}

/**
 * A conservative read of git's `check-ref-format` rules, enough to reject the
 * two shapes that actually reach here: an unresolved `HEAD`, and a stray
 * message line (which always carries whitespace).
 */
function isBranchName(value: string): boolean {
  if (value === "" || value === "HEAD") return false;
  if (value.startsWith("-") || value.startsWith("/") || value.endsWith("/")) return false;
  if (value.endsWith(".lock") || /\s/.test(value)) return false;
  return !REF_FORBIDDEN.some((token) => value.includes(token));
}
