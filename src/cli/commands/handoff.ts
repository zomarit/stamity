import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { Argument, Option, type Command } from "commander";
// Registration-time imports: `configure()` runs while the program is being
// built, before any CliContext exists, so the mode list and the tool choices
// cannot come off `ctx.engine` the way every runtime call below does.
import { TOOLS, VALID_TOOLS, type Tool } from "../../types/core.ts";
import { EngineError } from "../../types/errors.ts";
import { STATE_DIR } from "../../types/markers.ts";
import type { HandoffFrontmatter } from "../../handoffs/schema.ts";
import { CliFailure, renderFailureHuman, type FailureDoc } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";

/**
 * `stamity handoff <mode>` — the engine paths behind the /st-handoff
 * touchpoint, and the CLI's second hidden plumbing verb. Hidden for the reason
 * `learn` is: the caller is generated agent content, not a human.
 *
 * **It decides nothing about a handoff.** The id grammar, the eight required
 * sections, the size caps, the injection screen, the digest span, expiry, the
 * status transitions, the drift table and the resumable screen live in
 * `../../handoffs/`, and every verdict printed here is that module's, quoted
 * rather than re-derived. What this file owns is which flags spell a handoff,
 * where the body comes from, and how a refusal reads on a terminal.
 *
 * Three places mirror engine code because the store exposes no seam for them:
 * {@link serializeHandoff}, the head order every status write goes through; the
 * dry run's head composition; and {@link dryRunPrune}, the sweep's two lists
 * without its moves. Each still calls the engine's own functions for every
 * verdict.
 *
 * One deliberate hardening: the summary cap is an ADVISORY on the read side —
 * refusing a file already on disk over it costs more than it protects — and a
 * refusal here, where the writer can still shorten it. That is the skill's own
 * prepare step 3, not a second opinion about the cap.
 *
 * **No prompts, ever:** every input is flag- or stdin-addressable, because a
 * question would deadlock the machine on the other end.
 *
 * **Why the modes are positional.** The funnel (`../kit/program.ts`) owns the
 * exit-code contract, the single JSON document and the failure rendering
 * through the action it registers on THIS command, and commander dispatches a
 * matched sub-command INSTEAD of that action — so a real `handoff prepare`
 * sub-command would run outside the funnel.
 */

const PREPARE = "prepare";
const RESUME = "resume";
const LIST = "list";
const COMPLETE = "complete";
const PRUNE = "prune";

/** The handoffs subtree of the state directory. The store keeps its own copy of
 *  this join private, so a caller that has to name the directory spells it out. */
const HANDOFFS_DIR = "handoffs";

/** The archive under it, for the one place a caller must tell the two apart. */
const ARCHIVE_DIR = "archive";
const HANDOFF_FILE_EXTENSION = ".md";

/** Milliseconds in a day — the store's expiry arithmetic, mirrored by the dry run. */
const MS_PER_DAY = 86_400_000;

/** Ceiling on one git probe's wall time; a hung git must not stall a handoff. */
const GIT_TIMEOUT_MS = 5_000;

/** The trust frame the skill defines. A resumed body is data, and the tier has to
 *  be visible in the context it lands in, so the frame is output contract. */
function beginFrame(id: string): string {
  return `--- BEGIN HANDOFF DATA ${id} (user-tier, non-authoritative) ---`;
}

function endFrame(id: string): string {
  return `--- END HANDOFF DATA ${id} ---`;
}

/** The title as a slug source, with the same deliberately minimal transform
 *  `learn` applies: the engine's `generateHandoffId` normalizes what is left
 *  into the id grammar, so nothing here has to launder a hostile title. */
export function handoffSlug(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Render a handoff with the head in the schema's own key order — the store's
 *  private serializer, mirrored because it exposes no status-advance path and a
 *  head in another order turns a one-line status diff into a reordered file. */
function serializeHandoff(ctx: CliContext, frontmatter: HandoffFrontmatter, body: string): string {
  return ctx.engine.content.frontmatter.composeFrontmatter(
    {
      id: frontmatter.id,
      status: frontmatter.status,
      created: frontmatter.created,
      expires: frontmatter.expires,
      summary: frontmatter.summary,
      fromTool: frontmatter.fromTool,
      toTool: frontmatter.toTool,
      gitRef: frontmatter.gitRef,
      integrity: frontmatter.integrity,
    },
    body,
  );
}

// ── Flags ────────────────────────────────────────────────────────

function text(opts: Record<string, unknown>, key: string): string {
  const value = opts[key];
  return typeof value === "string" ? value : "";
}

function optionalText(opts: Record<string, unknown>, key: string): string | undefined {
  const value = opts[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** A flag commander constrained to the tool vocabulary, narrowed for the store. */
function toolFlag(opts: Record<string, unknown>, key: string): Tool | undefined {
  const value = optionalText(opts, key);
  return value !== undefined && VALID_TOOLS.has(value) ? (value as Tool) : undefined;
}

/** A flag required by one mode and meaningless to the others, so commander
 *  cannot demand it at parse time. Exit 1 rather than 2 for exactly that
 *  reason: the line parsed, and the mode is what makes the flag mandatory. */
function missingFlag(mode: string, flag: string): CliFailure {
  return new CliFailure({
    code: "VALIDATION_ERROR",
    message: `handoff ${mode} needs ${flag}`,
    why: `${flag} is required by ${mode} and unused by the other modes, so it is checked here rather than by the argument parser`,
    next: `re-run with ${flag} <value>`,
  });
}

/** The one precondition: `.stamity/` exists. A prepare fired from the wrong
 *  directory would otherwise mint a state directory wherever the caller
 *  happened to be, silently, because the store creates its parents. */
async function requireStateDir(rootDir: string): Promise<void> {
  try {
    await stat(join(rootDir, STATE_DIR));
  } catch {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `this repo is not initialised — there is no ${STATE_DIR}/ directory to write a handoff into`,
      why: `handoff is invoked by generated agent content, so it refuses rather than minting ${STATE_DIR}/ in whatever directory the caller happened to be in`,
      next: "run: npx @zomarit/stamity init",
    });
  }
}

/** The body: `--body-file` when given, else stdin to EOF. A TTY stdin is no
 *  body at all — reading it would block on a human who is not there to type
 *  one, and the missing-sections refusal beats a hang. */
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

/** Read a stream to EOF under the engine's user-content ceiling — not a second
 *  opinion about handoff size, since it sits above the store's body cap. It
 *  only stops an unbounded pipe from being buffered whole before a refusal. */
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
        why: "a handoff is state, not a transcript; the store caps one body far below this ceiling",
        next: "compress the narrative, or split the work across separate handoffs",
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A refused mode: exit 1 carrying the engine's messages verbatim on both
 *  surfaces — the `why` line for a human, the `errors` array for a `--json`
 *  caller — because each one already names the rule that failed. */
function refuse(
  ctx: CliContext,
  mode: string,
  subject: string,
  errors: readonly string[],
): CommandResult {
  const doc: FailureDoc = {
    code: "VALIDATION_ERROR",
    message: `handoff ${mode} refused ${JSON.stringify(subject)}`,
    why: errors.join(" "),
    next: `fix the part the rule above names, then re-run the handoff ${mode}`,
  };
  if (!ctx.json) ctx.io.err(`${renderFailureHuman(doc, ctx.palette)}\n`);
  return { exitCode: 1, json: { error: doc, mode, subject, errors: [...errors] } };
}

// ── Git ──────────────────────────────────────────────────────────

/** Bounded, quiet git. `null` on any failure: absence is an answer, never a throw. */
function git(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return null;
  }
}

/** `<branch>@<short sha>`, the spelling the skill records, or `null` when git
 *  cannot name both halves — no binary, no repository, or a detached HEAD,
 *  which has no branch to record. */
export function currentGitRef(cwd: string): string | null {
  const branch = git(cwd, ["branch", "--show-current"]);
  const sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
  if (branch === null || branch === "" || sha === null || sha === "") return null;
  return `${branch}@${sha}`;
}

/** The branch half of a recorded `<branch>@<sha>`; `null` when there is none. */
export function recordedBranch(ref: string): string | null {
  const at = ref.lastIndexOf("@");
  const branch = at === -1 ? ref : ref.slice(0, at);
  return branch === "" ? null : branch;
}

/** True when the recorded branch is gone — the drift row that downgrades a
 *  resume to read-only. Asked only once git has answered about the current ref,
 *  so a machine without git reads as "unknown", not "the branch is gone". */
function recordedBranchIsGone(cwd: string, ref: string | undefined): boolean {
  if (ref === undefined) return false;
  const branch = recordedBranch(ref);
  if (branch === null) return false;
  return git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]) === null;
}

// ── prepare ──────────────────────────────────────────────────────

async function runPrepare(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  // Before the body is read: a prepare pointed at the wrong directory should
  // not first consume the caller's pipe.
  await requireStateDir(rootDir);

  const title = text(opts, "title").trim();
  if (title === "") throw missingFlag(PREPARE, "--title");
  const summary = text(opts, "summary").trim();
  if (summary === "") throw missingFlag(PREPARE, "--summary");
  const fromTool = toolFlag(opts, "fromTool");
  if (fromTool === undefined) throw missingFlag(PREPARE, "--from-tool");
  const toTool = toolFlag(opts, "toTool");

  const { store, validation } = ctx.engine.handoffs;
  if (summary.length > validation.MAX_SUMMARY_LENGTH) {
    return refuse(ctx, PREPARE, title, [
      `\`summary\` is ${summary.length} chars, over ${validation.MAX_SUMMARY_LENGTH}. ` +
        `Keep it to one line; the detail belongs in the body.`,
    ]);
  }

  const body = await resolveBody(ctx, optionalText(opts, "bodyFile"));
  const now = ctx.app.runtime.clock.now();
  const gitRef = optionalText(opts, "gitRef") ?? currentGitRef(rootDir) ?? undefined;
  if (gitRef === undefined) {
    // stderr, not a refusal: a repo with no resolvable git context is a
    // legitimate way to run, and the only cost is that a resume cannot measure
    // drift. Saying so keeps that loss visible instead of silent.
    ctx.io.err(
      `warning: no git ref could be resolved in ${rootDir}, so the handoff records none ` +
        `and a resume cannot measure drift against it.\n`,
    );
  }

  if (ctx.dryRun) {
    return await dryRunPrepare(ctx, { title, summary, body, fromTool, toTool, gitRef, now });
  }

  let written: { id: string; path: string };
  try {
    written = await store.writeHandoff({
      rootDir,
      slug: handoffSlug(title),
      body,
      summary,
      fromTool,
      ...(toTool === undefined ? {} : { toTool }),
      ...(gitRef === undefined ? {} : { gitRef }),
      now,
    });
  } catch (cause) {
    // The store's write gate is a throw; the CLI contract is a rendered failure
    // document carrying the rule it named. An I/O fault is not a verdict about
    // this handoff, so it goes up to the funnel untouched.
    if (cause instanceof EngineError && cause.code === "VALIDATION_ERROR") {
      return refuse(ctx, PREPARE, title, [cause.message]);
    }
    throw cause;
  }

  // The skill's prepare step 5: read it back and confirm the digest survived,
  // so a handoff that cannot be resumed is caught by the session that wrote it
  // rather than by the one that needed it.
  const stored = await store.readHandoff(rootDir, written.id);
  if (stored === null || !validation.verifyHandoffIntegrity(stored)) {
    throw new CliFailure({
      code: "INTEGRITY_ERROR",
      message: `the handoff written to ${written.path} did not read back with a verifying digest`,
      why: "the file changed between the write and the read-back, or it never landed",
      next: "inspect that file, then re-run the prepare",
    });
  }

  ctx.io.out(`Prepared ${written.id} -> ${written.path}\n`);
  return { exitCode: 0, json: { id: written.id, path: written.path, handoff: stored.frontmatter } };
}

interface HandoffDraft {
  title: string;
  summary: string;
  body: string;
  fromTool: Tool;
  toTool: Tool | undefined;
  gitRef: string | undefined;
  now: Date;
}

/**
 * `--dry-run`: the gates the write runs, none of the disk.
 *
 * The head is composed here because the store exposes no dry half, and a dry
 * run that checked less than the real write would clear a handoff the real
 * write then refuses. Every verdict is still the engine's: the active tally is
 * `validateHandoffsDirectory`'s, and the document goes through
 * `validateHandoffContent` — what `writeHandoff` calls, on the same bytes.
 */
async function dryRunPrepare(ctx: CliContext, draft: HandoffDraft): Promise<CommandResult> {
  const { validation } = ctx.engine.handoffs;
  const dir = join(ctx.app.runtime.cwd, STATE_DIR, HANDOFFS_DIR);

  const report = await validation.validateHandoffsDirectory(dir);
  if (report.activeCount >= validation.MAX_ACTIVE_HANDOFFS_PER_REPO) {
    return refuse(ctx, PREPARE, draft.title, [
      `${dir} already holds ${report.activeCount} unfinished handoffs, the maximum of ` +
        `${validation.MAX_ACTIVE_HANDOFFS_PER_REPO}. Archive the ones that are done before ` +
        `writing another.`,
    ]);
  }

  const id = validation.generateHandoffId(handoffSlug(draft.title), draft.now);
  const body = `${draft.body.trim()}\n`;
  const expiryMs = draft.now.getTime() + validation.HANDOFF_DEFAULT_EXPIRY_DAYS * MS_PER_DAY;
  const document = serializeHandoff(
    ctx,
    {
      id,
      status: "active",
      created: draft.now.toISOString(),
      expires: new Date(expiryMs).toISOString(),
      summary: draft.summary,
      fromTool: draft.fromTool,
      ...(draft.toTool === undefined ? {} : { toTool: draft.toTool }),
      ...(draft.gitRef === undefined ? {} : { gitRef: draft.gitRef }),
      integrity: validation.computeHandoffIntegrity(draft.summary, body),
    },
    body,
  );

  const path = join(dir, `${id}${HANDOFF_FILE_EXTENSION}`);
  const result = validation.validateHandoffContent(document, path);
  if (!result.valid) return refuse(ctx, PREPARE, draft.title, result.errors);

  ctx.io.out("Dry run: the handoff passes every write gate. Nothing was written.\n");
  for (const warning of result.warnings) ctx.io.out(`  advisory: ${warning}\n`);
  return { exitCode: 0, json: { dryRun: true, id, path, warnings: result.warnings } };
}

// ── resume ───────────────────────────────────────────────────────

async function runResume(ctx: CliContext, id: string | undefined): Promise<CommandResult> {
  if (id === undefined || id === "") throw missingFlag(RESUME, "<id>");
  const rootDir = ctx.app.runtime.cwd;
  const { schema, store, validation } = ctx.engine.handoffs;
  const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);

  const handoff = await store.readHandoff(rootDir, id);
  if (handoff === null) {
    return refuse(ctx, RESUME, id, [
      `No handoff ${JSON.stringify(id)} under ${dir}. An id is <YYYY-MM-DD>_<slug>_<5 hex>; ` +
        `run "stamity handoff list" to see the ids the store holds.`,
    ]);
  }

  // Integrity before a byte of the body is read out: a file edited after it was
  // written is unverified provenance, and printing it would put exactly the
  // content the digest vouches for into the next agent's context.
  if (!validation.verifyHandoffIntegrity(handoff)) {
    return refuse(ctx, RESUME, id, [
      `${handoff.filePath}: \`integrity\` does not match the summary and body. The handoff was ` +
        `edited after it was written, so its content is unverified provenance and none of the ` +
        `body is printed. Read the file by hand and prepare a fresh handoff from the tree.`,
    ]);
  }

  const now = ctx.app.runtime.clock.now();
  if (validation.isHandoffExpired(handoff, now)) {
    return refuse(ctx, RESUME, id, [
      `${handoff.filePath}: expired at ${handoff.frontmatter.expires}. A stale file manifest ` +
        `resumes into fiction. Prune it into the archive, or read it as reference and prepare a ` +
        `new handoff from the tree as it stands.`,
    ]);
  }

  // The transition table is the screen: `active` reaches `in-progress`,
  // `in-progress` is already claimed, and the rest is finished work.
  const { status } = handoff.frontmatter;
  const advanceable = schema.isValidStatusTransition(status, "in-progress");
  if (!advanceable && status !== "in-progress") {
    return refuse(ctx, RESUME, id, [
      `${handoff.filePath}: status is ${status}, and the resumable set is \`active\` and ` +
        `\`in-progress\` only. Finished work is not reopened — prepare a new handoff instead.`,
    ]);
  }

  const currentRef = currentGitRef(rootDir);
  const drift = validation.detectGitRefDrift(handoff, currentRef);
  // The drift table's read-only row: the recorded branch is gone (deleted or
  // squash-merged), so the body is history. Nothing is switched or recreated,
  // and the status is not advanced — claiming work whose branch no longer
  // exists would record a resume that cannot happen.
  const readOnly = currentRef !== null && recordedBranchIsGone(rootDir, handoff.frontmatter.gitRef);
  if (drift !== null) ctx.io.err(`drift: ${drift}\n`);
  if (readOnly) {
    ctx.io.err(
      `drift: the branch recorded in "${handoff.frontmatter.gitRef}" no longer exists. This ` +
        `resume is read-only — the body is history, no manifest path is edited on its strength, ` +
        `and the status is not advanced. Ask the operator where the work landed.\n`,
    );
  }

  ctx.io.out(`${beginFrame(id)}\n${handoff.body.trim()}\n${endFrame(id)}\n`);

  const advanced = advanceable && !readOnly;
  if (advanced) {
    // The digest covers `summary` + newline + the trimmed body and nothing
    // else, which is what makes the advance safe: recomputed over an unchanged
    // span it reproduces the same value, so the file stays verifiable.
    const body = `${handoff.body.trim()}\n`;
    const rewritten = serializeHandoff(
      ctx,
      {
        ...handoff.frontmatter,
        status: "in-progress",
        integrity: validation.computeHandoffIntegrity(handoff.frontmatter.summary, body),
      },
      body,
    );
    await ctx.engine.merge.atomicWrite.atomicWriteFile(handoff.filePath, rewritten);
  }

  return {
    exitCode: 0,
    json: {
      id,
      path: handoff.filePath,
      status: advanced ? "in-progress" : status,
      advanced,
      readOnly,
      ...(drift === null ? {} : { drift }),
      frame: { begin: beginFrame(id), end: endFrame(id) },
      body: handoff.body.trim(),
    },
  };
}

// ── list ─────────────────────────────────────────────────────────

async function runList(ctx: CliContext): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  const { store, validation } = ctx.engine.handoffs;
  const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
  const now = ctx.app.runtime.clock.now();

  // The index IS the resumable screen — the session-start banner's own, already
  // ordered by soonest expiry. Re-deciding it here would give the operator a
  // second answer to a question the banner has already answered.
  const index = await store.buildHandoffIndex(rootDir, { now });
  const report = await validation.validateHandoffsDirectory(dir);
  const included = new Set(index.active.map((entry) => entry.id));

  // A digest mismatch, an over-cap file and a file that is not handoff-shaped
  // all arrive as `invalid` with the rule already named, so the only reasons
  // left to state are the two a well-formed handoff can carry.
  const excluded = [
    ...report.invalid.map(({ file, errors }) => ({
      file,
      reason: errors[0] ?? "not handoff-shaped.",
    })),
    ...report.valid
      .filter((handoff) => !included.has(handoff.frontmatter.id))
      .map((handoff) => ({
        file: basename(handoff.filePath),
        reason: validation.isHandoffExpired(handoff, now)
          ? `expired at ${handoff.frontmatter.expires}; a prune sweeps it into the archive.`
          : `status is ${handoff.frontmatter.status}; the resumable set is \`active\` and ` +
            `\`in-progress\` only.`,
      })),
  ].toSorted((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  if (index.count === 0) ctx.io.out(`No resumable handoffs in ${dir}.\n`);
  else ctx.io.out(`Resumable (${index.count}), soonest expiry first:\n`);
  for (const entry of index.active) {
    const from = entry.fromTool === undefined ? "" : ` from ${entry.fromTool}`;
    ctx.io.out(`  ${entry.id}  expires ${entry.expires}${from}\n    ${entry.summary}\n`);
  }
  if (excluded.length > 0) ctx.io.out(`Excluded (${excluded.length}):\n`);
  for (const entry of excluded) ctx.io.out(`  ${entry.file} — ${entry.reason}\n`);
  if (report.overActiveCap) {
    ctx.io.out(
      `The directory holds ${report.activeCount} unfinished handoffs, over the ` +
        `${validation.MAX_ACTIVE_HANDOFFS_PER_REPO} cap. Complete or prune before preparing ` +
        `another.\n`,
    );
  }

  return {
    exitCode: 0,
    json: {
      dir,
      resumable: index.active,
      count: index.count,
      excluded,
      activeCount: report.activeCount,
      overActiveCap: report.overActiveCap,
    },
  };
}

// ── complete ─────────────────────────────────────────────────────

async function runComplete(ctx: CliContext, id: string | undefined): Promise<CommandResult> {
  if (id === undefined || id === "") throw missingFlag(COMPLETE, "<id>");
  const rootDir = ctx.app.runtime.cwd;
  const { schema, store } = ctx.engine.handoffs;
  const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);

  const handoff = await store.readHandoff(rootDir, id);
  if (handoff === null) {
    return refuse(ctx, COMPLETE, id, [
      `No handoff ${JSON.stringify(id)} under ${dir}. An id is <YYYY-MM-DD>_<slug>_<5 hex>; ` +
        `run "stamity handoff list" to see the ids the store holds.`,
    ]);
  }

  // The transition table decides, and it runs forward only: `archived` is
  // terminal, so an entry already there reaches neither `completed` nor
  // `archived` and the close is refused rather than rewriting a file that is
  // already where it belongs.
  const { status } = handoff.frontmatter;
  if (!schema.isValidStatusTransition(status, "archived")) {
    return refuse(ctx, COMPLETE, id, [
      `${handoff.filePath}: status is ${status}, and ${status} → archived is not a transition ` +
        `the table carries. Finished work is not closed twice — prepare a new handoff instead of ` +
        `reopening this one.`,
    ]);
  }

  const closable = schema.isValidStatusTransition(status, "completed");
  const route = closable ? `${status} → completed → archived` : `${status} → archived`;
  if (ctx.dryRun) {
    ctx.io.out(`Dry run: ${id} would go ${route}. Nothing was written.\n`);
    return { exitCode: 0, json: { dryRun: true, id, path: handoff.filePath, status, route } };
  }

  // `completed` first wherever the table allows it, so the file records the
  // step the operator took rather than jumping straight to the disposal state.
  // The declared digest is carried across untouched for the reason the store's
  // own archive carries it: re-stamping would launder an edit the original hash
  // still exposes, and `status` sits outside the covered span anyway.
  if (closable) {
    const body = `${handoff.body.trim()}\n`;
    await ctx.engine.merge.atomicWrite.atomicWriteFile(
      handoff.filePath,
      serializeHandoff(ctx, { ...handoff.frontmatter, status: "completed" }, body),
    );
  }

  try {
    await store.archiveHandoff(rootDir, id);
  } catch (cause) {
    // The archive's own transition refusal is a throw; the CLI contract is a
    // rendered failure document carrying the rule it named.
    if (cause instanceof EngineError && cause.code === "VALIDATION_ERROR") {
      return refuse(ctx, COMPLETE, id, [cause.message]);
    }
    throw cause;
  }

  const archived = await store.readHandoff(rootDir, id);
  const path = archived?.filePath ?? join(dir, ARCHIVE_DIR, `${id}${HANDOFF_FILE_EXTENSION}`);
  ctx.io.out(`Completed ${id} -> ${path}\n`);
  return { exitCode: 0, json: { id, path, status: archived?.frontmatter.status ?? "archived" } };
}

// ── prune ────────────────────────────────────────────────────────

async function runPrune(ctx: CliContext): Promise<CommandResult> {
  const rootDir = ctx.app.runtime.cwd;
  const { store } = ctx.engine.handoffs;
  const dir = join(rootDir, STATE_DIR, HANDOFFS_DIR);
  const now = ctx.app.runtime.clock.now();
  const retentionDays = store.DEFAULT_ARCHIVE_RETENTION_DAYS;

  // The retention window is the store's default rather than a flag: a sweep run
  // on a shorter budget than the one the artifact was written under deletes
  // provenance the repo still expected to hold.
  const { archivedExpired, deleted } = ctx.dryRun
    ? await dryRunPrune(ctx, now)
    : await store.pruneHandoffs(rootDir, { now });

  // Both lists always, including their zeroes: a sweep is only readable against
  // the previous one, and a silent run reads the same as a run that found
  // nothing.
  ctx.io.out(`Archived (${archivedExpired.length}), expired and swept out of the live set:\n`);
  for (const id of archivedExpired) ctx.io.out(`  ${id}\n`);
  ctx.io.out(`Deleted (${deleted.length}), archived over ${retentionDays} days past expiry:\n`);
  for (const id of deleted) ctx.io.out(`  ${id}\n`);
  if (ctx.dryRun) ctx.io.out("Dry run: nothing was moved or removed.\n");

  return {
    exitCode: 0,
    json: {
      dir,
      archivedExpired,
      deleted,
      retentionDays,
      ...(ctx.dryRun ? { dryRun: true } : {}),
    },
  };
}

/**
 * `--dry-run`: the two lists a sweep would produce, and none of its moves.
 *
 * Mirrored because the store exposes no dry sweep, and running the real one
 * under a preview flag would delete exactly the files the caller asked to be
 * shown. Every verdict is still the engine's — the same expiry test, the same
 * transition table, the same retention arithmetic — over the same read.
 */
async function dryRunPrune(
  ctx: CliContext,
  now: Date,
): Promise<{ archivedExpired: string[]; deleted: string[] }> {
  const rootDir = ctx.app.runtime.cwd;
  const { schema, store, validation } = ctx.engine.handoffs;
  const archive = join(rootDir, STATE_DIR, HANDOFFS_DIR, ARCHIVE_DIR);

  // Live or archived is where the file sits, not what its head says: a handoff
  // moved into `archive/` by hand keeps whatever status it had, and the sweep
  // acts on the directory.
  const held = await store.listHandoffs(rootDir);
  const archived = held.filter((handoff) => dirname(handoff.filePath) === archive);
  const expired = held.filter(
    (handoff) =>
      dirname(handoff.filePath) !== archive &&
      validation.isHandoffExpired(handoff, now) &&
      schema.isValidStatusTransition(handoff.frontmatter.status, "archived"),
  );

  // An id this sweep would archive is off limits to the delete pass, for the
  // reason the store states: both copies coexist after an interrupted archive.
  const archiving = new Set(expired.map((handoff) => handoff.frontmatter.id));
  const cutoff = now.getTime() - store.DEFAULT_ARCHIVE_RETENTION_DAYS * MS_PER_DAY;
  const stale = archived.filter((handoff) => {
    if (archiving.has(handoff.frontmatter.id)) return false;
    const expires = Date.parse(handoff.frontmatter.expires);
    return !Number.isNaN(expires) && expires <= cutoff;
  });

  return {
    archivedExpired: expired.map((handoff) => handoff.frontmatter.id).toSorted(),
    deleted: stale.map((handoff) => handoff.frontmatter.id).toSorted(),
  };
}

export const handoffCommand: CommandModule = {
  name: "handoff",
  summary: "prepare, resume, list, complete and prune handoffs through the engine's gates (plumbing)",
  hidden: true,
  mutating: true,

  configure(cmd: Command): void {
    cmd
      .addArgument(
        new Argument("<mode>", "which handoff mode to run").choices([
          PREPARE,
          RESUME,
          LIST,
          COMPLETE,
          PRUNE,
        ]),
      )
      .addArgument(new Argument("[id]", "handoff id, for resume and complete"))
      .option("--title <text>", "what the work is about; also the id's slug source")
      .option("--summary <text>", "one line the next session reads first, under 200 characters")
      .addOption(
        new Option("--from-tool <tool>", "the client writing the handoff").choices([...TOOLS]),
      )
      .addOption(
        new Option("--to-tool <tool>", "the client meant to resume it").choices([...TOOLS]),
      )
      .option("--git-ref <ref>", "the ref the work sat on, as <branch>@<sha>")
      .option("--body-file <path>", "read the body from a file instead of stdin");
  },

  async run(ctx, opts, args): Promise<CommandResult> {
    const mode = args[0];
    if (mode === PREPARE) return await runPrepare(ctx, opts);
    if (mode === RESUME) return await runResume(ctx, args[1]);
    if (mode === LIST) return await runList(ctx);
    if (mode === COMPLETE) return await runComplete(ctx, args[1]);
    // Commander's `choices()` already refused everything else at parse time.
    return await runPrune(ctx);
  },
};
