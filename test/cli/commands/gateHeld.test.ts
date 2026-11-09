import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gateCommand } from "../../../src/cli/commands/gate.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * t-gate-held (REQ-FLOW-171): `stamity gate held --paths <files...> [--expect <digest>]`,
 * the digest of the tests a tests-only dispatch wrote, which a later pass checks with
 * `--expect`. Every case runs the real verb through the in-process funnel against real
 * files in a scratch git repository: the paths read from the repository root, which only
 * git names, so nothing is stubbed.
 */

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const SEED_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
} as const;

/** The digest as the cell defines it, computed here on its own: sorted `(path, bytes)` pairs, each framed with its length. */
function expectedDigest(files: Record<string, string>): string {
  const hash = createHash("sha256");
  const paths = Object.keys(files).toSorted((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  for (const path of paths) {
    const name = Buffer.from(path, "utf8");
    const body = Buffer.from(files[path] ?? "", "utf8");
    hash.update(`${name.length}\n`).update(name).update(`${body.length}\n`).update(body);
  }
  return `sha256:${hash.digest("hex")}`;
}

const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

interface Held {
  code: number;
  stdout: string;
  stderr: string;
  doc: Record<string, unknown>;
}

describe.skipIf(!gitAvailable)("stamity gate held", () => {
  const getRoot = useTempDir("gate-held");

  /** A git work tree at `<root>/<name>` holding `files`; nothing is committed, since the verb reads the work tree. */
  async function seedRepo(files: Record<string, string>, name = "repo"): Promise<string> {
    const repo = getRoot().path(name);
    await mkdir(repo, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore", env: { ...process.env, ...SEED_ENV } });
    await getRoot().seedFiles(Object.fromEntries(Object.entries(files).map(([path, body]) => [`${name}/${path}`, body])));
    return repo;
  }

  /** Runs `gate held <argv>` in `cwd` with `HOME` at an empty folder, so no host git config reaches the verb's read. */
  async function heldIn(cwd: string, argv: readonly string[]): Promise<Held> {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: home };
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const result = await runInProcess([gateCommand], ["gate", "held", ...argv], { cwd });
      const doc = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
      return { ...result, doc };
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const FILES = {
    "test/a.test.ts": "it('a', () => {});\n",
    "test/b.test.ts": "it('b', () => { expect(1).toBe(1); });\n",
  };

  it("gives the same digest for the same files in any order, and lists each file's own sha256", async () => {
    const repo = await seedRepo(FILES);

    const forward = await heldIn(repo, ["--paths", "test/a.test.ts", "test/b.test.ts", "--json"]);
    const backward = await heldIn(repo, ["--paths", "test/b.test.ts", "test/a.test.ts", "--json"]);

    expect(forward.code).toBe(0);
    expect(backward.code).toBe(0);
    expect(forward.doc).toEqual({
      ok: true,
      command: "gate",
      version: expect.any(String) as string,
      subcommand: "held",
      digest: expectedDigest(FILES),
      paths: [
        { path: "test/a.test.ts", sha256: sha(FILES["test/a.test.ts"]) },
        { path: "test/b.test.ts", sha256: sha(FILES["test/b.test.ts"]) },
      ],
      expect: null,
    });
    expect(backward.doc["digest"]).toBe(forward.doc["digest"]);
  });

  it("frames each pair with its length, so moving bytes between a name and a body changes the digest", async () => {
    // Unframed, `ab` + `c` and `a` + `bc` hash the same concatenation; framed, they cannot.
    const one = await seedRepo({ ab: "c" }, "one");
    const two = await seedRepo({ a: "bc" }, "two");
    const first = await heldIn(one, ["--paths", "ab", "--json"]);
    const second = await heldIn(two, ["--paths", "a", "--json"]);

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.doc["digest"]).toBe(expectedDigest({ ab: "c" }));
    expect(second.doc["digest"]).not.toBe(first.doc["digest"]);
  });

  it("collapses a path given twice, so the digest is the one file's", async () => {
    const repo = await seedRepo(FILES);
    const twice = await heldIn(repo, ["--paths", "test/a.test.ts", "./test/a.test.ts", "test//a.test.ts", "--json"]);

    expect(twice.code).toBe(0);
    expect(twice.doc["digest"]).toBe(expectedDigest({ "test/a.test.ts": FILES["test/a.test.ts"] }));
    expect(twice.doc["paths"]).toEqual([{ path: "test/a.test.ts", sha256: sha(FILES["test/a.test.ts"]) }]);
  });

  it("exits 0 when --expect matches", async () => {
    const repo = await seedRepo(FILES);
    const digest = expectedDigest(FILES);

    const result = await heldIn(repo, ["--paths", "test/a.test.ts", "test/b.test.ts", "--expect", digest, "--json"]);

    expect(result.code).toBe(0);
    expect(result.doc["ok"]).toBe(true);
    expect(result.doc["expect"]).toBe(digest);
    expect(result.doc["digest"]).toBe(digest);
  });

  it("exits 1 with ok:false when one byte of a held file changed, and the changed file's sha256 names it", async () => {
    const repo = await seedRepo(FILES);
    const held = expectedDigest(FILES);
    // One byte: `1` becomes `2` in the second file's assertion.
    const weakened = FILES["test/b.test.ts"].replace("toBe(1)", "toBe(2)");
    await writeFile(getRoot().path("repo", "test", "b.test.ts"), weakened);

    const result = await heldIn(repo, ["--paths", "test/a.test.ts", "test/b.test.ts", "--expect", held, "--json"]);

    expect(result.code).toBe(1);
    expect(result.doc["ok"]).toBe(false);
    expect(result.doc["expect"]).toBe(held);
    expect(result.doc["digest"]).not.toBe(held);
    expect(result.doc["paths"]).toEqual([
      { path: "test/a.test.ts", sha256: sha(FILES["test/a.test.ts"]) },
      { path: "test/b.test.ts", sha256: sha(weakened) },
    ]);
    expect(result.doc["reason"]).toContain("does not match");
    expect(result.stderr).toContain("does not match");
  });

  it("exits 1 for a missing file, its sha256 null and the reason naming the path, with or without --expect", async () => {
    const repo = await seedRepo({ "test/a.test.ts": FILES["test/a.test.ts"] });

    const result = await heldIn(repo, ["--paths", "test/a.test.ts", "test/gone.test.ts", "--json"]);

    expect(result.code).toBe(1);
    expect(result.doc["ok"]).toBe(false);
    expect(result.doc["paths"]).toEqual([
      { path: "test/a.test.ts", sha256: sha(FILES["test/a.test.ts"]) },
      { path: "test/gone.test.ts", sha256: null },
    ]);
    expect(result.doc["reason"]).toContain("test/gone.test.ts");
    expect(result.doc["reason"]).toContain("missing");
    expect(result.doc["digest"]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.doc["digest"]).not.toBe(expectedDigest({ "test/a.test.ts": FILES["test/a.test.ts"] }));
  });

  // A symlink on Windows needs developer mode or an elevated shell, which the Windows CI legs do not promise.
  it.skipIf(process.platform === "win32")("never follows a symlinked test file: sha256 null, a reason naming it a link, exit 1", async () => {
    const repo = await seedRepo({ "real/a.test.ts": FILES["test/a.test.ts"] });
    await mkdir(getRoot().path("repo", "test"), { recursive: true });
    await symlink("../real/a.test.ts", getRoot().path("repo", "test", "a.test.ts"));

    const result = await heldIn(repo, ["--paths", "test/a.test.ts", "--json"]);

    expect(result.code).toBe(1);
    expect(result.doc["ok"]).toBe(false);
    expect(result.doc["paths"]).toEqual([{ path: "test/a.test.ts", sha256: null }]);
    expect(result.doc["reason"]).toContain("test/a.test.ts");
    expect(result.doc["reason"]).toContain("link");
  });

  it.skipIf(process.platform === "win32")("never follows a symlinked folder on the way to a test file", async () => {
    const repo = await seedRepo({ "real/a.test.ts": FILES["test/a.test.ts"] });
    await symlink("real", getRoot().path("repo", "test"));

    const result = await heldIn(repo, ["--paths", "test/a.test.ts", "--json"]);

    expect(result.code).toBe(1);
    expect(result.doc["paths"]).toEqual([{ path: "test/a.test.ts", sha256: null }]);
    expect(result.doc["reason"]).toContain("link");
  });

  it("hashes an empty file", async () => {
    const repo = await seedRepo({ "test/empty.test.ts": "" });

    const result = await heldIn(repo, ["--paths", "test/empty.test.ts", "--json"]);

    expect(result.code).toBe(0);
    expect(result.doc["paths"]).toEqual([{ path: "test/empty.test.ts", sha256: sha("") }]);
    expect(result.doc["digest"]).toBe(expectedDigest({ "test/empty.test.ts": "" }));
  });

  it("reads the paths from the repository root when run in a subfolder", async () => {
    await seedRepo(FILES);

    const result = await heldIn(getRoot().path("repo", "test"), ["--paths", "test/a.test.ts", "test/b.test.ts", "--json"]);

    expect(result.code).toBe(0);
    expect(result.doc["digest"]).toBe(expectedDigest(FILES));
  });

  it("reads the paths from the project root when the project sits in a subfolder of its repository (review/14)", async () => {
    // A committed `app/.stamity/` makes `app/` the project, as `classify` finds it; a same-named file at the git
    // top-level is the decoy the old read hashed instead.
    const repo = await seedRepo({
      "app/.stamity/manifest.json": "{}\n",
      "app/test/a.test.ts": FILES["test/a.test.ts"],
      "test/a.test.ts": "it('decoy', () => {});\n",
    });
    const git = (args: readonly string[]): void => {
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], {
        cwd: repo,
        stdio: "ignore",
        env: { ...process.env, ...SEED_ENV },
      });
    };
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "seed"]);
    const want = expectedDigest({ "test/a.test.ts": FILES["test/a.test.ts"] });

    const fromProject = await heldIn(getRoot().path("repo", "app"), ["--paths", "test/a.test.ts", "--json"]);
    const fromBelow = await heldIn(getRoot().path("repo", "app", "test"), ["--paths", "test/a.test.ts", "--json"]);
    const fromTop = await heldIn(repo, ["--paths", "test/a.test.ts", "--json"]);

    expect(fromProject.code).toBe(0);
    expect(fromProject.doc["digest"]).toBe(want);
    expect(fromBelow.code).toBe(0);
    expect(fromBelow.doc["digest"]).toBe(want);
    // Run from the top-level, the project is the repository itself, so its own file is read.
    expect(fromTop.doc["digest"]).toBe(expectedDigest({ "test/a.test.ts": "it('decoy', () => {});\n" }));
  });

  it("prints the digest and each file on the terminal", async () => {
    const repo = await seedRepo(FILES);

    const result = await heldIn(repo, ["--paths", "test/b.test.ts", "test/a.test.ts"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`held: ${expectedDigest(FILES)}`);
    expect(result.stdout).toContain(`${sha(FILES["test/a.test.ts"])}  test/a.test.ts`);
    expect(result.stdout.indexOf("test/a.test.ts")).toBeLessThan(result.stdout.indexOf("test/b.test.ts"));
  });

  it("fails closed outside a git work tree: exit 1, no digest", async () => {
    const outside = getRoot().path("not-a-repo");
    await mkdir(outside, { recursive: true });
    await writeFile(getRoot().path("not-a-repo", "a.test.ts"), "x");

    const result = await heldIn(outside, ["--paths", "a.test.ts", "--json"]);

    expect(result.code).toBe(1);
    expect(result.doc["ok"]).toBe(false);
    expect(result.doc["digest"]).toBeNull();
    expect(String(result.doc["reason"])).toContain("work tree");
  });
});

describe("stamity gate held usage errors (exit 2, before anything is read)", () => {
  const run = (argv: readonly string[]) => runInProcess([gateCommand], ["gate", ...argv]);

  it("refuses held with no --paths", async () => {
    const result = await run(["held", "--json"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--paths");
  });

  it.each([
    ["an absolute path", "/etc/passwd"],
    ["a Windows drive path", "C:\\x\\a.test.ts"],
    ["a path climbing out with ..", "../outside.test.ts"],
    ["a path climbing out midway", "test/../../outside.test.ts"],
    ["a backslash climb", "test\\..\\..\\outside.test.ts"],
    ["an empty path", ""],
  ])("refuses %s", async (_label, path) => {
    const result = await run(["held", "--paths", "test/a.test.ts", path]);
    expect(result.code).toBe(2);
    // review/14: paths now read from the project root `classify` uses, not the git top-level, and the refusal says so.
    expect(result.stderr).toContain("project root");
  });

  it("refuses a malformed --expect", async () => {
    const result = await run(["held", "--paths", "test/a.test.ts", "--expect", "abc123"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("sha256:");
  });

  it("refuses --expect on classify and --base on held", async () => {
    const expectOnClassify = await run(["classify", "--paths", "docs/x.md", "--expect", `sha256:${"0".repeat(64)}`]);
    const baseOnHeld = await run(["held", "--paths", "test/a.test.ts", "--base", "HEAD"]);
    expect(expectOnClassify.code).toBe(2);
    expect(expectOnClassify.stderr).toContain("--expect does not apply to classify");
    expect(baseOnHeld.code).toBe(2);
    expect(baseOnHeld.stderr).toContain("--base does not apply to held");
  });

  it("refuses --dry-run, since held writes nothing", async () => {
    const result = await run(["held", "--paths", "test/a.test.ts", "--dry-run"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--dry-run applies to preflight only");
  });
});
