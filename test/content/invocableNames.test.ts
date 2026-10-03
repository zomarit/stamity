import { describe, expect, it } from "vitest";
import {
  buildContentIndex,
  describeInvocableNameClash,
  findInvocableNameClashes,
  invocableNameOf,
  replacedClaimantOf,
  type CatalogItem,
  type ContentOrigin,
} from "../../src/content/catalog.ts";
import { RULE_SKILL_DIR_PREFIX } from "../../src/content/ruleDelivery.ts";
import type { ContentClass } from "../../src/types/content.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The cross-class name check (run 2026-10-03_pack-engine-defects, defect 1): a
 * command and a skill the catalog keys apart by class can still land in ONE
 * `.agents/skills/st-<x>/` folder. These cases prove the detector on hand-built
 * items for each pairing, on a real walk of a pack root plus an override tree,
 * and on the shipped corpus, which must yield no clash at all.
 *
 * No mocks: the items are plain data the function reads, and the two walks run
 * the real catalog over real directories.
 */

type Item = Pick<CatalogItem, "type" | "id" | "relativePath" | "filePath" | "origin" | "provenance">;

/** One item as the walk would index it under `root`; `pack` stamps pack provenance. */
function item(
  type: ContentClass,
  id: string,
  relativePath: string,
  origin: ContentOrigin,
  pack?: string,
): Item {
  return {
    type,
    id,
    relativePath,
    filePath: `/repo/${origin}/${relativePath}`,
    origin,
    ...(pack === undefined ? {} : { provenance: { pack, declaredTools: [] } }),
  };
}

const packCommand = (pack: string, id: string): Item =>
  item("command", `cmd-${id}`, `commands/st-${id}.md`, "pack", pack);
const packSkill = (pack: string, dir: string, id = dir.replace(/^st-/, "")): Item =>
  item("skill", id, `skills/${dir}/SKILL.md`, "pack", pack);
const coreCommand = (id: string): Item => item("command", `cmd-${id}`, `commands/st-${id}.md`, "corpus");
const coreSkill = (id: string): Item => item("skill", id, `skills/st-${id}/SKILL.md`, "corpus");

describe("invocableNameOf", () => {
  it("names a command by its emitted id, without doubling an authored st- prefix", () => {
    expect(invocableNameOf(coreCommand("work"))).toBe("st-work");
    // Declared `id: st-drill` indexes as `cmd-st-drill`; the folder is still st-drill.
    expect(invocableNameOf(item("command", "cmd-st-drill", "commands/st-drill.md", "pack", "a"))).toBe(
      "st-drill",
    );
  });

  it("names a skill by its directory, not by a declared id that disagrees with it", () => {
    expect(invocableNameOf(packSkill("acme", "st-release", "runbook"))).toBe("st-release");
  });

  it("names a core rule by the folder a demoted rule lands in, and a pack rule not at all", () => {
    const rule = item("rule", "question-protocol", "rules/stamity-question-protocol.md", "corpus");
    expect(invocableNameOf(rule)).toBe(`${RULE_SKILL_DIR_PREFIX}question-protocol`);
    expect(invocableNameOf({ ...rule, origin: "user" })).toBe("stamity-question-protocol");
    expect(invocableNameOf({ ...rule, origin: "pack" })).toBeUndefined();
  });

  it("names a skill that replaced a shipped one by the replaced skill's folder", () => {
    const override = item("skill", "verify", "skills/verify/SKILL.md", "user");
    expect(invocableNameOf(override)).toBe("verify");
    expect(invocableNameOf(override, coreSkill("verify"))).toBe("st-verify");
    // Only a skill's name is a folder; a command's is its id, which a replacement shares.
    expect(invocableNameOf(coreCommand("work"), { relativePath: "commands/other.md" })).toBe("st-work");
  });

  it("does not name an agent", () => {
    expect(invocableNameOf(item("agent", "reviewer", "agents/stamity-reviewer.md", "corpus"))).toBeUndefined();
  });
});

describe("findInvocableNameClashes", () => {
  it("reports one pack's command and skill that both install as st-drill", () => {
    const clashes = findInvocableNameClashes([
      packCommand("acme-demo", "drill"),
      packSkill("acme-demo", "st-drill"),
      packSkill("acme-demo", "st-other"),
    ]);

    expect(clashes).toEqual([
      {
        name: "st-drill",
        owners: [
          {
            kind: "command",
            id: "drill",
            layer: "pack",
            packId: "acme-demo",
            path: "/repo/pack/commands/st-drill.md",
          },
          {
            kind: "skill",
            id: "drill",
            layer: "pack",
            packId: "acme-demo",
            path: "/repo/pack/skills/st-drill/SKILL.md",
          },
        ],
      },
    ]);
    expect(describeInvocableNameClash(clashes[0]!)).toBe(
      'st-drill — pack "acme-demo" command "drill" and pack "acme-demo" skill "drill" both ' +
        "install as st-drill (one folder on Cursor and Codex; on Claude the skill hides the command)",
    );
  });

  it("reports a pack command against a core skill, naming the core by its emitted name", () => {
    const clashes = findInvocableNameClashes([coreSkill("verify"), coreCommand("work"), packCommand("acme", "verify")]);

    expect(clashes.map((clash) => [clash.name, clash.owners.map((owner) => [owner.layer, owner.kind])])).toEqual([
      [
        "st-verify",
        [
          ["corpus", "skill"],
          ["pack", "command"],
        ],
      ],
    ]);
    expect(describeInvocableNameClash(clashes[0]!)).toContain(
      'the core skill "st-verify" and pack "acme" command "verify" both install as st-verify',
    );
  });

  it("reports a pack skill against a core command", () => {
    const clashes = findInvocableNameClashes([coreCommand("work"), coreSkill("qa"), packSkill("acme", "st-work")]);

    expect(clashes).toHaveLength(1);
    expect(describeInvocableNameClash(clashes[0]!)).toContain(
      'the core command "st-work" and pack "acme" skill "work" both install as st-work',
    );
  });

  it("reports a pack against another pack", () => {
    const clashes = findInvocableNameClashes([packCommand("acme-one", "shared"), packSkill("acme-two", "st-shared")]);

    expect(clashes.map((clash) => clash.owners.map((owner) => owner.packId))).toEqual([["acme-one", "acme-two"]]);
  });

  it("does not report a same-class duplicate — the walk and the install gate own that", () => {
    expect(
      findInvocableNameClashes([coreSkill("verify"), packSkill("acme", "st-verify"), coreCommand("verify")]).map(
        (clash) => clash.owners.length,
      ),
      "a third, cross-class owner still reports the whole group",
    ).toEqual([3]);
    expect(findInvocableNameClashes([coreSkill("verify"), packSkill("acme", "st-verify")])).toEqual([]);
    expect(findInvocableNameClashes([coreCommand("work"), packCommand("acme", "work")])).toEqual([]);
  });

  it("reports a skill folder named like a demoted rule", () => {
    const clashes = findInvocableNameClashes([
      item("rule", "naming", "rules/stamity-naming.md", "corpus"),
      packSkill("acme", "stamity-naming", "naming"),
    ]);

    expect(clashes).toHaveLength(1);
    expect(describeInvocableNameClash(clashes[0]!)).toBe(
      'stamity-naming — the core rule (delivered as a skill) "stamity-naming" and pack "acme" skill ' +
        '"naming" both install as stamity-naming (one skill folder on every client)',
    );
  });

  it("lists three owners of one name in one line", () => {
    const clashes = findInvocableNameClashes([
      coreCommand("drill"),
      packSkill("acme", "st-drill"),
      item("skill", "drill", "skills/st-drill/SKILL.md", "fork"),
    ]);

    expect(clashes).toHaveLength(1);
    expect(describeInvocableNameClash(clashes[0]!)).toBe(
      'st-drill — the core command "st-drill", pack "acme" skill "drill" and the fork-layer skill ' +
        '"drill" at /repo/fork/skills/st-drill/SKILL.md all install as st-drill (one folder on ' +
        "Cursor and Codex; on Claude the skill hides the command)",
    );
  });

  it("names a replacing override skill through the claimant it replaced", () => {
    const shipped = coreSkill("verify");
    const override = item("skill", "verify", "skills/verify/SKILL.md", "user");
    const command = packCommand("acme", "verify");

    // Without the replaced claimant the override reads as `verify` and the clash is missed.
    expect(findInvocableNameClashes([override, command])).toEqual([]);
    const clashes = findInvocableNameClashes([override, command], {
      replacedOf: (entry) => (entry === override ? shipped : undefined),
    });

    expect(clashes).toHaveLength(1);
    expect(describeInvocableNameClash(clashes[0]!)).toBe(
      'st-verify — pack "acme" command "verify" and the override skill "verify" at ' +
        "/repo/user/skills/verify/SKILL.md both install as st-verify (one folder on Cursor and " +
        "Codex; on Claude the skill hides the command)",
    );
  });

  it("compares names case-folded: st-Drill and st-drill are one folder on macOS and Windows", () => {
    const clashes = findInvocableNameClashes([packSkill("acme", "St-Drill", "drill"), packCommand("acme", "drill")]);

    expect(clashes.map((clash) => [clash.name, clash.owners.map((owner) => owner.kind)])).toEqual([
      // The spelling of the first owner (the command) names the clash.
      ["st-drill", ["command", "skill"]],
    ]);
    expect(describeInvocableNameClash(clashes[0]!)).toContain('pack "acme" skill "drill"');
  });

  it("prints every owner path in POSIX form, whatever separator the walk joined it with", () => {
    const windows: Item = {
      ...item("command", "cmd-drill", "commands/st-drill.md", "user"),
      filePath: "C:\\repo\\.stamity\\overrides\\commands\\st-drill.md",
    };
    const [clash] = findInvocableNameClashes([windows, packSkill("acme", "st-drill")]);

    expect(clash?.owners.find((owner) => owner.layer === "user")?.path).toBe(
      "C:/repo/.stamity/overrides/commands/st-drill.md",
    );
    // The pack owner comes first whatever the input order: owners sort by layer.
    expect(describeInvocableNameClash(clash!)).toContain(
      'pack "acme" skill "drill" and the override command "drill" at C:/repo/.stamity/overrides/commands/st-drill.md',
    );
    expect(describeInvocableNameClash(clash!)).not.toContain("\\");
  });
});

describe("findInvocableNameClashes over a real walk", () => {
  const getTemp = useTempDir("invocable-names");

  const artifact = (id: string, type: string): string =>
    ["---", `id: ${id}`, `type: ${type}`, `description: "Fixture ${id}."`, "---", "", `# ${id}`, ""].join("\n");

  it("reports a user override command against an installed pack's skill", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/skills/st-qa/SKILL.md": artifact("qa", "skill"),
      "pack/skills/st-drill/SKILL.md": artifact("drill", "skill"),
      "overrides/commands/st-drill.md": artifact("drill", "command"),
    });

    const index = await buildContentIndex({
      root: temp.path("corpus"),
      packRoots: [{ pack: "acme-demo", root: temp.path("pack") }],
      overrideRoot: temp.path("overrides"),
    });
    const clashes = findInvocableNameClashes(index.items);

    expect(clashes.map((clash) => clash.name)).toEqual(["st-drill"]);
    expect(clashes[0]?.owners.map((owner) => [owner.layer, owner.kind, owner.packId])).toEqual([
      ["pack", "skill", "acme-demo"],
      ["user", "command", undefined],
    ]);
    expect(clashes[0]?.owners[1]?.path).toBe(
      `${temp.path("overrides", "commands", "st-drill.md").replaceAll("\\", "/")}`,
    );
  });

  it("names an override that replaced a core skill by the core skill's folder", async () => {
    const temp = getTemp();
    await temp.seedFiles({
      "corpus/skills/st-verify/SKILL.md": artifact("verify", "skill"),
      "pack/commands/st-verify.md": artifact("verify", "command"),
      // Saved bare, as the override save gate requires.
      "overrides/skills/verify/SKILL.md": artifact("verify", "skill"),
    });

    const index = await buildContentIndex({
      root: temp.path("corpus"),
      packRoots: [{ pack: "acme-demo", root: temp.path("pack") }],
      overrideRoot: temp.path("overrides"),
    });
    const clashes = findInvocableNameClashes(index.items, {
      replacedOf: (entry) => replacedClaimantOf(index, entry),
    });

    expect(clashes.map((clash) => clash.name)).toEqual(["st-verify"]);
    expect(clashes[0]?.owners.map((owner) => [owner.layer, owner.kind])).toEqual([
      ["pack", "command"],
      ["user", "skill"],
    ]);
  });

  it("finds no clash in the shipped corpus with its fork layer", async () => {
    // The default walk: the bundled corpus plus the bundled fork root beside it.
    const index = await buildContentIndex();
    const named = index.items.filter((entry) => invocableNameOf(entry) !== undefined);

    // Non-degenerate: commands, skills and rules all take part.
    expect(new Set(named.map((entry) => entry.type))).toEqual(new Set(["command", "skill", "rule"]));
    expect(findInvocableNameClashes(index.items)).toEqual([]);
    expect(
      findInvocableNameClashes(index.items, { replacedOf: (entry) => replacedClaimantOf(index, entry) }),
    ).toEqual([]);
  });
});
