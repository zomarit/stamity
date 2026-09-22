// Every loop below walks a real directory in a fixed order — a digest map and a file listing are
// what the determinism assertions compare — so `no-await-in-loop` is off for this file.
/* oxlint-disable no-await-in-loop */

import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — the four emitter modules ship as plain .mjs with no type declarations: the
// generator that builds the plugin roots runs them under bare Node, with no TypeScript nearby.
import { buildCapabilityFile, PLUGIN_CLASSES, validateCapabilityFile } from "../../scripts/plugins/capability.mjs";
// @ts-expect-error — as above.
import { stageSubstitutedCorpus } from "../../scripts/plugins/corpusStage.mjs";
// @ts-expect-error — as above.
import { renderSetupCommand } from "../../scripts/plugins/setupCommand.mjs";
// @ts-expect-error — as above. The four container modules, read for the per-client declarations
// the generator hands to the renderers above.
import * as claudeContainer from "../../scripts/plugins/clients/claude.mjs";
// @ts-expect-error — as above.
import * as codexContainer from "../../scripts/plugins/clients/codex.mjs";
// @ts-expect-error — as above.
import * as copilotContainer from "../../scripts/plugins/clients/copilot.mjs";
// @ts-expect-error — as above.
import * as cursorContainer from "../../scripts/plugins/clients/cursor.mjs";
// @ts-expect-error — as above.
import * as tokens from "../../scripts/plugins/tokens.mjs";
import { INVARIANTS_VERSION_TOKEN, REPO_SUBSTITUTION_TOKENS } from "../../src/emit/substitution.ts";

/**
 * The four planner-independent halves of the plugin package emitter (REQ-PLUGIN-002, -003, -004).
 *
 * `tokens` and `corpusStage` answer one question together: a plugin body travels to a repository
 * this engine never detected, so an emission-time `${STAMITY:*}` token would reach the agent as a
 * broken template variable. The pair resolves every token this engine wires into a fixed phrase
 * naming the row to read in `AGENTS.md`, and REFUSES anything it cannot resolve rather than
 * shipping the token. The binding below against `REPO_SUBSTITUTION_TOKENS` is what makes a tenth
 * engine token fail here the day it lands instead of leaking into a published root.
 *
 * `capability` is the two-halves shape of `scripts/plugins/releaseManifest.mjs`: a PROJECTOR that
 * lays `stamity-plugin.json` out in one fixed key order, and a JUDGE that names each defect by its
 * JSON path. Its reader is file 2's `src/plugins/capabilityFile.ts`, which refuses unknown keys —
 * so the key set asserted here is a contract, not a preference.
 *
 * `setupCommand` renders the one command the plugin generates rather than carries: the four clients
 * differ only in a root variable and a client name, and the body must name no other client.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONTENT_ROOT = join(REPO_ROOT, "content");
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

interface ContainerModule {
  SETUP_COMMAND_FRONTMATTER?: Record<string, unknown>;
  place(row: { path: string; content: string }): { path: string; class: string } | null | undefined;
}

/** The four container modules, keyed the way the generator keys them. */
const CONTAINERS: Record<(typeof CLIENTS)[number], ContainerModule> = {
  claude: claudeContainer,
  cursor: cursorContainer,
  copilot: copilotContainer,
  codex: codexContainer,
};

interface Staged {
  root: string;
  forkRoot?: string;
  dispose(): Promise<void>;
}

const stage = stageSubstitutedCorpus as (input: {
  contentRoot: string;
  forkRoot?: string;
  tokens: unknown;
}) => Promise<Staged>;

const phrases = tokens.CHARTER_REFERENCE_PHRASES as Record<string, string>;
const substitute = tokens.substitute as (body: string) => { text: string; unresolved: string[] };

const disposals: Staged[] = [];
const temps: string[] = [];

afterEach(async () => {
  for (const staged of disposals.splice(0)) await staged.dispose();
  for (const path of temps.splice(0)) await rm(path, { recursive: true, force: true });
});

const stageFor = async (input: { contentRoot: string; forkRoot?: string }): Promise<Staged> => {
  const staged = await stage({ ...input, tokens });
  disposals.push(staged);
  return staged;
};

/** The staging trees `stageSubstitutedCorpus` currently owns under the system temp directory. */
const stagingTrees = async (): Promise<string[]> =>
  (await readdir(tmpdir())).filter((name) => name.startsWith("stamity-plugin-corpus-")).toSorted();

const tempDir = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "stamity-plugin-modules-"));
  temps.push(path);
  return path;
};

/** Every regular file under `root`, relative and posix-spelled, sorted. */
const listFiles = async (root: string, prefix = ""): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(join(root, entry.name), rel)));
    else out.push(rel);
  }
  return out.toSorted();
};

/** A sha-256 map of a tree, the shape two stagings must agree on byte for byte. */
const treeDigests = async (root: string): Promise<Record<string, string>> => {
  const map: Record<string, string> = {};
  for (const rel of await listFiles(root)) {
    map[rel] = createHash("sha256").update(await readFile(join(root, rel))).digest("hex");
  }
  return map;
};

/** A minimal corpus with one agent, one command and one skill; `write` adds the case's own files. */
const syntheticCorpus = async (write: (root: string) => Promise<void>): Promise<string> => {
  const root = join(await tempDir(), "content");
  await mkdir(join(root, "agents"), { recursive: true });
  await mkdir(join(root, "commands"), { recursive: true });
  await mkdir(join(root, "skills", "st-demo"), { recursive: true });
  await writeFile(join(root, "agents", "demo-agent.md"), "# demo\n\nRun the gate.\n");
  await writeFile(join(root, "commands", "st-demo.md"), "Run ${STAMITY:VERIFY_GATE_ALL} and stop.\n");
  await writeFile(join(root, "skills", "st-demo", "SKILL.md"), "# demo skill\n");
  await write(root);
  return root;
};

describe("charter-reference phrases (REQ-PLUGIN-004)", () => {
  it("maps every repo-fact and gate token the emission layer wires, and only those", () => {
    const wired = REPO_SUBSTITUTION_TOKENS.filter((token) => token !== INVARIANTS_VERSION_TOKEN);
    expect(Object.keys(phrases).toSorted()).toEqual([...wired].toSorted());
    // The charter-only token is absent on purpose: a plugin body is never the charter, so the
    // token has no input here and leaving it unmapped is what makes the staging refuse it.
    expect(Object.hasOwn(phrases, INVARIANTS_VERSION_TOKEN)).toBe(false);
  });

  it("names the row of AGENTS.md an agent must read, one phrase per token", () => {
    expect(phrases).toEqual({
      "${STAMITY:LINTER}": "the linter named under Repo facts in AGENTS.md",
      "${STAMITY:TEST_FRAMEWORK}": "the test framework named under Repo facts in AGENTS.md",
      "${STAMITY:CI_PROVIDER}": "the CI provider named under Repo facts in AGENTS.md",
      "${STAMITY:MATURITY_TIER}": "the maturity tier named under Repo facts in AGENTS.md",
      "${STAMITY:VERIFY_GATE_TEST}": "the Tests command listed under Verification gates in AGENTS.md",
      "${STAMITY:VERIFY_GATE_LINT}": "the Lint command listed under Verification gates in AGENTS.md",
      "${STAMITY:VERIFY_GATE_TYPECHECK}": "the Typecheck command listed under Verification gates in AGENTS.md",
      "${STAMITY:VERIFY_GATE_ALL}": "the Full gate command listed under Verification gates in AGENTS.md",
    });
  });

  it("resolves a body carrying several mapped tokens and reports nothing unresolved", () => {
    const result = substitute(
      "Lint with ${STAMITY:LINTER}, test with ${STAMITY:TEST_FRAMEWORK}, then run ${STAMITY:VERIFY_GATE_ALL}.\n",
    );
    expect(result.text).toBe(
      "Lint with the linter named under Repo facts in AGENTS.md, " +
        "test with the test framework named under Repo facts in AGENTS.md, " +
        "then run the Full gate command listed under Verification gates in AGENTS.md.\n",
    );
    expect(result.unresolved).toEqual([]);
    expect(result.text).not.toContain("${STAMITY:");
  });

  it("leaves an unknown token standing and reports it once, in order of first appearance", () => {
    const result = substitute(
      "${STAMITY:UNKNOWN} then ${STAMITY:LINTER} then ${STAMITY:OTHER} then ${STAMITY:UNKNOWN}",
    );
    expect(result.unresolved).toEqual(["${STAMITY:UNKNOWN}", "${STAMITY:OTHER}"]);
    expect(result.text).toContain("${STAMITY:UNKNOWN}");
    expect(result.text).toContain("the linter named under Repo facts in AGENTS.md");
  });

  it("reports the charter-only invariants token as unresolved", () => {
    const result = substitute(`Invariants version ${INVARIANTS_VERSION_TOKEN}.`);
    expect(result.unresolved).toEqual([INVARIANTS_VERSION_TOKEN]);
  });

  it("treats an unterminated prefix as prose and never swallows the paragraph after it", () => {
    // The corpus does this once, on purpose: the test-runner agent quotes the prefix while
    // describing an unresolved gate command. An unbounded pattern would match forward to the
    // next `}` anywhere in the file and report a paragraph as a token name.
    const body = "a command still carrying an unresolved `${STAMITY:` token, or an\nexecutable ${HOME} cannot find.";
    const result = substitute(body);
    expect(result.unresolved).toEqual([]);
    expect(result.text).toBe(body);
  });

  it("returns a body carrying no token unchanged", () => {
    const body = "# A plugin body\n\nNo tokens here, just prose and a `${SHELL}` word.\n";
    expect(substitute(body)).toEqual({ text: body, unresolved: [] });
  });
});

describe("staging the substituted corpus over the real corpus (REQ-PLUGIN-004)", () => {
  it("resolves every class body, copies the charter byte-for-byte, and renders the gate phrase", async () => {
    const staged = await stageFor({ contentRoot: CONTENT_ROOT });

    const files = await listFiles(staged.root);
    expect(files).toEqual(await listFiles(CONTENT_ROOT));
    expect(files.length).toBeGreaterThan(40);

    const classBodies = files.filter(
      (rel) => rel.endsWith(".md") && !rel.startsWith("charter/"),
    );
    expect(classBodies.length).toBeGreaterThan(30);
    const withToken: string[] = [];
    const withBarePrefix: string[] = [];
    for (const rel of classBodies) {
      const body = await readFile(join(staged.root, rel), "utf8");
      if (/\$\{STAMITY:[^}\n]*\}/.test(body)) withToken.push(rel);
      if (body.includes("${STAMITY:")) withBarePrefix.push(rel);
    }
    expect(withToken).toEqual([]);

    // TEST CHANGE, justified: the exception this assertion pinned is GONE, so the assertion
    // states the stronger property instead. It used to allow one body —
    // `agents/stamity-test-runner.md`, which quoted the bare prefix `${STAMITY:` as prose while
    // telling the runner what an unresolved gate command looks like — and it said in as many
    // words that the day the corpus line was reworded the exception would be removed
    // deliberately. P2a-ii reworded it (`an unresolved \`STAMITY\` substitution token`), because
    // REQ-PLUGIN-004 asks for the literal string to be absent from a rendered ROOT and a
    // published plugin body quoting it would defeat the check a consumer runs. The behaviour
    // under test did not move: staging still leaves a bare prefix standing rather than mangling
    // a sentence. What moved is the corpus, and with no body carrying one there is no exception
    // left to allow.
    expect(withBarePrefix).toEqual([]);

    // The charter is never a plugin body — the layout drops it — so it is copied, not substituted,
    // which is why its own `${STAMITY:INVARIANTS_VERSION}` never trips the refusal above.
    const charter = "charter/stamity-charter.md";
    expect(await readFile(join(staged.root, charter))).toEqual(await readFile(join(CONTENT_ROOT, charter)));
    expect(await readFile(join(staged.root, charter), "utf8")).toContain(INVARIANTS_VERSION_TOKEN);

    const stWork = await readFile(join(staged.root, "commands/st-work.md"), "utf8");
    expect(stWork).toContain("the Full gate command listed under Verification gates in AGENTS.md");
  });

  it("copies every non-markdown companion byte-for-byte", async () => {
    const staged = await stageFor({ contentRoot: CONTENT_ROOT });
    const companions = (await listFiles(CONTENT_ROOT)).filter((rel) => !rel.endsWith(".md"));
    expect(companions.length).toBeGreaterThan(0);
    for (const rel of companions) {
      expect(await readFile(join(staged.root, rel)), rel).toEqual(await readFile(join(CONTENT_ROOT, rel)));
    }
  });
});

describe("staging refusals and companions (REQ-PLUGIN-003, REQ-PLUGIN-004)", () => {
  it("refuses a body whose token is not in the map, naming the file and the token", async () => {
    const contentRoot = await syntheticCorpus(async (root) => {
      await writeFile(join(root, "agents", "rogue.md"), "Ask ${STAMITY:UNKNOWN} for the answer.\n");
    });
    await expect(stage({ contentRoot, tokens })).rejects.toThrow(/agents\/rogue\.md/);
    await expect(stage({ contentRoot, tokens })).rejects.toThrow(/\$\{STAMITY:UNKNOWN\}/);
  });

  it("removes the partial staging tree when a refusal aborts the copy", async () => {
    // M7: the temp tree is the function's own and the caller gets no handle to
    // it on the failure path, so a refusal that left it behind would leak one
    // directory per failed build with nothing able to remove it.
    const contentRoot = await syntheticCorpus(async (root) => {
      await writeFile(join(root, "agents", "rogue.md"), "Ask ${STAMITY:UNKNOWN} for the answer.\n");
    });
    const before = await stagingTrees();

    await expect(stage({ contentRoot, tokens })).rejects.toThrow(/agents\/rogue\.md/);

    // The refusal copied `demo-agent.md` before it reached `rogue.md`, so the
    // tree it removed was a partial one rather than an empty directory.
    expect((await stagingTrees()).filter((name) => !before.includes(name))).toEqual([]);
  });

  it("carries a skill's references and scripts byte-for-byte beside its SKILL.md", async () => {
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x0a]);
    const contentRoot = await syntheticCorpus(async (root) => {
      await mkdir(join(root, "skills", "st-demo", "references"), { recursive: true });
      await mkdir(join(root, "skills", "st-demo", "scripts"), { recursive: true });
      await writeFile(join(root, "skills", "st-demo", "references", "x.txt"), bytes);
      await writeFile(join(root, "skills", "st-demo", "scripts", "run.mjs"), "console.log('run')\n");
      await writeFile(join(root, "skills", "st-demo", "references", "note.md"), "Gate: ${STAMITY:VERIFY_GATE_TEST}\n");
    });
    const staged = await stageFor({ contentRoot });

    expect(await readFile(join(staged.root, "skills/st-demo/references/x.txt"))).toEqual(bytes);
    expect(await readFile(join(staged.root, "skills/st-demo/scripts/run.mjs"), "utf8")).toBe("console.log('run')\n");
    // A companion `.md` is a body like any other: it is substituted, not copied.
    expect(await readFile(join(staged.root, "skills/st-demo/references/note.md"), "utf8")).toBe(
      "Gate: the Tests command listed under Verification gates in AGENTS.md\n",
    );
  });

  it("stages the fork layer when it holds files and reports no fork root when it is absent", async () => {
    const contentRoot = await syntheticCorpus(async () => {});
    const forkRoot = join(await tempDir(), "fork");
    await mkdir(join(forkRoot, "agents"), { recursive: true });
    await writeFile(join(forkRoot, "agents", "own.md"), "Run ${STAMITY:VERIFY_GATE_LINT}.\n");

    const withFork = await stageFor({ contentRoot, forkRoot });
    expect(withFork.forkRoot).toBeTypeOf("string");
    expect(await readFile(join(withFork.forkRoot as string, "agents/own.md"), "utf8")).toBe(
      "Run the Lint command listed under Verification gates in AGENTS.md.\n",
    );

    const absent = await stageFor({ contentRoot, forkRoot: join(await tempDir(), "missing") });
    expect(absent.forkRoot).toBeUndefined();
  });

  it("stages an empty fork directory rather than refusing it", async () => {
    const contentRoot = await syntheticCorpus(async () => {});
    const forkRoot = join(await tempDir(), "fork");
    await mkdir(forkRoot, { recursive: true });
    const staged = await stageFor({ contentRoot, forkRoot });
    expect(await listFiles(staged.forkRoot as string)).toEqual([]);
  });

  it("stages one corpus twice to identical file sets and bytes", async () => {
    const contentRoot = await syntheticCorpus(async (root) => {
      await mkdir(join(root, "skills", "st-demo", "references"), { recursive: true });
      await writeFile(join(root, "skills", "st-demo", "references", "x.txt"), "opaque\n");
    });
    const first = await stageFor({ contentRoot });
    const second = await stageFor({ contentRoot });
    expect(first.root).not.toBe(second.root);
    expect(await treeDigests(first.root)).toEqual(await treeDigests(second.root));
  });

  it("stages under the system temp directory and removes the tree on dispose", async () => {
    const contentRoot = await syntheticCorpus(async () => {});
    const staged = await stage({ contentRoot, tokens });
    expect(staged.root.startsWith(tmpdir())).toBe(true);
    expect(staged.root).not.toBe(contentRoot);
    expect(await listFiles(staged.root)).toEqual(await listFiles(contentRoot));
    await staged.dispose();
    await expect(readdir(staged.root)).rejects.toThrow(/ENOENT/);
  });

  // A name holding a backslash or `..` is creatable on POSIX only — Windows resolves both as path
  // syntax before the file is made, so the refusal is observable on POSIX alone. The refusal itself
  // guards every platform: such a name in the corpus would escape the root when a client unpacks it.
  describe.skipIf(process.platform === "win32")("hostile companion names", () => {
    it("refuses a companion whose name holds `..` and a backslash", async () => {
      const contentRoot = await syntheticCorpus(async (root) => {
        await writeFile(join(root, "skills", "st-demo", "..\\x"), "escape\n");
      });
      await expect(stage({ contentRoot, tokens })).rejects.toThrow(/\.\.\\x/);
    });

    it("refuses a symlinked companion, naming the path", async () => {
      const contentRoot = await syntheticCorpus(async (root) => {
        await symlink(join(root, "skills", "st-demo", "SKILL.md"), join(root, "skills", "st-demo", "link.md"));
      });
      await expect(stage({ contentRoot, tokens })).rejects.toThrow(/skills\/st-demo\/link\.md/);
      await expect(stage({ contentRoot, tokens })).rejects.toThrow(/symlink/);
    });
  });
});

/** A capability file shaped as the claude root's will be: every class populated, no distribution. */
const capabilityInput = (): Record<string, unknown> => ({
  client: "claude",
  version: "1.9.0",
  sourceCommit: "a".repeat(40),
  invocation: { commands: "/stamity:<id>", agents: "stamity:<id>", skills: "/stamity:<id>" },
  clientFloor: {
    version: "2.1.224",
    citation: { url: "https://code.claude.com/docs/en/plugin-marketplaces", accessDate: "2026-09-17" },
  },
  prerequisites: { node: ">=22.22.2", git: "optional" },
  classes: {
    agent: { status: "carried", count: 10 },
    skill: { status: "carried", count: 14 },
    command: { status: "carried", count: 10 },
    rule: { status: "repository-owned", reason: "the plugin manifest has no rules field" },
    hooks: { status: "carried", count: 4 },
    mcp: { status: "repository-owned", reason: "server selection and credential references are the repository's" },
  },
  runtime: { companion: { package: "@zomarit/stamity", compatible: "^1.9.0" } },
});

/**
 * A built capability file as the defect cases handle it. Typed loosely on purpose: each case
 * injects a field the schema FORBIDS, which a faithful type would not let the mutator write.
 */
interface ClassEntry {
  status: string;
  count?: number;
  reason?: string;
}

interface CapabilityDraft {
  [key: string]: unknown;
  classes: Record<string, ClassEntry | undefined>;
  prerequisites: Record<string, string | undefined>;
  runtime: { path: string; locator: string; companion: { package: string; compatible: string } };
}

/** One class entry, past the index signature's `undefined` — the fixture always declares all six. */
const classOf = (file: CapabilityDraft, name: string): ClassEntry => file.classes[name] as ClassEntry;

describe("the capability file (REQ-PLUGIN-002)", () => {
  it("lays the declared key order out and validates clean", () => {
    const file = buildCapabilityFile(capabilityInput()) as Record<string, unknown>;
    expect(Object.keys(file)).toEqual([
      "schemaVersion",
      "client",
      "version",
      "sourceCommit",
      "invocation",
      "clientFloor",
      "prerequisites",
      "classes",
      "runtime",
    ]);
    expect(file.schemaVersion).toBe(1);
    expect(Object.keys(file.classes as object)).toEqual(PLUGIN_CLASSES);
    expect(PLUGIN_CLASSES).toEqual(["agent", "skill", "command", "rule", "hooks", "mcp"]);
    expect(file.runtime).toEqual({
      path: "runtime",
      locator: "runtime/locate.mjs",
      companion: { package: "@zomarit/stamity", compatible: "^1.9.0" },
    });
    expect(validateCapabilityFile(file)).toEqual([]);
  });

  it("is byte-stable across two calls, whatever order the input keys arrived in", () => {
    const first = JSON.stringify(buildCapabilityFile(capabilityInput()), null, 2);
    const shuffled = capabilityInput();
    shuffled.invocation = { skills: "/stamity:<id>", commands: "/stamity:<id>", agents: "stamity:<id>" };
    shuffled.prerequisites = { git: "optional", node: ">=22.22.2" };
    const second = JSON.stringify(buildCapabilityFile(shuffled), null, 2);
    expect(second).toBe(first);
  });

  it("carries a distribution note only when the input records one", () => {
    const plain = buildCapabilityFile(capabilityInput()) as Record<string, unknown>;
    expect(Object.hasOwn(plain, "distribution")).toBe(false);

    const input = capabilityInput();
    input.client = "cursor";
    input.distribution = { note: "an organization imports the repository as a team marketplace" };
    const withNote = buildCapabilityFile(input) as Record<string, unknown>;
    expect(Object.keys(withNote).at(-1)).toBe("distribution");
    expect(withNote.distribution).toEqual({
      note: "an organization imports the repository as a team marketplace",
    });
    expect(validateCapabilityFile(withNote)).toEqual([]);
  });

  it("keeps an optional prerequisite tool and a floor reason", () => {
    const input = capabilityInput();
    input.client = "copilot";
    input.prerequisites = { node: ">=22.22.2", git: "optional", copilot: "npm install -g @github/copilot" };
    input.clientFloor = { version: "unknown", reason: "the reference page states no minimum version" };
    const file = buildCapabilityFile(input) as CapabilityDraft;
    expect(Object.keys(file.prerequisites)).toEqual(["node", "git", "copilot"]);
    expect(file.clientFloor).toEqual({
      version: "unknown",
      reason: "the reference page states no minimum version",
    });
    expect(validateCapabilityFile(file)).toEqual([]);
  });

  /** One built file, one fault injected, the messages that come back. */
  const defect = (mutate: (input: CapabilityDraft) => void): string[] => {
    const file = buildCapabilityFile(capabilityInput()) as CapabilityDraft;
    mutate(file);
    return validateCapabilityFile(file) as string[];
  };

  it("names one defect per fault, by its JSON path", () => {
    expect(defect((f) => (f.schemaVersion = 2))).toEqual(["schemaVersion: must be 1, the only schema this container declares"]);
    expect(defect((f) => (f.client = "emacs"))).toEqual(["client: must be one of claude, cursor, copilot, codex"]);
    expect(defect((f) => (f.sourceCommit = "abc123"))).toEqual([
      "sourceCommit: must be a 40-character lowercase hex commit sha",
    ]);
    expect(defect((f) => delete f.classes.rule)).toEqual([
      "classes.rule: must declare a status of carried, repository-owned or unsupported",
    ]);
    expect(defect((f) => delete classOf(f, "agent").count)).toEqual([
      "classes.agent.count: must be the number of files the root carries for a carried class",
    ]);
    expect(defect((f) => delete classOf(f, "mcp").reason)).toEqual([
      "classes.mcp.reason: must say why the class is not carried",
    ]);
    expect(defect((f) => (f.marketplace = { url: "x" }))).toEqual(["marketplace: is not a supported key"]);
    expect(defect((f) => (f.prerequisites.node = "22.22.2"))).toEqual([
      "prerequisites.node: must be a >=x.y.z range naming the Node floor",
    ]);
    expect(defect((f) => (f.prerequisites.git = "maybe"))).toEqual([
      "prerequisites.git: must be optional or required",
    ]);
    expect(defect((f) => (f.runtime.companion.compatible = "1.9.0"))).toEqual([
      "runtime.companion.compatible: must be a caret range over the plugin version, for example ^1.9.0",
    ]);
    expect(defect((f) => (classOf(f, "agent").status = "shipped"))).toEqual([
      "classes.agent.status: must be carried, repository-owned or unsupported",
    ]);
    // W4: `version` was accepted as any non-empty string, so a root could
    // declare itself at `v1.9` or `latest` and the locator — which parses the
    // same field as semver — would silently resolve nothing.
    expect(defect((f) => (f.version = "1.9"))).toEqual([
      "version: must be the plugin version this root was built at, as major.minor.patch",
    ]);
    // M6: a carried class may not state a `reason` that is not a string, and a
    // non-carried class may not state a `count` at all — the count is what
    // "carried" means, and a class that is not carried counts nothing.
    expect(defect((f) => (classOf(f, "agent").reason = 7 as unknown as string))).toEqual([
      "classes.agent.reason: must be a sentence when a carried class states one",
    ]);
    expect(defect((f) => (classOf(f, "rule").count = 3))).toEqual([
      "classes.rule.count: is stated only by a carried class",
    ]);
  });

  it("accepts a prerelease caret range, which the locator already honours", () => {
    // W4: `CARET_RANGE` refused `^1.9.0-rc.1` while `satisfiesCaret` in
    // scripts/plugins/locate.mjs accepts it and resolves only that exact
    // prerelease. Two halves of one contract disagreeing is the defect.
    const file = buildCapabilityFile({
      ...capabilityInput(),
      version: "1.9.0-rc.1",
      runtime: { companion: { package: "@zomarit/stamity", compatible: "^1.9.0-rc.1" } },
    });

    expect(validateCapabilityFile(file)).toEqual([]);
  });

  it("refuses a value that is not an object at all", () => {
    expect(validateCapabilityFile(null)).toEqual([
      "capability file: must be a JSON object carrying the plugin's declared capabilities",
    ]);
  });
});

/** A planned emission row as a container's `place` reads one: a path and its bytes. */
const plannedRow = (path: string): { path: string; content: string } => ({ path, content: "{}\n" });

describe("the .stamity/ boundary each container draws", () => {
  it.each(CLIENTS)("refuses an unnamed .stamity/generated row for %s rather than dropping it", (client) => {
    const { place } = CONTAINERS[client];

    // The two rows every container DOES take out of that directory, matched by name.
    expect(place(plannedRow(".stamity/generated/agent-tool-policies.json"))).toMatchObject({ class: "hooks" });
    expect(place(plannedRow(`.stamity/generated/hooks/${client}/stamity-guard.mjs`))).toMatchObject({ class: "hooks" });

    // A third document under the same directory is a generated file a hook or an agent is meant
    // to READ, and where it lands inside a plugin root is a placement decision. The `.stamity/`
    // catch-all used to swallow it as state, so a new one would have been dropped in silence and
    // the hook that reads it would have found nothing at a consumer's install. `undefined` sends
    // it to the layout's refusal, which is a human seeing it once.
    expect(place(plannedRow(".stamity/generated/tool-budget.json"))).toBeUndefined();
    expect(place(plannedRow(".stamity/generated/nested/thing.json"))).toBeUndefined();

    // And the rest of the state tree is still dropped: it describes one checkout.
    expect(place(plannedRow(".stamity/ledger.jsonl"))).toBeNull();
    expect(place(plannedRow(".stamity/runs/2026-09-20_x/record.md"))).toBeNull();
  });
});

/** One decorated render, as the generator performs it: the container's record, one client. */
const render = (decoration: unknown): string =>
  renderSetupCommand("cursor", "CURSOR_PLUGIN_ROOT", decoration) as string;

describe("the generated setup command (REQ-PLUGIN-003)", () => {
  const rootVars: Record<string, string> = {
    claude: "CLAUDE_PLUGIN_ROOT",
    cursor: "CURSOR_PLUGIN_ROOT",
    copilot: "PLUGIN_ROOT",
    codex: "PLUGIN_ROOT",
  };

  it.each(CLIENTS)("renders the four steps and the three remedies for %s", (client) => {
    const rootVar = rootVars[client];
    const body = renderSetupCommand(client, rootVar) as string;
    // TEST CHANGE, justified (2026-09-22, prove/258, prove/262): the Copilot CLI exports no
    // plugin-root variable to a command's shell (measured on 1.0.87), so that client's body is
    // discovery-first — every command names `<root>`, read out of `copilot skill list --json`
    // (a plugin skill's `path` is `<root>/skills/<id>`), and hands it to the CLI as
    // `--plugin-root`. The other three keep the variable form.
    const locate = client === "copilot" ? 'node "<root>/runtime/locate.mjs"' : `node "\${${rootVar}}/runtime/locate.mjs"`;
    const rootFlag = client === "copilot" ? ' --plugin-root "<root>"' : "";

    expect(body.startsWith("---\ndescription: \"Set this repository up for the stamity plugin: ")).toBe(true);
    expect(body).toContain(
      'description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."',
    );

    expect(body).toContain(`${locate} -- plugin status --json${rootFlag}`);
    expect(body).toContain("`setup.needed`");
    expect(body).toContain(`${locate} -- plugin setup --client ${client} -y${rootFlag}`);
    expect(body).toContain("`duplicates`");
    expect(body).toContain(`${locate} -- plugin status${rootFlag}\n`);

    // TEST CHANGE (W3): the assertion was `toContain("stamity clean -y")`, a
    // bare command. A plugin-only install has no `stamity` on PATH, so every
    // remedy the body prints has to run through the locator — the contract the
    // module header already states for every other command in this file. The
    // old assertion passed on a remedy an operator cannot run.
    expect(body).toContain(`${locate} -- clean -y`);
    expect(body).not.toMatch(/(?<!-- )\bstamity clean -y/);
    expect(body).not.toMatch(/`plugin setup`/);
    expect(body).toContain("APM dependency");
    expect(body).toContain(".stamity/overrides/");

    // TEST CHANGE, justified (SEC2-W1). Step 3 says to stop for the operator and then phrased
    // its three remedies as bare imperatives — "run ... clean -y, then ... plugin setup", "remove
    // that APM dependency", "remove it". The reader of this body is an AGENT, and an imperative
    // is its instruction: `clean -y` is non-interactive and removes ledger rows and the files
    // they name, so the old phrasing invited exactly the destructive act the step above it
    // forbade. What moved is the body's contract, not these assertions' standard — every remedy
    // now names the operator as its subject, and the stop is restated after the list.
    for (const remedy of ["the operator runs `", "the operator removes ", "the operator keeps "]) {
      expect(body, remedy).toContain(remedy);
    }
    expect(body).toContain("Do not run either yourself");
    expect(body).toContain("Remove no file yourself");
    // No bare imperative left in the remedy list: every `- a file ...` row names its subject.
    for (const row of body.split("\n").filter((line) => line.startsWith("   - a file "))) {
      expect(row, row).toContain("the operator ");
    }

    // The status call must come first and the plain status call last: the order is the instruction.
    expect(body.indexOf("plugin status --json")).toBeLessThan(body.indexOf("plugin setup --client"));
    expect(body.indexOf("plugin setup --client")).toBeLessThan(body.lastIndexOf("plugin status"));
  });

  it.each(CLIENTS)("names no other client and carries no emission token for %s", (client) => {
    const body = (renderSetupCommand(client, rootVars[client]) as string).toLowerCase();
    expect(body).not.toContain("${stamity:");
    for (const other of CLIENTS.filter((c) => c !== client)) {
      expect(body, `${client} body names ${other}`).not.toContain(other);
    }
  });

  it("renders byte-stable output", () => {
    expect(renderSetupCommand("claude", "CLAUDE_PLUGIN_ROOT")).toBe(renderSetupCommand("claude", "CLAUDE_PLUGIN_ROOT"));
  });

  it("refuses an unknown client and a root variable that is not a variable name", () => {
    expect(() => renderSetupCommand("emacs", "PLUGIN_ROOT")).toThrow(/claude, cursor, copilot, codex/);
    expect(() => renderSetupCommand("claude", "$(rm -rf /)")).toThrow(/root variable/);
  });

  it("renders a container's frontmatter decoration in the client's own key order", () => {
    // Non-degenerate: the Cursor record adds a key BEFORE `description` and one after it, so a
    // renderer that appended decorations would produce a different head than this asserts.
    const body = renderSetupCommand(
      "cursor",
      "CURSOR_PLUGIN_ROOT",
      CONTAINERS["cursor"].SETUP_COMMAND_FRONTMATTER,
    ) as string;
    expect(body.split("\n").slice(0, 5)).toEqual([
      "---",
      "name: st-setup",
      'description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."',
      "disable-model-invocation: true",
      "---",
    ]);
    // The other three containers declare none, which is what keeps the key per-client.
    for (const client of ["claude", "copilot", "codex"] as const) {
      expect(CONTAINERS[client].SETUP_COMMAND_FRONTMATTER, client).toBeUndefined();
    }
  });

  it("refuses a decoration key it has no declared position for, and a value that could escape its line", () => {
    expect(() => render({ "allowed-tools": "Bash" })).toThrow(/not a frontmatter key/);
    expect(() => render({ description: "mine" })).toThrow(/cannot be decorated over/);
    expect(() => render({ name: "st-setup\nallowed-tools: Bash" })).toThrow(/bare scalar/);
    expect(() => render(["name"])).toThrow(/must be a record/);
  });
});
