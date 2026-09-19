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
  /** `stamity.publisher`, defaulted the way `scripts/distribution-identity.mjs` defaults it. */
  readonly publisher: string;
  /** `package.json` `private` — `true` on a downstream that followed the guide. */
  readonly private: boolean;
}

interface Manifest {
  readonly name?: unknown;
  readonly private?: unknown;
  readonly stamity?: { readonly publisher?: unknown };
}

let cached: RepositoryIdentity | null = null;

/** The identity of the checkout the suite is running in. Memoized: the manifest cannot move mid-run. */
export function canonical(): RepositoryIdentity {
  if (cached === null) {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Manifest;
    const name = typeof manifest.name === "string" ? manifest.name : "";
    const publisher =
      typeof manifest.stamity?.publisher === "string" ? manifest.stamity.publisher : DEFAULT_PUBLISHER;
    const isPrivate = manifest.private === true;
    cached = {
      canonical: name === CANONICAL_NAME && publisher === CANONICAL_PUBLISHER && !isPrivate,
      name,
      publisher,
      private: isPrivate,
    };
  }
  return cached;
}

/**
 * The `npx` invocation this checkout's own remedies name: `npx <own name> <verb>`.
 *
 * The shape is the assertion — a remedy has to name a package a reader can run —
 * and the name is whatever this manifest carries, so the canonical checkout keeps
 * its exact literal and a fork reads its own. `verb` is the whole tail, mirroring
 * `packageCommand` in `src/cli/kit/packageName.ts`.
 */
export function npxCommand(verb: string): string {
  return `npx ${canonical().name} ${verb}`;
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
