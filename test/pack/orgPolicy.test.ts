import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORG_POLICY_REL_PATH,
  evaluatePackSource,
  loadOrgPolicy,
  type OrgTrustPolicy,
} from "../../src/pack/orgPolicy.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Loader tests run on real temp directories: the absent-file/absent-state-dir
 * probes and the fail-closed read path are exactly what the module does to disk.
 * Evaluation tests are pure and build policies inline.
 */
const getRepo = useTempDir("org-policy");

const policyOf = (packs: OrgTrustPolicy["packs"]): OrgTrustPolicy => ({ version: 1, packs });

/** Writes `body` at the policy path inside the current temp repo; returns its root. */
async function writePolicy(body: string): Promise<string> {
  const repo = getRepo();
  await repo.seedFiles({ [ORG_POLICY_REL_PATH]: body });
  return repo.dir;
}

/** Asserts `run` rejects with an EngineError of `code` and returns it for message checks. */
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

/**
 * Fail-closed contract for one malformed body: CONFIG_ERROR naming the policy
 * file plus every `naming` token — never a null (skipped policy) or a policy.
 */
async function expectLoadRefusal(body: string, naming: string[]): Promise<EngineError> {
  const rootDir = await writePolicy(body);
  const error = await expectRejection(() => loadOrgPolicy(rootDir), "CONFIG_ERROR");
  expect(error.message).toContain(join(rootDir, ORG_POLICY_REL_PATH));
  for (const token of naming) {
    expect(error.message).toContain(token);
  }
  return error;
}

describe("ORG_POLICY_REL_PATH", () => {
  it("pins the artifact location inside the state dir", () => {
    expect(ORG_POLICY_REL_PATH).toBe(".stamity/policy.json");
  });
});

describe("loadOrgPolicy — absence (policy is opt-in)", () => {
  it("returns null when no policy file exists, and null evaluates to allow", async () => {
    const policy = await loadOrgPolicy(getRepo().dir);
    expect(policy).toBeNull();
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({ decision: "allow" });
    expect(evaluatePackSource(policy, "@acme/kit", "npm-package")).toStrictEqual({
      decision: "allow",
    });
  });

  it("returns null when the state dir path is not a directory (no artifact can exist)", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity": "a stray file where the state dir would be" });
    expect(await loadOrgPolicy(repo.dir)).toBeNull();
  });
});

describe("loadOrgPolicy — valid documents", () => {
  it("round-trips a full policy", async () => {
    const rootDir = await writePolicy(
      JSON.stringify({
        version: 1,
        packs: { allow: ["ops", "@acme/*"], deny: ["npm-package"] },
      }),
    );
    expect(await loadOrgPolicy(rootDir)).toStrictEqual(
      policyOf({ allow: ["ops", "@acme/*"], deny: ["npm-package"] }),
    );
  });

  it("accepts an empty packs block — valid but inert, everything allowed", async () => {
    const rootDir = await writePolicy(JSON.stringify({ version: 1, packs: {} }));
    const policy = await loadOrgPolicy(rootDir);
    expect(policy).toStrictEqual(policyOf({}));
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({ decision: "allow" });
    expect(evaluatePackSource(policy, "@x/y", "npm-package")).toStrictEqual({ decision: "allow" });
  });

  it("keeps empty pattern arrays as authored (allowlist-mode semantics live in evaluation)", async () => {
    const rootDir = await writePolicy(JSON.stringify({ version: 1, packs: { allow: [], deny: [] } }));
    expect(await loadOrgPolicy(rootDir)).toStrictEqual(policyOf({ allow: [], deny: [] }));
  });

  it("tolerates a UTF-8 BOM, matching the manifest reader", async () => {
    const rootDir = await writePolicy(`\uFEFF${JSON.stringify({ version: 1, packs: {} })}`);
    expect(await loadOrgPolicy(rootDir)).toStrictEqual(policyOf({}));
  });
});

describe("loadOrgPolicy — fail-closed refusals (CONFIG_ERROR, never a silent allow)", () => {
  it("refuses malformed JSON naming the file", async () => {
    await expectLoadRefusal("not json {{{", ["Malformed JSON"]);
  });

  it("refuses a non-object document root", async () => {
    await expectLoadRefusal('["ops"]', ["document root"]);
  });

  it("refuses unknown root fields, naming them", async () => {
    await expectLoadRefusal(JSON.stringify({ version: 1, packs: {}, sources: [] }), ['"sources"']);
  });

  it("refuses unknown fields inside packs (a typo is never dropped)", async () => {
    await expectLoadRefusal(JSON.stringify({ version: 1, packs: { allowlist: ["ops"] } }), [
      '"allowlist"',
    ]);
  });

  it.each<[label: string, version: unknown]>([
    ["a newer number", 2],
    ["a string that looks right", "1"],
    ["an absent version", undefined],
  ])("refuses an unknown version: %s", async (_label, version) => {
    const body: Record<string, unknown> = { packs: {} };
    if (version !== undefined) body["version"] = version;
    await expectLoadRefusal(JSON.stringify({ ...body }), ["version"]);
  });

  it("refuses an absent or non-object packs block", async () => {
    await expectLoadRefusal(JSON.stringify({ version: 1 }), ["packs"]);
    await expectLoadRefusal(JSON.stringify({ version: 1, packs: ["ops"] }), ["packs"]);
  });

  it("refuses a non-array pattern list", async () => {
    await expectLoadRefusal(JSON.stringify({ version: 1, packs: { allow: "ops" } }), ["allow"]);
  });

  it("refuses a non-string pattern, naming its position", async () => {
    await expectLoadRefusal(JSON.stringify({ version: 1, packs: { deny: [7] } }), ["packs.deny[0]"]);
  });

  it.each<[pattern: string, why: string]>([
    ["a/b/c", "path separators beyond the one scope slash"],
    ["packs/ops", "a slash outside the @scope form"],
    ["@scope/x/y", "an extra slash under a scope"],
    ["back\\slash", "a backslash separator"],
    ["op*", "a partial wildcard"],
    ["@scope/op*", "a partial wildcard in the name part"],
    ["@scope", "a bare scope that no pack id can equal"],
    ["", "an empty pattern"],
    ["Ops", "upper case that no pack id can carry"],
  ])("rejects out-of-grammar pattern %j at load (%s)", async (pattern) => {
    await expectLoadRefusal(
      JSON.stringify({ version: 1, packs: { deny: [pattern] } }),
      [JSON.stringify(pattern)],
    );
  });

  it("states the fail-closed consequence in the refusal message", async () => {
    const error = await expectLoadRefusal(JSON.stringify({ version: 1, packs: { deny: [1] } }), []);
    expect(error.message).toContain("All pack installs are refused");
  });
});

describe("evaluatePackSource", () => {
  it("deny beats a matching allow entry for the same pack (deny-wins)", () => {
    const policy = policyOf({ allow: ["*"], deny: ["ops"] });
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "ops",
    });
  });

  it("denies a pattern duplicated in both lists", () => {
    const policy = policyOf({ allow: ["ops"], deny: ["ops"] });
    expect(evaluatePackSource(policy, "ops", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "ops",
    });
  });

  it("allowlist mode: unmatched pack denies with the literal rule, matched pack passes", () => {
    const policy = policyOf({ allow: ["ops"] });
    expect(evaluatePackSource(policy, "other", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "not in allow list",
    });
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({
      decision: "allow",
      matchedRule: "ops",
    });
  });

  it("denylist mode: allow absent, everything not denied passes", () => {
    const policy = policyOf({ deny: ["evil"] });
    expect(evaluatePackSource(policy, "ops", "npm-package")).toStrictEqual({ decision: "allow" });
    expect(evaluatePackSource(policy, "evil", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "evil",
    });
  });

  it("'@scope/*' matches the scope's packs and never a lookalike scope", () => {
    const denyScoped = policyOf({ deny: ["@scope/*"] });
    expect(evaluatePackSource(denyScoped, "@scope/x", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "@scope/*",
    });
    expect(evaluatePackSource(denyScoped, "@scopeother/x", "local-path")).toStrictEqual({
      decision: "allow",
    });

    const allowScoped = policyOf({ allow: ["@acme/*"] });
    expect(evaluatePackSource(allowScoped, "@acme/kit", "npm-package")).toStrictEqual({
      decision: "allow",
      matchedRule: "@acme/*",
    });
    expect(evaluatePackSource(allowScoped, "@acmeplus/kit", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "not in allow list",
    });
  });

  it("'*' matches every pack name and both source kinds", () => {
    const policy = policyOf({ deny: ["*"] });
    expect(evaluatePackSource(policy, "anything", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "*",
    });
    expect(evaluatePackSource(policy, "@s/x", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "*",
    });
  });

  it("kind token 'local-path' denies local dir installs regardless of pack name", () => {
    const policy = policyOf({ deny: ["local-path"] });
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "local-path",
    });
    expect(evaluatePackSource(policy, "ops", "npm-package")).toStrictEqual({ decision: "allow" });
  });

  it("splits 'catalog-pinned' out of 'local-path' in both directions", () => {
    // A curated-catalog entry resolves to a directory inside the engine
    // package, so before the third token the one rule an org reaches for —
    // "deny directory installs" — also denied the SHA-pinned catalog the whole
    // trust surface rests on, and allowlisting `local-path` to get it back
    // permitted every directory on the machine.
    const denyDirs = policyOf({ deny: ["local-path"] });
    expect(evaluatePackSource(denyDirs, "ops", "catalog-pinned")).toStrictEqual({
      decision: "allow",
    });

    const denyCatalog = policyOf({ deny: ["catalog-pinned"] });
    expect(evaluatePackSource(denyCatalog, "ops", "catalog-pinned")).toStrictEqual({
      decision: "deny",
      matchedRule: "catalog-pinned",
    });
    // A denied catalog install is denied outright, never re-read as a directory.
    expect(evaluatePackSource(denyCatalog, "ops", "local-path")).toStrictEqual({
      decision: "allow",
    });

    const catalogOnly = policyOf({ allow: ["catalog-pinned"] });
    expect(evaluatePackSource(catalogOnly, "ops", "catalog-pinned")).toStrictEqual({
      decision: "allow",
      matchedRule: "catalog-pinned",
    });
    expect(evaluatePackSource(catalogOnly, "ops", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "not in allow list",
    });
  });

  it("matches no kind token for an install whose provenance cannot be read", () => {
    // The projection lane reads the kind out of an installed pack's receipt; a
    // receipt an operator deleted has none. "unknown" must not silently widen a
    // kind rule — but name, scope and "*" rules still decide.
    expect(evaluatePackSource(policyOf({ deny: ["npm-package"] }), "ops", "unknown")).toStrictEqual({
      decision: "allow",
    });
    expect(evaluatePackSource(policyOf({ deny: ["*"] }), "ops", "unknown")).toStrictEqual({
      decision: "deny",
      matchedRule: "*",
    });
    expect(evaluatePackSource(policyOf({ deny: ["ops"] }), "ops", "unknown")).toStrictEqual({
      decision: "deny",
      matchedRule: "ops",
    });
  });

  it("denying 'npm-package' still allows local-path installs of the same pack name", () => {
    const policy = policyOf({ deny: ["npm-package"] });
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({ decision: "allow" });
    expect(evaluatePackSource(policy, "ops", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "npm-package",
    });
  });

  it("empty allow list denies everything (allowlist mode with no members)", () => {
    const policy = policyOf({ allow: [] });
    expect(evaluatePackSource(policy, "ops", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "not in allow list",
    });
  });

  it("kind tokens gate allowlist mode too", () => {
    const policy = policyOf({ allow: ["local-path"] });
    expect(evaluatePackSource(policy, "anypack", "local-path")).toStrictEqual({
      decision: "allow",
      matchedRule: "local-path",
    });
    expect(evaluatePackSource(policy, "anypack", "npm-package")).toStrictEqual({
      decision: "deny",
      matchedRule: "not in allow list",
    });
  });

  it("reports the first matching rule in list order", () => {
    const policy = policyOf({ deny: ["@a/*", "*"] });
    expect(evaluatePackSource(policy, "@a/x", "local-path")).toStrictEqual({
      decision: "deny",
      matchedRule: "@a/*",
    });
  });
});
