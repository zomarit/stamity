// The `__`-prefixed test seams keep the naming convention their module declares.
// oxlint-disable no-underscore-dangle
import { symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  COMMAND_ID_PREFIX,
  applyCommandPrefix,
  assertSafePath,
  buildContentIndex,
  contentRootsOf,
  getAllItemsById,
  originOf,
  resolveArtifactFilePath,
  typeIdKey,
  type CatalogFs,
  type CatalogItem,
  type ContentCollision,
  type ContentIndex,
  type ContentShadow,
  type PackContentRoot,
} from "../../src/content/catalog.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { MAX_USER_CONTENT_LENGTH } from "../../src/guard/promptGuard.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";
import { makeVolume } from "../support/vfs.ts";

/**
 * The virtual-fs lane throughout: the walk is pure reading, and a corpus shape
 * is cheaper to state as a literal than to lay out on disk. The one real-path
 * dependency, the bundled-root default, is exercised through the content-root
 * test seam rather than by staging a package layout.
 */

/** A markdown artifact: fenced frontmatter over a body. */
const artifact = (frontmatter: string, body = "Body text.\n"): string =>
  `---\n${frontmatter}\n---\n${body}`;

const CORPUS: Record<string, string> = {
  "agents/stamity-implementer.md": artifact(
    "id: implementer\ntype: agent\ndescription: Writes the change.\ntags: [implementation, ctx:team-only]",
  ),
  // Support trees beside the artifacts — the shape the corpus actually ships.
  "agents/shared/quality-charter.md": artifact("id: quality-charter\ntype: agent"),
  "agents/modes/research.md": "No frontmatter here.\n",
  "skills/stamity-recipe/SKILL.md": artifact(
    "id: recipe\ntype: skill\ndescription: Runs a recipe.\ntags: [planning]",
  ),
  "rules/stamity-security.md": artifact(
    "id: security\ntype: rule\ndescription: Security floor.\ntags: [floor:security]\nprecedence: critical",
  ),
  // The Cursor twin sits beside the rule and is not an artifact of its own.
  "rules/stamity-security.mdc": "---\nalwaysApply: true\n---\nBody text.\n",
  "commands/stamity-plan.md": artifact(
    "id: plan\ntype: command\ndescription: Plans the work.\ntags: [planning]",
  ),
};

/** A filesystem that fails every call with a code the walk must not treat as absence. */
const denied = (): Promise<never> =>
  Promise.reject(Object.assign(new Error("permission denied"), { code: "EACCES" }));

async function indexOf(
  files: Record<string, string>,
): Promise<{ index: ContentIndex; root: string }> {
  const volume = makeVolume(files);
  return { index: await buildContentIndex(volume.root, { fs: volume.fs }), root: volume.root };
}

/** Re-keys a tree of files under one directory, so several roots share a volume. */
const under = (dir: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]));

/**
 * The corpus and the repo's override tree as two roots of one walk — the shape
 * a real run has, where `.stamity/overrides/` sits outside the bundled corpus.
 * Seeding an empty override map leaves the directory absent, which is the
 * "repo has customized nothing" case.
 */
async function overlayIndexOf(
  corpus: Record<string, string>,
  overrides: Record<string, string>,
): Promise<{
  index: ContentIndex;
  root: string;
  overrideRoot: string;
  volume: ReturnType<typeof makeVolume>;
}> {
  const volume = makeVolume({ ...under("corpus", corpus), ...under("overrides", overrides) });
  const root = join(volume.root, "corpus");
  const overrideRoot = join(volume.root, "overrides");
  const index = await buildContentIndex({ root, overrideRoot }, { fs: volume.fs });
  return { index, root, overrideRoot, volume };
}

/** Every item as `[origin, type, id]`, the triple the layered rules are about. */
const layerRows = (index: ContentIndex): Array<[string, string, string]> =>
  index.items.map((item) => [originOf(item), item.type, item.id]);

/** The single shadow row, asserted present so cases read as one line. */
function oneShadow(index: ContentIndex): ContentShadow {
  const shadows = index.shadows ?? [];
  expect(shadows, "expected exactly one shadow row").toHaveLength(1);
  return shadows[0] as ContentShadow;
}

/** The item under `type:id`, asserted present so cases read as one line. */
function itemAt(index: ContentIndex, type: CatalogItem["type"], id: string): CatalogItem {
  const item = index.byKey.get(typeIdKey(type, id));
  expect(item, `no ${type} "${id}" in the index`).toBeDefined();
  return item as CatalogItem;
}

function expectEngineError(run: () => unknown, code: EngineError["code"]): EngineError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

/** Async twin of {@link expectEngineError}. */
async function expectRejection(
  run: () => Promise<unknown>,
  code: EngineError["code"],
): Promise<EngineError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(EngineError);
  const error = thrown as EngineError;
  expect(error.code).toBe(code);
  return error;
}

describe("buildContentIndex", () => {
  afterEach(() => {
    __resetContentRootCacheForTests();
  });

  it("indexes every class with its declared identity, in class then name order", async () => {
    const { index, root } = await indexOf(CORPUS);

    expect(index.collisions).toEqual([]);
    expect(index.items.map((item) => [item.type, item.id])).toEqual([
      ["agent", "implementer"],
      ["skill", "recipe"],
      ["rule", "security"],
      ["command", "cmd-plan"],
    ]);

    const agent = itemAt(index, "agent", "implementer");
    expect(agent.description).toBe("Writes the change.");
    expect(agent.tags).toEqual(["implementation", "ctx:team-only"]);
    expect(agent.body).toBe("Body text.\n");
    expect(agent.frontmatter.type).toBe("agent");
    expect(agent.relativePath).toBe("agents/stamity-implementer.md");
    expect(agent.filePath).toBe(join(root, "agents", "stamity-implementer.md"));

    // A skill is addressed by its directory but read — and indexed — as a file,
    // so `filePath` is directly readable for every class.
    const skill = itemAt(index, "skill", "recipe");
    expect(skill.relativePath).toBe("skills/stamity-recipe/SKILL.md");
    expect(skill.filePath).toBe(join(root, "skills", "stamity-recipe", "SKILL.md"));

    expect(itemAt(index, "rule", "security").precedence).toBe("critical");
    // Optionals stay absent rather than present-and-undefined.
    expect("precedence" in agent).toBe(false);
    expect("tools" in agent).toBe(false);
  });

  it("indexes the `.md` rule and not its `.mdc` twin", async () => {
    const { index } = await indexOf(CORPUS);

    expect(index.items.filter((item) => item.type === "rule")).toHaveLength(1);
    expect(index.items.some((item) => item.relativePath.endsWith(".mdc"))).toBe(false);
  });

  it("reports one collision naming both claimants when two rules share an id", async () => {
    const declaration = "id: security\ntype: rule\ndescription: Security floor.";
    const { index } = await indexOf({
      "rules/stamity-security.md": artifact(declaration, "Original.\n"),
      "rules/stamity-security-copy.md": artifact(declaration, "Copy.\n"),
    });

    // Typed against the exported interface, not an inline literal: a rename or a
    // dropped field on `ContentCollision` then fails to compile here instead of
    // leaving this expectation quietly asserting a shape the module no longer has.
    const expected: ContentCollision[] = [
      {
        key: "rule:security",
        paths: ["rules/stamity-security-copy.md", "rules/stamity-security.md"],
        kind: "duplicate-id",
      },
    ];
    expect(index.collisions.filter((entry) => entry.kind === "duplicate-id")).toEqual(expected);
    // The index still builds, and the first claimant in walk order — name order
    // within the class, where `-` sorts before `.` — is the one lookups reach.
    expect(index.items).toHaveLength(2);
    expect(itemAt(index, "rule", "security").body).toBe("Copy.\n");
    // The second file's name cannot also match the shared id, so the walk
    // reports that mismatch alongside the duplicate.
    expect(index.collisions.map((entry) => entry.kind)).toEqual([
      "filename-mismatch",
      "duplicate-id",
    ]);
  });

  it("skips a skill directory that has no SKILL.md", async () => {
    const { index } = await indexOf({
      "skills/stamity-recipe/SKILL.md": artifact("id: recipe\ntype: skill"),
      "skills/stamity-empty/README.md": "Notes about a skill that was never written.\n",
    });

    expect(index.items.map((item) => item.id)).toEqual(["recipe"]);
    expect(index.collisions).toEqual([]);
  });

  it("carries a tools restriction through to the item", async () => {
    const { index } = await indexOf({
      "agents/stamity-implementer.md": artifact(
        "id: implementer\ntype: agent\ndescription: Writes the change.\ntools: [claude]",
      ),
    });

    expect(itemAt(index, "agent", "implementer").tools).toEqual(["claude"]);
  });

  it("rejects an unknown tool name rather than shipping the artifact everywhere", async () => {
    const error = await expectRejection(
      () =>
        indexOf({
          "agents/stamity-implementer.md": artifact("id: implementer\ntools: [claud]"),
        }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("agents/stamity-implementer.md");
    expect(error.message).toContain("claud");
  });

  it("skips a file with no frontmatter instead of failing the walk", async () => {
    const { index } = await indexOf({
      "agents/README.md": "How the agents in this directory fit together.\n",
      "agents/stamity-implementer.md": artifact("id: implementer\ntype: agent"),
    });

    expect(index.items.map((item) => item.id)).toEqual(["implementer"]);
  });

  it("fails loudly on frontmatter that is present but malformed", async () => {
    const error = await expectRejection(
      () => indexOf({ "rules/stamity-security.md": "---\nid: [unterminated\n---\nBody.\n" }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("rules/stamity-security.md");
  });

  it("prefers the declared id over the filename slug and reports the mismatch", async () => {
    const { index } = await indexOf({
      "agents/stamity-reviewer.md": artifact("id: critic\ntype: agent\ndescription: Reviews."),
    });

    expect(index.items.map((item) => item.id)).toEqual(["critic"]);
    expect(index.byKey.has(typeIdKey("agent", "reviewer"))).toBe(false);
    const expected: ContentCollision[] = [
      { key: "agent:critic", paths: ["agents/stamity-reviewer.md"], kind: "filename-mismatch" },
    ];
    expect(index.collisions).toEqual(expected);
  });

  it("falls back to the prefix-stripped filename when no id is declared", async () => {
    const { index } = await indexOf({
      "agents/stamity-reviewer.md": artifact("type: agent\ndescription: Reviews."),
      "commands/stamity-plan.md": artifact("type: command\ndescription: Plans."),
    });

    expect(index.items.map((item) => item.id)).toEqual(["reviewer", "cmd-plan"]);
    expect(index.collisions).toEqual([]);
  });

  it("returns an empty index for an empty corpus", async () => {
    const { index } = await indexOf({});

    expect(index.items).toEqual([]);
    expect(index.byKey.size).toBe(0);
    expect(index.collisions).toEqual([]);
  });

  it("walks over support subdirectories without cataloguing them", async () => {
    const { index } = await indexOf(CORPUS);

    expect(index.items.map((item) => item.relativePath)).not.toContain(
      "agents/shared/quality-charter.md",
    );
    expect(getAllItemsById(index, "quality-charter")).toEqual([]);
    expect(index.items.filter((item) => item.type === "agent")).toHaveLength(1);
  });

  it("refuses an id that addresses a path outside the content root", async () => {
    const error = await expectRejection(
      () => indexOf({ "agents/stamity-evil.md": artifact("id: ../../etc/passwd\ntype: agent") }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("agents/stamity-evil.md");
    expect(error.message).toContain("`..` segment");
  });

  it("refuses a traversal id on a command, where the `cmd-` prefix would mask it", async () => {
    const error = await expectRejection(
      () => indexOf({ "commands/stamity-evil.md": artifact("id: ../../etc/passwd\ntype: command") }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain("`..` segment");
  });

  it("reads the bundled corpus root when no root is given", async () => {
    const volume = makeVolume({ "agents/stamity-implementer.md": artifact("id: implementer") });
    __setContentRootForTests(volume.root);

    const index = await buildContentIndex(undefined, { fs: volume.fs });

    expect(index.items.map((item) => item.id)).toEqual(["implementer"]);
  });

  it("propagates a read failure that is not absence", async () => {
    const fs: CatalogFs = { readdir: denied, readFile: denied };

    await expect(buildContentIndex("/corpus", { fs })).rejects.toThrow("permission denied");
  });
});

describe("the override layer", () => {
  const getTemp = useTempDir("catalog-override");

  /** The repo's own version of the corpus security rule. */
  const REPO_RULE = artifact(
    "id: security\ntype: rule\ndescription: The repo's own security floor.\ntags: [floor:security]",
    "Repo body.\n",
  );

  it("makes an override the sole claimant of the id it takes over", async () => {
    const { index, overrideRoot } = await overlayIndexOf(CORPUS, { "rules/security.md": REPO_RULE });

    // One indexed artifact for the id, and it is the repo's. Emitting the
    // corpus body alongside it is the failure this replaces.
    expect(index.items.filter((item) => item.type === "rule")).toHaveLength(1);
    const winner = itemAt(index, "rule", "security");
    expect(originOf(winner)).toBe("user");
    expect(winner.body).toBe("Repo body.\n");
    expect(winner.filePath).toBe(join(overrideRoot, "rules", "security.md"));
    expect(resolveArtifactFilePath(index, "rule", "security")).toBe(winner.filePath);

    // The replaced artifact is accounted for rather than silently gone.
    const shadow = oneShadow(index);
    expect(shadow.type).toBe("rule");
    expect(shadow.id).toBe("security");
    expect(shadow.winner).toBe(winner);
    expect(shadow.shadowed.map((item) => item.relativePath)).toEqual(["rules/stamity-security.md"]);
    expect(shadow.shadowed.map((item) => originOf(item))).toEqual(["corpus"]);
    // A shadow is the customization lane working, not a contested identity.
    expect(index.collisions).toEqual([]);
  });

  it("accounts for every replaced claimant, not just the one lookups reached", async () => {
    const declaration = "id: security\ntype: rule\ndescription: Security floor.";
    const { index } = await overlayIndexOf(
      {
        "rules/stamity-security.md": artifact(declaration, "Corpus original.\n"),
        "rules/stamity-security-copy.md": artifact(declaration, "Corpus copy.\n"),
      },
      { "rules/security.md": REPO_RULE },
    );

    // Both corpus files stopped being emitted, so a report that named one of
    // them would send the author to the wrong file.
    expect(layerRows(index)).toEqual([["user", "rule", "security"]]);
    expect(oneShadow(index).shadowed.map((item) => item.relativePath)).toEqual([
      "rules/stamity-security-copy.md",
      "rules/stamity-security.md",
    ]);
    // The corpus's own duplicate is still reported: the two surfaces answer
    // different questions.
    expect(index.collisions.map((entry) => entry.kind)).toContain("duplicate-id");
  });

  it("reports two overrides of one id as a same-layer collision, not a shadow", async () => {
    const declaration = "id: helper\ntype: agent\ndescription: The repo's helper.";
    const { index } = await overlayIndexOf(
      {},
      {
        "agents/helper.md": artifact(declaration, "First.\n"),
        "agents/helper-copy.md": artifact(declaration, "Second.\n"),
      },
    );

    // Neither replaced anything, so neither is a shadow — this is the corpus's
    // duplicate-id posture applied inside the user layer.
    expect(index.shadows).toEqual([]);
    expect(index.items).toHaveLength(2);
    const expected: ContentCollision[] = [
      {
        key: "agent:helper",
        paths: ["agents/helper-copy.md", "agents/helper.md"],
        kind: "duplicate-id",
      },
    ];
    expect(index.collisions.filter((entry) => entry.kind === "duplicate-id")).toEqual(expected);
    expect(itemAt(index, "agent", "helper").body).toBe("Second.\n");
  });

  it("keeps the first override as the winner when two of them claim a corpus id", async () => {
    const declaration = "id: security\ntype: rule\ndescription: Repo floor.";
    const { index } = await overlayIndexOf(CORPUS, {
      "rules/a-security.md": artifact(declaration, "First.\n"),
      "rules/security.md": artifact(declaration, "Second.\n"),
    });

    const shadow = oneShadow(index);
    expect(shadow.winner.relativePath).toBe("rules/a-security.md");
    expect(shadow.shadowed.map((item) => item.relativePath)).toEqual(["rules/stamity-security.md"]);
    expect(index.collisions.some((entry) => entry.kind === "duplicate-id")).toBe(true);
    // The corpus rule is gone; both overrides remain, one reachable.
    expect(index.items.filter((item) => item.type === "rule").map((item) => originOf(item))).toEqual(
      ["user", "user"],
    );
  });

  it("takes an id from an installed pack as readily as from the corpus", async () => {
    const volume = makeVolume({
      ...under("corpus", CORPUS),
      ...under("pack", {
        "rules/stamity-ops.md": artifact("id: ops\ntype: rule\ndescription: Pack ops floor."),
      }),
      ...under("overrides", {
        "rules/ops.md": artifact("id: ops\ntype: rule\ndescription: Repo ops floor.", "Repo ops.\n"),
      }),
    });
    const packRoots: PackContentRoot[] = [{ pack: "ops", root: join(volume.root, "pack") }];

    const index = await buildContentIndex(
      {
        root: join(volume.root, "corpus"),
        packRoots,
        overrideRoot: join(volume.root, "overrides"),
      },
      { fs: volume.fs },
    );

    // The pack-shadowing refusal is about packs taking someone else's id; a
    // repo overriding a pack artifact is the customization lane, and wins.
    const winner = itemAt(index, "rule", "ops");
    expect(originOf(winner)).toBe("user");
    expect(winner.body).toBe("Repo ops.\n");
    const shadow = oneShadow(index);
    expect(shadow.shadowed.map((item) => item.provenance?.pack)).toEqual(["ops"]);
    expect(index.items.some((item) => item.provenance !== undefined)).toBe(false);
  });

  it("adds an override that claims a fresh id without recording a shadow", async () => {
    const { index } = await overlayIndexOf(CORPUS, {
      "agents/house-style.md": artifact("id: house-style\ntype: agent\ndescription: Ours."),
    });

    expect(index.shadows).toEqual([]);
    expect(index.collisions).toEqual([]);
    expect(originOf(itemAt(index, "agent", "house-style"))).toBe("user");
    // Nothing the corpus supplied moved.
    expect(index.items.filter((item) => originOf(item) === "corpus")).toHaveLength(4);
  });

  it("indexes identically with and without an override root, so no shipped lane regresses", async () => {
    const volume = makeVolume({
      ...under("corpus", CORPUS),
      ...under("pack", {
        "rules/stamity-ops.md": artifact("id: ops\ntype: rule\ndescription: Pack ops floor."),
      }),
    });
    const root = join(volume.root, "corpus");
    const packRoots: PackContentRoot[] = [{ pack: "ops", root: join(volume.root, "pack") }];

    const plain = await buildContentIndex(root, { fs: volume.fs, packRoots });
    // An override root whose directory does not exist: the common case, and a
    // non-event — not a stat failure, not a warning.
    const overlaid = await buildContentIndex(
      { root, packRoots, overrideRoot: join(volume.root, "overrides") },
      { fs: volume.fs },
    );

    expect(overlaid.items).toEqual(plain.items);
    expect(overlaid.collisions).toEqual(plain.collisions);
    expect([...overlaid.byKey.entries()]).toEqual([...plain.byKey.entries()]);
    expect(plain.shadows).toEqual([]);
    expect(overlaid.shadows).toEqual([]);
    // Each layer stamps its own items, corpus included.
    expect(layerRows(plain)).toEqual([
      ["corpus", "agent", "implementer"],
      ["corpus", "skill", "recipe"],
      ["corpus", "rule", "security"],
      ["corpus", "command", "cmd-plan"],
      ["pack", "rule", "ops"],
    ]);
  });

  it("orders the merged index by layer, and repeats that order build over build", async () => {
    const overrides = {
      "agents/house-style.md": artifact("id: house-style\ntype: agent\ndescription: Ours."),
      "rules/security.md": REPO_RULE,
    };
    const first = await overlayIndexOf(CORPUS, overrides);
    const second = await overlayIndexOf(CORPUS, overrides);

    // Layer order first, then the walk order within a layer. A downstream
    // golden goes flaky the moment this stops holding.
    expect(layerRows(first.index)).toEqual([
      ["corpus", "agent", "implementer"],
      ["corpus", "skill", "recipe"],
      ["corpus", "command", "cmd-plan"],
      ["user", "agent", "house-style"],
      ["user", "rule", "security"],
    ]);
    expect(layerRows(second.index)).toEqual(layerRows(first.index));
  });

  it("reports an override's id/filename disagreement exactly as the corpus walk does", async () => {
    const { index } = await overlayIndexOf(
      {},
      { "rules/security.md": artifact("id: house-rule\ntype: rule\ndescription: Ours.") },
    );

    // No lenient path for user content here: shape is shape. Leniency belongs
    // to the gates that judge a body.
    const expected: ContentCollision[] = [
      { key: "rule:house-rule", paths: ["rules/security.md"], kind: "filename-mismatch" },
    ];
    expect(index.collisions).toEqual(expected);
    expect(index.items.map((item) => item.id)).toEqual(["house-rule"]);
  });

  it("indexes a `stamity-`-prefixed override id without reading it as engine ownership", async () => {
    const { index } = await overlayIndexOf(CORPUS, {
      "rules/stamity-security.md": artifact(
        "id: stamity-security\ntype: rule\ndescription: Ours.",
        "Repo body.\n",
      ),
    });

    // The declared id is what it says it is: `stamity-security`, which is NOT
    // the corpus rule's id, so nothing is replaced and the walk does not crash.
    expect(index.items.map((item) => item.id)).toContain("stamity-security");
    expect(index.shadows).toEqual([]);
    expect(itemAt(index, "rule", "security").body).toBe("Body text.\n");
    expect(index.collisions.map((entry) => entry.kind)).toEqual(["filename-mismatch"]);
  });

  it("skips an override file that declares no frontmatter", async () => {
    const { index } = await overlayIndexOf(CORPUS, {
      "rules/notes.md": "Working notes about a rule that was never written.\n",
      "rules/security.md": REPO_RULE,
    });

    expect(index.items.map((item) => item.relativePath)).not.toContain("rules/notes.md");
    expect(originOf(itemAt(index, "rule", "security"))).toBe("user");
  });

  it("refuses a traversal or separator-bearing id inside the override tree", async () => {
    const traversal = await expectRejection(
      () => overlayIndexOf({}, { "rules/evil.md": artifact("id: ../../etc/passwd\ntype: rule") }),
      "VALIDATION_ERROR",
    );
    expect(traversal.message).toContain("rules/evil.md");
    // Root-qualified: `rules/evil.md` alone reads the same in every layer, so the
    // refusal has to say which tree the offending file sits in.
    expect(traversal.message).toContain("overrides/rules/evil.md");
    expect(traversal.message).toContain("`..` segment");

    const separator = await expectRejection(
      () => overlayIndexOf({}, { "rules/evil.md": artifact("id: nested\\rule\ntype: rule") }),
      "VALIDATION_ERROR",
    );
    expect(separator.message).toContain("backslash separator");
  });

  /**
   * Regression. A content-root-relative `source` spells a corpus file, a pack
   * copy, and an override identically, so a malformed override sent the author
   * to whichever twin they found first — and `rules/stamity-security.md` exists
   * in both trees here precisely to make that confusion reproducible. Each layer
   * has its own root, so the absolute path is unambiguous by construction.
   */
  it("names the override tree's own file, not its corpus twin, when an override is malformed", async () => {
    const malformedYaml = await expectRejection(
      () =>
        overlayIndexOf(CORPUS, {
          "rules/stamity-security.md": "---\nid: [unterminated\n---\nBody.\n",
        }),
      "VALIDATION_ERROR",
    );
    expect(malformedYaml.message).toContain("overrides/rules/stamity-security.md");

    const badField = await expectRejection(
      () =>
        overlayIndexOf(CORPUS, {
          "rules/security.md": artifact("id: security\ntype: rule\ntags: 3"),
        }),
      "VALIDATION_ERROR",
    );
    expect(badField.message).toContain("overrides/rules/security.md");
    // The offending field is named alongside the file: both halves of "which
    // file, which key" are what make the message actionable.
    expect(badField.message).toContain("`tags`");
  });

  it("keeps a skill override addressable as the whole directory it is", async () => {
    const { index, overrideRoot, volume } = await overlayIndexOf(CORPUS, {
      "skills/recipe/SKILL.md": artifact("id: recipe\ntype: skill\ndescription: Ours.", "Ours.\n"),
      "skills/recipe/references/checklist.md": "Step one.\n",
    });

    // A skill is addressed by its directory, so the support subtree beside
    // `SKILL.md` has to be reachable from the indexed item — that is what makes
    // an override projectable the way a corpus skill is.
    const skill = itemAt(index, "skill", "recipe");
    expect(skill.filePath).toBe(join(overrideRoot, "skills", "recipe", "SKILL.md"));
    expect(originOf(skill)).toBe("user");
    const reference = await volume.fs.readFile(
      join(dirname(skill.filePath), "references", "checklist.md"),
      "utf8",
    );
    expect(reference).toBe("Step one.\n");
    expect(oneShadow(index).shadowed.map((item) => item.relativePath)).toEqual([
      "skills/stamity-recipe/SKILL.md",
    ]);
  });

  it("skips symlinked entries in the override tree", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/rules/stamity-security.md": artifact("id: security\ntype: rule"),
      "overrides/rules/real.md": artifact("id: real\ntype: rule\ndescription: Ours."),
      "outside/sneaky.md": artifact("id: sneaky\ntype: rule\ndescription: Not ours."),
      "outside/skill/SKILL.md": artifact("id: linked\ntype: skill\ndescription: Not ours."),
    });
    // Real filesystem, real links: nothing outside the override tree may be
    // pulled in by one, whatever the entry is named.
    await symlink(temp.path("outside", "sneaky.md"), temp.path("overrides", "rules", "link.md"));
    await symlink(temp.path("outside", "skill"), temp.path("overrides", "skills"));

    const index = await buildContentIndex({
      root: temp.path("corpus"),
      overrideRoot: temp.path("overrides"),
    });

    expect(index.items.map((item) => item.id)).toEqual(["security", "real"]);
    expect(index.shadows).toEqual([]);
  });

  it("skips a symlinked SKILL.md inside a REAL skill directory, in every layer", async () => {
    // A skill's readable file is COMPOSED (`skills/<dir>/SKILL.md`)
    // rather than listed, so the entry-kind filter judged the directory and
    // nothing judged the file inside it: the link was opened and its target's
    // bytes were indexed — reaching emission (host bytes into a tracked repo
    // path) and `validate` (target bytes into CI logs) — against the explicit
    // "never followed silently" guarantee both walks state.
    const temp = getTemp();
    await temp.seedFiles({
      "outside/HOST.md": artifact("id: host\ntype: skill\ndescription: Host bytes."),
      "corpus/skills/stamity-real/SKILL.md": artifact(
        "id: real\ntype: skill\ndescription: Ours.",
      ),
      "corpus/skills/stamity-linked/.keep": "",
      "packs/ops/skills/stamity-packlinked/.keep": "",
      "overrides/skills/userlinked/.keep": "",
    });
    for (const [dir, root] of [
      ["stamity-linked", "corpus"],
      ["stamity-packlinked", "packs/ops"],
      ["userlinked", "overrides"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- three fixture links, order irrelevant
      await symlink(
        temp.path("outside", "HOST.md"),
        temp.path(...root.split("/"), "skills", dir, "SKILL.md"),
      );
    }

    const index = await buildContentIndex(
      {
        root: temp.path("corpus"),
        overrideRoot: temp.path("overrides"),
        packRoots: [{ pack: "ops", root: temp.path("packs", "ops") }],
      },
    );

    // The host artifact reaches neither the index nor any lookup.
    expect(index.items.map((item) => item.id)).toEqual(["real"]);
    expect(index.byKey.has(typeIdKey("skill", "host"))).toBe(false);
    expect(index.items.some((item) => item.body.includes("Body text."))).toBe(true);

    // And the skip is REPORTED, in all three layers — a walk that silently
    // dropped the file leaves an author with a tree that looks customized and
    // a sync that emits the bundled body.
    const skipped = index.skipped ?? [];
    expect(skipped).toHaveLength(3);
    for (const entry of skipped) {
      expect(entry.type).toBe("skill");
      expect(entry.filePath.endsWith("SKILL.md")).toBe(true);
      expect(entry.reason).toContain("symlink");
    }
  });

  it("reports no skipped entries for a corpus with no links", async () => {
    const { index } = await indexOf(CORPUS);
    expect(index.skipped).toEqual([]);
  });
});

describe("the overlay layer", () => {
  /**
   * The overlay lane's own block, beside the override layer's. An overlay states
   * a DELTA — `.customize.yaml` patches frontmatter, `.customize.md` appends to
   * the body — so the base keeps flowing from whichever layer supplies it, and
   * every defect is loud (docs/specs/overlay-layers.md, REQ-OVERLAY-002..010).
   */

  /** A base rule carrying every frontmatter shape an overlay can act on. */
  const BASE_RULE = artifact(
    "id: security\ntype: rule\ndescription: Security floor.\ntags: [floor:security]\n" +
      "load: always\nobsolete_when: never\nprecedence: critical\ntools: [claude]",
    "Base body.\nLast line.\n",
  );
  const BASE_CORPUS: Record<string, string> = { "rules/stamity-security.md": BASE_RULE };

  describe("REQ-OVERLAY-002 — `.customize.md` is never an artifact candidate", () => {
    /**
     * Regression. `.customize.md` ends in `.md`, so it passed the artifact
     * candidate filter, and a body patch that happened to carry a frontmatter
     * block indexed as a REAL artifact at id `<slug>.customize` — a phantom
     * claimant the author never wrote, emitted alongside the artifact it was
     * meant to patch.
     *
     * This case pins the OVERRIDE-tree half of that story — the file also
     * carries a frontmatter fence, so REQ-OVERLAY-007's fence refusal fires
     * regardless of the artifact-candidate narrowing below. The narrowing's
     * own red-first bite (no fence to trip on another refusal first) is the
     * next case, "treats a corpus-side `.customize.md` as no artifact and no
     * overlay" — reverting the filter's `!isOverlayFileName(entry.name)` arm
     * turns that one red, not this one.
     */
    it("never indexes a fenced `.customize.md` as a phantom artifact at `<slug>.customize`", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            // No declared id, so the filename slug is the id — which is exactly
            // how the phantom got its name.
            "rules/security.customize.md": artifact("type: rule\ndescription: Phantom.", "Patch.\n"),
          }),
        "VALIDATION_ERROR",
      );

      // The fence is refused (REQ-OVERLAY-007) and points at the yaml half.
      expect(refusal.message).toContain("overrides/rules/security.customize.md");
      expect(refusal.message).toContain(".customize.yaml");
      // And the phantom id is unreachable in every code path, not merely
      // shadowed: the walk stops before any item is assembled.
      expect(refusal.message).not.toContain("security.customize.md indexed");
    });

    it("treats a corpus-side `.customize.md` as no artifact and no overlay", async () => {
      // Overlays never sit beside a corpus or a pack file (REQ-OVERLAY-001), so
      // one found there is inert — not an artifact, not a patch, not a refusal.
      const { index } = await indexOf({
        ...BASE_CORPUS,
        "rules/stamity-security.customize.md": artifact("type: rule\ndescription: Phantom."),
      });

      expect(index.items.map((item) => item.id)).toEqual(["security"]);
      expect(index.byKey.has(typeIdKey("rule", "security.customize"))).toBe(false);
      expect(itemAt(index, "rule", "security").body).toBe("Base body.\nLast line.\n");
    });

    it.each([
      ["a near-miss extension", "rules/security.customize.yml"],
      ["a near-miss infix", "rules/security.customise.yaml"],
    ])("claims nothing for %s (%j)", async (_label, path) => {
      // The infix is exact. A name that only looks like a half is inert: not an
      // overlay, and — carrying no `.md` — not an artifact either.
      const { index } = await overlayIndexOf(BASE_CORPUS, { [path]: "description: Ignored.\n" });

      expect(itemAt(index, "rule", "security").description).toBe("Security floor.");
      expect(index.items.map((item) => item.id)).toEqual(["security"]);
    });

    it("indexes a file literally named `customize.md` as the ordinary artifact it is", async () => {
      // The suffix test is `.customize.md`, leading dot included, so a rule that
      // happens to be CALLED `customize` is untouched by the narrowing.
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/customize.md": artifact("id: customize\ntype: rule\ndescription: Ours."),
      });

      expect(originOf(itemAt(index, "rule", "customize"))).toBe("user");
      expect(index.collisions).toEqual([]);
    });

    it("discovers a `.customize.yaml` as an overlay and never as an artifact candidate", async () => {
      const { index } = await overlayIndexOf(
        { "commands/stamity-deploy.md": artifact("id: deploy\ntype: command\ndescription: Ships.") },
        { "commands/deploy.customize.yaml": "description: Ships, our way.\n" },
      );

      expect(index.items.map((item) => item.id)).toEqual(["cmd-deploy"]);
      expect(itemAt(index, "command", "cmd-deploy").description).toBe("Ships, our way.");
      expect(index.byKey.has(typeIdKey("command", "cmd-deploy.customize"))).toBe(false);
    });
  });

  describe("REQ-OVERLAY-003 — the target is the shadow-resolved item", () => {
    it("patches the corpus artifact in place, keeping its identity and its file", async () => {
      const { index, root } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "description: The repo's own floor.\n",
      });

      const item = itemAt(index, "rule", "security");
      expect(item.description).toBe("The repo's own floor.");
      expect(originOf(item)).toBe("corpus");
      expect(item.relativePath).toBe("rules/stamity-security.md");
      expect(item.filePath).toBe(join(root, "rules", "stamity-security.md"));

      // One identity, one body: a patch adds no second claimant, replaces
      // nothing, and contests nothing.
      expect(index.items.filter((entry) => entry.type === "rule")).toHaveLength(1);
      expect(index.shadows).toEqual([]);
      expect(index.collisions).toEqual([]);

      // Every key the overlay did not name carries its base value.
      expect(item.tags).toEqual(["floor:security"]);
      expect(item.precedence).toBe("critical");
      expect(item.tools).toEqual(["claude"]);
      expect(item.frontmatter.load).toBe("always");
      expect(item.frontmatter.obsolete_when).toBe("never");
      expect(item.body).toBe("Base body.\nLast line.\n");
    });

    it("patches the PACK artifact when a pack is the layer that supplies the id", async () => {
      const volume = makeVolume({
        ...under("corpus", CORPUS),
        ...under("pack", {
          "agents/stamity-ops.md": artifact(
            "id: ops\ntype: agent\ndescription: Pack ops agent.",
            "Pack body.\n",
          ),
        }),
        ...under("overrides", { "agents/ops.customize.yaml": "description: Our ops agent.\n" }),
      });
      const packRoots: PackContentRoot[] = [{ pack: "ops", root: join(volume.root, "pack") }];

      const index = await buildContentIndex(
        {
          root: join(volume.root, "corpus"),
          packRoots,
          overrideRoot: join(volume.root, "overrides"),
        },
        { fs: volume.fs },
      );

      // Targeting the corpus specifically would patch a body nobody emits; the
      // resolved item is the only target that stays correct across an install.
      const item = itemAt(index, "agent", "ops");
      expect(item.description).toBe("Our ops agent.");
      expect(originOf(item)).toBe("pack");
      expect(item.provenance).toEqual({ pack: "ops", declaredTools: [] });
      expect(item.relativePath).toBe("agents/stamity-ops.md");
      expect(item.body).toBe("Pack body.\n");
      expect(index.shadows).toEqual([]);
    });

    it("patches a command under its bare slug, not its `cmd-`-prefixed catalog id", async () => {
      const { index } = await overlayIndexOf(CORPUS, {
        "commands/plan.customize.yaml": "description: Plans, our way.\n",
      });

      expect(itemAt(index, "command", "cmd-plan").description).toBe("Plans, our way.");
    });

    it("patches a skill from a directory that carries overlays and no SKILL.md", async () => {
      const { index, root } = await overlayIndexOf(CORPUS, {
        "skills/recipe/SKILL.customize.yaml": "description: Our recipe.\n",
        "skills/recipe/SKILL.customize.md": "House step.\n",
      });

      // An overlay carrier is not work in progress: the directory holds no
      // SKILL.md by design, because the base is the corpus skill.
      const item = itemAt(index, "skill", "recipe");
      expect(item.description).toBe("Our recipe.");
      expect(item.filePath).toBe(join(root, "skills", "stamity-recipe", "SKILL.md"));
      expect(item.body).toBe("Body text.\n\nHouse step.\n");
      expect(index.skipped).toEqual([]);
    });
  });

  describe("REQ-OVERLAY-005 — the frontmatter merge", () => {
    it("replaces a key the overlay declares and leaves every other key alone", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "description: new\n",
      });

      const item = itemAt(index, "rule", "security");
      expect(item.description).toBe("new");
      expect(item.frontmatter).toEqual({
        id: "security",
        type: "rule",
        description: "new",
        tags: ["floor:security"],
        load: "always",
        obsolete_when: "never",
        precedence: "critical",
        tools: ["claude"],
      });
    });

    it.each([
      ["a bare key", "precedence:\n"],
      ["an explicit null", "precedence: null\n"],
    ])("removes a key whose overlay value is null — %s", async (_label, overlay) => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": overlay,
      });

      const item = itemAt(index, "rule", "security");
      expect("precedence" in item.frontmatter).toBe(false);
      expect("precedence" in item).toBe(false);
    });

    it("replaces a list value whole rather than unioning it", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "tags: [d]\ntools: [cursor]\n",
      });

      const item = itemAt(index, "rule", "security");
      expect(item.tags).toEqual(["d"]);
      expect(item.tools).toEqual(["cursor"]);
    });

    it("treats a null for a key the base never declared as a no-op", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "nothing_here:\n",
      });

      const item = itemAt(index, "rule", "security");
      expect("nothing_here" in item.frontmatter).toBe(false);
      expect(Object.keys(item.frontmatter)).toEqual([
        "id",
        "type",
        "description",
        "tags",
        "load",
        "obsolete_when",
        "precedence",
        "tools",
      ]);
    });

    it("replaces a nested map whole rather than recursing into it", async () => {
      const { index } = await overlayIndexOf(
        {
          "rules/stamity-security.md": artifact(
            "id: security\ntype: rule\ndescription: Floor.\nlimits:\n  lines: 10\n  words: 20",
          ),
        },
        { "rules/security.customize.yaml": "limits:\n  words: 5\n" },
      );

      // v1 has no merge verbs: `lines` is gone because the whole map replaced.
      expect(itemAt(index, "rule", "security").frontmatter.limits).toEqual({ words: 5 });
    });

    it("keeps the base's key order and appends overlay-only keys in overlay order", async () => {
      const { index } = await overlayIndexOf(
        {
          "rules/stamity-security.md": artifact(
            "id: security\ntype: rule\ndescription: Floor.\ntags: [a]",
          ),
        },
        { "rules/security.customize.yaml": "tags: [b]\nprecedence: high\nload: always\n" },
      );

      // Declared key order keeps a re-emitted head diff-minimal rather than
      // reshuffled by the merge.
      expect(Object.keys(itemAt(index, "rule", "security").frontmatter)).toEqual([
        "id",
        "type",
        "description",
        "tags",
        "precedence",
        "load",
      ]);
    });

    /**
     * min/5. `merged[key] = value` on an ordinary `{}` accumulator does not
     * create an OWN property when `key === "__proto__"` — it reassigns
     * `merged`'s own `[[Prototype]]` through the inherited setter instead, so
     * the key vanishes from `Object.keys`/`Object.entries` with no refusal.
     * Not exploitable (this is a fresh, per-merge object, never
     * `Object.prototype` itself) but silent: an author who names a
     * frontmatter key `__proto__` — YAML permits the string — would watch it
     * disappear from the merged map rather than merging or being refused.
     */
    it("keeps a `__proto__`-named key as an ordinary own key rather than letting it vanish", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": '__proto__:\n  polluted: true\n',
      });

      const item = itemAt(index, "rule", "security");
      // An own, enumerable key — not a prototype reassignment: it shows up in
      // `Object.keys` and reads back through the property itself.
      expect(Object.keys(item.frontmatter)).toContain("__proto__");
      expect(Object.getPrototypeOf(item.frontmatter)).toBeNull();
      expect((item.frontmatter as Record<string, unknown>)["__proto__"]).toEqual({
        polluted: true,
      });
    });
  });

  describe("REQ-OVERLAY-007 — the body merge is append-only", () => {
    it("appends the body half after exactly one blank line", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.md": "Extra paragraph.\n",
      });

      expect(itemAt(index, "rule", "security").body).toBe(
        "Base body.\nLast line.\n\nExtra paragraph.\n",
      );
    });

    it.each([
      ["no trailing newline", "Base.", "Base.\n\nExtra.\n"],
      ["three trailing newlines", "Base.\n\n\n", "Base.\n\nExtra.\n"],
      ["an empty body", "", "Extra.\n"],
    ])("writes one separator for a base with %s", async (_label, body, expected) => {
      const { index } = await overlayIndexOf(
        { "rules/stamity-security.md": artifact("id: security\ntype: rule", body) },
        { "rules/security.customize.md": "Extra.\n" },
      );

      expect(itemAt(index, "rule", "security").body).toBe(expected);
    });

    it("appends a body whose own `---` is a horizontal rule further down", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.md": "Extra.\n\n---\n\nMore.\n",
      });

      // Only the HEAD of the half is a fence position; a rule inside the text
      // is body, exactly as it is in an artifact.
      expect(itemAt(index, "rule", "security").body).toBe(
        "Base body.\nLast line.\n\nExtra.\n\n---\n\nMore.\n",
      );
    });

    it.each([
      ["a bare fence", "---\ndescription: Sneaky.\n---\nBody.\n"],
      ["a fence with trailing spaces", "---  \ndescription: Sneaky.\n---\nBody.\n"],
      ["a fence hidden behind a BOM", "﻿---\ndescription: Sneaky.\n---\nBody.\n"],
      ["an unterminated fence", "---\ndescription: Sneaky.\n"],
    ])("refuses a `.customize.md` opening with %s", async (_label, text) => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/security.customize.md": text }),
        "VALIDATION_ERROR",
      );

      // An author who writes frontmatter there means it to apply, so the
      // refusal points at the half that would have applied it.
      expect(refusal.message).toContain("overrides/rules/security.customize.md");
      expect(refusal.message).toContain(".customize.yaml");
    });
  });

  describe("REQ-OVERLAY-008 — the merged artifact re-runs the existing checks", () => {
    it("runs the closed tool vocabulary over the MERGED document", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/security.customize.yaml": "tools: [not-a-tool]\n",
          }),
        "VALIDATION_ERROR",
      );

      // The same message an authored artifact would produce: the field, the
      // offending name, and the valid set.
      expect(refusal.message).toContain("`tools`");
      expect(refusal.message).toContain("not-a-tool");
      expect(refusal.message).toContain("Valid tools:");
    });

    it("labels a merged refusal with the base file and every applied overlay file", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/security.customize.yaml": "tags: 3\n",
            "rules/security.customize.md": "Extra.\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("corpus/rules/stamity-security.md");
      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
      expect(refusal.message).toContain("overrides/rules/security.customize.md");
      expect(refusal.message).toContain("`tags`");
    });

    it("names only the half that was applied", async () => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/security.customize.yaml": "tags: 3\n" }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
      expect(refusal.message).not.toContain(".customize.md");
    });
  });

  describe("REQ-OVERLAY-006/009/010 — the refusals", () => {
    it.each([
      ["id", "id: something-else\n"],
      ["id", "id:\n"],
      ["type", "type: agent\n"],
      ["type", "type: null\n"],
    ])("refuses an overlay that declares `%s` (%j)", async (key, overlay) => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/security.customize.yaml": overlay }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
      expect(refusal.message).toContain(`\`${key}\``);
    });

    it("refuses malformed overlay YAML without indexing a partially merged item", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/security.customize.yaml": "description: [unterminated\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
    });

    it("refuses an overlay whose YAML root is not a map", async () => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/security.customize.yaml": "- one\n- two\n" }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
    });

    it("refuses an orphan overlay, naming the file and the id it looked for", async () => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/no-such-rule.customize.yaml": "description: x\n" }),
        "VALIDATION_ERROR",
      );

      // A filename typo is otherwise undetectable: a file on disk and an
      // unchanged artifact, with no signal connecting the two.
      expect(refusal.message).toContain("overrides/rules/no-such-rule.customize.yaml");
      expect(refusal.message).toContain("no-such-rule");
    });

    it("refuses an overlay that coexists with a full override of the same slug", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/security.md": artifact("id: security\ntype: rule\ndescription: Ours."),
            "rules/security.customize.yaml": "description: x\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.md");
      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
    });

    it("refuses an overlay over a full override that took the id under another filename", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/house-floor.md": artifact("id: security\ntype: rule\ndescription: Ours."),
            "rules/security.customize.yaml": "description: x\n",
          }),
        "VALIDATION_ERROR",
      );

      // Exclusivity is about the identity, not only the filename: an id is
      // either replaced or patched, never both.
      expect(refusal.message).toContain("overrides/rules/house-floor.md");
      expect(refusal.message).toContain("overrides/rules/security.customize.yaml");
    });

    it("refuses an overlay beside a full skill override in the same directory", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(CORPUS, {
            "skills/recipe/SKILL.md": artifact("id: recipe\ntype: skill\ndescription: Ours."),
            "skills/recipe/SKILL.customize.yaml": "description: x\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/skills/recipe/SKILL.md");
      expect(refusal.message).toContain("overrides/skills/recipe/SKILL.customize.yaml");
    });
  });

  describe("canonical overlay spelling — one prefix-free filename per identity", () => {
    /**
     * W2. `slugOf` strips an engine content prefix before resolving what a pair
     * patches (this file's own `stripEngineContentPrefix` call), so
     * `stamity-security.customize.yaml` and `security.customize.yaml` name the
     * SAME patch — walk-valid either way. That is exactly the gap the save-path
     * exclusivity probe fell into (prove/13): `saveIdDefect`
     * (`../../src/content/userContent.ts`) composes its candidate paths from the
     * bare id only, so a prefix-spelled overlay is walk-visible and
     * save-invisible at once. Refusing the prefixed spelling AT DISCOVERY closes
     * that gap by removing the second spelling rather than by teaching the save
     * probe to vary-probe it — one canonical spelling, matching the save gate's
     * own reserved-prefix stance (`saveIdDefect`'s `ENGINE_CONTENT_PREFIXES`
     * refusal).
     */
    it("refuses a `stamity-`-prefixed overlay filename, naming the file and the bare spelling", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/stamity-security.customize.yaml": "description: Prefixed spelling.\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/stamity-security.customize.yaml");
      // Names the canonical (bare) spelling the author should use instead.
      expect(refusal.message).toContain("security");
    });

    it("refuses an `st-`-prefixed overlay filename the same way", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(
            { "commands/stamity-deploy.md": artifact("id: deploy\ntype: command\ndescription: Ships.") },
            { "commands/st-deploy.customize.yaml": "description: Prefixed spelling.\n" },
          ),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/commands/st-deploy.customize.yaml");
      expect(refusal.message).toContain("deploy");
    });

    it("refuses a prefixed overlay carried by its BODY half alone", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(BASE_CORPUS, {
            "rules/stamity-security.customize.md": "Patch.\n",
          }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/stamity-security.customize.md");
    });

    it("refuses a `stamity-`-prefixed skill overlay CARRIER directory", async () => {
      const refusal = await expectRejection(
        () =>
          overlayIndexOf(CORPUS, {
            "skills/stamity-recipe/SKILL.customize.yaml": "description: Prefixed spelling.\n",
          }),
        "VALIDATION_ERROR",
      );

      // Named at the CARRIER directory and at the half inside it: a skill's
      // slug lives on the directory the halves sit in, but the halves
      // themselves are still validated by their own paths, so the refusal
      // points an author at both.
      expect(refusal.message).toContain("overrides/skills/stamity-recipe");
      expect(refusal.message).toContain("recipe");
    });

    it("still accepts the canonical (bare) spelling — this is a refusal, not a new failure mode", async () => {
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "description: Bare spelling.\n",
      });

      expect(itemAt(index, "rule", "security").description).toBe("Bare spelling.");
    });

    it("the save-path exclusivity probe still bites on the canonical spelling", async () => {
      // W2's other half: refusing the prefixed spelling at the walk restores
      // the probe's completeness by removing the second spelling entirely — a
      // save over the bare id an overlay already patches must still be caught.
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.yaml": "description: Patched.\n",
      });
      const item = itemAt(index, "rule", "security");

      expect(item.description).toBe("Patched.");
      // The overlay's own id is the bare slug, which is exactly what
      // `saveIdDefect` composes its candidate paths from — no prefix variant
      // for it to miss once the prefixed spelling can no longer exist.
      expect(item.id).toBe("security");
    });

    /**
     * Negative boundary. `carriesEngineContentPrefix` tests `startsWith("st-")`
     * — the hyphen included — so a bare slug that merely OPENS with the letters
     * `st` (no hyphen) is not the reserved prefix and must not be refused: a
     * false positive here would make an ordinary word an unusable slug for every
     * overlay author.
     */
    it("does not refuse a bare slug that merely opens with `st` (no hyphen) — `style`, not `st-yle`", async () => {
      const { index } = await overlayIndexOf(
        { "rules/stamity-style.md": artifact("id: style\ntype: rule\ndescription: Base.") },
        { "rules/style.customize.yaml": "description: Patched style guide.\n" },
      );

      expect(itemAt(index, "rule", "style").description).toBe("Patched style guide.");
    });
  });

  describe("REQ-OVERLAY-012 — the user-content ceiling binds the body half", () => {
    /**
     * Fail-closed parity with `stamity validate`, in the direction that was
     * broken: validate reported an oversized `.customize.md` as an error finding
     * and the WALK merged it anyway, so a repo could sync a body its own
     * validator refuses — text past the ceiling is truncated where the artifact
     * re-enters agent context, which means the patch on disk stops being the
     * patch the client gets, silently.
     *
     * The cap is read from the constant validate reads
     * (`src/guard/promptGuard.ts`), so the two gates cannot drift to two
     * different numbers. A test import creates no production edge.
     */
    /** One character past the ceiling. */
    const oversizedBody = `${"x".repeat(MAX_USER_CONTENT_LENGTH)}\n`;

    it("refuses a body patch over the ceiling, naming the file and the limit", async () => {
      const refusal = await expectRejection(
        () => overlayIndexOf(BASE_CORPUS, { "rules/security.customize.md": oversizedBody }),
        "VALIDATION_ERROR",
      );

      expect(refusal.message).toContain("overrides/rules/security.customize.md");
      expect(refusal.message).toContain(String(MAX_USER_CONTENT_LENGTH));
      // The same message family validate prints for the same defect, so an
      // author who met one of the two gates recognises the other.
      expect(refusal.message).toContain("ceiling on user-authored content");
    });

    it("admits a body patch exactly at the ceiling, and merges it", async () => {
      // The boundary from the legal side: a cap that refused its own limit
      // would move the ceiling by one and disagree with validate about which
      // repos are shippable.
      const atCap = "x".repeat(MAX_USER_CONTENT_LENGTH);
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/security.customize.md": atCap,
      });

      expect(itemAt(index, "rule", "security").body).toBe(`Base body.\nLast line.\n\n${atCap}`);
    });

    it("leaves an over-ceiling file that is not an overlay half alone", async () => {
      // The ceiling is a rule about the BODY PATCH, not about every byte in the
      // override tree: a full override of the same size is the author's own
      // artifact and is judged by the checks that judge an artifact.
      const { index } = await overlayIndexOf(BASE_CORPUS, {
        "rules/house-floor.md": artifact(
          "id: house-floor\ntype: rule\ndescription: Ours.",
          oversizedBody,
        ),
      });

      expect(itemAt(index, "rule", "house-floor").body).toBe(oversizedBody);
    });
  });

  describe("REQ-OVERLAY-013 — no overlay files means byte-identical", () => {
    it("indexes identically when the override tree holds no `.customize.*` file", async () => {
      const volume = makeVolume({
        ...under("corpus", CORPUS),
        ...under("pack", {
          "rules/stamity-ops.md": artifact("id: ops\ntype: rule\ndescription: Pack ops floor."),
        }),
        ...under("overrides", {
          // A populated override tree with nothing the overlay pass claims.
          "rules/README.md": "How this tree works.\n",
          "agents/house-style.md": artifact("id: house-style\ntype: agent\ndescription: Ours."),
        }),
      });
      const root = join(volume.root, "corpus");
      const packRoots: PackContentRoot[] = [{ pack: "ops", root: join(volume.root, "pack") }];

      const plain = await buildContentIndex({ root, packRoots }, { fs: volume.fs });
      const withTree = await buildContentIndex(
        { root, packRoots, overrideRoot: join(volume.root, "overrides") },
        { fs: volume.fs },
      );

      // Everything the override layer already did, unchanged — the overlay pass
      // contributes nothing at all when nothing addresses it.
      expect(withTree.items.filter((item) => originOf(item) !== "user")).toEqual(plain.items);
      expect(withTree.collisions).toEqual(plain.collisions);
      expect(withTree.shadows).toEqual([]);
      expect(withTree.skipped).toEqual([]);
      expect(withTree.items.map((item) => item.id)).toEqual([
        ...plain.items.map((item) => item.id),
        "house-style",
      ]);
    });
  });
});

describe("originOf", () => {
  it("reads corpus for an item assembled without an origin", async () => {
    const { index } = await indexOf(CORPUS);
    // The walk stamps every item it produces; a hand-assembled one (a fixture,
    // a caller composing a single item) reads as corpus rather than as nothing.
    const handBuilt = { ...itemAt(index, "rule", "security") };
    delete handBuilt.origin;

    expect(originOf(handBuilt)).toBe("corpus");
    expect(originOf(itemAt(index, "rule", "security"))).toBe("corpus");
  });
});

describe("contentRootsOf", () => {
  it("carries the override root through the object form, and none through a string", () => {
    expect(contentRootsOf("/corpus")).toEqual({
      root: "/corpus",
      packRoots: [],
      overrideRoot: undefined,
    });
    expect(contentRootsOf({ root: "/corpus", overrideRoot: "/repo/.stamity/overrides" })).toEqual({
      root: "/corpus",
      packRoots: [],
      overrideRoot: "/repo/.stamity/overrides",
    });
  });
});

describe("assertSafePath", () => {
  it("accepts a plain relative POSIX path", () => {
    expect(() => assertSafePath("agents/stamity-implementer.md", "walk")).not.toThrow();
  });

  it.each([
    ["../secrets.md", "`..` segment"],
    ["agents/../../secrets.md", "`..` segment"],
    ["/etc/passwd", "absolute path"],
    ["C:/Windows/system32", "absolute path"],
    ["agents\\stamity-implementer.md", "backslash separator"],
    ["", "empty path"],
    ["agents/\0.md", "null byte"],
  ])("rejects %j", (relativePath, reason) => {
    const error = expectEngineError(
      () => assertSafePath(relativePath, "content walk"),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain(reason);
    expect(error.message).toContain("content walk");
  });
});

describe("id keys", () => {
  it("qualifies a key by class so one id can exist in two classes", () => {
    expect(typeIdKey("skill", "plan")).toBe("skill:plan");
    expect(typeIdKey("command", "cmd-plan")).toBe("command:cmd-plan");
  });

  it("prefixes command ids only, and does so idempotently", () => {
    expect(applyCommandPrefix("plan", "command")).toBe(`${COMMAND_ID_PREFIX}plan`);
    expect(applyCommandPrefix("cmd-plan", "command")).toBe("cmd-plan");
    expect(applyCommandPrefix("plan", "skill")).toBe("plan");
    expect(applyCommandPrefix("plan", "agent")).toBe("plan");
  });
});

describe("lookups", () => {
  it("returns every class claiming one id", async () => {
    const { index } = await indexOf({
      "skills/stamity-plan/SKILL.md": artifact("id: plan\ntype: skill"),
      "rules/stamity-plan.md": artifact("id: plan\ntype: rule"),
      "commands/stamity-plan.md": artifact("id: plan\ntype: command"),
    });

    // The command's catalog id carries `cmd-`, so it is not a claimant of `plan`
    // — which is the point of the prefix.
    expect(getAllItemsById(index, "plan").map((item) => item.type)).toEqual(["skill", "rule"]);
    expect(getAllItemsById(index, "cmd-plan").map((item) => item.type)).toEqual(["command"]);
    expect(getAllItemsById(index, "absent")).toEqual([]);
    expect(index.collisions).toEqual([]);
  });

  it("resolves an artifact to a readable path, and a command under either id form", async () => {
    const { index, root } = await indexOf(CORPUS);

    expect(resolveArtifactFilePath(index, "skill", "recipe")).toBe(
      join(root, "skills", "stamity-recipe", "SKILL.md"),
    );
    expect(resolveArtifactFilePath(index, "command", "plan")).toBe(
      join(root, "commands", "stamity-plan.md"),
    );
    expect(resolveArtifactFilePath(index, "command", "cmd-plan")).toBe(
      join(root, "commands", "stamity-plan.md"),
    );
  });

  it("returns null for an id that is absent, or present in another class", async () => {
    const { index } = await indexOf(CORPUS);

    expect(resolveArtifactFilePath(index, "agent", "absent")).toBeNull();
    expect(resolveArtifactFilePath(index, "agent", "recipe")).toBeNull();
  });
});
