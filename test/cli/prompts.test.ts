import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  closePrompts,
  confirm,
  promptGate,
  selectOne,
  textInput,
  type PromptGate,
  type PromptIo,
} from "../../src/cli/kit/prompts.ts";
import { CliFailure } from "../../src/cli/kit/output.ts";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { runInProcess } from "../support/inProcess.ts";

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

  for (const [label, answer] of [
    ["blank", ""],
    ["out-of-range", "9"],
    ["non-numeric", "x"],
  ] as const) {
    it(`falls back to the default on a ${label} answer`, async () => {
      const { io, input } = makePromptIo();
      input.write(`${answer}\n`);
      const picked = await selectOne(interactive, io, {
        question: "Which tool?",
        choices: TOOL_CHOICES,
        defaultValue: "c",
      });
      expect(picked).toBe("c");
      closePrompts(io);
    });
  }

  it("falls back to the default on EOF", async () => {
    const { io, input } = makePromptIo();
    input.end();
    const picked = await selectOne(interactive, io, {
      question: "Which tool?",
      choices: TOOL_CHOICES,
      defaultValue: "b",
    });
    expect(picked).toBe("b");
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
