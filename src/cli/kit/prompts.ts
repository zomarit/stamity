import { emitKeypressEvents, type Key } from "node:readline";
import { createInterface, type Interface } from "node:readline/promises";
import { CliFailure } from "./output.ts";

/**
 * TTY-gated prompt helpers over injectable streams (readline/promises).
 *
 * Non-interactive gate (non-TTY stdin, or -y, or --json) returns the declared
 * default without reading or writing anything. `--json` belongs on that list
 * because it makes a run non-interactive — stdout belongs to the single
 * envelope, so no prompt can be printed there — NOT because it grants consent:
 * a command whose prompt is a destructive confirmation refuses at this gate
 * rather than proceeding on an assumed yes, which is why `--json` is read here
 * and never folded into `yes`. EOF/closed stdin during a question resolves to
 * the default; SIGINT during a question throws CliFailure("aborted") so the
 * funnel exits 1.
 *
 * One readline Interface is kept per input stream for the whole run, consumed
 * through a persistent 'line' listener plus a queue — NOT one `rl.question()`
 * interface per prompt. Piped stdin ("y\n2\n" | stamity init) arrives as a
 * single chunk; readline emits every complete line immediately, and a
 * per-question interface would drop the lines behind the first on close. The
 * queue keeps them for the next question. `closePrompts` releases the interface
 * (and un-refs process.stdin) at end of run — the program funnel calls it.
 *
 * **The session is a Ctrl-C interception window, so a caller closes it as soon
 * as its last question resolves.** On a real terminal readline runs the input
 * in raw mode, where ^C is a byte rather than a signal: the TTY never raises
 * SIGINT, and the handler below is the only thing that acts on it. That is the
 * behaviour a pending question needs and the wrong behaviour everywhere else —
 * a session left open past the last prompt swallows Ctrl-C for the rest of the
 * run, which for `init` is the entire write phase. `closePrompts` restores
 * cooked mode, so the command that owns the prompts calls it once they are
 * settled (`../commands/init.ts`) instead of waiting for the funnel's `finally`.
 *
 * `selectOne` and `selectMany` have a second rendering path on top of all of
 * that — an arrow menu driven by raw-mode keypresses, taken only when the
 * streams can carry one. Everything about it, including why it has to take the
 * readline session down for the duration of an interaction, is in the "arrow
 * menu" section at the foot of this file.
 */

export interface PromptIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export interface PromptGate {
  interactive: boolean;
  /**
   * The environment the raw-menu capability probe reads `TERM` from
   * (`./prompts.ts`'s "arrow menu" section). Injected, never `process.env` —
   * the same discipline `PromptIo` already holds for every other stream fact
   * this kit needs. Optional and defaulting to `{}`: a gate built with no
   * `env` reads `TERM` as unset, which the probe treats as raw-capable, so an
   * omitted field is a no-op rather than a refusal a caller did not ask for.
   * The funnel populates it from `../../composition/root.ts::Runtime.env` at
   * every call site that builds a gate.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Interactive only when stdin is a TTY and neither -y nor --json asked for silence. */
export function promptGate(opts: {
  stdinIsTTY: boolean;
  yes: boolean;
  json: boolean;
  env?: Readonly<Record<string, string | undefined>>;
}): PromptGate {
  return {
    interactive: opts.stdinIsTTY && !opts.yes && !opts.json,
    ...(opts.env === undefined ? {} : { env: opts.env }),
  };
}

interface Session {
  readonly rl: Interface;
  readonly queue: string[];
  pending: { resolve: (line: string | null) => void; reject: (err: unknown) => void } | null;
  closed: boolean;
}

const sessions = new WeakMap<NodeJS.ReadableStream, Session>();

/**
 * Inputs whose operator pressed Ctrl-C, held per stream rather than on the
 * session, because the abort has to outlive the session object.
 *
 * It used to be a `Session` field, which was correct while a session lived for
 * the whole run. The arrow menu breaks that assumption — it takes the session
 * down for the duration of an interaction (see `quiesceSession`) and does not
 * put it back after an abort — so a flag stored there would be dropped with it
 * and the next question would open a fresh interface and ask again over a
 * cancel that already landed. Checked in `ask` BEFORE `sessionFor`, so a
 * question asked after an abort refuses without opening an interface at all.
 */
const abortedInputs = new WeakSet<NodeJS.ReadableStream>();

const abortFailure = (): CliFailure => new CliFailure({ code: "FAILURE", message: "aborted" });

function sessionFor(io: PromptIo): Session {
  const existing = sessions.get(io.input);
  if (existing !== undefined) return existing;

  // Terminal mode is left to readline's auto-detect (output.isTTY): raw-mode
  // key handling — and with it the 'SIGINT' event — on real terminals, plain
  // line splitting with no escape sequences on pipes and test streams.
  const rl = createInterface({ input: io.input, output: io.output });
  const session: Session = { rl, queue: [], pending: null, closed: false };

  rl.on("line", (line) => {
    const pending = session.pending;
    if (pending !== null) {
      session.pending = null;
      pending.resolve(line);
    } else {
      session.queue.push(line);
    }
  });
  rl.on("close", () => {
    session.closed = true;
    const pending = session.pending;
    if (pending !== null) {
      session.pending = null;
      pending.resolve(null);
    }
  });
  rl.on("SIGINT", () => {
    abortedInputs.add(io.input);
    const pending = session.pending;
    if (pending !== null) {
      session.pending = null;
      pending.reject(abortFailure());
      return;
    }
    // No question is pending, so there is nothing to reject — and doing
    // nothing here is what made Ctrl-C vanish: registering this listener
    // suppresses readline's own handling, and raw mode means the terminal
    // never raised a signal either, so the keypress was consumed and the run
    // carried on. Closing the session releases the interception (readline
    // restores cooked mode on close), so the operator's NEXT Ctrl-C reaches
    // the process as an ordinary signal. The abort itself is recorded on
    // `abortedInputs` above, so a later question refuses immediately instead of
    // asking again over a cancel that already landed.
    rl.close();
  });

  sessions.set(io.input, session);
  return session;
}

/**
 * Renders the question text.
 *
 * node >=24 throws ERR_USE_AFTER_CLOSE ("readline was closed") from
 * `rl.prompt()` once the interface has closed, where node 22 made it a no-op.
 * A closed interface is the NORMAL state for every question after the first
 * when stdin is finite: `printf "y\n2\n" | stamity init` delivers both lines and
 * EOF in one chunk, so readline emits and closes while question 1 is still
 * being answered from the queue. Writing the prompt straight to the output
 * stream in that state is byte-identical to readline's own non-terminal prompt
 * write (`_writeToOutput(prompt)`), so the transcript is unchanged on both
 * node lines.
 */
function writePrompt(session: Session, io: PromptIo, prompt: string): void {
  if (session.closed) {
    io.output.write(prompt);
    return;
  }
  session.rl.setPrompt(prompt);
  session.rl.prompt();
}

/** One question: write the prompt, then a queued line, the next line, or null on EOF. */
async function ask(io: PromptIo, prompt: string): Promise<string | null> {
  if (abortedInputs.has(io.input)) throw abortFailure();
  const session = sessionFor(io);
  writePrompt(session, io, prompt);
  const queued = session.queue.shift();
  if (queued !== undefined) return queued;
  if (session.closed) return null;
  if (session.pending !== null) {
    throw new Error("prompts: a question is already pending on this input stream");
  }
  return await new Promise<string | null>((resolve, reject) => {
    session.pending = { resolve, reject };
  });
}

/** Closes the prompt session for this input, if one was opened. Idempotent. */
export function closePrompts(io: PromptIo): void {
  const session = sessions.get(io.input);
  if (session === undefined) return;
  sessions.delete(io.input);
  session.rl.close();
}

export async function confirm(
  gate: PromptGate,
  io: PromptIo,
  q: { question: string; defaultYes: boolean },
): Promise<boolean> {
  if (!gate.interactive) return q.defaultYes;
  const answer = await ask(io, `${q.question} ${q.defaultYes ? "[Y/n]" : "[y/N]"} `);
  const normalized = (answer ?? "").trim().toLowerCase();
  if (normalized === "y" || normalized === "yes") return true;
  if (normalized === "n" || normalized === "no") return false;
  return q.defaultYes;
}

/**
 * One choice from a list: an arrow menu where the streams support one, the
 * numbered typed list everywhere else.
 *
 * Both paths answer the same question with the same value, and both resolve to
 * `defaultValue` rather than failing when the answer is unusable — an EOF, an
 * out-of-range number, a `defaultValue` that names no choice. The menu starts
 * on the default row for the same reason the typed path brackets it: Enter with
 * no navigation is the same answer as Enter on an empty line.
 */
export async function selectOne<T extends string>(
  gate: PromptGate,
  io: PromptIo,
  q: {
    question: string;
    choices: readonly { value: T; label: string }[];
    defaultValue: T;
  },
): Promise<T> {
  if (!gate.interactive) return q.defaultValue;
  const defaultIndex = q.choices.findIndex((choice) => choice.value === q.defaultValue);
  const raw = rawMenuIo(gate, io, q.choices.length);
  // An empty choice list has no row to put a cursor on and no key that could
  // ever resolve it, so it goes to the typed path, which answers with the
  // default the way it always has.
  if (raw !== null && q.choices.length > 0) {
    const menu = await runMenu(io, raw, {
      question: `${q.question} ${MOVE_HINT}`,
      labels: q.choices.map((choice) => choice.label),
      active: defaultIndex === -1 ? 0 : defaultIndex,
      selected: null,
    });
    return q.choices[menu.active]?.value ?? q.defaultValue;
  }
  const rows = q.choices.map((choice, i) => `  ${i + 1}) ${choice.label}`);
  const bracket = defaultIndex === -1 ? q.defaultValue : String(defaultIndex + 1);
  const prompt = `${q.question}\n${rows.join("\n")}\nChoose 1-${q.choices.length} [${bracket}]: `;

  // Parity with `selectManyTyped`: a blank answer accepts the bracketed default
  // outright (Enter on an empty line is a normal answer, not a correction), but
  // an answer that named something UNUSABLE — out of range, non-numeric — is
  // re-asked once with the valid range shown, and only silently substitutes the
  // default if that second answer is unusable too, disclosed the same way. The
  // typed path used to fall back to `q.defaultValue` on any of those unusable
  // shapes with no disclosure at all, which at `init`'s migrate question is the
  // default landing on the destructive branch (`full`) with nothing printed —
  // exactly the outcome the question-protocol rule ("a run that applied a
  // default names it in its output") forbids.
  //
  // EOF is not a blank answer, even though both trim to the same empty string:
  // `ask` returns `null` specifically when the stream closed with nothing left
  // to read, as opposed to `""` for a line the operator (or a piped script)
  // actually sent. An explicit blank line is the operator naming the default;
  // EOF is nobody answering at all — so EOF ALWAYS discloses, on either
  // attempt, where an explicit blank never does.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a re-ask can only follow the answer it corrects
    const rawAnswer = await ask(io, prompt);
    if (rawAnswer === null) {
      io.output.write(`no answer — keeping the default (${bracket})\n`);
      return q.defaultValue;
    }
    const answer = rawAnswer.trim();
    if (answer === "") return q.defaultValue;
    if (/^\d+$/.test(answer)) {
      const picked = q.choices[Number.parseInt(answer, 10) - 1];
      if (picked !== undefined) return picked.value;
    }
    if (attempt === 0) {
      io.output.write(
        `not a valid choice: ${JSON.stringify(answer)} — enter a number 1-${q.choices.length}\n`,
      );
    }
  }
  io.output.write(`still not a valid choice — keeping the default (${bracket})\n`);
  return q.defaultValue;
}

/**
 * Any number of choices from a list: a checkbox menu where the streams support
 * one, a numbered list plus a comma-separated answer everywhere else.
 *
 * Three answers to the same question, and they differ in one visible way. The
 * non-interactive gate and a blank typed answer return `defaultValues`
 * VERBATIM — same order, and values that name no choice survive, because
 * neither path rendered the list and neither is in a position to edit the
 * caller's set. A menu or a typed selection returns the picks in CHOICE order
 * with duplicates collapsed: what came back was picked off rows, so it can only
 * contain values those rows carried, once each.
 *
 * The empty set is a legitimate answer on both interactive paths — every box
 * cleared, or nothing typed against an empty default — and is returned as `[]`
 * rather than reinterpreted as "the caller must have meant the defaults".
 */
export async function selectMany<T>(
  gate: PromptGate,
  io: PromptIo,
  q: {
    question: string;
    choices: readonly { value: T; label: string }[];
    defaultValues: readonly T[];
  },
): Promise<T[]> {
  if (!gate.interactive) return [...q.defaultValues];
  const defaultIndexes = q.choices.flatMap((choice, index) =>
    q.defaultValues.includes(choice.value) ? [index] : [],
  );
  const raw = rawMenuIo(gate, io, q.choices.length);
  if (raw !== null && q.choices.length > 0) {
    const menu = await runMenu(io, raw, {
      question: `${q.question} ${TOGGLE_HINT}`,
      labels: q.choices.map((choice) => choice.label),
      // The cursor opens on the first preselected row so the box under it is
      // the one the operator is most likely to be revisiting.
      active: defaultIndexes[0] ?? 0,
      selected: new Set(defaultIndexes),
    });
    const picked = menu.selected ?? new Set<number>();
    return q.choices.filter((_choice, index) => picked.has(index)).map((choice) => choice.value);
  }
  return await selectManyTyped(io, q, defaultIndexes);
}

/**
 * `"2, 3"` -> `[1, 2]`, in row order with duplicates collapsed.
 *
 * `"default"` covers both a blank answer and one that is nothing but
 * separators — neither names a row, and re-asking over `","` would be a
 * correction the operator cannot act on. Anything that is not an in-range row
 * number comes back under `invalid` spelled the way it was typed, so the
 * re-ask can quote it.
 */
function parseChoiceNumbers(
  answer: string,
  count: number,
): "default" | { indexes: number[] } | { invalid: string[] } {
  const tokens = answer
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
  if (tokens.length === 0) return "default";
  const invalid = tokens.filter((token) => {
    if (!/^\d+$/.test(token)) return true;
    const value = Number.parseInt(token, 10);
    return value < 1 || value > count;
  });
  if (invalid.length > 0) return { invalid };
  const indexes = [...new Set(tokens.map((token) => Number.parseInt(token, 10) - 1))];
  return { indexes: indexes.toSorted((a, b) => a - b) };
}

/**
 * The typed multi-select: the same numbered rows `selectOne` prints, answered
 * with a comma-separated list.
 *
 * An unusable answer is re-asked ONCE with the valid range shown and then falls
 * back to the defaults — the tolerance `init`'s tools question already had
 * (`../commands/init.ts`), kept here so a mistyped list is never a crash and
 * never an unanswered question either.
 */
async function selectManyTyped<T>(
  io: PromptIo,
  q: {
    question: string;
    choices: readonly { value: T; label: string }[];
    defaultValues: readonly T[];
  },
  defaultIndexes: readonly number[],
): Promise<T[]> {
  const count = q.choices.length;
  const rows = q.choices.map((choice, i) => `  ${i + 1}) ${choice.label}`);
  const bracket =
    defaultIndexes.length === 0 ? "none" : defaultIndexes.map((index) => index + 1).join(",");
  const prompt = `${q.question}\n${rows.join("\n")}\nChoose 1-${count}, comma-separated [${bracket}]: `;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- a re-ask can only follow the answer it corrects
    const raw = await ask(io, prompt);
    // EOF vs. an explicit blank line: same distinction `selectOne` makes, for
    // the same reason. `ask` returns `null` only when nothing was left to
    // read; a blank line the operator (or a script) actually sent is `""`.
    if (raw === null) {
      io.output.write(`no answer — keeping the defaults (${bracket})\n`);
      return [...q.defaultValues];
    }
    const answer = raw.trim();
    const parsed = parseChoiceNumbers(answer, count);
    if (parsed === "default") return [...q.defaultValues];
    if ("indexes" in parsed) {
      const picked = new Set(parsed.indexes);
      return q.choices.filter((_choice, index) => picked.has(index)).map((choice) => choice.value);
    }
    if (attempt === 0) {
      io.output.write(
        `not a valid choice: ${parsed.invalid.join(", ")} — ` +
          `enter numbers 1-${count} separated by commas\n`,
      );
    }
  }
  io.output.write(`still not a valid choice — keeping the defaults (${bracket})\n`);
  return [...q.defaultValues];
}

export async function textInput(
  gate: PromptGate,
  io: PromptIo,
  q: { question: string; defaultValue: string },
): Promise<string> {
  if (!gate.interactive) return q.defaultValue;
  const answer = (await ask(io, `${q.question} [${q.defaultValue}]: `))?.trim() ?? "";
  return answer === "" ? q.defaultValue : answer;
}

/* ── the arrow menu ─────────────────────────────────────────────────────── */

/**
 * The raw-mode key path behind `selectOne` and `selectMany`.
 *
 * The typed numbered list is NOT a legacy here. It is what a pipe, a CI log, a
 * dumb terminal, an editor shell buffer and every recorded transcript get, and
 * it is byte-identical to what it was before this section existed — the exact
 * strings (`Choose 1-3 [1]: `) are pinned by this kit's suite and by
 * `test/cli/commands/init.test.ts`. The menu is an addition on top; nothing
 * about the fallback moved to make room for it.
 *
 * ONE probe decides between them, and it asks five questions because each is a
 * different way the menu breaks: a closed gate (-y, --json, non-TTY stdin)
 * means nobody is there to press a key and stdout may belong to a JSON
 * envelope; a non-TTY stdin cannot be taken out of line mode, so keys would
 * arrive a line at a time; a non-TTY stdout would receive the cursor escapes as
 * literal garbage in a file; a stdin with no `setRawMode` — a socket, a
 * PassThrough, a test double — cannot deliver keys one at a time either; and
 * `TERM=dumb` names a terminal that accepts a keystroke but has told every
 * program reading it that it cannot reliably display cursor motion, which is
 * the module's own promise of an accessible opt-out (see the `TERM` read
 * below). `node:readline`'s `emitKeypressEvents` decodes named keys off ANY
 * readable stream, which is precisely why the absence of `setRawMode` has to
 * be tested for rather than inferred from a keypress that never arrives.
 *
 * NO COLOR IS WRITTEN. The kit's colour authority is
 * `./terminal.ts::resolveColorEnabled`, which needs the `--no-color` flag and
 * the env the funnel resolved; `PromptIo` carries neither, and reading
 * `process.env` from here would honour NO_COLOR while silently ignoring the
 * flag that outranks it. The cursor marker and the `[x]` box carry the state
 * instead, so the menu reads identically to a NO_COLOR reader, a `script(1)`
 * transcript and a terminal with a palette — the same property the banner's ink
 * has, for the same reason.
 *
 * `TERM` is read off `PromptGate.env` — INJECTED, the same discipline
 * `./banner.ts:174-178` uses for its own `TERM` read (`opts.env`, never
 * `process.env`) and the one `../../composition/root.ts::Runtime.env` exists
 * to carry: every gate-building call site (`../commands/init.ts`,
 * `./config.ts`, `../commands/clean.ts`) populates it from `ctx.app.runtime.env`.
 * `env` is optional and defaults to `{}` rather than `process.env` — a caller
 * that does not thread it through gets an unset `TERM`, which reads as
 * raw-capable (the probe only ever refuses on the literal value `"dumb"`), so
 * an untouched call site keeps its old behaviour instead of a silent new
 * refusal. `TERM=dumb` is the typed-path opt-out.
 */

/** The stream facts the menu needs, none of which `PromptIo` promises. */
type MaybeRawInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
};

interface RawIo {
  readonly input: NodeJS.ReadableStream & { setRawMode: (mode: boolean) => unknown };
  readonly output: NodeJS.WritableStream;
}

/** The capability probe. `null` means "render the typed list instead". */
function rawMenuIo(gate: PromptGate, io: PromptIo, choiceCount: number): RawIo | null {
  if (!gate.interactive) return null;
  const input = io.input as MaybeRawInput;
  const output = io.output as NodeJS.WritableStream & { isTTY?: boolean; rows?: number };
  if (input.isTTY !== true || output.isTTY !== true) return null;
  if (typeof input.setRawMode !== "function") return null;
  // `TERM=dumb` names a terminal that has told every program reading it that it
  // cannot reliably display cursor motion — the accessible opt-out this module
  // promises but did not check for. Read off the INJECTED `gate.env` (see the
  // "arrow menu" section header): an omitted `env` reads as an unset `TERM`,
  // which is the raw-capable default.
  if ((gate.env?.["TERM"] ?? "").toLowerCase() === "dumb") return null;
  // Height fit: a menu taller than the terminal scrolls its own top rows off
  // screen before the operator ever sees them, where the typed list simply
  // grows the scrollback instead of lying about which row the cursor is on.
  // `rows` is the fact node's tty layer reports; a stream that makes no such
  // promise (a pipe, most test doubles) leaves this check a no-op rather than a
  // refusal, so it stays additive over every case the probe already covered.
  if (typeof output.rows === "number" && choiceCount + 2 > output.rows) return null;
  // The cast carries the fact the line above established: narrowing an optional
  // property does not narrow the object that holds it.
  return { input: input as RawIo["input"], output: io.output };
}

/**
 * Every escape the menu writes, and there are only four.
 *
 * `2K` clears the whole line before each row is rewritten, because a frame
 * overwrites the previous one in place: without it a shorter row leaves the
 * tail of the longer row it replaced. `<n>A` walks back up over the frame just
 * drawn. `?25l`/`?25h` hide and show the cursor — the hide is cosmetic, the
 * show is not: a run that exits without it leaves an invisible cursor in the
 * operator's shell, which is why it is written in `finally` on every path.
 */
const CURSOR_HIDE = "\u001B[?25l";
const CURSOR_SHOW = "\u001B[?25h";
const CLEAR_LINE = "\u001B[2K";
const rewind = (lines: number): string => (lines > 0 ? `\u001B[${lines}A` : "");

/**
 * The key legend, appended to the question line rather than given a line of its
 * own so a frame is exactly one line per choice plus one.
 */
const MOVE_HINT = "(up/down to move, enter to accept, ctrl-c to cancel)";
const TOGGLE_HINT = "(up/down to move, space to toggle, enter to accept, ctrl-c to cancel)";

interface Menu {
  readonly question: string;
  readonly labels: readonly string[];
  active: number;
  /** `null` marks a single-select menu: no boxes drawn, and space does nothing. */
  readonly selected: Set<number> | null;
}

/** The default terminal width assumed when the output stream reports none. */
const DEFAULT_COLUMNS = 80;

/**
 * Strips a label to plain text: C0/C1 control bytes gone, `\r`/`\n`/`\t`
 * collapsed to a single space rather than dropped outright.
 *
 * Exported rather than kept file-local: the menu is not the only sink that
 * prints manifest-derived text straight to a terminal — `../commands/config.ts`'s
 * `runList` prints the same resolved values one row per key with no menu frame
 * at all, and a hostile ESC/OSC sequence there is exactly as live a hazard as
 * one riding a menu row. One function for both sinks rather than a second copy
 * drifting from this one.
 *
 * Every label a caller passes through here can originate from a manifest — a
 * pack's description, a server id, a free-form value an earlier `config set`
 * persisted — and that manifest is content this process did not author. An
 * embedded ESC (or any other C0/C1 byte) reaching the terminal mid-frame is a
 * foreign escape sequence riding the caller's own cursor writes (in the menu's
 * case) or simply landing raw in a script's output (in `runList`'s), and a
 * `\r` or embedded `\n` desynchronizes the one-row-per-line framing `runMenu`'s
 * rewind math depends on. `\r`/`\n`/`\t` become a space instead of vanishing so
 * two labels that differed only by whitespace do not collide into the same row.
 */
export function sanitizeLabel(label: string): string {
  return label
    .replace(/[\r\n\t]/gu, " ")
    // oxlint-disable-next-line no-control-regex -- stripping control bytes IS the point
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, "");
}

/** One frame: the question line, then one row per choice, clamped to `columns`. */
function renderMenu(menu: Menu, columns: number): string {
  const rows = menu.labels.map((label, index) => {
    // The marker, not colour, is what says which row is active, so an inactive
    // row spends a space on the marker column rather than dropping it: the
    // labels stay in one column and the cursor is the only thing that moves.
    const marker = index === menu.active ? ">" : " ";
    const box = menu.selected === null ? "" : `${menu.selected.has(index) ? "[x]" : "[ ]"} `;
    const prefix = `${marker} ${box}`;
    // Clamped to what is left of the row after the prefix, so a label wider
    // than the terminal cannot push the marker or box off screen or wrap the
    // frame onto a second physical line the rewind math does not know about.
    const budget = Math.max(0, columns - prefix.length);
    const clean = sanitizeLabel(label);
    const fitted = clean.length > budget ? clean.slice(0, budget) : clean;
    return `${prefix}${fitted}`;
  });
  return [menu.question, ...rows].map((line) => `${CLEAR_LINE}${line}\n`).join("");
}

/**
 * Takes the readline session down for the duration of a menu, returning the
 * lines it had queued (or `null` when there was no session to take down).
 *
 * THE HAZARD this exists for: one readline Interface lives per input stream for
 * the whole run, and its 'line' listener enqueues everything it sees. Left
 * attached while the menu owns the keyboard, it reads the SAME bytes — so the
 * Enter that accepts a menu also completes an empty readline line, and the next
 * typed question consumes that phantom `""` instead of asking. On a real
 * terminal it is worse than a phantom: a terminal-mode interface also echoes
 * the keystrokes and its own refresh escapes into the output, interleaved with
 * the frames. Suppressing the 'line' event alone would fix the queue and leave
 * the echo, so the interface goes away instead.
 *
 * `rl.close()` is the detach: it removes readline's keypress listener from the
 * stream, drops raw mode, and pauses the input — verified against node 22.22.1,
 * which is also where the phantom line was reproduced. No question can be
 * pending across this call, because `ask` is single-flight and its caller is
 * awaiting it; the queue is the only state worth carrying, and `restoreSession`
 * carries it.
 */
function quiesceSession(io: PromptIo): string[] | null {
  const session = sessions.get(io.input);
  if (session === undefined) return null;
  sessions.delete(io.input);
  const carried = [...session.queue];
  session.rl.close();
  return carried;
}

/**
 * Puts the session back exactly as the menu found it — same input, same queued
 * lines — so the question after a menu behaves like the question before it.
 *
 * A stream that had no session keeps none: opening one here would start a
 * Ctrl-C interception window this module's header warns against, on a stream
 * nobody has asked a question on yet.
 */
function restoreSession(io: PromptIo, carried: string[] | null): void {
  if (carried === null) return;
  sessionFor(io).queue.push(...carried);
}

/**
 * Runs one menu to Enter or Ctrl-C and returns the state it settled in.
 *
 * Cleanup is the whole point of the `finally`: listener off, raw mode off,
 * cursor back, stream paused. An abort mid-interaction has to leave a terminal
 * the operator can still type into, so none of those four is conditional on how
 * the interaction ended. The session comes back only when it did NOT end in an
 * abort: a Ctrl-C ends the run at the funnel, and a live interface past that
 * point is the interception window the header describes.
 */
async function runMenu(io: PromptIo, raw: RawIo, menu: Menu): Promise<Menu> {
  if (abortedInputs.has(io.input)) throw abortFailure();
  const carried = quiesceSession(io);
  const height = menu.labels.length + 1;
  const count = menu.labels.length;
  const columns =
    typeof (raw.output as { columns?: number }).columns === "number"
      ? (raw.output as { columns?: number }).columns!
      : DEFAULT_COLUMNS;
  emitKeypressEvents(raw.input);
  let listener: ((chunk: string | undefined, key: Key | undefined) => void) | null = null;
  let aborted = false;
  // Settled the instant Enter (or Ctrl-C) is processed, and checked FIRST in
  // the listener: `node:readline`'s keypress decoder can hand one `write()`
  // chunk to this listener several times in the same synchronous pass — "down
  // + enter + down" typed as one chunk decodes to three keypress events before
  // the microtask that consumes this promise's resolution ever runs — so
  // removing the listener on accept is not by itself enough to stop a
  // trailing byte in that SAME pass from being seen. The flag is the
  // authoritative gate; the `removeListener` below is the belt for every
  // chunk after this one.
  let settled = false;

  try {
    raw.input.setRawMode(true);
    raw.output.write(CURSOR_HIDE);
    return await new Promise<Menu>((resolve, reject) => {
      let drawn = false;
      const draw = (): void => {
        raw.output.write(`${drawn ? rewind(height) : ""}${renderMenu(menu, columns)}`);
        drawn = true;
      };

      listener = (_chunk, key) => {
        if (settled) return;
        const name = key?.name;
        if (name === "c" && key?.ctrl === true) {
          settled = true;
          aborted = true;
          abortedInputs.add(io.input);
          if (listener !== null) raw.input.removeListener("keypress", listener);
          listener = null;
          // The same failure the readline SIGINT path throws: one spelling of
          // "the operator cancelled" reaches the funnel, whichever path read it.
          reject(abortFailure());
          return;
        }
        if (name === "up") {
          menu.active = (menu.active + count - 1) % count;
          draw();
          return;
        }
        if (name === "down") {
          menu.active = (menu.active + 1) % count;
          draw();
          return;
        }
        if (name === "space" && menu.selected !== null) {
          if (!menu.selected.delete(menu.active)) menu.selected.add(menu.active);
          draw();
          return;
        }
        // CR is what a terminal in raw mode sends for Enter; LF is what a stream
        // that translated it sends. Both accept.
        if (name === "return" || name === "enter") {
          // Settle atomically: snapshot the state AT THIS MOMENT rather than
          // resolving the live (mutable) `menu` object, and detach before
          // resolving. A `Set` copy is required, not optional — `menu.selected`
          // is the same reference a later, already-ignored keypress would have
          // mutated in place, so a caller reading `resolved.selected` after a
          // trailing `space` in the same chunk must not see that toggle either.
          settled = true;
          if (listener !== null) raw.input.removeListener("keypress", listener);
          listener = null;
          resolve({
            question: menu.question,
            labels: menu.labels,
            active: menu.active,
            selected: menu.selected === null ? null : new Set(menu.selected),
          });
          return;
        }
        // Every other key is ignored on purpose: a mistyped character that
        // redrew, resolved or scrolled the menu would be a decision nobody made.
      };

      // Listener attached BEFORE the stream is resumed. `quiesceSession` left it
      // paused, and a chunk delivered while no keypress listener is attached is
      // decoded into nothing and gone — the first keypress of the menu would be
      // the one lost.
      raw.input.on("keypress", listener);
      draw();
      raw.input.resume();
    });
  } finally {
    if (listener !== null) raw.input.removeListener("keypress", listener);
    raw.input.setRawMode(false);
    raw.output.write(CURSOR_SHOW);
    // Paused, so nothing is read off the stream between here and whoever reads
    // next: bytes typed into a paused stream wait in its buffer, bytes read with
    // no listener are dropped.
    raw.input.pause();
    if (!aborted) restoreSession(io, carried);
  }
}
