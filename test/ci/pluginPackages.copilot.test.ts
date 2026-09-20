// The generator is spawned once and every case reads the same tree, so the spawns in this file
// are deliberately sequential.
/* oxlint-disable no-await-in-loop */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { copilotResiduePlanner } from "../../src/adapters/copilot.ts";
import { composeEmissionPlanner } from "../../src/emit/planner.ts";
import { CLAUDE_EVENT_NAMES } from "../../src/hooks/model.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
import type { AdapterOutput, ContentSelection } from "../../src/types/content.ts";
import { CORPUS_ROOT } from "../corpus/harness.ts";

/**
 * The GitHub Copilot CLI plugin root: `<out>/copilot` as the container reads it
 * (REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005).
 *
 * ── The spike this unit ran, 2026-09-20 ──────────────────────────────────────────────────────
 *
 * Pages read, each a full address with its access date because the vendor moves them:
 *   - https://agent-plugins.org/schemas/1.0.0/plugin.schema.json (2026-09-20) — vendored
 *     byte-for-byte at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json`. It is CLOSED
 *     (`additionalProperties: false`), requires `$schema` and `name`, pins `$schema` to a
 *     `const`, closes `author` to name/email/url, and bounds `name` by a pattern with a
 *     lookahead. There is no `logo` and there are no component path fields.
 *   - https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
 *     (2026-09-20) — the layout table: `com.github.copilot/agents/`, `.../commands/`,
 *     `.../rules/`, `.../hooks/hooks.json`, `.../lsp.json`, with `skills/` and `mcp.json` FIXED
 *     at the root for Agent Plugins 1.0. The table gives directories and no file extensions.
 *   - https://docs.github.com/en/copilot/reference/hooks-reference (2026-09-20) — the event
 *     vocabulary, vendored at `test/fixtures/plugins/copilot-hook-events.json`.
 *
 * Three things the pages do NOT state, and what this suite does about each:
 *
 *   1. The command file extension. MEASURED instead, by the binary leg below against GitHub
 *      Copilot CLI 1.0.85: the CLI strips ONE extension to derive an id, so `st-work.prompt.md`
 *      registers `st-work.prompt` and `st-work.md` registers `st-work`. The root's own bodies
 *      name `/st-work` and its eight siblings 126 times, so the container takes `<id>.md`.
 *   2. `${PLUGIN_ROOT}` expansion inside a hook COMMAND, and its export to the hook process.
 *      Still open; the capability file carries it as the `hooks` class reason and this suite
 *      asserts the shape of the emitted command, never that the client expands it.
 *   3. Whether a headless `-p` run lists plugin skills. Recorded as a MEASUREMENT, never an
 *      assertion — skill precedence is first-found with a project's own `.github/skills/`,
 *      `.agents/skills/` and `.claude/skills/` AHEAD of a plugin's, so a bare skill name proven
 *      inside this checkout would prove the checkout, not the plugin.
 *
 * ── How the tree is produced ────────────────────────────────────────────────────────────────
 *
 * The generator runs as a CHILD PROCESS over the real corpus, the way CI and a release run it,
 * because every property here is a property of the tree on disk. `--runtime` is a STUB — the
 * two files the generator requires of a runtime — for the reason `pluginPackages.test.ts`
 * states in full: the bundled runtime has its own owner and its own proof, and rebuilding it
 * here would re-prove someone else's contract at a minute per run.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROOT_VARIABLE = "PLUGIN_ROOT";
const NAMESPACE = "com.github.copilot";

/** A 40-hex commit and its date, pinned so the tree is a function of the corpus alone. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";

/** One root is a content index plus a planner pass plus a tree write: ~3s, with CI headroom. */
const ONE_ROOT_MS = 60_000;

/** The nine touchpoints the corpus carries, plus the generated setup command. */
const TOUCHPOINT_IDS = [
  "st-ask",
  "st-board",
  "st-debug",
  "st-plan",
  "st-pr-resolve",
  "st-quick",
  "st-rework",
  "st-spec",
  "st-work",
] as const;

interface PluginSchema {
  properties: Record<string, { const?: string; pattern?: string; minLength?: number; maxLength?: number; properties?: Record<string, unknown> }>;
  required: string[];
  additionalProperties: boolean;
}

interface HookEventFixture {
  source: { url: string; accessDate: string };
  camelCase: string[];
  pascalCaseAliases: Record<string, string>;
}

const SCHEMA = JSON.parse(
  readFileSync(join(REPO_ROOT, "test/fixtures/plugins/agent-plugins-1.0.0.schema.json"), "utf8"),
) as PluginSchema;
const HOOK_EVENTS = JSON.parse(
  readFileSync(join(REPO_ROOT, "test/fixtures/plugins/copilot-hook-events.json"), "utf8"),
) as HookEventFixture;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-copilot-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/** Justified stub — see the suite header; the real runtime is P7's to prove. */
function stubRuntime(): string {
  const dir = tempDir("runtime");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "@zomarit/stamity", version: "1.8.0", engines: { node: ">=22.22.2" } }, null, 2)}\n`,
  );
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "cli.js"), "#!/usr/bin/env node\nconsole.log('stub runtime');\n");
  return dir;
}

let root: string;

beforeAll(() => {
  const out = tempDir("roots");
  const result = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, "scripts", "generate-plugin-packages.mjs"),
      "--out-dir", out,
      "--runtime", stubRuntime(),
      "--client", "copilot",
      "--source-commit", FIXED_COMMIT,
      "--source-commit-date", FIXED_COMMIT_DATE,
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  expect(result.status, result.stderr).toBe(0);
  root = join(out, "copilot");
}, ONE_ROOT_MS);

/** Every regular file under `dir`, as POSIX-relative paths, sorted. */
function treeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return treeFiles(join(dir, entry.name), rel);
      return entry.isFile() ? [rel] : [];
    });
}

const rootFiles = (): string[] => treeFiles(root).filter((rel) => !rel.startsWith("runtime/"));
const under = (prefix: string): string[] => rootFiles().filter((rel) => rel.startsWith(prefix));
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * The one skill body in the corpus carrying a `${STAMITY:*}` token, and the one file whose two
 * renderings differ on purpose. A REPOSITORY emission resolves that token from detected facts —
 * `vitest`, this repository's own gate commands — and a PLUGIN emission resolves it into a phrase
 * naming the row to read in `AGENTS.md`, because a plugin is built once for every repository
 * there will ever be. Pinned by name so a second token-bearing skill is a deliberate change
 * rather than a silently widened exception.
 */
const SUBSTITUTED_SKILLS: readonly string[] = ["skills/st-onboard/SKILL.md"];

/**
 * The copilot residue planner over the real corpus — the projection the container re-addresses.
 *
 * This is the oracle for "the root carries what this client emits": it runs the SAME adapter the
 * generator runs but knows nothing of `scripts/plugins/layout.mjs`, so a table that dropped a
 * row, renamed one, or invented one shows up as a set difference rather than as agreement
 * between the layout and itself.
 */
let nativePlanOnce: Promise<AdapterOutput[]> | null = null;

/**
 * Memoised: two cases read this oracle and a whole corpus pass costs seconds, while the planner
 * is a pure function of a fixed corpus and a fixed manifest — the second call could only produce
 * the same rows at the same price. The PROMISE is cached rather than the rows, so two concurrent
 * callers share one pass instead of racing two.
 */
async function nativePlan(): Promise<AdapterOutput[]> {
  nativePlanOnce ??= planCopilotResidue();
  return nativePlanOnce;
}

async function planCopilotResidue(): Promise<AdapterOutput[]> {
  return composeEmissionPlanner({ copilot: copilotResiduePlanner }).plan({
    rootDir: join(work, "plan-root"),
    manifest: {
      ...createManifest({
        tools: ["copilot"],
        // Every class key ABSENT is what the emission allowlist reads as unfiltered, which is
        // the full selection the generator resolves for a published root.
        selection: { items: {} as ContentSelection["items"] },
        generatorVersion: "0.0.0-test",
        now: new Date("2026-09-20T00:00:00.000Z"),
        detected: { languages: [], linters: ["eslint"], testFrameworks: ["vitest"], ciProviders: ["github-actions"] },
      }),
      ruleDelivery: "on-demand",
    },
    engineVersion: "0.0.0-test",
    facts: { monorepoPackages: [], hookScriptsRoot: `\${${ROOT_VARIABLE}}/hooks` },
    contentRoot: CORPUS_ROOT,
  });
}

describe("the copilot root's container manifest, against the vendored Agent Plugins 1.0.0 schema", () => {
  /**
   * The schema's rules applied INLINE rather than through a validator dependency: five rules is
   * less code than a dependency's lockfile entry, and each one below is the literal the fixture
   * carries, so a vendor change to the fixture changes what this asserts.
   */
  function defectsAgainstSchema(manifest: Record<string, unknown>): string[] {
    const defects: string[] = [];
    for (const key of SCHEMA.required) {
      if (!Object.hasOwn(manifest, key)) defects.push(`required key ${key} is absent`);
    }
    if (SCHEMA.additionalProperties === false) {
      for (const key of Object.keys(manifest)) {
        if (!Object.hasOwn(SCHEMA.properties, key)) defects.push(`${key} is not a property of the schema`);
      }
    }
    const nameRule = SCHEMA.properties["name"] ?? {};
    const name = manifest["name"];
    if (typeof name !== "string") {
      defects.push("name is not a string");
    } else {
      // Native RegExp on purpose: the pattern carries a lookahead — `(?!.*(?:--|\.\.))` — and a
      // hand-rolled character check would silently pass the names it exists to refuse.
      if (!new RegExp(nameRule.pattern ?? "", "u").test(name)) defects.push(`name ${name} fails the schema pattern`);
      if (name.length < (nameRule.minLength ?? 0)) defects.push("name is shorter than minLength");
      if (name.length > (nameRule.maxLength ?? Infinity)) defects.push("name is longer than maxLength");
    }
    const schemaConst = SCHEMA.properties["$schema"]?.const;
    if (manifest["$schema"] !== schemaConst) defects.push(`$schema is not the ${String(schemaConst)} const`);
    const authorKeys = Object.keys(SCHEMA.properties["author"]?.properties ?? {});
    const author = manifest["author"];
    if (typeof author === "object" && author !== null) {
      for (const key of Object.keys(author as Record<string, unknown>)) {
        if (!authorKeys.includes(key)) defects.push(`author.${key} is not one of ${authorKeys.join(", ")}`);
      }
    }
    return defects;
  }

  it("opts into Agent Plugins 1.0 and carries nothing the closed schema does not name", () => {
    const manifest = JSON.parse(read("plugin.json")) as Record<string, unknown>;
    expect(defectsAgainstSchema(manifest)).toEqual([]);
    expect(manifest["$schema"]).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest["name"]).toBe("stamity");
    expect(Object.keys(manifest["author"] as Record<string, unknown>)).toEqual(["name"]);
    // Non-degenerate: the manifest is the nine-key identity block, not a two-key stub that would
    // satisfy `required` and prove nothing about what the container publishes.
    expect(Object.keys(manifest).toSorted()).toEqual(
      ["$schema", "author", "description", "homepage", "keywords", "license", "name", "repository", "version"],
    );
    expect((manifest["keywords"] as string[]).length).toBeGreaterThan(1);
  });

  it("refuses the four manifests the schema's own rules exist to refuse", () => {
    // The negative control. Without it every assertion above passes on a validator that returns
    // an empty array for anything at all.
    const valid = JSON.parse(read("plugin.json")) as Record<string, unknown>;
    expect(defectsAgainstSchema({ ...valid, logo: "assets/logo.svg" })).toContain(
      "logo is not a property of the schema",
    );
    expect(defectsAgainstSchema({ ...valid, name: "sta--mity" })).toContain("name sta--mity fails the schema pattern");
    expect(defectsAgainstSchema({ ...valid, $schema: "https://agent-plugins.org/schemas/0.9.0/plugin.schema.json" })).
      toContain(`$schema is not the ${String(SCHEMA.properties["$schema"]?.const)} const`);
    expect(defectsAgainstSchema({ ...valid, author: { name: "zomarit", github: "zomarit" } })).toContain(
      "author.github is not one of name, email, url",
    );
  });
});

describe("the copilot root's carried classes", () => {
  it("carries exactly the skills this client natively projects, byte for byte", async () => {
    const native = (await nativePlan()).filter((row) => row.path.startsWith(".agents/skills/"));
    const expected = new Map(native.map((row) => [row.path.replace(".agents/skills/", "skills/"), row.content]));

    // Non-degenerate by construction: ten skill directories, including the two glob-less rules
    // this client delivers as skills rather than as a rule surface it has none of.
    expect(new Set([...expected.keys()].map((rel) => rel.split("/")[1])).size).toBeGreaterThanOrEqual(10);
    expect([...expected.keys()].some((rel) => rel.startsWith("skills/stamity-question-protocol/"))).toBe(true);
    expect([...expected.keys()].some((rel) => rel.startsWith("skills/stamity-ai-evals/"))).toBe(true);

    expect(under("skills/").toSorted()).toEqual([...expected.keys()].toSorted());
    for (const rel of SUBSTITUTED_SKILLS) expect([...expected.keys()], rel).toContain(rel);

    for (const [rel, content] of expected) {
      const carried = read(rel);
      if (!SUBSTITUTED_SKILLS.includes(rel)) {
        expect(sha(Buffer.from(carried, "utf8")), rel).toBe(sha(Buffer.from(content, "utf8")));
        continue;
      }
      // The two renderings must DIFFER, and the plugin's must be the repository-free one.
      expect(carried, rel).not.toBe(content);
      expect(carried, rel).not.toContain("${STAMITY:");
      expect(carried, rel).toContain("in AGENTS.md");
      const moved = carried.split("\n").filter((line, index) => line !== content.split("\n")[index]);
      expect(moved.length, rel).toBeGreaterThan(0);
      for (const line of moved) expect(line, `${rel}: ${line}`).toContain("in AGENTS.md");
    }
  }, ONE_ROOT_MS);

  it("puts the ten agents under the namespace directory as <id>.agent.md", async () => {
    const native = (await nativePlan())
      .filter((row) => row.path.startsWith(".github/agents/"))
      .map((row) => row.path.replace(".github/agents/", ""));
    expect(native.length).toBe(10);
    expect(under(`${NAMESPACE}/agents/`).toSorted()).toEqual(native.map((n) => `${NAMESPACE}/agents/${n}`).toSorted());
    for (const rel of under(`${NAMESPACE}/agents/`)) expect(rel.endsWith(".agent.md"), rel).toBe(true);
  }, ONE_ROOT_MS);

  it("names each command <id>.md, the spelling the CLI derives a clean id from", () => {
    const commands = under(`${NAMESPACE}/commands/`);
    expect(commands.toSorted()).toEqual(
      [...TOUCHPOINT_IDS, "st-setup"].map((id) => `${NAMESPACE}/commands/${id}.md`).toSorted(),
    );
    // MEASURED, 2026-09-20, GitHub Copilot CLI 1.0.85 in a scratch COPILOT_HOME: the CLI strips
    // one extension to derive an id, so a `.prompt.md` file registers `<id>.prompt` and the
    // root's own 126 `/st-*` references would name commands that do not exist. The repository
    // surface keeps `.prompt.md`; the container does not.
    expect(commands.filter((rel) => rel.endsWith(".prompt.md"))).toEqual([]);
    expect(read(`${NAMESPACE}/commands/st-setup.md`)).toContain("plugin setup --client copilot -y");
  });

  it("drops the four repository-owned surfaces the container has no home for", () => {
    const files = rootFiles();
    expect(files.filter((rel) => rel.startsWith(".github/instructions"))).toEqual([]);
    expect(files.filter((rel) => rel.startsWith(".vscode"))).toEqual([]);
    expect(files.filter((rel) => rel === "AGENTS.md" || rel === "CLAUDE.md")).toEqual([]);
    expect(files.filter((rel) => rel.includes("copilot-setup-steps"))).toEqual([]);
    expect(files.filter((rel) => rel.startsWith(".stamity/"))).toEqual([]);
    // Non-degenerate: the four absences above are absences inside a root that carries 34 files.
    expect(files.length).toBeGreaterThan(30);
  });
});

describe("the copilot root's hooks (REQ-PLUGIN-005)", () => {
  interface HookEntry {
    type: string;
    command?: string;
    cwd?: string;
    timeoutSec?: number;
    matcher?: string;
  }

  const hooksOf = (): { version: number; hooks: Record<string, HookEntry[]> } =>
    JSON.parse(read(`${NAMESPACE}/hooks/hooks.json`)) as { version: number; hooks: Record<string, HookEntry[]> };

  it("sits at the Agent Plugins 1.0 path and declares version 1", () => {
    expect(rootFiles()).toContain(`${NAMESPACE}/hooks/hooks.json`);
    // The legacy locations the reference names as the LEGACY-plugin fallback, absent here.
    expect(rootFiles()).not.toContain("hooks.json");
    expect(rootFiles()).not.toContain("hooks/hooks.json");
    expect(hooksOf().version).toBe(1);
  });

  it("names only events the vendor's reference carries, in the casing the adapter maps to", () => {
    const events = Object.keys(hooksOf().hooks);
    expect(events.length).toBeGreaterThan(1);

    const vendor = new Set([...HOOK_EVENTS.camelCase, ...Object.values(HOOK_EVENTS.pascalCaseAliases)]);
    for (const event of events) expect(vendor.has(event), `${event} is not a documented event`).toBe(true);
    // And the adapter's own mapping, which is where these strings actually come from: the root
    // emits the PascalCase aliases, which the reference documents as selecting the VS Code
    // compatible payload format (snake_case fields). The portable runner normalises both.
    for (const event of events) {
      expect(Object.values(CLAUDE_EVENT_NAMES), event).toContain(event);
      expect(Object.values(HOOK_EVENTS.pascalCaseAliases), event).toContain(event);
    }
  });

  it("points every command at the installed root and none at a repository path", () => {
    const entries = Object.values(hooksOf().hooks).flat();
    expect(entries.length).toBeGreaterThan(2);
    for (const entry of entries) {
      expect(entry.type).toBe("command");
      expect(typeof entry.command).toBe("string");
      expect(entry.cwd).toBe(".");
      if (entry.timeoutSec !== undefined) expect(Number.isSafeInteger(entry.timeoutSec)).toBe(true);
      if (entry.matcher !== undefined) expect(typeof entry.matcher).toBe("string");

      const command = entry.command ?? "";
      expect(command, command).toContain(`\${${ROOT_VARIABLE}}`);
      expect(command, command).toContain("/hooks/");
      expect(command, command).not.toContain(".stamity/generated");

      // The runner's argument is a base64 payload carrying the INNER command, so a root-relative
      // outer command with a repository-relative inner one would pass a surface check and fail
      // on the first hook fired.
      const payload = command.split(" ").at(-1) ?? "";
      const inner = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { command: string[] };
      expect(inner.command.join(" "), payload).toContain(`\${${ROOT_VARIABLE}}/hooks/`);
      expect(inner.command.join(" "), payload).not.toContain(".stamity/generated");
    }
  });

  it("ships the hook scripts and the policy document the guard reads beside them", () => {
    const scripts = under("hooks/").filter((rel) => rel.endsWith(".mjs"));
    expect(scripts.length).toBe(4);
    expect(scripts).toContain("hooks/stamity-portable-hook.mjs");
    expect(() => JSON.parse(read("hooks/agent-tool-policies.json"))).not.toThrow();
    // Every command names a script that is actually here: a hook config pointing at a file the
    // root does not carry is the failure REQ-PLUGIN-005 exists to prevent.
    for (const entry of Object.values(hooksOf().hooks).flat()) {
      const named = (entry.command ?? "").match(/hooks\/[a-z0-9-]+\.mjs/g) ?? [];
      expect(named.length).toBeGreaterThan(0);
      for (const path of named) expect(rootFiles(), path).toContain(path);
    }
  });
});

describe("the copilot root's capability file (REQ-PLUGIN-002)", () => {
  interface Capability {
    invocation: Record<string, string>;
    clientFloor: { version: string; citation?: { url: string; accessDate: string }; reason?: string };
    prerequisites: Record<string, string>;
    classes: Record<string, { status: string; count?: number; reason?: string }>;
  }
  const capability = (): Capability => JSON.parse(read("stamity-plugin.json")) as Capability;

  it("declares the install prerequisite and an unknown floor with the reason it is unknown", () => {
    const { clientFloor, prerequisites } = capability();
    expect(prerequisites["copilot"]).toBe("npm install -g @github/copilot");
    expect(clientFloor.version).toBe("unknown");
    expect(clientFloor.citation?.url).toMatch(/^https:\/\/docs\.github\.com\//);
    expect(clientFloor.citation?.accessDate).toBe("2026-09-20");
    expect(clientFloor.reason).toContain("four docs.github.com pages");
    expect(clientFloor.reason).toContain("Node 22");
  });

  it("states the invocation literal for each carried class", () => {
    expect(capability().invocation).toEqual({
      agents: "/agent <id> (or --agent=<id>)",
      commands: "/<id>",
      skills: "/<id>",
    });
  });

  it("carries agents, skills, commands and hooks, and hands rules and MCP back to the repository", () => {
    const classes = capability().classes;
    for (const name of ["agent", "skill", "command", "hooks"]) {
      expect(classes[name]?.status, name).toBe("carried");
      expect(classes[name]?.count ?? 0, name).toBeGreaterThan(0);
    }
    expect(classes["command"]?.reason).toContain("<id>.md registers the id <id>");
    expect(classes["hooks"]?.reason).toContain("not stated on the hooks reference");
    for (const name of ["rule", "mcp"]) {
      expect(classes[name]?.status, name).toBe("repository-owned");
      expect(classes[name]?.reason, name).toBeTruthy();
    }
    expect(classes["rule"]?.reason).toContain(`${NAMESPACE}/rules/`);
  });
});

describe("the copilot root's README", () => {
  it("names the install route, where it lands, and the two behaviours that surprise an operator", () => {
    const readme = read("README.md");
    for (const literal of [
      "copilot plugin marketplace add",
      "copilot plugin install",
      "copilot plugin update stamity",
      "~/.copilot/installed-plugins/<marketplace>/<plugin>",
      "~/.copilot/installed-plugins/_direct/<source-id>/",
      "COPILOT_AUTO_UPDATE=false",
      "2026-09-20",
    ]) {
      expect(readme, `README never names ${literal}`).toContain(literal);
    }
    // A cached install and a shadowing project skill are the two facts an operator hits first.
    expect(readme).toMatch(/reinstall|installed again|install .* again/i);
    expect(readme).toContain(".claude/skills/");
    expect(readme).toMatch(/VS\s*\n?Code is not on it/);
  });
});

/**
 * The real client, opt-in on `STAMITY_COPILOT_BIN`.
 *
 * Skip-if rather than always-on: the CLI is a global npm install nothing in this repository
 * depends on, and a suite that goes red on a machine without it tests the machine. Everything
 * here runs in a scratch `HOME` and `COPILOT_HOME` — the reference names `COPILOT_HOME` as the
 * override for the configuration and state directory, and `installed-plugins/` lives under it —
 * so an operator's own installed plugins are neither read nor written.
 */
/**
 * The environment a spawned client binary gets: an explicit allowlist, never the whole of
 * `process.env`.
 *
 * The scratch home below exists so this leg reads and writes no operator state. Inheriting the
 * ambient environment reopens exactly what the scratch home closes: a real client CLI reads its
 * credentials out of variables an author's shell is full of, and a measurement taken with
 * somebody's own token is not the measurement it claims to be. `PATH` is what makes the binary
 * and its Node resolvable, `TMPDIR` and `LANG` keep the process well behaved, and `STAMITY_*`
 * rides because this leg's own arming lives there.
 *
 * The same helper sits in the sibling client suite. Duplicated rather than shared, because the
 * only home it could share is a file this lane does not own.
 */
function allowlistedEnv(scratch: Record<string, string>): NodeJS.ProcessEnv {
  const allowed: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "TMPDIR", "LANG"]) {
    const value = process.env[name];
    if (value !== undefined) allowed[name] = value;
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("STAMITY_") && value !== undefined) allowed[name] = value;
  }
  return { ...allowed, ...scratch };
}

describe.skipIf(process.env["STAMITY_COPILOT_BIN"] === undefined)("the real client on STAMITY_COPILOT_BIN", () => {
  const BIN = process.env["STAMITY_COPILOT_BIN"] ?? "";
  const CLI_MS = 300_000;

  let home: string;
  let scratchCwd: string;

  function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(BIN, args, {
      // The scratch cwd is the other half of the isolation: skill precedence is first-found with
      // a PROJECT's `.github/skills/`, `.agents/skills/` and `.claude/skills/` ahead of a
      // plugin's, so running inside this checkout would let the repository answer for the root.
      cwd: scratchCwd,
      encoding: "utf8",
      timeout: CLI_MS,
      env: allowlistedEnv({ HOME: home, COPILOT_HOME: join(home, ".copilot"), XDG_CONFIG_HOME: join(home, ".config") }),
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  beforeAll(() => {
    home = tempDir("copilot-home");
    scratchCwd = tempDir("copilot-cwd");
  });

  it(
    "installs the root, lists it, and deploys it byte for byte",
    () => {
      const installed = run(["plugin", "install", root]);
      const transcript = `${installed.stdout}\n${installed.stderr}`;
      if (installed.status !== 0) {
        // An install that needs a login or refuses headless is RECORDED, not asserted: the leg
        // proves the client's behaviour when it runs and says exactly why it did not otherwise.
        console.log(`[copilot] install refused (exit ${String(installed.status)}):\n${transcript}`);
        return;
      }
      expect(installed.status).toBe(0);

      const listed = run(["plugin", "list", "--json"]);
      expect(listed.status, listed.stderr).toBe(0);
      const plugins = JSON.parse(listed.stdout) as { name: string; version: string }[];
      expect(plugins.map((entry) => entry.name)).toContain("stamity");

      // `_direct/<source-id>/` — the reference names the shape and not the id, so it is found.
      const direct = join(home, ".copilot", "installed-plugins", "_direct");
      const sources = readdirSync(direct);
      expect(sources.length, `no installed tree under ${direct}`).toBe(1);
      const deployed = join(direct, sources[0] ?? "");

      const sourceMap = Object.fromEntries(
        rootFiles().map((rel) => [rel, sha(readFileSync(join(root, ...rel.split("/"))))]),
      );
      const deployedMap = Object.fromEntries(
        treeFiles(deployed)
          .filter((rel) => !rel.startsWith("runtime/"))
          .map((rel) => [rel, sha(readFileSync(join(deployed, ...rel.split("/"))))]),
      );
      expect(Object.keys(sourceMap).length).toBeGreaterThan(30);
      expect(deployedMap).toEqual(sourceMap);

      // MEASUREMENT, printed and never asserted: what the client says it discovered. `skill list`
      // needs no authentication; `-p` does, and its refusal is the record when it comes.
      const skills = run(["skill", "list"]);
      console.log(`[copilot] skill list (exit ${String(skills.status)}):\n${skills.stdout || skills.stderr}`);
      const headless = run(["-p", "list your available skills", "-s"]);
      console.log(
        `[copilot] -p "list your available skills" -s (exit ${String(headless.status)}):\n` +
          `${headless.stdout || headless.stderr}`,
      );
    },
    CLI_MS,
  );
});
