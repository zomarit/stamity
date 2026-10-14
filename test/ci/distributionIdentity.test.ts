import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the resolver is a plain .mjs script with no type declarations, and it
// stays that way: `scripts/fork-identity.mjs`, its one caller, runs standalone, with no
// TypeScript toolchain anywhere near it.
import { resolveDistributionIdentity } from "../../scripts/distribution-identity.mjs";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * The package-author identity check, as `scripts/fork-identity.mjs` runs it on every candidate
 * manifest: who owns the source (`stamity.publisher`) and where it lives (`repository.url`).
 *
 * TEST CHANGE, justified (plan 020 file 1, unit d5-scripts-trees): this suite also held the
 * distribution half (REQ-PLUGIN-009), the branch, tag pattern and four per-client sources the
 * plugin roots were fetched from, its credential refusals and the generators' exit code. That half
 * is deleted with the plugin and APM routes in 1.15.0, and its cases went with it. A leftover
 * `stamity.distribution` block is now ignored with a one-line notice for one release, never read
 * and never refused, and the cases below prove that.
 *
 * No secret literal appears in this file. The credential-shaped value is assembled at run time
 * from a prefix and a repeated character, so the repository's own leak gate stays green.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The resolver's absent-publisher default, which is the canonical owner in production. */
const DEFAULT_OWNER = "zomarit";
/** A synthetic manifest's repository, built from a constant and never from this checkout. */
const REPOSITORY = `https://github.com/${DEFAULT_OWNER}/stamity`;

/** The notice, verbatim: the plan fixes its wording and a fork reads it in a terminal or CI log. */
const NOTICE = "package.json `stamity.distribution` is ignored since 1.15.0; remove it";

/** A GitHub classic token's SHAPE, never a token: 36 characters of filler after the prefix. */
const TOKEN_SHAPED = `ghp_${"a".repeat(36)}`;

/** The block this repository committed through 1.14.0, which a fork imported with it. */
const LEFTOVER_BLOCK = { branch: "plugin-dist", tagPattern: "plugins/v<version>" };

// Two script runs, each a node start and a git call; the Windows leg starts node processes
// several times slower than a POSIX host, so the case carries its own budget.
const SCRIPT_BUDGET = 180_000;

const workspaces: string[] = [];
afterAll(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Identity {
  readonly publisher: string;
  readonly notices: readonly string[];
}

/** A synthetic manifest carrying only what the resolver reads. */
function pkg(stamity?: unknown): Record<string, unknown> {
  const manifest: Record<string, unknown> = { repository: { url: `git+${REPOSITORY}.git` } };
  if (stamity !== undefined) manifest["stamity"] = stamity;
  return manifest;
}

function resolve(manifest: Record<string, unknown>): Identity {
  return resolveDistributionIdentity(manifest) as Identity;
}

function refusal(manifest: Record<string, unknown>): string {
  try {
    resolveDistributionIdentity(manifest);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the manifest was accepted, so there is no refusal to read");
}

describe("the publisher", () => {
  it("defaults to the canonical owner and returns exactly the publisher and the notices", () => {
    const identity = resolve(pkg());
    expect(identity).toEqual({ publisher: DEFAULT_OWNER, notices: [] });
    expect(Object.keys(identity)).toEqual(["publisher", "notices"]);
  });

  it("keeps a configured publisher as written, matched to the owner without case", () => {
    expect(resolve(pkg({ publisher: "Zomarit" }))).toEqual({ publisher: "Zomarit", notices: [] });
  });

  it("refuses a publisher that is not a GitHub owner slug", () => {
    expect(refusal(pkg({ publisher: "-zomarit" }))).toBe(
      "package.json `stamity.publisher` must be a GitHub owner slug (1–39 letters, digits or single interior hyphens).",
    );
    expect(refusal(pkg({ publisher: 7 }))).toContain("`stamity.publisher` must be a GitHub owner slug");
  });

  it("refuses a publisher that is not the owner in repository.url", () => {
    expect(refusal({ ...pkg(), stamity: { publisher: "acme" } })).toMatch(
      /must match the owner in `repository.url`/,
    );
  });
});

describe("the repository", () => {
  it("keeps the github.com boundary and never echoes the URL", () => {
    const url = `https://oauth2:${TOKEN_SHAPED}@git.example.invalid/org/p.git`;
    const message = refusal({ repository: { url } });
    expect(message).toMatch(/must normalize to https:\/\/github\.com/);
    expect(message).not.toContain(TOKEN_SHAPED);
    expect(refusal({})).toBe("Set package.json `repository.url` to https://github.com/<owner>/<repo>.");
  });
});

describe("the stamity block", () => {
  it("ignores a leftover distribution block with the one-line notice, and reads nothing in it", () => {
    // Non-degenerate: the block is the one this repository committed through 1.14.0, which the
    // removed half resolved into a branch, a tag pattern and four sources. Now it yields the
    // notice and nothing else, and the publisher is the default an absent block gives.
    expect(resolve(pkg({ distribution: LEFTOVER_BLOCK }))).toEqual({ publisher: DEFAULT_OWNER, notices: [NOTICE] });
    expect(resolve(pkg({ publisher: DEFAULT_OWNER, distribution: LEFTOVER_BLOCK }))).toEqual({
      publisher: DEFAULT_OWNER,
      notices: [NOTICE],
    });
  });

  it("ignores a distribution block whatever it holds, and never echoes it", () => {
    // Shapes the removed half refused (an unknown key, a credential-shaped key and value, a
    // block that is not an object) are no longer read at all, so none is refused, and the
    // notice is the same fixed line whatever the block carries.
    for (const distribution of [
      { sources: { emacs: {} }, token: "x" },
      { sources: { claude: { path: TOKEN_SHAPED } } },
      TOKEN_SHAPED,
      null,
    ]) {
      const identity = resolve(pkg({ distribution }));
      expect(identity.notices).toEqual([NOTICE]);
      expect(JSON.stringify(identity)).not.toContain(TOKEN_SHAPED);
    }
  });

  it("still refuses any other stamity key, and a stamity value that is not an object", () => {
    const unknown = "package.json `stamity` accepts only `publisher`; remove unsupported keys.";
    expect(refusal({ ...pkg(), stamity: { extra: true } })).toBe(unknown);
    expect(refusal({ ...pkg(), stamity: { distribution: LEFTOVER_BLOCK, extra: true } })).toBe(unknown);
    expect(refusal({ ...pkg(), stamity: [] })).toBe("package.json `stamity` must be an object containing only `publisher`.");
  });

  it("is absent from this repository's own manifest, which resolves with no notice", () => {
    const committed = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Record<string, unknown>;
    expect((committed["stamity"] as Record<string, unknown> | undefined)?.["distribution"]).toBeUndefined();
    expect(resolve(committed).notices).toEqual([]);
  });
});

describe("a fork that still holds the block", () => {
  it(
    "sets its identity and reports it current under --check, printing the notice and keeping the block",
    () => {
      // A real checkout with its own git repository, because the script's dirty check reads
      // `git status`, and `renovate/companion.json`, the preset the script rewrites beside the
      // manifest. The block is committed as a fork that imported it before 1.15.0 holds it.
      const root = mkdtempSync(join(tmpdir(), "stamity-distribution-"));
      workspaces.push(root);
      downstreamCheckout(root);
      mkdirSync(join(root, "renovate"));
      cpSync(join(REPO_ROOT, "renovate/companion.json"), join(root, "renovate/companion.json"));
      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
      manifest["stamity"] = { ...((manifest["stamity"] ?? {}) as Record<string, unknown>), distribution: LEFTOVER_BLOCK };
      writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      const git = (...args: string[]): void => {
        const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
        expect(result.status, `git ${args.join(" ")}\n${result.stderr}`).toBe(0);
      };
      git("init", "--quiet", "--initial-branch", "fixture");
      git("add", "--", "package.json", "renovate/companion.json");
      git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
        "commit", "--quiet", "--message", "fixture: a fork holding the distribution block");

      const run = (...args: string[]) =>
        spawnSync(process.execPath, [join(root, "scripts/fork-identity.mjs"), "--repository",
          "https://github.com/acme/stamity-private", ...args], { cwd: root, encoding: "utf8" });
      const applied = run();
      expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
      expect(applied.stderr).toBe(`fork-identity: ${NOTICE}\n`);

      const checked = run("--check");
      expect(checked.status, `${checked.stdout}\n${checked.stderr}`).toBe(0);
      expect(checked.stdout).not.toContain("drift ");
      expect(checked.stdout).toContain("unchanged package.json\n");
      expect(checked.stderr).toBe(`fork-identity: ${NOTICE}\n`);
      // The script owns the identity keys only: the block it warns about is left for the fork.
      const after = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { stamity: Record<string, unknown> };
      expect(after.stamity).toEqual({ distribution: LEFTOVER_BLOCK, publisher: "acme" });
    },
    SCRIPT_BUDGET,
  );
});
