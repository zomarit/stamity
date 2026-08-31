/**
 * The CLI reference, rendered from the program itself.
 *
 * The drift class this closes: a hand-written command page is a
 * second, unversioned copy of the argument parser. A flag is added, a default
 * changes, a verb is renamed — and the page keeps reading as true, because
 * nothing connects it to the code. Here the command list IS `COMMANDS` and
 * each command's flags ARE its own registrations, materialized by handing the
 * module a fresh `Command` and reading back what it registered.
 *
 * **Introspection, never execution.** The page is built by calling
 * `module.configure(probe)` on a throwaway `Command` and reading
 * `probe.options` / `probe.registeredArguments`. No argv is parsed, no
 * `run()` is called, and nothing is written. Importing `../../cli.ts` for
 * `COMMANDS` is side-effect-safe by that module's own `isMain()` gate: the
 * entry runs a command only when it IS the executed script.
 *
 * **Two things are not introspectable, and both are guarded.** The shared
 * flag matrix and the exit model live in `../kit/program.ts`, which registers
 * them while building a live program — reachable only by running the CLI.
 * They are restated here as {@link GLOBAL_FLAGS} and {@link EXIT_STATUSES},
 * and the suite asserts every string in them appears verbatim in that kit
 * source, so the restatement is drift-gated rather than trusted. The error
 * codes below are a total `Record<ErrorCode, string>` of notes, so a new code
 * fails to compile here instead of going undocumented — and they carry NO exit
 * number: the CLI collapses every failure to status 1, and publishing a
 * "reserved" sysexits column told CI authors to branch on 64/65/73, which this
 * binary never returns.
 *
 * **Hidden verbs are documented, not omitted.** `learn` is absent from
 * `stamity --help` because its caller is a generated agent rather than a
 * person. A page that silently dropped it would leave an existing verb
 * undiscoverable; one that listed it beside the porcelain would advertise
 * plumbing as a user verb. It gets its own section, marked as what it is.
 *
 * Pure and clock-free: no wall clock is read, so two runs are byte-identical
 * until the command surface actually changes.
 */

import { Command } from "commander";
import { COMMANDS } from "../../cli.ts";
import type { CommandModule } from "../kit/program.ts";
import { EngineError, type ErrorCode } from "../../types/errors.ts";
import { code, table } from "./configReference.ts";
import { REGENERATE_COMMAND, frontmatterBlock, generatedBanner } from "./referencePages.ts";

/** Repo-relative path of the committed page this module renders. */
export const CLI_REFERENCE_DOC_PATH = "docs/cli-reference.md";

function fail(message: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR" });
}

// ── The kit contract (restated, drift-gated by the suite) ────────

/** A flag the program or the shared matrix registers, not the command itself. */
export interface GlobalFlag {
  readonly flags: string;
  /** Where it is registered — the program, every command, or mutating ones. */
  readonly scope: "program" | "every command" | "mutating commands";
  readonly description: string;
}

/**
 * The flags `../kit/program.ts` registers for every command. Both fields of
 * every row appear verbatim in that file; the suite asserts it, so a renamed
 * flag or a reworded help string fails the drift test rather than shipping a
 * page that describes a flag the CLI no longer has.
 */
export const GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { flags: "-h, --help", scope: "program", description: "print usage and exit" },
  { flags: "-v, --version", scope: "program", description: "print the version and exit" },
  { flags: "--no-color", scope: "program", description: "disable colored output" },
  {
    flags: "--json",
    scope: "every command",
    description: "machine-readable JSON output (non-interactive)",
  },
  {
    flags: "-y, --yes",
    scope: "every command",
    description:
      "take the non-interactive path: every prompt resolves to its default, and a destructive confirmation proceeds instead of declining",
  },
  {
    flags: "--dry-run",
    scope: "mutating commands",
    description: "preview changes without writing",
  },
];

/** One process exit status the funnel can produce. */
export interface ExitStatus {
  readonly status: number;
  readonly meaning: string;
}

/**
 * The whole exit surface: three statuses, nothing else. The engine's sysexits
 * numbers are deliberately not process exit codes — see the code table below.
 */
export const EXIT_STATUSES: readonly ExitStatus[] = [
  { status: 0, meaning: "the command succeeded — `--help` and `--version` leave through here too" },
  { status: 1, meaning: "the command ran and failed; the code below says which failure it was" },
  { status: 2, meaning: "the command line was rejected before any command ran" },
];

/**
 * What each `ErrorCode` classifies. A total `Record<ErrorCode, string>`: a new
 * code added to the engine fails to compile here rather than appearing in the
 * table with no explanation.
 */
const CODE_MEANINGS: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "content or config in this repository is structurally invalid",
  CONFIG_ERROR: "an input file is malformed — manifest, YAML, pack manifest",
  ADAPTER_ERROR: "a target-tool adapter could not produce its output",
  UNKNOWN_ERROR: "an internal fault; the engine reached a state it does not classify",
  INTEGRITY_ERROR: "output cannot be regenerated to match its source",
  FS_ERROR: "a filesystem operation failed",
  CLEAN_ERROR: "removal failed part-way",
  NETWORK_ERROR: "nothing in this build throws it — see the reserved note under the table",
  LOCK_TIMEOUT:
    "a write lock could not be taken before the retry schedule ran out; another `stamity` " +
    "run was holding it",
};

/**
 * Codes the union declares that no code path in this build can produce.
 *
 * They stay in the table because the type still declares them and a reader who
 * greps the source will find them, but they are labelled: the preamble tells CI
 * authors to branch on `error.code`, and a row that looks like the others is an
 * instruction to write a branch that can never be taken. `NETWORK_ERROR` is the
 * live example — the CLI makes no outbound call that throws it.
 */
const RESERVED_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["NETWORK_ERROR"]);

// ── Command introspection ────────────────────────────────────────

/** One positional argument, from the module's declaration or its `configure`. */
interface ArgFacts {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly choices: readonly string[];
}

/** One command-specific flag, read back from the probe command. */
interface FlagFacts {
  readonly flags: string;
  readonly description: string;
  readonly defaultValue: unknown;
  readonly required: boolean;
  readonly choices: readonly string[];
}

/** Everything the page says about one command. */
export interface CommandFacts {
  readonly name: string;
  readonly summary: string;
  readonly hidden: boolean;
  readonly mutating: boolean;
  readonly args: readonly ArgFacts[];
  readonly flags: readonly FlagFacts[];
}

/**
 * Materialize one command's surface without running it: declared positionals
 * come off the module, and everything `configure` registers is read back from
 * a throwaway `Command`. The probe is never parsed and never given an action,
 * so registration is the only code that runs.
 */
export function introspectCommand(module: CommandModule): CommandFacts {
  if (module.name.trim() === "") fail("A command module declares an empty name.");
  if (module.summary.trim() === "") {
    fail(
      `The \`${module.name}\` command declares no summary, so its section would have no ` +
        `one-line statement of what it does. Add \`summary\` to its CommandModule.`,
    );
  }

  const probe = new Command(module.name);
  module.configure?.(probe);

  const declared: ArgFacts[] = (module.args ?? []).map((arg) => ({
    name: arg.name,
    description: arg.description,
    required: arg.required,
    choices: [],
  }));
  const configured: ArgFacts[] = probe.registeredArguments.map((arg) => ({
    name: arg.name(),
    description: arg.description,
    required: arg.required,
    choices: arg.argChoices ?? [],
  }));
  const args = [...declared, ...configured];

  const flags: FlagFacts[] = probe.options.map((option) => ({
    flags: option.flags,
    description: option.description,
    defaultValue: option.defaultValue,
    required: option.mandatory,
    choices: option.argChoices ?? [],
  }));

  for (const arg of args) {
    if (arg.description.trim() === "") {
      fail(
        `The \`${module.name}\` command declares the argument \`${arg.name}\` with no ` +
          `description, so the page would list a slot nobody can fill.`,
      );
    }
  }
  for (const flag of flags) {
    if (flag.description.trim() === "") {
      fail(
        `The \`${module.name}\` command registers \`${flag.flags}\` with no description, so the ` +
          `page would list a flag with no stated effect.`,
      );
    }
  }

  return {
    name: module.name,
    summary: module.summary,
    hidden: module.hidden === true,
    mutating: module.mutating,
    args,
    flags,
  };
}

// ── Cell renderers ───────────────────────────────────────────────

/** `<name>` when required, `[name]` when optional — the shape help prints. */
function argSlot(arg: ArgFacts): string {
  return code(arg.required ? `<${arg.name}>` : `[${arg.name}]`);
}

/** A description with its closed value set appended, when it has one. */
function withChoices(description: string, choices: readonly string[]): string {
  if (choices.length === 0) return description;
  return `${description} — one of ${choices.map(code).join(", ")}`;
}

/** Defaults render as the value; absence renders as a dash, never as blank. */
function defaultCell(flag: FlagFacts): string {
  if (flag.required) return "required";
  if (flag.defaultValue === undefined) return "—";
  return code(String(flag.defaultValue));
}

// ── Sections ─────────────────────────────────────────────────────

function indexSection(facts: readonly CommandFacts[]): string[] {
  const rows = facts.map((command) => [
    code(`stamity ${command.name}`),
    command.hidden ? "plumbing" : "yes",
    command.mutating ? "writes" : "reads only",
    command.summary,
  ]);
  return [
    "## Every command",
    "",
    ...table(["Command", "Advertised", "Effect", "What it does"], rows),
  ];
}

function globalSection(facts: readonly CommandFacts[]): string[] {
  const reserved = (Object.keys(CODE_MEANINGS) as ErrorCode[]).filter((errorCode) =>
    RESERVED_CODES.has(errorCode),
  );
  return [
    "## What every command shares",
    "",
    "These are registered by the program, not by the individual commands, so they behave",
    "identically everywhere they apply.",
    "",
    ...table(
      ["Flag", "Applies to", "What it does"],
      GLOBAL_FLAGS.map((flag) => [code(flag.flags), flag.scope, flag.description]),
    ),
    "",
    "### JSON output",
    "",
    `${code("--json")} produces exactly one JSON document on stdout, and nothing else, for every`,
    // Scoped, and the scope is DERIVED: an absolute "per run" claim is false for
    // the one class of run that never reaches an action, and a hand-typed list
    // of conforming commands would go stale the first time the set changed.
    `run that reaches a command — all ${String(facts.length)} of the commands above, success and`,
    "failure alike. Human output is suppressed in the same run, so a reader never has to",
    "separate prose from payload. Every document carries `ok`, `command` and `version`;",
    "a success adds the command's own fields, and a failure adds `error` with `code` and",
    `${code("message")}.`,
    "",
    "A command line that is rejected before any command runs (exit `2` below — an unknown verb,",
    "a missing required argument, a value outside a flag's choices) never reaches an action, so",
    "**stdout is empty** and the diagnostic is on stderr. Parse stdout only after checking that",
    "the status is not `2`.",
    "",
    `The ${code("error")} object carries two OPTIONAL further lines, ${code("why")} and`,
    // The published schema used to promise these unconditionally while the
    // engine had nowhere to put them, so nearly every real failure arrived with
    // a message alone and the page was describing a document readers were not
    // being sent. Stating the condition is the honest version of the promise.
    `${code("next")}, which mirror the ${code("why:")} / ${code("next:")} lines the human`,
    "rendering prints. They appear when the failure was raised with them and are absent",
    "otherwise: a throw site that knows the cause and the remedy states them, and one that does",
    "not omits the keys rather than filling them with a guess. Treat both as optional when",
    "parsing.",
    "",
    `${code("--json")} makes a run NON-INTERACTIVE — stdout belongs to the single document, so no`,
    // The page stated the opposite of the binary's deliberate behaviour: it said
    // --json implies -y, which would make `stamity clean --json` (the natural
    // machine-readable spelling) delete the state directory with no confirmation
    // anywhere in the invocation.
    `prompt can be written there — but it is NOT consent. It does not imply ${code("-y, --yes")}:`,
    "a command whose prompt is a destructive confirmation refuses the run instead of proceeding",
    `on an assumed yes, so a pipeline that means to delete says ${code("-y")} explicitly.`,
    "Diagnostics still go to stderr, which is what keeps stdout parseable.",
    "",
    "### Exit statuses",
    "",
    "Three, and only three.",
    "",
    ...table(
      ["Status", "What it means"],
      EXIT_STATUSES.map((exit) => [code(String(exit.status)), exit.meaning]),
    ),
    "",
    "A failure is always status `1`. Which failure it was travels in the error document's",
    `${code("error.code")} field, not in the exit number, so a CI script branches on the code`,
    "string — there is no second numbering to read.",
    "",
    ...table(
      ["`error.code`", "What failed"],
      (Object.keys(CODE_MEANINGS) as ErrorCode[]).map((errorCode) => [
        code(errorCode),
        CODE_MEANINGS[errorCode],
      ]),
    ),
    "",
    ...(reserved.length === 0
      ? []
      : [
          `Reserved, never thrown: ${reserved.map(code).join(", ")}. The engine's type declares`,
          `${reserved.length === 1 ? "it" : "them"}, and no code path in this build produces`,
          `${reserved.length === 1 ? "it" : "one"} — so a CI branch on ${
            reserved.length === 1 ? "that code" : "those codes"
          } can never be taken. Listed`,
          "rather than dropped so the table stays a complete reading of the type, and labelled",
          "rather than left to look like the rows above it.",
          "",
        ]),
    "Two more codes exist only at the CLI edge and never come from the engine:",
    `${code("USAGE")} for a rejected command line, and ${code("FAILURE")} for a fault that`,
    "carries no engine classification.",
  ];
}

/** One command's section, closed by the blank line that separates it from the next. */
function commandSection(command: CommandFacts): string[] {
  const lines = [`## ${code(`stamity ${command.name}`)}`, "", command.summary, ""];

  if (command.hidden) {
    lines.push(
      "Plumbing. This verb is not listed in `stamity --help` because its caller is generated",
      "agent content rather than a person. Hidden is not secret — `stamity learn --help` prints",
      "in full — and it is documented here because a verb that exists and is undocumented is",
      "worse than one that is merely unadvertised.",
      "",
    );
  }

  lines.push(
    command.mutating
      ? `Writes to the repository, so ${code("--dry-run")} previews the change without making it.`
      : "Reads only. Nothing is written, so there is no preview mode to need.",
    "",
  );

  if (command.args.length > 0) {
    lines.push(
      ...table(
        ["Argument", "What it is"],
        command.args.map((arg) => [argSlot(arg), withChoices(arg.description, arg.choices)]),
      ),
      "",
    );
  }

  if (command.flags.length === 0) {
    lines.push("Adds no flags of its own beyond the shared matrix above.");
  } else {
    lines.push(
      ...table(
        ["Flag", "What it does", "Default"],
        command.flags.map((flag) => [
          code(flag.flags),
          withChoices(flag.description, flag.choices),
          defaultCell(flag),
        ]),
      ),
    );
  }
  lines.push("");
  return lines;
}

// ── Render ───────────────────────────────────────────────────────

/**
 * Render the page from an explicit command set. Deterministic: commands
 * render in the order they are registered, which is the order `--help` lists
 * them.
 *
 * Throws `EngineError` (`VALIDATION_ERROR`) on a command with no name or
 * summary, a duplicated command name, or an argument or flag registered with
 * no description.
 */
export function renderCliReferenceFrom(commands: readonly CommandModule[]): string {
  if (commands.length === 0) {
    fail(
      `The command set is empty, so ${CLI_REFERENCE_DOC_PATH} would document a CLI with no ` +
        `verbs. Check \`COMMANDS\` in src/cli.ts.`,
    );
  }

  const facts = commands.map(introspectCommand);
  const seen = new Set<string>();
  for (const command of facts) {
    if (seen.has(command.name)) {
      fail(`Two command modules register the name \`${command.name}\`.`);
    }
    seen.add(command.name);
  }

  const lines = [
    // Frontmatter first, banner second: the site generator parses the block only
    // at byte 0, so the banner cannot lead the file without unpublishing the title.
    frontmatterBlock("CLI reference"),
    "",
    generatedBanner(),
    "",
    "# CLI reference",
    "",
    "Every command, argument, flag and exit status, rendered from the program. The command",
    "list is the registered command set, and each command's flags are read back from its own",
    "registrations — so this page cannot describe a flag the CLI does not have, or miss one it",
    "does.",
    "",
    `${code("stamity")} with no arguments prints help and exits 0: a first touch is not a`,
    "mistake.",
    "",
    ...indexSection(facts),
    "",
    ...globalSection(facts),
    "",
    ...facts.flatMap((command) => commandSection(command)),
    `Regenerate this page with \`${REGENERATE_COMMAND}\`.`,
  ];

  return `${lines.join("\n")}\n`;
}

/** The shipped page: {@link renderCliReferenceFrom} over the live command set. */
export function renderCliReference(): string {
  return renderCliReferenceFrom(COMMANDS);
}
