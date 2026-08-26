import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { Argument, Option, type Command } from "commander";
// Registration-time import: `configure()` runs while the program is being built,
// before any CliContext exists, so the confidence choices cannot come off
// `ctx.engine` the way every runtime call below does. Nothing else in this file
// reaches the engine directly.
import { LEARNING_CONFIDENCE_LEVELS } from "../../learnings/validation.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity learn capture` — the engine write path behind the /stamity-learn
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
 */

/** The only verb. A second one becomes another choice plus a dispatch in `run`. */
const CAPTURE = "capture";

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
async function requireStateDir(rootDir: string): Promise<void> {
  try {
    await stat(join(rootDir, STATE_DIR));
  } catch {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to capture a learning into`,
      why: `capture is invoked by generated agent content, so it refuses rather than minting ${STATE_DIR}/ in whatever directory the caller happened to be in`,
      next: "run: npx @zomarit/stamity init",
    });
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
): CommandResult {
  const doc: FailureDoc = {
    code: "VALIDATION_ERROR",
    message: `learn capture refused ${JSON.stringify(fileName)}`,
    why: errors.join(" "),
    next: "rewrite the part the rule above names, then re-run the capture",
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
  const { validation } = ctx.engine.learnings;
  const { frontmatter } = ctx.engine.content;
  // No `caps` argument, exactly like the live call in `run` below: the real
  // capture takes the store's defaults, so a dry run under any other capacity
  // would be answering a different question.
  const caps = validation.resolveLearningsCaps();
  const dir = join(rootDir, STATE_DIR, LEARNINGS_DIR);

  const gates = validation.validateLearningContent(fileName, document, {
    maxFileBytes: caps.maxFileBytes,
    now,
  });
  if (!gates.valid) return refuse(ctx, fileName, gates.errors, WRITE_GATES.slice(0, 1));

  const existing = await listLearningFileNames(dir);
  if (existing.includes(fileName)) {
    return refuse(
      ctx,
      fileName,
      [
        `Learning "${fileName}" already exists in ${dir}. Learnings are append-only: ` +
          `retire that file or write this note under a different slug.`,
      ],
      WRITE_GATES.slice(0, 2),
    );
  }
  if (existing.length >= caps.maxCount) {
    return refuse(
      ctx,
      fileName,
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
    return refuse(
      ctx,
      fileName,
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
    return refuse(ctx, fileName, [message], WRITE_GATES.slice(0, 4));
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
    return refuse(
      ctx,
      fileName,
      recheck.errors.map((error) => `Stamped form — ${error}`),
      WRITE_GATES,
    );
  }

  ctx.io.out(
    `Dry run: ${JSON.stringify(fileName)} passes every write gate ` +
      `(${WRITE_GATES.join(", ")}). Nothing was written.\n`,
  );
  for (const warning of gates.warnings) ctx.io.out(`  advisory: ${warning}\n`);
  return {
    exitCode: 0,
    json: { dryRun: true, fileName, gatesRun: [...WRITE_GATES], warnings: gates.warnings },
  };
}

export const learnCommand: CommandModule = {
  name: "learn",
  summary: "capture a learning through the engine's write gates (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "the only verb").choices([CAPTURE]))
      .requiredOption("--title <text>", "what the learning is about; also its file-name slug")
      .requiredOption("--summary <text>", "one index line, under 200 characters")
      .addOption(
        new Option("--confidence <level>", "how much evidence backs the finding")
          .choices([...LEARNING_CONFIDENCE_LEVELS])
          .default("medium"),
      )
      .option("--body-file <path>", "read the body from a file instead of stdin");
  },

  async run(ctx, opts): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    // Before the body is read: a capture pointed at the wrong directory should
    // not first consume the caller's pipe.
    await requireStateDir(rootDir);

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
