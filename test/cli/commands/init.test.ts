import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../../src/cli/commands/init.ts";
import { planSync } from "../../../src/cli/commands/sync/engine.ts";
import { runCli, type CommandIo } from "../../../src/cli/kit/program.ts";
import type { TerminalFacts } from "../../../src/cli/kit/terminal.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { readManifest } from "../../../src/manifest/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess, type InProcessResult } from "../../support/inProcess.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Command-layer suite for `stamity init`, run through the in-process CLI funnel
 * against real temp repos: the prompt gates (TTY / -y / --json), the two-prompt
 * ceiling, the migration moment, the disclosure panel, the dry-run report, and
 * the exit codes are all asserted through the same seams production uses — no
 * mocks, including the emission planner: `beforeEach` seeds a minimal
 * charter-bearing corpus at the pinned content root, so every run drives the
 * real composed planner end to end and actually writes files.
 *
 * Test-premise update (adapter phase): this suite used to pin an ABSENT corpus
 * and lean on the no-op planner's empty output. That premise died with the
 * seam flip — core emission requires a charter (`src/content/charter.ts`: "a
 * corpus without it cannot emit a setup"), so an absent corpus is now a broken
 * install, not a state a user reaches. The corpus is seeded rather than mocked
 * away to keep the no-mocks property; it stays minimal (charter only) so the
 * emitted set is small and the assertions here remain about init's UX seams,
 * not adapter content.
 *
 * Reserved-name indirection: this file sits OUTSIDE the leak gate's
 * migration allowlist (`scripts/leak-gate.mjs` exempts only
 * `src/migration/` and `test/migration/`), so the predecessor's on-disk names
 * are assembled from fragments at runtime — the gate's own technique — and the
 * literal never appears in these bytes. The fixtures only need the two spellings
 * the detection module scans for: the state-directory name and the marker token.
 *
 * Question counting: every question the prompt kit writes ends its ask with
 * `]: ` (textInput renders `[default]: `, selectOne renders `[n]: `), and no
 * other init output — panel, notes, dry-run report, JSON envelope, failure
 * rendering — contains that suffix. Counting it in the transcript therefore IS
 * the structural prompt count, a spy on the prompt output without reaching into
 * the kit.
 */

const getTemp = useTempDir("init-cmd");

/** Minimal viable corpus: the charter is the only artifact core emission requires. */
const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Test Charter",
  "",
  "Charter guidance body.",
  "",
].join("\n");

beforeEach(async () => {
  // Sibling of the `repo/` root, so the fixture corpus never lands inside the
  // repo under test; the pin also keeps a dev checkout's real bundled content
  // out of the fixtures.
  __setContentRootForTests(getTemp().path("corpus"));
  await getTemp().seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

// ── Predecessor fixtures (fragment-assembled) ──────────────────────

const PRED_NAME = ["hat", "ch3r"].join("");
const PRED_STATE_DIR = `.${PRED_NAME}`;
const PRED_MARKER = PRED_NAME.toUpperCase();

/** A representative generation-3 predecessor manifest, offered as defaults. */
const PRED_MANIFEST = `${JSON.stringify(
  {
    version: "3.0.0",
    tools: ["claude", "cursor"],
    maturity: "team",
    content: { teamSize: "team" },
    mcp: { servers: ["github"] },
  },
  null,
  2,
)}\n`;

/** An instruction file with user prose around one stamped managed block. */
const MARKED_DOC = [
  "# Project notes",
  "",
  "user prose stays",
  "",
  `<!-- ${PRED_MARKER}:BEGIN v2.8.6 -->`,
  "old generated guidance",
  `<!-- ${PRED_MARKER}:END -->`,
  "",
].join("\n");

// ── Helpers ────────────────────────────────────────────────────────

/** A repo root inside the current test's temp dir. */
async function makeRepo(sub = "repo"): Promise<string> {
  const root = getTemp().path(sub);
  await mkdir(root, { recursive: true });
  return root;
}

/** A predecessor file holding NOTHING but a generated block — the input whose
 *  strip outcome is `deleted` rather than `stripped`. */
const BLOCK_ONLY_DOC = [
  `<!-- ${PRED_MARKER}:BEGIN v2.8.6 -->`,
  "old generated guidance",
  `<!-- ${PRED_MARKER}:END -->`,
  "",
].join("\n");

/** Seeds a predecessor setup under `repo/`: state dir + manifest + credential
 *  file, optionally a marked `CLAUDE.md` (also a tool trace, so the tools
 *  prompt auto-skips), a plain cross-tool `AGENTS.md`, and a block-only
 *  `GEMINI.md` whose strip outcome is a deletion. */
async function seedPredecessorRepo(
  opts?: {
    markedClaudeFile?: boolean;
    agentsFile?: boolean;
    blockOnlyFile?: boolean;
  },
  sub = "repo",
): Promise<string> {
  const files: Record<string, string> = {
    [`${sub}/${PRED_STATE_DIR}/hatch.json`]: PRED_MANIFEST,
    [`${sub}/.env.mcp`]: "GITHUB_TOKEN=\n",
  };
  if (opts?.markedClaudeFile === true) files[`${sub}/CLAUDE.md`] = MARKED_DOC;
  if (opts?.agentsFile === true) files[`${sub}/AGENTS.md`] = "# my agent notes\n";
  if (opts?.blockOnlyFile === true) files[`${sub}/GEMINI.md`] = BLOCK_ONLY_DOC;
  await getTemp().seedFiles(files);
  return makeRepo(sub);
}

function runInit(
  root: string,
  argv: readonly string[] = [],
  opts: { stdinLines?: readonly string[]; ttyStdin?: boolean } = {},
): Promise<InProcessResult> {
  return runInProcess([initCommand], ["init", ...argv], {
    cwd: root,
    ...(opts.stdinLines !== undefined ? { stdinLines: opts.stdinLines } : {}),
    ...(opts.ttyStdin === true ? { tty: { stdin: true } } : {}),
  });
}

/** See the module header: `]: ` closes exactly one kit question and nothing else. */
function countQuestions(stdout: string): number {
  return stdout.split("]: ").length - 1;
}

/**
 * Yes/no confirmations, which {@link countQuestions} cannot see — the kit
 * renders them with a `[Y/n]` suffix rather than the `]: ` one the decision
 * prompts use.
 *
 * Counted separately on purpose. The two-prompt ceiling is about
 * DECISIONS init would otherwise take on the operator's behalf; the
 * no-repository gate is a consent-to-write confirmation on a path where the
 * write has no revert, the sibling of `clean`'s destructive confirm. Keeping it
 * out of the ceiling is a judgement, so it is asserted rather than invisible.
 */
function countConfirmations(stdout: string): number {
  return stdout.split(/\[[Yy]\/[Nn]\] /).length - 1;
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

// ── Fresh repo ─────────────────────────────────────────────────────

describe("init — fresh repo", () => {
  it("TTY with no flags: exactly one prompt fires (tools) and Enter accepts claude", async () => {
    const root = await makeRepo();

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: [""] });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(1);
    expect(result.stdout).toContain("Which tools?");
    expect(result.stdout).toContain("stamity is ready.");
    expect((await readManifest(root))?.tools).toEqual(["claude"]);
    expect(existsSync(join(root, STATE_DIR))).toBe(true);
  });

  it("a detected tool trace auto-skips the tools prompt: zero questions, the disclosure covers it", async () => {
    await getTemp().seedFiles({ "repo/.claude/settings.json": "{}\n" });
    const root = await makeRepo();

    const result = await runInit(root, [], { ttyStdin: true });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(0);
    expect(result.stdout).toContain("claude traces");
    expect(result.stdout).toContain("installed claude");
    // Changed expectation (not a weakening): the disclosure line now
    // carries the maturity tier alongside the change instruction, so the
    // parenthetical it asserts grew a leading `tier: …` field. The claim is
    // strictly stronger — the tier is asserted as well as the hint.
    expect(result.stdout).toContain("(tier: solo, change with `stamity config`)");
  });

  it("-y with zero traces: no prompts, claude default, panel printed", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["-y"], { ttyStdin: true });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(0);
    expect(result.stdout).toContain("detected a fresh repo (no traces)");
    expect(result.stdout).toContain("installed claude");
    expect(result.stdout).toContain("stamity is ready.");
    expect((await readManifest(root))?.tools).toEqual(["claude"]);
  });

  it("-y on a clean fixture writes state, manifest and gitignore, and prints no stack block", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["-y"]);

    // First-run bar: `-y` succeeds unattended, and the writes it
    // makes are unchanged by the panel rework.
    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(0);
    expect(existsSync(join(root, STATE_DIR))).toBe(true);
    expect(await readManifest(root)).not.toBeNull();
    // The credential file is the entry init guarantees; the state dir is
    // committed on purpose, so it is not one.
    expect(await readFile(join(root, ".gitignore"), "utf8")).toContain(".env.mcp");
    // The edit is DISCLOSED too. This repo has no predecessor and no
    // MCP server, which is the ordinary case the disclosure never reached —
    // init edited a file the operator owns and said nothing about it.
    expect(result.stdout).toContain("security:");
    expect(result.stdout).toContain(".env.mcp — was added to your .gitignore");
    // The credential hint stays conditional: no server, nothing to load.
    expect(result.stdout).not.toContain("credentials:");
    // Nothing detected means nothing uncovered to disclose: no block at all.
    expect(result.stdout).not.toContain("detected stacks with no dedicated guidance");
  });

  it("prints the stack-suggestion block for a detected stack, above the next steps", async () => {
    await getTemp().seedFiles({
      "repo/package.json": `${JSON.stringify({ dependencies: { next: "15.0.0" } })}\n`,
      "repo/index.ts": "export const x = 1;\n",
    });
    const root = await makeRepo();

    const result = await runInit(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("detected stacks with no dedicated guidance yet:");
    expect(result.stdout).toContain("next (framework)");
    // Suggestions, never an install instruction while the pack catalog is empty.
    const block = result.stdout.slice(
      result.stdout.indexOf("detected stacks with no dedicated"),
      result.stdout.indexOf("next steps:"),
    );
    expect(block.toLowerCase()).not.toContain("install");
    expect(result.stdout.indexOf("detected stacks")).toBeLessThan(
      result.stdout.indexOf("next steps:"),
    );
  });

  it("non-TTY without -y: prompts auto-default and the run succeeds piped (npx-first bar)", async () => {
    const root = await makeRepo();

    const result = await runInit(root);

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(0);
    expect(result.stdout).toContain("stamity is ready.");
    expect(await readManifest(root)).not.toBeNull();
  });
});

// ── --tools flag ───────────────────────────────────────────────────

describe("init — --tools flag", () => {
  it("parses a spaced CSV: --tools 'claude, codex' targets both", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude, codex", "-y"]);

    expect(result.code).toBe(0);
    expect((await readManifest(root))?.tools).toEqual(["claude", "codex"]);
    expect(result.stdout).toContain("next steps (claude):");
    expect(result.stdout).toContain("next steps (codex):");
  });

  it("--tools bogus exits 1 listing the valid tools, before any prompt", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "bogus"], { ttyStdin: true });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Valid tools: claude, cursor, copilot, codex");
    expect(countQuestions(result.stdout)).toBe(0);
    expect(existsSync(join(root, STATE_DIR))).toBe(false);
  });
});

// ── Existing-config moment: import variant ─────────────────────────

describe("init — existing-config moment (import variant)", () => {
  it("AGENTS.md brownfield: the import question fires with supplement as its default", async () => {
    await getTemp().seedFiles({ "repo/AGENTS.md": "# my agent notes\n" });
    const root = await makeRepo();

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: ["", ""] });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Existing agent config found (AGENTS.md). Import it?");
    // Tools confirm + import moment — the ceiling, not beyond it.
    expect(countQuestions(result.stdout)).toBe(2);
    expect(result.stdout).toContain("(supplement)");
    expect(result.stdout).toContain("merged in as a STAMITY:BEGIN/END block");
    // TEST CHANGE, justified: a FIRST adoption is not a repair. The
    // engine met this operator's hand-written AGENTS.md for the first time and
    // added its markers around new content, preserving every existing byte —
    // reported as a yellow "warning: Restored the managed block …" four lines
    // under a success line saying the file "was kept — merged". It is now an
    // info-classed notice naming the repo-relative path, and "Restored" is kept
    // for the case it describes: a file the ledger already owns whose markers
    // went missing.
    expect(result.stdout).not.toContain("warning: Restored the managed block");
    expect(result.stdout).toContain("adopted AGENTS.md:");
    expect(result.stdout).not.toContain(`adopted ${join(root, "AGENTS.md")}`);

    // ASSERTION ADDED: the choice is EXECUTED, not merely recorded. The old
    // pair of copy assertions passed while AGENTS.md was skipped whole-file and
    // the charter — the always-loaded core of the setup — never landed at all.
    const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("# my agent notes");
    expect(agentsMd).toContain("STAMITY:BEGIN");
    expect(agentsMd).toContain("Charter guidance body.");

    const manifest = await readManifest(root);
    // Shape change, not a weakening: the manifest persists one
    // decision PER pre-existing file. This repo carries one, so the list holds
    // one — the same fact the singular assertion made, stated in the shape
    // that can also express the two-file repo below.
    expect(manifest?.importChoice).toEqual([{ path: "AGENTS.md", mode: "supplement" }]);
    expect(manifest?.ledger.some((row) => row.path === "AGENTS.md")).toBe(true);
  });

  it("--import-config replace skips the question and reports the disposition the write produced", async () => {
    await getTemp().seedFiles({ "repo/AGENTS.md": "# my agent notes\n" });
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude", "--import-config", "replace"], {
      ttyStdin: true,
    });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(0);
    // Changed string (strictly stronger): the note used to assert a
    // completed replacement and a verified `.bak` from the CHOICE alone, so it
    // read identically whether the write landed or the engine refused it. It is
    // read off the merge result now, and `was replaced` is that result — which
    // is only assertable because the bytes below prove the same thing.
    expect(result.stdout).toContain("AGENTS.md was replaced");
    expect(result.stdout).toContain("(replace)");

    // ASSERTION ADDED: replace executes — generated bytes at the path, the
    // user's file recoverable from a .bak the warning names.
    const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("Charter guidance body.");
    expect(agentsMd).not.toContain("# my agent notes");
    expect(result.stdout).toMatch(/Your previous file is at .*AGENTS\.md\.bak/);
    await expect(readFile(join(root, "AGENTS.md.bak"), "utf8")).resolves.toBe("# my agent notes\n");
  });

  it("--import-config skip leaves the file alone and claims no ownership of it", async () => {
    await getTemp().seedFiles({ "repo/AGENTS.md": "# my agent notes\n" });
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude", "--import-config", "skip"], {
      ttyStdin: true,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing is generated at that path");
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toBe("# my agent notes\n");

    // Suppression is total: no bytes AND no ledger row, so the next sync sees a
    // path the engine does not emit rather than an unowned collision to refuse.
    const manifest = await readManifest(root);
    expect(manifest?.importChoice).toEqual([{ path: "AGENTS.md", mode: "skip" }]);
    expect(manifest?.ledger.some((row) => row.path === "AGENTS.md")).toBe(false);
  });

  // ── Two detected files: one question, every path decided ───────────
  //
  // The regression these three cases close: init detected every pre-existing
  // instruction file, asked about `existingConfigPaths[0]`, and persisted that
  // ONE record — so an operator with `AGENTS.md` and `CLAUDE.md` who answered
  // `skip` got `skip` at the first and an unasked-for managed block prepended
  // to the second. The consent record now covers every path the one answer
  // reaches, which is what makes the answer honest rather than partial.

  it("two detected config files: the ONE answer is applied to BOTH, and neither is claimed", async () => {
    await getTemp().seedFiles({
      "repo/AGENTS.md": "# my agent notes\n",
      "repo/CLAUDE.md": "# my claude notes\n",
    });
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude", "--import-config", "skip"], {
      ttyStdin: true,
    });

    expect(result.code).toBe(0);

    // Two decisions, in detection order — the cross-tool file first, then the
    // detected tool's own. One record per path is the whole fix.
    const manifest = await readManifest(root);
    expect(manifest?.importChoice).toEqual([
      { path: "AGENTS.md", mode: "skip" },
      { path: "CLAUDE.md", mode: "skip" },
    ]);

    // Executed, not merely recorded: `skip` means untouched bytes AND no
    // ownership claim at BOTH paths. The second row is the one that used to be
    // emitted anyway, with a STAMITY block prepended and a mutation warning.
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toBe("# my agent notes\n");
    await expect(readFile(join(root, "CLAUDE.md"), "utf8")).resolves.toBe("# my claude notes\n");
    expect(manifest?.ledger.some((row) => row.path === "AGENTS.md")).toBe(false);
    expect(manifest?.ledger.some((row) => row.path === "CLAUDE.md")).toBe(false);

    // Both paths are disclosed, not just the one that was asked about.
    expect(result.stdout).toContain("existing config: AGENTS.md is left alone");
    expect(result.stdout).toContain("existing config: CLAUDE.md is left alone");
  });

  it("two detected config files: still exactly ONE question, and it names both", async () => {
    // The prompt budget is what makes this fix free of an AD conflict: the
    // decision widened from one path to every path WITHOUT widening the ask.
    // A second question here would be the regression in the other direction.
    await getTemp().seedFiles({
      "repo/AGENTS.md": "# my agent notes\n",
      "repo/CLAUDE.md": "# my claude notes\n",
    });
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude"], {
      ttyStdin: true,
      stdinLines: [""],
    });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(1);
    // Naming both is part of the consent: an ask that named one file while
    // deciding two would be collecting consent it does not then honour.
    expect(result.stdout).toContain(
      "Existing agent config found (AGENTS.md, CLAUDE.md). Import them?",
    );

    // Enter takes the default (supplement) — for both.
    expect((await readManifest(root))?.importChoice).toEqual([
      { path: "AGENTS.md", mode: "supplement" },
      { path: "CLAUDE.md", mode: "supplement" },
    ]);
  });

  it("two detected config files under replace: every decided path is a replace target", async () => {
    // `replace` executes in the WRITE lane rather than the plan, so it carries
    // the same second-path hazard in its own half: `apply.ts` reads the replace
    // targets out of the decision list, and a single target (a `find` over the
    // list) would force the first file and leave the second to the ordinary
    // unforced write. The read is a SET over every replace-mode decision.
    //
    // Scope of the assertion, stated so a later reader does not mistake it for
    // a full replace contract: the FORCED-overwrite outcome (verified `.bak`,
    // generated bytes over the user's) is observable only where the emitted row
    // is not itself a managed block. `AGENTS.md` is such a row and is asserted
    // below; `CLAUDE.md`'s row IS a managed block, so its write goes down the
    // merge lane and preserves the operator's bytes whatever `force` says —
    // which is a property of the write lane, not of the decision reaching it.
    await getTemp().seedFiles({
      "repo/AGENTS.md": "# my agent notes\n",
      "repo/CLAUDE.md": "# my claude notes\n",
    });
    const root = await makeRepo();

    const result = await runInit(root, ["--tools", "claude", "--import-config", "replace"], {
      ttyStdin: true,
    });

    expect(result.code).toBe(0);
    // Both paths carry the replace decision — the input the write lane reads.
    expect((await readManifest(root))?.importChoice).toEqual([
      { path: "AGENTS.md", mode: "replace" },
      { path: "CLAUDE.md", mode: "replace" },
    ]);
    // And the path where forcing is observable was forced: verified `.bak`
    // first, generated bytes after.
    await expect(readFile(join(root, "AGENTS.md.bak"), "utf8")).resolves.toBe("# my agent notes\n");
    const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("Charter guidance body.");
    expect(agentsMd).not.toContain("# my agent notes");
    // Disclosed per path, both of them.
    expect(result.stdout).toContain("existing config: AGENTS.md");
    expect(result.stdout).toContain("existing config: CLAUDE.md");
  });
});

// ── Migration moment: predecessor variant ──────────────────────────

describe("init — migration moment (predecessor variant)", () => {
  it("predecessor state: the migrate question fires; Enter takes full and the carry reaches the panel", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: [""] });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Previous setup detected (predecessor state dir). Migrate it?");
    // The marked CLAUDE.md is also a claude trace, so the tools prompt
    // auto-skipped — the migrate moment is the run's only question.
    expect(countQuestions(result.stdout)).toBe(1);
    expect(result.stdout).toContain("migrated:");
    expect(result.stdout).toContain("learning(s) carried");
    expect(result.stdout).toContain("1 file(s) stripped of old managed blocks");
    expect(result.stdout).toContain(".env.mcp carried");
    // "Import config as defaults": the predecessor's tools become the targets.
    expect((await readManifest(root))?.tools).toEqual(["claude", "cursor"]);
    expect(result.stdout).toContain("next steps (cursor):");
    // mcp servers rode the defaults in, so the credential disclosure shows.
    expect(result.stdout).toContain("security:");
    expect(result.stdout).toContain("github");
    // The strip kept the user's prose and removed the block.
    const after = await readFile(join(root, "CLAUDE.md"), "utf8");
    expect(after).toContain("user prose stays");
    expect(after).not.toContain(PRED_MARKER);
  });

  /**
   * REPLACES "-y takes the full default silently" (critical).
   *
   * That test pinned the defect: it asserted that `-y` performed a FULL
   * migration — stripping the predecessor's managed blocks and deleting a file
   * that held nothing else — with zero questions asked and no flag requesting
   * it. Every non-TTY invocation reached the same branch: CI, a pipe, `-y`,
   * `--json`. The premise it encoded ("the non-interactive default is whatever
   * the prompt's default is") is exactly what the fix rejects for this one
   * prompt, so the test cannot be adjusted — it is inverted, and its old claim
   * is now the thing the suite forbids. The `--migrate full` case below keeps
   * the full path covered on the one route that still reaches it.
   */
  it.each([
    ["-y", ["-y"] as const],
    ["--json", ["--json"] as const],
    ["a piped, non-TTY run", [] as const],
  ])(
    "%s performs NO migration: the predecessor's files are all still there",
    async (_label, argv) => {
      const root = await seedPredecessorRepo({ markedClaudeFile: true });

      const result = await runInit(root, [...argv], { ttyStdin: argv.length > 0 });

      expect(result.code).toBe(0);
      expect(countQuestions(result.stdout)).toBe(0);
      // Every predecessor byte survives: the block, its marker, the state dir,
      // the credential file. A strip would have removed the first two.
      const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8");
      expect(claudeMd).toContain(MARKED_DOC.trim());
      expect(claudeMd).toContain(`<!-- ${PRED_MARKER}:BEGIN v2.8.6 -->`);
      expect(existsSync(join(root, PRED_STATE_DIR))).toBe(true);
      // No config was imported either, so the predecessor's tools did NOT win.
      expect((await readManifest(root))?.tools).toEqual(["claude"]);
    },
  );

  it("names the skip and its reason on a non-interactive run, rather than saying nothing", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, ["-y"], { ttyStdin: true });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("migrate: skip");
    // The path is named — "the previous setup" told an operator nothing they
    // could act on — and so is the reason it was not migrated.
    expect(result.stdout).toContain(PRED_STATE_DIR);
    expect(result.stdout).toContain("not interactive");
    expect(result.stdout).toContain("stamity init --force --migrate full");
    expect(result.stdout).not.toContain("migrated:");
  });

  it("--migrate full is the explicit route, and it still performs the full migration", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, ["--migrate", "full", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("migrate: full");
    expect(result.stdout).toContain("migrated:");
    expect(result.stdout).toContain("learning(s) carried");
    expect(result.stdout).toContain(".env.mcp carried");
    // "Import config as defaults": the predecessor's tools become the targets.
    expect((await readManifest(root))?.tools).toEqual(["claude", "cursor"]);
    const after = await readFile(join(root, "CLAUDE.md"), "utf8");
    expect(after).toContain("user prose stays");
    expect(after).not.toContain(PRED_MARKER);
  });

  it("an interactive TTY run keeps today's prompt and its full default", async () => {
    // The default change binds the NON-interactive branch only. A person at a
    // terminal is still asked, and pressing Enter still takes `full` — the
    // prompt's own default is unchanged, so an operator's muscle memory is not
    // silently repurposed.
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: [""] });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Previous setup detected (predecessor state dir). Migrate it?");
    expect(countQuestions(result.stdout)).toBe(1);
    expect(result.stdout).toContain("migrate: full");
    expect(result.stdout).toContain("migrated:");
    expect((await readManifest(root))?.tools).toEqual(["claude", "cursor"]);
  });

  it("--migrate skip is byte-identical to the non-interactive default, minus the reason", async () => {
    // Edge case: an explicit `skip` on a non-interactive run must do exactly
    // what the new default does, and still print its line — the two paths must
    // not diverge into "the flag is honoured, the default is silent".
    const explicit = await runInit(
      await seedPredecessorRepo({ markedClaudeFile: true }),
      ["--migrate", "skip", "-y"],
    );
    const implicit = await runInit(await seedPredecessorRepo({ markedClaudeFile: true }, "repo2"), [
      "-y",
    ]);

    for (const result of [explicit, implicit]) {
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("migrate: skip");
      expect(result.stdout).toContain("left untouched");
      expect(result.stdout).not.toContain("migrated:");
    }
  });

  it("--migrate skip leaves the predecessor untouched and says so", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, ["--migrate", "skip", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("migrate: skip");
    expect(result.stdout).toContain("left untouched");
    expect(result.stdout).not.toContain("migrated:");
    // Was byte-equality against MARKED_DOC, which held only while emission was
    // a no-op and init wrote nothing. `--migrate skip` never promised an
    // unwritten CLAUDE.md — it promises the PREDECESSOR is not carried over, so
    // that is what is asserted: init prepends its own managed block, and every
    // predecessor byte (its marked block included) survives verbatim below it.
    const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain(MARKED_DOC.trim());
    expect(claudeMd).toContain(`<!-- ${PRED_MARKER}:BEGIN v2.8.6 -->`);
    expect(claudeMd.indexOf("STAMITY:BEGIN")).toBeLessThan(claudeMd.indexOf("# Project notes"));
    expect(existsSync(join(root, PRED_STATE_DIR))).toBe(true);
  });

  it("predecessor + foreign AGENTS.md: one question only — migrate subsumes the import ask", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true, agentsFile: true });

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: [""] });

    expect(result.code).toBe(0);
    expect(countQuestions(result.stdout)).toBe(1);
    expect(result.stdout).toContain("Migrate it?");
    expect(result.stdout).not.toContain("Import it?");
    // The import choice defaulted silently and is still disclosed + recorded.
    expect(result.stdout).toContain("existing config: AGENTS.md");
    expect(result.stdout).toContain("(supplement)");
    // Expectation widened, not weakened: this fixture seeds a marked
    // CLAUDE.md beside the AGENTS.md, so detection returns TWO pre-existing
    // files and the silently-defaulted mode now reaches both. It used to reach
    // AGENTS.md only, leaving CLAUDE.md decided by nothing — the same
    // lost-decision shape, arriving through the predecessor branch instead of
    // the ask. The prompt count above is unchanged and still the point of this
    // case: migrate subsumes the import ask.
    expect((await readManifest(root))?.importChoice).toEqual([
      { path: "AGENTS.md", mode: "supplement" },
      { path: "CLAUDE.md", mode: "supplement" },
    ]);
    expect(result.stdout).toContain("existing config: CLAUDE.md");
  });
});

// ── --json ─────────────────────────────────────────────────────────

describe("init --json", () => {
  it("emits a single envelope with decisions/report/nextSteps and no panel chrome", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["--json"], { ttyStdin: true });

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("stamity is ready.");
    expect(result.stdout).not.toContain("scanning this repo");
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("init");
    const decisions = doc["decisions"] as Record<string, unknown>;
    expect(decisions["tools"]).toEqual(["claude"]);
    expect(decisions["predecessorDetected"]).toBe(false);
    expect((doc["report"] as Record<string, unknown>)["dryRun"]).toBe(false);
    const nextSteps = doc["nextSteps"] as string[];
    expect(nextSteps.length).toBeGreaterThan(0);
    expect(nextSteps.some((step) => step.includes("stamity-onboard"))).toBe(true);
  });

  it("keeps the panel out of JSON mode even when a stack suggestion would print", async () => {
    await getTemp().seedFiles({
      "repo/package.json": `${JSON.stringify({ dependencies: { next: "15.0.0" } })}\n`,
    });
    const root = await makeRepo();

    const result = await runInit(root, ["--json"]);

    expect(result.code).toBe(0);
    // One envelope on stdout, nothing else: parseSingleDoc fails on a second line.
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(true);
    expect(result.stdout).not.toContain("detected stacks with no dedicated guidance");
    expect(result.stdout).not.toContain("stamity is ready.");
  });

  it("records the skip decision and a null carry in the envelope", async () => {
    // Changed expectation: `--json` used to record `migrate: "full"`
    // and a completed carry, which is the destructive default this closes. The
    // envelope shape assertions are unchanged; what moved is the DECISION they
    // report, and the carry is null because none ran.
    const root = await seedPredecessorRepo({ markedClaudeFile: true, agentsFile: true });

    const result = await runInit(root, ["--json"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    const decisions = doc["decisions"] as Record<string, unknown>;
    expect(decisions["predecessorDetected"]).toBe(true);
    expect(decisions["migrate"]).toBe("skip");
    expect(decisions["importChoice"]).toBe("supplement");
    expect(decisions["tools"]).toEqual(["claude"]);
    expect(doc["carry"]).toBeNull();
  });

  it("records the full migration decisions in the envelope when the flag asks for it", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true, agentsFile: true });

    const result = await runInit(root, ["--json", "--migrate", "full"]);

    expect(result.code).toBe(0);
    const doc = parseSingleDoc(result.stdout);
    const decisions = doc["decisions"] as Record<string, unknown>;
    expect(decisions["predecessorDetected"]).toBe(true);
    expect(decisions["migrate"]).toBe("full");
    expect(decisions["importChoice"]).toBe("supplement");
    expect(decisions["tools"]).toEqual(["claude", "cursor"]);
    const carry = doc["carry"] as { envMcpCarried: boolean; strips: { path: string }[] };
    expect(carry.envMcpCarried).toBe(true);
    expect(carry.strips.map((row) => row.path)).toEqual(["CLAUDE.md"]);
  });
});

// ── Hooks-planner findings ─────────────────────────────────────────

/**
 * The hooks-planner warnings channel, end to end through the REAL composed
 * planner: a malformed hook file the repo already carries, the user-hook
 * ingress refusing it, the emission seam carrying the refusal out
 * (`EmissionPlanner.planWithWarnings`), and init's two surfaces printing it.
 *
 * Defensive framing: what is asserted is that stamity's ingress REFUSES the
 * malformed input AND says so. The guard already dropped the hook before this
 * change; the defect was that the drop was silent, so an operator's only signal
 * was the hook never firing — the outcome the channel exists to prevent.
 */
describe("init — hooks-planner findings", () => {
  /** A hook definition that fails the ingress at JSON parse. */
  const BROKEN_HOOK_FILE = `${STATE_DIR}/hooks/broken.json`;

  it("prints the rejected hook on the ready panel", async () => {
    await getTemp().seedFiles({ [`repo/${BROKEN_HOOK_FILE}`]: "{not json" });
    const root = await makeRepo();

    const result = await runInit(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stamity is ready.");
    expect(result.stdout).toContain(`warning: user hook ${BROKEN_HOOK_FILE}`);
    expect(result.stdout).toContain("INVALID_JSON");
  });

  it("prints it on the dry-run preview, where the operator is still deciding", async () => {
    await getTemp().seedFiles({ [`repo/${BROKEN_HOOK_FILE}`]: "{not json" });
    const root = await makeRepo();

    const result = await runInit(root, ["--dry-run", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run");
    expect(result.stdout).toContain(`warning: user hook ${BROKEN_HOOK_FILE}`);
    // A preview writes nothing, and the malformed file is the user's own.
    expect(await readManifest(root)).toBeNull();
    expect(await readFile(join(root, BROKEN_HOOK_FILE), "utf8")).toBe("{not json");
  });

  it("carries the channel on the JSON report as well as on the panel", async () => {
    await getTemp().seedFiles({ [`repo/${BROKEN_HOOK_FILE}`]: "{not json" });
    const root = await makeRepo();

    const result = await runInit(root, ["--json"]);

    const report = parseSingleDoc(result.stdout)["report"] as { warnings: string[] };
    expect(report.warnings.some((warning) => warning.includes(BROKEN_HOOK_FILE))).toBe(true);
  });

  it("says nothing when every hook the repo carries is well-formed", async () => {
    const root = await makeRepo();

    const result = await runInit(root, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("warning:");
  });
});

// ── --dry-run ──────────────────────────────────────────────────────

describe("init --dry-run", () => {
  it("prints the would-do report instead of the panel and leaves the tree unchanged", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    // `--migrate full` is now explicit: `-y` alone takes skip, and
    // this case is about the preview of a carry, so it has to ask for one.
    const result = await runInit(root, ["--dry-run", "-y", "--migrate", "full"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run");
    expect(result.stdout).toContain("nothing was written");
    // Changed string: the preview renders through the same helper the
    // panel does, so the two surfaces state one carry the same way — including
    // the deleted/stripped split the old `migrate: carry N learning(s)` line
    // collapsed.
    expect(result.stdout).toContain("migrated: 0 learning(s) would be carried");
    expect(result.stdout).toContain("1 file(s) would be stripped of old managed blocks");
    expect(result.stdout).toContain("0 file(s) would be deleted");
    expect(result.stdout).toContain("apply it: stamity init");
    expect(result.stdout).not.toContain("stamity is ready.");
    // Tree untouched: no state dir, no manifest, no gitignore rule, block intact.
    expect(existsSync(join(root, STATE_DIR))).toBe(false);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
    expect(await readManifest(root)).toBeNull();
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe(MARKED_DOC);
  });

  it("previews the gitignore edit it would make, even though gitignoreEnsured is false", async () => {
    // Disclosure edge case: `report.gitignoreEnsured` is false under --dry-run by
    // construction (nothing was written), so a row keyed off that flag would be
    // absent from exactly the surface whose job is to say what WOULD land. The
    // row is keyed off the mode and states the future tense.
    const root = await makeRepo();

    const result = await runInit(root, ["--dry-run", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(".env.mcp — would be added to your .gitignore");
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });

  it("names every deleted predecessor path on the dry-run surface too", async () => {
    // GEMINI.md holds nothing but a generated block, so the strip DELETES it.
    // A deletion is the one outcome that must name its file, and the
    // preview is where a user decides whether to allow it — it previewed a
    // deletion as a strip, with no path anywhere.
    const root = await seedPredecessorRepo({ markedClaudeFile: true, blockOnlyFile: true });

    const result = await runInit(root, ["--dry-run", "-y", "--migrate", "full"]);

    expect(result.stdout).toContain("1 file(s) would be deleted");
    expect(result.stdout).toContain(
      "deleted (held nothing but the old generated block): GEMINI.md",
    );
    expect(result.stdout).toContain("left in place:");
    expect(result.stdout).toContain(PRED_STATE_DIR);
    // A preview writes nothing: the file it names as doomed is still there.
    expect(existsSync(join(root, "GEMINI.md"))).toBe(true);
  });

  it("reports the residue a real migration leaves, per scope and with no fabricated command", async () => {
    // The strip covers managed blocks in six known instruction files.
    // The predecessor's state directory, its overrides, and everything it
    // emitted WITHOUT a managed block — agent bodies, slash commands, CI
    // workflows — all survive, and "migrated:" alone read as a completed move.
    const root = await seedPredecessorRepo({ markedClaudeFile: true });

    const result = await runInit(root, ["-y", "--migrate", "full"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/left in place: [1-9]\d* predecessor path\(s\)/);
    expect(result.stdout).toContain(PRED_STATE_DIR);
    expect(result.stdout).toContain("it removes nothing else");
    // TEST CHANGE, justified: the instruction used to be a
    // command assembled from the predecessor's state-directory name, with the
    // verb and the flag hard-coded in the renderer. It asserted a CLI surface
    // nothing had observed; it was root-scoped while the residue list it sits
    // under enumerates per-package state directories no root run reaches; and
    // where the guess was right it deleted `.env.mcp` — the credential file the
    // carry two lines above adopted IN PLACE, with no copy anywhere. The
    // instruction is still the predecessor's OWN uninstall and still never
    // `stamity sync`; what changed is that this run no longer invents its verbs.
    expect(result.stdout).not.toMatch(/clean --purge/);
    expect(result.stdout).toContain("the previous setup's own uninstall, run by you");
    expect(result.stdout).toContain("each listed directory is a separate scope");
    // The carried credential file is named as a back-up-first step, because the
    // uninstall being recommended is the one that would remove it.
    expect(result.stdout).toContain("Copy it somewhere outside the repo first");
    // And the residue survives the run it is reported after.
    expect(existsSync(join(root, PRED_STATE_DIR))).toBe(true);
  });

  it("names the deletion on the panel too, and the real run performs it", async () => {
    const root = await seedPredecessorRepo({ markedClaudeFile: true, blockOnlyFile: true });

    const result = await runInit(root, ["-y", "--migrate", "full"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 file(s) deleted");
    expect(result.stdout).toContain(
      "deleted (held nothing but the old generated block): GEMINI.md",
    );
    expect(existsSync(join(root, "GEMINI.md"))).toBe(false);
  });

  it("keeps the stack-suggestion block out of the dry-run report", async () => {
    await getTemp().seedFiles({
      "repo/package.json": `${JSON.stringify({ dependencies: { next: "15.0.0" } })}\n`,
    });
    const root = await makeRepo();

    const result = await runInit(root, ["--dry-run", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run");
    // The panel is the ready-state UI; a preview has no ready state to disclose.
    expect(result.stdout).not.toContain("detected stacks with no dedicated guidance");
    expect(result.stdout).not.toContain("next steps:");
  });
});

// ── Repeat runs ────────────────────────────────────────────────────

describe("init — repeat runs", () => {
  it("second init without --force exits 1 naming sync, config, and clean; --force replaces in place", async () => {
    const root = await makeRepo();
    expect((await runInit(root, ["-y"])).code).toBe(0);

    const second = await runInit(root, [], { ttyStdin: true });

    expect(second.code).toBe(1);
    // Already-initialised pre-flight: refuse without wasting answers first.
    expect(countQuestions(second.stdout)).toBe(0);
    expect(second.stderr).toContain("already initialised");
    expect(second.stderr).toContain("stamity sync");
    expect(second.stderr).toContain("stamity config");
    expect(second.stderr).toContain("stamity clean");
    expect(second.stderr).toContain("--force");

    const forced = await runInit(root, ["--force", "-y"]);

    expect(forced.code).toBe(0);
    expect(forced.stdout).toContain("stamity is ready.");
  });
});

// ── Prompt ceiling (matrix) ────────────────────────────────────────

interface CeilingCase {
  name: string;
  files: Record<string, string>;
  argv: readonly string[];
  stdinLines: readonly string[];
  ttyStdin: boolean;
  questions: number;
}

const CEILING_MATRIX: readonly CeilingCase[] = [
  { name: "fresh repo, TTY", files: {}, argv: [], stdinLines: [""], ttyStdin: true, questions: 1 },
  {
    name: "detected trace, TTY",
    files: { "repo/.claude/settings.json": "{}\n" },
    argv: [],
    stdinLines: [],
    ttyStdin: true,
    questions: 0,
  },
  {
    // State dir only (zero tool traces): tools confirm + migrate moment.
    name: "predecessor state, TTY",
    files: { [`repo/${PRED_STATE_DIR}/hatch.json`]: PRED_MANIFEST },
    argv: [],
    stdinLines: ["", ""],
    ttyStdin: true,
    questions: 2,
  },
  {
    name: "cross-tool AGENTS.md, TTY",
    files: { "repo/AGENTS.md": "# my agent notes\n" },
    argv: [],
    stdinLines: ["", ""],
    ttyStdin: true,
    questions: 2,
  },
  { name: "fresh repo, -y", files: {}, argv: ["-y"], stdinLines: [], ttyStdin: true, questions: 0 },
  {
    name: "fresh repo, --json",
    files: {},
    argv: ["--json"],
    stdinLines: [],
    ttyStdin: true,
    questions: 0,
  },
  {
    name: "fresh repo, piped stdin",
    files: {},
    argv: [],
    stdinLines: [],
    ttyStdin: false,
    questions: 0,
  },
];

describe("init — prompt ceiling", () => {
  it.each(CEILING_MATRIX)("$name asks exactly $questions question(s)", async (scenario) => {
    await getTemp().seedFiles(scenario.files);
    const root = await makeRepo();

    const result = await runInit(root, scenario.argv, {
      stdinLines: scenario.stdinLines,
      ttyStdin: scenario.ttyStdin,
    });

    expect(result.code).toBe(0);
    const asked = countQuestions(result.stdout);
    expect(asked).toBe(scenario.questions);
    // The structural ceiling, asserted independently of the per-scenario count.
    expect(asked).toBeLessThanOrEqual(2);
    // And the ONE confirmation that is not a decision prompt: these scratch
    // roots are plain directories, so every interactive run reaches the
    // no-repository gate and no non-interactive run asks anything at all.
    expect(countConfirmations(result.stdout)).toBe(scenario.ttyStdin && !scenario.argv.includes("-y") && !scenario.argv.includes("--json") ? 1 : 0);
  });
});

// ── Invalid tools answer ───────────────────────────────────────────

describe("init — invalid tools answer", () => {
  it("re-asks once with the valid list, then falls back to the default — never a crash", async () => {
    const root = await makeRepo();

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: ["bogus", "nope"] });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("valid tools: claude, cursor, copilot, codex");
    expect(result.stdout).toContain("using the default (claude)");
    expect((await readManifest(root))?.tools).toEqual(["claude"]);
  });

  it("a corrected second answer wins", async () => {
    const root = await makeRepo();

    const result = await runInit(root, [], { ttyStdin: true, stdinLines: ["bogus", "codex"] });

    expect(result.code).toBe(0);
    expect((await readManifest(root))?.tools).toEqual(["codex"]);
    expect(result.stdout).toContain("type: codex");
  });
});

// ── SIGINT at a prompt ─────────────────────────────────────────────

describe("init — SIGINT at a prompt", () => {
  it("exits 1 'aborted' and leaves no partial state directory", async () => {
    const root = await makeRepo();
    const stderrChunks: string[] = [];
    const io: CommandIo = {
      out: () => {
        /* transcript not under assertion here */
      },
      err: (text) => {
        stderrChunks.push(text);
      },
    };
    const input = new PassThrough();
    const promptOut = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { isTTY?: boolean };
    // isTTY on the prompt output flips readline into terminal mode — the mode
    // in which Ctrl-C arrives as an rl 'SIGINT' event instead of a process
    // signal. The ^C byte is buffered now and lands once the tools question is
    // pending; the stream is never ended, so EOF cannot resolve the default
    // first.
    promptOut.isTTY = true;
    input.write("\u0003");
    const terminal: TerminalFacts = { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: true };

    const code = await runCli(["init"], [initCommand], {
      cwd: root,
      env: {},
      io,
      promptIo: { input, output: promptOut },
      terminal,
    });

    expect(code).toBe(1);
    expect(stderrChunks.join("")).toContain("aborted");
    // All prompts fire before applyInit, so an abort leaves nothing behind.
    expect(existsSync(join(root, STATE_DIR))).toBe(false);
    expect(await readManifest(root)).toBeNull();
  });

  it("releases the prompt session BEFORE the write phase, so Ctrl-C is not swallowed over it", async () => {
    // Readline holds stdin in raw mode for as long as the session is
    // open, and in raw mode ^C is a byte the prompt kit consumes rather than a
    // signal the process receives. A session left open past the last question
    // therefore swallowed Ctrl-C for the whole of init's write — the longest
    // uninterruptible stretch in the product. The observable is the input
    // stream: while the session is open readline is subscribed to it, and after
    // `closePrompts` nothing is. Sampled at the moment the panel's first line
    // is printed, which is inside `run()` and so BEFORE the funnel's own
    // release — the state under test is init's, not the funnel's.
    const root = await makeRepo();
    const input = new PassThrough();
    let listenersAtPanel: number | null = null;
    const io: CommandIo = {
      out: (text) => {
        if (listenersAtPanel === null && text.includes("stamity is ready.")) {
          listenersAtPanel = input.listenerCount("data") + input.listenerCount("readable");
        }
      },
      err: () => {
        /* not under assertion here */
      },
    };
    const promptOut = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    // Two answers: the tools question, then the no-repository confirmation this
    // scratch directory earns (the temp root is not a git repo, and
    // init asks before writing where nothing can revert the write).
    input.write("\n\n");

    const code = await runCli(["init"], [initCommand], {
      cwd: root,
      env: {},
      io,
      promptIo: { input, output: promptOut },
      terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: true },
    });

    expect(code).toBe(0);
    expect(listenersAtPanel, "the panel line never printed").not.toBeNull();
    expect(listenersAtPanel).toBe(0);
  });
});

// ── The import decision, carried into sync ─────────────────────────

/**
 * The decision has to bind the NEXT run, not just the one that took it.
 *
 * A choice honoured only at init leaves `sync` planning the generated document
 * over the user's file with no knowledge of the answer — which classifies as an
 * unowned collision, refuses with INTEGRITY_ERROR, and makes `check` permanently
 * red while offering a `--force` that clobbers exactly what the user asked to
 * keep. These cases assert the plan a later sync would produce, through the
 * shipped planner, for every mode.
 */
describe("init — the existing-config decision binds later syncs", () => {
  it.each([
    ["supplement", "unchanged"],
    ["replace", "unchanged"],
    ["skip", "absent"],
  ] as const)("re-plans a %s init with no collision", async (mode, disposition) => {
    await getTemp().seedFiles({ "repo/AGENTS.md": "# my agent notes\n" });
    const root = await makeRepo();

    const init = await runInit(root, ["--tools", "claude", "--import-config", mode], {
      ttyStdin: true,
    });
    expect(init.code).toBe(0);

    // Same engine version init stamped with: a version bump is a legitimate
    // `update`, and this case is about the import decision, not staleness.
    const persisted = await readManifest(root);
    const plan = await planSync(root, persisted?.generatedBy ?? "0.0.0", { runner: () => "" });
    expect(plan.collisions).toEqual([]);
    const entry = plan.entries.find((row) => row.path === "AGENTS.md");
    if (disposition === "absent") {
      // Suppressed at the plan level: the engine emits nothing there, so there
      // is no disposition to have — not a collision it chose to tolerate.
      expect(entry).toBeUndefined();
    } else {
      expect(entry?.action).toBe("unchanged");
    }

    // The user's bytes survive wherever the mode promised they would.
    const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd.includes("# my agent notes")).toBe(mode !== "replace");
  });
});
