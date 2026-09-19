import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — the resolver is a plain .mjs script with no type declarations, and it
// stays that way: the two generators that call it run standalone, with no TypeScript
// toolchain anywhere near them.
import { CREDENTIAL_SHAPES, DISTRIBUTION_CLIENTS, resolveDistributionIdentity, SOURCE_KINDS } from "../../scripts/distribution-identity.mjs";
// @ts-expect-error — same reason as above; the gate must run against an arbitrary `--root`.
import { RULES } from "../../scripts/leak-gate.mjs";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * The distribution contract (REQ-PLUGIN-009): who owns the source, and where the built
 * plugin roots are fetched from once they are published.
 *
 * Four groups, each answering a different question:
 *
 *   defaults     a repository that configures nothing still resolves four complete
 *                sources, derived from `repository.url` — and the block this repository
 *                DOES commit changes nothing a reader would not predict from it.
 *   refusals     the three message shapes the plan fixes, verbatim, because a downstream
 *                reads them in a CI log and has nothing else to go on.
 *   credentials  a key or a value that looks like a secret is refused, and the refusal
 *                never quotes the value — a diagnostic that echoes a token publishes it
 *                a second time, into the log.
 *   the host     `github` means the GitHub API and cannot address another forge;
 *                `git-subdir` can, and the refusal says so.
 *
 * No secret literal appears in this file. Every credential-shaped value is assembled at
 * run time from a prefix and a repeated character, so the repository's own leak gate
 * (`scripts/leak-gate.mjs`, which scans tracked AND untracked files) stays green on the
 * suite that proves the refusal works.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPOSITORY = "https://github.com/zomarit/stamity";

/** A GitHub classic token's SHAPE, never a token: 36 characters of filler after the prefix. */
const TOKEN_SHAPED = `ghp_${"a".repeat(36)}`;

const workspaces: string[] = [];
afterAll(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A synthetic manifest carrying only what the resolver reads. */
function pkg(stamity?: unknown): Record<string, unknown> {
  const manifest: Record<string, unknown> = { repository: { url: `git+${REPOSITORY}.git` } };
  if (stamity !== undefined) manifest["stamity"] = stamity;
  return manifest;
}

function resolve(stamity?: unknown): Record<string, unknown> {
  return resolveDistributionIdentity(pkg(stamity)) as Record<string, unknown>;
}

function refusal(stamity: unknown): string {
  try {
    resolveDistributionIdentity(pkg(stamity));
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the configuration was accepted, so there is no refusal to read");
}

const committed = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
  name: string;
  stamity?: { distribution?: Record<string, unknown> };
};

describe("distribution defaults", () => {
  it("resolves four complete sources from repository.url when no block is configured", () => {
    const identity = resolveDistributionIdentity(pkg()) as {
      publisher: string;
      repository: string;
      ownerSlug: string;
      distribution: Record<string, unknown>;
    };

    expect(identity.publisher).toBe("zomarit");
    expect(identity.repository).toBe(REPOSITORY);
    expect(identity.ownerSlug).toBe("zomarit");
    // Key order is part of the contract: P8 renders these objects into catalog files whose
    // bytes are compared, so a reordered resolution is a drifted release.
    expect(Object.keys(identity.distribution)).toEqual(["branch", "tagPattern", "sources"]);
    expect(identity.distribution).toEqual({
      branch: "plugin-dist",
      tagPattern: "plugins/v<version>",
      sources: {
        claude: { kind: "git-subdir", url: `${REPOSITORY}.git`, path: "claude" },
        cursor: { kind: "git-subdir", url: `${REPOSITORY}.git`, path: "cursor" },
        copilot: { kind: "git-subdir", url: `${REPOSITORY}.git`, path: "copilot" },
        codex: { kind: "git-subdir", url: `${REPOSITORY}.git`, path: "codex" },
      },
    });
    expect(Object.keys(identity.distribution["sources"] as object)).toEqual([...DISTRIBUTION_CLIENTS]);
  });

  it("keeps each key of the block independently optional", () => {
    // A downstream that states only its distribution keeps the publisher default, and one
    // that states only its publisher keeps the whole distribution default. Before this unit
    // the block accepted `publisher` alone, so the first half is the new admission.
    expect(resolve({ distribution: { branch: "dist/plugins" } })["publisher"]).toBe("zomarit");
    expect(resolve({ publisher: "Zomarit" })["distribution"]).toEqual(resolve()["distribution"]);
  });

  it("carries this repository's committed block, whose sources stay derived from repository.url", () => {
    // The committed block states the two release dimensions and nothing else, so the four
    // source URLs are never a second copy of `repository.url` that can drift away from it.
    expect(committed.stamity?.distribution).toEqual({
      branch: "plugin-dist",
      tagPattern: "plugins/v<version>",
    });
    // TEST CHANGE, justified (audit FORK-3): the expectation used to be the SYNTHETIC
    // resolution, which is anchored to the canonical repository URL, so a downstream that
    // repointed `repository.url` failed a test about derivation with a mismatch of owners.
    // The claim is "the four source URLs are derived from this manifest's repository", so
    // the expectation is now built from the resolution's own repository — identical bytes
    // on the canonical tree, and still false the moment a source URL is a second copy.
    const fromCheckout = resolveDistributionIdentity(committed) as {
      repository: string;
      distribution: { sources: unknown };
    };
    expect(fromCheckout.distribution.sources).toEqual(
      Object.fromEntries(
        (DISTRIBUTION_CLIENTS as string[]).map((client) => [
          client,
          { kind: "git-subdir", url: `${fromCheckout.repository}.git`, path: client },
        ]),
      ),
    );
  });

  it("changes one client's entry and leaves the other three at the default", () => {
    const identity = resolve({
      distribution: {
        sources: {
          copilot: { kind: "archive", url: "https://downloads.example.invalid/copilot.zip" },
          codex: { kind: "npm" },
          cursor: { kind: "github", path: "roots/cursor" },
        },
      },
    });
    const sources = (identity["distribution"] as { sources: Record<string, unknown> }).sources;

    expect(sources["claude"]).toEqual({ kind: "git-subdir", url: `${REPOSITORY}.git`, path: "claude" });
    expect(sources["copilot"]).toEqual({
      kind: "archive",
      url: "https://downloads.example.invalid/copilot.zip",
      path: "copilot",
    });
    // Each kind fills in the field it is addressed by, and nothing else: an npm source gets
    // a registry, a github source the owner/repo pair the API takes.
    expect(sources["codex"]).toEqual({ kind: "npm", path: "codex", registry: "https://registry.npmjs.org" });
    expect(sources["cursor"]).toEqual({ kind: "github", repo: "zomarit/stamity", path: "roots/cursor" });
  });
});

describe("distribution refusals", () => {
  it("refuses an unknown key by name, at its own path", () => {
    expect(refusal({ distribution: { branchName: "plugin-dist" } })).toBe(
      "package.json stamity.distribution.branchName is not a supported key",
    );
    expect(refusal({ distribution: { sources: { claude: { subdir: "claude" } } } })).toBe(
      "package.json stamity.distribution.sources.claude.subdir is not a supported key",
    );
    expect(refusal({ distribution: { sources: { emacs: {} } } })).toBe(
      "package.json stamity.distribution.sources.emacs is not a supported key",
    );
  });

  it("refuses an unsupported source kind, naming the four that are supported", () => {
    expect(refusal({ distribution: { sources: { cursor: { kind: "ftp" } } } })).toBe(
      "package.json stamity.distribution.sources.cursor.kind must be one of git-subdir, github, archive, npm",
    );
    expect(SOURCE_KINDS).toEqual(["git-subdir", "github", "archive", "npm"]);
  });

  it("refuses a relative path that escapes the distribution tree", () => {
    expect(refusal({ distribution: { sources: { claude: { path: "../../etc" } } } })).toContain(
      "must be a relative path inside the distribution tree",
    );
  });

  it("refuses a branch or tag pattern that is not a git ref name", () => {
    expect(refusal({ distribution: { branch: "/plugin-dist" } })).toContain(
      "package.json stamity.distribution.branch must be a git branch name",
    );
    expect(refusal({ distribution: { tagPattern: "plugins/latest" } })).toContain(
      "package.json stamity.distribution.tagPattern must contain `<version>`",
    );
  });
});

describe("credentials in distribution configuration", () => {
  it("refuses a credential-shaped key by name, at any depth", () => {
    expect(refusal({ distribution: { token: "read-from-the-environment" } })).toBe(
      "package.json stamity.distribution refuses credential-shaped keys (token)",
    );
    for (const key of ["password", "secret", "auth", "credential"]) {
      expect(refusal({ distribution: { [key]: "x" } })).toBe(
        `package.json stamity.distribution refuses credential-shaped keys (${key})`,
      );
    }
    expect(refusal({ distribution: { sources: { claude: { authToken: "x" } } } })).toBe(
      "package.json stamity.distribution refuses credential-shaped keys (sources.claude.authToken)",
    );
  });

  it("refuses a credential-shaped value without echoing it", () => {
    const message = refusal({ distribution: { sources: { claude: { path: TOKEN_SHAPED } } } });

    expect(message).toContain("package.json stamity.distribution.sources.claude.path");
    expect(message).toContain("github-token credential shape");
    // The whole point: the diagnostic reaches a CI log, so it must not carry the value.
    expect(message).not.toContain(TOKEN_SHAPED);
    expect(message).not.toContain("a".repeat(36));
  });

  it("refuses a URL that carries credentials in its userinfo, without echoing it", () => {
    const url = `https://oauth2:${TOKEN_SHAPED}@git.example.invalid/org/plugins.git`;
    const message = refusal({ distribution: { sources: { claude: { url } } } });

    expect(message).not.toContain(TOKEN_SHAPED);
    // The value shape is caught first; either refusal is correct, and neither may quote it.
    expect(message).toContain("package.json stamity.distribution.sources.claude.url");
  });

  it("mirrors the leak gate's own rule sources, so the copy cannot drift", () => {
    // `scripts/distribution-identity.mjs` copies five of the gate's shapes rather than
    // importing the gate, whose module builds a whole-tree rule table on import. A copy is
    // only safe while something compares it: this is that comparison.
    const gate = new Map((RULES as { id: string; pattern: RegExp }[]).map((rule) => [rule.id, rule.pattern.source]));
    expect(CREDENTIAL_SHAPES.map((shape: { id: string }) => shape.id)).toEqual([
      "github-token",
      "github-fine-grained-token",
      "gitlab-access-token",
      "slack-token",
      "sk-prefixed-api-key",
    ]);
    for (const shape of CREDENTIAL_SHAPES as { id: string; source: string }[]) {
      expect(gate.get(shape.id), `${shape.id} is no longer a leak-gate rule`).toBe(shape.source);
    }
  });

  it("refuses each mirrored shape as a value, and passes an ordinary one", () => {
    // Non-degenerate: every mirrored shape is exercised against a value built at run time,
    // and an ordinary URL under the same key resolves — so a green result cannot mean the
    // scanner matched everything, or nothing.
    const samples: readonly string[] = [
      TOKEN_SHAPED,
      `github_pat_${"b".repeat(82)}`,
      `glpat-${"c".repeat(20)}`,
      `xoxb-${"1".repeat(12)}`,
      `sk-${"d".repeat(24)}`,
    ];
    for (const sample of samples) {
      const message = refusal({ distribution: { sources: { claude: { path: sample } } } });
      expect(message).toContain("credential shape");
      expect(message).not.toContain(sample);
    }
    expect(
      (resolve({ distribution: { sources: { claude: { url: "https://git.example.invalid/org/p.git" } } } })[
        "distribution"
      ] as { sources: Record<string, { url: string }> }).sources["claude"]?.url,
    ).toBe("https://git.example.invalid/org/p.git");
  });
});

describe("the host boundary", () => {
  it("refuses a github-kind source on another host, naming the host-neutral kind", () => {
    const message = refusal({
      distribution: { sources: { claude: { kind: "github", url: "https://git.example.invalid/org/p.git" } } },
    });

    expect(message).toBe(
      "package.json stamity.distribution.sources.claude.kind github addresses github.com only; " +
        "use kind git-subdir, which is host-neutral, for another host.",
    );
  });

  it("takes the same non-github URL under git-subdir and archive", () => {
    const sources = (
      resolve({
        distribution: {
          sources: {
            claude: { kind: "git-subdir", url: "https://git.example.invalid/org/p.git" },
            cursor: { kind: "archive", url: "https://dl.example.invalid/cursor.zip" },
          },
        },
      })["distribution"] as { sources: Record<string, { url: string }> }
    ).sources;

    expect(sources["claude"]?.url).toBe("https://git.example.invalid/org/p.git");
    expect(sources["cursor"]?.url).toBe("https://dl.example.invalid/cursor.zip");
  });

  it("keeps the repository's own github.com boundary", () => {
    expect(() =>
      resolveDistributionIdentity({ repository: { url: "https://git.example.invalid/org/p.git" } }),
    ).toThrow(/must normalize to https:\/\/github\.com/);
    expect(() => resolveDistributionIdentity({ stamity: { publisher: "acme" }, ...pkg() })).toThrow(
      /must match the owner in `repository.url`/,
    );
    expect(() => resolveDistributionIdentity({ ...pkg(), stamity: { extra: true } })).toThrow(
      "package.json `stamity` accepts only `publisher` and `distribution`; remove unsupported keys.",
    );
  });
});

describe("the generators' exit code", () => {
  it("exits 1 on a credential-shaped value, and prints nothing that quotes it", () => {
    // The refusal reaches an operator through a generator, not through this module: REQ-
    // PLUGIN-009 names exit 1, and the two generators map a thrown identity error onto it.
    // A real checkout, so the run is the one CI performs rather than a stand-in for it.
    const root = mkdtempSync(join(tmpdir(), "stamity-distribution-"));
    workspaces.push(root);
    downstreamCheckout(root);
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    // TEST CHANGE, justified (audit FORK-3): the block used to be REPLACED, which dropped
    // any `stamity.publisher` the checkout carries. On a downstream that renamed the
    // package the publisher then fell back to the canonical default, and the generator
    // refused on the owner mismatch before it ever reached the credential check this test
    // is about. Merging keeps the credential shape the only defect in the manifest, and
    // changes nothing on the canonical tree, which configures no publisher.
    const configured = (manifest["stamity"] ?? {}) as Record<string, unknown>;
    manifest["stamity"] = {
      ...configured,
      distribution: { sources: { claude: { kind: "git-subdir", path: TOKEN_SHAPED } } },
    };
    writeFileSync(join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    for (const script of ["scripts/generate-plugin-manifests.mjs", "scripts/generate-apm-package.mjs"]) {
      const result = spawnSync(process.execPath, [join(root, script)], { cwd: root, encoding: "utf-8" });

      expect(result.status, `${script}\n${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain("credential shape");
      expect(result.stderr).not.toContain(TOKEN_SHAPED);
      expect(result.stdout).not.toContain(TOKEN_SHAPED);
    }
  });
});
