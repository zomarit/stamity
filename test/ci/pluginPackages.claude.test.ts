import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADAPTER_REGISTRY } from "../../src/adapters/registry.ts";
import { buildContentIndex } from "../../src/content/catalog.ts";
import { resolveSelection } from "../../src/content/selection.ts";
import { composeEmissionPlanner } from "../../src/emit/planner.ts";
import { createManifest } from "../../src/manifest/manifest.ts";
// @ts-expect-error — the container modules ship as plain .mjs with no type declarations: the
// generator that builds the plugin roots runs them under bare Node, with no TypeScript nearby.
import { DISTRIBUTION, place } from "../../scripts/plugins/clients/claude.mjs";
import { canonical, repositoryRoute } from "../support/identity.ts";
import { downstreamCheckout, write } from "./downstreamFixture.ts";

/**
 * The `claude/` plugin root: where the corpus lands inside the Claude Code container, what the
 * container manifest declares, and what the root's own capability file says it carries
 * (REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005).
 *
 * `test/ci/pluginPackages.test.ts` owns the EMITTER — determinism, `--check`, the refusals, the
 * cross-client shape. This suite owns one CONTAINER, and it reads its oracles from outside the
 * container's own table wherever it can: the manifest's rules come from the vendor's schema,
 * vendored under `test/fixtures/plugins/`; the skill set comes from a claude-only run of the
 * engine's planner; the agent and command sets come from the corpus directories. A count checked
 * against the table that produced it checks nothing.
 *
 * The vendored schema is applied by the small reader below rather than by a JSON-Schema library,
 * because adding a validator dependency to ship one test is a cost the repository would carry
 * forever. The reader REPORTS a keyword it cannot apply as a defect, so a schema refresh that
 * introduces one fails loudly instead of passing vacuously.
 *
 * `--runtime` is the same justified stub the emitter suite uses: the two files the generator
 * refuses a directory for lacking. The real bundled runtime has its own proof (P7) and rebuilding
 * it here would add an `npm pack` to every run to re-prove a contract with an owner.
 *
 * The root is built from THIS checkout, so the identity it publishes is this checkout's, and
 * the suite derives it rather than spelling the canonical one: the author is
 * `stamity.publisher` (`canonical().publisher`) and every `marketplace add` route is built from
 * `repository.url` (`repositoryRoute()`). A renamed fork runs the suite unedited;
 * `test/ci/forkIdentity.test.ts` holds the file to that. The stub runtime's package name is a
 * fixture the generator is handed, not an identity it is asked about.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** A 40-hex commit and its date, pinned: the capability file names both and the build must not read a clock. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";

/** One root is a content index plus a planner pass plus a tree write — ~2s here, 15x headroom for a loaded worker. */
const ONE_ROOT_MS = 30_000;
/** The fork fixture copies a checkout before it builds one, so it gets the wider budget. */
const FIXTURE_BUILD_MS = 60_000;

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-claude-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/** A `--runtime` input the generator accepts. Justified stub — see the suite header. */
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

function generate(args: string[], cwd = REPO_ROOT): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(cwd, "scripts", "generate-plugin-packages.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Build one claude root at the pinned provenance. */
function buildClaudeRoot(outDir: string, cwd = REPO_ROOT): SpawnSyncReturns<string> {
  return generate(
    [
      "--out-dir",
      outDir,
      "--runtime",
      RUNTIME,
      "--client",
      "claude",
      "--source-commit",
      FIXED_COMMIT,
      "--source-commit-date",
      FIXED_COMMIT_DATE,
    ],
    cwd,
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

// ── the vendored schema, and the reader that applies it ──────────────────────

/** The draft-07 keywords this reader understands; anything else is reported, never ignored. */
interface SchemaNode {
  $id?: string;
  /** Annotation, not a constraint — read only where the vendor's prose IS the ruling (see `skills`). */
  description?: string;
  type?: string;
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  minLength?: number;
  exclusiveMinimum?: number;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: SchemaNode | boolean;
  propertyNames?: SchemaNode;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  not?: SchemaNode;
}

/** Annotation keywords: present in the vendor's document, constraining nothing. */
const ANNOTATIONS = new Set(["$schema", "$id", "$comment", "title", "description", "examples", "default"]);

const SCHEMA_PATH = join(REPO_ROOT, "test", "fixtures", "plugins", "claude-code-plugin-manifest.schema.json");
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as SchemaNode;

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/**
 * Defects of `value` against `node`, each naming its own JSON path. An empty array is a value the
 * vendor's document admits.
 *
 * Not a general validator and not trying to be: it applies the keywords THIS schema uses, and
 * reports any other keyword as a defect so a refreshed fixture cannot quietly stop constraining
 * anything. `format: "uri"` is applied rather than treated as the annotation draft-07 makes it —
 * a homepage that is not a URI is a defect worth catching, and the manifest is the only consumer.
 */
function defectsOf(value: unknown, node: SchemaNode, path = ""): string[] {
  const at = path === "" ? "<root>" : path;
  const defects: string[] = [];
  for (const keyword of Object.keys(node)) {
    if (ANNOTATIONS.has(keyword)) continue;
    if (
      ![
        "type",
        "const",
        "enum",
        "pattern",
        "format",
        "minLength",
        "exclusiveMinimum",
        "required",
        "properties",
        "additionalProperties",
        "propertyNames",
        "items",
        "anyOf",
        "allOf",
        "not",
      ].includes(keyword)
    ) {
      defects.push(`${at}: the vendor states \`${keyword}\`, which this reader does not apply`);
    }
  }

  const actual = typeOf(value);
  if (node.type !== undefined && actual !== node.type && !(node.type === "number" && actual === "integer")) {
    defects.push(`${at}: must be ${node.type}, is ${actual}`);
    return defects;
  }
  if (node.const !== undefined && value !== node.const) defects.push(`${at}: must be ${JSON.stringify(node.const)}`);
  if (node.enum !== undefined && !node.enum.includes(value)) {
    defects.push(`${at}: ${JSON.stringify(value)} is not one of the values the vendor enumerates`);
  }
  if (typeof value === "string") {
    if (node.pattern !== undefined && !new RegExp(node.pattern, "u").test(value)) {
      defects.push(`${at}: ${JSON.stringify(value)} does not match ${node.pattern}`);
    }
    if (node.minLength !== undefined && value.length < node.minLength) {
      defects.push(`${at}: must be at least ${String(node.minLength)} character(s)`);
    }
    if (node.format === "uri" && !URL.canParse(value)) defects.push(`${at}: ${JSON.stringify(value)} is not a URI`);
  }
  if (typeof value === "number" && node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
    defects.push(`${at}: must be greater than ${String(node.exclusiveMinimum)}`);
  }
  if (Array.isArray(value) && node.items !== undefined) {
    for (const [index, entry] of value.entries()) defects.push(...defectsOf(entry, node.items, `${at}[${String(index)}]`));
  }
  if (typeOf(value) === "object") {
    const object = value as Record<string, unknown>;
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(object, key)) defects.push(`${at}: the vendor requires \`${key}\``);
    }
    for (const [key, entry] of Object.entries(object)) {
      const child = node.properties?.[key];
      if (child !== undefined) defects.push(...defectsOf(entry, child, `${at}.${key}`));
      else if (node.additionalProperties === false) defects.push(`${at}.${key}: is not a key the vendor names`);
      else if (typeof node.additionalProperties === "object") {
        defects.push(...defectsOf(entry, node.additionalProperties, `${at}.${key}`));
      }
      if (node.propertyNames !== undefined) defects.push(...defectsOf(key, node.propertyNames, `${at}: key ${key}`));
    }
  }
  for (const [index, branch] of (node.allOf ?? []).entries()) {
    defects.push(...defectsOf(value, branch, `${at} (allOf[${String(index)}])`));
  }
  if (node.anyOf !== undefined && !node.anyOf.some((branch) => defectsOf(value, branch, at).length === 0)) {
    defects.push(`${at}: ${JSON.stringify(value)} satisfies none of the ${String(node.anyOf.length)} forms the vendor allows`);
  }
  if (node.not !== undefined && defectsOf(value, node.not, at).length === 0) {
    defects.push(`${at}: matches a form the vendor forbids`);
  }
  return defects;
}

/**
 * The event names the vendor enumerates as the KEYS of a hooks object.
 *
 * Read from under `propertyNames` rather than from any enum in the subtree: the same subtree also
 * enumerates the shell interpreters a command hook may name, and a test that accepted either list
 * would pass on a document that had lost the event names entirely.
 */
function hookEventNames(): string[] {
  const found: string[] = [];
  const walk = (node: SchemaNode, underPropertyNames: boolean): void => {
    if (underPropertyNames && node.enum !== undefined) {
      found.push(...node.enum.filter((value): value is string => typeof value === "string"));
    }
    if (node.propertyNames !== undefined) walk(node.propertyNames, true);
    for (const branch of [...(node.anyOf ?? []), ...(node.allOf ?? [])]) walk(branch, underPropertyNames);
    if (node.items !== undefined) walk(node.items, underPropertyNames);
  };
  walk(schemaProperty("hooks"), false);
  return found;
}

function schemaProperty(name: string): SchemaNode {
  const node = SCHEMA.properties?.[name];
  if (node === undefined) throw new Error(`the vendored schema states no \`${name}\` property`);
  return node;
}

// ── oracles from outside the container ───────────────────────────────────────

/** The corpus ids of one content class, as the directory names them. */
function corpusIds(kind: "agents" | "commands" | "skills"): string[] {
  const dir = join(REPO_ROOT, "content", kind);
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => (entry.isDirectory() ? entry.name : basename(entry.name, ".md")))
    .toSorted();
}

/**
 * The skill directories a CLAUDE-ONLY plan projects into `.claude/skills/`, read from the engine.
 *
 * This is the set the container must carry in full: the corpus skills plus the rule-skills the
 * engine's rule-delivery default demotes for Claude (a rule with no globs cannot ride in a
 * container whose manifest has no rules field). Deriving it from a plan rather than listing it
 * keeps the assertion true across a corpus change; the named cross-check below keeps a silent
 * change in rule delivery visible.
 */
async function plannedClaudeSkillDirs(): Promise<string[]> {
  const contentRoot = { root: join(REPO_ROOT, "content"), forkRoot: join(REPO_ROOT, "fork") };
  const index = await buildContentIndex(contentRoot);
  const selection = resolveSelection(index, {});
  const plan = await composeEmissionPlanner({ claude: ADAPTER_REGISTRY.claude }).plan({
    rootDir: join(work, "never-written"),
    manifest: {
      ...createManifest({
        tools: ["claude"],
        selection,
        generatorVersion: "1.8.0",
        now: new Date(FIXED_COMMIT_DATE),
      }),
      ruleDelivery: "on-demand",
    },
    engineVersion: "1.8.0",
    facts: { monorepoPackages: [], hookScriptsRoot: "${CLAUDE_PLUGIN_ROOT}/hooks" },
    contentRoot,
  });
  const prefix = ".claude/skills/";
  const dirs = new Set<string>();
  for (const row of plan) {
    if (!row.path.startsWith(prefix)) continue;
    const dir = row.path.slice(prefix.length).split("/")[0];
    if (dir !== undefined) dirs.add(dir);
  }
  return [...dirs].toSorted();
}

interface Manifest {
  $schema?: string;
  name?: string;
  author?: { name?: string };
  homepage?: string;
  keywords?: unknown[];
}

interface HookEntry {
  type?: string;
  command?: string;
}
interface HookRow {
  matcher?: string;
  hooks: HookEntry[];
}
interface HooksDocument {
  hooks: Record<string, HookRow[]>;
}

interface CapabilityFile {
  clientFloor: { version: string; citation: { url: string; accessDate: string }; reason?: string };
  classes: Record<string, { status: string; count?: number; reason?: string }>;
  invocation: Record<string, string>;
  distribution?: { note: string };
}

let root: string;
let manifest: Manifest;
let hooksDocument: HooksDocument;
let capability: CapabilityFile;
let plannedSkills: string[];

beforeAll(async () => {
  const out = tempDir("roots");
  const result = buildClaudeRoot(out);
  expect(result.status, result.stderr).toBe(0);
  root = join(out, "claude");
  manifest = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")) as Manifest;
  hooksDocument = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8")) as HooksDocument;
  capability = JSON.parse(readFileSync(join(root, "stamity-plugin.json"), "utf8")) as CapabilityFile;
  plannedSkills = await plannedClaudeSkillDirs();
}, ONE_ROOT_MS);

describe("the container manifest, against the vendor's own schema", () => {
  it("satisfies every rule the vendored schema states about it", () => {
    // The whole document at once: `required`, both path patterns, `author.required`, the keyword
    // item type, every `minLength`. A keyword this reader cannot apply lands here as a defect.
    expect(defectsOf(manifest, SCHEMA)).toEqual([]);
    // And the reader is not vacuous: the same schema refuses a manifest with no `name`.
    const { name: _dropped, ...unnamed } = manifest;
    expect(defectsOf(unnamed, SCHEMA)).toContain("<root>: the vendor requires `name`");
  });

  it("declares the schema the vendor publishes this document under", () => {
    expect(SCHEMA.$id).toBeTruthy();
    expect(manifest.$schema).toBe(SCHEMA.$id);
    expect(SCHEMA.required).toContain("name");
    expect(manifest.name).toBe("stamity");
  });

  it("carries an author name, a homepage URI and string keywords", () => {
    expect(schemaProperty("author").required).toContain("name");
    expect(manifest.author?.name).toBe(canonical().publisher);
    expect(schemaProperty("homepage").format).toBe("uri");
    expect(URL.canParse(manifest.homepage ?? "")).toBe(true);
    expect(schemaProperty("keywords").items?.type).toBe("string");
    expect((manifest.keywords ?? []).length).toBeGreaterThan(0);
    for (const keyword of manifest.keywords ?? []) expect(typeof keyword).toBe("string");
  });

  it("omits every component field the vendor's own schema calls additive", () => {
    // One rule over four fields. The schema's first form for each reads "... (in addition to
    // those in the <default>/ directory, if it exists)" — a declared path is searched BESIDE the
    // default scan, never instead of it. This root puts every artifact at exactly the default,
    // so naming one asks the client to discover the same file twice.
    //
    // TEST CHANGE, justified — P3's ledgered finding. `agents` (a ten-entry file list) and
    // `commands` ("./commands/") were declared on the plugins-reference reading that those
    // fields REPLACE the default scan, and two cases here pinned the declared values. The
    // vendored schema settles it the other way, in the same words `skills` and `hooks` already
    // relied on, so the declarations are gone and their pins with them. What moved is the
    // container's contract, not this suite's standard: `agents`'s path-pattern rules and
    // `commands`'s `./` prefix rule bound values this manifest no longer emits.
    for (const field of ["agents", "commands", "skills", "hooks"] as const) {
      expect(schemaProperty(field).anyOf?.[0]?.description ?? "", field).toContain("in addition to");
      expect(Object.hasOwn(manifest, field), field).toBe(false);
    }
    // And the root still HAS the artifacts the default scan is expected to find, so the omission
    // is a reliance on discovery rather than a root that ships nothing at those paths.
    expect(treeFiles(join(root, "agents")).length).toBe(10);
    expect(treeFiles(join(root, "commands")).length).toBe(10);
    // `rules` is not a field of this manifest at all, which is why the container declares the
    // rule class repository-owned rather than carrying it.
    expect(Object.hasOwn(SCHEMA.properties ?? {}, "rules")).toBe(false);
    expect(Object.hasOwn(manifest, "rules")).toBe(false);
  });
});

describe("the plugin hooks document", () => {
  it("names only events the vendor enumerates", () => {
    const events = hookEventNames();
    // Non-degenerate: the vendor's list is long, and a fixture that lost it must not pass here.
    expect(events.length).toBeGreaterThan(10);
    const declared = Object.keys(hooksDocument.hooks);
    expect(declared.length).toBeGreaterThan(0);
    for (const event of declared) expect(events, event).toContain(event);
    // And the membership check bites: an event the vendor does not name is not in the list.
    expect(events).not.toContain("SessionStarted");
  });

  it("runs every hook out of the installed root and never out of a repository tree", () => {
    const commands = Object.values(hooksDocument.hooks)
      .flat()
      .flatMap((row) => row.hooks.map((hook) => hook.command ?? ""));
    expect(commands.length).toBeGreaterThan(4);
    for (const command of commands) {
      // Asserted as two substrings, not one: the vendor asks for the placeholder to be quoted,
      // so `${CLAUDE_PLUGIN_ROOT}` and `/hooks/` may be separated by a quote character.
      expect(command, command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(command, command).toContain("/hooks/");
      expect(command, command).not.toContain(".stamity/generated");
      expect(basename(command.replaceAll('"', "")).endsWith(".mjs"), command).toBe(true);
    }
  });

  it("carries the review gate on both of its events, and the configuration notice", () => {
    for (const event of ["TaskCompleted", "SubagentStop"] as const) {
      const rows = hooksDocument.hooks[event] ?? [];
      expect(rows.flatMap((row) => row.hooks.map((hook) => hook.command ?? "")).join(" "), event).toContain(
        "stamity-review-gate.mjs",
      );
    }
    expect(
      (hooksDocument.hooks["ConfigChange"] ?? []).flatMap((row) => row.hooks.map((hook) => hook.command ?? "")).join(" "),
    ).toContain("stamity-config-tamper-notice.mjs");
  });

  it("keeps a matcher the settings row carried", () => {
    // The corpus plans no matcher today (every stamity hook fires on every call of its event), so
    // the placement is exercised directly: the hooks half of a settings file travels verbatim, and
    // a matcher is part of that half. A user hook row carrying one is the case this protects.
    const settings = {
      permissions: { allow: ["Bash(git status)"] },
      hooks: {
        PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/x.mjs"' }] }],
      },
    };
    const placed = place({ path: ".claude/settings.json", content: JSON.stringify(settings) }) as {
      path: string;
      class: string;
      content: string;
    };
    expect(placed.path).toBe("hooks/hooks.json");
    expect(placed.class).toBe("hooks");
    const emitted = JSON.parse(placed.content) as HooksDocument;
    expect(emitted.hooks["PreToolUse"]?.[0]?.matcher).toBe("Write|Edit");
    // The permissions half is the operator's, and it does not travel.
    expect(placed.content).not.toContain("permissions");
  });
});

describe("what the root carries", () => {
  it("holds one file per corpus agent, each naming itself by its emitted id", () => {
    const ids = corpusIds("agents");
    expect(ids.length).toBe(10);
    expect(treeFiles(join(root, "agents"))).toEqual(ids.map((id) => `${id}.md`));
    for (const id of ids) {
      const body = readFileSync(join(root, "agents", `${id}.md`), "utf8");
      expect(body, id).toContain(`\nname: ${id}\n`);
    }
  });

  it("holds the nine touchpoint commands plus the generated setup command", () => {
    const ids = corpusIds("commands");
    expect(ids.length).toBe(9);
    expect(treeFiles(join(root, "commands"))).toEqual([...ids, "st-setup"].toSorted().map((id) => `${id}.md`));
    expect(readFileSync(join(root, "commands", "st-setup.md"), "utf8")).toContain("plugin setup --client claude -y");
  });

  it("holds every skill a claude-only plan projects, and nothing else", () => {
    const carried = [...new Set(treeFiles(join(root, "skills")).map((rel) => rel.split("/")[0] ?? ""))].toSorted();
    expect(carried).toEqual(plannedSkills);
    // The planned set is the corpus skills PLUS the rule-skills claude demotes: a rule with no
    // globs has no home in a manifest with no rules field, and the engine delivers it as a skill.
    // Named here so a silent change in rule delivery is a visible diff, not a quiet one.
    const demoted = carried.filter((dir) => !corpusIds("skills").includes(dir));
    expect(demoted).toEqual(["stamity-ai-evals", "stamity-question-protocol"]);
    expect(corpusIds("skills").every((id) => carried.includes(id))).toBe(true);
  });

  it("carries nothing the repository still owns", () => {
    const files = treeFiles(root);
    expect(files.filter((rel) => rel.startsWith("rules/"))).toEqual([]);
    expect(files.filter((rel) => rel === ".mcp.json" || rel === "CLAUDE.md" || rel === "AGENTS.md")).toEqual([]);
    expect(files.filter((rel) => rel.startsWith(".stamity/"))).toEqual([]);
    // Non-vacuity: the same tree is not empty — it carries the classes the container does declare.
    expect(files.filter((rel) => rel.startsWith("agents/")).length).toBe(10);
  });

  it("tells its operator how to install it, invoke it, pin it and go back", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toContain(`claude plugin marketplace add ${repositoryRoute().slug}`);
    expect(readme).toContain("claude plugin install stamity@stamity --scope project");
    for (const form of ["@stamity:<id>", "/stamity:<id>"]) expect(readme, form).toContain(form);
    // The refresh is pinned in the QUALIFIED spelling: `plugin update` defaults to user scope, so
    // on Claude Code 2.1.278 the bare form refuses a project-scope install with
    // `Plugin "stamity" is not installed at scope user`. The negative pin is bounded by the line
    // break because the bare form is a prefix of the qualified one — an unbounded `toContain`
    // passes either way, which is how the bare command survived here.
    expect(readme).toContain("claude plugin update stamity@stamity --scope project");
    expect(readme).not.toContain("claude plugin update stamity\n");
    expect(readme).toContain("`--scope user`");
    // The route back is THREE commands, measured 2026-09-22 on 2.1.278 (`test/ci/pluginLifecycle
    // .test.ts`): the re-add and the reinstall leave the recorded version where it was and
    // `plugin update` at the same scope re-records it, while `claude plugin rollback stamity`
    // answers `error: unknown command 'rollback'`. The README carries the block the distribution
    // README prints, and no longer defers to a subcommand the client does not have.
    expect(readme.toLowerCase()).toContain("pin");
    expect(readme).toContain(
      [
        "```sh",
        `claude plugin marketplace add ${repositoryRoute().slug}#plugins/v<previous>`,
        "claude plugin install stamity@stamity --scope project",
        "claude plugin update stamity@stamity --scope project",
        "```",
      ].join("\n"),
    );
    expect(readme).not.toContain("prefer a `rollback` subcommand");
    expect(readme).not.toContain("not established");
  });
});

describe("the capability file", () => {
  it("declares the floor, the citation and its access date", () => {
    expect(capability.clientFloor.version).toBe("2.1.224");
    expect(capability.clientFloor.citation.url).toContain("code.claude.com/docs/en/plugin-marketplaces");
    expect(capability.clientFloor.citation.accessDate).toBe("2026-09-20");
    expect(capability.invocation["agents"]).toBe("@stamity:<id>");
    expect(capability.invocation["commands"]).toBe("/stamity:<id>");
    expect(capability.invocation["skills"]).toBe("/stamity:<id>");
  });

  it("carries four classes and hands two back to the repository with their reasons", () => {
    for (const name of ["agent", "skill", "command", "hooks"] as const) {
      expect(capability.classes[name]?.status, name).toBe("carried");
      expect(capability.classes[name]?.count ?? 0, name).toBeGreaterThan(0);
    }
    const rule = capability.classes["rule"];
    expect(rule?.status).toBe("repository-owned");
    expect(rule?.reason ?? "").toContain("no rules field");
    expect(rule?.reason ?? "").toContain(".claude/rules/");
    const mcp = capability.classes["mcp"];
    expect(mcp?.status).toBe("repository-owned");
    expect(mcp?.reason ?? "").toContain("credential");
  });

  it("records the install route and says the rollback route was measured", () => {
    // The CLI reference quoted a `rollback` subcommand on one page (2026-09-20) and omitted it on
    // another; the installed client settled it on 2026-09-22 (`unknown command 'rollback'`), and
    // the route back — three commands, the third re-recording the version — was walked the same
    // day. A capability file that still said "until an installed client is measured" would send a
    // consumer to measure what this repository already has.
    const note = capability.distribution?.note ?? "";
    expect(note).toBe(DISTRIBUTION.note as string);
    expect(note).toContain("plugin marketplace add");
    expect(note).toContain("settled absent");
    expect(note).toContain("claude plugin update stamity@stamity --scope project");
    expect(note).not.toContain("until an installed client is measured");
    expect(note).toContain("2026-09-20");
    expect(note).toContain("2026-09-22");
  });
});

/** A corpus agent as the downstream fixture writes them, optionally restricted to named tools. */
const fixtureAgent = (id: string, tools?: string): string =>
  `---\nid: ${id}\ntype: agent\ndescription: Fixture agent\ntags: [fixture]\nload: on-demand\n${
    tools === undefined ? "" : `tools: [${tools}]\n`
  }---\n\nBody of ${id}.\n`;

describe("selection replay", () => {
  it(
    "leaves out an agent whose `tools:` excludes claude, and keeps its unrestricted sibling",
    () => {
      // No corpus agent restricts its tools today, so the case is built: the downstream fixture
      // checkout is a real source tree with a corpus this test controls.
      const checkout = tempDir("tools-checkout");
      downstreamCheckout(checkout);
      cpCharter(checkout);
      write(join(checkout, "content/agents/stamity-cursor-only.md"), fixtureAgent("cursor-only", "cursor"));
      write(join(checkout, "content/agents/stamity-every-tool.md"), fixtureAgent("every-tool"));

      const out = tempDir("tools-out");
      const result = buildClaudeRoot(out, checkout);
      expect(result.status, result.stderr).toBe(0);
      const agents = treeFiles(join(out, "claude", "agents"));
      expect(agents).toContain("stamity-every-tool.md");
      expect(agents).not.toContain("stamity-cursor-only.md");
    },
    FIXTURE_BUILD_MS,
  );
});

/**
 * The downstream fixture writes the four artifact classes and no charter, because the APM
 * generator it was built for never renders one. A plugin build PLANS, and the charter is the
 * engine's one always-on artifact. Seeding this repository's own charter is the smallest way to
 * make the fixture plannable without touching a fixture three other suites share.
 */
function cpCharter(checkout: string): void {
  for (const rel of treeFiles(join(REPO_ROOT, "content", "charter"))) {
    write(join(checkout, "content", "charter", ...rel.split("/")), readFileSync(join(REPO_ROOT, "content", "charter", rel)));
  }
}

// ── the real client ──────────────────────────────────────────────────────────

/**
 * Opt-in: nothing in this repository depends on an installed Claude Code, so the suite must stay
 * green on a machine that has never seen one. Arm it with `STAMITY_CLAUDE_BIN=$(command -v claude)`.
 */
describe.skipIf(process.env["STAMITY_CLAUDE_BIN"] === undefined)(
  "the real client, against the binary on STAMITY_CLAUDE_BIN",
  () => {
    it(
      "accepts the generated root under `plugin validate --strict`",
      () => {
        const bin = process.env["STAMITY_CLAUDE_BIN"] ?? "";
        const result = spawnSync(bin, ["plugin", "validate", "--strict", root], {
          encoding: "utf8",
          timeout: 120_000,
        });
        expect(result.status, `${result.stdout ?? ""}\n${result.stderr ?? ""}`).toBe(0);
        // The vendor's own success line, as 2.1.278 prints it.
        expect(result.stdout).toContain("Validation passed");
      },
      120_000,
    );
  },
);
