// Every loop here walks a generated tree in a fixed order, and the spawns are deliberately
// sequential — a `--check` run must observe the tree the write run left, not a concurrent one.
/* oxlint-disable no-await-in-loop */

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the emitter modules ship as plain .mjs with no type declarations: the
// generator that builds the plugin roots runs them under bare Node, with no TypeScript nearby.
import { PLUGIN_CLASSES, validateCapabilityFile } from "../../scripts/plugins/capability.mjs";
import { downstreamCheckout, write } from "./downstreamFixture.ts";

/**
 * `scripts/generate-plugin-packages.mjs` end to end: the four per-client plugin roots this
 * repository publishes, built from its own corpus (REQ-PLUGIN-001, -002, -003, -004).
 *
 * The suite runs the generator as a CHILD PROCESS, the way CI and a release run it, because the
 * properties under test are properties of the produced TREE — two runs agreeing byte for byte, a
 * `--check` that fails on one appended byte, a root with no `${STAMITY:` left in it — and an
 * in-process call would prove the renderer agrees with itself while saying nothing about what
 * lands on disk.
 *
 * `--runtime` is a STUB here: a directory carrying the two files the generator requires of a
 * runtime (`package.json`, `dist/cli.js`). The real bundled runtime is built from a packed
 * tarball and proven by P7's own suite; rebuilding it here would add a minute of `npm pack` to
 * every run to re-prove a contract that already has an owner. What this suite does assert about
 * the runtime is the part the EMITTER owns: the tree is copied in, and `runtime/locate.mjs` is
 * the repository's locator byte for byte.
 *
 * The heavy cases share one generated set of roots (`beforeAll`), because a full corpus plan for
 * four clients is the expensive step and every assertion below reads the same tree. Cases that
 * need a DIFFERENT corpus — a synthetic token, a collision, the downstream fork fixture — build
 * their own checkout and pay for it once.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENTS = ["claude", "cursor", "copilot", "codex"] as const;

/** A 40-hex commit and its date, pinned so a fixture checkout with no `.git` still renders. */
const FIXED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const FIXED_COMMIT_DATE = "2026-09-20T00:00:00Z";

/**
 * Wall-time budgets, derived rather than guessed. One root is a full content index plus a
 * planner pass plus a tree write, measured at ~2s per client on this repository's corpus; the
 * shared build does four of them behind one corpus staging, so ~10s is the honest cost and the
 * budget is 6x that to survive a loaded CI worker. A single-client run is a quarter of the work
 * and gets a quarter of the headroom.
 */
const FULL_BUILD_MS = 60_000;
const ONE_ROOT_MS = 30_000;

/**
 * Where each class lives inside each root, named by the SUITE rather than read from the layout
 * module the generator uses — a count verified against the table that produced it verifies
 * nothing. Cursor carries its commands as skill directories (the client's own conversion), so its
 * command home is the skills tree and only the sum of the two is provable from the tree.
 */
const HOMES: Record<
  (typeof CLIENTS)[number],
  { agent?: string; command?: string; rule?: string; commandsUnderSkills?: boolean }
> = {
  claude: { agent: "agents/", command: "commands/" },
  cursor: { agent: "agents/", rule: "rules/", commandsUnderSkills: true },
  copilot: { agent: "com.github.copilot/agents/", command: "com.github.copilot/commands/" },
  codex: {},
};

/** The one per-client difference in the hooks convention: where the CONFIG document sits. */
const HOOKS_CONFIG: Record<(typeof CLIENTS)[number], string> = {
  claude: "hooks/hooks.json",
  cursor: "hooks/hooks.json",
  copilot: "com.github.copilot/hooks/hooks.json",
  codex: "hooks/hooks.json",
};

const work = mkdtempSync(join(tmpdir(), "stamity-plugin-packages-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function tempDir(prefix: string): string {
  return mkdtempSync(join(work, `${prefix}-`));
}

/**
 * The downstream fixture writes the four artifact classes and no charter, because the APM
 * generator it was built for projects primitives and never renders one. A plugin build PLANS,
 * and the charter is the engine's one always-on artifact — a corpus without it cannot emit at
 * all. Seeding this repository's own charter is the smallest way to make the fixture plannable
 * without touching a fixture three other suites share.
 */
function seedCharter(root: string): void {
  cpSync(join(REPO_ROOT, "content", "charter"), join(root, "content", "charter"), { recursive: true });
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

/** One corpus agent, as the downstream fixture writes them: frontmatter plus a one-line body. */
const agentDocument = (id: string): string =>
  `---\nid: ${id}\ntype: agent\ndescription: Fixture agent\ntags: [fixture]\nload: on-demand\n---\n\nBody of ${id}.\n`;

function generate(args: string[], cwd = REPO_ROOT): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [join(cwd, "scripts", "generate-plugin-packages.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
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

/** Path -> sha256 of its bytes: what "two runs produced the same tree" means here. */
function treeDigest(dir: string): Record<string, string> {
  const digest: Record<string, string> = {};
  for (const rel of treeFiles(dir)) {
    digest[rel] = createHash("sha256").update(readFileSync(join(dir, rel))).digest("hex");
  }
  return digest;
}

interface CapabilityClass {
  status: string;
  count?: number;
  reason?: string;
}
interface CapabilityFile {
  client: string;
  version: string;
  sourceCommit: string;
  classes: Record<string, CapabilityClass>;
}

function capabilityOf(outDir: string, client: string): CapabilityFile {
  return JSON.parse(readFileSync(join(outDir, client, "stamity-plugin.json"), "utf8")) as CapabilityFile;
}

let roots: string;

beforeAll(() => {
  roots = tempDir("roots");
  const result = generate([
    "--out-dir",
    roots,
    "--runtime",
    RUNTIME,
    "--source-commit",
    FIXED_COMMIT,
    "--source-commit-date",
    FIXED_COMMIT_DATE,
  ]);
  expect(result.status, result.stderr).toBe(0);
}, FULL_BUILD_MS);

describe("generated plugin roots", () => {
  it(
    "renders the same tree twice, byte for byte",
    () => {
      const second = tempDir("roots-again");
      const result = generate([
        "--out-dir",
        second,
        "--runtime",
        RUNTIME,
        "--source-commit",
        FIXED_COMMIT,
        "--source-commit-date",
        FIXED_COMMIT_DATE,
      ]);
      expect(result.status, result.stderr).toBe(0);
      const first = treeDigest(roots);
      // Non-degenerate by construction: four roots of a full corpus, not an empty map.
      expect(Object.keys(first).length).toBeGreaterThan(200);
      expect(treeDigest(second)).toEqual(first);
    },
    FULL_BUILD_MS,
  );

  it(
    "verifies a freshly written tree and names the file one appended byte moved",
    () => {
      const clean = generate(["--check", "--out-dir", roots, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE]);
      expect(clean.status, clean.stderr).toBe(0);

      const touched = join(roots, "claude", "agents", "stamity-reviewer.md");
      const before = readFileSync(touched);
      appendFileSync(touched, "x");
      const drifted = generate(["--check", "--out-dir", roots, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE]);
      expect(drifted.status).toBe(1);
      expect(drifted.stderr).toContain("claude/agents/stamity-reviewer.md");
      expect(drifted.stderr).toContain("node scripts/generate-plugin-packages.mjs");
      writeFileSync(touched, before);

      const extra = join(roots, "claude", "agents", "extra.md");
      writeFileSync(extra, "not a projection of this corpus\n");
      const orphan = generate(["--check", "--out-dir", roots, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE]);
      expect(orphan.status).toBe(1);
      expect(orphan.stderr).toContain("claude/agents/extra.md");
      rmSync(extra);

      const restored = generate(["--check", "--out-dir", roots, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE]);
      expect(restored.status, restored.stderr).toBe(0);
    },
    FULL_BUILD_MS,
  );

  it("leaves no substitution token standing anywhere under any root", () => {
    const carrying: string[] = [];
    for (const client of CLIENTS) {
      for (const rel of treeFiles(join(roots, client))) {
        if (readFileSync(join(roots, client, rel), "utf8").includes("${STAMITY:")) carrying.push(`${client}/${rel}`);
      }
    }
    expect(carrying).toEqual([]);
  });

  it("resolves a gate token into the phrase naming its row in the charter", () => {
    const body = readFileSync(join(roots, "claude", "commands", "st-work.md"), "utf8");
    expect(body).toContain("the Full gate command listed under Verification gates in AGENTS.md");
  });

  it("declares a valid capability file whose carried counts equal the files in the root", () => {
    for (const client of CLIENTS) {
      const root = join(roots, client);
      const capability = capabilityOf(roots, client);
      expect(validateCapabilityFile(capability), client).toEqual([]);
      expect(capability.client).toBe(client);
      expect(capability.sourceCommit).toBe(FIXED_COMMIT);
      expect(Object.keys(capability.classes).toSorted()).toEqual([...(PLUGIN_CLASSES as string[])].toSorted());

      // The oracle names the homes itself rather than asking the layout module where it put
      // things: a count checked against the table that produced it checks nothing.
      const home = HOMES[client];
      const files = treeFiles(root).filter((rel) => !rel.startsWith("runtime/"));
      const under = (prefix: string | undefined): string[] =>
        prefix === undefined ? [] : files.filter((rel) => rel.startsWith(prefix));
      const skillDirs = new Set(under("skills/").map((rel) => rel.split("/")[1]));
      const counted: Record<string, number> = {
        agent: under(home.agent).length,
        command: under(home.command).length,
        rule: under(home.rule).length,
        skill: skillDirs.size,
        hooks: files.filter((rel) => rel.startsWith("hooks/") && rel.endsWith(".mjs")).length,
      };
      // Cursor is the one client whose commands and skills share a directory — the client's own
      // command-as-skill conversion — so the tree can only prove the SUM there.
      if (home.commandsUnderSkills === true) {
        expect(capability.classes["skill"]?.count ?? 0, client).toBeGreaterThan(0);
        expect(
          (capability.classes["skill"]?.count ?? 0) + (capability.classes["command"]?.count ?? 0),
          `${client}: skills + commands share skills/`,
        ).toBe(skillDirs.size);
        counted["skill"] = capability.classes["skill"]?.count ?? 0;
        counted["command"] = capability.classes["command"]?.count ?? 0;
      }
      for (const [name, entry] of Object.entries(capability.classes)) {
        if (entry.status === "carried") {
          expect(entry.count, `${client}.${name}`).toBe(counted[name] ?? 0);
          expect(entry.count, `${client}.${name}`).toBeGreaterThan(0);
        } else {
          expect(entry.reason, `${client}.${name}`).toBeTruthy();
          expect(counted[name] ?? 0, `${client}.${name}`).toBe(0);
        }
      }
    }
  });

  it("carries the same nine touchpoint commands plus the generated one wherever a command class exists", () => {
    // An independent cross-check of the Cursor sum above: the corpus has nine touchpoints, and
    // every root with a command class also generates `st-setup`.
    for (const client of ["claude", "cursor", "copilot"] as const) {
      expect(capabilityOf(roots, client).classes["command"]?.count, client).toBe(10);
    }
  });

  it("points every hook command at the client's own plugin root and none at the repository tree", () => {
    for (const client of CLIENTS) {
      const text = readFileSync(join(roots, client, ...HOOKS_CONFIG[client].split("/")), "utf8");
      const rootVar = client === "claude" ? "CLAUDE_PLUGIN_ROOT" : client === "cursor" ? "CURSOR_PLUGIN_ROOT" : "PLUGIN_ROOT";
      const commands = [...text.matchAll(/"command(?:Windows)?":\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
      expect(commands.length, client).toBeGreaterThan(0);
      for (const command of commands) {
        expect(command, `${client}: ${command}`).toContain(`\${${rootVar}}/hooks/`);
        expect(command, `${client}: ${command}`).not.toContain(".stamity/generated");
      }
      // The whole document is deliberately NOT asserted clean of `.stamity/generated`: the codex
      // hook document's own `description` quotes that path in prose, telling an operator where the
      // repository copies of these scripts live. The COMMANDS are what a client executes, and they
      // are what must never point outside the installed root.
      expect(() => JSON.parse(readFileSync(join(roots, client, "hooks", "agent-tool-policies.json"), "utf8"))).not.toThrow();
    }
  });

  it("ships the repository's own locator and the bundled runtime in every root", () => {
    const locator = readFileSync(join(REPO_ROOT, "scripts", "plugins", "locate.mjs"));
    for (const client of CLIENTS) {
      expect(readFileSync(join(roots, client, "runtime", "locate.mjs")), client).toEqual(locator);
      expect(existsSync(join(roots, client, "runtime", "package.json")), client).toBe(true);
      expect(existsSync(join(roots, client, "runtime", "dist", "cli.js")), client).toBe(true);
      expect(existsSync(join(roots, client, "README.md")), client).toBe(true);
    }
  });

  it("carries a generated setup command where the client has a command surface, and says so where it has none", () => {
    expect(readFileSync(join(roots, "claude", "commands", "st-setup.md"), "utf8")).toContain("plugin setup --client claude -y");
    expect(readFileSync(join(roots, "cursor", "skills", "st-setup", "SKILL.md"), "utf8")).toContain("plugin setup --client cursor -y");
    expect(
      readFileSync(join(roots, "copilot", "com.github.copilot", "commands", "st-setup.prompt.md"), "utf8"),
    ).toContain("plugin setup --client copilot -y");
    expect(treeFiles(join(roots, "codex")).filter((rel) => rel.includes("st-setup"))).toEqual([]);
    expect(readFileSync(join(roots, "codex", "README.md"), "utf8")).toContain("plugin setup --client codex -y");
  });

  it("drops the charter, the client entry files and the repository state tree from every root", () => {
    for (const client of CLIENTS) {
      const files = treeFiles(join(roots, client));
      expect(files.filter((rel) => rel === "AGENTS.md" || rel === "CLAUDE.md"), client).toEqual([]);
      expect(files.filter((rel) => rel.startsWith(".stamity/")), client).toEqual([]);
    }
    expect(treeFiles(join(roots, "claude")).filter((rel) => rel.startsWith("rules/"))).toEqual([]);
  });
});

describe("client selection", () => {
  it(
    "renders only the named client",
    () => {
      const out = tempDir("codex-only");
      const result = generate([
        "--out-dir",
        out,
        "--runtime",
        RUNTIME,
        "--client",
        "codex",
        "--source-commit",
        FIXED_COMMIT,
        "--source-commit-date",
        FIXED_COMMIT_DATE,
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(readdirSync(out)).toEqual(["codex"]);
      const capability = capabilityOf(out, "codex");
      expect(validateCapabilityFile(capability)).toEqual([]);
      expect(capability.classes["skill"]?.status).toBe("carried");
      expect(capability.classes["agent"]?.status).toBe("repository-owned");
      expect(capability.classes["command"]?.status).toBe("repository-owned");
    },
    ONE_ROOT_MS,
  );
});

describe("argument and input refusals", () => {
  it("refuses a runtime directory that carries no CLI", () => {
    const bare = tempDir("bare-runtime");
    writeFileSync(join(bare, "package.json"), `${JSON.stringify({ name: "x", version: "1.0.0" })}\n`);
    const out = tempDir("no-cli");
    const result = generate(["--out-dir", out, "--runtime", bare, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("dist/cli.js");
    expect(treeFiles(out)).toEqual([]);
  });

  it("refuses an unknown argument and a missing required one with the usage exit", () => {
    expect(generate(["--nope"]).status).toBe(2);
    expect(generate(["--runtime", RUNTIME]).status).toBe(2);
    expect(generate(["--out-dir", tempDir("no-runtime")]).status).toBe(2);
    const badClient = generate(["--out-dir", tempDir("bad-client"), "--runtime", RUNTIME, "--client", "emacs"]);
    expect(badClient.status).toBe(2);
    expect(badClient.stderr).toContain("emacs");
  });

  it("refuses a source commit that is not a 40-character hex sha", () => {
    const result = generate(["--out-dir", tempDir("bad-sha"), "--runtime", RUNTIME, "--source-commit", "HEAD"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("40");
  });
});

describe("corpus refusals", () => {
  /** A checkout of this repository's generator over a corpus the test controls. */
  function checkout(): string {
    const root = tempDir("checkout");
    downstreamCheckout(root);
    seedCharter(root);
    return root;
  }

  it(
    "refuses an unknown substitution token, naming the file that carries it",
    () => {
      const root = checkout();
      write(
        join(root, "content/agents/stamity-token-agent.md"),
        "---\nid: token-agent\ntype: agent\ndescription: Fixture agent\ntags: [fixture]\nload: on-demand\n---\n\nRun ${STAMITY:UNKNOWN} first.\n",
      );
      const out = tempDir("token-out");
      const result = generate(
        ["--out-dir", out, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE],
        root,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("stamity-token-agent.md");
      expect(result.stderr).toContain("${STAMITY:UNKNOWN}");
      expect(treeFiles(out)).toEqual([]);
    },
    ONE_ROOT_MS,
  );

  it(
    "refuses a corpus collision before it writes a byte",
    () => {
      const root = checkout();
      // Two FILES claiming one id, rather than two ids differing only in case: a case-differing
      // pair collapses to a single file on darwin and Windows, where the case never reaches the
      // index at all, so the collision the plan asks for would not exist to refuse there. This
      // is the same `duplicate-id` collision, portably.
      write(join(root, "content/agents/stamity-dup-one.md"), agentDocument("dup-agent"));
      write(join(root, "content/agents/stamity-dup-two.md"), agentDocument("dup-agent"));
      const out = tempDir("collision-out");
      const result = generate(
        ["--out-dir", out, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE],
        root,
      );
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toContain("collision");
      expect(treeFiles(out)).toEqual([]);
    },
    ONE_ROOT_MS,
  );

  it(
    "treats an empty fork layer as the absence of an addition, not a fault",
    () => {
      const root = tempDir("empty-fork");
      downstreamCheckout(root);
      seedCharter(root);
      rmSync(join(root, "fork"), { recursive: true, force: true });
      mkdirSync(join(root, "fork"));
      const out = tempDir("empty-fork-out");
      const result = generate(
        ["--out-dir", out, "--runtime", RUNTIME, "--client", "claude", "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE],
        root,
      );
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(join(out, "claude", "agents", "stamity-source-agent.md"))).toBe(true);
      expect(existsSync(join(out, "claude", "agents", "stamity-add-agent.md"))).toBe(false);
    },
    ONE_ROOT_MS,
  );
});

describe("downstream fork operations", () => {
  it(
    "lands every fork operation under the id the CLI route emits",
    () => {
      const root = tempDir("fork-checkout");
      downstreamCheckout(root);
      seedCharter(root);
      const out = tempDir("fork-out");
      const result = generate(
        ["--out-dir", out, "--runtime", RUNTIME, "--source-commit", FIXED_COMMIT, "--source-commit-date", FIXED_COMMIT_DATE],
        root,
      );
      expect(result.status, result.stderr).toBe(0);

      const read = (rel: string): string => readFileSync(join(out, rel), "utf8");
      expect(existsSync(join(out, "claude/agents/stamity-add-agent.md"))).toBe(true);
      expect(read("claude/agents/stamity-replace-agent.md")).toContain("Fork replace agent.");
      expect(read("cursor/rules/stamity-patch-rule.mdc")).toContain("Patch witness rule.");
      expect(read("claude/skills/add-skill/references/own.txt")).toBe("Addition companion.\n");

      // A fork skill that REPLACES a bundled one projects under the replaced skill's directory
      // (`replacedClaimantOf`), and the replaced skill's own companion does not survive it.
      expect(read("claude/skills/st-replace-skill/references/own.txt")).toBe("Replacement companion.\n");
      expect(existsSync(join(out, "claude/skills/st-replace-skill/references/upstream.txt"))).toBe(false);
      expect(existsSync(join(out, "claude/skills/replace-skill"))).toBe(false);
    },
    FULL_BUILD_MS,
  );
});

describe("the container manifest each client reads", () => {
  it("declares the Claude agents as a file list and omits the fields the vendor treats as additive", () => {
    const manifest = JSON.parse(readFileSync(join(roots, "claude", ".claude-plugin", "plugin.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const agents = manifest["agents"] as string[];
    expect(agents.length).toBeGreaterThan(1);
    expect(agents).toEqual([...agents].toSorted());
    for (const entry of agents) expect(existsSync(join(roots, "claude", entry.replace("./", "")))).toBe(true);
    expect(manifest["commands"]).toBe("./commands/");
    expect(Object.hasOwn(manifest, "skills")).toBe(false);
    expect(Object.hasOwn(manifest, "hooks")).toBe(false);

    // The identity half is one fact of this repository, not two: it must equal the committed
    // Claude manifest the repository's own generator maintains.
    const committed = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8")) as Record<
      string,
      unknown
    >;
    for (const key of ["$schema", "name", "description", "author", "homepage", "repository", "license", "keywords"]) {
      expect(manifest[key], key).toEqual(committed[key]);
    }
  });

  it("gives Cursor its logo, its rule directory and its hooks pointer", () => {
    const manifest = JSON.parse(readFileSync(join(roots, "cursor", ".cursor-plugin", "plugin.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest["logo"]).toBe("assets/logo.svg");
    expect(readFileSync(join(roots, "cursor", "assets", "logo.svg"))).toEqual(
      readFileSync(join(REPO_ROOT, "assets", "logo.svg")),
    );
    expect(manifest["rules"]).toBe("./rules/");
    expect(manifest["hooks"]).toBe("./hooks/hooks.json");
    expect(Object.hasOwn(manifest, "$schema")).toBe(false);
  });

  it("keeps the two Agent Plugins containers closed to the schema's key set", () => {
    for (const client of ["copilot", "codex"] as const) {
      const manifest = JSON.parse(readFileSync(join(roots, client, "plugin.json"), "utf8")) as Record<string, unknown>;
      expect(Object.keys(manifest).toSorted(), client).toEqual(
        ["$schema", "author", "description", "homepage", "keywords", "license", "name", "repository", "version"].toSorted(),
      );
      expect(manifest["$schema"], client).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
      expect(Object.keys(manifest["author"] as Record<string, unknown>), client).toEqual(["name"]);
    }
  });

  it("writes every root's files as regular files under the root", () => {
    for (const client of CLIENTS) {
      for (const rel of treeFiles(join(roots, client))) {
        expect(statSync(join(roots, client, rel)).isFile(), `${client}/${rel}`).toBe(true);
      }
    }
  });
});
