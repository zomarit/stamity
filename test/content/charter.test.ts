// The `__`-prefixed test seams keep the naming convention their module declares.
// oxlint-disable no-underscore-dangle
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHARTER_MAX_LINES,
  CHARTER_RELATIVE_PATH,
  readCharterTemplate,
} from "../../src/content/charter.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../src/content/contentRoot.ts";
import { scanAntiSlop, scanForDeniedPatterns } from "../../src/denyscan/denyScan.ts";
import {
  DETECTION_UNKNOWN,
  REPO_SUBSTITUTION_TOKENS,
  substituteRepoTokens,
  substituteVerificationGateTokens,
} from "../../src/emit/substitution.ts";
import { EngineError } from "../../src/types/errors.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The charter is the single `load: always` artifact, so this suite is both the
 * loader's contract and the corpus-invariant gate for the file itself: the
 * always-on budget, the substitution-token allowlist, the touchpoint index,
 * and the register bans (deny patterns, anti-slop, vendor/model names).
 */

/** Explicit corpus root — layout-deterministic, never the bundled-root probe. */
const CORPUS_ROOT = resolve(fileURLToPath(new URL("../../content", import.meta.url)));
const CHARTER_FILE = join(CORPUS_ROOT, "charter", "stamity-charter.md");

/** The nine SDLC touchpoints the charter must index, one line each. */
const TOUCHPOINT_COMMANDS = [
  "/stamity-spec",
  "/stamity-plan",
  "/stamity-work",
  "/stamity-board",
  "/stamity-ask",
  "/stamity-debug",
  "/stamity-quick",
  "/stamity-rework",
  "/stamity-pr-resolve",
] as const;

/** The four charter sections, in mandated order. */
const SECTION_HEADINGS = ["Repo facts", "Invariants", "Touchpoints", "Conditional layer"] as const;

/** Model-Independence Contract: shipped content names no vendors or models. */
const VENDOR_OR_MODEL_NAMES = /\b(?:claude|cursor|copilot|codex|anthropic|openai|gemini|gpt|llama|mistral)\b/i;

/** Content artifacts must not mint product URLs or domains. */
const URL_OR_DOMAIN = /https?:\/\/|www\./i;

/**
 * Occurrences of a command name as a whole name: the lookahead keeps
 * `/stamity-work` from also counting inside a longer `/stamity-work-*` spelling.
 */
function countOccurrences(text: string, name: string): number {
  return [...text.matchAll(new RegExp(`${name}(?![\\w-])`, "g"))].length;
}

/** The body of one `## `-level section (heading line included). */
function sectionOf(body: string, heading: string): string {
  // `### ` sub-headings do not match: the pattern requires exactly `## ` at line start.
  const sections = body.split(/^(?=## )/m);
  const found = sections.find((section) => section.startsWith(`## ${heading}`));
  if (found === undefined) throw new Error(`section "## ${heading}" not found in the charter body`);
  return found;
}

/**
 * A syntactically valid charter fixture with an exact physical line count.
 * The head is 8 lines, so `totalLines` also fixes the body's share — which is
 * what the over-cap case exploits: at 151 total the body alone is 143 lines,
 * under the cap, proving the budget binds the physical file, not the body.
 */
function charterFixture(totalLines: number, marker = "fixture body"): string {
  const head = [
    "---",
    "id: charter",
    "type: charter",
    "description: fixture charter",
    "tags: [orchestration]",
    "load: always",
    "obsolete_when: fixture trigger",
    "---",
  ];
  const bodyLines = totalLines - head.length;
  if (bodyLines < 1) throw new Error(`charterFixture: ${totalLines} leaves no room for a body`);
  const body = Array.from({ length: bodyLines }, (_, i) => `${marker} line ${i + 1}`);
  return `${[...head, ...body].join("\n")}\n`;
}

async function captureRejection(promise: Promise<unknown>): Promise<EngineError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return error as EngineError;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

describe("corpus charter", () => {
  it("loads within the always-on budget with load: always frontmatter", async () => {
    const charter = await readCharterTemplate(CORPUS_ROOT);

    expect(charter.lineCount).toBeLessThanOrEqual(CHARTER_MAX_LINES);
    expect(charter.relativePath).toBe(CHARTER_RELATIVE_PATH);
    expect(charter.frontmatter["load"]).toBe("always");
    expect(charter.frontmatter["id"]).toBe("charter");
    expect(charter.frontmatter["type"]).toBe("charter");
    expect(charter.frontmatter["description"]).toBeTypeOf("string");
    expect(charter.frontmatter["description"]).not.toBe("");
    expect(charter.frontmatter["obsolete_when"]).toBeTypeOf("string");
    expect(charter.frontmatter["obsolete_when"]).not.toBe("");
    expect(charter.frontmatter["tags"]).toEqual(["orchestration"]);
  });

  it("reports the physical file line count, frontmatter included", async () => {
    const [charter, raw] = await Promise.all([
      readCharterTemplate(CORPUS_ROOT),
      readFile(CHARTER_FILE, "utf8"),
    ]);

    const physical = raw.split(/\r?\n/).length - (raw.endsWith("\n") ? 1 : 0);
    expect(charter.lineCount).toBe(physical);
    // The body alone is strictly smaller: frontmatter spends budget.
    expect(charter.body.split(/\r?\n/).length).toBeLessThan(physical);
  });

  it("uses only wired substitution tokens — every token is in REPO_SUBSTITUTION_TOKENS", async () => {
    const { body } = await readCharterTemplate(CORPUS_ROOT);

    const tokens = [...body.matchAll(/\$\{STAMITY:[A-Z_]+\}/g)].map((match) => match[0]);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(REPO_SUBSTITUTION_TOKENS).toContain(token);
    }
    // No malformed token survives: every `${STAMITY:` opener is a well-formed match.
    expect(body.split("${STAMITY:").length - 1).toBe(tokens.length);
  });

  it("exercises all seven wired tokens, and full substitution leaves none behind", async () => {
    const { body } = await readCharterTemplate(CORPUS_ROOT);

    for (const token of REPO_SUBSTITUTION_TOKENS) {
      expect(body).toContain(token);
    }

    const rendered = substituteVerificationGateTokens(
      substituteRepoTokens(body, { linters: ["eslint"], testFrameworks: ["vitest"], ciProviders: ["gha"] }),
      { test: "npm test", lint: "npm run lint", typecheck: "npm run typecheck", all: "npm run check" },
    );
    expect(rendered).not.toContain("${STAMITY:");
    expect(rendered).toContain("`npm test`");
    expect(rendered).toContain("Linter: eslint");
  });

  it("renders sensibly when detection resolved to nothing", async () => {
    const { body } = await readCharterTemplate(CORPUS_ROOT);

    const rendered = substituteRepoTokens(body, { linters: [], testFrameworks: [], ciProviders: [] });
    expect(rendered).toContain(`Linter: ${DETECTION_UNKNOWN}`);
    expect(rendered).toContain(`Test framework: ${DETECTION_UNKNOWN}`);
    expect(rendered).toContain(`CI provider: ${DETECTION_UNKNOWN}`);
    // The template tells the reader how to interpret the literal sentinel.
    expect(body).toContain("`unknown`");
    expect(body).toContain("unconfigured");
  });

  it("carries the four charter sections in order", async () => {
    const { body } = await readCharterTemplate(CORPUS_ROOT);

    const positions = SECTION_HEADINGS.map((heading) => body.indexOf(`## ${heading}`));
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] ?? Number.NaN);
    }
  });

  it("indexes all 9 touchpoints exactly once each, inside the Touchpoints section", async () => {
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const touchpoints = sectionOf(body, "Touchpoints");

    for (const command of TOUCHPOINT_COMMANDS) {
      expect(countOccurrences(touchpoints, command), command).toBe(1);
      // The whole body carries no second mention outside the index.
      expect(countOccurrences(body, command), command).toBe(1);
    }
  });

  it("names the conditional layer's TWO attach shapes, with each one's honest cost", async () => {
    // Replaces an assertion that pinned `never "always applies"`. That claim
    // was false for the three `scope: agent-requested` rules the corpus ships:
    // a rule with no globs has nothing to match, and only a client with a
    // description-pull mode can defer it. Claude Code loads a `.claude/rules/`
    // file with no `paths:` "at launch with the same priority as
    // `.claude/CLAUDE.md`" (code.claude.com/docs/en/memory § "Organize rules
    // with `.claude/rules/`", accessed 2026-08-18), Copilot emits
    // `applyTo: "**"`, and Codex inlines rules into AGENTS.md — three of four
    // clients load them unconditionally. The charter is emitted into every
    // generated repo, so the sentence had to become true rather than tidy.
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const conditional = sectionOf(body, "Conditional layer");

    // The glob half keeps its attach semantics...
    expect(conditional).toContain("attaches when the agent reads");
    // ...and the description half is named as its own shape, with its cost.
    expect(conditional).toMatch(/description-scoped\s+rule declares no globs/i);
    expect(conditional).toMatch(/supports description-pull loads it on relevance/i);
    // The false claims are gone: the old blanket count and the old absolute.
    expect(conditional).not.toContain("Rules (12, glob-scoped)");
    expect(conditional).not.toContain(`never "always applies"`);
  });

  it("carries no artifact census — the emitted directories are the roster", async () => {
    // TEST CHANGE, justified: this replaces "counts each attach shape
    // as the corpus actually declares it", which derived `Rules (12)`,
    // `Glob-scoped (9)` and `Description-scoped (3)` from the corpus and
    // required the charter to reprint them. The behaviour moved: a count in an
    // always-on template is right only for a default install, because
    // deselection drops artifacts and an installed pack adds them into the same
    // projection — so every non-default repo shipped an always-on file whose
    // census was wrong, and nothing in the emitted repo could catch it. The
    // charter now points at what emitted instead of counting, and the
    // corpus-vs-charter parity this used to buy is gone by design, not by
    // omission. What is asserted here is the inverse: no census may come back.
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const conditional = sectionOf(body, "Conditional layer");

    // The corpus still has counts; the charter must not carry them.
    const rulesDir = join(CORPUS_ROOT, "rules");
    const files = (await readdir(rulesDir)).filter((name) => name.endsWith(".md"));
    expect(files.length).toBeGreaterThan(1);
    expect(conditional).not.toContain(`Rules (${files.length})`);

    // No parenthesised count against any class, and no enumerated roster.
    expect(conditional).not.toMatch(/\b(?:Rules|Skills|Glob-scoped|Description-scoped)\s*\(\d+/);
    expect(conditional).not.toMatch(/onboard, handoff, qa/);

    // What replaced them: read the emitted trees.
    expect(conditional).toMatch(/emitted rules directory is the\s+roster/i);
    expect(conditional).toContain("`.agents/skills/`");

    // `scope: always` is still banned in rules — the always-on layer is this file.
    const scopes = await Promise.all(
      files.map(async (name) => {
        const raw = await readFile(join(rulesDir, name), "utf8");
        return /^scope:\s*(\S+)/m.exec(raw)?.[1] ?? "";
      }),
    );
    expect(scopes.filter((scope) => scope === "always")).toEqual([]);
  });

  it("carries no Conventions block and no permanent placeholder row", async () => {
    // The block instructed a maintenance mechanism with no writer —
    // there is no learnings promotion, spec maintenance disclaims the charter,
    // and the emitted always-on file is a whole-file render with no managed
    // block anything could append to. Seven always-on lines that could only
    // ever say "None recorded yet." Deleted rather than left as a promise.
    const [{ body, lineCount }, raw] = await Promise.all([
      readCharterTemplate(CORPUS_ROOT),
      readFile(CHARTER_FILE, "utf8"),
    ]);

    expect(body).not.toMatch(/^#{2,3} Conventions\s*$/m);
    expect(raw).not.toContain("None recorded yet");
    expect(raw).not.toMatch(/learnings promotion/i);
    // The freed budget is not spent back into an over-cap file.
    expect(lineCount).toBeLessThanOrEqual(CHARTER_MAX_LINES);
  });

  it("states the ONE carve-out inside invariant 7 rather than leaving it to a command", async () => {
    // `/stamity-quick` declared a Tier-1 inline carve-out and credited
    // this file with granting it, while invariant 7 read exceptionless. A
    // session holding only the always-on slice classified quick's designed
    // behaviour as a protocol violation.
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const invariants = sectionOf(body, "Invariants");
    const seven = invariants.slice(invariants.indexOf("7. **Touchpoints delegate."));

    expect(seven).toMatch(/One carve-out, and only this one/i);
    expect(seven).toMatch(/Tier-1 small-change lane/i);
    expect(seven).toMatch(/applies its own edits inline and still delegates verification/i);
  });

  it("qualifies both claims that are false on a client without the primitive", async () => {
    // The charter is emitted byte-identically to all four clients, and
    // two of its universal claims do not hold on one of them — it takes no
    // project command surface, and it has no glob-scoped rule layer. The
    // qualification is un-substituted prose on purpose: a per-client token is
    // parked as rework, and no client is named in shipped content.
    const { body } = await readCharterTemplate(CORPUS_ROOT);

    const touchpoints = sectionOf(body, "Touchpoints");
    // TEST CHANGE, justified (strictly stronger): the old wording said a
    // client with no command surface "receives no command files, and there the
    // same nine are invoked by name" — which named the absence and then told
    // the reader to invoke the nine anyway, so a Codex user was promised nine
    // workflows and given a nine-line index. The claim now states the DELIVERED
    // difference and what to do instead of naming a touchpoint, and both halves
    // are asserted rather than the one.
    expect(touchpoints).toMatch(/receives no command file at all/i);
    expect(touchpoints).toMatch(/this index is all that ships/i);
    expect(touchpoints).toMatch(/ask there for the outcome in plain words/i);
    // The surface that DOES deliver them still says so, so the qualification
    // reads as a difference rather than as a blanket disclaimer.
    expect(touchpoints).toMatch(/invoked by name/i);

    const conditional = sectionOf(body, "Conditional layer");
    expect(conditional).toMatch(/client with no glob-rule layer/i);
    expect(conditional).toMatch(/inlined into the\s+always-on file/i);

    // Un-substituted: neither clause smuggles in a token the emitter must fill.
    expect(touchpoints).not.toContain("${STAMITY:");
    expect(conditional).not.toContain("${STAMITY:");
  });

  it("opens with the two attach shapes its own body goes on to describe", async () => {
    // The opening line said rules attach by file path, full stop, while
    // the conditional layer names a description-scoped shape as well.
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const opening = body.slice(0, body.indexOf("## Repo facts"));

    expect(opening).toMatch(/rules attach by file path or by description/i);
    expect(opening).not.toMatch(/rules attach by file path,\s+skills/i);
  });

  it("advertises only the board sources a mode can actually discover", async () => {
    // The index advertised a fourth kind — an auto-found file — that no
    // mode discovers and no detector looks for. The command's own description
    // names three, so the always-on file was the only surface over-promising.
    const { body } = await readCharterTemplate(CORPUS_ROOT);
    const touchpoints = sectionOf(body, "Touchpoints");
    const boardLine = touchpoints.slice(touchpoints.indexOf("`/stamity-board`"));

    expect(boardLine).not.toMatch(/auto-found/i);
    expect(boardLine).toMatch(/chat, a referenced file, or a linked\s+platform board/i);
  });

  it("cross-file: quick cites invariant 7 instead of asserting its own carve-out", async () => {
    // The other half of the quick-command carve-out. Two files, one statement: the
    // charter grants the exception and the command points at it, so a reader
    // holding either one reaches the same rule.
    const quick = await readFile(join(CORPUS_ROOT, "commands", "stamity-quick.md"), "utf8");

    expect(quick).toMatch(/Charter invariant 7 names one carve-out/i);
    // The old self-grant is gone: quick no longer declares the exception itself.
    expect(quick).not.toMatch(/One carve-out from the charter's/i);
    // And the behaviour it describes is unchanged.
    expect(quick).toMatch(/Tier-1 edits\s+apply inline\. Verification does not/i);
  });

  it("passes the register gates: no deny patterns, no anti-slop, no vendors, no URLs", async () => {
    const raw = await readFile(CHARTER_FILE, "utf8");

    const blocked = scanForDeniedPatterns(raw).filter((hit) => hit.severity === "block");
    expect(blocked).toEqual([]);
    expect(scanAntiSlop(raw)).toEqual([]);
    expect(raw).not.toMatch(VENDOR_OR_MODEL_NAMES);
    expect(raw).not.toMatch(URL_OR_DOMAIN);
  });
});

describe("readCharterTemplate", () => {
  const getTemp = useTempDir("charter");

  afterEach(() => {
    __resetContentRootCacheForTests();
  });

  it("throws VALIDATION_ERROR naming the probed path when the charter is absent", async () => {
    const temp = getTemp();

    const error = await captureRejection(readCharterTemplate(temp.dir));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.exitCode).toBe(1);
    expect(error.message).toContain(join(temp.dir, "charter", "stamity-charter.md"));
  });

  it("treats a directory squatting on the charter path as absent", async () => {
    const temp = getTemp();
    // Seeding a file below the charter path makes `stamity-charter.md` a directory (EISDIR).
    await temp.seedFiles({ "charter/stamity-charter.md/oops.md": "not a charter\n" });

    const error = await captureRejection(readCharterTemplate(temp.dir));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(join(temp.dir, "charter", "stamity-charter.md"));
  });

  it("throws VALIDATION_ERROR naming the cap for an over-cap file — physical lines, not body lines", async () => {
    const temp = getTemp();
    // 151 physical lines total; the body alone is 143 (< 150). Only whole-file
    // counting rejects this fixture — body-only counting would accept it.
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: charterFixture(CHARTER_MAX_LINES + 1) });

    const error = await captureRejection(readCharterTemplate(temp.dir));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.exitCode).toBe(1);
    expect(error.message).toContain(String(CHARTER_MAX_LINES));
    expect(error.message).toContain(String(CHARTER_MAX_LINES + 1));
  });

  it("accepts a file exactly at the cap", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: charterFixture(CHARTER_MAX_LINES) });

    const charter = await readCharterTemplate(temp.dir);

    expect(charter.lineCount).toBe(CHARTER_MAX_LINES);
    expect(charter.frontmatter["load"]).toBe("always");
  });

  it("counts a final line without a trailing newline", async () => {
    const temp = getTemp();
    const withTrailing = charterFixture(12);
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: withTrailing });
    expect((await readCharterTemplate(temp.dir)).lineCount).toBe(12);

    // Same content minus the final newline: still 12 physical lines.
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: withTrailing.slice(0, -1) });
    expect((await readCharterTemplate(temp.dir)).lineCount).toBe(12);
  });

  it("propagates a malformed YAML head as VALIDATION_ERROR naming the file", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: "---\nid: [unclosed\n---\nbody\n" });

    const error = await captureRejection(readCharterTemplate(temp.dir));

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(join(temp.dir, "charter", "stamity-charter.md"));
  });

  it("re-reads on every call instead of caching", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: charterFixture(20, "state one") });
    const first = await readCharterTemplate(temp.dir);
    expect(first.lineCount).toBe(20);
    expect(first.body).toContain("state one");

    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: charterFixture(25, "state two") });
    const second = await readCharterTemplate(temp.dir);

    expect(second.lineCount).toBe(25);
    expect(second.body).toContain("state two");
    expect(second.body).not.toContain("state one");
  });

  it("defaults the content root to the bundled-corpus resolution", async () => {
    const temp = getTemp();
    await temp.seedFiles({ [CHARTER_RELATIVE_PATH]: charterFixture(15, "pinned root") });
    __setContentRootForTests(temp.dir);

    const charter = await readCharterTemplate();

    expect(charter.body).toContain("pinned root");
    expect(charter.relativePath).toBe(CHARTER_RELATIVE_PATH);
  });
});
