import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSkillSources, SKILL_SOURCES_REL_PATH } from "../../src/skills/sources.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * REQ-FLOW-180: the trusted skill sources live in one held file. Real temp directories: the absent-file probe and the
 * fail-closed read are what the module does to disk.
 */
const getRepo = useTempDir("skill-sources");

async function rootWith(body: string): Promise<string> {
  const repo = getRepo();
  await repo.seedFiles({ [SKILL_SOURCES_REL_PATH]: body });
  return repo.dir;
}

/** The read refuses: an error naming the file and every `naming` token, and no source trusted. */
async function expectRefusal(body: string, naming: readonly string[]): Promise<void> {
  const read = readSkillSources(await rootWith(body));
  expect(read).not.toHaveProperty("sources");
  if (!("error" in read)) throw new Error("expected a refusal");
  expect(read.error).toContain(SKILL_SOURCES_REL_PATH);
  expect(read.error).toContain("No skill source is trusted");
  for (const token of naming) expect(read.error).toContain(token);
}

const document = (sources: readonly unknown[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ version: 1, sources, ...extra });

describe("SKILL_SOURCES_REL_PATH", () => {
  it("is the held file under the state folder", () => {
    expect(SKILL_SOURCES_REL_PATH).toBe(".stamity/skill-sources.json");
  });
});

describe("readSkillSources", () => {
  it("reads a valid file, two sources, each repository key normalized", async () => {
    const root = await rootWith(
      document([
        { id: "house", repo: "https://github.com/Acme/Skills.git", allowScripts: false },
        { id: "tools-2", repo: "https://www.GitLab.example.com/team/tools", allowScripts: true },
      ]),
    );

    expect(readSkillSources(root)).toEqual({
      sources: [
        { id: "house", repo: "https://github.com/Acme/Skills.git", key: "github.com/acme/skills", allowScripts: false },
        { id: "tools-2", repo: "https://www.GitLab.example.com/team/tools", key: "gitlab.example.com/team/tools", allowScripts: true },
      ],
    });
  });

  it("reads an absent allowScripts as false, never as allowed", async () => {
    const root = await rootWith(document([{ id: "house", repo: "https://github.com/acme/skills" }]));

    expect(readSkillSources(root)).toEqual({
      sources: [{ id: "house", repo: "https://github.com/acme/skills", key: "github.com/acme/skills", allowScripts: false }],
    });
  });

  it("reads a byte-order mark as the editor's, not as a defect", async () => {
    const root = await rootWith(`\uFEFF${document([{ id: "house", repo: "https://github.com/acme/skills" }])}`);

    expect(readSkillSources(root)).toMatchObject({ sources: [{ id: "house" }] });
  });

  it("trusts nothing when the file is absent, or the state folder is", async () => {
    const repo = getRepo();
    expect(readSkillSources(repo.dir)).toEqual({ sources: [] });
    await repo.seedFiles({ ".stamity/manifest.json": "{}" });
    expect(readSkillSources(repo.dir)).toEqual({ sources: [] });
  });

  it("trusts nothing when the state folder is a file", async () => {
    const repo = getRepo();
    await writeFile(join(repo.dir, ".stamity"), "not a folder");

    expect(readSkillSources(repo.dir)).toEqual({ sources: [] });
  });

  it("refuses an unknown field at the root", async () => {
    await expectRefusal(document([], { trustAll: true }), ['"trustAll"']);
  });

  it("refuses an unknown field on a source", async () => {
    await expectRefusal(document([{ id: "house", repo: "https://github.com/acme/skills", branch: "main" }]), ['"branch"']);
  });

  it("refuses a duplicate id", async () => {
    await expectRefusal(
      document([
        { id: "house", repo: "https://github.com/acme/skills" },
        { id: "house", repo: "https://github.com/acme/other" },
      ]),
      ['"house"', "more than once"],
    );
  });

  it.each([
    "http://github.com/acme/skills",
    "git@github.com:acme/skills.git",
    "ssh://github.com/acme/skills",
    "file:///srv/skills",
    "/srv/skills",
    "acme/skills",
    "ext::sh -c touch% /tmp/x",
  ])("refuses a repository that is not https: %s", async (repo) => {
    await expectRefusal(document([{ id: "house", repo }]), [JSON.stringify(repo), "https"]);
  });

  it.each([
    "https://github.com/acme",
    "https://github.com/acme/skills/tree/main",
    "https://gitlab.com/group/sub/skills.git",
    "https://github.com/acme/skills?ref=main",
    "https://github.com/acme/skills#main",
    "https://github.com/acme/skills ",
    "https://github.com/acme/$HOME",
    "https://github.com/acme/..",
  ])("refuses an https repository the key cannot place, or one carrying more than a repository: %s", async (repo) => {
    await expectRefusal(document([{ id: "house", repo }]), [JSON.stringify(repo)]);
  });

  it("refuses a repository carrying credentials without printing them", async () => {
    const read = readSkillSources(await rootWith(document([{ id: "house", repo: "https://user:s3cret-token@github.com/acme/skills" }])));

    expect(read).not.toHaveProperty("sources");
    expect(read).toMatchObject({ error: expect.stringContaining('"https://<credentials>@github.com/acme/skills"') });
    expect(JSON.stringify(read)).not.toContain("s3cret-token");
  });

  it.each(["", "House", "-house", "house-", "a--b", "a_b", "a/b", "x".repeat(65)])("refuses an id that is not a slug: %j", async (id) => {
    await expectRefusal(document([{ id, repo: "https://github.com/acme/skills" }]), ["slug"]);
  });

  it("refuses a wrong version, a missing or non-array sources list, a non-object source and a non-boolean allowScripts", async () => {
    await expectRefusal(JSON.stringify({ version: 2, sources: [] }), ["version"]);
    await expectRefusal(JSON.stringify({ sources: [] }), ["version"]);
    await expectRefusal(JSON.stringify({ version: 1 }), ["sources"]);
    await expectRefusal(JSON.stringify({ version: 1, sources: {} }), ["sources"]);
    await expectRefusal(document(["https://github.com/acme/skills"]), ["source 1"]);
    await expectRefusal(document([{ id: "house", repo: "https://github.com/acme/skills", allowScripts: "false" }]), ["allowScripts"]);
    await expectRefusal(document([{ id: "house" }]), ["repo"]);
    await expectRefusal(document([{ repo: "https://github.com/acme/skills" }]), ["slug"]);
  });

  it("refuses malformed JSON and a non-object root", async () => {
    await expectRefusal("{ version: 1 ", ["Malformed JSON"]);
    await expectRefusal("[]", ["object"]);
  });

  it("refuses the whole file when one source of several is bad, trusting none of them", async () => {
    await expectRefusal(
      document([
        { id: "house", repo: "https://github.com/acme/skills" },
        { id: "bad", repo: "http://github.com/acme/other" },
      ]),
      ['"bad"'],
    );
  });

  it("refuses a folder at the file's path", async () => {
    const folder = getRepo();
    await mkdir(join(folder.dir, SKILL_SOURCES_REL_PATH), { recursive: true });
    const asFolder = readSkillSources(folder.dir);
    expect(asFolder).not.toHaveProperty("sources");
    expect(asFolder).toMatchObject({ error: expect.stringContaining("not a plain file") });
  });

  // Windows: creating a file link needs a privilege the runners lack (EPERM), as test/merge/bakEscape.test.ts skips too.
  it.skipIf(process.platform === "win32")("refuses a link at the file's path, even to a valid file", async () => {
    const linked = getRepo();
    await linked.seedFiles({ "elsewhere.json": document([{ id: "house", repo: "https://github.com/acme/skills" }]) });
    await mkdir(join(linked.dir, ".stamity"), { recursive: true });
    await symlink(join(linked.dir, "elsewhere.json"), join(linked.dir, SKILL_SOURCES_REL_PATH));
    const asLink = readSkillSources(linked.dir);
    expect(asLink).not.toHaveProperty("sources");
    expect(asLink).toMatchObject({ error: expect.stringContaining("not a plain file") });
  });
});
