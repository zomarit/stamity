import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { describe, expect, it } from "vitest";

/**
 * The declared Node floor, held against the graph it claims to run on.
 *
 * `package.json`'s `engines.node` is a PROMISE to a consumer — install this
 * package on a Node in that range and it works — and nothing in the tree used
 * to check it against the dependencies that promise is made of. A dependency
 * major that raises its own `engines.node` above the declared floor reopens the
 * gap silently: npm prints `EBADENGINE` at install time on the user's machine
 * and every gate here stays green, because no gate reads the two together.
 *
 * The floor moved from `>=22.12` to `>=22.22.2` while that gap was still
 * theoretical for a consumer, and this suite is deliberately not backdated to
 * pretend otherwise: no runtime entry in the committed lockfile asks for more
 * than commander's `>=22.12.0`, and the fifteen `EBADENGINE` rows an install
 * printed at the old floor were all dev-only (tsdown `^22.18.0`, ESLint
 * `^22.13.0`, and their trees), which is the half this suite does not read.
 * The case at the bottom is therefore a FIXTURE — an invented incoming range,
 * `^22.22.2 || ^24.15.0 || >=26.0.0`, of the shape a dependency major arrives
 * with — and it, not the real-graph case, is what shows the guard has teeth.
 *
 * What is compared, and why it is the right comparison: the floor is a RANGE
 * (`>=x.y.z`), and the only version in it that can violate a dependency's range
 * is its lowest, so the test resolves the floor to `semver.minVersion` and asks
 * whether that version satisfies each dependency's declared range. A range
 * subset check would be wrong here in the strict direction — `>=22.22.2` admits
 * 23.x, which `^22.22.2 || ^24.15.0 || >=26.0.0` deliberately does not, and an
 * odd-numbered line the project never supported is not a defect to report.
 *
 * `semver` is imported rather than hand-rolled: it is a declared runtime
 * DEPENDENCY of this package (not merely a dev one), it is what
 * `src/cli/commands/check.ts` compares the running Node against, and a
 * hand-written comparison of `^20.19.0 || >=22.12.0`-shaped ranges would be a
 * second, weaker implementation of the same semantics in the file whose whole
 * job is to be right about them.
 *
 * Scope: the RUNTIME half of the lockfile. A dev-only package's engines range
 * binds this repository's contributors, never a consumer of the published
 * tarball, and the toolchain floor is documented in CONTRIBUTING.md instead.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The `engines` shape both files carry, read structurally rather than by package type. */
interface EnginesHolder {
  readonly engines?: { readonly node?: string };
}

/** One `packages` entry of `package-lock.json`, narrowed to what this suite reads. */
interface LockEntry extends EnginesHolder {
  readonly dev?: boolean;
  readonly devOptional?: boolean;
}

interface Lockfile {
  readonly packages?: Readonly<Record<string, LockEntry>>;
}

function readJson<T>(...segments: readonly string[]): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, ...segments), "utf8")) as T;
}

const manifest = readJson<EnginesHolder>("package.json");
const lockfile = readJson<Lockfile>("package-lock.json");
const DECLARED_FLOOR = manifest.engines?.node;

/** `path → declared engines.node`, for the entries that reach a consumer's install. */
type EngineRow = readonly [path: string, range: string];

/**
 * Every non-dev lockfile entry that declares `engines.node`.
 *
 * The root entry (`""`) is excluded: it is this package's own mirror of the
 * floor, so including it would compare the floor to itself and always pass.
 * `dev` marks a dependency reachable only from `devDependencies`, and
 * `devOptional` one reachable from there and from an optional path — neither
 * ships in the tarball.
 */
function runtimeEngineRows(packages: Readonly<Record<string, LockEntry>>): EngineRow[] {
  return Object.entries(packages).flatMap<EngineRow>(([path, entry]) => {
    if (path === "") return [];
    if (entry.dev === true || entry.devOptional === true) return [];
    const range = entry.engines?.node;
    return range === undefined ? [] : [[path, range] as EngineRow];
  });
}

/**
 * The rows the declared floor does NOT satisfy, rendered for the failure
 * message. Pure, and exercised below against a fixture as well as against the
 * committed lockfile — the committed graph is the case that must stay empty,
 * and the fixture is the case that proves an empty result means something.
 */
function rowsAboveFloor(floor: string, rows: readonly EngineRow[]): string[] {
  const lowest = semver.minVersion(floor);
  if (lowest === null) throw new Error(`engines.node ${floor} has no lowest version`);
  return rows
    .filter(([, range]) => !semver.satisfies(lowest, range, { includePrerelease: true }))
    .map(([path, range]) => `${path} declares ${range}, which excludes Node ${lowest.version}`);
}

describe("the declared Node floor and the graph under it", () => {
  it("declares one lower bound, and the lockfile mirrors it exactly", () => {
    // The product's floor style: a single lower bound, so `minVersion` is the
    // whole comparison and a reader can hold the promise in their head.
    //
    // Three parts, not two, and that is a guard rather than a house style: a
    // two-part bound resolves to `x.y.0`, so `>=22.22` would promise a Node
    // that a dependency declaring `^22.22.2` rejects — the exact under-statement
    // this suite exists to catch, one digit further down.
    //
    // npm writes the root `packages[""]` entry from `package.json`, so a
    // lockfile that disagrees was hand-edited or is stale — and `npm ci`
    // installs from the lockfile.
    expect(DECLARED_FLOOR, "package.json declares no engines.node").toBeDefined();
    expect(DECLARED_FLOOR).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(lockfile.packages?.[""]?.engines?.node).toBe(DECLARED_FLOOR);
  });

  it("keeps the floor at or above every runtime dependency's own engines range", () => {
    const rows = runtimeEngineRows(lockfile.packages ?? {});

    // Non-degenerate: a green result must not be able to mean the walk found
    // nothing to compare. The runtime graph carries 52 such rows at the commit
    // that added this; the assertion is loose because dependencies come and go,
    // and exact is what makes a pin drift.
    expect(rows.length, "no runtime lockfile entry declares engines.node").toBeGreaterThan(20);

    expect(
      rowsAboveFloor(DECLARED_FLOOR ?? "", rows),
      "a runtime dependency needs a newer Node than package.json promises: raise engines.node " +
        "(and the CI floor leg, README, docs/getting-started.md and the issue template with it), " +
        "or hold the dependency back",
    ).toEqual([]);
  });

  it("reports a dependency that out-floors the declaration — the red-check", () => {
    // The mechanism, on an invented range of the shape a dependency major
    // arrives with. This case is the reason the suite is not merely asserting
    // that an empty list is empty: the committed graph's highest runtime
    // requirement is below the floor by design, so the real-graph case above
    // passes at both the old and the new floor, and only a fixture can show
    // what the guard catches.
    const incoming: EngineRow[] = [
      ["node_modules/signing-stack", "^22.22.2 || ^24.15.0 || >=26.0.0"],
      ["node_modules/signing-stack/core", "^20.17.0 || >=22.9.0"],
    ];

    expect(rowsAboveFloor(">=22.12", incoming)).toEqual([
      "node_modules/signing-stack declares ^22.22.2 || ^24.15.0 || >=26.0.0, which excludes " +
        "Node 22.12.0",
    ]);
    // And the floor this repository now declares admits it.
    expect(rowsAboveFloor(">=22.22.2", incoming)).toEqual([]);
  });

  it("leaves dev-only entries out, in both halves of the boundary", () => {
    // The toolchain is allowed to want more Node than a consumer is held to —
    // that is the whole reason the two numbers can differ — so a dev entry
    // above the floor is not a finding here.
    const rows: LockEntry & { readonly engines: { readonly node: string } } = {
      dev: true,
      engines: { node: ">=99.0.0" },
    };
    expect(runtimeEngineRows({ "node_modules/build-tool": rows })).toEqual([]);
    expect(
      runtimeEngineRows({ "node_modules/shipped": { engines: { node: ">=99.0.0" } } }),
    ).toEqual([["node_modules/shipped", ">=99.0.0"]]);

    // Non-degenerate against the real lockfile: the dev filter has something to
    // exclude, so "no findings" is not "nothing was classified".
    const dev = Object.entries(lockfile.packages ?? {}).filter(
      ([, entry]) => entry.dev === true || entry.devOptional === true,
    );
    expect(dev.length, "no dev-only entries in the lockfile — the filter is unexercised").
      toBeGreaterThan(0);
  });
});

/**
 * The other place the floor is spelled out loud: the generator scripts.
 *
 * Each of them re-execs itself with `--experimental-strip-types` when the host
 * Node cannot strip types natively, and tells the maintainer which Node to use
 * when even that fails. That sentence is a claim about the declared floor, and
 * nothing bound the two — so the raise to `>=22.22.2` left six scripts naming
 * `>=22.12`, a Node this package now refuses to install on (`EBADENGINE`).
 * Advice that sends a reader to an unsupported runtime is worse than none.
 */
describe("the floor as the scripts spell it", () => {
  const SCRIPTS_DIR = join(REPO_ROOT, "scripts");
  /** `Run the generator on Node >=x.y.z.` / `Run the probe on Node >=x.y.z.` */
  const ADVICE = /Run the (?:generator|probe|\$\{label\}) on Node (>=[\d.]+)\./g;

  it("names the declared floor in every re-exec failure message", () => {
    const found = readdirSync(SCRIPTS_DIR)
      .filter((name) => name.endsWith(".mjs"))
      .flatMap((name) =>
        [...readFileSync(join(SCRIPTS_DIR, name), "utf8").matchAll(ADVICE)].map(
          (match) => [name, match[1]] as const,
        ),
      );

    // The shared bootstrap now owns the advice once; requiring duplicated
    // literals would restore the drift this consolidation removes. Nonempty
    // matching plus the bootstrap behavior tests keep the assertion load-bearing.
    expect(found).toContainEqual(["native-typescript.mjs", DECLARED_FLOOR]);

    expect(
      found.filter(([, range]) => range !== DECLARED_FLOOR),
      "a script sends the reader to a Node that is not the declared floor",
    ).toEqual([]);
  });
});
