import { createHash } from "node:crypto";
import { lstat, open, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { Argument, InvalidArgumentError, Option, type Command } from "commander";
// Registration-time import: `configure()` runs while the program is being built,
// before any CliContext exists, so the confidence choices cannot come off
// `ctx.engine` the way every runtime call below does. Nothing else in this file
// reaches the engine directly.
import { LEARNING_CONFIDENCE_LEVELS } from "../../learnings/validation.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import { packageCommand } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity learn capture` — the engine write path behind the /st-learn
 * touchpoint, and the CLI's one hidden verb.
 *
 * It is plumbing: generated agent content shells out to it, humans rarely type
 * it, and `hidden: true` keeps it off `stamity --help` so the advertised surface
 * stays the seven porcelain verbs. Hidden is not secret — `stamity learn --help`
 * prints in full — it only declines to advertise a command whose caller is a
 * script.
 *
 * **It decides nothing about the learning.** Validation (name, byte cap,
 * required sections, injection screen, declared integrity), neutralization, the
 * integrity stamp, the append-only rule and the directory count cap all live in
 * `../../learnings/`, and every verdict here is that module's, quoted rather
 * than re-derived. What this file owns is the three things the engine has no
 * opinion about: which flags spell a learning, where the body comes from, and
 * how a refusal reads on a terminal.
 *
 * One exception, scoped and tested: `--dry-run` replays the store's write-gate
 * SEQUENCE here, because the store exposes no dry half and a dry run that
 * checked less than the real capture would clear notes the real capture then
 * refuses. Every verdict in that replay is still the engine's own function
 * called on the engine's terms; what is mirrored is four refusal sentences,
 * three of which a test holds byte-identical to the store's — see
 * {@link dryRunCapture} for the fourth and why it has no test.
 *
 * **No prompts, ever.** Every input is flag- or stdin-addressable because the
 * caller is a machine; a question would deadlock it.
 *
 * **The title is a slug source, and the transform is deliberately minimal** —
 * lower-case, whitespace to hyphens, nothing else. Stripping the remaining
 * punctuation would be friendlier and is exactly wrong: it would launder
 * `../../etc/passwd` into a valid name and turn a refused traversal into a
 * successful write. A title the file-name gate rejects comes back with the
 * engine's message naming the rule, and the caller renames.
 *
 * **Why `capture` is a positional argument rather than a commander
 * sub-command.** The program funnel (`../kit/program.ts`) puts the exit-code
 * contract, the single JSON document and the failure rendering in the action it
 * registers on THIS command; commander dispatches a matched sub-command
 * instead of that action, so a real `learn capture` sub-command would run
 * outside the funnel. A `<subcommand>` argument constrained to `capture` reads
 * identically on the command line, keeps the funnel, and still gives commander
 * ownership of the usage errors: no verb exits 2 on the missing argument, a
 * wrong verb exits 2 on the choice list.
 *
 * **`stamity learn read` is the read half, for a session no hook started.** A
 * cloud run with no session-start banner reads learnings here rather than
 * opening `.stamity/learnings/` with the file tools (REQ-FLOW-088): the store's
 * loader screens every file with the write gate's whole catalog — the network
 * rows the session-start hook cannot embed included — and the output is the
 * engine's index, each injection skip naming its pattern ids and never a span,
 * never a skip's `detail`. `--body <id>` prints one LOADED learning's body; a
 * skipped or unknown id is exit 1, so a refused body is never printed. Flags
 * belong to one verb each, checked before the action runs (`preAction`, as
 * `gate.ts` checks its own): a flag on the wrong verb is a usage error, exit 2.
 *
 * **A run proposes, a person accepts (REQ-FLOW-163).** `.stamity/learnings/` and
 * `.stamity/overrides/` are what later runs read, so both are held paths
 * (REQ-FLOW-133) and an unattended run writes neither. `capture --propose --run
 * <id>` runs the dry run's gates and writes the note into the run's own folder;
 * `accept --run <id> --proposal <slug> --digest <sha256>` hands those bytes to
 * the store, whose gates all run again. Nothing here trusts the proposal: the
 * run wrote that file, and it may have changed since its capture. So the
 * person's yes binds to the row they read: the digest they were shown must be
 * the file's, and the run's morning row must still be the row capture printed,
 * so a default of accept never passes. A run proposes learnings only: a head
 * naming a class is refused, since one yes to a learning must not replace a
 * shipped rule. The guard asks on the verb (`learn-accept`,
 * `../../hooks/personOnly.ts`); the refusal here is the second layer, and a run
 * can write what it reads. A live capture under an unattended mode is refused
 * too, since the hold restores the index and the work tree keeps the file.
 */

/** The write verb. */
const CAPTURE = "capture";
/** The screened read verb. */
const READ = "read";
/** The verb that takes a run's proposal live: a person's, asked by the guard and refused under an unattended mode. */
const ACCEPT = "accept";

/** A run's proposals, inside its run folder; `run checkpoint` and `run end` stage this folder's `.md` files by name. */
const PROPOSALS_DIR = "proposals";

/**
 * The learnings subtree of the state directory. The store keeps its own copy of
 * this join private, so a caller that has to name the directory — here, the dry
 * run's one listing — spells it out. `stamity validate` carries the same const
 * for the same reason.
 */
const LEARNINGS_DIR = "learnings";

/**
 * The write gates, in the order `persistLearning` runs them, named so the
 * machine that reads `--json` can see which checks a verdict rests on rather
 * than inferring it from a sentence.
 *
 * - `content` — name, caps and encoding, required sections, injection screen,
 *   declared integrity (`validateLearningContent`).
 * - `append-only` — the slug is not already taken.
 * - `count-cap` — the directory is below its file cap.
 * - `sanitizer` — neutralization leaves a document behind, and it still parses.
 * - `stamped-form` — the document survives the gates a SECOND time once the
 *   integrity line is added, which is where a note sitting on the byte cap
 *   fails.
 */
const WRITE_GATES = ["content", "append-only", "count-cap", "sanitizer", "stamped-form"] as const;

/** The frontmatter map and body of a capture, before the engine renders them. */
export interface LearningDraft {
  /** Bare file name the store validates and writes under. */
  fileName: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface LearningDraftInput {
  title: string;
  summary: string;
  confidence: string;
  /** ISO calendar date (YYYY-MM-DD) from the injected clock. */
  date: string;
  /** The caller's body, verbatim; surrounding whitespace is normalized away. */
  body: string;
}

/**
 * Turn the flags into the document the store gates.
 *
 * Pure, and the only place the flag vocabulary becomes learning vocabulary. The
 * title lands twice — as the slug (`id` and file name) and verbatim in `title`,
 * because the slug transform is lossy and the operator's phrasing is worth
 * keeping. It deliberately does NOT become a body heading: an ATX `# Why ...`
 * synthesized from a title would satisfy the engine's required-section check
 * for a body that never explains anything.
 *
 * The body is trimmed and re-fenced with a single blank line after the head, so
 * two captures of the same note produce the same bytes and therefore the same
 * integrity digest. An empty body stays empty — the store's "a learning is the
 * finding, not its frontmatter" refusal is the right answer, not a fabricated
 * placeholder.
 */
export function draftLearning(input: LearningDraftInput): LearningDraft {
  const slug = input.title.trim().toLowerCase().replace(/\s+/g, "-");
  const body = input.body.trim();
  return {
    fileName: `${slug}.md`,
    frontmatter: {
      id: slug,
      title: input.title.trim(),
      date: input.date,
      confidence: input.confidence,
      summary: input.summary,
    },
    body: body === "" ? "" : `\n${body}\n`,
  };
}

/** Calendar date of the injected clock, in the `date:` field's own format. */
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function text(opts: Record<string, unknown>, key: string): string {
  const value = opts[key];
  return typeof value === "string" ? value : "";
}

function optionalText(opts: Record<string, unknown>, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The one precondition: `.stamity/` exists.
 *
 * Not a manifest read — an agent may well be capturing a learning DURING the
 * incident that corrupted the manifest, and refusing then would lose the note
 * that explains it. Directory existence is the whole check, and it earns its
 * place by catching the opposite failure: a capture fired from the wrong
 * working directory would otherwise mint a state directory in someone's home
 * folder, silently, because the store creates its parents.
 */
async function requireStateDir(rootDir: string, verb: typeof CAPTURE | typeof READ = CAPTURE): Promise<void> {
  try {
    await stat(join(rootDir, STATE_DIR));
  } catch {
    // `read` refuses the same case for the opposite reason: from the wrong
    // directory it would print an empty index, which a hookless run reads as
    // "this repository has no learnings" and carries on without them.
    throw new CliFailure(
      verb === READ
        ? {
            code: "VALIDATION_ERROR",
            message: `this folder is not a Stamity repository — there is no ${STATE_DIR}/ directory to read learnings from`,
            why: `an empty index here would read as "no learnings", when the learnings are in a repository root this command was not run from`,
            next: `run it from the repository root, or in a new repository run: ${packageCommand("init")}`,
          }
        : {
            code: "VALIDATION_ERROR",
            message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to capture a learning into`,
            why: `capture is invoked by generated agent content, so it refuses rather than minting ${STATE_DIR}/ in whatever directory the caller happened to be in`,
            next: `run: ${packageCommand("init")}`,
          },
    );
  }
}

/**
 * The body: `--body-file` when given, otherwise stdin read to EOF.
 *
 * A TTY stdin is treated as no body at all. Reading it would block on a human
 * who is not there to type one, and this command's caller is a script — so the
 * empty-body refusal (which names the missing sections) is a better answer than
 * a hang.
 */
async function resolveBody(ctx: CliContext, bodyFile: string | undefined): Promise<string> {
  if (bodyFile !== undefined) {
    const path = isAbsolute(bodyFile) ? bodyFile : resolve(ctx.app.runtime.cwd, bodyFile);
    try {
      return await readFile(path, "utf8");
    } catch (cause) {
      throw new CliFailure({
        code: "FS_ERROR",
        message: `--body-file ${bodyFile} could not be read`,
        why: cause instanceof Error ? cause.message : String(cause),
        next: "point --body-file at a readable file, or drop the flag and pipe the body on stdin",
      });
    }
  }
  if (ctx.terminal.stdinIsTTY) return "";
  return await readAll(ctx.promptIo.input, ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
}

/**
 * Read a stream to EOF under a byte ceiling.
 *
 * The ceiling is the engine's user-content bound, not a second opinion about
 * how big a learning may be — it sits far above the store's per-file cap, so
 * every realistic size verdict is still the store's, and this only stops an
 * unbounded pipe from being buffered whole before anyone can refuse it.
 */
async function readAll(input: NodeJS.ReadableStream, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    total += buffer.byteLength;
    if (total > maxBytes) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `the body piped on stdin is over the ${maxBytes} byte input ceiling`,
        why: "a learning is a curated note; the store caps one file far below this ceiling",
        next: "pipe the finding alone, or split it across separate captures",
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * A refused capture: exit 1 carrying the engine's messages.
 *
 * They go out verbatim, in the engine's order, on both surfaces — the `why`
 * line for a human and the `errors` array for the caller that parsed `--json` —
 * because each one already names the rule that failed and the rewrite it wants.
 * The result is returned rather than thrown so the JSON document can carry that
 * array; the funnel renders a returned exit-1 result as the one `ok: false`
 * document instead of stacking an envelope on top of it.
 */
function refuse(
  ctx: CliContext,
  fileName: string,
  errors: readonly string[],
  /** Gates that ran, ending with the one that refused. Dry run only — the real
   *  path gets a flat error list from the store and cannot attribute it. */
  gatesRun?: readonly string[],
  verb: typeof CAPTURE | typeof ACCEPT = CAPTURE,
): CommandResult {
  const doc: FailureDoc = {
    code: "VALIDATION_ERROR",
    message: `learn ${verb} refused ${JSON.stringify(fileName)}`,
    why: errors.join(" "),
    next: `rewrite the part the rule above names, then re-run the ${verb}`,
  };
  if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
  return {
    exitCode: 1,
    json: {
      error: doc,
      fileName,
      errors: [...errors],
      ...(gatesRun === undefined ? {} : { gatesRun: [...gatesRun] }),
    },
  };
}

/**
 * `.md` names in a learnings directory — the ONE listing the append-only and
 * count-cap gates both read, mirroring `persistLearning`'s single listing so a
 * dry run costs the same syscall the real capture does.
 *
 * An absent directory is an empty list (the store creates its parent on write),
 * and nothing is created to establish that: a dry run that minted a directory
 * would be a write, which is the one thing this path promises not to be. Any
 * other listing failure is an environment problem, not a verdict about the
 * note — the real path raises the store's typed `FS_ERROR` there, this one
 * raises the CLI's, and neither message is part of the gate contract below.
 */
async function listLearningFileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new CliFailure({
      code: "FS_ERROR",
      message: `the learnings directory ${dir} could not be read`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: "fix that directory's permissions, then re-run the capture",
    });
  }
}

/**
 * `--dry-run`: every gate the real capture runs, none of the disk.
 *
 * The five gates below are `persistLearning`'s own, in its order and stopping
 * at the same place — this path used to run the first one and report that the
 * note "passes every write gate", which is a sentence a machine cannot
 * re-read: the caller is generated agent content, and a dry run that clears a
 * note the real capture then refuses (a taken slug, a full directory, a note
 * that overflows the cap once the integrity line is stamped on) sends it to
 * write something that cannot land.
 *
 * Mirrored, not imported: `persistLearning`'s refusal sentences are inline
 * template strings and the store exports no dry half. The four reproduced below
 * are byte-identical to the store's, and the test suite asserts a dry run and a
 * real capture produce the SAME message for three of them — append-only,
 * count-cap and stamped-form — so a reworded store message fails a test instead
 * of drifting. The fourth, the sanitizer-emptied refusal, has no parity test
 * because neither path can reach it: the shipped screen converges, so the
 * sanitizer never returns content it could not neutralize (`sanitizeContent`'s
 * own note on `unresolved` in `../../denyscan/denyScan.ts`). It is reproduced
 * anyway so a future pattern set that DOES fail closed refuses identically on
 * both paths.
 *
 * The write itself is the only step skipped. Nothing here creates a directory,
 * and every gate is a pure function of bytes already in hand plus one listing.
 *
 * This is also the one path that reports the store's advisories (no `reviewBy`,
 * no `validatedAgainst`). A real capture drops them by design — it returns a
 * write verdict — so a caller who wants to know what is thin about a note asks
 * for it here before committing the note.
 */
async function dryRunCapture(
  ctx: CliContext,
  rootDir: string,
  fileName: string,
  document: string,
  now: Date,
): Promise<CommandResult> {
  const gated = await writeGates(ctx, rootDir, fileName, document, now);
  if ("refused" in gated) return gated.refused;

  ctx.io.out(
    `Dry run: ${JSON.stringify(fileName)} passes every write gate ` +
      `(${WRITE_GATES.join(", ")}). Nothing was written.\n`,
  );
  for (const warning of gated.warnings) ctx.io.out(`  advisory: ${warning}\n`);
  return {
    exitCode: 0,
    json: { dryRun: true, fileName, gatesRun: [...WRITE_GATES], warnings: gated.warnings },
  };
}

/** The dry run's gate sequence, shared with `--propose`: the refusal, or the note's advisories. */
async function writeGates(
  ctx: CliContext,
  rootDir: string,
  fileName: string,
  document: string,
  now: Date,
): Promise<{ refused: CommandResult } | { warnings: string[] }> {
  const { validation } = ctx.engine.learnings;
  const { frontmatter } = ctx.engine.content;
  // No `caps` argument, exactly like the live call in `run` below: the real
  // capture takes the store's defaults, so a dry run under any other capacity
  // would be answering a different question.
  const caps = validation.resolveLearningsCaps();
  const dir = join(rootDir, STATE_DIR, LEARNINGS_DIR);
  const stop = (errors: readonly string[], gatesRun: readonly string[]): { refused: CommandResult } => ({
    refused: refuse(ctx, fileName, errors, gatesRun),
  });

  const gates = validation.validateLearningContent(fileName, document, {
    maxFileBytes: caps.maxFileBytes,
    now,
  });
  if (!gates.valid) return stop(gates.errors, WRITE_GATES.slice(0, 1));

  const existing = await listLearningFileNames(dir);
  if (existing.includes(fileName)) {
    return stop(
      [
        `Learning "${fileName}" already exists in ${dir}. Learnings are append-only: ` +
          `retire that file or write this note under a different slug.`,
      ],
      WRITE_GATES.slice(0, 2),
    );
  }
  if (existing.length >= caps.maxCount) {
    return stop(
      [
        `The learnings directory ${dir} holds ${existing.length} files, at the ` +
          `${caps.maxCount} file cap. Retire or consolidate a learning before adding ` +
          `"${fileName}".`,
      ],
      WRITE_GATES.slice(0, 3),
    );
  }

  const sanitization = validation.sanitizeLearningsContent(document);
  if (sanitization.content.trim() === "") {
    return stop(
      [
        `Learning "${fileName}" could not be neutralized — the sanitizer dropped it ` +
          `(patterns: ${sanitization.strippedPatternIds.join(", ") || "none reported"}). ` +
          `Rewrite the note without the flagged spans.`,
      ],
      WRITE_GATES.slice(0, 4),
    );
  }

  // Typed off the engine function rather than by importing its result type:
  // this file reaches the engine through `ctx.engine`, and a direct type import
  // would be a second path to the same module.
  let parsed: ReturnType<typeof frontmatter.parseFrontmatter>;
  try {
    parsed = frontmatter.parseFrontmatter(sanitization.content, `Learning "${fileName}"`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return stop([message], WRITE_GATES.slice(0, 4));
  }

  const stamped = frontmatter.composeFrontmatter(
    { ...parsed.frontmatter, integrity: validation.computeLearningIntegrity(parsed.body) },
    parsed.body,
  );
  const recheck = validation.validateLearningContent(fileName, stamped, {
    maxFileBytes: caps.maxFileBytes,
    now,
  });
  if (!recheck.valid) {
    return stop(
      recheck.errors.map((error) => `Stamped form — ${error}`),
      WRITE_GATES,
    );
  }
  return { warnings: gates.warnings };
}

/**
 * The run folder a proposal lives in, relative to the root, after the checks both verbs share: `run` is a run id, and
 * neither that folder nor its proposals folder is a link, which would put the file where the link points (a link to
 * `.stamity/learnings/` would make a proposal live). A proposals folder not made yet passes.
 */
async function proposalsFolder(ctx: CliContext, rootDir: string, run: string): Promise<string> {
  const { layout } = ctx.engine.runs;
  if (!layout.isRunId(run)) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `--run ${JSON.stringify(run)} is not a run id (YYYY-MM-DD_<lowercase-slug>)`,
      why: `a run id matches ${layout.RUN_ID_PATTERN.source}, the name of its folder under ${STATE_DIR}/runs/`,
      next: "pass the run folder's name exactly as it is on disk",
    });
  }
  const runDir = layout.runRelPath(run);
  const folder = `${runDir}/${PROPOSALS_DIR}`;
  const entries = await Promise.all([runDir, folder].map((path) => lstat(join(rootDir, path)).catch(() => null)));
  if (entries.some((entry) => entry !== null && !entry.isDirectory())) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${folder} is not the run folder's own directory`,
      why: "a link there would put a proposal where the link points, and a proposal is what stays out of the live folders",
      next: "remove the link, then re-run the verb",
    });
  }
  return folder;
}

/** {@link proposalsFolder} for `capture --propose`, which also needs the run's record: no run here, no folder to mint. */
async function proposingFolder(ctx: CliContext, rootDir: string, run: string): Promise<string> {
  const folder = await proposalsFolder(ctx, rootDir, run);
  const { layout } = ctx.engine.runs;
  const record = `${layout.runRelPath(run)}/${layout.RECORD_FILE}`;
  if ((await lstat(join(rootDir, record)).catch(() => null))?.isFile() !== true) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `learn capture --propose found no record at ${record}`,
      why: "a proposal lives in its run's folder, so a run that does not exist here has nowhere to hold it",
      next: "name the run this session is working in, from the project root",
    });
  }
  return folder;
}

/** The digest a person's yes binds to: the proposal's whole text, its head with it, as `--approved` binds a yes to a commit. */
function proposalDigest(document: string): string {
  return createHash("sha256").update(document).digest("hex");
}

/**
 * The row a proposal asks for on the morning list, less its `Q<n>`, which the run numbers: no answer leaves it out. The
 * question names the verb and the digest a `2` passes to it, and `accept` reads the row back against this shape.
 */
function proposalRow(fileName: string, summary: string, digest: string): { kind: string; question: string; options: string[]; default: number; source: string } {
  return {
    kind: "decision",
    question: `Accept the proposed learning ${fileName.slice(0, -".md".length)}? ${summary.replaceAll(/\s+/g, " ")} (learn accept --digest ${digest})`,
    options: ["leave it out", "accept"],
    default: 1,
    source: `${PROPOSALS_DIR}/${fileName}`,
  };
}

/**
 * `capture --propose`: every gate the real capture runs, then the note into the run's folder. Nothing goes under
 * `.stamity/learnings/`, and a proposal is append-only as a learning is. The row is printed, not written: the run
 * writes `morning.md` after this call, with its file tools, and numbers the list's questions itself.
 */
async function proposeCapture(ctx: CliContext, rootDir: string, folder: string, draft: LearningDraft, document: string, now: Date): Promise<CommandResult> {
  const { fileName } = draft;
  const gated = await writeGates(ctx, rootDir, fileName, document, now);
  if ("refused" in gated) return gated.refused;

  const path = `${folder}/${fileName}`;
  if ((await lstat(join(rootDir, path)).catch(() => null)) !== null) {
    return refuse(ctx, fileName, [`${path} is already proposed. Proposals are append-only: capture this note under a different title.`]);
  }
  const digest = proposalDigest(document);
  const morning = proposalRow(fileName, text(draft.frontmatter, "summary"), digest);
  const shared = { fileName, path, digest, morning, gatesRun: [...WRITE_GATES], warnings: gated.warnings };
  if (ctx.dryRun) {
    ctx.io.out(`Dry run: ${JSON.stringify(fileName)} would be proposed at ${path}. Nothing was written.\n`);
    return { exitCode: 0, json: { dryRun: true, ...shared } };
  }

  await ctx.engine.merge.atomicWrite.atomicWriteFile(join(rootDir, path), document, { boundaryDir: rootDir });
  ctx.io.out(`Proposed ${JSON.stringify(fileName)} -> ${path}; nothing went live.\n`);
  ctx.io.out(`Add this row to the morning list's questions, with the next Q<n>: ${JSON.stringify(morning)}\n`);
  return { exitCode: 0, json: shared };
}

/** At most `bytes` of `path`, or `null` where it is absent or is not a regular file: a link is no record. */
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
 * What makes this session unattended, or `null`, as the shell guard reads it (`unattendedBy`, `../../hooks/scripts.ts`):
 * a run in progress reading `Mode: unattended`, else `STAMITY_UNATTENDED` set with no run in progress reading
 * `Mode: attended`. Never the named run's own `Mode:` alone: an unattended run that closed is the one whose proposal a
 * person walks in the morning, so that line would refuse the very accept this verb exists for. A read that fails
 * refuses, since it leaves the mode unknown.
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

/** The head of a proposal, or an empty one where it does not parse: that head then matches no row, and is refused there. */
function proposalHead(ctx: CliContext, document: string, fileName: string): Record<string, unknown> {
  try {
    return ctx.engine.content.frontmatter.parseFrontmatter(document, `Proposal "${fileName}"`).frontmatter;
  } catch {
    return {};
  }
}

/**
 * Why the run's morning list does not carry `expected` as this proposal's row, or `null` where it does. A run writes
 * that file, so a row reading other than the one capture printed (a default of accept, the options swapped, a question
 * saying something the proposal does not) refuses, and a list with no such row asked nobody. Every row naming the
 * proposal is read: one faithful row beside a second is no faithful list.
 */
async function proposalRowProblem(ctx: CliContext, rootDir: string, run: string, expected: ReturnType<typeof proposalRow>): Promise<string | null> {
  const { layout, morning } = ctx.engine.runs;
  const path = `${layout.runRelPath(run)}/${morning.MORNING_FILE}`;
  const list = await headOf(join(rootDir, path), ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH);
  const parsed = list === null ? null : morning.parseMorning(list);
  if (parsed === null || !parsed.ok || parsed.runId !== run) return `${path} is no morning list of this run, so nobody was asked`;
  const rows = parsed.questions.filter((row) => row.source === expected.source);
  if (rows.length === 0) return `${path} holds no row for ${expected.source}, so nobody was asked`;
  const faithful = rows.every(
    (row) =>
      row.kind === expected.kind &&
      row.question === expected.question &&
      row.default === expected.default &&
      row.options.length === expected.options.length &&
      row.options.every((option, at) => option === expected.options[at]),
  );
  return faithful ? null : `${path} does not carry the row capture printed for ${expected.source}, and no answer leaves a proposal out`;
}

/** The proposal's text, refused where it is no regular file of the run's proposals folder. */
async function readProposal(ctx: CliContext, rootDir: string, path: string): Promise<string> {
  const entry = await lstat(join(rootDir, path)).catch(() => null);
  const cap = ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH;
  if (entry === null || !entry.isFile() || entry.size > cap) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `${path} is no proposal to accept`,
      why: entry === null ? "that file does not exist" : `a proposal is a regular file of at most ${cap} bytes, and this path is not one`,
      next: "pass the slug the morning list's row names, from the run folder that holds it",
    });
  }
  return await readFile(join(rootDir, path), "utf8");
}

/**
 * `accept`: a person's yes to one proposal. Refused under an unattended mode, before any file is read. Then the yes is
 * held to what was shown: the file must still read `digest`, its head must name no class, and the run's morning row
 * must be the one capture printed. The bytes go through the store's whole write path, so every gate runs again. The
 * proposal stays in the run folder as the record of what was asked; a second accept is the store's append-only refusal.
 */
async function runAccept(ctx: CliContext, run: string, slug: string, digest: string): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  const unattended = await unattendedSession(ctx, rootDir);
  if (unattended !== null) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "learn accept refused: this session is unattended",
      why: `${unattended}, and accepting is a person's call: what goes live is read by every later run`,
      next: "leave the proposal in the run folder; a person accepts it at the morning walk",
    });
  }
  const folder = await proposalsFolder(ctx, rootDir, run);
  const fileName = `${slug}.md`;
  const nameErrors = ctx.engine.learnings.validation.validateLearningFileName(fileName);
  if (nameErrors.length > 0) return refuse(ctx, fileName, nameErrors, undefined, ACCEPT);
  const document = await readProposal(ctx, rootDir, `${folder}/${fileName}`);

  const left = (why: string): CliFailure =>
    new CliFailure({
      code: "VALIDATION_ERROR",
      message: `learn accept refused ${JSON.stringify(fileName)}`,
      why,
      next: "leave the proposal out; a note still worth keeping is proposed again by a later run",
    });
  const found = proposalDigest(document);
  if (found !== digest) throw left(`${folder}/${fileName} reads digest ${found}, not the ${digest} the person was shown: the yes holds for that text and no other`);
  const head = proposalHead(ctx, document, fileName);
  if (Object.hasOwn(head, "type")) {
    throw left(`its head reads \`type: ${ctx.engine.runs.blocks.quoteReportText(head["type"])}\`, and a run proposes learnings only in this release: an override changes what every later run follows, and a yes to a learning does not reach it`);
  }
  const problem = await proposalRowProblem(ctx, rootDir, run, proposalRow(fileName, text(head, "summary"), digest));
  if (problem !== null) throw left(problem);

  const result = await ctx.engine.learnings.store.persistLearning({ rootDir, fileName, content: document, now: ctx.app.runtime.clock.now() });
  if (!result.written) return refuse(ctx, fileName, result.errors, undefined, ACCEPT);
  ctx.io.out(`Accepted ${JSON.stringify(fileName)} -> ${result.path ?? ""}\n`);
  return { exitCode: 0, json: { run, proposal: slug, fileName, digest, path: result.path, sanitized: result.sanitized } };
}

/** The loader's result, typed off the engine function as `dryRunCapture` types its parse. */
type LoadedSet = Awaited<ReturnType<CliContext["engine"]["learnings"]["store"]["loadValidatedLearnings"]>>;

/** Each capture-only flag, by its commander attribute and its spelling. */
const CAPTURE_ONLY_FLAGS: readonly (readonly [string, string])[] = [
  ["title", "--title"],
  ["summary", "--summary"],
  ["confidence", "--confidence"],
  ["bodyFile", "--body-file"],
  ["propose", "--propose"],
];

/** `--digest <sha256>`: the full digest the morning row printed, as `run land --approved` takes the full commit. */
function parseDigest(value: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new InvalidArgumentError("--digest takes the full 64-character digest the morning row printed.");
  return value.toLowerCase();
}

/**
 * The per-verb flag check, before the action and before any file is read: a
 * usage error exits 2 through commander, as a missing `--title` always has.
 * `--title` and `--summary` are capture's required flags, checked here rather
 * than by `requiredOption`, which would demand them of `read` too.
 */
function checkVerbFlags(command: Command): void {
  const verb = command.processedArgs[0];
  const opts = command.opts<Record<string, unknown>>();
  if (verb === CAPTURE) {
    if (opts["title"] === undefined) {
      command.error("error: required option '--title <text>' not specified", { exitCode: 2 });
    }
    if (opts["summary"] === undefined) {
      command.error("error: required option '--summary <text>' not specified", { exitCode: 2 });
    }
    if (opts["body"] !== undefined) {
      command.error("error: --body applies to read only; capture takes its body from --body-file or stdin", {
        exitCode: 2,
      });
    }
    if (opts["proposal"] !== undefined) command.error("error: --proposal applies to accept only", { exitCode: 2 });
    if (opts["digest"] !== undefined) command.error("error: --digest applies to accept only", { exitCode: 2 });
    if ((opts["propose"] === true) !== (opts["run"] !== undefined)) {
      command.error("error: --propose and --run go together: --propose names the run whose folder takes the note", { exitCode: 2 });
    }
    return;
  }
  if (opts["dryRun"] === true) {
    const why = verb === ACCEPT ? "accept goes live or refuses; capture --propose --dry-run runs the same gates" : "read writes nothing";
    command.error(`error: ${why}, so it takes no --dry-run`, { exitCode: 2 });
  }
  const misplaced = CAPTURE_ONLY_FLAGS.filter(([key]) => command.getOptionValueSource(key) === "cli");
  if (misplaced.length > 0) {
    command.error(`error: ${misplaced.map(([, flag]) => flag).join(", ")} applies to capture only`, { exitCode: 2 });
  }
  if (verb === ACCEPT) {
    if (opts["body"] !== undefined) command.error("error: --body applies to read only", { exitCode: 2 });
    if (opts["run"] === undefined) command.error("error: required option '--run <id>' not specified", { exitCode: 2 });
    if (opts["proposal"] === undefined) command.error("error: required option '--proposal <slug>' not specified", { exitCode: 2 });
    if (opts["digest"] === undefined) command.error("error: required option '--digest <sha256>' not specified", { exitCode: 2 });
    return;
  }
  if (opts["run"] !== undefined || opts["proposal"] !== undefined || opts["digest"] !== undefined) {
    command.error("error: --run, --proposal and --digest apply to capture --propose and accept, not to read", { exitCode: 2 });
  }
}

/** A refused read: exit 1, the failure on stderr for a person and in the one JSON document for a machine. */
function readRefusal(ctx: CliContext, doc: FailureDoc, extra: Record<string, unknown>): CommandResult {
  if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
  return { exitCode: 1, json: { error: doc, ...extra } };
}

/**
 * `learn read`: the screened index, or with `bodyId` one loaded body.
 *
 * Nothing here judges a file — the loader does, with the write gate's whole
 * catalog. What this owns is the shape: the index with pattern ids on its skip
 * lines, and a JSON document carrying the index's fields and no skip `detail`.
 * A folder that exists and cannot be listed is the loader's typed `FS_ERROR`,
 * which the funnel renders as exit 1; an absent learnings folder is an empty
 * index, and an absent `.stamity/` is refused as `capture` refuses it. The
 * loader runs with `screenPrinted`, so what this prints is screened as printed.
 */
async function runRead(ctx: CliContext, bodyId: string | undefined): Promise<CommandResult> {
  const { store } = ctx.engine.learnings;
  const rootDir = ctx.app.runtime.cwd;
  await requireStateDir(rootDir, READ);
  const now = ctx.app.runtime.clock.now();
  const result = await store.loadValidatedLearnings({ rootDir, now, screenPrinted: true });
  if (bodyId !== undefined) return readBody(ctx, result, bodyId);

  ctx.io.out(`${store.formatLearningsIndex(result, { now, patternIds: true })}\n`);
  const entries = store.learningsIndexEntries(result);
  return {
    exitCode: 0,
    json: { learnings: entries.learnings, skips: entries.skips, totalBytes: result.totalBytes },
  };
}

/**
 * One loaded learning's body. The id is matched against the declared `id`
 * first — the name the index prints — and against the file's stem (unique on
 * disk) only when no learning declares it, because the write gate lets the two
 * differ and a stem matched first could print another note than the index line
 * the caller read. Two learnings declaring the id resolve to the one whose stem
 * is that id, else refuse rather than pick. The body is printed with its
 * warn-class material stripped, and the strip reported by pattern id and count.
 * A skipped file is named by its stem, with its reason and pattern ids only:
 * its body is exactly what the screen refused, so it is never printed.
 */
function readBody(ctx: CliContext, result: LoadedSet, id: string): CommandResult {
  const { store } = ctx.engine.learnings;
  const entries = store.learningsIndexEntries(result);
  const byStem = result.learnings.findIndex((learning) => learning.fileName === `${id}.md`);
  const byId = entries.learnings.flatMap((entry, index) => (entry.id === id ? [index] : []));
  const index =
    byId.length === 0 ? (byStem >= 0 ? byStem : undefined) : byId.length === 1 ? byId[0] : byId.find((at) => at === byStem);
  const learning = index === undefined ? undefined : result.learnings[index];
  const next = `run ${packageCommand("learn read")} for the index of loaded learnings`;

  if (learning !== undefined) {
    const printable = store.printableBody(learning.body);
    ctx.io.out(`${printable.text.trim()}\n`);
    if (printable.stripped.length > 0 && !ctx.json) {
      const named = printable.stripped.map((entry) => `${entry.patternId} ×${entry.count}`).join(", ");
      ctx.io.err(
        `advisory: ${learning.fileName}: warn-class material stripped before printing (${named}); ` +
          `rewrite the learning at its source through the write path\n`,
      );
    }
    return {
      exitCode: 0,
      json: { id, fileName: learning.fileName, body: printable.text, stripped: printable.stripped },
    };
  }
  if (byId.length > 1) {
    const fileNames = byId.map((at) => entries.learnings[at]?.fileName);
    const why = "two notes claim one name, and printing either would be a guess";
    const message = `${byId.length} loaded learnings declare the id ${JSON.stringify(id)}: ${fileNames.join(", ")}`;
    return readRefusal(ctx, { code: "VALIDATION_ERROR", message, why, next: "pass the file name without .md" }, {
      id,
      fileNames,
    });
  }
  const skipAt = result.skips.findIndex((entry) => entry.fileName === `${id}.md`);
  const skip = skipAt >= 0 ? entries.skips[skipAt] : undefined;
  if (skip !== undefined) {
    const ids = skip.patternIds.length > 0 ? ` (patterns: ${skip.patternIds.join(", ")})` : "";
    return readRefusal(
      ctx,
      {
        code: "VALIDATION_ERROR",
        message: `learning ${JSON.stringify(id)} was skipped: ${skip.fileName}: ${skip.reason}${ids}`,
        why: "a skipped file did not clear the read screen, so its body is not printed",
        next: `fix or retire it through the write path, never by opening it; ${next}`,
      },
      { id, skip },
    );
  }
  return readRefusal(
    ctx,
    {
      code: "VALIDATION_ERROR",
      message: `no loaded learning has the id ${JSON.stringify(id)}`,
      why: "--body prints a learning the read screen loaded, named by its id or its file name without .md",
      next,
    },
    { id },
  );
}

export const learnCommand: CommandModule = {
  name: "learn",
  summary: "capture a learning through the engine's write gates, or read them through its screen (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(
        new Argument("<subcommand>", "capture a learning, accept a run's proposal, or read the screened index").choices([CAPTURE, READ, ACCEPT]),
      )
      .option("--title <text>", "capture (required): what the learning is about; also its file-name slug")
      .option("--summary <text>", "capture (required): one index line, under 200 characters")
      .addOption(
        new Option("--confidence <level>", "capture: how much evidence backs the finding")
          .choices([...LEARNING_CONFIDENCE_LEVELS])
          .default("medium"),
      )
      .option("--body-file <path>", "capture: read the body from a file instead of stdin")
      .option("--body <id>", "read: print one loaded learning's body instead of the index")
      .option("--propose", "capture: run the gates and write the note to the run's folder, not to the live learnings")
      .option("--run <id>", "capture --propose, accept (required): the run whose folder holds the proposal")
      .option("--proposal <slug>", "accept (required): the proposal to take live")
      .option("--digest <sha256>", "accept (required): the digest the morning row printed; a proposal reading any other is refused", parseDigest)
      .hook("preAction", checkVerbFlags);
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    // Commander's `choices()` refused every other verb at parse time, and the
    // preAction hook refused every flag on the wrong verb.
    if (args[0] === READ) return await runRead(ctx, optionalText(opts, "body"));
    if (args[0] === ACCEPT) return await runAccept(ctx, text(opts, "run"), text(opts, "proposal"), text(opts, "digest"));

    const rootDir = ctx.app.runtime.cwd;
    // Before the body is read: a capture pointed at the wrong directory should
    // not first consume the caller's pipe.
    await requireStateDir(rootDir);
    const folder = opts["propose"] === true ? await proposingFolder(ctx, rootDir, text(opts, "run")) : null;
    // A dry run writes nothing, so it stays open to a run checking a note before it proposes it.
    const unattended = folder === null && !ctx.dryRun ? await unattendedSession(ctx, rootDir) : null;
    if (unattended !== null) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: "learn capture refused: this session is unattended",
        why: `${unattended}, and a live learning is read by the next session here before any person has answered`,
        next: "capture it with --propose --run <run-id>, which a person accepts at the morning walk",
      });
    }

    const now = ctx.app.runtime.clock.now();
    const draft = draftLearning({
      title: text(opts, "title"),
      summary: text(opts, "summary"),
      confidence: text(opts, "confidence"),
      date: isoDate(now),
      body: await resolveBody(ctx, optionalText(opts, "bodyFile")),
    });
    const document = ctx.engine.content.frontmatter.composeFrontmatter(
      draft.frontmatter,
      draft.body,
    );

    if (folder !== null) return await proposeCapture(ctx, rootDir, folder, draft, document, now);
    if (ctx.dryRun) return await dryRunCapture(ctx, rootDir, draft.fileName, document, now);

    const result = await ctx.engine.learnings.store.persistLearning({
      rootDir,
      fileName: draft.fileName,
      content: document,
      now,
    });
    if (!result.written) return refuse(ctx, draft.fileName, result.errors);

    ctx.io.out(`Captured ${JSON.stringify(draft.fileName)} -> ${result.path}\n`);
    if (result.sanitized) {
      ctx.io.out(
        "Flagged spans were neutralized before the digest was stamped — read the file back to see what landed.\n",
      );
    }
    return {
      exitCode: 0,
      json: { path: result.path, fileName: draft.fileName, sanitized: result.sanitized },
    };
  },
};
