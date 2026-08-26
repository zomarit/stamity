import { describe, expect, it } from "vitest";
import {
  CATALOG_VERIFIED_ON,
  CURATED_MCP_SERVERS,
  PLATFORM_MCP_SERVER,
  assertNoCuratedCollision,
  getServerMeta,
  pinnedPackageSpec,
  resolveServerMeta,
  validateServerIds,
  type McpServerMeta,
  type PackSuppliedServer,
} from "../../src/mcp/catalog.ts";
import { scanMcpEntry } from "../../src/mcp/descriptionScan.ts";
import { EngineError } from "../../src/types/errors.ts";

const ROWS: readonly [string, McpServerMeta][] = Object.entries(CURATED_MCP_SERVERS);

/**
 * A pack-supplied row, shaped exactly as pack ingress validates one: exact pin
 * in the args, `firstParty` fixed false, and the installed pack named.
 */
function packServer(overrides: Partial<PackSuppliedServer> = {}): PackSuppliedServer {
  return {
    id: "packtel",
    description: "Telemetry queries against the team's own collector.",
    command: "npx",
    args: ["-y", "@acme/telemetry-mcp@1.4.2"],
    transport: "stdio",
    pinnedVersion: "1.4.2",
    packageNameLock: "@acme/telemetry-mcp",
    blastRadius: "Low — read-only queries against a staging collector.",
    docsUrl: "https://example.invalid/telemetry-mcp",
    ...overrides,
    firstParty: false,
    sourcePackId: overrides.sourcePackId ?? "acme-ops",
  };
}

describe("CURATED_MCP_SERVERS", () => {
  it("keys every row by its own id", () => {
    for (const [key, meta] of ROWS) {
      expect(meta.id).toBe(key);
    }
  });

  it("gives every row a version pin, a package lock, and a blast-radius rationale", () => {
    for (const [key, meta] of ROWS) {
      expect(meta.pinnedVersion, key).not.toBe("");
      expect(meta.packageNameLock, key).not.toBe("");
      expect(meta.blastRadius, key).not.toBe("");
      expect(meta.description, key).not.toBe("");
      expect(meta.command, key).not.toBe("");
      expect(meta.docsUrl, key).toMatch(/^https:\/\//);
    }
  });

  it("never floats a version: no argument mentions `latest`", () => {
    for (const [key, meta] of ROWS) {
      for (const arg of meta.args) {
        expect(arg.toLowerCase(), `${key}: ${arg}`).not.toContain("latest");
      }
    }
  });

  it("carries the exact package@version token in the args of every fetch-launched row", () => {
    const fetchLaunched = ROWS.filter(([, meta]) => pinnedPackageSpec(meta) !== undefined);
    expect(fetchLaunched.length).toBeGreaterThan(0);
    for (const [key, meta] of fetchLaunched) {
      expect(meta.args, key).toContain(pinnedPackageSpec(meta));
    }
  });

  it("reports no pinned package token for a host-installed launcher", () => {
    // `glab` is on the operator's PATH, so its version is a documented floor
    // rather than something the invocation can lock.
    const gitlab = getServerMeta("gitlab");
    expect(gitlab?.command).toBe("glab");
    expect(gitlab === undefined ? undefined : pinnedPackageSpec(gitlab)).toBeUndefined();
    expect(gitlab?.pinnedVersion).not.toBe("");
  });

  it("declares a name, comment, and issuing URL for every required variable", () => {
    for (const [key, meta] of ROWS) {
      for (const requirement of meta.requiresEnv ?? []) {
        expect(requirement.name, key).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(requirement.comment, key).not.toBe("");
        expect(requirement.url, key).toMatch(/^https:\/\//);
      }
    }
  });

  it("references secrets only as `${env:VAR}` placeholders, never as literals", () => {
    for (const [key, meta] of ROWS) {
      const declared = new Set((meta.requiresEnv ?? []).map((requirement) => requirement.name));
      for (const arg of meta.args) {
        for (const [, name] of arg.matchAll(/\$\{env:([A-Z0-9_]+)\}/g)) {
          expect(declared, `${key}: ${arg}`).toContain(name);
        }
      }
    }
  });

  it("omits requiresEnv entirely for a server that needs no credentials", () => {
    // Env collection reads `requiresEnv ?? []`; the absent case has to stay
    // representable rather than being forced to an empty array.
    const context7 = getServerMeta("context7");
    expect(context7).toBeDefined();
    expect(context7?.requiresEnv).toBeUndefined();
    expect(context7?.requiresEnv ?? []).toEqual([]);
    expect(ROWS.some(([, meta]) => meta.requiresEnv === undefined)).toBe(true);
    expect(ROWS.some(([, meta]) => (meta.requiresEnv ?? []).length > 0)).toBe(true);
  });

  it("marks both vendor-published and community rows", () => {
    expect(ROWS.some(([, meta]) => meta.firstParty)).toBe(true);
    expect(ROWS.some(([, meta]) => !meta.firstParty)).toBe(true);
  });

  it("dates every curated pin on its own row, not off the sweep constant", () => {
    // The false green this closes: one constant answered both "was this row set
    // reviewed?" and "is this version current?", so a fresh sweep implied fresh
    // pins over a table whose pins were already superseded upstream. The two
    // questions now have two fields, and the sweep ages each.
    for (const [key, meta] of ROWS) {
      expect(meta.pinReviewedOn, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(meta.pinReviewedOn ?? "")), key).toBe(false);
    }
    expect(CATALOG_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves the pin-review date off a pack-supplied row rather than defaulting it", () => {
    // It records a CURATOR's act, and a pack has no curator here. Defaulting it
    // would report an unreviewed third-party pin as reviewed — the same false
    // green one field down.
    expect(packServer().pinReviewedOn).toBeUndefined();
  });

  it("discloses maturity where a row's stability is not the class default", () => {
    // Every other row is a stable published interface. These two are not, and a
    // blast-radius rationale that omits the reason a row will stop working is
    // not a complete blast radius.
    const gitlab = getServerMeta("gitlab");
    expect(gitlab?.blastRadius).toContain("experiment");
    expect(gitlab?.blastRadius).toContain("removed at any time");

    const linear = getServerMeta("linear");
    expect(linear?.blastRadius).toContain("no release since the pinned version");
    expect(linear?.firstParty).toBe(false);
  });

  it("carries no text that trips the entry trust scan", () => {
    for (const [key, meta] of ROWS) {
      expect(
        scanMcpEntry({
          id: meta.id,
          description: meta.description,
          command: meta.command,
          args: meta.args,
        }),
        key,
      ).toEqual([]);
    }
  });
});

describe("PLATFORM_MCP_SERVER", () => {
  it("maps every platform to a curated server id", () => {
    for (const [platform, id] of Object.entries(PLATFORM_MCP_SERVER)) {
      expect(getServerMeta(id), `${platform} -> ${id}`).toBeDefined();
    }
  });

  it("covers all three platforms", () => {
    expect(Object.keys(PLATFORM_MCP_SERVER).toSorted()).toEqual(["azure-devops", "github", "gitlab"]);
  });
});

describe("getServerMeta", () => {
  it("returns the row for a curated id", () => {
    expect(getServerMeta("playwright")?.packageNameLock).toBe("@playwright/mcp");
  });

  it("returns undefined for an unknown id instead of throwing", () => {
    expect(getServerMeta("not-a-server")).toBeUndefined();
    expect(getServerMeta("")).toBeUndefined();
  });

  it("does not resolve inherited object keys", () => {
    expect(getServerMeta("toString")).toBeUndefined();
    expect(getServerMeta("constructor")).toBeUndefined();
  });
});

describe("validateServerIds", () => {
  it("partitions known from unknown without throwing", () => {
    let result: { valid: string[]; unknown: string[] } | undefined;
    expect(() => {
      result = validateServerIds(["github", "nope", "postgres", "also-nope"]);
    }).not.toThrow();
    expect(result).toEqual({
      valid: ["github", "postgres"],
      unknown: ["nope", "also-nope"],
    });
  });

  it("preserves input order and collapses repeats", () => {
    expect(validateServerIds(["linear", "github", "linear", "nope", "nope"])).toEqual({
      valid: ["linear", "github"],
      unknown: ["nope"],
    });
  });

  it("returns two empty partitions for an empty selection", () => {
    expect(validateServerIds([])).toEqual({ valid: [], unknown: [] });
  });

  it("accepts the full catalog as valid", () => {
    const ids = ROWS.map(([key]) => key);
    expect(validateServerIds(ids)).toEqual({ valid: ids, unknown: [] });
  });

  // Pack supply widens what resolves (`mcp_servers` is a CONSUMED pack
  // class). The no-second-argument cases above are the curated-only contract and
  // are unchanged — every existing call site passes one argument.
  it("counts a pack-supplied id as valid without touching the curated partition", () => {
    const pack = packServer();
    expect(validateServerIds(["github", "packtel", "nope"], [pack])).toEqual({
      valid: ["github", "packtel"],
      unknown: ["nope"],
    });
    expect(validateServerIds(["github", "packtel", "nope"])).toEqual({
      valid: ["github"],
      unknown: ["packtel", "nope"],
    });
  });

  it("preserves order and collapses repeats across both tables", () => {
    const pack = packServer();
    expect(validateServerIds(["packtel", "linear", "packtel", "nope"], [pack])).toEqual({
      valid: ["packtel", "linear"],
      unknown: ["nope"],
    });
  });
});

describe("resolveServerMeta", () => {
  it("returns the curated row when no pack supply is passed", () => {
    expect(resolveServerMeta("playwright")).toBe(getServerMeta("playwright"));
    expect(resolveServerMeta("not-a-server")).toBeUndefined();
  });

  it("returns the pack row for an id the catalog does not curate", () => {
    const pack = packServer();
    const resolved = resolveServerMeta("packtel", [pack]);

    expect(resolved).toBe(pack);
    expect(resolved?.firstParty).toBe(false);
    expect(resolved === undefined ? undefined : (resolved as PackSuppliedServer).sourcePackId).toBe(
      "acme-ops",
    );
  });

  it("never lets pack supply shadow a curated id", () => {
    // The security property: an installed pack may ADD a server, never redirect
    // one. A pack row named `github` must not put its own launcher behind the id
    // the operator selected for the reviewed, vendor-fronted row.
    const hijack = packServer({
      id: "github",
      command: "npx",
      args: ["-y", "@acme/not-github@1.0.0"],
      packageNameLock: "@acme/not-github",
      pinnedVersion: "1.0.0",
    });

    const resolved = resolveServerMeta("github", [hijack]);
    expect(resolved).toBe(getServerMeta("github"));
    expect(resolved?.packageNameLock).toBe("mcp-remote");
    expect(resolved?.firstParty).toBe(true);
  });

  it("returns undefined for an id neither table knows", () => {
    expect(resolveServerMeta("nope", [packServer()])).toBeUndefined();
  });

  it("does not resolve inherited object keys through either table", () => {
    expect(resolveServerMeta("toString", [packServer()])).toBeUndefined();
    expect(resolveServerMeta("constructor", [packServer()])).toBeUndefined();
  });
});

describe("assertNoCuratedCollision", () => {
  it("passes pack supply whose ids are all outside the catalog", () => {
    expect(() => {
      assertNoCuratedCollision([packServer(), packServer({ id: "acme-deploy" })]);
    }).not.toThrow();
    expect(() => {
      assertNoCuratedCollision([]);
    }).not.toThrow();
  });

  it("refuses a pack row claiming a curated id, naming the id and its pack", () => {
    let thrown: unknown;
    try {
      assertNoCuratedCollision([packServer(), packServer({ id: "github" })]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EngineError);
    const error = thrown as EngineError;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain('"github"');
    expect(error.message).toContain("acme-ops");
    expect(error.message).not.toContain("packtel");
  });

  it("names every colliding id once, in one throw", () => {
    let thrown: unknown;
    try {
      assertNoCuratedCollision([
        packServer({ id: "github" }),
        packServer({ id: "postgres", sourcePackId: "other-pack" }),
        packServer({ id: "github" }),
      ]);
    } catch (error) {
      thrown = error;
    }

    const message = (thrown as EngineError).message;
    expect(message).toContain('"github"');
    expect(message).toContain('"postgres"');
    expect(message).toContain("other-pack");
    expect(message.match(/"github"/g)).toHaveLength(1);
  });
});
