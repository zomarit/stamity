import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSelectionAllowlist,
  classifySelection,
  countSelectionItems,
  getAllContentIds,
  isIdInSelection,
  resolveSelection,
  selectionSummary,
  type SelectionAllowlist,
} from "../../src/content/selection.ts";
import {
  buildContentIndex,
  typeIdKey,
  type CatalogItem,
  type ContentIndex,
} from "../../src/content/catalog.ts";
import type { ContentClass, ContentSelection } from "../../src/types/content.ts";
import { EngineError } from "../../src/types/errors.ts";
import { makeVolume } from "../support/vfs.ts";

/**
 * Virtual-fs lane throughout: resolution is pure computation over an index, and
 * stating a corpus as a literal keeps each case's expected intersection
 * readable next to the corpus that produced it.
 */

const artifact = (frontmatter: string, body = "Body text.\n"): string =>
  `---\n${frontmatter}\n---\n${body}`;

const CORPUS: Record<string, string> = {
  "agents/stamity-implementer.md": artifact(
    "id: implementer\ntype: agent\ntags: [implementation]",
  ),
  "agents/stamity-reviewer.md": artifact("id: reviewer\ntype: agent\ntags: [review, ctx:team-only]"),
  "skills/stamity-recipe/SKILL.md": artifact("id: recipe\ntype: skill\ntags: [planning, lang:python]"),
  // The floor artifact every deselection case is measured against.
  "rules/stamity-security.md": artifact("id: security\ntype: rule\ntags: [floor:security]"),
  "rules/stamity-typescript.md": artifact("id: typescript\ntype: rule\ntags: [style, lang:typescript]"),
  "commands/stamity-plan.md": artifact("id: plan\ntype: command\ntags: [planning]"),
};

async function indexOf(files: Record<string, string> = CORPUS): Promise<ContentIndex> {
  const volume = makeVolume(files);
  return buildContentIndex(volume.root, { fs: volume.fs });
}

/** Re-keys a tree of files under one directory, so two roots share a volume. */
const under = (dir: string, files: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]));

/** The corpus with the repo's own override tree layered over it. */
async function overlayIndexOf(
  corpus: Record<string, string>,
  overrides: Record<string, string>,
): Promise<ContentIndex> {
  const volume = makeVolume({ ...under("corpus", corpus), ...under("overrides", overrides) });
  return buildContentIndex(
    { root: join(volume.root, "corpus"), overrideRoot: join(volume.root, "overrides") },
    { fs: volume.fs },
  );
}

/** The selection record with every class present, so cases state only what they select. */
function selectionOf(items: Partial<Record<ContentClass, string[]>>): ContentSelection {
  return { items: { agent: [], skill: [], rule: [], command: [], ...items } };
}

/** The indexed artifact under `type:id`, asserted present. */
function itemAt(index: ContentIndex, type: ContentClass, id: string): CatalogItem {
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

describe("resolveSelection", () => {
  it("returns the intersection of explicit ids and the language filter", async () => {
    const index = await indexOf();

    const selection = resolveSelection(index, {
      ids: { agent: ["implementer"], rule: ["typescript"], command: ["plan"] },
      languages: ["typescript"],
    });

    expect(selection.items).toEqual({
      agent: ["implementer"],
      // Unfiltered class, but the skill is `lang:python` and the project is not.
      skill: [],
      // `security` is not in the requested ids and survives anyway: floor.
      rule: ["security", "typescript"],
      command: ["cmd-plan"],
    });
  });

  it("leaves a class the caller did not name unfiltered", async () => {
    const index = await indexOf();

    const selection = resolveSelection(index, { ids: { agent: ["implementer"] } });

    expect(selection.items.agent).toEqual(["implementer"]);
    expect(selection.items.skill).toEqual(["recipe"]);
    expect(selection.items.rule).toEqual(["security", "typescript"]);
    expect(selection.items.command).toEqual(["cmd-plan"]);
  });

  it("selects the whole corpus when no filter is supplied", async () => {
    const index = await indexOf();

    expect(countSelectionItems(resolveSelection(index, {}))).toBe(index.items.length);
  });

  it("resolves a command id in either spelling", async () => {
    const index = await indexOf();

    for (const id of ["plan", "cmd-plan"]) {
      expect(resolveSelection(index, { ids: { command: [id] } }).items.command).toEqual([
        "cmd-plan",
      ]);
    }
  });

  it("rejects unknown ids naming every one of them, not just the first", async () => {
    const index = await indexOf();

    const error = expectEngineError(
      () =>
        resolveSelection(index, {
          ids: { agent: ["implementer", "ghost"], rule: ["missing"], command: ["absent"] },
        }),
      "VALIDATION_ERROR",
    );

    expect(error.message).toContain('agent "ghost"');
    expect(error.message).toContain('rule "missing"');
    expect(error.message).toContain('command "absent"');
    expect(error.message).not.toContain("implementer");
  });

  it("requires an includeTags match and subtracts excludeTags", async () => {
    const index = await indexOf();

    const included = resolveSelection(index, { includeTags: ["planning"] });
    expect(included.items).toEqual({
      agent: [],
      skill: ["recipe"],
      rule: ["security"], // floor bypasses the include requirement
      command: ["cmd-plan"],
    });

    const excluded = resolveSelection(index, { excludeTags: ["ctx:team-only", "style"] });
    expect(excluded.items.agent).toEqual(["implementer"]);
    expect(excluded.items.rule).toEqual(["security"]);
  });

  it("keeps a floor artifact that excludeTags names (protection beats exclusion)", async () => {
    const index = await indexOf();

    const selection = resolveSelection(index, {
      ids: { rule: [] },
      excludeTags: ["floor:security"],
    });

    expect(selection.items.rule).toEqual(["security"]);
  });

  it("drops a floor artifact the project's languages do not apply to", async () => {
    // The one filter floor does NOT bypass: a `lang:python` security rule is
    // inapplicable in a TypeScript repo, not merely unwanted.
    const index = await indexOf({
      "rules/stamity-py-security.md": artifact(
        "id: py-security\ntype: rule\ntags: [floor:security, lang:python]",
      ),
      "rules/stamity-security.md": artifact("id: security\ntype: rule\ntags: [floor:security]"),
    });

    const selection = resolveSelection(index, { languages: ["typescript"] });

    expect(selection.items.rule).toEqual(["security"]);
  });

  it("resolves to a valid empty selection when the filters admit nothing", async () => {
    const index = await indexOf({
      "agents/stamity-implementer.md": artifact("id: implementer\ntype: agent\ntags: [implementation]"),
    });

    const selection = resolveSelection(index, { includeTags: ["no-artifact-carries-this"] });

    expect(selection.items).toEqual({ agent: [], skill: [], rule: [], command: [] });
    expect(countSelectionItems(selection)).toBe(0);
    expect(getAllContentIds(selection).size).toBe(0);
    expect(selectionSummary(selection)).toBe("nothing selected");
  });

  it("ignores blank tag filters rather than matching on them", async () => {
    const index = await indexOf();

    expect(resolveSelection(index, { includeTags: ["  "], excludeTags: [""] }).items).toEqual(
      resolveSelection(index, {}).items,
    );
  });
});

describe("buildSelectionAllowlist", () => {
  it("builds one set per class the record carries", () => {
    const allowlist = buildSelectionAllowlist(
      selectionOf({ agent: ["implementer"], rule: ["security"] }),
    );

    expect(allowlist.agent).toEqual(new Set(["implementer"]));
    expect(allowlist.rule).toEqual(new Set(["security"]));
    expect(allowlist.skill).toEqual(new Set());
  });

  it("leaves a class missing from a hand-edited record unfiltered", () => {
    // A manifest written before a class existed, or edited by hand: the class
    // key is simply absent, and failing open beats emitting nothing.
    const truncated = { items: { agent: ["implementer"] } } as unknown as ContentSelection;

    const allowlist = buildSelectionAllowlist(truncated);

    expect(allowlist.rule).toBeUndefined();
    expect(isIdInSelection(allowlist, "rule", "anything")).toBe(true);
  });
});

describe("isIdInSelection", () => {
  it("admits everything for an unfiltered class", () => {
    expect(isIdInSelection({}, "agent", "implementer")).toBe(true);
  });

  it("matches a command id stored in either spelling", () => {
    const namespaced: SelectionAllowlist = { command: new Set(["cmd-plan"]) };
    const bare: SelectionAllowlist = { command: new Set(["plan"]) };

    expect(isIdInSelection(namespaced, "command", "plan")).toBe(true);
    expect(isIdInSelection(namespaced, "command", "cmd-plan")).toBe(true);
    expect(isIdInSelection(bare, "command", "cmd-plan")).toBe(true);
    expect(isIdInSelection(bare, "command", "other")).toBe(false);
  });

  it("does not spell-correct non-command classes", () => {
    expect(isIdInSelection({ agent: new Set(["cmd-plan"]) }, "agent", "plan")).toBe(false);
  });
});

describe("classifySelection", () => {
  it("keeps a selected artifact and drops an unselected one", async () => {
    const index = await indexOf();
    const allowlist = buildSelectionAllowlist(selectionOf({ agent: ["implementer"] }));

    expect(classifySelection(itemAt(index, "agent", "implementer"), allowlist)).toBe("keep");
    expect(classifySelection(itemAt(index, "agent", "reviewer"), allowlist)).toBe("drop");
  });

  it("flags a floor artifact missing from its class's selection instead of dropping it", async () => {
    const index = await indexOf();
    const allowlist = buildSelectionAllowlist(selectionOf({ rule: ["typescript"] }));

    expect(classifySelection(itemAt(index, "rule", "security"), allowlist)).toBe(
      "keep-protected-missing",
    );
    expect(classifySelection(itemAt(index, "rule", "typescript"), allowlist)).toBe("keep");
  });

  it("filters everything except floor artifacts under an empty selection", async () => {
    const index = await indexOf();
    const allowlist = buildSelectionAllowlist(selectionOf({}));

    const verdicts = index.items.map((item) => classifySelection(item, allowlist));

    expect(verdicts).toEqual(["drop", "drop", "drop", "keep-protected-missing", "drop", "drop"]);
  });

  it("keeps everything when no class is filtered", async () => {
    const index = await indexOf();

    expect(index.items.every((item) => classifySelection(item, {}) === "keep")).toBe(true);
  });
});

describe("the user layer", () => {
  const HOUSE_STYLE = {
    "agents/house-style.md": artifact("id: house-style\ntype: agent\ntags: [implementation]"),
  };

  it("keeps a user artifact the record never names, and still drops a deselected corpus one", async () => {
    const index = await overlayIndexOf(CORPUS, HOUSE_STYLE);
    // A record that names no ids at all: the hand-edited manifest case, where
    // everything unprotected drops.
    const allowlist = buildSelectionAllowlist(selectionOf({}));

    // Admitted by presence — the repo put the file in its own tree, and a
    // record written before it existed is not a deselection of it.
    expect(classifySelection(itemAt(index, "agent", "house-style"), allowlist)).toBe("keep");
    // Installed-by-presence is the USER layer's rule only.
    expect(classifySelection(itemAt(index, "agent", "implementer"), allowlist)).toBe("drop");
  });

  it("keeps a user artifact that took a floor id without flagging the floor missing", async () => {
    const index = await overlayIndexOf(CORPUS, {
      "rules/security.md": artifact("id: security\ntype: rule\ntags: [implementation]"),
    });
    const allowlist = buildSelectionAllowlist(selectionOf({}));

    // The override carries no floor tag of its own: the floor holds because the
    // id is claimed and kept, not because the tag was copied across.
    const verdicts = index.items
      .filter((item) => item.id === "security")
      .map((item) => classifySelection(item, allowlist));
    expect(verdicts).toEqual(["keep"]);
  });

  it("leaves resolveSelection's filters exactly as they were", async () => {
    const index = await overlayIndexOf(CORPUS, HOUSE_STYLE);

    expect(resolveSelection(index, {}).items.agent).toEqual([
      "implementer",
      "reviewer",
      "house-style",
    ]);
    // A named class records only what it names. Presence admits at EMISSION
    // time (classifySelection); it is not a second resolver rule.
    expect(resolveSelection(index, { ids: { agent: ["implementer"] } }).items.agent).toEqual([
      "implementer",
    ]);
  });
});

describe("selection reporting", () => {
  it("summarises by class in class order, singular where there is one", () => {
    expect(selectionSummary(selectionOf({ agent: ["a"], rule: ["r1", "r2"] }))).toBe(
      "1 agent, 2 rules",
    );
    expect(
      selectionSummary(selectionOf({ agent: ["a"], skill: ["s"], rule: ["r"], command: ["c"] })),
    ).toBe("1 agent, 1 skill, 1 rule, 1 command");
  });

  it("counts and flattens ids across every class", () => {
    const selection = selectionOf({ agent: ["implementer"], rule: ["security", "typescript"] });

    expect(countSelectionItems(selection)).toBe(3);
    expect(getAllContentIds(selection)).toEqual(
      new Set(["implementer", "security", "typescript"]),
    );
  });

  it("reports a truncated record without throwing", () => {
    const truncated = { items: { agent: ["implementer"] } } as unknown as ContentSelection;

    expect(countSelectionItems(truncated)).toBe(1);
    expect(getAllContentIds(truncated)).toEqual(new Set(["implementer"]));
    expect(selectionSummary(truncated)).toBe("1 agent");
  });
});
