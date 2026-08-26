import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractToolsFrontmatter, frontmatterField } from "../../src/content/frontmatter.ts";
import { isContextTag, isFloorTag } from "../../src/content/tags.ts";
import { REPO_SUBSTITUTION_TOKENS } from "../../src/emit/substitution.ts";
import {
  checkDeclaredTools,
  checkFootprint,
  enumeratePackContent,
  PACK_CONTENT_CLASSES,
  PACK_MANIFEST_FILE,
  scanPackBodies,
  validatePackManifest,
  verifyIntegrityMap,
  type PackManifest,
} from "../../src/pack/manifest.ts";
import { checkPermissions } from "../../src/pack/permissions.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../corpus/harness.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The scaffold pack: three greenfield generators shipped as third-party supply.
 *
 * Two contracts bind these files, and this suite asserts both against the real
 * implementations rather than a restatement:
 *
 *   - **The engine's pack ingress** (`src/pack/`). The manifest, the per-file
 *     integrity map, the deny-scan, the footprint bound, the declared-tools
 *     cross-check and the permission block all run here exactly as `stamity add`
 *     runs them, so a body edited without regenerating its digest fails the
 *     build in this file instead of at an operator's install.
 *   - **The corpus authoring contract** (`test/corpus/harness.ts`). Pack
 *     content is projected through the same surfaces as core content, so it
 *     carries the same frontmatter head, the same load classes and the same
 *     line caps. The harness's parsing and per-file assertions are imported,
 *     never re-implemented.
 *
 * On top of those, the pack's own extraction conditions: no `floor:*` tag
 * anywhere (a generator builds TO a floor, it is not one), the max-one
 * regeneration cap stated inline in every body, the design-system generator
 * consuming the core detector's inventory instead of re-implementing detection,
 * and every cross-reference resolving to a live core or pack artifact.
 *
 * The reserved-name rules are read out of `scripts/leak-gate.mjs` at run
 * time so this suite never spells one and never forks the gate's list.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK_ROOT = join(REPO_ROOT, "packs", "scaffold");
const GATE_SCRIPT = join(REPO_ROOT, "scripts", "leak-gate.mjs");

/** The pack's own command roster, by bare id. */
const COMMAND_IDS: readonly string[] = ["auth-scaffold", "slo-scaffold", "design-system-create"];

/** Roles every generator delegates to: the writer and the gate. */
const REQUIRED_SPAWNS: readonly string[] = ["implementer", "reviewer"];

/** Command body cap, shared with the corpus invariant suite. */
const COMMAND_BODY_CAP = 500;

/** Hosts content may link: spec bodies only, mirroring the corpus URL policy. */
const URL_ALLOWLIST: readonly string[] = ["rfc-editor.org", "owasp.org", "w3.org"];

const URL_PATTERN = /https?:\/\/[^\s<>()"'\]]+/gi;
const SUBSTITUTION_TOKEN = /\$\{STAMITY:[A-Z_]+\}/g;
const COMMAND_MENTION = /\/stamity-([a-z0-9][a-z0-9-]*)/g;
const BARE_MENTION = /(?<![/A-Za-z0-9_-])stamity-([a-z0-9][a-z0-9-]*)/g;

/** The neutral verify seam every generator reads its gate criteria from. */
const VERIFY_SEAM = /\.stamity\/verify\/[a-z-]+-<sha>\.json/;

const packFiles: Promise<CorpusFile[]> = walkAllMarkdown(PACK_ROOT);
const corpusFiles: Promise<CorpusFile[]> = walkAllMarkdown();

const manifestRaw: Promise<string> = readFile(join(PACK_ROOT, PACK_MANIFEST_FILE), "utf8");
const manifest: Promise<PackManifest> = manifestRaw.then((raw) =>
  validatePackManifest(JSON.parse(raw)),
);

/** Declared id, falling back to the filename slug (their agreement is asserted below). */
function declaredId(file: CorpusFile): string {
  const id = frontmatterField(file.parsed, "id");
  return typeof id === "string" && id.trim() !== "" ? id : filenameSlug(file.relPath);
}

function bodyOf(files: readonly CorpusFile[], id: string): string {
  return flat(fileOf(files, id).parsed.body);
}

function fileOf(files: readonly CorpusFile[], id: string): CorpusFile {
  const file = files.find((candidate) => declaredId(candidate) === id);
  if (file === undefined) throw new Error(`pack file for id ${JSON.stringify(id)} not found`);
  return file;
}

/** One pack command by id, unflattened — table probes read rows, not prose. */
async function packFile(id: string): Promise<CorpusFile> {
  return fileOf(await packFiles, id);
}

/**
 * The six reliability-axis checks a generated objective set is graded against.
 * Published by the core verify skill's reliability reference; slo-scaffold cites
 * them and defines none, so the ids are spelled once here and asserted on both
 * sides of the seam.
 */
const SLO_CHECK_IDS: readonly string[] = [
  "rel-slo-objective",
  "rel-availability-target",
  "rel-error-budget",
  "rel-burn-rate-alert",
  "rel-slo-window",
  "rel-slo-owner",
];

/**
 * Every path this pack's bodies state it writes, each row naming the command
 * that claims it and a literal that command must still carry.
 *
 * Read out of the shipped bodies rather than copied from `pack.json`: the
 * traceability case re-reads each `claim`, so a declared path whose body stopped
 * naming it fails here instead of standing as consent nobody spends.
 */
const WRITE_CLAIMS: readonly { path: string; command: string; claim: string }[] = [
  { path: "src/**", command: "auth-scaffold", claim: "`src/auth/`" },
  { path: "lib/**", command: "auth-scaffold", claim: "`lib/`" },
  { path: "app/**", command: "auth-scaffold", claim: "`app/`" },
  { path: "test/**", command: "auth-scaffold", claim: "`test/`" },
  { path: "tests/**", command: "auth-scaffold", claim: "`tests/`" },
  { path: "spec/**", command: "auth-scaffold", claim: "`spec/`" },
  { path: "config/**", command: "auth-scaffold", claim: "under `config/`" },
  { path: ".env.example", command: "auth-scaffold", claim: "`.env.example`" },
  { path: "docs/**", command: "design-system-create", claim: "`docs/design.md`" },
  { path: "tokens/**", command: "design-system-create", claim: "`tokens/`" },
  { path: "styles/**", command: "design-system-create", claim: "under `styles/`" },
  { path: "slo/**", command: "slo-scaffold", claim: "`slo/`" },
  {
    path: ".stamity/verify/**",
    command: "slo-scaffold",
    claim: ".stamity/verify/reliability-<sha>.json",
  },
];

/**
 * Both directions of the declaration mismatch, as messages. Pure over two sets,
 * so the fixture can drive it with a seeded defect of each kind — a comparison
 * that has never reported an under-declaration proves nothing about the
 * direction that costs trust.
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

/** One artifact as the anti-shadowing detector sees it: its trigger surface and its body. */
interface TriggerRow {
  id: string;
  relPath: string;
  description: string;
  body: string;
}

/** A row built from literals, for the anti-shadowing fixture cases. */
const row = (id: string, description: string, body = ""): TriggerRow => ({
  id,
  relPath: `commands/stamity-${id}.md`,
  description,
  body,
});

/** A duration cell ("1 hour", "6 hours", "3 days", "5 minutes") in hours. */
function hoursOf(cell: string): number {
  const match = /([\d.]+)\s*(minute|hour|day)/.exec(cell.trim());
  if (match === null) throw new Error(`unparsable duration cell: ${JSON.stringify(cell)}`);
  const value = Number(match[1]);
  const unit = match[2];
  return unit === "minute" ? value / 60 : unit === "hour" ? value : value * 24;
}

/** An unavailability cell ("43 minutes", "3 hours 36 minutes") in minutes. */
function minutesOf(cell: string): number {
  const hours = /([\d.]+)\s*hours?/.exec(cell);
  const minutes = /([\d.]+)\s*minutes?/.exec(cell);
  const total = (hours === null ? 0 : Number(hours[1]) * 60) + (minutes === null ? 0 : Number(minutes[1]));
  if (total === 0) throw new Error(`unparsable unavailability cell: ${JSON.stringify(cell)}`);
  return total;
}

/**
 * Whitespace-collapsed text. Bodies are hard-wrapped markdown, so a clause the
 * contract requires ("exactly one corrective implementer pass") is routinely
 * split across two lines; matching a wrapped sentence against a flat pattern
 * would fail on formatting rather than on content.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Collect a throwing assertion as a message instead of aborting the pass. */
function collect(problems: string[], check: () => void): void {
  try {
    check();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
}

/** Shared significant terms over the smaller term set — the anti-shadowing metric. */
function overlap(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((term) => b.has(term)).length;
  return shared / Math.min(a.size, b.size);
}

/** Prose outside ``` fences — mirrors the corpus cross-reference accounting. */
function stripFencedBlocks(body: string): string {
  return body
    .split("```")
    .filter((_, index) => index % 2 === 0)
    .join(" ");
}

describe("scaffold pack — engine ingress", () => {
  it("the manifest validates and declares one digest per shipped file", async () => {
    const parsed = await manifest;

    expect(parsed.name).toBe("scaffold");
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.description).toBeTypeOf("string");
    expect(Object.keys(parsed.integrity).toSorted()).toEqual(
      COMMAND_IDS.map((id) => `commands/stamity-${id}.md`).toSorted(),
    );
    expect(parsed.declaredTools).toEqual(["claude", "cursor", "copilot", "codex"]);
    expect(parsed.permissions?.toolFootprint).toContain("edit");
    expect(parsed.permissions?.touchedPaths?.length ?? 0).toBeGreaterThan(0);
  });

  it("ships exactly the three commands, and nothing outside a live content class", async () => {
    const files = await enumeratePackContent(PACK_ROOT);

    expect(files.map((file) => file.relPath)).toEqual(
      COMMAND_IDS.map((id) => `commands/stamity-${id}.md`).toSorted(),
    );
    expect(new Set(files.map((file) => file.contentClass))).toEqual(new Set(["commands"]));

    // Live-emission invariant, checked structurally: no directory at the pack
    // root outside the classes the engine emits.
    const entries = await readdir(PACK_ROOT, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    expect(dirs.filter((name) => !PACK_CONTENT_CLASSES.includes(name as never))).toEqual([]);
  });

  it("passes every install gate the add path runs", async () => {
    const parsed = await manifest;
    const files = await enumeratePackContent(PACK_ROOT);

    await expect(verifyIntegrityMap(PACK_ROOT, parsed, files)).resolves.toBe("pass");
    await expect(scanPackBodies(files)).resolves.toBe("pass");
    await expect(checkDeclaredTools(parsed, files)).resolves.toBe("pass");
    expect(checkFootprint(parsed, files)).toBe("pass");
    expect(checkPermissions(parsed, files)).toBe("pass");
  });

  it("declares exactly the write surface its own bodies claim", async () => {
    const declared = (await manifest).permissions?.touchedPaths ?? [];

    // `touchedPaths` is the operator's pre-install consent surface, and this pack
    // writes product code — the direction that matters. It used to be narrower
    // than what the bodies said they wrote: the test and app roots a generator
    // falls back to under the repo's own conventions, the committed environment
    // template, and the style root the emission targets land in were all absent.
    // Over-declaration is the safe side of an ambiguous path and is taken
    // deliberately here, with each entry traceable to the body that names it.
    expect(declarationProblems(declared, WRITE_CLAIMS.map((claim) => claim.path))).toEqual([]);
  });

  it("every declared path traces to a body that states the write", async () => {
    const files = await packFiles;

    const problems = WRITE_CLAIMS.flatMap((claim) => {
      const body = files.find((file) => declaredId(file) === claim.command);
      if (body === undefined) return [`${claim.path}: claimed by ${claim.command}, which is gone`];
      return body.raw.includes(claim.claim)
        ? []
        : [`${claim.path}: ${claim.command} no longer states ${JSON.stringify(claim.claim)}`];
    });

    expect(problems).toEqual([]);
    expect(WRITE_CLAIMS.length).toBeGreaterThan(10);
  });

  it("fixture: the comparison catches a seeded under-declaration and a seeded over-declaration", () => {
    const claimed = ["tokens/**", ".env.example"];

    expect(declarationProblems(["tokens/**"], claimed)).toEqual([
      expect.stringMatching(/under-declared: \.env\.example/),
    ]);
    expect(declarationProblems([...claimed, "src/**"], claimed)).toEqual([
      expect.stringMatching(/over-declared: src\/\*\*/),
    ]);
    expect(declarationProblems(claimed, claimed)).toEqual([]);
  });

  it("each integrity digest is the SHA-256 of the file on disk", async () => {
    const parsed = await manifest;

    const measured = await Promise.all(
      Object.keys(parsed.integrity).map(async (relPath) => {
        const bytes = await readFile(join(PACK_ROOT, relPath));
        return [relPath, createHash("sha256").update(bytes).digest("hex")] as const;
      }),
    );

    expect(Object.fromEntries(measured)).toEqual(parsed.integrity);
  });

  const tempDir = useTempDir("scaffold-pack");

  it("fixture: a body edited without regenerating its digest is refused", async () => {
    const parsed = await manifest;
    const relPath = "commands/stamity-auth-scaffold.md";
    const t = tempDir();
    await t.seedFiles({
      [PACK_MANIFEST_FILE]: await manifestRaw,
      [relPath]: `${await readFile(join(PACK_ROOT, relPath), "utf8")}\nappended line\n`,
      "commands/stamity-slo-scaffold.md": await readFile(
        join(PACK_ROOT, "commands", "stamity-slo-scaffold.md"),
        "utf8",
      ),
      "commands/stamity-design-system-create.md": await readFile(
        join(PACK_ROOT, "commands", "stamity-design-system-create.md"),
        "utf8",
      ),
    });

    const files = await enumeratePackContent(t.dir);
    await expect(verifyIntegrityMap(t.dir, parsed, files)).rejects.toThrow(
      /does not match its digest/,
    );
  });
});

describe("scaffold pack — authoring contract", () => {
  it("every file carries the frontmatter head, load class, caps and clean bodies", async () => {
    const files = await packFiles;
    expect(files).toHaveLength(COMMAND_IDS.length);

    const problems: string[] = [];
    for (const file of files) {
      const id = frontmatterField(file.parsed, "id");
      const implied = filenameSlug(file.relPath);
      if (typeof id !== "string" || id !== implied) {
        problems.push(`${file.relPath}: id ${JSON.stringify(id)} disagrees with the filename`);
      }
      if (frontmatterField(file.parsed, "type") !== "command") {
        problems.push(`${file.relPath}: type must be command`);
      }

      const description = frontmatterField(file.parsed, "description");
      if (typeof description !== "string" || description.trim() === "") {
        problems.push(`${file.relPath}: description must be a non-empty string`);
      } else {
        if (description.length > 1024) problems.push(`${file.relPath}: description over 1024 chars`);
        if (/\b(?:you|your|yours|yourself)\b/i.test(description)) {
          problems.push(`${file.relPath}: description addresses the reader`);
        }
      }

      const tags = frontmatterField(file.parsed, "tags");
      if (!Array.isArray(tags) || tags.length === 0 || tags.some((tag) => typeof tag !== "string")) {
        problems.push(`${file.relPath}: tags must be a non-empty array of strings`);
      } else if (isContextTag(String(tags[0]))) {
        problems.push(`${file.relPath}: primary tag is a context tag, not a capability`);
      }

      collect(problems, () => requireLoadClass(file, ["on-demand"]));
      collect(problems, () => requireObsoleteWhen(file));
      collect(problems, () => assertDenyClean(file));
      collect(problems, () => assertLineCap(file, COMMAND_BODY_CAP));
      // Engine-reserved key: a pack may not restrict its content to a tool
      // subset behind the manifest's `declaredTools` cross-check.
      collect(problems, () => extractToolsFrontmatter(file.raw, file.relPath));
      if (frontmatterField(file.parsed, "tools") !== undefined) {
        problems.push(`${file.relPath}: the engine-reserved \`tools\` key must stay absent`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("every command spawns the writer and the gate, and only census agents", async () => {
    const agentIds = new Set(
      (await corpusFiles)
        .filter((file) => file.relPath.startsWith("agents/"))
        .map((file) => declaredId(file)),
    );
    expect(agentIds.size).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const file of await packFiles) {
      const spawns = frontmatterField(file.parsed, "spawns");
      if (!Array.isArray(spawns) || spawns.length === 0) {
        problems.push(`${file.relPath}: spawns must be a non-empty array`);
        continue;
      }
      for (const role of REQUIRED_SPAWNS) {
        if (!spawns.includes(role)) problems.push(`${file.relPath}: spawns omits ${role}`);
      }
      for (const entry of spawns) {
        if (typeof entry !== "string" || !agentIds.has(entry)) {
          problems.push(`${file.relPath}: spawns names ${JSON.stringify(entry)} — not a core agent`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("carries no floor:* tag — a generator builds to a floor, it is not one", async () => {
    const tagged: string[] = [];
    for (const file of await packFiles) {
      const tags = frontmatterField(file.parsed, "tags");
      for (const tag of Array.isArray(tags) ? tags : []) {
        if (typeof tag === "string" && isFloorTag(tag)) tagged.push(`${file.relPath}: ${tag}`);
      }
    }
    expect(tagged).toEqual([]);

    // Raw scan over every shipped byte, manifest included: the marker must not
    // appear in a body, a table row, or a manifest field either.
    const raws = await Promise.all([
      manifestRaw,
      ...(await packFiles).map((file) => Promise.resolve(file.raw)),
    ]);
    expect(raws.filter((raw) => raw.includes("floor:"))).toEqual([]);
  });
});

describe("scaffold pack — generator contract", () => {
  it("every body states the max-one-regeneration cap as fail-closed", async () => {
    const problems: string[] = [];
    for (const file of await packFiles) {
      const body = flat(file.parsed.body);
      if (!/one regeneration, then stop/i.test(body)) {
        problems.push(`${file.relPath}: no "one regeneration, then stop" clause`);
      }
      if (!/exactly one corrective implementer pass/i.test(body)) {
        problems.push(`${file.relPath}: the single corrective pass is not stated`);
      }
      if (!/fail-closed/i.test(body) || !/no third round/i.test(body)) {
        problems.push(`${file.relPath}: the cap is not declared fail-closed with no third round`);
      }
      if (!/not-merge-ready/i.test(body)) {
        problems.push(`${file.relPath}: the second-failure outcome is not stated`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every body delegates the write and gates through a named lens", async () => {
    const problems: string[] = [];
    const lenses: Record<string, RegExp> = {
      "auth-scaffold": /Security lens/,
      "slo-scaffold": /Reliability lens/,
      "design-system-create": /UI and UX lenses/,
    };

    for (const file of await packFiles) {
      const body = flat(file.parsed.body);
      const id = declaredId(file);
      if (!/`implementer` spawn/.test(body)) {
        problems.push(`${file.relPath}: the write is not delegated to an implementer spawn`);
      }
      if (!/`reviewer` spawn/.test(body)) {
        problems.push(`${file.relPath}: the gate is not delegated to a reviewer spawn`);
      }
      const lens = lenses[id];
      if (lens !== undefined && !lens.test(body)) {
        problems.push(`${file.relPath}: does not name its ${String(lens)} gate`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("gate criteria come from the neutral verify seam, not from the pack itself", async () => {
    const problems: string[] = [];
    for (const file of await packFiles) {
      const body = flat(file.parsed.body);
      if (!VERIFY_SEAM.test(body)) {
        problems.push(`${file.relPath}: no .stamity/verify/<axis>-<sha>.json evidence input`);
      }
      if (!/stamity-verify/.test(body)) {
        problems.push(`${file.relPath}: does not name the core verify skill as the producer`);
      }
      if (!/does not define one/.test(body)) {
        problems.push(`${file.relPath}: does not disclaim owning the floor`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every body stops before overwriting an existing artifact and asks by core rule id", async () => {
    const files = await packFiles;
    const problems: string[] = [];

    for (const file of files) {
      const body = flat(file.parsed.body);
      if (!/stamity-question-protocol/.test(body)) {
        problems.push(`${file.relPath}: the ask contract is not cited by core rule id`);
      }
      // Cited by id only: a path citation would dangle in an installed repo,
      // where core content lives in generated surfaces rather than `content/`.
      if (/(?:content\/)?rules\/stamity-question-protocol\.md/.test(body)) {
        problems.push(`${file.relPath}: cites the question protocol by path instead of by id`);
      }
      if (!/Ask before writing/.test(body)) {
        problems.push(`${file.relPath}: has no pre-write ask section`);
      }
    }

    // The brownfield trigger, per generator: an artifact of this kind already
    // in the tree stops the run rather than being regenerated over.
    expect(bodyOf(files, "auth-scaffold")).toMatch(/An auth layer already exists/);
    expect(bodyOf(files, "auth-scaffold")).toMatch(/overwrites nothing it did not write/);
    expect(bodyOf(files, "slo-scaffold")).toMatch(/Objective definitions already exist/);
    expect(bodyOf(files, "slo-scaffold")).toMatch(/Replacing a live objective set/);
    expect(bodyOf(files, "design-system-create")).toMatch(/never overwritten here/);
    expect(bodyOf(files, "design-system-create")).toMatch(/`reuse` or `blocked`/);

    // The undetectable-stack trigger asks instead of guessing an idiom.
    expect(bodyOf(files, "auth-scaffold")).toMatch(/The stack is not detectable/);
    expect(bodyOf(files, "slo-scaffold")).toMatch(/unnamed and undetectable/);

    expect(problems).toEqual([]);
  });

  it("design-system-create consumes the detect inventory and holds no detection procedure", async () => {
    const body = bodyOf(await packFiles, "design-system-create");

    expect(body).toMatch(/\.stamity\/design-system-inventory\.md/);
    expect(body).toMatch(/stamity-design-system-detect/);
    expect(body).toMatch(/performs no detection of its own/);
    // Verdict routing is consumed, not re-derived.
    for (const verdict of ["reuse", "extend", "create", "blocked"]) {
      expect(body).toMatch(new RegExp(`\`${verdict}\``));
    }

    // Detection-procedure vocabulary from the core detector: none of it may
    // reappear here, or the pack would own a second, divergent detector.
    const detectionMarkers = [
      /detection order/i,
      /first match wins/i,
      /scan the dependency manifest/i,
      /inventory the existing components/i,
      /record what was probed/i,
    ];
    expect(detectionMarkers.filter((marker) => marker.test(body))).toEqual([]);
  });

  it("slo-scaffold's burn-rate recipe is arithmetically self-consistent with its own window", async () => {
    const body = (await packFile("slo-scaffold")).parsed.body;

    // One window, read from the Inputs table, and every number in the file stated
    // against it. The predecessor shipped the canonical 30-day constants under a
    // 28-day heading, so every tier was off by 720/672 and each row contradicted
    // the budget column beside it. Parsed rather than asserted as literals: a
    // future window change has to move all three families together or fail here.
    const windowDays = Number(/\| Window \| (\d+) days, rolling \|/.exec(body)?.[1]);
    expect(windowDays).toBeGreaterThan(0);
    const windowHours = windowDays * 24;

    // Burn-rate tiers: budget spent over the long window, as a rate against the
    // whole window. burnRate x longWindow == budgetConsumed x window.
    const tiers = [
      ...body.matchAll(
        /\| (Fast|Medium|Slow) \| ([\d.]+)% in ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| ([\d.]+)× \|/g,
      ),
    ];
    expect(tiers).toHaveLength(3);

    for (const tier of tiers) {
      const [, name, consumed, over, longWindow, shortWindow, rate] = tier;
      const budget = Number(consumed) / 100;
      const longHours = hoursOf(String(longWindow));
      const shortHours = hoursOf(String(shortWindow));

      // The duration inside the budget cell IS the long window; a tier that
      // measured its budget over one span and alerted over another would page on
      // a rate nobody computed.
      expect(hoursOf(String(over)), `${name}: budget span disagrees with the long window`).toBe(
        longHours,
      );
      expect(Number(rate) * longHours, `${name}: burn rate does not spend its stated budget`)
        .toBeCloseTo(budget * windowHours, 6);
      // The short window is the confirmation leg: strictly shorter, non-zero.
      expect(shortHours, `${name}: short window is not shorter than the long one`).toBeLessThan(
        longHours,
      );
      expect(shortHours).toBeGreaterThan(0);
    }

    // The budget column: (1 - target) x window, in minutes, over the same window.
    const budgets = [
      ...body.matchAll(/\| ([\d.]+)% \| (\d+) days rolling \| ([\d.]+)% \| about ([^|]+?) \|/g),
    ];
    expect(budgets.length).toBeGreaterThanOrEqual(2);

    for (const budget of budgets) {
      const [, target, rowWindow, budgetPercent, allowed] = budget;
      expect(Number(rowWindow), `${target}%: stated against a second window`).toBe(windowDays);
      expect(Number(budgetPercent)).toBeCloseTo(100 - Number(target), 6);
      // Rounded to the nearest minute in the prose, so a minute of slack is the
      // whole tolerance — 43.2 reads as "about 43 minutes", 44 would not.
      const derived = (Number(budgetPercent) / 100) * windowDays * 24 * 60;
      expect(
        Math.abs(minutesOf(String(allowed)) - derived),
        `${target}%: unavailability disagrees with the derived budget (${derived} minutes)`,
      ).toBeLessThanOrEqual(1);
    }

    // The gate row and the recipe paragraph name the same window as the table.
    expect(body).toContain(`the ${windowDays}-day window`);
    expect(body).toContain(`recipe for a ${windowDays}-day window`);
  });

  it("slo-scaffold cites the six reliability check ids and defines none of them", async () => {
    const body = (await packFile("slo-scaffold")).parsed.body;

    for (const id of SLO_CHECK_IDS) {
      expect(body, `slo-scaffold does not cite ${id}`).toContain(`\`${id}\``);
    }

    // Cited, never defined: a check's `How:` and `Threshold:` prose belongs to the
    // axis reference the run reads as evidence. A second copy in the pack is the
    // drift this seam exists to prevent, and it is what "0 of 6 rows in the axis it
    // cites" looked like before.
    expect(body).not.toMatch(/`rel-[a-z-]+`[^|\n]{0,160}?(?:How:|Threshold:)/);
    expect(body).toMatch(/cited, never defined here/i);

    // Non-degenerate on the producing side: the six really are rows of the core
    // reliability axis, so the citation resolves rather than naming inventions.
    const reference = (await corpusFiles).find(
      (file) => file.relPath === "skills/stamity-verify/references/reliability.md",
    );
    expect(reference, "the reliability axis reference is missing").toBeDefined();
    for (const id of SLO_CHECK_IDS) {
      expect(reference!.parsed.body, `${id} is not a row of the reliability axis`).toContain(
        `**\`${id}\`**`,
      );
    }
  });

  it("every generator names the axis as its floor and its own rows as acceptance criteria", async () => {
    const problems: string[] = [];
    for (const file of await packFiles) {
      const body = flat(file.parsed.body);
      // Each body says the floor is the repo's and defines none, then ships
      // a table of hand-authored passing conditions. The relationship is now stated
      // rather than left to the reader: the axis artifact is the evidence input and
      // these rows are the generator's additional acceptance criteria.
      if (!/acceptance criteria, not a second floor/i.test(body)) {
        problems.push(`${file.relPath}: does not relate its Gate rows to the axis floor`);
      }
      if (!/evaluated against the axis artifact/i.test(body)) {
        problems.push(`${file.relPath}: does not name the axis artifact as the evidence input`);
      }
      // The producer suffixes `-dirty` on an unclean tree, and the gate runs
      // after the implementer has written — so the dirty key is the normal one here.
      if (!/-dirty` suffix whenever the worktree is unclean/i.test(body)) {
        problems.push(`${file.relPath}: reads the axis artifact without the -dirty key`);
      }
      if (!/unclean by construction/i.test(body)) {
        problems.push(`${file.relPath}: does not state why the dirty key is the normal one`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("slo-scaffold scaffolds the neutral seam when no observability stack exists", async () => {
    const body = bodyOf(await packFiles, "slo-scaffold");

    expect(body).toMatch(/A repo with no observability stack/);
    expect(body).toMatch(/nothing is exported, loaded, or received/);
    expect(body).toMatch(/The file set is the seam/);
    // Placeholders stay named rather than invented, and the report says so.
    expect(body).toMatch(/named placeholders/);
  });

  it("auth-scaffold covers pattern selection, storage posture and a test scaffold", async () => {
    const body = bodyOf(await packFiles, "auth-scaffold");

    expect(body).toMatch(/Session cookie/);
    expect(body).toMatch(/Bearer credential/);
    expect(body).toMatch(/Authorization code with PKCE/);
    expect(body).toMatch(/## Storage posture/);
    expect(body).toMatch(/## Test scaffold/);
    expect(body).toMatch(/memory-hard hash/);
  });
});

describe("scaffold pack — reference hygiene", () => {
  it("every cross-reference resolves to a live core or pack artifact", async () => {
    const known = new Set([
      ...(await corpusFiles).filter((file) => file.parsed.hadFrontmatter).map(declaredId),
      ...(await packFiles).map(declaredId),
    ]);
    const commandIds = new Set([
      ...(await corpusFiles)
        .filter((file) => file.relPath.startsWith("commands/"))
        .map(declaredId),
      ...COMMAND_IDS,
    ]);

    const problems: string[] = [];
    for (const file of await packFiles) {
      const prose = stripFencedBlocks(file.parsed.body);
      for (const match of prose.matchAll(COMMAND_MENTION)) {
        if (!commandIds.has(match[1] ?? "")) {
          problems.push(`${file.relPath}: /stamity-${match[1]} resolves to no shipped command`);
        }
      }
      for (const match of prose.matchAll(BARE_MENTION)) {
        if (!known.has(match[1] ?? "")) {
          problems.push(`${file.relPath}: mentions stamity-${match[1]}, which nothing answers to`);
        }
      }
      for (const match of file.raw.matchAll(SUBSTITUTION_TOKEN)) {
        if (!REPO_SUBSTITUTION_TOKENS.includes(match[0])) {
          problems.push(`${file.relPath}: ${match[0]} is not a wired substitution token`);
        }
      }
      for (const match of file.raw.matchAll(URL_PATTERN)) {
        const host = URL.parse(match[0])?.hostname.toLowerCase() ?? "";
        if (!URL_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
          problems.push(`${file.relPath}: links ${match[0]} — spec bodies only`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("no body cites a pack-internal path as if it were core", async () => {
    const problems: string[] = [];
    for (const file of await packFiles) {
      // `.stamity/packs/<id>/` is where the installer puts these files; content
      // that addressed itself there would break the moment a pack is renamed,
      // relocated, or read from the source checkout.
      if (file.raw.includes(".stamity/packs")) {
        problems.push(`${file.relPath}: self-references its installed location`);
      }
      if (/\bpacks\/scaffold\b/.test(file.raw)) {
        problems.push(`${file.relPath}: cites the pack's repo-side directory`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("no reserved product name appears in a pack path or body", async () => {
    // Rules are read out of the gate script so this suite never spells one.
    const gateSource = await readFile(GATE_SCRIPT, "utf8");
    const entry = /\{\s*id:\s*'([^']+)',\s*parts:\s*\[([^\]]*)\]/g;
    const rules = [...gateSource.matchAll(entry)].map((match) => ({
      id: match[1] ?? "",
      token: [...(match[2] ?? "").matchAll(/'([^']*)'/g)].map((part) => part[1] ?? "").join(""),
    }));
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect(rules.every((rule) => rule.token !== "")).toBe(true);

    const texts = [
      { relPath: PACK_MANIFEST_FILE, text: await manifestRaw },
      ...(await packFiles).map((file) => ({ relPath: file.relPath, text: file.raw })),
    ];

    const problems: string[] = [];
    for (const { relPath, text } of texts) {
      for (const rule of rules) {
        const pattern = new RegExp(rule.token, "i");
        if (pattern.test(relPath) || pattern.test(text)) {
          problems.push(`${relPath}: matches reserved-name rule ${rule.id}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("scaffold pack — anti-shadowing", () => {
  /**
   * Trigger-domain overlap between two descriptions: shared significant terms
   * over the smaller term set. Descriptions are the surface an agent picks an
   * artifact from, so two that read alike are a routing defect even when the
   * bodies differ.
   *
   * High overlap is not always shadowing: a generator that consumes another
   * artifact's output legitimately shares its subject nouns. The rule that
   * separates the two cases is declaration — an overlapping pack body must NAME
   * the artifact it overlaps, which is what makes the pair a documented seam
   * rather than two artifacts competing for the same request.
   */
  const STOPWORDS: ReadonlySet<string> = new Set([
    "with", "that", "this", "from", "into", "their", "them", "when", "what", "which",
    "each", "only", "every", "than", "then", "over", "under", "after", "before",
    "other", "also", "been", "were", "have", "runs", "plus", "plus-",
  ]);

  const OVERLAP_DECLARE_AT = 0.3;
  const OVERLAP_HARD_CAP = 0.6;

  function terms(description: string): Set<string> {
    return new Set(
      (description.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter(
        (word) => !STOPWORDS.has(word),
      ),
    );
  }

  const describeRow = (file: CorpusFile): TriggerRow => ({
    id: declaredId(file),
    relPath: file.relPath,
    description: String(frontmatterField(file.parsed, "description") ?? ""),
    body: file.parsed.body,
  });

  /**
   * Every shadowing violation between `pack` rows and the artifacts around them.
   *
   * TEST CHANGE, justified: this loop used to live inline in the
   * corpus case, and its "fixture" asserted two string literals about each other
   * without ever calling it — so neither half of the rule (the hard cap, and the
   * declared-overlap escape) had coverage, and a detector that always returned
   * `[]` would have passed. Hoisted here so the fixture below drives the real
   * comparison with one violating row and one clean one, as the sibling pack
   * suites do. The corpus case's assertion is unchanged.
   */
  function shadowingProblems(
    pack: readonly TriggerRow[],
    neighbours: readonly TriggerRow[],
  ): string[] {
    const problems: string[] = [];
    for (const entry of pack) {
      for (const other of [...neighbours, ...pack]) {
        if (other.id === entry.id) continue;
        const score = overlap(terms(entry.description), terms(other.description));
        if (score >= OVERLAP_HARD_CAP) {
          problems.push(
            `${entry.relPath}: description overlaps ${other.id} at ${score.toFixed(2)} — ` +
              `two artifacts cannot answer the same request`,
          );
          continue;
        }
        if (score >= OVERLAP_DECLARE_AT && !entry.body.includes(`stamity-${other.id}`)) {
          problems.push(
            `${entry.relPath}: description overlaps ${other.id} at ${score.toFixed(2)} ` +
              `without naming it — an undeclared overlap is shadowing`,
          );
        }
      }
    }
    return problems;
  }

  it("no pack description shares a trigger domain with a core or sibling artifact", async () => {
    const neighbours = (await corpusFiles)
      .filter(
        (file) =>
          file.parsed.hadFrontmatter &&
          (file.relPath.startsWith("commands/") || file.relPath.endsWith("SKILL.md")),
      )
      .map(describeRow);
    const pack = (await packFiles).map(describeRow);
    expect(neighbours.length).toBeGreaterThan(10);

    expect(shadowingProblems(pack, neighbours)).toEqual([]);
  });

  it("fixture: the detector flags an undeclared overlap and clears the same pair once declared", () => {
    // The live seam, at its real overlap: a generator legitimately shares its
    // subject nouns with the detector whose output it consumes, which is exactly
    // the case the declared-overlap escape exists for.
    const detector = row(
      "design-system-detect",
      "Detects the repo design system — tokens, components, theming — and emits the design-system inventory artifact.",
    );
    const generatorDescription =
      "Generates a design system from the recorded inventory and an intake dialog — three-tier tokens, perceptual colour ramps, theme sets, and the design document.";

    // Same description on both sides of the escape hatch: the only difference is
    // whether the body names the artifact it overlaps.
    const undeclared = row("design-system-create", generatorDescription);
    const declared = row(
      "design-system-create",
      generatorDescription,
      "Consumes the inventory stamity-design-system-detect writes.",
    );

    expect(shadowingProblems([undeclared], [detector])).toEqual([
      expect.stringMatching(
        /stamity-design-system-create\.md: description overlaps design-system-detect at 0\.\d\d without naming it/,
      ),
    ]);
    expect(shadowingProblems([declared], [detector])).toEqual([]);
  });

  it("fixture: a near-identical description trips the hard cap, which no declaration clears", () => {
    const original = row("auth-scaffold", "Builds the first authentication layer for a service that has none.");
    // Over the hard cap, and the body names the artifact it clones — the escape
    // hatch is deliberately not consulted above OVERLAP_HARD_CAP.
    const clone = row(
      "auth-generate",
      "Builds the first authentication layer for a service that has none at all.",
      "Overlaps stamity-auth-scaffold deliberately.",
    );

    expect(shadowingProblems([clone], [original])).toEqual([
      expect.stringMatching(/two artifacts cannot answer the same request/),
    ]);
  });

  it("fixture: disjoint descriptions report nothing — the detector is not always-firing", () => {
    expect(
      shadowingProblems(
        [row("slo-scaffold", "Turns a service with no reliability targets into a versioned objective set.")],
        [row("containerize", "Packages a service into a container image with a hardened runtime stage.")],
      ),
    ).toEqual([]);
  });
});
