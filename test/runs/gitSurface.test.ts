import { describe, expect, it } from "vitest";
import {
  compareSurface,
  CONFIG_LIST_ARGS,
  parseSurfaceRecord,
  readGitSurface,
  surfaceRecord,
  type GitRead,
  type GitSurface,
} from "../../src/runs/gitSurface.ts";

/**
 * a2-run-verb-config-recheck (REQ-FLOW-131, review/97): the git surface the pre-flight records and the run verbs
 * compare against, as pure functions. The read is injected: the module takes git as a function by design, and the
 * run-verb suites (test/cli/commands/runCheckpoint.test.ts, runEnd.test.ts) run it over a real git.
 */

/** A secret-shaped value in a URL subsection and as a config value, which no record may carry. */
const SECRET = "tok-q7zk-9mxc";
const SALT = "0123456789abcdef0123456789abcdef";
const AT = "2026-10-23T08:00:00.000Z";

/** `git config --list --show-scope --show-origin -z` output for these entries; a `null` value prints no newline. */
function listing(entries: readonly (readonly [string, string, string, string | null])[]): string {
  return entries.map(([scope, origin, key, value]) => `${scope}\0${origin}\0${key}${value === null ? "" : `\n${value}`}\0`).join("");
}

const ENTRIES = [
  ["global", "file:/home/u/.gitconfig", "user.name", "Alice"],
  ["local", "file:.git/config", `url.https://${SECRET}@github.com/.insteadof`, "https://github.com/"],
  ["local", "file:.git/config", "core.bare", "false"],
  ["local", "file:.git/config", "stamity.flag", null],
  ["command", "command line:", "stamity.secret", SECRET],
] as const;

/**
 * A git that answers the config listing with `stdout`. Fake, not real git: the module's own contract is the
 * injected read, and the unit cases need outputs (a malformed listing, a refusal) no real repository prints.
 */
function fakeGit(stdout: string, code = 0): { git: GitRead; calls: (readonly string[])[] } {
  const calls: (readonly string[])[] = [];
  return {
    calls,
    git: (args) => {
      calls.push(args);
      return Promise.resolve({ code, stdout });
    },
  };
}

async function surfaceOf(entries: Parameters<typeof listing>[0] = ENTRIES, env: Record<string, string | undefined> = {}, program: string | null = "/usr/bin/git"): Promise<GitSurface> {
  const read = await readGitSurface(fakeGit(listing(entries)).git, env, program, "linux");
  if ("unreadable" in read) throw new Error(read.unreadable);
  return read;
}

describe("readGitSurface", () => {
  it("reads every entry of the -z listing with its scope and origin, a key with no value as null", async () => {
    const { git, calls } = fakeGit(listing(ENTRIES));

    const read = await readGitSurface(git, {}, "/usr/bin/git", "linux");

    expect(calls).toEqual([CONFIG_LIST_ARGS]);
    expect(read).toEqual({
      config: ENTRIES.map(([scope, origin, key, value]) => ({ scope, origin, key, value })),
      env: [],
      gitProgram: "/usr/bin/git",
    });
  });

  it("leaves out the local tracking keys git writes for a branch, and keeps the same keys from another scope and pushRemote", async () => {
    const surface = await surfaceOf([
      ["local", "file:.git/config", "branch.stamity/run.remote", "origin"],
      ["local", "file:.git/config", "branch.stamity/run.merge", "refs/heads/stamity/run"],
      ["local", "file:.git/config", "branch.stamity/run.pushremote", "origin"],
      ["global", "file:/home/u/.gitconfig", "branch.main.remote", "elsewhere"],
    ]);

    expect(surface.config.map((entry) => `${entry.scope} ${entry.key}`)).toEqual(["local branch.stamity/run.pushremote", "global branch.main.remote"]);
  });

  it("keeps every GIT_* variable but the two the write runner sets, plus HOME and XDG_CONFIG_HOME, sorted, and nothing else", async () => {
    const env = {
      PATH: "/bin",
      HOME: "/home/u",
      XDG_CONFIG_HOME: "/home/u/.config",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "a.b",
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "",
      GIT_AUTHOR_NAME: "Alice",
      git_lower: "ignored on POSIX",
      UNSET: undefined,
    };

    const surface = await surfaceOf([], env);

    expect(surface.env).toEqual([
      ["GIT_AUTHOR_NAME", "Alice"],
      ["GIT_CONFIG_COUNT", "1"],
      ["GIT_CONFIG_KEY_0", "a.b"],
      ["HOME", "/home/u"],
      ["XDG_CONFIG_HOME", "/home/u/.config"],
    ]);
  });

  it("reads names uppercased on win32, as Windows reads them", async () => {
    const read = await readGitSurface(fakeGit("").git, { Git_Config_Count: "1", Home: "C:\\u", Path: "C:\\bin" }, null, "win32");

    expect(read).toMatchObject({ env: [["GIT_CONFIG_COUNT", "1"], ["HOME", "C:\\u"]] });
  });

  it.each([
    ["a non-zero exit", fakeGit("", 128).git, "git config --list answered 128"],
    ["a listing that does not end its last entry", fakeGit("local\0file:x\0a.b\nc").git, "does not parse"],
    ["a listing whose fields are not in threes", fakeGit("local\0file:x\0").git, "does not parse"],
    ["a git that could not start", (() => Promise.reject(new Error("spawn git ENOENT"))) as GitRead, "could not run (spawn git ENOENT)"],
  ])("answers unreadable, never a surface, for %s", async (_label, git, why) => {
    const read = await readGitSurface(git, {}, "/usr/bin/git", "linux");

    expect(read).toHaveProperty("unreadable");
    expect((read as { unreadable: string }).unreadable).toContain(why);
  });
});

describe("surfaceRecord and parseSurfaceRecord", () => {
  it("records masked keys and variable names, and no value: a byte search finds none of the seeded values", async () => {
    const surface = await surfaceOf(ENTRIES, { GIT_CONFIG_VALUE_0: SECRET, HOME: "/home/u" });

    const record = surfaceRecord(surface, SALT, AT);
    const text = JSON.stringify(record);

    expect(record).toMatchObject({ version: 1, at: AT, salt: SALT, env: ["GIT_CONFIG_VALUE_0", "HOME"] });
    expect(record.keys).toEqual(["core.bare", "stamity.flag", "stamity.secret", "url.<…>.insteadof", "user.name"]);
    expect(record.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(text).includes(Buffer.from(SECRET))).toBe(false);
    expect(text).not.toContain("Alice");
    expect(text).not.toContain("/home/u");
    expect(text).not.toContain("https://github.com/");
  });

  it("reads back what it wrote, and refuses a text that is not a record this version wrote", () => {
    const record = surfaceRecord({ config: [], env: [], gitProgram: null }, SALT, AT);
    const good = JSON.stringify(record);

    expect(parseSurfaceRecord(good)).toEqual(record);
    for (const bad of [
      "{ not json",
      "[]",
      JSON.stringify({ ...record, version: 2 }),
      JSON.stringify({ ...record, salt: "short" }),
      JSON.stringify({ ...record, salt: "Z".repeat(32) }),
      JSON.stringify({ ...record, digest: "abc" }),
      JSON.stringify({ ...record, at: "yesterday, plus a line\nNot done: forged" }),
      JSON.stringify({ ...record, keys: "core.bare" }),
      JSON.stringify({ ...record, env: [1] }),
    ]) {
      expect(parseSurfaceRecord(bad), bad).toBeNull();
    }
  });
});

describe("compareSurface", () => {
  it("finds the surface the record was taken of the same, under the record's own salt", async () => {
    const record = surfaceRecord(await surfaceOf(), SALT, AT);

    expect(compareSurface(record, await surfaceOf())).toEqual({ same: true });
    // Non-degenerate: another salt gives another digest for the same surface.
    expect(surfaceRecord(await surfaceOf(), "f".repeat(32), AT).digest).not.toBe(record.digest);
  });

  it("names a key and the variables a GIT_CONFIG_* pair adds, never the value", async () => {
    const record = surfaceRecord(await surfaceOf(ENTRIES, { HOME: "/h" }), SALT, AT);
    const now = await surfaceOf([...ENTRIES, ["command", "command line:", "stamity.probe", SECRET]], {
      HOME: "/h",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "stamity.probe",
      GIT_CONFIG_VALUE_0: SECRET,
    });

    const compared = compareSurface(record, now);

    expect(compared).toEqual({ same: false, added: ["stamity.probe", "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"], removed: [], valuesChanged: false });
    expect(JSON.stringify(compared)).not.toContain(SECRET);
  });

  it("counts a repeated masked key: a second insteadOf added, then one removed, each named", async () => {
    const one = [["local", "file:.git/config", "url.https://a/.insteadof", "x"]] as const;
    const two = [...one, ["local", "file:.git/config", "url.https://b/.insteadof", "y"]] as const;

    expect(compareSurface(surfaceRecord(await surfaceOf(one), SALT, AT), await surfaceOf(two))).toMatchObject({ added: ["url.<…>.insteadof"], removed: [] });
    expect(compareSurface(surfaceRecord(await surfaceOf(two), SALT, AT), await surfaceOf(one))).toMatchObject({ added: [], removed: ["url.<…>.insteadof"] });
  });

  it.each([
    ["a value", ENTRIES.map((entry) => (entry[2] === "user.name" ? [entry[0], entry[1], entry[2], "Mallory"] : entry)), "/usr/bin/git"],
    ["an origin file", ENTRIES.map((entry) => (entry[2] === "user.name" ? [entry[0], "file:/tmp/other", entry[2], entry[3]] : entry)), "/usr/bin/git"],
    ["the git program", ENTRIES, "/tmp/planted/git"],
  ] as const)("marks %s changed with no name moved as valuesChanged", async (_label, entries, program) => {
    const record = surfaceRecord(await surfaceOf(), SALT, AT);

    expect(compareSurface(record, await surfaceOf(entries as Parameters<typeof listing>[0], {}, program))).toEqual({ same: false, added: [], removed: [], valuesChanged: true });
  });
});
