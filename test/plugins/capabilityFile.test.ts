import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the capability emitter ships as a plain .mjs module with no type
// declarations: the generator that builds the plugin roots runs it under bare Node, with no
// TypeScript nearby. Imported HERE rather than restated as a literal because the writer and
// this reader are two halves of one contract (REQ-PLUGIN-002 / REQ-PLUGIN-015), and a
// hand-copied fixture would let the two drift silently green.
import { buildCapabilityFile, INVOCATION_NOTE_KEYS, PLUGIN_CLASSES } from "../../scripts/plugins/capability.mjs";
// @ts-expect-error — the four container modules are plain .mjs for the same reason: they are
// read by the generator under bare Node. Imported rather than restated so the carriable set
// below is BOUND to what each container actually declares, the way
// `test/ci/releaseManifest.test.ts` imports its own .mjs half.
import * as claudeContainer from "../../scripts/plugins/clients/claude.mjs";
// @ts-expect-error — see above.
import * as codexContainer from "../../scripts/plugins/clients/codex.mjs";
// @ts-expect-error — see above.
import * as copilotContainer from "../../scripts/plugins/clients/copilot.mjs";
// @ts-expect-error — see above.
import * as cursorContainer from "../../scripts/plugins/clients/cursor.mjs";
import {
  CAPABILITY_FILE,
  CARRIABLE_CLASSES,
  PLUGIN_CAPABILITY_CLASSES,
  carriedClasses,
  invocationForms,
  readCapabilityFile,
  resolvePluginRoot,
  uncarriableClasses,
} from "../../src/plugins/capabilityFile.ts";
import { PLUGIN_OWNED_CLASSES, type PluginOwnedClass } from "../../src/types/manifest.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The companion package a generated root names, READ from this checkout rather
 * than spelled. `test/ci/forkIdentity.test.ts` holds every CLI suite to that:
 * a downstream fork renames the package and must not have to edit a test, and
 * the name is incidental to everything asserted here anyway.
 */
const COMPANION_PACKAGE = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    name: string;
  }
).name;

/**
 * The reader half of `stamity-plugin.json` (REQ-PLUGIN-015).
 *
 * The engine half of this unit: this module imports nothing but the types leaf
 * and the strict JSON parser, which is what lets it sit in `src/plugins/` and be
 * wired into `EngineRegistry`. Its consumer, the setup engine, could not —
 * see `src/cli/commands/plugin/setup.ts`.
 *
 * Every parse case here runs against a file the REAL writer built
 * (`scripts/plugins/capability.mjs::buildCapabilityFile`) and serialized to a real temp root,
 * never against a hand-written object: the file is a contract between a generator that runs
 * under bare Node and a reader that runs under TypeScript, and the only way that contract can
 * be checked is to move bytes across it. A defect case mutates the BUILT file, so the mutation
 * is a single stated deviation from a document that was valid a line earlier.
 *
 * The reader is deliberately STRICT — an unknown top-level key, an unknown class key, a
 * schema version other than 1, a client outside this engine's tools — because a root carrying
 * a key this engine does not understand is a root built by a newer generator, and silently
 * ignoring it would set a repository up against capabilities that are not there.
 */

const getTemp = useTempDir("capability-file");

/** A capability input shaped as file 1's claude root builds it: four carried classes, no route. */
const claudeInput = (): Record<string, unknown> => ({
  client: "claude",
  version: "1.9.0",
  sourceCommit: "a".repeat(40),
  invocation: { commands: "/stamity:<id>", agents: "stamity:<id>", skills: "/stamity:<id>" },
  clientFloor: {
    version: "2.1.224",
    citation: {
      url: "https://code.claude.com/docs/en/plugin-marketplaces",
      accessDate: "2026-09-17",
    },
  },
  prerequisites: { node: ">=22.22.2", git: "optional" },
  classes: {
    agent: { status: "carried", count: 10 },
    skill: { status: "carried", count: 14 },
    command: { status: "carried", count: 10 },
    rule: { status: "repository-owned", reason: "the plugin manifest has no rules field" },
    hooks: { status: "carried", count: 4 },
    mcp: {
      status: "repository-owned",
      reason: "server selection and credential references are the repository's",
    },
  },
  runtime: { companion: { package: COMPANION_PACKAGE, compatible: "^1.9.0" } },
});

const build = (input: Record<string, unknown>): Record<string, unknown> =>
  buildCapabilityFile(input) as Record<string, unknown>;

/** Writes a built capability document into a fresh plugin root and returns the root path. */
async function seedRoot(
  file: Record<string, unknown>,
  name = "plugin-root",
): Promise<string> {
  const root = getTemp().path(name);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, CAPABILITY_FILE), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return root;
}

describe("readCapabilityFile — a document the real writer produced", () => {
  it("round-trips every key the writer emits, with no key gained or lost", async () => {
    const written = build(claudeInput());
    const root = await seedRoot(written);

    const read = await readCapabilityFile(root);

    // Deep equality both ways: the reader neither drops a key the writer set nor
    // invents a default the file did not carry.
    expect(read).toEqual(written);
    expect(Object.keys(read).toSorted()).toEqual(Object.keys(written).toSorted());
    expect(read.schemaVersion).toBe(1);
    expect(read.client).toBe("claude");
    expect(read.version).toBe("1.9.0");
    expect(read.runtime.locator).toBe("runtime/locate.mjs");
    expect(read.prerequisites.node).toBe(">=22.22.2");
  });

  it("reports the carried classes in ownership order, mcp excluded", async () => {
    const read = await readCapabilityFile(await seedRoot(build(claudeInput())));
    expect(carriedClasses(read)).toEqual(["agent", "skill", "command", "hooks"]);
  });

  it("leaves a repository-owned class out of that client's carried set", async () => {
    // The codex spike outcome: a client whose hooks the plugin cannot carry keeps
    // hooks in generated mode, so the class must not reach the manifest record.
    const input = claudeInput();
    input.classes = {
      ...(input.classes as Record<string, unknown>),
      hooks: { status: "repository-owned", reason: "the client wires hooks from its own config" },
    };
    const read = await readCapabilityFile(await seedRoot(build(input)));
    expect(carriedClasses(read)).toEqual(["agent", "skill", "command"]);
  });

  it("round-trips a cursor root's invocation note and keeps it out of the forms", async () => {
    // The Cursor container declares `invocation.citation` beside its three forms, because the
    // plugins reference states no invocation form at all and the file has to record which page
    // the `/<id>` form was read off. `invocation` is an OPEN record — a container names a form
    // per class without this reader knowing the class names — so nothing but a reserved key can
    // tell a form from a sentence about the forms, and a consumer offering that sentence as
    // something to type is the defect the reservation prevents.
    const input = claudeInput();
    input.client = "cursor";
    input.invocation = {
      agents: "/<id>",
      commands: "/<id>",
      skills: "/<id>",
      citation: "the /<id> form is stated on cursor.com/docs/agent/subagents and cursor.com/docs/skills",
    };
    const read = await readCapabilityFile(await seedRoot(build(input)));

    // The note survives the round trip: it is part of the document, not something to strip.
    expect(read.invocation["citation"]).toContain("cursor.com/docs/agent/subagents");
    // And it is not a form. Non-degenerate: three forms remain, so this is a filter doing work
    // rather than an empty record agreeing with an empty expectation.
    expect(invocationForms(read)).toEqual({ agents: "/<id>", commands: "/<id>", skills: "/<id>" });
  });

  it("refuses a root whose invocation carries the note and no form at all", async () => {
    // The two halves run under different runtimes, so the reserved list is read from the writer
    // rather than restated: a hand-copied literal is what drifts silently green.
    expect([...(INVOCATION_NOTE_KEYS as string[])].toSorted()).toEqual(["citation"]);

    const input = claudeInput();
    input.invocation = { citation: "a page, and no form at all" };
    const root = await seedRoot(build(input), "notes-only");
    // Reserving the key must not turn it into a form by the back door: a document naming a
    // citation and nothing else names no way to invoke anything, and is refused exactly as an
    // empty `invocation` is.
    await expect(readCapabilityFile(root)).rejects.toThrow(/at least one invocation form/);
  });

  it("accepts the optional distribution route the writer emits only on request", async () => {
    const input = claudeInput();
    input.client = "cursor";
    input.distribution = { note: "an organization imports the repository as a team marketplace" };
    const read = await readCapabilityFile(await seedRoot(build(input)));
    expect(read.client).toBe("cursor");
    expect(read.distribution).toEqual({
      note: "an organization imports the repository as a team marketplace",
    });
  });

  it("names the same class set the writer does, derived rather than restated", () => {
    // A literal list here would drift silently the day the writer grows a class.
    expect([...PLUGIN_CAPABILITY_CLASSES]).toEqual(PLUGIN_CLASSES);
  });
});

describe("readCapabilityFile — refusals", () => {
  /** Runs the reader over a root and returns the error it refused with. */
  async function refusalFor(file: Record<string, unknown>, name: string): Promise<EngineError> {
    const root = await seedRoot(file, name);
    try {
      await readCapabilityFile(root);
    } catch (error) {
      return error as EngineError;
    }
    throw new Error("readCapabilityFile resolved where a refusal was required");
  }

  it("refuses a schema version other than 1, naming the key", async () => {
    const file = build(claudeInput());
    file.schemaVersion = 2;
    const error = await refusalFor(file, "schema-2");
    expect(error).toBeInstanceOf(EngineError);
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain("schemaVersion");
    expect(error.message).toContain("2");
  });

  it("refuses an unknown top-level key, naming the key", async () => {
    const file = build(claudeInput());
    file.telemetry = { endpoint: "https://example.invalid" };
    const error = await refusalFor(file, "extra-top-key");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain("telemetry");
  });

  it("refuses an unknown class key, naming the key", async () => {
    const file = build(claudeInput());
    (file.classes as Record<string, unknown>).prompt = { status: "carried", count: 1 };
    const error = await refusalFor(file, "extra-class-key");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain("classes.prompt");
  });

  it("refuses a client outside this engine's tools, naming the key and the value", async () => {
    const file = build(claudeInput());
    file.client = "windsurf";
    const error = await refusalFor(file, "unknown-client");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain("client");
    expect(error.message).toContain("windsurf");
    expect(error.message).toContain("claude");
  });

  it("refuses a class status outside the three the writer may emit", async () => {
    const file = build(claudeInput());
    (file.classes as Record<string, Record<string, unknown>>).agent = { status: "bundled" };
    const error = await refusalFor(file, "bad-status");
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain("classes.agent.status");
  });

  it("names every defect at once, each by its own JSON path", async () => {
    // The promise is a LIST, not a first-failure: an operator repairing a root
    // built by a newer generator has to see all of it in one run. Four
    // independent sections are broken here, and all four must be reported.
    const file = build(claudeInput());
    file.invocation = {};
    file.clientFloor = { version: "" };
    file.prerequisites = { node: ">=22.22.2", git: "maybe" };
    (file.runtime as Record<string, unknown>).companion = "the npm package";

    const error = await refusalFor(file, "many-defects");
    expect(error.code).toBe("CONFIG_ERROR");
    const named = error.message
      .split("\n")
      .filter((line) => line.startsWith("  - "))
      .map((line) => line.slice(4).split(":")[0]);
    expect(named.toSorted()).toEqual([
      "clientFloor.version",
      "invocation",
      "prerequisites.git",
      "runtime.companion",
    ]);
  });

  it("refuses a section that is the wrong JSON type outright, naming the section", async () => {
    const file = build(claudeInput());
    file.classes = [];
    file.prerequisites = "node >= 22";
    file.clientFloor = null;
    file.distribution = "a marketplace";

    const error = await refusalFor(file, "wrong-types");
    expect(error.message).toContain("classes:");
    expect(error.message).toContain("prerequisites:");
    expect(error.message).toContain("clientFloor:");
    expect(error.message).toContain("distribution:");
  });

  it("refuses a carried class that states no count, and an uncarried one with no reason", async () => {
    const file = build(claudeInput());
    (file.classes as Record<string, unknown>).agent = { status: "carried" };
    (file.classes as Record<string, unknown>).rule = { status: "unsupported" };

    const error = await refusalFor(file, "count-and-reason");
    expect(error.message).toContain("classes.agent.count");
    expect(error.message).toContain("classes.rule.reason");
  });

  it("refuses a per-client prerequisite that is not the command that installs it", async () => {
    const file = build(claudeInput());
    file.prerequisites = { node: ">=22.22.2", git: "optional", claude: 17 };

    const error = await refusalFor(file, "bad-prerequisite");
    expect(error.message).toContain("prerequisites.claude");
  });

  it("refuses an unknown key inside a nested object, naming its full path", async () => {
    const file = build(claudeInput());
    (file.clientFloor as Record<string, unknown>).measuredAt = "2026-09-17";
    (
      (file.runtime as Record<string, unknown>).companion as Record<string, unknown>
    ).registry = "https://registry.npmjs.org";

    const error = await refusalFor(file, "nested-unknown-keys");
    expect(error.message).toContain("clientFloor.measuredAt");
    expect(error.message).toContain("runtime.companion.registry");
  });

  it("refuses a source commit that is not a 40-character sha, and a blank version", async () => {
    const file = build(claudeInput());
    file.sourceCommit = "abc123";
    file.version = "";

    const error = await refusalFor(file, "bad-identity");
    expect(error.message).toContain("sourceCommit");
    expect(error.message).toContain("version:");
  });

  // The version a root declares is recorded on the manifest and compared, major
  // against major, by every later `check`. `semver.major` on `1.9` or `latest`
  // answers nothing usable, so a mis-declared root has to refuse at ingress —
  // the same rule the manifest applies to its own version — rather than after
  // `applyInit` has written a setup that records it.
  //
  // `v1.9.0` is deliberately absent from this list: `semver.valid` accepts the
  // `v` prefix, and the rule mirrors the manifest's own version rule exactly
  // rather than inventing a stricter one the release job never had to satisfy.
  it.each(["1.9", "latest", "1.9.0-", "1.9.0.1"])(
    "refuses the version %s, before a single file is written",
    async (version) => {
      const file = build(claudeInput());
      file.version = version;

      const error = await refusalFor(file, `bad-version-${version.replaceAll(/\W+/g, "-")}`);
      expect(error.message).toContain("version:");
    },
  );

  it("accepts the prerelease and build spellings semver itself accepts", async () => {
    // Not a degenerate pass: `1.9.0-rc.1+build.5` is a version the release job
    // can genuinely stamp, and a check written as "looks like three numbers"
    // would refuse it.
    const file = build({ ...claudeInput(), version: "1.9.0-rc.1+build.5" });

    const root = await seedRoot(file, "prerelease-version");

    expect((await readCapabilityFile(root)).version).toBe("1.9.0-rc.1+build.5");
  });

  it("refuses a citation that is present but not a url and an access date", async () => {
    const file = build(claudeInput());
    (file.clientFloor as Record<string, unknown>).citation = { url: "", accessDate: 20260917 };

    const error = await refusalFor(file, "bad-citation");
    expect(error.message).toContain("clientFloor.citation.url");
    expect(error.message).toContain("clientFloor.citation.accessDate");
  });

  it("refuses a missing stamity-plugin.json, naming the path it looked at", async () => {
    const root = getTemp().path("empty-root");
    await mkdir(root, { recursive: true });
    await expect(readCapabilityFile(root)).rejects.toThrow(join(root, CAPABILITY_FILE));
  });

  it("refuses a malformed document, naming the path", async () => {
    const root = getTemp().path("broken-root");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, CAPABILITY_FILE), "{ not json", "utf8");
    await expect(readCapabilityFile(root)).rejects.toThrow(join(root, CAPABILITY_FILE));
  });

  it("refuses a document whose root is not an object, naming the path", async () => {
    const root = getTemp().path("array-root");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, CAPABILITY_FILE), "[]\n", "utf8");
    // The root-shape refusal belongs to the strict parser, which is why the
    // schema pass below it takes an object and carries no unreachable branch.
    await expect(readCapabilityFile(root)).rejects.toThrow(join(root, CAPABILITY_FILE));
  });

  it("refuses a root where the capability file is unreadable, not only absent", async () => {
    // A botched extract leaves a DIRECTORY at the path; the errno is not ENOENT,
    // and the operator's answer is the same — this is not a root to set up from.
    const root = getTemp().path("dir-instead-of-file");
    await mkdir(join(root, CAPABILITY_FILE), { recursive: true });
    let caught: unknown;
    try {
      await readCapabilityFile(root);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EngineError);
    const error = caught as EngineError;
    expect(error.code).toBe("CONFIG_ERROR");
    expect(error.message).toContain(join(root, CAPABILITY_FILE));
    expect(error.message).not.toContain("no such file");
  });
});

/**
 * The carriable set, bound to the containers that build the roots.
 *
 * A capability file is a document from OUTSIDE this repository, so `status:
 * "carried"` on a class the container has no surface for is a claim the reader
 * has to refuse rather than record: a root declaring `rule: carried` for claude
 * would switch `.claude/rules/` off in emission while no container delivers a
 * rule to claude at all, and the repository would silently lose its always-on
 * layer. The four containers already state which classes they do not carry
 * (`DECLARED_CLASSES`, every entry `repository-owned` or `unsupported`), and
 * this binding is what keeps the reader's table from drifting away from them.
 */
describe("CARRIABLE_CLASSES", () => {
  const containers: Record<string, { DECLARED_CLASSES?: Record<string, unknown> }> = {
    claude: claudeContainer,
    cursor: cursorContainer,
    copilot: copilotContainer,
    codex: codexContainer,
  };

  it.each(Object.keys(containers))(
    "names exactly the classes %s's own container does not declare away",
    (client) => {
      const declared = containers[client]?.DECLARED_CLASSES ?? {};
      const expected = PLUGIN_OWNED_CLASSES.filter(
        (name) => !Object.hasOwn(declared, name),
      );

      expect(CARRIABLE_CLASSES[client as keyof typeof CARRIABLE_CLASSES]).toEqual(expected);
    },
  );

  it("keeps the four sets different, so the binding is not a tautology", () => {
    // codex carries two classes and cursor five; a table that had collapsed to
    // one list for every client would pass the per-client check above against a
    // container set that happened to agree.
    expect(CARRIABLE_CLASSES.codex).toEqual(["skill", "hooks"]);
    expect(CARRIABLE_CLASSES.cursor).toEqual(["agent", "skill", "command", "rule", "hooks"]);
  });
});

describe("uncarriableClasses", () => {
  it("names a class a root carries that its client has no surface for", async () => {
    const file = build({
      ...claudeInput(),
      classes: {
        ...(claudeInput().classes as Record<string, unknown>),
        rule: { status: "carried", count: 3 },
      },
    });

    const root = await seedRoot(file, "claude-carrying-rules");

    expect(uncarriableClasses(await readCapabilityFile(root))).toEqual<PluginOwnedClass[]>([
      "rule",
    ]);
  });

  it("names nothing for a root carrying only what its client can carry", async () => {
    const root = await seedRoot(build(claudeInput()), "claude-well-formed");

    expect(uncarriableClasses(await readCapabilityFile(root))).toEqual([]);
  });
});

describe("resolvePluginRoot", () => {
  it("prefers an explicit flag over every environment variable", () => {
    expect(
      resolvePluginRoot({
        flag: "/flagged/root",
        env: {
          CLAUDE_PLUGIN_ROOT: "/claude",
          CURSOR_PLUGIN_ROOT: "/cursor",
          PLUGIN_ROOT: "/generic",
          COPILOT_PLUGIN_ROOT: "/copilot",
        },
      }),
    ).toBe("/flagged/root");
  });

  it("falls through the four variables in the documented order", () => {
    const env = {
      CLAUDE_PLUGIN_ROOT: "/claude",
      CURSOR_PLUGIN_ROOT: "/cursor",
      PLUGIN_ROOT: "/generic",
      COPILOT_PLUGIN_ROOT: "/copilot",
    };
    // Each step drops the winner and asserts the NEXT one wins, so the order is
    // pinned position by position rather than by a single first-place check.
    expect(resolvePluginRoot({ env })).toBe("/claude");
    expect(resolvePluginRoot({ env: { ...env, CLAUDE_PLUGIN_ROOT: undefined } })).toBe("/cursor");
    expect(
      resolvePluginRoot({
        env: { ...env, CLAUDE_PLUGIN_ROOT: undefined, CURSOR_PLUGIN_ROOT: undefined },
      }),
    ).toBe("/generic");
    expect(
      resolvePluginRoot({
        env: {
          ...env,
          CLAUDE_PLUGIN_ROOT: undefined,
          CURSOR_PLUGIN_ROOT: undefined,
          PLUGIN_ROOT: undefined,
        },
      }),
    ).toBe("/copilot");
  });

  it("answers null when nothing names a root, and treats a blank value as unset", () => {
    expect(resolvePluginRoot({ env: {} })).toBeNull();
    expect(resolvePluginRoot({ flag: "  ", env: { CLAUDE_PLUGIN_ROOT: "  " } })).toBeNull();
  });
});
