import { describe, expect, it } from "vitest";
import {
  compareSurface,
  CONFIG_LIST_ARGS,
  parseSurfaceRecord,
  readGitSurface,
  surfaceRecord,
  surfaceRefusal,
  type GitRead,
  type GitSurface,
  type RecordFileReads,
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

  it("leaves out the local rebase key git writes for a tracking branch under branch.autoSetupRebase, and keeps one from another scope (review/35)", async () => {
    const surface = await surfaceOf([
      ["global", "file:/home/u/.gitconfig", "branch.autosetuprebase", "always"],
      ["local", "file:.git/config", "branch.stamity/run.rebase", "true"],
      ["global", "file:/home/u/.gitconfig", "branch.main.rebase", "true"],
    ]);

    expect(surface.config.map((entry) => `${entry.scope} ${entry.key}`)).toEqual(["global branch.autosetuprebase", "global branch.main.rebase"]);
  });

  it("keeps the variables gh reads for its token, host, config folder, path and repository, by name (review/32)", async () => {
    const gh = {
      GH_TOKEN: "t1",
      GITHUB_TOKEN: "t2",
      GH_ENTERPRISE_TOKEN: "t3",
      GITHUB_ENTERPRISE_TOKEN: "t4",
      GH_HOST: "github.com",
      GH_CONFIG_DIR: "/home/u/.gh",
      GH_PATH: "/usr/bin/gh",
      GH_REPO: "o/r",
    };

    const surface = await surfaceOf([], { ...gh, GH_PAGER: "less", GH_DEBUG: "1" });

    expect(surface.env.map(([name]) => name)).toEqual(Object.keys(gh).toSorted());
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

  it("leaves out GIT_NO_REPLACE_OBJECTS, which the write runner sets itself, so it is never read as a change (review/114)", async () => {
    const read = await readGitSurface(fakeGit("").git, { GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1" }, null, "linux");

    expect(read).toMatchObject({ env: [["GIT_CONFIG_COUNT", "1"]] });
    const again = await readGitSurface(fakeGit("").git, { GIT_CONFIG_COUNT: "1" }, null, "linux");
    if ("unreadable" in read || "unreadable" in again) throw new Error("the surface did not read");
    expect(compareSurface(surfaceRecord(again, SALT, AT), read)).toEqual({ same: true });
  });

  it("reads names uppercased on win32, as Windows reads them", async () => {
    const read = await readGitSurface(fakeGit("").git, { Git_Config_Count: "1", Home: "C:\\u", Path: "C:\\bin" }, null, "win32");

    expect(read).toMatchObject({ env: [["GIT_CONFIG_COUNT", "1"], ["HOME", "C:\\u"]] });
  });

  it("keeps on win32 the folders gh and git fall back to, by name, and leaves them out elsewhere (review/51)", async () => {
    const env = { AppData: "C:\\u\\AppData\\Roaming", USERPROFILE: "C:\\u", HOMEDRIVE: "C:", HomePath: "\\u", LOCALAPPDATA: "C:\\u\\AppData\\Local" };

    const windows = await readGitSurface(fakeGit("").git, env, null, "win32");
    const linux = await readGitSurface(fakeGit("").git, env, null, "linux");

    expect((windows as GitSurface).env.map(([name]) => name)).toEqual(["APPDATA", "HOMEDRIVE", "HOMEPATH", "USERPROFILE"]);
    expect((linux as GitSurface).env).toEqual([]);
    const record = surfaceRecord(windows as GitSurface, SALT, AT);
    expect(JSON.stringify(record)).not.toContain("Roaming");
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
      JSON.stringify({ ...record, refused: "yes" }),
      JSON.stringify(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "refused"))),
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

describe("gh's credential variables against the record (review/32)", () => {
  /** A token-shaped value no record may carry, and its replacement. */
  const TOKEN = "ghp-seeded-q7zk-9mxc";
  const OTHER = "ghp-swapped-4hnd-2rtw";

  it("records GH_TOKEN by name alone: a byte search finds no seeded token value", async () => {
    const record = surfaceRecord(await surfaceOf([], { GH_TOKEN: TOKEN, GH_CONFIG_DIR: "/home/u/.config/gh-q7zk" }), SALT, AT);
    const bytes = Buffer.from(JSON.stringify(record));

    expect(record.env).toEqual(["GH_CONFIG_DIR", "GH_TOKEN"]);
    expect(bytes.includes(Buffer.from(TOKEN))).toBe(false);
    expect(bytes.includes(Buffer.from("gh-q7zk"))).toBe(false);
  });

  it.each([
    ["set after the pre-flight", {}, { GH_TOKEN: TOKEN }, { added: ["GH_TOKEN"], removed: [], valuesChanged: false }],
    ["cleared after the pre-flight", { GH_TOKEN: TOKEN }, {}, { added: [], removed: ["GH_TOKEN"], valuesChanged: false }],
    ["swapped after the pre-flight", { GH_TOKEN: TOKEN }, { GH_TOKEN: OTHER }, { added: [], removed: [], valuesChanged: true }],
  ] as const)("finds a token %s moved, naming no value", async (_label, then, now, moved) => {
    const record = surfaceRecord(await surfaceOf([], then), SALT, AT);

    const compared = compareSurface(record, await surfaceOf([], now));

    expect(compared).toEqual({ same: false, ...moved });
    expect(JSON.stringify(compared)).not.toContain(TOKEN);
    expect(JSON.stringify(compared)).not.toContain(OTHER);
  });
});

describe("surfaceRefusal, the one record check (review/34)", () => {
  const PATH = "/repo/.git/stamity/preflight-git.json";
  const LABEL = "stamity/preflight-git.json in the git directory";

  /** Reads over one file at {@link PATH}: its kind and its text. A fake by design: the check takes its reads injected. */
  function readsOf(kind: "missing" | "file" | "other", text = "", truncated = false): RecordFileReads & { asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      kind: (path) => {
        asked.push(`kind ${path}`);
        return kind;
      },
      read: (path) => {
        asked.push(`read ${path}`);
        return kind === "file" ? { text, truncated } : null;
      },
    };
  }

  async function recordText(refused = false): Promise<string> {
    return JSON.stringify(surfaceRecord(await surfaceOf(), SALT, AT, refused));
  }

  it("passes the surface the record was taken of, and names the keys a moved one added", async () => {
    const reads = readsOf("file", await recordText());

    expect(await surfaceRefusal({ path: PATH }, reads, () => surfaceOf(), "push")).toBeNull();
    const moved = await surfaceRefusal({ path: PATH }, reads, () => surfaceOf([...ENTRIES, ["local", "file:.git/config", "stamity.moved", "x"]]), "push");
    expect(moved).toBe(`config changed: git's configuration or environment is not the one the pre-flight recorded at ${AT} (added stamity.moved)`);
  });

  it.each([
    ["no git directory", { unreadable: "git rev-parse --git-dir answered 128" }, readsOf("missing"), "no pre-flight record (git rev-parse --git-dir answered 128)"],
    ["no file", { path: PATH }, readsOf("missing"), `no pre-flight record (${LABEL} is missing; gate preflight --unattended writes it)`],
    ["a link or other non-regular file", { path: PATH }, readsOf("other"), `no pre-flight record (${LABEL} is not a regular file)`],
    ["a file over 64 KiB", { path: PATH }, readsOf("file", "{}", true), `no pre-flight record (${LABEL} is over 64 KiB)`],
    ["text that is not a record", { path: PATH }, readsOf("file", "{ not a record"), `no pre-flight record (${LABEL} does not read as one)`],
  ] as const)("refuses %s as no pre-flight record, never reading the surface", async (_label, place, reads, why) => {
    let readNow = 0;

    const refusal = await surfaceRefusal(place, reads, () => {
      readNow += 1;
      return surfaceOf();
    }, "push");

    expect(refusal).toBe(why);
    expect(readNow).toBe(0);
    // A link or another non-regular file is never opened.
    if (_label.startsWith("a link")) expect(reads.asked.some((ask) => ask.startsWith("read "))).toBe(false);
  });

  it("refuses a record marked refused for a push, and takes it for the refusal's own ending, comparing as usual (review/33)", async () => {
    const reads = readsOf("file", await recordText(true));

    expect(await surfaceRefusal({ path: PATH }, reads, () => surfaceOf(), "push")).toBe("no pre-flight record (the pre-flight refused)");
    expect(await surfaceRefusal({ path: PATH }, reads, () => surfaceOf(), "refused-end")).toBeNull();
    expect(await surfaceRefusal({ path: PATH }, reads, () => surfaceOf(ENTRIES, { GH_TOKEN: "t" }), "refused-end")).toMatch(/^config changed: .*added GH_TOKEN/);
  });

  it("takes a passing pre-flight's record for the refusal's own ending too", async () => {
    expect(await surfaceRefusal({ path: PATH }, readsOf("file", await recordText(false)), () => surfaceOf(), "refused-end")).toBeNull();
  });

  it("refuses as configuration unreadable where the surface cannot be read now", async () => {
    const refusal = await surfaceRefusal({ path: PATH }, readsOf("file", await recordText()), () => Promise.resolve({ unreadable: "git config --list answered 128" }), "push");

    expect(refusal).toBe("configuration unreadable (git config --list answered 128), so it cannot be compared with the pre-flight's record");
  });
});
