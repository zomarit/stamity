import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  closePrompts,
  confirm,
  promptGate,
  selectMany,
  selectOne,
  textInput,
  type PromptGate,
  type PromptIo,
} from "../../src/cli/kit/prompts.ts";
import { CliFailure } from "../../src/cli/kit/output.ts";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { runInProcess } from "../support/inProcess.ts";
// The raw-TTY double and the terminal's own key bytes, shared with the two
// command suites that drive the same menu (`test/support/menuTty.ts`).
import { MENU_KEYS as KEYS, MenuTtyInput } from "../support/menuTty.ts";

const interactive: PromptGate = { interactive: true };

function makePromptIo(opts?: { terminalOutput?: boolean }): {
  io: PromptIo;
  input: PassThrough;
  output: () => string;
} {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  }) as Writable & { isTTY?: boolean };
  // isTTY on the output stream flips readline into terminal mode — the mode in
  // which Ctrl-C arrives as an rl 'SIGINT' event instead of a process signal.
  if (opts?.terminalOutput === true) output.isTTY = true;
  return { io: { input, output }, input, output: () => chunks.join("") };
}

const TOOL_CHOICES = [
  { value: "a", label: "Claude Code" },
  { value: "b", label: "Cursor" },
  { value: "c", label: "Copilot" },
] as const;

/* ── raw-mode menu harness ─────────────────────────────────────────────── */

/**
 * Every byte the menu speaks, built from char codes so no literal control
 * character sits in this source — a stray ESC in a test file is invisible in a
 * diff and unsearchable in a review.
 */
const ESC = String.fromCharCode(27);
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
/** Rewind for a 4-line frame (one question line + three choice rows). */
const REWIND_4 = `${ESC}[4A`;

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function makeTtyPromptIo(opts: {
  rawMode: boolean;
  outputIsTTY?: boolean;
  columns?: number;
  rows?: number;
}): {
  io: PromptIo;
  input: MenuTtyInput;
  output: () => string;
  chunks: () => readonly string[];
} {
  const input = new MenuTtyInput({ rawMode: opts.rawMode });
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  }) as Writable & { isTTY?: boolean; columns?: number; rows?: number };
  output.isTTY = opts.outputIsTTY ?? true;
  if (opts.columns !== undefined) output.columns = opts.columns;
  if (opts.rows !== undefined) output.rows = opts.rows;
  return {
    io: { input, output },
    input,
    output: () => chunks.join(""),
    chunks: () => chunks,
  };
}

/**
 * Drives keys into the fake stdin. All writes land first and one turn of the
 * loop delivers them: the keypress decoder is fed per byte, so a burst decodes
 * in order — verified against `node:readline` before this harness was written.
 */
async function press(input: MenuTtyInput, ...keys: readonly string[]): Promise<void> {
  for (const key of keys) input.write(key);
  await tick();
}

/** The frames that carry menu rows, newest last. */
const menuFrames = (chunks: () => readonly string[]): readonly string[] =>
  chunks().filter((chunk) => chunk.includes("Claude Code"));

describe("promptGate", () => {
  it("is interactive only on a TTY stdin without -y or --json", () => {
    expect(promptGate({ stdinIsTTY: true, yes: false, json: false })).toEqual({
      interactive: true,
    });
    expect(promptGate({ stdinIsTTY: false, yes: false, json: false }).interactive).toBe(false);
    expect(promptGate({ stdinIsTTY: true, yes: true, json: false }).interactive).toBe(false);
    // Corrected comment (no assertion change): `--json` makes a run
    // NON-INTERACTIVE — stdout belongs to the single envelope, so no prompt can
    // be written there — but it does NOT imply `-y`. The retired "implies -y"
    // rule is what `stamity clean --json` would have read as consent to delete.
    // The gate is where the distinction lives, and `yes` stays false here.
    expect(promptGate({ stdinIsTTY: true, yes: false, json: true }).interactive).toBe(false);
  });

  it("threads env through onto the gate, and carries none when the caller passes none", () => {
    // The seam `rawMenuIo`'s TERM read depends on: a caller that supplies
    // `env` gets it back verbatim on the gate, and a caller that supplies none
    // gets a gate with no `env` key at all rather than a stray `undefined` one
    // — the shape `{ interactive: true }` throughout the rest of this suite
    // (the `interactive` const, and every literal `PromptGate` built by hand)
    // already relies on.
    const withEnv = promptGate({ stdinIsTTY: true, yes: false, json: false, env: { TERM: "dumb" } });
    expect(withEnv.env).toEqual({ TERM: "dumb" });

    const withoutEnv = promptGate({ stdinIsTTY: true, yes: false, json: false });
    expect(withoutEnv).toEqual({ interactive: true });
    expect("env" in withoutEnv).toBe(false);
  });
});

describe("Ctrl-C outside a question", () => {
  it("closes the session so the interception ends, and refuses every later question", async () => {
    // This listener is what suppresses readline's own ^C handling, and
    // raw mode means the terminal raised no signal either — so a Ctrl-C with no
    // question pending was consumed and the run carried on with the keypress
    // simply gone. The session closes instead, which releases raw mode.
    const { io, input } = makePromptIo({ terminalOutput: true });
    // Open the session and settle a question, so the listener is live and
    // nothing is pending when the ^C lands.
    input.write("y\n");
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);

    input.write("");
    await new Promise((resolve) => setImmediate(resolve));

    // Released: readline is no longer reading keypresses off this stream, which
    // is the interception. (On a real TTY the same close also drops raw mode,
    // so the next ^C is a signal again; a PassThrough has no raw mode to
    // observe, and the keypress subscription is the same fact one layer up.)
    expect(input.listenerCount("keypress")).toBe(0);
    // And the abort is remembered rather than dropped: the next question does
    // not re-open an interface and ask again over a cancel that already landed.
    await expect(
      confirm(interactive, io, { question: "Again?", defaultYes: true }),
    ).rejects.toMatchObject({ doc: { message: "aborted" } });
    closePrompts(io);
  });
});

describe("non-interactive prompts", () => {
  it("returns the declared defaults without reading or writing anything", async () => {
    const { io, output } = makePromptIo();
    const gate: PromptGate = { interactive: false };

    expect(await confirm(gate, io, { question: "Carry?", defaultYes: true })).toBe(true);
    expect(await confirm(gate, io, { question: "Carry?", defaultYes: false })).toBe(false);
    expect(
      await selectOne(gate, io, { question: "Tool?", choices: TOOL_CHOICES, defaultValue: "b" }),
    ).toBe("b");
    expect(await textInput(gate, io, { question: "Name?", defaultValue: "core" })).toBe("core");
    expect(output()).toBe("");
  });
});

describe("confirm (interactive)", () => {
  const cases: readonly [answer: string, defaultYes: boolean, expected: boolean][] = [
    ["y", false, true],
    ["Y", false, true],
    ["yes", false, true],
    ["n", true, false],
    ["no", true, false],
    ["", true, true],
    ["", false, false],
    ["whatever", false, false], // unparseable answers fall back to the default
  ];

  for (const [answer, defaultYes, expected] of cases) {
    it(`answers ${JSON.stringify(answer)} with default ${String(defaultYes)} -> ${String(expected)}`, async () => {
      const { io, input, output } = makePromptIo();
      input.write(`${answer}\n`);
      const result = await confirm(interactive, io, { question: "Carry?", defaultYes });
      expect(result).toBe(expected);
      expect(output()).toContain(defaultYes ? "Carry? [Y/n]" : "Carry? [y/N]");
      closePrompts(io);
    });
  }

  it("resolves to the default on EOF without any input", async () => {
    const { io, input } = makePromptIo();
    input.end();
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: true })).toBe(true);
    closePrompts(io);
  });
});

describe("selectOne (interactive)", () => {
  it("renders the numbered list and accepts a number", async () => {
    const { io, input, output } = makePromptIo();
    input.write("2\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    expect(picked).toBe("b");
    expect(output()).toContain("Which tool?");
    expect(output()).toContain("  1) Claude Code");
    expect(output()).toContain("  2) Cursor");
    expect(output()).toContain("  3) Copilot");
    expect(output()).toContain("Choose 1-3 [1]: ");
    closePrompts(io);
  });

  // Extended (no assertion weakened): a blank answer was and still is a normal
  // "accept the default" answer, so it stays its own case with no disclosure
  // asserted. Out-of-range and non-numeric are UNUSABLE answers, and the old
  // version of this loop asserted only the returned value — the exact gap
  // finding F1 named: an unusable answer used to fall back to `defaultValue`
  // with nothing printed, which at `init`'s migrate question (default `full`,
  // the destructive branch) is a silent default landing on a destructive
  // choice. Reframed to assert the disclosure the fix adds: a re-ask with the
  // valid range, then a "keeping the default" line that names it.
  it("falls back to the default on a blank answer, with no disclosure", async () => {
    const { io, input, output } = makePromptIo();
    input.write("\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "c",
    });
    expect(picked).toBe("c");
    expect(output()).not.toContain("not a valid choice");
    expect(output()).not.toContain("keeping the default");
    closePrompts(io);
  });

  for (const [label, answer] of [
    ["out-of-range", "9"],
    ["non-numeric", "x"],
  ] as const) {
    it(`re-asks once, discloses the invalid answer, and keeps the default on a ${label} answer`, async () => {
      const { io, input, output } = makePromptIo();
      // Two copies of the same unusable answer: the first triggers the re-ask,
      // the second is what the re-ask reads before the fallback fires.
      input.end(`${answer}\n${answer}\n`);
      const picked = await selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "c",
      });
      expect(picked).toBe("c");
      expect(output()).toContain(`not a valid choice: ${JSON.stringify(answer)}`);
      expect(output()).toContain("enter a number 1-3");
      // The default this run applied is NAMED in the output — the
      // question-protocol rule a silent substitute would otherwise breach.
      expect(output()).toContain("still not a valid choice — keeping the default (3)");
      closePrompts(io);
    });
  }

  it("never silently lands on the non-default when the answer is unusable (destructive-adjacent case)", async () => {
    // The shape `init`'s migrate question actually has: two choices, default on
    // the destructive one. An unusable answer here must keep landing on the
    // declared default (`full`) rather than drifting onto `skip` — and the run
    // must say a default was applied, not stay silent about it.
    const { io, input, output } = makePromptIo();
    const choices = [
      { value: "full", label: "full — import config as defaults, strip old blocks" },
      { value: "skip", label: "skip — leave the previous setup untouched" },
    ] as const;
    input.end("bogus\nbogus\n");
    const picked = await selectOne(interactive, io, {
      question: "Migrate?",
      choices,
      defaultValue: "full",
    });
    expect(picked).toBe("full");
    expect(output()).toContain("keeping the default (1)");
    closePrompts(io);
  });

  // W4: EOF is not an explicit blank, even though both trim to the empty
  // string. An explicit blank line is the operator naming the default; EOF is
  // nobody answering at all, so it discloses where a blank never does — the
  // question-protocol rule ("a run that applied a default names it in its
  // output") reaches EOF the same way it reaches an unusable typed answer.
  // Extended from the old "falls back to the default on EOF" case (no
  // assertion weakened: the returned value is still asserted, unchanged) to
  // also assert the disclosure this fix adds.
  it("falls back to the default on EOF, and DISCLOSES it (W4)", async () => {
    const { io, input, output } = makePromptIo();
    input.end();
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    expect(picked).toBe("b");
    expect(output()).toContain("no answer — keeping the default (2)");
    closePrompts(io);
  });

  it("discloses the default on the printf-one-bad-line shape: an invalid answer, then EOF (W4)", async () => {
    // `printf "x\n" | stamity ...`: one bad line, then the pipe closes. The
    // re-ask fires on the invalid first answer, and the SECOND `ask()` hits
    // EOF rather than another typed line — the exact shape the question-protocol
    // rationale names: nobody was there to answer the re-ask either.
    const { io, input, output } = makePromptIo();
    input.end("x\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "c",
    });
    expect(picked).toBe("c");
    expect(output()).toContain(`not a valid choice: ${JSON.stringify("x")}`);
    // EOF's own disclosure, not the "still not a valid choice" wording the
    // two-invalid-answers case gets — there was no second ANSWER to call
    // invalid, only nobody left to ask.
    expect(output()).toContain("no answer — keeping the default (3)");
    closePrompts(io);
  });
});

describe("textInput (interactive)", () => {
  it("returns the typed answer, trimmed", async () => {
    const { io, input, output } = makePromptIo();
    input.write("  custom  \n");
    expect(await textInput(interactive, io, { question: "Name?", defaultValue: "core" })).toBe(
      "custom",
    );
    expect(output()).toContain("Name? [core]: ");
    closePrompts(io);
  });

  it("returns the default on a blank answer", async () => {
    const { io, input } = makePromptIo();
    input.write("\n");
    expect(await textInput(interactive, io, { question: "Name?", defaultValue: "core" })).toBe(
      "core",
    );
    closePrompts(io);
  });
});

describe("prompt session", () => {
  it("keeps lines from one piped chunk across sequential questions", async () => {
    // "y\n2\n" arrives as a single chunk, exactly like `printf "y\n2\n" | stamity init`.
    // readline emits both lines immediately; the session queue must hold the
    // second for the second question instead of dropping it.
    const { io, input } = makePromptIo();
    input.write("y\n2\n");
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);
    expect(
      await selectOne(interactive, io, {
        question: "Tool?",
        choices: TOOL_CHOICES,
        defaultValue: "a",
      }),
    ).toBe("b");
    closePrompts(io);
  });

  it("keeps rendering and answering questions after stdin EOF closed readline", async () => {
    // Regression: node >=24 throws ERR_USE_AFTER_CLOSE from rl.prompt() once the
    // interface has closed, where node 22 no-ops. Closed is the normal state for
    // question 2 of a finite pipe — `printf "y\n2\n" | stamity init` delivers both
    // lines AND EOF before the first answer is consumed — so questions 2..n must
    // still render their text and resolve (queued line, then default past EOF)
    // instead of crashing the run to exit 1.
    const { io, input, output } = makePromptIo();
    input.end("y\n2\n");

    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);
    expect(
      await selectOne(interactive, io, {
        question: "Tool?",
        choices: TOOL_CHOICES,
        defaultValue: "a",
      }),
    ).toBe("b");
    // Past the last line: EOF answers with the default, and the ask is still shown.
    expect(await textInput(interactive, io, { question: "Name?", defaultValue: "core" })).toBe(
      "core",
    );

    expect(output()).toContain("Choose 1-3 [1]: ");
    expect(output()).toContain("Name? [core]: ");
    closePrompts(io);
  });

  it("throws CliFailure('aborted') on Ctrl-C during a question, and on every later question", async () => {
    const { io, input } = makePromptIo({ terminalOutput: true });
    const pending = confirm(interactive, io, { question: "Carry?", defaultYes: true });
    input.write("\u0003"); // ^C keypress in terminal mode -> readline 'SIGINT'
    await expect(pending).rejects.toBeInstanceOf(CliFailure);
    await expect(pending).rejects.toMatchObject({ doc: { code: "FAILURE", message: "aborted" } });
    await expect(
      confirm(interactive, io, { question: "Again?", defaultYes: true }),
    ).rejects.toMatchObject({ doc: { message: "aborted" } });
    closePrompts(io);
  });

  it("closePrompts is idempotent and safe on an io that never prompted", () => {
    const { io } = makePromptIo();
    closePrompts(io); // never opened
    closePrompts(io);
  });
});

describe("prompts through the program runner", () => {
  const askCmd: CommandModule = {
    name: "ask",
    summary: "prompt fixture",
    mutating: false,
    run: async (ctx) => {
      const gate = promptGate({
        stdinIsTTY: ctx.terminal.stdinIsTTY,
        yes: ctx.yes,
        json: ctx.json,
      });
      const carried = await confirm(gate, ctx.promptIo, {
        question: "Carry learnings?",
        defaultYes: true,
      });
      ctx.io.out(`carried=${String(carried)}\n`);
      return { exitCode: 0, json: { carried } };
    },
  };

  it("asks on a TTY stdin and honors the typed answer", async () => {
    const result = await runInProcess([askCmd], ["ask"], {
      tty: { stdin: true },
      stdinLines: ["n"],
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Carry learnings? [Y/n]");
    expect(result.stdout).toContain("carried=false");
  });

  it("--json is non-interactive: resolves the default without touching stdin and never hangs", async () => {
    // Renamed and re-framed (no assertion weakened): the old title said
    // "--json implies -y", a rule the binary deliberately does not follow and
    // the shipped reference wrongly published. What `--json` does is make the
    // run non-interactive — stdout belongs to the single envelope — which is
    // what these assertions have always proved. It is NOT consent, and the
    // added case below is the half the old title obscured.
    const result = await runInProcess([askCmd], ["ask", "--json"], {
      tty: { stdin: true },
      stdinLines: ["n"], // present but must go unread
    });
    expect(result.code).toBe(0);
    const lines = result.stdout.split("\n").filter((line) => line !== "");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: true, carried: true });
  });

  it("--json does not set the yes flag a destructive gate reads", async () => {
    // The distinction that matters on the destructive path: a command gating on
    // `ctx.yes` (as `clean` does, ahead of its confirmation) must not see
    // `--json` as consent. `stamity clean --json` is the natural
    // machine-readable spelling, and folding the flags would make it delete
    // `.stamity/` with no confirmation anywhere in the invocation.
    const reportsConsent: CommandModule = {
      name: "consent",
      summary: "reports the consent flags it was given",
      mutating: true,
      run: async (ctx) => ({ exitCode: 0, json: { yes: ctx.yes, json: ctx.json } }),
    };

    const withJson = await runInProcess([reportsConsent], ["consent", "--json"]);
    expect(JSON.parse(withJson.stdout.trim())).toMatchObject({ yes: false, json: true });

    const withYes = await runInProcess([reportsConsent], ["consent", "--json", "-y"]);
    expect(JSON.parse(withYes.stdout.trim())).toMatchObject({ yes: true, json: true });
  });

  it("-y answers with the default and skips the prompt text", async () => {
    const result = await runInProcess([askCmd], ["ask", "-y"], {
      tty: { stdin: true },
      stdinLines: ["n"],
    });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Carry learnings?");
    expect(result.stdout).toContain("carried=true");
  });

  it("defaults without prompting when stdin is not a TTY", async () => {
    const result = await runInProcess([askCmd], ["ask"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Carry learnings?");
    expect(result.stdout).toContain("carried=true");
  });

  it("resolves the default when interactive stdin hits EOF with no lines", async () => {
    const result = await runInProcess([askCmd], ["ask"], { tty: { stdin: true } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("carried=true");
  });
});

describe("selectOne (raw arrow menu)", () => {
  it("resolves the choice the cursor is on when Enter lands", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.down, KEYS.down, KEYS.enter);
    expect(await pending).toBe("c");
  });

  it("wraps from the top row to the bottom one", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.up, KEYS.enter);
    expect(await pending).toBe("c");
  });

  it("wraps from the bottom row to the top one", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "c",
    });
    await press(input, KEYS.down, KEYS.enter);
    expect(await pending).toBe("a");
  });

  it("starts on the default row and marks exactly one row with the cursor", async () => {
    const { io, input, chunks } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    await tick();
    const first = menuFrames(chunks)[0] ?? "";
    expect(first).toContain("Which tool?");
    expect(first).toContain("> Cursor");
    expect(first).toContain("  Claude Code");
    expect(first).not.toContain("> Claude Code");

    await press(input, KEYS.down);
    const moved = menuFrames(chunks).at(-1) ?? "";
    expect(moved).toContain("> Copilot");
    expect(moved).not.toContain("> Cursor");
    await press(input, KEYS.enter);
    expect(await pending).toBe("c");
  });

  it("redraws in place: the first frame does not rewind and later frames rewind a full menu", async () => {
    const { io, input, chunks } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    expect(menuFrames(chunks)[0] ?? "").not.toContain(REWIND_4);
    await press(input, KEYS.down);
    // 1 question line + 3 rows: the cursor goes back to the question line so the
    // whole menu is overwritten rather than reprinted underneath itself.
    expect(menuFrames(chunks).at(-1) ?? "").toContain(REWIND_4);
    await press(input, KEYS.enter);
    expect(await pending).toBe("b");
  });

  it("hides the cursor for the interaction and shows it again on the way out", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    expect(output()).toContain(CURSOR_HIDE);
    expect(output().endsWith(CURSOR_SHOW)).toBe(true);
    expect(input.rawModes).toEqual([true, false]);
  });

  it("aborts on Ctrl-C leaving the terminal usable, and refuses every later question", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    // Handlers attached BEFORE the keypress. A real caller awaits `selectOne`
    // directly, but here the abort lands a turn of the loop after the write, and
    // a promise that rejects with nothing yet attached is an unhandled rejection
    // in the run even though the assertion catches it a turn later.
    const asserted = Promise.all([
      expect(pending).rejects.toBeInstanceOf(CliFailure),
      expect(pending).rejects.toMatchObject({ doc: { code: "FAILURE", message: "aborted" } }),
    ]);
    await press(input, KEYS.ctrlC);
    await asserted;
    // Raw mode dropped and the cursor back: an abort mid-menu must not leave the
    // operator typing blind into a terminal that eats their keystrokes.
    expect(input.rawModes).toEqual([true, false]);
    expect(output()).toContain(CURSOR_SHOW);
    // Same stickiness as readline's SIGINT path: the abort is remembered rather
    // than dropped, and the next question refuses without reading a byte.
    await expect(
      textInput(interactive, io, { question: "Name?", defaultValue: "core" }),
    ).rejects.toMatchObject({ doc: { message: "aborted" } });
    closePrompts(io);
  });

  it("aborts on Ctrl-C after a truncated CSI prefix arrived in an earlier write (SM4)", async () => {
    // A lone ESC with no continuation byte is a truncated CSI prefix — the same
    // shape the start of an arrow-key sequence has before its second byte
    // lands. `node:readline`'s decoder holds it for a window (verified against
    // node 22.22.1: it flushes a lone ESC as a standalone `escape` keypress
    // after roughly half a second with no continuation) before treating it as
    // its own key, so the two writes are pushed on either side of that window —
    // written in ITS OWN chunk, then Ctrl-C in a second, later chunk — to prove
    // the decoder's handling of the first byte does not swallow or
    // desynchronize the second. Observed directly against this harness before
    // this assertion was written: the ESC flushes as `{ name: "escape" }`
    // (ignored on purpose — "every other key is ignored") and the Ctrl-C that
    // follows decodes cleanly as `{ name: "c", ctrl: true }`, so the abort
    // fires. Had it not, this would report the observed keypress verbatim
    // instead of forcing a pass.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    const asserted = Promise.all([
      expect(pending).rejects.toBeInstanceOf(CliFailure),
      expect(pending).rejects.toMatchObject({ doc: { code: "FAILURE", message: "aborted" } }),
    ]);
    input.write(ESC);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await press(input, KEYS.ctrlC);
    await asserted;
    expect(input.rawModes).toEqual([true, false]);
    expect(output()).toContain(CURSOR_SHOW);
    closePrompts(io);
  }, 10000);

  it("takes the typed path when stdin is a TTY that cannot enter raw mode", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("2\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    expect(picked).toBe("b");
    expect(output()).toContain("Choose 1-3 [1]: ");
    expect(output()).not.toContain(CURSOR_HIDE);
    closePrompts(io);
  });

  it("takes the typed path when the output is not a terminal", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, outputIsTTY: false });
    input.write("3\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    expect(picked).toBe("c");
    expect(output()).toContain("Choose 1-3 [1]: ");
    expect(input.rawModes).toEqual([]);
    closePrompts(io);
  });
});

describe("the raw menu — accept-time settling (SW2)", () => {
  it("settles atomically at Enter: a trailing byte in the SAME chunk cannot move the selection after acceptance", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    // ONE write(): down (a->b), Enter (accepts b), down (b->c if a still-live
    // listener saw it). node's keypress decoder emits all three synchronously
    // off one chunk, ahead of the microtask that consumes this promise's
    // resolution — the exact race window SW2 named. Unfixed, `resolve(menu)`
    // handed back a reference to the mutable menu object, and the trailing
    // `down` moved `menu.active` to 2 before the awaiting code ever read it.
    input.write(`${KEYS.down}${KEYS.enter}${KEYS.down}`);
    await tick();
    expect(await pending).toBe("b");
  });

  it("settles atomically for a checkbox menu too: a trailing space cannot toggle a box after Enter", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    // Enter accepts { a }; the trailing space, if it reached a still-live
    // listener, would toggle row `a` (the cursor's row) back off.
    input.write(`${KEYS.enter}${KEYS.space}`);
    await tick();
    expect(await pending).toEqual(["a"]);
  });
});

describe("the raw menu — label geometry and injection floor (F3/W1/W2/SW1)", () => {
  it("strips control bytes from a label so no foreign escape reaches the frame", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const bel = String.fromCharCode(7);
    // An OSC "set title" sequence, BEL-terminated: exactly the shape a
    // manifest-derived label (a pack description, a server id) could carry if
    // it were echoed straight into the frame.
    const hostile = `Claude${ESC}]0;pwned${bel} Code`;
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: [{ value: "x", label: hostile }],
      defaultValue: "x",
    });
    await press(input, KEYS.enter);
    expect(await pending).toBe("x");

    const rendered = output();
    expect(rendered).not.toContain(`${ESC}]0;`);
    expect(rendered).not.toContain(bel);
    // Every ESC left in the whole transcript is one of the renderer's own four:
    // CURSOR_HIDE (1) + one CLEAR_LINE per drawn line — the question line and
    // the one choice row, drawn once (no navigation happened) — + CURSOR_SHOW
    // (1) on the way out.
    const escCount = rendered.split(ESC).length - 1;
    expect(escCount).toBe(1 + 2 + 1);
  });

  it("clamps a label wider than the terminal to the space left after the marker", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 20 });
    const long = "x".repeat(40);
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: [{ value: "x", label: long }],
      defaultValue: "x",
    });
    await tick();
    // Prefix for a single-select row with no checkbox is "> " (2 chars), so the
    // budget is 20 - 2 = 18.
    expect(output()).toContain(`> ${"x".repeat(18)}\n`);
    expect(output()).not.toContain("x".repeat(19));
    await press(input, KEYS.enter);
    expect(await pending).toBe("x");
  });

  it("takes the typed path when the menu would not fit the terminal's height", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, rows: 5 });
    // 17 rows + the question line (18) needs more than 5 terminal rows by any
    // margin; `choiceCount + 2 > rows` (17 + 2 > 5) is the probe's own check.
    const choices = Array.from({ length: 17 }, (_, i) => ({
      value: String(i),
      label: `Choice ${i}`,
    }));
    input.write("1\n");
    const picked = await selectOne(interactive, io, {
      question: "Which one?",
      choices,
      defaultValue: "0",
    });
    expect(picked).toBe("0");
    expect(output()).toContain("Choose 1-17 [1]: ");
    // The menu's OWN draw never ran — its first write is always CURSOR_HIDE, so
    // its absence is proof `runMenu` was never entered. (`input.rawModes` is
    // not the right probe here: `node:readline`'s own terminal-mode line
    // editing calls `setRawMode` on a TTY-capable stdin independently of this
    // kit's menu, so a bare TTY stdin taking the typed path still shows a
    // `setRawMode` call that belongs to readline, not to `runMenu`.)
    expect(output()).not.toContain(CURSOR_HIDE);
    closePrompts(io);
  });
});

describe("the raw menu — TERM=dumb is the accessible opt-out (F2)", () => {
  // `TERM` is read off the INJECTED `gate.env` (`../../src/cli/kit/prompts.ts`),
  // never `process.env` — `vi.stubEnv` would no longer reach the probe at all,
  // which is exactly the point: a caller's real terminal cannot leak into this
  // kit's decision. The gate is built directly with an `env` field instead.

  it("takes the typed path when TERM=dumb, even though every stream fact would otherwise run the menu", async () => {
    const gate: PromptGate = { interactive: true, env: { TERM: "dumb" } };
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    input.write("2\n");
    const picked = await selectOne(gate, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    expect(picked).toBe("b");
    expect(output()).toContain("Choose 1-3 [1]: ");
    // Same reasoning as the height-fit case just above: CURSOR_HIDE's absence
    // is what proves `runMenu` never ran, since readline's own terminal mode
    // calls `setRawMode` on this stdin independently of the menu.
    expect(output()).not.toContain(CURSOR_HIDE);
    closePrompts(io);
  });

  it("still takes the raw menu on an ordinary TERM value", async () => {
    const gate: PromptGate = { interactive: true, env: { TERM: "xterm-256color" } };
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(gate, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    expect(input.rawModes).toEqual([true, false]);
  });

  it("takes the raw menu when the gate carries no env at all — omission is the raw-capable default", async () => {
    const gate: PromptGate = { interactive: true };
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(gate, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    expect(input.rawModes).toEqual([true, false]);
  });
});

describe("selectMany", () => {
  it("returns the declared defaults verbatim on a non-interactive gate, writing nothing", async () => {
    const { io, output } = makePromptIo();
    const picked = await selectMany({ interactive: false }, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["c", "a"],
    });
    expect(picked).toEqual(["c", "a"]);
    expect(output()).toBe("");
  });

  it("never probes for raw mode when -y or --json closed the gate", async () => {
    for (const gate of [
      promptGate({ stdinIsTTY: true, yes: true, json: false }),
      promptGate({ stdinIsTTY: true, yes: false, json: true }),
    ]) {
      const { io, input, output } = makeTtyPromptIo({ rawMode: true });
      // oxlint-disable-next-line no-await-in-loop -- two gates, one assertion each
      const picked = await selectMany(gate, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["b", "c"],
      });
      expect(picked).toEqual(["b", "c"]);
      expect(output()).toBe("");
      expect(input.rawModes).toEqual([]);
    }
  });

  it("shows the defaults preselected and resolves exactly the toggled set", async () => {
    const { io, input, chunks } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    await tick();
    const first = menuFrames(chunks)[0] ?? "";
    expect(first).toContain("> [x] Claude Code");
    expect(first).toContain("  [ ] Cursor");

    await press(input, KEYS.down, KEYS.space);
    expect(menuFrames(chunks).at(-1) ?? "").toContain("> [x] Cursor");
    await press(input, KEYS.enter);
    expect(await pending).toEqual(["a", "b"]);
  });

  it("clears a preselected row when space toggles it off", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a", "c"],
    });
    await press(input, KEYS.space, KEYS.enter);
    expect(await pending).toEqual(["c"]);
  });

  it("resolves the empty set when every default is toggled off", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a", "b"],
    });
    await press(input, KEYS.space, KEYS.down, KEYS.space, KEYS.enter);
    expect(await pending).toEqual([]);
  });

  it("aborts on Ctrl-C the same way the single-select menu does", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    const asserted = expect(pending).rejects.toMatchObject({
      doc: { code: "FAILURE", message: "aborted" },
    });
    await press(input, KEYS.ctrlC);
    await asserted;
    expect(input.rawModes).toEqual([true, false]);
    expect(output()).toContain(CURSOR_SHOW);
    closePrompts(io);
  });
});

describe("selectMany (typed fallback)", () => {
  it("renders the numbered list with the defaults bracketed and accepts a comma-separated answer", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("2, 3\n");
    const picked = await selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a", "c"],
    });
    expect(picked).toEqual(["b", "c"]);
    expect(output()).toContain("Which tools?");
    expect(output()).toContain("  1) Claude Code");
    expect(output()).toContain("  3) Copilot");
    expect(output()).toContain("Choose 1-3, comma-separated [1,3]: ");
    closePrompts(io);
  });

  it("returns the choices in menu order, deduplicated, whatever order they were typed in", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: false });
    input.write("3,1,3\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: [],
      }),
    ).toEqual(["a", "c"]);
    closePrompts(io);
  });

  it("keeps the defaults on a blank answer", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["b", "c"],
      }),
    ).toEqual(["b", "c"]);
    expect(output()).toContain("[2,3]: ");
    closePrompts(io);
  });

  it("brackets an empty default set as none", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: [],
      }),
    ).toEqual([]);
    expect(output()).toContain("[none]: ");
    closePrompts(io);
  });

  it("re-asks once after an unparseable entry and honours the correction", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("x\n2,3\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["a"],
      }),
    ).toEqual(["b", "c"]);
    expect(output()).toContain("not a valid choice: x");
    closePrompts(io);
  });

  it("falls back to the defaults after a second unparseable entry", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.write("x\n9\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["a", "b"],
      }),
    ).toEqual(["a", "b"]);
    expect(output()).toContain("keeping the defaults (1,2)");
    closePrompts(io);
  });

  // W4, `selectMany`'s side of the same fix: EOF is not an explicit blank.
  // Extended from the old "falls back to the defaults on EOF" case (no
  // assertion weakened: the returned value is still asserted, unchanged).
  it("falls back to the defaults on EOF, and DISCLOSES it (W4)", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.end();
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["c"],
      }),
    ).toEqual(["c"]);
    expect(output()).toContain("no answer — keeping the defaults (3)");
    closePrompts(io);
  });

  it("discloses the defaults on the printf-one-bad-line shape: an invalid answer, then EOF (W4)", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.end("9\n");
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["a", "b"],
      }),
    ).toEqual(["a", "b"]);
    expect(output()).toContain("not a valid choice: 9");
    expect(output()).toContain("no answer — keeping the defaults (1,2)");
    closePrompts(io);
  });
});

describe("the raw menu and the readline session", () => {
  it("leaves no phantom line: the question after a menu reads the typed answer", async () => {
    // THE hazard. One readline Interface lives per input stream for the whole
    // run, and its 'line' listener enqueues everything it sees. If it is still
    // attached while the menu owns the keyboard, the Enter that accepts the menu
    // ALSO closes an empty readline line — so the next typed question consumes a
    // phantom "" and never asks. Verified red against an unquiesced menu: this
    // returned the default "core" instead of the typed answer.
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    input.write("y\n");
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);

    const menu = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.down, KEYS.enter);
    expect(await menu).toBe("b");

    const typed = textInput(interactive, io, { question: "Name?", defaultValue: "core" });
    input.write("custom\n");
    expect(await typed).toBe("custom");
    closePrompts(io);
  });

  it("carries a line queued before the menu to the question after it", async () => {
    // The quiesce takes the session down and puts it back. Lines already read
    // off a piped chunk live in that session's queue, so putting it back has to
    // carry them: dropping them would swallow an answer the operator gave.
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    input.write("y\nqueued\n");
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);

    const menu = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.down, KEYS.down, KEYS.enter);
    expect(await menu).toBe("c");

    expect(await textInput(interactive, io, { question: "Name?", defaultValue: "core" })).toBe(
      "queued",
    );
    closePrompts(io);
  });

  it("renders no readline echo into the menu frames", async () => {
    // The other half of the same hazard: an attached terminal-mode interface
    // echoes the keystrokes it sees into the output, interleaving its own bytes
    // with the frames. Quiesced, the only bytes on the stream are the menu's.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    input.write("y\n");
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(true);
    const before = output().length;

    const menu = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await press(input, KEYS.down, KEYS.enter);
    expect(await menu).toBe("b");

    const rendered = output().slice(before);
    // The menu writes LF and never CR. A terminal-mode interface still attached
    // echoes the accepted Enter as CRLF, so a CR anywhere in this region is
    // readline's byte, not ours.
    expect(rendered).not.toContain(KEYS.enter);
    // Two frames, one row each: the opening draw and the redraw after `down`.
    const rows = rendered.split("\n").filter((line) => line.includes("Cursor"));
    expect(rows).toHaveLength(2);
    closePrompts(io);
  });
});
