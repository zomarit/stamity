import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { COMMANDS } from "../../src/cli.ts";
import type * as CuratedApi from "../../src/pack/curated.ts";
import { readManifest, writeManifest } from "../../src/manifest/manifest.ts";
import type { PackContentClass } from "../../src/pack/manifest.ts";
import {
  buildReceipt,
  packDirRelPath,
  RECEIPT_FILE,
  receiptRelPath,
  serializeReceipt,
} from "../../src/pack/receipt.ts";
import { reAddArgsOf } from "../../src/cli/commands/check.ts";
import { describePackIntegrityFinding } from "../../src/pack/verifyInstalled.ts";
import { packOwner, type LedgerEntry } from "../../src/types/manifest.ts";
import { npxCommand } from "../support/identity.ts";
import { runInProcess, type InProcessResult } from "../support/inProcess.ts";
import { madeUpArtifact } from "../support/packFixtures.ts";
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
 * failed at `add`: `clean --pack` removes only `.stamity/packs/<id>/`, the copies
 * the earlier `sync` projected stay ledgered, and `add` finds their paths
 * "already owned". The remedy now runs `sync` between `clean --pack` and `add`.
 *
 * No mocks. The installed earlier copy is written from the installer's record
 * formats, bypassing `add` (whose gates now refuse it), as
 * `packEngineDefects.test.ts`'s B5 does. Its projected copies are produced by
 * this engine's own `sync` in two scratch repositories — one holding the old
 * pack without its two clashing skills, one without its two clashing commands,
 * neither of which clashes — and then carried, files and ledger rows, into the
 * repository under test, which is the state 1.11.0's single `sync` left.
 *
 * TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): the
 * earlier copy was derived from the shipped `ops` folder, with its renames undone; `ops`
 * is retired (REQ-PACK-023). The shape is frozen inline as a made-up earlier release of
 * the catalog pack the package keeps ({@link EARLIER_RELEASE}). It is installed under a
 * catalog id because the printed remedy re-adds the pack by its id
 * (`src/emit/planner.ts` → `remedyOf`), so only a catalog id makes that step runnable;
 * and it shares one skill id with the shipped pack, so `add` meets the client copy that
 * claims it, as `add ops` met 1.11.0's.
 */

const CASE_TIMEOUT = 120_000;

/** The catalog pack the earlier copy is installed as, and the integrity cases install. */
const PACK = "frontend";

/** The shipped pack's folder, which the local-path and scoped integrity cases vendor. */
const PACK_ROOT = fileURLToPath(new URL(`../../packs/${PACK}`, import.meta.url));

/**
 * One skill the shipped pack carries, pack-relative, and where `sync` projects it
 * for Claude. The earlier release carries a skill of the same id.
 */
const SHARED_SKILL = "skills/st-browser-evidence/SKILL.md";
const SHARED_SKILL_COPY = ".claude/skills/st-browser-evidence/SKILL.md";

/** The two names the earlier release gave both a command and a skill. */
const CLASHING = ["st-screen-check", "st-token-audit"] as const;

/**
 * The earlier release, frozen: an agent, the two clashing command-and-skill pairs,
 * and a skill under the id the shipped pack still uses. Every body is made up.
 */
const EARLIER_RELEASE: Readonly<Record<string, string>> = {
  "agents/stamity-ui-auditor.md": madeUpArtifact(
    "ui-auditor",
    "agent",
    "Audits one acme screen against its design tokens.",
  ).replace("load: on-demand", "load: on-demand\ncapabilities: [read, edit, execute]"),
  "commands/st-screen-check.md": madeUpArtifact("screen-check", "command", "Checks one acme screen end to end."),
  "commands/st-token-audit.md": madeUpArtifact("token-audit", "command", "Audits the acme design tokens."),
  "skills/st-screen-check/SKILL.md": madeUpArtifact(
    "screen-check",
    "skill",
    "Steps for one acme screen check. Triggers when a screen changes.",
  ),
  "skills/st-token-audit/SKILL.md": madeUpArtifact(
    "token-audit",
    "skill",
    "Steps for one acme token audit. Triggers when a token changes.",
  ),
  [SHARED_SKILL]: madeUpArtifact(
    "browser-evidence",
    "skill",
    "Captures acme browser evidence. Triggers when a rendered surface changes.",
  ),
};

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

/**
 * The earlier release, after checking the shipped pack still carries the shared
 * skill: without it `add` would meet no client copy and the refusals below would
 * test nothing.
 */
async function earlierRelease(): Promise<Record<string, string>> {
  const shipped = JSON.parse(await readFile(join(PACK_ROOT, "pack.json"), "utf8")) as {
    integrity?: Record<string, string>;
  };
  if (shipped.integrity?.[SHARED_SKILL] === undefined) {
    throw new Error(`fixture: the shipped ${PACK} pack no longer carries ${SHARED_SKILL}`);
  }
  return { ...EARLIER_RELEASE };
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
 * The repository a 1.11.0 user has after `init --tools claude`, an `add` of the
 * earlier release and `sync`: the old pack installed, and every one of its
 * artifacts projected into `.claude/` — the clashing commands AND the clashing skills.
 */
async function syncedAt1110(name: string): Promise<string> {
  const old = await earlierRelease();
  const isClashingSkill = (rel: string): boolean =>
    CLASHING.some((dir) => rel.startsWith(`skills/${dir}/`));
  const isClashingCommand = (rel: string): boolean =>
    CLASHING.some((dir) => rel === `commands/${dir}.md`);

  // The repository under test: the old pack minus its clashing skills, synced.
  const repo = await claudeRepo(name);
  await installBypassingAdd(repo, PACK, without(old, isClashingSkill));
  const first = await cli(repo, ["sync"]);
  if (first.code !== 0) throw new Error(`fixture: the commands half failed to sync — ${said(first)}`);

  // A scratch twin: the old pack minus its clashing commands, synced, so the
  // two skills get the projected copies 1.11.0 wrote for them.
  const twin = await claudeRepo(`${name}-twin`);
  await installBypassingAdd(twin, PACK, without(old, isClashingCommand));
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
  await installBypassingAdd(repo, PACK, old);
  return repo;
}

/**
 * The pinned prefix this checkout's remedies carry — `npx -y <package>@<version> `, with a
 * `--registry` fork's `--@<scope>:registry=<url>` word in it (REQ-PLUGIN-048) — derived rather
 * than matched as one word after `-y`, which a registry fork's two words would defeat.
 */
const PINNED_PREFIX = `${npxCommand("").trimEnd()} `;

/** One quoted command with the pinned prefix, or the bare `stamity `, taken off. */
function verbOf(command: string): string {
  const unpinned = command.startsWith(PINNED_PREFIX) ? command.slice(PINNED_PREFIX.length) : command;
  return unpinned.replace(/^stamity /, "");
}

/**
 * The commands the sync refusal's remedy line for pack `id` names, in order,
 * with the pinned prefix taken off.
 */
function remedyVerbs(output: string, id: string): string[] {
  const line = output.split("\n").find((text) => text.includes(`pack "${id}": run `));
  if (line === undefined) return [];
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => verbOf(match[1] ?? ""));
}

/** The backtick-quoted commands in `span`, with the pinned prefix taken off. */
function quotedVerbs(span: string): string[] {
  return [...span.matchAll(/`([^`]+)`/g)].map((match) => verbOf(match[1] ?? ""));
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

/**
 * The client copies a `clean --pack` run kept and named: its sweep lines
 * (`  skipped-…  <path> — <detail>`) for paths under a client folder.
 */
function keptCopies(output: string): string[] {
  return [...output.matchAll(/^ {2}skipped-\S+ {2}(\.\S+) — /gm)]
    .map((match) => match[1] ?? "")
    .filter((path) => !path.startsWith(".stamity/"));
}

/**
 * Runs `steps` as {@link runSteps} does, plus the step by hand the remedy names
 * after `clean --pack`: each client copy it keeps and names is deleted.
 */
async function runStepsDeletingKept(repo: string, steps: readonly string[]): Promise<string[]> {
  const deleted: string[] = [];
  for (const step of steps) {
    const argv = step.split(" ");
    if (argv[0] === "clean" || argv[0] === "add") argv.push("-y");
    // oxlint-disable-next-line no-await-in-loop -- sequential: each step reads the state the one before it left
    const result = await cli(repo, argv);
    expect(result.code, `remedy step \`${argv.join(" ")}\` must exit 0 — ${said(result)}`).toBe(0);
    if (argv[0] !== "clean") continue;
    for (const path of keptCopies(result.output)) {
      // oxlint-disable-next-line no-await-in-loop -- the step by hand, one named file at a time
      await rm(join(repo, ...path.split("/")));
      deleted.push(path);
    }
  }
  return deleted;
}

/**
 * The 1.11.0 copies the clash leaves unprovable: each must be among those `clean --pack` keeps and names.
 *
 * TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): these were
 * `ops`'s agent, command and skill copies; the earlier release is now made up
 * ({@link EARLIER_RELEASE}), so they are its copies — one per class, and the shared skill's.
 */
const UNPROVABLE = [
  ".claude/agents/stamity-ui-auditor.md",
  ".claude/commands/st-screen-check.md",
  ".claude/skills/st-screen-check/SKILL.md",
  SHARED_SKILL_COPY,
] as const;

describe("the 1.11.0 pack upgrade on Claude, by the remedy the sync refusal prints", () => {
  it(
    "sync refuses the installed clash, and the printed steps, run in order, each exit 0 and leave check green",
    async () => {
      const repo = await syncedAt1110("synced");
      const installed = await readManifest(repo);
      for (const path of UNPROVABLE) {
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

      const steps = remedyVerbs(refused.output, PACK);
      expect(steps, `the printed remedy for pack "${PACK}" — ${said(refused)}`).toEqual([
        `clean --pack ${PACK}`,
        "sync",
        `add ${PACK}`,
        "sync",
      ]);

      // TEST CHANGE, justified (2026-10-08, unit d1a2-clean-pack-copies; the declared
      // default recorded in the run's record): `clean --pack` now removes a pack's client
      // copies itself, only as bytes the engine renders from the installed pack. This
      // pack's own command and skill clash, so the planner refuses it and no copy can be
      // proven: `clean --pack` keeps each one and names it, and the remedy gains the step
      // by hand that deletes them before the `sync`. The four commands, their order and
      // the green `check` at the end are unchanged; the steps now run with that step.
      expect(refused.output).toContain("then delete by hand each client copy it keeps and names");
      const deleted = await runStepsDeletingKept(repo, steps);
      for (const path of UNPROVABLE) expect(deleted, `kept and named: ${path}`).toContain(path);

      const checked = await cli(repo, ["check"]);
      expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
      const manifest = await readManifest(repo);
      const paths = new Set(manifest?.ledger.map((row) => row.path));
      // TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): the
      // re-added pack's projection was `ops`'s renamed `st-release-runbook`; it is the shipped
      // pack's own skill, and neither clashing skill keeps a row.
      expect(paths.has(SHARED_SKILL_COPY)).toBe(true);
      for (const name of CLASHING) expect(paths.has(`.claude/skills/${name}/SKILL.md`), name).toBe(false);
    },
    CASE_TIMEOUT,
  );

  // TEST CHANGE, justified (2026-10-08, unit d1a2-clean-pack-copies; the declared default
  // recorded in the run's record): the case was "add straight after clean --pack is refused
  // on the copies, and its printed remedy runs to exit 0 (prove/5)". `clean --pack` now
  // removes a pack's client copies itself, but this pack cannot be planned (its command and
  // skill clash), so the copies are kept and named.
  // TEST CHANGE, justified (2026-10-08, review/61 and build/43, the lane D fixer): a copy the
  // proof could not judge keeps its ledger row (unproven is not disproven), so `add` right
  // after `clean --pack` is refused on the copies again, as the case first read. Its printed
  // not-installed remedy gains the step by hand: once the pack is gone `sync` keeps each copy
  // and drops its row, and left on disk it collides with the re-added pack's. What prove/5
  // pins holds: the printed steps, run in order, reach a `check` that exits 0.
  it(
    "add straight after clean --pack is refused on the copies whose rows it kept, and its printed remedy runs to a green check (prove/5)",
    async () => {
      const repo = await syncedAt1110("collision");

      const cleaned = await cli(repo, ["clean", "--pack", PACK, "-y"]);
      expect(cleaned.code, `clean --pack ${PACK} must exit 0 — ${said(cleaned)}`).toBe(0);
      expect(cleaned.output).toContain(`Pack "${PACK}" could not be planned as installed`);
      const kept = keptCopies(cleaned.output);
      for (const path of UNPROVABLE) expect(kept, `kept and named: ${path}`).toContain(path);
      const rows = new Set((await readManifest(repo))?.ledger.map((row) => row.path));
      for (const path of kept) expect(rows.has(path), `the row of ${path} stays`).toBe(true);

      const refused = await cli(repo, ["add", PACK, "-y"]);
      expect(refused.code, `add right after clean --pack must refuse the claimed copies — ${said(refused)}`).toBe(1);
      expect(refused.output).toContain(`pack "${PACK}" is not installed`);
      expect(collisionVerbs(refused.output, PACK)).toEqual(["sync", `add ${PACK}`, "sync"]);
      expect(refused.output).toContain("then delete by hand each client copy it keeps and names, unless it is yours");

      // The printed steps: `sync`, the step by hand over what it keeps and names, `add`, `sync`.
      const synced = await cli(repo, ["sync"]);
      expect(synced.code, `remedy step \`sync\` must exit 0 — ${said(synced)}`).toBe(0);
      for (const path of kept) expect(synced.output, `sync names ${path}`).toContain(path);
      await Promise.all(kept.map((path) => rm(join(repo, ...path.split("/")))));
      await runSteps(repo, [`add ${PACK}`, "sync"]);

      const checked = await cli(repo, ["check"]);
      expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
    },
    CASE_TIMEOUT,
  );

  // TEST CHANGE, justified: build/3 — a pack's own synced copy no longer refuses its re-add;
  // the left-behind check still does (REQ-FLOW-034). The case was "…is refused on its client
  // copies…" and pinned the path-collision refusal and its `pack "<id>" is installed` span. The
  // add still exits 1 with the same four commands in the same order and the same step by hand,
  // and the remedy still runs to a green `check`; the refusal is now the 1.11.0 files this
  // version drops, so the title, the refusal text and the line the steps are read from moved.
  it(
    "add over the installed 1.11.0 pack is refused on the files this version leaves behind, and the installed-state remedy runs to exit 0 (review/57, build/3)",
    async () => {
      const repo = await syncedAt1110("collision-installed");

      const refused = await cli(repo, ["add", PACK, "-y"]);
      expect(refused.code, `add over the synced old pack must refuse — ${said(refused)}`).toBe(1);
      expect(refused.output).toContain("file(s) of the installed copy would be left behind");
      expect(refused.output).not.toContain("path(s) it would write are not free");

      const next = refused.output.split("\n").find((text) => text.trimStart().startsWith("next: run `"));
      const steps = quotedVerbs(next ?? "");
      expect(steps, `the left-behind refusal's printed remedy — ${said(refused)}`).toEqual([
        `clean --pack ${PACK}`,
        "sync",
        `add ${PACK}`,
        "sync",
      ]);
      // TEST CHANGE, justified (2026-10-08, unit d1a2-clean-pack-copies; the declared
      // default recorded in the run's record): the installed-state remedy gains the step
      // by hand that deletes each client copy `clean --pack` keeps and names. This pack's
      // command and skill clash, so the planner refuses it and none of its copies can be
      // proven. The four commands, their order and the green `check` are unchanged.
      // TEST CHANGE, justified (2026-10-08, review/68, review/72, review/76, the lane D
      // fixer): the step by hand reads the same in every remedy, hedged for a file that is
      // the operator's. The commands, their order and the green `check` hold.
      expect(refused.output).toContain("then delete by hand each client copy it keeps and names, unless it is yours");
      const deleted = await runStepsDeletingKept(repo, steps);
      for (const path of UNPROVABLE) expect(deleted, `kept and named: ${path}`).toContain(path);

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
 *
 * TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): the pack
 * was `ops` and the edited file its devops agent; `ops` is retired (REQ-PACK-023), so the
 * pack is {@link PACK} and the edited file its {@link SHARED_SKILL}, whose client copy is
 * {@link SHARED_SKILL_COPY}. Any installed file with a client copy serves.
 */
async function integrityRemedyRuns(
  name: string,
  install: readonly string[],
  addStep: string,
  before?: (repo: string) => Promise<void>,
  syncAfterEdit = false,
  packId = PACK,
): Promise<void> {
  const repo = await claudeRepo(name);
  await before?.(repo);
  const added = await cli(repo, [...install, "-y"]);
  expect(added.code, `fixture: ${install.join(" ")} — ${said(added)}`).toBe(0);
  const synced = await cli(repo, ["sync"]);
  expect(synced.code, `fixture: sync — ${said(synced)}`).toBe(0);

  const edited = `${packDirRelPath(packId)}/${SHARED_SKILL}`;
  const editedAbs = join(repo, ...edited.split("/"));
  const body = `${await readFile(editedAbs, "utf8")}\nA local edit.\n`;
  await writeFile(editedAbs, body, "utf8");
  if (syncAfterEdit) {
    // The usual case: a `sync` ran before `check` and carried the edit into the client copy.
    const carried = await cli(repo, ["sync"]);
    expect(carried.code, `fixture: sync over the edit — ${said(carried)}`).toBe(0);
    expect(await readFile(join(repo, ...SHARED_SKILL_COPY.split("/")), "utf8")).toContain("A local edit.");
  }

  const json = await cli(repo, ["check", "--json"]);
  expect(json.code, `check must fail the edited pack — ${said(json)}`).toBe(1);
  const doc = JSON.parse(json.stdout) as { doctor: { id: string; detail: string }[] };
  const detail = doc.doctor.find((entry) => entry.id === "pack-integrity")?.detail ?? "";
  expect(detail).toContain(edited);
  expect(detail).toContain("move this file out of the pack's directory or delete it first");
  const steps = quotedVerbs(detail.slice(detail.indexOf("re-install the pack:")));
  expect(steps, `the finding line's order — ${detail}`).toEqual([
    `clean --pack ${packId}`,
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
  // TEST CHANGE, justified (2026-10-08, review/71, the lane D fixer): the moved file's client
  // copy is the pack's by its row, but no rendering proves it once the file is out, so
  // `clean --pack` keeps and names it; the order gains the step by hand that deletes it
  // before the `sync`, as `add`'s and `sync`'s remedies print. The commands hold.
  expect(next).toContain(
    `${npxCommand("clean --pack <id>")}, then delete by hand each client copy it keeps and names, ` +
      `unless it is yours, then ${npxCommand("sync")}, then ` +
      `${npxCommand("add <source>")}, then ${npxCommand("sync")}`,
  );

  // The printed first step, by hand: move the edited file out of the pack.
  const keep = join(repo, "kept-skill.md");
  await rename(editedAbs, keep);
  const deleted = await runStepsDeletingKept(repo, steps);
  expect(deleted, "clean --pack names the moved file's client copy").toContain(SHARED_SKILL_COPY);

  const checked = await cli(repo, ["check"]);
  expect(checked.code, `check after the remedy must exit 0 — ${said(checked)}`).toBe(0);
  expect(await readFile(keep, "utf8"), "the moved copy keeps the edit").toBe(body);
  expect(await readFile(editedAbs, "utf8")).not.toBe(body);
}

describe("an edited pack file, by the remedy check's pack-integrity row prints", () => {
  it(
    "a catalog pack: the step re-adds it by its catalog id, and the printed order runs to exit 0 (review/56, review/58, review/59)",
    async () => {
      await integrityRemedyRuns("integrity-catalog", ["add", PACK], `add ${PACK}`);
    },
    CASE_TIMEOUT,
  );

  it(
    "a local-path pack: the step re-adds it from the recorded path, with --allow-untrusted as its install needed, and runs to exit 0 (review/59)",
    async () => {
      await integrityRemedyRuns(
        "integrity-local",
        ["add", `./vendor/${PACK}`, "--allow-untrusted"],
        `add ./vendor/${PACK} --allow-untrusted`,
        async (repo) => {
          await cp(PACK_ROOT, join(repo, "vendor", PACK), { recursive: true });
        },
      );
    },
    CASE_TIMEOUT,
  );

  // review/71: after a `sync` carried the edit into the client copy, the copy is not the
  // re-added pack's rendering, so left on disk it refuses the final `sync`. The order's step
  // by hand deletes it, and the whole order reaches a clean final `sync` and a green `check`.
  it(
    "an edit a sync already carried into the client copy: the printed order, its step by hand included, runs to a green check (review/71)",
    async () => {
      await integrityRemedyRuns("integrity-synced-edit", ["add", PACK], `add ${PACK}`, undefined, true);
    },
    CASE_TIMEOUT,
  );

  // review/86: a scoped pack's ledger rows carry `@acme/<name>/<path>`, so the moved file's copy is
  // the pack's by its row only when the row is read past the whole id, not past its first `/`.
  it(
    "a scoped pack, with an edit a sync already carried: the printed order, its step by hand included, runs to a green check (review/86)",
    async () => {
      await integrityRemedyRuns(
        "integrity-scoped",
        ["add", `./vendor/acme-${PACK}`, "--allow-untrusted"],
        `add ./vendor/acme-${PACK} --allow-untrusted`,
        async (repo) => {
          const vendored = join(repo, "vendor", `acme-${PACK}`);
          await cp(PACK_ROOT, vendored, { recursive: true });
          const manifest = JSON.parse(await readFile(join(vendored, "pack.json"), "utf8")) as { name: string };
          await writeFile(join(vendored, "pack.json"), JSON.stringify({ ...manifest, name: `@acme/${PACK}` }, null, 2), "utf8");
        },
        true,
        `@acme/${PACK}`,
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

  // TEST CHANGE, justified (2026-10-21_packs-rebuilt-02/u1-refixture-pack-tests): the catalog id
  // was `ops`, which the package retires (REQ-PACK-023); the lookup needs an id the catalog holds.
  it("names a catalog pack by its catalog id, whatever resolved path the receipt holds", () => {
    expect(
      reAddArgsOf(PACK, receipt("local-path", `/somewhere/packs/${PACK}`, "curator-verified")),
    ).toBe(PACK);
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

/**
 * `sync`'s clash remedy names a re-add that can run (REQ-PACK-023, REQ-PACK-005,
 * 2026-10-21_packs-rebuilt-02/u13-retired-map): `add <id>` re-adds only a catalog pack
 * or an npm package of that name, and `add` refuses a retired id outright
 * (REQ-PACK-002). So a catalog id keeps `add <id>`; a retired id names its successor's
 * `add` for the copy the package shipped, and re-adding a pack of one's own by its path;
 * any other id names re-adding by its folder or package path. Each owner is installed
 * as an earlier engine left it, a command and a skill of one name, and `sync` refuses.
 */
describe("the clash remedy's re-add step, by what the owner's id resolves to", () => {
  /** A command and a skill that both install as st-drill. */
  const CLASH_PAIR: Readonly<Record<string, string>> = {
    "commands/st-drill.md": madeUpArtifact("drill", "command", "Runs one acme drill end to end."),
    "skills/st-drill/SKILL.md": madeUpArtifact("drill", "skill", "Steps for one acme drill. Triggers when a drill runs."),
  };

  /** A Claude repository with `packId` installed holding {@link CLASH_PAIR}, and `sync`'s refusal. */
  async function refusedSync(name: string, packId: string, commands = COMMANDS): Promise<CliResult> {
    const repo = await claudeRepo(name);
    await installBypassingAdd(repo, packId, { ...CLASH_PAIR });
    const result = await runInProcess(commands, ["sync"], { cwd: repo });
    const refused = { ...result, output: `${result.stdout}\n${result.stderr}` };
    expect(refused.code, `sync must refuse the clash — ${said(refused)}`).not.toBe(0);
    expect(refused.output).toContain("st-drill");
    return refused;
  }

  it(
    "names the successor's add and the own-path route for an installed retired pack, never its bare id",
    async () => {
      const refused = await refusedSync("clash-retired", "ops");

      const steps = remedyVerbs(refused.output, "ops");
      expect(steps, said(refused)).toEqual([
        "clean --pack ops",
        "sync",
        "add production",
        "add <its folder or package path>",
        "sync",
      ]);
      expect(steps).not.toContain("add ops");
      expect(refused.output).toContain("for the copy this package shipped");
      expect(refused.output).toContain("a pack of your own under that id");
    },
    CASE_TIMEOUT,
  );

  it(
    "names re-adding by folder or package path for a pack that is neither a catalog nor a retired id",
    async () => {
      const refused = await refusedSync("clash-local", "acme-local");

      const steps = remedyVerbs(refused.output, "acme-local");
      expect(steps, said(refused)).toEqual([
        "clean --pack acme-local",
        "sync",
        "add <its folder or package path>",
        "sync",
      ]);
      expect(steps).not.toContain("add acme-local");
      expect(refused.output).toContain("a bare id re-adds only a catalog pack or an npm package of that name");
    },
    CASE_TIMEOUT,
  );

  it(
    "keeps add <id> for a catalog id, even one the retired map names (a fork's own packs/ops)",
    async () => {
      // Mocked: the bundled catalog is derived from this checkout's own `packs/` and pinned in
      // `src/pack/catalogPins.ts`, so a fork's `packs/ops` can only be staged by writing into the
      // checkout every parallel suite reads (and the install smoke's isolation guard digests).
      // Only `lookupCatalogEntry` is redirected, and only for `ops`, in a fresh module graph
      // loaded for this case alone; every other read keeps the real catalog.
      vi.resetModules();
      vi.doMock("../../src/pack/curated.ts", async (importOriginal) => {
        const actual = await importOriginal<typeof CuratedApi>();
        return {
          ...actual,
          lookupCatalogEntry: (idOrName: string) => {
            const found = actual.lookupCatalogEntry(idOrName);
            if (found !== undefined || idOrName !== "ops") return found;
            const kept = actual.lookupCatalogEntry(PACK);
            return kept === undefined ? undefined : { ...kept, id: "ops" };
          },
        };
      });
      try {
        const forked = await import("../../src/cli.ts");
        const refused = await refusedSync("clash-fork", "ops", forked.COMMANDS);

        expect(remedyVerbs(refused.output, "ops"), said(refused)).toEqual([
          "clean --pack ops",
          "sync",
          "add ops",
          "sync",
        ]);
        expect(refused.output).not.toContain("add production");
      } finally {
        vi.doUnmock("../../src/pack/curated.ts");
        vi.resetModules();
      }
    },
    CASE_TIMEOUT,
  );
});
