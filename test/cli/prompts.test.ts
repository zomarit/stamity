import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import {
  closePrompts,
  confirm,
  promptGate,
  sanitizeLabel,
  selectMany,
  selectOne,
  textInput,
  type PromptGate,
  type PromptIo,
} from "../../src/cli/kit/prompts.ts";
import { CliFailure } from "../../src/cli/kit/output.ts";
import {
  makePalette,
  resolveAccentDepth,
  resolveColorEnabled,
  type Palette,
} from "../../src/cli/kit/terminal.ts";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { runInProcess } from "../support/inProcess.ts";
// The raw-TTY double, the terminal's own key bytes, and the shared
// synchronization helpers (`tick`, `press`) — shared with the two command
// suites that drive the same menu (`test/support/menuTty.ts`).
import { MENU_KEYS as KEYS, MenuTtyInput, press, tick } from "../support/menuTty.ts";

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
/**
 * Rewind for a 5-line frame: the question line, the hint line (N1 — its own
 * line now, no longer appended to the question), and three choice rows.
 */
const REWIND_5 = `${ESC}[5A`;
/** The line-clear the frame writes ahead of every line it draws. */
const CLEAR_LINE = `${ESC}[2K`;
/**
 * Rewind for the four lines a settled 5-line frame no longer occupies: the
 * echo keeps the first, and the cursor comes back to rest directly under it.
 */
const REWIND_4 = `${ESC}[4A`;

/**
 * The exact bytes a 5-line menu writes when Enter settles it — rewind over the
 * whole frame, redraw its first line as the resolved echo, blank the four
 * lines below, walk back under the echo — so a leg can pin the settle byte for
 * byte rather than matching a substring of it.
 *
 * The ONE-line shape only: the question, the renderer's own `>` separator and
 * the answer, together inside `columns`. A pair too wide for the terminal puts
 * the answer under the question instead and REFLOWS it across the rows the
 * frame already owns (`renderMenuEcho`), which moves both the count of drawn
 * lines and the count of blanked rows below them, so the legs that exercise
 * that shape pin their own bytes inline rather than through this helper.
 */
const settledEcho = (line: string): string =>
  `${REWIND_5}${CLEAR_LINE}${line}\n${`${CLEAR_LINE}\n`.repeat(4)}${REWIND_4}`;

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

  // B6: EOF is sticky (session.closed), so one ctrl-D silently defaults every
  // later gate on this stream — including a destructive confirm — unless the
  // default is disclosed and NAMED, the way the selects already disclose
  // theirs. Two cases (defaultYes true and false) so the disclosed word tracks
  // the actual default rather than a hardcoded string.
  it("discloses the default it applied on EOF, naming the value (B6)", async () => {
    const { io, input, output } = makePromptIo();
    input.end();
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: true })).toBe(true);
    expect(output()).toContain("no answer — keeping the default (yes)");
    closePrompts(io);
  });

  it("discloses the default it applied on EOF, naming the value when the default is no (B6)", async () => {
    const { io, input, output } = makePromptIo();
    input.end();
    expect(await confirm(interactive, io, { question: "Carry?", defaultYes: false })).toBe(false);
    expect(output()).toContain("no answer — keeping the default (no)");
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

  it("strips a C1 control out of the answer it quotes back, and leaves the ordinary wording alone", async () => {
    // The re-ask paints the operator's own text into a colour run, which makes
    // it a rendering seam like every other one in `prompts.ts` — and
    // `JSON.stringify` is not the guard for one: it escapes C0
    // (U+0000-U+001F) and stops there. U+009B is the 8-bit CSI, a single byte
    // that opens a control sequence on any terminal decoding C1, so quoting it
    // back verbatim hands the answer's author the cursor mid-run.
    const { io, input, output } = makePromptIo();
    // `x`, the CSI byte, then what would be its parameters: on an unguarded
    // frame this is the sequence that sets the foreground red.
    const answer = "x\u009B31m";
    input.end(`${answer}\n${answer}\n`);
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "c",
    });
    expect(picked).toBe("c");
    const frame = output();
    expect(frame).not.toContain("\u009B");
    // Dropped, not escaped into visible noise and not swallowing the line: the
    // printable text of the answer comes back in the same quoted wording an
    // ordinary answer gets, so this guard costs the settled line nothing.
    expect(frame).toContain(`not a valid choice: ${JSON.stringify("x31m")} — enter a number 1-3`);
    closePrompts(io);
  });

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

  // B2: `selectOne`'s typed numbered-list path prints `choice.label` raw — the
  // sink `sanitizeLabel` was written for the menu's rows only, and this one has
  // no menu fallback on a raw-incapable terminal.
  it("sanitizes a control-byte label on the typed numbered rows (B2)", async () => {
    const { io, input, output } = makePromptIo();
    const bel = String.fromCharCode(7);
    const esc = String.fromCharCode(27);
    const hostile = `vendor-x${esc}]0;pwned${bel}-1`;
    input.write("1\n");
    await selectOne(interactive, io, {
      question: "Which server?",
      choices: [{ value: "x", label: hostile }],
      defaultValue: "x",
    });
    expect(output()).not.toContain(`${esc}]0;`);
    expect(output()).not.toContain(bel);
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

  // B6: textInput applied its default on EOF silently, where the selects
  // already disclose. EOF is sticky, so one ctrl-D silently defaults every
  // remaining free-form question on the stream.
  it("discloses the default it applied on EOF, naming the value (B6)", async () => {
    const { io, input, output } = makePromptIo();
    input.end();
    expect(await textInput(interactive, io, { question: "Name?", defaultValue: "core" })).toBe(
      "core",
    );
    expect(output()).toContain("no answer — keeping the default (core)");
    closePrompts(io);
  });

  // B2: `q.defaultValue` reaches the terminal unescaped in the bracket — a
  // manifest-derived value (`config.ts`'s `askValue` passes the persisted
  // value straight through as `defaultValue`) can carry a control byte, and
  // this sink has no menu path to fall back to on any terminal.
  it("sanitizes a control-byte defaultValue before it reaches the bracket (B2)", async () => {
    const { io, input, output } = makePromptIo();
    const bel = String.fromCharCode(7);
    const esc = String.fromCharCode(27);
    const hostile = `vendor-x${esc}]0;pwned${bel}-1`;
    input.write("\n");
    const result = await textInput(interactive, io, { question: "Server?", defaultValue: hostile });
    expect(result).toBe(hostile); // the RETURNED value is untouched — only rendering sanitizes
    expect(output()).not.toContain(`${esc}]0;`);
    expect(output()).not.toContain(bel);
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    expect(menuFrames(chunks)[0] ?? "").not.toContain(REWIND_5);
    await press(input, KEYS.down);
    // 1 question line + 1 hint line (N1) + 3 rows: the cursor goes back to the
    // question line so the whole menu is overwritten rather than reprinted
    // underneath itself.
    expect(menuFrames(chunks).at(-1) ?? "").toContain(REWIND_5);
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
    input.write(`${KEYS.enter}${KEYS.space}`);
    await tick();
    expect(await pending).toEqual(["a"]);
  });
});

/**
 * DECISION OF RECORD (the maintainer, 2026-09-07): a raw-mode menu that settles
 * on Enter is replaced by the question and its answer — the way a conventional
 * prompt library echoes, so a transcript reads as a form the operator filled in
 * rather than as a frame frozen mid-interaction. ONE line when the pair fits the
 * terminal; otherwise the answer takes the rows under the question and reflows
 * across them, so what the echo records is the whole answer at every width the
 * frame itself was drawable at.
 *
 * It supersedes the raw path's after-Enter byte identity and nothing else.
 * Every frame drawn BEFORE Enter, the typed fallback, the `TERM=dumb` path and
 * the piped/non-TTY path stay byte-identical to what they were — pinned here
 * and in "the design language on the menus" below rather than assumed.
 */
describe("the raw menu — the answer echo after Enter", () => {
  it("replaces the settled frame with the question and the chosen label", async () => {
    // The ONE-line shape, and it stays one line now that a too-wide pair
    // reflows across the frame's rows: `Which tool? > Cursor` is 20 columns
    // against the default 80, so the fit test takes the single-line branch and
    // the reflow below is never reached. Re-based against the new shape, not
    // weakened — these are the bytes this leg has always pinned, and the three
    // legs under it fit the same way.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    await press(input, KEYS.down, KEYS.enter);
    expect(await pending).toBe("b");
    // The whole settle, byte for byte, and it is the last thing written before
    // the cursor comes back: the frame's five lines are gone and one line
    // stands where the question line was.
    expect(output().endsWith(`${settledEcho("Which tool? > Cursor")}${CURSOR_SHOW}`)).toBe(true);
    // No drawn row survives underneath it — the four blanks are what prove it,
    // so a row shape is asserted absent from the settle region itself. `> ` is
    // no longer the discriminator it was, since the echo spells its own
    // separator with the frame's marker glyph; what the settle is held to
    // instead is stronger, and says the same thing: every line BELOW the echo
    // is a bare `CLEAR_LINE` and the last is the rewind home, so no label, no
    // marker column and no hint can be hiding among them.
    const settle = output().slice(output().lastIndexOf(REWIND_5));
    const [echoLine, ...below] = settle.split("\n");
    expect(echoLine).toBe(`${REWIND_5}${CLEAR_LINE}Which tool? > Cursor`);
    expect(below).toEqual([
      CLEAR_LINE,
      CLEAR_LINE,
      CLEAR_LINE,
      CLEAR_LINE,
      `${REWIND_4}${CURSOR_SHOW}`,
    ]);
    expect(settle).not.toContain("up/down to move");
  });

  it("echoes every checked label, comma-separated, for a checkbox menu", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    await tick();
    await press(input, KEYS.down, KEYS.space, KEYS.enter);
    expect(await pending).toEqual(["a", "b"]);
    expect(
      output().endsWith(`${settledEcho("Which tools? > Claude Code, Cursor")}${CURSOR_SHOW}`),
    ).toBe(true);
  });

  it("echoes the word none when the checkbox menu settles with nothing ticked", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    await tick();
    await press(input, KEYS.space, KEYS.enter);
    expect(await pending).toEqual([]);
    // The same spelling the typed path and the EOF disclosure already use for
    // the empty set, so one word means one thing across all three.
    expect(output().endsWith(`${settledEcho("Which tools? > none")}${CURSOR_SHOW}`)).toBe(true);
  });

  it("fills every row the frame owns before it clamps what is still left over", async () => {
    // A line wider than the terminal wraps onto a second PHYSICAL line, and the
    // rewind below it walks back a fixed count of LOGICAL ones — the same
    // desync B3 fixed for the question and hint lines, reachable through the
    // echo because its length is the question PLUS the answer.
    //
    // Clamping the assembled pair fixed the wrap by cutting its TAIL, and the
    // tail is the ANSWER — the one thing an echo exists to record. So the
    // answer moves under the question instead, where it reflows across the
    // rows the frame already owns and the clamp is what happens to whatever is
    // still left over after the LAST of them.
    //
    // A one-choice frame is 3 rows, so this answer gets two of them: 18
    // columns each (`> ` on the first, the two-space indent on the second) is
    // 36 of its 40 characters, and the last 4 are the clamp doing its job as
    // the last resort rather than the first. Re-based from one answer row to
    // two — the widths did not move, the number of rows the echo is allowed to
    // spend did.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 20 });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: [{ value: "x", label: "y".repeat(40) }],
      defaultValue: "x",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("x");
    // The settle of a ONE-row frame, byte for byte: rewind over its three
    // lines, the question on the first, the separator and 18 columns of answer
    // on the second, the indent and 18 more on the third — and NO blanked row
    // and NO closing rewind, because the echo now spends every row the frame
    // drew and already rests directly under the last of them.
    const settle = output().slice(output().lastIndexOf(`${ESC}[3A`));
    expect(settle).toBe(
      `${ESC}[3A${CLEAR_LINE}Which tool?\n${CLEAR_LINE}> ${"y".repeat(18)}\n` +
        `${CLEAR_LINE}  ${"y".repeat(18)}\n${CURSOR_SHOW}`,
    );
    // Still clamped, just not at the answer's expense and not before the rows
    // are used up: 18 columns to a row, never 19, and 36 characters kept of 40.
    expect(settle).not.toContain("y".repeat(19));
    expect(stripVTControlCharacters(settle).split("y").length - 1).toBe(36);
  });

  it("echoes the answer of a question one column short of the terminal, where a single line had room for none of it", async () => {
    // The measured worst case, and the reason the branch above exists rather
    // than a wider clamp: at `question.length === columns - 1` a single line
    // has exactly one column left, which the separating space spends, so the
    // echo recorded the question and ZERO characters of the answer — a
    // transcript that names what was asked and not what was chosen.
    //
    // Two lines still, under the reflow: `Alpha` is 5 characters against the
    // 78 the first owned row holds, so it needs no row after that one and the
    // settle's byte shape is the one this leg already pinned.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 80 });
    const question = "x".repeat(79);
    const pending = selectOne(interactive, io, {
      question,
      choices: [{ value: "a", label: "Alpha" }],
      defaultValue: "a",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    const settle = output().slice(output().lastIndexOf(`${ESC}[3A`));
    // The answer, whole, on its own line — asserted as the line it occupies so
    // a stray "Alpha" anywhere else in the settle could not satisfy it.
    expect(settle).toBe(
      `${ESC}[3A${CLEAR_LINE}${question}\n${CLEAR_LINE}> Alpha\n` +
        `${CLEAR_LINE}\n${ESC}[1A${CURSOR_SHOW}`,
    );
  });

  it("keeps both members of a two-repository workspace answer at 80 columns", async () => {
    // The shipped `selectMany` shape, question and labels both:
    // `../../src/cli/commands/workspace.ts:643` asks
    // `Which repositories join this workspace? (N found)` (49 columns at N=2)
    // and labels each row `<path> — <markers>`, with every row ticked by
    // default — so the echoed answer is every member joined by ", ". At 80
    // columns the single line had 30 columns for a 58-column answer, and the
    // part that fell off the end was the whole second repository.
    //
    // Two lines still, under the reflow: 58 characters against the 78 the
    // first owned row holds, so the second and third rows go unspent and this
    // leg's bytes are the ones it already pinned. The 40-column leg below is
    // the same shape at the width where that stops being true.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 80 });
    const pending = selectMany(interactive, io, {
      question: "Which repositories join this workspace? (2 found)",
      choices: [
        { value: "packages/api", label: "packages/api — node, git, docker" },
        { value: "packages/web", label: "packages/web — node, git" },
      ],
      defaultValues: ["packages/api", "packages/web"],
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toEqual(["packages/api", "packages/web"]);
    // A 2-row frame is 4 lines, so the settle rewinds 4 and blanks the 2 rows
    // the echo does not spend.
    const settle = output().slice(output().lastIndexOf(`${ESC}[4A`));
    expect(settle).toBe(
      `${ESC}[4A${CLEAR_LINE}Which repositories join this workspace? (2 found)\n` +
        `${CLEAR_LINE}> packages/api — node, git, docker, packages/web — node, git\n` +
        `${CLEAR_LINE}\n${CLEAR_LINE}\n${ESC}[2A${CURSOR_SHOW}`,
    );
    // Said again as the property, not the byte string: the second member is
    // present in full, markers included.
    expect(settle).toContain("packages/web — node, git");
  });

  it("keeps every character of the shipped migrate answer at 80 columns", async () => {
    // The question and the two choices `../../src/cli/commands/init.ts:267-277`
    // ships, spelled out here rather than imported: what this leg is about is
    // the WIDTHS that reach the renderer, so a later reword of that prompt
    // should make these numbers stale loudly instead of quietly re-measuring
    // itself against whatever the prompt became.
    //
    // 60 columns of question, 94 characters of answer. One answer line clamped
    // to `columns - 2` kept 78 of them and cut the last 16 — `nings + .env.mcp`,
    // the half of the sentence that says which things are carried over, so the
    // transcript recorded a migration mode whose stated scope stopped
    // mid-word. The frame is 4 rows (2 choices + 2) and the echo was spending
    // 2 of them, so the row that holds the rest was already paid for.
    const question = "Previous setup detected (predecessor state dir). Migrate it?";
    const full =
      "full — import its config as defaults, strip its old managed blocks, " +
      "carry learnings + .env.mcp";
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 80 });
    const pending = selectOne(interactive, io, {
      question,
      choices: [
        { value: "full", label: full },
        { value: "skip", label: "skip — leave the previous setup untouched" },
      ],
      defaultValue: "full",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("full");
    // The two rows the answer reflows onto, broken at the last space that fit
    // the first — 73 characters, not a hard cut at 78 mid-`learnings`.
    const firstRow = "full — import its config as defaults, strip its old managed blocks, carry";
    const secondRow = "learnings + .env.mcp";
    // The settle, byte for byte: rewind over the 4-line frame, the question,
    // the answer's first row behind the separator, its second indented two
    // columns so the separator column stays the separator's, one blanked row
    // for the line the frame no longer occupies, and the rewind back to rest
    // directly under the last echo line.
    const settle = output().slice(output().lastIndexOf(`${ESC}[4A`));
    expect(settle).toBe(
      `${ESC}[4A${CLEAR_LINE}${question}\n${CLEAR_LINE}> ${firstRow}\n` +
        `${CLEAR_LINE}  ${secondRow}\n${CLEAR_LINE}\n${ESC}[1A${CURSOR_SHOW}`,
    );
    // And as the property those bytes exist for: every character of the answer
    // is in the echo exactly once. The rows rejoin on the single space each
    // break consumed, so a dropped tail and a duplicated fragment both fail
    // here, and neither row is wider than the 78 columns it was given.
    const rows = settle
      .split("\n")
      .filter((line) => line.startsWith(`${CLEAR_LINE}> `) || line.startsWith(`${CLEAR_LINE}  `))
      .map((line) => line.slice(CLEAR_LINE.length + 2));
    expect(rows.join(" ")).toBe(full);
    expect(rows.map((row) => row.length)).toEqual([73, 20]);
  });

  it("keeps both members of the two-repository workspace answer at 40 columns", async () => {
    // The same shipped `selectMany` shape as the leg above, in a 40-column
    // pane — a split terminal, a side panel, a phone SSH session. The question
    // is 49 columns, so it clamps to 40 and there is nothing an echo can do
    // about that; the ANSWER is what the echo exists to record, and one line
    // of `columns - 2` cut it at 38 characters, mid-`packages/web`. That is the
    // 80-column defect this suite already pins, one width further down.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 40 });
    const pending = selectMany(interactive, io, {
      question: "Which repositories join this workspace? (2 found)",
      choices: [
        { value: "packages/api", label: "packages/api — node, git, docker" },
        { value: "packages/web", label: "packages/web — node, git" },
      ],
      defaultValues: ["packages/api", "packages/web"],
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toEqual(["packages/api", "packages/web"]);
    // The clamped question keeps its trailing space — `clampToWidth` cuts at
    // the column, it does not tidy — and the 58-character answer takes two of
    // the frame's three remaining rows, breaking after the comma that
    // separates the two members.
    const settle = output().slice(output().lastIndexOf(`${ESC}[4A`));
    expect(settle).toBe(
      `${ESC}[4A${CLEAR_LINE}Which repositories join this workspace? \n` +
        `${CLEAR_LINE}> packages/api — node, git, docker,\n` +
        `${CLEAR_LINE}  packages/web — node, git\n${CLEAR_LINE}\n${ESC}[1A${CURSOR_SHOW}`,
    );
    // The property, again independent of the byte string: both members are
    // present with their markers, and neither row overflowed the pane.
    expect(settle).toContain("packages/api — node, git, docker");
    expect(settle).toContain("packages/web — node, git");
    for (const line of stripVTControlCharacters(settle).split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("prints no echo when Ctrl-C cancels the menu", async () => {
    const { io, input, output, chunks } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    const asserted = expect(pending).rejects.toMatchObject({
      doc: { code: "FAILURE", message: "aborted" },
    });
    await tick();
    await press(input, KEYS.ctrlC);
    await asserted;
    // A cancelled menu answered nothing, so there is nothing to echo: the
    // opening draw is the only frame written, and the transcript ends on the
    // cursor coming back.
    expect(menuFrames(chunks)).toHaveLength(1);
    expect(output()).not.toContain(REWIND_4);
    expect(output()).not.toContain("Which tool? Claude Code");
    expect(output().endsWith(CURSOR_SHOW)).toBe(true);
    closePrompts(io);
  });

  it("leaves the typed fallback byte-identical: the echo is a raw-menu frame, not a prompt-kit line", async () => {
    // The path a pipe, a CI log, a dumb terminal and every recorded transcript
    // take. Pinned as literal bytes rather than as "unchanged", because
    // "unchanged" has no referent once the raw path moved.
    const { io, input, output } = makePromptIo();
    input.end("2\n");
    expect(
      await selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "a",
      }),
    ).toBe("b");
    expect(output()).toBe(
      "Which tool?\n  1) Claude Code\n  2) Cursor\n  3) Copilot\nChoose 1-3 [1]: ",
    );
    closePrompts(io);
  });

  it("reads a TTY reporting columns: 0 as an unknown width, not a zero one", async () => {
    // `./terminal.ts::detectTerminalFacts` already spells the rule for this
    // exact field: a window-size ioctl that answered 0x0 leaves `columns` at 0
    // on a stream that is still a TTY, and that is the terminal saying it does
    // not know its width. Read as a width it clamps every line to nothing, so
    // the frame draws as ["", "", "> ", "  ", "  "] — a blank menu.
    const drawFirstFrame = async (columns?: number): Promise<string> => {
      const { io, input, chunks } = makeTtyPromptIo(
        columns === undefined ? { rawMode: true } : { rawMode: true, columns },
      );
      const pending = selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "a",
      });
      await tick();
      await press(input, KEYS.enter);
      expect(await pending).toBe("a");
      return chunks()[1] ?? "";
    };
    const zero = await drawFirstFrame(0);
    expect(zero).toBe(await drawFirstFrame());
    expect(zero).toContain("Which tool?");
    expect(zero).toContain("> Claude Code");
  });

  it("reads a TTY reporting rows: 0 as an unknown height, so the raw menu still opens", async () => {
    // The height check's half of the same rule. A window-size ioctl that could
    // not answer reports 0 for BOTH fields, so `rows: 0` is the terminal
    // saying it does not know its height — not a terminal zero rows tall.
    // Compared as a height it is shorter than every menu, so this refused the
    // raw path outright and every such terminal got the typed numbered list,
    // where an ABSENT `rows` has always left the check a no-op.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, rows: 0 });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    // The menu's OWN first write is CURSOR_HIDE and the typed path never
    // writes one, so its presence is the proof `runMenu` was entered — the
    // same probe the height-refusal leg below uses in the opposite direction.
    expect(output().startsWith(CURSOR_HIDE)).toBe(true);
    expect(output()).toContain("> Claude Code");
    expect(output()).not.toContain("Choose 1-3");
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("x");

    const rendered = output();
    expect(rendered).not.toContain(`${ESC}]0;`);
    expect(rendered).not.toContain(bel);
    // Every ESC left in the whole transcript is one of the renderer's own:
    // CURSOR_HIDE (1) + one CLEAR_LINE per drawn line — the question line, the
    // hint line (N1 — its own line now), and the one choice row, drawn once
    // (no navigation happened) — + the after-Enter settle the 2026-09-07
    // decision of record added (rewind over the 3-line frame, the echo's own
    // CLEAR_LINE, one CLEAR_LINE per line it blanks, the rewind back under it)
    // + CURSOR_SHOW (1) on the way out.
    //
    // Re-based, not weakened: the two assertions above now cover the ECHO as
    // well as the frame, and they are the ones that matter here — the echo
    // names the chosen label, so an unsanitized label would smuggle its OSC
    // through this second sink even with the frame clean.
    const escCount = rendered.split(ESC).length - 1;
    expect(escCount).toBe(1 + 3 + (1 + 1 + 2 + 1) + 1);
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

  // B3: the question line is `question + " " + MOVE_HINT/TOGGLE_HINT`, never
  // width-clamped — MOVE_HINT alone is 52 columns, so a modest question at the
  // default 80-column width wraps onto a second physical line and desyncs
  // `rewind(height)`, which only walks back over the rows it thinks it drew.
  // Reproduced with a plain (non-hostile) question long enough to push the
  // combined line past 80 columns on its own.
  it("clamps the question line to the terminal width so a long question cannot wrap the frame (B3)", async () => {
    const { io, input, chunks } = makeTtyPromptIo({ rawMode: true, columns: 80 });
    // N1 moved the hint onto its OWN line (`Menu.hint`, rendered separately
    // from `menu.question` — no more `question + " " + MOVE_HINT` join), so
    // the question line alone has to be the one that overflows: a 40-char
    // question, the width this case used before N1, no longer exceeds 80 on
    // its own and would pass with the clamp deleted (verified: it does).
    // 100 chars is unambiguously past 80 with nothing else concatenated in.
    const longQuestion = "x".repeat(100);
    const pending = selectOne(interactive, io, {
      question: longQuestion,
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    const first = menuFrames(chunks)[0] ?? "";
    // The rendered question line must fit within 80 columns.
    const questionLine = first.split("\n").find((line) => line.includes("x".repeat(10))) ?? "";
    // Strip the leading CLEAR_LINE escape before measuring.
    const visible = questionLine.replace(new RegExp(`^${ESC}\\[2K`), "");
    expect(visible.length).toBeLessThanOrEqual(80);
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
  });

  // N1's other line: the hint (MOVE_HINT/TOGGLE_HINT) is now the LONGER of
  // the two fixed lines this menu always draws, and had no clamp coverage of
  // its own — only the question line was asserted above. A narrow terminal
  // (40 columns) is well short of MOVE_HINT's own length, so this is red
  // against a clamp that covers the question line but not the hint line.
  it("clamps the hint line to the terminal width too, on a narrow terminal (B3)", async () => {
    const { io, input, chunks } = makeTtyPromptIo({ rawMode: true, columns: 40 });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    const first = menuFrames(chunks)[0] ?? "";
    const hintLine = first.split("\n").find((line) => line.includes("up/down")) ?? "";
    const visible = hintLine.replace(new RegExp(`^${ESC}\\[2K`), "");
    expect(visible.length).toBeLessThanOrEqual(40);
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
  });

  it("takes the typed path when the menu would not fit the terminal's height", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, rows: 5 });
    // 17 rows + the question line + the hint line (N1 — its own line now) is
    // 19, which needs more than 5 terminal rows by any margin;
    // `choiceCount + 2 > rows` (17 + 2 > 5) is the probe's own check, and is
    // now the frame's EXACT height rather than a margin (see `rawMenuIo`'s
    // own comment).
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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

  // B7: docs/workspaces.md promises "Clearing every box is an answer" — but on
  // the typed path, a blank answer means "keep the defaults", and there was no
  // way to TYPE the empty set. The literal "none" (case-insensitive) is that
  // token.
  for (const spelling of ["none", "NONE", "None"]) {
    it(`accepts the literal ${JSON.stringify(spelling)} as the explicit empty selection (B7)`, async () => {
      const { io, input } = makeTtyPromptIo({ rawMode: false });
      // `.end()` rather than `.write()`: on unfixed code, "none" is an
      // unrecognised token, so `selectMany` re-asks once — `.end()` makes the
      // re-ask see EOF and resolve (to the wrong answer) instead of hanging
      // this test for the full 20s timeout waiting on a line that never comes.
      input.end(`${spelling}\n`);
      expect(
        await selectMany(interactive, io, {
          question: "Which tools?",
          choices: TOOL_CHOICES,
          defaultValues: ["a", "b"],
        }),
      ).toEqual([]);
      closePrompts(io);
    });
  }

  // B2: a manifest-derived choice label (a pack description, a server id) is
  // printed raw on the typed numbered-row path — the same hazard the raw menu
  // already guards, but this sink is live on every terminal, not only the
  // menu-capable ones.
  it("sanitizes a control-byte label on the typed numbered rows (B2)", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    const bel = String.fromCharCode(7);
    const esc = String.fromCharCode(27);
    const hostile = `vendor-x${esc}]0;pwned${bel}-1`;
    input.write("1\n");
    await selectMany(interactive, io, {
      question: "Which tools?",
      choices: [{ value: "x", label: hostile }],
      defaultValues: [],
    });
    expect(output()).not.toContain(`${esc}]0;`);
    expect(output()).not.toContain(bel);
    closePrompts(io);
  });

  // The re-ask quotes the operator's own rejected tokens back at them, inside a
  // colour run. Self-typed or not, an ESC in that text is a live escape
  // sequence written mid-frame — the identical sink the labels above are
  // guarded at, on the one string in this path that is not authored here.
  it("does not echo an invalid token's ESC byte raw on the re-ask", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    const bel = String.fromCharCode(7);
    const esc = String.fromCharCode(27);
    // `.end()`, so the re-ask meets EOF and settles rather than hanging.
    input.end(`${esc}]0;pwned${bel}\n`);
    expect(
      await selectMany(interactive, io, {
        question: "Which tools?",
        choices: TOOL_CHOICES,
        defaultValues: ["a"],
      }),
    ).toEqual(["a"]);
    expect(output()).toContain("not a valid choice: ");
    expect(output()).not.toContain(`${esc}]0;`);
    expect(output()).not.toContain(bel);
    closePrompts(io);
  });

  // The other half of the same fix: sanitising must not restyle an ordinary
  // token. These two lines are pinned verbatim elsewhere in this suite, and the
  // point of choosing `sanitizeLabel` over `JSON.stringify` here was that they
  // stay byte-identical.
  it("still quotes an ordinary invalid token unadorned", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: false });
    input.end("x,9\n");
    await selectMany(interactive, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    expect(output()).toContain(
      "not a valid choice: x, 9 — enter numbers 1-3 separated by commas",
    );
    closePrompts(io);
  });
});

describe("sanitizeLabel — what a label may not smuggle onto a terminal", () => {
  // C0/C1 and the whitespace collapse are the guard's original behaviour, and
  // neither moved when the class was widened. Pinned here so a later edit to
  // the character class cannot quietly drop them.
  it("keeps its C0/C1 behaviour", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    const c1 = String.fromCharCode(0x9b);
    expect(sanitizeLabel(`a${esc}]0;x${bel}b${c1}c`)).toBe("a]0;xbc");
  });

  it("collapses \\r, \\n and \\t to a single space each, rather than dropping them", () => {
    expect(sanitizeLabel("a\r\nb\tc")).toBe("a  b c");
  });

  // Bidi OVERRIDES: RLO reverses the run that follows it, so the label reads
  // one way on screen and is another string in the value being consented to.
  it("drops bidi override controls (U+202A-U+202E)", () => {
    const rlo = "\u202E";
    const pdf = "\u202C";
    expect(sanitizeLabel(`invoice${rlo}fdp.exe${pdf}`)).toBe("invoicefdp.exe");
    for (const code of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e]) {
      expect(sanitizeLabel(`a${String.fromCharCode(code)}b`)).toBe("ab");
    }
  });

  // Bidi ISOLATES: the newer spelling of the same reordering trick.
  it("drops bidi isolate controls (U+2066-U+2069)", () => {
    for (const code of [0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(sanitizeLabel(`a${String.fromCharCode(code)}b`)).toBe("ab");
    }
  });

  // ZERO-WIDTH: no reordering, but two different values paint identically, so
  // a row the operator reads as one string is another.
  it("drops zero-width and invisible formatting characters", () => {
    for (const code of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff]) {
      expect(sanitizeLabel(`a${String.fromCharCode(code)}b`)).toBe("ab");
    }
    // The point of dropping rather than spacing: a zero-width character has no
    // width of its own, so replacing it with a space would invent a difference
    // the source did not carry.
    expect(sanitizeLabel("core\u200Bpack")).toBe(sanitizeLabel("corepack"));
  });

  // The class is a strip list, not an allow list: ordinary text — including
  // non-ASCII a manifest may legitimately carry — passes through untouched.
  it("leaves ordinary text, including non-ASCII, alone", () => {
    expect(sanitizeLabel("Claude Code — ~/Projects/app (näyttö, 日本語)")).toBe(
      "Claude Code — ~/Projects/app (näyttö, 日本語)",
    );
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
    // Synchronization point before this menu's first press — see `tick`'s
    // own doc in test/support/menuTty.ts for why.
    await tick();
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
    await tick();
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
    await tick();
    await press(input, KEYS.down, KEYS.enter);
    expect(await menu).toBe("b");

    const rendered = output().slice(before);
    // The menu writes LF and never CR. A terminal-mode interface still attached
    // echoes the accepted Enter as CRLF, so a CR anywhere in this region is
    // readline's byte, not ours.
    expect(rendered).not.toContain(KEYS.enter);
    // Three, and every one of them is the menu's own: two frames drawn one row
    // each (the opening draw and the redraw after `down`), plus the after-Enter
    // echo the 2026-09-07 decision of record added, which names the label it
    // settled on. Re-based rather than loosened — each of the three is pinned
    // to its exact shape, so a readline echo of the label could not hide among
    // them.
    const rows = rendered.split("\n").filter((line) => line.includes("Cursor"));
    expect(rows).toEqual([
      `${CLEAR_LINE}  Cursor`,
      `${CLEAR_LINE}> Cursor`,
      `${REWIND_5}${CLEAR_LINE}Which tool? > Cursor`,
    ]);
    closePrompts(io);
  });
});

describe("the raw menu — teardown does not leak a keystroke into the next prompt (B1)", () => {
  it("drains a byte buffered on ENTRY, before the menu's own listener attaches, so it cannot be read as the menu's first keypress", async () => {
    // A key lands on the stream before any prompt is reading it at all —
    // whatever this run printed earlier left an Enter sitting unread. The
    // stream has no listener yet, so `write` here is genuine OS-level
    // buffering, not a race.
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    input.write(KEYS.enter);
    await tick();

    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    await tick();
    // If the stray Enter survived to become this menu's first keypress, it
    // already accepted the default ("b") before the operator's own keys below
    // are ever read — proved by pressing down+enter for a DIFFERENT row and
    // checking the menu actually followed it.
    await press(input, KEYS.down, KEYS.enter);
    expect(await pending).toBe("c");
  });
});

describe("the raw menu — no-listener stream conditions (B4)", () => {
  it(
    "settles as EOF-keeping-the-default, WITH disclosure, when the input stream ends mid-menu",
    async () => {
      const { io, input, output } = makeTtyPromptIo({ rawMode: true });
      const pending = selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "b",
      });
      await tick();
      input.end();
      const picked = await pending;
      expect(picked).toBe("b");
      // Parity with the typed path's own EOF disclosure.
      expect(output()).toContain("no answer — keeping the default");
      // Cleanup still ran: raw mode dropped, cursor restored — a hang here
      // would leave the operator's shell with no echo.
      expect(input.rawModes).toEqual([true, false]);
      expect(output()).toContain(CURSOR_SHOW);
    },
    // Short, deliberate timeout: unfixed, this hangs forever (no listener
    // settles the promise on `end`), and the default 20s budget per case
    // would make every red run of this suite slow for no benefit — the
    // failure mode is "never settles", which a short timeout demonstrates
    // just as conclusively as a long one.
    1000,
  );

  it(
    "settles as EOF-keeping-the-default when the input stream closes mid-menu",
    async () => {
      const { io, input, output } = makeTtyPromptIo({ rawMode: true });
      const pending = selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "a",
      });
      await tick();
      input.emit("close");
      const picked = await pending;
      expect(picked).toBe("a");
      expect(output()).toContain("no answer — keeping the default");
      expect(input.rawModes).toEqual([true, false]);
    },
    1000,
  );

  it("restores the terminal and rejects cleanly on a stream error instead of throwing outside the try", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    const boom = new Error("stream exploded");
    const asserted = expect(pending).rejects.toBe(boom);
    input.emit("error", boom);
    await asserted;
    expect(input.rawModes).toEqual([true, false]);
    expect(output()).toContain(CURSOR_SHOW);
  });
});

describe("process-level signal guards while a menu is active (B5)", () => {
  // Only the installation/removal half is testable in-process: actually
  // delivering SIGTERM/SIGHUP to this process would end the vitest worker.
  // The re-raise-after-restore half (the operator's shell gets its terminal
  // back AND the process still exits on the signal) is verified by reading
  // the implementation rather than by a test here.
  it("installs transient SIGTERM/SIGHUP/exit guards for the duration of a menu, and removes them once it settles", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const baseline = {
      term: process.listenerCount("SIGTERM"),
      hup: process.listenerCount("SIGHUP"),
      exit: process.listenerCount("exit"),
    };
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    expect(process.listenerCount("SIGTERM")).toBe(baseline.term + 1);
    expect(process.listenerCount("SIGHUP")).toBe(baseline.hup + 1);
    expect(process.listenerCount("exit")).toBe(baseline.exit + 1);

    await press(input, KEYS.enter);
    expect(await pending).toBe("a");

    expect(process.listenerCount("SIGTERM")).toBe(baseline.term);
    expect(process.listenerCount("SIGHUP")).toBe(baseline.hup);
    expect(process.listenerCount("exit")).toBe(baseline.exit);
  });
});

describe("C1-residual: a byte left behind by a menu does not silently answer the NEXT (cooked) prompt", () => {
  // FIDELITY LIMIT, stated up front: this harness's `MenuTtyInput` is a
  // PassThrough, so a byte written here lands in the JS-visible buffer —
  // exactly what `ask`'s `drainNow` (via the `menuLeftovers` mark `runMenu`
  // leaves behind) reads and discards. The mechanism this closes on a REAL
  // terminal is one step earlier: a `pause()`d real TTY stops at `readStop()`,
  // so the same byte sits in the KERNEL queue rather than the JS buffer until
  // something `resume()`s the stream — which is exactly what `drainNow` does
  // (`resume()`, one tick, discard, `pause()`) before `ask` ever opens a
  // fresh readline session. That kernel-queue half is not reproducible against
  // a PassThrough at all (there is no kernel underneath it) — it is CI/pty
  // lane territory. What IS provable here, red against the unfixed `ask`, is
  // the shape both cases share: a byte that outlives `runMenu`'s own teardown
  // must not reach whichever prompt runs next as an unanswered line.
  it("drains a leftover byte before the next cooked prompt opens its readline session, so a real answer is still required", async () => {
    const { io, input } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "a",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("a");
    // By now `runMenu`'s `finally` has already run — `pause()` included. This
    // write is genuinely POST-teardown, not a same-chunk trailing byte SW2
    // already covers: it lands in the paused stream's own buffer (a paused
    // stream QUEUES what it's written, per `drainBufferedInput`'s own doc),
    // unconsumed by anything, exactly the shape `menuLeftovers` exists for.
    input.write(KEYS.enter);

    // The NEXT question on the SAME stream is a plain, cooked `confirm` — the
    // shape `askProceedWithoutGit` (`../commands/init.ts`) actually has right
    // after `init`'s tools checkbox. Unfixed, the leftover CR reaches the
    // fresh readline `sessionFor` opens the instant it `resume()`s, decodes as
    // an empty line, and `confirm` returns `defaultYes` (`true`) before this
    // test ever writes a byte to it.
    const carried = confirm(interactive, io, { question: "Continue?", defaultYes: true });
    // Two ticks: enough for a leaked phantom line to resolve `carried` if the
    // drain is missing, not enough for anything else to happen on its own.
    await tick();
    await tick();
    // The real answer, opposite of the default — if the phantom byte had
    // already silently resolved `carried` to the default (`true`), this write
    // lands on a question nobody is listening to any more and the assertion
    // below catches the drift.
    input.write("n\n");
    expect(await carried).toBe(false);
    closePrompts(io);
  });
});

/**
 * The palette exactly as `../../src/cli/kit/program.ts:264-275` builds one for
 * a command: the colour decision first, then the accent depth resolved from
 * the same env. Nothing here decides colour on its own — that is the point of
 * the leg that uses it, which measures what the funnel hands the prompts.
 *
 * Module scope rather than inside the describe below, because a describe-scoped
 * helper that captures nothing from that scope is an oxlint error here
 * (`unicorn/consistent-function-scoping`).
 */
const funnelPalette = (env: Record<string, string | undefined>): Palette => {
  const colorEnabled = resolveColorEnabled({ noColorFlag: false, env, stdoutIsTTY: true });
  return makePalette(colorEnabled, resolveAccentDepth({ colorEnabled, env }));
};

/**
 * The typed fallback driven through both bad answers, as the terminal saw it.
 * `makePromptIo`'s input is a plain PassThrough, so `rawMenuIo` refuses on
 * `input.isTTY !== true` and this is the typed path on every env.
 */
async function typedTranscript(env: Record<string, string | undefined>): Promise<string> {
  const { io, input, output } = makePromptIo();
  input.end("9\n9\n");
  const gate: PromptGate = { interactive: true, env, palette: funnelPalette(env) };
  const picked = await selectOne(gate, io, {
    question: "Which tool?",
    choices: TOOL_CHOICES,
    defaultValue: "c",
  });
  expect(picked).toBe("c");
  closePrompts(io);
  return output();
}

/**
 * The raw arrow menu drawn once and accepted on the row under the cursor, as
 * the terminal saw it — the raw-path counterpart to `typedTranscript`, built
 * with the palette the funnel would resolve for the given env (so `NO_COLOR`
 * reaches the frame the way it reaches a real run, not as a hand-made
 * identity palette).
 *
 * Module scope for the reason `funnelPalette`'s own doc gives above.
 */
async function rawMenuTranscript(env: Record<string, string | undefined>): Promise<string> {
  const { io, input, output } = makeTtyPromptIo({ rawMode: true });
  const gate: PromptGate = { interactive: true, env, palette: funnelPalette(env) };
  const pending = selectOne(gate, io, {
    question: "Which tool?",
    choices: TOOL_CHOICES,
    defaultValue: "b",
  });
  await tick();
  await press(input, KEYS.enter);
  expect(await pending).toBe("b");
  return output();
}

describe("the design language on the menus: escapes are ADDED, never substituted", () => {
  /**
   * The UI accent at 24-bit depth (`#8A52FF`), and the mark's own violet
   * (`#6B24FF`) which must never reach a menu: the wordmark's accent is
   * decoration on a picture whose ink carries the shape, where a menu cursor is
   * a state indicator and has a 3:1 floor to clear on a dark ground.
   */
  const UI_ACCENT = `${ESC}[38;2;138;82;255m`;
  const MARK_VIOLET = `${ESC}[38;2;107;36;255m`;

  const truecolor: Palette = makePalette(true, "truecolor");
  /** The suite's own bare gate when no palette is named — the identity path. */
  const paintedGate: PromptGate = { interactive: true, palette: truecolor };

  const escapeCount = (transcript: string): number => transcript.split(ESC).length - 1;

  /**
   * The cursor escapes the after-Enter echo spends on a `TOOL_CHOICES`-sized
   * frame, and not one of them is an SGR: the rewind over the whole frame, the
   * echo's own `CLEAR_LINE`, one `CLEAR_LINE` per line the frame no longer
   * occupies, and the rewind back to rest under the echo.
   */
  const SETTLE_ESCAPES = 1 + 1 + (1 + TOOL_CHOICES.length) + 1;

  /** One `selectOne` menu drawn once and accepted, as the terminal saw it. */
  async function selectOneTranscript(palette?: Palette): Promise<string> {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(palette === undefined ? interactive : paintedGate, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toBe("b");
    return output();
  }

  /** The same for `selectMany`, opening with row 1 checked and under the cursor. */
  async function selectManyTranscript(palette?: Palette): Promise<string> {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectMany(palette === undefined ? interactive : paintedGate, io, {
      question: "Which tools?",
      choices: TOOL_CHOICES,
      defaultValues: ["a"],
    });
    await tick();
    await press(input, KEYS.enter);
    expect(await pending).toEqual(["a"]);
    return output();
  }

  it("renders the arrow menu identically once escapes are stripped, adding exactly two per painted token", async () => {
    const plain = await selectOneTranscript();
    const painted = await selectOneTranscript(truecolor);

    // Same rendering, byte for byte, with every escape removed — including the
    // renderer's own CURSOR_HIDE/CLEAR_LINE/CURSOR_SHOW, which is why this is
    // strip-vs-strip rather than strip-vs-plain.
    expect(stripVTControlCharacters(painted)).toBe(stripVTControlCharacters(plain));

    // The identity path adds none of its own: CURSOR_HIDE + one CLEAR_LINE per
    // drawn line (question, hint, three rows) + the settle + CURSOR_SHOW.
    expect(escapeCount(plain)).toBe(1 + (2 + TOOL_CHOICES.length) + SETTLE_ESCAPES + 1);
    // Five painted tokens — question (bold), hint (dim), active marker
    // (accent), and the ECHO's own question (bold) and separator (accent, the
    // same paint the frame's marker takes) — at one opening and one closing
    // escape each. Labels, inactive markers and the echoed ANSWER add none.
    expect(escapeCount(painted) - escapeCount(plain)).toBe(2 * 5);

    expect(painted).toContain(UI_ACCENT);
    expect(painted).not.toContain(MARK_VIOLET);
  });

  it("paints the checked box as its own run, so the checkbox menu adds exactly one token more", async () => {
    const plain = await selectManyTranscript();
    const painted = await selectManyTranscript(truecolor);

    expect(stripVTControlCharacters(painted)).toBe(stripVTControlCharacters(plain));
    expect(escapeCount(plain)).toBe(1 + (2 + TOOL_CHOICES.length) + SETTLE_ESCAPES + 1);
    // Question, hint, the active marker, one checked box, and the echo's own
    // question and separator: the marker and the box are two independent runs,
    // so the accented `[x]` is a fourth token rather than an extension of the
    // third, the echo's bold question is the fifth and its separator the sixth.
    expect(escapeCount(painted) - escapeCount(plain)).toBe(2 * 6);
    expect(painted).toContain(`${UI_ACCENT}>${ESC}[39m ${UI_ACCENT}[x]${ESC}[39m Claude Code`);
    // The two unchecked boxes stay unpainted, so the accent appears twice in
    // the frame — and once more in the settle, on the echo's separator.
    expect(painted.split(UI_ACCENT).length - 1).toBe(3);
    expect(painted).not.toContain(MARK_VIOLET);
  });

  it("echoes the answer in theme ink: the question keeps its bold and NO_COLOR renders the identical text with zero SGR", async () => {
    // The echo is the one line the after-Enter byte-identity statement was
    // superseded for (the 2026-09-07 decision of record), so its paint is
    // pinned as tightly as the frame's: the question keeps the bold it already
    // had, the answer is theme ink, and nothing on the line carries state.
    const noColor = await rawMenuTranscript({ TERM: "xterm-256color", NO_COLOR: "1" });
    const painted = await rawMenuTranscript({ TERM: "xterm-256color", COLORTERM: "truecolor" });
    const settleOf = (transcript: string): string =>
      transcript.slice(transcript.lastIndexOf(REWIND_5));

    // Identical text on both routes, escapes removed.
    expect(stripVTControlCharacters(settleOf(painted))).toBe(
      stripVTControlCharacters(settleOf(noColor)),
    );
    expect(stripVTControlCharacters(settleOf(noColor)).trim()).toBe("Which tool? > Cursor");

    // NO_COLOR: the settle's own cursor escapes and NOT ONE SGR byte — the
    // rewind over the frame, the clear before the echo, one clear per line it
    // blanks, and the rewind back under it — plus the CURSOR_SHOW that trails
    // it, since this slice runs to the end of the transcript. The separator
    // survives with them: it is a GLYPH the renderer writes, so it is still
    // there on the route that renders no colour at all.
    expect(escapeCount(settleOf(noColor))).toBe(SETTLE_ESCAPES + 1);
    // Painted: exactly two tokens more — the question's bold, and the
    // separator's accent. The ANSWER still takes none.
    expect(escapeCount(settleOf(painted)) - escapeCount(settleOf(noColor))).toBe(4);
    expect(settleOf(painted)).toContain(
      `${ESC}[1mWhich tool?${ESC}[22m ${UI_ACCENT}>${ESC}[39m Cursor`,
    );
    expect(settleOf(painted)).not.toContain(MARK_VIOLET);
  });

  it("separates the question from the answer with the frame's own marker glyph, and pays no SGR for it", async () => {
    // Under the identity palette the ONLY boundary between the question and
    // the answer used to be whatever punctuation the caller happened to end
    // its question with — `Which tool?` reads as a boundary, a question worded
    // without a trailing `?` or `:` does not, and the echo would run two
    // phrases together with a single space between them. The separator is the
    // renderer's own, so the boundary does not depend on the caller.
    const noColor = await rawMenuTranscript({ TERM: "xterm-256color", NO_COLOR: "1" });
    const settle = noColor.slice(noColor.lastIndexOf(REWIND_5));
    expect(settle).toContain(`${CLEAR_LINE}Which tool? > Cursor\n`);
    // And it costs nothing to draw: the settle's escapes are all cursor
    // motion, exactly the count the one-line echo has always written.
    expect(escapeCount(settle)).toBe(SETTLE_ESCAPES + 1);

    // Under a palette the accent lands on the GLYPH and nowhere else — the
    // same rule the frame's active-row marker follows, and the reason
    // `./terminal.ts`'s ladder can drop the paint at 16-colour depth without
    // losing the boundary: the glyph carries it, the colour decorates it.
    const painted = await rawMenuTranscript({ TERM: "xterm-256color", COLORTERM: "truecolor" });
    const paintedSettle = painted.slice(painted.lastIndexOf(REWIND_5));
    expect(paintedSettle).toContain(`${UI_ACCENT}>${ESC}[39m Cursor`);
    // Not on the answer, which is manifest-derived text this process did not
    // author: one accent run in the whole settle, on the separator.
    expect(paintedSettle.split(UI_ACCENT).length - 1).toBe(1);
  });

  it("writes no escape at all on the typed path under the identity palette", async () => {
    // The cleanest statement of the whole property: this path has no CSI of its
    // own, so it covers the `Choose ...` line, the re-ask and both disclosure
    // lines in one assertion.
    const { io, input, output } = makePromptIo();
    input.end("9\n9\n");
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "c",
    });
    expect(picked).toBe("c");
    expect(output()).toContain("not a valid choice");
    expect(output()).toContain("still not a valid choice — keeping the default (3)");
    expect(output()).not.toContain(ESC);
    closePrompts(io);
  });

  it("writes zero escape bytes on the typed path under TERM=dumb, re-ask included", async () => {
    // A dumb terminal renders no SGR, so every escape the funnel's palette
    // would add lands in the transcript as literal bytes. stdoutIsTTY is true
    // in all three legs: TERM is the only input that differs.
    const dumb = await typedTranscript({ TERM: "dumb" });
    // Both painted lines of this path are in the transcript: the question
    // (bold, `src/cli/kit/prompts.ts:330`) and the first re-ask (yellow,
    // `:368`). The second disclosure is unpainted on every env.
    expect(dumb).toContain("Which tool?");
    expect(dumb).toContain("not a valid choice");
    expect(dumb).toContain("still not a valid choice — keeping the default (3)");
    expect(dumb).not.toContain(ESC);

    // Byte-equal to the frame NO_COLOR produces on a colour-capable terminal:
    // the same content, reached by the two routes that both mean "colour off".
    expect(dumb).toBe(await typedTranscript({ TERM: "xterm-256color", NO_COLOR: "1" }));

    // The control, so this measures the TERM read rather than a palette that
    // never paints: drop `dumb` and the same frame comes back painted, with
    // identical text underneath.
    const painted = await typedTranscript({ TERM: "xterm-256color" });
    expect(painted).toContain(`${ESC}[1mWhich tool?${ESC}[22m`);
    expect(painted).toContain(`${ESC}[33mnot a valid choice`);
    expect(stripVTControlCharacters(painted)).toBe(dumb);
  });

  it("clamps on plain text and paints afterwards, so a coloured row is no shorter than a plain one", async () => {
    // `check.ts`'s rule, restated as a test: escape bytes counted toward the
    // budget would clamp this label to fewer than 18 columns.
    const { io, input, output } = makeTtyPromptIo({ rawMode: true, columns: 20 });
    const pending = selectOne(paintedGate, io, {
      question: "Which tool?",
      choices: [{ value: "x", label: "x".repeat(40) }],
      defaultValue: "x",
    });
    await tick();
    const stripped = stripVTControlCharacters(output());
    expect(stripped).toContain(`> ${"x".repeat(18)}\n`);
    expect(stripped).not.toContain("x".repeat(19));
    await press(input, KEYS.enter);
    expect(await pending).toBe("x");
  });

  it("leaves the EOF disclosure in theme ink: a default the run applied is a decision record, not an aside", async () => {
    const { io, input, output } = makeTtyPromptIo({ rawMode: true });
    const pending = selectOne(paintedGate, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    await tick();
    input.end();
    expect(await pending).toBe("b");
    // Unpainted on both sides, newlines included — no dim run, no accent.
    expect(output()).toContain("\nno answer — keeping the default (Cursor)\n");
  });
});
