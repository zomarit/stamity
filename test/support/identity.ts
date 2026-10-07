import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Who the checkout under test IS — read once from its own `package.json`.
 *
 * `docs/enterprise-forks.md` tells a downstream to rename the package to its own
 * scope, set `stamity.publisher`, repoint `repository.url` and set `private: true`,
 * and then recommends this repository's own gate. Every test that spelled the
 * canonical name or the canonical privacy as a literal went red on that gate
 * through no fault of the fork's (audit FORK-3), and the guide named only one
 * test to edit. So the literals move here: a test either DERIVES the expected
 * value from this record, or gates itself on {@link RepositoryIdentity.canonical}
 * with a reason a skipped-test line prints.
 *
 * Read from the manifest rather than imported from `src/`: a test that asked the
 * production helper what the package is called would agree with it by
 * construction. The production derivation is proven separately, against a pseudo
 * package root, in `test/cli/kit/packageName.test.ts`.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The published identity of this source tree. A fork matches none of it. */
const CANONICAL_NAME = "@zomarit/stamity";
const CANONICAL_PUBLISHER = "zomarit";

/** `stamity.publisher` is optional, and its absent value is the canonical owner. */
const DEFAULT_PUBLISHER = CANONICAL_PUBLISHER;

export interface RepositoryIdentity {
  /**
   * True only for the canonical public package: the canonical name, the
   * canonical publisher and a publishable (non-private) manifest. A gate on this
   * flag is a claim about THIS repository — a published registry name, a
   * github.com URL under the canonical owner — that a renamed private copy
   * cannot make and must not be failed for.
   */
  readonly canonical: boolean;
  /** `package.json` `name`, whatever it is. */
  readonly name: string;
  /** `package.json` `version`; empty when the manifest carries none as a string. */
  readonly version: string;
  /** `stamity.publisher`, defaulted the way `scripts/distribution-identity.mjs` defaults it. */
  readonly publisher: string;
  /** `package.json` `private` — `true` on a downstream that followed the guide. */
  readonly private: boolean;
  /**
   * Whether a registry serves the package: not `private`, or `publishConfig.registry`
   * set (a fork made with `--registry`). `false` on the registry-less fork, whose
   * pinned calls render `npx --no`, and on a fork whose registry the pinned call
   * cannot name ({@link RepositoryIdentity.registry}), which fails closed the same way.
   */
  readonly npmChannel: boolean;
  /**
   * The registry every pinned call names for the package's scope: `publishConfig.registry`
   * when the call can write it (a scoped name and a URL of {@link REGISTRY_URL}), else
   * absent (REQ-PLUGIN-048). Absent, not `null`, so the canonical record keeps its keys.
   */
  readonly registry?: string;
}

interface Manifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly private?: unknown;
  readonly publishConfig?: { readonly registry?: unknown };
  readonly repository?: { readonly url?: unknown };
  readonly stamity?: { readonly publisher?: unknown };
}

/** This checkout's own `package.json`, parsed. */
function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Manifest;
}

let cached: RepositoryIdentity | null = null;

/**
 * The registry URLs a pinned call may name — `REGISTRY_URL` in `src/shared/cliCall.ts`,
 * restated for the reason {@link npxCommand} gives and held equal by
 * `test/cli/kit/packageName.test.ts`.
 */
export const REGISTRY_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~/-]*)?$/;

/**
 * The identity a `package.json` declares, read the way the CLI reads its own
 * (`ownCallIdentity` in `src/cli/kit/packageName.ts`): a declared registry the
 * call cannot name — outside {@link REGISTRY_URL}, or on an unscoped name — is
 * never rendered and costs the package its channel. Exported so a suite can
 * hold {@link npxCommandOf} to the CLI over a manifest of its own.
 */
export function manifestIdentity(manifest: Manifest): RepositoryIdentity {
  const name = typeof manifest.name === "string" ? manifest.name : "";
  const version = typeof manifest.version === "string" ? manifest.version : "";
  const publisher =
    typeof manifest.stamity?.publisher === "string" ? manifest.stamity.publisher : DEFAULT_PUBLISHER;
  const isPrivate = manifest.private === true || manifest.private === "true";
  const declared = manifest.publishConfig?.registry;
  const registry = typeof declared === "string" && declared !== "" ? declared : undefined;
  const writable = registry !== undefined && name.startsWith("@") && REGISTRY_URL.test(registry);
  return {
    canonical: name === CANONICAL_NAME && publisher === CANONICAL_PUBLISHER && !isPrivate,
    name,
    version,
    publisher,
    private: isPrivate,
    npmChannel: registry === undefined ? !isPrivate : writable,
    ...(writable ? { registry } : {}),
  };
}

/** The identity of the checkout the suite is running in. Memoized: the manifest cannot move mid-run. */
export function canonical(): RepositoryIdentity {
  cached ??= manifestIdentity(readManifest());
  return cached;
}

/** Where the checkout under test is published from — the other half of the identity a fork repoints. */
export interface RepositoryRoute {
  /** `repository.url` without its `git+` prefix and `.git` suffix: `https://github.com/<owner>/<repository>`. */
  readonly url: string;
  /** `<owner>/<repository>` — what a `marketplace add`, an `apm install` spec or a Renovate pin names. */
  readonly slug: string;
}

let cachedRoute: RepositoryRoute | null = null;

/**
 * The route every generated install command, marketplace source and install spec is built
 * from, read from this manifest's `repository.url` the way a reader of the file would read
 * it. A fork that repointed `repository.url` gets its own route here, so an assertion on a
 * generated `marketplace add <slug>` holds on the canonical tree and on the fork alike.
 * Memoized, like {@link canonical}.
 */
export function repositoryRoute(): RepositoryRoute {
  if (cachedRoute === null) {
    const raw = readManifest().repository?.url;
    const url = typeof raw === "string" ? raw.replace(/^git\+/, "").replace(/\.git$/, "") : "";
    const slug = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(url)?.[1];
    if (slug === undefined) {
      // No fallback on purpose: a guessed route would make every derived assertion agree
      // with a value this checkout does not publish from.
      throw new Error("package.json repository.url is not https://github.com/<owner>/<repository>");
    }
    cachedRoute = { url, slug };
  }
  return cachedRoute;
}

/**
 * A semver-shaped version, the shape `pinnedCliPrefix` (`src/shared/cliCall.ts`)
 * pins; anything else — `next`, a range, an empty string — takes the unpinned
 * fallback. Restated, not imported, for the reason {@link npxCommand} gives.
 */
const SEMVER_SHAPE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * The `npx` invocation this checkout's own remedies name: the pinned
 * `npx -y <own name>@<own version> <verb>`, or `npx --no …` when the package
 * has no npm channel ({@link RepositoryIdentity.npmChannel}).
 *
 * The shape is the assertion — a remedy has to name a package a reader can run,
 * at the version that printed it — and the name and version are whatever this
 * manifest carries, so the canonical checkout keeps its exact literal and a fork
 * reads its own. `verb` is the whole tail, mirroring `packageCommand` in
 * `src/cli/kit/packageName.ts`, including its unpinned fallback for a manifest
 * whose version is missing or not semver-shaped. Spelled out here rather than
 * imported: a test that asked the production helper for its expected string
 * would agree with it by construction.
 */
export function npxCommand(verb: string): string {
  return npxCommandOf(canonical(), verb);
}

/**
 * {@link npxCommand} for any identity: `npx -y <name>@<version> <verb>`, `--no`
 * in place of `-y` without a channel, and `--@<scope>:registry=<url>` between
 * the flag and the spec when the identity names a registry (REQ-PLUGIN-048).
 * The unpinned fallback keeps the registry word too, as `packageCommand` does.
 */
export function npxCommandOf(identity: RepositoryIdentity, verb: string): string {
  const { name, version, npmChannel } = identity;
  const pinned = SEMVER_SHAPE.test(version);
  const flag = npmChannel ? (pinned ? "-y" : "") : "--no";
  const words = ["npx", flag, registryArgument(identity), pinned ? `${name}@${version}` : name, verb];
  return words.filter((word) => word !== "").join(" ");
}

/**
 * `--@<scope>:registry=<url>`, the word a pinned call carries between its npx flag and
 * the spec when the identity names a registry, else `""` (REQ-PLUGIN-048).
 */
export function registryArgument(identity: RepositoryIdentity): string {
  const { name, registry } = identity;
  return registry === undefined ? "" : `--${name.slice(0, name.indexOf("/"))}:registry=${registry}`;
}


/**
 * A title for a canonical-only case that says out loud why it did not run.
 *
 * Pair it with `it.skipIf(!canonical().canonical)`: vitest prints the title of a
 * skipped case, so the reason travels with the skip. A canonical-only case that
 * simply passed on a fork would report green for a claim nobody checked, which
 * is the failure mode this whole module exists to avoid.
 */
export function canonicalOnly(title: string): string {
  const identity = canonical();
  return identity.canonical
    ? title
    : `${title} — skipped: this checkout is ${identity.name}, not the canonical ${CANONICAL_NAME}`;
}
