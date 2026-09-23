import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { frontmatterField, parseFrontmatter } from "../../src/content/frontmatter.ts";
import {
  CLIENT_MODEL_PROJECTION,
  EFFORT_PLACEHOLDER,
  MODEL_LADDER,
  effortDisclosures,
  isModelClass,
  nearestExpressibleEffort,
  resolveEffortValue,
  resolveModelValue,
  type ClientModelProjection,
  type EffortMap,
  type ModelLadderRow,
  type ModelPinMap,
} from "../../src/roster/modelLadder.ts";
import {
  EFFORT_LEVELS,
  MODEL_CLASSES,
  TOOLS,
  effortRank,
  type EffortLevel,
  type Tool,
} from "../../src/types/core.ts";
import { MANIFEST_VERSION, type SetupManifest } from "../../src/types/manifest.ts";

/**
 * The ladder is data, so these are data assertions plus the two resolvers that
 * read it.
 *
 * Unlike `agentPolicies.test.ts`, this suite DOES read `content/agents/*.md`.
 * That suite pinned its grants as literals because the corpus landed in its own
 * change set, so reading it would have been two moving things asserted against
 * each other. The corpus is shipped now, and the whole claim of this module is
 * that one table states the role assignment the corpus declares — a claim only
 * a real read can hold. The literals below still pin what the ladder was
 * DESIGNED to say; the corpus case pins that it stayed true of the corpus.
 */

const REPO_ROOT = new URL("../../", import.meta.url);

/** Every `src/` module outside the ladder itself that imports `name` from it. */
function callersOf(name: string): string[] {
  const roots = ["src/adapters", "src/cli/commands", "src/emit", "src/manifest", "src/composition"];
  const hits: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(new URL(relative, REPO_ROOT), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts")) {
        const body = readFileSync(new URL(child, REPO_ROOT), "utf8");
        if (body.includes("roster/modelLadder.ts") && new RegExp(`\\b${name}\\b`).test(body)) {
          hits.push(child);
        }
      }
    }
  };
  for (const root of roots) walk(root);
  return hits;
}

/** Vendor and model-id vocabulary, mirroring the corpus quality lane's ban. */
const VENDOR_OR_MODEL_ID =
  /\b(?:gpt|chatgpt|openai|anthropic|claude|opus|sonnet|haiku|gemini|llama|mistral|grok)\b/i;

/** ISO calendar date, the only accepted access-date shape. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The ladder as designed: class → the roles it runs, in ladder order. */
const EXPECTED_ROLES: readonly (readonly [string, readonly string[]])[] = [
  ["frontier", ["reviewer"]],
  ["advanced", ["design-quality", "implementer", "reviewer", "security", "spec-author"]],
  ["standard", ["creator", "fixer", "performance", "researcher"]],
  ["economy", ["fixer", "test-runner"]],
];

/** Effort each class asks for, restated to pin the allocation. */
const EXPECTED_EFFORT: Readonly<Record<string, string>> = {
  frontier: "high",
  advanced: "high",
  standard: "medium",
  economy: "low",
};

function row(modelClass: string): ModelLadderRow {
  const found = MODEL_LADDER.find((candidate) => candidate.modelClass === modelClass);
  if (found === undefined) throw new Error(`no ladder row for ${modelClass}`);
  return found;
}

function projection(tool: Tool): ClientModelProjection {
  return CLIENT_MODEL_PROJECTION[tool];
}

/** Every shipped agent file, as `id` → declared `model_class`. */
function corpusAgentClasses(): { readonly classes: ReadonlyMap<string, string>; files: number } {
  const dir = new URL("content/agents/", REPO_ROOT);
  const files = readdirSync(dir)
    .toSorted()
    .filter((entry) => entry.endsWith(".md"));
  const classes = new Map<string, string>();
  for (const entry of files) {
    const parsed = parseFrontmatter(readFileSync(new URL(entry, dir), "utf8"), entry);
    const id = frontmatterField(parsed, "id");
    const modelClass = frontmatterField(parsed, "model_class");
    if (typeof id !== "string" || typeof modelClass !== "string") continue;
    classes.set(id, modelClass);
  }
  return { classes, files: files.length };
}

/** The work command as shipped — the body the parity cases below read. */
function shippedWorkBody(): string {
  return readFileSync(new URL("content/commands/st-work.md", REPO_ROOT), "utf8");
}

/**
 * The ladder table as the work command SHIPS it, `class → the cell naming its
 * roles` — the rendering an agent re-reads to verify a role's class after
 * substitution.
 *
 * Parsed tolerantly on purpose: the section is prose that gets reworded, and
 * the cells are voice-carrying prose too, so the header and separator rows are
 * dropped by shape rather than by position and a cell is later read for the
 * role TOKENS in it rather than compared as a string. Prose paragraphs around
 * the table are skipped by the leading-pipe filter, so provenance text can be
 * reworded without touching this reader.
 */
function shippedLadderRows(body: string): ReadonlyMap<string, string> {
  const section = /^#+ +Model ladder *$/m.exec(body);
  if (section === null) throw new Error("the work command ships no `Model ladder` section");
  const table = body.slice(section.index + section[0].length).split(/^#/m)[0] ?? "";
  const rows = new Map<string, string>();
  for (const line of table.split("\n")) {
    if (!line.startsWith("|")) continue;
    const [, first = "", second = ""] = line.split("|");
    const modelClass = first.trim().toLowerCase();
    if (modelClass === "" || modelClass === "class" || /^:?-{2,}:?$/.test(modelClass)) continue;
    rows.set(modelClass, second);
  }
  return rows;
}

/** Every role the ladder places, deduped — the token universe a cell is read for. */
const LADDER_ROLES: readonly string[] = [
  ...new Set(MODEL_LADDER.flatMap((entry) => [...entry.roles])),
].toSorted();

/**
 * The roles one cell names, sorted. Matched per role TOKEN so the surrounding
 * voice ("escalated for the whole-branch deep review", "once a round is
 * mechanical") is free to change while the assignment it carries is not.
 */
function rolesNamedIn(cell: string): readonly string[] {
  return LADDER_ROLES.filter((role) => new RegExp(`(?<![\\w-])${role}(?![\\w-])`).test(cell));
}

/**
 * Every way the shipped table and {@link MODEL_LADDER} disagree: a class the
 * table never renders, a row that DROPS a role the ladder assigns it, and a
 * row that BORROWS one from another rung. Both directions, because each is a
 * way a reader of the shipped body ends up believing a role runs at a class it
 * does not: the drop leaves them unable to find the role at all, the borrow
 * answers them with the wrong rung.
 *
 * Returned as messages rather than asserted inline so the fixture case below
 * can prove the detector fires — a parity check nobody has watched fail is a
 * check that the file parses.
 */
function ladderParityProblems(body: string): string[] {
  const rows = shippedLadderRows(body);
  const problems: string[] = [];
  for (const entry of MODEL_LADDER) {
    const cell = rows.get(entry.modelClass);
    if (cell === undefined) {
      problems.push(`the table ships no \`${entry.modelClass}\` row`);
      continue;
    }
    const named = rolesNamedIn(cell);
    for (const role of entry.roles) {
      if (named.includes(role)) continue;
      problems.push(`the ${entry.modelClass} row never names \`${role}\``);
    }
    for (const role of named) {
      if (entry.roles.includes(role)) continue;
      problems.push(`the ${entry.modelClass} row names \`${role}\`, assigned to another class`);
    }
  }
  return problems;
}

describe("MODEL_LADDER", () => {
  it("covers every model class exactly once, in ladder order", () => {
    expect(MODEL_LADDER.map((entry) => entry.modelClass)).toEqual([...MODEL_CLASSES]);
    expect(new Set(MODEL_LADDER.map((entry) => entry.modelClass)).size).toBe(MODEL_LADDER.length);
  });

  it("assigns the designed roles per class, with no duplicate inside a row", () => {
    for (const [modelClass, roles] of EXPECTED_ROLES) {
      expect(row(modelClass).roles, modelClass).toEqual(roles);
      expect(new Set(roles).size, `${modelClass} repeats a role`).toBe(roles.length);
      expect(roles.length, `${modelClass} assigns no role`).toBeGreaterThan(0);
    }
  });

  it("declares an effort level from the closed scale for every class", () => {
    for (const entry of MODEL_LADDER) {
      expect(EFFORT_LEVELS).toContain(entry.defaultEffort);
      expect(entry.defaultEffort, entry.modelClass).toBe(EXPECTED_EFFORT[entry.modelClass]);
    }
  });

  it("lists every shipped agent under the class its own frontmatter declares", () => {
    const { classes, files } = corpusAgentClasses();
    // Every agent file parsed — a skipped one would make the sweep below pass
    // by reading nothing. The roster's own count is pinned by the roster suite,
    // so this asserts coverage of whatever ships rather than a second copy of it.
    expect(classes.size).toBe(files);
    expect(classes.size).toBeGreaterThanOrEqual(7);
    expect(new Set(classes.values()).size).toBeGreaterThan(1);
    for (const [id, modelClass] of classes) {
      expect(isModelClass(modelClass), `${id} declares an off-ladder class`).toBe(true);
      expect(
        row(modelClass).roles,
        `${id} declares model_class ${modelClass}: add it to that ladder row`,
      ).toContain(id);
    }
  });

  it("names no vendor or model id in its own prose", () => {
    for (const entry of MODEL_LADDER) {
      expect(entry.rationale, entry.modelClass).not.toMatch(VENDOR_OR_MODEL_ID);
      for (const role of entry.roles) expect(role).not.toMatch(VENDOR_OR_MODEL_ID);
    }
  });

  it("rules on class membership and rejects everything else", () => {
    for (const modelClass of MODEL_CLASSES) expect(isModelClass(modelClass)).toBe(true);
    for (const value of ["", "Frontier", "nonsense-class", 4, null, undefined, {}]) {
      expect(isModelClass(value), String(value)).toBe(false);
    }
  });
});

/**
 * The third surface: the table `content/commands/st-work.md` ships under
 * "Model ladder". A role's class is declared in that agent's `model_class:`
 * frontmatter, this array restates it for the resolvers, and that table
 * restates it for the agent verifying a class after substitution — so the
 * table is a VIEW, and these cases are what stop the view from disagreeing
 * with what it views. With the corpus case above holding frontmatter ⊆ these
 * rows and the parity case below holding these rows = the table's cells, the
 * edge a reader of the shipped body actually depends on — the class their role
 * really runs at — follows from the two.
 */
describe("the ladder table shipped in the work command", () => {
  it("renders the same classes in the same strongest-to-cheapest order", () => {
    expect([...shippedLadderRows(shippedWorkBody()).keys()]).toEqual(
      MODEL_LADDER.map((entry) => entry.modelClass),
    );
  });

  it("names exactly the roles each row assigns — nothing dropped, nothing borrowed", () => {
    expect(ladderParityProblems(shippedWorkBody())).toEqual([]);
  });

  it("states where the assignment is declared and what an unresolvable class emits", () => {
    // The honesty half. Parity keeps the two sides equal; this keeps a reader
    // from taking the table for the source on the day they disagree anyway — a
    // stale emit, a local override, an agent file edited by hand. Verbatim
    // anchors, the testing-philosophy precedent: each claim is the contract,
    // so a reword that drops one fails here instead of quietly returning the
    // body to a table with no stated provenance.
    const body = shippedWorkBody();
    const section = /^#+ +Model ladder *$/m.exec(body);
    if (section === null) throw new Error("the work command ships no `Model ladder` section");
    const prose = (body.slice(section.index + section[0].length).split(/^#/m)[0] ?? "")
      .split("\n")
      .filter((line) => !line.startsWith("|"))
      .join(" ");
    expect(prose).toMatch(/declared once, in that\s+role's own agent definition/);
    expect(prose).toMatch(/the agent file is the truth and the row\s+is the stale side/);
    // The third claim, and the one a reader has nowhere else to learn: this
    // paragraph is the only shipped prose stating where a class GOES. Text
    // promising the two keys on every emitted file would misdescribe the rule
    // the resolvers are built on — an unresolvable class omits the key so the
    // client's own default applies. Anchored, then answered against the
    // resolvers, so the clause can neither drift back to the stronger claim nor
    // outlive the behaviour it describes.
    expect(prose).toMatch(
      /leaves selection to the client's own default/,
    );
    expect(prose).toMatch(/check effective dispatch\s+identity/);
    expect(prose).toMatch(/unresolved assignment/);
    for (const tool of TOOLS) {
      // The very first row of the table this paragraph introduces: no client
      // publishes a name for the top class, so with no pin it resolves nowhere
      // — the omission the sentence above promises, on all four at once.
      expect(resolveModelValue("frontier", tool), tool).toBeUndefined();
    }
  });

  it("fixture: a dropped role and a borrowed one are both flagged", () => {
    // The two drift shapes, in the exact form each has already shipped: before
    // this unit the standard row named "the fix rounds that still need
    // judgement" and never the word `fixer`, so the role was unfindable in the
    // table; and before the rework it named the implementer, which the corpus
    // declares `advanced`. A one-directional check catches only the second.
    const drifted = [
      "### Model ladder",
      "",
      "| Class | Assigned to |",
      "|---|---|",
      ...MODEL_LADDER.map((entry) =>
        entry.modelClass === "standard"
          ? "| standard | `researcher`; `creator`; `performance`; `implementer` |"
          : `| ${entry.modelClass} | ${entry.roles.map((role) => `\`${role}\``).join("; ")} |`,
      ),
    ].join("\n");

    expect(ladderParityProblems(drifted).toSorted()).toEqual([
      "the standard row names `implementer`, assigned to another class",
      "the standard row never names `fixer`",
    ]);
  });

  it("fixture: a table missing a class row is flagged, not skipped", () => {
    // Without this the role check would `continue` past an absent class and
    // report nothing — a parity function that passes by reading less.
    const truncated = ["### Model ladder", "", "| Class | Assigned to |", "|---|---|"].join("\n");

    expect(ladderParityProblems(truncated)).toEqual(
      MODEL_LADDER.map((entry) => `the table ships no \`${entry.modelClass}\` row`),
    );
  });
});

describe("CLIENT_MODEL_PROJECTION", () => {
  it("carries one row per supported client, self-identified", () => {
    expect(Object.keys(CLIENT_MODEL_PROJECTION).toSorted()).toEqual([...TOOLS].toSorted());
    for (const tool of TOOLS) expect(projection(tool).tool).toBe(tool);
  });

  it("cites a url and an ISO access date on every row", () => {
    for (const tool of TOOLS) {
      const { citation } = projection(tool);
      expect(citation.url, tool).toMatch(/^https:\/\/\S+$/);
      expect(citation.accessDate, tool).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(citation.accessDate)), tool).toBe(false);
    }
  });

  it("declares only ladder classes in an alias table", () => {
    for (const tool of TOOLS) {
      for (const [modelClass, alias] of Object.entries(projection(tool).aliases)) {
        expect(isModelClass(modelClass), `${tool} aliases an off-ladder class`).toBe(true);
        expect(alias, `${tool}.${modelClass}`).not.toBe("");
      }
    }
  });

  it("carries the effort axis on every client but the one the SoT drops it on", () => {
    // Effort is carried per client where supported and omitted on Copilot cloud
    // (documented) — one omission, and it is named. A second row answering
    // `null` here is the axis being dropped in code with nothing behind
    // it, which is how this client's carrier went missing the first time.
    const carrying = TOOLS.filter((tool) => projection(tool).effortCarrier !== null);
    expect(carrying.toSorted()).toEqual(["claude", "codex", "cursor"]);
    expect(projection("copilot").effortCarrier).toBeNull();
  });

  it("supplies exactly the carrier each row declares, and nothing of the other", () => {
    for (const tool of TOOLS) {
      const { effortCarrier, effortKey, effortTemplate } = projection(tool);
      expect(effortKey === null, `${tool} declares ${effortCarrier} and a key`).toBe(
        effortCarrier !== "key",
      );
      expect(effortTemplate === null, `${tool} declares ${effortCarrier} and a template`).toBe(
        effortCarrier !== "model-suffix",
      );
    }
  });

  it("substitutes a level into every model-suffix template it declares", () => {
    for (const tool of TOOLS) {
      const { effortTemplate } = projection(tool);
      if (effortTemplate === null) continue;
      expect(effortTemplate, tool).toContain(EFFORT_PLACEHOLDER);
      const composed = effortTemplate.replace(EFFORT_PLACEHOLDER, "high");
      expect(composed, tool).toContain("high");
      expect(composed, tool).not.toContain(EFFORT_PLACEHOLDER);
    }
    // The one such client today, in the bracket form its docs publish: options
    // are `id=value` pairs inside a single group appended to the model id.
    expect(projection("cursor").effortTemplate).toBe("[effort={effort}]");
  });

  it("keeps the client-agnostic value vocabulary out of the alias tables", () => {
    // `inherit` is every client's own default, not a value the engine picks:
    // emitting it re-declares the client's default as an engine decision, which
    // is the inversion this module exists to end.
    for (const tool of TOOLS) {
      expect(Object.values(projection(tool).aliases)).not.toContain("inherit");
    }
  });
});

describe("resolveModelValue", () => {
  it("projects the three aliased classes on claude and omits the class it has no name for", () => {
    expect(resolveModelValue("advanced", "claude")).toBe("opus");
    expect(resolveModelValue("standard", "claude")).toBe("sonnet");
    expect(resolveModelValue("economy", "claude")).toBe("haiku");
    // No alias is published above the top one, and none is invented here.
    expect(resolveModelValue("frontier", "claude")).toBeUndefined();
  });

  it("emits nothing for cursor without a pin, and the operator's id with one", () => {
    for (const modelClass of MODEL_CLASSES) {
      // Honest silence: never the literal that used to be emitted for all four.
      expect(resolveModelValue(modelClass, "cursor"), modelClass).toBeUndefined();
    }
    // The pinned id arrives carrying the class's effort, because a bracket
    // parameter of the model value is this client's only carrier for that axis
    // (the suite below). Justification for the changed literal: this line read
    // `"some-pinned-id"` while the projection declared no carrier at all, and
    // that bare form was the shape in which the effort axis went missing here.
    expect(resolveModelValue("standard", "cursor", { standard: "some-pinned-id" })).toBe(
      "some-pinned-id[effort=medium]",
    );
  });

  it("never answers with an empty string when a client has no alias for a class", () => {
    // An empty `model:` value is a parse hazard on the client; an absent key is
    // the documented inherit-the-default behaviour.
    for (const tool of TOOLS) {
      for (const modelClass of MODEL_CLASSES) {
        const value = resolveModelValue(modelClass, tool);
        expect(value === undefined || value.length > 0, `${tool}/${modelClass}`).toBe(true);
      }
    }
  });

  it("lets an operator pin outrank the client's own alias", () => {
    // The operator override: the pin is the operator's stated choice, and
    // it wins on a client that publishes aliases just as it does on one that
    // does not. Typed as the map `stamity config` will hand over, so the stored
    // shape and the resolver's parameter are checked against each other here.
    const pins: ModelPinMap = { standard: "pinned-over-alias" };
    expect(resolveModelValue("standard", "claude", pins)).toBe("pinned-over-alias");
    expect(resolveModelValue("frontier", "codex", { frontier: "pinned-id" })).toBe("pinned-id");
    // A pin for one class leaves the others on the ladder's own answer.
    expect(resolveModelValue("economy", "claude", pins)).toBe("haiku");
  });

  it("treats a blank or whitespace-only pin as absent", () => {
    expect(resolveModelValue("standard", "claude", { standard: "" })).toBe("sonnet");
    expect(resolveModelValue("standard", "claude", { standard: "   " })).toBe("sonnet");
    expect(resolveModelValue("standard", "cursor", { standard: "  " })).toBeUndefined();
    // A padded id is emitted trimmed rather than as the client's parse problem,
    // and the class's effort rides on it as it does on any id this client takes
    // (same justification as the changed literal above).
    expect(resolveModelValue("standard", "cursor", { standard: "  padded-id  " })).toBe(
      "padded-id[effort=medium]",
    );
  });

  it("answers undefined for an unknown class on every client, and throws nothing", () => {
    for (const tool of TOOLS) {
      expect(() => resolveModelValue("nonsense-class", tool)).not.toThrow();
      expect(resolveModelValue("nonsense-class", tool), tool).toBeUndefined();
      // Not even a pin resurrects a class the ladder does not assign.
      expect(
        resolveModelValue("nonsense-class", tool, { standard: "pinned-id" }),
        tool,
      ).toBeUndefined();
    }
  });

  it("writes nothing into a model key a client does not have", () => {
    // Vacuous while every client publishes a model field, and deliberately so:
    // the day a row declares `modelKey: null`, this is the case that stops a
    // pin from being written into a field the client never reads.
    for (const tool of TOOLS) {
      if (projection(tool).modelKey !== null) continue;
      for (const modelClass of MODEL_CLASSES) {
        expect(resolveModelValue(modelClass, tool, { [modelClass]: "pinned-id" }), tool).toBe(
          undefined,
        );
      }
    }
  });
});

describe("resolveEffortValue", () => {
  it("projects the ladder's own default on the clients that publish an effort key", () => {
    for (const tool of TOOLS) {
      if (projection(tool).effortKey === null) continue;
      for (const modelClass of MODEL_CLASSES) {
        expect(resolveEffortValue(modelClass, tool), `${tool}/${modelClass}`).toBe(
          row(modelClass).defaultEffort,
        );
      }
    }
    // The two clients that do publish one, named: the codex key is the shipped
    // emission's, and claude's is the frontmatter field of the same name.
    expect(projection("codex").effortKey).toBe("model_reasoning_effort");
    expect(resolveEffortValue("advanced", "codex")).toBe("high");
    expect(resolveEffortValue("standard", "codex")).toBe("medium");
    expect(resolveEffortValue("economy", "codex")).toBe("low");
  });

  it("answers undefined for every class on a client with no standalone key", () => {
    // Read off the carrier rather than a hardcoded pair. The two clients that
    // answer nothing HERE do so for opposite reasons: one drops the axis by
    // documented decision, the other carries it inside the model value. The
    // earlier version of this case asserted the pair together as "inexpressible",
    // which made the dropped carrier load-bearing — a test pinning a silence.
    for (const tool of TOOLS) {
      if (projection(tool).effortKey !== null) continue;
      for (const modelClass of MODEL_CLASSES) {
        expect(resolveEffortValue(modelClass, tool), `${tool}/${modelClass}`).toBeUndefined();
        expect(
          resolveEffortValue(modelClass, tool, { [modelClass]: "high" }),
          `${tool}/${modelClass} with an override`,
        ).toBeUndefined();
      }
    }
    expect(projection("copilot").effortCarrier).toBeNull();
    expect(projection("cursor").effortCarrier).toBe("model-suffix");
  });

  it("lets an operator override outrank the class default, and ignores a blank one", () => {
    const efforts: EffortMap = { economy: "high" };
    expect(resolveEffortValue("economy", "codex", efforts)).toBe("high");
    expect(resolveEffortValue("advanced", "claude", { advanced: "low" })).toBe("low");
    // Cast: `stamity config` reads its maps out of a file, so a blank value can
    // reach this boundary even though the compile-time type forbids it. The
    // guard is what keeps a blank config key from emitting a valueless one.
    const blank = { economy: "  " } as unknown as { economy: "low" };
    expect(resolveEffortValue("economy", "codex", blank)).toBe("low");
  });

  it("answers undefined for an unknown class on every client", () => {
    for (const tool of TOOLS) {
      expect(() => resolveEffortValue("nonsense-class", tool)).not.toThrow();
      expect(resolveEffortValue("nonsense-class", tool), tool).toBeUndefined();
    }
  });
});

describe("the effort axis on a model-value carrier", () => {
  it("rides on the pinned id at the class's own level", () => {
    // The class default reaches this client exactly as it reaches the two with
    // keys of their own — that is what "projected to all four" means for a
    // client whose carrier happens to be shaped differently.
    expect(resolveModelValue("frontier", "cursor", { frontier: "pinned-id" })).toBe(
      "pinned-id[effort=high]",
    );
    expect(resolveModelValue("economy", "cursor", { economy: "pinned-id" })).toBe(
      "pinned-id[effort=low]",
    );
  });

  it("takes the same operator override the standalone-key clients take", () => {
    const pins: ModelPinMap = { standard: "pinned-id" };
    const efforts: EffortMap = { standard: "high" };
    expect(resolveModelValue("standard", "cursor", pins, efforts)).toBe("pinned-id[effort=high]");
    // One setting, two carrier shapes, one level — the declare-once claim.
    expect(resolveEffortValue("standard", "codex", efforts)).toBe("high");
  });

  it("leaves a pin that carries its own bracket group verbatim", () => {
    // Options live comma-separated inside ONE group, so appending a second is a
    // value the client cannot parse; and an operator who typed brackets stated
    // the whole expression. It doubles as the per-class opt-out for a model
    // whose documented options do not include effort.
    expect(resolveModelValue("standard", "cursor", { standard: "pinned-id[]" })).toBe(
      "pinned-id[]",
    );
    expect(
      resolveModelValue("standard", "cursor", { standard: "pinned-id[effort=low,context=300k]" }),
    ).toBe("pinned-id[effort=low,context=300k]");
  });

  it("appends nothing on a client that carries effort in a key of its own", () => {
    for (const tool of TOOLS) {
      if (projection(tool).effortCarrier === "model-suffix") continue;
      for (const modelClass of MODEL_CLASSES) {
        const value = resolveModelValue(
          modelClass,
          tool,
          { [modelClass]: "pinned-id" },
          { [modelClass]: "high" },
        );
        expect(value === undefined || !value.includes("["), `${tool}/${modelClass}`).toBe(true);
      }
    }
  });
});

describe("the effort axis has no exported predicate", () => {
  it("publishes only the two resolvers an adapter calls", () => {
    // `isEffortExpressible` used to live here, answering whether an effort
    // setting binds on a given client — with its docstring naming `stamity
    // config` as the consumer and nothing but this suite importing it. A
    // capability with no caller plus a text claiming one is the defect class
    // this review exists to end, so it went rather than staying half-true; the
    // config command resolves a level without naming a client, so it had
    // nowhere to call it from. Re-adding it is a config-surface change that
    // ships with its caller, and this case fails when the export returns alone.
    const source = readFileSync(new URL("src/roster/modelLadder.ts", REPO_ROOT), "utf8");
    const exportedFunctions = [...source.matchAll(/^export function (\w+)/gm)].map(
      (match) => match[1],
    );
    // JUSTIFIED CHANGE (REQ-LADDER-001, unit c9-effort-scale): the list grew by
    // two, so the literal roster is replaced by the RULE it stood for — every
    // exported function has a caller in `src/` outside this module. A pinned
    // list would have had to move for any honest addition and could not tell a
    // called export from an unused one, which is the only thing the case was
    // ever protecting. `nearestExpressibleEffort` is called by the config
    // command's refusal and its list row; `effortDisclosures` by the planner.
    expect(exportedFunctions.toSorted()).toEqual([
      "effortDisclosures",
      "isModelClass",
      "nearestExpressibleEffort",
      "resolveEffortValue",
      "resolveModelValue",
    ]);
    for (const name of exportedFunctions) {
      expect(callersOf(name!).length, `${name} is exported with no caller in src/`).toBeGreaterThan(
        0,
      );
    }
    expect(source).not.toContain("isEffortExpressible");
  });
});

/**
 * The module's own prose, with comment markers and line wrapping flattened, so a reflowed
 * paragraph is not a failure while the claim it carries is asserted.
 */
function ladderProse(): string {
  return readFileSync(new URL("src/roster/modelLadder.ts", REPO_ROOT), "utf8")
    .replaceAll(/^\s*(?:\*|\/\/)\s?/gm, " ")
    .replaceAll(/\s+/g, " ");
}

/**
 * The two honesty disclosures this data owes a reader, each measured before it is read.
 *
 * The exposures are real and were undocumented: three of the four clients carry no aliases,
 * so on an unpinned repo this module resolves nothing for them and the CLIENT's router picks
 * the model — the sizing decision the ladder just made never reaches the emitted file. And
 * the module claimed every placement no frontmatter can declare was named in a row's
 * `rationale`, while the review loop's round-4 escalation is named in no row at all. Each
 * case asserts the behaviour first and the sentence second, so the prose cannot outlive what
 * it describes and a reworded paragraph cannot quietly drop it.
 */
describe("the ladder's own exposure disclosures", () => {
  it("says the client's router decides wherever the alias table is empty, and it does", () => {
    const routerActive = TOOLS.filter((tool) => Object.keys(projection(tool).aliases).length === 0);
    expect(routerActive.toSorted()).toEqual(["codex", "copilot", "cursor"]);

    // The measured exposure: no class resolves anywhere on these three without a pin, which
    // is exactly the state in which the client's own routing wins.
    for (const tool of routerActive) {
      for (const modelClass of MODEL_CLASSES) {
        expect(resolveModelValue(modelClass, tool), `${tool}/${modelClass}`).toBeUndefined();
      }
    }
    // ...and one client where the ladder does bind by default, so "inert" is a per-client
    // claim rather than a claim about the ladder as a whole.
    expect(resolveModelValue("standard", "claude")).toBeDefined();

    const prose = ladderProse();
    expect(prose).toMatch(/the client's own router then picks the model/i);
    expect(prose).toMatch(/binds on one client by default/i);
    expect(prose).toMatch(/an operator who wants the ladder enforced in the emitted files/i);
  });

  it("says the top class resolves only under an operator pin, on every client", () => {
    for (const tool of TOOLS) {
      expect(resolveModelValue("frontier", tool), tool).toBeUndefined();
      expect(resolveModelValue("frontier", tool, { frontier: "pinned-id" }), tool).toBeDefined();
    }
    expect(ladderProse()).toMatch(/`frontier` resolves to a value on NO client without a pin/);
  });

  it("records the round-4 escalation as a placement it does not carry", () => {
    // Two bodies promise a fresh fixer on a stronger class at round 4. No row places the
    // role above its declared class, so nothing here resolves that class — and the header
    // used to say every flow placement was named in a row's `rationale`, which sent a reader
    // looking for a rung that does not exist.
    const rungs = MODEL_LADDER.filter((entry) => entry.roles.includes("fixer")).map(
      (entry) => entry.modelClass,
    );
    expect(rungs).toEqual(["standard", "economy"]);

    const prose = ladderProse();
    // TEST CHANGE, justified (2026-09-23): the pin read "ONE FLOW PLACEMENT IS NOT
    // RECORDED HERE". The /st-work capacity rung (REQ-LADDER-003) added a second
    // unrecorded placement — a build role's one-class drop under `limit-no-reset` —
    // so the header's count moved from one to two on purpose; the round-4 pins below
    // are unchanged and the new placement gets its own assertions.
    expect(prose).toContain("TWO FLOW PLACEMENTS ARE NOT RECORDED HERE");
    expect(prose).not.toContain("ONE FLOW PLACEMENT IS NOT RECORDED HERE");
    expect(prose).toMatch(/no row below places `fixer` above `standard`/);
    expect(prose).toMatch(/that escalation is prompt-carried/i);
    // The second: the capacity rung's drop names no target class either.
    expect(prose).toMatch(/capacity rung/i);
    expect(prose).toMatch(/`limit-no-reset`/);
    expect(prose).toMatch(/that drop is prompt-carried too/i);
    // The two placements that ARE recorded stay recorded, so the correction narrows the
    // claim rather than dropping it.
    expect(prose).toMatch(/two placements no frontmatter can declare ARE recorded here/i);
  });
});

/** A manifest with nothing on it but the tools and the operator's effort map. */
function manifestWith(tools: readonly Tool[], effort: EffortMap = {}): SetupManifest {
  return {
    version: MANIFEST_VERSION,
    generatedBy: "0.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tools: [...tools],
    selection: { items: {} as SetupManifest["selection"]["items"] },
    ledger: [],
    models: { effort: { ...effort } },
  };
}

describe("the per-client effort scales", () => {
  it("declares each client's documented scale, as the vendor pages state it", () => {
    expect(projection("claude").effortScale).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(projection("codex").effortScale).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
    // The pass-through client accepts whatever the model does, so its row is
    // the whole union plus the note that says why it is not a guarantee.
    expect(projection("cursor").effortScale).toEqual([...EFFORT_LEVELS]);
    expect(projection("cursor").effortScaleNote).toBe(
      "pass-through — parameter ids and values vary by model",
    );
    // The one client with no effort surface at all: an empty scale, not a
    // narrow one, and the same row that records the documented omission.
    expect(projection("copilot").effortScale).toEqual([]);
    expect(projection("copilot").effortCarrier).toBeNull();
  });

  it("orders every scale by the union's own ranking, with no off-ladder level", () => {
    for (const tool of TOOLS) {
      const scale = projection(tool).effortScale;
      for (const level of scale) expect(EFFORT_LEVELS as readonly string[], tool).toContain(level);
      expect(scale.map((level) => effortRank(level)), tool).toEqual(
        scale.map((level) => effortRank(level)).toSorted((a, b) => a - b),
      );
      expect(new Set(scale).size, `${tool} repeats a level`).toBe(scale.length);
    }
  });

  it("cites a vendor page with a 2026-09-17 access date for every non-empty scale", () => {
    // The spec's invariant: every per-client scale carries a vendor citation
    // with an access date. The empty row has no scale to cite and says so with
    // `null` rather than with a page it did not read.
    for (const tool of TOOLS) {
      const declared = projection(tool);
      const cited = declared.effortScaleCitation;
      if (declared.effortScale.length === 0) {
        expect(cited, tool).toBeNull();
        continue;
      }
      expect(cited, tool).not.toBeNull();
      expect(cited?.url, tool).toMatch(/^https:\/\/\S+$/);
      expect(cited?.accessDate, tool).toBe("2026-09-17");
    }
    expect(projection("claude").effortScaleCitation?.url).toBe(
      "https://code.claude.com/docs/en/sub-agents",
    );
    expect(projection("codex").effortScaleCitation?.url).toBe(
      "https://learn.chatgpt.com/docs/config-file/config-reference",
    );
    expect(projection("cursor").effortScaleCitation?.url).toBe(
      "https://cursor.com/docs/sdk/typescript",
    );
  });

  it("answers a level the scale holds with that level, unchanged", () => {
    expect(nearestExpressibleEffort("xhigh", "claude")).toBe("xhigh");
    expect(nearestExpressibleEffort("xhigh", "codex")).toBe("xhigh");
    expect(nearestExpressibleEffort("max", "cursor")).toBe("max");
    for (const tool of TOOLS) {
      for (const level of projection(tool).effortScale) {
        expect(nearestExpressibleEffort(level, tool), `${tool}/${level}`).toBe(level);
      }
    }
  });

  it("falls to the highest entry below a level the scale tops out under", () => {
    expect(nearestExpressibleEffort("max", "codex")).toBe("xhigh");
  });

  it("rises to the lowest entry above a level the scale starts over", () => {
    // The only upward case the four scales produce: `minimal` on a scale whose
    // floor is `low`. Rising is the honest answer — a client that cannot be
    // asked for less than `low` is asked for `low`, never dropped.
    expect(nearestExpressibleEffort("minimal", "claude")).toBe("low");
  });

  it("answers nothing at all on an empty scale", () => {
    for (const level of EFFORT_LEVELS) {
      expect(nearestExpressibleEffort(level, "copilot"), level).toBeUndefined();
    }
  });

  it("emits the nearest expressible level from the standalone effort key", () => {
    // Two clients, one request. The operator asked for `max`; one client has
    // it and the other tops out a rung below, and neither is silently dropped.
    const asked: EffortMap = { frontier: "max" };
    expect(resolveEffortValue("frontier", "claude", asked)).toBe("max");
    expect(resolveEffortValue("frontier", "codex", asked)).toBe("xhigh");
    expect(resolveEffortValue("economy", "claude", { economy: "minimal" })).toBe("low");
    expect(resolveEffortValue("economy", "codex", { economy: "minimal" })).toBe("minimal");
  });

  it("leaves every class default expressible on every carrier, so nothing clamps unasked", () => {
    // The rider's own constraint: class defaults do not move, and with no
    // operator map no emitted byte changes. Asserted as the property rather
    // than as the four literals, so a default that moved onto an unexpressible
    // rung fails here instead of in a golden snapshot.
    for (const rung of MODEL_LADDER) {
      for (const tool of TOOLS) {
        if (projection(tool).effortCarrier === null) continue;
        expect(
          nearestExpressibleEffort(rung.defaultEffort, tool),
          `${tool}/${rung.modelClass}`,
        ).toBe(rung.defaultEffort);
      }
    }
  });

  it("carries the level into the bracket client's model value, clamped the same way", () => {
    // One axis, two carriers: the pass-through client reads its level through
    // the model value, and it has to be the SAME level the key carrier would
    // write — otherwise one operator setting means two things.
    const pinned: ModelPinMap = { frontier: "vendor-x-1" };
    expect(resolveModelValue("frontier", "cursor", pinned, { frontier: "max" })).toBe(
      "vendor-x-1[effort=max]",
    );
  });

  it("discloses exactly the clients whose scale moved the operator's level", () => {
    const lines = effortDisclosures(manifestWith(["claude", "codex"], { frontier: "max" }));
    expect(lines).toEqual([
      "effort [codex]: frontier asks for max; this client's scale ends at xhigh, emitted xhigh",
    ]);
  });

  it("says `starts at` when the client's floor is above the request", () => {
    const lines = effortDisclosures(manifestWith(["claude"], { economy: "minimal" }));
    expect(lines).toEqual([
      "effort [claude]: economy asks for minimal; this client's scale starts at low, emitted low",
    ]);
  });

  it("says nothing for a manifest with no operator effort map", () => {
    expect(effortDisclosures(manifestWith([...TOOLS]))).toEqual([]);
    // And nothing for a manifest carrying no `models` block at all, which is
    // every repository that never touched the ladder — the state the
    // byte-identity criterion is written against.
    const { models: _dropped, ...bare } = manifestWith([...TOOLS]);
    expect(effortDisclosures(bare)).toEqual([]);
  });

  it("says nothing for the client that carries no effort at all", () => {
    // An empty scale is not a clamp: copilot emits no effort key, which the
    // capability matrix already states. A disclosure here would tell an
    // operator their level was narrowed when it was never carried.
    expect(effortDisclosures(manifestWith(["copilot"], { frontier: "max" }))).toEqual([]);
  });

  it("omits the key for a level the running engine does not know", () => {
    // Same defence one layer down: an unknown level yields no emitted value at
    // all rather than a fabricated rank or a clamp toward a scale end. The
    // manifest carrying it is refused by `collectManifestErrors` first.
    const unknown = { frontier: "ultra" as EffortLevel };
    expect(resolveEffortValue("frontier", "codex", unknown)).toBeUndefined();
    expect(resolveModelValue("frontier", "cursor", { frontier: "vendor-x-1" }, unknown)).toBe(
      "vendor-x-1",
    );
  });

  it("ignores a level the running engine does not know rather than mis-ranking it", () => {
    // A manifest written by a newer engine is refused by `collectManifestErrors`
    // long before a plan is composed; this is the belt-and-braces answer for a
    // caller that skipped validation — silence, not a fabricated rank.
    const unknown = manifestWith(["codex"], { frontier: "ultra" as EffortLevel });
    expect(effortDisclosures(unknown)).toEqual([]);
  });
});

describe("kernel boundary", () => {
  it("imports the types leaf only", () => {
    const source = readFileSync(new URL("src/roster/modelLadder.ts", REPO_ROOT), "utf8");
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    // JUSTIFIED CHANGE (REQ-LADDER-001, unit c9-effort-scale): the module gained
    // a second types-leaf specifier and its first RUNTIME import. `effortRank`
    // and `EFFORT_LEVELS` are values the clamp compares on, and the disclosure
    // reads a manifest's tools and effort map. Both specifiers are `src/types`,
    // the leaf every layer may import, so the kernel rule the case exists for —
    // the roster imports nothing but types — is unchanged; what moved is the
    // stricter type-only claim that sat on top of it.
    expect(specifiers.toSorted()).toEqual(["../types/core.ts", "../types/manifest.ts"]);
    expect(source).toContain('from "../types/core.ts"');
    // The manifest edge stays type-only: the disclosure reads a shape, never a
    // function from that module.
    expect(source).toContain('import type { SetupManifest } from "../types/manifest.ts"');
  });
});
