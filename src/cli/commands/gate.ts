import { Argument, type Command } from "commander";
import { classifyChange } from "../../change/classify.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { sanitizeLabel } from "../kit/prompts.ts";

/**
 * `stamity gate classify` — the change class a flow's gates follow
 * (REQ-FLOW-061), and the CLI's fourth hidden plumbing verb. Hidden for the
 * reason `learn`, `handoff` and `ledger` are: its caller is the orchestrating
 * session running `/st-quick` or `/st-work`, not a person.
 *
 * **It decides nothing about a class.** The classes, their order, the rules,
 * the code-path floor and the checks each class names live in
 * `../../change/classify.ts`; this file owns which flags spell a path list and
 * how the verdict reads on a terminal and in the JSON document.
 *
 * `--paths` classifies the listed paths by path rules alone, with no base: no
 * class file and no git is read, so the reason says no base was given.
 *
 * **Why the subcommand is positional**, as in `ledger.ts`: the funnel
 * (`../kit/program.ts`) owns the exit codes and the one JSON document through
 * the action it registers on THIS command, and a commander sub-command would run
 * outside it. A missing `--paths`, an unknown subcommand or an unknown option is
 * refused by the parser, so each exits 2 before anything runs.
 */

const CLASSIFY = "classify";

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function runClassify(ctx: CliContext, opts: Record<string, unknown>): CommandResult {
  // Commander's variadic `--paths <path...>` is required, so this is a non-empty array.
  const paths = (opts["paths"] as string[] | undefined) ?? [];
  const result = classifyChange({ paths, base: "absent" });

  // Paths are the caller's bytes: sanitised where they meet the terminal.
  const lines = [
    `class: ${result.class}`,
    `checks: ${list(result.checks)}`,
    `lenses: ${list(result.lenses)}`,
    `reason: ${sanitizeLabel(result.reason)}`,
    ...result.byPath.map((entry) => sanitizeLabel(`  ${entry.path}  ${entry.class}  (${entry.rule})`)),
  ];
  ctx.io.out(`${lines.join("\n")}\n`);

  return {
    exitCode: 0,
    json: {
      subcommand: CLASSIFY,
      base: null,
      paths: result.byPath.map((entry) => entry.path),
      class: result.class,
      checks: result.checks,
      lenses: result.lenses,
      reason: result.reason,
      byPath: result.byPath,
    },
  };
}

export const gateCommand: CommandModule = {
  name: "gate",
  summary: "classify a change by its paths: the class, its checks and its lenses (plumbing)",
  hidden: true,
  mutating: false,

  configure(cmd: Command): void {
    cmd
      .addArgument(new Argument("<subcommand>", "which gate action to run").choices([CLASSIFY]))
      .requiredOption("--paths <path...>", "the changed paths to classify, by path rules alone");
  },

  run(ctx, opts): Promise<CommandResult> {
    // Commander's `choices()` already refused every other subcommand at parse time.
    return Promise.resolve(runClassify(ctx, opts));
  },
};
