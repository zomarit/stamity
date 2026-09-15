import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { CLIENT_RUNNERS, binaryVersion, runClient } from "../../scripts/qa/hook-runs.mjs";

/**
 * W6: `cursor` and `copilot` used to carry a constant, never-probed "not on PATH" reason. This
 * pins the fix at two levels — the declared runner shape (documented binary names, no hardcoded
 * `notRun` string) and `runClient`'s behaviour once a binary is actually found on `PATH`, which is
 * exercised with a throwaway script rather than the real client (neither is expected to be
 * installed on a CI or dev machine, and the point is the PROBE, not the real binary).
 */

const temps: string[] = [];
const originalPath = process.env["PATH"];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = originalPath;
});

/** A directory on `PATH`, for the run's own process only, restored in `afterEach`. */
function pathDirWith(name: string, script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-"));
  temps.push(dir);
  const bin = join(dir, name);
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  process.env["PATH"] = `${dir}:${process.env["PATH"] ?? ""}`;
  return dir;
}

describe("CLIENT_RUNNERS — cursor and copilot are probed, not asserted", () => {
  it("names the documented binary and carries no constant notRun reason", () => {
    expect(CLIENT_RUNNERS.cursor.binary).toBe("cursor-agent");
    expect(CLIENT_RUNNERS.cursor.notRun).toBeUndefined();
    expect(CLIENT_RUNNERS.copilot.binary).toBe("copilot");
    expect(CLIENT_RUNNERS.copilot.notRun).toBeUndefined();
    // codex's measured reason is untouched by this fix.
    expect(CLIENT_RUNNERS.codex.binary).toBeNull();
    expect(typeof CLIENT_RUNNERS.codex.notRun).toBe("string");
  });
});

describe("binaryVersion", () => {
  it("reports absent for a binary that is not on PATH", () => {
    const probe = binaryVersion("stamity-qa-hookruns-nonexistent-binary");
    expect(probe.present).toBe(false);
    expect(probe.reason).toContain("stamity-qa-hookruns-nonexistent-binary");
  });

  it("reports present with the probed version for a binary that is on PATH", () => {
    pathDirWith("stamity-qa-hookruns-fixture-binary", "#!/bin/sh\necho fixture-1.2.3\n");
    const probe = binaryVersion("stamity-qa-hookruns-fixture-binary");
    expect(probe.present).toBe(true);
    expect(probe.version).toBe("fixture-1.2.3");
  });

  it("reports present with the probed version for a non-zero exit that still prints one", () => {
    // `--version` is not universally a zero-exit flag; a version line on stdout is evidence of
    // presence on its own, exit code or not.
    pathDirWith("stamity-qa-hookruns-nonzero-version", "#!/bin/sh\necho fixture-2.0.0\nexit 3\n");
    const probe = binaryVersion("stamity-qa-hookruns-nonzero-version");
    expect(probe.present).toBe(true);
    expect(probe.version).toBe("fixture-2.0.0");
  });

  // M-d: a binary found on PATH is not the same claim as a binary that answered — a shim that
  // exits non-zero with nothing on stdout used to be reported `present: true, version: ""`, which
  // a caller then printed as "‹binary› " with nothing to show for it.
  it("reports present: false when the probe exits non-zero with nothing on stdout", () => {
    pathDirWith("stamity-qa-hookruns-broken-binary", "#!/bin/sh\nexit 1\n");
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
  // `exit ${probe.status}` render turned into the literal, unhelpful "exit null".
  it("reports 'killed by signal <signal>' rather than 'exit null' when the probe is signal-killed", () => {
    pathDirWith("stamity-qa-hookruns-signal-killed", '#!/bin/sh\nkill -TERM $$\n');
    const probe = binaryVersion("stamity-qa-hookruns-signal-killed");
    expect(probe.present).toBe(false);
    expect(probe.reason).toContain("killed by signal SIGTERM");
    expect(probe.reason).not.toContain("exit null");
  });
});

describe("runClient — a binary probed present with no measured invocation", () => {
  it(
    "stays not-run and names the probed version rather than guessing at flags",
    () => {
      pathDirWith("cursor-agent", "#!/bin/sh\necho fixture-9.9.9\n");
      // Real repoRoot: `createFixture` shells out to this checkout's own `dist/cli.js`, already
      // built by the suite's own setup — the same dependency `test/qa/*` and `scripts/qa/run.mjs`
      // itself carries, not a mock.
      const repoRoot = join(import.meta.dirname, "../..");

      const row = runClient({
        client: "cursor",
        repoRoot,
        fixturesDir: mkdtempSync(join(tmpdir(), "stamity-qa-hookruns-fixtures-")),
      });

      expect(row.status).toBe("not-run");
      expect(row.reason).toContain("fixture-9.9.9");
      expect(row.reason).toContain("no measured non-interactive");
    },
    30_000,
  );
});
