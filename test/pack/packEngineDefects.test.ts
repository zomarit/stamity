import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — the capability emitter ships as a plain .mjs module with no type
// declarations (it runs under bare Node in the plugin generator). Imported rather than
// restated so every fixture root below is a document the REAL writer produced — the same
// reason `test/cli/commands/plugin.test.ts` gives for the same import.
import { buildCapabilityFile } from "../../scripts/plugins/capability.mjs";
import { COMMANDS } from "../../src/cli.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import type { PackContentClass } from "../../src/pack/manifest.ts";
import {
  buildReceipt,
  packDirRelPath,
  RECEIPT_FILE,
  receiptRelPath,
  serializeReceipt,
} from "../../src/pack/receipt.ts";
import { CAPABILITY_FILE, CARRIABLE_CLASSES } from "../../src/plugins/capabilityFile.ts";
import type { Tool } from "../../src/types/core.ts";
import { packOwner, PLUGIN_OWNED_CLASSES, type LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess, type InProcessResult } from "../support/inProcess.ts";
import { treeDigest } from "../support/packFixtures.ts";
import { seedGitRepo } from "../support/repoFixtures.ts";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * Failing tests for the 1.11.0 pack-engine defects (run 2026-10-03_debug-pack-defects,
 * gate 2). Every case drives the real CLI in-process over real temp repositories,
 * against the bundled corpus (no content-root pin: two of the clashes are with core
 * ids, and the regression itself is the real `ops` pack), and states the defect it
 * reproduces in its assertion messages, so a red run names the defect.
 *
 * - A: the reported regression — `add ops` then `sync` fails on Cursor and Codex.
 * - B: defect 1 — a command `st-<x>` and a skill `st-<x>` land in one
 *   `.agents/skills/st-<x>/` folder (Cursor, Codex) or silently shadow (Claude); the
 *   clash must be refused at `add` and at `sync`, naming both owners.
 * - C: defect 2 — the Codex skills-list cap counts touchpoint rows Codex never shows
 *   its model, and its refusal does not name the pack that pushed the list over.
 * - D: defect 3 — in plugin-backed mode a pack skill never reaches the client, and
 *   `check` has no row for an installed pack that reaches no client.
 * - E: defect 4 — an overlay on a pack skill is reported, then ignored.
 *
 * No mocks: nothing here is stubbed. Speed comes from building one template
 * repository per (mode, client set) on first use and copying it per case, so a
 * case pays for its own verbs only.
 */

/** The four clients one at a time, then all four in one repository. */
const CLIENT_SETS: readonly (readonly Tool[])[] = [
  ["cursor"],
  ["codex"],
  ["claude"],
  ["copilot"],
  ["claude", "cursor", "copilot", "codex"],
];

/** This checkout's own package name and version, read rather than spelled. */
const PACKAGE = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { name: string; version: string };

/** A case may build its template first: an init or plugin setup plus its own verbs. */
const CASE_TIMEOUT = 90_000;

let suite: TempDirHandle;
let caseCounter = 0;

beforeAll(async () => {
  suite = await makeTempDir("pack-engine-defects");
});

afterAll(async () => {
  await suite.cleanup();
});

// ── CLI and fixtures ───────────────────────────────────────────────────────

type CliResult = InProcessResult & { output: string };

/** One CLI run in `cwd`; stdout and stderr also joined as `output` for message reads. */
async function cli(cwd: string, argv: readonly string[]): Promise<CliResult> {
  const result = await runInProcess(COMMANDS, argv, { cwd });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

/** A transcript excerpt for an assertion message, so a red run shows what was said. */
function said(result: { code: number; output: string }): string {
  return `exit ${result.code}; output: ${result.output.slice(0, 1200)}`;
}

/** One corpus-shaped artifact: the frontmatter keys the catalog walk requires. */
function artifact(id: string, type: string, description: string): string {
  return [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `description: ${JSON.stringify(description)}`,
    "tags: [orchestration]",
    "load: on-demand",
    `obsolete_when: fixture ${id} trigger`,
    "---",
    "",
    `# ${id}`,
    "",
    "Fixture body for the pack-engine defect suite.",
    "",
  ].join("\n");
}

/** Plain prose of `length` characters, for descriptions sized against a budget. */
function prose(length: number, seed: string): string {
  const sentence = `Acme ${seed} guidance keeps the demo pack listing honest about its size. `;
  return sentence
    .repeat(Math.ceil(length / sentence.length) + 1)
    .slice(0, length - 1)
    .concat(".");
}

/**
 * Writes a made-up pack OUTSIDE every repository: its files plus a `pack.json`
 * whose sha256 integrity map covers every shipped file. Returns the directory,
 * usable as an `add` path spec.
 */
async function writePack(name: string, files: Record<string, string>): Promise<string> {
  caseCounter += 1;
  const dir = suite.path("packs", String(caseCounter), name);
  const integrity: Record<string, string> = {};
  for (const [rel, body] of Object.entries(files)) {
    integrity[rel] = createHash("sha256").update(body, "utf8").digest("hex");
  }
  await Promise.all(
    Object.entries(files).map(async ([rel, body]) => {
      const abs = join(dir, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }),
  );
  await writeFile(
    join(dir, "pack.json"),
    `${JSON.stringify({ name, version: "1.0.0", integrity }, null, 2)}\n`,
    "utf8",
  );
  return dir;
}

/** `add <dir> --allow-untrusted -y`: the made-up packs carry no trust basis. */
function addPack(repo: string, packDir: string): Promise<CliResult> {
  return cli(repo, ["add", packDir, "--allow-untrusted", "-y"]);
}

/**
 * A generated plugin root: the real writer's capability document for `client`
 * at this engine's version, carrying exactly the classes that client's container
 * can carry (`CARRIABLE_CLASSES`, rules never), plus a locator that answers
 * `--print` — built as in `test/cli/commands/plugin.test.ts`.
 */
async function pluginRoot(dir: string, client: Tool): Promise<string> {
  await mkdir(join(dir, "runtime"), { recursive: true });
  const file: unknown = buildCapabilityFile({
    client,
    version: PACKAGE.version,
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
      ...(Object.fromEntries(
        PLUGIN_OWNED_CLASSES.map((cls) => [
          cls,
          cls !== "rule" && CARRIABLE_CLASSES[client].includes(cls)
            ? { status: "carried", count: cls === "hooks" ? 4 : 10 }
            : { status: "repository-owned", reason: `this container has no ${cls} surface` },
        ]),
      ) as Record<string, unknown>),
      mcp: {
        status: "repository-owned",
        reason: "server selection and credential references are the repository's",
      },
    },
    runtime: { companion: { package: PACKAGE.name, compatible: `^${PACKAGE.version}` } },
  });
  await writeFile(join(dir, CAPABILITY_FILE), `${JSON.stringify(file, null, 2)}\n`, "utf8");
  const report = {
    project: ".",
    runtime: {
      kind: "bundled",
      path: `${dir}/runtime/dist/cli.js`,
      version: PACKAGE.version,
      refusal: null,
    },
    node: { version: process.versions.node, floor: "22.22.2", ok: true },
  };
  await writeFile(
    join(dir, "runtime", "locate.mjs"),
    `process.stdout.write(${JSON.stringify(`${JSON.stringify(report, null, 2)}\n`)});\n`,
    "utf8",
  );
  return dir;
}

type Mode = "generated" | "plugin";

const templates = new Map<string, Promise<string>>();

/** Sets one template repository up: `init` (generated) or `plugin setup` (plugin). */
async function buildTemplate(key: string, mode: Mode, tools: readonly Tool[]): Promise<string> {
  const repo = suite.path("templates", key);
  await mkdir(repo, { recursive: true });
  await seedGitRepo(repo);
  let setup: CliResult;
  if (mode === "generated") {
    setup = await cli(repo, ["init", "-y", "--tools", tools.join(",")]);
  } else {
    const roots = await Promise.all(
      tools.map((tool) => pluginRoot(suite.path("roots", key, tool), tool)),
    );
    setup = await cli(repo, [
      "plugin",
      "setup",
      ...roots.flatMap((root) => ["--plugin-root", root]),
      "-y",
    ]);
  }
  if (setup.code !== 0) throw new Error(`template ${key} failed to set up: ${said(setup)}`);
  return repo;
}

/** A fresh copy of the (once-built) template repository for one case. */
async function freshRepo(mode: Mode, tools: readonly Tool[]): Promise<string> {
  const key = `${mode}-${tools.join("-")}`;
  let pending = templates.get(key);
  if (pending === undefined) {
    pending = buildTemplate(key, mode, tools);
    templates.set(key, pending);
  }
  const source = await pending;
  caseCounter += 1;
  const repo = suite.path("cases", String(caseCounter));
  await cp(source, repo, { recursive: true });
  return repo;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The lines of `output` that satisfy every pattern — how a refusal is read:
 * one statement carrying all the names, not names scattered across an install
 * listing that prints each of them somewhere. `SKILL.md` is masked first so a
 * file name never passes for the word "skill".
 */
function linesWith(output: string, ...patterns: readonly RegExp[]): string[] {
  return output
    .split("\n")
    .map((line) => line.replaceAll("SKILL.md", "<file>"))
    .filter((line) => patterns.every((pattern) => pattern.test(line)));
}

interface Row {
  id: string;
  status?: string;
  detail?: string;
}

/** Every object in a parsed JSON document whose `id` is `id`, wherever it sits. */
function rowsWithId(doc: unknown, id: string): Row[] {
  if (Array.isArray(doc)) return doc.flatMap((item) => rowsWithId(item, id));
  if (typeof doc !== "object" || doc === null) return [];
  const own = (doc as { id?: unknown }).id === id ? [doc as Row] : [];
  return [...own, ...Object.values(doc).flatMap((value) => rowsWithId(value, id))];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Installs a pack the way an engine WITHOUT the clash check left it: content
 * under the installed-packs folder, the receipt, and the ledger rows, in the
 * shape `applyPackInstall` (`src/pack/install.ts`) records them.
 *
 * Why not `add`, `planPackInstall` or `applyPackInstall`: those are the entry
 * points the fix for defect 1 makes refuse this pack, and this fixture is the
 * repository a 1.11.0 user already has — the clash is on disk before the fixed
 * engine first meets it at `sync`. Only the record FORMATS are borrowed from the
 * engine (`buildReceipt`, `serializeReceipt`, `packOwner`, the receipt and pack
 * paths), none of its gates, so the fixture keeps working after the gates move.
 */
async function installBypassingAdd(
  repo: string,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  const packDir = packDirRelPath(name);
  const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
  const writeSet = Object.entries(files).map(([relPath, body]) => ({
    relPath,
    targetPath: `${packDir}/${relPath}`,
    contentClass: relPath.split("/")[0] as PackContentClass,
    contentHash: sha(body),
    sizeBytes: Buffer.byteLength(body, "utf8"),
    body,
  }));
  const manifest = await readManifest(repo);
  if (manifest === null) throw new Error("installBypassingAdd: the repository has no manifest");
  const receiptText = serializeReceipt(
    buildReceipt(
      {
        manifest: { name, version: "1.0.0" },
        source: { kind: "local-path" },
        spec: `./${name}`,
        writeSet,
        checks: { manifest: "pass", trustTier: "pass", integrityMap: "pass", bodyScan: "pass" },
        trustTier: "pinned-unsigned",
        tierBasis: "no catalog pin and no signing declaration (installed by an earlier engine)",
        policy: { decision: "allow" },
        tokensByPath: {},
        totalTokens: 0,
      },
      new Date("2026-10-01T00:00:00.000Z"),
      manifest.generatedBy,
    ),
  );
  await Promise.all(
    [
      ...writeSet.map((entry) => [entry.targetPath, entry.body] as const),
      [receiptRelPath(name), receiptText] as const,
    ].map(async ([rel, body]) => {
      const abs = join(repo, ...rel.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }),
  );
  const rows: LedgerEntry[] = [
    ...writeSet.map(
      (entry): LedgerEntry => ({
        path: entry.targetPath,
        adapter: packOwner(name),
        artifactId: `${name}/${entry.relPath}`,
        artifactType: "infra",
        contentHash: entry.contentHash,
      }),
    ),
    {
      path: receiptRelPath(name),
      adapter: packOwner(name),
      artifactId: `${name}/${RECEIPT_FILE}`,
      artifactType: "infra",
      contentHash: sha(receiptText),
    },
  ];
  await writeManifest(repo, {
    ...manifest,
    ledger: [...manifest.ledger, ...rows].toSorted((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  });
}

/** The B1/B5 shape: a command `st-drill` and a skill `st-drill` in one pack. */
const DRILL_PACK: Record<string, string> = {
  "commands/st-drill.md": artifact("drill", "command", "Runs the acme incident drill end to end."),
  "skills/st-drill/SKILL.md": artifact(
    "drill",
    "skill",
    "Steps for one acme incident drill. Triggers when a drill is scheduled.",
  ),
};

/** Where each client of a set reads a skill directory from. */
function skillDirsFor(tools: readonly Tool[]): string[] {
  return [
    ...new Set(tools.map((tool) => (tool === "claude" ? ".claude/skills" : ".agents/skills"))),
  ];
}

const SETS = CLIENT_SETS.map((tools) => [tools.join(","), tools] as const);

// ── A: the reported regression ─────────────────────────────────────────────

describe("A — the reported regression: add ops, then sync, on Cursor and Codex", () => {
  it.each([["cursor"], ["codex"]] as const)(
    "tools=%s: sync and check both exit 0 after `add ops -y`",
    async (tool) => {
      const repo = await freshRepo("generated", [tool]);

      const added = await cli(repo, ["add", "ops", "-y"]);
      expect(added.code, `fixture: add ops must install on ${tool} — ${said(added)}`).toBe(0);

      const synced = await cli(repo, ["sync"]);
      expect(
        synced.code,
        `regression (defects 1 and 2): sync after \`add ops -y\` on ${tool} must exit 0 — ${said(synced)}`,
      ).toBe(0);

      const checked = await cli(repo, ["check"]);
      expect(
        checked.code,
        `regression (defects 1 and 2): check after the sync on ${tool} must exit 0 — ${said(checked)}`,
      ).toBe(0);
    },
    CASE_TIMEOUT,
  );
});

// ── B: defect 1, the cross-class emitted-name clash ────────────────────────

describe("B — defect 1 (cross-class name clash): refused at add and at sync, naming both owners", () => {
  describe.each(SETS)("tools=%s", (_, tools) => {
    it(
      "B1: add refuses a pack whose command and skill both emit st-drill, and writes nothing",
      async () => {
        const repo = await freshRepo("generated", tools);
        const pack = await writePack("acme-demo", DRILL_PACK);
        const before = await treeDigest(repo);

        const added = await addPack(repo, pack);

        expect(
          added.code,
          `defect 1 (cross-class name clash): add must refuse command "drill" and skill "drill", which both emit st-drill — ${said(added)}`,
        ).not.toBe(0);
        expect(
          linesWith(added.output, /st-drill/, /\bcommand\b/i, /\bskill\b/i),
          `defect 1 (cross-class name clash): the refusal must name st-drill and both of its owners, the command and the skill — ${said(added)}`,
        ).not.toEqual([]);
        expect(
          linesWith(added.output, /acme-demo/, /st-drill/),
          `defect 1 (cross-class name clash): the refusal must name the pack acme-demo beside st-drill — ${said(added)}`,
        ).not.toEqual([]);
        expect(
          await treeDigest(repo),
          "defect 1 (cross-class name clash): a refused add must leave the repository tree unchanged",
        ).toBe(before);
      },
      CASE_TIMEOUT,
    );

    it(
      "B5: sync refuses a clash an earlier engine already installed, naming both owners and clean --pack",
      async () => {
        const repo = await freshRepo("generated", tools);
        await installBypassingAdd(repo, "acme-demo", DRILL_PACK);
        const precheck = await cli(repo, ["check", "--json"]);
        expect(
          rowsWithId(parseJson(precheck.stdout), "pack-integrity").map((row) => row.status),
          `fixture: the hand-installed pack must pass check's pack-integrity row — ${said(precheck)}`,
        ).toEqual(["pass"]);

        const synced = await cli(repo, ["sync"]);

        expect(
          synced.code,
          `defect 1 (cross-class name clash): sync must refuse an installed command "drill" and skill "drill" that both emit st-drill — ${said(synced)}`,
        ).not.toBe(0);
        expect(
          synced.output,
          `defect 1 (cross-class name clash): sync must name the clash, not the generic two-planner collision — ${said(synced)}`,
        ).not.toContain("Two planners emitted different content");
        expect(
          linesWith(synced.output, /st-drill/, /\bcommand\b/i, /\bskill\b/i),
          `defect 1 (cross-class name clash): the sync refusal must name st-drill and both owners — ${said(synced)}`,
        ).not.toEqual([]);
        expect(
          synced.output,
          `defect 1 (cross-class name clash): the sync refusal must give the remedy clean --pack acme-demo — ${said(synced)}`,
        ).toContain("clean --pack acme-demo");
      },
      CASE_TIMEOUT,
    );
  });

  // B2-B4 run on one client set: the add-time check reads pack and core ids,
  // which no client changes. Cursor, because there the clash is a broken folder.
  it(
    "B2 (tools=cursor): add refuses a pack command `verify` — it emits st-verify, a core skill",
    async () => {
      const repo = await freshRepo("generated", ["cursor"]);
      const pack = await writePack("acme-demo", {
        "commands/st-verify.md": artifact("verify", "command", "Verifies the acme demo."),
      });

      const added = await addPack(repo, pack);

      expect(
        added.code,
        `defect 1 (cross-class name clash): add must refuse a pack command emitting st-verify, the core skill's name — ${said(added)}`,
      ).not.toBe(0);
      expect(
        linesWith(added.output, /st-verify/, /\bcore\b/i),
        `defect 1 (cross-class name clash): the refusal must name st-verify and the core as its other owner — ${said(added)}`,
      ).not.toEqual([]);
    },
    CASE_TIMEOUT,
  );

  it(
    "B3 (tools=cursor): add refuses a pack skill `work` — it emits st-work, a core command",
    async () => {
      const repo = await freshRepo("generated", ["cursor"]);
      const pack = await writePack("acme-demo", {
        "skills/st-work/SKILL.md": artifact("work", "skill", "Acme work steps."),
      });

      const added = await addPack(repo, pack);

      expect(
        added.code,
        `defect 1 (cross-class name clash): add must refuse a pack skill emitting st-work, the core command's name — ${said(added)}`,
      ).not.toBe(0);
      expect(
        linesWith(added.output, /st-work/, /\bcore\b/i),
        `defect 1 (cross-class name clash): the refusal must name st-work and the core as its other owner — ${said(added)}`,
      ).not.toEqual([]);
    },
    CASE_TIMEOUT,
  );

  it(
    "B4 (tools=cursor): acme-two's skill `shared` is refused against acme-one's command `shared`",
    async () => {
      const repo = await freshRepo("generated", ["cursor"]);
      const first = await writePack("acme-one", {
        "commands/st-shared.md": artifact("shared", "command", "The acme-one shared command."),
      });
      const second = await writePack("acme-two", {
        "skills/st-shared/SKILL.md": artifact("shared", "skill", "The acme-two shared skill."),
      });
      const one = await addPack(repo, first);
      expect(one.code, `fixture: acme-one must install — ${said(one)}`).toBe(0);
      const before = await treeDigest(repo);

      const two = await addPack(repo, second);

      expect(
        two.code,
        `defect 1 (cross-class name clash): add acme-two must refuse — its skill emits st-shared, acme-one's command — ${said(two)}`,
      ).not.toBe(0);
      expect(
        linesWith(two.output, /acme-one/, /\bcommand\b/i),
        `defect 1 (cross-class name clash): the refusal must name acme-one's command as the other owner — ${said(two)}`,
      ).not.toEqual([]);
      expect(
        await treeDigest(repo),
        "defect 1 (cross-class name clash): the refused second add must leave the tree unchanged",
      ).toBe(before);
    },
    CASE_TIMEOUT,
  );
});

// ── C: defect 2, the Codex skills list ─────────────────────────────────────

describe("C — defect 2 (Codex skills list): count only the rows Codex shows its model", () => {
  describe.each(SETS.filter(([, tools]) => tools.includes("codex")))("tools=%s", (_, tools) => {
    it(
      "C1: a commands-only pack past the core's headroom still syncs — command rows are never shown",
      async () => {
        const repo = await freshRepo("generated", tools);
        // Five commands at 360 characters add about 1,880 characters of touchpoint
        // rows: past the core's headroom under 8,000 while touchpoints count (the
        // core measured 5,570 shown + 1,339 touchpoint characters on 2026-10-03),
        // and nothing once only shown rows count — every touchpoint carries
        // `allow_implicit_invocation: false`, which hides it from the model
        // (codex-cli 0.160.0, measured 2026-10-03).
        const files = Object.fromEntries(
          [1, 2, 3, 4, 5].map((n) => [
            `commands/st-acme-cmd-${n}.md`,
            artifact(`acme-cmd-${n}`, "command", prose(360, `command ${n}`)),
          ]),
        );
        const added = await addPack(repo, await writePack("acme-demo", files));
        expect(added.code, `fixture: the commands-only pack must install — ${said(added)}`).toBe(0);

        const synced = await cli(repo, ["sync"]);

        expect(
          synced.code,
          `defect 2 (Codex skills list): command rows are hidden from the model and must not count toward the 8,000-character list — ${said(synced)}`,
        ).toBe(0);
      },
      CASE_TIMEOUT,
    );

    it(
      "C2: a skills pack that pushes the shown rows past 8,000 is refused, naming the pack and the size",
      async () => {
        const repo = await freshRepo("generated", tools);
        // Four skills at 900 characters (each under 1,000) add about 3,670 shown
        // characters to the core's 5,570: over 8,000 under either way of counting.
        const files = Object.fromEntries(
          [1, 2, 3, 4].map((n) => [
            `skills/st-acme-skill-${n}/SKILL.md`,
            artifact(`acme-skill-${n}`, "skill", prose(900, `skill ${n}`)),
          ]),
        );
        const added = await addPack(repo, await writePack("acme-demo", files));
        expect(added.code, `fixture: the skills pack must install — ${said(added)}`).toBe(0);

        const synced = await cli(repo, ["sync"]);

        expect(
          synced.code,
          `defect 2 (Codex skills list): shown skill rows past 8,000 characters must still refuse — ${said(synced)}`,
        ).not.toBe(0);
        expect(
          synced.output,
          `defect 2 (Codex skills list): the refusal must state the list size in characters — ${said(synced)}`,
        ).toMatch(/\d[\d,]*\s+characters/);
        expect(
          synced.output,
          `defect 2 (Codex skills list): the refusal must name the pack that pushed the list over, acme-demo — ${said(synced)}`,
        ).toContain("acme-demo");
      },
      CASE_TIMEOUT,
    );
  });
});

// ── D: defect 3, plugin mode ───────────────────────────────────────────────

/**
 * D2's "reaches no client" pack per client set. Claude, Cursor and Copilot: a
 * command-only pack, because those plugins carry the command class. Codex's
 * plugin carries only skills and hooks (commands, agents and rules stay the
 * repository's there, so a command pack DOES reach Codex), and a skill pack is
 * exactly what D1 says must reach it — so Codex, and all four together, use a
 * hooks-only pack: every plugin carries hooks, and sync already reports pack
 * hook rows as not wired into a client whose hooks come from its plugin.
 */
function unreachablePack(tools: readonly Tool[]): { shape: string; files: Record<string, string> } {
  if (tools.includes("codex")) {
    return {
      shape: "hooks-only pack",
      files: {
        "hooks/hooks.json": `${JSON.stringify(
          {
            hooks: [
              {
                event: "pre_tool_use",
                matcher: "Bash",
                command: ["node", ".stamity/hooks/acme-probe.mjs", "--acme-sentinel"],
                timeoutMs: 2500,
              },
            ],
          },
          null,
          2,
        )}\n`,
      },
    };
  }
  return {
    shape: "command-only pack",
    files: { "commands/st-acme-cmd.md": artifact("acme-cmd", "command", "Runs the acme check.") },
  };
}

describe("D — defect 3 (plugin mode): pack skills reach the client; a pack reaching none is flagged", () => {
  describe.each(SETS)("tools=%s", (_, tools) => {
    it(
      "D1: after add and sync, the pack skill's SKILL.md is where the client reads skills",
      async () => {
        const repo = await freshRepo("plugin", tools);
        const pack = await writePack("acme-demo", {
          "skills/st-acme-skill/SKILL.md": artifact("acme-skill", "skill", "The acme demo skill."),
        });
        const added = await addPack(repo, pack);
        expect(added.code, `fixture: the skill pack must install — ${said(added)}`).toBe(0);

        const synced = await cli(repo, ["sync"]);
        expect(synced.code, `fixture: sync must succeed — ${said(synced)}`).toBe(0);

        const expected = skillDirsFor(tools).map((dir) => `${dir}/st-acme-skill/SKILL.md`);
        const present = await Promise.all(
          expected.map((path) => exists(join(repo, ...path.split("/")))),
        );
        expect(
          expected.filter((_path, index) => present[index] !== true),
          `defect 3 (plugin mode): an installed pack skill must reach a plugin-backed ${tools.join(",")} setup, yet sync exited 0 without writing it — ${said(synced)}`,
        ).toEqual([]);
      },
      CASE_TIMEOUT,
    );

    it(
      `D2: check fails with a pack-reach row for an installed pack that reaches no client (${unreachablePack(tools).shape})`,
      async () => {
        const repo = await freshRepo("plugin", tools);
        // The repo-committed script a pack hook must name (the launcher allow-list
        // refuses a hook whose script does not exist); inert for the command shape.
        await mkdir(join(repo, ".stamity", "hooks"), { recursive: true });
        await writeFile(join(repo, ".stamity", "hooks", "acme-probe.mjs"), "process.exit(0)\n");
        const added = await addPack(repo, await writePack("acme-demo", unreachablePack(tools).files));
        expect(added.code, `fixture: the pack must install — ${said(added)}`).toBe(0);
        const synced = await cli(repo, ["sync"]);
        expect(synced.code, `fixture: sync must succeed — ${said(synced)}`).toBe(0);

        const checked = await cli(repo, ["check", "--json"]);

        const rows = rowsWithId(parseJson(checked.stdout), "pack-reach");
        expect(
          rows.map((row) => row.status),
          `defect 3 (plugin mode): check must carry a failing pack-reach row for acme-demo, which reaches no client — ${said(checked)}`,
        ).toEqual(["fail"]);
        expect(
          rows[0]?.detail ?? "",
          "defect 3 (plugin mode): the pack-reach row must name the pack",
        ).toContain("acme-demo");
        expect(
          checked.code,
          `defect 3 (plugin mode): check must exit non-zero for an installed pack that reaches no client — ${said(checked)}`,
        ).not.toBe(0);
      },
      CASE_TIMEOUT,
    );
  });
});

// ── E: defect 4, an overlay on a pack skill ────────────────────────────────

const OVERLAY_PATH = ".stamity/overrides/skills/acme-lint/SKILL.customize.md";

describe("E — defect 4 (overlay on a pack skill): refused loudly by sync and validate", () => {
  describe.each(SETS)("tools=%s", (_, tools) => {
    it(
      "sync and validate exit non-zero, naming the overlay's path and the pack skill",
      async () => {
        const repo = await freshRepo("generated", tools);
        const added = await addPack(
          repo,
          await writePack("acme-demo", {
            "skills/st-acme-lint/SKILL.md": artifact("acme-lint", "skill", "The acme lint skill."),
          }),
        );
        expect(added.code, `fixture: the skill pack must install — ${said(added)}`).toBe(0);
        // Carrier shape: a skill overlay lives in a directory named after the slug.
        await mkdir(join(repo, dirname(OVERLAY_PATH)), { recursive: true });
        await writeFile(join(repo, OVERLAY_PATH), "Escalate within the hour.\n", "utf8");

        const synced = await cli(repo, ["sync"]);

        expect(
          synced.code,
          `defect 4 (overlay on a pack skill): sync must refuse an overlay it cannot apply to pack skill acme-lint — ${said(synced)}`,
        ).not.toBe(0);
        expect(
          synced.output,
          `defect 4 (overlay on a pack skill): the refusal must name the overlay's path — ${said(synced)}`,
        ).toContain(OVERLAY_PATH);
        expect(
          synced.output.replaceAll(OVERLAY_PATH, ""),
          `defect 4 (overlay on a pack skill): the refusal must name the pack skill acme-lint — ${said(synced)}`,
        ).toContain("acme-lint");

        const validated = await cli(repo, ["validate"]);
        expect(
          validated.code,
          `defect 4 (overlay on a pack skill): validate must fail on an overlay targeting a pack skill — ${said(validated)}`,
        ).not.toBe(0);
      },
      CASE_TIMEOUT,
    );
  });
});
