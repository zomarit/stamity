import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — the capability emitter ships as a plain .mjs module with no type
// declarations: the generator that builds the plugin roots runs it under bare Node, with
// no TypeScript nearby. Imported HERE rather than restated as a literal because the fixture
// roots below must be documents the REAL writer produced, or this suite would prove the
// verb against a shape no release can emit.
import { buildCapabilityFile } from "../../../scripts/plugins/capability.mjs";
import { cleanCommand } from "../../../src/cli/commands/clean.ts";
import { pluginCommand } from "../../../src/cli/commands/plugin.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { renderCliReference } from "../../../src/cli/docs/cliReference.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { createApp } from "../../../src/index.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { CAPABILITY_FILE } from "../../../src/plugins/capabilityFile.ts";
import type { Tool } from "../../../src/types/core.ts";
import type { SetupManifest } from "../../../src/types/manifest.ts";
import { npxCommand } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * `stamity plugin` — the verb behind the plugin-backed lane (REQ-PLUGIN-013,
 * REQ-PLUGIN-015, REQ-PLUGIN-016, REQ-PLUGIN-017, REQ-PLUGIN-019).
 *
 * Real filesystem, real emission, real child process. The corpus below is
 * seeded at the pinned content root and carries one artifact of every class the
 * ownership boundary can move, for the reason `./pluginSetup.test.ts` states:
 * a charter-only corpus emits no agent, skill or command at all, so "0 files of
 * a carried class" would hold against an engine that had never heard of the
 * boundary.
 *
 * The one substitute is the fixture root's `runtime/locate.mjs`, and it is a
 * STUB by necessity rather than by preference: the real locator resolves a
 * bundled runtime, which is a 3 MiB tree the release job builds and this suite
 * cannot produce. What the stub stands in for is proven elsewhere at full
 * fidelity — the locator's own resolution and exit codes in file 1's suite, and
 * every branch of the spawn (exit 0, exit 2, no locator at all, a timeout) in
 * `./check.test.ts`, against the same probe this verb reads. The spawn itself
 * is real here: the stub is a separate process producing bytes on stdout, so
 * the parse and the exit-code path are exercised, not simulated.
 */

/**
 * The companion package a generated root names, READ from this checkout rather
 * than spelled — `test/ci/forkIdentity.test.ts` holds every CLI suite to that.
 */
const COMPANION_PACKAGE = (
  JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    name: string;
  }
).name;

const getTemp = useTempDir("plugin-verb");

const T0 = new Date("2026-09-20T09:00:00.000Z");

function artifact(id: string, type: string, extra: readonly string[] = []): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: "fixture ${type} ${id}"`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    ...extra,
    "---",
    "",
    `# ${id}`,
    "",
    "Fixture guidance body.",
    "",
  ].join("\n");
}

const CORPUS_FIXTURE: Record<string, string> = {
  "corpus/charter/stamity-charter.md": artifact("charter", "charter").replace(
    "load: on-demand",
    "load: always",
  ),
  "corpus/agents/stamity-fixture-agent.md": artifact("fixture-agent", "agent", [
    "capabilities: [read]",
    "model_class: standard",
  ]),
  "corpus/skills/stamity-fixture-skill/SKILL.md": artifact("fixture-skill", "skill"),
  "corpus/commands/stamity-fixture-command.md": artifact("fixture-command", "command", [
    "readonly: true",
  ]),
  "corpus/rules/stamity-fixture-rule.md": artifact("fixture-rule", "rule", ['globs: ["src/**"]']),
};

beforeEach(async () => {
  __setContentRootForTests(getTemp().path("corpus"));
  await getTemp().seedFiles(CORPUS_FIXTURE);
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

/** A repository directory with nothing in it — the uninitialised case. */
async function makeRepo(sub = "repo", files: Record<string, string> = {}): Promise<string> {
  const root = getTemp().path(sub);
  await mkdir(root, { recursive: true });
  if (Object.keys(files).length > 0) {
    await getTemp().seedFiles(
      Object.fromEntries(Object.entries(files).map(([path, body]) => [`${sub}/${path}`, body])),
    );
  }
  return root;
}

/**
 * The locator a fixture root ships: it answers `--print` with the document
 * `scripts/plugins/locate.mjs` documents, and nothing else.
 *
 * Written as a real script and spawned as a real process (see the header): what
 * it cannot do is resolve a runtime, because there is no runtime in a fixture
 * root to resolve.
 */
function locatorStub(root: string, version: string): string {
  return [
    "const report = " +
      JSON.stringify({
        project: ".",
        runtime: {
          kind: "bundled",
          path: `${root}/runtime/dist/cli.js`,
          version,
          refusal: null,
        },
        node: { version: process.versions.node, floor: "22.22.2", ok: true },
      }) +
      ";",
    "process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`);",
    "",
  ].join("\n");
}

/** A generated plugin root: the real writer's capability document, plus a locator. */
async function pluginRoot(
  name: string,
  opts: { client?: Tool; version?: string; classes?: Record<string, unknown> } = {},
): Promise<string> {
  const client = opts.client ?? "claude";
  const version = opts.version ?? "1.9.0";
  const root = getTemp().path(name);
  await mkdir(join(root, "runtime"), { recursive: true });
  const file: unknown = buildCapabilityFile({
    client,
    version,
    sourceCommit: "a".repeat(40),
    invocation: { commands: "/stamity:<id>" },
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
      ...opts.classes,
    },
    runtime: { companion: { package: COMPANION_PACKAGE, compatible: `^${version}` } },
  });
  await writeFile(join(root, CAPABILITY_FILE), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await writeFile(join(root, "runtime", "locate.mjs"), locatorStub(root, version), "utf8");
  return root;
}

/** One `stamity plugin …` run, with the environment pinned empty by default. */
function plugin(
  root: string,
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runInProcess([pluginCommand], ["plugin", ...argv], { cwd: root, env });
}

/** The `--json` document of a `plugin` run, parsed. */
async function pluginJson(
  root: string,
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): Promise<Record<string, unknown>> {
  const result = await plugin(root, [...argv, "--json"], env);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

/** Every file under `dir`, repo-relative and POSIX-addressed. */
async function walk(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- deterministic walk over a tiny fixture tree
      out.push(...(await walk(join(dir, entry.name), relative)));
    } else out.push(relative);
  }
  return out;
}

/** Path → sha-256 over the whole tree, for the "writes nothing" assertions. */
async function shaMap(dir: string): Promise<Record<string, string>> {
  const paths = await walk(dir);
  const entries = await Promise.all(
    paths.map(async (path) => {
      const body = await readFile(join(dir, ...path.split("/")));
      return [path, createHash("sha256").update(body).digest("hex")] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe("plugin status — the read", () => {
  it("answers the same bytes for the bare verb and for status, and exits 0 uninitialised", async () => {
    const root = await makeRepo();

    const bare = await plugin(root, []);
    const named = await plugin(root, ["status"]);

    expect(bare.code).toBe(0);
    expect(named.code).toBe(0);
    expect(bare.stdout).toBe(named.stdout);
    // Non-degenerate: the report really rendered, rather than both runs having
    // printed nothing at all.
    expect(bare.stdout).toContain("runtime");
    expect(bare.stdout).toContain("compatibility");
  });

  it("reports a setup as needed on a repository with no manifest", async () => {
    const root = await makeRepo();

    const doc = await pluginJson(root, ["status"]);

    expect(doc.ok).toBe(true);
    expect(doc.setup).toMatchObject({ needed: true });
    expect(doc.installMode).toBe("generated");
    expect(doc.coexistence).toBe(false);
    expect(doc.compatibility).toEqual({
      state: "not-applicable",
      pluginVersion: null,
      manifestVersion: null,
    });
  });

  it("resolves the runtime from the root's own locator, through a real spawn", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const doc = await pluginJson(root, ["status", "--plugin-root", installed]);

    expect(doc.runtime).toEqual({
      kind: "bundled",
      path: `${installed}/runtime/dist/cli.js`,
      version: "1.9.0",
      message: null,
    });
    expect(doc.node).toEqual({ version: process.versions.node, floor: "22.22.2", ok: true });
  });

  it("names the four root variables when no root is reachable", async () => {
    const root = await makeRepo();

    const doc = await pluginJson(root, ["status"]);

    expect(doc.runtime).toMatchObject({ kind: "none", path: null, version: null });
    expect(String((doc.runtime as { message: string }).message)).toContain("CLAUDE_PLUGIN_ROOT");
    expect(String((doc.runtime as { message: string }).message)).toContain("COPILOT_PLUGIN_ROOT");
  });

  it("reads the root off the environment when no flag names one", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("env-root");

    const doc = await pluginJson(root, ["status"], { CLAUDE_PLUGIN_ROOT: installed });

    expect(doc.runtime).toMatchObject({ kind: "bundled", version: "1.9.0" });
    const clients = doc.clients as { tool: Tool; rootFound: boolean; clientFloor: string }[];
    expect(clients.find((row) => row.tool === "claude")).toMatchObject({
      rootFound: true,
      clientFloor: "2.1.224",
      rootVersion: "1.9.0",
    });
    // A root declares ONE client; the other three rows say so rather than
    // inheriting the claude root's facts.
    expect(clients.filter((row) => row.rootFound)).toHaveLength(1);
  });

  it("lists every fact detection could not determine with the command that sets it", async () => {
    // REQ-PLUGIN-017: a repository whose detection found no linter, no test
    // framework and no CI provider, and whose gates therefore resolve to
    // nothing. The charter still renders `unknown` for those; status is where
    // the operator learns which command changes that.
    const root = await makeRepo();
    await writeManifest(
      root,
      createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: createApp().version,
        now: T0,
        detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
      }),
      { now: T0 },
    );

    const doc = await pluginJson(root, ["status"]);

    const unconfigured = (doc.setup as { unconfigured: { fact: string; command: string }[] })
      .unconfigured;
    expect(unconfigured).toContainEqual({ fact: "linter", command: npxCommand("config detect") });
    expect(unconfigured).toContainEqual({
      fact: "test framework",
      command: npxCommand("config detect"),
    });
    expect(unconfigured).toContainEqual({
      fact: "gates.test",
      command: npxCommand('config set gates.test "<command>"'),
    });
    // A repository that already has a setup is not offered another one.
    expect(doc.setup).toMatchObject({ needed: false });
  });

  it("drops a gate from the unconfigured list once the operator pins it", async () => {
    const root = await makeRepo();
    const base = createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: createApp().version,
      now: T0,
      detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    });
    await writeManifest(root, { ...base, gates: { test: "npm run test:unit" } }, { now: T0 });

    const doc = await pluginJson(root, ["status"]);

    const facts = (doc.setup as { unconfigured: { fact: string }[] }).unconfigured.map(
      (row) => row.fact,
    );
    expect(facts).not.toContain("gates.test");
    expect(facts).toContain("gates.lint");
  });
});

describe("plugin status — compatibility (REQ-PLUGIN-013)", () => {
  it("reports compatible when the plugin major equals the recorded major", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("same-major", { version: `${createApp().version}` });
    await writeManifest(
      root,
      createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: createApp().version,
        now: T0,
      }),
      { now: T0 },
    );

    const doc = await pluginJson(root, ["status", "--plugin-root", installed]);

    expect(doc.compatibility).toEqual({
      state: "compatible",
      pluginVersion: createApp().version,
      manifestVersion: createApp().version,
    });
  });

  it("reports mismatch naming both versions when the majors differ", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("next-major", { version: "2.0.0" });
    await writeManifest(
      root,
      createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: "1.9.0",
        now: T0,
      }),
      { now: T0 },
    );

    const result = await plugin(root, ["status", "--plugin-root", installed]);
    const doc = await pluginJson(root, ["status", "--plugin-root", installed]);

    expect(doc.compatibility).toEqual({
      state: "mismatch",
      pluginVersion: "2.0.0",
      manifestVersion: "1.9.0",
    });
    // Both versions on the human surface too: a reader who is told only
    // "mismatch" cannot tell which side to move.
    expect(result.stdout).toContain("mismatch");
    expect(result.stdout).toContain("2.0.0");
    expect(result.stdout).toContain("1.9.0");
    // A report is not a gate.
    expect(result.code).toBe(0);
  });
});

describe("plugin setup — what it writes (REQ-PLUGIN-015)", () => {
  it("writes the repository-owned paths and no file of a carried class", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const result = await plugin(root, [
      "setup",
      "--client",
      "claude",
      "--plugin-root",
      installed,
      "-y",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const onDisk = await walk(root);
    expect(onDisk).toContain("AGENTS.md");
    expect(onDisk).toContain("CLAUDE.md");
    expect(onDisk).toContain(".claude/settings.json");
    expect(onDisk).toContain(".stamity/manifest.json");
    expect(onDisk.some((path) => path.startsWith(".claude/rules/"))).toBe(true);
    // The classes the root declares `carried` reach this client from the
    // plugin, so emission writes none of them.
    expect(onDisk.filter((path) => path.startsWith(".claude/agents"))).toEqual([]);
    expect(onDisk.filter((path) => path.startsWith(".claude/skills"))).toEqual([]);
    expect(onDisk.filter((path) => path.startsWith(".claude/commands"))).toEqual([]);
    expect(await readFile(join(root, ".claude", "settings.json"), "utf8")).not.toContain("hooks");
  });

  it("records the boundary on the manifest, class for class with the root", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    await plugin(root, ["setup", "--plugin-root", installed, "-y"]);

    const manifest = (await readManifest(root)) as SetupManifest;
    expect(manifest.plugin?.mode).toBe("plugin-backed");
    expect(manifest.plugin?.clients?.claude).toEqual({
      version: "1.9.0",
      // The root's own carried set, mcp excluded by construction.
      classes: ["agent", "skill", "command", "hooks"],
    });
    expect(manifest.tools).toEqual(["claude"]);
  });

  /**
   * TWO ROOTS IN ONE CALL (C6's edge case, reachable from the CLI at last).
   *
   * `--plugin-root` repeats, and each root is paired with the client its own
   * `stamity-plugin.json` declares — so one invocation sets two clients up from
   * their own roots. It used to bind every `--client` entry to the single
   * resolved root, which meant `--client claude,cursor` always refused on the
   * mismatch check and no CLI invocation could reach the two-client plan.
   */
  it("sets two clients up from their own roots in one call", async () => {
    const repo = await makeRepo();
    const claudeRoot = await pluginRoot("claude-root");
    const cursorRoot = await pluginRoot("cursor-root", { client: "cursor" });

    const result = await plugin(repo, [
      "setup",
      "--plugin-root",
      claudeRoot,
      "--plugin-root",
      cursorRoot,
      "-y",
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const manifest = (await readManifest(repo)) as SetupManifest;
    expect(Object.keys(manifest.plugin?.clients ?? {})).toEqual(["claude", "cursor"]);
    expect(manifest.tools).toEqual(["claude", "cursor"]);
  });

  it("accepts an explicit --client listing exactly the clients the roots declare", async () => {
    const repo = await makeRepo();
    const claudeRoot = await pluginRoot("claude-root");
    const cursorRoot = await pluginRoot("cursor-root", { client: "cursor" });

    // Argument order reversed against TOOLS order on purpose: the plan is the
    // same one either spelling produces.
    const result = await plugin(repo, [
      "setup",
      "--client",
      "cursor,claude",
      "--plugin-root",
      cursorRoot,
      "--plugin-root",
      claudeRoot,
      "-y",
    ]);

    expect(result.code).toBe(0);
    const manifest = (await readManifest(repo)) as SetupManifest;
    expect(Object.keys(manifest.plugin?.clients ?? {})).toEqual(["claude", "cursor"]);
  });

  it("prints the plugin-owned line naming the classes the plugin delivers", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const result = await plugin(root, ["setup", "--plugin-root", installed, "-y"]);

    expect(result.stdout).toContain("plugin-owned  claude: agent, skill, command, hooks");
    expect(result.stdout).toMatch(/wrote \d+ file\(s\)/);
  });

  it("writes the nested AGENTS.md copies of a monorepo, exactly as init does", async () => {
    // CODEX, not claude: a nested copy per workspace package is that client's
    // capability alone (`src/emit/monorepoPlan.ts::PER_PACKAGE_TOOLS`), so a
    // claude root would prove nothing about the monorepo path. Its capability
    // file declares hooks repository-owned — the codex spike outcome — which is
    // also what makes this fixture a second ownership shape rather than a copy
    // of the claude one.
    const root = await makeRepo("mono", {
      "package.json": '{ "name": "root", "workspaces": ["packages/*"] }\n',
      "packages/a/package.json": '{ "name": "@acme/a" }\n',
      "packages/b/package.json": '{ "name": "@acme/b" }\n',
    });
    const installed = await pluginRoot("codex-root", {
      client: "codex",
      classes: {
        hooks: {
          status: "repository-owned",
          reason: "the client wires hooks from its own config",
        },
      },
    });

    const result = await plugin(root, ["setup", "--plugin-root", installed, "-y"]);

    expect(result.code).toBe(0);
    const onDisk = await walk(root);
    // Two packages, not one: a single nested copy would pass against a walk
    // that stopped at the first workspace entry.
    expect(onDisk).toContain("packages/a/AGENTS.md");
    expect(onDisk).toContain("packages/b/AGENTS.md");
    // The boundary still holds on the nested path: the plugin carries codex's
    // agents, so none is written here.
    expect(onDisk.filter((path) => path.startsWith(".codex/agents"))).toEqual([]);
    const manifest = (await readManifest(root)) as SetupManifest;
    expect(manifest.plugin?.clients?.codex?.classes).toEqual(["agent", "skill", "command"]);
  });

  it("previews under --dry-run without writing a byte", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const result = await plugin(root, ["setup", "--plugin-root", installed, "-y", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("would write");
    expect(result.stdout).toContain("plugin-owned  claude: agent, skill, command, hooks");
    expect(await walk(root)).toEqual([]);
  });
});

describe("plugin setup — what it refuses", () => {
  it("refuses a repository that already carries a setup, and writes nothing", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");
    await plugin(root, ["setup", "--plugin-root", installed, "-y"]);
    const before = await shaMap(root);

    const second = await plugin(root, ["setup", "--plugin-root", installed, "-y"]);

    expect(second.code).toBe(1);
    expect(second.stderr).toContain("a generated setup exists");
    expect(second.stderr).toContain(npxCommand("clean -y"));
    expect(second.stderr).toContain(npxCommand("plugin setup --client claude"));
    // Not one byte moved: the refusal is ahead of the plan, not a writer that
    // was asked nicely.
    expect(await shaMap(root)).toEqual(before);
  });

  it("refuses a generated setup with the same clean-then-setup route", async () => {
    const root = await makeRepo();
    await seedGenerated(root);
    const installed = await pluginRoot("claude-root");
    const before = await shaMap(root);

    const result = await plugin(root, ["setup", "--plugin-root", installed, "-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a generated setup exists");
    expect(await shaMap(root)).toEqual(before);
  });

  it("refuses when neither a flag nor a root variable names a root", async () => {
    const root = await makeRepo();

    const result = await plugin(root, ["setup", "-y"]);

    expect(result.code).toBe(1);
    for (const variable of [
      "CLAUDE_PLUGIN_ROOT",
      "CURSOR_PLUGIN_ROOT",
      "PLUGIN_ROOT",
      "COPILOT_PLUGIN_ROOT",
    ]) {
      expect(result.stderr).toContain(variable);
    }
    expect(await walk(root)).toEqual([]);
  });

  it("refuses a root that carries no capability file, naming the file", async () => {
    const root = await makeRepo();
    const empty = getTemp().path("bare-root");
    await mkdir(empty, { recursive: true });

    const result = await plugin(root, ["setup", "--plugin-root", empty, "-y"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(CAPABILITY_FILE);
    expect(await walk(root)).toEqual([]);
  });

  it("refuses --client cursor against a root that declares itself claude's", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const result = await plugin(root, [
      "setup",
      "--client",
      "cursor",
      "--plugin-root",
      installed,
      "-y",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("declares client claude");
    expect(result.stderr).toContain(installed);
    expect(await walk(root)).toEqual([]);
  });

  it("refuses a listed client that no root declares, naming it", async () => {
    const repo = await makeRepo();
    const claudeRoot = await pluginRoot("claude-root");

    const result = await plugin(repo, [
      "setup",
      "--client",
      "claude,cursor",
      "--plugin-root",
      claudeRoot,
      "-y",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cursor");
    expect(result.stderr).toContain("--plugin-root");
    expect(await walk(repo)).toEqual([]);
  });

  it("refuses a second root whose client --client does not name", async () => {
    const repo = await makeRepo();
    const claudeRoot = await pluginRoot("claude-root");
    const cursorRoot = await pluginRoot("cursor-root", { client: "cursor" });

    const result = await plugin(repo, [
      "setup",
      "--client",
      "claude",
      "--plugin-root",
      claudeRoot,
      "--plugin-root",
      cursorRoot,
      "-y",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("declares client cursor");
    expect(result.stderr).toContain(cursorRoot);
    expect(await walk(repo)).toEqual([]);
  });

  it("refuses a --client value that is not a client this engine sets up", async () => {
    const root = await makeRepo();
    const installed = await pluginRoot("claude-root");

    const result = await plugin(root, [
      "setup",
      "--client",
      "emacs",
      "--plugin-root",
      installed,
      "-y",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("emacs");
    expect(result.stderr).toContain("claude, cursor, copilot, codex");
  });
});

/**
 * A generated setup, as `stamity init` leaves one: a manifest plus a real
 * emission pass, so the ledger rows and the files on disk are the engine's own
 * rather than a fixture's idea of them.
 */
async function seedGenerated(root: string): Promise<void> {
  const engineVersion = createApp().version;
  await writeManifest(
    root,
    createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: engineVersion,
      now: T0,
    }),
    { now: T0 },
  );
  const plan = await planSync(root, engineVersion);
  await applySync(root, plan, { engineVersion, force: false, dryRun: false, now: T0 });
}

describe("the documented route off a generated setup (REQ-PLUGIN-015, REQ-PLUGIN-019)", () => {
  it("clean then setup leaves no coexistence and a compatible runtime", async () => {
    const root = await makeRepo();
    await seedGenerated(root);
    const installed = await pluginRoot("claude-root", { version: createApp().version });
    // The generated tree really emitted the classes the plugin carries — without
    // this the coexistence assertion below would pass against an empty repo.
    expect((await walk(root)).some((path) => path.startsWith(".claude/agents/"))).toBe(true);

    const cleaned = await runInProcess([cleanCommand], ["clean", "-y"], { cwd: root, env: {} });
    expect(cleaned.code).toBe(0);

    const setup = await plugin(root, ["setup", "--plugin-root", installed, "-y"]);
    expect(setup.code).toBe(0);

    const doc = await pluginJson(root, ["status", "--plugin-root", installed]);
    expect(doc.installMode).toBe("plugin-backed");
    expect(doc.coexistence).toBe(false);
    expect(doc.duplicates).toEqual([]);
    expect(doc.compatibility).toMatchObject({ state: "compatible" });
  });

  it("reports coexistence while a generated file of a carried class is still on disk", async () => {
    // The state BEFORE the operator cleans: the manifest records a plugin, and
    // the ledger still owns the agents the plugin also carries.
    const root = await makeRepo();
    await seedGenerated(root);
    const installed = await pluginRoot("claude-root");
    const generated = (await readManifest(root)) as SetupManifest;
    await writeManifest(
      root,
      {
        ...generated,
        plugin: {
          mode: "generated",
          clients: { claude: { version: "1.9.0", classes: ["agent"] } },
        },
      },
      { now: T0 },
    );

    const doc = await pluginJson(root, ["status", "--plugin-root", installed]);

    expect(doc.coexistence).toBe(true);
    const duplicates = doc.duplicates as { tool: Tool; class: string; files: number }[];
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({ tool: "claude", class: "agent" });
    expect(duplicates[0]?.files).toBeGreaterThan(0);
  });
});

describe("the verb's surface", () => {
  it("refuses an unknown subcommand, naming the two it takes", async () => {
    const root = await makeRepo();

    const result = await plugin(root, ["bogus"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown plugin subcommand");
    expect(result.stderr).toContain("status, setup");
  });

  it("documents itself in the generated CLI reference", async () => {
    const page = renderCliReference();

    expect(page).toContain("## `stamity plugin`");
    expect(page).toContain("--plugin-root <path>");
    expect(page).toContain("status (default), setup");
  });
});
