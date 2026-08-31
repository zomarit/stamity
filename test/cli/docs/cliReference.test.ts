import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "commander";
import { afterAll, describe, expect, it } from "vitest";
import { COMMANDS } from "../../../src/cli.ts";
import {
  CLI_REFERENCE_DOC_PATH,
  EXIT_STATUSES,
  GLOBAL_FLAGS,
  introspectCommand,
  renderCliReference,
  renderCliReferenceFrom,
} from "../../../src/cli/docs/cliReference.ts";
import { REGENERATE_COMMAND } from "../../../src/cli/docs/referencePages.ts";
import type { CommandModule } from "../../../src/cli/kit/program.ts";
import { EngineError, type ErrorCode } from "../../../src/types/errors.ts";

/**
 * The drift gate on the CLI reference.
 *
 * The page is a projection of the program, so the only way it can lie is by
 * being stale — which is what the byte comparison catches, and why the
 * failure message carries the regeneration command instead of leaving a
 * reader to guess.
 *
 * Two things the renderer restates rather than introspects — the shared flag
 * matrix and the exit statuses — are gated here against the kit source, so
 * "restated" never quietly becomes "invented".
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/cliReference.ts");
const PROGRAM_KIT_PATH = join(REPO_ROOT, "src/cli/kit/program.ts");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-docs.mjs");
const CLI_ENTRY_PATH = join(REPO_ROOT, "src/cli.ts");

/** Named so "the failure names the regen command" is asserted, not assumed. */
const STALE_MESSAGE =
  `${CLI_REFERENCE_DOC_PATH} is stale — the render no longer matches the committed page. ` +
  `Regenerate it with \`${REGENERATE_COMMAND}\` and commit the diff.`;

const committedPage = (): string => readFileSync(join(REPO_ROOT, CLI_REFERENCE_DOC_PATH), "utf-8");

/** Body rows of every markdown table in the page — header and delimiter dropped. */
function tableRows(doc: string): string[] {
  const rows: string[] = [];
  let inBody = false;
  for (const line of doc.split("\n")) {
    if (line.startsWith("|---")) inBody = true;
    else if (!line.startsWith("| ")) inBody = false;
    else if (inBody) rows.push(line);
  }
  return rows;
}

/** Cells of one row, split on UNESCAPED pipes — the split GFM itself performs. */
function cells(row: string): string[] {
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((value) => value.trim());
}

/** A minimal module, so a defect case differs from a valid one in one field. */
function moduleOf(patch: Partial<CommandModule> = {}): CommandModule {
  return {
    name: "probe",
    summary: "a probe command",
    mutating: false,
    run: async () => ({ exitCode: 0 }),
    ...patch,
  };
}

describe("renderCliReference — drift gate", () => {
  it("byte-matches the committed page", () => {
    expect(STALE_MESSAGE).toContain(REGENERATE_COMMAND);
    expect(renderCliReference(), STALE_MESSAGE).toBe(committedPage());
  });

  it("ends with exactly one trailing newline and carries no CR", () => {
    const page = renderCliReference();
    expect(page.endsWith("\n")).toBe(true);
    expect(page.endsWith("\n\n")).toBe(false);
    expect(page).not.toContain("\r");
  });

  it("renders byte-identically twice", () => {
    expect(renderCliReference()).toBe(renderCliReference());
  });

  it("reads no clock — the page is a function of the program alone", () => {
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
    expect(source).not.toMatch(/performance\.now\(/);
  });

  it("links nothing outside the tree — no absolute URL anywhere on the page", () => {
    expect(renderCliReference()).not.toContain("http");
    expect(renderCliReference()).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
  });
});

describe("command coverage", () => {
  const page = renderCliReference();

  it("gives every registered command its own section, in registration order", () => {
    const headings = page.split("\n").filter((line) => line.startsWith("## `stamity "));
    expect(headings).toEqual(COMMANDS.map((command) => `## \`stamity ${command.name}\``));
  });

  it("lists every command in the index table with its write posture", () => {
    // The index is the first table on the page.
    const rows = tableRows(page).slice(0, COMMANDS.length);
    expect(rows.map((row) => cells(row)[0])).toEqual(
      COMMANDS.map((command) => `\`stamity ${command.name}\``),
    );
    COMMANDS.forEach((command, index) => {
      const [, advertised, effect, summary] = cells(rows[index] ?? "");
      expect(advertised).toBe(command.hidden === true ? "plumbing" : "yes");
      expect(effect).toBe(command.mutating ? "writes" : "reads only");
      expect(summary).toBe(command.summary);
    });
  });

  it("documents `learn` as plumbing — neither omitted nor advertised as a user verb", () => {
    const learn = COMMANDS.find((command) => command.name === "learn");
    expect(learn?.hidden).toBe(true);
    expect(page).toContain("## `stamity learn`");
    expect(page).toContain("Plumbing.");
    expect(page).toContain("not listed in `stamity --help`");
    expect(page).toContain("Hidden is not secret");
  });

  it("renders every flag each command registers, with its default", () => {
    for (const command of COMMANDS) {
      const facts = introspectCommand(command);
      for (const flag of facts.flags) {
        expect(page, `${command.name} is missing ${flag.flags}`).toContain(`| \`${flag.flags}\` |`);
        if (flag.defaultValue !== undefined && !flag.required) {
          expect(page).toContain(`\`${String(flag.defaultValue)}\``);
        }
      }
      for (const arg of facts.args) {
        const slot = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
        expect(page, `${command.name} is missing argument ${slot}`).toContain(`| \`${slot}\` |`);
      }
    }
  });

  it("claims no write LOCATION for a mutating command, because it cannot know one", () => {
    // The sentence used to read "Writes to the repository", printed on every
    // mutating section. `worktree setup` materializes into the farm — outside
    // this repository — and `workspace sync` rewrites member repositories, so
    // the page asserted a destination that was wrong for both.
    expect(page).not.toContain("Writes to the repository");

    // Non-degenerate: there are mutating commands, and each one gets the
    // location-free sentence. Asserting only the absence above would pass on a
    // page that had lost the sentence entirely.
    const mutating = COMMANDS.filter((command) => command.mutating);
    expect(mutating.length).toBeGreaterThan(1);
    for (const command of mutating) {
      const section = page.split(`## \`stamity ${command.name}\``)[1] ?? "";
      expect(section, `${command.name} lost its write posture`).toContain(
        "Writes when it runs, so `--dry-run` previews the change without making it.",
      );
    }
    for (const command of COMMANDS.filter((c) => !c.mutating)) {
      const section = page.split(`## \`stamity ${command.name}\``)[1] ?? "";
      expect(section, `${command.name} is not mutating`).toContain("Reads only.");
    }
  });

  it("renders a closed choice set beside the flag that declares it", () => {
    // `--confidence` is the one flag carrying both choices and a default.
    expect(page).toContain("one of `low`, `medium`, `high`");
    expect(page).toContain("| `--confidence <level>` |");
  });
});

describe("introspection safety", () => {
  it("never parses argv or runs a command body", () => {
    // A run() that throws would surface here if introspection called it.
    const exploding = moduleOf({
      run: async () => {
        throw new Error("run() must never be called during introspection");
      },
      configure: (cmd: Command) => {
        cmd.option("--probe", "a probe flag");
      },
    });
    const facts = introspectCommand(exploding);
    expect(facts.flags.map((flag) => flag.flags)).toEqual(["--probe"]);
  });

  it("leaves the module untouched — a second introspection is identical", () => {
    for (const command of COMMANDS) {
      expect(introspectCommand(command)).toEqual(introspectCommand(command));
    }
  });

  it("reads positional arguments from both the module and its configure()", () => {
    const facts = introspectCommand(
      moduleOf({
        args: [{ name: "declared", description: "declared on the module", required: true }],
        configure: (cmd: Command) => {
          cmd.argument("[extra]", "added by configure");
        },
      }),
    );
    expect(facts.args.map((arg) => arg.name)).toEqual(["declared", "extra"]);
    expect(facts.args.map((arg) => arg.required)).toEqual([true, false]);
  });

  /**
   * The import-side of the same property: `src/cli.ts` runs a command only
   * when it IS the executed script, so loading it for `COMMANDS` must produce
   * no output and no exit code. Asserted in a child process, where argv can
   * be made to look exactly like a real invocation.
   */
  it("imports the CLI entry with command-shaped argv and causes no side effect", () => {
    const workspace = mkdtempSync(join(tmpdir(), "stamity-p6u03-ismain-"));
    try {
      const probe = join(workspace, "probe.mjs");
      writeFileSync(
        probe,
        // The file URL, not the raw path: `import()` resolves its argument as a
        // URL, so a Windows absolute path parses as scheme `c:` and throws
        // ERR_UNSUPPORTED_ESM_URL_SCHEME instead of loading the entry.
        `await import(${JSON.stringify(pathToFileURL(CLI_ENTRY_PATH).href)});\n` +
          `process.stdout.write("imported:" + String(process.exitCode));\n`,
        "utf-8",
      );
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--disable-warning=ExperimentalWarning",
          probe,
          "init",
          "--force",
        ],
        { encoding: "utf-8" },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("imported:undefined");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("the restated kit contract", () => {
  const kitSource = readFileSync(PROGRAM_KIT_PATH, "utf-8");

  it("declares only flags the kit actually registers, worded the same way", () => {
    for (const flag of GLOBAL_FLAGS) {
      expect(kitSource, `program.ts does not register ${flag.flags}`).toContain(
        `"${flag.flags}"`,
      );
      expect(kitSource, `program.ts wording differs for ${flag.flags}`).toContain(
        `"${flag.description}"`,
      );
    }
  });

  it("does not describe -y as taking the default on the destructive path", () => {
    // The single sentence it replaced inverted the behaviour where it
    // matters most. `clean`'s confirmation defaults to NO, so answering with
    // its default DECLINES — `-y` short-circuits ahead of the gate and the
    // delete proceeds. This string is also the commander description, so
    // `--help` printed the same inversion.
    const yes = GLOBAL_FLAGS.find((flag) => flag.flags === "-y, --yes");

    expect(yes?.description).toContain("a destructive confirmation proceeds instead of declining");
    expect(yes?.description).not.toContain("including a destructive confirmation");
    // And the two halves stay one string in the kit, which the parity case above
    // asserts verbatim — so `--help` and this page cannot diverge.
    expect(kitSource).toContain(`"${yes?.description ?? ""}"`);
  });

  it("keeps the exit surface at exactly three statuses", () => {
    expect(EXIT_STATUSES.map((exit) => exit.status)).toEqual([0, 1, 2]);
    expect(kitSource).toContain("Returns 0 | 1 | 2 only");
  });

  it("publishes every engine error code, and no exit number beside it", () => {
    const page = renderCliReference();
    const codes: ErrorCode[] = [
      "VALIDATION_ERROR",
      "CONFIG_ERROR",
      "ADAPTER_ERROR",
      "UNKNOWN_ERROR",
      "INTEGRITY_ERROR",
      "FS_ERROR",
      "CLEAN_ERROR",
      "NETWORK_ERROR",
      "LOCK_TIMEOUT",
    ];
    for (const errorCode of codes) {
      const row = tableRows(page).find((line) => cells(line)[0] === `\`${errorCode}\``);
      expect(row, `no table row for ${errorCode}`).toBeDefined();
      expect(cells(row ?? "")[1]?.length ?? 0).toBeGreaterThan(0);
    }
    // The retired sysexits column: publishing "reserved" numbers told CI
    // authors to branch on statuses this binary never returns.
    for (const retired of ["`64`", "`65`", "`69`", "`70`", "`73`", "`74`", "`75`", "sysexits"]) {
      expect(page, retired).not.toContain(retired);
    }
    // The CLI-edge codes are named as such, not silently folded into the table.
    expect(page).toContain("`USAGE`");
    expect(page).toContain("`FAILURE`");
  });

  it("states that a failure exits 1 regardless of its code", () => {
    expect(renderCliReference()).toContain("A failure is always status `1`");
  });

  /**
   * This case previously asserted the OPPOSITE: that the page carried
   * "Reserved, never thrown: `NETWORK_ERROR`" and that no file in `src`
   * produced the code. Its file-list assertion was written to fire the moment
   * a producer appeared, and the worktree lane's branch-plan fetch
   * (`src/worktree/git.ts`) is that producer — so the old expectation was not
   * weakened to make a change pass, it was CASHED: the page's negative claim
   * became false and the note came off the page. The firing property is kept,
   * pointed the other way — a SECOND producer still fails this case, which is
   * what forces the table row (which names one producer) to be re-read.
   */
  it("names the live producer of NETWORK_ERROR instead of calling it reserved", () => {
    const page = renderCliReference();

    // The retired note, in both of its spellings.
    expect(page).not.toContain("Reserved, never thrown");
    expect(page).not.toContain("no code path in this build produces");

    // The row is a positive claim now, so it has to name what throws it.
    const row = tableRows(page).find((line) => cells(line)[0] === "`NETWORK_ERROR`") ?? "";
    expect(row).toContain("worktree setup");
    expect(row).toContain("origin");
    // ...and it has to keep the distinction the classifier actually draws:
    // `classifyFetchFailure` sends a missing ref to `create`, not to a failure.
    expect(row).toContain("a remote with no such branch is not this");

    // The claim is checkable, so check it. `--untracked` is deliberate: it makes
    // the census a property of the SOURCE TREE rather than of git's index, so
    // the answer is the same whether `src/worktree/` is committed, staged with
    // `git add -N`, or still untracked in a working copy. Ignored paths stay
    // excluded (no `--no-exclude-standard`), so `node_modules` is not searched.
    const sources = execFileSync("git", ["grep", "-l", "--untracked", "NETWORK_ERROR", "--", "src"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    })
      .split("\n")
      .filter((line) => line !== "");
    // The declaration, this page's own table, the transient classifier — and
    // the worktree pair: `git.ts` throws it, `setup.ts` documents the escape.
    // A sixth file means a second producer: name it in the row above, or here.
    expect(sources.toSorted()).toEqual([
      "src/cli/docs/cliReference.ts",
      "src/resilience/failureClass.ts",
      "src/types/errors.ts",
      "src/worktree/git.ts",
      "src/worktree/setup.ts",
    ]);
    // And the producer is a THROW, not a mention: the row would be false if
    // `git.ts` only named the code in prose.
    expect(readFileSync(join(REPO_ROOT, "src/worktree/git.ts"), "utf-8")).toContain(
      `code: "NETWORK_ERROR"`,
    );
  });

  it("re-words the lock-timeout row so `retryable` is not a claim the CLI does not keep", () => {
    // Same class as the reserved row: "retryable" read as an instruction to
    // retry, while the retry already happened — the schedule is exhausted by
    // the time the code surfaces (`src/merge/atomicWrite.ts`).
    const page = renderCliReference();
    const lockRow = tableRows(page).find((line) => cells(line)[0] === "`LOCK_TIMEOUT`") ?? "";

    expect(lockRow).toContain("retry schedule ran out");
    expect(lockRow).not.toContain("retryable");
  });
});

/** The shipped page, re-rendered per assertion (pure, so this is free). */
const shippedPage = (): string => renderCliReference();

describe("the JSON-output section", () => {
  it("scopes the one-document claim to runs that reach a command, and names the exit-2 hole", () => {
    // The page claimed exactly one document on stdout "per run, success
    // and failure alike". For every exit-2 run stdout is EMPTY — commander
    // rejects the line before any action runs — so a CI script following the
    // page would parse nothing and blame the parser.
    expect(shippedPage()).toContain("for every\nrun that reaches a command");
    expect(shippedPage()).toContain("**stdout is empty**");
    expect(shippedPage()).toContain("Parse stdout only after checking that\nthe status is not `2`");
  });

  it("derives the conforming-command count from the command table rather than hand-listing it", () => {
    // The scope has to move with the command set or it becomes the next drift.
    // Rendering a longer set must change the number in the sentence.
    const two = renderCliReferenceFrom([moduleOf({ name: "one" }), moduleOf({ name: "two" })]);
    expect(two).toContain("all 2 of the commands above");
    expect(shippedPage()).toContain(`all ${String(COMMANDS.length)} of the commands above`);
  });

  it("says --json is non-interactive and NOT consent, which is what the binary does", () => {
    // The page stated the opposite of a deliberate behaviour. `--json`
    // does not imply `-y`; `stamity clean --json` refuses rather than deleting.
    expect(shippedPage()).toContain("it is NOT consent");
    expect(shippedPage()).toContain("It does not imply `-y, --yes`");
    expect(shippedPage()).not.toContain("`--json` implies `-y, --yes`");
  });

  it("describes why/next as optional, matching what a failure can actually carry", () => {
    // The schema promised both lines unconditionally while `EngineError`
    // had nowhere to put them, so nearly every real failure arrived with a
    // message alone and the page described a document readers were not sent.
    expect(shippedPage()).toContain("two OPTIONAL further lines");
    expect(shippedPage()).toContain("Treat both as optional when\nparsing");
    expect(shippedPage()).toContain("omits the keys rather than filling them with a guess");
  });
});

describe("refuse-to-render", () => {
  it("refuses an empty command set, naming where COMMANDS lives", () => {
    const empty: CommandModule[] = [];
    const call = (): string => renderCliReferenceFrom(empty);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/src\/cli\.ts/);
  });

  it("refuses a command with no summary, naming the command", () => {
    const quiet = moduleOf({ name: "quiet", summary: "  " });
    const call = (): string => renderCliReferenceFrom([quiet]);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`quiet`/);
    expect(call).toThrowError(/summary/);
  });

  it("refuses a command with an empty name", () => {
    expect(() => renderCliReferenceFrom([moduleOf({ name: "" })])).toThrowError(/empty name/);
  });

  it("refuses a flag registered with no description, naming command and flag", () => {
    const call = (): string =>
      renderCliReferenceFrom([
        moduleOf({
          name: "mute",
          configure: (cmd: Command) => {
            cmd.option("--silent");
          },
        }),
      ]);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/`mute`/);
    expect(call).toThrowError(/--silent/);
  });

  it("refuses an argument declared with no description", () => {
    const call = (): string =>
      renderCliReferenceFrom([
        moduleOf({ args: [{ name: "target", description: "", required: true }] }),
      ]);
    expect(call).toThrowError(/`target`/);
  });

  it("refuses two modules registering the same name", () => {
    const call = (): string => renderCliReferenceFrom([moduleOf(), moduleOf()]);
    expect(call).toThrowError(/`probe`/);
  });

  it("classifies every refusal as VALIDATION_ERROR", () => {
    try {
      renderCliReferenceFrom([]);
      expect.unreachable("empty command set must refuse");
    } catch (err) {
      expect((err as EngineError).code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("markdown escaping", () => {
  it("escapes a pipe in a summary so the index row keeps its columns", () => {
    const page = renderCliReferenceFrom([moduleOf({ summary: "reads a | b alternation" })]);
    const row = tableRows(page)[0] ?? "";
    expect(row).toContain("a \\| b");
    expect(cells(row)).toHaveLength(4);
  });
});

describe("scripts/generate-docs.mjs --page cli", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-p6u03-cli-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  const run = (outDir: string): string => {
    execFileSync(process.execPath, [SCRIPT_PATH, "--page", "cli", "--out-dir", outDir], {
      encoding: "utf-8",
    });
    return readFileSync(join(outDir, CLI_REFERENCE_DOC_PATH), "utf-8");
  };

  it("writes the rendered page, and a second run produces zero diff", () => {
    const first = run(workspace);
    expect(first).toBe(renderCliReference());
    expect(run(workspace)).toBe(first);
  });

  it("rejects an unknown page name with the usage exit code", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--page", "bogus"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown page: bogus");
  });

  it("rejects an unknown argument with the usage exit code", () => {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, "--nope"], { encoding: "utf-8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--page");
  });
});
