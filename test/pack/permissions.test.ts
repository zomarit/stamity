import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/content/frontmatter.ts";
import {
  assertSafePackRelPath,
  checkAgentCapabilities,
  checkPermissions,
  readPermissions,
  type PackPermissions,
} from "../../src/pack/permissions.ts";
import { parseCapabilities } from "../../src/roster/agentGrants.ts";
import {
  ALL_TOOL_CATEGORIES,
  FUNCTIONAL_TOOL_CATEGORIES,
  RESERVED_TOOL_CATEGORIES,
} from "../../src/tools/categories.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * The permission manifest is pure parsing over an in-memory document — no
 * filesystem lane needed. The manifest-level round-trip (block surviving into
 * `PackManifest`, delegation from `validatePackManifest`) lives in
 * `./manifest.test.ts` next to the rest of the schema suite.
 *
 * The agent-capability gate below is the one exception: its last case runs the
 * real shipped packs through it, because "every first-party pack still
 * installs" is a claim only the bytes on disk can make.
 */

/** Asserts the thrown value is an EngineError of `code` and returns it for message checks. */
function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

describe("readPermissions", () => {
  it("reads an absent block as undefined — the pack declares nothing", () => {
    expect(readPermissions({ name: "ops", version: "1.0.0" })).toBeUndefined();
  });

  it("accepts an empty block as a valid, inert declaration", () => {
    const permissions = readPermissions({ permissions: {} });

    expect(permissions).toEqual({});
    expect(permissions !== undefined && "toolFootprint" in permissions).toBe(false);
    expect(permissions !== undefined && "touchedPaths" in permissions).toBe(false);
  });

  it("carries both fields through, deduplicated in declaration order", () => {
    const permissions = readPermissions({
      permissions: {
        toolFootprint: ["edit", "read", "edit"],
        touchedPaths: ["src/**", "docs/adr", "README.md", "src/**"],
      },
    });

    expect(permissions).toEqual({
      toolFootprint: ["edit", "read"],
      touchedPaths: ["src/**", "docs/adr", "README.md"],
    });
  });

  it("accepts every id in the tool-category taxonomy", () => {
    const permissions = readPermissions({
      permissions: { toolFootprint: [...ALL_TOOL_CATEGORIES] },
    });

    expect(permissions?.toolFootprint).toEqual([...ALL_TOOL_CATEGORIES]);
  });

  it.each([["all"], [42], [["read"]]])("rejects a non-object block %j", (value) => {
    const error = expectEngineError(
      () => readPermissions({ permissions: value }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("permissions");
    expect(error.message).toContain("object");
  });

  it("rejects an unknown tool category, naming it and listing the taxonomy", () => {
    const error = expectEngineError(
      () => readPermissions({ permissions: { toolFootprint: ["read", "filesystem"] } }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('"filesystem"');
    expect(error.message).not.toContain('"read"');
    expect(error.message).toContain("spawn");
  });

  it("rejects a toolFootprint that is not an array of strings", () => {
    const error = expectEngineError(
      () => readPermissions({ permissions: { toolFootprint: "read" } }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("toolFootprint");
    expect(error.message).toContain("array of strings");
  });

  it("refuses a misspelled key rather than dropping it", () => {
    const error = expectEngineError(
      () => readPermissions({ permissions: { toolFootprints: ["read"] } }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain('"toolFootprints"');
  });

  it("keeps a trailing /** glob verbatim on a touched path", () => {
    const permissions = readPermissions({ permissions: { touchedPaths: ["packs/ops/**"] } });
    expect(permissions?.touchedPaths).toEqual(["packs/ops/**"]);
  });

  it.each([
    ["../secrets", "`..` segment"],
    ["src/../../etc", "`..` segment"],
    ["/etc/passwd", "absolute path"],
    ["C:/Windows", "absolute path"],
    ["src\\lib", "backslash separator"],
    ["src/\0", "null byte"],
    ["", "empty path"],
    ["../x/**", "`..` segment"],
    ["/**", "empty path"],
  ])("rejects the touched path %j with the shared path vocabulary", (entry, reason) => {
    const error = expectEngineError(
      () => readPermissions({ permissions: { touchedPaths: [entry] } }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain(reason);
    expect(error.message).toContain("touchedPaths");
  });

  it.each([["src/*.ts"], ["**"], ["src/**/api"], ["src/**tail"]])(
    "rejects the glob %j — only a trailing /** is supported",
    (entry) => {
      const error = expectEngineError(
        () => readPermissions({ permissions: { touchedPaths: [entry] } }),
        "VALIDATION_ERROR",
      );
      expect(error.message).toContain(JSON.stringify(entry));
      expect(error.message).toContain('trailing "/**"');
    },
  );

  it("aggregates every defect into one refusal", () => {
    const error = expectEngineError(
      () =>
        readPermissions({
          permissions: { toolFootprint: ["nope"], touchedPaths: ["../x", "src"] },
        }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('"nope"');
    expect(error.message).toContain("`..` segment");
    expect(error.message).not.toContain('"src"');
  });
});

describe("checkPermissions", () => {
  const FILES: readonly unknown[] = [];

  it("reports n/a when the pack declares no permissions", () => {
    expect(checkPermissions({}, FILES)).toBe("n/a");
  });

  it("passes a declared block — validation already happened at manifest ingress", () => {
    const permissions: PackPermissions = { toolFootprint: ["read"], touchedPaths: ["src/**"] };
    expect(checkPermissions({ permissions }, FILES)).toBe("pass");
  });

  it("passes an empty block: an explicit empty declaration is still a declaration", () => {
    expect(checkPermissions({ permissions: {} }, FILES)).toBe("pass");
  });
});

describe("assertSafePackRelPath (canonical home)", () => {
  // The guard moved here from ./manifest.ts (which re-exports it) so that
  // touchedPaths and the manifest gates share one vocabulary without an import
  // cycle. The behavioural suite stays in ./manifest.test.ts against the
  // re-export; this case pins the direct export so the module is complete on
  // its own.
  it("accepts a plain relative path and refuses an escaping one", () => {
    expect(() => assertSafePackRelPath("agents/reviewer.md", "test")).not.toThrow();
    const error = expectEngineError(
      () => assertSafePackRelPath("../escape", "test"),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("`..` segment");
  });
});

/**
 * The shipped ops pack's own footprint, delegation included — the real ceiling shape.
 *
 * TEST CHANGE, justified: `network` left this list because it left the
 * shipped manifest. The pack disclosed a reach no agent in it claimed and none of
 * its bodies used, and a footprint is what the operator accepts at install — so it
 * narrowed to what the pack actually needs. The literal is kept rather than read
 * from disk because these cases are pure parsing over an in-memory document; the
 * case below pins it against the shipped manifest so a drifted copy fails here.
 */
const OPS_PERMISSIONS: PackPermissions = {
  toolFootprint: ["read", "edit", "execute", "spawn"],
};

/** One shipped first-party pack: its declared permissions and its parsed agent files. */
interface ShippedPack {
  id: string;
  permissions: PackPermissions | undefined;
  agents: { relPath: string; frontmatter: Record<string, unknown> }[];
}

/**
 * Every pack under `<repo>/packs/`, read from disk. Hoisted out of the
 * install-every-pack case so the footprint cases below assert over the same
 * bytes the installer would read, rather than a second copy of the walk.
 */
async function shippedPacks(): Promise<ShippedPack[]> {
  const packsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "packs");
  const packIds = (await readdir(packsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return Promise.all(
    packIds.map(async (id) => {
      const raw = await readFile(join(packsRoot, id, "pack.json"), "utf8");
      const manifest: unknown = JSON.parse(raw);
      const agentDir = join(packsRoot, id, "agents");
      const agentNames = await readdir(agentDir).catch(() => []);
      const agents = await Promise.all(
        agentNames
          .filter((name) => name.endsWith(".md"))
          .map(async (name) => ({
            relPath: `agents/${name}`,
            frontmatter: parseFrontmatter(
              await readFile(join(agentDir, name), "utf8"),
              `${id}/agents/${name}`,
            ).frontmatter,
          })),
      );
      return { id, permissions: readPermissions(manifest as Record<string, unknown>), agents };
    }),
  );
}

/** One in-memory pack file; `capabilities` omitted means the field is absent. */
function file(
  relPath: string,
  capabilities?: unknown,
): { relPath: string; frontmatter: Record<string, unknown> } {
  return {
    relPath,
    frontmatter: {
      id: relPath,
      type: "agent",
      ...(capabilities === undefined ? {} : { capabilities }),
    },
  };
}

describe("checkAgentCapabilities", () => {
  it("passes a pack whose agents stay inside the declared footprint", () => {
    expect(
      checkAgentCapabilities(
        [
          file("agents/stamity-devops.md", ["read", "edit", "execute"]),
          file("agents/stamity-incident-responder.md", ["read", "execute"]),
        ],
        OPS_PERMISSIONS,
      ),
    ).toBe("pass");
  });

  it("passes an agent that declares no capabilities — an absent field is a real empty grant", () => {
    expect(checkAgentCapabilities([file("agents/stamity-devops.md")], OPS_PERMISSIONS)).toBe("pass");
  });

  it("passes a pack with no agents at all", () => {
    expect(checkAgentCapabilities([], OPS_PERMISSIONS)).toBe("pass");
  });

  it("refuses a capability outside the footprint, naming the file, the capability and the footprint", () => {
    const error = expectEngineError(
      () =>
        checkAgentCapabilities([file("agents/stamity-devops.md", ["read", "network"])], {
          toolFootprint: ["read", "edit"],
        }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("agents/stamity-devops.md");
    expect(error.message).toContain('"network"');
    expect(error.message).toContain("read, edit");
    expect(error.message).toContain("toolFootprint");
    // The capability the pack DID declare is not reported as a problem.
    expect(error.message).not.toContain('"read"');
  });

  it("refuses everything when the pack declares no permission block at all", () => {
    const error = expectEngineError(
      () => checkAgentCapabilities([file("agents/stamity-devops.md", ["read"])], undefined),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('"read"');
    expect(error.message).toContain("the pack declares none");
  });

  it("refuses delegation outright, even when the pack's own footprint declares it", () => {
    // The ops pack's footprint really does carry `spawn` — its commands
    // orchestrate. That covers the pack's workflows, never an agent's grant: a
    // spawned agent carries its own, so the footprint cannot bound it.
    expect(OPS_PERMISSIONS.toolFootprint).toContain("spawn");

    const error = expectEngineError(
      () =>
        checkAgentCapabilities(
          [file("agents/stamity-devops.md", ["read", "spawn"])],
          OPS_PERMISSIONS,
        ),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("agents/stamity-devops.md");
    expect(error.message).toContain("spawn");
    expect(error.message).toMatch(/never granted/i);
  });

  it("refuses an unknown capability, listing the vocabulary that would have worked", () => {
    const error = expectEngineError(
      () =>
        checkAgentCapabilities(
          [file("agents/stamity-devops.md", ["filesystem"])],
          OPS_PERMISSIONS,
        ),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('unknown capability "filesystem"');
    expect(error.message).toContain("read, edit, execute, network, planning");
    expect(error.message).not.toContain("spawn");
  });

  it.each(RESERVED_TOOL_CATEGORIES.map((category) => [category]))(
    "refuses the reserved category %s, which would grant nothing on any client",
    (reserved) => {
      const error = expectEngineError(
        () =>
          checkAgentCapabilities([file("agents/stamity-devops.md", [reserved])], {
            toolFootprint: [...ALL_TOOL_CATEGORIES],
          }),
        "VALIDATION_ERROR",
      );

      expect(error.message).toContain(JSON.stringify(reserved));
      expect(error.message).toMatch(/grants nothing/i);
    },
  );

  it.each([["read"], [42], [{ read: true }], [null], [["read", 7]]])(
    "refuses a `capabilities:` field of %j rather than reading it as empty",
    (capabilities) => {
      const error = expectEngineError(
        () =>
          checkAgentCapabilities(
            [file("agents/stamity-devops.md", capabilities)],
            OPS_PERMISSIONS,
          ),
        "VALIDATION_ERROR",
      );

      expect(error.message).toContain("agents/stamity-devops.md");
      expect(error.message).toContain("capabilities");
      expect(error.message).toContain("array of strings");
    },
  );

  it("reports every defect across every agent in one refusal", () => {
    const error = expectEngineError(
      () =>
        checkAgentCapabilities(
          [
            file("agents/one.md", ["read", "spawn"]),
            file("agents/two.md", ["network", "filesystem"]),
            file("agents/three.md", ["read"]),
          ],
          { toolFootprint: ["read", "spawn"] },
        ),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("agents/one.md");
    expect(error.message).toContain("agents/two.md");
    // The conforming agent contributes no line.
    expect(error.message).not.toContain("agents/three.md");
    expect(error.message.split("\n  - ")).toHaveLength(4);
  });

  it("collapses the same defect declared twice into one line", () => {
    const error = expectEngineError(
      () =>
        checkAgentCapabilities([file("agents/one.md", ["network", "network"])], {
          toolFootprint: ["read"],
        }),
      "VALIDATION_ERROR",
    );

    expect(error.message.split("\n  - ")).toHaveLength(2);
  });

  it("checks agent files at any depth, and only agent files", () => {
    // A `capabilities:` key on a skill or command is not a grant — the emitted
    // policy document has no row for it — so refusing one would invent a rule
    // the rest of the engine does not hold.
    expect(
      checkAgentCapabilities(
        [
          file("skills/stamity-release/SKILL.md", ["spawn", "filesystem"]),
          file("commands/stamity-release.md", ["network"]),
          file("agents/README.txt", ["network"]),
        ],
        { toolFootprint: ["read"] },
      ),
    ).toBe("pass");

    expectEngineError(
      () =>
        checkAgentCapabilities([file("agents/nested/deep.md", ["network"])], {
          toolFootprint: ["read"],
        }),
      "VALIDATION_ERROR",
    );
  });

  it("accepts exactly the categories the grant resolver can derive, and no others", () => {
    // The structural-duplication seam: `src/roster/` may not import `src/pack/`
    // and vice versa, so both sides spell the grantable vocabulary themselves.
    // This is the binding — ingress refuses precisely what emission would drop,
    // so no pack can install an agent whose declared grant silently evaporates.
    const wideFootprint: PackPermissions = { toolFootprint: [...ALL_TOOL_CATEGORIES] };
    expect(ALL_TOOL_CATEGORIES.length).toBeGreaterThan(0);

    for (const category of ALL_TOOL_CATEGORIES) {
      const derivable = parseCapabilities({ capabilities: [category] }).length === 1;
      const accepted = ((): boolean => {
        try {
          checkAgentCapabilities([file("agents/one.md", [category])], wideFootprint);
          return true;
        } catch {
          return false;
        }
      })();

      expect(accepted, category).toBe(derivable);
    }

    // Non-degenerate on both sides: the loop above proves an agreement, not an
    // agreement to refuse everything.
    expect(FUNCTIONAL_TOOL_CATEGORIES.length).toBeGreaterThan(RESERVED_TOOL_CATEGORIES.length);
  });

  it("passes every first-party pack shipped in this repo", async () => {
    const packs = await shippedPacks();
    expect(packs.length).toBeGreaterThan(0);

    let checkedAgents = 0;
    for (const pack of packs) {
      checkedAgents += pack.agents.length;
      expect(checkAgentCapabilities(pack.agents, pack.permissions), pack.id).toBe("pass");
    }

    // The suite would pass vacuously against a packs tree with no agents in it.
    expect(checkedAgents).toBeGreaterThan(0);
  });

  it("every shipped pack agent declares a capability set inside its pack's footprint", async () => {
    const packs = await shippedPacks();
    expect(packs.length).toBeGreaterThan(0);

    // The subset relation stated directly, not only through the gate: a pack that
    // declares a reach no agent claims over-states what the operator accepts at
    // install, and an agent that claims one the pack never disclosed installs a
    // grant nobody approved. Both directions are reported per agent.
    const problems: string[] = [];
    let checked = 0;
    for (const pack of packs) {
      const footprint = pack.permissions?.toolFootprint ?? [];
      for (const agent of pack.agents) {
        checked += 1;
        const declared = agent.frontmatter["capabilities"];
        const capabilities = Array.isArray(declared) ? declared.map(String) : [];
        for (const capability of capabilities) {
          if (!footprint.includes(capability as never)) {
            problems.push(
              `${pack.id}/${agent.relPath}: declares ${JSON.stringify(capability)}, absent ` +
                `from the pack footprint [${footprint.join(", ")}]`,
            );
          }
        }
      }
    }

    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(0);

    // Named: the incident responder's grant and the ops footprint agree, and
    // neither carries `network` — telemetry is read through the project's own CLI
    // tooling under `execute`, which is what the agent body states.
    const ops = packs.find((pack) => pack.id === "ops");
    const responder = ops?.agents.find((agent) => agent.relPath.includes("incident-responder"));
    expect(responder?.frontmatter["capabilities"]).toEqual(["read", "edit", "execute"]);
    expect(ops?.permissions?.toolFootprint).toEqual(OPS_PERMISSIONS.toolFootprint);
    expect(ops?.permissions?.toolFootprint).not.toContain("network");
  });

  it("fixture: an agent reaching past its pack's footprint is reported by file and capability", () => {
    const error = expectEngineError(
      () =>
        checkAgentCapabilities([file("agents/stamity-incident-responder.md", ["read", "network"])], {
          toolFootprint: [...(OPS_PERMISSIONS.toolFootprint ?? [])],
        }),
      "VALIDATION_ERROR",
    );

    // Proves the subset check above is not vacuous: the same grant that passes on the
    // shipped pack fails the moment one capability leaves the declared footprint.
    expect(error.message).toContain("agents/stamity-incident-responder.md");
    expect(error.message).toContain('"network"');
    // The message lists the GRANTABLE footprint, so `spawn` is absent from it —
    // delegation is never handed to an agent whatever the pack declares.
    expect(error.message).toContain("read, edit, execute");
    expect(error.message).toMatch(/permissions\.toolFootprint/);
  });
});
