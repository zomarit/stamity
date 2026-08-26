import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { packLedgerRelPath, type PackInstallPlan } from "../../src/pack/install.ts";
import {
  buildReceipt,
  packDirRelPath,
  receiptRelPath,
  serializeReceipt,
  RECEIPT_FILE,
  type PackReceipt,
} from "../../src/pack/receipt.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * Pure-module suite: the receipt builder and the install-location identity are
 * plain functions over a plan, so everything here runs without a filesystem.
 * The end-to-end behaviour — the receipt actually written, rolled back, and
 * reclaimed — lives in `./install.test.ts`.
 */

const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

/** A fully-populated plan literal, as `planPackInstall` would return it. */
function planFixture(overrides: Partial<PackInstallPlan> = {}): PackInstallPlan {
  const agentTarget = ".stamity/packs/acme__ops/agents/reviewer.md";
  const ruleTarget = ".stamity/packs/acme__ops/rules/naming.md";
  return {
    manifest: {
      name: "@acme/ops",
      version: "1.2.3",
      integrity: {
        "agents/reviewer.md": sha("agent body"),
        "rules/naming.md": sha("rule body"),
      },
    },
    source: { kind: "local-path", packRoot: "/somewhere/packs/ops" },
    spec: "./packs/ops",
    writeSet: [
      {
        relPath: "agents/reviewer.md",
        targetPath: agentTarget,
        contentClass: "agents",
        contentHash: sha("agent body"),
        sizeBytes: 10,
      },
      {
        relPath: "rules/naming.md",
        targetPath: ruleTarget,
        contentClass: "rules",
        contentHash: sha("rule body"),
        sizeBytes: 9,
      },
    ],
    collisions: [],
    checks: { manifest: "pass", orgPolicy: "n/a", trustTier: "pass", signing: "n/a" },
    trustTier: "curator-verified",
    tierBasis: "catalog pin",
    policy: { decision: "allow" },
    tokensByPath: { [agentTarget]: 3, [ruleTarget]: 2 },
    totalTokens: 5,
    ...overrides,
  };
}

describe("receiptRelPath", () => {
  it("appends the receipt filename to the pack's install directory", () => {
    expect(RECEIPT_FILE).toBe("receipt.json");
    expect(receiptRelPath("@acme/ops")).toBe(".stamity/packs/acme__ops/receipt.json");
    expect(receiptRelPath("ops")).toBe(".stamity/packs/ops/receipt.json");
  });

  it("stays in lockstep with the installer's directory mapping", () => {
    // packDirRelPath is the single home of the id -> directory mapping and
    // packLedgerRelPath delegates to it; this pins the contract so a future
    // divergence (a receipt written where the ledger does not look) fails here.
    for (const packId of ["@acme/ops", "ops", "@scope/deep-name", "a.b_c-d"]) {
      expect(packDirRelPath(packId)).toBe(packLedgerRelPath(packId));
      expect(receiptRelPath(packId)).toBe(`${packLedgerRelPath(packId)}/${RECEIPT_FILE}`);
    }
  });

  it.each([["evil/nested"], ["../escape"], [""], ["Acme"], ["@acme/ops/extra"]])(
    "refuses the pack id %j rather than sanitizing it",
    (packId) => {
      let thrown: unknown;
      try {
        receiptRelPath(packId);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(EngineError);
      expect((thrown as EngineError).code).toBe("VALIDATION_ERROR");
    },
  );
});

describe("buildReceipt", () => {
  it("maps the plan into the receipt shape field for field", () => {
    const plan = planFixture();

    const receipt = buildReceipt(plan, FIXED_NOW, "9.9.9");

    expect(receipt).toEqual({
      packId: "@acme/ops",
      version: "1.2.3",
      source: { kind: "local-path", spec: "./packs/ops" },
      trustTier: "curator-verified",
      tierBasis: "catalog pin",
      checks: { manifest: "pass", orgPolicy: "n/a", trustTier: "pass", signing: "n/a" },
      policy: { decision: "allow" },
      files: [
        {
          path: ".stamity/packs/acme__ops/agents/reviewer.md",
          class: "agents",
          sha256: sha("agent body"),
          bytes: 10,
          tokens: 3,
        },
        {
          path: ".stamity/packs/acme__ops/rules/naming.md",
          class: "rules",
          sha256: sha("rule body"),
          bytes: 9,
          tokens: 2,
        },
      ],
      contextCost: { totalTokens: 5 },
      engineVersion: "9.9.9",
      installedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("copies rather than aliases the plan's mutable records", () => {
    const plan = planFixture();
    const receipt = buildReceipt(plan, FIXED_NOW, "1.0.0");

    receipt.checks.manifest = "n/a";
    expect(plan.checks.manifest).toBe("pass");
  });

  it("omits matchedRule when the policy decision carried none, and keeps it when it did", () => {
    const bare = buildReceipt(planFixture(), FIXED_NOW, "1.0.0");
    expect(Object.hasOwn(bare.policy, "matchedRule")).toBe(false);

    const matched = buildReceipt(
      planFixture({ policy: { decision: "allow", matchedRule: "@acme/*" } }),
      FIXED_NOW,
      "1.0.0",
    );
    expect(matched.policy).toEqual({ decision: "allow", matchedRule: "@acme/*" });
  });

  it("records a token count of 0 for a path the estimate map does not carry", () => {
    // The receipt records, never gates: a missing estimate must not throw.
    const receipt = buildReceipt(planFixture({ tokensByPath: {} }), FIXED_NOW, "1.0.0");
    expect(receipt.files.map((file) => file.tokens)).toEqual([0, 0]);
  });

  it("builds an empty inventory for a content-free plan", () => {
    const receipt = buildReceipt(
      planFixture({ writeSet: [], tokensByPath: {}, totalTokens: 0 }),
      FIXED_NOW,
      "1.0.0",
    );
    expect(receipt.files).toEqual([]);
    expect(receipt.contextCost).toEqual({ totalTokens: 0 });
  });
});

describe("serializeReceipt", () => {
  it("is byte-deterministic for equal inputs and round-trips through JSON", () => {
    const first = serializeReceipt(buildReceipt(planFixture(), FIXED_NOW, "1.0.0"));
    const second = serializeReceipt(buildReceipt(planFixture(), FIXED_NOW, "1.0.0"));

    // The ledger row's contentHash is over these bytes: same install inputs
    // must serialize to the same bytes, or re-install idempotency breaks.
    expect(second).toBe(first);
    expect(sha(second)).toBe(sha(first));
    expect(JSON.parse(first) as PackReceipt).toEqual(buildReceipt(planFixture(), FIXED_NOW, "1.0.0"));
  });

  it("ends with a newline so the file diffs and cats cleanly", () => {
    const text = serializeReceipt(buildReceipt(planFixture(), FIXED_NOW, "1.0.0"));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});
