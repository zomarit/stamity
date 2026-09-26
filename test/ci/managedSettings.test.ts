import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the distribution modules ship as plain .mjs with no type declarations:
// they run under bare Node in a release job, with no TypeScript nearby.
import { buildCatalogIdentity, renderClaudeMarketplace } from "../../scripts/plugins/catalogs.mjs";
// @ts-expect-error — see above.
import { resolveDistributionIdentity } from "../../scripts/distribution-identity.mjs";
// @ts-expect-error — see above.
import { MANAGED_SETTINGS_KEYS, MIN_CLAUDE_VERSION, REF_NAME, renderClaudeManagedSettings } from "../../scripts/plugins/managed-settings.mjs";

/**
 * The Claude Code managed-settings template an organization's admin installs (REQ-PLUGIN-029),
 * as a pure function of the fork's identity. The builder that writes it into the distribution
 * tree is proven end to end in `./pluginDistribution.test.ts`; this suite owns the shape.
 *
 * The one property everything else serves: the `strictKnownMarketplaces` entry must equal the
 * declared marketplace source FIELD FOR FIELD. The client matches the allowlist exactly, so an
 * unequal pair — a different `ref`, a different `repo` spelling — admits no marketplace at all,
 * and a managed file blocks every user in the organization.
 *
 * Two identities drive it: this checkout's own (derived, never spelled, so a renamed fork runs
 * the suite unedited) and a synthetic fork whose scope, owner and repository name all differ,
 * so a renderer that read the package name where it should read the repository cannot pass.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const VERSION = "1.9.0";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const TAG = `plugins/v${VERSION}`;

interface Source {
  source: string;
  repo: string;
  ref: string;
}
interface ManagedSettings {
  extraKnownMarketplaces: Record<string, { source: Source }>;
  enabledPlugins: Record<string, boolean>;
  strictKnownMarketplaces: Source[];
  requiredMinimumVersion: string;
}

type Identity = Record<string, unknown>;

function identityOf(pkg: Record<string, unknown>): Identity {
  return buildCatalogIdentity(pkg, resolveDistributionIdentity(pkg)) as Identity;
}

/** This checkout's identity, read the way the builder reads it. */
const own = identityOf(JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Record<string, unknown>);

/** A fork that renamed everything a renderer could confuse: scope, owner case, repository name. */
const acme = identityOf({
  name: "@acme-corp/stamity",
  description: "Acme's internal build.",
  license: "MIT",
  keywords: ["agentic"],
  homepage: "https://intranet.acme.example.test/stamity",
  repository: { type: "git", url: "git+https://github.com/Acme-Corp/stamity-internal.git" },
  stamity: { publisher: "Acme-Corp" },
});

/** What lands on disk: the builder writes `JSON.stringify`, so every assertion reads the round trip. */
function rendered(identity: Identity, options: Record<string, unknown> = { ref: TAG }): ManagedSettings {
  return JSON.parse(JSON.stringify(renderClaudeManagedSettings(identity, options))) as ManagedSettings;
}

function refusal(identity: Identity, options: Record<string, unknown>): string {
  try {
    renderClaudeManagedSettings(identity, options);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("the options were accepted, so there is no refusal to read");
}

describe("the managed-settings template", () => {
  it("holds exactly the four keys, in the declared order", () => {
    expect(MANAGED_SETTINGS_KEYS).toEqual([
      "extraKnownMarketplaces",
      "enabledPlugins",
      "strictKnownMarketplaces",
      "requiredMinimumVersion",
    ]);
    for (const identity of [own, acme]) {
      expect(Object.keys(rendered(identity))).toEqual(MANAGED_SETTINGS_KEYS);
    }
  });

  it("names the marketplace and the plugin exactly as the rendered Claude catalog does", () => {
    for (const identity of [own, acme]) {
      const catalog = renderClaudeMarketplace(identity, VERSION, COMMIT) as { name: string; plugins: { name: string }[] };
      const settings = rendered(identity);
      expect(Object.keys(settings.extraKnownMarketplaces)).toEqual([catalog.name]);
      expect(settings.enabledPlugins).toEqual({ [`${catalog.plugins[0]?.name ?? ""}@${catalog.name}`]: true });
    }
  });

  it("admits exactly the declared marketplace source, field for field, and never nothing", () => {
    for (const identity of [own, acme]) {
      for (const ref of [TAG, "plugin-dist", "plugins/v2.0.0-rc.1"]) {
        const settings = rendered(identity, { ref });
        const name = Object.keys(settings.extraKnownMarketplaces)[0] ?? "";
        const declared = settings.extraKnownMarketplaces[name]?.source;
        // An empty allowlist blocks every marketplace for every user; one entry is the contract.
        expect(settings.strictKnownMarketplaces).toHaveLength(1);
        expect(settings.strictKnownMarketplaces[0]).toEqual(declared);
        expect(declared).toEqual({ source: "github", repo: identity["slug"], ref });
        // The key order of the source object is part of the bytes an admin diffs.
        expect(Object.keys(declared ?? {})).toEqual(["source", "repo", "ref"]);
      }
    }
  });

  it("renders a fork's repository, not its package name, as the marketplace address", () => {
    expect(`${JSON.stringify(renderClaudeManagedSettings(acme, { ref: TAG }), null, 2)}\n`).toBe(
      [
        "{",
        '  "extraKnownMarketplaces": {',
        '    "stamity": {',
        '      "source": {',
        '        "source": "github",',
        '        "repo": "Acme-Corp/stamity-internal",',
        `        "ref": "${TAG}"`,
        "      }",
        "    }",
        "  },",
        '  "enabledPlugins": {',
        '    "stamity@stamity": true',
        "  },",
        '  "strictKnownMarketplaces": [',
        "    {",
        '      "source": "github",',
        '      "repo": "Acme-Corp/stamity-internal",',
        `      "ref": "${TAG}"`,
        "    }",
        "  ],",
        `  "requiredMinimumVersion": "${MIN_CLAUDE_VERSION}"`,
        "}",
        "",
      ].join("\n"),
    );
  });
});

describe("the minimum client version", () => {
  it("defaults to the first client whose invalid allowlist fails closed", () => {
    expect(MIN_CLAUDE_VERSION).toBe("2.1.277");
    expect(rendered(own).requiredMinimumVersion).toBe(MIN_CLAUDE_VERSION);
  });

  it("takes a higher version, compared numerically rather than as text", () => {
    // `2.1.1000` sorts BEFORE `2.1.277` as a string; a text comparison would refuse it.
    for (const minimumVersion of ["2.1.277", "2.1.1000", "2.2.0", "10.0.0"]) {
      expect(rendered(own, { ref: TAG, minimumVersion }).requiredMinimumVersion, minimumVersion).toBe(minimumVersion);
    }
  });

  it("refuses a version below the floor, or one that is not a plain semantic version, naming the field", () => {
    for (const minimumVersion of ["2.1.276", "2.0.999", "1.99.999", "2.1", "latest", "2.1.277-rc.1", "v2.1.277", 2]) {
      expect(refusal(own, { ref: TAG, minimumVersion }), String(minimumVersion)).toContain("minimumVersion");
    }
  });

  it("refuses a leading zero in any component, which the client would drop as invalid, naming the field", () => {
    // `2.1.0277` is 277 as a number, so the floor alone would pass it and the file would carry
    // a value the client ignores — an older client would then start under the policy.
    for (const minimumVersion of ["2.1.0277", "02.1.277", "2.01.277", "002.1.277"]) {
      expect(refusal(own, { ref: TAG, minimumVersion }), String(minimumVersion)).toContain("minimumVersion");
    }
  });
});

describe("the identity", () => {
  it("refuses an identity without a non-empty name or an owner/repo slug, naming the field", () => {
    const cases: [unknown, string][] = [
      [undefined, "identity.name"],
      [{ ...acme, name: "" }, "identity.name"],
      [{ ...acme, name: 7 }, "identity.name"],
      [{ name: "stamity" }, "identity.slug"],
      [{ ...acme, slug: "" }, "identity.slug"],
      [{ ...acme, slug: "Acme-Corp" }, "identity.slug"],
      [{ ...acme, slug: "Acme-Corp/stamity/extra" }, "identity.slug"],
      [{ ...acme, slug: "/stamity" }, "identity.slug"],
      [{ ...acme, slug: "Acme Corp/stamity" }, "identity.slug"],
    ];
    for (const [identity, field] of cases) {
      expect(refusal(identity as Identity, { ref: TAG }), JSON.stringify(identity)).toContain(field);
    }
  });
});

describe("the ref", () => {
  it("refuses a missing ref, naming the field: the builder always passes the release tag", () => {
    expect(refusal(own, {})).toContain("ref");
    expect(refusal(own, { ref: "" })).toContain("ref");
  });

  it("refuses a ref git or a command line would misread, naming the field", () => {
    for (const ref of ["plugins/../main", "plugins/", "-rf", "/plugins/v1", "plugins v1", "plugins/v1;id", 7]) {
      expect(refusal(own, { ref }), String(ref)).toContain("ref");
    }
  });

  it("applies the same ref-name rule as the distribution identity, mirrored and pinned against it", () => {
    // Mirrored rather than imported: `scripts/distribution-identity.mjs` keeps the rule
    // module-private. A copy drifts unless something compares it, so this reads the original's
    // literal from the committed source and holds the mirror to it.
    const original = readFileSync(join(REPO_ROOT, "scripts", "distribution-identity.mjs"), "utf8");
    const literal = /^const REF_NAME = \/(.+)\/\s*$/m.exec(original)?.[1];
    expect(literal, "REF_NAME moved or was renamed in scripts/distribution-identity.mjs").toBeDefined();
    expect((REF_NAME as RegExp).source).toBe(literal);
  });
});
