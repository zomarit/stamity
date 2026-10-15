import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileSystemProbe,
  gitProgramFor,
  programNotFound,
  resolveProgramOnPath,
  searchPathOf,
  type ProgramFileProbe,
} from "../../src/shared/programPath.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Two lanes. The seeded lane walks real folders under the host's own platform
 * rules, so it runs on every leg with the file names that leg starts. The
 * in-memory lane injects the platform and a probe over a set of paths, so the
 * Windows rules are held on a POSIX host and the POSIX rules on a Windows one:
 * a path one platform spells cannot be seeded on the other.
 */

const WINDOWS_HOST = process.platform === "win32";

/** The file name the host starts for the bare name `git`. */
const GIT_FILE = WINDOWS_HOST ? "git.exe" : "git";

describe("resolveProgramOnPath — seeded folders, the host's own rules", () => {
  const getRoot = useTempDir("program-path");

  /** A folder holding a startable file under git's name; returns the file's path. */
  async function seedProgram(...segments: string[]): Promise<string> {
    const folder = getRoot().path(...segments);
    await mkdir(folder, { recursive: true });
    const file = join(folder, GIT_FILE);
    await writeFile(file, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(file, 0o755);
    return file;
  }

  function resolveGit(cwd: string, entries: readonly string[]): string | null {
    return resolveProgramOnPath("git", {
      platform: process.platform,
      path: entries.join(delimiter),
      cwd,
      probe: fileSystemProbe,
    });
  }

  it("never returns a file of the program's name in the working folder", async () => {
    await seedProgram("work");
    const elsewhere = await seedProgram("bin");
    const work = getRoot().path("work");

    expect(resolveGit(work, [work])).toBeNull();
    // Non-degenerate: the same walk does find a program, in the folder that is not the working folder.
    expect(resolveGit(work, [work, getRoot().path("bin")])).toBe(elsewhere);
  });

  it("returns the first absolute entry that holds the program", async () => {
    const first = await seedProgram("first");
    const second = await seedProgram("second");
    await mkdir(getRoot().path("work"));
    await mkdir(getRoot().path("empty"));
    const work = getRoot().path("work");

    expect(resolveGit(work, [getRoot().path("first"), getRoot().path("second")])).toBe(first);
    expect(resolveGit(work, [getRoot().path("second"), getRoot().path("first")])).toBe(second);
    expect(resolveGit(work, [getRoot().path("empty"), getRoot().path("second")])).toBe(second);
  });

  it("skips an empty entry and a relative one, which both name the working folder's side", async () => {
    await seedProgram("work");
    await seedProgram("work", "tools");
    const absolute = await seedProgram("bin");
    const work = getRoot().path("work");

    expect(resolveGit(work, ["", ".", "tools", `.${sep}tools`])).toBeNull();
    expect(resolveGit(work, ["", ".", "tools", getRoot().path("bin")])).toBe(absolute);
  });

  it("skips the working folder where PATH names it, however the entry spells it", async () => {
    await seedProgram("work");
    const absolute = await seedProgram("bin");
    const work = getRoot().path("work");
    const spellings = [work, `${work}${sep}`, `${work}${sep}..${sep}work`, `${work}${sep}.`];

    for (const spelling of spellings) {
      expect(resolveGit(work, [spelling]), spelling).toBeNull();
      expect(resolveGit(work, [spelling, getRoot().path("bin")]), spelling).toBe(absolute);
    }
  });

  // A link to a folder needs a privilege a Windows runner may not hold, so the
  // linked spelling is seeded on POSIX hosts; the comparison itself is by real
  // path on every platform.
  it.skipIf(WINDOWS_HOST)("skips the working folder reached through a link, from either side", async () => {
    await seedProgram("work");
    const absolute = await seedProgram("bin");
    const work = getRoot().path("work");
    const linked = getRoot().path("linked");
    await symlink(work, linked);

    expect(resolveGit(work, [linked])).toBeNull();
    expect(resolveGit(linked, [work])).toBeNull();
    expect(resolveGit(linked, [work, getRoot().path("bin")])).toBe(absolute);
  });

  it("returns nothing where no entry holds the program, and nothing with no PATH at all", async () => {
    await mkdir(getRoot().path("work"));
    await mkdir(getRoot().path("empty"));
    await seedProgram("bin");
    const work = getRoot().path("work");

    expect(resolveGit(work, [getRoot().path("empty"), getRoot().path("gone")])).toBeNull();
    expect(resolveGit(work, [])).toBeNull();
    expect(
      resolveProgramOnPath("git", { platform: process.platform, path: undefined, cwd: work, probe: fileSystemProbe }),
    ).toBeNull();
    // Non-degenerate: the folder that was not named does hold the program.
    expect(resolveGit(work, [getRoot().path("bin")])).not.toBeNull();
  });

  it("returns nothing for a working folder that has no real path, so nothing is compared by guess", async () => {
    await seedProgram("bin");

    expect(resolveGit(getRoot().path("gone"), [getRoot().path("bin")])).toBeNull();
  });

  // The execute bit is a POSIX fact: Windows has none, and there the extension
  // is what makes a file a program.
  it.skipIf(WINDOWS_HOST)("passes over a folder of the program's name and a file without its execute bit", async () => {
    await mkdir(getRoot().path("folder", "git"), { recursive: true });
    const plain = await seedProgram("plain");
    await chmod(plain, 0o644);
    const startable = await seedProgram("bin");
    await mkdir(getRoot().path("work"));
    const work = getRoot().path("work");

    expect(resolveGit(work, [getRoot().path("folder"), getRoot().path("plain")])).toBeNull();
    expect(resolveGit(work, [getRoot().path("folder"), getRoot().path("plain"), getRoot().path("bin")])).toBe(startable);
  });
});

/** A probe over a fixed set of files; every folder is its own real path unless `links` says otherwise. */
function memoryProbe(files: readonly string[], links: Readonly<Record<string, string | null>> = {}): ProgramFileProbe {
  const present = new Set(files);
  return {
    isProgramFile: (path) => present.has(path),
    realPath: (path) => (path in links ? (links[path] ?? null) : path),
  };
}

describe("resolveProgramOnPath — win32 rules, injected", () => {
  const CWD = "C:\\work\\repo";

  function resolveOnWindows(name: string, path: string | undefined, files: readonly string[], cwd = CWD): string | null {
    return resolveProgramOnPath(name, { platform: "win32", path, cwd, probe: memoryProbe(files) });
  }

  it("tries .com and then .exe for a bare name, and never the bare name itself", () => {
    const both = ["C:\\tools\\git.com", "C:\\tools\\git.exe", "C:\\tools\\git"];

    expect(resolveOnWindows("git", "C:\\tools", both)).toBe("C:\\tools\\git.com");
    expect(resolveOnWindows("git", "C:\\tools", ["C:\\tools\\git.exe", "C:\\tools\\git"])).toBe("C:\\tools\\git.exe");
    expect(resolveOnWindows("git", "C:\\tools", ["C:\\tools\\git", "C:\\tools\\git.cmd", "C:\\tools\\git.bat"])).toBeNull();
  });

  it("tries every extension in one entry before the next entry", () => {
    const files = ["C:\\first\\git.exe", "C:\\second\\git.com"];

    expect(resolveOnWindows("git", "C:\\first;C:\\second", files)).toBe("C:\\first\\git.exe");
    expect(resolveOnWindows("git", "C:\\second;C:\\first", files)).toBe("C:\\second\\git.com");
  });

  it("tries a name that already has an extension as given, and nothing else", () => {
    expect(resolveOnWindows("git.exe", "C:\\tools", ["C:\\tools\\git.exe"])).toBe("C:\\tools\\git.exe");
    expect(resolveOnWindows("git.exe", "C:\\tools", ["C:\\tools\\git.exe.com", "C:\\tools\\git.exe.exe", "C:\\tools\\git.com"])).toBeNull();
  });

  it("never returns the working folder's file, compared without letter case and whatever the trailing separator", () => {
    const files = ["C:\\work\\repo\\git.exe", "c:\\WORK\\Repo\\git.exe", "C:\\tools\\git.exe"];

    for (const entry of ["C:\\work\\repo", "c:\\WORK\\Repo", "C:\\work\\repo\\"]) {
      expect(resolveOnWindows("git", entry, files), entry).toBeNull();
      expect(resolveOnWindows("git", `${entry};C:\\tools`, files), entry).toBe("C:\\tools\\git.exe");
    }
  });

  it("skips every entry that is not a full path: empty, relative, drive-relative, rooted on no drive", () => {
    const files = [
      "C:\\work\\repo\\git.exe",
      ".\\git.exe",
      "tools\\git.exe",
      "C:tools\\git.exe",
      "C:git.exe",
      "\\tools\\git.exe",
      "/tools\\git.exe",
      "D:\\git\\cmd\\git.exe",
    ];
    const skipped = ";.;tools;C:tools;C:;\\tools;/tools";

    expect(resolveOnWindows("git", skipped, files)).toBeNull();
    expect(resolveOnWindows("git", `${skipped};D:\\git\\cmd`, files)).toBe("D:\\git\\cmd\\git.exe");
  });

  it("reads a quoted entry without its quotes, a share by its full name, and either separator after the drive", () => {
    expect(resolveOnWindows("git", '"C:\\Program Files\\Git\\cmd"', ["C:\\Program Files\\Git\\cmd\\git.exe"])).toBe(
      "C:\\Program Files\\Git\\cmd\\git.exe",
    );
    expect(resolveOnWindows("git", "\\\\server\\share\\bin", ["\\\\server\\share\\bin\\git.exe"])).toBe(
      "\\\\server\\share\\bin\\git.exe",
    );
    expect(resolveOnWindows("git", "C:/tools/", ["C:/tools/git.exe"])).toBe("C:/tools/git.exe");
  });

  it("returns nothing for a name that carries a path, a drive or nothing", () => {
    const files = ["C:\\tools\\sub\\git.exe", "C:\\tools\\sub/git.exe", "C:\\tools\\C:git.exe", "C:\\tools\\.exe", "C:\\tools\\.com"];

    for (const name of ["sub\\git", "sub/git", "C:git", ""]) {
      expect(resolveOnWindows(name, "C:\\tools", files), name).toBeNull();
    }
  });
});

describe("resolveProgramOnPath — POSIX rules, injected", () => {
  function resolveOnPosix(name: string, path: string | undefined, files: readonly string[], links: Record<string, string | null> = {}): string | null {
    return resolveProgramOnPath(name, { platform: "linux", path, cwd: "/work/repo", probe: memoryProbe(files, links) });
  }

  it("splits on the colon, tries the name as given, and adds no extension", () => {
    const files = ["/usr/bin/git", "/opt/tools/git.exe"];

    expect(resolveOnPosix("git", "/opt/tools:/usr/bin", files)).toBe("/usr/bin/git");
    expect(resolveOnPosix("git", "/opt/tools", files)).toBeNull();
    // A semicolon is an ordinary character in a POSIX folder name.
    expect(resolveOnPosix("git", "/opt;x:/usr/bin", ["/opt;x/git", "/usr/bin/git"])).toBe("/opt;x/git");
  });

  it("skips the empty entries a leading, doubled or trailing colon makes, and a relative one", () => {
    const files = ["/work/repo/git", "git", "./git", "bin/git", "/usr/bin/git"];

    expect(resolveOnPosix("git", ":.::bin:", files)).toBeNull();
    expect(resolveOnPosix("git", ":.::bin:/usr/bin:", files)).toBe("/usr/bin/git");
  });

  it("skips the working folder by its real path, with letter case kept", () => {
    const files = ["/work/repo/git", "/linked/git", "/WORK/repo/git"];

    expect(resolveOnPosix("git", "/work/repo:/linked", files, { "/linked": "/work/repo" })).toBeNull();
    // Another folder on a file system that keeps letter case apart: it is not the working folder.
    expect(resolveOnPosix("git", "/work/repo:/WORK/repo", files)).toBe("/WORK/repo/git");
  });

  it("starts the entry as PATH spells it, not as its real path", () => {
    expect(resolveOnPosix("git", "/opt/current/bin", ["/opt/current/bin/git"], { "/opt/current/bin": "/opt/2.50/bin" })).toBe(
      "/opt/current/bin/git",
    );
    expect(resolveOnPosix("git", "/usr/bin/", ["/usr/bin/git"])).toBe("/usr/bin/git");
  });

  it("skips an entry with no real path, and returns nothing where the working folder has none", () => {
    const files = ["/gone/git", "/usr/bin/git"];

    expect(resolveOnPosix("git", "/gone:/usr/bin", files, { "/gone": null })).toBe("/usr/bin/git");
    expect(resolveOnPosix("git", "/usr/bin", files, { "/work/repo": null })).toBeNull();
  });

  it("returns nothing for a name that carries a path, or for no name", () => {
    expect(resolveOnPosix("bin/git", "/usr", ["/usr/bin/git"])).toBeNull();
    expect(resolveOnPosix("", "/usr/bin", ["/usr/bin/"])).toBeNull();
  });
});

describe("searchPathOf", () => {
  it("reads PATH by its exact name on POSIX", () => {
    expect(searchPathOf({ PATH: "/usr/bin" }, "linux")).toBe("/usr/bin");
    expect(searchPathOf({ Path: "/usr/bin" }, "darwin")).toBeUndefined();
    expect(searchPathOf({}, "linux")).toBeUndefined();
  });

  it("reads it without letter case on win32, the first spelling in sort order winning as the runtime passes it on", () => {
    expect(searchPathOf({ Path: "C:\\tools" }, "win32")).toBe("C:\\tools");
    expect(searchPathOf({ path: "C:\\lower", Path: "C:\\mixed", PATH: "C:\\upper" }, "win32")).toBe("C:\\upper");
    expect(searchPathOf({ PATHEXT: ".EXE" }, "win32")).toBeUndefined();
  });
});

describe("gitProgramFor", () => {
  const getRoot = useTempDir("git-program");

  /** A startable file under git's name in `folder`. */
  async function seedGit(folder: string): Promise<void> {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, GIT_FILE), "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(join(folder, GIT_FILE), 0o755);
  }

  it("resolves git once for a working folder and a PATH, and again for another PATH", async () => {
    const first = getRoot().path("first");
    const second = getRoot().path("second");
    const work = getRoot().path("work");
    await Promise.all([seedGit(first), seedGit(second), mkdir(work)]);
    const env = { PATH: first };

    expect(gitProgramFor(work, env)).toBe(join(first, GIT_FILE));
    // The file is gone, and the answer stands: the folders were walked once.
    await rm(join(first, GIT_FILE));
    expect(gitProgramFor(work, env)).toBe(join(first, GIT_FILE));
    // Non-degenerate: a walk taken now finds nothing there.
    expect(resolveProgramOnPath("git", { platform: process.platform, path: first, cwd: work, probe: fileSystemProbe })).toBeNull();
    expect(gitProgramFor(work, { PATH: [first, second].join(delimiter) })).toBe(join(second, GIT_FILE));
  });

  // Some suites show the engine another `process.platform` while real git runs
  // under them (`test/cli/commands/gate.test.ts::onPlatform`). The program to
  // start is found by the rules of the platform the process really runs on.
  it("walks by the host's own rules whatever process.platform is made to read later", async () => {
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    await Promise.all([seedGit(bin), mkdir(work)]);
    const real = process.platform;
    const other: NodeJS.Platform = WINDOWS_HOST ? "linux" : "win32";

    Object.defineProperty(process, "platform", { value: other, configurable: true });
    try {
      expect(gitProgramFor(work, { PATH: [getRoot().path("gone"), bin].join(delimiter) })).toBe(join(bin, GIT_FILE));
    } finally {
      Object.defineProperty(process, "platform", { value: real, configurable: true });
    }
  });

  it("passes over a git in a node_modules/.bin folder, at any depth and however its end is spelled", async () => {
    const vendored = getRoot().path("repo", "node_modules", ".bin");
    const nested = getRoot().path("repo", "packs", "x", "node_modules", ".bin");
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    await Promise.all([seedGit(vendored), seedGit(nested), seedGit(bin), mkdir(work)]);

    // Non-degenerate: the plain walk takes the first entry's git.
    const path = [vendored, `${nested}${sep}`, bin].join(delimiter);
    expect(resolveProgramOnPath("git", { platform: process.platform, path, cwd: work, probe: fileSystemProbe })).toBe(
      join(vendored, GIT_FILE),
    );
    expect(gitProgramFor(work, { PATH: path })).toBe(join(bin, GIT_FILE));
    expect(gitProgramFor(work, { PATH: [vendored, nested].join(delimiter) })).toBeNull();
  });

  it("keeps no answer of nothing: a working folder made later, or a git installed later, is found", async () => {
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    await mkdir(bin);
    const env = { PATH: bin };

    expect(gitProgramFor(work, env)).toBeNull();
    await mkdir(work);
    expect(gitProgramFor(work, env)).toBeNull();
    await seedGit(bin);
    expect(gitProgramFor(work, env)).toBe(join(bin, GIT_FILE));
  });
});

describe("programNotFound", () => {
  it("carries the code, call and name Node gives a start that finds no program", () => {
    const failure = programNotFound("git", "spawnSync", ["status", "--porcelain"]);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe("spawnSync git ENOENT");
    expect({ ...failure }).toEqual({ code: "ENOENT", syscall: "spawnSync git", path: "git", spawnargs: ["status", "--porcelain"] });
    expect(programNotFound("git", "spawn", []).message).toBe("spawn git ENOENT");
  });
});
