import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { PackContentRoot } from "../../content/catalog.ts";
import { addSkill, listCopiedSkills, removeSkill, type CopiedSkill } from "../../skills/fetch.ts";
import { readSkillSources, SKILL_SOURCES_REL_PATH } from "../../skills/sources.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity skill` — skills copied in from a source the repository trusts (REQ-FLOW-180).
 *
 *   skill add <source-id> <name> --tag <tag> --commit <40-hex> [--sha256 <aggregate>]
 *   skill list                  every copied skill and whether its copy drifted from its origin record
 *   skill remove <name>         the copy and its origin record
 *
 * `add` is an attended planning act: the copy lands on a held path (`.stamity/overrides/**`), so it refuses in an
 * unattended session (read as `learn` reads it) and while nobody is watching (`STAMITY_NOBODY_WATCHING`, or the
 * `.stamity/away.json` marker), and it refuses a source `.stamity/skill-sources.json` does not list. The fetch, the
 * pins and every scan are the engine's (`../../skills/fetch.ts`); `list` re-hashes the copies and never fetches.
 */

const SUBCOMMANDS = ["add", "list", "remove"] as const;

/** `learn`'s read of a run record head: the first bytes only. */
async function headOf(path: string, bytes: number): Promise<string | null> {
  const entry = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return null;
    throw cause;
  });
  if (entry === null || !entry.isFile()) return null;
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(bytes), 0, bytes, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * What makes this session unattended, or `null`, as `learn capture` reads it (`./learn.ts`, `unattendedSession`): a run
 * in progress reading `Mode: unattended`, else `STAMITY_UNATTENDED` set with no run in progress reading
 * `Mode: attended`. A read that fails refuses, since it leaves the mode unknown.
 */
async function unattendedSession(ctx: CliContext, rootDir: string): Promise<string | null> {
  const { layout, resumeCard } = ctx.engine.runs;
  const runsDir = join(rootDir, ...layout.RUNS_SEGMENTS);
  try {
    const entries = await readdir(runsDir, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT" || cause.code === "ENOTDIR") return [];
      throw cause;
    });
    const runs = entries.filter((entry) => entry.isDirectory() && layout.isRunId(entry.name)).map((entry) => entry.name);
    const heads = await Promise.all(
      runs.map(async (run) => {
        const record = await headOf(join(runsDir, run, layout.RECORD_FILE), layout.RECORD_HEAD_READ_BYTES);
        return { run, head: record === null ? null : resumeCard.readRecordHead(record) };
      }),
    );
    const running = heads.filter(({ head }) => head?.inProgress === true);
    const held = running.find(({ head }) => head?.mode === "unattended");
    if (held !== undefined) return `${layout.runRelPath(held.run)}/${layout.RECORD_FILE} reads \`Status: in progress\` and \`Mode: unattended\``;
    if (running.some(({ head }) => head?.mode === "attended")) return null;
    return resumeCard.readsUnattended(null, ctx.app.runtime.env["STAMITY_UNATTENDED"])
      ? "STAMITY_UNATTENDED is set and no in-progress run record reads `Mode: attended`"
      : null;
  } catch (cause) {
    return `the run records could not be read (${cause instanceof Error ? cause.message : String(cause)})`;
  }
}

/**
 * Whether nobody is watching, or `null`: `STAMITY_NOBODY_WATCHING` set and not `""`, `0` or `false`, or anything at
 * `.stamity/away.json` (a link too, since it only tightens). A marker that cannot be probed reads as on.
 */
async function nobodyWatching(ctx: CliContext, rootDir: string): Promise<string | null> {
  if (ctx.engine.runs.resumeCard.readsUnattended(null, ctx.app.runtime.env["STAMITY_NOBODY_WATCHING"])) return "STAMITY_NOBODY_WATCHING is set";
  const marker = `${STATE_DIR}/away.json`;
  try {
    await lstat(join(rootDir, marker));
    return `${marker} is present`;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? null : `${marker} could not be read (${code ?? "unknown"})`;
  }
}

/**
 * The installed packs' content roots, read as `validate` reads them (`./validate.ts`, `installedPackRoots`): none
 * without a manifest. Unlike `validate`, a manifest or pack state that cannot be read refuses rather than reading as
 * no packs, because these roots are what a copy's name is checked against, and an unchecked name can replace a pack
 * skill on the sync after the state is mended.
 */
async function installedPackRoots(ctx: CliContext, rootDir: string): Promise<PackContentRoot[]> {
  try {
    const manifest = await ctx.engine.manifest.manifest.readManifest(rootDir);
    if (manifest === null) return [];
    return ctx.engine.pack.projection.packContentRoots(await ctx.engine.pack.projection.discoverInstalledPacks(rootDir, manifest));
  } catch (cause) {
    throw new CliFailure({
      code: "CONFIG_ERROR",
      message: "skill add refused: the installed packs cannot be read, so the name cannot be checked against their skills",
      why: cause instanceof Error ? cause.message : String(cause),
      next: "mend what the reason names, then re-run",
    });
  }
}

function optionText(opts: Record<string, unknown>, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value : undefined;
}

function usage(message: string, next: string): never {
  throw new CliFailure({ code: "VALIDATION_ERROR", message, next });
}

async function runAdd(ctx: CliContext, opts: Record<string, unknown>, sourceId: string | undefined, name: string | undefined): Promise<CommandResult> {
  if (sourceId === undefined || name === undefined) usage("skill add needs a source id and a skill name", "stamity skill add <source-id> <name> --tag <tag> --commit <40-hex>");
  const version = optionText(opts, "tag");
  const commit = optionText(opts, "commit");
  if (version === undefined || commit === undefined) usage("skill add needs --tag <tag> and --commit <40-hex>", "pin the tag and the full commit id it names");
  const rootDir = ctx.app.runtime.cwd;

  const away = await nobodyWatching(ctx, rootDir);
  if (away !== null) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "skill add refused: nobody is watching",
      why: `${away}, and a copied skill is read by every later session before any person has looked at it`,
      next: "add the skill in an attended session",
    });
  }
  const unattended = await unattendedSession(ctx, rootDir);
  if (unattended !== null) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "skill add refused: this session is unattended",
      why: `${unattended}, and a copied skill lands on a held path a person lands`,
      next: "add the skill in an attended planning session",
    });
  }

  const sources = readSkillSources(rootDir);
  if ("error" in sources) throw new CliFailure({ code: "CONFIG_ERROR", message: "skill add refused: the trusted sources cannot be read", why: sources.error, next: `fix ${SKILL_SOURCES_REL_PATH}` });
  const source = sources.sources.find((entry) => entry.id === sourceId);
  if (source === undefined) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `skill add refused: the source ${JSON.stringify(sourceId)} is not listed in ${SKILL_SOURCES_REL_PATH}`,
      why: sources.sources.length === 0 ? "no source is trusted here" : `the listed sources are ${sources.sources.map((entry) => entry.id).join(", ")}`,
      next: `a person who trusts the source lists it in ${SKILL_SOURCES_REL_PATH}`,
    });
  }

  const added = await addSkill({
    root: rootDir,
    source,
    name,
    version,
    commit,
    sha256: optionText(opts, "sha256"),
    engineVersion: ctx.app.version,
    now: ctx.app.runtime.clock.now(),
    dryRun: ctx.dryRun,
    packRoots: await installedPackRoots(ctx, rootDir),
  });
  const { origin } = added;
  const verb = added.written ? "Copied" : "Would copy";
  ctx.io.out(`${verb} ${origin.name} from ${source.id} at ${origin.version} (${origin.commit.slice(0, 12)}) -> ${added.copyPath}/\n`);
  ctx.io.out(`  ${origin.files.length} file(s), aggregate sha256 ${origin.aggregateSha256}\n`);
  for (const line of origin.scripts) ctx.io.out(`  script, allowed by the source: ${line}\n`);
  for (const line of added.grants) ctx.io.out(`  tool grant, allowed by the source: ${line}\n`);
  if (added.written) ctx.io.out(`  origin record: ${added.originPath}\n  The copy sits on a held path: a person lands it.\n`);
  return { exitCode: 0, json: { dryRun: !added.written, skill: origin, copy: added.copyPath, record: added.originPath, grants: added.grants } };
}

function describeDrift(skill: CopiedSkill): string {
  if (skill.state !== "drifted") return skill.state;
  const parts = [
    ...skill.changed.map((path) => `changed ${path}`),
    ...skill.missing.map((path) => `missing ${path}`),
    ...skill.extra.map((path) => `extra ${path}`),
  ];
  return `drifted: ${parts.join(", ")}`;
}

async function runList(ctx: CliContext): Promise<CommandResult> {
  const skills = await listCopiedSkills(ctx.app.runtime.cwd);
  if (skills.length === 0) ctx.io.out("No copied skills.\n");
  for (const skill of skills) {
    const from = skill.origin === null ? "" : ` · ${skill.origin.source.id} · ${skill.origin.version} · ${skill.origin.commit.slice(0, 12)}`;
    ctx.io.out(`${skill.name}${from} · ${describeDrift(skill)}\n`);
  }
  return {
    exitCode: 0,
    json: {
      skills: skills.map((skill) => ({
        name: skill.name,
        state: skill.state,
        source: skill.origin?.source ?? null,
        version: skill.origin?.version ?? null,
        commit: skill.origin?.commit ?? null,
        changed: skill.changed,
        missing: skill.missing,
        extra: skill.extra,
      })),
    },
  };
}

async function runRemove(ctx: CliContext, name: string | undefined): Promise<CommandResult> {
  if (name === undefined) usage("skill remove needs a skill name", "stamity skill remove <name>");
  const removed = await removeSkill(ctx.app.runtime.cwd, name, ctx.dryRun);
  for (const path of removed) ctx.io.out(`${ctx.dryRun ? "Would remove" : "Removed"} ${path}\n`);
  return { exitCode: 0, json: { dryRun: ctx.dryRun, removed } };
}

export const skillCommand: CommandModule = {
  name: "skill",
  summary: "copy in a skill from a trusted source, pinned and scanned; list copied skills and their drift; remove one",
  // `add` and `remove` write, so the shared --dry-run flag registers; `list` is a read.
  mutating: true,
  args: [
    // Copied verbatim into the generated `docs/cli-reference.md`: editing a string here is a docs change.
    { name: "subcommand", description: "add | list | remove", required: true },
    { name: "source-or-name", description: "add: the source id from .stamity/skill-sources.json; remove: the skill name", required: false },
    { name: "name", description: "add: the skill's folder name in the source", required: false },
  ],

  configure(cmd: Command): void {
    cmd.option("--tag <tag>", "skill add: the source's version tag, which must name --commit (the root `--version` prints the engine's)");
    cmd.option("--commit <sha>", "skill add: the pinned commit, 40 hex digits");
    cmd.option("--sha256 <aggregate>", "skill add: the aggregate sha256 the source published; a copy reading any other is refused");
    // Usage errors, so exit 2 with stdout empty, before the action runs (as `gate` refuses its own).
    cmd.hook("preAction", (command) => {
      const [subcommand, first, second] = command.processedArgs.map((value: unknown) => (typeof value === "string" ? value : undefined));
      if (!(SUBCOMMANDS as readonly (string | undefined)[]).includes(subcommand)) {
        command.error(`error: unknown skill subcommand ${JSON.stringify(subcommand)}; use one of ${SUBCOMMANDS.join(", ")}`, { exitCode: 2 });
      }
      const given = command.opts<Record<string, unknown>>();
      if (subcommand === "add" && (first === undefined || second === undefined)) {
        command.error("error: skill add needs a source id and a skill name: stamity skill add <source-id> <name> --tag <tag> --commit <40-hex>", { exitCode: 2 });
      }
      if (subcommand === "add" && (given["tag"] === undefined || given["commit"] === undefined)) {
        command.error("error: skill add needs --tag <tag> and --commit <40-hex>", { exitCode: 2 });
      }
      if (subcommand === "remove" && first === undefined) command.error("error: skill remove needs a skill name: stamity skill remove <name>", { exitCode: 2 });
    });
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    const [subcommand, first, second] = args;
    if (subcommand === "add") return runAdd(ctx, opts, first, second);
    if (subcommand === "list") return runList(ctx);
    if (subcommand === "remove") return runRemove(ctx, first);
    return usage(`unknown skill subcommand ${JSON.stringify(subcommand)}`, `use one of ${SUBCOMMANDS.join(", ")}`);
  },
};
