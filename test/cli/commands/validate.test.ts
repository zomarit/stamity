import { chmod, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEngine } from "../../../src/index.ts";
import {
  discoverUserContent,
  userContentRoot,
  validateUserArtifact,
} from "../../../src/content/userContent.ts";
import { planHooksInfra } from "../../../src/emit/hooksInfra.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import type { SetupManifest } from "../../../src/types/manifest.ts";
import {
  collectValidateFindings,
  validateCommand,
  type ValidateFinding,
  type ValidateShadow,
} from "../../../src/cli/commands/validate.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Command-level lane: the real command module through the real program funnel,
 * against a real temp repo. Every gate this command drives reads the filesystem
 * directly (no fs seam), so the virtual-volume lane cannot host it.
 *
 * The fixtures below are deliberately minimal — each one carries exactly the
 * defect its test names, so a finding count is a statement about the command's
 * aggregation and not about how much a fixture happened to trip.
 */

const getRepo = useTempDir("stamity-validate");

/** chmod-based denial is a no-op for root and unsupported on Windows. */
const CAN_DENY_READS = process.platform !== "win32" && process.getuid?.() !== 0;

interface Envelope {
  ok: boolean;
  command: string;
  version: string;
  findings: ValidateFinding[];
  errorCount: number;
  warningCount: number;
  shadows: ValidateShadow[];
}

/** Runs `validate` and parses the single JSON document the funnel emits. */
async function runJson(cwd: string): Promise<{ code: number; doc: Envelope }> {
  const result = await runInProcess([validateCommand], ["validate", "--json"], { cwd });
  const lines = result.stdout.trim().split("\n");
  // One run, one document: a second line would mean the command printed human
  // output alongside the envelope.
  expect(lines).toHaveLength(1);
  return { code: result.code, doc: JSON.parse(lines[0] ?? "") as Envelope };
}

function runHuman(cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return runInProcess([validateCommand], ["validate"], { cwd });
}

/**
 * A user-authored agent. Omitting `id` is the frontmatter defect under test.
 *
 * FIXTURE CHANGE, justified: `load:` and `obsolete_when:` are declared by
 * default. The user-content gate gained two ADVISORY rows, so the
 * fixture that stands for "nothing wrong but the field under test" has to
 * declare them or every count in this file would move for a reason unrelated to
 * what the test is about. `lifecycle: false` drops them for the tests whose
 * subject IS the advisory.
 */
function agentArtifact(opts: { id?: string; lifecycle?: boolean } = {}): string {
  return [
    "---",
    ...(opts.id === undefined ? [] : [`id: ${opts.id}`]),
    "type: agent",
    "description: Reviews a diff and reports what it finds.",
    "tags:",
    "  - review",
    ...(opts.lifecycle === false
      ? []
      : ["load: on-demand", "obsolete_when: review runs from the diff alone"]),
    "---",
    "",
    "Reads the diff, then reports each finding with the file and line it sits on.",
    "",
  ].join("\n");
}

/** The same clean body in the shape a skill is walked as (`<dir>/SKILL.md`). */
function skillArtifact(id: string): string {
  return [
    "---",
    `id: ${id}`,
    "type: skill",
    "description: The house version of this skill, authored in this repo.",
    "tags:",
    "  - implementation",
    "load: on-demand",
    "obsolete_when: the repository's own runbook covers it",
    "---",
    "",
    "Run the suite, then read the first failure before the summary.",
    "",
  ].join("\n");
}

/** A user-authored rule that trips no gate — the shadowing fixtures' body. */
function ruleArtifact(id: string): string {
  return [
    "---",
    `id: ${id}`,
    "type: rule",
    "description: The house version of this rule, authored in this repo.",
    "tags:",
    "  - review",
    "load: on-demand",
    "obsolete_when: the repository's own linter enforces it",
    "---",
    "",
    "Name every branch after the ticket it closes.",
    "",
  ].join("\n");
}

const LEARNING_BODY = [
  "",
  "## Why",
  "",
  "The warm-up pass fills the cache in dependency order.",
  "",
  "## How to apply",
  "",
  "Call the warm-up before the smoke suite.",
  "",
].join("\n");

/** A learning that passes every gate; `integrity` is added only to break it. */
function learning(opts: { integrity?: string } = {}): string {
  return [
    "---",
    "id: cache-warmup-order",
    ...(opts.integrity === undefined ? [] : [`integrity: ${opts.integrity}`]),
    "date: 2026-01-15",
    "confidence: high",
    "summary: The warm-up pass runs before the smoke suite.",
    "reviewBy: 2030-01-01",
    "validatedAgainst: npm test",
    "---",
    LEARNING_BODY,
  ].join("\n");
}

/**
 * A hook that trips no ingress gate, plus the script it names.
 *
 * FIXTURE CHANGE, justified: the command used to be `["node", "--version"]`,
 * which the launcher allow-list now refuses — an argv with no script argument
 * is running something that is not in the repo
 * (`src/shared/launcherAllowlist.ts`, condition 3). The fixture that stands for
 * "a hook with nothing wrong with it" has to satisfy the current ingress, so it
 * names a committed repo-relative script and the repo ships it.
 */
const GUARD_SCRIPT = ".stamity/hooks/guard.mjs";
const WELL_FORMED_HOOK_FILES: Record<string, string> = {
  [GUARD_SCRIPT]: "process.exit(0)\n",
  ".stamity/hooks/notify.json": JSON.stringify({
    hooks: [{ event: "session_start", command: ["node", GUARD_SCRIPT] }],
  }),
};

/** A manifest as `init` would write it, plus whatever the test needs on top. */
async function seedManifest(rootDir: string, extra: Partial<SetupManifest> = {}): Promise<void> {
  const manifest = createManifest({
    tools: ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: "0.0.0",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  await writeManifest(rootDir, { ...manifest, ...extra });
}

describe("validate — the empty case", () => {
  it("reports a repo with nothing user-authored, and exits 0", async () => {
    const repo = getRepo();

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("nothing user-authored to validate");

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(0);
    expect(doc).toMatchObject({ ok: true, command: "validate", findings: [] });
    expect(doc.errorCount).toBe(0);
    expect(doc.warningCount).toBe(0);
  });

  it("skips the user-hooks section with a note when the repo has no manifest", async () => {
    const repo = getRepo();
    // A hooks directory that WOULD produce a finding: without a manifest there
    // is no configured hooks dir, so the section never looks at it.
    await repo.seedFiles({ ".stamity/hooks/broken.json": "{ not json" });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("note: user-hooks skipped");
    expect(human.stdout).toContain(".stamity/manifest.json");

    const { doc } = await runJson(repo.dir);
    expect(doc.findings.filter((row) => row.source === "user-hooks")).toEqual([]);
  });
});

describe("validate — user content", () => {
  it("passes a well-formed artifact and says what it checked", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/agents/diff-reader.md": agentArtifact({ id: "diff-reader" }),
    });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("checked 1 artifact");
    expect(human.stdout).not.toContain("nothing user-authored to validate");

    const { doc } = await runJson(repo.dir);
    expect(doc.findings).toEqual([]);
  });

  it("reports bad frontmatter as an error carrying the engine's message verbatim", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/overrides/agents/diff-reader.md": agentArtifact() });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.errorCount).toBe(1);

    // Verbatim is asserted against the engine itself rather than a copied
    // string: a re-worded gate message must not be able to pass this test.
    const [artifact] = await discoverUserContent(repo.dir);
    const violations = await validateUserArtifact(artifact!);
    expect(doc.findings).toEqual(
      violations.map((violation) => ({
        source: "user-content",
        path: ".stamity/overrides/agents/diff-reader.md",
        severity: violation.severity,
        message: violation.detail,
      })),
    );
  });

  it.skipIf(!CAN_DENY_READS)("names an unreadable artifact's path instead of crashing", async () => {
    const repo = getRepo();
    const sealed = ".stamity/overrides/agents/sealed.md";
    await repo.seedFiles({ [sealed]: agentArtifact({ id: "sealed" }) });
    await chmod(repo.path(sealed), 0o000);

    try {
      const { code, doc } = await runJson(repo.dir);
      expect(code).toBe(1);
      expect(doc.findings).toHaveLength(1);
      expect(doc.findings[0]).toMatchObject({
        source: "user-content",
        path: sealed,
        severity: "error",
      });
      expect(doc.findings[0]?.message).toContain("EACCES");
    } finally {
      // Restore the mode so fixture cleanup is not fighting permissions.
      await chmod(repo.path(sealed), 0o600);
    }
  });

  it("reports repo-relative paths, never the absolute engine path", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/overrides/rules/short-rule.md": agentArtifact() });

    const findings = await collectValidateFindings(repo.dir, createEngine());
    expect(findings.length).toBeGreaterThan(0);
    for (const row of findings) {
      expect(row.path.startsWith(repo.dir)).toBe(false);
      expect(row.path).toBe(".stamity/overrides/rules/short-rule.md");
    }
  });
});

describe("validate — learnings", () => {
  it("passes a learning that satisfies every gate", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/learnings/cache-warmup-order.md": learning() });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(0);
    expect(doc.findings.filter((row) => row.source === "learnings")).toEqual([]);
  });

  it("reports a body that no longer matches its integrity digest", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/learnings/stale-digest.md": learning({ integrity: `sha256:${"0".repeat(64)}` }),
    });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]).toMatchObject({
      source: "learnings",
      path: ".stamity/learnings/stale-digest.md",
      severity: "error",
    });
    expect(doc.findings[0]?.message).toContain("`integrity` does not match the body");
  });
});

describe("validate — .env.mcp", () => {
  it("warns about credential shapes and placeholders without failing the run", async () => {
    const repo = getRepo();
    // The documented example key, so the fixture carries no live credential.
    const literal = "AKIAIOSFODNN7EXAMPLE";
    await repo.seedFiles({
      ".env.mcp": ["# credentials", `AWS_ACCESS_KEY_ID=${literal}`, "GITHUB_TOKEN=", ""].join("\n"),
    });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(0);
    expect(doc.errorCount).toBe(0);
    expect(doc.warningCount).toBe(2);
    expect(doc.findings.map((row) => row.path)).toEqual([".env.mcp", ".env.mcp"]);
    expect(doc.findings[0]?.message).toContain("AWS_ACCESS_KEY_ID");
    expect(doc.findings[1]?.message).toContain("GITHUB_TOKEN");

    // The value itself never reaches a terminal transcript or a JSON log.
    const human = await runHuman(repo.dir);
    expect(human.stdout).not.toContain(literal);
    expect(JSON.stringify(doc)).not.toContain(literal);
  });
});

describe("validate — user hooks", () => {
  it("reports a malformed hook file under the configured hooks directory", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/hooks/broken.json": "{ not json" });
    await seedManifest(repo.dir, { hooks: { userHooksDir: ".stamity/hooks" } });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]).toMatchObject({
      source: "user-hooks",
      path: ".stamity/hooks/broken.json",
      severity: "error",
    });
  });

  it("passes a well-formed hook file", async () => {
    const repo = getRepo();
    await repo.seedFiles(WELL_FORMED_HOOK_FILES);
    await seedManifest(repo.dir, { hooks: { userHooksDir: ".stamity/hooks" } });

    const { code, doc } = await runJson(repo.dir);
    expect(doc.findings).toEqual([]);
    expect(code).toBe(0);
  });

  it("inspects the DEFAULT hooks directory when the manifest configures none", async () => {
    // The defect this closes: an unset `hooks.userHooksDir` was read as "no
    // hooks", so on the documented default layout this section inspected
    // nothing and reported a clean run over a hook that emission had already
    // wired. A rejected hook was live and invisible.
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/hooks/broken.json": "{ not json" });
    await seedManifest(repo.dir);

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]).toMatchObject({
      source: "user-hooks",
      path: ".stamity/hooks/broken.json",
      severity: "error",
    });
  });

  it("counts what it inspected in the default directory rather than reporting silence", async () => {
    const repo = getRepo();
    await repo.seedFiles(WELL_FORMED_HOOK_FILES);
    await seedManifest(repo.dir);

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    // Non-zero inspected count: the section read a hook and says so, where it
    // used to print nothing at all and leave "checked" empty.
    expect(human.stdout).toContain("checked 1 hook");
    expect(human.stdout).not.toContain("note: user-hooks");
  });

  it("reads the same directory emission reads, on an unconfigured manifest", async () => {
    // The parity assertion the mirrored DEFAULT_USER_HOOKS_DIR rests on: both
    // sides are driven over one repo whose manifest names no hooks directory,
    // and both have to find the same broken file. If emission's default moves,
    // this fails rather than the checker quietly pointing somewhere else.
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/hooks/broken.json": "{ not json" });
    await seedManifest(repo.dir);
    const manifest = await readManifest(repo.dir);
    expect(manifest?.hooks?.userHooksDir).toBeUndefined();

    const plan = await planHooksInfra({ rootDir: repo.dir, manifest: manifest as SetupManifest });
    const emissionSaw = plan.warnings.filter((warning) =>
      warning.includes("user hook .stamity/hooks/broken.json"),
    );
    expect(emissionSaw).toHaveLength(1);

    const { doc } = await runJson(repo.dir);
    expect(doc.findings.map((row) => row.path)).toEqual([".stamity/hooks/broken.json"]);
  });

  it("treats a whitespace-only userHooksDir as unset, not as the repo root", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/hooks/broken.json": "{ not json" });
    await seedManifest(repo.dir, { hooks: { userHooksDir: "   " } });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings.map((row) => row.path)).toEqual([".stamity/hooks/broken.json"]);
  });

  it("notes the genuinely absent default directory instead of inventing a finding", async () => {
    // The other half of treating unset as the default path: a repo that simply
    // has no hooks must not become a repo with a hooks defect.
    const repo = getRepo();
    await seedManifest(repo.dir);

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("note: user-hooks skipped");
    expect(human.stdout).toContain(".stamity/hooks/");
    expect(human.stdout).toContain("the default hooks location");

    const { doc } = await runJson(repo.dir);
    expect(doc.findings).toEqual([]);
  });

  it("names the CONFIGURED path in the absent note, not the default one", async () => {
    const repo = getRepo();
    await seedManifest(repo.dir, { hooks: { userHooksDir: "ops/hooks" } });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("note: user-hooks skipped");
    expect(human.stdout).toContain("ops/hooks/");
    expect(human.stdout).not.toContain("the default hooks location");
  });

  it("stays quiet about an existing hooks directory that holds no declarations", async () => {
    // Present-but-empty is not absent: the location exists, so the "no hooks
    // directory" note would be false. Zero findings, zero notes.
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/hooks/README.md": "hooks live here\n" });
    await seedManifest(repo.dir);

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).not.toContain("note: user-hooks");

    const { doc } = await runJson(repo.dir);
    expect(doc.findings).toEqual([]);
  });
});

describe("validate — workspace.json", () => {
  it("collects workspace findings in a repo that has no manifest of its own", async () => {
    const repo = getRepo();
    // A workspace root is often not itself an initialised repo.
    await repo.seedFiles({
      "workspace.json": JSON.stringify({ version: "not-a-semver", repos: [] }),
    });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings.every((row) => row.source === "workspace")).toBe(true);
    expect(doc.findings[0]).toMatchObject({ path: "workspace.json", severity: "error" });
    expect(doc.findings[0]?.message).toContain("`version`");
  });

  it("reports unparsable JSON as one error rather than a crash", async () => {
    const repo = getRepo();
    await repo.seedFiles({ "workspace.json": "{ repos: [" });

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]?.message).toContain("Malformed JSON");
  });
});

describe("validate — aggregation", () => {
  it("mixes errors and warnings, exits 1, and reports both counts", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/agents/diff-reader.md": agentArtifact(),
      ".env.mcp": "GITHUB_TOKEN=\n",
    });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("user-content — 1 error, 0 warnings");
    expect(human.stdout).toContain("env-mcp — 0 errors, 1 warning");
    expect(human.stdout).toContain("1 error, 1 warning across 2 sections");
    expect(human.stdout).toContain("next: fix the findings above, then re-run stamity validate");
    // Repo-relative in the printed report too, not just in the JSON payload.
    expect(human.stdout).toContain(".stamity/overrides/agents/diff-reader.md");
    expect(human.stdout).not.toContain(repo.dir);

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(1);
    expect(doc.errorCount).toBe(1);
    expect(doc.warningCount).toBe(1);
    expect(doc.findings).toHaveLength(2);
    expect(doc.findings.map((row) => row.source)).toEqual(["user-content", "env-mcp"]);
  });

  it("keeps one section's failure from hiding the others", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      "workspace.json": "{ repos: [",
      ".stamity/learnings/stale-digest.md": learning({ integrity: `sha256:${"0".repeat(64)}` }),
    });

    const findings = await collectValidateFindings(repo.dir, createEngine());
    expect(findings.map((row) => row.source)).toEqual(["learnings", "workspace"]);
  });
});

describe("validate — lifecycle advisories", () => {
  it("advises on an artifact that declares no `load` or `obsolete_when`, and still exits 0", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/agents/diff-reader.md": agentArtifact({
        id: "diff-reader",
        lifecycle: false,
      }),
    });

    const { code, doc } = await runJson(repo.dir);

    // Advisory, not a refusal: the artifact is un-retirable, not unreadable.
    expect(code).toBe(0);
    expect(doc.errorCount).toBe(0);
    expect(doc.warningCount).toBe(2);
    expect(doc.findings.map((row) => row.severity)).toEqual(["warning", "warning"]);
    expect(doc.findings[0]?.message).toContain("`load`");
    expect(doc.findings[1]?.message).toContain("`obsolete_when`");
    for (const row of doc.findings) {
      expect(row).toMatchObject({
        source: "user-content",
        path: ".stamity/overrides/agents/diff-reader.md",
      });
    }
  });

  it("still refuses the shape defects while the lifecycle pair only warns", async () => {
    const repo = getRepo();
    // No `id`, no lifecycle: one error and two warnings from one file.
    await repo.seedFiles({
      ".stamity/overrides/agents/diff-reader.md": agentArtifact({ lifecycle: false }),
    });

    const { code, doc } = await runJson(repo.dir);

    expect(code).toBe(1);
    expect(doc.errorCount).toBe(1);
    expect(doc.warningCount).toBe(2);
  });

  it("reports exactly what the engine's own gate reports, in the same order", async () => {
    // The single-source proof at the command level: the save path and this
    // command both call `checkUserArtifact`, so a re-worded or re-ranked gate
    // message cannot pass here.
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/agents/diff-reader.md": agentArtifact({ lifecycle: false }),
    });

    const { doc } = await runJson(repo.dir);
    const [artifact] = await discoverUserContent(repo.dir);
    const violations = await validateUserArtifact(artifact!);

    expect(doc.findings).toEqual(
      violations.map((violation) => ({
        source: "user-content",
        path: ".stamity/overrides/agents/diff-reader.md",
        severity: violation.severity,
        message: violation.detail,
      })),
    );
  });
});

describe("validate — shadowing", () => {
  /** A bundled rule this repo ships, so the override below really replaces one. */
  const SHADOWED_ID = "testing";

  it("names the bundled artifact an override replaced, by id and class", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: ruleArtifact(SHADOWED_ID),
    });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("shadowing");
    expect(human.stdout).toContain(SHADOWED_ID);
    expect(human.stdout).toContain(`.stamity/overrides/rules/${SHADOWED_ID}.md`);
    expect(human.stdout).toContain(`replaces rules/stamity-${SHADOWED_ID}.md`);

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(0);
    expect(doc.findings).toEqual([]);
    expect(doc.shadows).toEqual([
      {
        type: "rule",
        id: SHADOWED_ID,
        path: `.stamity/overrides/rules/${SHADOWED_ID}.md`,
        replaced: [`rules/stamity-${SHADOWED_ID}.md`],
        // TEST CHANGE, justified: the row gained `emits`, and a rule override
        // really does take over emission — so the case that stands for the
        // ordinary shadow now also pins the true half of the new field. An
        // assertion left at four keys would pass a row that reported the
        // replacement without saying whether it happened.
        emits: true,
      },
    ]);
  });

  /**
   * The other half of the same field, and the reason it exists: a SKILL
   * override takes the id in the index and changes nothing about what emits
   * (the SKILLS gap in `src/cli/engine/emission.ts` — the skills projection
   * reads the corpus half only). The report used to print `replaces` for it,
   * which is the exact belief this section was added to prevent: an author
   * thinking an override is live when it is not.
   *
   * When the skills seam widens to the full `ContentRoots` spec, `skill` joins
   * `OVERRIDE_EMITTING_CLASSES` and this case goes RED. The fix then is to flip
   * the expectations to the `emits: true` shape above — not to delete the case,
   * which would drop the only guard that the report follows the mechanism.
   */
  it("says a skill override took the id without replacing the bundled body", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/skills/qa/SKILL.md": skillArtifact("qa"),
    });

    const human = await runHuman(repo.dir);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("shadowing");
    // The claim it must NOT make, and the one it must.
    expect(human.stdout).not.toContain("replaces skills/stamity-qa/SKILL.md");
    expect(human.stdout).toContain("takes the id of skills/stamity-qa/SKILL.md");
    expect(human.stdout).toContain("the bundled skill body is still what ships");

    const { doc } = await runJson(repo.dir);
    expect(doc.shadows).toEqual([
      {
        type: "skill",
        id: "qa",
        path: ".stamity/overrides/skills/qa/SKILL.md",
        replaced: ["skills/stamity-qa/SKILL.md"],
        emits: false,
      },
    ]);
  });

  it("prints no shadowing section at all for a repo with no overrides", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/learnings/cache-warmup-order.md": learning() });

    const human = await runHuman(repo.dir);
    expect(human.stdout).not.toContain("shadowing");

    const { doc } = await runJson(repo.dir);
    expect(doc.shadows).toEqual([]);
  });

  it("says nothing about an override whose id no bundled artifact claims", async () => {
    const repo = getRepo();
    await repo.seedFiles({ ".stamity/overrides/rules/house-style.md": ruleArtifact("house-style") });

    const human = await runHuman(repo.dir);
    expect(human.stdout).not.toContain("shadowing");

    const { code, doc } = await runJson(repo.dir);
    expect(code).toBe(0);
    // The artifact was read and judged — the empty shadow list is a statement
    // about what it replaced, not about whether it was looked at.
    expect(doc.shadows).toEqual([]);
    expect(human.stdout).toContain("checked 1 artifact");
  });

  it("keeps one JSON envelope carrying the advisories and the shadow list together", async () => {
    const repo = getRepo();
    await repo.seedFiles({
      // One file that shadows AND trips the lifecycle advisory, so both new
      // surfaces have to ride in the same document.
      [`.stamity/overrides/rules/${SHADOWED_ID}.md`]: [
        "---",
        `id: ${SHADOWED_ID}`,
        "type: rule",
        "description: The house version of this rule.",
        "tags:",
        "  - review",
        "---",
        "",
        "Name every branch after the ticket it closes.",
        "",
      ].join("\n"),
    });

    // runJson asserts stdout is exactly one line, so a second document or any
    // human output alongside the envelope fails here.
    const { code, doc } = await runJson(repo.dir);

    expect(code).toBe(0);
    expect(doc.warningCount).toBe(2);
    expect(doc.findings.every((row) => row.message.includes("`load`") || row.message.includes("`obsolete_when`"))).toBe(true);
    expect(doc.shadows).toHaveLength(1);
    expect(doc.shadows[0]).toMatchObject({ type: "rule", id: SHADOWED_ID });
  });

  it("keeps the per-artifact findings when the tree cannot be indexed, and says why", async () => {
    // `tags` as a bare string is a corpus-defect shape: the catalog walk refuses
    // it outright, so the shadow scan cannot answer. The per-artifact gate has
    // already reported the same file in better terms, and that report is what
    // must survive — a section replaced by one message about an index tells the
    // author nothing about their file.
    const repo = getRepo();
    await repo.seedFiles({
      ".stamity/overrides/rules/house-style.md": [
        "---",
        "id: house-style",
        "type: rule",
        "description: The house version of this rule.",
        "tags: review",
        "load: on-demand",
        "obsolete_when: the linter enforces it",
        "---",
        "",
        "Name every branch after the ticket it closes.",
        "",
      ].join("\n"),
    });

    const { code, doc } = await runJson(repo.dir);

    expect(code).toBe(1);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]).toMatchObject({
      source: "user-content",
      path: ".stamity/overrides/rules/house-style.md",
      severity: "error",
    });
    expect(doc.findings[0]?.message).toContain("`tags` must be a list of strings");
    expect(doc.shadows).toEqual([]);

    const human = await runHuman(repo.dir);
    expect(human.stdout).toContain("note: user-content could not report what these overrides replace");
  });
});

describe("validate — entries the content walk skips", () => {
  it("reports a symlinked override as skipped rather than passing over it silently", async () => {
    // Without this the tree looks customized, sync emits the bundled body, and
    // the author has no surface that connects the two.
    const repo = getRepo();
    const rulesDir = join(userContentRoot(repo.dir), "rules");
    await mkdir(rulesDir, { recursive: true });
    await repo.seedFiles({ "elsewhere/house-style.md": ruleArtifact("house-style") });
    await symlink(repo.path("elsewhere", "house-style.md"), join(rulesDir, "house-style.md"));

    const { code, doc } = await runJson(repo.dir);

    expect(code).toBe(0);
    expect(doc.findings).toHaveLength(1);
    expect(doc.findings[0]).toMatchObject({
      source: "user-content",
      path: ".stamity/overrides/rules/house-style.md",
      severity: "warning",
    });
    expect(doc.findings[0]?.message).toContain("symlink");
    // It shadows nothing, because it was never indexed.
    expect(doc.shadows).toEqual([]);
  });
});
