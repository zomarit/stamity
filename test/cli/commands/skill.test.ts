import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skillCommand } from "../../../src/cli/commands/skill.ts";
import { runGit } from "../../../src/worktree/git.ts";
import { runInProcess, type InProcessResult } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * REQ-FLOW-180: `stamity skill add | list | remove`, in process, over real git against a local bare repository. The
 * network is not reachable from the suite, so git's own `url.<base>.insteadOf` (set through `GIT_CONFIG_*` in the
 * environment the git children inherit) rewrites the source's `https://` address to the fixture's `file://` one;
 * nothing about git is stubbed. The command's own environment is the harness's injected one, empty by default.
 */

const gitAvailable = (await runGit({ args: ["--version"], cwd: process.cwd() })).status === 0;
const getTemp = useTempDir("skill-verb");

const IDENTITY = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false"];

const SKILL_MD = [
  "---",
  "id: house-style",
  "type: skill",
  "description: Writes in the house style when someone drafts prose for this repository.",
  "tags: [writing]",
  "load: on-demand",
  "obsolete_when: the house style ships in the client",
  "---",
  "",
  "# House style",
  "",
  "Write short sentences.",
  "",
].join("\n");

async function mustGit(cwd: string, ...args: string[]): Promise<string> {
  const outcome = await runGit({ args, cwd });
  if (outcome.status !== 0) throw new Error(`git ${args.join(" ")} failed (${outcome.status}): ${outcome.stderr}`);
  return outcome.stdout.trim();
}

interface Fixture {
  readonly root: string;
  readonly repo: string;
  readonly commit: string;
}

/** A project trusting one source, `house`, whose repository holds `house-style/` at a commit tagged `v1.0.0`. */
async function fixture(sources?: string): Promise<Fixture> {
  const base = getTemp().dir;
  const work = join(base, "source");
  const bare = join(base, "source.git");
  const root = join(base, "project");
  await mkdir(join(work, "house-style"), { recursive: true });
  await mkdir(join(root, ".stamity"), { recursive: true });
  await writeFile(join(work, "house-style", "SKILL.md"), SKILL_MD);
  await mustGit(work, "init", "--quiet", "--initial-branch", "main");
  await mustGit(work, "add", "--all");
  await mustGit(work, ...IDENTITY, "commit", "--quiet", "-m", "fixture");
  await mustGit(work, ...IDENTITY, "tag", "v1.0.0");
  await mustGit(base, "clone", "--quiet", "--bare", work, bare);
  const repo = "https://skills.example.test/acme/skills";
  vi.stubEnv("GIT_CONFIG_COUNT", "1");
  vi.stubEnv("GIT_CONFIG_KEY_0", `url.${pathToFileURL(bare).href}.insteadOf`);
  vi.stubEnv("GIT_CONFIG_VALUE_0", repo);
  await writeFile(
    join(root, ".stamity", "skill-sources.json"),
    sources ?? JSON.stringify({ version: 1, sources: [{ id: "house", repo, allowScripts: false }] }),
  );
  return { root, repo, commit: await mustGit(work, "rev-parse", "HEAD") };
}

function skill(root: string, argv: readonly string[], env: Record<string, string> = {}): Promise<InProcessResult> {
  return runInProcess([skillCommand], ["skill", ...argv], { cwd: root, env });
}

const add = (fx: Fixture, ...extra: string[]): string[] => ["add", "house", "house-style", "--tag", "v1.0.0", "--commit", fx.commit, ...extra];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.skipIf(!gitAvailable)("stamity skill", () => {
  it("adds a skill from a listed source, lists it clean, then removes it", async () => {
    const fx = await fixture();

    const added = await skill(fx.root, add(fx));
    expect(added.stderr).toBe("");
    expect(added.code).toBe(0);
    expect(added.stdout).toContain(`Copied house-style from house at v1.0.0 (${fx.commit.slice(0, 12)}) -> .stamity/overrides/skills/house-style/`);
    expect(await readFile(join(fx.root, ".stamity", "overrides", "skills", "house-style", "SKILL.md"), "utf8")).toBe(SKILL_MD);

    const listed = await skill(fx.root, ["list"]);
    expect(listed.stdout).toBe(`house-style · house · v1.0.0 · ${fx.commit.slice(0, 12)} · clean\n`);

    const removed = await skill(fx.root, ["remove", "house-style"]);
    expect(removed.code).toBe(0);
    expect(removed.stdout).toBe("Removed .stamity/overrides/skills/house-style\nRemoved .stamity/skills/house-style.origin.json\n");
    expect((await skill(fx.root, ["list"])).stdout).toBe("No copied skills.\n");
  });

  it("prints one JSON envelope carrying the origin record", async () => {
    const fx = await fixture();

    const result = await skill(fx.root, add(fx, "--json"));

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      ok: true,
      command: "skill",
      dryRun: false,
      copy: ".stamity/overrides/skills/house-style",
      record: ".stamity/skills/house-style.origin.json",
      skill: { name: "house-style", source: { id: "house", repo: fx.repo }, version: "v1.0.0", commit: fx.commit, scripts: [] },
    });
  });

  it("writes nothing on --dry-run", async () => {
    const fx = await fixture();

    const result = await skill(fx.root, add(fx, "--dry-run"));

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Would copy house-style");
    expect(await readdir(join(fx.root, ".stamity"))).toEqual(["skill-sources.json"]);
  });

  it("refuses a source the file does not list, and any source when no file lists one", async () => {
    const fx = await fixture();

    const unlisted = await skill(fx.root, ["add", "other", "house-style", "--tag", "v1.0.0", "--commit", fx.commit]);
    expect(unlisted.code).toBe(1);
    expect(unlisted.stderr).toContain('the source "other" is not listed in .stamity/skill-sources.json');

    const bare = join(getTemp().dir, "untrusting");
    await mkdir(bare);
    const none = await skill(bare, ["add", "house", "house-style", "--tag", "v1.0.0", "--commit", fx.commit]);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("no source is trusted here");
    expect(await readdir(bare)).toEqual([]);
  });

  it("refuses when the sources file is malformed, trusting none", async () => {
    const fx = await fixture(JSON.stringify({ version: 1, sources: [], extra: true }));

    const result = await skill(fx.root, add(fx));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("the trusted sources cannot be read");
    expect(result.stderr).toContain('"extra"');
  });

  it("refuses in an unattended session, and while nobody is watching, by variable or by marker", async () => {
    const fx = await fixture();

    const unattended = await skill(fx.root, add(fx), { STAMITY_UNATTENDED: "1" });
    expect(unattended.code).toBe(1);
    expect(unattended.stderr).toContain("skill add refused: this session is unattended");

    const watching = await skill(fx.root, add(fx), { STAMITY_NOBODY_WATCHING: "1" });
    expect(watching.code).toBe(1);
    expect(watching.stderr).toContain("skill add refused: nobody is watching");

    expect((await skill(fx.root, add(fx), { STAMITY_NOBODY_WATCHING: "0", STAMITY_UNATTENDED: "false" })).code).toBe(0);
    await skill(fx.root, ["remove", "house-style"]);

    await writeFile(join(fx.root, ".stamity", "away.json"), "{}\n");
    const marker = await skill(fx.root, add(fx));
    expect(marker.code).toBe(1);
    expect(marker.stderr).toContain(".stamity/away.json is present");
    expect(await readdir(join(fx.root, ".stamity", "overrides", "skills"))).toEqual([]);
  });

  it("refuses a commit given in short form", async () => {
    const fx = await fixture();

    const result = await skill(fx.root, ["add", "house", "house-style", "--tag", "v1.0.0", "--commit", fx.commit.slice(0, 7)]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a full commit id (40 lowercase hex digits)");
  });

  it("refuses add without its pins, and an unknown subcommand", async () => {
    const fx = await fixture();

    expect((await skill(fx.root, ["add", "house", "house-style"])).stderr).toContain("needs --tag <tag> and --commit <40-hex>");
    expect((await skill(fx.root, ["fetch"])).stderr).toContain('unknown skill subcommand "fetch"');
  });
});
