import { Command, CommanderError } from "commander";
import { createApp, createEngine } from "../../index.ts";
import type { App, Clock, EngineRegistry } from "../../index.ts";
import {
  detectTerminalFacts,
  makePalette,
  makeSpinner,
  resolveColorEnabled,
  type Palette,
  type Spinner,
  type TerminalFacts,
} from "./terminal.ts";
import { EngineError } from "../../types/errors.ts";
import {
  failureEnvelope,
  failureFromError,
  renderFailureHuman,
  successEnvelope,
  type FailureDoc,
} from "./output.ts";
import { closePrompts, type PromptIo } from "./prompts.ts";

/**
 * The commander program runner: every command module registers through here and
 * every run leaves through the same funnel.
 *
 * Exit contract: 0 success (including --help/--version), 1 failure,
 * 2 usage — ONLY. Commander's own nonzero parse errors collapse to 2; every
 * thrown command failure collapses to 1 (the engine's retired sysexits numbers
 * are ignored; the ErrorCode string surfaces in the JSON error document
 * instead). The ONE exception is a throw declaring `EngineError.exitCode: 0` —
 * the clean-user-cancel ending that field exists for. That is not a failure, so
 * it does not take the failure lane at all: status 0, and in JSON mode a
 * SUCCESS envelope carrying `cancelled: true` and the reason. Ending it at 1
 * with an `ok: false` document would have told a pipeline a cancel was a fault,
 * and reporting `ok: false` beside exit 0 would have made the two disagree.
 *
 * JSON mode emits exactly ONE document on stdout per run for every run that
 * REACHES a command — success from CommandResult.json, thrown failure as the
 * error envelope, and a returned exitCode-1 result as its own ok:false document
 * (never a second envelope on top). A command line commander rejects (status 2)
 * never reaches an action, so it writes its diagnostic to stderr and leaves
 * stdout empty; the published page states that scope rather than the absolute.
 * Command bodies write human output through ctx.io.out, which the funnel
 * suppresses in JSON mode; ctx.io.err always reaches stderr.
 *
 * A returned exit-1 payload is spread BEFORE the envelope keys, not after: the
 * envelope's `ok`, `command` and `version` are the three fields every consumer
 * branches on, and spreading a command's payload over them let any payload
 * field of those names overwrite the envelope — a failing command whose payload
 * happened to carry `ok` could publish `ok: true` beside exit 1.
 *
 * Flag matrix: every command gets --json and -y/--yes; --dry-run is registered
 * only on modules declaring mutating: true; --no-color is program-global
 * (commander recognizes it before and after the subcommand name). --json makes
 * a run NON-INTERACTIVE — stdout belongs to the single envelope, so no prompt
 * can be printed there — but it carries no consent: a command whose prompt
 * cannot be answered refuses through `promptGate` rather than proceeding on an
 * assumed yes.
 */

export interface CommandIo {
  out(text: string): void;
  err(text: string): void;
}

export interface CliContext {
  readonly app: App;
  readonly engine: EngineRegistry;
  readonly io: CommandIo;
  readonly promptIo: PromptIo;
  readonly terminal: TerminalFacts;
  readonly palette: Palette;
  readonly spinner: Spinner;
  readonly json: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
}

/**
 * What a command body hands back: the process status it reached, and the JSON
 * payload for a `--json` run.
 *
 * A returned `exitCode: 1` is a self-described failure — the command has
 * already written its own what/why/next to stderr — so its payload OWES an
 * `error` document, and `learn`, `add` and `check` each supply one. That debt
 * is not yet expressible in this type: making it a discriminated union
 * (`{exitCode: 0} | {exitCode: 1, json: {error: FailureDoc, …}}`) is the right
 * shape, and one command still computes its status as `errorCount > 0 ? 1 : 0`
 * (`../commands/validate.ts`), which is a `number` no union member accepts and
 * a payload with no error document. Tightening this type is that command's
 * change to make, not a silent widening here. What the funnel DOES guarantee
 * unconditionally is the envelope: the payload is spread first, so no payload
 * field can overwrite `ok`, `command` or `version`.
 */
export interface CommandResult {
  exitCode: 0 | 1;
  json?: Record<string, unknown>;
}

export interface CommandModule {
  readonly name: string;
  readonly summary: string;
  readonly hidden?: boolean;
  readonly mutating: boolean;
  readonly args?: readonly { name: string; description: string; required: boolean }[];
  /** Extra command-specific flags; runs after the shared matrix is registered. */
  configure?(cmd: Command): void;
  run(
    ctx: CliContext,
    opts: Record<string, unknown>,
    args: readonly string[],
  ): Promise<CommandResult>;
}

export interface RunCliOptions {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  io?: CommandIo;
  promptIo?: PromptIo;
  terminal?: TerminalFacts;
  clock?: Clock;
}

const defaultIo = (): CommandIo => ({
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
});

/**
 * The failure document for a thrown value: the shared collapse, plus the
 * `why` / `next` lines a typed engine failure carries.
 *
 * The collapse itself (`./output.ts::failureFromError`) keeps `code` and
 * `message` — the two fields every thrown value can produce. The two remaining
 * lines of the published schema exist only on `EngineError`, so forwarding
 * them is the funnel's job: without this step the human rendering and the JSON
 * `error` object printed a bare message for every engine failure while the
 * reference page promised a cause and a next step, and only a `CliFailure`
 * thrown at the CLI edge could keep the promise. A failure carrying neither
 * field still renders neither — the keys are added when they exist, never
 * filled with a guess.
 */
function failureDocFor(err: unknown): FailureDoc {
  const doc = failureFromError(err);
  if (!(err instanceof EngineError)) return doc;
  return {
    ...doc,
    ...(err.why === undefined ? {} : { why: err.why }),
    ...(err.next === undefined ? {} : { next: err.next }),
  };
}

/** Returns 0 | 1 | 2 only. Never calls process.exit; the entrypoint owns exit timing. */
export async function runCli(
  argv: readonly string[],
  commands: readonly CommandModule[],
  opts: RunCliOptions = {},
): Promise<number> {
  const env = opts.env ?? process.env;
  const io = opts.io ?? defaultIo();
  const promptIo = opts.promptIo ?? { input: process.stdin, output: process.stdout };
  const terminal = opts.terminal ?? detectTerminalFacts();
  const app = createApp({
    env,
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.clock !== undefined ? { clock: opts.clock } : {}),
  });
  const engine = createEngine();

  const program = new Command();
  program
    .name("stamity")
    .description("Generates agentic coding setups from a single canonical source.")
    .version(app.version, "-v, --version", "print the version and exit")
    .helpOption("-h, --help", "print usage and exit")
    .option("--no-color", "disable colored output")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.out(s),
      writeErr: (s) => io.err(s),
    });

  // The funnel's result channel: commander actions cannot return values through
  // parseAsync, so the executed action records its exit code here.
  let commandExit: 0 | 1 = 0;

  for (const module of commands) {
    const cmd = program
      .command(module.name, { hidden: module.hidden === true })
      .description(module.summary)
      .option("--json", "machine-readable JSON output (non-interactive)")
      // The wording is split because the two halves are different facts, and
      // the single sentence it replaced stated the second one backwards: `-y`
      // does NOT answer a destructive confirmation with its default. Clean's
      // confirmation defaults to NO, so its default answer declines — `-y`
      // short-circuits ahead of the gate and the delete proceeds. This string
      // is the commander description, so `--help` prints it too.
      .option(
        "-y, --yes",
        "take the non-interactive path: every prompt resolves to its default, and a destructive confirmation proceeds instead of declining",
      );
    if (module.mutating) cmd.option("--dry-run", "preview changes without writing");
    for (const arg of module.args ?? []) {
      cmd.argument(arg.required ? `<${arg.name}>` : `[${arg.name}]`, arg.description);
    }
    module.configure?.(cmd);

    cmd.action(async () => {
      const local = cmd.opts<Record<string, unknown>>();
      const json = local["json"] === true;
      // `--json` chooses an OUTPUT format; it is not a consent token. It does
      // make the run non-interactive (stdout belongs to the envelope, so no
      // prompt can be printed there) — and a command whose prompt cannot be
      // answered refuses through `promptGate` rather than proceeding on an
      // assumed yes. Folding it into `yes` made `stamity clean --json`, the
      // natural machine-readable spelling, delete `.stamity/` with no
      // confirmation anywhere in the invocation.
      const yes = local["yes"] === true;
      const dryRun = local["dryRun"] === true;
      const palette = makePalette(
        resolveColorEnabled({
          noColorFlag: program.opts<{ color?: boolean }>().color === false,
          env,
          stdoutIsTTY: terminal.stdoutIsTTY,
        }),
      );
      const rawOut = io.out.bind(io);
      const commandIo: CommandIo = {
        out: json
          ? () => {
              /* JSON mode: stdout belongs to the single envelope */
            }
          : rawOut,
        err: io.err.bind(io),
      };
      const spinner = makeSpinner({
        enabled: terminal.stdoutIsTTY && !json,
        write: commandIo.out,
      });
      const ctx: CliContext = {
        app,
        engine,
        io: commandIo,
        promptIo,
        terminal,
        palette,
        spinner,
        json,
        yes,
        dryRun,
      };
      const positional = cmd.processedArgs.filter(
        (value): value is string => typeof value === "string",
      );

      try {
        const result = await module.run(ctx, local, positional);
        commandExit = result.exitCode;
        if (json) {
          const doc =
            result.exitCode === 0
              ? successEnvelope(module.name, app.version, result.json ?? {})
              : // The command already described its failure; wrap it as THE one
                // ok:false document instead of stacking an error envelope on it.
                // Payload FIRST: the three envelope keys are what a consumer
                // branches on, and spreading the payload over them let a field
                // named `ok`, `command` or `version` clobber the envelope.
                { ...result.json, ok: false, command: module.name, version: app.version };
          rawOut(`${JSON.stringify(doc)}\n`);
        }
      } catch (err) {
        spinner.stop(); // clear a live frame so the failure starts on a clean line
        // The one non-failure throw: a clean user cancel declares itself with
        // `EngineError.exitCode: 0`. It leaves through the success lane so the
        // status and `ok` agree, carrying the reason rather than dropping it.
        if (err instanceof EngineError && err.exitCode === 0) {
          if (json) {
            rawOut(
              `${JSON.stringify(
                successEnvelope(module.name, app.version, {
                  cancelled: true,
                  reason: err.message,
                }),
              )}\n`,
            );
          } else io.err(`${err.message}\n`);
          commandExit = 0;
          return;
        }
        const failure = failureDocFor(err);
        if (json) rawOut(`${JSON.stringify(failureEnvelope(module.name, app.version, failure))}\n`);
        else io.err(`${renderFailureHuman(failure, palette)}\n`);
        commandExit = 1;
      }
    });
  }

  try {
    await program.parseAsync([...argv], { from: "user" });
    return commandExit;
  } catch (err) {
    if (err instanceof CommanderError) {
      // Help and version leave through this channel with exitCode 0; every
      // other CommanderError is a usage problem. Commander has already written
      // its message via configureOutput; add the actionable next step.
      if (err.exitCode === 0) return 0;
      const known = new Set(commands.map((command) => command.name));
      const sub = argv.find((token) => known.has(token));
      io.err(`run stamity ${sub === undefined ? "" : `${sub} `}--help for usage\n`);
      return 2;
    }
    // Defensive: the action funnel catches everything, so this is an internal
    // fault — still render actionably and keep the 0/1/2 contract.
    io.err(`${renderFailureHuman(failureDocFor(err), makePalette(false))}\n`);
    return 1;
  } finally {
    closePrompts(promptIo);
  }
}
