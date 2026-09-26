// Every loop here walks one generated tree in a fixed order, and the binary leg's spawns are
// deliberately sequential — `plugin add` must observe the marketplace `marketplace add` wrote.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { resolveSelection } from "../../src/content/selection.ts";
import { composeEmissionPlanner } from "../../src/emit/planner.ts";
import { SKILLS_PROJECTION_DIR } from "../../src/emit/skillsProjection.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../src/types/manifest.ts";
// @ts-expect-error — the emitter modules ship as plain .mjs with no type declarations: the
// generator that builds the plugin roots runs them under bare Node, with no TypeScript nearby.
import { validateCapabilityFile } from "../../scripts/plugins/capability.mjs";
// @ts-expect-error — see above.
import { resolveDistributionIdentity } from "../../scripts/distribution-identity.mjs";
import { repositoryRoute } from "../support/identity.ts";

/**
 * The CODEX plugin root: `scripts/plugins/clients/codex.mjs` as the generator renders it
 * (REQ-PLUGIN-001, -002, -005). `test/ci/pluginPackages.test.ts` owns what all four roots share;
 * this suite owns what only this container promises, and it is the narrowest of the four — skills
 * and hooks, nothing else.
 *
 * ── The container spike, read 2026-09-20 ───────────────────────────────────────────────────
 *
 * https://developers.openai.com/plugins/build/plugins, https://learn.chatgpt.com/docs/plugins,
 * https://learn.chatgpt.com/docs/hooks, https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
 * and the installed `codex --help` / `codex plugin --help` on codex-cli 0.154.0.
 *
 *   - The root manifest is the CLOSED Agent Plugins 1.0.0 schema — ten keys, `additionalProperties:
 *     false`, only `$schema` and `name` required, `author` closed to name/email/url, and `$schema`
 *     pinned by `const`. Clients never fetch it, so the fixture below is the only enforcement there
 *     is. Vendored at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json` — P5 vendors the same
 *     URL for the Copilot root, byte for byte, so one copy serves both.
 *   - `extensions.com.openai` carries `apps`, `hooks` and `interface`, but `hooks/hooks.json` is
 *     DISCOVERED by default with no manifest field. The two vendor pages disagree about where an
 *     override lives; discovery satisfies both, so the root ships the file at the default and emits
 *     no `extensions` key at all.
 *   - Twelve lifecycle event names, vendored at `test/fixtures/plugins/codex-hook-events.json`.
 *     `command` and `mcp_tool` handlers run; `prompt` and `agent` are skipped.
 *   - A plugin's hooks are SKIPPED until the operator trusts them, and hook commands run with the
 *     SESSION working directory. `PLUGIN_ROOT` (plus `PLUGIN_DATA`, and the `CLAUDE_*` pair for
 *     compatibility) is exported to the hook process; whether the client expands it inside a
 *     `command` string is not stated, and the vendor's own example writes it there.
 *   - A plugin carries SKILLS ONLY — agents, commands and rules are outside the v1 format, and the
 *     migration page converts them to skills. Invocation is `$<id>`; a new skill needs a fresh
 *     session; the IDE extension reads no plugins.
 *   - Marketplaces resolve from `$REPO_ROOT/.agents/plugins/marketplace.json`, the legacy
 *     `.claude-plugin/marketplace.json`, and `~/.agents/plugins/marketplace.json`. An entry's
 *     `source.path` must start with `./` and stay inside the marketplace root; every entry carries
 *     `policy.installation`, `policy.authentication` and `category`; no entry `version` is
 *     documented, and an unresolvable entry is skipped SILENTLY — which is why the binary leg below
 *     asserts the install rather than trusting the file to be read.
 *   - No minimum version on any of the eight pages, so `clientFloor` stays `unknown` with the
 *     citation, and the re-check trigger is the next codex minor.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A 40-hex commit and its date, pinned so the render never reads the clock. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";

/** One root is a content index plus a planner pass plus a tree write: ~2s, budgeted 15x. */
const ONE_ROOT_MS = 30_000;

/** The root variable this client expands, and the directory every root keeps its hooks in. */
const ROOT_VARIABLE = "PLUGIN_ROOT";

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-codex-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * A `--runtime` input the generator accepts: the two files it refuses a directory for lacking.
 * Justified stub — the real bundled runtime is built from a packed tarball and proven by its own
 * suite (`test/ci/pluginRuntime.test.ts`); rebuilding it here would add an `npm pack` to every run
 * to re-prove a contract that already has an owner. Nothing below asserts on `runtime/`.
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

/** Path -> sha256 of its bytes. */
function treeDigest(dir: string): Record<string, string> {
  const digest: Record<string, string> = {};
  for (const rel of treeFiles(dir)) {
    digest[rel] = createHash("sha256").update(readFileSync(join(dir, rel))).digest("hex");
  }
  return digest;
}

let root: string;
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");
const readJson = <T,>(rel: string): T => JSON.parse(read(rel)) as T;

beforeAll(() => {
  const out = tempDir("roots");
  const result = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, "scripts", "generate-plugin-packages.mjs"),
      "--out-dir",
      out,
      "--runtime",
      stubRuntime(),
      "--client",
      "codex",
      "--source-commit",
      FIXED_COMMIT,
      "--source-commit-date",
      FIXED_COMMIT_DATE,
    ],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  expect(result.status, result.stderr).toBe(0);
  root = join(out, "codex");
}, ONE_ROOT_MS);

// ── 1. The container manifest ────────────────────────────────────────────────────────────────

/**
 * The vendored Agent Plugins 1.0.0 schema, applied INLINE rather than through a JSON Schema
 * validator.
 *
 * The four rules below are the whole of what this schema says about a manifest this repository
 * writes, and each is read out of the fixture at run time — so a schema revision that widens the
 * key set, loosens the name pattern or moves the `$schema` const changes what these cases demand.
 * A validator dependency would buy the same four checks plus a transitive package on the critical
 * path of a release gate; the fixture is the enforcement either way, because the client never
 * fetches the schema and no vendor check exists between this suite and a published root.
 */
interface AgentPluginsSchema {
  $id: string;
  required: string[];
  additionalProperties: boolean;
  properties: {
    $schema: { const: string };
    name: { pattern: string; minLength: number; maxLength: number };
    author: { properties: Record<string, unknown>; additionalProperties: boolean };
  } & Record<string, unknown>;
}

const SCHEMA = JSON.parse(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "plugins", "agent-plugins-1.0.0.schema.json"), "utf8"),
) as AgentPluginsSchema;

describe("the root plugin.json against the vendored Agent Plugins 1.0.0 schema", () => {
  it("vendors the schema at the identifier the manifest opts into", () => {
    // The `$id` and the `$schema` const are the same URL; a fixture fetched from somewhere else
    // would validate the manifest against a document the client's ecosystem does not recognise.
    expect(SCHEMA.$id).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(SCHEMA.properties.$schema.const).toBe(SCHEMA.$id);
    expect(SCHEMA.additionalProperties).toBe(false);
    expect(SCHEMA.required.toSorted()).toEqual(["$schema", "name"]);
  });

  it("carries the required keys, the pinned $schema, and nothing the closed schema forbids", () => {
    const manifest = readJson<Record<string, unknown>>("plugin.json");

    for (const key of SCHEMA.required) {
      expect(Object.hasOwn(manifest, key), `plugin.json omits the required \`${key}\``).toBe(true);
    }
    expect(manifest["$schema"]).toBe(SCHEMA.properties.$schema.const);

    // `additionalProperties: false` as a key-set check: every key present must be one the schema
    // declares. Non-degenerate by construction — the manifest carries nine of the ten.
    const declared = Object.keys(SCHEMA.properties);
    expect(Object.keys(manifest).length).toBeGreaterThan(5);
    expect(Object.keys(manifest).filter((key) => !declared.includes(key))).toEqual([]);
  });

  it("names the plugin in the pattern the schema allows", () => {
    const name = readJson<Record<string, unknown>>("plugin.json")["name"];
    expect(typeof name).toBe("string");
    expect(name as string).toMatch(new RegExp(SCHEMA.properties.name.pattern, "u"));
    expect((name as string).length).toBeGreaterThanOrEqual(SCHEMA.properties.name.minLength);
    expect((name as string).length).toBeLessThanOrEqual(SCHEMA.properties.name.maxLength);
  });

  it("keeps the author object inside the three keys the schema closes it to", () => {
    const author = readJson<Record<string, Record<string, unknown>>>("plugin.json")["author"];
    expect(SCHEMA.properties.author.additionalProperties).toBe(false);
    const allowed = Object.keys(SCHEMA.properties.author.properties);
    expect(allowed.toSorted()).toEqual(["email", "name", "url"]);
    expect(Object.keys(author ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(author ?? {}).filter((key) => !allowed.includes(key))).toEqual([]);
  });

  it("emits no extensions key, because hooks are discovered at the default path", () => {
    // The spike's one deliberate omission. `extensions` IS a schema key, so this is not a
    // validity claim — it is the ruling that a pointer whose spelling two vendor pages disagree
    // about is worse than the discovery both of them honour.
    expect(Object.hasOwn(readJson<Record<string, unknown>>("plugin.json"), "extensions")).toBe(false);
    expect(existsSync(join(root, "hooks", "hooks.json"))).toBe(true);
  });
});

// ── 2. What the container carries, and what it must not ──────────────────────────────────────

/**
 * The codex native skills projection, derived from the ENGINE rather than listed by hand.
 *
 * A plan over the real corpus with codex alone selected, reading the rows the engine writes under
 * `.agents/skills/` — the same projection an `init` of this repository would produce for this
 * client. The generator reaches the same set by a different road (a substituted temp corpus, then
 * the layout table's `.agents/skills/` → `skills/` rule), so the two agreeing is a real check and
 * not a table compared with itself.
 */
async function codexNativeSkillDirs(): Promise<string[]> {
  const contentRoot = { root: join(REPO_ROOT, "content"), forkRoot: join(REPO_ROOT, "fork") };
  const index = await buildContentIndex(contentRoot);
  const manifest: SetupManifest = {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0-test",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    tools: ["codex"],
    ruleDelivery: "on-demand",
    selection: resolveSelection(index, {}),
    ledger: [],
  };
  const plan = await composeEmissionPlanner({ codex: ADAPTER_REGISTRY.codex }).planWithWarnings({
    rootDir: tempDir("native-plan"),
    manifest,
    engineVersion: "0.0.0-test",
    facts: { monorepoPackages: [] },
    contentRoot,
  });
  const prefix = `${SKILLS_PROJECTION_DIR}/`;
  return [
    ...new Set(
      plan.outputs
        .filter((row) => row.path.startsWith(prefix))
        .map((row) => row.path.slice(prefix.length).split("/")[0] ?? ""),
    ),
  ].toSorted();
}

describe("what the codex root carries", () => {
  it(
    "places skills/ exactly where the engine's own codex projection lands, and nowhere else",
    async () => {
      const expected = await codexNativeSkillDirs();
      const carried = [...new Set(treeFiles(join(root, "skills")).map((rel) => rel.split("/")[0] ?? ""))].toSorted();

      expect(carried).toEqual(expected);

      // The count, pinned with its derivation so a corpus change moves it deliberately: the eight
      // skill directories under `content/skills/`, plus the nine rules this client demotes to
      // skills because it has no description-triggered rule surface (twelve rules in the corpus,
      // three of them glob-scoped and inlined into the charter appendix instead).
      const corpusSkills = readdirSync(join(REPO_ROOT, "content", "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      expect(corpusSkills.length).toBe(8);
      expect(carried.length).toBe(17);
      expect(carried.length - corpusSkills.length).toBe(9);
      for (const id of corpusSkills) expect(carried, `skills/${id}`).toContain(id);
      expect(existsSync(join(root, "skills", corpusSkills[0] ?? "", "SKILL.md"))).toBe(true);
    },
    ONE_ROOT_MS,
  );

  it("carries no class the Agent Plugins container has no home for", () => {
    const files = treeFiles(root).filter((rel) => !rel.startsWith("runtime/"));
    expect(files.length).toBeGreaterThan(20);
    for (const forbidden of ["agents/", "commands/", "rules/", ".codex/"]) {
      expect(files.filter((rel) => rel.startsWith(forbidden)), forbidden).toEqual([]);
    }
    for (const forbidden of ["AGENTS.md", "config.toml"]) {
      expect(files.filter((rel) => rel === forbidden || rel.endsWith(`/${forbidden}`)), forbidden).toEqual([]);
    }
    // And the top level is only what the container declares.
    expect(readdirSync(root).toSorted()).toEqual(["README.md", "hooks", "plugin.json", "runtime", "skills", "stamity-plugin.json"]);
  });

  it("keeps the hook scripts and the policy document under hooks/, beside the configuration", () => {
    const hooks = treeFiles(join(root, "hooks")).toSorted();
    expect(hooks).toContain("hooks.json");
    expect(hooks).toContain("agent-tool-policies.json");
    expect(hooks.filter((rel) => rel.endsWith(".mjs")).length).toBeGreaterThan(2);
    expect(() => JSON.parse(read("hooks/agent-tool-policies.json"))).not.toThrow();
  });
});

// ── 3. hooks/hooks.json ──────────────────────────────────────────────────────────────────────

interface HookEntry {
  type: string;
  command: string;
  commandWindows: string;
  timeout?: number;
}
interface HooksDocument {
  description: string;
  hooks: Record<string, { matcher?: string; hooks: HookEntry[] }[]>;
}

const VENDOR_EVENTS = JSON.parse(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "plugins", "codex-hook-events.json"), "utf8"),
) as { source: string; accessDate: string; events: string[] };

describe("the hook document the client discovers by default", () => {
  it("parses, and names only events the vendor documents", () => {
    const document = readJson<HooksDocument>("hooks/hooks.json");
    const events = Object.keys(document.hooks);

    expect(VENDOR_EVENTS.events.length, "the vendored list is the client's twelve").toBe(12);
    expect(VENDOR_EVENTS.accessDate).toBe("2026-09-20");
    expect(VENDOR_EVENTS.source).toMatch(/^https:\/\//);

    // Non-degenerate: the root emits real events, and every one of them is a member.
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((event) => !VENDOR_EVENTS.events.includes(event))).toEqual([]);
  });

  it("launches every command from the plugin root, on both command fields, with no cwd-walking starter", () => {
    const document = readJson<HooksDocument>("hooks/hooks.json");
    const entries = Object.values(document.hooks)
      .flat()
      .flatMap((group) => group.hooks);

    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      expect(entry.type).toBe("command");
      expect(entry.command, entry.command).toContain(`\${${ROOT_VARIABLE}}`);
      expect(entry.command, entry.command).toContain("/hooks/");
      expect(entry.command, entry.command).not.toContain(".stamity/generated");
      // The `-e` starter exists to walk up to the directory holding a trusted `.codex/hooks.json`;
      // a root variable the client expands has already answered that question.
      expect(entry.command, entry.command).not.toContain("node -e");
      // Two fields, one string: double quotes read the same on cmd and PowerShell, so a Windows
      // divergence here would be a second command nobody reviewed.
      expect(entry.commandWindows, entry.command).toBe(entry.command);
    }
  });

  it("tells the operator the trust boundary without pointing at a repository path", () => {
    // The reason this unit touched the adapter: the sentence names the directory the scripts
    // ACTUALLY live in, and inside an installed root that is the plugin's own `hooks/`, not a
    // `.stamity/generated/` path belonging to a checkout the reader may not have.
    const { description } = readJson<HooksDocument>("hooks/hooks.json");
    expect(description).toContain("Trust is recorded against this file's hash only");
    expect(description).toContain(`\${${ROOT_VARIABLE}}/hooks/`);
    expect(description).not.toContain(".stamity/generated");
    expect(description).not.toContain("\n");
  });
});

// ── 4. stamity-plugin.json ───────────────────────────────────────────────────────────────────

interface CapabilityClass {
  status: string;
  count?: number;
  reason?: string;
}
interface CapabilityFile {
  client: string;
  invocation: Record<string, string>;
  clientFloor: { version: string; citation?: { url: string; accessDate: string }; reason?: string };
  classes: Record<string, CapabilityClass>;
}

describe("the capability file this root declares itself by", () => {
  it("declares the invocation form and a floor that says why it is unknown", () => {
    const capability = readJson<CapabilityFile>("stamity-plugin.json");
    expect(validateCapabilityFile(capability)).toEqual([]);
    expect(capability.client).toBe("codex");
    expect(capability.invocation).toEqual({ skills: "$<id>" });

    expect(capability.clientFloor.version).toBe("unknown");
    expect(capability.clientFloor.reason, "the floor states no reason").toMatch(/eight vendor pages/);
    expect(capability.clientFloor.citation?.url).toMatch(/^https:\/\//);
    expect(capability.clientFloor.citation?.accessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries skills and hooks, and says hooks carried is not hooks enforced", () => {
    const { classes } = readJson<CapabilityFile>("stamity-plugin.json");

    expect(classes["skill"]?.status).toBe("carried");
    expect(classes["skill"]?.count).toBe(17);
    expect(classes["hooks"]?.status).toBe("carried");
    expect(classes["hooks"]?.count ?? 0).toBeGreaterThan(0);

    // Both halves of the caveat, because either alone is the half-answer: the operator trust gate
    // the vendor documents, and the headless run that enforced nothing.
    const reason = classes["hooks"]?.reason ?? "";
    expect(reason, "hooks: carried states no trust gate").toMatch(/trust/i);
    expect(reason, "hooks: carried states no headless measurement").toContain("codex exec");
    expect(reason).toContain("0.154.0");
  });

  it("hands the four classes the container cannot hold back to the repository, each with its reason", () => {
    const { classes } = readJson<CapabilityFile>("stamity-plugin.json");
    for (const name of ["agent", "command", "rule", "mcp"]) {
      expect(classes[name]?.status, name).toBe("repository-owned");
      expect((classes[name]?.reason ?? "").length, name).toBeGreaterThan(20);
      expect(classes[name]?.count, name).toBeUndefined();
    }
    expect(classes["agent"]?.reason).toContain(".codex/agents/");
    expect(classes["command"]?.reason).toContain("no project-scoped command directory");
    expect(classes["rule"]?.reason).toMatch(/skills/);
  });
});

// ── 5. README ────────────────────────────────────────────────────────────────────────────────

describe("the page an operator reads before installing", () => {
  it("names the whole lifecycle, the setup line, and the surface that reads none of it", () => {
    const readme = read("README.md");
    for (const line of [
      "codex plugin marketplace add",
      "codex plugin add stamity@stamity",
      "codex plugin marketplace upgrade",
      // `marketplace remove` is listed by `codex plugin marketplace --help` on 0.155.1 (read
      // 2026-09-22) and comes before the re-add at the previous tag, because a git marketplace
      // already on record is not re-pointed in place: the re-add was refused with "already added
      // from a different source" (E3 walk C7g, 2026-09-24) — the page says so beside it.
      "codex plugin marketplace remove stamity",
      "codex plugin remove",
      "/plugins",
      // TEST CHANGE, justified. This pinned `node "$PLUGIN_ROOT/runtime/locate.mjs" -- ...` as
      // the setup line an operator types. `$PLUGIN_ROOT` is exported to HOOK processes and to
      // nothing else, so in the operator's own shell it expands to nothing and the command ran
      // as `node "/runtime/locate.mjs"`. The README now gives a placeholder the operator
      // substitutes and names the installed cache path to substitute from; what moved is the
      // page's advice, not this case's standard.
      // MOVED 2026-09-22 (prove/259, belt and braces beside the locator's own --plugin-root):
      // the line hands the CLI the root explicitly as well.
      'node "<plugin root>/runtime/locate.mjs" -- plugin setup --client codex -y --plugin-root "<plugin root>"',
      "<CODEX_HOME>/plugins/cache/stamity/stamity/",
    ]) {
      expect(readme, `README.md does not name \`${line}\``).toContain(line);
    }
    // And it says why the variable is not the answer, rather than leaving the reader to find out.
    expect(readme).toContain("exported to hook processes and to nothing else");
    expect(readme, "a bare $PLUGIN_ROOT is still offered as a shell path").not.toContain('node "$PLUGIN_ROOT/');
    // No command class, so no generated `st-setup` — the manual line above IS the setup route.
    expect(treeFiles(root).filter((rel) => rel.includes("st-setup"))).toEqual([]);
    // The two rules an operator loses a morning to otherwise.
    expect(readme, "the fresh-session rule is missing").toMatch(/FRESH session/);
    expect(readme, "the IDE-extension absence is missing").toMatch(/IDE extension reads no plugins/);
  });
});

/**
 * The root README's routes against the distribution README's, for ONE identity (REQ-PLUGIN-020).
 *
 * Why every `marketplace add` here carries `--ref`: the E3 walk (the section "The Codex half (E3),
 * 2026-09-24" of `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`, rows E3-C8a..h)
 * ran the bare `codex plugin marketplace add <owner>/<repo>` on codex-cli 0.155.1. The default
 * branch carries no Codex catalog, so the client fell back to that branch's Claude catalog and
 * `plugin add` cached the PUBLIC npm package — no `runtime/`, no `hooks/`, no locator. A private
 * fork following the bare line gets the public package without a word. `--ref plugin-dist` was
 * measured installing the distribution root (E3-C8h).
 *
 * Derived, not spelled: this case moved here from `test/ci/pluginDistribution.test.ts`, where the
 * distribution README's lines were pinned to the literals `--ref plugin-dist` and
 * `--ref plugins/v1.9.0` (inbox row 100). Both READMEs now come out of ONE build, the lines are
 * extracted from each and compared, and the branch and the tag are read from the identity
 * `scripts/distribution-identity.mjs` resolves from this checkout's `package.json`.
 */
function stubDistributionRuntime(): string {
  // Justified stub, as {@link stubRuntime}: the distribution builder additionally requires
  // `RUNTIME.json`, and nothing below reads the runtime — only the two READMEs.
  const dir = stubRuntime();
  writeFileSync(
    join(dir, "RUNTIME.json"),
    `${JSON.stringify(
      {
        package: "@zomarit/stamity",
        version: "1.8.0",
        nodeFloor: ">=22.22.2",
        tarballSha256: "a".repeat(64),
        dependencies: [],
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

/** The body of the first ```sh block after `heading` — the block an operator copies. */
function shellBlockAfter(text: string, heading: string): string[] {
  const start = text.indexOf(heading);
  expect(start, `no \`${heading}\` heading`).toBeGreaterThanOrEqual(0);
  const body = /```sh\n([\s\S]*?)\n```/.exec(text.slice(start))?.[1];
  expect(body, `no sh block after \`${heading}\``).toBeDefined();
  return (body ?? "").split("\n");
}

/** Every `codex plugin marketplace add` line, in page order. */
function marketplaceAdds(text: string): string[] {
  return text.split("\n").filter((line) => line.startsWith("codex plugin marketplace add "));
}

describe("the root README's routes against the distribution README's, for one identity", () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  const { distribution } = resolveDistributionIdentity(pkg) as { distribution: { branch: string; tagPattern: string } };
  const slug = repositoryRoute().slug;

  let rootReadme: string;
  let codexSection: string;
  let tag: string;

  beforeAll(() => {
    const out = join(tempDir("distribution"), "dist");
    const result = spawnSync(
      process.execPath,
      [
        join(REPO_ROOT, "scripts", "build-plugin-distribution.mjs"),
        "--out",
        out,
        "--runtime",
        stubDistributionRuntime(),
        "--client",
        "codex",
        "--source-commit",
        FIXED_COMMIT,
        "--source-commit-date",
        FIXED_COMMIT_DATE,
      ],
      { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    rootReadme = readFileSync(join(out, "codex", "README.md"), "utf8");
    const distReadme = readFileSync(join(out, "README.md"), "utf8");
    codexSection = distReadme.split(/^## /m).find((part) => part.includes("Root: `codex/`")) ?? "";
    expect(codexSection, "the distribution README has no Codex section").not.toBe("");
    const release = JSON.parse(readFileSync(join(out, "release.json"), "utf8")) as { version: string };
    tag = distribution.tagPattern.replaceAll("<version>", release.version);
  }, 2 * ONE_ROOT_MS);

  it("prints the install block the distribution README prints, at the identity's distribution branch", () => {
    const install = shellBlockAfter(rootReadme, "## Install");
    expect(install).toEqual(shellBlockAfter(codexSection, "### Install"));
    expect(install).toEqual([
      `codex plugin marketplace add ${slug} --ref ${distribution.branch}`,
      "codex plugin add stamity@stamity",
    ]);
  });

  it("names the same marketplace add lines for the install, the pin and the route back", () => {
    const rootAdds = marketplaceAdds(rootReadme);
    // Non-degenerate: three routes, each a `marketplace add`, and the distribution README's
    // Install, Pin and Roll back blocks name the same three in the same order.
    expect(rootAdds).toEqual([
      `codex plugin marketplace add ${slug} --ref ${distribution.branch}`,
      `codex plugin marketplace add ${slug} --ref ${tag}`,
      `codex plugin marketplace add ${slug} --ref ${distribution.tagPattern.replaceAll("<version>", "<previous>")}`,
    ]);
    expect(rootAdds).toEqual(marketplaceAdds(codexSection));
    expect(shellBlockAfter(rootReadme, "Roll back by")).toEqual(shellBlockAfter(codexSection, "### Roll back"));
  });

  it("offers no marketplace add without a --ref, the form that installs an npm package instead of this root", () => {
    // build/18 (Warning, security): the bare form reads the default branch's Claude catalog.
    const bare = rootReadme.split("\n").filter((line) => /^codex plugin marketplace add \S+\s*$/.test(line));
    expect(bare).toEqual([]);
    expect(rootReadme, "the README does not say why the --ref is needed").toMatch(/Claude catalog and installs the npm\s+package/);
  });
});

// ── 6. The real client ───────────────────────────────────────────────────────────────────────

/**
 * Opt-in: nothing in this repository depends on codex, so the suite must stay green on a machine
 * that has never installed it. NOTHING ARMS IT AUTOMATICALLY — no workflow in `.github/` sets
 * `STAMITY_CODEX_BIN`, so this leg runs when a human exports it and is skipped everywhere else,
 * CI included. Treat its findings as dated measurements rather than as a standing gate.
 *
 * What the leg proves is the INSTALL, not the behaviour. `codex plugin marketplace add` +
 * `codex plugin add` into a scratch `CODEX_HOME` (the config-directory variable, confirmed on
 * `codex --help` at 0.154.0), then the cache tree under
 * `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version>/` compared file by file with the
 * root that was installed. That comparison is the point: a marketplace entry the client cannot
 * resolve is skipped SILENTLY, so "the file was written" proves nothing and only the installed
 * tree does.
 *
 * What the leg does NOT assert, deliberately: hooks (a plugin's are skipped until the operator
 * trusts them, and the 2026-09-15 measurement recorded zero project hooks on a headless run), and
 * whether `codex exec` loads plugin skills — unproven, so the exec output is PRINTED as a
 * measurement and never asserted on. A step that needs a login prints its refusal and the leg
 * stays green; a credential is never the difference between a red suite and a green one.
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

describe.skipIf(process.env["STAMITY_CODEX_BIN"] === undefined)("the real client, against the binary on STAMITY_CODEX_BIN", () => {
  const bin = process.env["STAMITY_CODEX_BIN"] ?? "";
  const MARKETPLACE = "stamity-test";

  /** The vendor's own marketplace example, with this root swapped in: developers.openai.com/plugins/build/plugins (2026-09-20). */
  function marketplaceDocument(): string {
    return `${JSON.stringify(
      {
        name: MARKETPLACE,
        interface: { displayName: "stamity test" },
        plugins: [
          {
            name: "stamity",
            // `./`-prefixed and inside the marketplace root, the two rules the build page states.
            source: { source: "local", path: "./codex" },
            // The values the vendor's own example uses, verbatim.
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    )}\n`;
  }

  function codex(home: string, cwd: string, args: string[]): SpawnSyncReturns<string> {
    return spawnSync(bin, args, {
      cwd,
      encoding: "utf8",
      // `HOME` and `XDG_CONFIG_HOME` join `CODEX_HOME` in the scratch set: the client reads a
      // credential file out of the first two even when the third points elsewhere.
      env: allowlistedEnv({ HOME: home, CODEX_HOME: home, XDG_CONFIG_HOME: join(home, ".config") }),
      maxBuffer: 32 * 1024 * 1024,
      timeout: 300_000,
    });
  }

  it(
    "installs this root through a marketplace and caches it byte for byte",
    () => {
      const home = tempDir("codex-home");
      const marketplaceRoot = tempDir("marketplace");
      mkdirSync(join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
      writeFileSync(join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), marketplaceDocument());
      cpSync(root, join(marketplaceRoot, "codex"), { recursive: true });

      const added = codex(home, marketplaceRoot, ["plugin", "marketplace", "add", marketplaceRoot]);
      expect(added.status, `${added.stdout}\n${added.stderr}`).toBe(0);

      const installed = codex(home, marketplaceRoot, ["plugin", "add", `stamity@${MARKETPLACE}`]);
      expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);

      const listed = codex(home, marketplaceRoot, ["plugin", "list", "--json"]);
      expect(listed.status, `${listed.stdout}\n${listed.stderr}`).toBe(0);
      const roster = JSON.parse(listed.stdout) as { installed: { name: string; version: string }[] };
      const entry = roster.installed.find((plugin) => plugin.name === "stamity");
      expect(entry, `plugin list --json did not name stamity: ${listed.stdout}`).toBeDefined();

      // Find the version directory rather than assuming it — the cache path carries the plugin's
      // own version, which moves with `package.json` on every release.
      const cacheBase = join(home, "plugins", "cache", MARKETPLACE, "stamity");
      const versions = readdirSync(cacheBase, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      expect(versions, `no cached version under ${cacheBase}`).toHaveLength(1);
      const cached = join(cacheBase, versions[0] ?? "");

      // File by file, over the carried classes: the manifest, the capability file, the README,
      // every skill and every hook artifact. A count alone would pass on a truncated copy.
      const carried = treeDigest(root);
      expect(Object.keys(carried).length).toBeGreaterThan(20);
      expect(treeDigest(cached)).toEqual(carried);
    },
    300_000,
  );

  // A MEASUREMENT, not a case. This used to be an `it` ending in `expect(true).toBe(true)` —
  // a case that cannot fail is not a case, and a suite that counts it reports a check it never
  // made. Whether `codex exec` loads a plugin's skills at all is unproven and a scratch home
  // carries no credential, so the output is recorded for the next human re-check and gates
  // nothing. It runs here, before the cases, for the same reason it asserted nothing.
  beforeAll(
    () => {
      const home = tempDir("codex-home-exec");
      const marketplaceRoot = tempDir("marketplace-exec");
      mkdirSync(join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
      writeFileSync(join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), marketplaceDocument());
      cpSync(root, join(marketplaceRoot, "codex"), { recursive: true });
      codex(home, marketplaceRoot, ["plugin", "marketplace", "add", marketplaceRoot]);
      codex(home, marketplaceRoot, ["plugin", "add", `stamity@${MARKETPLACE}`]);

      const session = tempDir("codex-session");
      const result = codex(home, session, [
        "exec",
        "--skip-git-repo-check",
        "list the skills available to you",
      ]);

      console.log(
        [
          "── MEASUREMENT: codex exec against an installed stamity plugin ──",
          `binary: ${bin}`,
          `status: ${String(result.status)} signal: ${String(result.signal)}`,
          `stdout:\n${(result.stdout ?? "").trim()}`,
          `stderr:\n${(result.stderr ?? "").trim()}`,
          "────────────────────────────────────────────────────────────────",
        ].join("\n"),
      );
    },
    300_000,
  );
});
