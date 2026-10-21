import { createHash } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import type { Tool } from "../../src/types/core.ts";
import { packOwner, type LedgerEntry } from "../../src/types/manifest.ts";
import { runInProcess, type InProcessResult } from "../support/inProcess.ts";
import {
  madeUpArtifact as artifact,
  prose,
  treeDigest,
  writeMadeUpPack,
} from "../support/packFixtures.ts";
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
 *   `check` has no row for an installed pack that reaches no client. Retired in
 *   1.15.0 with the plugin-backed mode; the group's place below says why.
 * - E: defect 4 — an overlay on a pack skill is reported, then ignored.
 *
 * No mocks: nothing here is stubbed. Speed comes from building one template
 * repository per client set on first use and copying it per case, so a
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

/** A case may build its template first: an init plus its own verbs. */
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

/**
 * Writes a made-up pack OUTSIDE every repository, one directory per call, through the shared
 * writer (`writeMadeUpPack`: its files plus a `pack.json` whose sha256 integrity map covers
 * every shipped file). Returns the directory, usable as an `add` path spec.
 */
async function writePack(name: string, files: Record<string, string>): Promise<string> {
  caseCounter += 1;
  return writeMadeUpPack(suite.path("packs", String(caseCounter)), name, files);
}

/** `add <dir> --allow-untrusted -y`: the made-up packs carry no trust basis. */
function addPack(repo: string, packDir: string): Promise<CliResult> {
  return cli(repo, ["add", packDir, "--allow-untrusted", "-y"]);
}

const templates = new Map<string, Promise<string>>();

// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): the template took a
// mode, `init` (generated) or `plugin setup` (plugin); the plugin verb left in 1.15.0, so
// `init` is the one setup and the mode parameter went. Every remaining case was generated.
/** Sets one template repository up with `init`. */
async function buildTemplate(key: string, tools: readonly Tool[]): Promise<string> {
  const repo = suite.path("templates", key);
  await mkdir(repo, { recursive: true });
  await seedGitRepo(repo);
  const setup = await cli(repo, ["init", "-y", "--tools", tools.join(",")]);
  if (setup.code !== 0) throw new Error(`template ${key} failed to set up: ${said(setup)}`);
  return repo;
}

/** A fresh copy of the (once-built) template repository for one case. */
async function freshRepo(tools: readonly Tool[]): Promise<string> {
  const key = tools.join("-");
  let pending = templates.get(key);
  if (pending === undefined) {
    pending = buildTemplate(key, tools);
    templates.set(key, pending);
  }
  const source = await pending;
  caseCounter += 1;
  const repo = suite.path("cases", String(caseCounter));
  await cp(source, repo, { recursive: true });
  return repo;
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

const SETS = CLIENT_SETS.map((tools) => [tools.join(","), tools] as const);

// ── A: the reported regression ─────────────────────────────────────────────

describe("A — the reported regression: add ops, then sync, on Cursor and Codex", () => {
  it.each([["cursor"], ["codex"]] as const)(
    "tools=%s: sync and check both exit 0 after `add ops -y`",
    async (tool) => {
      const repo = await freshRepo([tool]);

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
        const repo = await freshRepo(tools);
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
        const repo = await freshRepo(tools);
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
      const repo = await freshRepo(["cursor"]);
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
      const repo = await freshRepo(["cursor"]);
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
      const repo = await freshRepo(["cursor"]);
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

  // B6-B9: the same-class half of the name check (REQ-PACK-005). Until it, the
  // add-time check reported a name only when owners of two classes held it, and
  // the ledger gate caught a same-class id only where a ledger row already
  // recorded it, so these packs passed `add` and were refused at `sync`.
  describe.each(SETS)("tools=%s", (_, tools) => {
    it(
      "B6: add refuses a pack skill taking the id of a core skill this setup has not synced yet, naming the core owner",
      async () => {
        const repo = await freshRepo(tools);
        await withoutSyncedCore(repo, "skill", "handoff");
        const pack = await writePack("acme-demo", {
          "skills/st-handoff/SKILL.md": artifact("handoff", "skill", "Acme shift handoff steps."),
        });
        const before = await treeDigest(repo);

        const added = await addPack(repo, pack);

        expect(
          added.code,
          `same-class name clash: add must refuse a pack skill "handoff", the id the core skill holds even where no ledger row records it — ${said(added)}`,
        ).not.toBe(0);
        expect(
          linesWith(added.output, /st-handoff/, /\bcore\b/i, /acme-demo/),
          `same-class name clash: the refusal must name st-handoff, the core owner and the pack acme-demo — ${said(added)}`,
        ).not.toEqual([]);
        expect(
          await treeDigest(repo),
          "same-class name clash: a refused add must leave the repository tree unchanged",
        ).toBe(before);
      },
      CASE_TIMEOUT,
    );
  });

  it(
    "B7 (tools=cursor): add refuses a pack skill in folder st-verify under another id — it emits st-verify, a core skill",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const pack = await writePack("acme-demo", {
        "skills/st-verify/SKILL.md": artifact("acme-verify", "skill", "Acme verification steps."),
      });
      const before = await treeDigest(repo);

      const added = await addPack(repo, pack);

      expect(
        added.code,
        `same-class name clash: add must refuse a pack skill whose folder emits st-verify, the core skill's folder — ${said(added)}`,
      ).not.toBe(0);
      expect(
        linesWith(added.output, /st-verify/, /\bcore\b/i, /acme-verify/),
        `same-class name clash: the refusal must name st-verify, the core owner and the pack skill acme-verify — ${said(added)}`,
      ).not.toEqual([]);
      expect(
        await treeDigest(repo),
        "same-class name clash: a refused add must leave the repository tree unchanged",
      ).toBe(before);
    },
    CASE_TIMEOUT,
  );

  it(
    "B8 (tools=cursor): acme-two's skill folder st-shared is refused against acme-one's, under different ids",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const first = await writePack("acme-one", {
        "skills/st-shared/SKILL.md": artifact("one-shared", "skill", "The acme-one shared skill."),
      });
      const second = await writePack("acme-two", {
        "skills/st-shared/SKILL.md": artifact("two-shared", "skill", "The acme-two shared skill."),
      });
      const one = await addPack(repo, first);
      expect(one.code, `fixture: acme-one must install — ${said(one)}`).toBe(0);
      const before = await treeDigest(repo);

      const two = await addPack(repo, second);

      expect(
        two.code,
        `same-class name clash: add acme-two must refuse — its skill emits st-shared, acme-one's skill folder — ${said(two)}`,
      ).not.toBe(0);
      expect(
        linesWith(two.output, /st-shared/, /acme-one/, /acme-two/),
        `same-class name clash: the refusal must name st-shared and both packs as its owners — ${said(two)}`,
      ).not.toEqual([]);
      expect(
        await treeDigest(repo),
        "same-class name clash: the refused second add must leave the tree unchanged",
      ).toBe(before);
    },
    CASE_TIMEOUT,
  );

  it(
    "B9 (tools=cursor): re-adding the same pack replaces its own skill, never a clash",
    async () => {
      const repo = await freshRepo(["cursor"]);
      const pack = await writePack("acme-demo", {
        "skills/st-acme-lint/SKILL.md": artifact("acme-lint", "skill", "The acme lint skill."),
      });
      const first = await addPack(repo, pack);
      expect(first.code, `fixture: acme-demo must install — ${said(first)}`).toBe(0);

      const again = await addPack(repo, pack);

      expect(
        again.code,
        `same-class name clash: a re-add of acme-demo must not count its own installed st-acme-lint as a clash — ${said(again)}`,
      ).toBe(0);
    },
    CASE_TIMEOUT,
  );

  // B10-B12: the same-class half of the ID check (REQ-PACK-005, review/6). The
  // ledger gate compared a pack's catalog ids with ledger rows alone, and the
  // name check names an agent and a pack rule not at all and a skill by its
  // folder, so a pack taking the id of a core artifact this setup has not
  // synced yet passed `add` and was refused by `sync`'s walk after its files
  // and rows were written.
  const unsyncedCoreIdCases = [
    {
      label: "B10 (tools=cursor): a pack agent declaring id: reviewer, the core agent's",
      type: "agent",
      id: "reviewer",
      relPath: "agents/acme-reviewer.md",
      file: /agents\/acme-reviewer\.md/,
      core: /agents\/stamity-reviewer\.md/,
    },
    {
      label: "B11 (tools=cursor): a pack skill in skills/st-acme/ declaring id: handoff, the core skill's",
      type: "skill",
      id: "handoff",
      relPath: "skills/st-acme/SKILL.md",
      file: /skills\/st-acme\/<file>/,
      core: /skills\/st-handoff\/<file>/,
    },
    {
      label: "B12 (tools=cursor): a pack rule declaring id: question-protocol, the core rule's",
      type: "rule",
      id: "question-protocol",
      relPath: "rules/acme-protocol.md",
      file: /rules\/acme-protocol\.md/,
      core: /rules\/stamity-question-protocol\.md/,
    },
  ] as const;
  for (const shape of unsyncedCoreIdCases) {
    it(
      `${shape.label}: add refuses it while no ledger row records the core id, naming the core owner`,
      async () => {
        const repo = await freshRepo(["cursor"]);
        await withoutSyncedCore(repo, shape.type, shape.id);
        const pack = await writePack("acme-demo", {
          [shape.relPath]: artifact(shape.id, shape.type, "Acme fixture artifact."),
        });
        const before = await treeDigest(repo);

        const added = await addPack(repo, pack);

        expect(
          added.code,
          `same-class id clash: add must refuse a pack ${shape.type} taking the core id "${shape.id}" even where no ledger row records it — ${said(added)}`,
        ).not.toBe(0);
        expect(
          linesWith(
            added.output,
            shape.file,
            new RegExp(`${shape.type} id "${shape.id}"`),
            /\bcore\b/i,
            shape.core,
          ),
          `same-class id clash: one refusal line must name the pack file, the id and the core owner's file — ${said(added)}`,
        ).not.toEqual([]);
        expect(
          await treeDigest(repo),
          "same-class id clash: a refused add must leave the repository tree unchanged",
        ).toBe(before);
      },
      CASE_TIMEOUT,
    );
  }
});

/**
 * Makes `repo` a setup that has not synced the core artifact `type`/`id` yet,
 * as one does right after an engine upgrade adds it: no selection entry, no
 * ledger row and no client copy. The bundled corpus still ships it, so the core
 * holds the id (and, for a skill, its folder name) whether or not this setup
 * records it.
 *
 * Why the manifest is edited rather than reached by a verb: `sync` refreshes
 * the selection to the full corpus (`fullCorpusSelection`,
 * `src/cli/engine/emissionWrite.ts`), and no verb unselects one core artifact.
 */
async function withoutSyncedCore(
  repo: string,
  type: "agent" | "rule" | "skill",
  id: string,
): Promise<void> {
  const manifest = await readManifest(repo);
  if (manifest === null) throw new Error("withoutSyncedCore: the repository has no manifest");
  const dropped = manifest.ledger.filter(
    (entry) => entry.artifactType === type && entry.artifactId === id,
  );
  if (dropped.length === 0) {
    throw new Error(`withoutSyncedCore: no ledger row records the core ${type} "${id}"`);
  }
  await Promise.all(
    dropped.map(async (entry) => await rm(join(repo, ...entry.path.split("/")), { force: true })),
  );
  await writeManifest(repo, {
    ...manifest,
    selection: {
      ...manifest.selection,
      items: {
        ...manifest.selection.items,
        [type]: manifest.selection.items[type].filter((held) => held !== id),
      },
    },
    ledger: manifest.ledger.filter((entry) => !dropped.includes(entry)),
  });
}

// ── C: defect 2, the Codex skills list ─────────────────────────────────────

/** Four skills at 900 characters: the core's list plus these is past 8,000 on Codex. */
const OVER_CAP_SKILLS: Record<string, string> = Object.fromEntries(
  [1, 2, 3, 4].map((n) => [
    `skills/st-acme-skill-${n}/SKILL.md`,
    artifact(`acme-skill-${n}`, "skill", prose(900, `skill ${n}`)),
  ]),
);

describe("C — defect 2 (Codex skills list): count only the rows Codex shows its model", () => {
  describe.each(SETS.filter(([, tools]) => tools.includes("codex")))("tools=%s", (_, tools) => {
    it(
      "C1: a commands-only pack past the core's headroom still syncs — command rows are never shown",
      async () => {
        const repo = await freshRepo(tools);
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
        const repo = await freshRepo(tools);
        // TEST CHANGE, justified (2026-10-21, 2026-10-20_packs-rebuilt/u4-pack-fit): `add` now
        // refuses this pack before it writes (REQ-PACK-004, case C3 below), so the fixture
        // installs it the way an engine without the fit check left it, through
        // `installBypassingAdd`; `sync`'s refusal is still what this case proves, unchanged.
        // Four skills at 900 characters (each under 1,000) add about 3,670 shown
        // characters to the core's 4,759: over 8,000 under either way of counting.
        await installBypassingAdd(repo, "acme-demo", OVER_CAP_SKILLS);

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

    it(
      "C3: add refuses the same over-cap skills pack before it writes, naming the pack and both sizes",
      async () => {
        const repo = await freshRepo(tools);
        const before = await readManifest(repo);

        const added = await addPack(repo, await writePack("acme-demo", OVER_CAP_SKILLS));

        expect(
          added.code,
          `REQ-PACK-004: add must refuse a pack the next sync would refuse for the skills list — ${said(added)}`,
        ).toBe(1);
        expect(
          linesWith(added.output, /pack "acme-demo" does not fit Codex's skills list/, /\d[\d,]* of 8,000/),
          `REQ-PACK-004: the refusal names the pack, its share and the total in one statement — ${said(added)}`,
        ).not.toEqual([]);
        expect(await readManifest(repo), "REQ-PACK-004: the refusal writes nothing").toEqual(before);
      },
      CASE_TIMEOUT,
    );
  });
});

// ── D: defect 3, plugin mode — retired ─────────────────────────────────────

// TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d6-verb): group D set
// its template repositories up through `stamity plugin setup`, a verb 1.15.0 deleted
// with the plugin route and the plugin-backed install mode (REQ-PLUGIN-047). Its two
// cases (a pack skill reaching a plugin-backed client; the pack-reach row for a pack
// that reaches no client) have no setup path left, so the group went with the verb.
// Generated mode, which groups A, B, C and E drive, never took the plugin branches.

// ── E: defect 4, an overlay on a pack skill ────────────────────────────────

const OVERLAY_PATH = ".stamity/overrides/skills/acme-lint/SKILL.customize.md";

describe("E — defect 4 (overlay on a pack skill): refused loudly by sync and validate", () => {
  describe.each(SETS)("tools=%s", (_, tools) => {
    it(
      "sync and validate exit non-zero, naming the overlay's path and the pack skill",
      async () => {
        const repo = await freshRepo(tools);
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
