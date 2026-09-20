// Each generator spawn observes the tree the previous one left, so the awaits here are ordered
// on purpose.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURSOR_GUARD_EVENTS, EVENT_RENAME } from "../../src/adapters/cursor.ts";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { resolveSelection } from "../../src/content/selection.ts";
import { composeEmissionPlanner } from "../../src/emit/planner.ts";
import { MANIFEST_VERSION } from "../../src/types/manifest.ts";
// @ts-expect-error — the emitter modules ship as plain .mjs with no type declarations: the
// generator that builds the plugin roots runs them under bare Node, with no TypeScript nearby.
import { stageSubstitutedCorpus } from "../../scripts/plugins/corpusStage.mjs";
// @ts-expect-error — same reason as the import above.
import * as tokens from "../../scripts/plugins/tokens.mjs";
import { downstreamCheckout } from "./downstreamFixture.ts";

/**
 * The `cursor/` plugin root: what lands in it, what its two declaration files say, and what a
 * real Cursor CLI makes of it (REQ-PLUGIN-001, -002, -005).
 *
 * `test/ci/pluginPackages.test.ts` owns the properties every root shares — determinism, the
 * three `--check` shapes, no token standing anywhere, the runtime and the locator. This suite
 * owns the ones only this container has, and its oracle is deliberately NOT the layout module
 * that produced the tree: for every artifact class, the expected bytes come from a SECOND,
 * cursor-only emission planned in-process over the same substituted corpus the generator stages.
 * A root file and its repository twin must be the same bytes at a different address, which is
 * the whole claim "one renderer, one corpus, two address spaces" makes. Comparing against the
 * committed four-client tree would instead compare a build to itself.
 *
 * Two facts this client publishes no schema for are vendored under `test/fixtures/plugins/`:
 * the manifest's documented field list, and the documented hook-event list. Both are hand
 * transcriptions with a URL and an access date, because there is nothing to fetch — and in both
 * cases the failure a wrong name produces is SILENT (an unknown manifest key is ignored; an
 * unknown `hooks.json` key parses and never fires), so a transcription is the only detector.
 *
 * `--runtime` is a STUB: the two files the generator refuses a runtime for lacking. The real
 * bundled runtime is built from a packed tarball and proven by its own suite; rebuilding it here
 * would add a minute of `npm pack` to re-prove a contract that already has an owner.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENT = "cursor";

/** A 40-hex commit and its date, pinned so a fixture checkout with no `.git` still renders. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";

/**
 * Wall-time budgets, derived rather than guessed. One root is a full content index plus a
 * planner pass plus a tree write, measured at ~2s on this repository's corpus; the shared
 * `beforeAll` also plans a second, in-process emission over the same corpus. 30s is ~7x the
 * measured cost, which is the headroom a loaded CI worker needs.
 */
const ONE_ROOT_MS = 30_000;

/** The vendored vendor facts. Read as bytes, so a malformed fixture fails loudly here. */
interface VendoredPage {
  source: { url: string; accessDate: string };
}
type ManifestFields = VendoredPage & { required: string[]; fields: string[] };
type HookEvents = VendoredPage & { events: string[] };

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, "test", "fixtures", "plugins", name), "utf8")) as T;
}

const MANIFEST_FIELDS = fixture<ManifestFields>("cursor-plugin-fields.json");
const HOOK_EVENTS = fixture<HookEvents>("cursor-hook-events.json");

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-cursor-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * A `--runtime` input the generator accepts: the two files it refuses a directory for lacking.
 * Justified stub — see the suite header; the real runtime has its own proof.
 */
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

const RUNTIME = stubRuntime();

/**
 * A checkout of this repository's generator over the fork fixture's corpus.
 *
 * The fixture writes the four artifact classes and no charter, because the APM generator it was
 * built for projects primitives and never renders one. A plugin build PLANS, and the charter is
 * the engine's one always-on artifact — a corpus without it cannot emit at all — so this
 * repository's own charter is seeded in, the smallest way to make a fixture three other suites
 * share plannable without touching it.
 */
function forkCheckout(prefix: string): string {
  const checkout = tempDir(prefix);
  downstreamCheckout(checkout);
  cpSync(join(REPO_ROOT, "content", "charter"), join(checkout, "content", "charter"), { recursive: true });
  return checkout;
}

function generate(args: string[], cwd = REPO_ROOT, env?: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(cwd, "scripts", "generate-plugin-packages.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
}

/**
 * A temp directory the spawned generator is the only writer of, so "what did this run leave
 * behind" is answerable without racing the other suites that stage a corpus under the shared
 * system temp directory. The three names are what `os.tmpdir()` reads on POSIX and on Windows.
 */
function isolatedTemp(prefix: string): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = tempDir(prefix);
  return { dir, env: { TMPDIR: dir, TEMP: dir, TMP: dir } };
}

function buildCursorRoot(outDir: string, cwd = REPO_ROOT, env?: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return generate(
    [
      "--out-dir",
      outDir,
      "--runtime",
      RUNTIME,
      "--client",
      CLIENT,
      "--source-commit",
      FIXED_COMMIT,
      "--source-commit-date",
      FIXED_COMMIT_DATE,
    ],
    cwd,
    env,
  );
}

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

let root: string;
/** The cursor-only repository emission over the SAME substituted corpus: the oracle. */
let emission: Map<string, string>;

function rootFile(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/** The frontmatter block of a `.mdc` or `SKILL.md` file, without the fences. */
function head(text: string): string[] {
  const lines = text.split("\n");
  expect(lines[0]).toBe("---");
  const end = lines.indexOf("---", 1);
  expect(end).toBeGreaterThan(0);
  return lines.slice(1, end);
}

beforeAll(async () => {
  const out = tempDir("roots");
  const result = buildCursorRoot(out);
  expect(result.status, result.stderr).toBe(0);
  root = join(out, CLIENT);

  // The second emission: the engine's own cursor plan over the corpus the generator staged.
  // Same substitution, same planner, same `hookScriptsRoot` — so any difference in the bytes is
  // a re-addressing defect in the container table and nothing else.
  const version = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
  const staged = (await stageSubstitutedCorpus({
    contentRoot: join(REPO_ROOT, "content"),
    forkRoot: join(REPO_ROOT, "fork"),
    tokens,
  })) as { root: string; forkRoot: string; dispose: () => Promise<void> };
  try {
    const contentRoot = { root: staged.root, forkRoot: staged.forkRoot };
    const index = await buildContentIndex(contentRoot);
    const plan = await composeEmissionPlanner({ cursor: ADAPTER_REGISTRY["cursor"] }).planWithWarnings({
      rootDir: tempDir("plan"),
      manifest: {
        version: MANIFEST_VERSION,
        generatedBy: version,
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        tools: ["cursor"],
        ruleDelivery: "on-demand",
        selection: resolveSelection(index, {}),
        ledger: [],
      },
      engineVersion: version,
      facts: { monorepoPackages: [], hookScriptsRoot: "${CURSOR_PLUGIN_ROOT}/hooks" },
      contentRoot,
    });
    emission = new Map(plan.outputs.map((row) => [row.path, row.content]));
  } finally {
    await staged.dispose();
  }
  // Non-degenerate by construction: a full corpus plan, not an empty one.
  expect(emission.size).toBeGreaterThan(40);
}, ONE_ROOT_MS);

// ── The container manifest ───────────────────────────────────────────────────

describe("the manifest this client discovers the root by", () => {
  it("declares only field names the vendor documents, and omits the three it decides against", () => {
    const manifest = JSON.parse(rootFile(".cursor-plugin/plugin.json")) as Record<string, unknown>;
    const declared = Object.keys(manifest);

    // No invented key. With no published schema, this transcription is the whole check.
    expect(declared.filter((key) => !MANIFEST_FIELDS.fields.includes(key))).toEqual([]);
    // The one required field is present and is the plugin id, not the npm scope.
    for (const key of MANIFEST_FIELDS.required) expect(declared, key).toContain(key);
    expect(manifest["name"]).toBe("stamity");

    // Exactly the documented set minus three deliberate omissions, each with its reason:
    //   commands   — the nine touchpoints ride under `skills/`, the shape this client converts
    //                a command into; `commands/` discovery reads FILES and would find nothing.
    //   mcpServers — server selection and credentials are repository-owned.
    //   variables  — every path is already addressed through `${CURSOR_PLUGIN_ROOT}`.
    const omitted = new Set(["commands", "mcpServers", "variables"]);
    expect(declared.toSorted()).toEqual(
      MANIFEST_FIELDS.fields.filter((key) => !omitted.has(key)).toSorted(),
    );
    expect(existsSync(join(root, "commands"))).toBe(false);
  });

  it("points every component field at a directory the root actually carries", () => {
    const manifest = JSON.parse(rootFile(".cursor-plugin/plugin.json")) as Record<string, string>;
    for (const [field, expected] of [
      ["rules", "./rules/"],
      ["agents", "./agents/"],
      ["skills", "./skills/"],
      ["hooks", "./hooks/hooks.json"],
      ["logo", "assets/logo.svg"],
    ] as const) {
      expect(manifest[field], field).toBe(expected);
      const target = expected.replace(/^\.\//, "").replace(/\/$/, "");
      expect(existsSync(join(root, ...target.split("/"))), field).toBe(true);
    }
    expect(readFileSync(join(root, "assets", "logo.svg"))).toEqual(
      readFileSync(join(REPO_ROOT, "assets", "logo.svg")),
    );
  });
});

// ── Rules ────────────────────────────────────────────────────────────────────

describe("rules/*.mdc", () => {
  it("renders every rule head exactly as the adapter renders it for this repository", () => {
    const expected = [...emission.keys()].filter((path) => path.startsWith(".cursor/rules/")).toSorted();
    // Twelve rules in this corpus: a non-degenerate set, and both activation modes appear.
    expect(expected.length).toBeGreaterThan(5);
    expect(treeFiles(join(root, "rules"))).toEqual(expected.map((path) => path.slice(".cursor/rules/".length)));

    for (const path of expected) {
      const rel = `rules/${path.slice(".cursor/rules/".length)}`;
      // Byte-for-byte, not head-only: the root file IS the repository file at another address.
      expect(rootFile(rel), rel).toBe(emission.get(path));
    }
  });

  it("carries description, the unquoted comma glob list and alwaysApply: false, and never claims always-on", () => {
    let withGlobs = 0;
    let withoutGlobs = 0;
    for (const rel of treeFiles(join(root, "rules"))) {
      const text = rootFile(`rules/${rel}`);
      const front = head(text);
      expect(front[0], rel).toMatch(/^description: \S/);
      expect(front, rel).toContain("alwaysApply: false");
      expect(text, rel).not.toContain("alwaysApply: true");

      const globs = front.find((line) => line.startsWith("globs:"));
      if (globs === undefined) {
        // A rule with no globs stays a RULE here: this client's description-pull mode is native,
        // so nothing demotes it to a skill the way the other containers do.
        withoutGlobs += 1;
        expect(text, rel).not.toContain("globs:");
        continue;
      }
      withGlobs += 1;
      // The quirk, byte-for-byte: unquoted, comma-separated, no space after the separator.
      expect(globs, rel).not.toContain('globs: ["');
      expect(globs.slice("globs: ".length), rel).not.toContain(", ");
      expect(globs, rel).toMatch(/^globs: \S/);
    }
    expect(withGlobs, "the corpus must exercise the glob-scoped mode").toBeGreaterThan(0);
    expect(withoutGlobs, "the corpus must exercise the description-pull mode").toBeGreaterThan(0);
  });
});

// ── Hooks ────────────────────────────────────────────────────────────────────

interface HookEntry {
  command: string;
  failClosed?: boolean;
}

describe("hooks/hooks.json", () => {
  const doc = (): { version: number; hooks: Record<string, HookEntry[]> } =>
    JSON.parse(rootFile("hooks/hooks.json")) as { version: number; hooks: Record<string, HookEntry[]> };

  it("declares version 1 and only events the vendor documents", () => {
    const parsed = doc();
    expect(parsed.version).toBe(1);
    const events = Object.keys(parsed.hooks);
    expect(events.length).toBeGreaterThan(1);
    expect(events.filter((event) => !HOOK_EVENTS.events.includes(event))).toEqual([]);
  });

  it("can only ever emit the eight names the adapter owns, and those are documented too", () => {
    // Read from the adapter's own tables rather than restated: a rename upstream must fail here
    // instead of silently shipping a key that parses and never fires.
    const emitted = [...Object.values(EVENT_RENAME), ...Object.values(CURSOR_GUARD_EVENTS)];
    expect(emitted.length).toBe(8);
    expect(new Set(emitted).size).toBe(8);
    for (const event of emitted) expect(HOOK_EVENTS.events, event).toContain(event);
    expect(Object.keys(doc().hooks).filter((event) => !emitted.includes(event))).toEqual([]);
  });

  it("addresses every command through the plugin root's own hooks directory", () => {
    const entries = Object.values(doc().hooks).flat();
    expect(entries.length).toBeGreaterThan(3);
    for (const entry of entries) {
      expect(entry.command).toContain("${CURSOR_PLUGIN_ROOT}");
      expect(entry.command).toContain("/hooks/");
      expect(entry.command).not.toContain(".stamity/generated");
    }
  });

  it("ships both adapter guards and the four core scripts, and keeps the guard rows fail-closed", () => {
    const scripts = treeFiles(join(root, "hooks")).filter((rel) => rel.endsWith(".mjs"));
    expect(scripts.toSorted()).toEqual([
      "mcp-guard.mjs",
      "stamity-config-tamper-notice.mjs",
      "stamity-portable-hook.mjs",
      "stamity-pre-tool-use-guard.mjs",
      "stamity-session-start.mjs",
      "subagent-guard.mjs",
    ]);

    const hooks = doc().hooks;
    for (const [event, script] of [
      [CURSOR_GUARD_EVENTS.subagentSpawn, "subagent-guard.mjs"],
      [CURSOR_GUARD_EVENTS.mcpExecution, "mcp-guard.mjs"],
    ] as const) {
      const rows = hooks[event] ?? [];
      expect(rows.length, event).toBe(1);
      expect(rows[0]?.command, event).toBe(`node "\${CURSOR_PLUGIN_ROOT}/hooks/${script}"`);
      // This client counts no output among the failures `failClosed` blocks on, and a guard that
      // cannot deny is not a guard.
      expect(rows[0]?.failClosed, event).toBe(true);
    }
    expect(() => JSON.parse(rootFile("hooks/agent-tool-policies.json"))).not.toThrow();
  });

  it("is the adapter's own hooks document, re-addressed and nothing else", () => {
    expect(rootFile("hooks/hooks.json")).toBe(emission.get(".cursor/hooks.json"));
  });
});

// ── Skills, commands, agents ─────────────────────────────────────────────────

describe("skills/, agents/ and the command surface", () => {
  it("carries the vendor-neutral skills tree and the command-as-skill tree under one skills/", () => {
    const skills = [...emission.keys()].filter((path) => path.startsWith(".agents/skills/"));
    const commands = [...emission.keys()].filter((path) => path.startsWith(".cursor/skills/"));
    // Nine touchpoint commands, and a skills tree with companion files in it.
    expect(new Set(commands.map((path) => path.split("/")[2])).size).toBe(9);
    expect(skills.length).toBeGreaterThan(9);

    const expected = [
      ...skills.map((path) => `skills/${path.slice(".agents/skills/".length)}`),
      ...commands.map((path) => `skills/${path.slice(".cursor/skills/".length)}`),
      // The one file a root GENERATES rather than carries.
      "skills/st-setup/SKILL.md",
    ].toSorted();
    expect(treeFiles(join(root, "skills"), "skills").toSorted()).toEqual(expected);

    for (const path of [...skills, ...commands]) {
      const rel = `skills/${path.slice(path.indexOf("/skills/") + "/skills/".length)}`;
      expect(rootFile(rel), rel).toBe(emission.get(path));
    }
  });

  it("marks every touchpoint command disable-model-invocation, which is what makes it a command", () => {
    const ids = [...emission.keys()]
      .filter((path) => path.startsWith(".cursor/skills/"))
      .map((path) => path.split("/")[2] ?? "");
    expect(ids).toContain("st-work");
    for (const id of new Set(ids)) {
      const front = head(rootFile(`skills/${id}/SKILL.md`));
      expect(front, id).toContain(`name: ${id}`);
      expect(front, id).toContain("disable-model-invocation: true");
    }
  });

  it("generates st-setup into the skills tree, addressed through this client's own root variable", () => {
    const body = rootFile("skills/st-setup/SKILL.md");
    expect(body).toContain('node "${CURSOR_PLUGIN_ROOT}/runtime/locate.mjs"');
    expect(body).toContain("plugin setup --client cursor -y");
    expect(body).not.toContain("CLAUDE_PLUGIN_ROOT");

    // TEST CHANGE, justified — this REPLACES the known-gap pin that stood here, which asserted
    // `description` alone and recorded the consequence measured on the real CLI (2026-09-20):
    // `st-setup` was listed among the skills the model may invoke on its own judgement while the
    // nine touchpoints were not, and an unbidden `plugin setup` writes files into the operator's
    // repository. The contract that moved is the container's, not this assertion's — the Cursor
    // module now declares `SETUP_COMMAND_FRONTMATTER`, so the generated command carries the same
    // three keys, in the same order, that `buildCursorCommand` renders for the carried nine
    // (src/adapters/cursor.ts). The old assertion no longer states a true fact about this root.
    expect(head(body)).toEqual([
      "name: st-setup",
      'description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."',
      "disable-model-invocation: true",
    ]);
  });

  it("carries the ten roster agents as this client's own agent files", () => {
    const expected = [...emission.keys()].filter((path) => path.startsWith(".cursor/agents/")).toSorted();
    expect(expected.length).toBe(10);
    expect(treeFiles(join(root, "agents"))).toEqual(expected.map((path) => path.slice(".cursor/agents/".length)));
    for (const path of expected) {
      const rel = `agents/${path.slice(".cursor/agents/".length)}`;
      expect(rootFile(rel), rel).toBe(emission.get(path));
    }
  });

  it("drops the MCP document, the charter and the repository state tree", () => {
    const files = treeFiles(root);
    expect(files.filter((rel) => rel.endsWith("mcp.json"))).toEqual([]);
    expect(files.filter((rel) => rel === "AGENTS.md" || rel === "CLAUDE.md")).toEqual([]);
    expect(files.filter((rel) => rel.startsWith(".stamity/"))).toEqual([]);
  });
});

// ── The capability file and the README ───────────────────────────────────────

interface CapabilityFile {
  invocation: Record<string, string>;
  clientFloor: { version: string; citation?: { url: string; accessDate: string }; reason?: string };
  classes: Record<string, { status: string; count?: number; reason?: string }>;
  distribution?: { note: string };
}

describe("stamity-plugin.json", () => {
  const capability = (): CapabilityFile => JSON.parse(rootFile("stamity-plugin.json")) as CapabilityFile;

  it("declares the /<id> form for all three classes and cites the pages it was read from", () => {
    const { invocation } = capability();
    expect(invocation["agents"]).toBe("/<id>");
    expect(invocation["commands"]).toBe("/<id>");
    expect(invocation["skills"]).toBe("/<id>");
    // The plugins reference states no invocation form; these two pages do.
    expect(invocation["citation"]).toContain("cursor.com/docs/agent/subagents");
    expect(invocation["citation"]).toContain("cursor.com/docs/skills");
    expect(invocation["citation"]).toContain("2026-09-20");
  });

  it("declares the version floor unknown, with the pages that state none", () => {
    const { clientFloor } = capability();
    expect(clientFloor.version).toBe("unknown");
    expect(clientFloor.citation?.url).toBe(MANIFEST_FIELDS.source.url);
    expect(clientFloor.citation?.accessDate).toBe(MANIFEST_FIELDS.source.accessDate);
    for (const page of ["cursor.com/docs/reference/plugins", "cursor.com/docs/plugins", "CLI reference"]) {
      expect(clientFloor.reason, page).toContain(page);
    }
  });

  it("carries five classes and declares mcp repository-owned, with the command placement stated", () => {
    const { classes } = capability();
    for (const name of ["agent", "skill", "command", "rule", "hooks"]) {
      expect(classes[name]?.status, name).toBe("carried");
      expect(classes[name]?.count, name).toBeGreaterThan(0);
    }
    expect(classes["mcp"]?.status).toBe("repository-owned");
    expect(classes["mcp"]?.reason).toBeTruthy();
    // A carried class whose home is not its name needs its placement on the record.
    expect(classes["command"]?.reason).toContain("skills/");
    expect(classes["command"]?.reason).toContain("disable-model-invocation");
    // Ten commands and eight skills share `skills/`, so only the sum is provable from the tree.
    const skillDirs = new Set(treeFiles(join(root, "skills")).map((rel) => rel.split("/")[0]));
    expect((classes["skill"]?.count ?? 0) + (classes["command"]?.count ?? 0)).toBe(skillDirs.size);
    expect(classes["command"]?.count).toBe(10);
  });

  it("records the team-marketplace route, including the re-index window an operator plans around", () => {
    const note = capability().distribution?.note ?? "";
    for (const phrase of [
      "Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace",
      "Default Off",
      "Marketplace Settings → Marketplace Access",
      "at most once every 10 minutes, batching rapid pushes to the latest commit",
      "cursor.com/docs/plugins, accessed 2026-09-20",
    ]) {
      expect(note, phrase).toContain(phrase);
    }
  });
});

describe("README.md", () => {
  it("names the dashboard route, the one-developer route, and the absence of a CLI pin command", () => {
    const readme = rootFile("README.md");
    expect(readme).toContain("Team Marketplaces → Add Marketplace");
    // One developer needs no marketplace at all.
    expect(readme).toContain("agent --plugin-dir ./cursor");
    expect(readme).toContain("~/.cursor/plugins/local");
    // And there is no command to pin, update or roll back with, so the page says so rather than
    // promising one: a local copy changes by being reinstalled.
    expect(readme).toMatch(/no plugin `install`, `update`, `rollback` or `uninstall`\s+subcommand/);
    expect(readme).toContain("REINSTALLING");
    expect(readme).toContain("/st-setup");
  });
});

// ── Refusals and the fork layer ──────────────────────────────────────────────

describe("the brand asset and the fork layer", () => {
  it(
    "refuses the build when the logo the manifest declares is not in the checkout",
    () => {
      const checkout = forkCheckout("no-logo");
      rmSync(join(checkout, "assets", "logo.svg"));
      const out = tempDir("no-logo-out");
      const temps = isolatedTemp("no-logo-temps");

      const result = buildCursorRoot(out, checkout, temps.env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("assets/logo.svg");
      // The message shape the manifest generator uses: the consequence, not just the absence.
      expect(result.stderr).toContain("raw content URL");
      expect(result.stderr).toContain("404");
      // Nothing rendered, so nothing was written: the refusal is before the first byte.
      expect(treeFiles(out)).toEqual([]);
      // And nothing was left open either. This refusal fires inside `renderRoots`, where the
      // staged corpus and the plan root are live and the `finally` below owns their disposal —
      // a `process.exit(1)` raised there would skip it and leak both per refused build.
      expect(readdirSync(temps.dir)).toEqual([]);
    },
    ONE_ROOT_MS,
  );

  it(
    "lets a fork .customize.yaml patch change the rule head the client activates on",
    () => {
      const checkout = forkCheckout("fork");
      // The fixture's own corpus rule declares `description: Fixture rule`; its fork patch
      // declares `description: Patched rule`. The head is what this client activates on, so a
      // patch that cannot reach it cannot change how the rule behaves.
      expect(readFileSync(join(checkout, "content/rules/stamity-patch-rule.md"), "utf8")).toContain(
        "description: Fixture rule",
      );
      const out = tempDir("fork-out");
      const result = buildCursorRoot(out, checkout);
      expect(result.status, result.stderr).toBe(0);

      const patched = readFileSync(join(out, CLIENT, "rules", "stamity-patch-rule.mdc"), "utf8");
      expect(head(patched)).toEqual([
        "description: Patched rule",
        "globs: **/*.md",
        "alwaysApply: false",
      ]);
      expect(patched).toContain("Patch witness rule.");
      // And the untouched sibling keeps the corpus description, so the patch moved one rule.
      expect(head(readFileSync(join(out, CLIENT, "rules", "stamity-source-rule.mdc"), "utf8"))[0]).toBe(
        "description: Fixture rule",
      );
    },
    ONE_ROOT_MS,
  );
});

// ── The real client ──────────────────────────────────────────────────────────

/**
 * Opt-in: the Cursor CLI is not a dependency of anything here, so the suite stays green on a
 * machine that has never installed it. Arm it by putting the binary on `STAMITY_CURSOR_BIN`.
 *
 * Three deviations from a naive invocation, each measured on 2026.09.15-d2fe57e (2026-09-20):
 *
 *   - `--trust` is required. Without it the CLI exits 1 with "Workspace Trust Required" and
 *     never reaches the model, so the leg would measure the prompt and not the root.
 *   - the run happens in a SCRATCH directory. This checkout's own `.cursor/` and `.agents/`
 *     trees would be discovered alongside the plugin's, and a bare id in the output would then
 *     prove nothing about the root under test.
 *   - the prompt asks for every skill the plugin provides, INCLUDING the ones marked
 *     `disable-model-invocation`. "List the skills you can invoke" measurably returns the eight
 *     corpus skills plus `st-setup` and none of the nine touchpoints — which is the command
 *     surface working as designed, and would make `st-work` a false negative.
 *
 * The budget is derived: one measured run took 39s end to end, and 240s is ~6x that, the
 * headroom a network round trip on a loaded worker needs.
 */
const CURSOR_BIN = process.env["STAMITY_CURSOR_BIN"];
const CURSOR_LEG_MS = 240_000;

describe.skipIf(CURSOR_BIN === undefined)("the real client, against the binary on STAMITY_CURSOR_BIN", () => {
  it(
    "loads the root from --plugin-dir and reports the touchpoints it carries",
    () => {
      const scratch = tempDir("cursor-scratch");
      const result = spawnSync(
        CURSOR_BIN as string,
        [
          "--trust",
          "--plugin-dir",
          root,
          "-p",
          "List every skill this plugin provides, including ones marked disable-model-invocation. Print only the skill ids, one per line.",
          "--output-format",
          "text",
        ],
        { cwd: scratch, encoding: "utf8", timeout: CURSOR_LEG_MS - 20_000, maxBuffer: 16 * 1024 * 1024 },
      );
      expect(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBe(0);
      expect(result.stdout).toContain("st-work");
    },
    CURSOR_LEG_MS,
  );
});
