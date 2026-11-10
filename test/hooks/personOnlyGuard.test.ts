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
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { gitignoreLine } from "../../src/cli/commands/init/panel.ts";
import { parseAutonomyMarker, resolveAutonomy, type ResolvedAutonomy } from "../../src/config/autonomy.ts";
import { planHooksInfra } from "../../src/emit/hooksInfra.ts";
import { PREFLIGHT_CANARY_FILE, REQUIRED_GITIGNORE_ENTRIES } from "../../src/mcp/env.ts";
import { personOnlyVerdict, unattendedPushVerdict, type PersonOnlyRuleId } from "../../src/hooks/personOnly.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../src/hooks/scripts.ts";
import { type Tool, TOOLS } from "../../src/types/core.ts";
import { assertRulesAdmissible, parseWorktreePolicy, resolveStrategy } from "../../src/worktree/policy.ts";
import { CHILD_TIMEOUT_MS } from "../support/childTimeout.ts";
import { useTempDir } from "../support/tempDir.ts";
import { loadedCaseTimeout } from "../../vitest.config.ts";

/** The package and version the core scripts' CLI hints pin; a literal, so a renamed fork renders the same bytes. */
const CLI_PIN = { packageName: "@zomarit/stamity", version: "1.0.0-golden" };
const POLICY = "../../agent-tool-policies.json";

const getRepo = useTempDir("person-only-guard");

/** The shipped line naming the system files other git builds keep (REQ-FLOW-134), pinned byte for byte below. */
const CANDIDATES_LINE =
  'const SYSTEM_GITCONFIG_CANDIDATES = ["/etc/gitconfig", "/opt/homebrew/etc/gitconfig", "/usr/local/etc/gitconfig", ' +
  '"/home/linuxbrew/.linuxbrew/etc/gitconfig", "/Library/Developer/CommandLineTools/usr/share/git-core/gitconfig", ' +
  '"/Applications/Xcode.app/Contents/Developer/usr/share/git-core/gitconfig"];';

/**
 * A guard copy for a run here, its candidate system files swapped for `paths`, the swap asserted: by default one file
 * under the test's temporary folder, absent unless a case writes it, so no host's own system files reach a result.
 */
function swapCandidates(content: string, paths: readonly string[] = [getRepo().path("system.gitconfig")]): string {
  expect(content).toContain(`\n${CANDIDATES_LINE}\n`);
  const swapped = content.replace(CANDIDATES_LINE, () => `const SYSTEM_GITCONFIG_CANDIDATES = ${JSON.stringify(paths)};`);
  expect(swapped).not.toBe(content);
  return swapped;
}

/** The variables the guard reads to find a git build's system file, by their upper-case name (Windows reads any case). */
const HOST_PLACES = new Set(["PATH", "HOME", "USERPROFILE", "HOMEBREW_PREFIX", "CONDA_PREFIX", "PROGRAMFILES", "PROGRAMDATA"]);

/**
 * `env` with each variable the guard reads to find a git build's system file pinned under the test's temporary
 * folder: a PATH holding no git (the child starts by node's absolute path, and the guard starts no program), a home
 * folder there, and no Homebrew, conda or Windows program folder. A case that needs one passes it.
 */
function hostFree(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(Object.entries(env).filter(([name]) => !HOST_PLACES.has(name.toUpperCase())));
  const home = getRepo().path("home");
  return { ...kept, PATH: getRepo().path("no-git"), HOME: home, USERPROFILE: home };
}

/**
 * A client's decision: allowed, or stopped, `ask: true` where the client asks the person for one click (v0a2,
 * REQ-FLOW-123). An ask stops the agent as a refusal does, so a check reading `deny` holds for both, as the verdict's
 * own `deny` does.
 */
type Decision = { deny: false } | { deny: true; reason: string; ask?: true };

/**
 * The guard for one client, at `.stamity/generated/hooks/<tool>/`, and the repository it sits in; `autonomy` is the
 * setting it bakes, the default where none is named, as emission renders an absent manifest key (a4).
 */
async function placeGuard(tool: Tool, files: Record<string, string> = {}, autonomy?: ResolvedAutonomy): Promise<string> {
  const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true, ...(autonomy === undefined ? {} : { autonomy }) }).find(
    (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
  );
  if (guard === undefined) throw new Error("the plan carried no person-only guard");
  await getRepo().seedFiles({
    ...(Object.hasOwn(files, ".git") ? {} : { ".git/HEAD": "ref: refs/heads/feat/x\n" }),
    // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the candidate system files swapped for one under the temp
    // folder, so the host's own system files cannot move a result; every other byte is emission's.
    [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: swapCandidates(guard.content),
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
  // TEST CHANGE, justified (REQ-FLOW-134, review/128): the guard now reads git's merged configuration and gh's own
  // variables, so each run gets an empty global file, no system file and none of those variables; the developer's own
  // git configuration cannot move a result, and a case that needs one passes it.
  for (const name of ["GH_REPO", "GH_HOST", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_SYSTEM", "XDG_CONFIG_HOME"]) delete base[name];
  base.GIT_CONFIG_GLOBAL = "/dev/null";
  base.GIT_CONFIG_NOSYSTEM = "1";
  // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the guard reads other git builds' system files whatever
  // GIT_CONFIG_NOSYSTEM says, so the variables that place them are pinned under the temp folder too (`hostFree`), and
  // each copy's candidate line is swapped (`swapCandidates`).
  return spawnSync(process.execPath, [guard], { input, encoding: "utf8", env: { ...hostFree(base), ...env }, timeout: CHILD_TIMEOUT_MS }); // TEST CHANGE, justified: a time limit only, no expected value moved.
}

/**
 * The decision a client's output carries: exit 2 and stderr, or the client's own JSON. TEST CHANGE, justified (v0a2,
 * REQ-FLOW-123): Claude Code's guard now also answers ask, its `hookSpecificOutput` on stdout with exit 0, read as an
 * ask instead of failing the empty-stdout expectation. TEST CHANGE, justified (review/89, REQ-FLOW-123): Copilot's
 * `permissionDecision` reads `deny` in these cases, so a Copilot ask fails the deny-only expectation. TEST CHANGE,
 * justified (w4-copilot-ask, REQ-FLOW-123): Copilot now asks for its main agent's call when Copilot's session start
 * recorded the session id. No payload in this file carries a recorded id, so Copilot still refuses here, and
 * `test/hooks/personOnlyCopilotAsk.test.ts` reads its ask.
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
  expect(verdict, label).toBe("deny");
  return { deny: true, reason: tool === "cursor" ? (out.user_message ?? "") : (out.permissionDecisionReason ?? "") };
}

/** The decision each client's output carries for a shell call. */
function decide(tool: Tool, guard: string, command: string, env?: Record<string, string>, cwd?: string, shell?: Shell): Decision {
  return clientDecision(tool, run(guard, payload(tool, command, cwd, shell), env), command);
}

/**
 * The clients the guard asks on here (REQ-FLOW-123); Copilot, Cursor and Codex refuse an ask, saying why. TEST CHANGE,
 * justified (review/89, REQ-FLOW-123): Copilot left the set. TEST CHANGE, justified (w4-copilot-ask, REQ-FLOW-123):
 * Copilot asks only for a call whose session id its session start recorded, and no payload in this file carries one,
 * so it stays out of the set here; `test/hooks/personOnlyCopilotAsk.test.ts` covers its ask.
 */
const ASKS = new Set<Tool>(["claude"]);
const CANNOT_ASK = "This client cannot ask the person for a click, so the guard refuses it: give the person the exact command.";
/**
 * What Copilot adds to an ask it is not given (review/89). TEST CHANGE, justified (w4-copilot-ask, REQ-FLOW-123): the
 * sentence is reworded, since Copilot's helper calls do carry agent fields (measured on 1.0.98): the guard refuses when
 * it cannot show that the call comes from the person's own agent.
 */
const NO_CALLER =
  "Copilot CLI could not show that this call comes from the person's own agent (a helper agent's call, or a session its session start did not record), so the guard refuses it: give the person the exact command.";
/** What a client the guard does not ask on adds to an ask-class act's sentence. */
const refusedAsk = (tool: Tool): string => (tool === "copilot" ? NO_CALLER : CANNOT_ASK);

/** The sentence a person-only verdict earns attended (v0a2), the act printed as the verdict's own text. */
function told(verdict: { act: string; rule: string; ask: boolean }): string {
  return verdict.ask
    ? `${verdict.act} is a person-only act (\`${verdict.rule}\`): approve it to let the agent run it once (REQ-FLOW-102).`
    : `${verdict.act} deletes, force-pushes or cannot be undone (\`${verdict.rule}\`): it stays the person's to run, even with approval (REQ-FLOW-124). Give the person the exact command.`;
}

/**
 * The sentence an unattended run earns for a person-only act other than a push (v0a2), before the mode's reason.
 * TEST CHANGE, justified (REQ-FLOW-143, a4): the list is named as the run's summary list, `morning.md`.
 */
function morningList(verdict: { act: string; rule: string }): string {
  return `${verdict.act} is a person-only act (\`${verdict.rule}\`) and this run is unattended: list it on the run's summary list (\`morning.md\`), whose walk runs it after one click.`;
}

/** What one client says to an attended person-only verdict: an ask where the guard asks on it, else a refusal. */
function expectedAttended(tool: Tool, verdict: { act: string; rule: string; ask: boolean }): Decision {
  if (verdict.ask && ASKS.has(tool)) return { deny: true, ask: true, reason: expect.stringContaining(told(verdict)) as unknown as string };
  const reason = verdict.ask ? `${told(verdict)} ${refusedAsk(tool)}` : told(verdict);
  return { deny: true, reason: expect.stringContaining(reason) as unknown as string };
}

const ON_FEATURE = { defaultBranches: [], currentBranch: "feat/x", tags: ["v1.0.0"] };
/** What the default setting runs unasked, as the guard bakes it (a4): a ready mark, a local tag, an unnamed dispatch. */
const DEFAULT_RUNS: readonly PersonOnlyRuleId[] = ["pr-ready", "tag", "workflow-dispatch"];
/** The context the default guard hands its verdict on `feat/x` (a4). */
const BAKED_DEFAULT = { ...ON_FEATURE, runs: DEFAULT_RUNS, deployingBranches: [], stricterThanDefault: false };
/**
 * The clients whose hook payload names no agent (review/158, `src/hooks/model.ts`'s codex and cursor notes): an act the
 * setting runs on the main thread only is refused there in every mode, since no call can be shown to be the main thread's.
 */
const NO_AGENT = new Set<Tool>(["codex", "cursor"]);
/** The refusal such a client gives an act the setting runs on the main thread only (review/158). */
function noAgentSentence(act: string, rule: string): string {
  const why =
    rule === "remote-write"
      ? "it moves the origin later writes are held to, so it runs on the main thread only (REQ-FLOW-134)"
      : "the autonomy setting runs it unasked on the main thread only (REQ-FLOW-137)";
  return `${act} is a person-only act (\`${rule}\`) and this client's hook payload names no agent, so the call cannot be shown to come from the main thread: ${why}. Give the person the exact command.`;
}
/** The guard's name for each act the setting runs (its `RUN_ACTS`). */
const RUN_ACT_NAMES: Readonly<Record<string, string>> = {
  "pr-ready": "Marking a pull request ready for review",
  tag: "Creating a tag",
  "workflow-dispatch": "Dispatching a workflow",
  "remote-write": "Writing a git remote or a URL rewrite",
};

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
  // TEST CHANGE, justified (ledger row 2026-10-18_cloud-runs-2/build/84, no spec id): the case runs every MATRIX row
  // through a spawned guard, about 4 s alone and 21-40 s under parallel lanes, so it has a budget of its own; every
  // assertion is unchanged.
  it.each(TOOLS)("%s: denies each person-only act and allows its neighbour, as u6's verdict says", { timeout: loadedCaseTimeout() }, async (tool) => {
    // TEST CHANGE, justified (REQ-FLOW-134, a4c build/21): the guard holds a REST write, gh's or curl's, to the origin of
    // the repository it sits in, so the scratch repository gets the origin `o/r` the rows write to, and the guard's own
    // context below carries it; each row still reads what it pinned.
    const guard = await placeGuard(tool, {
      ".git/refs/tags/v1.0.0": "0".repeat(40),
      ".git/config": '[remote "origin"]\n\turl = https://github.com/o/r.git\n',
    });
    for (const [command, rule] of MATRIX) {
      const source = personOnlyVerdict(command, ON_FEATURE);
      expect(source.deny ? source.rule : null, command).toBe(rule);
      // TEST CHANGE, justified (REQ-FLOW-137, a4): the guard reads each line with the context it bakes, the default
      // setting's, so a ready mark and a local tag (rows `gh pr ready 3`, `git tag v2`) run there; every other row is
      // the verdict above. The baked `ask` setting's answer to those two rows is pinned in the a4 block below.
      const guarded = personOnlyVerdict(command, { ...BAKED_DEFAULT, originRepo: "github.com/o/r", ghDefaultRepo: "github.com/o/r" });
      const decision = decide(tool, guard, command);
      // TEST CHANGE, justified (REQ-FLOW-137, review/158): on a client whose payload names no agent, a row the setting
      // runs is refused with the missing-identity sentence, since no call there can be shown to be the main thread's.
      const first = guarded.deny ? undefined : guarded.runs?.[0];
      if (first !== undefined && NO_AGENT.has(tool)) {
        expect(decision, `${tool}: ${command}`).toEqual({ deny: true, reason: expect.stringContaining(noAgentSentence(RUN_ACT_NAMES[first] ?? "This act", first)) });
        continue;
      }
      expect(decision.deny, `${tool}: ${command}`).toBe(guarded.deny);
      expect(guarded.deny || rule === null || DEFAULT_RUNS.includes(rule as PersonOnlyRuleId), command).toBe(true);
      // TEST CHANGE, justified (v0a2, REQ-FLOW-123, REQ-FLOW-124): the client no longer prints the verdict's `reason`;
      // it asks with the ask sentence where it holds an ask, and refuses with the refuse sentence, or with the ask
      // sentence and why it cannot ask, so each row now pins the client's answer to the verdict's class.
      if (guarded.deny) expect(decision, `${tool}: ${command}`).toEqual(expectedAttended(tool, guarded));
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

  // TEST CHANGE, justified (review/89, REQ-FLOW-123): this case ran on Claude Code and Copilot and pinned Copilot's
  // `permissionDecision: "ask"`; Copilot no longer asks, so it runs on Claude Code alone and the case below pins
  // Copilot's refusal byte for byte.
  it("claude: prints its ask byte for byte, on stdout with exit 0", async () => {
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const result = run(await placeGuard("claude"), payload("claude", MERGE));
    expect(result.status).toBe(0);
    expect(String(result.stderr)).toBe("");
    const shape = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: told(merge) } };
    expect(String(result.stdout)).toBe(`${JSON.stringify(shape)}\n`);
  });

  // ADDED (review/89): the guard refuses Copilot's attended merge, saying why and handing the person the command.
  // TEST CHANGE, justified (w4-copilot-ask, REQ-FLOW-123): the reason is reworded, and the title now says the merge comes
  // from a session Copilot's session start did not record, the case this payload is.
  it("copilot: refuses an attended merge byte for byte from a session its session start did not record (review/89, w4)", async () => {
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const result = run(await placeGuard("copilot"), payload("copilot", MERGE));
    expect(result.status).toBe(0);
    expect(String(result.stderr)).toBe("");
    const shape = { permissionDecision: "deny", permissionDecisionReason: `${told(merge)} ${NO_CALLER}` };
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

  // TEST CHANGE, justified (review/89, REQ-FLOW-123): this case ran on the clients that asked, Claude Code and Copilot,
  // and its neighbour asserted an ask; Copilot no longer asks, so the case names both clients with a PowerShell tool and
  // the neighbour reads each client's attended answer to the merge, an ask on Claude Code and a refusal on Copilot.
  it.each(["claude", "copilot"] as const)("%s: refuses a PowerShell call whose pwsh reading shows a forced refspec its POSIX reading does not", async (tool) => {
    // POSIX reads the backtick as a command substitution, so the line shows the merge alone; PowerShell reads it as
    // the escape, so its reading shows a `+main` refspec. The refused reading wins over the ask.
    const line = "gh pr merge 1; git push origin `+main";
    const posix = personOnlyVerdict(line, ON_FEATURE);
    expect(posix).toMatchObject({ deny: true, rule: "pr-merge", ask: true });
    const forced = personOnlyVerdict(`pwsh -Command '${line}'`, ON_FEATURE);
    expect(forced).toMatchObject({ deny: true, rule: "force-push", ask: false });
    if (!forced.deny || !posix.deny) return;
    expect(decide(tool, await placeGuard(tool), line, undefined, undefined, "PowerShell")).toEqual({ deny: true, reason: expect.stringContaining(told(forced)) });
    // The neighbour: the same line on the Bash tool is read once, as POSIX, and gets the merge's attended answer.
    expect(decide(tool, await placeGuard(tool), line)).toEqual(expectedAttended(tool, posix));
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
        // TEST CHANGE, justified (REQ-FLOW-143, a4): the list is named as the run's summary list, `morning.md`.
        `${morningList({ act, rule: "mcp__github__merge_pull_request" })} ${WHY}`,
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
    // The main thread, its identity fields absent or empty, gets the client's attended answer: an ask on Claude Code;
    // a refusal on Copilot, whose payload never carries these fields (review/89), and on Cursor and Codex.
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
      // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the host's system-file places pinned, as `run` pins them.
      const result = spawnSync(process.execPath, ["--require", probe, guard], { input: payload("claude", command), encoding: "utf8", env: hostFree(base), timeout: CHILD_TIMEOUT_MS }); // TEST CHANGE, justified: a time limit only, no expected value moved.
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

  // TEST CHANGE, justified (ledger row 2026-10-25_autonomy-distribution-02/review/20, no spec id): the case writes
  // 10,001 loose tags and spawns the guard over them; it ran past the 20 s default under load (40.7 s and 31.7 s) and
  // passed alone, so it has the loaded cases' budget; every assertion is unchanged.
  it.each(TOOLS)("%s: refuses a refspec push past 10,001 loose tags, naming the code, and no call that reads none", { timeout: loadedCaseTimeout() }, async (tool) => {
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
    // TEST CHANGE, justified (REQ-FLOW-134, the orchestrator's sign-off): a push from a place the guard cannot read asks now.
    expect(decide("claude", guard, "git push origin feat/x")).toMatchObject({ deny: true, reason: expect.stringContaining("outside-write") });
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
    // TEST CHANGE, justified (REQ-FLOW-134, the orchestrator's sign-off): a push from a place the guard cannot read asks now.
    expect(decide("claude", guard, 'git -C "$WT" push origin feat/x')).toMatchObject({ deny: true, reason: expect.stringContaining("outside-write") });
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
      "echo cd wt-main && git push",
      'git log --grep "env -C wt-main" -1 && git push',
      "cat <<'EOF'\ncd wt-main\nEOF\ngit push",
      // TEST CHANGE, justified (REQ-FLOW-141, review/76): a commit message read by `cat` from a quoted heredoc inside a
      // double-quoted substitution that is wholly an argument word is now data, so its `$env:` line no longer reads as
      // a command that may spell `--loosen`; it moved here from the asking list below.
      `git commit -m "$(cat <<'EOF'\n${MESSAGE}\nEOF\n)" && git push`,
      // TEST CHANGE, justified (REQ-FLOW-141, review/118): `git commit` reading its message on stdin is now a data
      // receiver, so these two left the asking list below.
      `git commit -s -F - <<'EOF' && git push\n${MESSAGE}\nEOF`,
      `git commit -F - <<EOF && git push\n${MESSAGE}\nEOF`,
    ];
    for (const command of allowed) expect(decide("claude", guard, command).deny, command).toBe(false);
    // TEST CHANGE, justified (REQ-FLOW-138, review/45): a heredoc body is read line by line, and a body line that opens on
    // a variable or a substitution reads as a command whose program word may spell `--loosen`, so these ask as a
    // loosening; the directory change is still not read from the body, so no push refusal names it. The body here goes
    // to a receiver REQ-FLOW-141 does not name (`cat`'s own output), so it keeps that reading.
    for (const command of [
      "cat <<'EOF'\n$(cd wt-main && git push)\nEOF",
    ]) {
      const decision = decide("claude", guard, command);
      expect(decision, command).toMatchObject({ deny: true, reason: expect.stringContaining("(`autonomy-loosen`)") });
    }
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

  it.each(TOOLS)("%s: reads a runner's git place behind a package manager's single-dash setting and its value", async (tool) => {
    // The first three read the place past the setting's value. The fourth is a pin.
    const guard = await placeGuard(tool, LINKED);
    const denied = [
      "npm -loglevel silly exec -- git -C wt-main push",
      "pnpm -reporter silent exec git -C wt-main push",
      "npm -cache c x -- env -C wt-main git push",
      "npm -g exec -- git -C wt-main push",
    ];
    for (const command of denied) expect(decide(tool, guard, command), `${tool}: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    const allowed = [
      "npm -loglevel silly exec -- git -C wt-feat push",
      "npm -loglevel silly exec -- git -C wt-main push origin feat/x",
      "npm -g exec -- git -C wt-main status",
      "npm -loglevel=silly exec -- git -C wt-main status",
    ];
    for (const command of allowed) expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(false);
  });

  it.each(TOOLS)("%s: reads a runner's git place in every reading of a package manager's options beside today's", async (tool) => {
    // Each denied row reads the place past the manager's options, in each reading of them. The allowed rows are pins.
    const guard = await placeGuard(tool, LINKED);
    const denied = [
      "yarn -s workspace w exec git -C wt-main push",
      "yarn --silent workspace w dlx git -C wt-main push",
      "npm --x exec x git -C wt-main push",
      "pnpm -x dlx dlx git -C wt-main push",
      "npm -- exec git -C wt-main push",
    ];
    for (const command of denied) expect(decide(tool, guard, command), `${tool}: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    const allowed = [
      "yarn -s workspace w exec git -C wt-feat push",
      "npm --x exec x git -C wt-main status",
      "npm -- exec git -C wt-main push origin feat/x",
    ];
    for (const command of allowed) expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(false);
  });

  it.each(TOOLS)("%s: answers a chain of package managers under the line cap quickly, refused past the readings cap", async (tool) => {
    // A long chain answers quickly. A line at the cap is a pin.
    // TEST CHANGE, justified (REQ-FLOW-102): the count is the guard call's, shared by its four verdict calls here (two
    // places, then the land and run readings), and each reading draws the text it re-reads, here about 60,000 characters
    // of tail: four readings over the four calls stay under 16 lines' worth, and one more is refused.
    const guard = await placeGuard(tool, LINKED);
    const chain = `${"npm -loglevel silly exec ".repeat(2_500)}git status`;
    const atCap = `git -C wt-main status; ${"npm -loglevel silly exec ".repeat(4)}echo${" a".repeat(30_000)}`;
    const pastCap = `git -C wt-main status; ${"npm -loglevel silly exec ".repeat(5)}echo${" a".repeat(30_000)}`;
    for (const command of [chain, atCap, pastCap]) expect(command.length, tool).toBeLessThan(65_536);
    for (const command of [chain, pastCap]) {
      const start = performance.now();
      expect(decide(tool, guard, command), tool).toMatchObject({ deny: true, reason: expect.stringContaining("could not decide this shell call (MANAGER_READINGS_OVER_16)") });
      expect(performance.now() - start, tool).toBeLessThan(10_000);
    }
    const start = performance.now();
    expect(decide(tool, guard, atCap).deny, tool).toBe(false);
    expect(performance.now() - start, tool).toBeLessThan(10_000);
  });

  it.each(TOOLS)("%s: counts the added readings over every place a line names, refused past the cap quickly", async (tool) => {
    // The places' added readings count together. The fixture is the root on a feature branch and 32 linked worktrees.
    const places: Record<string, string> = { ".git/HEAD": "ref: refs/heads/feat/x\n" };
    for (let i = 0; i < 32; i += 1) {
      places[`w${i}/.git`] = `gitdir: ../.git/worktrees/w${i}\n`;
      places[`.git/worktrees/w${i}/HEAD`] = i % 2 === 0 ? "ref: refs/heads/main\n" : `ref: refs/heads/feat/y${i}\n`;
      places[`.git/worktrees/w${i}/commondir`] = "../..\n";
    }
    const guard = await placeGuard(tool, places);
    const named = Array.from({ length: 32 }, (_, i) => `git -C w${i} status; `).join("");
    const head = `${named}${"npm -loglevel silly exec ".repeat(16)}echo`;
    const command = head + " a".repeat(Math.floor((65_000 - head.length) / 2));
    expect(command.length, tool).toBeLessThan(65_536);
    const start = performance.now();
    expect(decide(tool, guard, command), tool).toMatchObject({ deny: true, reason: expect.stringContaining("could not decide this shell call (MANAGER_READINGS_OVER_16)") });
    expect(performance.now() - start, tool).toBeLessThan(5_000);
    // A pin: the same places with no added reading still run.
    expect(decide(tool, guard, `${named}echo a`).deny, tool).toBe(false);
  });

  it.each(TOOLS)("%s: counts each short added reading's floor over every place a line names, refused past the cap quickly", async (tool) => {
    // Each added reading draws at least 4,096 characters against 16 lines' worth (16 × 65,536): seven short readings run
    // over the 34 places read (the root, the 32 worktrees, and the place past the place cap, which cannot be read) and the
    // two unattended readings, and an eighth is refused. The fixture is the root on a feature branch and 32 linked worktrees.
    // TEST CHANGE, justified (REQ-FLOW-102): the line is 15,000 characters where it was 65,000, since 34 places on that
    // line is past 8 lines' worth of places times text and is now refused whole. Each reading ends at its own segment, so
    // the floor this row counts does not depend on the line's length, and seven still run and the eighth is refused.
    const places: Record<string, string> = { ".git/HEAD": "ref: refs/heads/feat/x\n" };
    for (let i = 0; i < 32; i += 1) {
      places[`w${i}/.git`] = `gitdir: ../.git/worktrees/w${i}\n`;
      places[`.git/worktrees/w${i}/HEAD`] = i % 2 === 0 ? "ref: refs/heads/main\n" : `ref: refs/heads/feat/y${i}\n`;
      places[`.git/worktrees/w${i}/commondir`] = "../..\n";
    }
    const guard = await placeGuard(tool, places);
    const named = Array.from({ length: 32 }, (_, i) => `git -C w${i} status; `).join("");
    const line = (calls: number): string => {
      const head = `${named}${"pnpm -r exec tsc; ".repeat(calls)}echo`;
      return head + " a".repeat(Math.floor((15_000 - head.length) / 2));
    };
    for (const calls of [1, 7, 8]) expect(line(calls).length, tool).toBeLessThan(65_536);
    const start = performance.now();
    for (const calls of [1, 7]) expect(decide(tool, guard, line(calls)), `${tool}: ${calls}`).toEqual({ deny: false });
    expect(decide(tool, guard, line(8)), tool).toMatchObject({ deny: true, reason: expect.stringContaining("could not decide this shell call (MANAGER_READINGS_OVER_16)") });
    expect(performance.now() - start, tool).toBeLessThan(10_000);
  });

  it.each(TOOLS)("%s: runs harmless lines of package manager calls with an option before a runner, a brace among them, on each shell", async (tool) => {
    // Each added reading draws the text it re-reads, so ordinary lines of such calls stay under the cap.
    const guard = await placeGuard(tool);
    const bash = [
      Array.from({ length: 12 }, () => "pnpm -r exec tsc").join(" && "),
      `{ ${Array.from({ length: 6 }, () => "npm --silent exec tsc").join("; ")}; }`,
      "pnpm -w exec tsc && pnpm -w exec vitest run && pnpm -w exec eslint .",
    ];
    for (const command of bash) expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    // Cursor's shell hook names no shell, so its calls are read as POSIX text only.
    if (tool === "cursor") return;
    // TEST CHANGE, justified: the line behind a hashtable left this list for the row below, which says why it stops.
    const powershell = [
      "if (Test-Path dist) { npm --silent exec tsc }",
      "Get-ChildItem packages | ForEach-Object { pnpm -r exec tsc }",
      Array.from({ length: 6 }, () => "pnpm -r exec tsc").join("; "),
    ];
    for (const command of powershell) expect(decide(tool, guard, command, undefined, undefined, "PowerShell"), `${tool}: ${command}`).toEqual({ deny: false });
  });

  // TEST CHANGE, justified: this line was pinned to run, and `acceptHiddenVerdict` (review/70) stops it. Its first word is
  // one the shell fills in, so its program is unsettled, and a word it cannot read stands past that; the reading has no
  // assignment exception. Both results cannot hold, so the stop wins. An over-ask, on the safe side: it costs a click where
  // the client asks, and is refused elsewhere. The row's first point holds: the readings' cap does not reach this line.
  it.each(TOOLS)("%s: stops a line behind a PowerShell hashtable as a line it cannot read, in every mode, not at the readings' cap", async (tool) => {
    const guard = await placeGuard(tool);
    const line = "$o = @{ a = 1 }; pnpm -r exec tsc";
    // Cursor's shell hook names no shell, so the same line reads as POSIX text there, and stops under the loosen reading.
    const powershell = tool !== "cursor";
    const shell: Shell = powershell ? "PowerShell" : "Bash";
    // The copy reads a PowerShell call as it stands and as its own `pwsh -Command` line; the second reading stops this one.
    const verdict = personOnlyVerdict(powershell ? `pwsh -Command '${line}'` : line, { ...BAKED_DEFAULT, powershell });
    expect(verdict, tool).toMatchObject({ deny: true, rule: powershell ? "learn-accept" : "autonomy-loosen", ask: true });
    if (verdict.deny) expect(decide(tool, guard, line, undefined, undefined, shell), tool).toEqual(expectedAttended(tool, verdict));
    const helper = JSON.stringify({ ...JSON.parse(payload(tool, line, undefined, shell)), agent_id: "a1" });
    expect(clientDecision(tool, run(guard, helper), `${tool} helper`).deny).toBe(true);
    // One fact away: an assignment holding no word the guard cannot read runs on the same shell, in the same place.
    const plain = "$o = 1; pnpm -r exec tsc";
    if (powershell) expect(decide(tool, guard, plain, undefined, undefined, shell), tool).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-11-05_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, line, undefined, undefined, shell).deny, `${tool} unattended`).toBe(true);
    if (powershell) expect(decide(tool, guard, plain, undefined, undefined, shell), `${tool} unattended`).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: reads a runner's git place behind pnpm's workspace-root flag", async (tool) => {
    // The flag takes no value here, so the runner's word past it is read.
    const guard = await placeGuard(tool, LINKED);
    const denied = ["pnpm -w exec git -C wt-main push", "pnpm -w --filter x exec git -C wt-main push"];
    for (const command of denied) expect(decide(tool, guard, command), `${tool}: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("push-default") });
    const allowed = ["pnpm -w exec git -C wt-feat push", "pnpm -w exec git -C wt-main status", "npm -w x exec -- git -C wt-feat push"];
    for (const command of allowed) expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(false);
  });

  // Past the place reader's cap the line is refused with the verdicts' coded error. Each fixture place holds a fact only
  // that checkout knows: another repository's origin, a tag, a default branch.
  describe("the place reader's cap of added readings", () => {
    const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
    const FACTS: Record<string, string> = {
      ".git/config": ORIGIN,
      "other/.git/HEAD": "ref: refs/heads/feat/x\n",
      "other/.git/config": '[remote "origin"]\n\turl = https://github.com/other/repo.git\n',
      "tagged/.git/HEAD": "ref: refs/heads/feat/x\n",
      "tagged/.git/config": ORIGIN,
      "tagged/.git/refs/tags/only-there": "0".repeat(40),
      "trunk/.git/HEAD": "ref: refs/heads/feat/x\n",
      "trunk/.git/config": ORIGIN,
      "trunk/.git/refs/remotes/origin/HEAD": "ref: refs/remotes/origin/trunk\n",
    };
    const PUSHES = ["cd other && git push -u origin feat/x", "cd tagged && git push origin only-there", "cd trunk && git push origin trunk"];
    const READING = "npm -loglevel silly exec echo a; ";
    const CODED = { deny: true, reason: expect.stringContaining("could not decide this shell call (MANAGER_READINGS_OVER_16)") };
    const shells = (tool: Tool): readonly Shell[] => (tool === "cursor" ? ["Bash"] : ["Bash", "PowerShell"]);

    it.each(TOOLS)("%s: reads each push behind a line at the cap exactly as that push alone, on each shell", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      for (const shell of shells(tool)) {
        for (const push of PUSHES) {
          const alone = decide(tool, guard, push, undefined, undefined, shell);
          expect(alone.deny, `${tool} ${shell}: ${push}`).toBe(true);
          expect(decide(tool, guard, `${READING.repeat(16)}${push}`, undefined, undefined, shell), `${tool} ${shell}: ${push}`).toEqual(alone);
        }
      }
    });

    it.each(TOOLS)("%s: refuses each push behind a line past the cap, by any count of readings, on each shell", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      for (const shell of shells(tool)) {
        for (const push of PUSHES) {
          for (const readings of [17, 60]) {
            expect(decide(tool, guard, `${READING.repeat(readings)}${push}`, undefined, undefined, shell), `${tool} ${shell} ${readings}: ${push}`).toMatchObject(CODED);
          }
        }
      }
    });

    // Added readings that fill the place cap refuse the line. A line that reaches the cap holding none reads as it did.
    it.each(TOOLS)("%s: refuses a push behind added readings that fill the place cap, and reads the same places with none", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const filling = "npm -a b exec -c exec -d exec git -C other -C tagged -C trunk status; ".repeat(11);
      for (const shell of shells(tool)) {
        for (const push of PUSHES) expect(decide(tool, guard, `${filling}${push}`, undefined, undefined, shell), `${tool} ${shell}: ${push}`).toMatchObject(CODED);
      }
      expect(decide(tool, guard, `${"git -C tagged status; ".repeat(40)}echo a`), tool).toEqual({ deny: false });
    });

    // The place reader reads a text holding a brace with its braces as words too, apart from the first reading, so that
    // one's places and cap stay.
    const BEHIND = [
      ["npm --x}", "npm", "x"],
      ["npm -x {y", "npm", "x"],
      ["pnpm --x {y}", "pnpm", "exec"],
      ["yarn -x y}", "yarn", "dlx"],
      ["bun --x=${y}", "bun", "x"],
    ] as const;
    const WHERE = ["git -C other push -u origin feat/x", "git -C tagged push origin only-there", "git -C trunk push origin trunk"];

    it.each(TOOLS)("%s: reads a runner's git place behind a brace in a manager's options as the runner-direct line reads it, on each shell", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      for (const shell of shells(tool)) {
        for (const push of WHERE) {
          for (const [options, manager, runner] of BEHIND) {
            const direct = decide(tool, guard, `${manager} ${runner} ${push}`, undefined, undefined, shell);
            expect(direct.deny, `${tool} ${shell}: ${push}`).toBe(true);
            expect(decide(tool, guard, `${options} ${runner} ${push}`, undefined, undefined, shell), `${tool} ${shell}: ${options} ${push}`).toEqual(direct);
          }
        }
      }
    });

    it.each(TOOLS)("%s: reads a git place behind a brace in a wrapper's or git's own option, and in a nested line, as the brace-free line reads it, on each shell", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      for (const shell of shells(tool)) {
        for (const push of WHERE) {
          const rows = [
            [`timeout --kill-after=} 5 ${push}`, `timeout 5 ${push}`],
            [`sudo -u {x ${push}`, `sudo -u x ${push}`],
            [push.replace("git ", "git -c a={b "), push.replace("git ", "git -c a=b ")],
            [`sh -c 'npm --x} x ${push}'`, `sh -c 'npm x ${push}'`],
            [`{ sh -c 'npm --x} x ${push}'; }`, `sh -c 'npm x ${push}'`],
            [`cd . && npm --x} x ${push}`, `cd . && npm x ${push}`],
          ] as const;
          for (const [behind, plain] of rows) {
            const alone = decide(tool, guard, plain, undefined, undefined, shell);
            expect(alone.deny, `${tool} ${shell}: ${plain}`).toBe(true);
            expect(decide(tool, guard, behind, undefined, undefined, shell), `${tool} ${shell}: ${behind}`).toEqual(alone);
          }
        }
      }
    });

    // Pins: the second reading adds places and never moves the first one's cap, so a line that ran still runs.
    it.each(TOOLS)("%s: runs harmless lines with a brace at each place, past the place cap by the first reading too", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const rows = [
        "npm --x} x git -C tagged status",
        "{ git -C tagged status; }",
        "echo {a,b}; git -C other status",
        `git commit -m '{"a": 1}'`,
        `${"{ git -C tagged status; }; ".repeat(40)}echo a`,
      ];
      for (const command of rows) expect(decide(tool, guard, command), `${tool}: ${command.slice(0, 80)}`).toEqual({ deny: false });
    });

    // A later place the first reading never saw must not go unread: its cap fails closed as the added readings' does.
    it.each(TOOLS)("%s: refuses a line whose reading with braces as words alone passes the place cap", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      expect(decide(tool, guard, `npm --x} x git ${"-C tagged ".repeat(40)}status`), tool).toMatchObject(CODED);
    });

    // Brace readings share the place cap, counted by the places they name, so reading one place again is not refused for it.
    const HELD = Object.fromEntries(Array.from({ length: 40 }, (_, at) => [`held/${at}/HEAD`, "ref: refs/heads/feat/x\n"]));
    const behind = (place: string): string => `echo "$(timeout --kill-after=} 5 git --git-dir ${place} status)"`;
    const held = (count: number): string => Array.from({ length: count }, (_, at) => behind(`held/${at}`)).join("; ");

    it.each(TOOLS)("%s: refuses a line whose brace readings together pass the place cap, past it by the first reading too, on each shell", async (tool) => {
      const guard = await placeGuard(tool, { ...FACTS, ...HELD });
      for (const shell of shells(tool)) {
        expect(decide(tool, guard, held(40), undefined, undefined, shell), `${tool} ${shell}`).toMatchObject(CODED);
        expect(decide(tool, guard, `${"git -C tagged status; ".repeat(40)}${held(40)}`, undefined, undefined, shell), `${tool} ${shell}`).toMatchObject(CODED);
      }
    });

    // Pins: the shared cap counts places, not readings, and a brace reading starts from the first reading's own place, so
    // a line past the cap by the first reading alone, with a brace on it, reads as it did.
    it.each(TOOLS)("%s: runs lines under the shared cap, a place read again, and a line past it by the first reading alone, on each shell", async (tool) => {
      const guard = await placeGuard(tool, { ...FACTS, ...HELD });
      const rows = [
        held(8),
        Array.from({ length: 40 }, () => behind("held/0")).join("; "),
        `${Array.from({ length: 40 }, (_, at) => `git -C held/${at} status`).join("; ")}; echo {a}`,
      ];
      for (const shell of shells(tool)) {
        for (const command of rows) expect(decide(tool, guard, command, undefined, undefined, shell), `${tool} ${shell}: ${command.slice(0, 80)}`).toEqual({ deny: false });
      }
    });

    // A place named again costs nothing: each entry in the list the guard walks costs the filesystem reads of finding its
    // repository, so the list holds a place once, however many readings name it. Counted on the guard's own process, since
    // the verdict reads the same either way.
    const COUNTER = [
      'import fs from "node:fs";',
      'import { syncBuiltinESMExports } from "node:module";',
      "let reads = 0;",
      'for (const name of ["statSync", "lstatSync"]) {',
      "  const real = fs[name];",
      "  fs[name] = (...words) => { reads += 1; return real(...words); };",
      "}",
      "syncBuiltinESMExports();",
      'process.on("exit", () => fs.writeFileSync(process.env.COUNTED_READS, String(reads)));',
    ].join("\n");

    it.each(TOOLS)("%s: reads a place once, however many readings name it, on each shell", async (tool) => {
      const guard = await placeGuard(tool, { ...FACTS, ...HELD, "counter.mjs": COUNTER });
      const out = getRepo().path("reads.txt");
      const env = { NODE_OPTIONS: `--import=${pathToFileURL(getRepo().path("counter.mjs")).href}`, COUNTED_READS: out };
      const counted = (readings: number, shell: Shell): number => {
        const line = Array.from({ length: readings }, () => behind("held/0")).join("; ");
        expect(decide(tool, guard, line, env, undefined, shell), `${tool} ${shell}`).toEqual({ deny: false });
        return Number(readFileSync(out, "utf8"));
      };
      for (const shell of shells(tool)) expect(counted(200, shell), `${tool} ${shell}`).toBe(counted(2, shell));
    });

    // Each place is a full verdict of every text, so places times text is the call's work: past 8 lines' worth the call is
    // refused, and neither many places on a short line nor one place on a long line comes near that.
    it.each(TOOLS)("%s: refuses many places on a long line, and runs either one alone, on each shell", async (tool) => {
      const guard = await placeGuard(tool, { ...FACTS, ...HELD });
      const places = (count: number): string => Array.from({ length: count }, (_, at) => `git --git-dir held/${at} status`).join("; ");
      const text = `echo ${"a".repeat(60_000)}`;
      for (const shell of shells(tool)) {
        expect(decide(tool, guard, `${places(30)}; ${text}`, undefined, undefined, shell), `${tool} ${shell}`).toMatchObject(CODED);
        for (const command of [`${places(30)}; echo a`, `${places(1)}; ${text}`]) {
          expect(decide(tool, guard, command, undefined, undefined, shell), `${tool} ${shell}: ${command.slice(0, 80)}`).toEqual({ deny: false });
        }
      }
    });

    // A line past the line cap is refused as that, unread, whatever its places.
    it("keeps the line cap's own refusal on a line past it, with places on it", async () => {
      const guard = await placeGuard("claude", { ...FACTS, ...HELD });
      const places = Array.from({ length: 30 }, (_, at) => `git --git-dir held/${at} status`).join("; ");
      expect(decide("claude", guard, `${places}; echo ${"a".repeat(70_000)}`)).toMatchObject({ deny: true, reason: expect.stringContaining("too long") });
    });

    // Each level of nesting doubles the brace readings, so they draw on 8 lines' worth of text, and a line past the line
    // cap gets none.
    it.each(TOOLS)("%s: refuses a nested line past the brace readings' text cap, quickly, and runs one level of it", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const text = `echo {a}${" a".repeat(30_000)}`;
      const start = performance.now();
      expect(decide(tool, guard, `sh -c 'sh -c "sh -c \\"${text}\\""'`), tool).toMatchObject(CODED);
      expect(performance.now() - start, tool).toBeLessThan(5_000);
      expect(decide(tool, guard, `sh -c '${text}'`), tool).toEqual({ deny: false });
    });

    it("refuses a nested line past the line cap as too long, quickly", async () => {
      const guard = await placeGuard("claude", FACTS);
      const start = performance.now();
      expect(decide("claude", guard, `sh -c 'sh -c "sh -c \\"${"$(a{) ".repeat(320_000)}\\""'`)).toMatchObject({ deny: true, reason: expect.stringContaining("too long") });
      expect(performance.now() - start).toBeLessThan(15_000);
    });

    // A push from a place the guard cannot read asks, as one to another repository, and so does a push behind a full line.
    const OUTSIDE = { deny: true, reason: expect.stringContaining("outside-write") };
    const BY_URL = "cd tagged && git push https://github.com/acme/app.git only-there";

    it.each(TOOLS)("%s: asks about each push behind a line that fills the place cap, on each shell, and refuses it unattended", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const full = "git -C tagged status; ".repeat(40);
      for (const shell of shells(tool)) {
        for (const push of [...PUSHES, BY_URL]) expect(decide(tool, guard, `${full}${push}`, undefined, undefined, shell).deny, `${tool} ${shell}: ${push}`).toBe(true);
      }
      for (const push of PUSHES) expect(decide(tool, guard, `${full}${push}`, { STAMITY_UNATTENDED: "1" }).deny, `${tool}: ${push}`).toBe(true);
    });

    it.each(TOOLS)("%s: asks about a push from a place the guard cannot read, on each shell", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const rows = [
        'git -C "$X" push -u origin feat/x',
        'cd "$X" && git push -u origin feat/x',
        "git -C nowhere push -u origin feat/x",
        "cd nowhere && git push -u origin feat/x",
        "git -C {other,} push -u origin feat/x",
        "cd oth{er,} && git push -u origin feat/x",
        "cd - && git push -u origin feat/x",
        "git --git-dir=nowhere push origin feat/x",
        "git -C nowhere push https://github.com/acme/app.git feat/x",
      ];
      for (const shell of shells(tool)) {
        for (const command of rows) expect(decide(tool, guard, command, undefined, undefined, shell), `${tool} ${shell}: ${command}`).toMatchObject(OUTSIDE);
      }
    });

    // Pins: only a push asks. A place it can read keeps its reading, and a line past the cap holding no push still runs.
    it.each(TOOLS)("%s: runs a line holding no push from a place the guard cannot read, and a push from its own checkout", async (tool) => {
      const guard = await placeGuard(tool, FACTS);
      const rows = [
        'git -C "$X" status',
        "cd nowhere && ls",
        "git -C nowhere log",
        "git push origin feat/x",
        "git -C . push origin feat/x",
        `${"git -C tagged status; ".repeat(40)}echo a`,
      ];
      for (const command of rows) expect(decide(tool, guard, command), `${tool}: ${command.slice(0, 80)}`).toEqual({ deny: false });
    });
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
      // TEST CHANGE, justified (build/12): a substitution whose closing scan nothing ends on the line now leaves the
      // rest of the line read as filled in, so the quoted-parenthesis form's feature twin asks (a command the guard
      // cannot read) instead of running; its denied line still names the push to the default branch.
      const unclosed = form.includes("printf '('");
      expect(decide("claude", guard, allowed, undefined, undefined, shell).deny, allowed).toBe(unclosed);
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
    // TEST CHANGE, justified (REQ-FLOW-124): a push naming no remote under xargs reads the word xargs adds in the
    // remote's place, which may be a force or delete option, so these lines now refuse under the force rule.
    for (const command of ["echo wt-main | xargs -I {} git -C {} push", "xargs -I{} git --git-dir {} push"]) {
      expect(decide("claude", guard, command), command).toMatchObject({ deny: true, reason: expect.stringContaining("(`force-push`)") });
    }
    // TEST CHANGE, justified (REQ-FLOW-102): a git call under xargs now reads as holding a word the line cannot show, so
    // this push asks whatever its place. A shown place alone still reads as one.
    // TEST CHANGE, justified (REQ-FLOW-124): as above, the word xargs adds in the remote's place now refuses under the force rule.
    expect(decide("claude", guard, "xargs -I {} git -C wt-feat push")).toMatchObject({ deny: true, reason: expect.stringContaining("(`force-push`)") });
    expect(decide("claude", guard, "git -C wt-feat push").deny).toBe(false);
    // TEST CHANGE, justified (REQ-FLOW-134, the orchestrator's sign-off): a push from a place the guard cannot read asks now.
    // TEST CHANGE, justified (REQ-FLOW-102): under xargs the push itself asks first, so it is the act named.
    expect(decide("claude", guard, "echo wt-main | xargs -I {} git -C {} push origin feat/x")).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining("push-default") });
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

  it("skips a package manager's options before its subcommand by one rule in u6 and in the guard", () => {
    // Each copy is evaluated with its tables and run on one table of lines, every index each reading lands on; the two u6
    // copies are one text (personOnly.test.ts).
    type Skip = (name: string, words: readonly (string | null)[], from: number) => number[];
    const ruleOf = (source: string, from: string, to: string): Skip => {
      const start = source.indexOf(from);
      const end = source.indexOf(to, start);
      expect(start, from).toBeGreaterThan(-1);
      expect(end, to).toBeGreaterThan(start);
      return new Function(`${source.slice(start, end)}\nreturn managerSubs;`)() as Skip;
    };
    const u6 = ruleOf(personOnlyVerdict.toString(), "const ASSIGNMENT", "function programName");
    const lines: readonly (readonly (string | null)[])[] = [
      ["npm", "-loglevel", "silly", "exec", "git"],
      ["npm", "--loglevel", "silly", "exec", "git"],
      ["npm", "-loglevel=silly", "exec", "git"],
      ["npm", "-g", "exec", "git"],
      ["npm", "-g", "publish", "exec", "git"],
      ["npm", "-g", "--", "exec", "git"],
      ["npm", "-w", "x", "-cache", "c", "x", "git"],
      ["pnpm", "-reporter", "silent", "dlx", "git"],
      ["yarn", "workspace", "x", "-v", "exec", "git"],
      ["bun", "-loglevel", "silly"],
      ["git", "-C", "x", "push"],
      ["npm", "-loglevel", null, "exec", "git"],
      ["yarn", "-s", "workspace", "x", "exec", "git"],
      ["yarn", "--silent", "workspace", "x", "dlx", "git"],
      ["npm", "--x", "exec", "exec", "git"],
      ["pnpm", "-r", "--", "exec", "git"],
      ["bun", "-a", "v", "-b", "w", "x", "git"],
      ["pnpm", "-w", "exec", "git"],
      ["npm", "-w", "exec", "git"],
    ];
    // The rule activated: today's index first (a single-dash word read as a flag), then each other one, in order.
    // pnpm's `-w` is a flag, its value-taking reading kept beside it; npm's `-w` takes its value alone.
    expect(u6("pnpm", lines[17] ?? [], 1)).toEqual([2, 3]);
    expect(u6("npm", lines[18] ?? [], 1)).toEqual([3]);
    expect(u6("npm", lines[0] ?? [], 1)).toEqual([2, 3]);
    expect(u6("npm", lines[3] ?? [], 1)).toEqual([2, 3]);
    expect(u6("yarn", lines[12] ?? [], 1)).toEqual([4, 3]);
    expect(u6("npm", lines[14] ?? [], 1)).toEqual([2, 3]);
    expect(u6("pnpm", lines[15] ?? [], 1)).toEqual([2, 3]);
    expect(u6("git", lines[10] ?? [], 1)).toEqual([1]);
    for (const tool of TOOLS) {
      const content = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true }).at(-1)?.content ?? "";
      const guard = ruleOf(content, "const RUNNER = ", "function placesOf");
      for (const words of lines) {
        expect(guard(words[0] ?? "", words, 1), `${tool}: ${words.join(" ")}`).toEqual(u6(words[0] ?? "", words, 1));
      }
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
    // review/231's line as the PowerShell tool sends it, beside the same line with no variable set. TEST CHANGE,
    // justified (v0b, REQ-FLOW-121): the twin ended in the run verb, which now stands alone on its line unattended, so
    // it is retargeted to `npm test`; the twins in the loop below are retargeted the same way.
    expect(decide("claude", guard, `$env:GIT_EXEC_PATH = 'C:\\tmp'; ${RUN_END}`, undefined, undefined, "PowerShell").deny).toBe(true);
    expect(decide("claude", guard, "$env:GIT_EXEC_PATH; npm test", undefined, undefined, "PowerShell").deny).toBe(false);
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
      "grep GIT_CONFIG_COUNT src", "env -u GIT_EXEC_PATH npm test", "gh pr view 3 --json mergeStateStatus",
      "declare -p GIT_EXEC_PATH; npm test", "declare -x GIT_TERMINAL_PROMPT; npm test", "typeset -i GIT_CONFIG_COUNT; npm test",
      "read OTHER_NAME <<< /tmp/bin; npm test", 'echo "$GIT_EXEC_PATH"; npm test', 'set +a; read OTHER_NAME <<< "$GIT_EXEC_PATH"; npm test',
      'set -e; echo "$GIT_EXEC_PATH"; npm test', 'for f in GIT_EXEC_PATH GIT_EDITOR; do grep -rn "$f" src; done; npm test',
      "printf '%s\\n' GIT_EXEC_PATH; npm test", "npm -w x exec -- git status", "cmd /c g^it status", "wget --meth=GET https://api.github.com/repos/o/r/pulls/3",
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

describe("a run verb alone on its line, unattended, on every client (v0b, REQ-FLOW-121)", () => {
  const WRAPPED = `env -u GIT_EXEC_PATH ${RUN_END}`;

  it.each(TOOLS)("on %s, refuses the verb behind a wrapper and lets it pass alone; attended, both pass", async (tool) => {
    const guard = await placeGuard(tool);
    // Non-degenerate: attended (no record), the wrapped verb passes, as it did before the rule.
    expect(decide(tool, guard, WRAPPED)).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") });
    const verdict = unattendedPushVerdict(WRAPPED);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(decide(tool, guard, WRAPPED)).toEqual({ deny: true, reason: expect.stringContaining(verdict.reason) });
    expect(decide(tool, guard, RUN_END)).toEqual({ deny: false });
  });

  it.each(TOOLS)("on %s, refuses the verb written after a valued option behind a prefix assignment (review/130)", async (tool) => {
    const command = "HOME=/tmp/h npx --no stamity run --run x end";
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, command)).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") });
    const verdict = unattendedPushVerdict(command);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(decide(tool, guard, command)).toEqual({ deny: true, reason: expect.stringContaining(verdict.reason) });
  });

  it.each(TOOLS)("on %s, refuses the CLI file's verb after a quoted value holding a separator, behind a prefix assignment (review/130)", async (tool) => {
    const command = "PATH=/tmp/bin node dist/cli.js run --title 'a;b' end --run x";
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, command)).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") });
    const verdict = unattendedPushVerdict(command);
    expect(verdict.deny).toBe(true);
    if (verdict.deny) expect(decide(tool, guard, command)).toEqual({ deny: true, reason: expect.stringContaining(verdict.reason) });
  });

  it.each(["claude", "copilot"] as const)(
    "on %s, refuses a PowerShell splat after the verb and lets a quoted `@` pass (review/131)",
    async (tool) => {
      const guard = await placeGuard(tool, { ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") });
      const splat = `${RUN_END} --title @rest`;
      const verdict = unattendedPushVerdict(splat, true);
      expect(verdict.deny).toBe(true);
      if (verdict.deny) {
        expect(decide(tool, guard, splat, undefined, undefined, "PowerShell")).toEqual({ deny: true, reason: expect.stringContaining(verdict.reason) });
      }
      expect(decide(tool, guard, `${RUN_END} --title '@rest'`, undefined, undefined, "PowerShell")).toEqual({ deny: false });
    },
  );

  it.each(["claude", "copilot"] as const)(
    "on %s, reads the PowerShell tool's text as PowerShell: the verb alone passes, a line before it or the agent's own pwsh -Command does not",
    async (tool) => {
      const guard = await placeGuard(tool, { ".stamity/runs/2026-10-18_x/record.md": record("in progress", "unattended") });
      expect(decide(tool, guard, RUN_END, undefined, undefined, "PowerShell")).toEqual({ deny: false });
      for (const command of [`Set-Content env:GIT_EXEC_PATH C:/tmp; ${RUN_END}`, `pwsh -Command '${RUN_END}'`]) {
        const verdict = unattendedPushVerdict(command, true);
        expect(verdict.deny, command).toBe(true);
        if (verdict.deny) {
          expect(decide(tool, guard, command, undefined, undefined, "PowerShell"), command).toEqual({
            deny: true,
            reason: expect.stringContaining(verdict.reason),
          });
        }
      }
    },
  );
});

describe("PowerShell's typographic quotes, read as quotes on the PowerShell tool (v0b, W-1)", () => {
  it.each(["claude", "copilot"] as const)("on %s, refuses a force push placed after one, attended, and allows its read twin", async (tool) => {
    const [LSQ, RSQ] = [0x2018, 0x2019].map((code) => String.fromCharCode(code));
    const guard = await placeGuard(tool);
    const hidden = `echo 'a${RSQ}; git push --force origin feat/x; ${LSQ}b'`;
    expect(decide(tool, guard, hidden, undefined, undefined, "PowerShell")).toEqual({
      deny: true,
      reason: expect.stringContaining("(`force-push`)"),
    });
    expect(decide(tool, guard, `echo 'a${RSQ}; git status; ${LSQ}b'`, undefined, undefined, "PowerShell")).toEqual({ deny: false });
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

/**
 * a4-guard-ask-list (REQ-FLOW-137, REQ-FLOW-138, REQ-FLOW-140, REQ-FLOW-121, REQ-FLOW-123): the guard as a client runs
 * it, the autonomy setting baked into the copy. Each act that runs sits beside the baked fact (mode `ask`, an act or
 * branch named as deploying, an unattended record) that turns it back into an ask or a refusal.
 */
describe("the autonomy setting the guard bakes (a4)", () => {
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };
  const WHY = "This session is unattended because .stamity/runs/2026-10-23_x/record.md reads `Status: in progress` and `Mode: unattended`.";
  const ASK_MODE = resolveAutonomy({ autonomy: { mode: "ask" } });
  const READY = "gh pr ready 3";
  const ANNOTATED = "git tag -a v2 -m 'release v2'";
  const LIGHT = "git tag v2";

  it("carries the setting as its marker line, read back as the setting it was rendered from", () => {
    for (const manifest of [{}, { autonomy: { mode: "ask" as const } }, { autonomy: { deployingBranches: ["production", "release/*"], deployingActs: ["workflow-dispatch" as const, "pr-merge" as const] } }]) {
      const setting = resolveAutonomy(manifest);
      for (const tool of TOOLS) {
        const content = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true, autonomy: setting }).at(-1)?.content ?? "";
        expect(parseAutonomyMarker(content), `${tool}: ${JSON.stringify(manifest)}`).toEqual(setting);
        expect(content.split("\n").filter((line) => line.startsWith("// stamity-autonomy ")), tool).toHaveLength(1);
      }
    }
    // A caller naming no setting renders the default an absent manifest key resolves to.
    const unnamed = planCoreHookScripts(POLICY, "claude", { ...CLI_PIN, personOnlyGuard: true }).at(-1)?.content ?? "";
    expect(parseAutonomyMarker(unnamed)).toEqual(resolveAutonomy({}));
  });

  it("refuses to bake a branch name that would end the marker's comment line, and bakes its neighbour", () => {
    // Built from their codes, so this file holds no raw separator: a line separator, a paragraph separator, a newline.
    for (const code of [0x2028, 0x2029, 0x0a]) {
      const setting = { ...resolveAutonomy({}), deployingBranches: [`x${String.fromCharCode(code)}process.exit(0)`] };
      expect(() => planCoreHookScripts(POLICY, "claude", { ...CLI_PIN, personOnlyGuard: true, autonomy: setting }), String(code)).toThrow(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    }
    const plain = resolveAutonomy({ autonomy: { deployingBranches: ["x/process.exit"] } });
    const content = planCoreHookScripts(POLICY, "claude", { ...CLI_PIN, personOnlyGuard: true, autonomy: plain }).at(-1)?.content ?? "";
    expect(parseAutonomyMarker(content)).toEqual(plain);
  });

  it("is the setting emission resolves from the manifest, in every copy and on the plan", async () => {
    const plan = await planHooksInfra({
      rootDir: getRepo().path(),
      manifest: { tools: [...TOOLS], autonomy: { mode: "ask", deployingBranches: ["production"] } },
      engineVersion: "1.0.0-golden",
    });
    const setting = resolveAutonomy({ autonomy: { mode: "ask", deployingBranches: ["production"] } });
    expect(plan.autonomy).toEqual(setting);
    const copies = plan.scripts.filter((script) => script.path.endsWith(`/${PERSON_ONLY_GUARD_FILE}`));
    expect(copies.map((copy) => copy.tool).toSorted()).toEqual([...TOOLS].toSorted());
    for (const copy of copies) expect(parseAutonomyMarker(copy.content), copy.path).toEqual(setting);
  });

  // TEST CHANGE, justified (REQ-FLOW-137, review/158): Codex and Cursor name no agent, so they refuse these acts in
  // every mode; their answer is pinned in the review/158 block below.
  it.each(TOOLS.filter((tool) => !NO_AGENT.has(tool)))("%s: runs a ready mark and an annotated local tag attended under the default setting", async (tool) => {
    const guard = await placeGuard(tool);
    for (const command of [READY, ANNOTATED, LIGHT]) expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    const quiet = run(guard, payload(tool, READY));
    expect(quiet.status).toBe(0);
    expect(String(quiet.stdout).trim()).toBe(tool === "cursor" ? '{"permission":"allow"}' : "");
  });

  it.each(TOOLS)("%s: asks for both with 1.16.0's sentence under a baked `ask`", async (tool) => {
    const guard = await placeGuard(tool, {}, ASK_MODE);
    for (const command of [READY, ANNOTATED]) {
      const verdict = personOnlyVerdict(command, ON_FEATURE);
      if (!verdict.deny) throw new Error(`${command} is no person-only act`);
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
    }
  });

  // TEST CHANGE, justified (REQ-FLOW-137, review/158): Codex and Cursor refuse both with the missing-identity sentence;
  // pinned in the review/158 block below.
  it.each(TOOLS.filter((tool) => !NO_AGENT.has(tool)))("%s: unattended, refuses a raw ready mark with the summary-list sentence and lets a local tag run", async (tool) => {
    const guard = await placeGuard(tool, UNATTENDED);
    expect(decide(tool, guard, READY)).toEqual({
      deny: true,
      reason: expect.stringContaining(`${morningList({ act: "Marking a pull request ready for review", rule: "pr-ready" })} ${WHY}`),
    });
    expect(decide(tool, guard, LIGHT)).toEqual({ deny: false });
    // A push of that tag stays refused.
    expect(decide(tool, guard, "git push origin --tags").deny).toBe(true);
  });

  it("asks for a ready mark again where the repository names it as deploying, in either mode", async () => {
    const guard = await placeGuard("claude", {}, resolveAutonomy({ autonomy: { deployingActs: ["pr-ready"] } }));
    expect(decide("claude", guard, READY)).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, LIGHT)).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: asks for a raw merge, naming the admin route where `--admin` is given", async (tool) => {
    const guard = await placeGuard(tool);
    for (const [command, rule] of [["gh pr merge 3 --squash", "pr-merge"], ["gh pr merge 3 --squash --admin", "admin-merge"]] as const) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict).toMatchObject({ deny: true, rule, ask: true });
      if (verdict.deny) expect(decide(tool, guard, command), command).toEqual(expectedAttended(tool, verdict));
    }
  });

  it.each(TOOLS)("%s: refuses a commit status or check run write attended and unattended, and passes its read", async (tool) => {
    const guard = await placeGuard(tool);
    const write = "gh api -X POST repos/o/r/statuses/abc123 -f state=success -f context=ci";
    const ciOnly = "is CI's to write, never an agent's (`status-write`)";
    expect(decide(tool, guard, write)).toEqual({ deny: true, reason: expect.stringContaining(ciOnly) });
    expect(decide(tool, guard, "gh api repos/o/r/commits/abc123/statuses")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, write)).toEqual({ deny: true, reason: expect.stringContaining(ciOnly) });
  });

  it.each(TOOLS)("%s: asks for a push onto a deploying branch, and lets a feature branch go", async (tool) => {
    const guard = await placeGuard(tool, {}, resolveAutonomy({ autonomy: { deployingBranches: ["production"] } }));
    const verdict = personOnlyVerdict("git push origin production", { ...BAKED_DEFAULT, deployingBranches: ["production"] });
    expect(verdict).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    if (verdict.deny) expect(decide(tool, guard, "git push origin production")).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "git push origin feat/x")).toEqual({ deny: false });
    // The same push under a guard naming no deploying branch.
    expect(decide(tool, await placeGuard(tool), "git push origin production")).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: runs an unnamed workflow dispatch in both modes, and asks for a named one attended and refuses it unattended", async (tool) => {
    const DISPATCH = "gh workflow run deploy.yml -f env=prod";
    // TEST CHANGE, justified (REQ-FLOW-137, review/158): on Codex and Cursor, which name no agent, the unnamed dispatch
    // is refused in both modes with the missing-identity sentence; the named one is unchanged.
    const unnamed: Decision = NO_AGENT.has(tool)
      ? { deny: true, reason: expect.stringContaining(noAgentSentence("Dispatching a workflow", "workflow-dispatch")) as unknown as string }
      : { deny: false };
    expect(decide(tool, await placeGuard(tool), DISPATCH), "autonomous").toEqual(unnamed);
    expect(decide(tool, await placeGuard(tool, {}, ASK_MODE), DISPATCH), "ask").toEqual(unnamed);
    const named = resolveAutonomy({ autonomy: { deployingActs: ["workflow-dispatch"] } });
    const guard = await placeGuard(tool, {}, named);
    const verdict = personOnlyVerdict(DISPATCH, ON_FEATURE);
    if (!verdict.deny) throw new Error("the dispatch reads as no act");
    expect(decide(tool, guard, DISPATCH)).toEqual(expectedAttended(tool, verdict));
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, DISPATCH)).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(verdict)} ${WHY}`) });
  });

  it("refuses a flagless repository edit as refuse-class and asks for a refspec in a PowerShell group as a default-branch push", async () => {
    const guard = await placeGuard("claude");
    for (const [command, rule, ask] of [["gh repo edit", "repo-irreversible", false], ["git push origin (git branch --show-current)", "push-default", true]] as const) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict).toMatchObject({ deny: true, rule, ask });
      if (verdict.deny) expect(decide("claude", guard, command), command).toEqual(expectedAttended("claude", verdict));
    }
    expect(decide("claude", guard, "git push origin HEAD")).toEqual({ deny: false });
  });

  it("asks on Claude Code's main thread for a payload naming `agent_type` with no `agent_id`, and refuses one with it (review/86)", async () => {
    const guard = await placeGuard("claude");
    const merge = personOnlyVerdict("gh pr merge 1", BAKED_DEFAULT);
    if (!merge.deny) throw new Error("the merge is no person-only act");
    const call = (fields: Record<string, string>): Decision =>
      clientDecision("claude", run(guard, JSON.stringify({ ...JSON.parse(payload("claude", "gh pr merge 1")), ...fields })), JSON.stringify(fields));
    expect(call({ agent_type: "stamity-orchestrator" })).toEqual(expectedAttended("claude", merge));
    expect(call({ agent_type: "stamity-orchestrator", agent_id: "a1" })).toEqual({ deny: true, reason: expect.stringContaining("a sub-agent runs it") });
    // On the other clients a non-empty `agent_type` still refuses as a helper's.
    const codex = await placeGuard("codex");
    const line = JSON.stringify({ ...JSON.parse(payload("codex", "gh pr merge 1")), agent_type: "stamity-orchestrator" });
    expect(clientDecision("codex", run(codex, line), "codex")).toEqual({ deny: true, reason: expect.stringContaining("a sub-agent runs it") });
  });

  it.each(TOOLS)("%s: lets the land verb pass alone on its line in both modes, and refuses it beside more", async (tool) => {
    const LAND = "npx --no stamity run land --run 2026-10-23_x --ready --json";
    const guard = await placeGuard(tool);
    const attended = [
      ["npm test && " + LAND, true],
      ["GIT_TRACE=1 " + LAND, true],
      [LAND, false],
      ["git commit -m 'docs: npx --no stamity run land --run x'", false],
    ] as const;
    for (const [command, refused] of attended) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(
        refused ? { deny: true, reason: expect.stringContaining("`stamity run land` on a line that is more than the verb") } : { deny: false },
      );
    }
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, LAND)).toEqual({ deny: false });
    expect(decide(tool, guard, "npm test && " + LAND).deny).toBe(true);
    // Unattended, the raw text still binds: a message naming the verb beside the package is refused.
    expect(decide(tool, guard, "git commit -m 'docs: npx --no stamity run land --run x'").deny).toBe(true);
  });

  it.each(TOOLS)("%s: runs a literal dry-run publish in both modes, and asks for every other spelling attended and refuses it unattended", async (tool) => {
    const guard = await placeGuard(tool);
    const others = ["npm publish --dry-run=false", "npm publish --dry-run --no-dry-run", "npm publish \"--dry-run\"", "npm_config_dry_run=false npm publish --dry-run"];
    expect(decide(tool, guard, "npm publish --dry-run")).toEqual({ deny: false });
    for (const command of others) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict, command).toMatchObject({ deny: true, rule: "publish", ask: true });
      if (verdict.deny) expect(decide(tool, guard, command), command).toEqual(expectedAttended(tool, verdict));
    }
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, "npm publish --dry-run")).toEqual({ deny: false });
    for (const command of others) expect(decide(tool, guard, command).deny, command).toBe(true);
  });

  it.each(TOOLS)("%s: asks for a loosening line attended and refuses it unattended; a full clean asks only over a stricter setting", async (tool) => {
    const loosen = personOnlyVerdict("stamity sync --loosen", BAKED_DEFAULT);
    if (!loosen.deny) throw new Error("the loosening line reads as no act");
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, "stamity sync --loosen")).toEqual(expectedAttended(tool, loosen));
    expect(decide(tool, guard, "stamity clean")).toEqual({ deny: false });
    const strict = await placeGuard(tool, {}, ASK_MODE);
    const clean = personOnlyVerdict("stamity clean", { ...ON_FEATURE, stricterThanDefault: true });
    if (!clean.deny) throw new Error("the clean reads as no act");
    expect(decide(tool, strict, "stamity clean")).toEqual(expectedAttended(tool, clean));
    expect(decide(tool, strict, "stamity clean --pack production")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, "stamity sync --loosen")).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(loosen)} ${WHY}`) });
  });
});

/**
 * a4 fixer round 1 (review/43, review/42, review/37, review/38, review/44): the guard as a client runs it. Titles name
 * the class of input; each input sits in the body.
 */
describe("the autonomy setting's acts on the main thread only (a4, review/43)", () => {
  /** The call as a sub-agent makes it: the client's payload with a helper agent's id. */
  const asHelper = (tool: Tool, command: string): string => JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
  const ACTS = [
    ["Marking a pull request ready for review", "pr-ready", "gh pr ready 3"],
    ["Creating a tag", "tag", "git tag -a v2 -m 'release v2'"],
    ["Creating a tag", "tag", "git tag v2"],
    ["Dispatching a workflow", "workflow-dispatch", "gh workflow run ci.yml"],
  ] as const;

  // Red on the head: the acts that run were allowed with no read of the caller's identity.
  // TEST CHANGE, justified (REQ-FLOW-137, review/158): Codex and Cursor name no agent, so they refuse the main thread's
  // call too; pinned in the review/158 block below.
  it.each(TOOLS.filter((tool) => !NO_AGENT.has(tool)))("%s: refuses a sub-agent's ready mark, local tag and unnamed dispatch, and runs the main thread's", async (tool) => {
    const guard = await placeGuard(tool);
    for (const [act, rule, command] of ACTS) {
      const sentence = `${act} is a person-only act (\`${rule}\`) and a sub-agent runs it: the autonomy setting runs it unasked on the main thread only (REQ-FLOW-137). Give the person the exact command.`;
      expect(clientDecision(tool, run(guard, asHelper(tool, command)), `${tool}: ${command}`)).toEqual({
        deny: true,
        reason: expect.stringContaining(tool === "copilot" ? `${sentence} ${NO_CALLER}` : sentence),
      });
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    }
  });

  it("reads Claude Code's main thread of an `--agent` session as the main thread, as the ask does (review/86)", async () => {
    const guard = await placeGuard("claude");
    const line = JSON.stringify({ ...JSON.parse(payload("claude", "gh pr ready 3")), agent_type: "stamity-orchestrator" });
    expect(clientDecision("claude", run(guard, line), "agent_type alone")).toEqual({ deny: false });
    const both = JSON.stringify({ ...JSON.parse(line), agent_id: "a1" });
    expect(clientDecision("claude", run(guard, both), "agent_type and agent_id")).toMatchObject({ deny: true });
  });

  it("refuses a Copilot helper whose field is present but empty, as Copilot's ask does", async () => {
    const guard = await placeGuard("copilot");
    const line = JSON.stringify({ ...JSON.parse(payload("copilot", "gh pr ready 3")), parentAgentId: "" });
    expect(clientDecision("copilot", run(guard, line), "empty parentAgentId")).toMatchObject({ deny: true });
  });

  it("leaves a sub-agent's call that holds no act the setting runs alone", async () => {
    const guard = await placeGuard("claude");
    expect(clientDecision("claude", run(guard, asHelper("claude", "git status && gh pr view 3")), "read")).toEqual({ deny: false });
  });
});

/**
 * review/158 (REQ-FLOW-137, REQ-FLOW-134): the acts that run on the main thread only, on a client whose hook payload
 * names no agent (`src/hooks/scripts.ts` `helperRefusal`), and on the two whose payload does. Titles name the class of
 * input; each input sits in the body.
 */
describe("the main-thread acts on a client whose payload names no agent (a4, review/158)", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };
  const ACTS = [
    ["pr-ready", "gh pr ready 3"],
    ["tag", "git tag -a v2 -m 'release v2'"],
    ["workflow-dispatch", "gh workflow run ci.yml"],
    ["remote-write", "git remote set-url origin https://github.com/other/repo.git"],
  ] as const;
  const LANDS = ["npx --no stamity run land --run 2026-10-23_x --json", "npx --no stamity run land --run 2026-10-23_x --ready --json"];
  const asHelper = (tool: Tool, command: string): string => JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });

  // Red on 89e088f9: each act ran on these clients, the main thread's call and a sub-agent's alike.
  it.each([...NO_AGENT])("%s: refuses a ready mark, a local annotated tag, an unnamed dispatch and a remote write attended and unattended, naming the missing identity; the land line runs", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    for (const [rule, command] of ACTS) {
      const refused = { deny: true, reason: expect.stringContaining(noAgentSentence(RUN_ACT_NAMES[rule] ?? "", rule)) };
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(refused);
      expect(clientDecision(tool, run(guard, asHelper(tool, command)), `${tool} helper: ${command}`)).toEqual(refused);
    }
    for (const land of LANDS) expect(decide(tool, guard, land), `${tool}: ${land}`).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    for (const [rule, command] of ACTS) {
      expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual({
        deny: true,
        reason: expect.stringContaining(noAgentSentence(RUN_ACT_NAMES[rule] ?? "", rule)),
      });
    }
    for (const land of LANDS) expect(decide(tool, guard, land), `${tool} unattended: ${land}`).toEqual({ deny: false });
  });

  // A pin, green on 89e088f9 by design: the clients that name an agent keep the main thread's run and the sub-agent's refusal.
  it.each(TOOLS.filter((tool) => !NO_AGENT.has(tool)))("%s: runs the main thread's acts and the land line, and refuses a sub-agent's acts, as before", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    for (const [rule, command] of ACTS) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
      const helper = clientDecision(tool, run(guard, asHelper(tool, command)), `${tool} helper: ${command}`);
      expect(helper, `${tool} helper: ${command}`).toEqual({
        deny: true,
        reason: expect.stringContaining(`${RUN_ACT_NAMES[rule] ?? ""} is a person-only act (\`${rule}\`) and a sub-agent runs it`),
      });
    }
    for (const land of LANDS) expect(decide(tool, guard, land), `${tool}: ${land}`).toEqual({ deny: false });
  });
});

describe("the guard's reading of quoted text, a dry run's value word and an unreadable program (a4, review/37, review/42, review/38)", () => {
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };

  // Red on the head (review/37): unattended, the closing verb was refused as a loosening.
  it.each(TOOLS)("%s: unattended, runs a run end whose title holds a single-quoted backtick or dollar", async (tool) => {
    const guard = await placeGuard(tool, UNATTENDED);
    for (const command of ["npx --no stamity run end --run 2026-10-23_x --title 'fix `x` reader'", "stamity run end --run 2026-10-23_x --title 'cost $5'"]) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    }
    // The neighbour: a double-quoted variable there is refused.
    expect(decide(tool, guard, "stamity run end --run 2026-10-23_x --title \"fix $X\"").deny).toBe(true);
  });

  it("runs a sub-agent's learn capture whose summary holds single-quoted dollars and backticks, and refuses a double-quoted one", async () => {
    const guard = await placeGuard("claude");
    const helper = (command: string): Decision =>
      clientDecision("claude", run(guard, JSON.stringify({ ...JSON.parse(payload("claude", command)), agent_id: "a1" })), command);
    expect(helper("stamity learn capture --summary 'reads `src/a.ts` before $HOME' --confidence high")).toEqual({ deny: false });
    expect(helper("stamity learn capture --summary \"reads $HOME\" --confidence high")).toEqual({
      deny: true,
      reason: expect.stringContaining("a sub-agent runs it"),
    });
  });

  // Red on the head (review/42): the separate false word turned the dry run off and the guard let it run.
  it.each(TOOLS)("%s: asks for a dry-run flag followed by a separate false attended and refuses it unattended", async (tool) => {
    const command = "npm publish --dry-run false";
    const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the publish reads as no act");
    expect(verdict).toMatchObject({ rule: "publish", ask: true });
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "npm publish --dry-run true")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, command).deny).toBe(true);
  });

  // Red on the head (review/38): the sentence called the line a stamity command.
  it("asks for a wholly variable program with a variable argument, naming a command it cannot read", async () => {
    const guard = await placeGuard("claude");
    const verdict = personOnlyVerdict("\"$BIN\" \"$ARG\"", BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the line reads as no act");
    expect(verdict.act).toBe("A command the guard cannot read, which may be a stamity command, with an argument the guard cannot read, which may spell `--loosen`");
    expect(decide("claude", guard, "\"$BIN\" \"$ARG\"")).toEqual(expectedAttended("claude", verdict));
    expect(decide("claude", guard, "\"$ROOT/node_modules/.bin/vitest\" run \"$FILE\"")).toEqual({ deny: false });
  });
});

describe("the package words the guard bakes (a4, review/44)", () => {
  /** The guard as a renamed fork emits it: its own package name, and a bin the engine's package.json declares. */
  async function placeFork(tool: Tool): Promise<string> {
    const fork = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, packageName: "@acme/forge", packageBins: ["forge-cli"], personOnlyGuard: true }).find(
      (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
    );
    if (fork === undefined) throw new Error("the plan carried no person-only guard");
    // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the candidate line swapped, as `placeGuard` swaps it.
    await getRepo().seedFiles({ ".git/HEAD": "ref: refs/heads/feat/x\n", [`.stamity/generated/hooks/${tool}/${fork.fileName}`]: swapCandidates(fork.content) });
    return getRepo().path(".stamity", "generated", "hooks", tool, fork.fileName);
  }

  it("bakes the engine's own bins and unscoped name, read from its package.json at emission", async () => {
    const plan = await planHooksInfra({ rootDir: getRepo().path(), manifest: { tools: [...TOOLS] }, engineVersion: "1.0.0-golden" });
    const own = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { bin: Record<string, string> };
    const copies = plan.scripts.filter((script) => script.path.endsWith(`/${PERSON_ONLY_GUARD_FILE}`));
    expect(copies).toHaveLength(TOOLS.length);
    for (const copy of copies) {
      // TEST CHANGE, justified (REQ-FLOW-138, review/53): the words are baked inside the package identity, beside its
      // name and whether the repository is the engine's own.
      const baked = /^const PACKAGE = (.*);$/m.exec(copy.content)?.[1] ?? "null";
      expect((JSON.parse(baked) as { words: string[] }).words, copy.path).toEqual([...new Set(["stamity", "st", ...Object.keys(own.bin)])]);
    }
  });

  // Red on the head: a renamed fork's bin was another program to the guard.
  it.each(TOOLS)("%s: asks for a loosening through a renamed fork's bin, and lets its other verbs run", async (tool) => {
    const guard = await placeFork(tool);
    const verdict = personOnlyVerdict("forge-cli sync --loosen", { ...BAKED_DEFAULT, packageWords: ["stamity", "st", "forge", "forge-cli"] });
    if (!verdict.deny) throw new Error("the fork's loosening reads as no act");
    expect(decide(tool, guard, "forge-cli sync --loosen")).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "forge sync --loosen").deny).toBe(true);
    expect(decide(tool, guard, "forge-cli sync")).toEqual({ deny: false });
    expect(decide(tool, guard, "forge-cli run land --run 2026-10-23_x")).toEqual({ deny: false });
    expect(decide(tool, guard, "npm test && forge-cli run land --run 2026-10-23_x").deny).toBe(true);
  });
});

/**
 * a4 fixer round 2 (review/52, review/53, review/54, review/55): the guard as a client runs it. Titles name the class
 * of input; each input sits in the body.
 */
describe("the guard's round-2 readings (a4, review/52, review/53, review/54, review/55)", () => {
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };

  /** The guard as emission writes it for a repository that is, or is not, the engine's own. */
  async function placeFor(tool: Tool, ownRepository: boolean, files: Record<string, string> = {}): Promise<string> {
    const guard = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, personOnlyGuard: true, ownRepository }).find(
      (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
    );
    if (guard === undefined) throw new Error("the plan carried no person-only guard");
    // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the candidate line swapped, as `placeGuard` swaps it.
    await getRepo().seedFiles({ ".git/HEAD": "ref: refs/heads/feat/x\n", [`.stamity/generated/hooks/${tool}/${guard.fileName}`]: swapCandidates(guard.content), ...files });
    return getRepo().path(".stamity", "generated", "hooks", tool, guard.fileName);
  }

  // Red (review/52): unattended, a path glob and the ready check's plan glob were refused as a loosening.
  it.each(TOOLS)("%s: unattended, runs a checkpoint with a path glob and the ready check with a plan glob", async (tool) => {
    const guard = await placeGuard(tool, UNATTENDED);
    for (const command of ["npx --no stamity run checkpoint --run 2026-10-23_x --paths src/hooks/*.ts --json", "stamity plan check docs/plans/022-*.md --json"]) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    }
    // The neighbour: a glob with no literal prefix is refused there.
    expect(decide(tool, guard, "stamity sync *").deny).toBe(true);
  });

  // Red (review/54): the value the outer shell fills in read as literal inside the nested string's single quotes.
  it.each(TOOLS)("%s: asks for a nested string whose value the outer shell fills in attended, and refuses it unattended", async (tool) => {
    const command = "sh -c \"stamity sync '$F'\"";
    const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the nested loosening reads as no act");
    expect(verdict).toMatchObject({ rule: "autonomy-loosen", ask: true });
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "sh -c 'stamity sync --json'")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, command).deny).toBe(true);
  });

  // Red (review/55): the Windows command interpreter's variable read as literal text.
  it("asks for the Windows command interpreter's variable in a stamity command's argument", async () => {
    const guard = await placeGuard("claude");
    expect(decide("claude", guard, "cmd /c stamity sync %F%")).toMatchObject({ deny: true, reason: expect.stringContaining("(`autonomy-loosen`)") });
    expect(decide("claude", guard, "cmd /c stamity sync --json")).toEqual({ deny: false });
  });

  // Red (review/53): a consumer's own CLI file read as the engine's.
  it.each(TOOLS)("%s: in a consumer repository, runs its own CLI file's lines unattended and asks only for a literal loosen flag", async (tool) => {
    const guard = await placeFor(tool, false, UNATTENDED);
    for (const command of ["node dist/cli.js build \"$OUT\"", "tsx src/cli.ts test/*.json"]) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
    }
    expect(decide(tool, guard, "node dist/cli.js sync --loosen").deny).toBe(true);
    // The engine's own path keeps the full check.
    expect(decide(tool, guard, "node node_modules/@zomarit/stamity/dist/cli.js sync \"$X\"").deny).toBe(true);
    // In the engine's own repository its built CLI keeps the full check.
    const own = await placeFor(tool, true, UNATTENDED);
    expect(decide(tool, own, "node dist/cli.js build \"$OUT\"").deny).toBe(true);
  });

  it("bakes whether the repository is the engine's own, read from the repository's package.json at emission", async () => {
    const engine = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { name: string };
    const own = (content: string): unknown => (JSON.parse(/^const PACKAGE = (.*);$/m.exec(content)?.[1] ?? "null") as { own: boolean }).own;
    /** The baked flag for a repository whose package.json names `name`. */
    const bakedFor = async (name: string): Promise<unknown> => {
      await getRepo().seedFiles({ "package.json": JSON.stringify({ name }) });
      const plan = await planHooksInfra({ rootDir: getRepo().path(), manifest: { tools: ["claude"] }, engineVersion: "1.0.0-golden" });
      return own(plan.scripts.find((script) => script.path.endsWith(`/${PERSON_ONLY_GUARD_FILE}`))?.content ?? "");
    };
    expect(await bakedFor(engine.name)).toBe(true);
    expect(await bakedFor("consumer-app")).toBe(false);
  });
});

describe("the guard's refspec reading by marks (a4, review/69, review/77)", () => {
  // Red on 3021c756: a deploying name finished by an expansion, and a colon-less refspec with one, ran unasked.
  it.each(TOOLS)("%s: asks for a refspec the shell fills in, naming the deploying branch where one is named", async (tool) => {
    const guard = await placeGuard(tool, {}, resolveAutonomy({ autonomy: { deployingBranches: ["production"] } }));
    const command = "git push origin HEAD:produc$(echo tion)";
    const verdict = personOnlyVerdict(command, { ...BAKED_DEFAULT, deployingBranches: ["production"] });
    expect(verdict).toMatchObject({ deny: true, rule: "push-deploying", ask: true });
    if (verdict.deny) expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "git push origin feat/a$b").deny).toBe(true);
    expect(decide(tool, guard, "git push origin 'feat/a$b'")).toEqual({ deny: false });
  });
});

describe("the guard's reading of a launcher's script word and a push's remote word (a4, review/87)", () => {
  // Red on 8c991a6d: the launched program was read as another program, and a brace remote as a remote.
  it.each(TOOLS)("%s: asks attended and refuses unattended for a launcher whose script word the shell fills in", async (tool) => {
    const command = "node \"$CLI\" sync --loosen";
    const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the launched loosening reads as no act");
    const guard = await placeGuard(tool);
    expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    expect(decide(tool, guard, "node scripts/build.mjs \"$OUT\"")).toEqual({ deny: false });
    expect(decide(tool, guard, "git push {origin,main}").deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, command).deny).toBe(true);
  });
});

describe("the guard's reading of the lens's two launcher layouts (a4, review/87 round 5)", () => {
  // Red on 69167364: in both layouts the launched program read as settled, so nothing asked.
  it.each(TOOLS)("%s: asks attended, and refuses unattended and for a sub-agent, for both layouts with a filled-in script word", async (tool) => {
    const guard = await placeGuard(tool);
    const layouts = ["node --import tsx \"$CLI\" sync --loosen", "deno run \"$CLI\" sync --loosen"];
    for (const command of layouts) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      if (!verdict.deny) throw new Error(`${command} reads as no act`);
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
      expect(clientDecision(tool, run(guard, helper), `${tool} helper: ${command}`).deny).toBe(true);
    }
    expect(decide(tool, guard, "node scripts/build.mjs \"$OUT\"")).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of layouts) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's reading of a preload file before a filled-in script word (a4, review/98)", () => {
  // Red on fd5a101f: the preload file settled the program, so nothing asked.
  it.each(TOOLS)("%s: asks attended, and refuses unattended and for a sub-agent", async (tool) => {
    const guard = await placeGuard(tool);
    const command = "node --require ./preload.cjs \"$CLI\" sync --loosen";
    const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the launched loosening reads as no act");
    expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
    expect(clientDecision(tool, run(guard, helper), `${tool} helper`).deny).toBe(true);
    expect(decide(tool, guard, "node --test test/a.test.mjs --watch")).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, command).deny).toBe(true);
  });
});

describe("the guard's reading of an option joined to its script-file value (a4, review/98 round 2)", () => {
  // Red on b68f5609: the joined option word settled the program, so nothing asked.
  it.each(TOOLS)("%s: asks attended, and refuses unattended and for a sub-agent", async (tool) => {
    const guard = await placeGuard(tool);
    const command = "node --import=./register.mjs \"$CLI\" sync --loosen";
    const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
    if (!verdict.deny) throw new Error("the launched loosening reads as no act");
    expect(decide(tool, guard, command)).toEqual(expectedAttended(tool, verdict));
    const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
    expect(clientDecision(tool, run(guard, helper), `${tool} helper`).deny).toBe(true);
    expect(decide(tool, guard, "node --import=./register.mjs scripts/x.mjs \"$OUT\"")).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, command).deny).toBe(true);
  });
});

describe("the guard's launcher reading in every mode (a4, review/99)", () => {
  const ORDINARY = ["bun run test \"$F\"", "bun test \"$FILE\"", "deno task build \"$X\"", "node \"$ROOT/node_modules/.bin/vitest\" run"];
  const UNSETTLED = ["node \"$CLI\" sync", "deno run \"$CLI\" sync", "bun run \"$FILE\" sync", "deno run --allow-read main.ts \"$ARG\""];
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);

  // Red on b68f5609: the reviewer's four ordinary lines asked or were refused.
  it.each(TOOLS)("%s: runs the reviewer's four lines attended, for a sub-agent and unattended", async (tool) => {
    const guard = await placeGuard(tool);
    for (const command of ORDINARY) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
      expect(helper(tool, guard, command), `${tool} helper: ${command}`).toEqual({ deny: false });
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of ORDINARY) expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: still asks attended, and refuses for a sub-agent and unattended, where the launched program is filled in", async (tool) => {
    const guard = await placeGuard(tool);
    for (const command of UNSETTLED) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      if (!verdict.deny) throw new Error(`${command} reads as no act`);
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of UNSETTLED) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's reading of the engine's bin under a filled-in folder (a4, review/100)", () => {
  // Red on f7181e5c: the launched bin settled the program as another one, so the loosening ran unasked.
  it.each(TOOLS)("%s: asks attended, and refuses unattended and for a sub-agent, with a literal or a filled-in flag", async (tool) => {
    const guard = await placeGuard(tool);
    const lines = ["node \"$BIN_DIR/st\" sync --loosen", "node \"$BIN_DIR/stamity\" sync \"$FLAG\""];
    for (const command of lines) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      if (!verdict.deny) throw new Error(`${command} reads as no act`);
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
      expect(clientDecision(tool, run(guard, helper), `${tool} helper: ${command}`).deny).toBe(true);
    }
    expect(decide(tool, guard, "node \"$ROOT/node_modules/.bin/vitest\" run \"$F\"")).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of lines) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's reading of the land verb's job mode (REQ-FLOW-157)", () => {
  const lines = [
    "stamity run land --job --pr 7 --ready --json",
    "npx --no stamity run land --job --pr 7",
    "npx -y @zomarit/stamity@1.17.0 run land --pr 7 --job",
    'stamity run land "--job" --pr 7',
    "stamity run land --run 2026-10-23_x --ready --job=1",
    // The shell may expand these to the flag against a file of that name, so they read as the flag.
    "stamity run land --j?b --pr 7",
    "stamity run land --[j]ob --pr 7",
    "stamity run land --jo* --pr 7",
    "stamity run land * --pr 7",
  ];

  // Not an ask: job mode skips what only a session holds, so no agent's line carries it, and no click passes one.
  it.each(TOOLS)("%s: refuses it attended, for a sub-agent and unattended, and leaves the plain land line alone", async (tool) => {
    const guard = await placeGuard(tool);
    const refused = { deny: true, reason: expect.stringContaining("`--job`, which only the land workflow runs") };
    for (const command of lines) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(refused);
      const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
      expect(clientDecision(tool, run(guard, helper), `${tool} helper: ${command}`).deny, `${tool} helper: ${command}`).toBe(true);
    }
    expect(decide(tool, guard, "stamity run land --run 2026-10-23_x --ready --json")).toEqual({ deny: false });
    // A glob that cannot reach the flag is no job line.
    expect(decide(tool, guard, "stamity run land --run 2026-10-23_*").deny).toBe(personOnlyVerdict("stamity run land --run 2026-10-23_*", BAKED_DEFAULT).deny);
    // A word the shell fills in may spell it: the stand-alone rule's shape refuses that line first.
    expect(decide(tool, guard, 'stamity run land "$MODE" --pr 7').deny).toBe(true);
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of lines) expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual(refused);
  });

  // A word the shell completes may be the verb's, so the line's shape reads these lines too.
  it.each(TOOLS)("%s: refuses a line whose verb word the shell completes, in every mode", async (tool) => {
    const guard = await placeGuard(tool);
    const completed = ["stamity run la?d --job --pr 7", "npx --no stamity run l*d --job", "stamity r?n land --job", "stamity run la?d --run x --approved abc"];
    for (const command of completed) {
      expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(true);
      const helper = JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" });
      expect(clientDecision(tool, run(guard, helper), `${tool} helper: ${command}`).deny, `${tool} helper: ${command}`).toBe(true);
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of completed) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's reading of the accept line of a run's proposal (REQ-FLOW-163, review/62)", () => {
  const ACCEPT = `npx --no stamity learn accept --run 2026-11-05_x --proposal a-note --digest ${"0".repeat(64)}`;
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);

  // Red before review/62: the accept line ran unasked in every mode, a sub-agent's among them.
  it.each(TOOLS)("%s: asks attended, and refuses for a sub-agent and unattended; a capture line runs", async (tool) => {
    const guard = await placeGuard(tool);
    const capture = "npx --no stamity learn capture --propose --run 2026-11-05_x --title a-note --summary b --body-file c.md";
    const verdict = personOnlyVerdict(ACCEPT, BAKED_DEFAULT);
    expect(verdict).toMatchObject({ deny: true, rule: "learn-accept", ask: true });
    if (verdict.deny) expect(decide(tool, guard, ACCEPT)).toEqual(expectedAttended(tool, verdict));
    expect(helper(tool, guard, ACCEPT).deny).toBe(true);
    expect(decide(tool, guard, capture)).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-11-05_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, ACCEPT).deny).toBe(true);
    expect(decide(tool, guard, capture)).toEqual({ deny: false });
  });

  // Red before review/70: a verb word the shell completes passed every client's copy, so a sub-agent took a proposal live.
  it.each(TOOLS)("%s: reads a verb word the shell completes as the verb, and a word another verb settles as none", async (tool) => {
    const guard = await placeGuard(tool);
    const lines = ["npx --no stamity learn acc*pt --run x", "stamity learn ac{c,c}ept --run x", "stamity le?rn accept --run x", "stamity l*n a*t --run x", "stamity l{e,e}arn a{c,c}cept --run x"];
    const other = "npx --no stamity validate docs/*.md";
    for (const command of lines) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict, command).toMatchObject({ deny: true, rule: "learn-accept", ask: true });
      if (verdict.deny) expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
    expect(decide(tool, guard, other)).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-11-05_x/record.md": record("in progress", "unattended") });
    for (const command of lines) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
    expect(decide(tool, guard, other)).toEqual({ deny: false });
  });

  // Red before the pull request's review: every client's copy read `accept` beside `learn` as the verb, so a proposal
  // titled that way stopped an unattended run, and a person was asked for nothing.
  it.each(TOOLS)("%s: runs `accept` as an option's value in every mode, and reads a verb beside one as the verb", async (tool) => {
    const guard = await placeGuard(tool);
    const values = [
      "npx --no stamity learn capture --propose --run 2026-11-05_x --title accept --summary b --body-file c.md",
      "stamity learn capture --propose --run 2026-11-05_x --title=accept --summary b --body-file c.md",
      "stamity learn read --body accept",
    ];
    const verbs = [
      "npx --no stamity learn --title accept accept --run x",
      "stamity learn --title x -- accept",
      "stamity learn --title --run accept",
      "stamity learn --other --title accept",
      "stamity learn --title accept acc*pt",
      "stamity learn --title accept ac{c,c}ept",
      "stamity l*n --title accept",
      "\"$CLI\" learn capture --title accept --summary b",
    ];
    for (const command of values) {
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
      expect(helper(tool, guard, command), `${tool} helper: ${command}`).toEqual({ deny: false });
    }
    for (const command of verbs) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict, command).toMatchObject({ deny: true, rule: "learn-accept", ask: true });
      if (verdict.deny) expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-11-05_x/record.md": record("in progress", "unattended") });
    for (const command of values) expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual({ deny: false });
    for (const command of verbs) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's reading of the land verb's approved line (a4, review/103)", () => {
  const APPROVED = "npx --no stamity run land --run 2026-10-23_x --approved --json";
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);

  // Red on 4d344eb2: the approved line ran unasked in every mode.
  it.each(TOOLS)("%s: asks attended, and refuses for a sub-agent and unattended; a plain land line runs", async (tool) => {
    const guard = await placeGuard(tool);
    const verdict = personOnlyVerdict(APPROVED, BAKED_DEFAULT);
    expect(verdict).toMatchObject({ deny: true, rule: "land-approved", ask: true });
    if (verdict.deny) expect(decide(tool, guard, APPROVED)).toEqual(expectedAttended(tool, verdict));
    expect(helper(tool, guard, APPROVED).deny).toBe(true);
    // A joined form may carry the flag: it asks as the approved line does.
    const joined = "npx --no stamity run land --run 2026-10-23_x --approved=true";
    const verdictJoined = personOnlyVerdict(joined, BAKED_DEFAULT);
    expect(verdictJoined).toMatchObject({ deny: true, rule: "land-approved", ask: true });
    if (verdictJoined.deny) expect(decide(tool, guard, joined)).toEqual(expectedAttended(tool, verdictJoined));
    // A filled-in word on the land line is refused in every mode by the stand-alone rule's shape, before any ask.
    const unreadable = "npx --no stamity run land --run \"$RUN\"";
    expect(decide(tool, guard, unreadable)).toEqual({ deny: true, reason: expect.stringContaining("on a line that is more than the verb") });
    expect(decide(tool, guard, "npx --no stamity run land --run 2026-10-23_x --ready --json")).toEqual({ deny: false });
    // Beside another command the stand-alone rule refuses it, as any land line.
    expect(decide(tool, guard, `npm test && ${APPROVED}`)).toEqual({
      deny: true,
      reason: expect.stringContaining("`stamity run land` on a line that is more than the verb"),
    });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    expect(decide(tool, guard, APPROVED).deny).toBe(true);
    expect(decide(tool, guard, joined).deny).toBe(true);
    expect(decide(tool, guard, unreadable).deny).toBe(true);
    expect(decide(tool, guard, "npx --no stamity run land --run 2026-10-23_x --ready --json")).toEqual({ deny: false });
  });
});

describe("a heredoc body read as data by the guard in every mode (a5, REQ-FLOW-141, review/76)", () => {
  const FORCE = "git push --force origin feat/x";
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);
  /** review/76's two lines: a commit message with a bullet, and a learn capture with its body on stdin. */
  const DATA = [
    `git commit -s -m "$(cat <<'EOF'\nfix(hooks): read a body as data\n\n* the first bullet\n$HOME is text here\nEOF\n)"`,
    `npx --no stamity learn capture --title 'a body on stdin' --summary 'one line' --confidence high <<'EOF'\n## Why\n* a bullet\n$HOME\n## How to apply\n* another\nEOF`,
    `cat >> .stamity/runs/2026-10-23_x/notes.md <<'EOF'\n${FORCE}\n* a bullet\nEOF`,
  ];

  // Red on 84a42e9a: the bullet and bare-expansion lines asked as a loosening, so a sub-agent and an unattended run
  // were refused; the record append's force-push line was refused in every mode.
  it.each(TOOLS)("%s: runs review/76's two lines and a record append attended, for a sub-agent and unattended", async (tool) => {
    const guard = await placeGuard(tool);
    for (const command of DATA) {
      expect(personOnlyVerdict(command, BAKED_DEFAULT), command).toEqual({ deny: false });
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
      expect(helper(tool, guard, command), `${tool} helper: ${command}`).toEqual({ deny: false });
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of DATA) expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: refuses the same body fed to a shell, piped onward or captured as the program word, in every mode", async (tool) => {
    const guard = await placeGuard(tool);
    const lines = [
      `bash <<'EOF'\n${FORCE}\nEOF`,
      `cat <<'EOF' | sh\n${FORCE}\nEOF`,
      `"$(cat <<'EOF'\n${FORCE}\nEOF\n)"`,
      `git commit -m "$(cat <<EOF\n$(${FORCE})\nEOF\n)"`,
    ];
    for (const command of lines) {
      expect(personOnlyVerdict(command, BAKED_DEFAULT), command).toMatchObject({ deny: true, rule: "force-push", ask: false });
      expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(true);
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of lines) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("the guard's closing scan over a quoted heredoc body, and a line too long to read (a5, build/12, review/115)", () => {
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };

  // Red on 77116591: the body's parenthesis kept the substitution open to the line's end, so the push behind it ran.
  it.each(TOOLS)("%s: refuses a push behind a commit-message body with an unbalanced parenthesis, in every mode", async (tool) => {
    const guard = await placeGuard(tool);
    const command = "git commit -m \"$(cat <<'EOF'\nfix (the reader\nEOF\n)x y\" && git push --force origin feat/x";
    expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(true);
    expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    expect(decide(tool, guard, "git commit -m \"$(cat <<'EOF'\nfix (the reader\nEOF\n)\"")).toEqual({ deny: false });
    await getRepo().seedFiles(UNATTENDED);
    expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });

  // Red on 77116591: the long benign line was read and allowed in every mode. TEST CHANGE, justified (review/117): it
  // asked attended under `autonomy-loosen`; it is now refused in every mode, never an ask, and so is a refuse-class act
  // padded past the cap (red on 87c72904, where it asked attended on Claude Code).
  it.each(TOOLS)("%s: refuses a line past 65,536 characters in every mode, a padded refuse-class act among them", async (tool) => {
    const guard = await placeGuard(tool);
    const refused = { deny: true, reason: expect.stringContaining("A line too long for the guard to read") };
    const long = [`echo ${"a".repeat(70_000)}`, `git push --force origin feat/x; echo ${"a".repeat(70_000)}`, `gh repo delete o/r --yes; echo ${"a".repeat(70_000)}`];
    for (const command of long) {
      expect(personOnlyVerdict(command, BAKED_DEFAULT), command.slice(0, 40)).toMatchObject({ deny: true, rule: "line-too-long", ask: false });
      expect(decide(tool, guard, command), `${tool}: ${command.slice(0, 40)}`).toEqual(refused);
      expect(helper(tool, guard, command), `${tool} helper: ${command.slice(0, 40)}`).toEqual(refused);
    }
    // The neighbours under the cap read as today.
    const short = [`echo ${"a".repeat(59_995)}`, `echo ${"a".repeat(65_530)}`];
    for (const command of short) {
      expect(decide(tool, guard, command)).toEqual({ deny: false });
      expect(helper(tool, guard, command)).toEqual({ deny: false });
    }
    await getRepo().seedFiles(UNATTENDED);
    for (const command of long) expect(decide(tool, guard, command), `${tool} unattended: ${command.slice(0, 40)}`).toEqual(refused);
    for (const command of short) expect(decide(tool, guard, command)).toEqual({ deny: false });
  });
});

describe("a message read on stdin by git commit or gh pr, as data in every mode (a5, review/118)", () => {
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };
  const BODY = "fix(hooks): read a body as data\n\n* the first bullet\n$HOME is text here\n* another bullet";

  // Red on 87c72904: the bullet and bare-expansion lines asked as a loosening, so a sub-agent and an unattended run were
  // refused. Unattended, `gh pr create` and `gh pr edit` stay refused by the unattended push rule, as they were.
  it.each(TOOLS)("%s: runs a bulleted message through each stdin form, in every mode it may run in", async (tool) => {
    const guard = await placeGuard(tool);
    const everywhere = [
      `git commit -s -F - <<'EOF'\n${BODY}\nEOF`,
      `git commit --file - <<'EOF'\n${BODY}\nEOF`,
      `git commit --file=- <<'EOF'\n${BODY}\nEOF`,
      `gh pr comment 5 --body-file - <<'EOF'\n${BODY}\nEOF`,
      `gh pr comment 5 -F - <<'EOF'\n${BODY}\nEOF`,
    ];
    const attendedOnly = [`gh pr create --title t --body-file - <<'EOF'\n${BODY}\nEOF`, `gh pr edit 5 -F - <<'EOF'\n${BODY}\nEOF`];
    for (const command of [...everywhere, ...attendedOnly]) {
      expect(personOnlyVerdict(command, BAKED_DEFAULT), command).toEqual({ deny: false });
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual({ deny: false });
      expect(helper(tool, guard, command), `${tool} helper: ${command}`).toEqual({ deny: false });
    }
    await getRepo().seedFiles(UNATTENDED);
    for (const command of everywhere) expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toEqual({ deny: false });
    for (const command of attendedOnly) {
      expect(decide(tool, guard, command), `${tool} unattended: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("`gh pr") });
    }
  });

  it.each(TOOLS)("%s: keeps the reading for the same bodies under a wrapper, piped onward or with another program first", async (tool) => {
    const guard = await placeGuard(tool);
    const FORCE = "git push --force origin feat/x";
    for (const command of [
      `sudo git commit -F - <<'EOF'\n${FORCE}\nEOF`,
      `git commit -F - <<'EOF' | sh\n${FORCE}\nEOF`,
      `cd /tmp && gh pr comment 5 -F - <<'EOF'\n${FORCE}\nEOF`,
    ]) {
      expect(personOnlyVerdict(command, BAKED_DEFAULT), command).toMatchObject({ deny: true, rule: "force-push" });
      expect(decide(tool, guard, command).deny, `${tool}: ${command}`).toBe(true);
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
  });
});

describe("the guard's reading of the land verb's approved line with its value (a4, review/103, review/110)", () => {
  const SHA = "0123456789abcdef0123456789abcdef01234567";
  const helper = (tool: Tool, guard: string, command: string): Decision =>
    clientDecision(tool, run(guard, JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_id: "a1" })), `${tool} helper: ${command}`);

  // Red on 4d344eb2: the valued and joined approved lines ran unasked in every mode.
  it.each(TOOLS)("%s: asks attended for the valued and the joined forms, and refuses them for a sub-agent and unattended", async (tool) => {
    const guard = await placeGuard(tool);
    const lines = [
      `npx --no stamity run land --run 2026-10-23_x --approved ${SHA} --json`,
      `stamity run land --run 2026-10-23_x --approved=${SHA}`,
      // The flows' approved line, its exact option set, and the flag first among the options.
      `stamity run land --run 2026-10-23_x --ready --approved ${SHA} --json`,
      `stamity run land --approved ${SHA} --run 2026-10-23_x --wait 8 --fast-forward --json`,
    ];
    for (const command of lines) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict, command).toMatchObject({ deny: true, rule: "land-approved", ask: true });
      if (verdict.deny) expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      expect(helper(tool, guard, command).deny, `${tool} helper: ${command}`).toBe(true);
    }
    await getRepo().seedFiles({ ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") });
    for (const command of lines) expect(decide(tool, guard, command).deny, `${tool} unattended: ${command}`).toBe(true);
  });
});

describe("a renamed fork's guard copies carry its own identity only (a4, build/10)", () => {
  // Red on 3be66b7f: each copy embedded the canonical scoped name in its shell reading's fallback.
  it.each(TOOLS)("%s: holds no canonical package name, and reads the fork's installed CLI by its path", async (tool) => {
    const fork = planCoreHookScripts(POLICY, tool, { ...CLI_PIN, packageName: "@acme/forge", personOnlyGuard: true }).find(
      (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
    );
    if (fork === undefined) throw new Error("the plan carried no person-only guard");
    expect(fork.content).not.toContain("@zomarit/stamity");
    // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the candidate line swapped, as `placeGuard` swaps it.
    await getRepo().seedFiles({ ".git/HEAD": "ref: refs/heads/feat/x\n", [`.stamity/generated/hooks/${tool}/${fork.fileName}`]: swapCandidates(fork.content) });
    const guard = getRepo().path(".stamity", "generated", "hooks", tool, fork.fileName);
    expect(decide(tool, guard, "node node_modules/@acme/forge/dist/cli.js sync \"$X\"").deny).toBe(true);
    expect(decide(tool, guard, "node node_modules/@acme/forge/dist/cli.js sync --json")).toEqual({ deny: false });
  });
});

/**
 * a4c-outside-party (REQ-FLOW-134): the guard holds a gh write to the origin of the repository it sits in, read from
 * that repository's git config, and reads where a write naming no target lands from each place's own remotes and gh's
 * `gh-resolved` marker, or from `GH_REPO` in the hook's environment. Each case runs the emitted guard in a scratch
 * repository whose origin is `acme/app` on github.com; each ask sits beside the one fact that lets the same call run
 * (the origin named, one remote, the marker on the origin, no person named), so a guard that asked for every comment,
 * or for none, fails.
 */
describe("writes that reach an outside party (a4c, REQ-FLOW-134)", () => {
  const remote = (name: string, url: string, extra = ""): string =>
    `[remote "${name}"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/${name}/*\n${extra}`;
  const ORIGIN = `[core]\n\tbare = false\n${remote("origin", "https://github.com/acme/app.git")}`;
  /** The context the guard hands its verdict in that repository under the default setting. */
  const READ = { ...BAKED_DEFAULT, originRepo: "github.com/acme/app", ghDefaultRepo: "github.com/acme/app" };
  const UNATTENDED = { ".stamity/runs/2026-10-23_x/record.md": record("in progress", "unattended") };
  const WHY = "This session is unattended because .stamity/runs/2026-10-23_x/record.md reads `Status: in progress` and `Mode: unattended`.";
  const COMMENT = "gh pr comment 3 --body 'looks good'";
  const asked = (command: string, ctx: Parameters<typeof personOnlyVerdict>[1] = READ): { act: string; rule: string; ask: boolean } => {
    const verdict = personOnlyVerdict(command, ctx);
    if (!verdict.deny) throw new Error(`${command} is no person-only act`);
    expect(verdict, command).toMatchObject({ rule: "outside-write", ask: true });
    return verdict;
  };

  // Red on 5814ebe1, which allows the outside form on every client.
  it.each(TOOLS)("%s: runs a comment on the origin's pull request and asks for the same comment on another repository", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    expect(decide(tool, guard, COMMENT)).toEqual({ deny: false });
    expect(decide(tool, guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
    const outside = `${COMMENT} -R other/repo`;
    expect(decide(tool, guard, outside)).toEqual(expectedAttended(tool, asked(outside)));
  });

  it.each(TOOLS)("%s: unattended, refuses the comment on another repository with the summary-list sentence", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN, ...UNATTENDED });
    const outside = `${COMMENT} -R other/repo`;
    expect(decide(tool, guard, outside)).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(asked(outside))} ${WHY}`) });
    expect(decide(tool, guard, COMMENT)).toEqual({ deny: false });
  });

  it("asks for a ready mark given another repository's pull request URL, and runs one on the origin's", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const outside = "gh pr ready https://github.com/other/repo/pull/3";
    expect(decide("claude", guard, outside)).toEqual(expectedAttended("claude", asked(outside)));
    expect(decide("claude", guard, "gh pr ready https://github.com/acme/app/pull/3")).toEqual({ deny: false });
  });

  it("asks for a REST write on another repository's comments and runs a read there", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const write = "gh api -X POST repos/other/repo/issues/1/comments -f body=x";
    expect(decide("claude", guard, write)).toEqual(expectedAttended("claude", asked(write)));
    expect(decide("claude", guard, "gh api repos/other/repo/issues/1/comments")).toEqual({ deny: false });
    expect(decide("claude", guard, "gh api -X POST repos/{owner}/{repo}/issues/1/comments -f body=x")).toEqual({ deny: false });
  });

  it("asks for an inline body naming a person, and runs one naming an app, an email address or a mention in backticks", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const person = "gh pr comment 3 --body '@alice please look'";
    expect(decide("claude", guard, person)).toEqual(expectedAttended("claude", asked(person)));
    for (const command of [
      "gh pr comment 3 --body '@codex review'",
      "gh pr comment 3 --body 'Co-Authored-By: x <noreply@anthropic.com>'",
      "gh pr comment 3 --body 'run `@alice` as written'",
    ]) {
      expect(decide("claude", guard, command), command).toEqual({ deny: false });
    }
  });

  it("reads a heredoc body the line skips as data for a mention, on stdin and in a quoted substitution", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    for (const command of [
      "gh pr comment 3 --body-file - <<'EOF'\nthanks @alice\nEOF",
      "gh pr create --title t --body \"$(cat <<'EOF'\nthanks @alice\nEOF\n)\"",
    ]) {
      expect(decide("claude", guard, command), command).toEqual(expectedAttended("claude", asked(command)));
      expect(decide("claude", guard, command.replace("@alice", "alice")), command).toEqual({ deny: false });
    }
    // A body read from a file is not read (the named residual).
    expect(decide("claude", guard, "gh pr comment 3 --body-file notes.md")).toEqual({ deny: false });
  });

  it("asks for a write naming the origin while the origin's URL cannot be read", async () => {
    const guard = await placeGuard("claude", { ".git/config": remote("origin", "/srv/git/app.git") });
    const named = `${COMMENT} -R acme/app`;
    expect(decide("claude", guard, named)).toEqual(expectedAttended("claude", asked(named, { ...READ, originRepo: "", ghDefaultRepo: "" })));
    expect(decide("claude", guard, COMMENT)).toEqual({ deny: false });
  });

  it("reads an SSH origin as the same repository as its HTTPS URL", async () => {
    const guard = await placeGuard("claude", { ".git/config": remote("origin", "git@github.com:acme/app.git") });
    expect(decide("claude", guard, `${COMMENT} -R https://github.com/acme/app`)).toEqual({ deny: false });
    expect(decide("claude", guard, `${COMMENT} -R other/repo`)).toMatchObject({ deny: true, ask: true });
  });

  it("asks for the same owner and repository on another host", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const other = `${COMMENT} -R ghe.example.com/acme/app`;
    expect(decide("claude", guard, other)).toEqual(expectedAttended("claude", asked(other)));
    expect(decide("claude", guard, `${COMMENT} -R github.com/acme/app`)).toEqual({ deny: false });
  });

  it("asks for a write naming no target where GH_REPO is set on the line", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const line = `GH_REPO=other/repo ${COMMENT}`;
    expect(decide("claude", guard, line)).toEqual(expectedAttended("claude", asked(line)));
  });

  it("reads GH_REPO in the hook's own environment as gh's default", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    expect(decide("claude", guard, COMMENT, { GH_REPO: "other/repo" })).toEqual(
      expectedAttended("claude", asked(COMMENT, { ...READ, ghDefaultRepo: "github.com/other/repo" })),
    );
    expect(decide("claude", guard, COMMENT, { GH_REPO: "acme/app" })).toEqual({ deny: false });
  });

  it("asks for a write naming no target in a checkout of two remotes with no default marked for gh", async () => {
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}${remote("upstream", "https://github.com/up/app.git")}` });
    expect(decide("claude", guard, COMMENT)).toEqual(expectedAttended("claude", asked(COMMENT, { ...READ, ghDefaultRepo: null })));
    // A target named on the line is read on its own.
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
  });

  it("asks where gh's marked default is a fork's upstream, and runs where the marker is on the origin", async () => {
    const upstream = remote("upstream", "https://github.com/up/app.git", "\tgh-resolved = base\n");
    const marked = await placeGuard("claude", { ".git/config": `${ORIGIN}${upstream}` });
    expect(decide("claude", marked, COMMENT)).toEqual(expectedAttended("claude", asked(COMMENT, { ...READ, ghDefaultRepo: "github.com/up/app" })));
    const onOrigin = `[core]\n\tbare = false\n${remote("origin", "https://github.com/acme/app.git", "\tgh-resolved = base\n")}${remote("upstream", "https://github.com/up/app.git")}`;
    await getRepo().seedFiles({ ".git/config": onOrigin });
    expect(decide("claude", marked, COMMENT)).toEqual({ deny: false });
  });

  // TEST CHANGE, justified (REQ-FLOW-134, review/134): the title moves with what the case now pins.
  it("follows an include whose target is missing as an empty file, as git reads it", async () => {
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}[include]\n\tpath = ../more.gitconfig\n` });
    // TEST CHANGE, justified (REQ-FLOW-134, review/134): includes are followed now, and a missing target reads as empty,
    // as git reads it, so a write naming no target, one naming the origin and a feature push all run; an included
    // file setting a remote is pinned in the round-3 block below.
    expect(decide("claude", guard, COMMENT)).toEqual({ deny: false });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });

  it("reads a config past the 4 KiB metadata ceiling, one holding many branch sections", async () => {
    const branches = Array.from({ length: 200 }, (_, n) => `[branch "feat/b${n}"]\n\tremote = origin\n\tmerge = refs/heads/feat/b${n}\n`).join("");
    const config = `${ORIGIN}${branches}`;
    expect(config.length).toBeGreaterThan(4_096);
    const guard = await placeGuard("claude", { ".git/config": config });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
    expect(decide("claude", guard, `${COMMENT} -R other/repo`)).toMatchObject({ deny: true, ask: true });
  });

  it("reads a config holding long runs of blanks, in a value and in a section head, within the bound", async () => {
    // Under the 1 MiB config ceiling; a pattern with two adjacent runs over one blank run takes the square of its length.
    const config = `${ORIGIN}\tx = a${" ".repeat(400_000)}b\n[remote${" ".repeat(400_000)}\n`;
    expect(config.length).toBeLessThan(1_048_576);
    const guard = await placeGuard("claude", { ".git/config": config });
    const started = performance.now();
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
    expect(performance.now() - started).toBeLessThan(8_000);
  });

  it("asks for a write naming no target from another checkout, by a cd on the line or the call's working directory", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "other/.git/HEAD": "ref: refs/heads/main\n",
      "other/.git/config": remote("origin", "https://github.com/other/repo.git"),
    });
    const moved = `cd other && ${COMMENT}`;
    expect(decide("claude", guard, moved)).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, COMMENT, undefined, "other")).toMatchObject({ deny: true, ask: true });
    // The session's own checkout, moved to by the same command, runs.
    expect(decide("claude", guard, `cd . && ${COMMENT}`)).toEqual({ deny: false });
  });
});

/**
 * a4c fix round 1 (REQ-FLOW-134, build/20, build/21, build/22): the emitted guard, in a scratch repository whose origin
 * is `acme/app`, asks for a GraphQL mutation by a node id it cannot place, a curl or wget write to another repository
 * through the GitHub API, and a review request naming a person, and refuses each unattended; a thread's resolve state
 * runs in every mode. Red on dbf1a825, whose guard allows each asking form.
 */
describe("the outside-party readers' second round in the guard (a4c, build/20-22)", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const READ = { ...BAKED_DEFAULT, originRepo: "github.com/acme/app", ghDefaultRepo: "github.com/acme/app" };
  const UNATTENDED = { ".stamity/runs/2026-10-23_y/record.md": record("in progress", "unattended") };
  const WHY = "This session is unattended because .stamity/runs/2026-10-23_y/record.md reads `Status: in progress` and `Mode: unattended`.";
  const asked = (command: string): { act: string; rule: string; ask: boolean } => {
    const verdict = personOnlyVerdict(command, READ);
    if (!verdict.deny) throw new Error(`${command} is no person-only act`);
    expect(verdict, command).toMatchObject({ rule: "outside-write", ask: true });
    return verdict;
  };
  const COMMENT_MUTATION = `gh api graphql -f query='mutation { addComment(input: {subjectId: "I_1", body: "x"}) { clientMutationId } }'`;
  const RESOLVE = `gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "T_1"}) { thread { isResolved } } }'`;

  it.each(TOOLS)("%s: asks for a GraphQL comment mutation by a node id, and runs a thread resolve", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    expect(decide(tool, guard, COMMENT_MUTATION)).toEqual(expectedAttended(tool, asked(COMMENT_MUTATION)));
    expect(decide(tool, guard, RESOLVE)).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: unattended, refuses the GraphQL comment mutation and still runs a thread resolve", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN, ...UNATTENDED });
    expect(decide(tool, guard, COMMENT_MUTATION)).toEqual({ deny: true, reason: expect.stringContaining(`${morningList(asked(COMMENT_MUTATION))} ${WHY}`) });
    expect(decide(tool, guard, RESOLVE)).toEqual({ deny: false });
  });

  it("runs a thread resolve under a baked `ask` setting too", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN }, resolveAutonomy({ autonomy: { mode: "ask" } }));
    expect(decide("claude", guard, RESOLVE)).toEqual({ deny: false });
  });

  it.each(TOOLS)("%s: asks for a curl or a wget write to another repository through the GitHub API, and runs one to the origin", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    for (const outside of [
      `curl -X POST -d '{"body":"x"}' https://api.github.com/repos/other/repo/issues/1/comments`,
      `wget --post-data='{"body":"x"}' https://api.github.com/repos/other/repo/issues/1/comments`,
      `curl -X POST -d '{"body":"x"}' "$URL"`,
    ]) {
      expect(decide(tool, guard, outside), `${tool}: ${outside}`).toEqual(expectedAttended(tool, asked(outside)));
    }
    for (const origin of [
      `curl -X POST -d '{"body":"x"}' https://api.github.com/repos/acme/app/issues/1/comments`,
      `wget --post-data='{"body":"x"}' https://api.github.com/repos/acme/app/issues/1/comments`,
    ]) {
      expect(decide(tool, guard, origin), `${tool}: ${origin}`).toEqual({ deny: false });
    }
  });

  it.each(TOOLS)("%s: asks for a review request naming a person, and runs one naming an app", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    const person = "gh pr edit 3 --add-reviewer alice";
    expect(decide(tool, guard, person)).toEqual(expectedAttended(tool, asked(person)));
    expect(decide(tool, guard, "gh pr edit 3 --add-reviewer @copilot")).toEqual({ deny: false });
  });
});

/**
 * a4c fix round 2 (REQ-FLOW-134, review/128-130): the emitted guard works out the origin, gh's default and each
 * remote's push repository from git's merged configuration, `insteadOf` rewrites included; a configuration it can read
 * only in part, or one the hook's environment sets, is unreadable; a push to another repository asks. Each asking case
 * is red on e53503b6 and sits beside one that runs on both.
 */
describe("the guard's merged git configuration and the push's repository (a4c, review/128-130)", () => {
  const remote = (name: string, url: string, extra = ""): string => `[remote "${name}"]\n\turl = ${url}\n${extra}`;
  const ORIGIN = remote("origin", "https://github.com/acme/app.git");
  const COMMENT = "gh pr comment 3 --body 'looks good'";
  const FEATURE_PUSH = "git push -u origin feat/x";

  it("reads a remote the global configuration adds, so a write naming no target asks", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "home.gitconfig": remote("upstream", "https://github.com/up/app.git") });
    const global = { GIT_CONFIG_GLOBAL: getRepo().path("home.gitconfig") };
    expect(decide("claude", guard, COMMENT, global)).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, COMMENT)).toEqual({ deny: false });
  });

  it("reads the XDG global file when no global file is named", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "xdg/git/config": remote("upstream", "https://github.com/up/app.git") });
    const base = { ...process.env };
    for (const name of ["GIT_CONFIG_GLOBAL", "GH_REPO", "GH_HOST", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "STAMITY_UNATTENDED", "STAMITY_REPO_ROOT"]) delete base[name];
    const read = (xdg: string): Decision =>
      clientDecision("claude", spawnSync(process.execPath, [guard], {
        input: payload("claude", COMMENT),
        encoding: "utf8",
        // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the host's system-file places pinned, as `run` pins them.
        env: { ...hostFree(base), GIT_CONFIG_NOSYSTEM: "1", HOME: getRepo().path("home"), XDG_CONFIG_HOME: xdg },
        timeout: CHILD_TIMEOUT_MS, // TEST CHANGE, justified: a time limit only, no expected value moved.
      }), xdg);
    expect(read(getRepo().path("xdg"))).toMatchObject({ deny: true, ask: true });
    expect(read(getRepo().path("none"))).toEqual({ deny: false });
  });

  it("applies an insteadOf rewrite from the global configuration to the origin and to gh's default alike", async () => {
    const rewrite = '[url "https://github.com/other/"]\n\tinsteadOf = https://github.com/acme/\n';
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "home.gitconfig": rewrite });
    const global = { GIT_CONFIG_GLOBAL: getRepo().path("home.gitconfig") };
    // The origin git reaches is `other/app` now: a write naming `acme/app` reaches another repository.
    expect(decide("claude", guard, `${COMMENT} -R acme/app`, global)).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, `${COMMENT} -R other/app`, global)).toEqual({ deny: false });
    expect(decide("claude", guard, COMMENT, global)).toEqual({ deny: false });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
  });

  it("reads configuration the hook's environment sets as unreadable", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`, { GIT_CONFIG_COUNT: "1" })).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
  });

  it("reads an origin URL holding more than a repository's path as unreadable", async () => {
    const guard = await placeGuard("claude", { ".git/config": remote("origin", "https://github.com/acme/app/extra.git") });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toMatchObject({ deny: true, ask: true });
  });

  it.each(TOOLS)("%s: asks for a push to another repository's remote or URL, and runs a feature push to origin", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": `${ORIGIN}${remote("upstream", "https://github.com/up/app.git")}` });
    for (const command of ["git push upstream feat/x", "git push https://github.com/other/repo.git feat/x"]) {
      const verdict = personOnlyVerdict(command, { ...BAKED_DEFAULT, originRepo: "github.com/acme/app", remoteRepo: (name) => (name === "upstream" ? "github.com/up/app" : "") });
      if (!verdict.deny) throw new Error(`${command} is no person-only act`);
      expect(verdict).toMatchObject({ rule: "outside-write", ask: true });
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
    }
    expect(decide(tool, guard, FEATURE_PUSH)).toEqual({ deny: false });
    expect(decide(tool, guard, "git push https://github.com/acme/app.git feat/x")).toEqual({ deny: false });
  });

  it("runs a push to a second remote whose URL is the origin's, and to origin under a pushInsteadOf rewrite", async () => {
    const rewrite = '[url "git@github.com:acme/"]\n\tpushInsteadOf = https://github.com/acme/\n';
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}${remote("mirror", "git@github.com:acme/app.git")}${rewrite}` });
    expect(decide("claude", guard, "git push mirror feat/x")).toEqual({ deny: false });
    expect(decide("claude", guard, FEATURE_PUSH)).toEqual({ deny: false });
  });

  it("reads the push remote of a push naming none from the branch's configuration", async () => {
    const config = `${ORIGIN}${remote("upstream", "https://github.com/up/app.git")}[branch "feat/x"]\n\tpushRemote = upstream\n`;
    const guard = await placeGuard("claude", { ".git/config": config });
    expect(decide("claude", guard, "git push")).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, FEATURE_PUSH)).toEqual({ deny: false });
  });

  it("asks for a push to origin from another checkout of another repository, and runs one from a checkout of the same", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "other/.git/HEAD": "ref: refs/heads/feat/x\n",
      "other/.git/config": remote("origin", "https://github.com/other/repo.git"),
      "clone/.git/HEAD": "ref: refs/heads/feat/x\n",
      "clone/.git/config": remote("origin", "git@github.com:acme/app.git"),
    });
    expect(decide("claude", guard, `cd other && ${FEATURE_PUSH}`)).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, `cd clone && ${FEATURE_PUSH}`)).toEqual({ deny: false });
  });

  it("reads a configuration holding more URL rewrite rules than its ceiling as unreadable, so each lookup stays bounded", async () => {
    const rules = Array.from({ length: 257 }, (_, n) => `[url "https://mirror${n}.example.com/"]\n\tinsteadOf = https://src${n}.example.com/\n`).join("");
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}${rules}` });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toMatchObject({ deny: true, ask: true });
    await getRepo().seedFiles({ ".git/config": `${ORIGIN}${rules.split("[url").slice(0, 4).join("[url")}` });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`)).toEqual({ deny: false });
  });

  it("refuses a push to another repository unattended, and still runs the run verb", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, ".stamity/runs/2026-10-23_z/record.md": record("in progress", "unattended") });
    expect(decide("claude", guard, "git push https://github.com/other/repo.git feat/x").deny).toBe(true);
    expect(decide("claude", guard, RUN_END)).toEqual({ deny: false });
  });
});

/**
 * a4c fix round 3 (REQ-FLOW-134, review/134, review/129): the emitted guard follows a global file's includes, so an
 * unrelated include leaves own-origin writes running and an included file that moves a remote makes them ask; a remote
 * or URL rewrite written runs on the main thread and is refused for a sub-agent; a push to origin is held to origin's
 * push URL. These cases name a real global file; the harness's blank one stays for the older rows.
 */
describe("the guard's includes, remote writes and origin's push URL (a4c, review/129, review/134)", () => {
  const remote = (name: string, url: string, extra = ""): string => `[remote "${name}"]\n\turl = ${url}\n${extra}`;
  const ORIGIN = remote("origin", "https://github.com/acme/app.git");
  const COMMENT = "gh pr comment 3 --body 'looks good'";
  const REPLY = "gh api -X POST repos/{owner}/{repo}/pulls/3/comments -F in_reply_to=1 -F body=@reply.md";
  const OWN = [COMMENT, REPLY, "git push"];
  const global = (): Record<string, string> => ({ GIT_CONFIG_GLOBAL: getRepo().path("cfg", "global") });

  it("follows an unrelated include in the global file and leaves own-origin writes running", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "cfg/global": "[user]\n\tname = x\n[include]\n\tpath = identity.gitconfig\n",
      "cfg/identity.gitconfig": "[user]\n\temail = x@example.com\n",
    });
    for (const command of OWN) expect(decide("claude", guard, command, global()), command).toEqual({ deny: false });
  });

  it("asks for those writes where an included file, read relative to the file that includes it, moves a remote", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "cfg/global": "[include]\n\tpath = sub/remotes.gitconfig\n",
      "cfg/sub/remotes.gitconfig": remote("origin", "https://github.com/other/repo.git"),
    });
    for (const command of OWN) expect(decide("claude", guard, command, global()), command).toMatchObject({ deny: true, ask: true });
  });

  it("reads every includeIf target whatever its condition, and a ~/ path from the home folder", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "cfg/global": '[includeIf "gitdir:/nowhere/"]\n\tpath = ~/rewrites.gitconfig\n',
      "rewrites.gitconfig": '[url "https://github.com/other/"]\n\tinsteadOf = https://github.com/acme/\n',
    });
    expect(decide("claude", guard, COMMENT, { ...global(), HOME: getRepo().path() })).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, COMMENT, { ...global(), HOME: getRepo().path("cfg") })).toEqual({ deny: false });
  });

  it("reads an include past its depth bound, or a target it cannot read, as unreadable", async () => {
    const chain = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`cfg/c${n}`, `[include]\n\tpath = c${n + 1}\n`]));
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "cfg/global": "[include]\n\tpath = c0\n", ...chain });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`, global())).toMatchObject({ deny: true, ask: true });
    await getRepo().seedFiles({ "cfg/c3": "[user]\n\tname = x\n" });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`, global())).toEqual({ deny: false });
    mkdirSync(getRepo().path("cfg", "folder"));
    await getRepo().seedFiles({ "cfg/c3": "[include]\n\tpath = folder\n" });
    expect(decide("claude", guard, `${COMMENT} -R acme/app`, global())).toMatchObject({ deny: true, ask: true });
  });

  it("runs a remote's URL change on the main thread and refuses it for a sub-agent", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const change = "git remote set-url origin https://github.com/other/repo.git";
    expect(decide("claude", guard, change)).toEqual({ deny: false });
    const helper = JSON.stringify({ ...JSON.parse(payload("claude", change)), agent_type: "stamity-implementer", agent_id: "a1" });
    expect(clientDecision("claude", run(guard, helper), "helper")).toEqual({
      deny: true,
      reason: expect.stringContaining("Writing a git remote or a URL rewrite is a person-only act (`remote-write`) and a sub-agent runs it"),
    });
    const read = JSON.stringify({ ...JSON.parse(payload("claude", "git config --get remote.origin.url")), agent_type: "stamity-implementer", agent_id: "a1" });
    expect(clientDecision("claude", run(guard, read), "read")).toEqual({ deny: false });
  });

  it("asks for a feature push to origin whose push URL is another repository's, and runs one whose push URL is the origin's", async () => {
    const guard = await placeGuard("claude", { ".git/config": remote("origin", "https://github.com/acme/app.git", "\tpushurl = https://github.com/other/repo.git\n") });
    expect(decide("claude", guard, "git push -u origin feat/x")).toMatchObject({ deny: true, ask: true });
    await getRepo().seedFiles({ ".git/config": remote("origin", "https://github.com/acme/app.git", "\tpushurl = git@github.com:acme/app.git\n") });
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });
});

/**
 * a4c fix round 4 (REQ-FLOW-134, the lens's W-2, the fixer's round-3 M-2): the emitted guard compares every URL a push to
 * origin reaches, holds one it cannot read whole as outside, reads an include key written as a remote write, and names
 * REQ-FLOW-134 when it refuses a sub-agent's remote write. Red on 121a3810, which runs each asking push and cites
 * REQ-FLOW-137.
 */
describe("the guard's push to origin over every URL, and the remote write's own requirement (a4c, the lens's W-2)", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const PUSH = "git push -u origin feat/x";

  it("asks for a push to origin whose second URL is another repository's, and runs one whose URLs are all the origin's", async () => {
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}\turl = https://github.com/other/repo.git\n` });
    expect(decide("claude", guard, PUSH)).toMatchObject({ deny: true, ask: true });
    await getRepo().seedFiles({ ".git/config": `${ORIGIN}\turl = git@github.com:acme/app.git\n` });
    expect(decide("claude", guard, PUSH)).toEqual({ deny: false });
  });

  it("asks for a push to origin where one of its push URLs is another repository's", async () => {
    const pushes = "\tpushurl = git@github.com:acme/app.git\n\tpushurl = https://github.com/other/repo.git\n";
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}${pushes}` });
    expect(decide("claude", guard, PUSH)).toMatchObject({ deny: true, ask: true });
  });

  it("asks for a push to origin where an included file sets origin's URL, so the reading is partial", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "cfg/global": "[include]\n\tpath = moved.gitconfig\n",
      "cfg/moved.gitconfig": '[remote "origin"]\n\turl = https://github.com/other/repo.git\n',
    });
    expect(decide("claude", guard, PUSH, { GIT_CONFIG_GLOBAL: getRepo().path("cfg", "global") })).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, PUSH)).toEqual({ deny: false });
  });

  it("refuses a sub-agent's include write and names REQ-FLOW-134 as the reason", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const write = "git config --global include.path extra.gitconfig";
    expect(decide("claude", guard, write)).toEqual({ deny: false });
    const helper = JSON.stringify({ ...JSON.parse(payload("claude", write)), agent_type: "stamity-implementer", agent_id: "a1" });
    expect(clientDecision("claude", run(guard, helper), "helper")).toEqual({
      deny: true,
      reason: expect.stringContaining("so it runs on the main thread only (REQ-FLOW-134)"),
    });
  });
});

/**
 * a4c fix round 5 (REQ-FLOW-134, review/148): the emitted guard follows a git configuration file that is a symbolic
 * link, global and included alike, at most eight links, as git follows it; a link it cannot resolve is unreadable. Red
 * on 6a2e23e0, which reads any linked file as partial, so an own-origin comment, reply and feature push ask there.
 */
describe("the guard's linked git configuration files (a4c, review/148)", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const COMMENT = "gh pr comment 3 --body 'looks good'";
  const REPLY = "gh api -X POST repos/{owner}/{repo}/pulls/3/comments -F in_reply_to=1 -F body=@reply.md";
  const OWN = [COMMENT, REPLY, "git push -u origin feat/x"];
  const global = (): Record<string, string> => ({ GIT_CONFIG_GLOBAL: getRepo().path("cfg", "global") });
  const link = (target: string, at: string): void => symlinkSync(target, getRepo().path(...at.split("/")));

  it("follows a global file that is a symbolic link and holds nothing about remotes, so own-origin writes run", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "dotfiles/gitconfig": "[user]\n\tname = x\n", "cfg/.keep": "" });
    link("../dotfiles/gitconfig", "cfg/global");
    for (const command of OWN) expect(decide("claude", guard, command, global()), command).toEqual({ deny: false });
  });

  it("asks for those writes where a linked global file includes a linked file that moves origin", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "dotfiles/gitconfig": "[include]\n\tpath = remotes.gitconfig\n",
      "dotfiles/remotes-real.gitconfig": '[remote "origin"]\n\turl = https://github.com/other/repo.git\n',
      "cfg/.keep": "",
    });
    // A relative include is read from the directory of the file as git opened it, the link's, as git reads it.
    link("../dotfiles/remotes-real.gitconfig", "cfg/remotes.gitconfig");
    link("../dotfiles/gitconfig", "cfg/global");
    for (const command of OWN) expect(decide("claude", guard, command, global()), command).toMatchObject({ deny: true, ask: true });
  });

  it("reads a link it cannot resolve, or a chain past eight links, as unreadable, and a short chain as its target", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN, "cfg/target": "[user]\n\tname = x\n" });
    const named = `${COMMENT} -R acme/app`;
    link("missing", "cfg/global");
    expect(decide("claude", guard, named, global())).toMatchObject({ deny: true, ask: true });
    for (let n = 1; n <= 9; n += 1) link(n === 9 ? "target" : `l${n + 1}`, `cfg/l${n}`);
    expect(decide("claude", guard, named, { GIT_CONFIG_GLOBAL: getRepo().path("cfg", "l1") })).toMatchObject({ deny: true, ask: true });
    expect(decide("claude", guard, named, { GIT_CONFIG_GLOBAL: getRepo().path("cfg", "l3") })).toEqual({ deny: false });
  });
});

/**
 * b14b (REQ-FLOW-102, ledger row review/163): a write of origin's HEAD ref, where this guard reads the default branch,
 * is read as the push it steers. Red on d9414a9e, which runs both lines unasked on Claude Code's main thread, a
 * sub-agent's call and an unattended one among them.
 */
describe("a remote's HEAD ref written, on every client (b14b, review/163)", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const asHelper = (tool: Tool, command: string): string => JSON.stringify({ ...JSON.parse(payload(tool, command)), agent_type: "stamity-implementer", agent_id: "a1" });

  it.each(TOOLS)("%s: asks on the main thread where it can, and refuses a sub-agent's call and an unattended one", async (tool) => {
    const guard = await placeGuard(tool, { ".git/config": ORIGIN });
    // The remote-tracking delete (review/24) and a name the line cannot show (review/26) join the first two, then a
    // stdin text under an abbreviated stdin option and a delete whose remotes flag the shell fills in (review/35), then
    // a set-head after a word the shell fills in (review/51).
    const lines = [
      "git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/feat/x",
      "git remote set-head origin -a",
      "git branch -d -r origin/HEAD",
      'git symbolic-ref "$R" refs/remotes/origin/feat/x',
      "printf 'update refs/remotes/origin/HEAD 0123abc\\n' | git update-ref --std",
      'git branch -d "$F" origin/HEAD',
      'git remote "$X" set-head origin feat/x',
    ];
    for (const command of lines) {
      const verdict = personOnlyVerdict(command, BAKED_DEFAULT);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (!verdict.deny) continue;
      expect(decide(tool, guard, command), `${tool}: ${command}`).toEqual(expectedAttended(tool, verdict));
      const helper = clientDecision(tool, run(guard, asHelper(tool, command)), `${tool} helper: ${command}`);
      expect(helper, `${tool} helper: ${command}`).toMatchObject({ deny: true });
      expect(helper, `${tool} helper: ${command}`).not.toHaveProperty("ask");
    }
    // Non-degenerate: the read of the same ref, and a write of a remote branch, pass on every client.
    expect(decide(tool, guard, "git symbolic-ref --short -q refs/remotes/origin/HEAD")).toEqual({ deny: false });
    expect(decide(tool, guard, "git update-ref refs/remotes/origin/feat/x HEAD")).toEqual({ deny: false });
    await getRepo().seedFiles({ ".stamity/runs/2026-10-25_x/record.md": record("in progress", "unattended") });
    for (const command of lines) {
      const unattended = decide(tool, guard, command);
      expect(unattended, `${tool} unattended: ${command}`).toMatchObject({ deny: true, reason: expect.stringContaining("Mode: unattended") });
      expect(unattended, `${tool} unattended: ${command}`).not.toHaveProperty("ask");
    }
  });
});

describe("a push whose remote or option word the shell fills in, with the origin placed", () => {
  const ORIGIN_CONFIG = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const REMOTE = "A push whose remote word the line cannot show (it may be a force, mirror or delete option)";
  const HIDDEN = "A push holding an option word the line cannot show (it may be a force, mirror or delete option)";
  const asHelper = (command: string): string => JSON.stringify({ ...JSON.parse(payload("claude", command)), agent_id: "a1" });

  // Red on 091d999b: the remote word asked as a push to another repository, and the option word ran with no ask.
  // TEST CHANGE, justified (REQ-FLOW-124): such a word may be a force, mirror or delete option git reads, an act no
  // approval reaches, so both rows moved from an ask on the main thread to a refusal on the main thread and for a
  // sub-agent alike.
  it.each([
    ["a remote word", 'git push "$R" feat/x', REMOTE],
    ["an option word", 'git push --"$OPT" origin feat/x', HIDDEN],
  ])("refuses naming the force rule for %s on the main thread and for a sub-agent", async (_, command, act) => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN_CONFIG });
    const refused = expectedAttended("claude", { act, rule: "force-push", ask: false });
    expect(decide("claude", guard, command), command).toEqual(refused);
    const helper = clientDecision("claude", run(guard, asHelper(command)), `helper: ${command}`);
    expect(helper, `helper: ${command}`).toEqual(refused);
    // One fact away: the same push with a literal remote and options runs.
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });

  // A pin, green before and after: the lines the maintainers' own runs rely on still run, on the main thread and for a
  // sub-agent, and the run verbs' own push line is not held.
  it("runs the everyday lines a run relies on", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN_CONFIG });
    const lines = [
      "npx --no stamity gate classify --base HEAD --paths src/a.ts",
      "git push -u origin feat/x",
      "git push origin HEAD:refs/heads/feat/x",
      "gh pr create -R acme/app --draft --title t --body b",
      "gh pr edit 3 -R acme/app --body b",
      "gh pr comment 3 -R acme/app --body b",
      'git -C lane commit -s -m "fix: a change"',
      "lockf -k /tmp/stamity-machine.lock npx vitest run test/hooks",
    ];
    for (const command of lines) {
      expect(decide("claude", guard, command), command).toEqual({ deny: false });
      expect(clientDecision("claude", run(guard, asHelper(command)), `helper: ${command}`), `helper: ${command}`).toEqual({ deny: false });
    }
  });

  it("refuses a literal force beside a split-prone remote word on the main thread", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN_CONFIG });
    const decision = decide("claude", guard, "git push --force $R feat/x");
    expect(decision).toMatchObject({ deny: true, reason: expect.stringContaining("(`force-push`)") });
    expect(decision).not.toHaveProperty("ask");
  });
});

/**
 * The place's own push configuration, read from real files (REQ-FLOW-102, REQ-FLOW-124, REQ-FLOW-134): a refmap, the
 * push mode, a mirror setting, read from the repository's file and the global one, and a value the reader cannot decode
 * as git does, which makes the reading partial.
 */
describe("a push read against the push configuration in git's files", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  /** The shape of a maintainer's checkout: gh's marker on origin, a fetch-only remote, branches merging into themselves. */
  const CHECKOUT =
    '[remote "origin"]\n\turl = https://github.com/acme/app.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n\tgh-resolved = base\n' +
    '[remote "archive"]\n\turl = https://github.com/acme/old\n\tfetch = +refs/heads/*:refs/remotes/archive/*\n\tpushurl = no_push\n' +
    '[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n[branch "feat/x"]\n\tremote = origin\n\tmerge = refs/heads/feat/x\n';
  const asHelper = (command: string): string => JSON.stringify({ ...JSON.parse(payload("claude", command)), agent_id: "a1" });
  const ruleSaid = (rule: string): string => `(\`${rule}\`)`;

  // Red on 091d999b: the repository's refmap was never read, so the feature push ran.
  it("asks for a feature push the repository's refmap sends to the default branch, and runs it without the refmap", async () => {
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}\tpush = refs/heads/feat/x:refs/heads/main\n` });
    expect(decide("claude", guard, "git push origin feat/x")).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining(ruleSaid("push-default")) });
    await getRepo().seedFiles({ ".git/config": ORIGIN });
    expect(decide("claude", guard, "git push origin feat/x")).toEqual({ deny: false });
  });

  it("asks for a refless push where the global file sets the upstream mode and the branch merges into the default branch", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": `${ORIGIN}[branch "feat/x"]\n\tremote = origin\n\tmerge = refs/heads/main\n`,
      "home.gitconfig": "[push]\n\tdefault = upstream\n",
    });
    const global = { GIT_CONFIG_GLOBAL: getRepo().path("home.gitconfig") };
    expect(decide("claude", guard, "git push", global)).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining(ruleSaid("push-default")) });
    // One fact away: with no global file the mode is git's default, and the same push runs.
    expect(decide("claude", guard, "git push")).toEqual({ deny: false });
  });

  it("refuses a refless push to a remote whose section holds a bare mirror key", async () => {
    const guard = await placeGuard("claude", { ".git/config": `${ORIGIN}\tmirror\n` });
    const decision = decide("claude", guard, "git push");
    expect(decision).toMatchObject({ deny: true, reason: expect.stringContaining(ruleSaid("force-push")) });
    expect(decision).not.toHaveProperty("ask");
    await getRepo().seedFiles({ ".git/config": `${ORIGIN}\tmirror = false\n` });
    expect(decide("claude", guard, "git push")).toEqual({ deny: false });
  });

  // Red on 091d999b: each value was read as a plain one, or its continuation hid the line after it.
  it.each([
    // git joins the next line to the value, so the push URL after it is origin's, not the second section's.
    ["a value continued onto the next line", `${ORIGIN}\tfetch = +refs/heads/*:refs/remotes/origin/*\\\n[remote "spare"]\n\tpushurl = https://github.com/other/repo.git\n`],
    ["a value holding an escape", '[remote "origin"]\n\turl = "https://github.com/acme/app.git\\t"\n'],
    ["a value holding a quote inside it", '[remote "origin"]\n\turl = https://github.com/"acme"/app.git\n'],
    ["a comment mark inside a quoted value", '[remote "origin"]\n\turl = "https://github.com/acme/app.git ;x"\n'],
    ["a comment mark git cuts with no blank before it", `${ORIGIN}\tpush = refs/heads/feat/x:refs/heads/feat/x;refs/heads/main\n`],
    ["an include path holding an escape", `${ORIGIN}[include]\n\tpath = "../a\\\\b.gitconfig"\n`],
    ["an include path git expands from its install", `${ORIGIN}[include]\n\tpath = %(prefix)/etc/more.gitconfig\n`],
  ])("asks for a push to origin where the repository's file holds %s", async (_, config) => {
    const guard = await placeGuard("claude", { ".git/config": config });
    expect(decide("claude", guard, "git push -u origin feat/x")).toMatchObject({ deny: true, ask: true });
  });

  it("runs the same push where every value is plain, quoted whole or followed by a comment", async () => {
    const plain = `${ORIGIN}\tfetch = "+refs/heads/*:refs/remotes/origin/*"\n\tpushurl = https://github.com/acme/app.git ; the origin\n[include]\n\tpath = ../more.gitconfig\n`;
    const guard = await placeGuard("claude", { ".git/config": plain });
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });

  it("asks on the main thread for a push on a line that also moves the origin", async () => {
    const guard = await placeGuard("claude", { ".git/config": ORIGIN });
    const line = "git remote set-url origin https://github.com/other/repo.git && git push -u origin feat/x";
    expect(decide("claude", guard, line)).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining(ruleSaid("outside-write")) });
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });

  // A pin, green before and after: in a checkout shaped like the maintainers' own, the lines a run relies on still run,
  // on the main thread and for a sub-agent.
  it("runs the everyday lines in a checkout shaped like the maintainers' own", async () => {
    const guard = await placeGuard("claude", { ".git/config": CHECKOUT });
    const lines = [
      "npx --no stamity gate classify --base HEAD --paths src/a.ts",
      "git push -u origin feat/x",
      "git push origin HEAD:refs/heads/feat/x",
      "git push",
      "gh pr create -R acme/app --draft --title t --body b",
      "gh pr edit 3 -R acme/app --body b",
      "gh pr comment 3 -R acme/app --body b",
      'git -C lane commit -s -m "fix: a change"',
      "lockf -k /tmp/stamity-machine.lock npx vitest run test/hooks",
    ];
    for (const command of lines) {
      expect(decide("claude", guard, command), command).toEqual({ deny: false });
      expect(clientDecision("claude", run(guard, asHelper(command)), `helper: ${command}`), `helper: ${command}`).toEqual({ deny: false });
    }
  });
});

/**
 * The system configuration file of a git built with another prefix (REQ-FLOW-134): the guard reads each place such a
 * build keeps it, as an included file, whatever GIT_CONFIG_NOSYSTEM says (every run here sets it), so a remote or URL
 * key in one makes the reading partial. No git is run, by the test or by the guard: a file named git is only looked at.
 */
describe("the system configuration files of other git builds", () => {
  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n';
  const REWRITE = '[url "https://github.com/other/"]\n\tpushInsteadOf = https://github.com/acme/\n';
  const CREDENTIAL = "[credential]\n\thelper = osxkeychain\n";
  const CANDIDATES = CANDIDATES_LINE;
  /** The claude guard with its candidate line swapped for `paths`, the swap asserted first; returns its path. */
  async function placeSwapped(paths: readonly string[], files: Record<string, string>): Promise<string> {
    const guard = planCoreHookScripts(POLICY, "claude", { ...CLI_PIN, personOnlyGuard: true }).find((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
    if (guard === undefined) throw new Error("the plan carried no person-only guard");
    await getRepo().seedFiles({ ".git/HEAD": "ref: refs/heads/feat/x\n", [`.stamity/generated/hooks/claude/${guard.fileName}`]: swapCandidates(guard.content, paths), ...files });
    return getRepo().path(".stamity", "generated", "hooks", "claude", guard.fileName);
  }

  // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): every copy placed here now carries a swapped candidate line,
  // so the shipped line is pinned on the copy emission plans, the same bytes the placed copy held before.
  it("names every place a known git build keeps its system file, on one line", () => {
    const guard = planCoreHookScripts(POLICY, "claude", { ...CLI_PIN, personOnlyGuard: true }).find((script) => script.fileName === PERSON_ONLY_GUARD_FILE);
    expect(guard?.content.split("\n")).toContain(CANDIDATES);
  });

  // Red before the harness pinned them: the host's own variables named a system file every run here read.
  it("keeps the host's own system files out of every run here, and reads one a case names", async () => {
    const guard = await placeGuard("claude", {
      ".git/config": ORIGIN,
      "host/etc/gitconfig": '[remote "origin"]\n\tpushurl = https://github.com/other/repo.git\n',
      // A regular file named git, never run: only its place is read.
      "host/bin/git": "not a program\n",
      "host/bin/git.exe": "not a program\n",
    });
    expect(readFileSync(guard, "utf8")).not.toContain(CANDIDATES);
    const host = getRepo().path("host");
    for (const name of ["HOMEBREW_PREFIX", "CONDA_PREFIX", "HOME", "USERPROFILE"]) vi.stubEnv(name, host);
    vi.stubEnv("PATH", `${getRepo().path("host", "bin")}${delimiter}${process.env.PATH ?? ""}`);
    try {
      expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
    } finally {
      vi.unstubAllEnvs();
    }
    // One fact away: the same file, named by the case itself, is read.
    expect(decide("claude", guard, "git push -u origin feat/x", { HOMEBREW_PREFIX: host })).toMatchObject({ deny: true, ask: true });
  });

  // Red on 091d999b: only GIT_CONFIG_SYSTEM or /etc/gitconfig was read, and not at all under GIT_CONFIG_NOSYSTEM.
  it("asks for a push to origin where a candidate system file rewrites origin's push URL, and runs it beside a credential section alone", async () => {
    const guard = await placeSwapped([getRepo().path("prefix", "etc", "gitconfig")], { ".git/config": ORIGIN, "prefix/etc/gitconfig": REWRITE });
    expect(decide("claude", guard, "git push -u origin feat/x")).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining("(`outside-write`)") });
    await getRepo().seedFiles({ "prefix/etc/gitconfig": CREDENTIAL });
    expect(decide("claude", guard, "git push -u origin feat/x")).toEqual({ deny: false });
  });

  it("asks for a push to origin where the folder beside the first git on PATH holds a system file moving origin", async () => {
    const guard = await placeSwapped([], {
      ".git/config": ORIGIN,
      // A regular file named git, never run: only its place is read.
      "tool/bin/git": "not a program\n",
      "tool/bin/git.exe": "not a program\n",
      "tool/etc/gitconfig": '[remote "origin"]\n\tpushurl = https://github.com/other/repo.git\n',
      "bare/etc/gitconfig": '[remote "origin"]\n\tpushurl = https://github.com/other/repo.git\n',
    });
    // TEST CHANGE, justified (REQ-FLOW-134, host-free runs): the case's PATH is its one entry, not prepended to the host's,
    // so no git on the host's own PATH names a system file here; the entry read is the same.
    const path = (entry: string): Record<string, string> => ({ PATH: getRepo().path(entry, "bin") });
    expect(decide("claude", guard, "git push -u origin feat/x", path("tool"))).toMatchObject({ deny: true, ask: true, reason: expect.stringContaining("(`outside-write`)") });
    // One fact away: an entry holding no git names no system file, and the same push runs.
    expect(decide("claude", guard, "git push -u origin feat/x", path("bare"))).toEqual({ deny: false });
    await getRepo().seedFiles({ "tool/etc/gitconfig": CREDENTIAL });
    expect(decide("claude", guard, "git push -u origin feat/x", path("tool"))).toEqual({ deny: false });
  });
});
