import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FORK_PUBLISHER, FORK_REPOSITORY } from "./downstreamFixture.ts";

/**
 * A `--registry` fork's plugin build names its registry for its scope in every pinned call, and a
 * registry the call cannot name fails closed to `npx --no` (REQ-PLUGIN-048).
 *
 * `test/ci/pluginModules.test.ts` proves `tokens.mjs` renders the registry word when TOLD a
 * registry. What it cannot prove is the generator's own wiring: reading `publishConfig.registry`,
 * applying the call grammar and the scope rule, dropping the channel for a refused registry, and
 * handing the registry to BOTH halves the roots carry — the substituted bodies
 * (`stageSubstitutedCorpus`'s `cli`) and the planner-written hooks (`npmRegistry`). Dropping either
 * hand-off ships the bare `npx -y @<scope>/stamity@<v>` this requirement closes, so this suite runs
 * the real generator, as a child process the way a fork's release runs it, over the REAL corpus
 * twice in one copied checkout: once under a registry fork's manifest and once under the same
 * manifest with a registry outside the grammar. The registry is the only input that differs.
 *
 * The copy is `./pluginPackages.registryless.test.ts`'s: `src/`, `scripts/`, `assets/` and
 * `content/`, with the real `node_modules` borrowed.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const FORK_PACKAGE = `@${FORK_PUBLISHER}/stamity`;
const REGISTRY = "https://npm.pkg.github.com";
/** Outside the call grammar (a `%` escape), as an Azure DevOps feed under a spaced project name is. */
const REFUSED_REGISTRY = "https://registry.example.invalid/a%20b/npm/";
/** A release version no committed file carries, so a match can only come from this build. */
const VERSION = "2.0.0";
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

/** Budget: the sibling registry-less suite's, for the same two full four-root builds and one copy. */
const BUDGET_MS = 180_000;

/** The spec every pinned call in a fork root names. */
const SPEC = `${FORK_PACKAGE}@${VERSION}`;
const BOUND_CALL = `npx -y --@${FORK_PUBLISHER}:registry=${REGISTRY} ${SPEC}`;
const NO_FETCH_CALL = `npx --no ${SPEC}`;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-registry-"));
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

/**
 * Path -> the text in front of each `<fork>@<version>` it carries, as long as the call `expected`
 * is, so a bound call reads back as exactly `expected` and anything else reads back as what it is.
 */
function callSites(dir: string, expected: string): Map<string, string[]> {
  const sites = new Map<string, string[]>();
  const lead = expected.length - SPEC.length;
  for (const rel of treeFiles(dir)) {
    const text = readFileSync(join(dir, rel), "utf8");
    const found: string[] = [];
    for (let at = text.indexOf(SPEC); at !== -1; at = text.indexOf(SPEC, at + SPEC.length)) {
      found.push(text.slice(Math.max(0, at - lead), at + SPEC.length));
    }
    if (found.length > 0) sites.set(rel, found);
  }
  return sites;
}

const isHook = (rel: string): boolean => /(^|\/)hooks\//.test(rel);

/** A `--runtime` input the generator accepts, stubbed as the sibling suites stub it. */
function stubRuntime(): string {
  const dir = join(work, "runtime");
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: FORK_PACKAGE, version: VERSION, engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\n");
  return dir;
}

/** What `scripts/fork-identity.mjs --registry <registry>` writes: renamed, not private, the registry. */
function registryManifest(registry: string): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  pkg["name"] = FORK_PACKAGE;
  pkg["stamity"] = { publisher: FORK_PUBLISHER };
  pkg["repository"] = { type: "git", url: `${FORK_REPOSITORY}.git` };
  pkg["homepage"] = FORK_REPOSITORY;
  delete pkg["private"];
  pkg["publishConfig"] = { registry };
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

let boundOut = "";
let refusedOut = "";

beforeAll(() => {
  const checkout = join(work, "checkout");
  mkdirSync(checkout);
  for (const tree of ["src", "scripts", "assets", "content"]) {
    cpSync(join(REPO_ROOT, tree), join(checkout, tree), { recursive: true });
  }
  symlinkSync(join(REPO_ROOT, "node_modules"), join(checkout, "node_modules"), "junction");
  const runtime = stubRuntime();

  writeFileSync(join(checkout, "package.json"), registryManifest(REGISTRY));
  boundOut = join(work, "bound");
  build(checkout, runtime, boundOut);

  writeFileSync(join(checkout, "package.json"), registryManifest(REFUSED_REGISTRY));
  refusedOut = join(work, "refused");
  build(checkout, runtime, refusedOut);
}, BUDGET_MS);

describe("a --registry fork's plugin build (publishConfig.registry, REQ-PLUGIN-048)", () => {
  it("names the registry ahead of every pinned spec, in bodies and hooks of all four roots", () => {
    const sites = callSites(boundOut, BOUND_CALL);

    // Every pinned spec in the tree sits behind `npx -y --@<scope>:registry=<url> `.
    expect(new Set([...sites.values()].flat())).toEqual(new Set([BOUND_CALL]));
    // Non-degenerate in every root, on both halves the build pins: the substituted bodies
    // (`stageSubstitutedCorpus`'s `cli`) and the planner-written hooks (`npmRegistry`).
    for (const client of CLIENTS) {
      const own = [...sites.keys()].filter((rel) => rel.startsWith(`${client}/`));
      expect(own.filter((rel) => !isHook(rel)).length, `${client} bodies`).toBeGreaterThan(0);
      expect(own.filter(isHook).length, `${client} hooks`).toBeGreaterThan(0);
    }
  });

  it("fails closed to `npx --no` and names no registry when the registry is outside the call grammar", () => {
    const sites = callSites(refusedOut, NO_FETCH_CALL);

    expect(new Set([...sites.values()].flat())).toEqual(new Set([NO_FETCH_CALL]));
    for (const rel of treeFiles(refusedOut)) {
      const text = readFileSync(join(refusedOut, rel), "utf8");
      expect(text, rel).not.toContain(`--@${FORK_PUBLISHER}:registry=`);
      expect(text, rel).not.toContain("registry.example.invalid");
    }
    // The same call sites as the bound build: only the call's form moved.
    const counts = (map: Map<string, string[]>): Record<string, number> =>
      Object.fromEntries([...map].map(([rel, found]) => [rel, found.length]));
    expect(counts(sites)).toEqual(counts(callSites(boundOut, BOUND_CALL)));
  });
});
