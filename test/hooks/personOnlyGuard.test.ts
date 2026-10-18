/**
 * u14-shell-guard (REQ-FLOW-101, REQ-FLOW-102, REQ-FLOW-120): the emitted
 * person-only shell guard, run as a real child process in a scratch repository
 * the way a client runs it — fresh process, the payload on stdin, the script at
 * the path emission writes it.
 *
 * No double stands in for anything: the git metadata, the run records and the
 * canary are real files in a temp directory, and the verdicts are u6's own
 * functions, carried into the script as their source text. Each case asserts
 * against the in-process verdict as well as a literal, so the copy and the
 * source cannot drift apart, and every deny case has an allow case one fact
 * away (a branch, a tag, a record, a variable), so a guard that denied
 * everything, or nothing, fails.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitignoreLine } from "../../src/cli/commands/init/panel.ts";
import { PREFLIGHT_CANARY_FILE, REQUIRED_GITIGNORE_ENTRIES } from "../../src/mcp/env.ts";
import { personOnlyVerdict, unattendedPushVerdict } from "../../src/hooks/personOnly.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { assertRulesAdmissible, parseWorktreePolicy, resolveStrategy } from "../../src/worktree/policy.ts";
import { useTempDir } from "../support/tempDir.ts";

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";

const getRepo = useTempDir("person-only-guard");

/**
 * A client's decision: allowed, or stopped, `ask: true` where the client asks the person for one click (v0a2,
 * REQ-FLOW-123). An ask stops the agent as a refusal does, so a check reading `deny` holds for both, as the verdict's
 * own `deny` does.
 */
type Decision = { deny: false } | { deny: true; reason: string; ask?: true };

/** The guard for one client, at `.stamity/generated/hooks/<tool>/`, and the repository it sits in. */
async function placeGuard(tool: Tool, files: Record<string, string> = {}): Promise<string> {
  const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).find(
    (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
  );
  if (guard === undefined) throw new Error("the plan carried no person-only guard");
  await getRepo().seedFiles({
    ...(Object.hasOwn(files, ".git") ? {} : { ".git/HEAD": "ref: refs/heads/feat/x\n" }),
    [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: guard.content,
    ...files,
  });
  return getRepo().path(".stamity", "generated", "hooks", tool, guard.fileName);
}

/** The shell tool a call names: POSIX text, or PowerShell's. */
type Shell = "Bash" | "PowerShell";

/**
 * A shell call as each client hands it to the script: Claude Code natively; Codex
 * and Copilot through the portable runner, which restores `tool_name` and
 * `tool_input` (Copilot's `bash` mapped to `Bash`, its `powershell` to `PowerShell`);
 * Cursor's `beforeShellExecution`, which names no shell.
 */
function payload(tool: Tool, command: string, cwd?: string, shell: Shell = "Bash"): string {
  if (tool === "cursor") return JSON.stringify({ hook_event_name: "beforeShellExecution", command, cwd: cwd ?? "." });
  const extra = tool === "copilot" ? { toolName: shell.toLowerCase() } : { hook_event_name: "PreToolUse" };
  return JSON.stringify({ ...extra, tool_name: shell, tool_input: { command }, ...(cwd === undefined ? {} : { cwd }) });
}

/** Runs the guard as a client does, with the two variables it reads under the test's control. */
function run(guard: string, input: string, env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  const base = { ...process.env };
  delete base.STAMITY_UNATTENDED;
  delete base.STAMITY_REPO_ROOT;
  return spawnSync(process.execPath, [guard], { input, encoding: "utf8", env: { ...base, ...env } });
}

/**
 * The decision a client's output carries: exit 2 and stderr, or the client's own JSON. TEST CHANGE, justified (v0a2,
 * REQ-FLOW-123): Claude Code's guard now also answers ask, its `hookSpecificOutput` on stdout with exit 0, and
 * Copilot's `permissionDecision` reads `ask`; each is read as an ask instead of failing the empty-stdout or
 * deny-only expectation.
 */
function clientDecision(tool: Tool, result: ReturnType<typeof spawnSync>, label: string): Decision {
  const stdout = String(result.stdout).trim();
  if (tool === "claude" && stdout !== "") {
    expect(result.status, label).toBe(0);
    const out = JSON.parse(stdout) as { hookSpecificOutput?: Record<string, string> };
    expect(Object.keys(out), label).toEqual(["hookSpecificOutput"]);
    expect(out.hookSpecificOutput, label).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "ask" });
    return { deny: true, ask: true, reason: out.hookSpecificOutput?.permissionDecisionReason ?? "" };
  }
  if (tool === "claude" || tool === "codex") {
    expect(stdout, label).toBe("");
    if (result.status === 0) return { deny: false };
    expect(result.status, label).toBe(2);
    return { deny: true, reason: String(result.stderr) };
  }
  expect(result.status, label).toBe(0);
  if (tool === "copilot" && stdout === "") return { deny: false };
  const out = JSON.parse(stdout) as Record<string, string>;
  const verdict = tool === "cursor" ? out.permission : out.permissionDecision;
  if (verdict === "allow") return { deny: false };
  if (tool === "copilot" && verdict === "ask") return { deny: true, ask: true, reason: out.permissionDecisionReason ?? "" };
  expect(verdict, label).toBe("deny");
  return { deny: true, reason: tool === "cursor" ? (out.user_message ?? "") : (out.permissionDecisionReason ?? "") };
}

/** The decision each client's output carries for a shell call. */
function decide(tool: Tool, guard: string, command: string, env?: Record<string, string>, cwd?: string, shell?: Shell): Decision {
  return clientDecision(tool, run(guard, payload(tool, command, cwd, shell), env), command);
}

/** The clients that hold an ask (REQ-FLOW-123); Cursor and Codex refuse one, saying why. */
const ASKS = new Set<Tool>(["claude", "copilot"]);
const CANNOT_ASK = "This client cannot ask the person for a click, so the guard refuses it: give the person the exact command.";

/** The sentence a person-only verdict earns attended (v0a2), the act printed as the verdict's own text. */
function told(verdict: { act: string; rule: string; ask: boolean }): string {
  return verdict.ask
    ? `${verdict.act} is a person-only act (\`${verdict.rule}\`): approve it to let the agent run it once (REQ-FLOW-102).`
    : `${verdict.act} deletes, force-pushes or cannot be undone (\`${verdict.rule}\`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command.`;
}

/** The sentence an unattended run earns for a person-only act other than a push (v0a2), before the mode's reason. */
function morningList(verdict: { act: string; rule: string }): string {
  return `${verdict.act} is a person-only act (\`${verdict.rule}\`) and this run is unattended: list it on the morning list, whose walk runs it after one click.`;
}

/** What one client says to an attended person-only verdict: an ask where it holds one, else a refusal. */
function expectedAttended(tool: Tool, verdict: { act: string; rule: string; ask: boolean }): Decision {
  if (verdict.ask && ASKS.has(tool)) return { deny: true, ask: true, reason: expect.stringContaining(told(verdict)) as unknown as string };
  const reason = verdict.ask ? `${told(verdict)} ${CANNOT_ASK}` : told(verdict);
  return { deny: true, reason: expect.stringContaining(reason) as unknown as string };
}

const ON_FEATURE = { defaultBranches: [], currentBranch: "feat/x", tags: ["v1.0.0"] };

/** One case per person-only rule, each beside an allowed neighbour. The repository is on `feat/x`, tag `v1.0.0`. */
const MATRIX: readonly (readonly [command: string, rule: string | null])[] = [
  ["git push --force origin feat/x", "force-push"],
  ["git push -u origin feat/x", null],
  ["git push origin HEAD:main", "push-default"],
  ["git push origin HEAD:refs/heads/stamity/2026-10-16_x", null],
  ["git push origin v1.0.0", "push-tags"],
  ["git push origin v9.9.9", null],
  ["git push origin --delete feat/old", "push-delete"],
  ["git tag v2", "tag"],
  ["git tag -l", null],
  ["gh pr merge 3 --squash", "pr-merge"],
  ["gh pr ready 3", "pr-ready"],
  ["gh pr view 3", null],
  ["gh release create v2", "release"],
  ["gh release view v1", null],
  ["npm publish", "publish"],
  ["npm test", null],
  ["gh secret set TOKEN", "secrets"],
  ["gh api -X PUT repos/o/r/branches/main/protection", "protection"],
  // PowerShell's command string, read by the embedded verdict on every client (build/89).
  ["pwsh -c 'git push --force origin feat/x'", "force-push"],
  ["pwsh -c 'git push origin feat/x'", null],
  // The Windows command interpreter's rest (review/183), a rebase's exec line and a bisect's command (review/184) and a
  // PowerShell script block (review/185), each read by the embedded verdict as its own line.
  ["cmd /c git push --force origin feat/x", "force-push"],
  ["cmd /c git status", null],
  ["git rebase --exec 'git push --force origin feat/x' main", "force-push"],
  ["git rebase --exec 'git status' main", null],
  ["git bisect run git push --force origin feat/x", "force-push"],
  ["git bisect run git status", null],
  ["Invoke-Command -ScriptBlock {git push --force origin feat/x}", "force-push"],
  ["Invoke-Command -ScriptBlock {git status}", null],
  // A close deleting the head branch (review/207) and a review approval (review/210), each beside its neighbour.
  ["gh pr close 3 --delete-branch", "push-delete"],
  ["gh pr close 3", null],
  ["gh pr review 3 --approve", "pr-merge"],
  ["gh pr review 3 --comment -b lgtm", null],
  // A REST review whose body the line cannot show (review/228), beside the same body file on a read.
  ["gh api repos/o/r/pulls/3/reviews --input r.json", "pr-merge"],
  ["gh api -X GET repos/o/r/pulls/3/reviews --input r.json", null],
  ["curl -d @r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -d @r.json https://api.github.com/repos/o/r/pulls/3/comments", null],
  // PR #112's resolution round 1, each beside its neighbour: a JSON body's `ref` (pr/1), a runner behind a package
  // manager's options (pr/3), a shortened push option (pr/9), the interpreter's caret (pr/10), a shortened wget method
  // (pr/11), `git send-pack` (pr/16).
  ["curl -X POST -d '{\"ref\":\"refs/tags/v2\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", "push-tags"],
  ["curl -X POST -d '{\"ref\":\"refs/heads/feat/y\",\"sha\":\"abc\"}' https://api.github.com/repos/o/r/git/refs", null],
  ["npm --workspace mypkg exec -- npm publish", "publish"],
  ["npm --workspace mypkg run build", null],
  ["git push --force-w origin feat/x", "force-push"],
  ["git push --dry-r origin feat/x", null],
  ["cmd /c g^it push --for^ce origin feat/x", "force-push"],
  ["cmd /c g^it status", null],
  // TEST CHANGE (v0a, REQ-FLOW-124): a REST DELETE on a release is now the refuse-class release-delete, here and in
  // the wgetrc `method=DELETE` row below; the guard still denies both.
  ["wget --meth=DELETE https://api.github.com/repos/o/r/releases/1", "release-delete"],
  ["wget https://api.github.com/repos/o/r/releases", null],
  ["wget --me DELETE https://api.github.com/repos/o/r/git/refs/heads/feat/x", "push-delete"],
  ["wget --me=GET https://api.github.com/repos/o/r/releases/1", null],
  // wget's `-e` wgetrc command (pr/23).
  ["wget -e method=DELETE https://api.github.com/repos/o/r/releases/1", "release-delete"],
  ["wget -e robots=off https://api.github.com/repos/o/r/releases", null],
  ["git send-pack git@github.com:o/r.git main", "push-default"],
  ["git send-pack git@github.com:o/r.git feat/x", null],
  // PR #112's resolution round 3, each beside its neighbour: npm's prefix of `publish` and a setting before it (pr/50),
  // Corepack and a versioned manager word (pr/51), a tag ref through `git update-ref` (pr/53), the merge queue (pr/57).
  ["npm pub", "publish"],
  ["npm prune", null],
  ["npm --loglevel silly publish", "publish"],
  ["npm --loglevel silly run publish", null],
  // A boolean option after a setting, and its twins with `run` (pr/66, pr/68).
  ["npm --loglevel silly --json publish", "publish"],
  ["npm --loglevel silly --no-color pub", "publish"],
  ["npm -loglevel silly publish", "publish"],
  ["npm --cache run publish", "publish"],
  ["npm --json run publish", null],
  ["npm --loglevel silly --json run pub", null],
  ["corepack pnpm@9.1.0 publish", "publish"],
  ["corepack pnpm install", null],
  ["git update-ref refs/tags/v2 HEAD", "tag"],
  ["printf 'create refs/tags/v2 HEAD\\n' | git update-ref --stdin", "tag"],
  ["git update-ref refs/heads/feat/y HEAD", null],
  ["gh api graphql -f query='mutation { enqueuePullRequest(input: {pullRequestId: \"x\"}) { mergeQueueEntry { id } } }'", "pr-merge"],
  ["gh api graphql -f query='query { repository(owner:\"o\",name:\"r\") { mergeQueue { entries { totalCount } } } }'", null],
  // PR #112's resolution round 4, each beside its neighbour: a symbolic ref pointed at the default branch (pr/70), a
  // curl request after `--next` (pr/72), a GraphQL repository archive (pr/74).
  ["git symbolic-ref refs/heads/safe refs/heads/main && git push origin safe", "push-default"],
  ["git symbolic-ref refs/heads/a refs/heads/feat/x", null],
  ["curl -X DELETE https://api.github.com/repos/o/r/git/refs/heads/feat --next -X GET https://example.com", "push-delete"],
  ["curl https://a.example --next https://b.example", null],
  ["gh api graphql -f query='mutation { archiveRepository(input: {repositoryId: \"R\"}) { clientMutationId } }'", "protection"],
  ["gh api graphql -f query='query { repository(owner:\"o\",name:\"r\") { isArchived } }'", null],
  // PR #112's resolution round 4b: curl's attached body (pr/81), and `git update-ref --stdin`'s symref commands (pr/82).
  ["curl -d@./r.json https://api.github.com/repos/o/r/pulls/3/reviews", "pr-merge"],
  ["curl -o out.json https://api.github.com/repos/o/r/pulls/3/reviews", null],
  ["printf 'symref-create refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["printf 'symref-create refs/heads/a refs/heads/feat/x\\n' | git update-ref --stdin", null],
  // A method the line shows, the read neighbour of pr/83's refusal (below, as a call it cannot decide).
  ["curl -X POST https://example.com/hook", null],
  // PR #112's resolution round 4d, each beside its neighbour: a second symref command after an escaped line break (pr/82).
  ["printf 'verify refs/heads/x HEAD\\nsymref-create refs/heads/safe refs/heads/main\\n' | git update-ref --stdin", "push-default"],
  ["printf 'verify refs/heads/x HEAD\\nsymref-create refs/heads/a refs/heads/feat/x\\n' | git update-ref --stdin", null],
  // gh's `-i` clustered with its method (pr/83).
  ["gh api -iXDELETE repos/o/r/git/refs/heads/feat", "push-delete"],
  ["gh api -i repos/o/r/git/refs/heads/feat", null],
  // curl's method option through a unique prefix (pr/84).
  ["curl --req DELETE https://api.github.com/repos/o/r/git/refs/heads/feat", "push-delete"],
  ["curl --sil https://api.github.com/repos/o/r/git/refs/heads/feat", null],
  // PR #112's resolution round 5, each beside its neighbour: a path's dot segments resolved (pr/93), `gh repo sync` onto
  // a named repository (pr/94), `gh repo unarchive` (pr/96).
  ["curl -X DELETE https://api.github.com/repos/o/r/tmp/../git/refs/heads/feature", "push-delete"],
  ["curl https://api.github.com/repos/o/r/tmp/../git/refs/heads/feature", null],
  ["gh repo sync o/r", "push-default"],
  ["gh repo sync o/r --force", "force-push"],
  ["gh repo sync o/r --branch feat/y", null],
  ["gh repo sync", null],
  ["gh repo unarchive o/r --yes", "protection"],
  ["gh repo view o/r", null],
];

describe("the person-only guard, on every client", () => {
  it.each(TOOLS)("%s: denies each person-only act and allows its neighbour, as u6's verdict says", async (tool) => {
    const guard = await placeGuard(tool, { ".git/refs/tags/v1.0.0": "0".repeat(40) });
    for (const [command, rule] of MATRIX) {
      const source = personOnlyVerdict(command, ON_FEATURE);
      expect(source.deny ? source.rule : null, command).toBe(rule);
      const decision = decide(tool, guard, command);
      expect(decision.deny, `${tool}: ${command}`).toBe(rule !== null);
      // TEST CHANGE, justified (v0a2, REQ-FLOW-123, REQ-FLOW-124): the client no longer prints the verdict's `reason`;
      // it asks with the ask sentence where it holds an ask, and refuses with the refuse sentence, or with the ask
      // sentence and why it cannot ask, so each row now pins the client's answer to the verdict's class.
      if (source.deny) expect(decision, `${tool}: ${command}`).toEqual(expectedAttended(tool, source));
    }
  });

  it.each(TOOLS.filter((tool) => tool !== "cursor"))(
    "%s: reads the PowerShell tool's backslash as a plain character, so a Windows-path git reads as git (review/194)",
    async (tool) => {
      const guard = await placeGuard(tool);
      // The guard reads the PowerShell tool's text as PowerShell's command string, beside the text as it stands.
      const asPowerShell = (command: string): string => `pwsh -Command '${command.replaceAll("'", "'\\''")}'`;
      const forced = String.raw`C:\Git\bin\git.exe push --force origin feat/x`;
      const source = personOnlyVerdict(asPowerShell(forced), ON_FEATURE);
      expect(source).toMatchObject({ deny: true, rule: "force-push" });
      // TEST CHANGE, justified (v0a2, REQ-FLOW-124): the client prints the refuse sentence, not the verdict's reason.
      expect(decide(tool, guard, forced, undefined, undefined, "PowerShell")).toEqual({ deny: true, reason: expect.stringContaining(source.deny ? told(source) : "") });
      const status = String.raw`C:\Git\bin\git.exe status`;
      expect(personOnlyVerdict(asPowerShell(status), ON_FEATURE)).toEqual({ deny: false });
      expect(decide(tool, guard, status, undefined, undefined, "PowerShell").deny).toBe(false);
      // A POSIX shell line keeps its escape: there the program is `C:Gitbingit.exe`, no git.
      expect(personOnlyVerdict(forced, ON_FEATURE)).toEqual({ deny: false });
      expect(decide(tool, guard, forced).deny).toBe(false);
    },
  );

  it.each(TOOLS)("%s: allows a call that is not a shell call at once", async (tool) => {
    const guard = await placeGuard(tool);
    const read = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "git push --force" } });
    const result = run(guard, read);
    expect(result.status).toBe(0);
    expect(String(result.stdout).trim()).toBe(tool === "cursor" ? '{"permission":"allow"}' : "");
  });

  it.each(TOOLS)("%s: fails closed on a payload it cannot read", async (tool) => {
    const guard = await placeGuard(tool);
    const decisions = ["{not json", JSON.stringify({ tool_name: "Bash", tool_input: {} })].map((input) => {
      const result = run(guard, input);
      return tool === "claude" || tool === "codex" ? result.status : String(result.stdout);
    });
    for (const decision of decisions) expect(decision).toEqual(tool === "claude" || tool === "codex" ? 2 : expect.stringContaining("deny"));
  });
});

/**
 * v0a2 (REQ-FLOW-123, REQ-FLOW-124, REQ-FLOW-120): each client's answer to a person-only act, as conformance rows —
 * the input form, then what each client prints. Each ask row sits beside the fact that turns it into a refusal (an
 * unattended record, a fault reading the mode, a refused act in another reading), so a guard that only ever asked, or
 * only ever refused, fails.
 */
describe("each client's answer to a person-only act (v0a2)", () => {
  const MERGE = "gh pr merge 1";
  const UNATTENDED = { ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") };
  const WHY = "This session is unattended because .stamity/runs/2026-10-18_x/record.md reads `Status: in progress` and `Mode: unattended`.";
  const merge = personOnlyVerdict(MERGE, ON_FEATURE);

  /** Claude Code's PreToolUse payload for a GitHub MCP tool call. */
  const mcpCall = (tool: string): string =>
    JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { owner: "o", repo: "r", pullNumber: 1 } });

  it.each(TOOLS)("%s: asks for an attended merge where it holds an ask, and refuses it unattended with the morning-list reason", async (tool) => {
    expect(merge).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    if (!merge.deny) return;
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, MERGE)).toEqual(expectedAttended(tool, merge));
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, MERGE)).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(merge)} ${WHY}`) });
  });

  it.each(["claude", "copilot"] as const)("%s: prints its ask byte for byte, on stdout with exit 0", async (tool) => {
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const reason = told(merge);
    const result = run(await placeGuard(tool), payload(tool, MERGE));
    expect(result.status).toBe(0);
    expect(String(result.stderr)).toBe("");
    const shape =
      tool === "claude"
        ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } }
        : { permissionDecision: "ask", permissionDecisionReason: reason };
    expect(String(result.stdout)).toBe(`${JSON.stringify(shape)}\n`);
  });

  it.each([...ASKS])("%s: refuses an ask whose mode read faults, and asks at the ceiling", async (tool) => {
    const guard = await placeGuard(tool);
    // At the ceiling every head is read, none open: the merge asks. One folder more is a fault, which refuses.
    for (let n = 1; n <= 2_000; n += 1) mkdirSync(getRepo().path(".stamity", "runs", `2026-10-18_r${n}`), { recursive: true });
    expect(decide(tool, guard, MERGE)).toMatchObject({ deny: true, ask: true });
    mkdirSync(getRepo().path(".stamity", "runs", "2026-10-18_r2001"));
    expect(decide(tool, guard, MERGE)).toEqual({ deny: true, reason: expect.stringMatching(/could not decide this shell call \(RUN_FOLDERS_OVER_2000 on .*runs\)/) });
  });

  it.each(TOOLS)("%s: refuses a force push of the default branch, attended, with the refuse sentence", async (tool) => {
    const forced = personOnlyVerdict("git push --force origin main", ON_FEATURE);
    expect(forced).toMatchObject({ deny: true, rule: "force-push", ask: false });
    if (!forced.deny) return;
    expect(decide(tool, await placeGuard(tool), "git push --force origin main")).toEqual(expectedAttended(tool, forced));
  });

  it.each([...ASKS])("%s: refuses a PowerShell call whose pwsh reading shows a forced refspec its POSIX reading does not", async (tool) => {
    // POSIX reads the backtick as a command substitution, so the line shows the merge alone; PowerShell reads it as
    // the escape, so its reading shows a `+main` refspec. The refused reading wins over the ask.
    const line = "gh pr merge 1; git push origin `+main";
    expect(personOnlyVerdict(line, ON_FEATURE)).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    const forced = personOnlyVerdict(`pwsh -Command '${line}'`, ON_FEATURE);
    expect(forced).toMatchObject({ deny: true, rule: "force-push", ask: false });
    if (!forced.deny) return;
    expect(decide(tool, await placeGuard(tool), line, undefined, undefined, "PowerShell")).toEqual({ deny: true, reason: expect.stringContaining(told(forced)) });
    // The neighbour: the same line on the Bash tool is read once, as POSIX, and asks.
    expect(decide(tool, await placeGuard(tool), line)).toMatchObject({ deny: true, ask: true });
  });

  it.each(TOOLS)("%s: refuses a merge beside an HTTP call whose target the line hides, never asking", async (tool) => {
    expect(decide(tool, await placeGuard(tool), `${MERGE}; curl -K req.cfg`)).toEqual({
      deny: true,
      reason: expect.stringContaining("could not decide this shell call (HTTP_TARGET_HIDDEN)"),
    });
  });

  it("asks for a GitHub MCP merge attended, refuses it unattended, refuses the repository deletion, and passes a read", async () => {
    const guard = await placeGuard("claude");
    const read = (tool: string): Decision => clientDecision("claude", run(guard, mcpCall(tool)), tool);
    const act = "A call to the GitHub MCP server";
    expect(read("mcp__github__merge_pull_request")).toEqual({
      deny: true,
      ask: true,
      reason: `${act} is a person-only act (\`mcp__github__merge_pull_request\`): approve it to let the agent run it once (REQ-FLOW-102).`,
    });
    expect(read("mcp__github__create_pull_request")).toMatchObject({ deny: true, ask: true });
    expect(read("mcp__github__delete_repository")).toEqual({
      deny: true,
      reason: expect.stringContaining(
        `${act} deletes, force-pushes or cannot be undone (\`mcp__github__delete_repository\`): it stays the person's to run, even with approval (REQ-FLOW-124).`,
      ),
    });
    expect(read("mcp__github__get_file_contents")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(read("mcp__github__merge_pull_request")).toEqual({
      deny: true,
      reason: expect.stringContaining(
        `${act} is a person-only act (\`mcp__github__merge_pull_request\`) and this run is unattended: list it on the morning list, whose walk runs it after one click. ${WHY}`,
      ),
    });
    expect(read("mcp__github__delete_repository")).toMatchObject({ deny: true, reason: expect.stringContaining("(REQ-FLOW-124)") });
    expect(read("mcp__github__get_file_contents")).toEqual({ deny: false });
  });

  /** The sentence an attended ask-class act earns when a sub-agent runs it (review/72). */
  const bySubAgent = (verdict: { act: string; rule: string }): string =>
    `${verdict.act} is a person-only act (\`${verdict.rule}\`) and a sub-agent runs it: the act is the person's, so only the main thread may ask for it (REQ-FLOW-102). Give the person the exact command.`;
  /** The sentence an attended ask-class act earns in Claude Code's `auto` permission mode (review/75). */
  const inAutoMode = (verdict: { act: string; rule: string }): string =>
    `${verdict.act} is a person-only act (\`${verdict.rule}\`) and this session runs in the \`auto\` permission mode, where a classifier may settle the prompt: it stays the person's to run (REQ-FLOW-102). Give the person the exact command.`;
  /** A client's shell-call payload for the merge, with the given fields beside it. */
  const mergeWith = (tool: Tool, fields: Record<string, string>): string => JSON.stringify({ ...JSON.parse(payload(tool, MERGE)), ...fields });

  it.each(TOOLS)("%s: refuses an attended ask-class act a sub-agent runs, naming the act the person's, while the main thread asks (review/72)", async (tool) => {
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const guard = await placeGuard(tool);
    const read = (fields: Record<string, string>): Decision => clientDecision(tool, run(guard, mergeWith(tool, fields)), JSON.stringify(fields));
    // Each identity field the core guard reads, the agent's type and its instance alike.
    for (const fields of [
      { agent_type: "stamity-test-runner", agent_id: "a1" },
      { agent_id: "a1" },
      { subagent_type: "general-purpose" },
      { agentType: "stamity-fixer" },
      { subagentType: "x" },
      { subagent_id: "a2" },
    ]) {
      expect(read(fields), JSON.stringify(fields)).toEqual({ deny: true, reason: expect.stringContaining(bySubAgent(merge)) });
    }
    // The main thread, its identity fields absent or empty, asks as before.
    expect(read({})).toEqual(expectedAttended(tool, merge));
    expect(read({ agent_type: "", agent_id: "" })).toEqual(expectedAttended(tool, merge));
    // A refuse-class act from a sub-agent keeps the refuse sentence.
    const forced = personOnlyVerdict("git push --force origin main", ON_FEATURE);
    if (!forced.deny) throw new Error("the force push is no person-only act");
    const line = JSON.stringify({ ...JSON.parse(payload(tool, "git push --force origin main")), agent_id: "a1" });
    expect(clientDecision(tool, run(guard, line), "forced")).toEqual({ deny: true, reason: expect.stringContaining(told(forced)) });
    // Unattended, the sub-agent's act keeps the morning-list reason.
    await getRepo().seedFiles(UNATTENDED);
    expect(read({ agent_id: "a1" })).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(merge)} ${WHY}`) });
  });

  it.each(TOOLS)("%s: refuses an attended ask-class act in Claude Code's auto permission mode, and asks in the other modes (review/75)", async (tool) => {
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const guard = await placeGuard(tool);
    const read = (mode: string): Decision => clientDecision(tool, run(guard, mergeWith(tool, { permission_mode: mode })), mode);
    expect(read("auto")).toEqual({ deny: true, reason: expect.stringContaining(inAutoMode(merge)) });
    for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk"]) {
      expect(read(mode), mode).toEqual(expectedAttended(tool, merge));
    }
  });

  it("refuses a GitHub MCP merge a sub-agent calls or one in the auto permission mode, and asks for the main thread's (review/72, review/75)", async () => {
    const guard = await placeGuard("claude");
    const call = (fields: Record<string, string>): Decision =>
      clientDecision("claude", run(guard, JSON.stringify({ ...JSON.parse(mcpCall("mcp__github__merge_pull_request")), ...fields })), JSON.stringify(fields));
    const verdict = { act: "A call to the GitHub MCP server", rule: "mcp__github__merge_pull_request" };
    expect(call({ agent_type: "stamity-implementer", agent_id: "a1" })).toEqual({ deny: true, reason: expect.stringContaining(bySubAgent(verdict)) });
    expect(call({ permission_mode: "auto" })).toEqual({ deny: true, reason: expect.stringContaining(inAutoMode(verdict)) });
    expect(call({ permission_mode: "default" })).toMatchObject({ deny: true, ask: true });
  });
});

describe("the nested-command depth limit (pr/58)", () => {
  /** `line` inside `layers` literal `sh -c` layers, each quoted for the one around it. */
  const nest = (line: string, layers: number): string => {
    let text = line;
    for (let layer = 0; layer < layers; layer += 1) text = `sh -c '${text.replace(/'/g, "'\\''")}'`;
    return text;
  };

  it.each(TOOLS)("%s: refuses a line past depth 4 as one it cannot decide, and reads one four layers down", async (tool) => {
    const guard = await placeGuard(tool);
    for (const line of ["git push --force origin feat/x", "git status"]) {
      expect(decide(tool, guard, nest(line, 5)), line).toEqual({ deny: true, reason: expect.stringContaining("could not decide this shell call (NESTING_DEPTH)") });
    }
    const forced = personOnlyVerdict(nest("git push --force origin feat/x", 4), ON_FEATURE);
    expect(forced).toMatchObject({ deny: true, rule: "force-push" });
    // TEST CHANGE, justified (v0a2, REQ-FLOW-124): the client prints the refuse sentence, not the verdict's reason.
    expect(decide(tool, guard, nest("git push --force origin feat/x", 4))).toEqual({ deny: true, reason: expect.stringContaining(forced.deny ? told(forced) : "") });
    expect(decide(tool, guard, nest("git status", 4)).deny).toBe(false);
  });
});

describe("an HTTP call whose method or target the line cannot show (pr/73, pr/76, pr/77, pr/83)", () => {
  it.each(TOOLS)("%s: refuses it as a call it cannot decide, and allows its read neighbour", async (tool) => {
    const guard = await placeGuard(tool);
    for (const line of [
      "curl -K req.cfg",
      "curl -X PATCH -d x 'https://api.github.com/repos/o/r/git/refs/heads/{a,main}'",
      "wget --method DELETE -i urls.txt",
      "M=DELETE; curl -X \"$M\" https://api.github.com/repos/o/r/git/refs/heads/main",
      // The same method attached in a short cluster (round 4d).
      "M=DELETE; curl -sX$M https://api.github.com/repos/o/r/git/refs/heads/main",
      // A configuration file named through a prefix of `--config` (pr/84).
      "curl --co req.cfg",
    ]) {
      expect(decide(tool, guard, line), line).toEqual({ deny: true, reason: expect.stringContaining("could not decide this shell call (HTTP_TARGET_HIDDEN)") });
    }
    for (const line of ["curl https://api.github.com/repos/o/r", "curl 'https://example.com/p[1-3].html'", "wget -i urls.txt",
      "curl -X GET https://api.github.com/repos/o/r", "curl -sXGET https://api.github.com/repos/o/r"]) {
      expect(decide(tool, guard, line).deny, line).toBe(false);
    }
  });
});

describe("Cursor's beforeShellExecution with no command string (review/215)", () => {
  it("refuses it as a shell call it cannot read, never as a call that is no shell call", async () => {
    const guard = await placeGuard("cursor");
    const shapes = [
      { hook_event_name: "beforeShellExecution", cwd: "." },
      { hook_event_name: "beforeShellExecution", command: ["git", "push", "--force"], cwd: "." },
      { hook_event_name: "beforeShellExecution", tool_name: "Shell", tool_input: { command: "git status" } },
      { cwd: "." },
      {},
    ];
    for (const shape of shapes) {
      const out = JSON.parse(String(run(guard, JSON.stringify(shape)).stdout).trim()) as Record<string, string>;
      expect(out.permission, JSON.stringify(shape)).toBe("deny");
      expect(out.user_message, JSON.stringify(shape)).toContain("NO_COMMAND");
    }
    // Non-degenerate: the same event carrying its command string is read and allowed.
    expect(decide("cursor", guard, "git status")).toEqual({ deny: false });
  });
});

describe("the local tags read only for a push (review/218)", () => {
  it("walks refs/tags for a push refspec alone", async () => {
    const guard = await placeGuard("claude", { ".git/refs/tags/v1.0.0": "0".repeat(40) });
    // Observes the guard's own reads: a preload marks each listing of a `refs/tags` directory on stderr, the ESM named
    // imports synced to the patched function.
    await getRepo().seedFiles({
      "probe.cjs": [
        "const fs = require('node:fs');",
        "const { syncBuiltinESMExports } = require('node:module');",
        "const list = fs.readdirSync;",
        "fs.readdirSync = function (path, ...rest) {",
        "  if (String(path).replaceAll('\\\\', '/').endsWith('refs/tags')) process.stderr.write('tags listed\\n');",
        "  return list.call(this, path, ...rest);",
        "};",
        "syncBuiltinESMExports();",
      ].join("\n"),
    });
    const probe = getRepo().path("probe.cjs");
    const probed = (command: string): { status: number | null; stderr: string; stdout: string } => {
      const base = { ...process.env };
      delete base.STAMITY_UNATTENDED;
      delete base.STAMITY_REPO_ROOT;
      const result = spawnSync(process.execPath, ["--require", probe, guard], { input: payload("claude", command), encoding: "utf8", env: base });
      return { status: result.status, stderr: String(result.stderr), stdout: String(result.stdout) };
    };
    for (const command of ["ls -la", "git status", "git fetch origin", "git push"]) {
      expect(probed(command), command).toEqual({ status: 0, stderr: "", stdout: "" });
    }
    expect(probed("git push origin feat/x")).toEqual({ status: 0, stderr: "tags listed\n", stdout: "" });
    // TEST CHANGE, justified (v0a2, REQ-FLOW-123): a tag push is ask-class, so attended Claude Code's guard asks on
    // stdout with exit 0 where it refused on exit 2; the tags are still listed, and the rule is still named.
    const tagPush = probed("git push origin v1.0.0");
    expect(tagPush.status).toBe(0);
    expect(tagPush.stderr).toBe("tags listed\n");
    expect(tagPush.stdout).toContain('"permissionDecision":"ask"');
    expect(tagPush.stdout).toContain("push-tags");
  });
});

describe("the local tags past their ceilings (pr/95)", () => {
  /** `packed-refs` text naming `count` tags, `t0` up. */
  const packed = (count: number): string =>
    ["# pack-refs with: peeled fully-peeled sorted", ...Array.from({ length: count }, (_, n) => `${"a".repeat(40)} refs/tags/t${n}`), ""].join("\n");
  const CANNOT = (code: string): Decision => ({ deny: true, reason: expect.stringContaining(`could not decide this shell call (${code} on `) });
  // The calls that read no tag: a status, a fetch, a refspec-less push off the default branch.
  const NO_TAGS = ["git status", "git fetch origin", "git push"];

  it.each(TOOLS)("%s: reads exactly 10,000 tags whole, and refuses a refspec push past them, naming the code", async (tool) => {
    // One loose tag and 9,999 packed ones: the ceiling, every one read, the last packed one among them.
    const guard = await placeGuard(tool, { ".git/refs/tags/v1.0.0": "0".repeat(40), ".git/packed-refs": packed(9_999) });
    expect(decide(tool, guard, "git push origin t9998")).toMatchObject({ deny: true, reason: expect.stringContaining("push-tags") });
    expect(decide(tool, guard, "git push origin v9.9.9").deny).toBe(false);
    // A packed tag also loose counts once, so the list is still at the ceiling.
    await getRepo().seedFiles({ ".git/refs/tags/t0": "0".repeat(40) });
    expect(decide(tool, guard, "git push origin t9998")).toMatchObject({ deny: true, reason: expect.stringContaining("push-tags") });
    // One packed tag more.
    await getRepo().seedFiles({ ".git/packed-refs": packed(10_000) });
    for (const command of ["git push origin t9999", "git push origin v9.9.9"]) {
      expect(decide(tool, guard, command), command).toEqual(CANNOT("TAG_NAMES_OVER_10000"));
    }
    for (const command of NO_TAGS) expect(decide(tool, guard, command).deny, command).toBe(false);
  });

  it.each(TOOLS)("%s: refuses a refspec push past 10,001 loose tags, naming the code, and no call that reads none", async (tool) => {
    const guard = await placeGuard(tool);
    const dir = getRepo().path(".git", "refs", "tags");
    mkdirSync(dir, { recursive: true });
    for (let n = 0; n <= 10_000; n += 1) writeFileSync(join(dir, `t${n}`), "0".repeat(40));
    expect(decide(tool, guard, "git push origin v9.9.9")).toEqual(CANNOT("TAG_NAMES_OVER_10000"));
    for (const command of NO_TAGS) expect(decide(tool, guard, command).deny, command).toBe(false);
  });

  it.each(TOOLS)("%s: refuses a refspec push when packed-refs is past 8 MiB, naming the code", async (tool) => {
    const guard = await placeGuard(tool, { ".git/packed-refs": packed(1) });
    expect(decide(tool, guard, "git push origin t0")).toMatchObject({ deny: true, reason: expect.stringContaining("push-tags") });
    // The same file one byte past the ceiling.
    const text = packed(1);
    await getRepo().seedFiles({ ".git/packed-refs": text + "#".repeat(8_388_609 - text.length) });
    expect(decide(tool, guard, "git push origin v9.9.9")).toEqual(CANNOT("PACKED_REFS_OVER_8388608"));
    for (const command of NO_TAGS) expect(decide(tool, guard, command).deny, command).toBe(false);
  });
});

describe("the branch context read from .git", () => {
  it("denies a refspec-less push on main and allows it on a feature branch", async () => {
    const onMain = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/main\n" });
    expect(decide("claude", onMain, "git push").deny).toBe(true);
    expect(decide("claude", onMain, "git push origin HEAD").deny).toBe(true);
    const onFeature = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/feat/x\n" });
    expect(decide("claude", onFeature, "git push").deny).toBe(false);
  });

  it("reads the default branch from origin's HEAD and the tags from packed-refs", async () => {
    const guard = await placeGuard("claude");
    expect(decide("claude", guard, "git push origin trunk").deny).toBe(false);
    expect(decide("claude", guard, "git push origin v3.0.0").deny).toBe(false);
    await getRepo().seedFiles({
      ".git/refs/remotes/origin/HEAD": "ref: refs/remotes/origin/trunk\n",
      ".git/packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${"a".repeat(40)} refs/tags/v3.0.0\n^${"b".repeat(40)}\n`,
    });
    expect(decide("claude", guard, "git push origin trunk")).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    expect(decide("claude", guard, "git push origin v3.0.0")).toMatchObject({ deny: true, reason: expect.stringContaining("push-tags") });
  });

  it("follows a worktree's gitdir file to its HEAD, and its commondir to the tags", async () => {
    const guard = await placeGuard("claude", {
      ".git": "gitdir: main/.git/worktrees/lane\n",
      "main/.git/worktrees/lane/HEAD": "ref: refs/heads/main\n",
      "main/.git/worktrees/lane/commondir": "../..\n",
      "main/.git/refs/tags/lane/v1": "0".repeat(40),
    });
    expect(decide("claude", guard, "git push").deny).toBe(true);
    expect(decide("claude", guard, "git push origin lane/v1").deny).toBe(true);
    expect(decide("claude", guard, "git push origin lane/v2").deny).toBe(false);
  });

  it("counts an implied destination as the default branch when .git cannot be read, and main and master always", async () => {
    const guard = await placeGuard("claude", { ".git": "not a pointer\n" });
    expect(decide("claude", guard, "git push origin master").deny).toBe(true);
    expect(decide("claude", guard, "git push")).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    expect(decide("claude", guard, "git push origin HEAD").deny).toBe(true);
    expect(decide("claude", guard, "git push origin feat/x").deny).toBe(false);
  });
});

/** A root checkout on `feat/x` with two linked worktrees beside it: `wt-main` on main, `wt-feat` on `feat/y`. */
const LINKED: Record<string, string> = {
  ".git/HEAD": "ref: refs/heads/feat/x\n",
  "wt-main/.git": "gitdir: ../.git/worktrees/wt-main\n",
  "wt-main/src/index.ts": "",
  ".git/worktrees/wt-main/HEAD": "ref: refs/heads/main\n",
  ".git/worktrees/wt-main/commondir": "../..\n",
  "wt-feat/.git": "gitdir: ../.git/worktrees/wt-feat\n",
  ".git/worktrees/wt-feat/HEAD": "ref: refs/heads/feat/y\n",
  ".git/worktrees/wt-feat/commondir": "../..\n",
};

describe("the branch read where the command runs", () => {
  it.each(TOOLS)("%s: reads the payload's working directory, a subdirectory's nearest .git included", async (tool) => {
    const guard = await placeGuard(tool, LINKED);
    expect(decide(tool, guard, "git push").deny).toBe(false);
    for (const cwd of [getRepo().path("wt-main"), getRepo().path("wt-main", "src"), "wt-main"]) {
      expect(decide(tool, guard, "git push", undefined, cwd), cwd).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
    expect(decide(tool, guard, "git push", undefined, getRepo().path("wt-feat")).deny).toBe(false);
  });

  it("refuses no feature worktree's push because the root is on the default branch", async () => {
    const guard = await placeGuard("claude", { ...LINKED, ".git/HEAD": "ref: refs/heads/main\n" });
    expect(decide("claude", guard, "git push").deny).toBe(true);
    expect(decide("claude", guard, "git push", undefined, getRepo().path("wt-feat")).deny).toBe(false);
    expect(decide("claude", guard, "git push origin HEAD", undefined, getRepo().path("wt-feat")).deny).toBe(false);
  });

  it("reads git's -C and --git-dir options, GIT_DIR, and a cd or pushd on the line", async () => {
    const guard = await placeGuard("claude", LINKED);
    const denied = [
      "git -C wt-main push",
      "git -C wt-main/src push origin HEAD",
      "git -C wt-feat -C ../wt-main push",
      "git --git-dir=.git/worktrees/wt-main push",
      "git --git-dir .git/worktrees/wt-main push",
      "GIT_DIR=.git/worktrees/wt-main git push",
      "cd wt-main && git push",
      "cd 'wt-main' ; git push",
      "pushd wt-main && git push",
      "env -C wt-main git push",
      "env -u X --chdir=wt-main git push",
      "sh -c 'cd wt-main && git push'",
      "bash -lc \"git -C wt-main push\"",
    ];
    for (const command of denied) expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    for (const command of ["git -C wt-feat push", "cd wt-feat && git push", "git -C wt-main log && git push origin feat/x"]) {
      expect(decide("claude", guard, command).deny, command).toBe(false);
    }
  });

  it("reads a path after a cd against the cd's directory as well as the working directory", async () => {
    // `a/wt` is a worktree on main; a plain `wt/` at the root sits in the root checkout, on `feat/x`.
    const guard = await placeGuard("claude", {
      ...LINKED,
      "a/wt/.git": "gitdir: ../../.git/worktrees/nested\n",
      ".git/worktrees/nested/HEAD": "ref: refs/heads/main\n",
      ".git/worktrees/nested/commondir": "../..\n",
      "wt/readme.md": "",
    });
    expect(decide("claude", guard, "git -C wt push").deny).toBe(false);
    for (const command of ["cd a && git -C wt push", "cd a && cd wt && git push", "cd a; GIT_DIR=../.git/worktrees/nested git push", "env -C a git -C wt push"]) {
      expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
  });

  it("counts an implied destination as the default branch where the place cannot be read", async () => {
    const guard = await placeGuard("claude", LINKED);
    const outside = getRepo().path("wt-main", "src", "index.ts");
    for (const command of ['git -C "$WT" push', "cd && git push", "cd - && git push", "git -C missing push", `git -C ${outside} push`]) {
      expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
    expect(decide("claude", guard, 'git -C "$WT" push origin feat/x').deny).toBe(false);
    expect(decide("claude", guard, "git push", undefined, getRepo().path("missing")).deny).toBe(true);
  });
});

/** A commit message naming every directory read, with no single quote, so each quoting form below can carry it. */
const MESSAGE = [
  "fix(hooks): read a directory change only where a command starts",
  "",
  "cd wt-main, pushd wt-main and chdir wt-main count at a command position.",
  "env -C wt-main and GIT_DIR=.git/worktrees/wt-main count there too, as does git -C wt-main log.",
  "Set-Location wt-main, sl wt-main, Push-Location wt-main and CD wt-main on PowerShell,",
  "$env:GIT_DIR = .git/worktrees/wt-main, sh -c and eval cd wt-main; a reftable HEAD is .invalid.",
].join("\n");

describe("a directory read only where the shell runs a command (review/116)", () => {
  it("reads a commit message and other quoted or argument words as data, so a feature branch's push stays allowed", async () => {
    const guard = await placeGuard("claude", LINKED);
    const allowed = [
      `git commit -m "${MESSAGE}" && git push`,
      `git commit -s -m '${MESSAGE}'; git push origin HEAD`,
      `git commit -s -F - <<'EOF' && git push\n${MESSAGE}\nEOF`,
      `git commit -F - <<EOF && git push\n${MESSAGE}\nEOF`,
      `git commit -m "$(cat <<'EOF'\n${MESSAGE}\nEOF\n)" && git push`,
      "echo cd wt-main && git push",
      'git log --grep "env -C wt-main" -1 && git push',
      "cat <<'EOF'\ncd wt-main\nEOF\ngit push",
      "cat <<'EOF'\n$(cd wt-main && git push)\nEOF",
    ];
    for (const command of allowed) expect(decide("claude", guard, command).deny, command).toBe(false);
  });

  it("still reads each one where the shell runs it: after a keyword, a group, a wrapper, and in a line a command runs", async () => {
    const guard = await placeGuard("claude", LINKED);
    const denied = [
      "if cd wt-main; then git push; fi",
      "(cd wt-main && git push)",
      "true && { cd wt-main; git push; }",
      "echo `cd wt-main && git push`",
      'echo "$(cd wt-main && git push)"',
      "command cd wt-main && git push",
      "sudo -u root git -C wt-main push",
      "timeout -s KILL 60 git -C wt-main push",
      "export GIT_DIR=.git/worktrees/wt-main; git push",
      "eval 'cd wt-main && git push'",
      "eval cd wt-main '&&' git push",
      "env -S 'git -C wt-main push'",
      "npx -c 'cd wt-main && git push'",
      "npm exec -c 'cd wt-main && git push'",
      "bash <<'EOF'\ncd wt-main\ngit push\nEOF",
      "cat <<'EOF' | sh\ncd wt-main\ngit push\nEOF",
      "cat <<EOF\n$(cd wt-main && git push)\nEOF",
    ];
    for (const command of denied) expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
  });

  it.each(TOOLS)("%s: reads a runner's git place behind a package manager's options (pr/22)", async (tool) => {
    const guard = await placeGuard(tool, LINKED);
    const denied = [
      "npm -w x exec -- git -C wt-main push",
      "npm --workspace x x git -C wt-main push",
      "pnpm --filter x exec git -C wt-main push",
      "pnpm -r exec git -C wt-main push",
      "yarn workspace x exec git -C wt-main push",
      "npm --loglevel silly exec -- git -C wt-main push",
      "npm -w x exec -- env -C wt-main git push",
    ];
    for (const command of denied) expect(decide(tool, guard, command), `${tool}: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    const allowed = [
      "npm -w x exec -- git -C wt-feat push",
      "npm -w x exec -- git -C wt-main push origin feat/x",
      "pnpm --filter x exec git -C wt-main status",
      "npm --loglevel silly exec -- git push",
    ];
    for (const command of allowed) expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(false);
  });

  it.each(TOOLS)("%s: reads a versioned manager's runner place, its @<version> cut as u6 cuts it (pr/60)", async (tool) => {
    const guard = await placeGuard(tool, LINKED);
    const denied = ["npx npm@10 exec -- git -C wt-main push", "corepack pnpm@9 exec git -C wt-main push"];
    for (const command of denied) expect(decide(tool, guard, command), `${tool}: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    const allowed = ["npx npm@10 exec -- git -C wt-feat push", "npx npm@10 exec -- git -C wt-main push origin feat/x"];
    for (const command of allowed) expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(false);
  });
});

describe("PowerShell's location commands and $env:GIT_DIR (review/117)", () => {
  const denied = [
    "Set-Location wt-main; git push",
    "sl wt-main; git push",
    "chdir wt-main; git push",
    "Push-Location wt-main; git push",
    "pushd wt-main; git push",
    "CD wt-main; git push",
    "Cd wt-main\ngit push origin HEAD",
    "SET-LOCATION -Path wt-main; git push",
    "Set-Location -LiteralPath 'wt-main'; git push",
    "Set-Location -Path:wt-main; git push",
    "Set-Location -PassThru wt-main | Out-Null; git push",
    "if ($true) { Set-Location wt-main }; git push",
    "$env:GIT_DIR = '.git/worktrees/wt-main'; git push",
    "$env:GIT_DIR='.git/worktrees/wt-main'; git push",
    '$ENV:git_dir = ".git/worktrees/wt-main"; git push',
  ];

  it.each(["claude", "copilot"] as const)("%s: reads each where a command starts, letter case aside, on the PowerShell tool", async (tool) => {
    // The line is split as u6's verdict splits it, so these read where the push is read.
    const guard = await placeGuard(tool, LINKED);
    for (const command of denied) {
      expect(decide(tool, guard, command, undefined, undefined, "PowerShell"), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
    const allowed = [
      "Set-Location wt-feat; git push",
      "Set-Location wt-main; git push origin feat/x",
      "Write-Output 'Set-Location wt-main'; git push",
      `git commit -m '${MESSAGE}'; git push`,
      `@'\n${MESSAGE}\n'@ | git commit -F -; git push`,
    ];
    for (const command of allowed) expect(decide(tool, guard, command, undefined, undefined, "PowerShell").deny, command).toBe(false);
  });

  it("counts a target it cannot place as unreadable, and reads cd.. as the parent", async () => {
    const guard = await placeGuard("claude", { ...LINKED, ".git/HEAD": "ref: refs/heads/main\n" });
    const feature = getRepo().path("wt-feat");
    expect(decide("claude", guard, "git push", undefined, feature, "PowerShell").deny).toBe(false);
    for (const command of ["cd..; git push", "Set-Location $env:WT; git push", "Set-Location; git push", "'wt-main' | Set-Location; git push"]) {
      expect(decide("claude", guard, command, undefined, feature, "PowerShell"), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
  });

  it("reads them on a client whose payload names no shell too", async () => {
    const guard = await placeGuard("cursor", LINKED);
    expect(decide("cursor", guard, "Set-Location wt-feat; git push").deny).toBe(false);
    for (const command of ["Set-Location wt-main; git push", "$env:GIT_DIR = '.git/worktrees/wt-main'; git push"]) {
      expect(decide("cursor", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
  });
});

describe("a place inside a line u6 reads (build/89, review/153) and a value the line cannot show (review/154)", () => {
  // Each denied line moves to `wt-main` (on main) inside text u6 reads as a line of its own; its twin moves to
  // `wt-feat` (on `feat/y`), so the push is judged where it runs, not on the root checkout's `feat/x`.
  const forms = [
    "pwsh -c 'Set-Location {dir}; git push'",
    "pwsh -NoProfile -Command \"cd {dir}; git push origin HEAD\"",
    "powershell.exe -ExecutionPolicy Bypass -NoProfile 'cd {dir}; git push'",
    "Invoke-Expression 'Set-Location {dir}; git push'",
    "iex -Command 'git -C {dir} push'",
    "bun exec 'cd {dir} && git push'",
    "yarn exec 'git -C {dir} push'",
    // A substitution whose parenthesis sits in quotes: both readers take the rest of the line as one word.
    "git commit -m \"$(printf '(')\" && cd {dir} && git push",
  ];

  it.each(forms.flatMap((form) => (["Bash", "PowerShell"] as const).map((shell) => [form, shell] as const)))(
    "reads the place in %j on the %s tool, and allows the feature twin",
    async (form, shell) => {
      const guard = await placeGuard("claude", LINKED);
      const denied = form.replaceAll("{dir}", "wt-main");
      expect(decide("claude", guard, denied, undefined, undefined, shell), denied).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
      const allowed = form.replaceAll("{dir}", "wt-feat");
      expect(decide("claude", guard, allowed, undefined, undefined, shell).deny, allowed).toBe(false);
    },
  );

  // Each form moves to `wt-main` (on main) inside a line u6's verdicts read (review/183, review/184), then pushes; a
  // push with no named destination is denied there, and the same line naming a feature destination is allowed
  // (review/193).
  const nestedForms = [
    'cmd /c "cd wt-main && {push}"',
    'CMD.EXE /S /K "cd wt-main && {push}"',
    "cmd /c'cd wt-main && {push}'",
    'git rebase --exec "cd wt-main && {push}" main',
    "git rebase -x 'cd wt-main && {push}' main",
    "git rebase -ix 'cd wt-main && {push}' main",
    "git -C . rebase --exe='cd wt-main && {push}' main",
    "git bisect run sh -c 'cd wt-main && {push}'",
  ];
  it.each(nestedForms.flatMap((form) => (["Bash", "PowerShell"] as const).map((shell) => [form, shell] as const)))(
    "reads the place in %j on the %s tool, and allows the line naming a feature destination",
    async (form, shell) => {
      const guard = await placeGuard("claude", LINKED);
      const denied = form.replace("{push}", "git push");
      expect(decide("claude", guard, denied, undefined, undefined, shell), denied).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
      const allowed = form.replace("{push}", "git push origin feat/x");
      expect(decide("claude", guard, allowed, undefined, undefined, shell).deny, allowed).toBe(false);
    },
  );

  it("counts a git -C value the line cannot show, a wrapper's brace placeholder among them, as unreadable", async () => {
    const guard = await placeGuard("claude", LINKED);
    for (const command of ["echo wt-main | xargs -I {} git -C {} push", "xargs -I{} git --git-dir {} push"]) {
      expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    }
    expect(decide("claude", guard, "xargs -I {} git -C wt-feat push").deny).toBe(false);
    expect(decide("claude", guard, "echo wt-main | xargs -I {} git -C {} push origin feat/x").deny).toBe(false);
  });

  it("reads a PowerShell here-string as a literal, so a feature branch's push after one stays allowed", async () => {
    const guard = await placeGuard("copilot", LINKED);
    const command = "@'\ncd wt-main\nSet-Location wt-main\n'@ | git commit -F -; git push";
    expect(decide("copilot", guard, command, undefined, undefined, "PowerShell").deny).toBe(false);
    expect(decide("copilot", guard, "Set-Location wt-main; git push", undefined, undefined, "PowerShell").deny).toBe(true);
  });

  it("carries u6's wrapper, runner, shell and PowerShell tables, so a wrapper u6 reads never hides a place (build/90)", () => {
    /** The constants a source text declares between two markers, evaluated. */
    const tablesOf = (source: string, from: string, to: string, names: string): Record<string, unknown> => {
      const start = source.indexOf(from);
      const end = source.indexOf(to, start);
      expect(start, from).toBeGreaterThan(-1);
      expect(end, to).toBeGreaterThan(start);
      return new Function(`${source.slice(start, end)}\nreturn { ${names} };`)() as Record<string, unknown>;
    };
    type Options = readonly [string?, (string | readonly string[])?, (string | readonly string[])?];
    /** One wrapper's options in one shape: its short letters, then its long and its line options, space-joined. */
    const shape = (options: Options | undefined): string[] =>
      [0, 1, 2].map((index) => {
        const part = options?.[index] ?? "";
        return typeof part === "string" ? part : part.join(" ");
      });
    const u6 = tablesOf(personOnlyVerdict.toString(), "const ASSIGNMENT", "function programName",
      "ASSIGNMENT, KEYWORDS, WRAPPERS, RUNNERS, RUNNER_OPTIONS, MANAGERS, MANAGER_VALUED, WRAPPER_OPTIONS, SHELLS, POWERSHELLS");
    const wrappers = u6.WRAPPERS as Set<string>;
    const options = u6.WRAPPER_OPTIONS as Map<string, Options>;
    expect(wrappers.size).toBeGreaterThan(10);
    for (const tool of TOOLS) {
      const content = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).at(-1)?.content ?? "";
      const guard = tablesOf(content, "const RUNNER = ", "function placesOf",
        "RUNNER, WRAPPERS, RUNNERS, MANAGERS, MANAGER_VALUED, KEYWORDS, SHELLS, POWERSHELLS, ASSIGNMENT");
      const table = guard.WRAPPERS as Map<string, Options>;
      expect([...table.keys()].toSorted(), tool).toEqual([...wrappers].toSorted());
      for (const name of wrappers) expect(shape(table.get(name)), `${tool}: ${name}`).toEqual(shape(options.get(name)));
      expect(shape(guard.RUNNER as Options), tool).toEqual(shape(u6.RUNNER_OPTIONS as Options));
      expect([...(guard.RUNNERS as Set<string>)].toSorted(), tool).toEqual([...(u6.RUNNERS as Set<string>)].toSorted());
      // The package managers whose options stand before a runner's subcommand, and the options skipped with a value (pr/22).
      expect([...(guard.MANAGERS as Set<string>)], tool).toEqual([...(u6.MANAGERS as Set<string>)]);
      expect([...(guard.MANAGER_VALUED as Set<string>)], tool).toEqual([...(u6.MANAGER_VALUED as Set<string>)]);
      expect([...(guard.SHELLS as Set<string>)], tool).toEqual([...(u6.SHELLS as Set<string>)]);
      expect([...(guard.POWERSHELLS as Set<string>)], tool).toEqual([...(u6.POWERSHELLS as Set<string>)]);
      // The guard splits a brace as an operator, so u6's two brace keywords never reach it as words.
      expect([...(guard.KEYWORDS as Set<string>)], tool).toEqual([...(u6.KEYWORDS as Set<string>)].filter((word) => word !== "{" && word !== "}"));
      expect(String(guard.ASSIGNMENT), tool).toBe(String(u6.ASSIGNMENT));
    }
  });
});

describe("a HEAD that names no branch (review/118)", () => {
  const IMPLIED = ["git push", "git push origin HEAD", "git push origin @"];

  it("counts a reftable repository's placeholder HEAD as unreadable, so an implied destination is the default branch", async () => {
    const guard = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/.invalid\n", ".git/reftable/tables.list": "" });
    for (const command of IMPLIED) expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    expect(decide("claude", guard, "git push origin feat/x").deny).toBe(false);
  });

  it("reads the placeholder alone, and a reftable entry beside any HEAD, as unreadable", async () => {
    const guard = await placeGuard("claude", { ".git/HEAD": "ref: refs/heads/.invalid\n" });
    expect(decide("claude", guard, "git push origin HEAD").deny).toBe(true);
    await getRepo().seedFiles({ ".git/HEAD": "ref: refs/heads/feat/x\n" });
    expect(decide("claude", guard, "git push").deny).toBe(false);
    await getRepo().seedFiles({ ".git/reftable/tables.list": "" });
    expect(decide("claude", guard, "git push").deny).toBe(true);
  });

  it("reads a reftable worktree's HEAD the same way, where the call runs", async () => {
    const guard = await placeGuard("claude", {
      ...LINKED,
      "wt-r/.git": "gitdir: ../.git/worktrees/wt-r\n",
      ".git/worktrees/wt-r/HEAD": "ref: refs/heads/.invalid\n",
      ".git/worktrees/wt-r/commondir": "../..\n",
      ".git/worktrees/wt-r/reftable/tables.list": "",
    });
    expect(decide("claude", guard, "git -C wt-feat push").deny).toBe(false);
    expect(decide("claude", guard, "git -C wt-r push")).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    expect(decide("claude", guard, "git push", undefined, getRepo().path("wt-r")).deny).toBe(true);
  });

  it("counts a HEAD naming no branch and no commit as unreadable, and a detached HEAD as on no branch", async () => {
    const guard = await placeGuard("claude", { ".git/HEAD": "ref: refs/remotes/origin/main\n" });
    for (const command of IMPLIED) expect(decide("claude", guard, command).deny, command).toBe(true);
    await getRepo().seedFiles({ ".git/HEAD": `${"a".repeat(40)}\n` });
    for (const command of IMPLIED) expect(decide("claude", guard, command).deny, command).toBe(false);
  });
});

/** A run record's head, as `/st-work` and `/st-debug` open one. */
function record(status: string, mode?: "attended" | "unattended"): string {
  return `# Run\n\nStatus: ${status}\nPlan: docs/plans/x.md\n${mode === undefined ? "" : `Mode: ${mode}\n`}Invocation: /st-work x\n`;
}

const RAW_PUSH = "git push origin HEAD:refs/heads/x";
const RUN_END = "npx --no stamity run end --run x";

describe("the unattended push rule, the mode read from the run records", () => {
  it("denies a raw push and gh pr create while an unattended run is in progress, and allows the run verb", async () => {
    const guard = await placeGuard("claude");
    // Non-degenerate: with no record the same push passes.
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_x/record.md": record("in progress", "unattended") });
    // gh's alias for the create-and-push form (review/129), a push in PowerShell's command string (build/89), and a git
    // alias defined on the line or read from the configuration (the 01:50Z sign-off).
    const unattended = [RAW_PUSH, "gh pr create --draft --fill", "gh repo new o/x --source . --push", `pwsh -c '${RAW_PUSH}'`,
      "git -c alias.p=push p origin x", "git p origin x",
      // A configuration pair git can run as a line, on the line or through the environment (the 02:31Z sign-off).
      "git -c core.fsmonitor='git push origin x' status", "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0=x git fetch",
      // A program-valued git variable (review/208), a remote write in both spellings (review/209), and a close
      // (review/213).
      "GIT_SSH_COMMAND='sh -c \"git push origin x\"' git fetch", "git remote set-url origin https://example.com/r.git",
      "git config remote.origin.url https://example.com/r.git", "gh pr close 3",
      // A `url.*` rewrite (review/220) and the configuration variables in a quoted spelling (review/221).
      "git config url.https://example.com/.pushInsteadOf https://github.com/",
      "env GIT_CONF''IG_COUNT=1 GIT_CONF''IG_KEY_0=core.sshCommand GIT_CONFIG_VALUE_0=x git fetch",
      // The same variables named in PowerShell's forms (review/227, review/196).
      "${env:GIT_CONFIG_PARAMETERS}=\"'core.fsmonitor=git push origin x'\"; git status", "Set-Item env:GIT_CONFIG_COUNT 1; git status",
      // A program or configuration variable set on a line whatever program it runs, the run verb's among them
      // (review/231; the two `npm test` lines were allowed before it), the global configuration file (review/233), and
      // GitHub merging the base into a pull request's branch (review/232).
      `GIT_EXEC_PATH=/tmp/bin ${RUN_END}`, "GIT_EDITOR=/tmp/e npm test", "Set-Item env:GIT_CONFIG_COUNT 1; npm test",
      "GIT_CONFIG_GLOBAL=/tmp/c git fetch", "gh pr update-branch 3",
      // A `declare`, `typeset` or `local` whose option cluster carries `x`, with no `=` (review/243).
      `read GIT_EXEC_PATH <<< /tmp/bin; declare -x GIT_EXEC_PATH; ${RUN_END}`, `printf -v GIT_SSH_COMMAND /tmp/s; declare -gx GIT_SSH_COMMAND; ${RUN_END}`,
      "read GIT_CONFIG_COUNT <<< 1; typeset -rx GIT_CONFIG_COUNT; npm test", `f() { local -xr GIT_EXEC_PATH; ${RUN_END}; }; f`,
      "declare -x -- GIT_EDITOR; npm test", "typeset -- -x GIT_PAGER; npm test", `declare -x HOME GIT_EXEC_PATH PATH; ${RUN_END}`,
      `typeset -gx GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0; ${RUN_END}`,
      // A form that assigns a name with no `=`, and allexport turned on on a line naming one (review/247).
      `set -a; read GIT_EXEC_PATH <<< /tmp/bin; ${RUN_END}`, `read -r GIT_EXEC_PATH <<< /tmp/bin; ${RUN_END}`,
      "read -a GIT_SSH_COMMAND <<< /tmp/s; npm test", "read -r HOME GIT_EDITOR < /tmp/v; npm test",
      `for GIT_EXEC_PATH in /tmp/bin; do ${RUN_END}; done`, `printf -v GIT_EXEC_PATH %s /tmp/bin; ${RUN_END}`,
      "printf -vGIT_PAGER %s /tmp/p; npm test", "mapfile -t GIT_CONFIG_KEY_0 < /tmp/k; npm test",
      `readarray GIT_EXEC_PATH < /tmp/p; ${RUN_END}`, "getopts e: GIT_EDITOR -e /tmp/e; npm test",
      `set -o allexport; select GIT_EXEC_PATH in /tmp/bin; do break; done; ${RUN_END}`,
      `set -ea; select GIT_EXEC_PATH in /tmp/bin; do break; done; ${RUN_END}`,
      `setopt ALL_EXPORT; print -v GIT_EXEC_PATH /tmp/bin; ${RUN_END}`, "shopt -so allexport; select GIT_PAGER in /tmp/p; do break; done; npm test",
      // A runner behind a package manager's options (pr/3), the interpreter's caret (pr/10), a shortened wget method (pr/11).
      "npm -w x exec -- git push origin feat/x", "cmd /c g^it push origin feat/x", "wget --meth=PATCH https://api.github.com/repos/o/r/pulls/3",
      "wget --me PATCH https://api.github.com/repos/o/r/pulls/3",
      // wget's `-e` wgetrc command (pr/23).
      "wget -e method=PATCH https://api.github.com/repos/o/r/pulls/3",
      // A gh alias or extension and an alias defined (pr/56), and a push behind Corepack (pr/51).
      "gh land 123", "gh alias set land 'pr merge'", "gh alias import aliases.yml", "corepack pnpm exec git push origin feat/x",
      // A group spelled near one of gh's own aliases (pr/67), and a pull request opened through curl's attached body (pr/81).
      "gh exts list", "curl -d'{\"title\":\"x\",\"head\":\"a\",\"base\":\"main\"}' https://api.github.com/repos/o/r/pulls",
      // A pull request moved through gh's `-i` clustered with its method (pr/83).
      "gh api -iXPATCH repos/o/r/pulls/3",
      // The same through curl's shortened method option (pr/84).
      "curl --req PATCH https://api.github.com/repos/o/r/pulls/3"];
    for (const command of unattended) {
      const source = unattendedPushVerdict(command);
      expect(source.deny, command).toBe(true);
      if (source.deny) expect(decide("claude", guard, command)).toEqual({ deny: true, reason: expect.stringContaining(source.reason) });
    }
    // review/227's line as the PowerShell tool sends it, beside a variable that sets no configuration.
    expect(decide("claude", guard, "${env:GIT_CONFIG_PARAMETERS}=\"'core.fsmonitor=git push origin x'\"; git status", undefined, undefined, "PowerShell").deny).toBe(true);
    expect(decide("claude", guard, "${env:GIT_CONFIG_NOSYSTEM}='1'; git status", undefined, undefined, "PowerShell").deny).toBe(false);
    // review/231's line as the PowerShell tool sends it, beside the same verb with no variable set.
    expect(decide("claude", guard, `$env:GIT_EXEC_PATH = 'C:\\tmp'; ${RUN_END}`, undefined, undefined, "PowerShell").deny).toBe(true);
    expect(decide("claude", guard, `$env:GIT_EXEC_PATH; ${RUN_END}`, undefined, undefined, "PowerShell").deny).toBe(false);
    // The refusal names the record that made the session unattended, so the person knows which run to close.
    expect(decide("claude", guard, RAW_PUSH)).toEqual({
      deny: true,
      reason: expect.stringContaining("unattended because .stamity/runs/2026-10-16_x/record.md reads `Status: in progress` and `Mode: unattended`."),
    });
    expect(decide("claude", guard, RUN_END).deny).toBe(false);
    expect(decide("claude", guard, "git -c color.ui=never status").deny).toBe(false);
    expect(decide("claude", guard, "git -c user.name=x commit -m m").deny).toBe(false);
    // The twins: a variable that runs nothing, a remote and a remote key read, a pull request read, and a line that only
    // names one of the variables or unsets one (review/231), or prints one, exports another or gives one an attribute
    // other than `x` (review/243), or reads one, names one under no allexport, or reads another name (review/247).
    for (const command of ["GIT_TERMINAL_PROMPT=0 git fetch origin", "git remote get-url origin", "git config --get remote.origin.url", "gh pr view 3",
      "git config --get url.https://example.com/.insteadOf", "GIT_CONFIG_NOSYSTEM=1 git status", "Set-Item env:GIT_CONFIG_NOSYSTEM 1; git status",
      "grep GIT_CONFIG_COUNT src", `env -u GIT_EXEC_PATH ${RUN_END}`, "gh pr view 3 --json mergeStateStatus",
      `declare -p GIT_EXEC_PATH; ${RUN_END}`, `declare -x GIT_TERMINAL_PROMPT; ${RUN_END}`, "typeset -i GIT_CONFIG_COUNT; npm test",
      `read OTHER_NAME <<< /tmp/bin; ${RUN_END}`, `echo "$GIT_EXEC_PATH"; ${RUN_END}`, `set +a; read OTHER_NAME <<< "$GIT_EXEC_PATH"; ${RUN_END}`,
      `set -e; echo "$GIT_EXEC_PATH"; ${RUN_END}`, 'for f in GIT_EXEC_PATH GIT_EDITOR; do grep -rn "$f" src; done; npm test',
      `printf '%s\\n' GIT_EXEC_PATH; ${RUN_END}`, "npm -w x exec -- git status", "cmd /c g^it status", "wget --meth=GET https://api.github.com/repos/o/r/pulls/3",
      "wget --me=GET https://api.github.com/repos/o/r/pulls/3", "wget https://api.github.com/repos/o/r/releases",
      "wget -e method=GET https://api.github.com/repos/o/r/pulls/3", "gh co 3", "gh alias list", "corepack pnpm exec git status",
      // gh's own aliases of its built-ins (pr/67), and a pull request list read (pr/81).
      "gh ext list", "gh cs list", "curl -s https://api.github.com/repos/o/r/pulls",
      // The same pull request read through gh's `-i` (pr/83).
      "gh api -i repos/o/r/pulls/3", "curl --sil https://api.github.com/repos/o/r/pulls/3"]) {
      expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
      expect(decide("claude", guard, command).deny, command).toBe(false);
    }
  });

  it("reads a debug round's record too", async () => {
    const guard = await placeGuard("claude", {
      ".stamity/runs/2026-10-16_debug-flake/record.md": record("in progress", "unattended"),
    });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(true);
  });

  it("stays unattended when an attended record opens beside an unattended one, and lets a closed one go", async () => {
    const guard = await placeGuard("claude", {
      ".stamity/runs/2026-10-15_night/record.md": record("in progress", "unattended"),
      ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended"),
    });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-15_night/record.md": record("done", "unattended") });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
  });

  it("reads every run folder's head, so 50 newer folders hide no open unattended record (pr/54)", async () => {
    const files: Record<string, string> = { ".stamity/runs/2026-01-01_old/record.md": record("in progress", "unattended") };
    for (let day = 1; day <= 50; day += 1) {
      files[`.stamity/runs/2026-09-${String(day).padStart(2, "0")}_r${day}/record.md`] = record("done", "unattended");
    }
    const guard = await placeGuard("claude", files);
    // TEST CHANGE, justified: pr/54 drops the 50-newest cut, which read none of this old open record's head, so the
    // push the old cut let through is now refused, the record named.
    expect(decide("claude", guard, RAW_PUSH)).toEqual({ deny: true, reason: expect.stringContaining(".stamity/runs/2026-01-01_old/record.md reads") });
    await getRepo().seedFiles({ ".stamity/runs/2026-01-01_old/record.md": record("done", "unattended") });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
  });

  it("refuses a raw push behind 50 empty future-dated folders beside today's open unattended record (pr/54)", async () => {
    const guard = await placeGuard("claude", { ".stamity/runs/2026-10-16_x/record.md": record("in progress", "unattended") });
    for (let n = 1; n <= 50; n += 1) mkdirSync(getRepo().path(".stamity", "runs", `9999-12-31_x${n}`), { recursive: true });
    expect(decide("claude", guard, RAW_PUSH)).toEqual({ deny: true, reason: expect.stringContaining(".stamity/runs/2026-10-16_x/record.md reads") });
    // The twin: the same folders beside a closed record refuse nothing.
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_x/record.md": record("done", "unattended") });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
  });

  it("refuses a raw push past the run-folder ceiling, naming the code, and no call the unattended rule allows (pr/54)", async () => {
    const guard = await placeGuard("claude");
    // At the ceiling every head is read, and none is open.
    for (let n = 1; n <= 2_000; n += 1) mkdirSync(getRepo().path(".stamity", "runs", `2026-10-16_r${n}`), { recursive: true });
    expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
    mkdirSync(getRepo().path(".stamity", "runs", "2026-10-16_r2001"));
    expect(decide("claude", guard, RAW_PUSH)).toEqual({ deny: true, reason: expect.stringMatching(/RUN_FOLDERS_OVER_2000 on .*runs/) });
    for (const command of ["npm test", RUN_END]) expect(decide("claude", guard, command).deny, command).toBe(false);
  });

  it("lets STAMITY_UNATTENDED govern a run with no Mode: line, and never an attended one", async () => {
    const guard = await placeGuard("claude");
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" })).toEqual({
      deny: true,
      reason: expect.stringContaining("unattended because STAMITY_UNATTENDED is set and no in-progress run record reads `Mode: attended`."),
    });
    for (const off of ["", "0", "false"]) expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: off }).deny, off).toBe(false);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_old/record.md": record("in progress") });
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" }).deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-16_walk/record.md": record("in progress", "attended") });
    expect(decide("claude", guard, RAW_PUSH, { STAMITY_UNATTENDED: "1" }).deny).toBe(false);
  });
});

describe("the mode read when a record cannot be", () => {
  // A permission bit is the real failure here; Windows and root ignore it, so the case runs where it holds.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses a raw push, naming the code and the record, when a run record cannot be read, and no other call",
    async () => {
      const guard = await placeGuard("claude", { ".stamity/runs/2026-10-16_x/record.md": record("in progress", "attended") });
      expect(decide("claude", guard, RAW_PUSH).deny).toBe(false);
      chmodSync(getRepo().path(".stamity", "runs", "2026-10-16_x", "record.md"), 0o000);
      try {
        for (const command of [RAW_PUSH, "gh pr create --draft --fill"]) {
          expect(decide("claude", guard, command), command).toEqual({ deny: true, reason: expect.stringMatching(/EACCES on .*record\.md/) });
        }
        // The mode matters only to a call the unattended rule would refuse, so these never read it.
        for (const command of ["ls", "npm test", `chmod 644 .stamity/runs/2026-10-16_x/record.md`, RUN_END]) {
          expect(decide("claude", guard, command).deny, command).toBe(false);
        }
      } finally {
        chmodSync(getRepo().path(".stamity", "runs", "2026-10-16_x", "record.md"), 0o644);
      }
    },
  );
});

describe("the hooks canary", () => {
  it("writes the canary when the command names the pre-flight, and allows the call", async () => {
    const guard = await placeGuard("cursor");
    const canary = getRepo().path(...PREFLIGHT_CANARY_FILE.split("/"));
    expect(decide("cursor", guard, "npm test").deny).toBe(false);
    expect(existsSync(canary)).toBe(false);
    const before = Date.now();
    expect(decide("cursor", guard, "npx --no stamity gate preflight --unattended --json").deny).toBe(false);
    const at = Date.parse((JSON.parse(readFileSync(canary, "utf8")) as { at: string }).at);
    expect(at).toBeGreaterThanOrEqual(before - 1_000);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("is ignored by git, named in the setup line, and never carried into a worktree", () => {
    expect(PREFLIGHT_CANARY_FILE).toBe(".stamity/preflight-canary.json");
    expect(REQUIRED_GITIGNORE_ENTRIES).toContain(PREFLIGHT_CANARY_FILE);
    const line = gitignoreLine({ dryRun: false, entries: [PREFLIGHT_CANARY_FILE], mcpConfigured: false });
    expect(line).toContain(`${PREFLIGHT_CANARY_FILE} (the shell guard's hooks canary)`);
    const policy = parseWorktreePolicy(
      JSON.stringify({ version: 1, entries: [{ path: ".stamity", strategy: "copy" }] }),
      "/repo/.stamity/worktree.json",
    );
    expect(resolveStrategy(policy, ".stamity/manifest.json")).toBe("copy");
    expect(resolveStrategy(policy, PREFLIGHT_CANARY_FILE)).toBe("skip");
    const named = parseWorktreePolicy(
      JSON.stringify({ version: 1, entries: [{ path: PREFLIGHT_CANARY_FILE, strategy: "copy" }] }),
      "/repo/.stamity/worktree.json",
    );
    expect(() => assertRulesAdmissible(named, () => "ignored")).toThrow(/hooks canary/);
  });
});

describe("the guard's place in the plan", () => {
  it("is rendered only when asked for, so the default plan and its wiring stay as they were", () => {
    for (const tool of TOOLS) {
      const plain = planCoreHookScripts(POLICY, tool, CLI_PIN).map((script) => script.fileName);
      expect(plain, tool).not.toContain(PERSON_ONLY_GUARD_FILE);
      const asked = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true });
      expect(asked.map((script) => script.fileName), tool).toEqual([...plain, PERSON_ONLY_GUARD_FILE]);
      expect(asked.at(-1)?.event, tool).toBe("pre_tool_use");
    }
  });

  it("carries u6's two verdicts as their source, and reaches for no network, shell or evaluation", () => {
    for (const tool of TOOLS) {
      const content = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).at(-1)?.content ?? "";
      expect(content).toContain(personOnlyVerdict.toString());
      expect(content).toContain(unattendedPushVerdict.toString());
      expect(content).toMatch(/^#!\/usr\/bin\/env node\n\/\* eslint-disable \*\/\n/);
      for (const token of ["http://", "https://", "fetch(", "child_process", "new Function"]) expect(content).not.toContain(token);
      expect(content).not.toMatch(/\beval\s*\(/);
    }
  });
});
