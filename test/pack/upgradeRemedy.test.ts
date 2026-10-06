import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
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
import { describePackIntegrityFinding, reAddArgsOf } from "../../src/pack/verifyInstalled.ts";
import { packOwner, type LedgerEntry } from "../../src/types/manifest.ts";
import { npxCommand } from "../support/identity.ts";
import { runInProcess, type InProcessResult } from "../support/inProcess.ts";
import { seedGitRepo } from "../support/repoFixtures.ts";
import { makeTempDir, type TempDirHandle } from "../support/tempDir.ts";

/**
 * The real upgrade path a 1.11.0 user on Claude takes (run
 * 2026-10-03_pack-engine-defects, prove/3). 1.11.0's `ops` shipped the skills
 * `st-release` and `st-incident-response` beside the commands of those names,
 * and its `sync` projected all of it into `.claude/` without a word. This
 * engine's `sync` refuses that clash and prints a remedy; following the remedy
 * step by step, in the order printed, must reach a repository `check` passes.
 *
 * The three-step order the remedy printed first (`clean --pack`, `add`, `sync`)
 * failed at `add`: `clean --pack` removes only `.stamity/packs/ops/`, the copies
 * the earlier `sync` projected stay ledgered, and `add` finds their paths
 * "already owned". The remedy now runs `sync` between `clean --pack` and `add`.
 *
 * No mocks. The installed 1.11.0 pack is written from the installer's record
 * formats, bypassing `add` (whose gates now refuse it), as
 * `packEngineDefects.test.ts`'s B5 does. Its projected copies are produced by
 * this engine's own `sync` in two scratch repositories — one holding the old
 * pack without its two clashing skills, one without its two clashing commands,
 * neither of which clashes — and then carried, files and ledger rows, into the
 * repository under test, which is the state 1.11.0's single `sync` left.
 */

const CASE_TIMEOUT = 120_000;

/** The shipped `ops` pack, which the 1.11.0 shape is derived from. */
const OPS_ROOT = fileURLToPath(new URL("../../packs/ops", import.meta.url));

/** The two names 1.11.0's `ops` gave both a command and a skill. */
const CLASHING = ["st-release", "st-incident-response"] as const;

let suite: TempDirHandle;

beforeAll(async () => {
  suite = await makeTempDir("upgrade-remedy");
});

afterAll(async () => {
  await suite.cleanup();
});

type CliResult = InProcessResult & { output: string };

async function cli(cwd: string, argv: readonly string[]): Promise<CliResult> {
  const result = await runInProcess(COMMANDS, argv, { cwd });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

function said(result: CliResult): string {
  return `exit ${result.code}; output: ${result.output.slice(0, 2000)}`;
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split("\\").join("/"));
}

/**
 * The `ops` pack as 1.11.0 shipped it: today's files with the two renames and
 * the two cross-references undone (`git diff v1.11.0 -- packs/ops`).
 */
async function opsAt1110(): Promise<Record<string, string>> {
  const rels = (await filesUnder(OPS_ROOT)).filter((rel) => rel !== "pack.json");
  const files: Record<string, string> = Object.fromEntries(
    await Promise.all(
      rels.map(async (rel) => [rel, await readFile(join(OPS_ROOT, rel), "utf8")] as const),
    ),
  );
  const renamed = (from: string, to: string, id: string): void => {
    const body = files[`skills/${from}/SKILL.md`];
    if (body === undefined) throw new Error(`fixture: the shipped ops has no skills/${from}/`);
    delete files[`skills/${from}/SKILL.md`];
    files[`skills/${to}/SKILL.md`] = body.replace(/^id: .*$/m, `id: ${id}`);
  };
  renamed("st-release-runbook", "st-release", "release");
  renamed("st-incident-runbook", "st-incident-response", "incident-response");
  const swap = (rel: string, from: string, to: string): void => {
    const body = files[rel];
    if (body?.includes(from) !== true) throw new Error(`fixture: ${rel} no longer names ${from}`);
    files[rel] = body.replace(from, to);
  };
  swap("commands/st-release.md", "`st-release-runbook` skill", "`st-release` skill");
  swap(
    "agents/stamity-incident-responder.md",
    "`st-incident-runbook` skill",
    "`stamity-incident-response` skill",
  );
  return files;
}

function without(
  files: Record<string, string>,
  drop: (rel: string) => boolean,
): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([rel]) => !drop(rel)));
}

/**
 * Installs `files` as pack `name` the way an engine without the clash check
 * left it — content, receipt and ledger rows in the formats `applyPackInstall`
 * records — replacing any rows and files the pack already had.
 */
async function installBypassingAdd(
  repo: string,
  name: string,
  files: Record<string, string>,
): Promise<void> {
  const packDir = packDirRelPath(name);
  await rm(join(repo, ...packDir.split("/")), { recursive: true, force: true });
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
    ledger: [...manifest.ledger.filter((row) => row.adapter !== packOwner(name)), ...rows].toSorted(
      (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    ),
  });
}

/** A git repository set up for Claude by `init -y --tools claude`. */
async function claudeRepo(name: string): Promise<string> {
  const repo = suite.path(name);
  await mkdir(repo, { recursive: true });
  await seedGitRepo(repo);
  const init = await cli(repo, ["init", "-y", "--tools", "claude"]);
  if (init.code !== 0) throw new Error(`fixture: init failed in ${name} — ${said(init)}`);
  return repo;
}

/**
 * The repository a 1.11.0 user has after `init --tools claude`, `add ops` and
 * `sync`: the old pack installed, and every one of its artifacts projected
 * into `.claude/` — the clashing commands AND the clashing skills.
 */
async function syncedAt1110(name: string): Promise<string> {
  const old = await opsAt1110();
  const isClashingSkill = (rel: string): boolean =>
    CLASHING.some((dir) => rel.startsWith(`skills/${dir}/`));
  const isClashingCommand = (rel: string): boolean =>
    CLASHING.some((dir) => rel === `commands/${dir}.md`);

  // The repository under test: the old pack minus its clashing skills, synced.
  const repo = await claudeRepo(name);
  await installBypassingAdd(repo, "ops", without(old, isClashingSkill));
  const first = await cli(repo, ["sync"]);
  if (first.code !== 0) throw new Error(`fixture: the commands half failed to sync — ${said(first)}`);

  // A scratch twin: the old pack minus its clashing commands, synced, so the
  // two skills get the projected copies 1.11.0 wrote for them.
  const twin = await claudeRepo(`${name}-twin`);
  await installBypassingAdd(twin, "ops", without(old, isClashingCommand));
  const second = await cli(twin, ["sync"]);
  if (second.code !== 0) throw new Error(`fixture: the skills half failed to sync — ${said(second)}`);
  const twinManifest = await readManifest(twin);
  const skillCopies = (twinManifest?.ledger ?? []).filter(
    (row) =>
      row.adapter === "claude" && CLASHING.some((dir) => row.path.startsWith(`.claude/skills/${dir}/`)),
  );
  if (skillCopies.length !== CLASHING.length) {
    throw new Error(`fixture: expected one projected copy per clashing skill, got ${skillCopies.length}`);
  }
  await Promise.all(
    skillCopies.map(async (row) => {
      const to = join(repo, ...row.path.split("/"));
      await mkdir(dirname(to), { recursive: true });
      await cp(join(twin, ...row.path.split("/")), to);
    }),
  );
  const manifest = await readManifest(repo);
  if (manifest === null) throw new Error("fixture: the repository lost its manifest");
  await writeManifest(repo, {
    ...manifest,
    ledger: [...manifest.ledger, ...skillCopies].toSorted((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  });

  // Then the whole old pack, clashing pairs included, as 1.11.0 installed it.
  await installBypassingAdd(repo, "ops", old);
  return repo;
}

/**
 * The commands the sync refusal's remedy line for pack `id` names, in order,
 * with the pinned `npx -y <package>@<version>` prefix taken off.
 */
function remedyVerbs(output: string, id: string): string[] {
  const line = output.split("\n").find((text) => text.includes(`pack "${id}": run `));
  if (line === undefined) return [];
  return [...line.matchAll(/`([^`]+)`/g)].map((match) =>
    (match[1] ?? "").replace(/^npx -y \S+ /, "").replace(/^stamity /, ""),
  );
}

/** The backtick-quoted commands in `span`, with the pinned prefix taken off. */
function quotedVerbs(span: string): string[] {
  return [...span.matchAll(/`([^`]+)`/g)].map((match) =>
    (match[1] ?? "").replace(/^npx -y \S+ /, "").replace(/^stamity /, ""),
  );
}

/**
 * The commands `add`'s path-collision refusal names for pack `id`, in order:
 * the span between `pack "<id>" is` (installed or not installed — the two
 * states take different steps, review/57) and the stray clause after it.
 */
function collisionVerbs(output: string, id: string): string[] {
  const start = output.indexOf(`pack "${id}" is `);
  if (start < 0) return [];
  const end = output.indexOf("; for a file no ledger row owns", start);
  return quotedVerbs(output.slice(start, end < 0 ? undefined : end));
}

/** Runs `steps` in order in `repo`, each one exiting 0; -y for the verbs that ask. */
async function runSteps(repo: string, steps: readonly string[]): Promise<void> {
  for (const step of steps) {
    const argv = step.split(" ");
    if (argv[0] === "clean" || argv[0] === "add") argv.push("-y");
    // oxlint-disable-next-line no-await-in-loop -- sequential: each step reads the state the one before it left
    const result = await cli(repo, argv);
    expect(result.code, `remedy step \`${argv.join(" ")}\` must exit 0 — ${said(result)}`).toBe(0);
  }
}

describe("the 1.11.0 ops upgrade on Claude, by the remedy the sync refusal prints", () => {
  it(
    "sync refuses the installed clash, and the printed steps, run in order, each exit 0 and leave check green",
    async () => {
      const repo = await syncedAt1110("synced");
      const installed = await readManifest(repo);
      for (const path of [
        ".claude/commands/st-release.md",
        ".claude/skills/st-release/SKILL.md",
        ".claude/agents/stamity-devops.md",
        ".claude/skills/st-ci-pipeline/SKILL.md",
      ]) {
        expect(
          installed?.ledger.some((row) => row.path === path && row.adapter === "claude"),
          `fixture: the 1.11.0 sync's copy ${path} must be ledgered`,
        ).toBe(true);
      }

      const refused = await cli(repo, ["sync"]);
      expect(refused.code, `sync must refuse the installed clash — ${said(refused)}`).not.toBe(0);
      for (const name of CLASHING) {
        expect(refused.output, `the refusal must name ${name}`).toContain(name);
      }

      const steps = remedyVerbs(refused.output, "ops");
      expect(steps, `the printed remedy for pack "ops" — ${said(refused)}`).toEqual([
        "clean --pack ops",
        "sync",
        "add ops",
        "sync",
      ]);

      // The steps run one after another, in the printed order: each reads the
      // state the one before it left.
      for (const step of steps) {
        const argv = step.split(" ");
        // Non-interactive: the destructive and installing verbs take -y.
        if (argv[0] === "clean" || argv[0] === "add") argv.push("-y");
        // oxlint-disable-next-line no-await-in-loop -- sequential by design (above)
        const result = await cli(repo, argv);
        expect(result.code, `remedy step \`${argv.join(" ")}\` must exit 0 — ${said(result)}`).toBe(0);
      }

      const checked = await cli(repo, ["check"]);
      expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
      const manifest = await readManifest(repo);
      const paths = new Set(manifest?.ledger.map((row) => row.path));
      expect(paths.has(".claude/skills/st-release-runbook/SKILL.md")).toBe(true);
      expect(paths.has(".claude/skills/st-release/SKILL.md")).toBe(false);
      expect(paths.has(".claude/skills/st-incident-response/SKILL.md")).toBe(false);
    },
    CASE_TIMEOUT,
  );

  it(
    "add straight after clean --pack is refused on the copies, and its printed remedy runs to exit 0 (prove/5)",
    async () => {
      const repo = await syncedAt1110("collision");

      const cleaned = await cli(repo, ["clean", "--pack", "ops", "-y"]);
      expect(cleaned.code, `clean --pack ops must exit 0 — ${said(cleaned)}`).toBe(0);

      // The three-step order's second step: the projected copies still own
      // their paths, so add refuses on the collision.
      const refused = await cli(repo, ["add", "ops", "-y"]);
      expect(refused.code, `add right after clean --pack must refuse — ${said(refused)}`).toBe(1);
      expect(refused.output).toContain("path(s) it would write are not free");
      expect(refused.output).toContain(".claude/agents/stamity-devops.md");

      // TEST CHANGE, justified (review/57): 2026-10-06. The prove/5 remedy led
      // with `clean --pack <id>`, which exits 1 here — the pack has no rows
      // left — so this case skipped it by hand. Not installed, the printed
      // steps are sync, add, sync, and every one of them runs.
      expect(refused.output).toContain('pack "ops" is not installed');
      const steps = collisionVerbs(refused.output, "ops");
      expect(steps, `the collision refusal's printed remedy — ${said(refused)}`).toEqual([
        "sync",
        "add ops",
        "sync",
      ]);
      await runSteps(repo, steps);

      const checked = await cli(repo, ["check"]);
      expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
    },
    CASE_TIMEOUT,
  );

  it(
    "add over the installed 1.11.0 ops is refused on its client copies, and the installed-state remedy runs to exit 0 (review/57)",
    async () => {
      const repo = await syncedAt1110("collision-installed");

      const refused = await cli(repo, ["add", "ops", "-y"]);
      expect(refused.code, `add over the synced old pack must refuse — ${said(refused)}`).toBe(1);
      expect(refused.output).toContain("path(s) it would write are not free");
      expect(refused.output).toContain('pack "ops" is installed: to replace it');

      const steps = collisionVerbs(refused.output, "ops");
      expect(steps, `the collision refusal's printed remedy — ${said(refused)}`).toEqual([
        "clean --pack ops",
        "sync",
        "add ops",
        "sync",
      ]);
      await runSteps(repo, steps);

      const checked = await cli(repo, ["check"]);
      expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
    },
    CASE_TIMEOUT,
  );
});

/**
 * The integrity remedy, run as printed (review/56, review/58, review/59): the
 * pack is installed by `install` (argv for `add`) and synced, one of its files
 * is edited, and `check`'s finding line must give the four steps with an `add`
 * that names the source the receipt recorded — `addStep` — while the
 * next-steps block prints the same order. Following it, the edited file moved
 * out first, exits 0 at each step and leaves `check` green.
 */
async function integrityRemedyRuns(
  name: string,
  install: readonly string[],
  addStep: string,
  before?: (repo: string) => Promise<void>,
): Promise<void> {
  const repo = await claudeRepo(name);
  await before?.(repo);
  const added = await cli(repo, [...install, "-y"]);
  expect(added.code, `fixture: ${install.join(" ")} — ${said(added)}`).toBe(0);
  const synced = await cli(repo, ["sync"]);
  expect(synced.code, `fixture: sync — ${said(synced)}`).toBe(0);

  const edited = ".stamity/packs/ops/agents/stamity-devops.md";
  const editedAbs = join(repo, ...edited.split("/"));
  const body = `${await readFile(editedAbs, "utf8")}\nA local edit.\n`;
  await writeFile(editedAbs, body, "utf8");

  const json = await cli(repo, ["check", "--json"]);
  expect(json.code, `check must fail the edited pack — ${said(json)}`).toBe(1);
  const doc = JSON.parse(json.stdout) as { doctor: { id: string; detail: string }[] };
  const detail = doc.doctor.find((entry) => entry.id === "pack-integrity")?.detail ?? "";
  expect(detail).toContain(edited);
  expect(detail).toContain("move this file out of the pack's directory or delete it first");
  const steps = quotedVerbs(detail.slice(detail.indexOf("re-install the pack:")));
  expect(steps, `the finding line's order — ${detail}`).toEqual([
    "clean --pack ops",
    "sync",
    addStep,
    "sync",
  ]);

  // The next-steps block prints the same order and the same first step.
  const human = await cli(repo, ["check"]);
  const next = human.output.slice(human.output.indexOf("next:"));
  expect(next).toContain(
    "move any edited file the pack-integrity row names out of the pack's directory or delete it first",
  );
  expect(next).toContain(
    `${npxCommand("clean --pack <id>")}, then ${npxCommand("sync")}, then ` +
      `${npxCommand("add <source>")}, then ${npxCommand("sync")}`,
  );

  // The printed first step, by hand: move the edited file out of the pack.
  const keep = join(repo, "kept-devops.md");
  await rename(editedAbs, keep);
  await runSteps(repo, steps);

  const checked = await cli(repo, ["check"]);
  expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
  expect(await readFile(keep, "utf8"), "the moved copy keeps the edit").toBe(body);
  expect(await readFile(editedAbs, "utf8")).not.toBe(body);
}

describe("an edited pack file, by the remedy check's pack-integrity row prints", () => {
  it(
    "a catalog pack: the step re-adds it by its catalog id, and the printed order runs to exit 0 (review/56, review/58, review/59)",
    async () => {
      await integrityRemedyRuns("integrity-catalog", ["add", "ops"], "add ops");
    },
    CASE_TIMEOUT,
  );

  it(
    "a local-path pack: the step re-adds it from the recorded path, with --allow-untrusted as its install needed, and runs to exit 0 (review/59)",
    async () => {
      await integrityRemedyRuns(
        "integrity-local",
        ["add", "./vendor/ops", "--allow-untrusted"],
        "add ./vendor/ops --allow-untrusted",
        async (repo) => {
          await cp(OPS_ROOT, join(repo, "vendor", "ops"), { recursive: true });
        },
      );
    },
    CASE_TIMEOUT,
  );
});

describe("the re-add source a pack's receipt records (review/59)", () => {
  const receipt = (kind: string, spec: string, trustTier: string): unknown => ({
    source: { kind, spec },
    trustTier,
  });

  it("names a catalog pack by its catalog id, whatever resolved path the receipt holds", () => {
    expect(
      reAddArgsOf("ops", receipt("local-path", "/somewhere/packs/ops", "curator-verified")),
    ).toBe("ops");
  });

  it("names an npm package by its name, with --allow-untrusted only at the unsigned floor", () => {
    expect(reAddArgsOf("@acme/ops", receipt("npm-package", "@acme/ops", "pinned-unsigned"))).toBe(
      "@acme/ops --allow-untrusted",
    );
    expect(reAddArgsOf("@acme/ops", receipt("npm-package", "@acme/ops", "publisher-signed"))).toBe(
      "@acme/ops",
    );
  });

  it("quotes a path a shell would split or read, and drops control characters", () => {
    expect(reAddArgsOf("demo", receipt("local-path", "./my packs/demo", "publisher-signed"))).toBe(
      "'./my packs/demo'",
    );
    expect(reAddArgsOf("demo", receipt("local-path", "./it's", "publisher-signed"))).toBe(
      "'./it'\\''s'",
    );
    expect(reAddArgsOf("demo", receipt("local-path", "./demo\u0007", "publisher-signed"))).toBe(
      "./demo",
    );
  });

  it("names nothing for a receipt it cannot read, and the line then says so in words", () => {
    expect(reAddArgsOf("demo", null)).toBeNull();
    expect(reAddArgsOf("demo", { source: { kind: "local-path" }, trustTier: "scanned" })).toBeNull();
    expect(reAddArgsOf("unlisted", receipt("local-path", "/x", "curator-verified"))).toBeNull();
    const line = describePackIntegrityFinding({
      packId: "demo",
      relPath: ".stamity/packs/demo/agents/a.md",
      expected: "a".repeat(64),
      actual: null,
      reAdd: null,
    });
    expect(line).toContain('add pack "demo" again from the source you installed it from');
    expect(quotedVerbs(line.slice(line.indexOf("re-install the pack:")))).toEqual([
      "clean --pack demo",
      "sync",
      "sync",
    ]);
  });
});
