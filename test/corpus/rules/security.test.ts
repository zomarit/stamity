import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../../src/content/catalog.ts";
import { frontmatterField } from "../../../src/content/frontmatter.ts";
import { planMdcCompanions } from "../../../src/content/mdcCompanions.ts";
import { CONTENT_DENY_PATTERNS, scanAntiSlop, scanForDeniedPatterns } from "../../../src/denyscan/denyScan.ts";
import { SPECIALIST_TRIGGER_TABLE } from "../../../src/roster/triggers.ts";
import {
  assertDenyClean,
  assertLineCap,
  filenameSlug,
  loadCorpusIndex,
  requireLoadClass,
  requireObsoleteWhen,
  walkAllMarkdown,
  type CorpusFile,
} from "../harness.ts";

/**
 * The four security-and-change rules — security-patterns, secrets,
 * api-versioning, migrations — as a contract over their shipped bodies.
 *
 * What this suite binds beyond the corpus-wide frontmatter contract:
 *
 *   - **Glob activation, authored as a list.** All four auto-attach, so all
 *     four declare `scope: conditional` with a non-empty `globs` array. The
 *     engine's glob reader also accepts a comma-separated string; a rule
 *     authored that way still emits a working companion, which is exactly why
 *     the authoring shape is asserted here rather than left to the transform.
 *   - **Precedence round-trip.** `secrets` is the one rule the SoT marks
 *     critical. The assertion follows the value through the catalog
 *     (`CatalogItem.precedence`) and then checks it does NOT reach the Cursor
 *     companion — precedence is engine vocabulary consumed before emission.
 *   - **Self-survival of the secrets rule.** A rule about credential handling
 *     is the body most likely to trip the write-path deny scan, and the one
 *     most likely to demonstrate its subject with a real-looking literal. Both
 *     failure shapes are asserted: zero block-severity hits, and no
 *     credential-shaped literal anywhere in the body.
 *   - **Stack-agnostic floors.** Core ships principles and gates; vendors and
 *     products belong to packs. A named service inside a requirement fails
 *     here, in every one of the four bodies.
 *   - **No charter duplication.** The charter owns the always-on slab; these
 *     rules carry pattern-level floors. A line copied from one into the other
 *     is two owners for one statement.
 *
 * Prose assertions run against a whitespace-flattened view ({@link flow}) so a
 * reflowed paragraph is not a failure; structural assertions (headings, caps,
 * line-level duplication) run against the raw body.
 */

/** Body cap for every rule: the authoring anatomy's ceiling. */
const RULE_BODY_CAP = 120;

/** The two sanctioned rule activation modes. `always` is banned corpus-wide. */
const RULE_SCOPES: readonly string[] = ["agent-requested", "conditional"];

/**
 * Vendors, managed services, and libraries. Core rules state floors a project
 * satisfies with whatever it already runs; naming a product turns a floor into
 * a purchase order, and the stack-specific guidance belongs to a pack.
 */
const VENDOR_NAMES =
  /\b(?:aws|amazon|gcp|google cloud|azure|hashicorp|postgres(?:ql)?|mysql|mariadb|mongodb|dynamodb|redis|sqlite|prisma|drizzle|flyway|liquibase|sqitch|alembic|knex|dbmate|bytebase|stripe|github|gitlab|bitbucket|dependabot|snyk|trufflehog|gitleaks|npm|yarn|pnpm|docker|kubernetes|terraform|okta|auth0|firebase|supabase|vercel|cloudflare|datadog|sentry|kafka|debezium|zod|joi|valibot|express|django)\b/i;

/**
 * Literal shapes a real credential takes. A rule that teaches credential
 * handling by pasting one has published a credential — and seeded a plausible
 * literal into every repository that installs the corpus.
 */
const CREDENTIAL_LITERALS: readonly { label: string; pattern: RegExp }[] = [
  { label: "PEM private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "vendor-prefixed key", pattern: /\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9]{12,}/ },
  { label: "cloud access key id", pattern: /\b(?:AKIA|ASIA|AIza)[A-Za-z0-9]{10,}/ },
  { label: "long base64-ish run", pattern: /[A-Za-z0-9+/]{24,}={0,2}/ },
  { label: "long hex run", pattern: /\b[0-9a-f]{32,}\b/i },
  { label: "signed token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\./ },
];

interface SecurityRule {
  /** Bare frontmatter id, which is also the filename slug. */
  id: string;
  relPath: string;
  tags: string[];
  globs: string[];
  /** Declared only where the SoT marks the rule critical. */
  precedence?: "critical";
}

const RULES: readonly SecurityRule[] = [
  {
    id: "security-patterns",
    relPath: "rules/stamity-security-patterns.md",
    tags: ["implementation", "review", "floor:security"],
    globs: ["**/auth/**", "**/api/**", "**/server/**", "**/middleware/**", "**/*.env*"],
  },
  {
    id: "secrets",
    relPath: "rules/stamity-secrets.md",
    tags: ["implementation", "devops", "floor:security"],
    globs: ["**/.env*", "**/secrets*", "**/*.pem", "**/*.key", "**/config/**"],
    precedence: "critical",
  },
  {
    id: "api-versioning",
    relPath: "rules/stamity-api-versioning.md",
    tags: ["implementation"],
    globs: ["**/api/**", "**/routes/**", "**/*openapi*", "**/*.proto", "**/graphql/**"],
  },
  {
    id: "migrations",
    relPath: "rules/stamity-migrations.md",
    tags: ["implementation", "devops"],
    globs: ["**/migrations/**", "**/migrate/**", "**/*.sql", "**/schema*"],
  },
];

/** One walk for the whole suite; the corpus does not change under it. */
const corpus = walkAllMarkdown();

async function load(relPath: string): Promise<CorpusFile> {
  const file = (await corpus).find((candidate) => candidate.relPath === relPath);
  if (file === undefined) {
    throw new Error(`${relPath}: not present under the corpus root`);
  }
  return file;
}

/** Every whitespace run collapsed, so a wrapped sentence still reads as one. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** The whole body, flattened. */
function flow(file: CorpusFile): string {
  return flatten(file.parsed.body);
}

/** The text of a top-level `## <heading>` section, up to the next top-level heading. */
function section(file: CorpusFile, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = file.parsed.body.indexOf(marker);
  expect(start, `${file.relPath}: no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const rest = file.parsed.body.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Prose lines long enough that an exact match across two files is a copy
 * rather than a coincidence. Short lines (headings, list scaffolding, a
 * one-word continuation) collide by construction and are excluded.
 */
function significantLines(body: string): Set<string> {
  return new Set(
    body
      .split(/\r?\n/)
      .map((line) => flatten(line).trim())
      .filter((line) => line.length >= 30),
  );
}

/** The catalog entry for a rule id, from the real corpus index. */
async function catalogItem(id: string): Promise<CatalogItem> {
  const index = await loadCorpusIndex();
  const item = index.items.find((candidate) => candidate.type === "rule" && candidate.id === id);
  if (item === undefined) {
    throw new Error(`rule ${id}: absent from the catalog index`);
  }
  return item;
}

describe("security rules — frontmatter contract", () => {
  it.each(RULES)("$id carries the rule identity head", async (rule) => {
    const file = await load(rule.relPath);

    expect(frontmatterField(file.parsed, "id")).toBe(rule.id);
    expect(filenameSlug(file.relPath)).toBe(rule.id);
    expect(frontmatterField(file.parsed, "type")).toBe("rule");
    expect(frontmatterField(file.parsed, "tags")).toEqual(rule.tags);

    const description = frontmatterField(file.parsed, "description");
    expect(typeof description).toBe("string");
    expect(String(description).length).toBeGreaterThan(0);
    expect(String(description).length).toBeLessThanOrEqual(1024);
    // Third person: a description addressing the reader is second person by construction.
    expect(String(description)).not.toMatch(/\b(?:you|your|yours|yourself)\b/i);

    // Rules load on context match. Only the charter may declare `always`.
    requireLoadClass(file, ["on-demand"]);
    requireObsoleteWhen(file);
  });

  it.each(RULES)("$id auto-attaches on a declared glob list", async (rule) => {
    const file = await load(rule.relPath);
    const scope = frontmatterField(file.parsed, "scope");
    const globs = frontmatterField(file.parsed, "globs");

    expect(RULE_SCOPES).toContain(scope);
    expect(scope).toBe("conditional");
    // `scope: always` is banned in rules — always-on content is the charter's.
    expect(scope).not.toBe("always");
    expect(globs).toEqual(rule.globs);
    expect(Array.isArray(globs) && globs.length > 0).toBe(true);
  });

  it.each(RULES)("$id authors globs as a YAML string array, not a bare CSV", async (rule) => {
    const file = await load(rule.relPath);

    // Edge case: the engine's `readGlobs` accepts a comma-separated string, so
    // a CSV rule still produces a companion and no runtime error — the defect
    // only shows up in review. Assert the authored shape at the source line.
    expect(frontmatterField(file.parsed, "globs")).not.toBeTypeOf("string");
    const line = file.raw.split(/\r?\n/).find((candidate) => candidate.startsWith("globs:"));
    expect(line, `${rule.relPath}: no top-level globs line`).toBeDefined();
    expect(line).toMatch(/^globs: \[".+"\]$/);
    for (const glob of rule.globs) {
      expect(line).toContain(`"${glob}"`);
    }
  });

  it("declares precedence only where the SoT marks a rule critical", async () => {
    // Justification for the shape change (assertions below are byte-identical):
    // the per-rule reads are independent — `load` resolves against the single
    // shared `corpus` walk and `catalogItem` against one `loadCorpusIndex()` —
    // so awaiting them one rule at a time bought no ordering and tripped
    // `no-await-in-loop`. Gather first, then assert synchronously, matching the
    // convention in the sibling corpus suites (e.g. commands/feedbackPair).
    const rows = await Promise.all(
      RULES.map(async (rule) => ({
        rule,
        file: await load(rule.relPath),
        item: await catalogItem(rule.id),
      })),
    );

    for (const { rule, file, item } of rows) {
      const declared = frontmatterField(file.parsed, "precedence");

      if (rule.precedence === undefined) {
        expect(declared).toBeUndefined();
        expect(item.precedence).toBeUndefined();
      } else {
        // The round trip that matters: authored value → catalog enum.
        expect(declared).toBe(rule.precedence);
        expect(item.precedence).toBe("critical");
      }
    }
  });
});

describe("security rules — Cursor companion projection", () => {
  it("emits glob arrays and alwaysApply: false for all four, with no warnings", async () => {
    const index = await loadCorpusIndex();
    // Scoped to this unit's four rules: a sibling unit's rule defect belongs to
    // that unit's suite, not to this one.
    const owned = index.items.filter(
      (item) => item.type === "rule" && RULES.some((rule) => rule.id === item.id),
    );
    expect(owned.map((item) => item.id).toSorted()).toEqual(RULES.map((rule) => rule.id).toSorted());

    const warnings: string[] = [];
    const companions = planMdcCompanions(owned, { warnings });

    expect(warnings).toEqual([]);
    expect(companions).toHaveLength(RULES.length);

    for (const rule of RULES) {
      const companion = companions.find((planned) =>
        planned.outputPath.endsWith(`stamity-${rule.id}.mdc`),
      );
      expect(companion, `${rule.relPath}: no planned companion`).toBeDefined();
      const content = companion?.content ?? "";
      expect(content).toContain("alwaysApply: false");
      expect(content).not.toContain("alwaysApply: true");
      expect(content).toContain(`globs: [${rule.globs.map((glob) => `"${glob}"`).join(", ")}]`);
      // Engine vocabulary stays engine-side: Cursor reads three keys, and a
      // leaked `precedence` line would be inert noise in every companion.
      expect(content).not.toContain("precedence:");
      expect(content).not.toContain("tags:");
    }
  });
});

describe("security rules — body budget and write-path hygiene", () => {
  it.each(RULES)("$id stays inside the rule body cap and scans clean", async (rule) => {
    const file = await load(rule.relPath);

    assertLineCap(file, RULE_BODY_CAP);
    assertDenyClean(file);
    expect(scanAntiSlop(file.parsed.body)).toEqual([]);
  });

  it.each(RULES)("$id opens with a title and carries Floor and Gates", async (rule) => {
    const file = await load(rule.relPath);

    expect(file.parsed.body.trimStart()).toMatch(/^# \S/);
    expect(section(file, "Floor").trim().length).toBeGreaterThan(0);
    expect(section(file, "Gates").trim().length).toBeGreaterThan(0);
  });

  it.each(RULES)("$id mints no URL or domain", async (rule) => {
    const body = (await load(rule.relPath)).parsed.body;

    expect(body).not.toMatch(/https?:\/\//);
    expect(body).not.toMatch(/\b[a-z0-9-]+\.(?:com|io|dev|ai|net|org|sh|app)\b/i);
  });

  it.each(RULES)("$id states floors without naming a vendor or product", async (rule) => {
    const body = (await load(rule.relPath)).parsed.body;

    // Standards bodies and header names are portable and stay; managed
    // services, engines, and libraries are pack material.
    expect(body).not.toMatch(VENDOR_NAMES);
  });

  it.each(RULES)("$id shares no prose line with the charter slab", async (rule) => {
    const charter = significantLines((await load("charter/stamity-charter.md")).parsed.body);
    const ruleLines = significantLines((await load(rule.relPath)).parsed.body);

    const shared = [...ruleLines].filter((line) => charter.has(line));
    expect(shared).toEqual([]);
  });
});

describe("security-patterns — the pattern-level floor", () => {
  it("puts validation at every trust boundary, with parsing over annotation", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    expect(text).toMatch(/every trust boundary parses into a declared shape/i);
    expect(text).toMatch(/allowlist of fields with types, length and range bounds/i);
    expect(text).toMatch(/unknown keys\s+rejected|unknown keys rejected/i);
    expect(text).toMatch(/a compile-time type is erased before the first byte arrives/i);
    // Uploads: content-derived type, not the caller's filename.
    expect(text).toMatch(/validated by content, not by name/i);
  });

  it("bans interpolation into an interpreter and matches encoding to the sink", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    expect(text).toMatch(/interpolating caller data into an interpreter is the defect/i);
    expect(text).toMatch(/bound parameters/i);
    expect(text).toMatch(/sub-processes take an argument array/i);
    expect(text).toMatch(/encoding matches the sink/i);
  });

  it("puts authorization server-side, per resource, per request", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    expect(text).toMatch(/authorization is checked server-side, per resource, per request/i);
    expect(text).toMatch(/an identifier in a path is an argument, never a grant/i);
    expect(text).toMatch(/anything\s+decided in the client is presentation/i);
  });

  it("fails closed and gates dangerous capabilities on an environment allowlist", async () => {
    const file = await load("rules/stamity-security-patterns.md");
    const text = flow(file);

    expect(text).toMatch(/an absent grant denies/i);
    expect(text).toMatch(/allowlist of named environments/i);
    // The named anti-pattern: the inverted check enables the capability
    // everywhere nobody thought to name.
    expect(text).toContain('`env !== "production"`');
    expect(text).toMatch(/a fresh container, a renamed stage, a misspelling/i);
    expect(flatten(section(file, "Gates"))).toMatch(/unrecognised environment value/i);
  });

  it("carries the auth floor row and routes deep protocol work out", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    expect(text).toMatch(/session identifiers rotate on login/i);
    expect(text).toMatch(/memory-hard hash/i);
    expect(text).toMatch(/second factor gates\s+privileged operations|second factor gates privileged operations/i);
    expect(text).toMatch(/rate-limited/i);
    expect(text).toMatch(/a replayed refresh revokes the whole\s+family|revokes the whole family/i);
    // Deep OAuth/DPoP/WebAuthn machinery is specialist material, not floor.
    expect(text).toMatch(/federation flows,\s+sender-constrained tokens, passkey ceremonies/i);
    expect(text).toMatch(/verify skill's security axis/i);
  });

  it("routes deep protocol work to the security specialist by id", async () => {
    const file = await load("rules/stamity-security-patterns.md");
    const text = flow(file);

    // The referent is real now: `security` is a shipped specialist with its own
    // trigger row, so the floor's hand-off names it rather than gesturing at
    // "specialist work" with nothing behind the phrase.
    const specialist = SPECIALIST_TRIGGER_TABLE.find((row) =>
      row.specialist.endsWith("security"),
    )?.specialist;
    expect(specialist, "the roster ships no security specialist row").toBeDefined();
    expect(text).toMatch(/`security` specialist/);

    // The pointer stays a pointer. A rule that re-states the specialist's own
    // contract gives one statement two owners and two drift paths — so the
    // specialist's exclusions, precision bar, and return contract stay out.
    for (const owned of [
      "false-positive rate",
      "kill switch",
      "resource-level authorization census",
      "trust-boundary map",
      "BLOCKED_AMBIGUITY",
    ]) {
      expect(text, `the rule restates specialist-owned material: ${owned}`).not.toContain(owned);
    }
    // And the floor it does own is still here, under its own cap.
    assertLineCap(file, RULE_BODY_CAP);
    expect(flatten(section(file, "Floor")).length).toBeGreaterThan(0);
  });

  it("folds the supply-chain floor in: lockfile, pinned steps, install scripts", async () => {
    const file = await load("rules/stamity-security-patterns.md");
    const text = flow(file);

    expect(text).toMatch(/the lockfile is committed and reviewed like source/i);
    expect(text).toMatch(/pinned to an\s+immutable revision, never a moving tag/i);
    expect(text).toMatch(/install script executes with the developer's privileges/i);
    expect(flatten(section(file, "Gates"))).toMatch(/pinned by digest/i);
  });

  it("uses OWASP category names as the finding vocabulary", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    expect(text).toContain("OWASP");
    for (const category of [
      "broken access control",
      "security\n   misconfiguration",
      "injection",
      "insecure design",
      "goal hijack",
      "tool misuse",
    ]) {
      expect(text).toContain(flatten(category));
    }
    expect(text).toMatch(/"this looks unsafe" arrives with none/i);
  });

  it("defers credential handling to the secrets rule instead of restating it", async () => {
    const text = flow(await load("rules/stamity-security-patterns.md"));

    // The duplication boundary between the two security rules, stated in the
    // body so a later edit does not re-import the secrets floor.
    expect(text).toMatch(/credential handling is the secrets rule's subject and is not restated/i);
  });
});

describe("secrets — critical rule that survives its own subject", () => {
  it("keeps nothing that authenticates in the repository, template excepted", async () => {
    const text = flow(await load("rules/stamity-secrets.md"));

    expect(text).toMatch(/nothing that authenticates is committed/i);
    expect(text).toMatch(/what is tracked is the template/i);
    expect(text).toMatch(/placeholder value and one\s+line saying which system issues it/i);
  });

  it("states the placeholder convention per client and the write-gate refusal", async () => {
    // TEST CHANGE, justified: this asserted `${env:VAR}` as the
    // convention. That token is ONE dialect's form out of five the emitter
    // writes (`src/mcp/emit.ts::envPlaceholder`), and the module header records
    // emitting it universally as a past bug — the wrong spelling produces a
    // config that loads and then hands the server the placeholder text. The
    // rule ships to every client, so the universal claim had to go; what
    // replaces it is the per-client statement plus the ban below.
    const file = await load("rules/stamity-secrets.md");
    const text = flow(file);

    expect(text).toMatch(/references carry the form the reading client documents/i);
    expect(text).toMatch(/there is no universal\s+placeholder syntax/i);
    expect(text).toMatch(/one of them expands nothing/i);
    expect(text).toMatch(/borrowed from a neighbouring client/i);
    // The engine owns the table; the rule points at it and reproduces no rows.
    expect(text).toMatch(/the emitter owns that\s+per-client table/i);
    expect(text).toMatch(/resolution happens at load time/i);
    expect(text).toMatch(/refused at the write gate rather than caught in review/i);

    // No dialect's literal token appears, in the body or in the projected
    // description — one spelling reprinted here IS the universal claim.
    for (const token of ["${env:", "${input:", "$COPILOT_MCP_"]) {
      expect(file.raw, `secrets restates one dialect's token: ${token}`).not.toContain(token);
    }
  });

  it("carries the ignored-and-masked posture for the credential env file", async () => {
    const text = flow(await load("rules/stamity-secrets.md"));

    // Mirrors the engine's env-mcp handling: the file the engine creates is
    // named literally (src/mcp/env.ts::ENV_MCP_FILE), git-ignored from the
    // change that creates it, and reported by name and shape, never by value.
    expect(text).toMatch(/the ignore entry lands before the first value does/i);
    expect(text).toContain("`.env.mcp`");
    expect(text).toContain("`.gitignore`");
    expect(text).toMatch(/adding the entry\s+afterwards leaves the value in history/i);
    expect(text).toMatch(/reports variable\s+names and value shapes/i);
    expect(text).toMatch(/the printer applies the mask/i);
  });

  it("demonstrates masking with a masked exemplar and no realistic literal", async () => {
    const file = await load("rules/stamity-secrets.md");

    // Edge case: a rule about credentials must teach without publishing one.
    expect(file.parsed.body).toContain("****");
    for (const { label, pattern } of CREDENTIAL_LITERALS) {
      expect(pattern.test(file.parsed.body), `secrets body contains a ${label}`).toBe(false);
    }
  });

  it("carries zero block-severity deny hits, credential shapes included", async () => {
    const file = await load("rules/stamity-secrets.md");

    // Asserted twice on purpose: the harness helper is the corpus-wide gate,
    // and the explicit scan names any offending pattern id in the failure.
    assertDenyClean(file);
    const hits = scanForDeniedPatterns(file.parsed.body, CONTENT_DENY_PATTERNS).filter(
      (hit) => hit.severity === "block",
    );
    expect(hits.map((hit) => hit.patternId)).toEqual([]);
    // The two patterns a credential-handling body trips first, named so a
    // regression reads as what it is rather than as a generic scan failure.
    const named = new Set(CONTENT_DENY_PATTERNS.map((pattern) => pattern.id));
    expect(named.has("inline-secret-assignment")).toBe(true);
    expect(named.has("hardcoded-credentials")).toBe(true);
  });

  it("keeps values write-only and out of every observable surface", async () => {
    const text = flow(await load("rules/stamity-secrets.md"));

    expect(text).toMatch(/values are write-only inside the process/i);
    expect(text).toMatch(/not in a response body, an error\s+message, a stack frame/i);
    expect(text).toMatch(/wrapper types override their string and JSON forms/i);
  });

  it("names the two write paths that scan, and what is left ungated", async () => {
    // TEST CHANGE, justified: this asserted the old item 5, which
    // claimed "learnings, handoffs, briefs, plans, and generated configuration"
    // are scanned on write, that entropy is computed, and that the refusal names
    // the field. Two of those five have no engine write path at all, the content
    // catalog computes no entropy (`src/denyscan/denyScan.ts` matches patterns),
    // and a refusal carries `patternId`. The rule now claims the two real gate
    // families and says plainly where nothing scans.
    const text = flow(await load("rules/stamity-secrets.md"));

    expect(text).toMatch(/two write paths refuse credential-shaped text/i);
    // Family one: engine-written state, matched against the content catalog.
    expect(text).toMatch(/a credential-shaped assignment\s+matches a named pattern/i);
    // Family two: env values bound for generated config, with the long-run
    // check gated on a credential-shaped variable name (CONTEXT_REQUIRED).
    expect(text).toMatch(/known\s+credential formats plus one long-run check/i);
    expect(text).toMatch(/fires only beside a\s+credential-shaped variable name/i);
    // The refusal shape: pattern id (and variable), never the field, never the span.
    expect(text).toMatch(/names what matched — the\s+pattern id/i);
    expect(text).toMatch(/the matched span left out of the message/i);
    // The honest gap: an agent's own writes reach no gate.
    expect(text).toMatch(/passes no engine\s+writer and is scanned by nothing/i);
    // The over-claim is gone.
    expect(text).not.toMatch(/learnings, handoffs, briefs, plans, and generated configuration/i);
    expect(text).not.toMatch(/high-entropy value in a credential-shaped position/i);
  });

  it("routes exposure to rotation with an ordered, auditable sequence", async () => {
    const file = await load("rules/stamity-secrets.md");
    const text = flow(file);

    expect(text).toMatch(/exposure opens a rotation, not a deletion/i);
    expect(text).toMatch(/rewriting history does not recall it/i);
    for (const step of [
      /issue the replacement/i,
      /deploy it to every consumer/i,
      /verify each consumer on\s+the new value/i,
      /revoke the old value/i,
      /review the access log/i,
    ]) {
      expect(text).toMatch(step);
    }
    expect(text).toMatch(/leaves a live credential in a public place/i);
    expect(flatten(section(file, "Gates"))).toMatch(/a closed exposure with no rotation record is not/i);
  });

  it("ranks scope and lifetime over storage, and denies the local hook control status", async () => {
    const text = flow(await load("rules/stamity-secrets.md"));

    expect(text).toMatch(/scope and lifetime beat storage location/i);
    expect(text).toMatch(/federated identity that mints a\s+per-run credential/i);
    expect(text).toMatch(/detection runs at three points/i);
    expect(text).toMatch(/never counts as the control/i);
  });
});

/**
 * The `floor:security` screening rule's PERIMETER claims, asserted here beside
 * the other security floors rather than in `protocol.test.ts` (which owns its
 * class table, its self-trip scan, and its do-not-echo posture). What lands
 * here is the set of statements about which paths a gate actually covers — the
 * ones a security floor is judged on, and the ones that were wrong.
 */
describe("injection-screening — the perimeter, stated as it holds", () => {
  const SCREENING = "rules/stamity-injection-screening.md";

  it("names exactly the directories `stamity validate` re-checks, and no others", async () => {
    // The rule promised `stamity validate` re-runs the write gates
    // "across the directory". The command's five sections are user content
    // (`overrides/`), user hooks, learnings, `.env.mcp` and `workspace.json`
    // (`src/cli/commands/validate.ts::collectReport`) — the rest of `.stamity/`
    // is not read by it at all.
    const gates = flatten(section(await load(SCREENING), "Gates"));

    expect(gates).toMatch(/`overrides\/`, the configured hooks directory, and `learnings\/`/);
    expect(gates).toMatch(/over\s*nothing else/i);
    expect(gates).toMatch(/never re-checked on demand/i);
    // The old absolute is gone.
    expect(gates).not.toMatch(/across the directory on demand/i);
  });

  it("says plainly that agent-authored state meets no write gate", async () => {
    // The other half: `inbox`, run notes, evidence and verification
    // records are written by agents with their own tools. No engine writer sees
    // them, and the session-start read pass walks `learnings/` and `handoffs/`
    // only (`src/hooks/scripts.ts`), so nothing screens them at any point.
    const floor = flatten(section(await load(SCREENING), "Floor"));

    expect(floor).toMatch(/most of it meets no gate/i);
    expect(floor).toMatch(/inbox`, run notes,\s*evidence, verification records/i);
    expect(floor).toMatch(/arrive unscreened/i);
    expect(floor).toMatch(/covers `learnings\/` and `handoffs\/` and\s*nothing else/i);
    expect(floor).toMatch(/for the rest, this floor is the gate/i);
  });

  it("describes the session-start screen as a subset and names the class it drops", async () => {
    // The rule said the read screen re-screens "the same catalogs". It
    // is a strict subset — the engine drops every row whose own source text
    // carries network vocabulary so the emitted script greps clean, and names
    // the cost at `src/hooks/scripts.ts` (NETWORK_VOCABULARY): exactly the
    // exfil-signal rows, which is the one class this rule defines for routing.
    const floor = flatten(section(await load(SCREENING), "Floor"));

    expect(floor).toMatch(/a subset of the write catalogs, not a mirror/i);
    expect(floor).toMatch(/exfil-signal rows/i);
    for (const patternId of [
      "`remote-exec-pipe`",
      "`send-data-external`",
      "`image-url-exfiltration`",
    ]) {
      expect(floor).toContain(patternId);
    }
    expect(floor).toContain("`hooks/scripts.ts`");
    expect(floor).toMatch(/on the session-start read it is not/i);
    // The un-named perimeter is gone.
    expect(floor).not.toMatch(/re-screens the\s*same catalogs/i);
  });

  it("promises the pattern id a skip actually carries, not a class id", async () => {
    // The five class ids are this rule's vocabulary and appear nowhere
    // in the engine. A screening skip carries `patternId`
    // (`src/learnings/store.ts::LoaderSkip`), so that is what a report can name.
    const file = await load(SCREENING);
    const text = flow(file);

    expect(text).toMatch(/classes explain a hit; the gate names a pattern/i);
    expect(text).toMatch(/the catalog carries pattern ids/i);
    expect(text).toMatch(/a refusal names the file and the pattern\s+id/i);
    expect(flatten(section(file, "Gates"))).toMatch(/names the file and the pattern id/i);
    // The unkeepable promise is gone from both the body and the description.
    expect(text).not.toMatch(/names the file and the class\b/i);
    expect(String(frontmatterField(file.parsed, "description"))).not.toMatch(
      /by file and class\b/i,
    );

    // The class table itself survives — it is the reading vocabulary.
    expect(file.parsed.body).toMatch(/^\| `instruction-override` \|/m);
  });

  it("carves the manifest out of the no-configuration absolute", async () => {
    // `.stamity/manifest.json` matches this rule's own `.stamity/**`
    // glob, and its keys DO configure gates — `learnings.maxCount` is the cap
    // the write gate enforces (and what `validate` tells an operator to raise),
    // `hooks.userHooksDir` is the directory the hooks gate reads, `models` sets
    // model classes. The absolute was false as written.
    const gates = flatten(section(await load(SCREENING), "Gates"));

    expect(gates).toMatch(/no field in the state text this\s*rule screens changes tool access/i);
    expect(gates).toMatch(/the manifest is the one file under this path that does configure\s*gates/i);
    expect(gates).toMatch(/the learnings cap, the hooks directory, the model classes/i);
    expect(gates).toMatch(/the operator's to edit/i);
    // The old unqualified sentence is gone.
    expect(gates).not.toMatch(/no field inside it changes tool\s*access/i);
  });
});

describe("the shipped floors state no universal placeholder syntax", () => {
  it("carries `${env:VAR}` in none of the five files this unit ships", async () => {
    // Asserted across the whole edited surface rather than in the
    // secrets suite alone: the token is one client's dialect, and an always-on
    // or floor artifact that prints it as THE form is wrong for four of five
    // emitted dialects. Frontmatter included — the description is projected
    // verbatim onto `docs/reference/rules.md`.
    const owned = [
      "charter/stamity-charter.md",
      "rules/stamity-secrets.md",
      "rules/stamity-injection-screening.md",
      "rules/stamity-learnings-schema.md",
      "rules/stamity-question-protocol.md",
    ];

    const files = await Promise.all(owned.map(async (relPath) => await load(relPath)));
    expect(files).toHaveLength(owned.length);
    for (const file of files) {
      expect(file.raw, `${file.relPath} reprints one dialect's placeholder`).not.toContain(
        "${env:",
      );
    }
  });
});

describe("api-versioning — problem details, lifecycle, idempotency", () => {
  it("fixes one error shape on RFC 9457 problem details", async () => {
    const file = await load("rules/stamity-api-versioning.md");
    const text = flow(file);

    expect(text).toContain("RFC 9457");
    expect(text).toContain("application/problem+json");
    expect(text).toMatch(/`type` is a stable identifier matched as an opaque\s+key/i);
    expect(text).toMatch(/every consumer carries two parsers/i);
    expect(flatten(section(file, "Gates"))).toMatch(/a bare string body or a bespoke error object is a finding/i);
  });

  it("keeps change additive inside a version and routes breaks to a new one", async () => {
    const text = flow(await load("rules/stamity-api-versioning.md"));

    expect(text).toMatch(/additive-first inside a version/i);
    expect(text).toMatch(/new enum values where consumers carry a declared unknown-value branch/i);
    expect(text).toMatch(/ship as a new\s+version with a retirement window on the old one/i);
    expect(text).toMatch(/an unpinned request resolves to the oldest\s+supported version/i);
  });

  it("runs the deprecation lifecycle on Deprecation and Sunset signalling", async () => {
    const file = await load("rules/stamity-api-versioning.md");
    const text = flow(file);

    expect(text).toMatch(/retirement runs announce, sunset, remove/i);
    expect(text).toContain("`Deprecation` header (RFC 9745)");
    expect(text).toContain("`Sunset` header (RFC 8594)");
    expect(text).toMatch(/two\s+consecutive measurement windows/i);
    expect(text).toMatch(/it is set when the deprecation opens, not on removal day/i);
    // Measured, not announced-and-forgotten: usage per consumer identity.
    expect(text).toMatch(/recorded per consumer identity from the announce date/i);
    expect(flatten(section(file, "Gates"))).toMatch(/a `Sunset` value in\s+the past/i);
  });

  it("requires Idempotency-Key on unsafe retriable operations", async () => {
    const file = await load("rules/stamity-api-versioning.md");
    const text = flow(file);

    expect(text).toContain("Idempotency-Key");
    expect(text).toMatch(/fingerprint of the request and the response it produced/i);
    expect(text).toMatch(/scoped per caller\s+rather than globally/i);
    expect(text).toMatch(/refused as a conflict/i);
    expect(text).toMatch(/retry-after answer rather than a second effect/i);
    expect(text).toMatch(/a server-minted key deduplicates nothing/i);
    expect(flatten(section(file, "Gates"))).toMatch(/sends one key twice and asserts a single effect/i);
  });

  it("catches breaking changes with a contract diff gate", async () => {
    const text = flow(await load("rules/stamity-api-versioning.md"));

    expect(text).toMatch(/caught by a diff, not by memory/i);
    expect(text).toMatch(/the contract is a\s+committed artifact/i);
    expect(text).toMatch(/fails on a breaking classification/i);
  });
});

describe("migrations — expand-contract, online DDL, verified backfill", () => {
  it("names the four phases and makes each independently deployable", async () => {
    const file = await load("rules/stamity-migrations.md");
    const text = flow(file);

    expect(text).toMatch(/four phases: expand, backfill, switch, contract/i);
    for (const phase of ["*Expand*", "*Backfill*", "*Switch*", "*Contract*"]) {
      expect(file.parsed.body).toContain(phase);
    }
    expect(text).toMatch(/each phase deploys on its own, leaves every gate green/i);
    expect(text).toMatch(/reversible without the phase that follows it/i);
    expect(text).toMatch(/a rename or a type change\s+performed in one step is the failure/i);
    // The switch phase's rollback is the flag, not a redeploy.
    expect(text).toMatch(/flipping\s+the flag back is the rollback/i);
  });

  it("requires the per-phase rollback plan before phase one ships", async () => {
    const file = await load("rules/stamity-migrations.md");
    const text = flow(file);

    expect(text).toMatch(/the reversal for each phase is written before phase one ships/i);
    expect(text).toMatch(/"restore from a backup" is the absence of a\s+plan/i);
    expect(flatten(section(file, "Gates"))).toMatch(/a phase that cannot state\s+one does not merge/i);
  });

  it("maps expand-contract onto a store with no schema, in one line", async () => {
    const text = flow(await load("rules/stamity-migrations.md"));

    // Edge case: the rule attaches on document stores too. The mapping is
    // stated at the serializer/reader level rather than left to inference.
    expect(text).toMatch(/a store without a schema is not exempt/i);
    expect(text).toMatch(/bind at the serializer and the reader/i);
    expect(text).toMatch(/the old field leaves the writer\s+before it leaves the reader/i);
  });

  it("bounds locks on hot tables instead of trusting the statement", async () => {
    const file = await load("rules/stamity-migrations.md");
    const text = flow(file);

    expect(text).toMatch(/bound the lock, or do not run the statement/i);
    expect(text).toMatch(/lock timeout and a statement timeout/i);
    expect(text).toMatch(/index creation uses the engine's concurrent path/i);
    expect(text).toMatch(/constraints\s+are added unvalidated and validated in a second pass/i);
    expect(text).toMatch(/online-change matrix/i);
    expect(flatten(section(file, "Gates"))).toMatch(/regardless of how small the table is today/i);
  });

  it("makes backfills batched, resumable, idempotent, throttled, observed", async () => {
    const file = await load("rules/stamity-migrations.md");
    const text = flow(file);

    expect(text).toMatch(/batched, resumable, idempotent, throttled, and observed/i);
    expect(text).toMatch(/by key range over a monotonic key, never by offset/i);
    expect(text).toMatch(/boundary persisted after each\s+committed batch/i);
    expect(text).toMatch(/re-running a partly-applied range converges to the same/i);
    expect(text).toMatch(/throttled on replication lag/i);
    expect(text).toMatch(/before the first batch\s+rather than during the incident/i);
    expect(flatten(section(file, "Gates"))).toMatch(/interrupts it mid-run, restarts it/i);
  });

  it("gates the destructive step on verified completion, not elapsed time", async () => {
    const file = await load("rules/stamity-migrations.md");
    const text = flow(file);

    expect(text).toMatch(/gated on verified completion, not elapsed time/i);
    expect(text).toMatch(/row-count parity per batch/i);
    expect(text).toMatch(/checksum over sampled blocks/i);
    expect(text).toMatch(/one full release cycle plus one on-call rotation/i);
    expect(flatten(section(file, "Gates"))).toMatch(
      /does not ship in the same change as the backfill that\s+feeds it/i,
    );
  });

  it("keeps migrations reversible by default and rehearsed on real-shaped data", async () => {
    const text = flow(await load("rules/stamity-migrations.md"));

    expect(text).toMatch(/reversible by default, one reviewed file per change/i);
    expect(text).toMatch(/explicit irreversibility note naming why/i);
    expect(text).toMatch(/runs against restored production-shaped data first/i);
    expect(text).toMatch(/predict\s+nothing about a table with a hundred million rows/i);
  });
});
