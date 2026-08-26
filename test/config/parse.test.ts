import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { EngineError } from "../../src/types/errors.ts";
import {
  isPlainObject,
  parseJsonStrict,
  parseYamlStrict,
  readEnvBool,
  readEnvInt,
  rejectUnknownFields,
  requireBoolean,
  requireEnum,
  requireString,
  requireStringArray,
  unknownFields,
} from "../../src/config/parse.ts";

const SOURCE = ".stamity/manifest.json";

/** Asserts the thrown value is an EngineError of `code` and returns it for message checks. */
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

describe("isPlainObject", () => {
  it("admits maps only — null, arrays and scalars are not document roots", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null) as object)).toBe(true);
    for (const value of [null, undefined, [], [1], "s", 0, false, () => 0]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});

describe("parseJsonStrict", () => {
  it("returns the parsed map for a well-formed document", () => {
    expect(parseJsonStrict('{"tools":["cursor"],"n":1}', SOURCE)).toEqual({
      tools: ["cursor"],
      n: 1,
    });
  });

  it("names the source and keeps the parser error as cause on a syntax failure", () => {
    const error = expectEngineError(() => parseJsonStrict('{"tools":', SOURCE), "CONFIG_ERROR");
    expect(error.message).toContain(SOURCE);
    expect(error.exitCode).toBe(1);
    expect(error.cause).toBeInstanceOf(SyntaxError);
    // One line only: parser context is not re-printed into the operator message.
    expect(error.message.split("\n")).toHaveLength(1);
  });

  it("rejects every non-object root, naming the source and the value class", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["[1,2]", "an array"],
      ["null", "null"],
      ['"text"', 'string "text"'],
      ["42", "number 42"],
      ["true", "boolean true"],
    ];
    for (const [raw, described] of cases) {
      const error = expectEngineError(() => parseJsonStrict(raw, SOURCE), "CONFIG_ERROR");
      expect(error.message).toContain(SOURCE);
      expect(error.message).toContain("document root");
      expect(error.message).toContain(described);
    }
  });

  it("truncates a long scalar root instead of echoing it into the message", () => {
    const error = expectEngineError(
      () => parseJsonStrict(JSON.stringify("x".repeat(500)), SOURCE),
      "CONFIG_ERROR",
    );
    expect(error.message.length).toBeLessThan(200);
    expect(error.message).toContain("…");
  });
});

describe("parseYamlStrict", () => {
  const YAML_SOURCE = ".stamity/hooks/build.yaml";

  it("returns the parsed map for a well-formed document", () => {
    expect(parseYamlStrict("tools:\n  - cursor\nn: 1\n", YAML_SOURCE)).toEqual({
      tools: ["cursor"],
      n: 1,
    });
  });

  it("names the source on a syntax failure", () => {
    const error = expectEngineError(
      () => parseYamlStrict("a:\n  - b\n - c\n", YAML_SOURCE),
      "CONFIG_ERROR",
    );
    expect(error.message).toContain(YAML_SOURCE);
    expect(error.exitCode).toBe(1);
    expect(error.message.split("\n")).toHaveLength(1);
  });

  it("rejects non-object roots, naming the source", () => {
    for (const raw of ["- a\n- b\n", "42\n", "just a scalar\n"]) {
      const error = expectEngineError(() => parseYamlStrict(raw, YAML_SOURCE), "CONFIG_ERROR");
      expect(error.message).toContain(YAML_SOURCE);
      expect(error.message).toContain("document root");
    }
  });

  it("reads an empty document as an empty map so an empty frontmatter block is not a defect", () => {
    for (const raw of ["", "   \n", "# only a comment\n", "null\n"]) {
      expect(parseYamlStrict(raw, YAML_SOURCE)).toEqual({});
    }
  });

  it("resolves anchors and merge keys", () => {
    const raw = ["base: &base", "  timeout: 30", "  retries: 2", "job:", "  <<: *base", "  retries: 5", ""].join(
      "\n",
    );
    expect(parseYamlStrict(raw, YAML_SOURCE)).toEqual({
      base: { timeout: 30, retries: 2 },
      job: { timeout: 30, retries: 5 },
    });
  });

  it("refuses an alias-expansion bomb instead of expanding it", () => {
    // Nine-way fan-out per level: expanded eagerly this is 9^10 nodes. The yaml
    // package's default alias-count guard refuses it, which is the property under
    // test; the elapsed bound is a smoke check that refusal is immediate, not a
    // performance benchmark.
    let raw = 'a: &a ["x","x","x","x","x","x","x","x","x"]\n';
    let previous = "a";
    for (const label of "bcdefghij") {
      raw += `${label}: &${label} [${Array.from({ length: 9 }, () => `*${previous}`).join(",")}]\n`;
      previous = label;
    }

    const started = Date.now();
    const error = expectEngineError(() => parseYamlStrict(raw, YAML_SOURCE), "CONFIG_ERROR");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(error.message).toContain(YAML_SOURCE);
  });
});

describe("require* field validators", () => {
  it("returns the value when the field matches", () => {
    const obj = { name: "core", enabled: true, tags: ["a", "b"] };
    expect(requireString(obj, "name", { source: SOURCE })).toBe("core");
    expect(requireBoolean(obj, "enabled", { source: SOURCE })).toBe(true);
    expect(requireStringArray(obj, "tags", { source: SOURCE })).toEqual(["a", "b"]);
    expect(requireStringArray({ tags: [] }, "tags", { source: SOURCE })).toEqual([]);
  });

  it("returns undefined for an optional field that is absent", () => {
    expect(requireString({}, "name", { source: SOURCE, optional: true })).toBeUndefined();
    expect(requireBoolean({}, "enabled", { source: SOURCE, optional: true })).toBeUndefined();
    expect(requireStringArray({}, "tags", { source: SOURCE, optional: true })).toBeUndefined();
    expect(
      requireEnum({}, "tier", ["solo", "team"] as const, { source: SOURCE, optional: true }),
    ).toBeUndefined();
  });

  it("throws VALIDATION_ERROR naming source and field when a required field is absent", () => {
    const error = expectEngineError(() => requireString({}, "name", { source: SOURCE }), "VALIDATION_ERROR");
    expect(error.message).toContain(SOURCE);
    expect(error.message).toContain("`name`");
    expect(error.message).toContain("required");
    expect(error.exitCode).toBe(1);
  });

  it("throws on the wrong type, including for an optional field that is present", () => {
    const wrongType = expectEngineError(
      () => requireString({ name: 42 }, "name", { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    expect(wrongType.message).toContain("must be a string");
    expect(wrongType.message).toContain("number 42");

    expectEngineError(
      () => requireBoolean({ enabled: "yes" }, "enabled", { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    expectEngineError(
      () => requireStringArray({ tags: ["a", 2] }, "tags", { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    expectEngineError(
      () => requireStringArray({ tags: "a,b" }, "tags", { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    // `optional` licenses absence, never a wrong-typed value.
    expectEngineError(
      () => requireString({ name: null }, "name", { source: SOURCE, optional: true }),
      "VALIDATION_ERROR",
    );
  });

  it("treats an inherited key as absent so a prototype member is never read as a value", () => {
    const error = expectEngineError(
      () => requireString({}, "constructor", { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain("required");
    expect(requireString({}, "toString", { source: SOURCE, optional: true })).toBeUndefined();
  });
});

describe("requireEnum", () => {
  const TIERS = ["solo", "team", "scaleup"] as const;

  it("narrows to the literal union", () => {
    const tier = requireEnum({ tier: "team" }, "tier", TIERS, { source: SOURCE });
    expectTypeOf(tier).toEqualTypeOf<"solo" | "team" | "scaleup" | undefined>();
    expect(tier).toBe("team");
  });

  it("returns undefined for an optional field that is absent", () => {
    expect(requireEnum({}, "tier", TIERS, { source: SOURCE, optional: true })).toBeUndefined();
  });

  it("throws for a value outside the set and lists the admissible values", () => {
    const error = expectEngineError(
      () => requireEnum({ tier: "enterprise" }, "tier", TIERS, { source: SOURCE }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toContain('"solo" | "team" | "scaleup"');
    expect(error.message).toContain('string "enterprise"');
  });

  it("throws for a non-string value of the right spelling class", () => {
    expectEngineError(
      () => requireEnum({ tier: 1 }, "tier", TIERS, { source: SOURCE }),
      "VALIDATION_ERROR",
    );
  });
});

describe("unknownFields / rejectUnknownFields", () => {
  const KNOWN = ["version", "tools"] as const;

  it("lists only unknown own keys, sorted", () => {
    expect(unknownFields({ version: 1, tools: [], zeta: 1, alpha: 2 }, KNOWN)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(unknownFields({ version: 1 }, KNOWN)).toEqual([]);
    expect(unknownFields({}, [])).toEqual([]);
  });

  it("passes silently when every key is known", () => {
    expect(() => rejectUnknownFields({ version: 1, tools: [] }, KNOWN, SOURCE)).not.toThrow();
  });

  it("names every unknown key in one error, not just the first", () => {
    const error = expectEngineError(
      () => rejectUnknownFields({ version: 1, zeta: 1, beta: 2, alpha: 3 }, KNOWN, SOURCE),
      "VALIDATION_ERROR",
    );
    for (const key of ['"alpha"', '"beta"', '"zeta"']) {
      expect(error.message).toContain(key);
    }
    expect(error.message).toContain(SOURCE);
    expect(error.message).toContain('Allowed: "tools", "version"');
    // Sorted, so the message is stable across key-insertion order.
    expect(error.message.indexOf('"alpha"')).toBeLessThan(error.message.indexOf('"beta"'));
  });
});

describe("readEnvInt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads process.env by default", () => {
    vi.stubEnv("STAMITY_TEST_INT", "7");
    expect(readEnvInt("STAMITY_TEST_INT")).toBe(7);
  });

  it("returns undefined when unset or blank", () => {
    expect(readEnvInt("STAMITY_TEST_INT", {})).toBeUndefined();
    expect(readEnvInt("STAMITY_TEST_INT", { STAMITY_TEST_INT: "" })).toBeUndefined();
    expect(readEnvInt("STAMITY_TEST_INT", { STAMITY_TEST_INT: "   " })).toBeUndefined();
  });

  it("returns undefined for garbage instead of throwing", () => {
    for (const raw of ["abc", "12abc", "NaN", "Infinity", "-Infinity", "1,000"]) {
      expect(() => readEnvInt("K", { K: raw })).not.toThrow();
      expect(readEnvInt("K", { K: raw })).toBeUndefined();
    }
  });

  it("truncates toward zero and accepts surrounding whitespace", () => {
    expect(readEnvInt("K", { K: " 12 " })).toBe(12);
    expect(readEnvInt("K", { K: "1.9" })).toBe(1);
    expect(readEnvInt("K", { K: "-1.9" })).toBe(-1);
    expect(readEnvInt("K", { K: "0" })).toBe(0);
    expect(readEnvInt("K", { K: "1e3" })).toBe(1000);
  });
});

describe("readEnvBool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads process.env by default", () => {
    vi.stubEnv("STAMITY_TEST_BOOL", "1");
    expect(readEnvBool("STAMITY_TEST_BOOL")).toBe(true);
  });

  it("accepts the true tokens case-insensitively", () => {
    for (const raw of ["1", "true", "TRUE", " True ", "yes", "on"]) {
      expect(readEnvBool("K", { K: raw })).toBe(true);
    }
  });

  it("accepts the false tokens case-insensitively", () => {
    for (const raw of ["0", "false", "FALSE", " False ", "no", "off"]) {
      expect(readEnvBool("K", { K: raw })).toBe(false);
    }
  });

  it("returns undefined — no signal — when unset, blank or unrecognized, and never throws", () => {
    for (const env of [{}, { K: "" }, { K: "  " }, { K: "maybe" }, { K: "2" }, { K: "y" }]) {
      expect(() => readEnvBool("K", env)).not.toThrow();
      expect(readEnvBool("K", env)).toBeUndefined();
    }
  });
});
