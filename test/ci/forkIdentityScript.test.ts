import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { repositoryRoute } from "../support/identity.ts";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * `scripts/fork-identity.mjs`: the one command that replaces the copy-paste identity block of
 * `docs/enterprise-forks.md` (C1 of plan 010, the only writer of the `package.json` identity).
 *
 * Every case runs the real script, the real resolver and the real generators inside a
 * `downstreamCheckout` copy with its own git repository, because the script's dirty check reads
 * `git status` and its last step spawns the two generators from the checkout it rewrites. No
 * value here is a canonical literal: the canonical route comes from `test/support/identity.ts`,
 * so `test/ci/forkIdentity.test.ts`'s spelling census reads this file as clean and a renamed
 * fork runs it unedited.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A fork owner in mixed case, so the lowercased default scope is a real transformation. */
const OWNER = "Acme-Corp";
const REPO = "stamity-internal";
const SCOPE = "acme-corp";
const FORK_URL = `https://github.com/${OWNER}/${REPO}`;

/** The C1 keys, in the order the script reports them. */
const IDENTITY_KEYS = ["name", "repository", "homepage", "bugs", "stamity.publisher", "private", "publishConfig"];
const TARGETS = ["package.json", "renovate/plugins.json", "renovate/companion.json"];
const GENERATED = [".claude-plugin/marketplace.json", "apm.yml"];

// Several cases run the script and both generators two or three times; the Windows leg starts
// node processes several times slower than a POSIX host, so the budget is set per case rather
// than relying on the suite's 20 s default.
const GENERATOR_BUDGET = 180_000;

const work = mkdtempSync(join(tmpdir(), "stamity-fork-identity-script-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function git(root: string, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

/**
 * A downstream checkout that is also a git repository with its identity files committed, the
 * state a fork is in right after its import. Identity and signing are forced on the command
 * line so the machine's own git configuration cannot change the fixture.
 */
function fork(): string {
  const root = mkdtempSync(join(work, "fork-"));
  downstreamCheckout(root);
  cpSync(join(REPO_ROOT, "renovate"), join(root, "renovate"), { recursive: true });
  for (const args of [
    ["init", "--quiet", "--initial-branch", "fixture"],
    ["add", "--", ...TARGETS],
    [
      "-c",
      "user.name=fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--message",
      "fixture: the imported fork",
    ],
  ]) {
    const result = git(root, ...args);
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return root;
}

function run(root: string, args: string[], script = "fork-identity.mjs"): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8" });
}

const output = (result: SpawnSyncReturns<string>): string => `${result.stdout}\n${result.stderr}`;

function json(root: string, relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, relPath), "utf8")) as Record<string, unknown>;
}

function digests(root: string, paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    paths.map((relPath) => [relPath, createHash("sha256").update(readFileSync(join(root, relPath))).digest("hex")]),
  );
}

/** A C1 key's value, read the way the script names it (`stamity.publisher` is nested). */
function field(pkg: Record<string, unknown>, key: string): unknown {
  if (key === "stamity.publisher") return (pkg["stamity"] as Record<string, unknown> | undefined)?.["publisher"];
  return pkg[key];
}

/** The C1 keys whose values differ between two manifests, observed rather than predicted. */
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return IDENTITY_KEYS.filter((key) => JSON.stringify(field(before, key)) !== JSON.stringify(field(after, key)));
}

const depName = (root: string): unknown =>
  (json(root, "renovate/plugins.json")["customManagers"] as Record<string, unknown>[])[0]?.["depNameTemplate"];
const pinnedPackages = (root: string): unknown =>
  (json(root, "renovate/companion.json")["packageRules"] as Record<string, unknown>[])[0]?.["matchPackageNames"];

describe("scripts/fork-identity.mjs", () => {
  it("keeps package.json's own serialisation, so an unrenamed manifest round-trips byte-identical", () => {
    const text = readFileSync(join(REPO_ROOT, "package.json"), "utf8");
    expect(`${JSON.stringify(JSON.parse(text), null, 2)}\n`).toBe(text);
  });

  it(
    "sets the fork's identity, regenerates, and is a no-op on a rerun and green under --check",
    () => {
      const root = fork();
      const before = json(root, "package.json");

      const applied = run(root, ["--repository", FORK_URL]);
      expect(applied.status, output(applied)).toBe(0);

      const pkg = json(root, "package.json");
      expect(pkg["name"]).toBe(`@${SCOPE}/stamity`);
      expect(pkg["repository"]).toEqual({ type: "git", url: `git+${FORK_URL}.git` });
      expect(pkg["homepage"]).toBe(FORK_URL);
      expect(pkg["bugs"]).toEqual({ url: `${FORK_URL}/issues` });
      expect(pkg["private"]).toBe(true);
      expect(pkg).not.toHaveProperty("publishConfig");
      // The publisher is set and every other `stamity` key survives: the distribution block
      // is the fork's own configuration and the script has no business with it.
      expect(pkg["stamity"]).toEqual({
        ...(before["stamity"] as Record<string, unknown>),
        publisher: OWNER,
      });
      // Nothing outside C1 moves: version, scripts, dependencies and the rest are byte-for-byte
      // the manifest the fork imported.
      const rest = (value: Record<string, unknown>): Record<string, unknown> =>
        Object.fromEntries(Object.entries(value).filter(([key]) => !["stamity", ...IDENTITY_KEYS].includes(key)));
      expect(rest(pkg)).toEqual(rest(before));
      expect(Object.keys(rest(pkg))).toEqual(Object.keys(rest(before)));

      expect(depName(root)).toBe(`${OWNER}/${REPO}`);
      expect(pinnedPackages(root)).toEqual([`@${SCOPE}/stamity`]);

      const keys = changedKeys(before, pkg);
      expect(keys.length, "the rename changed no identity key").toBeGreaterThan(3);
      expect(applied.stdout).toContain(`updated package.json (${keys.join(", ")})`);
      expect(applied.stdout).toContain("updated renovate/plugins.json (depNameTemplate)");
      expect(applied.stdout).toContain("updated renovate/companion.json (matchPackageNames)");
      expect(applied.stdout.trimEnd().split("\n").at(-1)).toBe(`identity: @${SCOPE}/stamity published by ${OWNER}`);

      for (const script of ["generate-plugin-manifests.mjs", "generate-apm-package.mjs"]) {
        const checked = run(root, ["--check"], script);
        expect(checked.status, `${script}\n${output(checked)}`).toBe(0);
      }

      // The rerun meets three files that are dirty against HEAD but already at their target:
      // that is the state the first run leaves, and it must proceed rather than refuse.
      expect(git(root, "status", "--porcelain", "--", "package.json").stdout.trim()).not.toBe("");
      const settled = digests(root, [...TARGETS, ...GENERATED]);
      const again = run(root, ["--repository", FORK_URL]);
      expect(again.status, output(again)).toBe(0);
      for (const relPath of TARGETS) expect(again.stdout).toContain(`unchanged ${relPath}\n`);
      expect(again.stdout).not.toContain("updated ");
      expect(digests(root, [...TARGETS, ...GENERATED])).toEqual(settled);

      const checked = run(root, ["--repository", FORK_URL, "--check"]);
      expect(checked.status, output(checked)).toBe(0);
      expect(checked.stdout).not.toContain("drift ");
      expect(digests(root, [...TARGETS, ...GENERATED])).toEqual(settled);
    },
    GENERATOR_BUDGET,
  );

  it(
    "reports drift under --check on the unrenamed tree and writes nothing",
    () => {
      const root = fork();
      const imported = digests(root, TARGETS);
      const result = run(root, ["--repository", FORK_URL, "--check"]);
      expect(result.status, output(result)).toBe(1);
      expect(result.stdout).toMatch(/^drift package\.json \(name, /m);
      expect(result.stdout).toContain("drift renovate/plugins.json (depNameTemplate)");
      expect(result.stdout).toContain("drift renovate/companion.json (matchPackageNames)");
      expect(digests(root, TARGETS)).toEqual(imported);
    },
    GENERATOR_BUDGET,
  );

  it(
    "makes a CLI-publishing fork with --registry: no private flag, the registry, an npm marketplace source",
    () => {
      const root = fork();
      const result = run(root, ["--repository", FORK_URL, "--registry", "https://npm.pkg.github.com"]);
      expect(result.status, output(result)).toBe(0);
      const pkg = json(root, "package.json");
      expect(pkg).not.toHaveProperty("private");
      expect(pkg["publishConfig"]).toEqual({ registry: "https://npm.pkg.github.com" });
      const catalog = json(root, ".claude-plugin/marketplace.json") as { plugins: Record<string, unknown>[] };
      expect(catalog.plugins[0]?.["source"]).toMatchObject({ source: "npm", package: `@${SCOPE}/stamity` });
    },
    GENERATOR_BUDGET,
  );

  it(
    "rewrites the presets exactly once when the fork's route extends the one they carry",
    () => {
      // The copy-paste block this script replaces used `replaceAll`, so a repository whose
      // slug starts with the canonical route was rewritten twice on a second run. The route
      // is read from this checkout, so the case is the same on the canonical tree and a fork.
      const { slug } = repositoryRoute();
      const owner = slug.split("/")[0] ?? "";
      const extended = `${slug}-private`;
      const root = fork();
      expect(depName(root)).toBe(slug);

      const first = run(root, ["--repository", `https://github.com/${extended}`]);
      expect(first.status, output(first)).toBe(0);
      expect(depName(root)).toBe(extended);
      expect(pinnedPackages(root)).toEqual([`@${owner.toLowerCase()}/stamity`]);

      const settled = digests(root, TARGETS);
      const second = run(root, ["--repository", `https://github.com/${extended}`]);
      expect(second.status, output(second)).toBe(0);
      expect(depName(root)).toBe(extended);
      for (const relPath of TARGETS) expect(second.stdout).toContain(`unchanged ${relPath}\n`);
      expect(digests(root, TARGETS)).toEqual(settled);
    },
    GENERATOR_BUDGET,
  );

  it(
    "refuses a dirty file it would change, naming it, and writes nothing at all",
    () => {
      const root = fork();
      const path = join(root, "package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      writeFileSync(path, `${JSON.stringify({ ...pkg, description: "a local edit" }, null, 2)}\n`);
      const imported = digests(root, TARGETS);

      const result = run(root, ["--repository", FORK_URL]);
      expect(result.status, output(result)).toBe(1);
      expect(result.stderr).toMatch(/package\.json/);
      expect(result.stderr).not.toMatch(/renovate\//);
      // The presets are clean and would change; nothing is written because one file refused.
      expect(digests(root, TARGETS)).toEqual(imported);
    },
    GENERATOR_BUDGET,
  );

  it(
    "names the rerun when a generator fails, and a rerun after the fix completes",
    () => {
      const root = fork();
      // A real generator failure, not a stub: the manifest generator refuses a tree without
      // its brand asset before it writes anything.
      rmSync(join(root, "assets/logo.svg"));

      const failed = run(root, ["--repository", FORK_URL]);
      expect(failed.status, output(failed)).toBe(1);
      expect(output(failed)).toContain("rerun node scripts/fork-identity.mjs once the generator's error is fixed");
      // The identity was written before the generators ran; the rerun finds it in place.
      expect(json(root, "package.json")["name"]).toBe(`@${SCOPE}/stamity`);

      cpSync(join(REPO_ROOT, "assets/logo.svg"), join(root, "assets/logo.svg"));
      const rerun = run(root, ["--repository", FORK_URL]);
      expect(rerun.status, output(rerun)).toBe(0);
      for (const relPath of TARGETS) expect(rerun.stdout).toContain(`unchanged ${relPath}\n`);
      expect(rerun.stdout).toContain(`identity: @${SCOPE}/stamity published by ${OWNER}`);
      expect(run(root, ["--check"], "generate-plugin-manifests.mjs").status).toBe(0);
    },
    GENERATOR_BUDGET,
  );

  describe("arguments and refusals", () => {
    let shared: string | null = null;
    const root = (): string => (shared ??= fork());

    it("prints the usage and exits 2 with no arguments or an unknown flag, and exits 0 on --help", () => {
      const none = run(root(), []);
      expect(none.status).toBe(2);
      expect(none.stderr).toContain("Usage: node scripts/fork-identity.mjs --repository");

      const unknown = run(root(), ["--repository", FORK_URL, "--dry-run"]);
      expect(unknown.status).toBe(2);
      expect(unknown.stderr).toContain("--dry-run");

      const missing = run(root(), ["--repository"]);
      expect(missing.status).toBe(2);

      for (const flag of ["--help", "-h"]) {
        const help = run(root(), [flag]);
        expect(help.status, flag).toBe(0);
        expect(help.stdout).toContain("Usage: node scripts/fork-identity.mjs --repository");
      }
    }, GENERATOR_BUDGET);

    it("refuses a repository outside github.com or carrying credentials, without echoing it", () => {
      const imported = digests(root(), TARGETS);
      for (const url of [
        "https://gitlab.com/acme-corp/stamity-internal",
        "https://fixture-user:fixture-pass@github.com/Acme-Corp/stamity-internal",
        "https://github.com/Acme-Corp/stamity-internal/tree/main",
        "http://github.com/Acme-Corp/stamity-internal",
      ]) {
        const result = run(root(), ["--repository", url]);
        expect(result.status, url).toBe(1);
        expect(output(result), url).not.toContain(url);
        expect(output(result), url).not.toContain("fixture-pass");
        expect(output(result), url).not.toContain("gitlab.com");
      }
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, GENERATOR_BUDGET);

    it("accepts the git+ prefix and the .git suffix on the repository", () => {
      // --check writes nothing, so the shared checkout stays unrenamed; the drift lines prove
      // the URL was parsed into the same target the plain form gives.
      for (const url of [`git+${FORK_URL}.git`, `${FORK_URL}.git`]) {
        const result = run(root(), ["--repository", url, "--check"]);
        expect(result.status, url).toBe(1);
        expect(result.stdout, url).toContain("drift renovate/plugins.json (depNameTemplate)");
        expect(output(result), url).not.toContain("invalid");
      }
    }, GENERATOR_BUDGET);

    it("refuses a scope npm would not accept", () => {
      const imported = digests(root(), TARGETS);
      for (const scope of ["Acme", "@acme", ".acme"]) {
        const result = run(root(), ["--repository", FORK_URL, "--scope", scope]);
        expect(result.status, scope).toBe(1);
        expect(result.stderr, scope).toContain("--scope");
      }
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, GENERATOR_BUDGET);

    it("refuses a registry that is not a clean https URL, without echoing it", () => {
      const imported = digests(root(), TARGETS);
      for (const registry of [
        "http://registry.example.invalid",
        "https://fixture-user:fixture-pass@registry.example.invalid",
        "https://registry.example.invalid/?token=fixture-pass",
        "https://registry.example.invalid/#fixture-pass",
        "registry.example.invalid",
      ]) {
        const result = run(root(), ["--repository", FORK_URL, "--registry", registry]);
        expect(result.status, registry).toBe(1);
        expect(result.stderr, registry).toContain("--registry");
        expect(output(result), registry).not.toContain("registry.example.invalid");
        expect(output(result), registry).not.toContain("fixture-pass");
      }
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, GENERATOR_BUDGET);
  });
});
