import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMANDS, assertUniqueCommandNames } from "../../src/cli.ts";
import type { CommandModule } from "../../src/cli/kit/program.ts";
import { useCliFixture } from "../support/cliHarness.ts";

/**
 * Full-surface e2e over the REAL entry (`src/cli.ts` in a child process via the
 * U02 harness): the advertised command set, the 0/1/2 exit-code contract on an
 * empty fixture, the single-JSON-document rule, color-flag equivalence, and the
 * update notice's env opt-out dormancy.
 *
 * The in-process block at the top imports the entry directly — safe because
 * its side effects are gated on being the executed script — to pin the
 * enumeration the child-process cases then exercise from the outside.
 */

const packageJson = createRequire(import.meta.url)("../../package.json") as { version: string };

/**
 * The advertised surface, in the SoT help order. `learn` is hidden plumbing.
 *
 * `workspace` joined between `config` and `clean` with the multi-repo verb: the
 * assertions below are unchanged in shape — exact list equality, help order,
 * `learn` last and hidden — and only the enumerated surface moved, because the
 * surface itself grew a command rather than an assertion being loosened.
 */
const ADVERTISED = [
  "init",
  "sync",
  "check",
  "validate",
  "add",
  "config",
  "workspace",
  "clean",
] as const;

/** A minimal CommandModule under the given name, for the uniqueness guard. */
const twin = (name: string): CommandModule => ({
  name,
  summary: "fixture",
  mutating: false,
  run: () => Promise.resolve({ exitCode: 0 }),
});

describe("COMMANDS enumeration (in-process)", () => {
  it("registers exactly 9 uniquely-named commands in help order, learn last and hidden", () => {
    expect(COMMANDS.map((command) => command.name)).toEqual([...ADVERTISED, "learn"]);
    expect(new Set(COMMANDS.map((command) => command.name)).size).toBe(9);
    expect(COMMANDS.filter((command) => command.hidden === true).map((c) => c.name)).toEqual([
      "learn",
    ]);
  });

  it("throws at startup on a duplicate command name", () => {
    expect(() => assertUniqueCommandNames([twin("sync"), twin("sync")])).toThrow(
      'duplicate command registration: "sync"',
    );
    expect(() => assertUniqueCommandNames([twin("a"), twin("b")])).not.toThrow();
  });

  it("sets exit codes without process.exit, so piped streams always flush", () => {
    // The journey test proves it dynamically (complete stdout on a piped run);
    // this pins the source-level discipline the same way U15 pinned wording.
    const entry = readFileSync(fileURLToPath(new URL("../../src/cli.ts", import.meta.url)), "utf8");
    // Comments stripped first: the entry's own docblock NAMES process.exit()
    // while promising never to call it.
    const code = entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).toContain("process.exitCode");
    expect(code).not.toMatch(/process\.exit\(/);
  });
});

describe("advertised surface (child process)", () => {
  const getFixture = useCliFixture();

  it("--help lists exactly the 8 advertised commands and not learn", async () => {
    const result = await getFixture().run(["--help"]);

    expect(result.code).toBe(0);
    const commandsBlock = result.stdout.slice(result.stdout.indexOf("Commands:"));
    const listed = [...commandsBlock.matchAll(/^ {2}(\S+)/gm)].map((match) => match[1]);
    // `help [command]` is commander furniture, not an advertised verb.
    expect(listed).toEqual([...ADVERTISED, "help"]);
    // Line-anchored: validate's summary legitimately contains "learnings".
    expect(result.stdout).not.toMatch(/^ {2}learn\b/m);
  });

  it("--version prints the package version and exits 0", async () => {
    const result = await getFixture().run(["--version"]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("bare invocation is a friendly first touch: help on stdout, exit 0", async () => {
    const result = await getFixture().run([]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: stamity");
    expect(result.stderr).toBe("");
  });

  it("a lone -- terminator leaves no command to run: usage help, exit 2", async () => {
    const result = await getFixture().run(["--"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage: stamity");
  });

  it("exits 2 on an unknown command, pointing at --help", async () => {
    const result = await getFixture().run(["definitely-not-a-command"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command");
    expect(result.stderr).toContain("--help for usage");
  });

  it("exits 2 on an unknown flag of a known command", async () => {
    const result = await getFixture().run(["sync", "--definitely-not-a-flag"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option");
    expect(result.stderr).toContain("run stamity sync --help for usage");
  });

  it.each([...ADVERTISED, "learn"])("%s --help answers with exit 0", async (name) => {
    const result = await getFixture().run([name, "--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Usage: stamity ${name}`);
  });
});

describe("exit-code matrix on an empty fixture", () => {
  const getFixture = useCliFixture();

  /** [label, argv, contracted exit, required stderr fragment (when failing)] */
  const rows: readonly (readonly [string, readonly string[], number, string | null])[] = [
    ["init -y succeeds on a fresh repo", ["init", "-y"], 0, null],
    ["sync refuses uninitialised", ["sync"], 1, "npx @zomarit/stamity init"],
    ["check gates red uninitialised", ["check"], 1, null],
    ["validate passes with nothing user-authored", ["validate"], 0, null],
    ["add without a pack-spec is a usage error", ["add"], 2, "missing required argument"],
    ["add with a spec refuses uninitialised", ["add", "./missing-pack"], 1, "npx @zomarit/stamity init"],
    ["config refuses uninitialised", ["config"], 1, "stamity init"],
    ["clean has nothing to clean", ["clean"], 0, null],
    ["learn without its verb is a usage error", ["learn"], 2, "run stamity learn --help"],
    [
      "learn capture refuses uninitialised",
      ["learn", "capture", "--title", "t", "--summary", "s"],
      1,
      "npx @zomarit/stamity init",
    ],
  ];

  it.each(rows)("%s", async (_label, argv, expected, stderrFragment) => {
    const result = await getFixture().run(argv);

    expect([0, 1, 2]).toContain(result.code);
    expect(result.code).toBe(expected);
    if (stderrFragment !== null) expect(result.stderr).toContain(stderrFragment);
  });
});

describe("--json emits exactly one document on stdout (no-manifest fixture)", () => {
  const getFixture = useCliFixture();

  interface Envelope {
    ok: boolean;
    command: string;
    version: string;
    error?: { code?: unknown };
    doctor?: unknown[];
  }

  /** JSON.parse over the whole stream: a second concatenated document would throw. */
  const parseSingleDoc = (stdout: string): Envelope => JSON.parse(stdout) as Envelope;

  it.each([
    ["sync", ["sync"]],
    ["add", ["add", "./missing-pack"]],
    ["config", ["config"]],
  ] as const)("%s fails as one ok:false document with an error.code string", async (name, argv) => {
    const result = await getFixture().run([...argv, "--json"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc.ok).toBe(false);
    expect(doc.command).toBe(name);
    expect(typeof doc.error?.code).toBe("string");
  });

  it("check fails as one ok:false document carrying its full report", async () => {
    // check answers every question rather than throwing: the ok:false document
    // is the report itself (doctor rows + null drift), not an error envelope.
    const result = await getFixture().run(["check", "--json"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc.ok).toBe(false);
    expect(doc.command).toBe("check");
    expect(Array.isArray(doc.doctor)).toBe(true);
  });

  it("clean reports the already-clean repo as one ok:true document", async () => {
    const result = await getFixture().run(["clean", "--json"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    expect(doc).toMatchObject({ ok: true, command: "clean" });
  });
});

describe("color controls", () => {
  const getFixture = useCliFixture();

  it("NO_COLOR=1 and --no-color produce byte-identical output for check", async () => {
    const fixture = getFixture();

    // Arm A: the harness default env carries NO_COLOR=1. Arm B: NO_COLOR is
    // deleted and the flag does the same job. check is read-only, so both arms
    // observe the identical uninitialised repo.
    const viaEnv = await fixture.run(["check"]);
    const viaFlag = await fixture.run(["check", "--no-color"], {
      env: { NO_COLOR: undefined },
    });

    expect(viaEnv.code).toBe(1);
    expect(viaFlag.code).toBe(1);
    expect(viaFlag.stdout).toBe(viaEnv.stdout);
    expect(viaFlag.stderr).toBe(viaEnv.stderr);
  });
});

describe("update notice (opt-out dormancy)", () => {
  const getFixture = useCliFixture();

  it("stays silent under either opt-out: empty stderr, no cache write", async () => {
    const fixture = getFixture();
    const stamp = join(fixture.home.cacheDir, "stamity", "update-check.json");

    // TEST CHANGE, justified: this case used to reach silence through the
    // package.json `private: true` short-circuit. The manifest is publishable,
    // so that step is now reachable only by a fork, a vendored copy, or a failed
    // self-read — all three covered through the injected seam in
    // test/cli/notice/updateNotice.test.ts. The dormant path a publishable build
    // actually owns is the env opt-out, so that is what this pins, one arm per
    // documented switch. Keeping the old premise would not have restored the
    // lost coverage either: it would have made the suite probe the live registry
    // on every run.

    // Arm A: our own switch, which the harness sets by default.
    const ours = await fixture.run(["--version"]);

    expect(ours.code).toBe(0);
    expect(ours.stderr).toBe("");
    expect(existsSync(stamp)).toBe(false);

    // Arm B: ours deleted, so silence has to come from the ecosystem-wide
    // switch. The harness never carries CI or NO_UPDATE_NOTIFIER, so the
    // override below is the only thing opting this run out.
    const ecosystem = await fixture.run(["--version"], {
      env: { STAMITY_NO_UPDATE_CHECK: undefined, NO_UPDATE_NOTIFIER: "1" },
    });

    expect(ecosystem.code).toBe(0);
    expect(ecosystem.stderr).toBe("");
    // Both opt-outs return ahead of every filesystem touch: still no stamp file.
    expect(existsSync(stamp)).toBe(false);
  });
});
