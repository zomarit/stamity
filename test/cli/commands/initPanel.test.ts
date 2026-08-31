import { describe, expect, it } from "vitest";
import { CLAUDE_COMMANDS_DIR, CLAUDE_SKILLS_DIR } from "../../../src/adapters/claude.ts";
import { CODEX_COMMANDS_DIR } from "../../../src/adapters/codex.ts";
import { COPILOT_PROMPTS_DIR } from "../../../src/adapters/copilot.ts";
import { CURSOR_COMMANDS_DIR } from "../../../src/adapters/cursor.ts";
import type { InitApplyReport } from "../../../src/cli/commands/init/apply.ts";
import {
  MAX_STACK_SUGGESTION_ROWS,
  nextStepsForTool,
  renderInitPanel,
  type InitPanelInput,
} from "../../../src/cli/commands/init/panel.ts";
import type { InitDecisions } from "../../../src/cli/commands/init/plan.ts";
import { makePalette } from "../../../src/cli/kit/terminal.ts";
import { suggestStackPacks, type StackSuggestion } from "../../../src/detect/stackSupport.ts";
import { NATIVE_SKILL_DIRS, SKILLS_PROJECTION_DIR } from "../../../src/emit/skillsProjection.ts";
import type { CarryReport } from "../../../src/migration/carry.ts";
import { TOOLS } from "../../../src/types/core.ts";
import type { MergeResult } from "../../../src/types/content.ts";
import type { RepoInfo } from "../../../src/types/detect.ts";

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
    wrote,
    warnings,
    ledgerCount: wrote.length,
    gitignoreEnsured: true,
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

  it("falls back to a resolvable codex spelling while that client documents no command directory", () => {
    const steps = nextStepsForTool("codex").join("\n");

    if (CODEX_COMMANDS_DIR === null) {
      // No repo-committed command surface exists on this client, so the row
      // points at the vendor-neutral skills tree it does read.
      expect(steps).toContain(SKILLS_PROJECTION_DIR);
      expect(steps).not.toContain("/st-onboard");
    } else {
      expect(steps).toContain(CODEX_COMMANDS_DIR);
      expect(steps).toContain("/st-onboard");
    }
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
      expect(steps).not.toContain("/st-onboard");
    } else {
      expect(steps).toContain(`${NATIVE_SKILL_DIRS.cursor}/st-onboard/SKILL.md`);
      expect(steps).toContain("/st-onboard");
    }

    // A command directory is never a home for a skill, whichever branch ran.
    if (CURSOR_COMMANDS_DIR !== null) {
      expect(steps).not.toContain(`${CURSOR_COMMANDS_DIR}/st-onboard`);
    }
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
    expect(output).toContain("detected typescript, claude traces -> installed claude (2 file(s))");
    expect(output).toContain("(tier: solo, change with `stamity config`)");
  });

  it("carries the maturity tier as a fact with its change instruction", () => {
    const output = renderInitPanel(
      panelInput({ decisions: decisionsFixture({ maturityTier: "team" }) }),
    );

    expect(output).toContain("(tier: team, change with `stamity config`)");
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
    expect(output).toContain("(2 file(s), 1 left alone (already yours))");
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
    expect(output).toContain("`stamity sync` writes it back from the corpus");
    expect(output).toContain("commit this repo before you run it");
    expect(output).toContain("offering to reinstall the old setup, decline");
    // Same discipline the residue line established: no predecessor verb is
    // invented. The preview mode and the end-of-run offer are named as
    // behaviours to look for, conditionally — never as a flag or a subcommand
    // this run never observed.
    expect(output).not.toMatch(/--dry-run|--purge|--yes/);
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
    expect(output).toContain("remove it and run `stamity sync`");
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
    expect(output).toContain(".env.mcp — was added to your .gitignore");
    // The credential half stays conditional: no server, no credential to load.
    expect(output).not.toContain("credentials:");
    expect(output).not.toContain("Before starting your tool");
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
    // The real production entry against the shipped (empty) pack catalog —
    // no fixture catalog, so this asserts what a user actually reads today.
    const live = suggestStackPacks(
      repoInfoFixture({ frameworks: ["next", "react"], languages: ["typescript", "python"] }),
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
      { name: "next", kind: "framework", tier: "partial", action: "Install the nextjs pack: stamity add nextjs", packId: "nextjs" },
    ];

    const output = renderInitPanel(panelInput({ stackSuggestions: withPack }));

    expect(suggestionBlock(output)[0]).toContain("stamity add nextjs");
    // Ordering: the last thing on screen stays the first thing to do.
    expect(output.indexOf("detected stacks with no dedicated")).toBeLessThan(
      output.indexOf("next steps:"),
    );
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

  it("prints one named block per tool when several are targeted", () => {
    const output = renderInitPanel(
      panelInput({ decisions: decisionsFixture({ tools: ["claude", "codex"] }) }),
    );
    expect(output).toContain("next steps (claude):");
    expect(output).toContain("next steps (codex):");
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
    expect(output).toContain("(tier: solo, change with `stamity config`)");
    expect(output).toContain("migrated: 2 learning(s) carried");
    expect(output).toContain("security:");
    expect(output).toContain("warning: b.md is user-owned - left alone");
    expect(output).toContain("detected stacks with no dedicated guidance yet:");
    expect(output).toContain("next steps:");
  });
});
