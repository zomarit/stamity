import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frontmatterField } from "../../src/content/frontmatter.ts";
import { isContextTag, isFloorTag } from "../../src/content/tags.ts";
import {
  PACK_CONTENT_CLASSES,
  checkDeclaredTools,
  checkFootprint,
  enumeratePackContent,
  readPackManifest,
  scanPackBodies,
  verifyIntegrityMap,
} from "../../src/pack/manifest.ts";
import { checkPermissions } from "../../src/pack/permissions.ts";
import {
  CORPUS_ROOT,
  assertDenyClean,
  assertLineCap,
  corpusFileOf,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../corpus/harness.ts";

/**
 * The product-audit pack: its manifest against the engine's own ingress gates,
 * and its four artifacts against the authoring contract plus the invariants
 * this pack specifically carries — the neutral verify seam it consumes, the
 * assesses-never-modifies boundary, trigger disjointness against the core
 * verify skill, and the absence of the two predecessor commands it merged.
 *
 * Two things this suite does NOT re-implement. Engine gates are CALLED, not
 * mirrored: `verifyIntegrityMap`, `scanPackBodies`, `checkFootprint`,
 * `checkDeclaredTools` and `checkPermissions` are the same functions the
 * installer runs, so a green run here is evidence about the install path
 * rather than about a copy of it. And the corpus authoring assertions come
 * from `../corpus/harness.ts` — the pack is content, and it is bound by the
 * same load-class, deletion-trigger, line-cap and deny-scan rules as the core
 * corpus, over a different root.
 *
 * Every hand-rolled probe below is paired with a fixture case proving it can
 * fail, so a green suite certifies detection as well as compliance.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_ROOT = join(REPO_ROOT, "packs", "product-audit");
const GATE_SCRIPT = join(REPO_ROOT, "scripts", "leak-gate.mjs");

/** The pack's shipped artifacts, by pack-relative path. */
const COMMAND_PATHS = [
  "commands/stamity-product-audit.md",
  "commands/stamity-benchmark.md",
] as const;
const RULE_PATH = "rules/stamity-epic-audit-frame.md";
const SKILL_PATH = "skills/stamity-perf-audit/SKILL.md";
const CONTENT_PATHS: readonly string[] = [...COMMAND_PATHS, RULE_PATH, SKILL_PATH];

/** Body line caps by artifact class — the same SoT caps the corpus suite binds. */
const BODY_CAPS = { command: 500, rule: 120, skill: 500 } as const;

/** Description cap, in characters. */
const DESCRIPTION_MAX = 1024;

/** The neutral evidence family the pack consumes. Literal, because the seam IS the string. */
const VERIFY_SEAM = ".stamity/verify/<axis>-<sha>.json";

/**
 * The audit axis vocabulary, and the verify axes each one consumes as evidence.
 *
 * TEST CHANGE, justified: `enhancability` and `scalability` joined the
 * `health` row. The axis question asks where the product resists change, and
 * those two axes are what decides that half of it — consuming neither left the
 * question answered from the wrong evidence, and left `all` reaching five of the
 * ten shipped axes while describing itself as covering both rows.
 */
const AXIS_MAP: Readonly<Record<string, readonly string[]>> = {
  security: ["security"],
  health: [
    "testability",
    "reliability",
    "maintainability",
    "enhancability",
    "scalability",
    "product-spec",
  ],
  all: [],
};

/** The core reviewer's severity scale — the one both pack commands grade on. */
const CORE_SEVERITIES: readonly string[] = ["Critical", "Warning", "Minor"];

/**
 * The four-level scale the pack used to publish, which the core reviewer cannot
 * return. Spelled as the full enum: `high · medium · low` on its own is the
 * CONFIDENCE vocabulary, which is shared with the core agents and stays.
 */
const RETIRED_SEVERITIES: readonly string[] = [
  "critical · high · medium · low",
  "severity, confidence, and the route: critical",
];

/**
 * Every path this pack's bodies state it writes, each row naming the command
 * that claims it and a literal that command must still carry. Read out of the
 * shipped bodies, never copied from `pack.json`.
 */
const WRITE_CLAIMS: readonly { path: string; command: string; claim: string }[] = [
  {
    path: ".stamity/audits/**",
    command: "commands/stamity-product-audit.md",
    claim: ".stamity/audits/<axis>-<sha>.md",
  },
  {
    path: ".stamity/benchmarks/**",
    command: "commands/stamity-benchmark.md",
    claim: ".stamity/benchmarks/baseline.json",
  },
  {
    path: ".stamity/verify/**",
    command: "commands/stamity-product-audit.md",
    claim: ".stamity/verify/<axis>-<sha>.json",
  },
];

/**
 * Both directions of the declaration mismatch, as messages. Pure over two sets so
 * the fixture can drive it with a seeded defect of each kind.
 */
function declarationProblems(declared: readonly string[], claimed: readonly string[]): string[] {
  return [
    ...claimed
      .filter((path) => !declared.includes(path))
      .map((path) => `under-declared: ${path} is written but absent from touchedPaths`),
    ...declared
      .filter((path) => !claimed.includes(path))
      .map((path) => `over-declared: ${path} is in touchedPaths but no body writes it`),
  ];
}

/** The clause that states the boundary, verbatim, in both command bodies. */
const ASSESSES_CLAUSE = "assesses; it never modifies product code";

/** Roles a command in this pack may spawn. Code-mutating roles are the point of the exclusion. */
const ALLOWED_SPAWNS: readonly string[] = ["researcher", "reviewer"];
const FORBIDDEN_SPAWNS: readonly string[] = ["implementer", "fixer"];

/**
 * The two predecessor commands this pack merged into `product-audit`. Neither
 * name may survive anywhere in the pack: a dangling mention would point a
 * reader at a command no install ships.
 */
const MERGED_PREDECESSORS: readonly RegExp[] = [/\bhealthcheck\b/i, /security-audit/i];

/**
 * Anti-shadowing triad: three artifacts whose descriptions compete
 * for the same neighbourhood of the trigger space. Each row lists the anchors
 * that must appear in ITS description and must not appear in the other two.
 *
 * `product-audit` is deliberately absent: it consumes the verify artifacts and
 * shares their axis vocabulary on purpose, so an overlap there is the seam
 * working rather than a trigger collision.
 */
const TRIGGER_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  "perf-audit": ["profil", "hot path"],
  benchmark: ["baseline", "regression"],
  verify: ["axis", "gate", "runnable"],
};

/** Shingle width for the duplication probe: long enough that shared table headers do not register. */
const SHINGLE_SIZE = 8;

/** Duplication ceiling between a citing command and the frame it cites. */
const DUPLICATION_CEILING = 0.05;

// ── Corpus views ─────────────────────────────────────────────────

/** One walk of the pack, shared by every case. */
const packFiles: Promise<CorpusFile[]> = walkAllMarkdown(PACK_ROOT);

/** The core corpus, for cross-reference resolution and the verify description. */
const coreFiles: Promise<CorpusFile[]> = walkAllMarkdown(CORPUS_ROOT);

async function packFile(relPath: string): Promise<CorpusFile> {
  const found = (await packFiles).find((file) => file.relPath === relPath);
  if (found === undefined) throw new Error(`pack file ${relPath} is missing`);
  return found;
}

/** Declared id, falling back to the filename slug (their agreement is asserted separately). */
function declaredId(file: CorpusFile): string {
  const id = frontmatterField(file.parsed, "id");
  return typeof id === "string" && id.trim() !== "" ? id : filenameSlug(file.relPath);
}

function description(file: CorpusFile): string {
  const value = frontmatterField(file.parsed, "description");
  return typeof value === "string" ? value : "";
}

/**
 * Prose with its wrapping removed. Every body in the corpus is hard-wrapped,
 * so a sentence-level probe run against the raw text asserts on where the
 * author happened to break the line. Collapsing runs of whitespace makes the
 * probes bind the prose instead of the layout.
 */
function flow(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The text of a top-level `## <heading>` section, up to the next top-level heading. */
function section(body: string, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = body.indexOf(marker);
  if (start === -1) return "";
  const rest = body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Collect a throwing check as a violation message instead of aborting the pass. */
function collect(problems: string[], check: () => void): void {
  try {
    check();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}

const lines = (...rows: string[]): string => rows.join("\n");

/** Minimal valid frontmatter head; fixtures inject exactly one defect each. */
function head(id: string, type: string): string[] {
  return [
    `id: ${id}`,
    `type: ${type}`,
    `description: Fixture ${type} for the pack probe negative cases.`,
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: the pack suite retires.",
  ];
}

function doc(fields: readonly string[], body: string): string {
  return lines("---", ...fields, "---", body, "");
}

// ═════════════════════════════════════════════════════════════════

describe("manifest — the engine's own ingress gates run against the shipped pack", () => {
  it("parses, names the pack, and rests its trust on a catalog pin rather than a signing claim", async () => {
    const manifest = await readPackManifest(PACK_ROOT);

    expect(manifest.name).toBe("product-audit");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toContain("assesses, never modifies");
    // No `signing` block on purpose: a first-party pack clears the signing
    // gate through its curated-catalog pin (`resolveTrustTier`), and sigstore
    // is not armed — a declared method with no verifiable bundle would be
    // refused outright rather than waived.
    expect(manifest.signing).toBeUndefined();
    // Absent `declaredTools` reads as "declares no tool", which is what makes
    // the cross-check un-skippable; the pack's artifacts target no client.
    expect(manifest.declaredTools).toBeUndefined();
  });

  it("ships only live-emission classes, one file per artifact", async () => {
    const files = await enumeratePackContent(PACK_ROOT);

    expect(files.map((file) => file.relPath).toSorted()).toEqual([...CONTENT_PATHS].toSorted());
    for (const file of files) {
      expect(PACK_CONTENT_CLASSES).toContain(file.contentClass);
    }
    expect(new Set(files.map((file) => file.contentClass))).toEqual(
      new Set(["commands", "rules", "skills"]),
    );
  });

  it("carries a real per-file integrity map — every digest recomputed from disk", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const files = await enumeratePackContent(PACK_ROOT);

    // Recomputed here rather than trusted: the map is authored by hand, so the
    // probe that matters is whether it still describes the bytes on disk.
    const recomputed = Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          file.relPath,
          createHash("sha256").update(await readFile(file.absPath)).digest("hex"),
        ]),
      ),
    );

    expect(manifest.integrity).toEqual(recomputed);
    await expect(verifyIntegrityMap(PACK_ROOT, manifest, files)).resolves.toBe("pass");
  });

  it("passes the deny-scan, footprint, declared-tools and permission gates", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const files = await enumeratePackContent(PACK_ROOT);

    await expect(scanPackBodies(files)).resolves.toBe("pass");
    expect(checkFootprint(manifest, files)).toBe("pass");
    await expect(checkDeclaredTools(manifest, files)).resolves.toBe("pass");
    expect(checkPermissions(manifest, files)).toBe("pass");
  });

  it("declares an honest permission manifest — read-heavy, writing only its own outputs", async () => {
    const manifest = await readPackManifest(PACK_ROOT);
    const permissions = manifest.permissions;

    expect(permissions).toBeDefined();
    // `edit` is declared because the pack writes reports and refreshed verify
    // artifacts. Declaring only `read` would read better and be false.
    expect(permissions?.toolFootprint).toEqual(
      expect.arrayContaining(["read", "execute", "network", "spawn", "edit"]),
    );
    // Every declared path is inside the engine's state directory: the write
    // surface is audit output and the verify evidence family, never source.
    for (const path of permissions?.touchedPaths ?? []) {
      expect(path.startsWith(".stamity/"), `touchedPaths entry ${path} leaves .stamity/`).toBe(true);
    }
    expect(permissions?.touchedPaths).toContain(".stamity/verify/**");
  });

  it("declares exactly the write surface its own bodies claim", async () => {
    const declared = (await readPackManifest(PACK_ROOT)).permissions?.touchedPaths ?? [];

    // The pack's identity is assess-never-modify, so its consent surface has to be
    // the state directory and nothing else. The `ref` baseline is the one flow that
    // would have rewritten tracked files; benchmark now prints that sequence for
    // the operator instead of running it, which is what keeps this list honest.
    expect(declarationProblems(declared, WRITE_CLAIMS.map((claim) => claim.path))).toEqual([]);
  });

  it("every declared path traces to a body that states the write", async () => {
    const files = await packFiles;

    const problems = WRITE_CLAIMS.flatMap((claim) => {
      const body = files.find((file) => file.relPath === claim.command);
      if (body === undefined) return [`${claim.path}: claimed by ${claim.command}, which is gone`];
      return body.raw.includes(claim.claim)
        ? []
        : [`${claim.path}: ${claim.command} no longer states ${JSON.stringify(claim.claim)}`];
    });

    expect(problems).toEqual([]);
    expect(WRITE_CLAIMS.length).toBeGreaterThan(0);
  });

  it("fixture: the comparison catches a seeded under-declaration and a seeded over-declaration", () => {
    const claimed = [".stamity/audits/**", ".stamity/verify/**"];

    expect(declarationProblems([".stamity/audits/**"], claimed)).toEqual([
      expect.stringMatching(/under-declared: \.stamity\/verify\/\*\*/),
    ]);
    expect(declarationProblems([...claimed, "src/**"], claimed)).toEqual([
      expect.stringMatching(/over-declared: src\/\*\*/),
    ]);
    expect(declarationProblems(claimed, claimed)).toEqual([]);
  });
});

describe("the return contract — both commands answer the flow that spawned them", () => {
  it("each command carries a Return contract section with the shared status enum", async () => {
    const problems: string[] = [];

    // Both commands spawn `reviewer`, whose contract requires the spawning flow to
    // handle a `BLOCKED_*` return. Before this, grep for `BLOCKED_` over the pack
    // returned nothing while 9/9 core commands and 2/2 ops commands carried one —
    // so a blocked sub-agent had no defined landing here.
    const commands = await Promise.all(COMMAND_PATHS.map((relPath) => packFile(relPath)));
    for (const { relPath, parsed } of commands) {
      const body = parsed.body;
      if (!body.includes("\n## Return contract\n")) {
        problems.push(`${relPath}: no "## Return contract" section`);
        continue;
      }
      const contract = section(body, "Return contract");
      for (const status of ["DONE", "BLOCKED_AMBIGUITY", "BLOCKED_DEPENDENCY", "BLOCKED_FAILURE"]) {
        if (!contract.includes(status)) problems.push(`${relPath}: return contract omits ${status}`);
      }
      // Rendering, not just presence — the same spelling every other command uses.
      const line = "**status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.";
      if (!contract.includes(line)) problems.push(`${relPath}: status enum is spelled differently`);
      // Edge case: a run that routed nothing out still terminates as DONE.
      if (!/empty finding list/i.test(flow(contract))) {
        problems.push(`${relPath}: does not state the empty-finding terminal state`);
      }
      if (!/do not put questions to the operator/i.test(flow(contract))) {
        problems.push(`${relPath}: does not route sub-agent ambiguity through this command`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("every severity token in the pack is on the core scale or carries an explicit mapping", async () => {
    const files = await packFiles;

    // The pack published `critical · high · medium · low` and demanded it
    // from the core reviewer, whose contract fixes the scale at Critical / Warning
    // / Minor. With no mapping, the escalation guardrail could never fire and every
    // medium and low row was dropped on the way back. The commands now grade on the
    // core scale directly.
    const problems: string[] = [];
    const commands = await Promise.all(COMMAND_PATHS.map((relPath) => packFile(relPath)));
    for (const { relPath, parsed } of commands) {
      const body = parsed.body;
      const flat = flow(body);
      for (const retired of RETIRED_SEVERITIES) {
        if (flat.includes(retired)) problems.push(`${relPath}: still publishes "${retired}"`);
      }
      for (const severity of CORE_SEVERITIES) {
        if (!body.includes(`\`${severity}\``)) {
          problems.push(`${relPath}: does not name \`${severity}\``);
        }
      }
    }
    expect(problems).toEqual([]);

    // The findings-contract row itself, which is where the four-level scale was
    // published: it now names the core scale and says whose it is.
    const auditBody = (await packFile("commands/stamity-product-audit.md")).parsed.body;
    expect(auditBody).toMatch(
      /\| `severity` \| `Critical` · `Warning` · `Minor` — the core reviewer's scale, unchanged \|/,
    );
    // Confidence keeps its own three-level vocabulary — a different axis, and one
    // the core agents share, so the severity fix must not sweep it away.
    expect(auditBody).toMatch(/\| `confidence` \| high · medium · low/);

    // The escalation guardrail fires on tokens the reviewer can actually return.
    const audit = flow(auditBody);
    expect(audit).toMatch(/every `Critical` or `Warning` finding reaches the output/);
    expect(audit).not.toMatch(/critical or high finding/i);

    // Benchmark's verdict enum maps onto the same scale rather than sitting beside it.
    const benchmark = flow((await packFile("commands/stamity-benchmark.md")).parsed.body);
    expect(benchmark).toMatch(/`regression-critical` is `Critical`/);
    expect(benchmark).toMatch(/`regression-warning` is `Warning`/);
    expect(benchmark).toMatch(/`stable`, `improvement` and `noisy` route out as nothing/);

    // Non-degenerate: the pack really does ship command bodies to check.
    expect(files.filter((file) => file.relPath.startsWith("commands/"))).toHaveLength(2);
  });
});

describe("benchmark — the artifact key and what may be promoted from it", () => {
  it("keys stored results on <sha> or <sha>-dirty, and refuses to promote a dirty one", async () => {
    const file = await packFile("commands/stamity-benchmark.md");
    const body = file.parsed.body;
    const flat = flow(body);

    // The key was the bare sha while the same file contemplated unclean
    // worktree runs and offered to promote those numbers to baseline.json. Two
    // sibling artifacts already carry the `-dirty` discriminator; this one adopts it.
    expect(body).toContain(".stamity/benchmarks/<key>.json");
    expect(body).toContain(".stamity/benchmarks/<key>.md");
    expect(body).not.toMatch(/\.stamity\/benchmarks\/<sha>\./);
    expect(flat).toMatch(/`<key>` is the short HEAD sha, `-dirty` suffixed when the worktree carries/i);
    expect(flat).toMatch(/would let the second overwrite the first/i);

    // Promotion refuses the dirty key outright — the offer is not made, so a silent
    // answer cannot promote one either.
    expect(flat).toMatch(/A `-dirty` measurement is never promoted/);
    expect(flat).toMatch(/the offer is not made, and an explicit request is refused/i);

    // The promoted baseline records the commit it was measured at, which is
    // what the regression report's suspect-range field reads.
    expect(flat).toMatch(/\*\*the commit it was measured at\*\*/);
    expect(flat).toContain("git diff <baseline-commit>...HEAD");
  });

  it("gates the ref-mode rewrite on a question regardless of tree state, and performs no checkout", async () => {
    const flat = flow((await packFile("commands/stamity-benchmark.md")).parsed.body);

    // The ref path checked refs out and stashed — rewriting every tracked
    // file — while the same file stated in bold that it never modifies product code
    // and the pack declared `.stamity/**` as its whole consent surface.
    expect(flat).toMatch(/the measurement is a second run rather than a checkout this command performs/i);
    expect(flat).toMatch(/on a clean tree exactly as on a dirty one/i);
    expect(flat).toMatch(/the question is about rewriting tracked files, not about dirtiness/i);
    expect(flat).toMatch(/Default on no response: use the stored baseline/);
    // The assesses-never-modifies clause and the ref flow now agree.
    expect(flat).toContain(ASSESSES_CLAUSE);
    expect(flat).toMatch(/is printed for the operator to run rather than performed here/i);
  });

  it("keys the budget branch on the perf-budget-declared result, not on artifact presence", async () => {
    const flat = flow((await packFile("commands/stamity-benchmark.md")).parsed.body);

    // The performance axis produces budget-free artifacts as a NORMAL
    // outcome, so "the artifact exists" never meant "budgets exist" — and `stable`,
    // which requires no budget row to fail, was vacuously satisfied by rows that
    // were never evaluated.
    expect(flat).toMatch(/`perf-budget-declared` row's `status`\*\*, never the artifact's presence/);
    expect(flat).toMatch(/budget-free artifacts as a normal outcome/i);
    expect(flat).toMatch(/inside the floor, budgets not evaluated/i);
  });

  it("verdict bands are total over the load axes and tied to the measured noise", async () => {
    const body = (await packFile("commands/stamity-benchmark.md")).parsed.body;
    const flat = flow(body);

    // A 30% memory rise landed in no row, Bundle had no regression band,
    // and exactly 10% was both `stable` and `regression-warning`. One signed
    // quantity over every axis makes the set total; strict-versus-inclusive
    // boundaries make it disjoint.
    expect(flat).toMatch(/One signed quantity decides every row/i);
    expect(flat).toMatch(/\*\*adverse change\*\*/);
    expect(flat).toMatch(/larger for memory and bundle bytes/i);
    expect(flat).toMatch(/adverse change of 50% or more/i);
    expect(flat).toMatch(/at or above the floor and under 50%/i);
    expect(flat).toMatch(/strictly under the floor in both directions/i);
    expect(flat).toMatch(/first match wins/i);

    // The floor is a function of the measured noise, not a fixed band beside it.
    expect(flat).toMatch(/\*\*regression floor\*\* is the larger of 10% and twice the measured/i);
    expect(flat).toMatch(/A band narrower than the noise/i);

    // The warm-iteration default names a floor and a rule for raising it.
    expect(flat).toMatch(/\*\*N is at least 10 and defaults to 10\.\*\*/);
    expect(flat).toMatch(/Raise it by doubling — 20, then 40/);
    // No circular self-reference left in the iteration rule.
    expect(flat).not.toMatch(/a count that gives the noise discipline below something to work with/i);
  });

  it("cites only the frame blocks it can honour, and states its own evidence rule", async () => {
    const flat = flow((await packFile("commands/stamity-benchmark.md")).parsed.body);

    // The frame's item shape is built on a module taxonomy benchmark never
    // establishes, and its Guardrails demand `path:line` evidence a metric
    // regression cannot have — which demoted every regression to an open question.
    expect(flat).toMatch(/Epic scaffold: `stamity-epic-audit-frame` → Board sync\./);
    expect(flat).not.toMatch(/Epic scaffold: `stamity-epic-audit-frame` → Epic and sub-issue shape/);
    expect(flat).not.toMatch(/Board sync and Guardrails/);
    expect(flat).toMatch(/Only that block is cited/i);
    expect(flat).toMatch(/one sub-issue per regressed benchmark, no dependency edges/i);
    expect(flat).toMatch(/It has no `path:line`/);
    // The extra-guardrails slot is omitted rather than left unfilled.
    expect(flat).not.toContain("<extra-guardrails>");
  });
});

describe("frontmatter contract — the four artifacts, shape by shape", () => {
  function violations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    const flag = (file: CorpusFile, message: string): void => {
      problems.push(`${file.relPath}: ${message}`);
    };

    for (const file of files) {
      if (!file.parsed.hadFrontmatter) {
        flag(file, "no frontmatter block — every pack file is a declared artifact");
        continue;
      }

      const id = frontmatterField(file.parsed, "id");
      const implied = filenameSlug(file.relPath);
      if (typeof id !== "string" || id !== implied) {
        flag(file, `\`id\` must be the bare slug ${JSON.stringify(implied)}`);
      }

      const type = frontmatterField(file.parsed, "type");
      const expectedType = file.relPath.startsWith("commands/")
        ? "command"
        : file.relPath.startsWith("rules/")
          ? "rule"
          : "skill";
      if (type !== expectedType) {
        flag(file, `\`type\` must be ${JSON.stringify(expectedType)} for its class directory`);
      }

      const text = description(file);
      if (text.trim() === "") flag(file, "`description` must be a non-empty string");
      if (text.length > DESCRIPTION_MAX) {
        flag(file, `\`description\` is ${text.length} chars, over the ${DESCRIPTION_MAX} cap`);
      }
      if (/\b(?:you|your|yours|yourself)\b/i.test(text)) {
        flag(file, "`description` addresses the reader — write it in the third person");
      }

      const tags = frontmatterField(file.parsed, "tags");
      const tagList =
        Array.isArray(tags) &&
        tags.length > 0 &&
        tags.every((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
          ? tags
          : null;
      if (tagList === null) {
        flag(file, "`tags` must be a non-empty array of non-empty strings");
      } else {
        // No `floor:*` anywhere in the pack: a generator or an
        // assessment that leaves core is not a floor, and a floor tag would
        // make it undroppable in content reduction.
        for (const tag of tagList.filter((entry) => isFloorTag(entry))) {
          flag(file, `carries floor tag ${JSON.stringify(tag)} — no floor:* tag leaves core`);
        }
        if (isContextTag(tagList[0] ?? "")) {
          flag(file, `first tag ${JSON.stringify(tagList[0])} is a ctx: tag, not a capability`);
        }
      }

      if (frontmatterField(file.parsed, "tools") !== undefined) {
        flag(file, "declares `tools:` — the target-tool key is engine-reserved");
      }

      collect(problems, () => requireLoadClass(file, ["on-demand"]));
      collect(problems, () => requireObsoleteWhen(file));
      collect(problems, () => assertLineCap(file, BODY_CAPS[expectedType]));
      collect(problems, () => assertDenyClean(file));
    }
    return problems;
  }

  it("holds across the pack", async () => {
    const files = await packFiles;

    expect(files.map((file) => file.relPath).toSorted()).toEqual([...CONTENT_PATHS].toSorted());
    expect(violations(files)).toEqual([]);
  });

  it("the roster is exactly the four declared ids", async () => {
    expect((await packFiles).map(declaredId).toSorted()).toEqual([
      "benchmark",
      "epic-audit-frame",
      "perf-audit",
      "product-audit",
    ]);
  });

  it("the frame ships as an on-demand, agent-requested rule — not an inert shared-context class", async () => {
    const frame = await packFile(RULE_PATH);

    expect(frontmatterField(frame.parsed, "type")).toBe("rule");
    expect(frontmatterField(frame.parsed, "load")).toBe("on-demand");
    // A rule declares its activation mode; `always` is the charter's alone,
    // and an agent-requested rule carries no globs (it has no file surface).
    expect(frontmatterField(frame.parsed, "scope")).toBe("agent-requested");
    expect(frontmatterField(frame.parsed, "globs")).toBeUndefined();
  });

  it("fixture: a missing deletion trigger, a floor tag, and a wrong id are each flagged", () => {
    const noTrigger = corpusFileOf(
      "rules/stamity-ghost.md",
      doc(
        [...head("ghost", "rule").filter((row) => !row.startsWith("obsolete_when")), "scope: agent-requested"],
        "Body.",
      ),
    );
    const floored = corpusFileOf(
      "skills/stamity-heavy/SKILL.md",
      doc(
        head("heavy", "skill").map((row) => (row === "tags: [review]" ? "tags: [review, floor:security]" : row)),
        "Body.",
      ),
    );
    const misnamed = corpusFileOf(
      "commands/stamity-wrong.md",
      doc(head("right", "command"), "Body."),
    );

    expect(violations([noTrigger, floored, misnamed])).toEqual([
      expect.stringMatching(/stamity-ghost\.md: `obsolete_when` must be a non-empty/),
      expect.stringMatching(/stamity-heavy\/SKILL\.md: carries floor tag "floor:security"/),
      expect.stringMatching(/stamity-wrong\.md: `id` must be the bare slug "wrong"/),
    ]);
  });
});

describe("the verify seam — evidence comes from .stamity/verify/, never from a second copy of the checks", () => {
  it("product-audit names the axis parameter set and cites the neutral artifact family", async () => {
    const command = await packFile("commands/stamity-product-audit.md");
    const body = command.parsed.body;

    expect(body).toContain(VERIFY_SEAM);
    for (const axis of Object.keys(AXIS_MAP)) {
      expect(body, `axis ${axis} is not named in the body`).toMatch(
        new RegExp(`\`${axis}\``),
      );
    }
  });

  it("every verify axis the mapping consumes is a real axis of the core verify skill", async () => {
    const core = await coreFiles;
    const shippedAxes = new Set(
      core
        .filter((file) => file.relPath.startsWith("skills/st-verify/references/"))
        .map((file) => declaredId(file)),
    );
    const body = (await packFile("commands/stamity-product-audit.md")).parsed.body;

    expect(shippedAxes.size).toBeGreaterThan(0);
    for (const [auditAxis, verifyAxes] of Object.entries(AXIS_MAP)) {
      for (const verifyAxis of verifyAxes) {
        expect(shippedAxes, `${auditAxis} consumes unknown verify axis ${verifyAxis}`).toContain(
          verifyAxis,
        );
        expect(body, `${verifyAxis} is not named in the axis table`).toContain(`\`${verifyAxis}\``);
      }
    }
  });

  it("benchmark consumes the performance artifact of the same family", async () => {
    const body = (await packFile("commands/stamity-benchmark.md")).parsed.body;

    expect(body).toContain(".stamity/verify/performance-<sha>.json");
  });

  it("an absent artifact routes to the core verify skill — no predecessor fallback, no inline checks", async () => {
    const audit = flow((await packFile("commands/stamity-product-audit.md")).parsed.body);
    const benchmark = flow((await packFile("commands/stamity-benchmark.md")).parsed.body);

    // The graceful path: run the producer, then continue.
    // Contract change: the verify skill is core, and core ids now carry the
    // `st-` prefix, so `st-verify` is the id a pack body must route users to.
    // Pack-own ids are unaffected and still spell out `stamity-`.
    expect(audit).toMatch(/absent or stale, run the `st-verify` skill/i);
    expect(audit).toMatch(/derives none inline/i);
    expect(benchmark).toMatch(/absent or stale, run the `st-verify` skill/i);
    expect(benchmark).toMatch(/axis=performance/);

    // Every evidence path the pack names belongs to the neutral family; a
    // predecessor-named seam would show up here as a second artifact root.
    for (const file of await packFiles) {
      for (const match of file.raw.matchAll(/`?(\.[a-z0-9._-]+\/[a-z0-9<>/_.-]*\.json)`?/gi)) {
        expect(match[1], `${file.relPath} names a non-neutral evidence artifact`).toMatch(
          /^\.stamity\/(?:verify|benchmarks)\//,
        );
      }
    }
  });
});

describe("assesses, never modifies", () => {
  function clauseViolations(files: readonly CorpusFile[]): string[] {
    return files
      .filter((file) => file.relPath.startsWith("commands/"))
      .filter((file) => !flow(file.parsed.body).includes(ASSESSES_CLAUSE))
      .map((file) => `${file.relPath}: body does not state "${ASSESSES_CLAUSE}"`);
  }

  function spawnViolations(files: readonly CorpusFile[]): string[] {
    const problems: string[] = [];
    for (const file of files.filter((entry) => entry.relPath.startsWith("commands/"))) {
      const spawns = frontmatterField(file.parsed, "spawns");
      if (!Array.isArray(spawns) || spawns.length === 0) {
        problems.push(`${file.relPath}: \`spawns\` must be a non-empty array`);
        continue;
      }
      for (const entry of spawns) {
        if (typeof entry !== "string" || !ALLOWED_SPAWNS.includes(entry)) {
          problems.push(
            `${file.relPath}: spawns ${JSON.stringify(entry)} — an assessment spawns only ` +
              `${ALLOWED_SPAWNS.join(", ")}`,
          );
        }
      }
    }
    return problems;
  }

  it("both command bodies carry the clause", async () => {
    expect(clauseViolations(await packFiles)).toEqual([]);
  });

  it("neither command spawns a code-mutating role, and every spawn is in the core agent census", async () => {
    const files = await packFiles;
    const census = new Set(
      (await coreFiles).filter((file) => file.relPath.startsWith("agents/")).map(declaredId),
    );

    expect(spawnViolations(files)).toEqual([]);
    for (const file of files.filter((entry) => entry.relPath.startsWith("commands/"))) {
      const spawns = frontmatterField(file.parsed, "spawns") as string[];
      for (const role of FORBIDDEN_SPAWNS) {
        expect(spawns, `${file.relPath} spawns ${role}`).not.toContain(role);
      }
      for (const role of spawns) {
        expect(census, `${file.relPath} spawns ${role}, absent from the agent census`).toContain(
          role,
        );
      }
    }
  });

  it("the write surface is stated: audit output and refreshed evidence only", async () => {
    const audit = flow((await packFile("commands/stamity-product-audit.md")).parsed.body);

    expect(audit).toContain(".stamity/audits/<axis>-<sha>.md");
    expect(audit).toMatch(/No source file, no configuration/i);
    // Contract change: `/stamity-work` renamed to `/st-work`; the old spelling
    // is no longer invocable, so routing prose that keeps it is a dead link.
    expect(audit).toMatch(/routes to `\/st-work`/);
  });

  it("fixture: a command missing the clause, and one spawning a fixer, are flagged", () => {
    const silent = corpusFileOf(
      "commands/stamity-quiet.md",
      doc([...head("quiet", "command"), "spawns: [researcher]"], "It just fixes things."),
    );
    const mutating = corpusFileOf(
      "commands/stamity-loud.md",
      doc(
        [...head("loud", "command"), "spawns: [researcher, fixer]"],
        `This command ${ASSESSES_CLAUSE}.`,
      ),
    );

    expect(clauseViolations([silent, mutating])).toEqual([
      expect.stringMatching(/stamity-quiet\.md: body does not state/),
    ]);
    expect(spawnViolations([silent, mutating])).toEqual([
      expect.stringMatching(/stamity-loud\.md: spawns "fixer"/),
    ]);
  });
});

describe("board-less repos degrade to a report", () => {
  it("the degradation and its output path are stated in the body", async () => {
    const body = flow((await packFile("commands/stamity-product-audit.md")).parsed.body);

    expect(body).toMatch(/no board linked/i);
    expect(body).toMatch(/not an error/i);
    expect(body).toContain(".stamity/audits/<axis>-<sha>.md");
  });
});

describe("the frame is cited, never restated", () => {
  /** Normalised word shingles; punctuation and table pipes drop out before comparison. */
  function shingles(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word !== "");
    const result = new Set<string>();
    for (let index = 0; index + SHINGLE_SIZE <= words.length; index += 1) {
      result.add(words.slice(index, index + SHINGLE_SIZE).join(" "));
    }
    return result;
  }

  /** Share of the citing body's shingles that also appear in the frame. */
  function duplicationRatio(citing: string, frame: string): number {
    const citingShingles = shingles(citing);
    if (citingShingles.size === 0) return 0;
    const frameShingles = shingles(frame);
    const shared = [...citingShingles].filter((shingle) => frameShingles.has(shingle));
    return shared.length / citingShingles.size;
  }

  it("both commands cite the frame by name", async () => {
    const commands = await Promise.all(COMMAND_PATHS.map((relPath) => packFile(relPath)));

    for (const command of commands) {
      const pointers = [
        ...command.parsed.body.matchAll(/Epic scaffold: `stamity-epic-audit-frame`/g),
      ];

      expect(pointers.length, `${command.relPath} carries no frame pointer`).toBeGreaterThan(0);
    }
  });

  it("neither command restates a frame block", async () => {
    const frame = (await packFile(RULE_PATH)).parsed.body;
    const commands = await Promise.all(COMMAND_PATHS.map((relPath) => packFile(relPath)));

    for (const command of commands) {
      const ratio = duplicationRatio(command.parsed.body, frame);

      expect(
        ratio,
        `${command.relPath} duplicates ${(ratio * 100).toFixed(1)}% of the frame`,
      ).toBeLessThan(DUPLICATION_CEILING);
    }
  });

  it("fixture: a command that pastes the frame's block trips the ceiling", async () => {
    const frame = (await packFile(RULE_PATH)).parsed.body;
    const pasted = `Preamble sentence for the fixture.\n\n${frame}`;

    expect(duplicationRatio(pasted, frame)).toBeGreaterThanOrEqual(DUPLICATION_CEILING);
  });
});

describe("trigger domains stay disjoint", () => {
  async function descriptionOf(id: string): Promise<string> {
    const files = [...(await packFiles), ...(await coreFiles)];
    const found = files.find((file) => declaredId(file) === id && file.parsed.hadFrontmatter);
    if (found === undefined) throw new Error(`no artifact declares id ${id}`);
    return description(found);
  }

  function shadowViolations(descriptions: Readonly<Record<string, string>>): string[] {
    const problems: string[] = [];
    for (const [id, text] of Object.entries(descriptions)) {
      const own = TRIGGER_ANCHORS[id] ?? [];
      for (const anchor of own) {
        if (!text.toLowerCase().includes(anchor)) {
          problems.push(`${id}: description does not carry its own anchor ${JSON.stringify(anchor)}`);
        }
      }
      for (const [otherId, anchors] of Object.entries(TRIGGER_ANCHORS)) {
        if (otherId === id) continue;
        for (const anchor of anchors) {
          if (text.toLowerCase().includes(anchor)) {
            problems.push(
              `${id}: description carries ${JSON.stringify(anchor)}, the trigger anchor of ${otherId}`,
            );
          }
        }
      }
    }
    return problems;
  }

  it("perf-audit, benchmark and verify each own their trigger vocabulary", async () => {
    const descriptions = Object.fromEntries(
      await Promise.all(
        Object.keys(TRIGGER_ANCHORS).map(async (id) => [id, await descriptionOf(id)] as const),
      ),
    );

    expect(shadowViolations(descriptions)).toEqual([]);
  });

  it("fixture: a description reaching into a neighbour's domain is flagged both ways", () => {
    const results = shadowViolations({
      "perf-audit": "Profiles a slow surface and compares each hot path to the stored baseline.",
      benchmark: "Measures nothing in particular.",
      verify: "Runs one axis as a gate with runnable checks.",
    });

    expect(results).toEqual([
      expect.stringMatching(/perf-audit: description carries "baseline", the trigger anchor of benchmark/),
      expect.stringMatching(/benchmark: description does not carry its own anchor "baseline"/),
      expect.stringMatching(/benchmark: description does not carry its own anchor "regression"/),
    ]);
  });
});

describe("no dangling references", () => {
  // Both prefixes, deliberately: core commands and skills are `st-<id>` and
  // pack-own artifacts stay `stamity-<id>`, so a guard anchored on one prefix
  // is blind to half the surface it exists to check. The captured group is the
  // bare id either way, which is what frontmatter declares.
  const COMMAND_MENTION = /\/(?:stamity|st)-([a-z0-9][a-z0-9-]*)/g;
  /** Bare artifact mentions; the lookbehind keeps `/st-…` and mid-token hits out. */
  const BARE_MENTION = /(?<![/A-Za-z0-9_-])(?:stamity|st)-([a-z0-9][a-z0-9-]*)/g;

  function predecessorViolations(files: readonly { relPath: string; raw: string }[]): string[] {
    const problems: string[] = [];
    for (const file of files) {
      for (const pattern of MERGED_PREDECESSORS) {
        const hit = pattern.exec(file.raw);
        if (hit !== null) {
          problems.push(
            `${file.relPath}: mentions ${JSON.stringify(hit[0])} — the merged predecessors ` +
              `ship as axes of product-audit, not as commands`,
          );
        }
      }
    }
    return problems;
  }

  it("neither merged predecessor survives as a named command anywhere in the pack", async () => {
    const manifestRaw = await readFile(join(PACK_ROOT, "pack.json"), "utf8");
    const files = [
      ...(await packFiles).map((file) => ({ relPath: file.relPath, raw: file.raw })),
      { relPath: "pack.json", raw: manifestRaw },
    ];

    expect(predecessorViolations(files)).toEqual([]);
  });

  it("every command and artifact mention resolves to a shipped id", async () => {
    const pack = await packFiles;
    const core = await coreFiles;
    const knownIds = new Set([...pack, ...core].filter((f) => f.parsed.hadFrontmatter).map(declaredId));
    const commandIds = new Set(
      [...pack, ...core]
        .filter((file) => /(?:^|\/)commands\/[^/]+\.md$/.test(file.relPath))
        .map(declaredId),
    );

    const problems: string[] = [];
    for (const file of pack) {
      for (const match of file.parsed.body.matchAll(COMMAND_MENTION)) {
        if (!commandIds.has(match[1] ?? "")) {
          problems.push(`${file.relPath}: ${match[0]} does not resolve to a command`);
        }
      }
      for (const match of file.parsed.body.matchAll(BARE_MENTION)) {
        if (!knownIds.has(match[1] ?? "")) {
          problems.push(`${file.relPath}: mentions ${match[0]}, which nothing answers to`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("the pack links no product domain", async () => {
    for (const file of await packFiles) {
      expect(file.raw, `${file.relPath} carries a URL`).not.toMatch(/https?:\/\//i);
    }
  });

  it("fixture: a surviving predecessor name is flagged", () => {
    expect(
      predecessorViolations([
        { relPath: "commands/stamity-x.md", raw: "Run /stamity-healthcheck afterwards." },
        { relPath: "commands/stamity-y.md", raw: "See the security-audit command." },
        { relPath: "commands/stamity-z.md", raw: "Clean." },
      ]),
    ).toEqual([
      expect.stringMatching(/stamity-x\.md: mentions "healthcheck"/),
      expect.stringMatching(/stamity-y\.md: mentions "security-audit"/),
    ]);
  });
});

describe("leak gate — reserved names never reach pack content", () => {
  /**
   * The gate's tokens, assembled from its own source fragments, so this suite
   * can never fork a second list. Pack paths are on no allowlist, so every
   * rule binds every file here.
   */
  async function reservedTokens(): Promise<{ id: string; token: string }[]> {
    const source = await readFile(GATE_SCRIPT, "utf8");
    const entry = /\{\s*id:\s*'([^']+)',\s*parts:\s*\[([^\]]*)\]/g;
    const tokens = [...source.matchAll(entry)].map((match) => ({
      id: match[1] ?? "",
      token: [...(match[2] ?? "").matchAll(/'([^']*)'/g)].map((part) => part[1] ?? "").join(""),
    }));
    if (tokens.length < 4) throw new Error("leak-gate rule parse failed — update this parser");
    return tokens;
  }

  it("holds across every pack file, path and body", async () => {
    const tokens = await reservedTokens();
    const manifestRaw = await readFile(join(PACK_ROOT, "pack.json"), "utf8");
    const files = [
      ...(await packFiles).map((file) => ({ relPath: file.relPath, raw: file.raw })),
      { relPath: "pack.json", raw: manifestRaw },
    ];

    const problems: string[] = [];
    for (const { relPath, raw } of files) {
      for (const { id, token } of tokens) {
        const pattern = new RegExp(token, "i");
        if (pattern.test(relPath) || pattern.test(raw)) {
          problems.push(`packs/product-audit/${relPath}: matches reserved-name rule ${id}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("fixture: the same probe catches an assembled reserved token", async () => {
    const tokens = await reservedTokens();
    const first = tokens[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(new RegExp(first.token, "i").test(`a body mentioning ${first.token} once`)).toBe(true);
  });
});
