import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the schema ships as a plain .mjs module with no type declarations: the
// release job that writes `release.json` runs it under bare Node, with no TypeScript nearby.
import { buildReleaseManifest, RELEASE_MANIFEST_SCHEMA_VERSION, validateReleaseManifest } from "../../scripts/plugins/releaseManifest.mjs";

/**
 * The release contract (REQ-PLUGIN-011), in its two halves.
 *
 * The SCHEMA half: `buildReleaseManifest` lays a measured release out in one fixed key order,
 * so two builds of one source commit produce one byte sequence, and `validateReleaseManifest`
 * names each defect by its JSON path so a release job can refuse before publishing. Each
 * defect case asserts the message LIST, not merely that it is non-empty: one defect must
 * produce one message, or a consumer reading the output cannot tell how many things are wrong.
 *
 * The PRESET half: the two Renovate files are data, and data goes stale silently. Every
 * assertion that could be a literal here is derived from `package.json` instead — the package
 * name the companion pins, the owner/repository the tag manager watches, the tag the committed
 * `tagPattern` renders — so a rename moves them together or fails here.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
  repository: { url: string };
  stamity: { distribution: { branch: string; tagPattern: string } };
};

const preset = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO_ROOT, "renovate", file), "utf8")) as Record<string, unknown>;

/** A digest that differs per input, so no two rows in a fixture share one. */
const digest = (seed: string): string => createHash("sha256").update(seed).digest("hex");

interface PackageRow {
  client: string;
  path: string;
  archive: string;
  sha256: string;
  bytes: number;
  clientFloor: string;
}

/** A complete measured release: four roots, four catalogs, every field populated. */
function measured(): Record<string, unknown> {
  const packages: PackageRow[] = ["claude", "cursor", "copilot", "codex"].map((client, index) => ({
    client,
    path: client,
    archive: `stamity-plugin-${client}-1.9.0.zip`,
    sha256: digest(client),
    bytes: 100_000 + index,
    clientFloor: ">=2.0.0",
  }));
  return {
    version: "1.9.0",
    sourceCommit: "a".repeat(40),
    sourceCommitDate: "2026-09-17T09:41:12+02:00",
    distribution: { branch: "plugin-dist", tag: "plugins/v1.9.0", commit: "b".repeat(40) },
    runtime: { package: "@zomarit/stamity", version: "1.9.0", nodeFloor: ">=22.22.2", tarballSha256: digest("tarball") },
    packages,
    catalogs: {
      claude: ".claude-plugin/marketplace.json",
      cursor: ".cursor-plugin/marketplace.json",
      copilot: ".github/plugin/marketplace.json",
      codex: ".agents/plugins/marketplace.json",
    },
    apm: { manifest: "apm.yml", primitives: ".apm", installSpec: ".apm/install.yml" },
  };
}

/** The built manifest, as the mutable object a defect case edits one field of. */
function built(): Record<string, unknown> {
  return buildReleaseManifest(measured()) as Record<string, unknown>;
}

describe("buildReleaseManifest", () => {
  it("stamps the schema version and fixes the key order at every level", () => {
    const value = built();

    expect(RELEASE_MANIFEST_SCHEMA_VERSION).toBe(1);
    expect(value["schemaVersion"]).toBe(1);
    expect(Object.keys(value)).toEqual([
      "schemaVersion",
      "version",
      "sourceCommit",
      "sourceCommitDate",
      "distribution",
      "runtime",
      "packages",
      "catalogs",
      "apm",
    ]);
    expect(Object.keys(value["distribution"] as object)).toEqual(["branch", "tag", "commit"]);
    expect(Object.keys(value["runtime"] as object)).toEqual(["package", "version", "nodeFloor", "tarballSha256"]);
    expect(Object.keys((value["packages"] as object[])[0] as object)).toEqual([
      "client",
      "path",
      "archive",
      "sha256",
      "bytes",
      "clientFloor",
    ]);
    expect(Object.keys(value["catalogs"] as object)).toEqual(["claude", "cursor", "copilot", "codex"]);
    expect(Object.keys(value["apm"] as object)).toEqual(["manifest", "primitives", "installSpec"]);
  });

  it("is byte-stable across two calls, and across a reordered measurement", () => {
    // Two builds of one source commit must produce one file. The reordered input is the
    // non-degenerate half: four rows and four catalog keys, reversed, so a projection that
    // merely copied the input order would fail here rather than pass by luck.
    const first = JSON.stringify(buildReleaseManifest(measured()), null, 2);
    expect(JSON.stringify(buildReleaseManifest(measured()), null, 2)).toBe(first);

    const shuffled = measured();
    shuffled["packages"] = (shuffled["packages"] as PackageRow[]).toReversed();
    shuffled["catalogs"] = Object.fromEntries(Object.entries(shuffled["catalogs"] as object).toReversed());
    expect(JSON.stringify(buildReleaseManifest(shuffled), null, 2)).toBe(first);
  });

  it("records an unknown distribution commit as null rather than dropping the key", () => {
    const pending = measured();
    (pending["distribution"] as Record<string, unknown>)["commit"] = null;
    const value = buildReleaseManifest(pending) as { distribution: { commit: unknown } };

    expect(value.distribution.commit).toBeNull();
    expect(validateReleaseManifest(value)).toEqual([]);
  });
});

describe("validateReleaseManifest", () => {
  it("accepts a built manifest", () => {
    expect(validateReleaseManifest(built())).toEqual([]);
  });

  it("names a missing source commit, by path", () => {
    const value = built();
    delete value["sourceCommit"];

    expect(validateReleaseManifest(value)).toEqual([
      "sourceCommit: must be a 40-character lowercase hex commit sha",
    ]);
  });

  it("names a digest that is not 64 hex, by path", () => {
    const value = built();
    ((value["packages"] as Record<string, unknown>[])[1] as Record<string, unknown>)["sha256"] = "not-a-digest";

    expect(validateReleaseManifest(value)).toEqual([
      "packages[1].sha256: must be a 64-character lowercase hex digest",
    ]);
  });

  it("names an unknown client, by path", () => {
    const value = built();
    ((value["packages"] as Record<string, unknown>[])[0] as Record<string, unknown>)["client"] = "emacs";

    expect(validateReleaseManifest(value)).toEqual([
      "packages[0].client: must be one of claude, cursor, copilot, codex",
    ]);
  });

  it("names every other field a release job can get wrong", () => {
    // One case per remaining field family, each on its own manifest, so the message list
    // stays the evidence that exactly one thing was wrong.
    const cases: readonly [string, (value: Record<string, unknown>) => void, string][] = [
      ["a stale schema version", (v) => (v["schemaVersion"] = 2), "schemaVersion: must be 1"],
      [
        "a wall-clock date",
        (v) => (v["sourceCommitDate"] = "17 September 2026"),
        "sourceCommitDate: must be the source commit's committer date as an RFC 3339 timestamp",
      ],
      [
        "a bad distribution commit",
        (v) => ((v["distribution"] as Record<string, unknown>)["commit"] = "HEAD"),
        "distribution.commit: must be a 40-character lowercase hex commit sha, or null",
      ],
      [
        "a missing tarball digest",
        (v) => delete (v["runtime"] as Record<string, unknown>)["tarballSha256"],
        "runtime.tarballSha256: must be a 64-character lowercase hex digest",
      ],
      [
        "an escaping package path",
        (v) => (((v["packages"] as Record<string, unknown>[])[2] as Record<string, unknown>)["path"] = "../claude"),
        "packages[2].path: must be a relative path inside the distribution tree",
      ],
      [
        "a zero-byte archive",
        (v) => (((v["packages"] as Record<string, unknown>[])[3] as Record<string, unknown>)["bytes"] = 0),
        "packages[3].bytes: must be the archive size in bytes, a positive integer",
      ],
      [
        "a catalog for a client that does not exist",
        (v) => ((v["catalogs"] as Record<string, unknown>)["emacs"] = "emacs/marketplace.json"),
        "catalogs.emacs: is not a supported client",
      ],
      [
        "a missing APM install spec",
        (v) => delete (v["apm"] as Record<string, unknown>)["installSpec"],
        "apm.installSpec: must be a relative path inside the distribution tree",
      ],
      ["an invented top-level key", (v) => (v["signature"] = "…"), "signature: is not a supported key"],
    ];

    for (const [name, mutate, message] of cases) {
      const value = built();
      mutate(value);
      expect(validateReleaseManifest(value), name).toEqual([message]);
    }
  });

  it("refuses a duplicate client and a manifest that is not an object", () => {
    const value = built();
    const rows = value["packages"] as Record<string, unknown>[];
    (rows[1] as Record<string, unknown>)["client"] = rows[0]?.["client"];

    expect(validateReleaseManifest(value)).toEqual(["packages[1].client: repeats a client already listed"]);
    expect(validateReleaseManifest("release.json")).toEqual([": must be a JSON object"]);
    expect(validateReleaseManifest(undefined)).toEqual([": must be a JSON object"]);
  });
});

describe("the Renovate presets", () => {
  it("watches the four marketplace files for the pinned tag, and captures it", () => {
    const managers = preset("plugins.json")["customManagers"] as Record<string, unknown>[];
    const manager = managers[0] as {
      customType: string;
      managerFilePatterns: string[];
      matchStrings: string[];
      depNameTemplate: string;
      datasourceTemplate: string;
      versioningTemplate: string;
    };

    expect(managers).toHaveLength(1);
    expect(manager.customType).toBe("regex");
    expect(manager.datasourceTemplate).toBe("github-tags");
    // Derived, never typed twice: the dependency the manager watches IS this repository.
    expect(`https://github.com/${manager.depNameTemplate}`).toBe(
      manifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""),
    );

    const captured = new RegExp(manager.matchStrings[0] ?? "").exec('      "ref": "plugins/v1.9.0",');
    expect(captured?.groups?.["currentValue"]).toBe("plugins/v1.9.0");
    // Non-degenerate: a ref that is not a plugin tag is left alone, so the manager cannot be
    // matching everything that has a `ref` field.
    expect(new RegExp(manager.matchStrings[0] ?? "").test('"ref": "v1.9.0"')).toBe(false);
  });

  it("matches each catalog path, and only where the path really is a catalog", () => {
    const manager = (preset("plugins.json")["customManagers"] as { managerFilePatterns: string[] }[])[0];
    const patterns = (manager?.managerFilePatterns ?? []).map((entry) => {
      // Renovate's `/regex/` string form: the slashes are the delimiter, not part of the pattern.
      expect(entry.startsWith("/") && entry.endsWith("/"), entry).toBe(true);
      return new RegExp(entry.slice(1, -1));
    });
    const catalogs = [
      ".claude-plugin/marketplace.json",
      ".github/plugin/marketplace.json",
      ".cursor-plugin/marketplace.json",
      ".agents/plugins/marketplace.json",
    ];

    expect(patterns).toHaveLength(catalogs.length);
    for (const [index, pattern] of patterns.entries()) {
      const catalog = catalogs[index] as string;
      expect(pattern.test(catalog), catalog).toBe(true);
      expect(pattern.test(`dist/plugins/${catalog}`), `nested ${catalog}`).toBe(true);
      expect(pattern.test(`${catalog}5`), `${catalog}5 is a different file`).toBe(false);
      expect(pattern.test(`not${catalog}`), `not${catalog} is a different file`).toBe(false);
    }
  });

  it("agrees with the tag this repository's own configuration renders", () => {
    const manager = (preset("plugins.json")["customManagers"] as { matchStrings: string[]; versioningTemplate: string }[])[0];
    const tag = manifest.stamity.distribution.tagPattern.replaceAll("<version>", manifest.version);
    const versioning = new RegExp((manager?.versioningTemplate ?? "").replace(/^regex:/, ""));

    expect(versioning.test(tag)).toBe(true);
    expect(new RegExp(manager?.matchStrings[0] ?? "").exec(`"ref": "${tag}"`)?.groups?.["currentValue"]).toBe(tag);
    expect(versioning.test("plugins/v1.9")).toBe(false);
  });

  it("pins the companion package to one exact npm version", () => {
    const rules = preset("companion.json")["packageRules"] as {
      matchDatasources: string[];
      matchPackageNames: string[];
      rangeStrategy: string;
    }[];

    expect(rules).toHaveLength(1);
    expect(rules[0]?.matchDatasources).toEqual(["npm"]);
    expect(rules[0]?.matchPackageNames).toEqual([manifest.name]);
    expect(rules[0]?.rangeStrategy).toBe("pin");
  });

  it("declares the Renovate schema on both presets", () => {
    for (const file of ["plugins.json", "companion.json"]) {
      expect(preset(file)["$schema"], file).toBe("https://docs.renovatebot.com/renovate-schema.json");
    }
  });
});
