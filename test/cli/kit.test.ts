import { describe, expect, it } from "vitest";
import type { Command } from "commander";
import { EngineError, VERSION } from "../../src/index.ts";
import {
  detectTerminalFacts,
  makePalette,
  makeSpinner,
  resolveColorEnabled,
} from "../../src/cli/kit/terminal.ts";
import {
  CliFailure,
  failureEnvelope,
  failureFromError,
  renderFailureHuman,
  successEnvelope,
} from "../../src/cli/kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../../src/cli/kit/program.ts";
import { runInProcess } from "../support/inProcess.ts";

const plain = makePalette(false);

/** CSI opener. Written as an escape so the byte is visible in a diff. */
const ESC = "\u001b[";

interface Captured {
  ctx: CliContext;
  opts: Record<string, unknown>;
  args: readonly string[];
}

/** Builds a fixture module that records what run() received. */
function capturing(
  name: string,
  extra?: {
    mutating?: boolean;
    hidden?: boolean;
    args?: CommandModule["args"];
    configure?: (cmd: Command) => void;
    result?: CommandResult;
  },
): { module: CommandModule; seen: Captured[] } {
  const seen: Captured[] = [];
  const module: CommandModule = {
    name,
    summary: `${name} fixture`,
    mutating: extra?.mutating ?? false,
    ...(extra?.hidden !== undefined ? { hidden: extra.hidden } : {}),
    ...(extra?.args !== undefined ? { args: extra.args } : {}),
    ...(extra?.configure !== undefined ? { configure: extra.configure } : {}),
    run: async (ctx, opts, args) => {
      seen.push({ ctx, opts, args });
      return extra?.result ?? { exitCode: 0 };
    },
  };
  return { module, seen };
}

function throwing(name: string, thrown: unknown): CommandModule {
  return {
    name,
    summary: `${name} fixture`,
    mutating: false,
    run: async () => {
      throw thrown;
    },
  };
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

describe("detectTerminalFacts", () => {
  it("reads isTTY per stream and treats absence as false", () => {
    expect(
      detectTerminalFacts({ stdout: { isTTY: true }, stderr: {}, stdin: { isTTY: true } }),
    ).toEqual({ stdoutIsTTY: true, stderrIsTTY: false, stdinIsTTY: true });
  });

  // The width fact `bannerBlock` gates on: read here, injected from there, so a
  // fixed-width picture can stay out of a window narrower than it instead of
  // wrapping into a scramble.
  it("reports the stdout stream's own column count, and leaves no key when it reports none", () => {
    expect(detectTerminalFacts({ stdout: { isTTY: true, columns: 100 }, stderr: {}, stdin: {} })).toEqual(
      { stdoutIsTTY: true, stderrIsTTY: false, stdinIsTTY: false, stdoutColumns: 100 },
    );
    const piped = detectTerminalFacts({ stdout: { isTTY: false }, stderr: {}, stdin: {} });
    expect("stdoutColumns" in piped).toBe(false);
  });

  it("defaults to the live process streams and always returns booleans", () => {
    const facts = detectTerminalFacts();
    expect(typeof facts.stdoutIsTTY).toBe("boolean");
    expect(typeof facts.stderrIsTTY).toBe("boolean");
    expect(typeof facts.stdinIsTTY).toBe("boolean");
  });
});

const resolve = (
  noColorFlag: boolean,
  env: Record<string, string | undefined>,
  stdoutIsTTY: boolean,
): boolean => resolveColorEnabled({ noColorFlag, env, stdoutIsTTY });

describe("resolveColorEnabled", () => {
  it("lets the --no-color flag beat everything", () => {
    expect(resolve(true, { FORCE_COLOR: "1" }, true)).toBe(false);
  });

  it("lets nonempty NO_COLOR beat nonempty FORCE_COLOR", () => {
    expect(resolve(false, { NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);
  });

  it("lets nonempty FORCE_COLOR force color on without a TTY", () => {
    expect(resolve(false, { FORCE_COLOR: "1" }, false)).toBe(true);
  });

  it("reads FORCE_COLOR=0 and FORCE_COLOR=false as OFF, not as another way to say on", () => {
    // The inversion this closes: a CI job exports FORCE_COLOR=0 to strip escapes
    // from a captured log, and used to be handed escapes — on a non-TTY, where
    // nothing else would have turned color on either.
    expect(resolve(false, { FORCE_COLOR: "0" }, false)).toBe(false);
    expect(resolve(false, { FORCE_COLOR: "false" }, false)).toBe(false);
    // And it overrides a real TTY, the same way NO_COLOR does: the value is a
    // deliberate instruction, not a hint to weigh against stream detection.
    expect(resolve(false, { FORCE_COLOR: "0" }, true)).toBe(false);
    expect(resolve(false, { FORCE_COLOR: "false" }, true)).toBe(false);
  });

  it("keeps every other nonempty FORCE_COLOR value forcing color on", () => {
    // Node's depth ladder: 2 and 3 ask for MORE color, never for none.
    expect(resolve(false, { FORCE_COLOR: "1" }, false)).toBe(true);
    expect(resolve(false, { FORCE_COLOR: "true" }, false)).toBe(true);
    expect(resolve(false, { FORCE_COLOR: "2" }, false)).toBe(true);
    expect(resolve(false, { FORCE_COLOR: "3" }, false)).toBe(true);
    // Case-sensitive, matching both references: "FALSE" is nobody's spelling of
    // the off switch, so it is not silently adopted as a third interpretation.
    expect(resolve(false, { FORCE_COLOR: "FALSE" }, false)).toBe(true);
  });

  it("keeps NO_COLOR winning over FORCE_COLOR in both directions", () => {
    // NO_COLOR sits above FORCE_COLOR in the order, so the off-spellings change
    // nothing about which var decides — only about what this one means.
    expect(resolve(false, { NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);
    expect(resolve(false, { NO_COLOR: "1", FORCE_COLOR: "0" }, true)).toBe(false);
    // ...and --no-color still beats every env combination.
    expect(resolve(true, { FORCE_COLOR: "1" }, true)).toBe(false);
  });

  it("falls back to stdout TTY-ness when no flag or env var speaks", () => {
    expect(resolve(false, {}, true)).toBe(true);
    expect(resolve(false, {}, false)).toBe(false);
  });

  it("reads TERM=dumb as color off, under FORCE_COLOR and over stream detection", () => {
    // A dumb terminal displays no SGR, so an escape written to one survives in
    // the transcript as literal bytes rather than as paint. Stream detection
    // alone said yes to it: this is the input that used to be missing.
    expect(resolve(false, { TERM: "dumb" }, true)).toBe(false);
    // Below FORCE_COLOR, which is where every color library puts it: the env
    // var is the operator stating where the stream really goes, and it still
    // outranks a capability read off TERM.
    expect(resolve(false, { TERM: "dumb", FORCE_COLOR: "1" }, true)).toBe(true);
    expect(resolve(false, { TERM: "dumb", FORCE_COLOR: "1" }, false)).toBe(true);
    // The off-spellings, NO_COLOR and the flag keep their meaning: nothing
    // here is a second way to turn color back on.
    expect(resolve(false, { TERM: "dumb", FORCE_COLOR: "0" }, true)).toBe(false);
    expect(resolve(false, { TERM: "dumb", NO_COLOR: "1" }, true)).toBe(false);
    expect(resolve(true, { TERM: "dumb", FORCE_COLOR: "1" }, true)).toBe(false);
  });

  it("matches TERM=dumb case-insensitively on the WHOLE value, as the menu probe does", () => {
    // Same read as `src/cli/kit/prompts.ts::rawMenuIo`, which sends this exact
    // terminal to the typed path — one spelling of the opt-out, not two.
    expect(resolve(false, { TERM: "DUMB" }, true)).toBe(false);
    // A TERM that merely CONTAINS the word names some other terminal, and keeps
    // whatever stream detection decided for it.
    expect(resolve(false, { TERM: "xterm-dumbish" }, true)).toBe(true);
    expect(resolve(false, { TERM: "" }, true)).toBe(true);
  });

  it("treats empty-string env vars as unset (informal NO_COLOR spec: nonempty check)", () => {
    expect(resolve(false, { NO_COLOR: "" }, true)).toBe(true);
    expect(resolve(false, { NO_COLOR: "", FORCE_COLOR: "1" }, false)).toBe(true);
    expect(resolve(false, { FORCE_COLOR: "" }, false)).toBe(false);
  });
});

describe("makePalette", () => {
  it("wraps in ANSI codes when enabled, regardless of the ambient environment", () => {
    const palette = makePalette(true);
    expect(palette.red("x")).toBe("\u001b[31mx\u001b[39m");
    expect(palette.bold("x")).toBe("\u001b[1mx\u001b[22m");
    expect(palette.dim("x")).toContain("\u001b[");
  });

  it("is the identity when disabled", () => {
    const palette = makePalette(false);
    for (const style of [
      palette.bold,
      palette.dim,
      palette.red,
      palette.green,
      palette.yellow,
      palette.cyan,
    ]) {
      expect(style("plain")).toBe("plain");
    }
  });

  // The accent is the one method whose depth is a SECOND argument, and its
  // default is what keeps every existing caller byte-identical: a palette built
  // the way this kit has always built one writes no accent escape at all.
  it("leaves the accent as the identity when no depth is named, enabled or not", () => {
    expect(makePalette(false).accent("plain")).toBe("plain");
    expect(makePalette(true).accent("plain")).toBe("plain");
  });

  it("paints the UI accent — #8A52FF, not the mark's #6B24FF — at the depths that can carry it", () => {
    // The interface's ladder is a lighter tint of the brand hue than the
    // wordmark's on purpose: #6B24FF is 3.32:1 on black and 2.25:1 on a
    // Dracula ground, below WCAG 1.4.11's 3:1 floor for a state indicator.
    expect(makePalette(true, "truecolor").accent("x")).toBe(`${ESC}38;2;138;82;255mx${ESC}39m`);
    expect(makePalette(true, "ansi256").accent("x")).toBe(`${ESC}38;5;99mx${ESC}39m`);
  });

  it("writes NO escape for the accent at 16-color depth: a theme-defined color may not carry state", () => {
    // SGR 35 is whatever the reader's theme maps magenta to, so it is not a
    // measurable contrast — and the glyph under the accent carries the state on
    // its own, so vanishing costs decoration and nothing else.
    expect(makePalette(true, "ansi16").accent("x")).toBe("x");
  });

  it("still disables every method, accent included, when color is off at any depth", () => {
    expect(makePalette(false, "truecolor").accent("x")).toBe("x");
  });
});

describe("makeSpinner", () => {
  it("renders \\r frames when enabled, advancing per call and padding shrinkage", () => {
    const writes: string[] = [];
    const spinner = makeSpinner({ enabled: true, write: (s) => writes.push(s) });
    spinner.start("aa");
    spinner.update("b");
    spinner.stop("done");
    expect(writes).toEqual(["\r- aa", "\r\\ b ", "\r    \r", "done\n"]);
  });

  it("prints the start text exactly once as a plain line when disabled — no \\r", () => {
    const writes: string[] = [];
    const spinner = makeSpinner({ enabled: false, write: (s) => writes.push(s) });
    spinner.start("working");
    spinner.update("still working");
    spinner.stop();
    expect(writes).toEqual(["working\n"]);
    expect(writes.join("")).not.toContain("\r");
  });

  it("prints a final line in both modes and stays silent on stop() without start", () => {
    const disabled: string[] = [];
    makeSpinner({ enabled: false, write: (s) => disabled.push(s) }).stop("fin");
    expect(disabled).toEqual(["fin\n"]);

    const enabled: string[] = [];
    makeSpinner({ enabled: true, write: (s) => enabled.push(s) }).stop();
    expect(enabled).toEqual([]);
  });
});

describe("output envelope", () => {
  it("shapes the success document as { ok, command, version, ...payload }", () => {
    expect(successEnvelope("sync", "1.2.3", { files: 4 })).toEqual({
      ok: true,
      command: "sync",
      version: "1.2.3",
      files: 4,
    });
  });

  it("shapes the failure document with the FailureDoc under error", () => {
    const doc = failureEnvelope("sync", "1.2.3", { code: "FAILURE", message: "nope" });
    expect(doc).toEqual({
      ok: false,
      command: "sync",
      version: "1.2.3",
      error: { code: "FAILURE", message: "nope" },
    });
  });

  it("maps thrown values to FailureDocs by class", () => {
    const cli = new CliFailure({ code: "USAGE", message: "bad", next: "fix it" });
    expect(failureFromError(cli)).toBe(cli.doc);
    expect(cli.name).toBe("CliFailure");
    expect(cli.message).toBe("bad");

    const engine = new EngineError("manifest invalid", { code: "VALIDATION_ERROR" });
    expect(failureFromError(engine)).toEqual({
      code: "VALIDATION_ERROR",
      message: "manifest invalid",
    });

    expect(failureFromError(new Error("plain"))).toEqual({ code: "FAILURE", message: "plain" });
    expect(failureFromError("boom")).toEqual({ code: "FAILURE", message: "boom" });
  });

  it("renders what/why/next lines, dropping absent parts", () => {
    expect(
      renderFailureHuman(
        { code: "FAILURE", message: "sync failed", why: "manifest missing", next: "run init" },
        plain,
      ),
    ).toBe("error: sync failed\n  why: manifest missing\n  next: run init");
    expect(renderFailureHuman({ code: "FAILURE", message: "sync failed" }, plain)).toBe(
      "error: sync failed",
    );
  });
});

describe("runCli exit contract", () => {
  it("exits 0 for --help and keeps hidden commands out of it", async () => {
    const { module: greet } = capturing("greet");
    const { module: ghost } = capturing("ghost", { hidden: true });
    const result = await runInProcess([greet, ghost], ["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("greet");
    expect(result.stdout).not.toContain("ghost");
  });

  it("still runs a hidden command when named", async () => {
    const { module: ghost, seen } = capturing("ghost", { hidden: true });
    const result = await runInProcess([ghost], ["ghost"]);
    expect(result.code).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it("exits 0 for --version and prints the package version", async () => {
    const { module: greet } = capturing("greet");
    const result = await runInProcess([greet], ["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });

  it("exits 0 for help requested via a subcommand (stamity greet --help)", async () => {
    const { module: greet, seen } = capturing("greet");
    const result = await runInProcess([greet], ["greet", "--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: stamity greet");
    expect(seen).toHaveLength(0);
  });

  it("exits 2 on an unknown command, with the commander message and a help hint", async () => {
    const { module: greet } = capturing("greet");
    const result = await runInProcess([greet], ["nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command");
    expect(result.stderr).toContain("run stamity --help for usage");
    expect(result.stdout).toBe("");
  });

  it("exits 2 on an unknown flag, hinting at the subcommand's help", async () => {
    const { module: greet } = capturing("greet");
    const result = await runInProcess([greet], ["greet", "--wat"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option");
    expect(result.stderr).toContain("run stamity greet --help for usage");
  });

  it("exits 2 on a missing required argument", async () => {
    const { module: need } = capturing("need", {
      args: [{ name: "target", description: "the target", required: true }],
    });
    const result = await runInProcess([need], ["need"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("missing required argument");
    expect(result.stderr).toContain("run stamity need --help for usage");
  });

  it("passes declared arguments through and omits an absent optional one", async () => {
    const required = capturing("need", {
      args: [{ name: "target", description: "the target", required: true }],
    });
    await runInProcess([required.module], ["need", "alpha"]);
    expect(required.seen[0]?.args).toEqual(["alpha"]);

    const optional = capturing("maybe", {
      args: [{ name: "target", description: "the target", required: false }],
    });
    await runInProcess([optional.module], ["maybe"]);
    expect(optional.seen[0]?.args).toEqual([]);
  });

  it("exits 1 when run() throws CliFailure, rendering what/why/next on stderr", async () => {
    const module = throwing(
      "boom",
      new CliFailure({
        code: "FAILURE",
        message: "sync failed",
        why: "manifest missing",
        next: "run stamity init",
      }),
    );
    const result = await runInProcess([module], ["boom"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("error: sync failed");
    expect(result.stderr).toContain("  why: manifest missing");
    expect(result.stderr).toContain("  next: run stamity init");
    expect(result.stdout).toBe("");
  });

  it("exits 1 when run() throws an EngineError, carrying the kind in `code`", async () => {
    const thrown = new EngineError("manifest invalid", { code: "VALIDATION_ERROR" });
    expect(thrown.code).toBe("VALIDATION_ERROR"); // the classification...
    const result = await runInProcess([throwing("evalidate", thrown)], ["evalidate"]);
    expect(result.code).toBe(1); // ...and one status at the process boundary
    expect(result.stderr).toContain("error: manifest invalid");
  });

  it("exits 1 when run() throws a plain string, still rendering a failure doc", async () => {
    const result = await runInProcess([throwing("strfail", "boom")], ["strfail"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("error: boom");
  });
});

describe("runCli JSON mode", () => {
  const greetRun: CommandModule = {
    name: "greet",
    summary: "greet fixture",
    mutating: false,
    run: async (ctx) => {
      ctx.io.out("human line\n");
      ctx.io.err("warned\n");
      return { exitCode: 0, json: { greeting: "hello" } };
    },
  };

  it("emits exactly one success document; io.out is suppressed, io.err reaches stderr", async () => {
    const result = await runInProcess([greetRun], ["greet", "--json"]);
    expect(result.code).toBe(0);
    expect(parseSingleDoc(result.stdout)).toEqual({
      ok: true,
      command: "greet",
      version: VERSION,
      greeting: "hello",
    });
    expect(result.stdout).not.toContain("human line");
    expect(result.stderr).toContain("warned");
  });

  it("keeps human output on stdout when --json is absent", async () => {
    const result = await runInProcess([greetRun], ["greet"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("human line\n");
  });

  it("emits exactly one error envelope with the ErrorCode string for a thrown EngineError", async () => {
    const module = throwing(
      "evalidate",
      new EngineError("manifest invalid", { code: "VALIDATION_ERROR" }),
    );
    const result = await runInProcess([module], ["evalidate", "--json"]);
    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect(doc["error"]).toEqual({ code: "VALIDATION_ERROR", message: "manifest invalid" });
  });

  it("codes a thrown non-Error as FAILURE in the envelope", async () => {
    const result = await runInProcess([throwing("strfail", "boom")], ["strfail", "--json"]);
    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["error"]).toEqual({ code: "FAILURE", message: "boom" });
  });

  it("does not stack a second envelope on a returned exitCode-1 result (double-failure)", async () => {
    const { module } = capturing("partial", {
      result: { exitCode: 1, json: { drifted: 3 } },
    });
    const result = await runInProcess([module], ["partial", "--json"]);
    expect(result.code).toBe(1);
    expect(parseSingleDoc(result.stdout)).toEqual({
      ok: false,
      command: "partial",
      version: VERSION,
      drifted: 3,
    });
  });
});

describe("runCli flag matrix", () => {
  it("registers --dry-run on mutating modules only", async () => {
    const mutating = capturing("mut", { mutating: true });
    const readonly = capturing("greet");

    const ok = await runInProcess([mutating.module, readonly.module], ["mut", "--dry-run"]);
    expect(ok.code).toBe(0);
    expect(mutating.seen[0]?.ctx.dryRun).toBe(true);

    const rejected = await runInProcess([mutating.module, readonly.module], ["greet", "--dry-run"]);
    expect(rejected.code).toBe(2);
    expect(rejected.stderr).toContain("unknown option");
  });

  it("gives every module --json and -y, and keeps --json out of the consent decision", async () => {
    const { module, seen } = capturing("greet");

    await runInProcess([module], ["greet", "-y"]);
    expect(seen[0]?.ctx.yes).toBe(true);
    expect(seen[0]?.ctx.json).toBe(false);

    // --json selects an output format. It makes the run non-interactive (the
    // prompt has nowhere to print), which `promptGate` reads off ctx.json —
    // but it is not a yes, so a destructive command refuses instead of
    // proceeding unconfirmed.
    await runInProcess([module], ["greet", "--json"]);
    expect(seen[1]?.ctx.json).toBe(true);
    expect(seen[1]?.ctx.yes).toBe(false);

    await runInProcess([module], ["greet"]);
    expect(seen[2]?.ctx.yes).toBe(false);
    expect(seen[2]?.ctx.dryRun).toBe(false);
  });

  it("hands command-specific flags from configure() through the opts record", async () => {
    const { module, seen } = capturing("extra", {
      configure: (cmd) => {
        cmd.option("--flame", "extra flag");
      },
    });
    const result = await runInProcess([module], ["extra", "--flame"]);
    expect(result.code).toBe(0);
    expect(seen[0]?.opts["flame"]).toBe(true);
  });
});

describe("runCli color plumbing", () => {
  const boom = (): CommandModule =>
    throwing("boom", new CliFailure({ code: "FAILURE", message: "red alert" }));

  it("styles stderr when FORCE_COLOR is set in the injected env", async () => {
    const result = await runInProcess([boom()], ["boom"], { env: { FORCE_COLOR: "1" } });
    expect(result.stderr).toContain("\u001b[31m");
  });

  it("emits no escape at all under FORCE_COLOR=0, through the whole funnel", async () => {
    // End to end, not just the resolver: the value has to survive program
    // wiring and reach the disabled palette, because the consumer that exports
    // FORCE_COLOR=0 is reading these bytes back out of a captured log.
    const off = await runInProcess([boom()], ["boom"], { env: { FORCE_COLOR: "0" } });
    expect(off.code).toBe(1);
    expect(off.stderr).toContain("red alert");
    expect(off.stderr).not.toContain(ESC);

    const on = await runInProcess([boom()], ["boom"], { env: { FORCE_COLOR: "1" } });
    expect(on.stderr).toContain(ESC);

    // NO_COLOR still wins over an explicit force-on, unchanged by the above.
    const noColor = await runInProcess([boom()], ["boom"], {
      env: { NO_COLOR: "1", FORCE_COLOR: "1" },
    });
    expect(noColor.stderr).not.toContain(ESC);
  });

  it("strips styling under --no-color after the subcommand name", async () => {
    const result = await runInProcess([boom()], ["boom", "--no-color"], {
      env: { FORCE_COLOR: "1" },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain("\u001b[");
  });

  it("strips styling under --no-color before the subcommand name", async () => {
    const result = await runInProcess([boom()], ["--no-color", "boom"], {
      env: { FORCE_COLOR: "1" },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain("\u001b[");
  });
});

describe("runCli spinner gating", () => {
  const spin: CommandModule = {
    name: "spin",
    summary: "spinner fixture",
    mutating: false,
    run: async (ctx) => {
      ctx.spinner.start("working");
      ctx.spinner.stop("done");
      return { exitCode: 0 };
    },
  };

  it("prints plain lines outside a TTY — no \\r anywhere", async () => {
    const result = await runInProcess([spin], ["spin"]);
    expect(result.stdout).toBe("working\ndone\n");
  });

  it("renders \\r frames on a TTY stdout", async () => {
    const result = await runInProcess([spin], ["spin"], { tty: { stdout: true } });
    expect(result.stdout).toContain("\r");
    expect(result.stdout).toContain("done\n");
  });

  it("stays off in JSON mode even on a TTY: stdout is only the envelope", async () => {
    const result = await runInProcess([spin], ["spin", "--json"], { tty: { stdout: true } });
    expect(result.stdout).not.toContain("working");
    expect(result.stdout).not.toContain("\r");
    expect(parseSingleDoc(result.stdout)["ok"]).toBe(true);
  });
});
