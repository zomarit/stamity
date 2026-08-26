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
 */

export interface PromptIo {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export interface PromptGate {
  interactive: boolean;
}

/** Interactive only when stdin is a TTY and neither -y nor --json asked for silence. */
export function promptGate(opts: { stdinIsTTY: boolean; yes: boolean; json: boolean }): PromptGate {
  return { interactive: opts.stdinIsTTY && !opts.yes && !opts.json };
}

interface Session {
  readonly rl: Interface;
  readonly queue: string[];
  pending: { resolve: (line: string | null) => void; reject: (err: unknown) => void } | null;
  closed: boolean;
  aborted: boolean;
}

const sessions = new WeakMap<NodeJS.ReadableStream, Session>();

const abortFailure = (): CliFailure => new CliFailure({ code: "FAILURE", message: "aborted" });

function sessionFor(io: PromptIo): Session {
  const existing = sessions.get(io.input);
  if (existing !== undefined) return existing;

  // Terminal mode is left to readline's auto-detect (output.isTTY): raw-mode
  // key handling — and with it the 'SIGINT' event — on real terminals, plain
  // line splitting with no escape sequences on pipes and test streams.
  const rl = createInterface({ input: io.input, output: io.output });
  const session: Session = { rl, queue: [], pending: null, closed: false, aborted: false };

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
    session.aborted = true;
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
    // the process as an ordinary signal. The session object is kept in the map
    // rather than dropped: `aborted` is on it, and a later question has to
    // refuse immediately instead of opening a fresh interface and asking again.
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
  const session = sessionFor(io);
  if (session.aborted) throw abortFailure();
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
  const rows = q.choices.map((choice, i) => `  ${i + 1}) ${choice.label}`);
  const bracket = defaultIndex === -1 ? q.defaultValue : String(defaultIndex + 1);
  const prompt = `${q.question}\n${rows.join("\n")}\nChoose 1-${q.choices.length} [${bracket}]: `;
  const answer = (await ask(io, prompt))?.trim() ?? "";
  if (/^\d+$/.test(answer)) {
    const picked = q.choices[Number.parseInt(answer, 10) - 1];
    if (picked !== undefined) return picked.value;
  }
  return q.defaultValue;
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
