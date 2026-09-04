import { PassThrough, Writable } from "node:stream";
import { runCli, type CommandIo, type CommandModule } from "../../src/cli/kit/program.ts";
import type { TerminalFacts } from "../../src/cli/kit/terminal.ts";

/**
 * In-process CLI runner for command-unit tests: builds runCli with injected
 * io/env/cwd/tty/stdin and returns { code, stdout, stderr } with zero child
 * processes. The child-process e2e lane (test/support/cliHarness.ts) covers the
 * real-process seams; this lane covers command logic fast and deterministically.
 *
 * Determinism choices: env defaults to {} (the dev machine's NO_COLOR /
 * FORCE_COLOR never leak in), all TTY facts default to false, and stdin is
 * ended right after the seeded lines — a prompt beyond the last line sees EOF
 * and resolves to its default instead of hanging the suite.
 */

export interface InProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runInProcess(
  commands: readonly CommandModule[],
  argv: readonly string[],
  opts?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdinLines?: readonly string[];
    tty?: { stdout?: boolean; stderr?: boolean; stdin?: boolean };
    /**
     * The stdout width, for the surfaces that gate on it (the wordmark refuses
     * to print into a window narrower than itself). Omitted means "unknown",
     * the shape `detectTerminalFacts` produces off a pipe — the fact is absent
     * from the object rather than present and undefined, so a reader's
     * `=== undefined` and its `in` check agree.
     */
    columns?: number;
  },
): Promise<InProcessResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const io: CommandIo = {
    out: (text) => {
      stdoutChunks.push(text);
    },
    err: (text) => {
      stderrChunks.push(text);
    },
  };

  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  if (opts?.tty?.stdin === true) stdin.isTTY = true;
  for (const line of opts?.stdinLines ?? []) stdin.write(`${line}\n`);
  stdin.end();

  // Prompt output shares the stdout transcript, matching production where
  // prompts render to process.stdout.
  const promptOut = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      stdoutChunks.push(String(chunk));
      callback();
    },
  });

  const terminal: TerminalFacts = {
    stdoutIsTTY: opts?.tty?.stdout === true,
    stderrIsTTY: opts?.tty?.stderr === true,
    stdinIsTTY: opts?.tty?.stdin === true,
    ...(opts?.columns === undefined ? {} : { stdoutColumns: opts.columns }),
  };

  const code = await runCli(argv, commands, {
    cwd: opts?.cwd ?? process.cwd(),
    env: opts?.env ?? {},
    io,
    promptIo: { input: stdin, output: promptOut },
    terminal,
  });

  return { code, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}
