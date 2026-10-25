import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the script is a native ESM source-checkout tool with no declaration file.
import { replaceFile, requireCleanRegistry } from "../../scripts/fork-identity.mjs";
// @ts-expect-error — the rule's restatement is a native ESM script with no declaration file.
import { REGISTRY_URL as SCRIPT_REGISTRY_URL } from "../../scripts/registry-url.mjs";
import { REGISTRY_URL } from "../../src/shared/cliCall.ts";
import { repositoryRoute } from "../support/identity.ts";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * `scripts/fork-identity.mjs`: the one command that replaces the copy-paste identity block of
 * `docs/enterprise-forks.md` (C1 of plan 010, the only writer of the `package.json` identity).
 *
 * Every case runs the real script and the real resolver inside a `downstreamCheckout` copy with
 * its own git repository, because the script's dirty check reads `git status`. Since 1.15.0 the
 * script runs no generator: the plugin and APM surfaces it used to regenerate are deleted with
 * their routes, and `renovate/plugins.json` is a leftover it leaves alone. No value here is a
 * canonical literal: the canonical route comes from `test/support/identity.ts`,
 * so `test/ci/forkIdentity.test.ts`'s spelling census reads this file as clean and a renamed
 * fork runs it unedited.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A fork owner in mixed case, so the lowercased default scope is a real transformation. */
const OWNER = "Acme-Corp";
const REPO = "stamity-internal";
const SCOPE = "acme-corp";
const FORK_URL = `https://github.com/${OWNER}/${REPO}`;
// TEST CHANGE, justified (REQ-PLUGIN-033): the two credentialed URLs the refusal cases feed were
// literals at each case; each is now split at its `@` and joined once here, byte-identical, so the
// source carries no URL with a user:password pair.
const CREDENTIALED_FORK_URL = ["https://fixture-user:fixture-pass", `@github.com/${OWNER}/${REPO}`].join("");
const CREDENTIALED_REGISTRY = ["https://fixture-user:fixture-pass", "@registry.example.invalid"].join("");

/** The C1 keys, in the order the script reports them. */
const IDENTITY_KEYS = ["name", "repository", "homepage", "bugs", "stamity.publisher", "private", "publishConfig"];
const TARGETS = ["package.json", "renovate/companion.json"];
/**
 * What the two generators the script spawned before 1.15.0 wrote into the checkout. Their absence
 * after a run is the proof that no generator ran: the copied `scripts/` still holds them until the
 * routes' build scripts are deleted, and the old script's last step created both files.
 */
const GENERATOR_OUTPUTS = [".claude-plugin/marketplace.json", "apm.yml"];
/** The tag-manager preset of the deleted plugin route, which a fork may still hold. */
const LEFTOVER_PRESET = "renovate/plugins.json";

// Several cases run the script two or three times, each with a git call; the Windows leg starts
// node processes several times slower than a POSIX host, so the budget is set per case rather
// than relying on the suite's 20 s default.
const SCRIPT_BUDGET = 180_000;

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
  // The one preset the script keeps, copied alone: the plugin route's preset is not part of a
  // fork's tree from 1.15.0 on, and the case that plants it writes its own copy.
  mkdirSync(join(root, "renovate"));
  cpSync(join(REPO_ROOT, "renovate/companion.json"), join(root, "renovate/companion.json"));
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

function run(
  root: string,
  args: string[],
  script = "fork-identity.mjs",
  env: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", env });
}

/** Run `mutate` against one file of the shared checkout, then put its exact bytes back. */
function withFile(root: string, relPath: string, mutate: (path: string) => void, body: () => void): void {
  const path = join(root, relPath);
  const original = readFileSync(path);
  try {
    mutate(path);
    body();
  } finally {
    writeFileSync(path, original);
  }
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

const absent = (root: string, paths: readonly string[]): string[] => paths.filter((relPath) => !existsSync(join(root, relPath)));
const pinnedPackages = (root: string): unknown =>
  (json(root, "renovate/companion.json")["packageRules"] as Record<string, unknown>[])[0]?.["matchPackageNames"];

describe("scripts/fork-identity.mjs", () => {
  it("keeps package.json's own serialisation, so an unrenamed manifest round-trips byte-identical", () => {
    const text = readFileSync(join(REPO_ROOT, "package.json"), "utf8");
    expect(`${JSON.stringify(JSON.parse(text), null, 2)}\n`).toBe(text);
  });

  it(
    "sets the fork's identity, runs no generator, and is a no-op on a rerun and green under --check",
    () => {
      const root = fork();
      // The tree a 1.15.0 fork has: no plugin-route preset (REQ-PLUGIN-028, plan 020 d1).
      expect(existsSync(join(root, LEFTOVER_PRESET))).toBe(false);
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

      expect(pinnedPackages(root)).toEqual([`@${SCOPE}/stamity`]);

      const keys = changedKeys(before, pkg);
      expect(keys.length, "the rename changed no identity key").toBeGreaterThan(3);
      expect(applied.stdout).toContain(`updated package.json (${keys.join(", ")})`);
      expect(applied.stdout).toContain("updated renovate/companion.json (matchPackageNames)");
      expect(applied.stdout.trimEnd().split("\n").at(-1)).toBe(`identity: @${SCOPE}/stamity published by ${OWNER}`);
      // No generator ran: neither surface the two route generators wrote exists, and nothing
      // names the deleted preset.
      expect(absent(root, GENERATOR_OUTPUTS)).toEqual(GENERATOR_OUTPUTS);
      expect(output(applied)).not.toContain(LEFTOVER_PRESET);

      // The rerun meets two files that are dirty against HEAD but already at their target:
      // that is the state the first run leaves, and it must proceed rather than refuse.
      expect(git(root, "status", "--porcelain", "--", "package.json").stdout.trim()).not.toBe("");
      const settled = digests(root, TARGETS);
      const again = run(root, ["--repository", FORK_URL]);
      expect(again.status, output(again)).toBe(0);
      for (const relPath of TARGETS) expect(again.stdout).toContain(`unchanged ${relPath}\n`);
      expect(again.stdout).not.toContain("updated ");
      expect(digests(root, TARGETS)).toEqual(settled);

      // `--check` on a tree with no `renovate/plugins.json` is green once the identity is set.
      const checked = run(root, ["--repository", FORK_URL, "--check"]);
      expect(checked.status, output(checked)).toBe(0);
      expect(checked.stdout).not.toContain("drift ");
      expect(digests(root, TARGETS)).toEqual(settled);
      expect(absent(root, [...GENERATOR_OUTPUTS, LEFTOVER_PRESET])).toEqual([...GENERATOR_OUTPUTS, LEFTOVER_PRESET]);
    },
    SCRIPT_BUDGET,
  );

  it(
    "reports drift under --check on the unrenamed tree and writes nothing",
    () => {
      const root = fork();
      const imported = digests(root, TARGETS);
      const result = run(root, ["--repository", FORK_URL, "--check"]);
      expect(result.status, output(result)).toBe(1);
      expect(result.stdout).toMatch(/^drift package\.json \(name, /m);
      expect(result.stdout).toContain("drift renovate/companion.json (matchPackageNames)");
      expect(result.stdout).not.toContain(LEFTOVER_PRESET);
      expect(digests(root, TARGETS)).toEqual(imported);
    },
    SCRIPT_BUDGET,
  );

  it(
    "makes a CLI-publishing fork with --registry: no private flag, the registry, the pinned package",
    () => {
      const root = fork();
      const result = run(root, ["--repository", FORK_URL, "--registry", "https://npm.pkg.github.com"]);
      expect(result.status, output(result)).toBe(0);
      const pkg = json(root, "package.json");
      expect(pkg).not.toHaveProperty("private");
      expect(pkg["publishConfig"]).toEqual({ registry: "https://npm.pkg.github.com" });
      // TEST CHANGE, justified (plan 020 d1, REQ-PLUGIN-028): this case read the regenerated
      // marketplace's npm source, a surface the script no longer generates (the plugin route is
      // deleted). The registry fork's package name is now proven where the script still writes it.
      expect(pinnedPackages(root)).toEqual([`@${SCOPE}/stamity`]);
      expect(absent(root, GENERATOR_OUTPUTS)).toEqual(GENERATOR_OUTPUTS);
    },
    SCRIPT_BUDGET,
  );

  // TEST CHANGE, justified (plan 020 d1, REQ-PLUGIN-028): the case "rewrites the presets exactly
  // once when the fork's route extends the one they carry" went with the `renovate/plugins.json`
  // retarget it exercised. The preset the script still rewrites holds a scoped package name, and
  // no `@<scope>/stamity` contains another as a substring, so the double rewrite has no input left.
  // Its place is taken by the leftover preset, which the script must now leave alone.
  it(
    "leaves a fork's leftover renovate/plugins.json untouched, applied, rerun and under --check",
    () => {
      const root = fork();
      // A synthetic copy of the deleted route's preset, carrying the route this checkout names,
      // committed as a fork that imported it before 1.15.0 would hold it.
      const { slug } = repositoryRoute();
      const preset = `${JSON.stringify({ customManagers: [{ customType: "regex", depNameTemplate: slug }] }, null, 2)}\n`;
      writeFileSync(join(root, LEFTOVER_PRESET), preset);
      for (const args of [
        ["add", "--", LEFTOVER_PRESET],
        ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
          "commit", "--quiet", "--message", "fixture: the leftover preset"],
      ]) {
        const result = git(root, ...args);
        expect(result.status, `git ${args.join(" ")}\n${result.stderr}`).toBe(0);
      }
      const leftover = digests(root, [LEFTOVER_PRESET]);

      const applied = run(root, ["--repository", FORK_URL]);
      expect(applied.status, output(applied)).toBe(0);
      // Non-degenerate: the run did rename the fork, so the preset was in reach of a rewrite.
      expect(applied.stdout).toContain("updated renovate/companion.json (matchPackageNames)");
      expect(output(applied)).not.toContain(LEFTOVER_PRESET);
      expect(readFileSync(join(root, LEFTOVER_PRESET), "utf8")).toBe(preset);

      const settled = digests(root, TARGETS);
      const again = run(root, ["--repository", FORK_URL]);
      expect(again.status, output(again)).toBe(0);
      expect(again.stdout).not.toContain("updated ");
      expect(digests(root, TARGETS)).toEqual(settled);

      const checked = run(root, ["--repository", FORK_URL, "--check"]);
      expect(checked.status, output(checked)).toBe(0);
      expect(output(checked)).not.toContain(LEFTOVER_PRESET);
      expect(digests(root, [LEFTOVER_PRESET])).toEqual(leftover);
      expect(git(root, "status", "--porcelain", "--", LEFTOVER_PRESET).stdout).toBe("");
    },
    SCRIPT_BUDGET,
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
    SCRIPT_BUDGET,
  );

  // TEST CHANGE, justified (plan 020 d1, REQ-PLUGIN-028): the case "names the rerun when a
  // generator fails, and a rerun after the fix completes" went with the generator step it
  // exercised. The script runs no generator, so no generator failure reaches it; the first case
  // proves that no generator output appears.

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
    }, SCRIPT_BUDGET);

    it("refuses a repository outside github.com or carrying credentials, without echoing it", () => {
      const imported = digests(root(), TARGETS);
      for (const url of [
        "https://gitlab.com/acme-corp/stamity-internal",
        CREDENTIALED_FORK_URL,
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
    }, SCRIPT_BUDGET);

    it("accepts the git+ prefix and the .git suffix on the repository", () => {
      // --check writes nothing, so the shared checkout stays unrenamed; the drift lines prove
      // the URL was parsed into the same target the plain form gives.
      for (const url of [`git+${FORK_URL}.git`, `${FORK_URL}.git`]) {
        const result = run(root(), ["--repository", url, "--check"]);
        expect(result.status, url).toBe(1);
        expect(result.stdout, url).toContain("drift renovate/companion.json (matchPackageNames)");
        expect(output(result), url).not.toContain("invalid");
      }
    }, SCRIPT_BUDGET);

    it("refuses a scope npm would not accept", () => {
      const imported = digests(root(), TARGETS);
      for (const scope of ["Acme", "@acme", ".acme"]) {
        const result = run(root(), ["--repository", FORK_URL, "--scope", scope]);
        expect(result.status, scope).toBe(1);
        expect(result.stderr, scope).toContain("--scope");
      }
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, SCRIPT_BUDGET);

    it("refuses a registry that is not a clean https URL, without echoing it", () => {
      const imported = digests(root(), TARGETS);
      for (const registry of [
        "http://registry.example.invalid",
        CREDENTIALED_REGISTRY,
        "https://registry.example.invalid/?token=fixture-pass",
        "https://registry.example.invalid/#fixture-pass",
        "registry.example.invalid",
        // REQ-PLUGIN-048: outside the CLI's call grammar, so every call would render `npx --no`.
        "https://registry.example.invalid/My%20Project/npm/",
        "HTTPS://registry.example.invalid",
      ]) {
        const result = run(root(), ["--repository", FORK_URL, "--registry", registry]);
        expect(result.status, registry).toBe(1);
        expect(result.stderr, registry).toContain("--registry");
        expect(output(result), registry).not.toContain("registry.example.invalid");
        expect(output(result), registry).not.toContain("fixture-pass");
      }
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, SCRIPT_BUDGET);

    it("refuses a registry with a percent escape in its path, exit 1, without echoing it", () => {
      // REQ-PLUGIN-048: the plan's own input. `%` is outside the call grammar, so every pinned call
      // would render `npx --no`; the refusal names the flag and never the value.
      const registry = "https://r.example/a%20b";
      const imported = digests(root(), TARGETS);
      const result = run(root(), ["--repository", FORK_URL, "--registry", registry]);
      expect(result.status, output(result)).toBe(1);
      expect(result.stderr).toContain("--registry");
      expect(output(result)).not.toContain("r.example");
      expect(output(result)).not.toContain("a%20b");
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, SCRIPT_BUDGET);

    it("never echoes a value given as --flag=value or with no flag before it", () => {
      const repository = CREDENTIALED_FORK_URL;
      const registry = CREDENTIALED_REGISTRY;
      for (const args of [
        [`--repository=${repository}`],
        ["--repository", FORK_URL, `--registry=${registry}`],
        [repository],
      ]) {
        const label = args.join(" ");
        const result = run(root(), args);
        expect(result.status, label).toBe(2);
        expect(result.stderr, label).toContain("the value is not echoed");
        expect(output(result), label).not.toContain("fixture-pass");
        expect(output(result), label).not.toContain("fixture-user");
        expect(output(result), label).not.toContain("registry.example.invalid");
      }
      expect(run(root(), [`--repository=${repository}`]).stderr).toContain("--repository <value>");
    }, SCRIPT_BUDGET);

    it("exits 2 when a flag is given twice", () => {
      const result = run(root(), ["--repository", FORK_URL, "--repository", FORK_URL]);
      expect(result.status, output(result)).toBe(2);
      expect(result.stderr).toContain("--repository is given twice.");
    }, SCRIPT_BUDGET);

    it("exits 1 naming a target file that is missing or malformed, and writes nothing", () => {
      const relPath = "renovate/companion.json";
      const others = TARGETS.filter((target) => target !== relPath);
      const imported = digests(root(), others);
      withFile(root(), relPath, (path) => rmSync(path), () => {
        const result = run(root(), ["--repository", FORK_URL]);
        expect(result.status, output(result)).toBe(1);
        expect(result.stderr).toContain(`cannot read ${relPath}`);
      });
      withFile(root(), relPath, (path) => writeFileSync(path, "{"), () => {
        const result = run(root(), ["--repository", FORK_URL]);
        expect(result.status, output(result)).toBe(1);
        expect(result.stderr).toContain(`${relPath} is not valid JSON`);
      });
      expect(digests(root(), others)).toEqual(imported);
    }, SCRIPT_BUDGET);

    it("exits 1 naming the file when git cannot read the checkout's status, and writes nothing", () => {
      const imported = digests(root(), TARGETS);
      // GIT_DIR at a path that does not exist makes every git call in the child fail as outside
      // a repository would, without touching the shared checkout's own .git.
      const env = { ...process.env, GIT_DIR: join(root(), "no-such-git-dir") };
      const result = run(root(), ["--repository", FORK_URL], "fork-identity.mjs", env);
      expect(result.status, output(result)).toBe(1);
      expect(result.stderr).toMatch(/cannot read git status for (package\.json|renovate\/)/);
      expect(digests(root(), TARGETS)).toEqual(imported);
    }, SCRIPT_BUDGET);

    it("labels a file that differs from its target only in line endings (line endings)", () => {
      // The preset already pins this checkout's package, so with that package's scope its value is
      // at target and a CRLF copy differs in bytes alone. TEST CHANGE, justified (plan 020 d1): the
      // case read the plugin route's preset, which the script no longer rewrites; the companion
      // preset is the one left, and its scope is read from it rather than derived from the owner.
      const { slug } = repositoryRoute();
      const relPath = "renovate/companion.json";
      const pinned = (pinnedPackages(root()) as string[])[0] ?? "";
      const scope = /^@([^/]+)\//.exec(pinned)?.[1] ?? "";
      expect(scope, "the companion preset pins no scoped package").not.toBe("");
      withFile(
        root(),
        relPath,
        (path) => writeFileSync(path, readFileSync(path, "utf8").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")),
        () => {
          const result = run(root(), ["--repository", `https://github.com/${slug}`, "--scope", scope, "--check"]);
          expect(result.status, output(result)).toBe(1);
          expect(result.stdout).toContain(`drift ${relPath} (line endings)`);
        },
      );
    }, SCRIPT_BUDGET);
  });

  it("restates the CLI's REGISTRY_URL in scripts/registry-url.mjs, equal in source and flags", () => {
    // The script runs under bare Node with no TypeScript, so the rule is restated, not imported
    // (the pin `test/ci/pluginModules.test.ts` held for the plugin route's restatement).
    expect(SCRIPT_REGISTRY_URL).toBeInstanceOf(RegExp);
    expect((SCRIPT_REGISTRY_URL as RegExp).source).toBe(REGISTRY_URL.source);
    expect((SCRIPT_REGISTRY_URL as RegExp).flags).toBe(REGISTRY_URL.flags);
  });

  it("accepts exactly the registries the CLI's pinned call can name (REGISTRY_URL), and echoes none it refuses", () => {
    // REQ-PLUGIN-048: a `publishConfig.registry` outside the call grammar makes every pinned
    // call fail closed to `npx --no`. The script refuses it at fork time instead, so its rule
    // and the CLI's must agree on every input; this case is the parity guard.
    const accepted = [
      "https://npm.pkg.github.com",
      "https://npm.pkg.github.com/",
      "https://registry.example.invalid:8443/npm/feed/",
      "https://pkgs.example.invalid/org/_packaging/feed/npm/registry/",
      "https://registry.example.invalid/a~b_c.d-e",
      "https://registry.example.invalid:1/",
      "https://registry.example.invalid:65535/npm/",
    ];
    const refused = [
      "",
      "registry.example.invalid",
      "http://registry.example.invalid",
      "HTTPS://registry.example.invalid",
      " https://registry.example.invalid",
      "https://registry.example.invalid ",
      `https://registry.example.invalid${String.fromCharCode(10)}`,
      CREDENTIALED_REGISTRY,
      "https://registry.example.invalid/?token=fixture-pass",
      "https://registry.example.invalid/#fixture-pass",
      "https://registry.example.invalid/My%20Project/",
      "https://registry.example.invalid/$x",
      "https://registry.example.invalid/a'b",
      "https://registry.example.invalid/a`b`",
      'https://registry.example.invalid/a"b',
      "https://registry.example.invalid/a b",
      "https://registry.example.invalid/a;b",
      "https://registry.example.invalid/a&b",
      "https://registry.example.invalid/a^b",
      "https://registry_example.invalid",
      `https://b${String.fromCodePoint(0xfc)}cher.example.invalid`,
      "https://registry.example.invalid:0/",
      "https://registry.example.invalid:65536/npm/",
      "https://registry.example.invalid:99999",
    ];
    const scriptAccepts = (value: string): boolean => {
      try {
        requireCleanRegistry(value);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message, JSON.stringify(value)).toContain("--registry");
        expect(message, JSON.stringify(value)).not.toContain("registry.example.invalid");
        expect(message, JSON.stringify(value)).not.toContain("fixture-pass");
        return false;
      }
    };
    // Non-degenerate: the samples straddle the grammar as the CLI reads it.
    expect(accepted.every((value) => REGISTRY_URL.test(value))).toBe(true);
    expect(refused.some((value) => REGISTRY_URL.test(value))).toBe(false);
    for (const value of [...accepted, ...refused]) {
      expect(scriptAccepts(value), JSON.stringify(value)).toBe(REGISTRY_URL.test(value));
    }
  });

  it("removes the temporary file when the rename fails, and rethrows", () => {
    // A non-empty directory cannot be replaced by a file, on POSIX or Windows.
    const dir = mkdtempSync(join(work, "rename-"));
    const target = join(dir, "target");
    mkdirSync(target);
    writeFileSync(join(target, "occupant"), "");
    expect(() => replaceFile(target, "text")).toThrow();
    expect(existsSync(join(target, "occupant"))).toBe(true);
    expect(readdirSync(dir)).toEqual(["target"]);
  });
});
