import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_COMMANDS_DIR, CLAUDE_SKILLS_DIR } from "../../../src/adapters/claude.ts";
import { CODEX_COMMANDS_DIR, HOOK_TRUST_STEPS } from "../../../src/adapters/codex.ts";
import { COPILOT_PROMPTS_DIR, COPILOT_SETUP_STEPS_PATH } from "../../../src/adapters/copilot.ts";
import { CURSOR_COMMANDS_DIR } from "../../../src/adapters/cursor.ts";
import type { InitApplyReport } from "../../../src/cli/commands/init/apply.ts";
import {
  defaultClientsLine,
  emissionSummary,
  gitignoreLine,
  MAX_STACK_SUGGESTION_ROWS,
  migrationLines,
  nextStepsAfterRun,
  nextStepsForTool,
  refusedFolderSteps,
  renderInitPanel,
  type InitPanelInput,
} from "../../../src/cli/commands/init/panel.ts";
import { REQUIRED_GITIGNORE_ENTRIES } from "../../../src/mcp/env.ts";
import { npxCommand } from "../../support/identity.ts";
import type { InitDecisions } from "../../../src/cli/commands/init/plan.ts";
import { makePalette } from "../../../src/cli/kit/terminal.ts";
import {
  resolvableStackPacks,
  STACK_PACK_CATALOG,
  suggestStackPacks,
  type StackSuggestion,
} from "../../../src/detect/stackSupport.ts";
import { lookupCatalogEntry } from "../../../src/pack/curated.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../../src/emit/skillsProjection.ts";
import type { CarryReport } from "../../../src/migration/carry.ts";
import { TOOLS } from "../../../src/types/core.ts";
import type { MergeResult } from "../../../src/types/content.ts";
import type { RepoInfo } from "../../../src/types/detect.ts";

// Fixture data kept out of the test-input census: built at run time, as a literal it names this repository's own handoffs keep file.
const HANDOFFS_KEEP = [".stamity/handoffs", ".gitkeep"].join("/");

/**
 * Pure-rendering lane: the panel is a string function over plain inputs, so no
 * filesystem, no funnel, no temp dirs. The command-level suite
 * (./init.test.ts) proves the same panel through the real flow; this file
 * pins the rendering contract itself — the disclosure line with its maturity
 * tier and its empty-corpus honesty variant, the per-tool onboard steps, the
 * stack-suggestion block, and the optional migration/security lines.
 *
 * The next-steps cases assert against the CONSTANTS the adapters export
 * (`CLAUDE_SKILLS_DIR`, `CLAUDE_COMMANDS_DIR`, `CODEX_COMMANDS_DIR`,
 * `CURSOR_COMMANDS_DIR`) and against `NATIVE_SKILL_DIRS`, the table that
 * decides which clients get a native copy of the skills projection — never a
 * literal this file invents. The panel prints before the user's first agent
 * turn, so a step naming a path no adapter emits fails at the exact moment the
 * product is being met for the first time — and a pinned literal here would go
 * on passing while the emitted tree moved underneath it.
 */

const identityPalette = makePalette(false);

function decisionsFixture(overrides: Partial<InitDecisions> = {}): InitDecisions {
  return {
    tools: ["claude"],
    toolsSource: "default",
    detectedTools: [],
    greenfield: true,
    monorepoPackages: [],
    maturityTier: "solo",
    maturitySource: "default",
    existingConfigPaths: [],
    detected: { languages: [], linters: [], testFrameworks: [], ciProviders: [] },
    repoInfo: {
      rootDir: "/repo",
      languages: [],
      frameworks: [],
      linters: [],
      testFrameworks: [],
      ciProviders: [],
      monorepoPackages: [],
      hasDockerfile: false,
      hasDataArtifacts: false,
      hasExistingAgents: false,
      existingTools: [],
    },
    // FIXTURE RECONCILIATION (workspace init hook): `InitDecisions` gained the
    // workspace probe's result. The panel reads neither field — the offer's
    // disclosure rides the command's `notes`, like the git and migrate lines —
    // so the fixture carries the no-workspace-here answer and no assertion in
    // this suite moves.
    workspaceCandidates: [],
    workspaceSource: "standalone",
    ...overrides,
  };
}

function reportFixture(wrote: MergeResult[] = [], warnings: string[] = []): InitApplyReport {
  return {
    manifestPath: "/repo/.stamity/manifest.json",
    createdDirs: [".stamity", ".stamity/learnings", ".stamity/handoffs"],
    // FIXTURE RECONCILIATION (sw10-first-run-output): the report gained the
    // placeholders a fresh init creates and the .gitignore entries it appended —
    // here the fresh-repo answer for both, the whole required set included.
    createdKeeps: [".stamity/learnings/.gitkeep", HANDOFFS_KEEP],
    wrote,
    warnings,
    ledgerCount: wrote.length,
    gitignoreEnsured: true,
    gitignoreAdded: [...REQUIRED_GITIGNORE_ENTRIES],
    adoptedPacks: [],
    dryRun: false,
  };
}

function carryFixture(overrides: Partial<CarryReport> = {}): CarryReport {
  return {
    learningsCarried: 2,
    learningsSkipped: 1,
    envMcpCarried: true,
    overridesPresent: false,
    strips: [
      { path: "CLAUDE.md", action: "deleted" },
      { path: "AGENTS.md", action: "stripped" },
      { path: "GEMINI.md", action: "unchanged" },
    ],
    dryRun: false,
    ...overrides,
  };
}

function panelInput(overrides: Partial<InitPanelInput> = {}): InitPanelInput {
  return {
    decisions: decisionsFixture(),
    report: reportFixture(),
    carry: null,
    mcpServers: [],
    palette: identityPalette,
    ...overrides,
  };
}

/** A live analysis carrying real detected stacks, for the suggestion pass. */
function repoInfoFixture(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    rootDir: "/repo",
    languages: [],
    frameworks: [],
    linters: [],
    testFrameworks: [],
    ciProviders: [],
    monorepoPackages: [],
    hasDockerfile: false,
    hasDataArtifacts: false,
    hasExistingAgents: false,
    existingTools: [],
    ...overrides,
  };
}

/** A hand-built suggestion row, for the ordering and cap cases. */
function suggestion(
  name: string,
  kind: StackSuggestion["kind"],
  action = "Add project rules for its idioms and set the verification gates by hand.",
): StackSuggestion {
  return { name, kind, tier: "partial", action };
}

/** The suggestion block only: the lines between the disclosure group and next steps. */
function suggestionBlock(output: string): string[] {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.startsWith("detected stacks with no dedicated"));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() === "");
  return rest.slice(0, end === -1 ? rest.length : end);
}

describe("nextStepsForTool", () => {
  it("returns nonempty numbered-ready steps for every tool, each set naming the onboard touchpoint", () => {
    for (const tool of TOOLS) {
      const steps = nextStepsForTool(tool);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((step) => step.trim() !== "")).toBe(true);
      // Numbered-READY: the panel numbers them, so no step brings its own number.
      expect(steps.every((step) => !/^\d+[.)]/.test(step))).toBe(true);
      expect(steps.some((step) => step.includes("st-onboard"))).toBe(true);
    }
  });

  it("speaks each target tool's own syntax", () => {
    expect(nextStepsForTool("claude").join("\n")).toContain("claude");
    expect(nextStepsForTool("claude").join("\n")).toContain("/st-onboard");
    expect(nextStepsForTool("cursor").join("\n")).toContain("Cursor");
    // Changed from `/st-onboard`: this client's own syntax for reaching a
    // skill is a chat request, not a slash command — nothing emits a skill
    // where Cursor resolves `/name` from. The derived case below is the proof.
    expect(nextStepsForTool("cursor").join("\n")).toContain("in the chat");
    expect(nextStepsForTool("copilot").join("\n")).toContain("@workspace");
    expect(nextStepsForTool("codex").join("\n")).toContain("codex");
  });

  it("names the claude surfaces its adapter actually emits, not a spelling this module invented", () => {
    const steps = nextStepsForTool("claude").join("\n");

    // The client folded custom commands into skills, so `/st-onboard`
    // resolves from the skill file the adapter re-targets into its native
    // project-skills directory. Both directories are read off the adapter.
    expect(CLAUDE_SKILLS_DIR, "the adapter lost its native skills location").not.toBe("");
    expect(steps).toContain(`${CLAUDE_SKILLS_DIR}/st-onboard/SKILL.md`);
    expect(steps).toContain(`${CLAUDE_COMMANDS_DIR}/`);
    // Piped-run stdout completeness (test/cli/flows.e2e.test.ts) reads the
    // panel's final line, which is this row: keep the path at its end.
    expect(nextStepsForTool("claude").at(-1)).toMatch(/st-onboard\/SKILL\.md$/);
  });

  it("names the codex touchpoints in that client's own $name spelling, never a slash", () => {
    const steps = nextStepsForTool("codex").join("\n");

    // TEST CHANGE, justified (sw17-touchpoints-as-shared-skills, REQ-FLOW-026):
    // the `null` branch this case held is gone — Codex now receives the nine
    // touchpoints as shared skills under `.agents/skills/` — and the non-null
    // branch it carried accepted `/st-onboard`, a command Codex does not run
    // (it invokes a skill as `$name`). The row still names the tree it reads,
    // and now also says the touchpoints are there and how to start one.
    expect(CODEX_COMMANDS_DIR).toBe(SKILLS_PROJECTION_DIR);
    expect(steps).toContain(`${SKILLS_PROJECTION_DIR}/`);
    expect(steps).toContain("then type: $st-onboard");
    expect(steps).toContain("invoke one as $st-<id>");
    // A slash INVOCATION is what is refused; the skill's own path contains `/st-onboard/`.
    expect(steps).not.toMatch(/(^|\s)\/st-/m);
  });

  it("falls back to a resolvable cursor spelling while that client gets no native skills copy", () => {
    const steps = nextStepsForTool("cursor").join("\n");

    // Replaces a pinned literal pair (`in the chat, type: /st-onboard`),
    // which pinned a DEAD spelling: `.cursor/skills/` takes the nine touchpoint
    // COMMAND bodies only — the adapter's writer for it iterates
    // `admitted("command")` — and `cursor` is absent from NATIVE_SKILL_DIRS, so
    // no skill is emitted anywhere this client resolves `/name` from. Reading
    // the same table the adapter reads is what makes the assertion fail if the
    // panel ever prints a slash invocation with no emitted file behind it.
    if (NATIVE_SKILL_DIRS.cursor === undefined) {
      expect(steps).toContain(SKILLS_PROJECTION_DIR);
      expect(steps).toContain("in the chat, type: /st-onboard");
    } else {
      expect(steps).toContain(`${NATIVE_SKILL_DIRS.cursor}/st-onboard/SKILL.md`);
      expect(steps).toContain("/st-onboard");
    }

    // TEST CHANGE, justified (sw17-touchpoints-as-shared-skills): this read
    // "a command directory is never a home for a skill" while the touchpoints
    // sat in `.cursor/skills/`, a tree holding commands only. They now ship in
    // the shared skills tree beside `st-onboard`, so the command directory IS
    // the skills tree; the property — no invocation printed without a file
    // behind it — holds as "the touchpoints are named where they are emitted".
    expect(CURSOR_COMMANDS_DIR).toBe(SKILLS_PROJECTION_DIR);
    expect(steps).toContain(`installed in ${SKILLS_PROJECTION_DIR}/ — invoke one as /<id>`);
    expect(steps).not.toContain(".cursor/skills");
  });

  it("keeps the copilot spelling its own adapter verified", () => {
    // The one literal row, and it names no path: `@workspace` is this client's
    // whole-workspace request syntax, which reaches the skill through the tree
    // its dialect facts declare it reads rather than through a fixed location.
    // TEST CHANGE, justified: `@workspace` is still this client's own
    // spelling for reaching the SKILL, and it still names no path. What was
    // missing is the other surface — nine `/stamity-*` prompt files this
    // client's adapter emits into `.github/prompts/`, invocable in the picker
    // and named on no line of the panel. The row is read from the adapter that
    // writes it, so it cannot drift from the emission.
    expect(nextStepsForTool("copilot")).toEqual([
      "open VS Code Copilot chat in this repo",
      `the nine touchpoint commands are installed in ${COPILOT_PROMPTS_DIR}/ — invoke one as /st-<id>`,
      "in the chat, type: @workspace run the st-onboard workflow",
    ]);
  });

  it("returns a fresh array per call — a caller's mutation cannot poison the next", () => {
    const first = nextStepsForTool("claude");
    first.push("mutated");
    expect(nextStepsForTool("claude")).not.toContain("mutated");
  });
});

describe("renderInitPanel — disclosure line", () => {
  it("names detected languages and traces, the installed tools, and the config hint", () => {
    const output = renderInitPanel(
      panelInput({
        decisions: decisionsFixture({
          tools: ["claude"],
          detectedTools: ["claude"],
          detected: {
            languages: ["typescript"],
            linters: [],
            testFrameworks: [],
            ciProviders: [],
          },
        }),
        report: reportFixture([
          { path: ".claude/agents/stamity-implementer.md", action: "created" },
          { path: "CLAUDE.md", action: "updated" },
        ]),
      }),
    );
    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): the count names every file
    // the run put on disk — the generated paths plus the manifest and the two
    // placeholders — and says the .gitignore changed. It counted the generated
    // rows alone, which disagreed with `git status` on the same repo.
    expect(output).toContain(
      "detected typescript, claude traces -> installed claude (5 file(s) on disk (2 generated, " +
        "the manifest (.stamity/manifest.json), 2 state-directory keep file(s); .gitignore changed))",
    );
    // TEST CHANGE (sw26-engine-cli-call-form, REQ-FLOW-002): the change
    // instruction names the pinned npx call instead of a bare `stamity config`
    // that only a global install provides. Same claim, the runnable spelling.
    expect(output).toContain(`(tier: solo, change with \`${npxCommand("config")}\`)`);
  });

  it("carries the maturity tier as a fact with its change instruction", () => {
    const output = renderInitPanel(
      panelInput({ decisions: decisionsFixture({ maturityTier: "team" }) }),
    );

    // TEST CHANGE (sw26-engine-cli-call-form): the pinned call, as above.
    expect(output).toContain(`(tier: team, change with \`${npxCommand("config")}\`)`);
    // The tier is a calibration dial, never a gate on content admission: the
    // line may not suggest it selected, filtered, or withheld anything.
    expect(output).not.toMatch(/tier[^\n]*\b(?:selected|filtered|withheld|excluded)\b/i);
  });

  it("excludes skipped (user-owned) rows from the installed count and names them", () => {
    const output = renderInitPanel(
      panelInput({
        report: reportFixture([
          { path: "a.md", action: "created" },
          { path: "b.md", action: "skipped", warning: "user-owned" },
          { path: "c.md", action: "unchanged" },
        ]),
      }),
    );
    // Changed expectation (not a weakening): the count claim is
    // unchanged and still asserted; what is ADDED is that the skipped row is
    // disclosed on the same line rather than only in a warning below it.
    // TEST CHANGE (sw10-first-run-output): the count clause names the manifest and
    // the placeholders beside the generated paths; the skipped row is still excluded
    // from the count and still disclosed on the same line.
    expect(output).toContain(
      "(5 file(s) on disk (2 generated, the manifest (.stamity/manifest.json), " +
        "2 state-directory keep file(s); .gitignore changed), 1 left alone (already yours))",
    );
  });

  it("names a total collision as a failed install, not as a build that emits nothing", () => {
    // The reachable twin of the empty-build branch: every planned path already
    // exists, so the writer refused every write. The old string told this user
    // "content emission arrives with the adapter phase" — a sentence about a
    // build that no longer exists — at the moment their setup had NOT installed.
    const output = renderInitPanel(
      panelInput({
        report: reportFixture([
          { path: "a.md", action: "skipped", warning: "a.md is user-owned - left alone" },
          { path: "b.md", action: "skipped", warning: "b.md is user-owned - left alone" },
        ]),
      }),
    );

    expect(output).toContain("nothing installed — all 2 planned path(s) already exist");
    expect(output).not.toContain("arrives with the adapter phase");
  });

  it("sources every warning line from the report's two channels and invents none", () => {
    // The panel's warning block is `report.wrote[].warning` plus
    // `report.warnings` and nothing else, so a run whose writes all landed and
    // whose plan found nothing prints no warning line at all.
    //
    // TEST CHANGE, justified: the case gained its SECOND source rather
    // than losing its first. It used to pin the hooks-planner channel as an
    // unreachable gap — `EmissionPlanner.plan` returned `AdapterOutput[]` alone
    // and the composer discarded `core.hooks.warnings` — and the seam has since
    // been widened (`planWithWarnings`), so the gap assertion would now be
    // asserting a defect that is fixed. "Invents none" is unchanged and is
    // still what the counts below prove.
    const clean = renderInitPanel(
      panelInput({
        report: reportFixture([
          { path: "a.md", action: "created" },
          { path: "b.md", action: "updated" },
        ]),
      }),
    );
    expect(clean).not.toContain("warning:");

    const noisy = renderInitPanel(
      panelInput({
        report: reportFixture([
          { path: "a.md", action: "created" },
          { path: "b.md", action: "skipped", warning: "b.md is user-owned - left alone" },
        ]),
      }),
    );
    expect(noisy).toContain("warning: b.md is user-owned - left alone");
    expect(noisy.match(/warning:/g)).toHaveLength(1);
  });

  it("renders the hooks-planner warnings, which have no wrote[] row to ride on", () => {
    // The findings channel's behavioural half at this render site. A hook rejected at parse
    // time produces NO output row by definition, so a panel reading `wrote[]`
    // alone can never mention it: the operator's only other signal is the hook
    // silently not running. Both shapes of the channel are pinned — the parse
    // rejection and the repo-wide policy-document lockout.
    const rejected =
      "user hook .stamity/hooks/broken.json [INVALID_JSON]: not valid JSON";
    const lockout =
      "agent-tool-policy document: 70000 bytes over the 65536-byte cap the generated guard parses";

    const output = renderInitPanel(
      panelInput({
        // Every write landed: `wrote[]` carries no warning at all, so anything
        // printed below came from the planner channel and nowhere else.
        report: reportFixture([{ path: "a.md", action: "created" }], [rejected, lockout]),
      }),
    );

    expect(output).toContain(`warning: ${rejected}`);
    expect(output).toContain(`warning: ${lockout}`);
    expect(output.match(/warning:/g)).toHaveLength(2);
  });

  it("prints both channels together, writer rows first", () => {
    const output = renderInitPanel(
      panelInput({
        report: reportFixture(
          [{ path: "b.md", action: "skipped", warning: "b.md is user-owned - left alone" }],
          ["user hook .stamity/hooks/broken.json [INVALID_JSON]: not valid JSON"],
        ),
      }),
    );

    const lines = output.split("\n").filter((line) => line.includes("warning:"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("b.md is user-owned");
    expect(lines[1]).toContain(".stamity/hooks/broken.json");
  });

  it("says the honest thing when nothing was planned at all, instead of a hollow zero", () => {
    const output = renderInitPanel(panelInput({ report: reportFixture([]) }));
    // Changed string (not a weakening): the claim is now about THIS
    // report — no planned files — rather than about a release phase, and the
    // no-hollow-zero assertion it carried is kept.
    expect(output).toContain("state + manifest only — this build planned no content files");
    expect(output).not.toContain("0 file(s)");
  });

  it("names a fresh repo when detection found nothing", () => {
    const output = renderInitPanel(panelInput());
    expect(output).toContain("detected a fresh repo (no traces)");
  });
});

describe("renderInitPanel — migration summary", () => {
  it("counts stripped and deleted files separately and NAMES every deletion", () => {
    const output = renderInitPanel(panelInput({ carry: carryFixture() }));
    expect(output).toContain("migrated: 2 learning(s) carried (1 skipped)");
    // Changed expectation (strictly stronger): the fixture's three rows
    // are one deleted, one stripped, one unchanged. They used to collapse into
    // "2 file(s) stripped of old managed blocks", which reported a file that was
    // REMOVED as a file that was edited, and named neither. Both counts are
    // asserted now, and so is the deleted path — a deletion is the one outcome
    // that must name its file.
    expect(output).toContain("1 file(s) stripped of old managed blocks");
    expect(output).toContain("1 file(s) deleted");
    expect(output).toContain("deleted (held nothing but the old generated block): CLAUDE.md");
    expect(output).toContain(".env.mcp carried");
  });

  it("prints the residue count and per-scope manual guidance, never a fabricated purge command", () => {
    // The strip covers managed blocks in six known instruction files.
    // Everything else the predecessor emitted — its state dir, its overrides,
    // per-package state, and the marked files whose blocks the strip refused —
    // stays. Reporting the carry without them read as a completed move.
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture(),
        residue: {
          paths: ["/repo/.prior", "/repo/.prior/overrides", "packages/web/.prior"],
        },
      }),
    );

    expect(output).toContain("left in place: 3 predecessor path(s)");
    expect(output).toContain("packages/web/.prior");
    // Changed expectation (strictly stronger): the line used to
    // print `<name> clean --purge` assembled from the state directory's name,
    // with the verb and the flag hard-coded in the renderer. It asserted a CLI
    // surface nothing had observed, it was root-scoped while the very same list
    // enumerates per-package state directories it would never reach, and where
    // the guess was right it deleted the credential file the carry two lines
    // above had adopted in place. No command is printed now; the assertion is
    // that none is, plus the per-scope instruction that replaced it.
    expect(output).not.toMatch(/clean --purge/);
    expect(output).toContain("the previous setup's own uninstall, run by you");
    expect(output).toContain("each listed directory is a separate scope");
    // The overstating is what the line has to stop: it says outright that the
    // migration removes nothing beyond the blocks it stripped.
    expect(output).toContain("it removes nothing else");
  });

  it("warns that the predecessor's own uninstall takes THIS setup's generated files with it", () => {
    // The line above points an operator at that uninstall, and pointing was the
    // gap: the predecessor decides what to remove by DIRECTORY, this setup
    // emits into those same directories, and its markers are not in that tool's
    // marker set — so the sweep this panel recommends deletes this setup's own
    // output. A recommendation printed without its consequence is the one line
    // here that can cost a user files.
    const output = renderInitPanel(
      panelInput({ carry: carryFixture(), residue: { paths: ["/repo/.prior"] } }),
    );

    expect(output).toContain("by DIRECTORY rather than by name");
    expect(output).toContain("takes THIS setup's generated files with it");
    // The three consequences in the order they have to be acted on: look before,
    // regenerate after, and the one thing no regeneration reaches — which is why
    // the commit instruction is stated rather than left implied.
    expect(output).toContain("preview mode first");
    // TEST CHANGE (sw26-engine-cli-call-form): the regenerate step names the
    // pinned npx call; the ordering claim is unchanged.
    expect(output).toContain(`\`${npxCommand("sync")}\` writes it back from the corpus`);
    expect(output).toContain("commit this repo before you run it");
    expect(output).toContain("offering to reinstall the old setup, decline");
    // Same discipline the residue line established: no predecessor verb is
    // invented. The preview mode and the end-of-run offer are named as
    // behaviours to look for, conditionally — never as a flag or a subcommand
    // this run never observed.
    expect(output).not.toMatch(/--dry-run|--purge|--yes/);
  });

  // Run 2026-10-11_release-1-14-0, review/73. The same line said "commit this repo before you run
  // it" where the look the engine takes before it starts git kept the folder from git (the
  // status's `reason`), on the ready panel and in the dry-run preview, beside a note that says to
  // run no git there. A commit made there is plain git started in that folder. There the line now
  // names a copy made with no git command, and the cause. Both lines are compared whole: the
  // first is the text it was, the second is new.
  const UNINSTALL_LINE_HEAD =
    "  eyes open on that uninstall: it finds what to remove by DIRECTORY rather than by name, and " +
    "this setup writes into the same directories at the same paths — so it takes THIS setup's " +
    "generated files with it. Run it in its own preview mode first, if it has one, and read the " +
    `list. Generated files come back afterwards: \`${npxCommand("check")}\` names each one and ` +
    `\`${npxCommand("sync")}\` writes it back from the corpus. Your own prose outside a managed ` +
    "block does not come back — nothing can regenerate it — so ";
  const UNINSTALL_LINE_TAIL = "And if it finishes by offering to reinstall the old setup, decline.";

  function uninstallLine(gitReason?: "bare-layout", gitAvailable?: boolean): string {
    const lines = migrationLines(carryFixture(), { paths: ["/repo/.prior"] }, gitReason, gitAvailable);
    return lines.find((line) => line.trimStart().startsWith("eyes open on that uninstall")) ?? "";
  }

  // TEST CHANGE, justified: this case was "keeps the uninstall line as it was everywhere the look
  // before git refused nothing", and held a panel whose git did not answer to "commit this repo"
  // too. With no repository, or no git the engine found, that is a git command typed where the
  // engine's own git gave no answer; the next case holds what the line says there. Where git
  // answers the line is the text it was, compared whole.
  it("keeps the uninstall line as it was where git answers", () => {
    expect(uninstallLine()).toBe(`${UNINSTALL_LINE_HEAD}commit this repo before you run it. ${UNINSTALL_LINE_TAIL}`);
    expect(uninstallLine(undefined, true)).toBe(uninstallLine());
    const output = renderInitPanel({ ...panelInput(), carry: carryFixture(), residue: { paths: ["/repo/.prior"] } });
    expect(output).toContain("so commit this repo before you run it. And if it finishes");
  });

  // The line said "commit this repo before you run it" wherever the look refused nothing, a
  // folder git did not answer in included. A commit there is a git command typed at a prompt,
  // found by the shell's rules and not by the engine's walk, and with no repository there is
  // nothing to commit to. There the line names the copy, as it does at a refused folder, and
  // says why in the words every other text of that state uses.
  it("names a copy and no commit on the uninstall line wherever else git did not answer", () => {
    const line = uninstallLine(undefined, false);

    expect(line).toBe(
      `${UNINSTALL_LINE_HEAD}copy the files that hold it somewhere outside this folder before you run it: ` +
        `git did not answer here, so the engine knows of no commit that holds them. ${UNINSTALL_LINE_TAIL}`,
    );
    expect(line).not.toContain("commit this repo");
    for (const call of ["git init", "git commit", "git status", "git diff", "git log", "git rev-parse", "git --"]) {
      expect(line, `the line names ${call}`).not.toContain(call);
    }
    // The panel carries the fact from its input to the line, whatever the engine's walk found.
    for (const gitFound of [true, false]) {
      const output = renderInitPanel(
        panelInput({ carry: carryFixture(), residue: { paths: ["/repo/.prior"] }, gitAvailable: false, gitFound }),
      );
      expect(output, `gitFound=${gitFound}`).toContain(`  ${line}`);
      expect(output, `gitFound=${gitFound}`).not.toContain("commit this repo");
    }
  });

  it("names no commit and no git command on the uninstall line where the look before git refused the folder", () => {
    const line = uninstallLine("bare-layout");

    expect(line).toBe(
      `${UNINSTALL_LINE_HEAD}copy the files that hold it somewhere outside this folder before you run it, ` +
        "and use no git command for that: git was not started here, because this folder, or a folder " +
        `above it, has the layout of a bare repository. ${UNINSTALL_LINE_TAIL}`,
    );
    expect(line).not.toContain("commit");
    // The panel carries the cause from its input to the line; every other migration line is the one it was.
    const refused = renderInitPanel(
      panelInput({
        carry: carryFixture(),
        residue: { paths: ["/repo/.prior"] },
        gitAvailable: false,
        gitReason: "bare-layout",
      }),
    );
    expect(refused).toContain(`  ${line}`);
    expect(refused).not.toContain("commit this repo");
    const others = (gitReason?: "bare-layout"): string[] =>
      migrationLines(carryFixture(), { paths: ["/repo/.prior"] }, gitReason).filter(
        (row) => !row.trimStart().startsWith("eyes open on that uninstall"),
      );
    expect(others("bare-layout")).toEqual(others());
  });

  it("names the settings document this run refused to claim, with the remedy", () => {
    // Detection never sees this file: it is not a marked instruction surface and
    // not under the predecessor's state directory, so it was missing from a
    // residue list whose whole job is to stop the report overstating the move.
    // The consequence is what earns it a line — the hooks that actually fire are
    // still the previous setup's, and nothing else on this panel says so.
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture(),
        residue: {
          paths: ["/repo/.prior", ".claude/settings.json"],
          unownedSettingsPath: ".claude/settings.json",
        },
      }),
    );

    expect(output).toContain("left in place: 2 predecessor path(s)");
    expect(output).toContain("one of those paths is live wiring: .claude/settings.json");
    expect(output).toContain("installed none of its own hook or permission settings");
    // review/42: the stated cause is the one init still refuses for since
    // REQ-FLOW-036 — a shape it cannot merge beside, or a link — not that the
    // file was already here (a file already here is merged entry by entry).
    expect(output).toContain("could not be merged: a member the engine writes into has another type, or the file is a link");
    expect(output).not.toContain("was already here");
    // TEST CHANGE (sw26-engine-cli-call-form): the remedy names the pinned
    // npx call instead of a bare verb.
    expect(output).toContain(`remove it and run \`${npxCommand("sync")}\``);
    // The half this run cannot verify stays conditional: it knows the file
    // predates the run and that the run did not write it, not who authored it.
    expect(output).toContain("If it is the previous setup's rather than yours");
  });

  it("prints no settings remedy when this run claimed every path it planned", () => {
    const output = renderInitPanel(
      panelInput({ carry: carryFixture(), residue: { paths: ["/repo/.prior"] } }),
    );
    expect(output).not.toContain("live wiring");
  });

  it("names the credential file as a back-up-first step when one was carried", () => {
    // The carry adopts `.env.mcp` where it stands — no copy — so any
    // predecessor uninstall that removes credentials removes the live tokens
    // this setup now reads.
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture({ envMcpCarried: true }),
        residue: { paths: ["AGENTS.md"] },
      }),
    );

    expect(output).toContain("left in place: 1 predecessor path(s)");
    expect(output).toContain("no copy was made");
    expect(output).toContain("Copy it somewhere outside the repo first");
  });

  it("omits the credential back-up step when nothing was carried", () => {
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture({ envMcpCarried: false }),
        residue: { paths: ["AGENTS.md"] },
      }),
    );

    expect(output).toContain("left in place: 1 predecessor path(s)");
    expect(output).not.toContain("Copy it somewhere outside the repo first");
  });

  it("prints no residue line when the migration left nothing behind", () => {
    const output = renderInitPanel(
      panelInput({ carry: carryFixture(), residue: { paths: [] } }),
    );
    expect(output).not.toContain("left in place:");
  });

  it("flags an overrides directory for manual review", () => {
    const output = renderInitPanel(
      panelInput({ carry: carryFixture({ overridesPresent: true }) }),
    );
    expect(output).toContain("overrides");
    expect(output).toContain("review");
  });

  it("prints no migration line when no carry ran", () => {
    expect(renderInitPanel(panelInput({ carry: null }))).not.toContain("migrated:");
  });
});

describe("renderInitPanel — security disclosure", () => {
  it("discloses the gitignore edit on an ORDINARY init, with no MCP server anywhere", () => {
    // This is the case the disclosure exists for and the case
    // it never reached. `applyInit` writes a line into the user's `.gitignore`
    // on every run; the disclosure was gated on a migration having carried MCP
    // servers, so on every ordinary init the product edited a file the operator
    // owns and said nothing. The condition is `report.gitignoreEnsured`, which
    // is what the write actually reports.
    const output = renderInitPanel(panelInput({ mcpServers: [] }));

    expect(output).toContain("security:");
    // TEST CHANGE, justified (REQ-FLOW-016): the disclosure named one line
    // (`.env.mcp — was added to your .gitignore`); init now adds up to four, so
    // it names all four. The case pinned — disclosed on an ordinary init with no
    // MCP server — is unchanged.
    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): each entry now carries a
    // neutral reason, and the line names the entries the run appended rather than
    // the whole set "wherever it lacked them". The case pinned — disclosed on an
    // ordinary init with no MCP server — is unchanged.
    // TEST CHANGE (REQ-FLOW-101): the hooks canary is the fifth entry.
    // TEST CHANGE, justified (pr/17): the engine now ignores the run-ended marker, the sixth entry, named last;
    // its reason is its own since GITIGNORE_REASONS names it, not the neutral fallback.
    expect(output).toContain(
      "these lines — .env.mcp (MCP server credentials), .stamity/review-gate.json (the review " +
        "gate's per-run state), .stamity/review-gate.json.lock (the review gate's lock), " +
        ".stamity/review-gate.json.tmp-* (the review gate's temporary writes), " +
        ".stamity/preflight-canary.json (the shell guard's hooks canary), " +
        ".stamity/run-ended.json (the run that just ended, read by the ask gate), .stamity/context-once/ (Cursor's once-per-conversation context markers), .stamity/client-models.json (machine-local state this setup writes) — were added to your .gitignore", // TEST CHANGE, justified (v6-cursor-cloud, REQ-FLOW-115): the engine now ignores Cursor's context-once markers, named last. // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the engine now ignores the client model list cache, named last with the panel's neutral reason.
    );
    // No MCP server: no credential file this setup uses, so no such claim.
    expect(output).not.toContain("credential file this setup uses");
    // The credential half stays conditional: no server, no credential to load.
    expect(output).not.toContain("credentials:");
    expect(output).not.toContain("Before starting your tool");
  });

  it("names every entry the gitignore lane requires, derived from the lane's own list", () => {
    // Derived, not typed: an entry added to the required set without reaching
    // the disclosure is an edit to the operator's file that nobody announced.
    const output = renderInitPanel(panelInput({ mcpServers: [] }));
    const line = output.split("\n").find((row) => row.includes("security:")) ?? "";
    for (const entry of REQUIRED_GITIGNORE_ENTRIES) expect(line, entry).toContain(entry);
    expect(line).toContain("review gate");
  });

  it("previews the same four entries in the future tense", () => {
    // TEST CHANGE (sw10-first-run-output): `gitignoreLine` takes its entries and
    // the MCP condition as input; a preview passes the whole required set, and the
    // future tense with "wherever it lacks them" is what this case still pins.
    const line = gitignoreLine({
      dryRun: true,
      entries: REQUIRED_GITIGNORE_ENTRIES,
      mcpConfigured: false,
    });
    for (const entry of REQUIRED_GITIGNORE_ENTRIES) expect(line, entry).toContain(entry);
    expect(line).toContain("— would be added to your .gitignore wherever it lacks them");
  });

  it("names only the entries this run added (REQ-FLOW-022)", () => {
    // A .gitignore that already covered .env.mcp: the lane appended the three
    // review-gate entries alone, and the panel names exactly those.
    const added = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => entry !== ".env.mcp");
    const output = renderInitPanel(
      panelInput({ report: { ...reportFixture(), gitignoreAdded: added } }),
    );
    const line = output.split("\n").find((row) => row.includes("security:")) ?? "";

    expect(added.length).toBe(REQUIRED_GITIGNORE_ENTRIES.length - 1);
    for (const entry of added) expect(line, entry).toContain(entry);
    expect(line).not.toContain(".env.mcp");
    expect(line).not.toContain("credential");
  });

  it("gives an entry it has no reason for a neutral reason, never a borrowed one (review/140)", () => {
    // Keyed on exact entries: a future required entry shaped like a lock or a
    // glob must not be named as the review gate's.
    const line = gitignoreLine({
      dryRun: false,
      entries: [".stamity/other-state.lock", ".stamity/cache-*"],
      mcpConfigured: false,
    });

    expect(line).toContain(".stamity/other-state.lock (machine-local state this setup writes)");
    expect(line).toContain(".stamity/cache-* (machine-local state this setup writes)");
    expect(line).not.toContain("review gate");
  });

  it("names the one entry added in the singular", () => {
    const output = renderInitPanel(
      panelInput({ report: { ...reportFixture(), gitignoreAdded: [".env.mcp"] } }),
    );

    expect(output).toContain("security: this line — .env.mcp (MCP server credentials) — was added to");
  });

  it("prints no gitignore disclosure when the run appended nothing", () => {
    const output = renderInitPanel(
      panelInput({ report: { ...reportFixture(), gitignoreAdded: [] } }),
    );

    expect(output).not.toContain("security:");
  });

  // 2026-10-25_autonomy-distribution-02/prove/12: a kept pack init takes back from its receipt is named on a plain
  // line, never a warning. The id comes from a receipt, repository data, so it is printed cleaned.
  it("names each kept pack it took back on a plain line, its id cleaned of control and invisible characters", () => {
    const output = renderInitPanel(
      panelInput({ report: { ...reportFixture(), adoptedPacks: ["acme-kept", "odd\u001b[31m‮id\nnext"] } }),
    );
    const rows = output.split("\n").filter((row) => row.includes("kept pack"));

    expect(rows).toEqual([
      '  took back the kept pack "acme-kept" from its receipt under .stamity/packs/',
      '  took back the kept pack "odd[31mid next" from its receipt under .stamity/packs/',
    ]);
    expect(output).not.toContain("\u001b[31m");
    expect(output).not.toContain("‮");
  });

  it("prints no kept-pack line when init took none back", () => {
    expect(renderInitPanel(panelInput())).not.toContain("kept pack");
  });

  it("keeps the credential wording for a run with an MCP server", () => {
    const output = renderInitPanel(panelInput({ mcpServers: ["github"] }));

    expect(output).toContain("the credential file this setup uses (.env.mcp) among them");
  });

  it("stays silent about the gitignore when nothing was written to it", () => {
    const output = renderInitPanel(
      panelInput({ report: { ...reportFixture(), gitignoreEnsured: false } }),
    );
    expect(output).not.toContain("security:");
  });

  it("adds the credential load hint when MCP servers exist, alongside the gitignore line", () => {
    const output = renderInitPanel(panelInput({ mcpServers: ["github", "filesystem"] }));
    expect(output).toContain("security:");
    expect(output).toContain("credentials:");
    expect(output).toContain(".env.mcp");
    expect(output).toContain("github, filesystem");
  });

  // Run 2026-10-11_release-1-14-0, fix/23. The line's tail is a claim about a repository, so it has
  // one text per state of the git probe. Where the look the engine takes before it starts git kept
  // the folder from git (the status's `reason`), the tail said "not a git repository yet" and "the
  // rule takes effect on the first `git init`", under a note that says not to run git there. The
  // three tails are compared whole: the first two are the texts they were, the third is new.
  const ONE_ENTRY_HEAD =
    "security: this line — .env.mcp (MCP server credentials) — was added to your .gitignore, so git " +
    "leaves those files out of commits. Nothing else in your .gitignore is touched";
  const REFUSED_TAIL =
    ". git was not started here: this folder, or a folder above it, has the layout of a bare " +
    "repository, so the engine did not hand it to git and cannot say what is tracked or ignored here. " +
    "The rule takes effect wherever a repository holds this folder in its working tree, and the " +
    ".stamity/ state directory is meant to be committed there.";

  it("keeps the tail it had where git answers", () => {
    const line = gitignoreLine({ dryRun: false, gitAvailable: true, entries: [".env.mcp"], mcpConfigured: false });

    expect(line).toBe(`${ONE_ENTRY_HEAD}, and the rest of the .stamity/ state directory is committed on purpose.`);
  });

  // The tail said "This directory is not a git repository yet" and "the rule takes effect on the
  // first `git init`" wherever git did not answer and the look refused nothing. Where the engine
  // found no git to start, that gave a missing repository as the cause under a note that says
  // otherwise; and `git init` is a command typed at a prompt, which the shell finds by its own
  // rules. The tail now goes by what the engine's walk found, as the note does, in two texts.
  const FOUND_TAIL =
    ". git did not answer here though the engine found a git binary, so this directory is not a git " +
    "repository yet, or git was only slow to answer: nothing is known to be tracked or ignored here. " +
    "The rule takes effect once a repository holds this folder in its working tree, and the " +
    ".stamity/ state directory is meant to be committed once there is somewhere to commit it.";
  const NO_GIT_TAIL =
    ". git did not answer here: the engine found no git to start, so it cannot say what is tracked " +
    "or ignored here. The rule takes effect wherever a repository holds this folder in its working " +
    "tree, and the .stamity/ state directory is meant to be committed there.";
  const GIT_CALLS = ["git init", "git status", "git diff", "git log", "git rev-parse", "git --"];

  // TEST CHANGE, justified: this case was "keeps the tail it had where there is simply no
  // repository" and compared the tail with the text above. It is the tail for a git the engine
  // found, which is what a caller that passes no `gitFound` gets, as one that passes `true` does.
  it("says the engine found a git binary, and names no git command, where git did not answer", () => {
    const line = gitignoreLine({ dryRun: false, gitAvailable: false, entries: [".env.mcp"], mcpConfigured: false });

    expect(line).toBe(`${ONE_ENTRY_HEAD}${FOUND_TAIL}`);
    expect(gitignoreLine({ dryRun: false, gitAvailable: false, gitFound: true, entries: [".env.mcp"], mcpConfigured: false })).toBe(line);
    for (const call of GIT_CALLS) expect(line, `the line names ${call}`).not.toContain(call);
  });

  it("says the engine found no git to start, and names no missing repository, where its walk found none", () => {
    const line = gitignoreLine({ dryRun: false, gitAvailable: false, gitFound: false, entries: [".env.mcp"], mcpConfigured: false });

    expect(line).toBe(`${ONE_ENTRY_HEAD}${NO_GIT_TAIL}`);
    expect(line).not.toContain("not a git repository yet");
    for (const call of GIT_CALLS) expect(line, `the line names ${call}`).not.toContain(call);
    // Where git answers, or the look refused the folder, what the walk found moves nothing.
    expect(gitignoreLine({ dryRun: false, gitAvailable: true, gitFound: false, entries: [".env.mcp"], mcpConfigured: false })).toBe(
      `${ONE_ENTRY_HEAD}, and the rest of the .stamity/ state directory is committed on purpose.`,
    );
    expect(
      gitignoreLine({ dryRun: false, gitAvailable: false, gitReason: "bare-layout", gitFound: false, entries: [".env.mcp"], mcpConfigured: false }),
    ).toBe(`${ONE_ENTRY_HEAD}${REFUSED_TAIL}`);
  });

  it("states the cause and names no git command where the look before git refused the folder", () => {
    const line = gitignoreLine({
      dryRun: false,
      gitAvailable: false,
      gitReason: "bare-layout",
      entries: [".env.mcp"],
      mcpConfigured: false,
    });

    expect(line).toBe(`${ONE_ENTRY_HEAD}${REFUSED_TAIL}`);
    expect(line).not.toContain("not a git repository yet");
    for (const call of ["git init", "git status", "git diff", "git log", "git rev-parse"]) {
      expect(line, `the line names ${call}`).not.toContain(call);
    }
  });

  it("carries that cause from the panel's input to its security line", () => {
    const refused = renderInitPanel(panelInput({ gitAvailable: false, gitReason: "bare-layout" }));
    const plain = renderInitPanel(panelInput({ gitAvailable: false }));
    const securityLine = (output: string): string => output.split("\n").find((row) => row.includes("security:")) ?? "";

    expect(securityLine(refused).endsWith(REFUSED_TAIL)).toBe(true);
    expect(securityLine(refused)).not.toContain("git init");
    // TEST CHANGE, justified: the plain panel was held to "This directory is not a git repository
    // yet" and "the rule takes effect on the first `git init`". Its tail is now the one for a git
    // the engine found, and a panel told the walk found none carries that tail instead.
    expect(securityLine(plain).endsWith(FOUND_TAIL)).toBe(true);
    const noGit = renderInitPanel(panelInput({ gitAvailable: false, gitFound: false }));
    expect(securityLine(noGit).endsWith(NO_GIT_TAIL)).toBe(true);
    for (const call of GIT_CALLS) {
      expect(securityLine(plain), `the line names ${call}`).not.toContain(call);
      expect(securityLine(noGit), `the line names ${call}`).not.toContain(call);
    }
  });
});

describe("renderInitPanel — stack suggestions", () => {
  it("prints nothing at all when every detected stack is covered", () => {
    const covered = renderInitPanel(panelInput({ stackSuggestions: [] }));
    const omitted = renderInitPanel(panelInput());

    expect(covered).not.toContain("detected stacks with no dedicated guidance");
    // An omitted field behaves identically — no block is the default state.
    expect(omitted).not.toContain("detected stacks with no dedicated guidance");
  });

  it("caps the rows and says how many it left out", () => {
    const many = [
      suggestion("next", "framework"),
      suggestion("react", "framework"),
      suggestion("express", "framework"),
      suggestion("typescript", "language"),
      suggestion("python", "language"),
      suggestion("go", "language"),
    ];

    const output = renderInitPanel(panelInput({ stackSuggestions: many }));
    const rows = suggestionBlock(output);

    // Cap plus one count line: the panel is the first UI, and six rows would
    // push the one instruction that matters off the top of the screen.
    expect(rows).toHaveLength(MAX_STACK_SUGGESTION_ROWS + 1);
    expect(rows.at(-1)).toContain(`${many.length - MAX_STACK_SUGGESTION_ROWS} more`);
  });

  it("puts framework rows before language rows whatever order the caller passed", () => {
    const languageFirst = [
      suggestion("typescript", "language"),
      suggestion("python", "language"),
      suggestion("go", "language"),
      suggestion("next", "framework"),
    ];

    const rows = suggestionBlock(renderInitPanel(panelInput({ stackSuggestions: languageFirst })));

    // Most-specific first: a caller's sort must not be able to push every
    // framework past the cap, which is exactly what a plain slice would do.
    expect(rows[0]).toContain("next (framework)");
    expect(rows.slice(0, MAX_STACK_SUGGESTION_ROWS).join("\n")).toContain("typescript (language)");
  });

  it("never phrases a row as an install instruction while no pack is installable", () => {
    // TEST CHANGE, justified (u16-frontend-suggestion, REQ-PACK-010): this case
    // ran the production entry against the shipped catalog, which was empty.
    // The shipped catalog now maps the front-end subjects to `frontend`, so the
    // "no pack installable" state is a catalog that resolves none of them — a
    // fork whose packs folder lacks `frontend`. Same claim, same assertions,
    // reached through the filter init now applies.
    const live = suggestStackPacks(
      repoInfoFixture({ frameworks: ["next", "react"], languages: ["typescript", "python"] }),
      resolvableStackPacks(STACK_PACK_CATALOG, () => undefined, new Set()),
    );
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((row) => row.packId === undefined)).toBe(true);

    const rows = suggestionBlock(renderInitPanel(panelInput({ stackSuggestions: live })));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.toLowerCase(), `"${row}" reads as an install instruction`).not.toContain("install");
    }
    expect(rows[0]).toContain("next (framework)");
  });

  it("names the installable pack once one exists, and keeps the block above next steps", () => {
    const withPack: StackSuggestion[] = [
      { name: "next", kind: "framework", tier: "partial", action: "Install the nextjs pack", packId: "nextjs" },
    ];

    const output = renderInitPanel(panelInput({ stackSuggestions: withPack }));

    // TEST CHANGE (sw26-engine-cli-call-form): the suggestion's action no longer
    // carries a bare `stamity add` — detection cannot know the package or its
    // version — and the panel appends the pinned install call from the packId.
    // Same claim: an installable pack prints a copy-pasteable install line.
    expect(suggestionBlock(output)[0]).toBe(
      `  next (framework) — Install the nextjs pack: ${npxCommand("add nextjs")}`,
    );
    // Ordering: the last thing on screen stays the first thing to do.
    expect(output.indexOf("detected stacks with no dedicated")).toBeLessThan(
      output.indexOf("next steps:"),
    );
  });
});

describe("renderInitPanel — the frontend pack suggestion (REQ-PACK-010)", () => {
  // The production path init takes: the shipped subject map, filtered through
  // the real catalog lookup over this checkout's `packs/` folder, so these
  // cases read what a user of this build reads.
  const live = (info: Partial<RepoInfo>, installed: ReadonlySet<string> = new Set()): string[] =>
    suggestionBlock(
      renderInitPanel(
        panelInput({
          stackSuggestions: suggestStackPacks(
            repoInfoFixture(info),
            resolvableStackPacks(STACK_PACK_CATALOG, lookupCatalogEntry, installed),
          ),
        }),
      ),
    );
  const installCall = npxCommand("add frontend");

  it("names the frontend pack with its pinned install call for a Next.js repository", () => {
    const rows = live({ frameworks: ["next"], languages: ["typescript"] });

    expect(rows[0]).toBe(`  next (framework) — Install the frontend pack: ${installCall}`);
    expect(rows.filter((row) => row.includes(installCall))).toHaveLength(1);
  });

  it("prints the install call once for Next.js and React together", () => {
    const rows = live({ frameworks: ["next", "react"], languages: ["typescript"] });

    expect(rows.filter((row) => row.includes(installCall))).toEqual([
      `  next (framework) — Install the frontend pack: ${installCall}`,
    ]);
    // The second front-end row still names the pack, without a second call.
    // TEST CHANGE, justified (u16-frontend-suggestion review round 1): the row read
    // "Install the frontend pack" with no command; it now points at the call above.
    expect(rows[1]).toBe("  react (framework) — covered by the frontend pack above");
  });

  it("lifts the row offering a pack above rows the cap would otherwise keep", () => {
    // Detection order for a root holding manage.py, config/routes.rb, artisan
    // and a React dependency: the config-file frameworks come first.
    const rows = live({ frameworks: ["django", "rails", "laravel", "react", "vue"], languages: [] });

    expect(rows[0]).toBe(`  react (framework) — Install the frontend pack: ${installCall}`);
    expect(rows.slice(1, MAX_STACK_SUGGESTION_ROWS).map((row) => row.split(" (")[0]?.trim())).toEqual([
      "django",
      "rails",
    ]);
    // Only the first row per pack is lifted; vue keeps its place past the cap.
    expect(rows.join("\n")).not.toContain("vue (framework)");
  });

  it("offers nothing once the ledger records frontend as installed", () => {
    const rows = live({ frameworks: ["next", "react"], languages: ["typescript"] }, new Set(["frontend"]));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.toLowerCase(), row).not.toContain("install");
    }
  });

  it("prints no pack line for a backend repository", () => {
    const rows = live({ frameworks: ["express"], languages: ["typescript", "python"] });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.toLowerCase(), row).not.toContain("install");
    }
  });
});

describe("renderInitPanel — the file count (REQ-FLOW-022)", () => {
  it("counts a path several outputs address once", () => {
    const report = reportFixture([
      { path: "AGENTS.md", action: "created" },
      { path: "AGENTS.md", action: "updated" },
      { path: ".claude/agents/a.md", action: "created" },
    ]);

    // Two distinct generated paths, the manifest, two placeholders.
    expect(emissionSummary(report)).toMatch(/^5 file\(s\) on disk \(2 generated, /u);
  });

  it("names no placeholder the run did not create, and no .gitignore it did not change", () => {
    const report = {
      ...reportFixture([{ path: "a.md", action: "created" }]),
      createdKeeps: [],
      gitignoreAdded: [],
    };

    expect(emissionSummary(report)).toBe(
      "2 file(s) on disk (1 generated, the manifest (.stamity/manifest.json))",
    );
  });

  it("previews the same count in the conditional", () => {
    const report = { ...reportFixture([{ path: "a.md", action: "created" }]), dryRun: true };

    expect(emissionSummary(report)).toBe(
      "4 file(s) would be written (1 generated, the manifest (.stamity/manifest.json), " +
        "2 state-directory keep file(s))",
    );
  });
});

describe("renderInitPanel — a defaulted client set (REQ-FLOW-022)", () => {
  it("names claude as the default when no other client's files were found", () => {
    const output = renderInitPanel(panelInput({ decisions: decisionsFixture({ toolsSource: "default" }) }));

    // TEST CHANGE (build/131, signed off): after a live init a second `init`
    // refuses without --force, so the panel names the config `tools` key and a
    // sync, in the pinned call form, instead of `--tools`. The dry run keeps
    // `--tools` (the case below).
    expect(output).toContain(
      "  clients: claude (the default — no other client's files were found; add more with " +
        `${npxCommand("config set tools claude,cursor,copilot,codex")}, then ${npxCommand("sync")})`,
    );
    expect(output).not.toContain("--tools");
    // The line sits directly under the disclosure line it qualifies.
    const lines = output.split("\n");
    expect(lines[lines.findIndex((line) => line.includes("-> installed")) + 1]).toContain("clients:");
  });

  it("keeps the --tools route on the dry run, where nothing is written yet (build/131)", () => {
    expect(defaultClientsLine(decisionsFixture({ toolsSource: "default" }), true)).toBe(
      "clients: claude (the default — no other client's files were found; add more with " +
        "--tools claude,cursor,copilot,codex)",
    );
  });

  it("prints no default line for a detected or a flagged client set", () => {
    for (const toolsSource of ["detected", "flag"] as const) {
      expect(defaultClientsLine(decisionsFixture({ toolsSource }), false)).toBeNull();
      expect(defaultClientsLine(decisionsFixture({ toolsSource }), true)).toBeNull();
      expect(renderInitPanel(panelInput({ decisions: decisionsFixture({ toolsSource }) }))).not.toContain(
        "the default —",
      );
    }
  });
});

/**
 * REQ-FLOW-022: init writes the hosting platform it detected from the origin
 * remote into the manifest, so the panel names it beside the tools and the
 * tier — and says how to set it when nothing was detected.
 */
describe("renderInitPanel — the detected platform (REQ-FLOW-022)", () => {
  it("names the platform detected from a GitHub origin on a line of its own", () => {
    const output = renderInitPanel(
      panelInput({ decisions: decisionsFixture({ platform: "github", toolsSource: "default" }) }),
    );
    const lines = output.split("\n");

    expect(lines).toContain("  platform: github (from the origin remote)");
    expect(output).not.toContain("none detected");
    // Its own line, never folded into the disclosure line, and never between
    // the disclosure line and the `clients:` line that qualifies it.
    const installed = lines.findIndex((line) => line.includes("-> installed"));
    expect(lines[installed]).not.toContain("platform");
    expect(lines[installed + 1]).toContain("clients:");
    expect(lines.findIndex((line) => line.includes("platform:"))).toBeGreaterThan(installed + 1);
    expect(output.indexOf("platform:")).toBeLessThan(output.indexOf("next steps:"));
  });

  it("names the same line for each platform init can detect", () => {
    for (const platform of ["gitlab", "azure-devops"] as const) {
      expect(renderInitPanel(panelInput({ decisions: decisionsFixture({ platform }) }))).toContain(
        `  platform: ${platform} (from the origin remote)\n`,
      );
    }
  });

  it("falls back to the set-it instruction, in the pinned call form, when none was detected", () => {
    const output = renderInitPanel(panelInput());

    // TEST CHANGE, justified: 2026-10-06, run 2026-10-03_pack-engine-defects
    // review/40. The fallback named `<name>` without the values it takes, while
    // the `clients:` line beside it lists its own; it now lists the closed set.

    expect(output).toContain(
      `  platform: none detected — set it with ${npxCommand("config set platform <name>")}, ` +
        "<name> one of github, azure-devops, gitlab\n",
    );
    expect(output).not.toContain("(from the origin remote)");
  });
});

describe("renderInitPanel — next steps", () => {
  it("numbers the steps for a single tool under one heading", () => {
    const output = renderInitPanel(panelInput());
    expect(output).toContain("next steps:");
    expect(output).toContain("  1. ");
    expect(output).toContain("  2. ");
    expect(output).toContain("st-onboard");
  });

  it("lists both Codex trust steps the operator takes, from the adapter's own step data", () => {
    const steps = nextStepsForTool("codex");
    const operatorSteps = HOOK_TRUST_STEPS.flatMap((step) =>
      step.operatorStep === null ? [] : [step.operatorStep],
    );

    expect(operatorSteps).toHaveLength(2);
    for (const step of operatorSteps) expect(steps).toContain(step);
    expect(steps.join("\n")).toContain("~/.codex/config.toml");
    expect(steps.join("\n")).toContain("/hooks");
    // Project trust comes before the client opens the repo; the review, after.
    const open = steps.findIndex((step) => step.includes("type: codex"));
    expect(steps.findIndex((step) => step.includes("~/.codex/config.toml"))).toBeLessThan(open);
    expect(steps.findIndex((step) => step.includes("type: /hooks"))).toBeGreaterThan(open);
  });

  it("names the Copilot setup workflow and when it runs, only when the run wrote it", () => {
    const decisions = decisionsFixture({ tools: ["copilot"], toolsSource: "flag" });
    // TEST CHANGE (review/138): the rows carry the absolute target the writer
    // returns (apply.ts joins the root, safeWriteFile resolves it), the shape a
    // live report has; the fixture used the repo-relative constant, a shape no
    // live report carries, so it passed while the live panel never printed.
    const workflowRow = join(decisions.repoInfo.rootDir, ...COPILOT_SETUP_STEPS_PATH.split("/"));
    const written = renderInitPanel(
      panelInput({
        decisions,
        report: reportFixture([{ path: workflowRow, action: "created" }]),
      }),
    );
    const skipped = renderInitPanel(
      panelInput({
        decisions,
        report: reportFixture([{ path: workflowRow, action: "skipped", warning: "user-owned" }]),
      }),
    );

    expect(written).toContain(`the coding agent's setup workflow is at ${COPILOT_SETUP_STEPS_PATH}`);
    expect(written).toContain("before the Copilot coding agent starts work on a task");
    // The in-chat instruction stays the last step.
    expect(written.trimEnd().split("\n").at(-1)).toContain("@workspace");
    expect(skipped).not.toContain("setup workflow is at");
    // The repo-relative spelling is not a row a live report carries.
    const relative = renderInitPanel(
      panelInput({
        decisions,
        report: reportFixture([{ path: COPILOT_SETUP_STEPS_PATH, action: "created" }]),
      }),
    );
    expect(relative).not.toContain("setup workflow is at");
  });

  it("lists the same Copilot steps in the JSON document as on the panel, none on a dry run (review/141)", () => {
    const rootDir = "/repo";
    const row = join(rootDir, ...COPILOT_SETUP_STEPS_PATH.split("/"));
    const live = nextStepsAfterRun("copilot", reportFixture([{ path: row, action: "created" }]), rootDir);
    const preview = nextStepsAfterRun(
      "copilot",
      { ...reportFixture([{ path: row, action: "created" }]), dryRun: true },
      rootDir,
    );

    expect(live).toHaveLength(nextStepsForTool("copilot").length + 1);
    expect(live.join("\n")).toContain(`the coding agent's setup workflow is at ${COPILOT_SETUP_STEPS_PATH}`);
    expect(live.at(-1)).toContain("@workspace");
    // A preview put nothing on disk, so it names no workflow as being there.
    expect(preview).toEqual(nextStepsForTool("copilot"));
    // Every other client's steps are the static table's.
    expect(nextStepsAfterRun("claude", reportFixture([{ path: row, action: "created" }]), rootDir)).toEqual(
      nextStepsForTool("claude"),
    );
  });

  it("prints one named block per tool when several are targeted", () => {
    const output = renderInitPanel(
      panelInput({ decisions: decisionsFixture({ tools: ["claude", "codex"] }) }),
    );
    expect(output).toContain("next steps (claude):");
    expect(output).toContain("next steps (codex):");
  });

  // Run 2026-10-11_release-1-14-0, review/71. Where the look the engine takes before it starts git
  // kept the folder from git (the status's `reason`), the panel still ended on "open a terminal in
  // this repo and type: claude" and `/st-onboard`. A client's own tools, a flow's session and its
  // sub-agents start git the engine does not, with no look and neither option, so the last lines
  // on screen led into the git the release's pages warn of. There each client's steps now open
  // with moving the folder; the usual steps follow, word for word. The step is compared whole.
  const REFUSED_FOLDER_STEP =
    "before you start a client or a flow here, move the folder that has the layout of a bare " +
    "repository off this path, or work from a checkout that does not keep it there: git was not " +
    "started here, because this folder, or a folder above it, has that layout (HEAD beside objects " +
    "and refs, or beside commondir). Look at the entries of this folder and of each folder above it " +
    "by name to find that folder, and do not run git in it or in any folder under it, this one " +
    "included. A client's own tools, a flow's session and its sub-agents start git of their own, " +
    "and only the git the engine itself starts is set to refuse such a folder. The steps after " +
    "this one are for when that is done";

  /** The numbered rows under each `next steps` heading, heading first, as the panel printed them. */
  function nextStepBlocks(output: string): string[][] {
    const blocks: string[][] = [];
    for (const line of output.trimEnd().split("\n")) {
      if (line.startsWith("next steps")) blocks.push([line]);
      else if (blocks.length > 0) blocks.at(-1)?.push(line);
    }
    return blocks;
  }

  function numbered(steps: readonly string[]): string[] {
    return steps.map((step, index) => `  ${index + 1}. ${step}`);
  }

  it("opens every client's steps with moving the folder where the look before git refused it", () => {
    expect(refusedFolderSteps("bare-layout")).toEqual([REFUSED_FOLDER_STEP]);
    for (const call of ["git init", "git status", "git diff", "git log", "git rev-parse", "commit"]) {
      expect(REFUSED_FOLDER_STEP, `the step names ${call}`).not.toContain(call);
    }

    const one = renderInitPanel(panelInput({ gitAvailable: false, gitReason: "bare-layout" }));
    expect(nextStepBlocks(one)).toEqual([
      ["next steps:", ...numbered([REFUSED_FOLDER_STEP, ...nextStepsForTool("claude")])],
    ]);

    const several = renderInitPanel(
      panelInput({
        decisions: decisionsFixture({ tools: ["claude", "codex"] }),
        gitAvailable: false,
        gitReason: "bare-layout",
      }),
    );
    expect(nextStepBlocks(several)).toEqual([
      ["next steps (claude):", ...numbered([REFUSED_FOLDER_STEP, ...nextStepsForTool("claude")])],
      ["next steps (codex):", ...numbered([REFUSED_FOLDER_STEP, ...nextStepsForTool("codex")])],
    ]);
  });

  it("keeps the steps as they were where git answers and where there is simply no repository", () => {
    expect(refusedFolderSteps(undefined)).toEqual([]);
    for (const input of [panelInput(), panelInput({ gitAvailable: true }), panelInput({ gitAvailable: false })]) {
      const output = renderInitPanel(input);
      expect(nextStepBlocks(output)).toEqual([["next steps:", ...numbered(nextStepsForTool("claude"))]]);
      expect(output).not.toContain("before you start a client or a flow here");
    }
    // The steps one client gets from a run are untouched by the cause: the step rides ahead of them.
    expect(nextStepsAfterRun("claude", reportFixture(), "/repo")).toEqual(nextStepsForTool("claude"));
  });

  it("emits no ANSI escapes through the identity palette", () => {
    const output = renderInitPanel(
      panelInput({ carry: carryFixture(), mcpServers: ["github"] }),
    );
    expect(output).not.toContain("[");
    expect(output.endsWith("\n")).toBe(true);
  });

  it("keeps every disclosure when the suggestion block is present", () => {
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture(),
        mcpServers: ["github"],
        report: reportFixture([
          { path: "a.md", action: "created" },
          { path: "b.md", action: "skipped", warning: "b.md is user-owned - left alone" },
        ]),
        stackSuggestions: [suggestion("next", "framework")],
      }),
    );

    // A new section must not displace the ones a user has to read: a skipped
    // write under a "ready" headline is how a repo goes quietly red.
    expect(output).toContain("-> installed");
    // TEST CHANGE (sw26-engine-cli-call-form, REQ-FLOW-002): the change
    // instruction names the pinned npx call instead of a bare `stamity config`
    // that only a global install provides. Same claim, the runnable spelling.
    expect(output).toContain(`(tier: solo, change with \`${npxCommand("config")}\`)`);
    expect(output).toContain("migrated: 2 learning(s) carried");
    expect(output).toContain("security:");
    expect(output).toContain("warning: b.md is user-owned - left alone");
    expect(output).toContain("detected stacks with no dedicated guidance yet:");
    expect(output).toContain("next steps:");
  });
});

/**
 * REQ-FLOW-007: init's output names the plain-venv pins it recorded, and says
 * they are POSIX-only rather than guessing another layout's path.
 */
describe("renderInitPanel — REQ-FLOW-007 gate pins", () => {
  const PINS = {
    test: ".venv/bin/python -m pytest",
    lint: ".venv/bin/python -m ruff check .",
    typecheck: ".venv/bin/python -m mypy src",
  };

  it("names each pinned gate, where it is recorded, and that it is POSIX-only", () => {
    const output = renderInitPanel(panelInput({ decisions: decisionsFixture({ gatePins: PINS }) }));
    const line = output.split("\n").find((row) => row.includes("gates pinned"));

    expect(line).toBeDefined();
    expect(line).toContain("test `.venv/bin/python -m pytest`");
    expect(line).toContain("lint `.venv/bin/python -m ruff check .`");
    expect(line).toContain("typecheck `.venv/bin/python -m mypy src`");
    expect(line).toContain("gates.test");
    expect(line).toContain("POSIX");
    expect(line).toContain("Windows");
    // Stated, never guessed: no Windows interpreter path is printed.
    expect(line).not.toMatch(/Scripts|\\/);
    // The pin line sits in the disclosure block, above the next steps.
    expect(output.indexOf("gates pinned")).toBeLessThan(output.indexOf("next steps:"));
  });

  it("prints no pin line when init recorded none", () => {
    const output = renderInitPanel(panelInput());

    expect(output).not.toContain("gates pinned");
  });
});

describe("renderInitPanel — the CLI call form (REQ-FLOW-002)", () => {
  /** A bare call: `stamity <verb>` not preceded by a word, scope, path or version character. */
  const BARE_CALL =
    /(?<![\w@/.:-])stamity (init|sync|check|add|clean|config|learn|handoff|ledger|validate|workspace|worktree|plugin)\b/;

  it("prints no bare CLI call on its fullest render", () => {
    // Every branch that names a verb: the tier line, the predecessor residue
    // with its live-wiring line, and an installable stack suggestion. The
    // panel prints before the operator's first agent turn, and a bare verb
    // there fails on the documented `npx` setup, which installs no binary.
    const output = renderInitPanel(
      panelInput({
        carry: carryFixture(),
        residue: {
          paths: ["/repo/.prior", ".claude/settings.json"],
          unownedSettingsPath: ".claude/settings.json",
        },
        stackSuggestions: [
          { name: "next", kind: "framework", tier: "partial", action: "Install the nextjs pack", packId: "nextjs" },
        ],
      }),
    );

    // Activated: every verb-bearing branch rendered, each with the pinned call.
    expect(output).toContain(npxCommand("config"));
    expect(output).toContain(npxCommand("check"));
    expect(output).toContain(npxCommand("sync"));
    expect(output).toContain(npxCommand("add nextjs"));
    const bare = output.split("\n").filter((line) => BARE_CALL.test(line));
    expect(bare).toEqual([]);
  });
});
