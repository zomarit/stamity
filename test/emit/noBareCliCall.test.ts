import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildConfigTamperNoticeScript } from "../../src/hooks/scripts.ts";
import { cliCallHint, pinnedCliCall } from "../../src/shared/cliCall.ts";
import { TOOLS } from "../../src/types/core.ts";
import {
  artifactTypesByPath,
  emittedPaths,
  makeGoldenRepo,
  readEmittedTree,
  GOLDEN_ENGINE_VERSION,
  type GoldenRepo,
} from "./goldenFixture.ts";

/**
 * REQ-FLOW-002, the engine half: every file the engine renders from a template
 * — hook scripts, guards, client hook configuration, settings — names the CLI
 * in a form that runs. A bare `stamity <verb>` resolves only where a global
 * install put the binary on PATH, which the documented `npx` setup never does,
 * so a hint that spells it sends the reader at a command that is not there.
 * The corpus bodies are `test/corpus/cliCallForm.test.ts`'s; the init panel's
 * half is `test/cli/commands/initPanel.test.ts`.
 *
 * The one admitted spelling of the bare verb is inside a `cliCallHint`
 * sentence, which names the installed form AND the pinned fallback together.
 */

/** A bare call: `stamity <verb>` not preceded by a word, scope, path or version character. */
const BARE_CALL =
  /(?<![\w@/.:-])stamity (init|sync|check|add|clean|config|learn|handoff|ledger|validate|workspace|worktree|plugin)\b/;

/** One `cliCallHint` sentence, whatever package and version it pins. */
const HINT_SENTENCE = /`stamity [^`]+` where the CLI is installed, else `npx -y [^`\s]+@[^`\s]+ [^`]+`/g;

/** `path:line: text` for every bare call left once the hint sentences are removed. */
function bareCalls(path: string, content: string): string[] {
  return content
    .split("\n")
    .map((line, index) => ({ line: line.replace(HINT_SENTENCE, ""), number: index + 1 }))
    .filter(({ line }) => BARE_CALL.test(line))
    .map(({ line, number }) => `${path}:${number}: ${line.trim().slice(0, 160)}`);
}

describe("cliCallHint", () => {
  it("names the installed verb and the pinned fallback in one sentence", () => {
    expect(cliCallHint("@zomarit/stamity", "1.11.0", "check")).toBe(
      "`stamity check` where the CLI is installed, else `npx -y @zomarit/stamity@1.11.0 check`",
    );
  });

  it("pins a fork's own package and passes a multi-word tail through", () => {
    const hint = cliCallHint("@acme/stamity", "1.8.0", "config mcp add <id>");
    expect(hint).toBe(
      "`stamity config mcp add <id>` where the CLI is installed, else `npx -y @acme/stamity@1.8.0 config mcp add <id>`",
    );
    expect(hint).toContain(pinnedCliCall("@acme/stamity", "1.8.0", "config mcp add <id>"));
  });

  it("refuses an unpinnable version as the pinned call does", () => {
    expect(() => cliCallHint("@zomarit/stamity", "latest", "sync")).toThrow(/not semver-shaped/);
  });

  it("is the only spelling the scan admits — the scan itself is not vacuous", () => {
    // Activated input: the same line with and without the hint sentence. The
    // scan must pass the first and flag the second, or it proves nothing.
    const hinted = `Run ${cliCallHint("@zomarit/stamity", "1.0.0", "check")} to diff.`;
    expect(bareCalls("x", hinted)).toEqual([]);
    expect(bareCalls("x", "Run `stamity check` to diff.")).toHaveLength(1);
    expect(bareCalls("x", "run stamity sync")).toHaveLength(1);
    expect(bareCalls("x", "npx -y @zomarit/stamity@1.0.0 sync")).toEqual([]);
  });
});

describe("the tamper notice", () => {
  it("carries the pinned check call it is handed", () => {
    const checkCall = cliCallHint("@zomarit/stamity", GOLDEN_ENGINE_VERSION, "check");
    const script = buildConfigTamperNoticeScript({ checkCall });
    expect(script).toContain("npx -y @zomarit/stamity@1.0.0-golden check");
    expect(bareCalls("notice", script)).toEqual([]);
  });
});

describe("an all-four-client emission", () => {
  let repo: GoldenRepo;
  let tree: Record<string, string>;

  beforeAll(async () => {
    repo = await makeGoldenRepo({ tools: TOOLS });
    tree = await readEmittedTree(repo.rootDir);
  }, 60_000);

  afterAll(async () => {
    await repo.cleanup();
  });

  /**
   * The template-rendered documents: every emitted path the ledger records as
   * `infra` only, minus the Markdown ones. An `infra` Markdown file is a charter
   * projection (AGENTS.md and its client twins), whose text is corpus text and
   * is judged by the corpus suite; everything else of that type — `.mjs` hook
   * scripts and guards, `.json` hook and settings documents, `.toml` config —
   * is shaped by an engine template.
   */
  function templateRendered(): string[] {
    const types = artifactTypesByPath(repo.manifest);
    return emittedPaths(tree).filter((path) => {
      const recorded = types.get(path);
      return (
        recorded !== undefined &&
        [...recorded].every((type) => type === "infra") &&
        !path.endsWith(".md")
      );
    });
  }

  it("prints no bare CLI call outside a cliCallHint sentence", () => {
    const scanned = templateRendered();
    // Non-degenerate: the scan covers each client's hook surface and the
    // scripts the core plans, not an empty list that passes by construction.
    expect(scanned).toEqual(
      expect.arrayContaining([
        ".claude/settings.json",
        ".codex/hooks.json",
        ".cursor/hooks/mcp-guard.mjs",
        ".cursor/hooks/subagent-guard.mjs",
        ".stamity/generated/hooks/claude/stamity-config-tamper-notice.mjs",
      ]),
    );
    const hits = scanned.flatMap((path) => bareCalls(path, tree[path] ?? ""));
    expect(hits).toEqual([]);
  });

  it("pins the golden engine version into the tamper notice of every client", () => {
    for (const tool of TOOLS) {
      const notice = tree[`.stamity/generated/hooks/${tool}/stamity-config-tamper-notice.mjs`];
      expect(notice, tool).toContain("npx -y @zomarit/stamity@1.0.0-golden check");
    }
  });

  it("puts the pinned call into Codex's hooks.json, the file Codex keys its trust to", () => {
    // G3: Codex records hook trust against this file's hash, so the pinned
    // version in it makes Codex re-ask for approval after each upgrade — the
    // accepted cost, stated in the release notes.
    const hooksJson = tree[".codex/hooks.json"] ?? "";
    expect(hooksJson).toContain("npx -y @zomarit/stamity@1.0.0-golden");
    const document = JSON.parse(hooksJson) as {
      description: string;
      hooks: Record<string, { hooks: { command: string; commandWindows: string }[] }[]>;
    };
    expect(document.description).toContain("npx -y @zomarit/stamity@1.0.0-golden check");
    const commands = Object.values(document.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.flatMap((hook) => [hook.command, hook.commandWindows])),
    );
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command).toContain("run npx -y @zomarit/stamity@1.0.0-golden sync");
    }
  });
});
