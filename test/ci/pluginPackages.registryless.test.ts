import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORK_PUBLISHER, FORK_REPOSITORY } from "./downstreamFixture.ts";

/**
 * A registry-less fork's plugin build pins `npx --no`, never `npx -y` (REQ-PLUGIN-004's
 * `${STAMITY:CLI}` amendment; the call form is REQ-FLOW-002).
 *
 * `test/ci/pluginModules.test.ts` proves the token renders `--no` when TOLD the package has no
 * channel. What it cannot prove is the generator's own derivation of that answer from
 * `package.json` (`private` with no `publishConfig.registry`) and the hand-off of it to both the
 * body substitution and the hook planner. This suite runs the real generator, as a child process
 * the way a fork's release runs it, over the REAL corpus twice in one copied checkout: once under
 * this repository's own manifest and once under a fork's private manifest. The manifest is the
 * only input that differs, so every flipped flag is traceable to it.
 *
 * The copy carries `src/`, `scripts/`, `assets/` and `content/`, the four trees the generator
 * reads from its own root (`ROOT` is the script's location, so a copy is the only way to hand it a
 * different `package.json`), and borrows the real `node_modules`, as `./downstreamFixture.ts` does.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The fork's package name: the `@acme` scope the downstream fixture publishes under. */
const FORK_PACKAGE = `@${FORK_PUBLISHER}/stamity`;
const CANONICAL_PACKAGE = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { name: string }).name;
/** A release version no committed file carries, so a match can only come from this build. */
const VERSION = "2.0.0";
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

/**
 * Budget: two full four-root builds over the real corpus plus one checkout copy. A full build
 * measured 7.5s cold (`test/ci/pluginPackages.test.ts`'s derivation); this file ran whole in 3.5s
 * on darwin (`npx vitest run test/ci/pluginPackages.registryless.test.ts`, 2026-09-30). Budgeted
 * as 2 x 8s basis x the sibling suite's MARGIN of 8 = 128s, rounded up for the copy and the
 * Windows legs.
 */
const BUDGET_MS = 180_000;

/**
 * A pinned call as the plugin token renders it: `npx`, one flag, then `<package>@<version>`.
 * The corpus's Running-the-CLI sentence (`npx --no stamity <verb>`, no `@`) is literal prose that
 * does not depend on the channel, so the `@` keeps it out of the count.
 */
const PINNED_CALL = /npx (-y|--no) (@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)@([0-9][\w.-]*)/g;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-registryless-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Every regular file under `dir`, as POSIX-relative paths, sorted. */
function treeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel);
      return entry.isFile() ? [rel] : [];
    });
}

/** Path -> the pinned calls it carries, in order; files with none are left out. */
function pinnedCalls(dir: string): Map<string, string[]> {
  const calls = new Map<string, string[]>();
  for (const rel of treeFiles(dir)) {
    const text = readFileSync(join(dir, rel), "utf8");
    const found = [...text.matchAll(PINNED_CALL)].map((match) => match[0]);
    if (found.length > 0) calls.set(rel, found);
  }
  return calls;
}

/** Path -> how many pinned calls it carries. */
function callCounts(calls: Map<string, string[]>): Record<string, number> {
  return Object.fromEntries([...calls].map(([rel, found]) => [rel, found.length]));
}

/** Every file under `dir` whose bytes contain `needle`. */
function filesContaining(dir: string, needle: string): string[] {
  return treeFiles(dir).filter((rel) => readFileSync(join(dir, rel), "utf8").includes(needle));
}

const isHook = (rel: string): boolean => /(^|\/)hooks\//.test(rel);

/**
 * A `--runtime` input the generator accepts: the two files it refuses a directory for lacking.
 * Stubbed for the same reason `test/ci/pluginPackages.test.ts` stubs it: the bundled runtime is
 * built from a packed tarball and proven by its own suite, and nothing asserted here reads it.
 */
function stubRuntime(): string {
  const dir = join(work, "runtime");
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: CANONICAL_PACKAGE, version: "1.10.0", engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\n");
  return dir;
}

/** A fork's manifest: renamed as `docs/enterprise-forks.md` prescribes, private, no registry. */
function registrylessManifest(): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  pkg["name"] = FORK_PACKAGE;
  pkg["stamity"] = { publisher: FORK_PUBLISHER };
  pkg["repository"] = { type: "git", url: `${FORK_REPOSITORY}.git` };
  pkg["homepage"] = FORK_REPOSITORY;
  pkg["private"] = true;
  delete pkg["publishConfig"];
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function build(checkout: string, runtime: string, out: string): void {
  const result = spawnSync(
    process.execPath,
    [
      join(checkout, "scripts", "generate-plugin-packages.mjs"),
      "--out-dir",
      out,
      "--runtime",
      runtime,
      "--version",
      VERSION,
      "--source-commit",
      FIXED_COMMIT,
      "--source-commit-date",
      FIXED_COMMIT_DATE,
    ],
    { cwd: checkout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

let canonicalOut = "";
let forkOut = "";

beforeAll(() => {
  const checkout = join(work, "checkout");
  mkdirSync(checkout);
  for (const tree of ["src", "scripts", "assets", "content"]) {
    cpSync(join(REPO_ROOT, tree), join(checkout, tree), { recursive: true });
  }
  symlinkSync(join(REPO_ROOT, "node_modules"), join(checkout, "node_modules"), "junction");
  const runtime = stubRuntime();

  // Canonical first: this repository's manifest, published, so a channel serves it.
  writeFileSync(join(checkout, "package.json"), readFileSync(join(REPO_ROOT, "package.json")));
  canonicalOut = join(work, "canonical");
  build(checkout, runtime, canonicalOut);

  // Then the fork's, in the same checkout: the manifest is the one input that moves.
  const manifest = registrylessManifest();
  const parsed = JSON.parse(manifest) as { private?: unknown; publishConfig?: { registry?: unknown } };
  expect(parsed.private).toBe(true);
  expect(parsed.publishConfig?.registry).toBeUndefined();
  writeFileSync(join(checkout, "package.json"), manifest);
  forkOut = join(work, "fork");
  build(checkout, runtime, forkOut);
}, BUDGET_MS);

describe("a registry-less fork's plugin build (private, no publishConfig.registry)", () => {
  it("pins every call as `npx --no <fork>@<version>` in bodies and hooks of all four roots, and never `npx -y`", () => {
    const fork = pinnedCalls(forkOut);
    const forkCall = `npx --no ${FORK_PACKAGE}@${VERSION}`;

    // Every pinned call in the fork's tree is the one `--no` literal naming the fork's package.
    expect(new Set([...fork.values()].flat())).toEqual(new Set([forkCall]));
    // Not a single `npx -y` anywhere, pinned or not.
    expect(filesContaining(forkOut, "npx -y")).toEqual([]);

    // Non-degenerate in every root, on both halves the build pins: the substituted bodies and
    // the planner-written hooks.
    for (const client of CLIENTS) {
      const own = [...fork.keys()].filter((rel) => rel.startsWith(`${client}/`));
      expect(own.filter((rel) => !isHook(rel)).length, `${client} bodies`).toBeGreaterThan(0);
      expect(own.filter(isHook).length, `${client} hooks`).toBeGreaterThan(0);
    }
  });

  it("flips every call site the canonical build pins with `npx -y`, file by file and count by count", () => {
    const canonical = pinnedCalls(canonicalOut);
    const fork = pinnedCalls(forkOut);
    const canonicalCall = `npx -y ${CANONICAL_PACKAGE}@${VERSION}`;

    // The canonical build of the same checkout keeps `-y`: the channel, not the corpus, decides.
    expect(new Set([...canonical.values()].flat())).toEqual(new Set([canonicalCall]));
    expect(canonical.size).toBeGreaterThan(0);

    expect(callCounts(fork)).toEqual(callCounts(canonical));
  });

  it("names the fork's own package as each root's companion", () => {
    for (const client of CLIENTS) {
      const capability = JSON.parse(readFileSync(join(forkOut, client, "stamity-plugin.json"), "utf8")) as {
        runtime?: { companion?: { package?: string } };
      };
      expect(capability.runtime?.companion?.package, client).toBe(FORK_PACKAGE);
    }
  });
});
