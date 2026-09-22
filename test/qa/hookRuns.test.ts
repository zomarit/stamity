import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { CLIENT_RUNNERS, PROMPT, WINDOWS_PROBE_LIMIT, binaryVersion, exitDescription, runClient, verdictFor } from "../../scripts/qa/hook-runs.mjs";

/**
 * W6: `cursor` and `copilot` used to carry a constant, never-probed "not on PATH" reason. This
 * pins the fix at two levels — the declared runner shape (documented binary names, no hardcoded
 * `notRun` string) and `runClient`'s behaviour once a binary is actually found on `PATH`, which is
 * exercised with a throwaway script rather than the real client (neither is expected to be
 * installed on a CI or dev machine, and the point is the PROBE, not the real binary).
 *
 * 2026-09-20: both clients gained a MEASURED non-interactive invocation, so the shape pinned below
 * is now "binary plus args" rather than "binary with no args". The argless branch of `runClient`
 * survives with a synthetic runner injected through `runners` — see that case's own comment.
 */

const temps: string[] = [];
const originalPath = process.env["PATH"];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = originalPath;
});

const WINDOWS = process.platform === "win32";

/**
 * A directory on `PATH`, for the run's own process only, restored in `afterEach`.
 *
 * Windows fixture note: `binaryVersion` probes with a bare `spawnSync(binary, ['--version'], …)`
 * — no `shell: true`. Node's Windows child-process spawn (libuv's `uv_spawn`) resolves an
 * extension-less command on `PATH` the same way `CreateProcess` does: it walks `PATHEXT`
 * (`.COM`, `.EXE`, `.BAT`, `.CMD`, …) looking for a matching file, which is why an emitted
 * `.cmd` script — not a POSIX shebang script with no extension — is what this probe actually
 * finds there; a shebang-only file has no extension Windows will match and `spawnSync` reports
 * it absent (ENOENT) exactly as CI observed. So on `win32` the fixture is a `.cmd` batch file
 * (`@echo off` / `echo <text>` / `exit /b <code>`), and on every other platform it stays the
 * POSIX `#!/bin/sh` script this suite always wrote.
 */
function pathDirWith(name: string, options: { readonly echo?: string; readonly exitCode?: number }): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-"));
  temps.push(dir);
  const exitCode = options.exitCode ?? 0;
  if (WINDOWS) {
    const bin = join(dir, `${name}.cmd`);
    const lines = ["@echo off"];
    if (options.echo !== undefined) lines.push(`echo ${options.echo}`);
    lines.push(`exit /b ${exitCode}`);
    writeFileSync(bin, `${lines.join("\r\n")}\r\n`);
  } else {
    const bin = join(dir, name);
    const lines = ["#!/bin/sh"];
    if (options.echo !== undefined) lines.push(`echo ${options.echo}`);
    lines.push(`exit ${exitCode}`);
    writeFileSync(bin, `${lines.join("\n")}\n`);
    chmodSync(bin, 0o755);
  }
  process.env["PATH"] = `${dir}${WINDOWS ? ";" : ":"}${process.env["PATH"] ?? ""}`;
  return dir;
}

/**
 * The signal-killed probe (POSIX `kill -TERM $$`) has no Windows equivalent: no POSIX signal
 * reaches a `spawnSync` child there, so this helper stays outside {@link pathDirWith} and is
 * used only by the one `it.skipIf(WINDOWS)` case below.
 */
function posixSignalKillDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-"));
  temps.push(dir);
  const bin = join(dir, name);
  writeFileSync(bin, "#!/bin/sh\nkill -TERM $$\n");
  chmodSync(bin, 0o755);
  process.env["PATH"] = `${dir}:${process.env["PATH"] ?? ""}`;
  return dir;
}

describe("CLIENT_RUNNERS — cursor and copilot drive the invocations that were measured", () => {
  it("names the measured binary and flags, and carries no constant notRun reason", () => {
    // The binary is `agent`, not `cursor-agent`: `agent --version` prints `2026.09.15-d2fe57e`
    // (measured 2026-09-20). `--trust` is not optional — without it the CLI exits 1 on the Workspace
    // Trust prompt and the row would measure the prompt rather than the hook.
    expect(CLIENT_RUNNERS.cursor.binary).toBe("agent");
    expect(CLIENT_RUNNERS.cursor.args).toEqual(["--trust", "-p", PROMPT]);
    expect(CLIENT_RUNNERS.cursor.notRun).toBeUndefined();
    // `copilot --help` on 1.0.85 (read 2026-09-20) lists `-p, --prompt <text>`, `-s, --silent` and
    // `--allow-all-tools`. The grant is what makes the row about the EMISSION: measured 2026-09-20,
    // a headless run without it answers the read with "Permission denied and could not request
    // permission from user" and never consults the hook, so the row would read `failed` as though the
    // wiring were wrong. The hook still decides what happens to the call it is handed.
    //
    // TEST CHANGE, justified (2026-09-22, prove/209): `-s` LEFT the args. It prints the model's
    // answer alone, so the transcript never showed a tool call and `verdictFor`'s third arm read an
    // unfired hook as `not-run` — the row could never say `failed` for this client. Measured on
    // 1.0.86: without `-s` each tool call is a `● Read <file>` line on stdout and the stats go to
    // stderr, which is the visible tool call the verdict needs.
    expect(CLIENT_RUNNERS.copilot.binary).toBe("copilot");
    expect(CLIENT_RUNNERS.copilot.args).toEqual(["-p", PROMPT, "--allow-all-tools"]);
    expect(CLIENT_RUNNERS.copilot.args, "-s hides the tool calls the verdict reads").not.toContain("-s");
    // prove/257: the flag auto-approves tools and does not trust the folder, and only folder trust
    // loads `.github/hooks/*.json` — `copilot help environment` (1.0.87): COPILOT_ALLOW_ALL set to
    // exactly "true" trusts the working directory and loads its hooks. Exactly "true", for this
    // client only; the runner's env rides on top of the inherited process env.
    expect(CLIENT_RUNNERS.copilot.env).toEqual({ COPILOT_ALLOW_ALL: "true" });
    expect(CLIENT_RUNNERS.claude.env).toBeUndefined();
    expect(CLIENT_RUNNERS.cursor.env).toBeUndefined();
    expect(CLIENT_RUNNERS.copilot.notRun).toBeUndefined();
    // codex's measured reason is untouched: `exec` on 0.154.0 loads no project hook layer at all.
    expect(CLIENT_RUNNERS.codex.binary).toBeNull();
    expect(typeof CLIENT_RUNNERS.codex.notRun).toBe("string");
    // Every runner that drives states its own prompt, so a difference between two rows is the
    // client and not the ask.
    for (const client of ["claude", "cursor", "copilot"] as const) {
      expect(CLIENT_RUNNERS[client].args, client).toContain(PROMPT);
    }
  });
});

describe("binaryVersion", () => {
  it("reports absent for a binary that is not on PATH", () => {
    const probe = binaryVersion("stamity-qa-hookruns-nonexistent-binary");
    expect(probe.present).toBe(false);
    expect(probe.reason).toContain("stamity-qa-hookruns-nonexistent-binary");
  });

  it.skipIf(WINDOWS)("reports present with the probed version for a binary that is on PATH", () => {
    pathDirWith("stamity-qa-hookruns-fixture-binary", { echo: "fixture-1.2.3" });
    const probe = binaryVersion("stamity-qa-hookruns-fixture-binary");
    expect(probe.present).toBe(true);
    expect(probe.version).toBe("fixture-1.2.3");
  });

  it.skipIf(WINDOWS)("reports present with the probed version for a non-zero exit that still prints one", () => {
    // `--version` is not universally a zero-exit flag; a version line on stdout is evidence of
    // presence on its own, exit code or not.
    pathDirWith("stamity-qa-hookruns-nonzero-version", { echo: "fixture-2.0.0", exitCode: 3 });
    const probe = binaryVersion("stamity-qa-hookruns-nonzero-version");
    expect(probe.present).toBe(true);
    expect(probe.version).toBe("fixture-2.0.0");
  });

  // M-d: a binary found on PATH is not the same claim as a binary that answered — a shim that
  // exits non-zero with nothing on stdout used to be reported `present: true, version: ""`, which
  // a caller then printed as "‹binary› " with nothing to show for it.
  it.skipIf(WINDOWS)("reports present: false when the probe exits non-zero with nothing on stdout", () => {
    pathDirWith("stamity-qa-hookruns-broken-binary", { exitCode: 1 });
    const probe = binaryVersion("stamity-qa-hookruns-broken-binary");
    expect(probe.present).toBe(false);
    expect(probe.reason).toContain("stamity-qa-hookruns-broken-binary");
    expect(probe.reason).toContain("present but its version probe failed (exit 1)");
  });

  // N-4: the ENOENT reason used to be `runClient`'s raw `spawnSync` error message verbatim
  // (`cursor-agent: spawnSync cursor-agent ENOENT`), which reads as an internal error rather than
  // the plain-language framing every other absent-binary reason carries.
  it("frames an absent binary's reason as 'not on PATH', not the raw spawnSync error", () => {
    const probe = binaryVersion("stamity-qa-hookruns-nonexistent-binary");
    expect(probe.present).toBe(false);
    expect(probe.reason).toContain("stamity-qa-hookruns-nonexistent-binary: not on PATH (");
    // The underlying error message survives too — this is a framing fix, not an information loss.
    expect(probe.reason).toContain("ENOENT");
  });

  // N-5: a probe killed by a signal leaves `spawnSync`'s `status` null, which the old
  // `exit ${probe.status}` render turned into the literal, unhelpful "exit null". No Windows
  // equivalent exists — no POSIX signal reaches a `spawnSync` child there — so this case is
  // POSIX-only; `exitDescription`'s pure unit test below covers the render itself on every
  // platform, including this signal-killed shape.
  it.skipIf(WINDOWS)(
    "reports 'killed by signal <signal>' rather than 'exit null' when the probe is signal-killed",
    () => {
      posixSignalKillDir("stamity-qa-hookruns-signal-killed");
      const probe = binaryVersion("stamity-qa-hookruns-signal-killed");
      expect(probe.present).toBe(false);
      expect(probe.reason).toContain("killed by signal SIGTERM");
      expect(probe.reason).not.toContain("exit null");
    },
  );
});

describe("runClient — a binary probed present with no measured invocation", () => {
  it.skipIf(WINDOWS)(
    "stays not-run and names the probed version rather than guessing at flags",
    () => {
      // The branch this case covers has no entry left in CLIENT_RUNNERS: cursor and copilot both
      // gained measured `args` on 2026-09-20. It is still the rule the module states — a present
      // binary with no measured invocation is `not-run`, never a run against invented flags — so the
      // subject is a SYNTHETIC runner injected through `runners`. Keeping a real client's entry
      // argless to serve a test would have been the other way, and would have cost a real row.
      pathDirWith("stamity-qa-hookruns-argless", { echo: "fixture-9.9.9" });
      // Real repoRoot: `createFixture` shells out to this checkout's own `dist/cli.js`, already
      // built by the suite's own setup — the same dependency `test/qa/*` and `scripts/qa/run.mjs`
      // itself carries, not a mock.
      const repoRoot = join(import.meta.dirname, "../..");

      const row = runClient({
        client: "cursor",
        repoRoot,
        fixturesDir: mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-fixtures-")),
        runners: { cursor: { binary: "stamity-qa-hookruns-argless" } },
      });

      expect(row.status).toBe("not-run");
      expect(row.reason).toContain("fixture-9.9.9");
      expect(row.reason).toContain("no measured non-interactive");
    },
    30_000,
  );
});

describe("binaryVersion on Windows — a shell-less spawn cannot resolve an npm .cmd shim", () => {
  // The four cases above execute a fixture from PATH, which a Windows `spawnSync` without a shell
  // cannot do for anything but `.exe`/`.com` — the same reason the real client shims npm installs
  // there (`claude.cmd`, `codex.cmd`, …) are invisible to the probe. That is a limitation of the
  // hook lane, stated in the evidence rather than read as "the client is absent"; this case pins
  // the statement, on the platform where it applies and through the injectable platform elsewhere.
  it.runIf(WINDOWS)("names the limitation beside the ENOENT when only a .cmd shim is on PATH", () => {
    pathDirWith("stamity-qa-hookruns-shim", { echo: "fixture-9.9.9" });
    const result = binaryVersion("stamity-qa-hookruns-shim");
    expect(result.present).toBe(false);
    expect(result.reason).toContain("not on PATH (");
    expect(result.reason).toContain(WINDOWS_PROBE_LIMIT);
  });
  it("names the limitation only for win32", () => {
    const missing = "stamity-qa-hookruns-absent-binary";
    expect(binaryVersion(missing, { platform: "win32" }).reason).toContain(WINDOWS_PROBE_LIMIT);
    expect(binaryVersion(missing, { platform: "linux" }).reason).not.toContain(WINDOWS_PROBE_LIMIT);
  });
});

/**
 * An empty observation log is TWO findings, and calling both of them `failed` blamed this engine for
 * the client's behaviour. A client that called a tool and left no observation behind did not run the
 * wired hook; a client whose own permission layer refused first, or that answered without calling a
 * tool at all, measured nothing about the hook.
 */
describe("verdictFor — what an empty observation log means", () => {
  const denied = { decision: "denied" };
  const allowed = { decision: "allowed" };

  it("passes only on both halves, and names the counts", () => {
    const verdict = verdictFor([denied, allowed]) as { status: string; reason: string };
    expect(verdict.status).toBe("passed");
    expect(verdict.reason).toContain("1 denied");
    expect(verdict.reason).toContain("1 allowed");
  });

  it("fails on the allowed half alone", () => {
    expect((verdictFor([allowed, allowed]) as { status: string }).status).toBe("failed");
  });

  // prove/272: measured 2026-09-22 on GitHub Copilot CLI 1.0.87 under folder trust — the hook
  // fired (two calls recorded), the client re-tried the denied file and never asked for the allowed
  // one, and the denied-only log read as `failed`, which said the hook misbehaved when the client
  // simply never made the second read. The three arms, with the passed arm NOT loosened.
  it("is not-run on denials with no attempt at the allowed file, stating the enforcement half", () => {
    const verdict = verdictFor([
      { decision: "denied", mentionsDenied: true, mentionsAllowed: false },
      { decision: "denied", mentionsDenied: true, mentionsAllowed: false },
    ]) as { status: string; reason: string };
    expect(verdict.status).toBe("not-run");
    expect(verdict.reason).toContain("the client never attempted the allowed read after the denial");
    expect(verdict.reason).toContain("2 denied");
  });

  it("fails when the allowed file was attempted and the hook denied it", () => {
    const verdict = verdictFor([
      { decision: "denied", mentionsDenied: true, mentionsAllowed: false },
      { decision: "denied", mentionsDenied: true, mentionsAllowed: true },
    ]) as { status: string; reason: string };
    expect(verdict.status).toBe("failed");
    expect(verdict.reason).toContain("denied an attempt at qa-allowed.txt");
  });

  it("still needs both halves to pass — a denial beside an allowance, nothing less", () => {
    expect((verdictFor([denied, allowed]) as { status: string }).status).toBe("passed");
    expect((verdictFor([denied]) as { status: string }).status).toBe("not-run");
  });

  it("fails on no observation when the transcript shows a tool call was attempted", () => {
    const verdict = verdictFor([], { transcript: '{"type":"tool_use","name":"Read"}' }) as {
      status: string;
      reason: string;
    };
    expect(verdict.status).toBe("failed");
    expect(verdict.reason).toContain("a tool call was attempted");
  });

  it("fails on a tool call whose RESULT carried EACCES, rather than reading it as a refusal", () => {
    // The order is the fix: `permission denied` in a tool result is what the filesystem said about a
    // call the client DID make, and a call with no observation beside it is the failure this row
    // exists to catch. Reading it as a skip would hide exactly that.
    const verdict = verdictFor([], {
      transcript:
        '{"type":"tool_use","name":"Read","input":{"file_path":"qa-denied.txt"}}\n' +
        "Error: EACCES: permission denied, open 'qa-denied.txt'\n",
    }) as { status: string; reason: string };
    expect(verdict.status).toBe("failed");
    expect(verdict.reason).toContain("a tool call was attempted");
  });

  it("fails on no observation when the transcript is Copilot's text render of a tool call", () => {
    // The Copilot CLI's text mode (no `-s`) prints one `● <Tool> <argument>` line per tool call, with
    // the result indented under it — the exact bytes measured 2026-09-22 on 1.0.86 with this
    // module's prompt in a scratch cwd. Two reads and no observation is the unfired hook this row
    // exists to catch; before the sign was read, the same transcript was `not-run`.
    const verdict = verdictFor([], {
      transcript:
        "● Read qa-denied.txt\n  └ 1 line read\n\n● Read qa-allowed.txt\n  └ 1 line read\n\n" +
        "I could read:\n\n- `qa-denied.txt`: `denied contents`\n- `qa-allowed.txt`: `allowed contents`\n",
    }) as { status: string; reason: string };
    expect(verdict.status).toBe("failed");
    expect(verdict.reason).toContain("a tool call was attempted");
    // The bullet counts only at a line start: a model's answer that mentions one mid-line is prose.
    expect((verdictFor([], { transcript: "the marker ● Read is what the client prints" }) as { status: string }).status).toBe("not-run");
  });

  it("is not-run when the client's own permission layer refused before the hook was consulted", () => {
    const verdict = verdictFor([], {
      transcript: "Permission denied and could not request permission from user",
    }) as { status: string; reason: string };
    expect(verdict.status).toBe("not-run");
    expect(verdict.reason).toContain("its own permission layer answered before the hook");
  });

  it("is not-run when the transcript shows no tool call at all", () => {
    const verdict = verdictFor([], { transcript: "I could read both files." }) as {
      status: string;
      reason: string;
    };
    expect(verdict.status).toBe("not-run");
    expect(verdict.reason).toContain("attempted no tool call");
  });

  it("keeps the stricter reading for a caller that passes no transcript", () => {
    // A caller with no transcript cannot tell the two apart, and `failed` is the answer that gets
    // looked at.
    expect((verdictFor([]) as { status: string }).status).toBe("failed");
  });
});

describe("exitDescription — the one renderer of a process exit in the evidence", () => {
  // The client-row reason in run.mjs used to inline `exit ${exitCode}`, which rendered the literal
  // "exit null" for a signal-killed or timed-out client — the shape N-5 removed from the probe
  // reason. Both reasons now go through this helper, so the null shape has one owner.
  it("renders a signal, a status and the residual case distinctly", () => {
    expect(exitDescription({ status: null, signal: "SIGTERM" })).toBe("killed by signal SIGTERM");
    expect(exitDescription({ status: 0, signal: null })).toBe("exit 0");
    expect(exitDescription({ status: null, signal: null })).toBe("exit unknown");
    expect(exitDescription({})).toBe("exit unknown");
  });
});
