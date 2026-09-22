import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- see the directive above
import { bundledRuntime, inputsFor, lifecycleInputs, lifecycleRow, notRunReason, rowFor, runLifecycleWalk, runPluginClients, runtimeMissing, vitestEntry } from "../../scripts/qa/plugin-runs.mjs";

/**
 * The QA lane that turns the route smoke's four legs into one row per client
 * (`scripts/qa/plugin-runs.mjs`).
 *
 * Seven cases in three groups. Six are pure folds over a report this suite composes, which is the
 * only way to drive the interesting shapes: a `failed` leg beside a `SKIPPED` one, a client whose
 * legs are missing entirely, a label set that belongs to another client. The seventh drives
 * `runPluginClients` for real, against a `--dist` that is not a distribution root — the smoke then
 * exits 2 without touching a client, and what is under test is the ROW that failure produces:
 * `not-run`, never a pass, and carrying no absolute path.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const HOME = homedir();
/** Stands for the callers' `process.execPath -> <node>` pair in the lifecycle cases (prove/214). */
const redactNode = (text: string): string => text.replaceAll(process.execPath, "<node>");

interface Leg {
  leg: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason: string;
  command: string | null;
  exitCode: number | null;
  binaryVersion: string | null;
  transcriptSha256: string | null;
}

interface Row {
  client: string;
  status: string;
  reason: string;
  inputs?: { path: string; sha256: string }[];
}

function leg(name: string, status: Leg["status"], overrides: Partial<Leg> = {}): Leg {
  return {
    leg: name,
    status,
    reason: `${name} said so`,
    command: null,
    exitCode: null,
    binaryVersion: null,
    transcriptSha256: null,
    ...overrides,
  };
}

/** The four legs, all passing — the shape every case below perturbs by exactly one leg. */
function allPassing(): Leg[] {
  return [
    leg("structure", "PASS"),
    leg("install", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "a".repeat(64) }),
    leg("discovery", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "b".repeat(64) }),
    leg("invocation", "PASS", { binaryVersion: "2.1.278", exitCode: 0, transcriptSha256: "c".repeat(64) }),
  ];
}

describe("rowFor — the row's status is its weakest leg", () => {
  it("is passed only when every leg passed, and carries all four leg lines with their hashes", () => {
    const row = rowFor("claude", { legs: allPassing() }) as Row;

    expect(row.status).toBe("passed");
    for (const name of ["structure", "install", "discovery", "invocation"]) {
      expect(row.reason, name).toContain(`${name} PASS`);
    }
    // The hashes are what a run record cites; a reason carrying only the verdict sends the next
    // reader back to a transcript nobody kept.
    expect(row.reason).toContain(`transcript sha256 ${"a".repeat(64)}`);
    expect(row.reason).toContain(`transcript sha256 ${"c".repeat(64)}`);
    expect(row.reason).toContain("[2.1.278]");
  });

  it("is not-run when any leg was SKIPPED, however many passed beside it", () => {
    const legs = allPassing();
    legs[3] = leg("invocation", "SKIPPED", { reason: "needs --invoke" });

    const row = rowFor("codex", { legs }) as Row;

    expect(row.status).toBe("not-run");
    expect(row.reason).toContain("invocation SKIPPED: needs --invoke");
    // Non-degenerate: three legs really did pass, and the row still refuses to round up.
    expect(row.reason).toContain("structure PASS");
    expect(row.reason).toContain("install PASS");
  });

  it("is failed when any leg FAILED, and a failure outranks a skip", () => {
    const legs = allPassing();
    legs[1] = leg("install", "FAIL", { reason: "nothing was deployed" });
    legs[2] = leg("discovery", "SKIPPED", { reason: "the install leg failed" });

    const row = rowFor("copilot", { legs }) as Row;

    expect(row.status).toBe("failed");
    expect(row.reason).toContain("install FAIL: nothing was deployed");
    expect(row.reason).toContain("discovery SKIPPED");
  });

  it("reports a client the smoke wrote no leg for instead of inventing one", () => {
    expect((rowFor("cursor", undefined) as Row).status).toBe("not-run");
    expect((rowFor("cursor", { legs: [] }) as Row).reason).toContain("wrote no leg for this client");
  });
});

describe("inputsFor — logical labels, this client's and the shared ones", () => {
  const sha256s: Record<string, string> = {
    "scripts/plugin-route-smoke.mjs": "1".repeat(64),
    "dist/claude/stamity-plugin.json": "2".repeat(64),
    "dist/claude/hooks/hooks.json": "3".repeat(64),
    "dist/codex/stamity-plugin.json": "4".repeat(64),
  };

  it("takes this client's root files and the shared instrument, and no other client's", () => {
    const inputs = inputsFor("claude", sha256s) as { path: string; sha256: string }[];

    expect(inputs.map((input) => input.path)).toEqual([
      "dist/claude/hooks/hooks.json",
      "dist/claude/stamity-plugin.json",
      "scripts/plugin-route-smoke.mjs",
    ]);
    // Sorted, so two runs that enumerated the report differently produce one row hash.
    expect(inputs.map((input) => input.sha256)).toEqual(["3".repeat(64), "2".repeat(64), "1".repeat(64)]);
  });

  it("never carries a path that would name the checkout the distribution was built in", () => {
    for (const input of inputsFor("codex", sha256s) as { path: string }[]) {
      expect(input.path, input.path).not.toMatch(/^[/\\]|^[A-Za-z]:[/\\]/);
    }
  });
});

describe("runPluginClients — the smoke could not run", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes one not-run row per client, redacted, when no --json document was produced", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stamity-qa-plugin-runs-case-"));
    temps.push(dir);

    // A directory with no `release.json` is not a distribution root, so the smoke exits 2 before it
    // reaches a client, a credential or a model call.
    const rows = (await runPluginClients({
      clients: ["claude", "codex"],
      repoRoot: REPO_ROOT,
      distDir: dir,
    })) as Row[];

    expect(rows.map((row) => row.client)).toEqual(["claude", "codex"]);
    for (const row of rows) {
      expect(row.status, row.reason).toBe("not-run");
      expect(row.reason).toContain("wrote no --json document");
      expect(row.reason).toContain("exit 2");
      // The smoke's own words, and the reason it could not run — with nothing in them that names
      // this checkout, this operator's home, or the directory that was passed.
      expect(row.reason).toContain("carries no release.json");
      expect(row.reason, row.reason).not.toContain(HOME);
      expect(row.reason, row.reason).not.toContain(REPO_ROOT);
      expect(row.reason, row.reason).not.toContain(dir);
      expect(row.reason, row.reason).not.toMatch(/\/Users\/|\/home\/[a-z]/);
    }
  }, 60_000);
});

/** Temp directories the lifecycle cases below make; removed whichever way a case ends. */
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * The upgrade-and-rollback lane (`H5`), whose measurement is `test/ci/pluginLifecycle.test.ts`
 * spawned. What is under test HERE is the fold and the resolution around that spawn, driven against
 * logs and directories this suite writes — the only way to reach the shapes that matter, because a
 * real walk takes three minutes, needs four client binaries, and produces exactly one of them.
 *
 * The walk itself is not re-proven here. It proves itself, with assertions this fold never sees.
 */

/** One row line in the suite's own log format. */
const line = (client: string, step: string, verdict: string, reason: string): string =>
  `plugin-lifecycle: ${client} ${step} ${verdict} (${reason})`;

/** A log for four clients whose every walk passed, with a step line each so the fold has to select. */
function greenLog(): string {
  return [
    "plugin-lifecycle-runtime: reused from the distribution — @zomarit/stamity@1.8.0 (node >=22.22.2, tarball sha256 " + "a".repeat(64) + ")",
    ...["claude", "copilot", "codex", "cursor"].flatMap((client) => [
      line(client, "install", "PASS", "at 1.9.0-fixture.1"),
      line(client, "walk", "PASS", "the route walked"),
    ]),
  ].join("\n");
}

const CLIENTS = ["claude", "copilot", "codex", "cursor"];

describe("notRunReason — the exit description is redacted like the detail beside it", () => {
  // prove/214: `runSmoke` composes its spawn failure from Node's own message, which names
  // `process.execPath` in full, and that string used to reach the row reason unredacted while the
  // detail beside it had been scrubbed. A real spawn failure cannot be produced on demand — the
  // harness spawns the interpreter it runs under — so the composed result is handed in.
  it("replaces the interpreter's path in a spawn failure, and the home, dist and repo everywhere", () => {
    const dist = join(HOME, "some-build", "dist");
    const reason = notRunReason(
      { stdout: "", stderr: `could not read ${dist}/release.json`, exit: `the smoke could not be spawned: spawn ${process.execPath} ENOENT` },
      { distDir: dist, scratchDir: undefined, repoRoot: REPO_ROOT },
    ) as string;
    expect(reason).toContain("wrote no --json document (the smoke could not be spawned: spawn <node> ENOENT)");
    expect(reason).toContain("could not read dist/release.json");
    expect(reason).not.toContain(process.execPath);
    expect(reason).not.toContain(HOME);
    expect(reason).not.toContain(REPO_ROOT);
    expect(reason).not.toMatch(/\/Users\/|\/home\/[a-z]/);
  });
});

describe("lifecycleRow — the fold over the walk's own log", () => {
  it("puts the exit description through the redactor, in both reasons that quote it", () => {
    // prove/214, the lifecycle half: the same spawn-failure string reaches `wrote no row` and
    // `the suite ended`, and the caller's pairs carry `process.execPath`; the fold is handed a
    // redactor that stands for them.
    const exit = `the lifecycle suite could not be spawned: spawn ${process.execPath} ENOENT`;
    const empty = lifecycleRow({ clients: ["claude"], log: "", status: null, exit, redact: redactNode }) as Row;
    expect(empty.reason).toBe("the lifecycle suite wrote no row (the lifecycle suite could not be spawned: spawn <node> ENOENT)");
    const red = lifecycleRow({ clients: ["claude"], log: "plugin-lifecycle: claude walk PASS (ok)\n", status: null, exit, redact: redactNode }) as Row;
    expect(red.status).toBe("failed");
    expect(red.reason).toContain("the suite ended: the lifecycle suite could not be spawned: spawn <node> ENOENT");
    expect(red.reason).not.toContain(process.execPath);
  });

  it("passes when every client's walk line passed and the suite exited 0", () => {
    const row = lifecycleRow({ clients: CLIENTS, log: greenLog(), status: 0, exit: "exit 0" }) as {
      status: string;
      reason: string;
    };
    expect(row.status).toBe("passed");
    // Every row line and the runtime line ride in the reason, which is what a run record cites.
    expect(row.reason).toContain("plugin-lifecycle: cursor walk PASS");
    expect(row.reason).toContain("plugin-lifecycle-runtime: reused from the distribution");
    expect(row.reason).toContain("@zomarit/stamity@1.8.0");
  });

  it("is not-run when one client's walk was skipped, and names that client's reason first", () => {
    const log = greenLog().replace(
      line("codex", "walk", "PASS", "the route walked"),
      line("codex", "walk", "SKIPPED", "rate limited: try again at 10:16 PM"),
    );
    const row = lifecycleRow({ clients: CLIENTS, log, status: 0, exit: "exit 0" }) as { status: string; reason: string };
    // NEVER rounded up to a pass: a client whose walk stopped is a client nothing was measured on.
    expect(row.status).toBe("not-run");
    expect(row.reason.startsWith("codex: rate limited: try again at 10:16 PM")).toBe(true);
  });

  it("fails when a client's walk line failed, naming the client before the log", () => {
    const log = greenLog().replace(
      line("copilot", "walk", "PASS", "the route walked"),
      line("copilot", "walk", "FAIL", "the .1 map did not come back"),
    );
    const row = lifecycleRow({ clients: CLIENTS, log, status: 1, exit: "exit 1" }) as { status: string; reason: string };
    expect(row.status).toBe("failed");
    expect(row.reason.startsWith("walk FAIL for copilot")).toBe(true);
  });

  it("fails on a red suite even when every walk line passed", () => {
    // The assertions are the measurement, and they live in the suite: a green log under a red exit
    // means something the log does not carry went wrong, and the row must not read as a pass.
    const row = lifecycleRow({ clients: CLIENTS, log: greenLog(), status: 1, exit: "exit 1" }) as {
      status: string;
      reason: string;
    };
    expect(row.status).toBe("failed");
    expect(row.reason).toContain("the suite ended: exit 1");
  });

  it("fails when the suite was killed, quoting how it ended", () => {
    const row = lifecycleRow({
      clients: CLIENTS,
      log: greenLog(),
      status: null,
      exit: "killed by signal SIGTERM (SIGTERM after the harness ceiling)",
    }) as { status: string; reason: string };
    expect(row.status).toBe("failed");
    expect(row.reason).toContain("killed by signal SIGTERM");
  });

  it("is not-run when a client has no walk line at all", () => {
    // A failure to MEASURE, not a measured failure: the suite never reached that client's closing
    // row, so there is nothing to pass or fail on.
    const log = greenLog()
      .split("\n")
      .filter((entry) => !entry.startsWith("plugin-lifecycle: cursor walk"))
      .join("\n");
    const row = lifecycleRow({ clients: CLIENTS, log, status: 0, exit: "exit 0" }) as { status: string; reason: string };
    expect(row.status).toBe("not-run");
    expect(row.reason.startsWith("no walk row for cursor")).toBe(true);
  });

  it("is not-run when the log carries no row at all", () => {
    const row = lifecycleRow({ clients: CLIENTS, log: "nothing here\n", status: 0, exit: "exit 0" }) as {
      status: string;
      reason: string;
    };
    expect(row.status).toBe("not-run");
    expect(row.reason).toContain("wrote no row (exit 0)");
  });

  it("leads a passing reason with a FAIL recorded on a step line", () => {
    // The regression this case exists for: `claude rollback-documented` shipped as a deliberate FAIL
    // inside an H5 row that read `passed`, forty lines from the front of the reason. The fold keys on
    // the `walk` line by design — a step FAIL must not flip the row — but it must not hide one either.
    const log = greenLog().replace(
      line("claude", "install", "PASS", "at 1.9.0-fixture.1"),
      line("claude", "a-documented-route", "FAIL", "the page's route does not do what it says"),
    );
    const row = lifecycleRow({ clients: CLIENTS, log, status: 0, exit: "exit 0" }) as { status: string; reason: string };
    expect(row.status).toBe("passed");
    expect(row.reason.startsWith("FAIL lines recorded by a passing walk — claude a-documented-route:")).toBe(true);
  });

  it("puts the reason through the redactor it is given", () => {
    const row = lifecycleRow({
      clients: CLIENTS,
      log: greenLog(),
      status: 0,
      exit: "exit 0",
      redact: (text: string) => text.replaceAll("1.9.0-fixture.1", "<version>"),
    }) as { reason: string };
    // A row reason lands in a committed evidence file, so the caller's sweep has to reach all of it.
    expect(row.reason).not.toContain("1.9.0-fixture.1");
    expect(row.reason).toContain("<version>");
  });
});

describe("lifecycleInputs — the bytes the row is bound to", () => {
  it("selects the input lines, sorted by label, and ignores everything else", () => {
    const log = [
      `plugin-lifecycle-input: fixture/1.9.0-fixture.2/release.json ${"b".repeat(64)}`,
      `plugin-lifecycle-input: scripts/plugin-lifecycle-fixture.mjs ${"a".repeat(64)}`,
      "plugin-lifecycle: claude walk PASS (x)",
      "plugin-lifecycle-input: not-a-digest zz",
    ].join("\n");
    // Sorted by LABEL, not by the order the suite happened to emit them: an input list is part of a
    // row hash, and a hash that moved because two lines swapped would reopen a signature for nothing.
    expect(lifecycleInputs(log)).toEqual([
      { path: "fixture/1.9.0-fixture.2/release.json", sha256: "b".repeat(64) },
      { path: "scripts/plugin-lifecycle-fixture.mjs", sha256: "a".repeat(64) },
    ]);
  });

  it("is empty for a log with no input line, so the caller falls back to its instruments", () => {
    expect(lifecycleInputs(greenLog())).toEqual([]);
  });
});

describe("runtimeMissing and bundledRuntime — what counts as a runtime", () => {
  /** A runtime directory carrying whichever of the three required files is asked for. */
  function runtimeDir(files: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), "stamity-qa-runtime-"));
    temps.push(dir);
    for (const file of files) {
      const target = join(dir, ...file.split("/"));
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, "{}\n");
    }
    return dir;
  }

  it("names nothing missing for a complete runtime", () => {
    expect(runtimeMissing(runtimeDir(["package.json", "RUNTIME.json", "dist/cli.js"]))).toEqual([]);
  });

  it("names the one file that is absent", () => {
    // The shape the lane refuses on: a directory that looks like a runtime until the builder opens it.
    expect(runtimeMissing(runtimeDir(["package.json", "dist/cli.js"]))).toEqual(["RUNTIME.json"]);
  });

  it("names every file that is absent for a directory that is not one at all", () => {
    expect(runtimeMissing(runtimeDir([])).toSorted()).toEqual(["RUNTIME.json", "package.json", join("dist", "cli.js")].toSorted());
  });

  it("finds a distribution's bundled runtime under the first client that carries a complete one", () => {
    const dist = mkdtempSync(join(tmpdir(), "stamity-qa-dist-"));
    temps.push(dist);
    // claude's copy is INCOMPLETE and codex's is whole: the walk must not be handed the first
    // directory that exists, only the first that is usable.
    for (const [client, files] of [
      ["claude", ["package.json"]],
      ["codex", ["package.json", "RUNTIME.json", "dist/cli.js"]],
    ] as const) {
      for (const file of files) {
        const target = join(dist, client, "runtime", ...file.split("/"));
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, "{}\n");
      }
    }
    expect(bundledRuntime(dist)).toBe(join(dist, "codex", "runtime"));
  });

  it("finds none in a distribution with no runtime, and none with no distribution", () => {
    expect(bundledRuntime(mkdtempSync(join(tmpdir(), "stamity-qa-dist-empty-")))).toBeNull();
    expect(bundledRuntime(undefined)).toBeNull();
  });
});

describe("runLifecycleWalk — what it refuses before it spawns anything", () => {
  it("is not-run when the suite file is absent, naming it", async () => {
    const rootWithoutSuite = mkdtempSync(join(tmpdir(), "stamity-qa-no-suite-"));
    temps.push(rootWithoutSuite);
    const row = (await runLifecycleWalk({ clients: ["claude"], repoRoot: rootWithoutSuite })) as {
      status: string;
      reason: string;
    };
    expect(row.status).toBe("not-run");
    expect(row.reason).toBe("test/ci/pluginLifecycle.test.ts is absent");
  });

  it("is not-run when a client's binary is not on the environment, naming the variable", async () => {
    // Asked BEFORE a thirty-minute spawn: the suite would skip that walk, and this lane would then
    // read its own log to discover what the environment already said.
    //
    // The four variables are CLEARED inside a saved-and-restored block, not read out of the ambient
    // environment. This machine's own lane rules tell an operator to export all four before a
    // harness run, and a gating case that only holds in a shell where they are unset is a case that
    // goes red on the very machine the walk is armed on — which is the opposite of what it is for.
    const saved = { ...process.env };
    try {
      for (const client of ["CLAUDE", "CURSOR", "COPILOT", "CODEX"]) delete process.env[`STAMITY_${client}_BIN`];
      const row = (await runLifecycleWalk({ clients: ["claude", "cursor"], repoRoot: REPO_ROOT })) as {
        status: string;
        reason: string;
      };
      expect(row.status).toBe("not-run");
      expect(row.reason).toContain("STAMITY_CLAUDE_BIN unset");
      expect(row.reason).toContain("STAMITY_CURSOR_BIN unset");
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });

  it("is not-run when an exported runtime is incomplete, naming the file and the variable", async () => {
    // The hole this closes: with no usable runtime in `--dist`, an operator-exported
    // `STAMITY_LIFECYCLE_RUNTIME` used to ride into the child's environment unchecked, and a
    // half-built directory became a refusal inside the suite with no row to explain it.
    const half = mkdtempSync(join(tmpdir(), "stamity-qa-half-runtime-"));
    temps.push(half);
    writeFileSync(join(half, "package.json"), "{}\n");
    const saved = { ...process.env };
    try {
      for (const client of ["CLAUDE", "CURSOR", "COPILOT", "CODEX"]) process.env[`STAMITY_${client}_BIN`] = "/bin/true";
      process.env["STAMITY_LIFECYCLE_RUNTIME"] = half;
      const row = (await runLifecycleWalk({ clients: ["claude"], repoRoot: REPO_ROOT })) as {
        status: string;
        reason: string;
      };
      expect(row.status).toBe("not-run");
      expect(row.reason).toContain("RUNTIME.json");
      expect(row.reason).toContain("STAMITY_LIFECYCLE_RUNTIME");
      // No spawn happened: the refusal is before the suite, which is the point of checking here.
      expect(row.reason).not.toContain("wrote no log");
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });

  it("resolves vitest out of node_modules rather than through npx", () => {
    // `spawn('npx')` with no shell is ENOENT on Windows, so the entry is resolved here instead.
    const entry = vitestEntry(REPO_ROOT) as string | null;
    expect(entry).not.toBeNull();
    expect(entry).toContain(join("node_modules", "vitest"));
    expect(existsSync(entry as string)).toBe(true);
    expect(vitestEntry(mkdtempSync(join(tmpdir(), "stamity-qa-no-vitest-")))).toBeNull();
  });
});
