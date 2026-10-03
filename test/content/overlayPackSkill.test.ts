import { createHash } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addCommand } from "../../src/cli/commands/add.ts";
import { validateCommand, type ValidateFinding } from "../../src/cli/commands/validate.ts";
import {
  __resetContentRootCacheForTests,
  __setForkRootForTests,
} from "../../src/content/contentRoot.ts";
import { createManifest, writeManifest } from "../../src/manifest/manifest.ts";
import {
  buildContentIndex,
  originOf,
  toPosixDisplayPath,
  typeIdKey,
  type CatalogItem,
  type ContentIndex,
  type PackContentRoot,
} from "../../src/content/catalog.ts";
import { EngineError } from "../../src/types/errors.ts";
import { runInProcess } from "../support/inProcess.ts";
import { useTempDir } from "../support/tempDir.ts";
import { makeVolume } from "../support/vfs.ts";

/**
 * An overlay on a PACK SKILL (the debug run's defect 4). A pack skill's files
 * ship byte-for-byte from the installed pack — the pack lane never reads the
 * override tree — so a patch the walk merged was reported as applied and never
 * reached a client. The walk now refuses it at the user stage and skips it,
 * reported, at the fork stage; overlays on a pack's agents, commands and rules
 * still apply, because those classes emit from the merged index.
 *
 * The virtual-fs lane, as in `catalog.test.ts`: the walk is pure reading.
 */

const artifact = (frontmatter: string, body = "Body text.\n"): string =>
  `---\n${frontmatter}\n---\n${body}`;

const under = (dir: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]));

const CORPUS: Record<string, string> = {
  "rules/stamity-security.md": artifact(
    "id: security\ntype: rule\ndescription: Security floor.\ntags: [floor:security]",
  ),
};

/** One pack, `acme`, supplying one artifact of every class an overlay can patch. */
const ACME_PACK: Record<string, string> = {
  "skills/st-acme-lint/SKILL.md": artifact(
    "id: acme-lint\ntype: skill\ndescription: The acme lint skill.",
    "Lint the acme way.\n",
  ),
  "agents/stamity-acme-ops.md": artifact(
    "id: acme-ops\ntype: agent\ndescription: The acme ops agent.",
    "Pack agent body.\n",
  ),
  "commands/st-acme-drill.md": artifact(
    "id: acme-drill\ntype: command\ndescription: The acme drill command.",
    "Pack command body.\n",
  ),
  "rules/stamity-acme-guard.md": artifact(
    "id: acme-guard\ntype: rule\ndescription: The acme guard rule.",
    "Pack rule body.\n",
  ),
};

interface Walk {
  index: ContentIndex;
  forkRoot: string;
  overrideRoot: string;
}

/** The corpus, the fork layer, the override tree and (optionally) the acme pack, as one walk. */
async function walk(
  layers: { fork?: Record<string, string>; overrides?: Record<string, string> },
  withPack = true,
): Promise<Walk> {
  const volume = makeVolume({
    ...under("corpus", CORPUS),
    ...under("fork", layers.fork ?? {}),
    ...under("overrides", layers.overrides ?? {}),
    ...(withPack ? under("packs/acme", ACME_PACK) : {}),
  });
  const forkRoot = join(volume.root, "fork");
  const overrideRoot = join(volume.root, "overrides");
  const packRoots: PackContentRoot[] = withPack
    ? [{ pack: "acme", root: join(volume.root, "packs", "acme") }]
    : [];
  const index = await buildContentIndex(
    { root: join(volume.root, "corpus"), packRoots, forkRoot, overrideRoot },
    { fs: volume.fs },
  );
  return { index, forkRoot, overrideRoot };
}

/** The walk's refusal, asserted to be a `VALIDATION_ERROR`. */
async function refusalOf(run: () => Promise<unknown>): Promise<EngineError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe("VALIDATION_ERROR");
  return error;
}

function itemAt(index: ContentIndex, type: CatalogItem["type"], id: string): CatalogItem {
  const item = index.byKey.get(typeIdKey(type, id));
  expect(item, `no ${type} "${id}" in the index`).toBeDefined();
  return item as CatalogItem;
}

/** The override tree's root as the walk sees it, for composing expected absolute paths. */
const OVERRIDE_ROOT = join(makeVolume().root, "overrides");
const FORK_ROOT = join(makeVolume().root, "fork");

describe("an overlay on a pack skill", () => {
  describe("the user stage refuses it, naming the overlay, the pack and the skill", () => {
    it.each([
      ["the body half", "skills/acme-lint/SKILL.customize.md", "Escalate within the hour.\n"],
      ["the frontmatter half", "skills/acme-lint/SKILL.customize.yaml", "description: Ours.\n"],
    ])("%s", async (_, rel, text) => {
      const refusal = await refusalOf(() => walk({ overrides: { [rel]: text } }));

      const posix = toPosixDisplayPath(join(OVERRIDE_ROOT, ...rel.split("/")));
      expect(refusal.message).toContain("Overlays on pack skills are not applied");
      // Named twice: as the overlay, and as the file to remove or rename.
      expect(refusal.message.split(`"${posix}"`)).toHaveLength(2);
      expect(refusal.message).toContain(`Remove or rename ${posix}`);
      expect(refusal.message).toContain('patches pack "acme" skill "acme-lint"');
      expect(refusal.message).toContain("belongs in the pack's own source");
      // Removing the pack is no remedy: the overlay is then an orphan, refused
      // again (pinned below, "once the pack is gone").
      expect(refusal.message).not.toContain("clean --pack");
      // POSIX on every platform: `validate` attributes the refusal by this path.
      expect(refusal.message).not.toContain("\\");
    });

    it("names both halves when the carrier holds both", async () => {
      const refusal = await refusalOf(() =>
        walk({
          overrides: {
            "skills/acme-lint/SKILL.customize.yaml": "description: Ours.\n",
            "skills/acme-lint/SKILL.customize.md": "House step.\n",
          },
        }),
      );

      const yaml = toPosixDisplayPath(join(OVERRIDE_ROOT, "skills", "acme-lint", "SKILL.customize.yaml"));
      const md = toPosixDisplayPath(join(OVERRIDE_ROOT, "skills", "acme-lint", "SKILL.customize.md"));
      expect(refusal.message).toContain(`the overlay at "${yaml}" and "${md}" patches pack "acme"`);
      expect(refusal.message).toContain(`Remove or rename ${yaml} and ${md}`);
    });

    it("keeps the exclusivity refusal first when the carrier also replaces the skill whole", async () => {
      const refusal = await refusalOf(() =>
        walk({
          overrides: {
            "skills/acme-lint/SKILL.md": artifact(
              "id: acme-lint\ntype: skill\ndescription: Our own lint skill.",
            ),
            "skills/acme-lint/SKILL.customize.md": "House step.\n",
          },
        }),
      );

      expect(refusal.message).toContain("never both");
      expect(refusal.message).not.toContain("Overlays on pack skills");
    });

    it("is an orphan overlay, refused as one, once the pack is gone", async () => {
      const refusal = await refusalOf(() =>
        walk({ overrides: { "skills/acme-lint/SKILL.customize.md": "House step.\n" } }, false),
      );

      expect(refusal.message).toContain("no artifact of that id exists");
      expect(refusal.message).not.toContain("Overlays on pack skills");
    });
  });

  it("the fork stage skips it and reports each half, leaving the pack skill as shipped", async () => {
    const fork = {
      "skills/acme-lint/SKILL.customize.yaml": "description: The fork's lint skill.\n",
      "skills/acme-lint/SKILL.customize.md": "Fork step.\n",
    };
    const { index } = await walk({ fork });

    const skill = itemAt(index, "skill", "acme-lint");
    expect(originOf(skill)).toBe("pack");
    expect(skill.description).toBe("The acme lint skill.");
    expect(skill.body).toBe("Lint the acme way.\n");

    const skipped = index.skipped ?? [];
    expect(skipped.map((entry) => entry.filePath)).toEqual([
      join(FORK_ROOT, "skills", "acme-lint", "SKILL.customize.yaml"),
      join(FORK_ROOT, "skills", "acme-lint", "SKILL.customize.md"),
    ]);
    for (const entry of skipped) {
      expect(entry.type).toBe("skill");
      expect(entry.reason).toContain('patches pack "acme" skill "acme-lint"');
      expect(entry.reason).toContain("overlays on pack skills are not applied");
      expect(entry.reason).toContain("skipped");
      // Not the orphan reason: the base exists, and nothing waits for it.
      expect(entry.reason).not.toContain("waits for an artifact");
    }
  });

  it("a fork patch of a skill no layer supplies is skipped without promising a pack would apply it", async () => {
    const { index } = await walk({ fork: { "skills/acme-lint/SKILL.customize.md": "Fork step.\n" } }, false);

    const skipped = index.skipped ?? [];
    expect(skipped.map((entry) => entry.filePath)).toEqual([
      join(FORK_ROOT, "skills", "acme-lint", "SKILL.customize.md"),
    ]);
    const reason = skipped[0]?.reason ?? "";
    expect(reason).toContain("waits for an artifact no installed layer supplies");
    expect(reason).toContain('it does not apply even once a pack supplies skill "acme-lint"');
    expect(reason).not.toContain("it applies when a pack supplies");
  });

  it("the fork-stage skip does not shield the user stage: a user overlay of the same skill is still refused", async () => {
    const refusal = await refusalOf(() =>
      walk({
        fork: { "skills/acme-lint/SKILL.customize.md": "Fork step.\n" },
        overrides: { "skills/acme-lint/SKILL.customize.md": "House step.\n" },
      }),
    );

    expect(refusal.message).toContain('patches pack "acme" skill "acme-lint"');
    expect(refusal.message).toContain(
      toPosixDisplayPath(join(OVERRIDE_ROOT, "skills", "acme-lint", "SKILL.customize.md")),
    );
  });
});

describe("an overlay on a pack's other classes still applies", () => {
  it.each([
    ["agent", "acme-ops", "agents/acme-ops.customize.yaml", "agents/acme-ops.customize.md"],
    ["command", "cmd-acme-drill", "commands/acme-drill.customize.yaml", "commands/acme-drill.customize.md"],
    ["rule", "acme-guard", "rules/acme-guard.customize.yaml", "rules/acme-guard.customize.md"],
  ] as const)("a pack %s, at the user and the fork stage", async (type, id, yamlRel, mdRel) => {
    const { index } = await walk({
      fork: { [mdRel]: "Fork addendum.\n" },
      overrides: { [yamlRel]: "description: Patched by the repo.\n" },
    });

    const item = itemAt(index, type, id);
    expect(originOf(item)).toBe("pack");
    expect(item.provenance?.pack).toBe("acme");
    expect(item.description).toBe("Patched by the repo.");
    expect(item.body).toMatch(/body\.\n\nFork addendum\.\n$/u);
    expect(index.skipped ?? []).toEqual([]);
  });
});

/**
 * The fork-stage skip as `validate` reports it: a real temp repository with the
 * acme pack installed through `add`, and a fork layer pinned through the
 * content-root seam (as in `test/cli/commands/validate.test.ts`). The walk's
 * skip must surface as a warning at exit 0, with no `patched` row, because
 * nothing in the consumer's repository can fix a file in its package.
 */
describe("validate — a fork patch of an installed pack's skill", () => {
  // Real temp directories: `validate` and `add` read the filesystem directly.
  // oxlint-disable-next-line no-underscore-dangle
  afterEach(() => __resetContentRootCacheForTests());
  const getRepo = useTempDir("stamity-overlay-pack-skill");

  it("reports a warning naming the pack and the skill, and exits 0", async () => {
    const repo = getRepo();
    const skill = ACME_PACK["skills/st-acme-lint/SKILL.md"] ?? "";
    const digest = createHash("sha256").update(skill, "utf8").digest("hex");
    await repo.seedFiles({
      "packs/acme/skills/st-acme-lint/SKILL.md": skill,
      "packs/acme/pack.json": `${JSON.stringify(
        { name: "acme", version: "1.0.0", integrity: { "skills/st-acme-lint/SKILL.md": digest } },
        null,
        2,
      )}\n`,
      "pkg/fork/skills/acme-lint/SKILL.customize.md": "Fork step.\n",
    });
    await writeManifest(
      repo.dir,
      createManifest({
        tools: ["claude"],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: "0.0.0",
      }),
    );
    const added = await runInProcess(
      [addCommand],
      ["add", "./packs/acme", "--allow-untrusted", "-y"],
      { cwd: repo.dir },
    );
    expect(added.code, `fixture: the pack must install — ${added.stderr}`).toBe(0);
    // oxlint-disable-next-line no-underscore-dangle
    __setForkRootForTests(repo.path("pkg", "fork"));

    const result = await runInProcess([validateCommand], ["validate", "--json"], {
      cwd: repo.dir,
    });

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout.trim()) as {
      errorCount: number;
      warningCount: number;
      findings: ValidateFinding[];
      shadows: unknown[];
    };
    expect(doc.errorCount).toBe(0);
    expect(doc.findings).toEqual([
      expect.objectContaining({
        source: "user-content",
        path: "fork/skills/acme-lint/SKILL.customize.md",
        severity: "warning",
      }),
    ]);
    expect(doc.findings[0]?.message).toContain('patches pack "acme" skill "acme-lint"');
    expect(doc.findings[0]?.message).toContain("overlays on pack skills are not applied");
    // Nothing merged, so nothing reads as patched.
    expect(doc.shadows).toEqual([]);
  });
});
