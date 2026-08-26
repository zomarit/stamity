import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  KEY_SPECS,
  getConfigValue,
  type ConfigKeySpec,
} from "../../../src/cli/commands/config.ts";
import {
  CONFIG_REFERENCE_DOC_PATH,
  UNSET_PROBE,
  cell,
  renderConfigReference,
  renderConfigReferenceFrom,
  table,
} from "../../../src/cli/docs/configReference.ts";
import { REGENERATE_COMMAND } from "../../../src/cli/docs/referencePages.ts";
import { collectManifestErrors, manifestPath } from "../../../src/manifest/manifest.ts";
import { CLIENT_MODEL_PROJECTION } from "../../../src/roster/modelLadder.ts";
import { EFFORT_LEVELS, TOOLS, type ModelClass } from "../../../src/types/core.ts";
import { EngineError } from "../../../src/types/errors.ts";

/**
 * The drift gate on the configuration reference.
 *
 * The page is a projection of the closed key registry, so a key added,
 * renamed, or given a different default has to show up as a byte diff here.
 * The "effective when unset" column gets its own cases: it is the one column
 * that is computed rather than copied, and it is the reason the page exists.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/configReference.ts");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-docs.mjs");

const STALE_MESSAGE =
  `${CONFIG_REFERENCE_DOC_PATH} is stale — the render no longer matches the committed page. ` +
  `Regenerate it with \`${REGENERATE_COMMAND}\` and commit the diff.`;

const committedPage = (): string =>
  readFileSync(join(REPO_ROOT, CONFIG_REFERENCE_DOC_PATH), "utf-8");

/** Rows of the "## Keys" table — the last table on the page. */
function keyRows(doc: string): string[] {
  const rows: string[] = [];
  let inKeys = false;
  let inBody = false;
  for (const line of doc.split("\n")) {
    if (line === "## Keys") inKeys = true;
    else if (line.startsWith("## ")) inKeys = false;
    if (!inKeys) continue;
    if (line.startsWith("|---")) inBody = true;
    else if (!line.startsWith("| ")) inBody = false;
    else if (inBody) rows.push(line);
  }
  return rows;
}

function cells(row: string): string[] {
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((value) => value.trim());
}

/** A spec with one field replaced — variants derive, never duplicate. */
function specOf(patch: Partial<ConfigKeySpec> = {}): ConfigKeySpec {
  return {
    key: "probe",
    hint: "a probe value",
    read: () => null,
    resolve: () => "probe-default",
    apply: () => undefined,
    ...patch,
  };
}

describe("renderConfigReference — drift gate", () => {
  it("byte-matches the committed page", () => {
    expect(STALE_MESSAGE).toContain(REGENERATE_COMMAND);
    expect(renderConfigReference(), STALE_MESSAGE).toBe(committedPage());
  });

  it("ends with exactly one trailing newline and carries no CR", () => {
    const page = renderConfigReference();
    expect(page.endsWith("\n")).toBe(true);
    expect(page.endsWith("\n\n")).toBe(false);
    expect(page).not.toContain("\r");
  });

  it("renders byte-identically twice", () => {
    expect(renderConfigReference()).toBe(renderConfigReference());
  });

  it("reads no clock", () => {
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
  });

  it("links nothing outside the tree", () => {
    expect(renderConfigReference()).not.toContain("http");
    expect(renderConfigReference()).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
  });
});

describe("key coverage", () => {
  const rows = keyRows(renderConfigReference());

  it("renders one row per addressable key, in the order `config list` prints", () => {
    expect(rows).toHaveLength(KEY_SPECS.length);
    expect(rows.map((row) => cells(row)[0])).toEqual(CONFIG_KEYS.map((key) => `\`${key}\``));
  });

  it("quotes each key's own value hint verbatim", () => {
    KEY_SPECS.forEach((spec, index) => {
      expect(cells(rows[index] ?? "")[1]).toBe(cell(spec.hint));
    });
  });

  it("computes the unset column from each key's own resolver", () => {
    KEY_SPECS.forEach((spec, index) => {
      const expected =
        spec.read(UNSET_PROBE) === null
          ? `\`${spec.resolve(UNSET_PROBE)}\``
          : "always set — the manifest schema requires it";
      expect(cells(rows[index] ?? "")[2], `unset column for ${spec.key}`).toBe(cell(expected));
    });
  });

  it("carries the model ladder's nine keys without a line of page-side authoring", () => {
    const ladderKeys = [
      "model.frontier",
      "model.advanced",
      "model.standard",
      "model.economy",
      "effort.frontier",
      "effort.advanced",
      "effort.standard",
      "effort.economy",
      "review.maxIterations",
    ];
    const rendered = rows.map((row) => cells(row)[0]);

    for (const key of ladderKeys) expect(rendered).toContain(`\`${key}\``);
  });

  /**
   * The ladder's own rule, applied to the page: a value published for a client
   * is one that client's own alias table declares, or the client-default
   * marker. Anything else is an id the emitted files do not contain, which is
   * what "never invent a value" forbids.
   *
   * CHANGED. This case read "publishes the client-default marker for
   * EVERY model row, never an invented id", and asserted the page contained no
   * `opus`. Both halves were artefacts of a probe selecting no client:
   * `resolvePin` iterates the selected clients, so with none selected it
   * answered from a no-clients fallback and never reached the alias table. The
   * page then told every reader that `model.advanced` binds the client default,
   * while `stamity config list` prints `opus` in any repo that selected claude.
   * The rule the old case protected is unchanged and is what this asserts now —
   * per client, and derived from the projection table rather than from a
   * literal.
   */
  it("publishes only aliases a client itself declares, never an invented id", () => {
    for (const spec of KEY_SPECS.filter((candidate) => candidate.key.startsWith("model."))) {
      const modelClass = spec.key.slice("model.".length) as ModelClass;
      for (const tool of TOOLS) {
        const single = getConfigValue({ ...UNSET_PROBE, tools: [tool] }, spec.key).resolved;
        expect(single, `${spec.key} on ${tool}`).toBe(
          CLIENT_MODEL_PROJECTION[tool].aliases[modelClass] ?? "(client default)",
        );
      }
    }
    // The alias now REACHES the page, which is the corrected claim itself.
    expect(renderConfigReference()).toContain("claude=opus");
  });

  /**
   * The effort counterpart, and the same correction.
   *
   * CHANGED. This case read "publishes a real level for every effort
   * row, never the per-client marker", and banned `(not expressed)` from the
   * page. That was right for a client-less probe — the marker is a PER-CLIENT
   * verdict, and with no client selected there was nothing it could be true of.
   * With every client selected the cell names each one, so the marker is no
   * longer a page-wide claim that the axis binds nowhere: it is the true
   * statement beside the two clients that cannot carry a level, next to the
   * level for the two that can. Suppressing it told a cursor repo its level
   * binds when the emitted file carries none.
   *
   * The falsehood the old case guarded against — every row collapsing to
   * `(not expressed)`, which the empty-cell refusal cannot catch because it
   * only catches a BLANK default — is still refused: each row has to name a
   * real level for at least one client.
   */
  it("marks `(not expressed)` against exactly the clients that cannot carry the level", () => {
    // With no model pin, the bracket client has no model value for its effort
    // parameter to ride on and the documented omitter has no surface at all, so
    // `effortKey === null` is exactly the set that expresses nothing here.
    const silent = TOOLS.filter((tool) => CLIENT_MODEL_PROJECTION[tool].effortKey === null);
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.length).toBeLessThan(TOOLS.length);

    for (const spec of KEY_SPECS.filter((candidate) => candidate.key.startsWith("effort."))) {
      const published = getConfigValue(UNSET_PROBE, spec.key).resolved;
      for (const tool of TOOLS) {
        const single = getConfigValue({ ...UNSET_PROBE, tools: [tool] }, spec.key).resolved;
        if (silent.includes(tool)) {
          expect(single, `${spec.key} on ${tool}`).toBe("(not expressed)");
        } else {
          expect(EFFORT_LEVELS as readonly string[], `${spec.key} on ${tool}`).toContain(single);
        }
        expect(published, `${spec.key} names ${tool}`).toContain(`${tool}=${single}`);
      }
      expect(published, `${spec.key} names no client that carries the level`).not.toBe(
        "(not expressed)",
      );
    }
  });

  /**
   * The criterion the fix turns on, asserted from the other side: each row has
   * to say what `stamity config` says. Built from single-client manifests read
   * through `getConfigValue` — the function `config get` and `config list` both
   * call — so agreement is a property of two surfaces rather than of one shared
   * call inside the renderer.
   */
  it("renders, per client, the value `stamity config` resolves on a repo that selected only it", () => {
    const ladderRows = KEY_SPECS.filter(
      (spec) => spec.key.startsWith("model.") || spec.key.startsWith("effort."),
    );
    expect(ladderRows.length).toBe(8);

    for (const spec of ladderRows) {
      const published = cells(rows[KEY_SPECS.indexOf(spec)] ?? "")[2] ?? "";
      const answers = TOOLS.map((tool) => ({
        tool,
        value: getConfigValue({ ...UNSET_PROBE, tools: [tool] }, spec.key).resolved,
      }));
      const distinct = new Set(answers.map((answer) => answer.value));

      if (distinct.size === 1) {
        expect(published, `${spec.key} where every client agrees`).toBe(`\`${answers[0]?.value}\``);
        continue;
      }
      for (const answer of answers) {
        expect(published, `${spec.key} on ${answer.tool}`).toContain(
          `${answer.tool}=${answer.value}`,
        );
      }
    }
  });

  it("resolves every key to a non-empty cell on the unset probe", () => {
    // The renderer refuses a blank cell, so this is the assertion that says
    // WHICH key would have blanked rather than only that the page threw.
    for (const spec of KEY_SPECS) {
      const resolved = spec.read(UNSET_PROBE) === null ? spec.resolve(UNSET_PROBE) : "n/a";
      expect(resolved.trim(), `unset resolution for ${spec.key}`).not.toBe("");
    }
    expect(rows.every((row) => (cells(row)[2] ?? "").length > 0)).toBe(true);
  });

  it("marks `tools` as always set — it is the one key the schema requires", () => {
    const alwaysSet = KEY_SPECS.filter((spec) => spec.read(UNSET_PROBE) !== null).map(
      (spec) => spec.key,
    );
    expect(alwaysSet).toEqual(["tools"]);
  });

  /**
   * The root cause, asserted directly. The probe carried `tools: []` — a
   * state `collectManifestErrors` refuses outright, so no repo could be in it —
   * and the model and effort resolvers iterate the selected clients, so the
   * column those two classes published came from a no-clients fallback instead
   * of from the ladder.
   */
  it("measures the column against a client selection a real repo can carry", () => {
    expect([...UNSET_PROBE.tools]).toEqual([...TOOLS]);
    const toolsDefects = collectManifestErrors(UNSET_PROBE).filter((defect) =>
      defect.includes("`tools`"),
    );
    expect(toolsDefects, "the unset probe declares a tools selection the schema refuses").toEqual(
      [],
    );
  });

  /**
   * The three fields that stay blank on purpose — see UNSET_PROBE's docstring.
   * No resolver reads them, so a future resolver that DOES read one resolves to
   * an empty string and the empty-cell refusal fires. Asserted so that "make
   * the probe schema-valid" never quietly removes the trap along with the
   * empty `tools`.
   */
  it("keeps the three unread manifest fields blank, so the empty-cell trap survives", () => {
    expect([UNSET_PROBE.generatedBy, UNSET_PROBE.createdAt, UNSET_PROBE.updatedAt]).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("says on the page that the column is measured against every supported client", () => {
    const page = renderConfigReference();
    expect(page).toContain("selects every supported client");
    expect(page).toContain("where the clients disagree");
  });

  it("names the manifest file the keys live in, derived from the engine's own path", () => {
    expect(renderConfigReference()).toContain(manifestPath(""));
  });

  it("points at the CLI reference for the verbs rather than restating them", () => {
    const page = renderConfigReference();
    expect(page).toContain("[the CLI reference](cli-reference.md)");
    expect(page).toContain("stamity sync");
  });
});

describe("refuse-to-render", () => {
  it("refuses an empty registry, naming where KEY_SPECS lives", () => {
    const empty: ConfigKeySpec[] = [];
    const call = (): string => renderConfigReferenceFrom(empty);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/src\/cli\/commands\/config\.ts/);
  });

  it("refuses a key with no name", () => {
    expect(() => renderConfigReferenceFrom([specOf({ key: "  " })])).toThrowError(/empty key/);
  });

  it("refuses a key with no value hint, naming the key", () => {
    const vague = specOf({ key: "vague", hint: "" });
    const call = (): string => renderConfigReferenceFrom([vague]);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/"vague"/);
    expect(call).toThrowError(/hint/);
  });

  it("refuses a duplicated key", () => {
    expect(() => renderConfigReferenceFrom([specOf(), specOf()])).toThrowError(/declared twice/);
  });

  /**
   * The guard that protects the probe itself: a resolver reading a field the
   * unset probe leaves blank would publish an empty default. That change
   * compiles cleanly, so this is the only thing that catches it.
   */
  it("refuses a key whose unset resolution renders empty, naming the key", () => {
    const call = (): string =>
      renderConfigReferenceFrom([specOf({ key: "blank", resolve: (m) => m.generatedBy })]);
    expect(call).toThrowError(EngineError);
    expect(call).toThrowError(/"blank"/);
    expect(call).toThrowError(/empty/);
  });

  it("classifies every refusal as VALIDATION_ERROR", () => {
    try {
      renderConfigReferenceFrom([]);
      expect.unreachable("empty registry must refuse");
    } catch (err) {
      expect((err as EngineError).code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("markdown primitives", () => {
  it("escapes pipes and collapses newlines so a hint stays one cell", () => {
    expect(cell("one of a | b")).toBe("one of a \\| b");
    expect(cell("wrapped\n   value")).toBe("wrapped value");
  });

  it("builds a header, a delimiter, and one line per row", () => {
    expect(table(["A", "B"], [["1", "2"]])).toEqual(["| A | B |", "|---|---|", "| 1 | 2 |"]);
  });

  it("keeps a piped hint from shearing the keys table into extra columns", () => {
    const page = renderConfigReferenceFrom([specOf({ hint: "one of a | b" })]);
    const row = keyRows(page)[0] ?? "";
    expect(cells(row)).toHaveLength(3);
  });
});

describe("scripts/generate-docs.mjs --page config", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-p6u03-config-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("writes the rendered page, and a second run produces zero diff", () => {
    const run = (): string => {
      execFileSync(process.execPath, [SCRIPT_PATH, "--page", "config", "--out-dir", workspace], {
        encoding: "utf-8",
      });
      return readFileSync(join(workspace, CONFIG_REFERENCE_DOC_PATH), "utf-8");
    };
    const first = run();
    expect(first).toBe(renderConfigReference());
    expect(run()).toBe(first);
  });
});
